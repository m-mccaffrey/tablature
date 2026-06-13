"""MIDI transport sync — make TabIt a live sequencer in a modern rig.

Two roles, both over a MIDI port (a virtual port by default, so a DAW can
subscribe without any hardware):

* **Send (master)** — on Play, TabIt emits MIDI Start/Continue, a Song
  Position Pointer, 24-ppqn MIDI Clock that tracks the tempo map, and the
  song's note events. Point your DAW's external-sync input at "TabIt Py"
  and it follows TabIt's transport and records the notes — program in
  TabIt, sequence the DAW.

* **Receive (slave)** — TabIt opens a MIDI input and follows incoming
  Start/Stop/Continue/Song-Position/Clock, moving the playhead in lock
  with the DAW.

Timing math: TabIt's "plain position" is in spaces, and one space is a
sixteenth note (seconds-per-space = 60/bpm/4). So:
  * 1 space  = 1 MIDI Song-Position unit (a sixteenth)
  * 1 space  = 6 MIDI Clock pulses (24 ppqn / 4)
These helpers are pure so they can be tested without any MIDI hardware.
"""

# MIDI System Real-Time / Common status bytes
CLOCK = 0xF8
START = 0xFA
CONTINUE = 0xFB
STOP = 0xFC
SPP = 0xF2

CLOCKS_PER_SPACE = 6          # 24 ppqn, 4 spaces per quarter note


def spp_bytes(space_pos):
    """Song Position Pointer message for a position given in spaces
    (sixteenths). Clamped to the 14-bit MIDI range."""
    value = max(0, min(0x3FFF, int(round(space_pos))))
    return [SPP, value & 0x7F, (value >> 7) & 0x7F]


def clock_events(perf, t_off=0.0):
    """[(sec, [CLOCK]), ...] for every clock pulse from t_off onward,
    timed through the tempo map so clocks speed up/slow down with it."""
    sec_at = perf["secAt"]
    total = perf["perfTotal"]
    out = []
    n = 0
    # number of clock steps across the whole performance
    last = int(round(total * CLOCKS_PER_SPACE))
    while n <= last:
        pp = n / CLOCKS_PER_SPACE
        sec = sec_at(pp)
        if sec >= t_off - 1e-9:
            out.append((sec - t_off, [CLOCK]))
        n += 1
    return out


def list_output_ports():
    try:
        import rtmidi
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        del out
        return ports
    except Exception:
        return None


def list_input_ports():
    try:
        import rtmidi
        mi = rtmidi.MidiIn()
        ports = mi.get_ports()
        del mi
        return ports
    except Exception:
        return None


def _open(rt_obj, port):
    """Open a named port (substring match) or a virtual 'TabIt Py' port."""
    ports = rt_obj.get_ports()
    if port:
        for i, p in enumerate(ports):
            if port.lower() in p.lower():
                rt_obj.open_port(i)
                return p
    rt_obj.open_virtual_port("TabIt Py")
    return "TabIt Py (virtual)"


class TransportSender:
    """Streams transport + clock + notes to a MIDI output (master)."""

    def __init__(self):
        self.out = None
        self._thread = None
        import threading
        self._stop = threading.Event()

    def start(self, note_events, perf, t_off, from_start, port=None,
              send_clock=True, send_notes=True):
        """note_events: [(sec, msg)] from realtime_events (absolute secs).
        from_start: send Start (reset to 0) vs Continue (+ SPP)."""
        import rtmidi
        import threading
        import time
        self.stop()
        self.out = rtmidi.MidiOut()
        opened = _open(self.out, port)
        self._stop.clear()

        # pre-roll state (program/control/bend before t_off) so sounds are set
        pre = [m for sec, m in note_events if sec < t_off - 1e-4
               and (m[0] & 0xF0) in (0xB0, 0xC0, 0xE0)]
        merged = [(sec - t_off, m) for sec, m in note_events
                  if send_notes and sec >= t_off - 1e-4]
        if send_clock:
            merged += clock_events(perf, t_off)
        merged.sort(key=lambda e: e[0])
        start_space = perf["perfTotal"] and (t_off > 0) and \
            self._space_at_sec(perf, t_off)

        def run():
            for m in pre:
                self.out.send_message(list(m))
            if send_clock:
                if from_start:
                    self.out.send_message(spp_bytes(0))
                    self.out.send_message([START])
                else:
                    self.out.send_message(spp_bytes(start_space or 0))
                    self.out.send_message([CONTINUE])
            t0 = time.monotonic()
            for sec, m in merged:
                while not self._stop.is_set():
                    dt = sec - (time.monotonic() - t0)
                    if dt <= 0:
                        break
                    time.sleep(min(dt, 0.005))
                if self._stop.is_set():
                    break
                self.out.send_message(list(m))
            if send_clock:
                try:
                    self.out.send_message([STOP])
                except Exception:
                    pass
            self._all_notes_off()

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()
        return opened

    @staticmethod
    def _space_at_sec(perf, sec):
        # invert the tempo map roughly: find pp whose secAt ~ sec
        breaks = perf["breaks"]
        for i in range(len(breaks) - 1, -1, -1):
            b = breaks[i]
            if sec >= b["sec"] - 1e-9:
                return b["pp"] + (sec - b["sec"]) / b["spd"]
        return 0

    def _all_notes_off(self):
        if not self.out:
            return
        for ch in range(16):
            try:
                self.out.send_message([0xB0 | ch, 123, 0])
            except Exception:
                pass

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=0.5)
            self._thread = None
        if self.out is not None:
            try:
                self.out.send_message([STOP])
            except Exception:
                pass
            self._all_notes_off()
            try:
                self.out.close_port()
            except Exception:
                pass
            self.out = None


class TransportReceiver:
    """Follows an external transport (slave). Calls on_position(space_pos)
    and on_state(running) as messages arrive. The message handler is pure
    enough to drive from tests without a real port."""

    def __init__(self, on_position=None, on_state=None):
        self.on_position = on_position
        self.on_state = on_state
        self.midiin = None
        self.running = False
        self.clocks = 0

    def handle(self, message):
        """message: iterable of status/data bytes (one MIDI message)."""
        status = message[0]
        if status == CLOCK:
            if self.running:
                self.clocks += 1
                self._emit_pos()
        elif status == START:
            self.clocks = 0
            self.running = True
            self._emit_state()
            self._emit_pos()
        elif status == CONTINUE:
            self.running = True
            self._emit_state()
        elif status == STOP:
            self.running = False
            self._emit_state()
        elif status == SPP and len(message) >= 3:
            value = (message[1] & 0x7F) | ((message[2] & 0x7F) << 7)
            self.clocks = value * CLOCKS_PER_SPACE
            self._emit_pos()

    def _emit_pos(self):
        if self.on_position:
            self.on_position(self.clocks / CLOCKS_PER_SPACE)

    def _emit_state(self):
        if self.on_state:
            self.on_state(self.running)

    def open(self, port=None):
        import rtmidi
        self.close()
        self.midiin = rtmidi.MidiIn()
        opened = _open(self.midiin, port)
        # we want clock + system real-time messages
        self.midiin.ignore_types(timing=False, active_sense=True, sysex=True)
        self.midiin.set_callback(lambda ev, data=None: self.handle(ev[0]))
        return opened

    def close(self):
        if self.midiin is not None:
            try:
                self.midiin.close_port()
            except Exception:
                pass
            self.midiin = None
        self.running = False
        self.clocks = 0

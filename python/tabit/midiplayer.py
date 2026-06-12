"""Real-time MIDI playback.

Backends, in order of preference:

1. ``rtmidi`` (pip install python-rtmidi) — events are scheduled live on
   a MIDI output port (the first hardware/software synth port found, or
   a virtual port). Accurate timing and instant stop.
2. Windows: the winmm/MCI MIDI player built into the OS — the same
   mechanism the original TabIt used.
3. A command-line MIDI player: timidity, fluidsynth, wildmidi, or
   aplaymidi, playing a temporary .mid file.
"""

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time


def _try_rtmidi():
    try:
        import rtmidi  # noqa: F401
    except ImportError:
        return None
    try:
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        del out
        return ("rtmidi", ports)
    except Exception:
        return None


def _soundfont():
    for pat in ("/usr/share/sounds/sf2/*.sf2", "/usr/share/soundfonts/*.sf2",
                "/usr/local/share/soundfonts/*.sf2"):
        hits = glob.glob(pat)
        if hits:
            return hits[0]
    return None


def detect_backend():
    """Return a backend name or None."""
    if _try_rtmidi():
        return "rtmidi"
    if sys.platform == "win32":
        return "mci"
    if shutil.which("timidity"):
        return "timidity"
    if shutil.which("fluidsynth") and _soundfont():
        return "fluidsynth"
    if shutil.which("wildmidi"):
        return "wildmidi"
    if shutil.which("aplaymidi"):
        return "aplaymidi"
    return None


def backend_help():
    return ("No MIDI playback backend was found.\n\n"
            "Install one of:\n"
            "  pip install python-rtmidi   (best: live MIDI output)\n"
            "  sudo apt install timidity   (or fluidsynth + a GM soundfont)\n\n"
            "Or switch Player > Playback to Synthesized (Hi-Fi), which "
            "needs no MIDI support.")


class MidiPlayer:
    def __init__(self):
        self.backend = None
        self._proc = None
        self._path = None
        self._stop_evt = threading.Event()
        self._thread = None
        self._rtout = None

    # ---- rtmidi live scheduling ----

    def play_events(self, events, t_off=0.0):
        """events: sorted (sec, msg_bytes). Plays from t_off; state
        messages before t_off are sent immediately."""
        import rtmidi
        self.stop()
        self.backend = "rtmidi"
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        if ports:
            # prefer a synth port over MIDI-through
            idx = next((i for i, p in enumerate(ports)
                        if "through" not in p.lower()), 0)
            out.open_port(idx)
        else:
            out.open_virtual_port("TabIt Py")
        self._rtout = out
        self._stop_evt.clear()

        pre = [m for sec, m in events if sec < t_off - 1e-4
               and (m[0] & 0xF0) in (0xB0, 0xC0, 0xE0)]
        live = [(sec - t_off, m) for sec, m in events if sec >= t_off - 1e-4]

        def run():
            for m in pre:
                out.send_message(list(m))
            t0 = time.monotonic()
            for sec, m in live:
                while not self._stop_evt.is_set():
                    dt = sec - (time.monotonic() - t0)
                    if dt <= 0:
                        break
                    time.sleep(min(dt, 0.02))
                if self._stop_evt.is_set():
                    break
                out.send_message(list(m))
            self._all_notes_off()

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

    def _all_notes_off(self):
        if not self._rtout:
            return
        for ch in range(16):
            try:
                self._rtout.send_message([0xB0 | ch, 123, 0])
                self._rtout.send_message([0xB0 | ch, 120, 0])
            except Exception:
                pass

    # ---- file-based backends ----

    def play_file(self, midi_bytes, backend):
        self.stop()
        self.backend = backend
        fd, self._path = tempfile.mkstemp(suffix=".mid", prefix="tabit-")
        with os.fdopen(fd, "wb") as f:
            f.write(midi_bytes)
        if backend == "mci":
            self._mci('open "%s" type sequencer alias tabitmidi' % self._path)
            self._mci("play tabitmidi")
            self._proc = "mci"
            return
        if backend == "timidity":
            args = ["timidity", "-idqq", self._path]
        elif backend == "fluidsynth":
            args = ["fluidsynth", "-i", "-q", _soundfont(), self._path]
        elif backend == "wildmidi":
            args = ["wildmidi", self._path]
        elif backend == "aplaymidi":
            port = os.environ.get("TABIT_MIDI_PORT") or self._first_alsa_port()
            args = ["aplaymidi", "-p", port or "14:0", self._path]
        else:
            raise RuntimeError("Unknown MIDI backend: %s" % backend)
        self._proc = subprocess.Popen(args, stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL)

    @staticmethod
    def _first_alsa_port():
        try:
            out = subprocess.run(["aplaymidi", "-l"], capture_output=True,
                                 text=True, timeout=5).stdout
            for line in out.splitlines()[1:]:
                parts = line.split()
                if parts and ":" in parts[0]:
                    return parts[0]
        except Exception:
            pass
        return None

    @staticmethod
    def _mci(cmd):
        import ctypes
        buf = ctypes.create_unicode_buffer(255)
        ctypes.windll.winmm.mciSendStringW(cmd, buf, 254, 0)

    def stop(self):
        self._stop_evt.set()
        if self._thread:
            self._thread.join(timeout=0.5)
            self._thread = None
        if self._rtout is not None:
            self._all_notes_off()
            try:
                self._rtout.close_port()
            except Exception:
                pass
            self._rtout = None
        if self._proc == "mci":
            try:
                self._mci("stop tabitmidi")
                self._mci("close tabitmidi")
            except Exception:
                pass
        elif self._proc is not None:
            try:
                self._proc.terminate()
            except OSError:
                pass
        self._proc = None
        if self._path:
            try:
                os.unlink(self._path)
            except OSError:
                pass
            self._path = None

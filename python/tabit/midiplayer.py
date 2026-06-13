"""MIDI playback.

The original TabIt played through the Windows General MIDI synth. We aim
for the same result on any platform, and — crucially — for playback that
is audible whenever note preview is audible.

Two families of backend:

* **render** — the .mid is rendered to PCM with a General MIDI soundfont
  (fluidsynth) and played through the same audio output the rest of the
  app uses (``audio.Player``: paplay/aplay/pw-play/ffplay/afplay/
  winsound). This is the default: if preview makes sound, so does this.
* **live** — events go straight to a real-time MIDI destination:
  ``python-rtmidi`` to a hardware/software synth port, the Windows
  winmm/MCI sequencer (what the original used), or a CLI player
  (timidity/fluidsynth/wildmidi/aplaymidi) driving its own audio.

``choose_backend`` prefers the render path because it reuses the proven
audio output; live ports are offered for users who want zero render
latency or external gear.
"""

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time


# ---- General MIDI soundfont discovery (cross platform) ----

_SF_PATTERNS = [
    "/usr/share/sounds/sf2/*.sf2",
    "/usr/share/soundfonts/*.sf2",
    "/usr/share/sounds/sf3/*.sf3",
    "/usr/local/share/soundfonts/*.sf2",
    "/opt/homebrew/share/soundfonts/*.sf2",
    "/usr/local/share/fluidsynth/*.sf2",
    # macOS
    "/Library/Audio/Sounds/Banks/*.sf2",
    os.path.expanduser("~/Library/Audio/Sounds/Banks/*.sf2"),
    # Windows common
    "C:/soundfonts/*.sf2",
]


def find_soundfont():
    env = os.environ.get("TABIT_SOUNDFONT")
    if env and os.path.exists(env):
        return env
    # prefer a "GM" / "FluidR3" font when several exist
    candidates = []
    for pat in _SF_PATTERNS:
        candidates.extend(glob.glob(pat))
    candidates = [c for c in candidates if os.path.isfile(c)]
    if not candidates:
        return None
    candidates.sort(key=lambda p: (0 if "gm" in p.lower() or "fluidr3" in p.lower()
                                   else 1, -os.path.getsize(p)))
    return candidates[0]


def have_fluidsynth():
    return shutil.which("fluidsynth") is not None and find_soundfont() is not None


def _try_rtmidi_ports():
    try:
        import rtmidi
    except ImportError:
        return None
    try:
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        del out
        return ports
    except Exception:
        return None


def choose_backend():
    """Return the preferred backend id, or None.

    Order: fluidsynth render (reliable GM through the app's audio
    output) > Windows MCI > CLI live players > rtmidi live port.
    """
    if have_fluidsynth():
        return "fluidsynth-render"
    if sys.platform == "win32":
        return "mci"
    for cmd, ok in (("timidity", True),
                    ("wildmidi", True),
                    ("aplaymidi", True)):
        if shutil.which(cmd):
            return cmd
    if _try_rtmidi_ports() is not None:
        return "rtmidi"
    return None


def available_backends():
    """All usable backends, for the Player menu (id, label)."""
    out = []
    if have_fluidsynth():
        out.append(("fluidsynth-render", "Software GM (fluidsynth)"))
    if _try_rtmidi_ports() is not None:
        out.append(("rtmidi", "Live MIDI port (rtmidi)"))
    if sys.platform == "win32":
        out.append(("mci", "Windows MIDI (MCI)"))
    for cmd in ("timidity", "wildmidi", "aplaymidi"):
        if shutil.which(cmd):
            out.append((cmd, cmd))
    return out


def backend_help():
    return ("No MIDI playback backend was found.\n\n"
            "For General MIDI sound, install a synth + soundfont:\n"
            "  Linux:  sudo apt install fluidsynth fluid-soundfont-gm\n"
            "  macOS:  brew install fluid-synth  (and a .sf2 soundfont)\n"
            "  Windows: built-in MIDI is used automatically\n\n"
            "Or install live MIDI output:  pip install python-rtmidi\n\n"
            "You can also switch Player > Playback to Synthesized "
            "(Hi-Fi), which needs no MIDI support.")


def render_midi_to_wav(midi_bytes, gain=0.6, sample_rate=44100):
    """Render a .mid (bytes) to WAV bytes with fluidsynth + a GM
    soundfont. Returns WAV bytes, or None if fluidsynth/soundfont
    are unavailable."""
    sf = find_soundfont()
    if not sf or not shutil.which("fluidsynth"):
        return None
    mid_fd, mid_path = tempfile.mkstemp(suffix=".mid", prefix="tabit-")
    wav_fd, wav_path = tempfile.mkstemp(suffix=".wav", prefix="tabit-")
    os.close(wav_fd)
    try:
        with os.fdopen(mid_fd, "wb") as f:
            f.write(midi_bytes)
        subprocess.run(
            ["fluidsynth", "-ni", "-g", "%.2f" % gain,
             "-r", str(sample_rate), "-F", wav_path, sf, mid_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        with open(wav_path, "rb") as f:
            return f.read()
    except (subprocess.SubprocessError, OSError):
        return None
    finally:
        for p in (mid_path, wav_path):
            try:
                os.unlink(p)
            except OSError:
                pass


class MidiPlayer:
    """Live MIDI backends (rtmidi / MCI / CLI players). The fluidsynth
    *render* path is handled by the GUI via render_midi_to_wav + the
    audio Player, not here."""

    def __init__(self):
        self.backend = None
        self._proc = None
        self._path = None
        self._stop_evt = threading.Event()
        self._thread = None
        self._rtout = None

    # ---- rtmidi live scheduling ----

    def play_events(self, events, t_off=0.0):
        import rtmidi
        self.stop()
        self.backend = "rtmidi"
        out = rtmidi.MidiOut()
        ports = out.get_ports()
        if ports:
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

    # ---- file-based live backends ----

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
        elif backend == "wildmidi":
            args = ["wildmidi", "-o", "/dev/null"] if False else ["wildmidi", self._path]
        elif backend == "aplaymidi":
            port = os.environ.get("TABIT_MIDI_PORT") or self._first_alsa_port()
            args = ["aplaymidi", "-p", port or "14:0", self._path]
        else:
            raise RuntimeError("Unknown MIDI backend: %s" % backend)
        self._proc = subprocess.Popen(args, stdout=subprocess.DEVNULL,
                                      stderr=subprocess.DEVNULL)
        # detect an immediate failure (missing config, dead driver)
        time.sleep(0.15)
        if self._proc.poll() is not None and self._proc.returncode != 0:
            rc = self._proc.returncode
            self._proc = None
            raise RuntimeError("%s exited immediately (code %s)" % (backend, rc))

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

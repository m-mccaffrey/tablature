"""Audio synthesis and playback.

The whole performance is rendered to a WAV (Karplus-Strong plucked
strings, synthesized drums) and played with whatever the platform
offers. numpy is used when available; without it a slower, simplified
pure-Python path is used.
"""

import math
import io
import os
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import wave

try:
    import numpy as np
except ImportError:  # pragma: no cover - exercised on minimal installs
    np = None

from .model import EPS

SEMITONE2 = 2 ** (2 / 12)


def _timbre(prog):
    if 29 <= prog <= 30:
        return 0.999, 6.0
    if 32 <= prog <= 39:
        return 0.997, 0.0
    if 40 <= prog <= 54:
        return 0.9993, 0.0
    if 88 <= prog <= 95:
        return 0.9995, 0.0
    return 0.996, 0.0


def _ks_numpy(freq, dur, damp, drive, sr):
    n = max(8, int(sr * min(dur, 4.0)))
    period = max(2, round(sr / max(20.0, freq)))
    rows = n // period + 2
    out = np.empty(rows * period, dtype=np.float32)
    cur = np.random.uniform(-1, 1, period).astype(np.float32)
    for r in range(rows):
        out[r * period:(r + 1) * period] = cur
        cur = damp * 0.5 * (cur + np.roll(cur, -1))
    out = out[:n]
    if drive:
        out = np.tanh(out * drive) / math.tanh(drive)
    fade = min(n, int(sr * 0.02))
    if fade:
        out[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return out


def _ks_pure(freq, dur, damp, drive, sr):
    n = max(8, int(sr * min(dur, 3.0)))
    period = max(2, round(sr / max(20.0, freq)))
    ring = [random.uniform(-1, 1) for _ in range(period)]
    out = [0.0] * n
    j = 0
    for i in range(n):
        cur = ring[j]
        nxt = ring[(j + 1) % period]
        out[i] = cur
        ring[j] = damp * 0.5 * (cur + nxt)
        j += 1
        if j == period:
            j = 0
    if drive:
        t = math.tanh(drive)
        out = [math.tanh(v * drive) / t for v in out]
    fade = min(n, int(sr * 0.02))
    for i in range(fade):
        out[n - 1 - i] *= i / fade
    return out


def _drum_params(note):
    if note in (35, 36):
        return 0.18, lambda t: math.sin(2 * math.pi * (50 + 90 * math.exp(-t * 30)) * t) * math.exp(-t * 16)
    if note in (38, 40):
        return 0.22, lambda t: (random.uniform(-1, 1)) * math.exp(-t * 18) * 0.8 + \
            math.sin(2 * math.pi * 190 * t) * math.exp(-t * 30) * 0.5
    if note in (42, 44):
        return 0.06, lambda t: random.uniform(-1, 1) * math.exp(-t * 60)
    if note == 46:
        return 0.35, lambda t: random.uniform(-1, 1) * math.exp(-t * 8)
    if note in (49, 57, 55, 52):
        return 1.0, lambda t: random.uniform(-1, 1) * math.exp(-t * 3)
    if note in (51, 59, 53):
        return 0.5, lambda t: random.uniform(-1, 1) * math.exp(-t * 7) * 0.6 + \
            math.sin(2 * math.pi * 820 * t) * math.exp(-t * 9) * 0.3
    if 41 <= note <= 50:
        f0 = 80 + (note - 41) * 18
        return 0.25, lambda t: math.sin(2 * math.pi * (f0 + 60 * math.exp(-t * 25)) * t) * math.exp(-t * 12)
    return 0.15, lambda t: random.uniform(-1, 1) * math.exp(-t * 25) * 0.7


def _drum(note, sr):
    dur, gen = _drum_params(note)
    n = int(sr * dur)
    if np is not None:
        return np.fromiter((gen(i / sr) for i in range(n)), dtype=np.float32, count=n)
    return [gen(i / sr) for i in range(n)]


def _rate_curve(fx, n, dur, sr):
    """Playback-rate curve for pitch effects (numpy path only)."""
    t = np.arange(n, dtype=np.float32) / sr
    one = np.ones(n, dtype=np.float32)
    if fx == "/":
        ramp = min(0.12, dur / 2 + 0.02)
        return np.where(t < ramp, (1 / SEMITONE2) + (1 - 1 / SEMITONE2) * (t / ramp), one)
    if fx == "\\":
        ramp = max(0.05, dur * 0.8)
        return np.where(t < ramp, 1 + (1 / SEMITONE2 - 1) * (t / ramp), one / SEMITONE2 * 0 + 1 / SEMITONE2)
    if fx in ("b", "^"):
        ramp = min(0.18, dur / 2 + 0.02)
        return np.where(t < ramp, 1 + (SEMITONE2 - 1) * (t / ramp), one * SEMITONE2)
    if fx == "r":
        ramp = min(0.18, dur / 2 + 0.02)
        return np.where(t < ramp, SEMITONE2 + (1 - SEMITONE2) * (t / ramp), one)
    if fx == "w":
        a = max(0.06, dur * 0.4)
        b = max(0.12, dur * 0.8)
        down = 1 + (1 / SEMITONE2 - 1) * np.clip(t / a, 0, 1)
        up = (1 / SEMITONE2) + (1 - 1 / SEMITONE2) * np.clip((t - a) / max(1e-3, b - a), 0, 1)
        return np.where(t < a, down, up)
    if fx == "~":
        return 1 + 0.035 * np.sin(2 * math.pi * 5.5 * t) * (t > 0.1)
    return None


def render_note(tr, note, dur, sr):
    """Render one note to a float array (numpy array or list)."""
    cell = note["cell"]
    vol = (note["vol"] / 127.0) * 0.8
    if cell["fx"] == "x":
        if tr["isDrum"]:
            buf = _drum(37, sr)
        else:
            freq = 440 * 2 ** ((tr["tuning"][note["s"]] + cell["f"] - 69) / 12)
            buf = (_ks_numpy if np is not None else _ks_pure)(freq, 0.09, 0.92, 0, sr)
        return _scale(buf, vol * 0.7)
    if tr["isDrum"]:
        return _scale(_drum(max(35, min(81, (tr["tuning"][note["s"]] or 0) + cell["f"])), sr), vol)

    bend_factor = 2 ** ((note["bend"] / 8192.0) * 2 / 12)
    pitch = tr["tuning"][note["s"]] + cell["f"]
    freq = 440 * 2 ** ((pitch - 69) / 12) * bend_factor
    damp, drive = _timbre(note["prog"])
    gmul = 1.0
    fx = cell["fx"]
    if fx == "<":
        freq *= 2
        damp = max(damp, 0.998)
        gmul = 0.8
    if fx == "(":
        gmul = 0.5
    if fx == "s":
        drive = max(drive, 4.0)
    if fx in ("h", "p"):
        gmul = 0.65

    length = min(dur + 0.25, 3.0)
    if np is not None:
        buf = _ks_numpy(freq, length, damp, drive, sr)
        curve = _rate_curve(fx, len(buf), dur, sr)
        if curve is not None:
            pos = np.cumsum(curve) - curve[0]
            pos = np.clip(pos, 0, len(buf) - 1)
            buf = np.interp(pos, np.arange(len(buf)), buf).astype(np.float32)
        if fx == "{":
            t = np.arange(len(buf), dtype=np.float32) / sr
            buf = buf * (0.5 + 0.5 * np.maximum(0, np.sign(np.sin(2 * math.pi * 9 * t))))
        return _scale(buf, vol * gmul)
    buf = _ks_pure(freq, length, damp, drive, sr)
    return _scale(buf, vol * gmul)


def _scale(buf, k):
    if np is not None and isinstance(buf, np.ndarray):
        return buf * k
    return [v * k for v in buf]


def render_performance(perf, song, start_sec=0.0, progress=None):
    """Render the performance to (wav_bytes, duration_seconds)."""
    sr = 44100 if np is not None else 22050
    total = max(0.5, perf["totalSec"] - start_sec + 0.6)
    n = int(sr * total)

    if np is not None:
        left = np.zeros(n + sr, dtype=np.float32)
        right = np.zeros(n + sr, dtype=np.float32)
    else:
        mono = [0.0] * (n + sr)

    sec_at = perf["secAt"]
    events = []
    for note in perf["notes"]:
        tr = song["tracks"][note["t"]]
        if not tr.get("played", True):
            continue
        for seg in perf["segs"]:
            if not (seg["p0"] - EPS <= note["plain"] < seg["p1"] - EPS):
                continue
            pp = seg["perfStart"] + (note["plain"] - seg["p0"])
            start = sec_at(pp) - start_sec
            if start < -1e-4:
                continue
            end_plain = min(note["plainEnd"], seg["p1"])
            dur = max(0.05, sec_at(pp + (end_plain - note["plain"])) - sec_at(pp))
            events.append((start + note["strokeOff"], tr, note, dur))
    events.sort(key=lambda e: e[0])

    for i, (start, tr, note, dur) in enumerate(events):
        buf = render_note(tr, note, dur, sr)
        at = int(start * sr)
        if np is not None:
            seg_len = min(len(buf), len(left) - at)
            if seg_len <= 0:
                continue
            pan = note["pan"] / 127.0
            left[at:at + seg_len] += buf[:seg_len] * (1.0 - 0.7 * pan)
            right[at:at + seg_len] += buf[:seg_len] * (0.3 + 0.7 * pan)
        else:
            for j, v in enumerate(buf):
                if at + j >= len(mono):
                    break
                mono[at + j] += v
        if progress and i % 16 == 0:
            progress(i / max(1, len(events)))

    for m in perf["metro"]:
        start = sec_at(m["pp"]) - start_sec
        if start < -1e-4:
            continue
        f = 1700 if m["accent"] else 1200
        amp = 0.12 * (1.4 if m["accent"] else 1.0)
        ticklen = int(sr * 0.04)
        at = int(start * sr)
        if np is not None:
            t = np.arange(ticklen) / sr
            tickbuf = (amp * np.sin(2 * math.pi * f * t) * np.exp(-t * 90)).astype(np.float32)
            seg_len = min(ticklen, len(left) - at)
            left[at:at + seg_len] += tickbuf[:seg_len]
            right[at:at + seg_len] += tickbuf[:seg_len]
        else:
            for j in range(min(ticklen, len(mono) - at)):
                tt = j / sr
                mono[at + j] += amp * math.sin(2 * math.pi * f * tt) * math.exp(-tt * 90)

    out = io.BytesIO()
    w = wave.open(out, "wb")
    if np is not None:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        stereo = np.empty(2 * len(left), dtype=np.float32)
        stereo[0::2] = left
        stereo[1::2] = right
        peak = float(np.max(np.abs(stereo))) or 1.0
        stereo *= min(1.0, 0.85 / peak)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())
    else:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        peak = max((abs(v) for v in mono), default=1.0) or 1.0
        k = min(1.0, 0.85 / peak) * 32767
        w.writeframes(struct.pack("<%dh" % len(mono), *(int(v * k) for v in mono)))
    w.close()
    return out.getvalue(), total


class Player:
    """Plays a WAV via the platform's audio command."""

    def __init__(self):
        self.proc = None
        self.path = None

    @staticmethod
    def backend():
        if sys.platform == "win32":
            return "winsound"
        if sys.platform == "darwin" and shutil.which("afplay"):
            return "afplay"
        for cmd in ("paplay", "aplay", "pw-play", "ffplay"):
            if shutil.which(cmd):
                return cmd
        return None

    def play(self, wav_bytes):
        self.stop()
        backend = self.backend()
        if backend is None:
            raise RuntimeError("No audio playback command found "
                               "(need paplay, aplay, pw-play, ffplay, or afplay).")
        fd, self.path = tempfile.mkstemp(suffix=".wav", prefix="tabit-")
        with os.fdopen(fd, "wb") as f:
            f.write(wav_bytes)
        if backend == "winsound":
            import winsound
            winsound.PlaySound(self.path, winsound.SND_FILENAME | winsound.SND_ASYNC)
            self.proc = "winsound"
            return
        if backend == "ffplay":
            args = ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", self.path]
        elif backend == "aplay":
            args = ["aplay", "-q", self.path]
        else:
            args = [backend, self.path]
        self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)

    def stop(self):
        if self.proc == "winsound":
            import winsound
            winsound.PlaySound(None, winsound.SND_PURGE)
        elif self.proc is not None:
            try:
                self.proc.terminate()
            except OSError:
                pass
        self.proc = None
        if self.path:
            try:
                os.unlink(self.path)
            except OSError:
                pass
            self.path = None

    def is_playing(self):
        if self.proc is None:
            return False
        if self.proc == "winsound":
            return True
        return self.proc.poll() is None

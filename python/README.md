# TabIt Py

The desktop version of the TabIt 2.03 tribute — a Python/tkinter port of
the web app, sharing the same song format and feature set.

## Running

Requires Python 3.10+ with tkinter (included with most Python installs;
on Debian/Ubuntu: `sudo apt install python3-tk`).

```
cd python
python3 -m tabit
```

Optional, recommended:

- **numpy** — much faster, higher-quality audio rendering (stereo 44.1 kHz
  with pitch effects; without it a simplified mono fallback is used)
- An audio player command for playback: `paplay`, `aplay`, `pw-play`, or
  `ffplay` on Linux (one is almost always present), `afplay` on macOS,
  built-in `winsound` on Windows

## What it does

Everything the web version does, in a native window:

- Opens original TabIt **`.tbt` files** (versions 0x6f–0x72) and the web
  version's `.tabit.json` files — the two apps share the same JSON song
  format, so files move freely between them
- Tab editing with the original's keys: digit frets, note effects
  (`h p / \ b ^ r ~ t s w ( < {`), dead/stop notes, strokes
- Variable bars, double bar lines, open/close repeats with play counts
- Track effect changes (tempo, instrument, volume, pan, chorus, reverb,
  pitch bend) with a real tempo map; repeats unrolled in playback and
  MIDI export
- Multitrack with per-track mute, tuning presets (built-in ones recovered
  from the original binary, plus user-saved), metronome, tempo tap
- Export ASCII tab text and standard MIDI
- Playback: the performance is synthesized (Karplus-Strong strings,
  generated drums) to a WAV and played; the playhead follows in the editor

Preferences (colors, font size, options, user tunings) persist in
`~/.config/tabit-py.json` — the spiritual successor to
`HKCU\Software\GTAB Software\WinTabIt`.

## Package layout

- `tabit/constants.py` — GM instruments, tunings, effect tables (recovered
  from the original binary)
- `tabit/model.py` — song model (dict-based, mirrors the JSON format)
- `tabit/tbtfile.py` — original `.tbt` binary format reader
- `tabit/performance.py` — repeat unrolling, tempo map, note events
- `tabit/exporters.py` — ASCII text and MIDI export
- `tabit/audio.py` — synthesis to WAV + cross-platform playback
- `tabit/gui.py` — the tkinter editor

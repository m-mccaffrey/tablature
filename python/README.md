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

## Playback

Like the original TabIt, playback uses **MIDI** (General MIDI
instruments) by default. The default backend renders the song to audio
with **fluidsynth** + a GM soundfont and plays it through the same audio
output the rest of the app uses — so if note preview is audible, playback
is too. Install it with:

```
sudo apt install fluidsynth fluid-soundfont-gm      # Linux
brew install fluid-synth                            # macOS (+ a .sf2)
```

`Player → MIDI Output` lets you pick a specific backend; **Automatic**
prefers fluidsynth, then falls back to:

- the Windows winmm/MCI MIDI player (built in — what the original used)
- a CLI player: `timidity`, `wildmidi`, or `aplaymidi`
- `python-rtmidi` live output to a hardware/software MIDI port
  (`pip install python-rtmidi`)

`Player → Synthesized Playback (Hi-Fi)` switches to the built-in
Karplus-Strong string synth instead of MIDI, and File → **Export Audio
(WAV/MP3)** saves that rendering to a file (MP3 needs `ffmpeg`; WAV
otherwise).

If no MIDI backend is found, the app explains exactly what to install.

## MIDI transport sync (use TabIt as a sequencer)

`Play → MIDI Sync (DAW)` turns TabIt into a clock source or follower so it
can drive — or be driven by — a DAW over MIDI (needs `python-rtmidi`):

- **Send Clock + Transport (Master)** — on Play, TabIt emits MIDI
  Start/Continue, a Song Position Pointer, and 24-ppqn MIDI Clock that
  tracks the tempo map, plus (optionally) the song's note events, out a
  port. Point your DAW's external-sync input at the **TabIt Py** port and
  it follows TabIt's tempo/transport and records the notes — program in
  TabIt, sequence the DAW.
- **Follow External Clock (Slave)** — TabIt opens a MIDI input and follows
  incoming Start/Stop/Continue/Song-Position/Clock, moving the playhead in
  lock with the DAW **and sounding the song's notes as the playhead passes
  them** (with **Sound Notes While Following**). Think of it like ADAT
  sync: TabIt is a transport peer whose clock source is internal or
  external, with its note signal routed wherever you want.

Note routing is flexible: the slave's notes go out a **Notes Output Port**
of your choice — loop the virtual **TabIt Py** port back into the DAW so
each track plays through your software instruments (on their MIDI
channels), or point it at a GM synth port to let TabIt make the sound
itself. Clock in, clock out, and notes out are chosen independently.

Either side can use a **virtual "TabIt Py" port** (no hardware needed; on
Windows use a loopback like loopMIDI, on macOS an IAC bus) or a named
hardware/software port. Timing is exact: one TabIt space is a sixteenth
note, so a space is 6 MIDI clocks / one Song-Position unit.

Optional, recommended:

- **numpy** — much faster, higher-quality synthesized rendering (stereo
  44.1 kHz with pitch effects; without it a simplified mono fallback is
  used)
- For synthesized playback, an audio player command: `paplay`, `aplay`,
  `pw-play`, or `ffplay` on Linux, `afplay` on macOS, built-in
  `winsound` on Windows

## What it does

Everything the web version does, in a native window:

- Opens original TabIt **`.tbt` files** (versions 0x6f–0x72) and the web
  version's `.tabit.json` files — the two apps share the same JSON song
  format, so files move freely between them
- Tab editing with the original's keys: digit frets, note effects
  (`h p / \ b ^ r ~ t s w ( < {`), dead/stop notes, strokes
- Variable bars, double bar lines, open/close repeats with play counts
- Alternate-time regions (triplets etc.) — create over a selection, play
  and render with the right timing
- Per-track transpose
- Track effect changes (tempo, instrument, volume, pan, chorus, reverb,
  pitch bend) with a real tempo map; repeats unrolled in playback and
  MIDI export
- Multitrack with per-track mute, tuning presets (built-in ones recovered
  from the original binary, plus user-saved), metronome, tempo tap
- Saves to the original **`.tbt`** binary format (File → Save as TabIt)
  as well as `.tabit.json`; files written here open in the original
  TabIt and round-trip through the reader
- Export ASCII tab text, standard MIDI, and rendered audio (WAV/MP3)
- MIDI playback by default (live `rtmidi` scheduling or the OS MIDI
  player), with repeats unrolled, tempo/volume/pan/instrument changes,
  per-track mute, and play-from-cursor; the playhead follows in the
  editor. A synthesized Hi-Fi mode is available as an alternative.

Preferences (colors, font size, options, user tunings) persist in
`~/.config/tabit-py.json` — the spiritual successor to
`HKCU\Software\GTAB Software\WinTabIt`.

## Package layout

- `tabit/constants.py` — GM instruments, tunings, effect tables (recovered
  from the original binary)
- `tabit/model.py` — song model (dict-based, mirrors the JSON format)
- `tabit/tbtfile.py` — original `.tbt` binary format reader
- `tabit/tbtwrite.py` — original `.tbt` binary format writer (v0x72)
- `tabit/performance.py` — repeat unrolling, tempo map, note events
- `tabit/exporters.py` — ASCII text and MIDI export + the realtime MIDI
  event stream
- `tabit/midiplayer.py` — MIDI playback backends (rtmidi / MCI / CLI players)
- `tabit/audio.py` — Hi-Fi synthesis to WAV + cross-platform playback
- `tabit/gui.py` — the tkinter editor

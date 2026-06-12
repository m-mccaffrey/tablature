# TabIt Web

An unofficial, browser-based tribute to **TabIt 2.03**, the classic Windows
guitar tablature editor by GTAB Software (long defunct). It recreates the
look and feel of the original — the Windows 9x chrome, the monospace tab
grid with a block cursor, keyboard-driven fret entry, and multitrack
playback — as a single static page that runs on GitHub Pages with no build
step and no dependencies.

The recreation was informed by a Ghidra analysis of the original
`TabIt.exe` (see `tab.html`): the General MIDI instrument names, tuning
presets ("Dropped D", "Open A", …), status-bar wording, and feature set
were recovered straight from the binary's strings.

## Running it

Open `docs/index.html` in a browser, or serve the `docs/` folder:

```
python3 -m http.server -d docs
```

### GitHub Pages

The site publishes from the `main` branch (*Deploy from a branch* in the
repository's Pages settings). Either the `/ (root)` or `/docs` folder
works — the root `index.html` redirects into `docs/`.

Alternatively, with *GitHub Actions* as the Pages source, the included
workflow (`.github/workflows/pages.yml`) can be run manually to deploy
just the `docs/` folder.

## Using the editor

A demo song loads on startup — press **F5** to hear it.

**Opens original TabIt `.tbt` files** (format versions 0x6f–0x72,
TabIt ~1.55 through 2.03) via File → Open, including bar lines and
repeats, note effects, track effect changes, alternate time regions,
tunings, and song metadata.

| Key | Action |
| --- | --- |
| Arrow keys | Move the cursor |
| `0`–`9` | Enter a fret (type two digits quickly for 10+) |
| `h` `p` `/` `\` `b` `^` `r` `~` | Hammer-on, pull-off, slides, bends, release, vibrato |
| `t` `s` `w` `(` `<` `{` | Tapping, slap, whammy, soft, harmonic, tremolo |
| `x` / `*` | Dead note / stop string |
| `u` / `d` | Stroke up / stroke down |
| `Del` / `-` | Clear note or selection |
| `Ins` / `Ctrl+Del` | Insert / delete a space |
| `Shift`+arrows, mouse drag | Select spaces |
| `Ctrl+C/X/V` | Copy / cut / paste spaces |
| `Ctrl+Up/Down` | Previous / next track |
| `F5` / `F6` / `F8` / `Space` | Play from start / play from cursor / stop |

Feature highlights, all in the menus:

- **Bars**: variable spaces per bar, double bar lines, open/close repeats
  with play counts — playback and MIDI export honor the repeats
- **Track effects** at any space: tempo, instrument, volume, pan, chorus,
  reverb, and pitch-bend changes, plus per-chord strokes; tempo changes
  drive playback timing
- **Player**: per-track mute checkboxes, loop, metronome with volume and
  accent settings, tempo tap
- **Options**: color schemes (saved in the browser), font sizes,
  cursor/playback behaviors — the web equivalent of TabIt's registry
  settings
- **Tunings**: built-in presets recovered from the original binary plus
  user-saved presets
- **File**: save as `.tabit.json`, export classic ASCII tab text, export
  standard MIDI (with repeats unrolled and effect changes included), and
  print preview

## What's here

- `docs/` — the web app (plain HTML/CSS/JS, no build step)
- `docs/tbt.js` — reader for the original binary `.tbt` file format, based
  on the public reverse-engineering documentation
  ([bostick/tabit-file-format](https://github.com/bostick/tabit-file-format))
- `tab.html` — Ghidra disassembly export of the original TabIt 2.03 executable
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## Not done yet

- Saving back to `.tbt` (songs save as JSON for now)
- Editing alternate time regions (imported ones display and play correctly)
- Editing the top/bottom text lines (imported text displays)

## Disclaimer

This project is a fan recreation of the *look and feel* of TabIt and is not
affiliated with or endorsed by GTAB Software. It contains no code or assets
from the original program.

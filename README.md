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

Two options:

1. **Deploy from a branch** — in the repository settings, under
   *Pages*, choose *Deploy from a branch*, branch `main`, folder `/docs`.
2. **GitHub Actions** — choose *GitHub Actions* as the source; the
   included workflow (`.github/workflows/pages.yml`) deploys `docs/` on
   every push to `main`.

## Using the editor

A demo song loads on startup — press **F5** to hear it.

| Key | Action |
| --- | --- |
| Arrow keys | Move the cursor |
| `0`–`9` | Enter a fret (type `1`/`2` then a digit quickly for 10–28) |
| `h` `p` `/` `\` `b` `r` `~` `t` | Hammer-on, pull-off, slides, bend, release, vibrato, tapping |
| `x` | Dead note |
| `Del` / `-` | Clear note or selection |
| `Ins` / `Ctrl+Del` | Insert / delete a space |
| `Shift`+arrows, mouse drag | Select spaces |
| `Ctrl+C/X/V` | Copy / cut / paste spaces |
| `Ctrl+Up/Down` | Previous / next track |
| `F5` / `F6` / `F8` / `Space` | Play from start / play from cursor / stop |

Tracks, bars, effects, tempo, tuning presets, and song properties are all
in the menus. Songs save as `.tabit.json` files; you can also export
classic ASCII tab text or a standard MIDI file.

## What's here

- `docs/` — the web app (plain HTML/CSS/JS, no build step)
- `tab.html` — Ghidra disassembly export of the original TabIt 2.03 executable
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## Disclaimer

This project is a fan recreation of the *look and feel* of TabIt and is not
affiliated with or endorsed by GTAB Software. It contains no code or assets
from the original program, and it does not read the original `.tbt` file
format (yet).

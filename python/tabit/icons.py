"""Toolbar icons for TabIt Py, matched to TabIt 2.03's toolbar.

Each icon is a 16x16 pixel grid expressed as 16 strings of 16 characters;
characters map to colors via ``PAL``. ``'.'`` is the toolbar face color so
icons blend into the classic gray buttons. Icons build lazily into
tkinter PhotoImages (a Tk root must exist first); ``get(name,
disabled=True)`` returns a dimmed (grayed) variant.
"""

FACE = "#c0c0c0"

PAL = {
    ".": FACE,
    "k": "#000000",   # black outline
    "w": "#ffffff",   # white / paper
    "d": "#808080",   # mid gray
    "q": "#909090",   # stop-square gray
    "o": "#e8b830",   # folder gold
    "O": "#9c7414",   # folder dark gold
    "f": "#f4e0a0",   # folder cream (front flap)
    "m": "#6e6e4a",   # floppy olive body
    "s": "#b8b89a",   # floppy shutter / light
    "b": "#2438c8",   # blue
    "B": "#0a1a86",   # dark blue
    "g": "#10a010",   # play green
    "r": "#c00000",   # cut handle red
    "c": "#1c8c1c",   # cut handle green
    "t": "#2ca8b8",   # metronome teal
    "T": "#15707e",   # metronome dark teal
}


def _blend(hex_color, frac=0.55):
    """Mix a color toward the toolbar face for a disabled/grayed look."""
    fr, fg, fb = int(FACE[1:3], 16), int(FACE[3:5], 16), int(FACE[5:7], 16)
    r = int(hex_color[1:3], 16); g = int(hex_color[3:5], 16); b = int(hex_color[5:7], 16)
    return "#%02x%02x%02x" % (round(r + (fr - r) * frac),
                              round(g + (fg - g) * frac),
                              round(b + (fb - b) * frac))


_RAW = {
    "new": [
        "................",
        "....kkkkkk......",
        "....kwwwkdk.....",
        "....kwwwkkk.....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kwwwwwwk....",
        "....kkkkkkkk....",
        "................",
        "................",
    ],
    "open": [
        "................",
        "................",
        ".......kkkk.....",
        "......k....k....",
        "..kkkkk....kk...",
        ".koooooooooook..",
        ".koooooooooOOk..",
        "kkkkkkkkkkOOk...",
        "kfffffffffOOk...",
        "kfffffffffOk....",
        ".kfffffffOOk....",
        ".kkkkkkkkkk.....",
        "................",
        "................",
        "................",
        "................",
    ],
    "save": [
        "................",
        ".kkkkkkkkkk.....",
        ".kmmsssmmmk.....",
        ".kmmsssmmmk.....",
        ".kmmsssmmmk.....",
        ".kmmmmmmmmk.....",
        ".kmmmmmmmmk.....",
        ".kwwwwwwwmk.....",
        ".kwkkkkkwmk.....",
        ".kwkkkkkwmk.....",
        ".kwwwwwwwmk.....",
        ".kmmmmmmmmk.....",
        ".kkkkkkkkkk.....",
        "................",
        "................",
        "................",
    ],
    "songprops": [
        "................",
        "...kkkkkkkk.....",
        "...kwwwwwwk.....",
        "...kbbbbbwk.....",
        "...kBBBBBwk.....",
        "...kwwwwwwk.....",
        "...kwddddwk.....",
        "...kwwwwwwk.....",
        "...kwddddwk.....",
        "...kwwwwwwk.....",
        "...kwddddwk.....",
        "...kwwwwwwk.....",
        "...kkkkkkkk.....",
        "................",
        "................",
        "................",
    ],
    "print": [
        "................",
        "....kkkkkkk.....",
        "....kwwwwwk.....",
        "....kwwwwwk.....",
        "..kkkkkkkkkkk...",
        ".kddddddddddk...",
        ".kdwwwwwwwwdk...",
        ".kddddddddgdk...",
        ".kkkkkkkkkkkk...",
        "...kwwwwwwwk....",
        "...kwwwwwwwk....",
        "...kkkkkkkkk....",
        "................",
        "................",
        "................",
        "................",
    ],
    "preview": [
        "................",
        "..kkkkkkk.......",
        "..kwwwwwk.......",
        "..kwddddk.......",
        "..kwwwwwk.......",
        "..kwddddk.......",
        "..kwwwwwk.......",
        "..kwddwkk.......",
        "..kkkkkkkk......",
        "......kkkk......",
        ".....kwwwwk.....",
        ".....kwwwwk.....",
        "......kkkkk.....",
        "........kkk.....",
        ".........kk.....",
        "................",
    ],
    "cut": [
        "................",
        "..k.......k.....",
        "..kk.....kk.....",
        "...kk...kk......",
        "....kk.kk.......",
        ".....kkk........",
        "......k.........",
        ".....kkk........",
        "....kk.kk.......",
        "...rk...gk......",
        "..rrk...gck.....",
        "..rrk...gck.....",
        "...rk...gk......",
        "....kkkkk.......",
        "................",
        "................",
    ],
    "copy": [
        "................",
        ".....kkkkkk.....",
        ".....kwwwwk.....",
        "...kkkkkwwk.....",
        "...kwwwkwwk.....",
        "...kwwwkkkk.....",
        "...kwwwwwwk.....",
        "...kwwwwwwk.....",
        "...kwwwwwwk.....",
        "...kwwwwwwk.....",
        "...kwwwwwwk.....",
        "...kwwwwwwk.....",
        "...kkkkkkkk.....",
        "................",
        "................",
        "................",
    ],
    "paste": [
        "................",
        ".....kkk........",
        "....kwwwk.......",
        "..kkkkkkkkk.....",
        "..kdddddddk.....",
        "..kdkkkkkdk.....",
        "..kdwwwwwwk.....",
        "..kdwwwwwwk.....",
        "..kdwwwwwwk.....",
        "..kdwwwwwwk.....",
        "..kdwwwwwwk.....",
        "..kdwwwwwwk.....",
        "..kddddddddk....",
        "..kkkkkkkkkk....",
        "................",
        "................",
    ],
    "undo": [
        "................",
        "................",
        "....b...........",
        "...bb...........",
        "..bbbbbb........",
        ".bbbbbbbbb......",
        "..bb...bbbbb....",
        "...b.....bbb....",
        ".........bbb....",
        "........bbb.....",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "properties": [
        "................",
        "..kkkkkkkk......",
        "..kddddddk......",
        "..kwwwwwwk......",
        "..kwkkkkwk.bb...",
        "..kwwwwwwkbBB...",
        "..kwkkkkwBBB....",
        "..kwwwwwwk......",
        "..kwkkkkwk......",
        "..kwwwwwwk......",
        "..kkkkkkkk......",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "play": [
        "................",
        "................",
        "....g...........",
        "....gg..........",
        "....ggg.........",
        "....gggg........",
        "....ggggg.......",
        "....gggggg......",
        "....ggggggg.....",
        "....gggggg......",
        "....ggggg.......",
        "....gggg........",
        "....ggg.........",
        "....gg..........",
        "....g...........",
        "................",
    ],
    "playcur": [
        "................",
        "........g.......",
        "........gg......",
        "...g....ggg.....",
        "...gg...gg......",
        "...ggg..g.......",
        "...gggg.........",
        "...ggggg........",
        "...gggggg.......",
        "...ggggggg......",
        "...gggggg.......",
        "...ggggg........",
        "...gggg.........",
        "...ggg..........",
        "...gg...........",
        "...g............",
    ],
    "stop": [
        "................",
        "................",
        "...kkkkkkkkk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kqqqqqqqk....",
        "...kkkkkkkkk....",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "rewind": [
        "................",
        "................",
        ".......k....k...",
        "......kk...kk...",
        ".....kkk..kkk...",
        "....kkkk.kkkk...",
        "...kkkkkkkkkk...",
        "..kkkkkkkkkkk...",
        "...kkkkkkkkkk...",
        "....kkkk.kkkk...",
        ".....kkk..kkk...",
        "......kk...kk...",
        ".......k....k...",
        "................",
        "................",
        "................",
    ],
    "metro": [
        "................",
        ".......t........",
        ".......tt.......",
        "......ttt.......",
        "......ttTt......",
        ".....tttTt......",
        ".....ttttTt.....",
        "....tttttTt.....",
        "....ttttttt.....",
        "...ttttttttt....",
        "...ttttttttt....",
        "...kkkkkkkkkk...",
        "................",
        "................",
        "................",
        "................",
    ],
}

_cache = {}


def get(name, disabled=False):
    """Return a cached PhotoImage for the named icon (Tk root required)."""
    key = name + ("#d" if disabled else "")
    if key not in _cache:
        import tkinter as tk
        rows = _RAW[name]
        pal = PAL if not disabled else {c: _blend(v) for c, v in PAL.items()}
        img = tk.PhotoImage(width=len(rows[0]), height=len(rows))
        for y, row in enumerate(rows):
            img.put("{" + " ".join(pal[ch] for ch in row) + "}", to=(0, y))
        _cache[key] = img
    return _cache[key]

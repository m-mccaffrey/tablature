"""Song model for TabIt Py.

Songs are plain dicts mirroring the web version's .tabit.json format
exactly, so files are interchangeable between the two:

song = {
  "title", "artist", "album", "transcribedBy", "comments": str,
  "tempo": int, "spacesPerBar": int,
  "barLines": [{"spaces", "open", "close", "double", "repeat"}],
  "tracks": [{
     "name", "instrument", "isDrum", "drumKit", "cutAnyString",
     "tuning": [midi...top string first], "volume", "pan", "reverb",
     "chorus", "modulation", "pitchBend", "played",
     "spaces": [None | [None | {"f": fret, "fx": ch}] ...],
     "fx": {"<col>": {"t": type, "v": value}},
     "topText": {"<col>": ch}, "botText": {"<col>": ch},
     "alt": None | [None | [num, den]],
  }]
}
"""

from .constants import BUILTIN_TUNINGS

EPS = 1e-6


def make_bar(spaces=16):
    return {"spaces": spaces, "open": False, "close": False, "double": False, "repeat": 0}


def make_track(name, instrument, tuning):
    return {
        "name": name, "instrument": instrument, "isDrum": False, "drumKit": 0,
        "cutAnyString": False,
        "tuning": list(tuning), "volume": 104, "pan": 64, "reverb": 0, "chorus": 0,
        "modulation": 0, "pitchBend": 0,
        "played": True,
        "spaces": [], "fx": {}, "topText": {}, "botText": {}, "alt": None,
    }


def blank_song():
    return {
        "title": "Untitled", "artist": "", "album": "", "transcribedBy": "", "comments": "",
        "tempo": 120, "spacesPerBar": 16,
        "barLines": [make_bar() for _ in range(4)],
        "tracks": [make_track("Track 1", 27, BUILTIN_TUNINGS["(Standard)"])],
    }


def demo_song():
    s = blank_song()
    s["title"] = "Demo"
    s["comments"] = "Demo song for TabIt Py."
    s["tempo"] = 100
    s["barLines"][0]["open"] = True
    s["barLines"][3]["close"] = True
    s["barLines"][3]["repeat"] = 2
    g = s["tracks"][0]
    g["name"] = "Guitar"
    g["instrument"] = 25
    b = make_track("Bass", 33, BUILTIN_TUNINGS["Bass (Standard)"])
    b["volume"] = 96
    s["tracks"].append(b)

    def put(tr, col, st, fret, fx=None):
        while len(tr["spaces"]) <= col:
            tr["spaces"].append(None)
        if not tr["spaces"][col]:
            tr["spaces"][col] = [None] * len(tr["tuning"])
        tr["spaces"][col][st] = {"f": fret, "fx": fx}

    gp = [
        (0, 5, 0), (2, 4, 2), (4, 3, 2), (6, 2, 0), (8, 1, 0), (10, 2, 0), (12, 3, 2), (14, 4, 2),
        (16, 4, 3), (18, 3, 2), (20, 2, 0), (22, 1, 1), (24, 0, 0), (26, 1, 1), (28, 2, 0), (30, 3, 2),
        (32, 5, 3), (34, 4, 2), (36, 3, 0), (38, 2, 0), (40, 1, 0), (42, 0, 3), (44, 1, 0), (46, 2, 0),
        (48, 3, 0), (50, 2, 2), (52, 1, 3), (54, 0, 2), (56, 1, 3, "~"), (58, 2, 2), (60, 1, 3), (62, 0, 2, "~"),
    ]
    for item in gp:
        put(g, *item)
    bp = [
        (0, 3, 0), (4, 3, 0), (8, 3, 0), (12, 3, 0, "/"),
        (16, 2, 3), (20, 2, 3), (24, 2, 3), (28, 2, 3),
        (32, 3, 3), (36, 3, 3), (40, 3, 3), (44, 3, 3),
        (48, 2, 5), (52, 2, 5), (56, 2, 5), (60, 2, 5, "\\"),
    ]
    for item in bp:
        put(b, *item)
    return s


def migrate(s):
    """Accept v1 and v2 web-format songs and fill defaults."""
    if not s.get("barLines"):
        spb = s.get("spacesPerBar", 16)
        cols = max([len(t["spaces"]) for t in s["tracks"]] + [spb])
        s["barLines"] = [make_bar(spb) for _ in range((cols + spb - 1) // spb)]
    s.setdefault("album", "")
    s.setdefault("transcribedBy", "")
    s.setdefault("comments", "")
    for t in s["tracks"]:
        t.setdefault("fx", {})
        t.setdefault("topText", {})
        t.setdefault("botText", {})
        t.setdefault("alt", None)
        t.setdefault("reverb", 0)
        t.setdefault("chorus", 0)
        t.setdefault("modulation", 0)
        t.setdefault("pitchBend", 0)
        t.setdefault("cutAnyString", False)
        t.setdefault("played", True)
        t.setdefault("isDrum", False)
        t.setdefault("drumKit", 0)
    return s


def plain_total(song):
    return sum(b["spaces"] for b in song["barLines"])


def get_cell(tr, col, st):
    sp = tr["spaces"][col] if col < len(tr["spaces"]) else None
    return sp[st] if sp else None


def set_cell(tr, col, st, val):
    while len(tr["spaces"]) <= col:
        tr["spaces"].append(None)
    if tr["spaces"][col] is None:
        if val is None:
            return
        tr["spaces"][col] = [None] * len(tr["tuning"])
    tr["spaces"][col][st] = val
    if val is None and all(c is None for c in tr["spaces"][col]):
        tr["spaces"][col] = None


def shift_maps(tr, at_col, delta):
    for key in ("fx", "topText", "botText"):
        src = tr.get(key) or {}
        dst = {}
        for k, v in src.items():
            c = int(k)
            if c < at_col:
                dst[str(c)] = v
            elif c + delta >= at_col:
                dst[str(c + delta)] = v
        tr[key] = dst
    if tr.get("alt"):
        if delta > 0:
            tr["alt"][at_col:at_col] = [None] * delta
        else:
            del tr["alt"][at_col:at_col - delta]


def track_insert_cols(tr, at, n):
    while len(tr["spaces"]) < at:
        tr["spaces"].append(None)
    shift_maps(tr, at, n)
    tr["spaces"][at:at] = [None] * n


def track_remove_cols(tr, at, n):
    if at < len(tr["spaces"]):
        del tr["spaces"][at:at + n]
    shift_maps(tr, at, -n)


def track_geom(song, tr):
    """Per-track geometry: bar ranges in track-space columns, honoring
    alternate time regions (a track space with region [num, den] occupies
    den/num plain spaces)."""
    pt = plain_total(song)
    alt = tr.get("alt")

    def ratio(i):
        if alt and i < len(alt) and alt[i]:
            num, den = alt[i]
            return den / num
        return 1.0

    if not alt:
        cols = pt
    else:
        cum, cols = 0.0, 0
        while cum < pt - EPS:
            cum += ratio(cols)
            cols += 1
    cols = max(cols, 1)
    plain_start = [0.0] * (cols + 1)
    for i in range(cols):
        plain_start[i + 1] = plain_start[i] + ratio(i)

    gbars = []
    p, col = 0.0, 0
    for b in song["barLines"]:
        end = p + b["spaces"]
        start = col
        while col < cols and plain_start[col] < end - EPS:
            col += 1
        gbars.append({"start": start, "cols": col - start, "plain0": p, "plain1": end})
        p = end
    return {"cols": cols, "plainStart": plain_start, "bars": gbars, "plainTotal": pt}


def bar_of_col(geom, col):
    for k in range(len(geom["bars"]) - 1, -1, -1):
        if col >= geom["bars"][k]["start"]:
            return k
    return 0


def normalize_bars(song):
    """Extend the bar grid to cover every track's content."""
    need = 0
    for tr in song["tracks"]:
        if not tr.get("alt"):
            need = max(need, len(tr["spaces"]))
        else:
            cum = 0.0
            for i in range(len(tr["spaces"])):
                a = tr["alt"][i] if i < len(tr["alt"]) else None
                cum += a[1] / a[0] if a else 1.0
            need = max(need, int(cum + 1 - EPS))
    while plain_total(song) < need:
        song["barLines"].append(make_bar(song.get("spacesPerBar", 16)))


def cell_text(cell):
    if cell["fx"] == "x":
        return "x"
    if cell["fx"] == "*":
        return "*"
    return str(cell["f"]) + (cell["fx"] or "")

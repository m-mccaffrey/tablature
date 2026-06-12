"""Performance builder: unrolls repeats into a play order, builds the
tempo map, and emits note/metronome events in "plain space" time units."""

import bisect

from .constants import (TFX_STROKE_DOWN, TFX_STROKE_UP, TFX_TEMPO,
                        TFX_VOLUME, TFX_PAN, TFX_INSTRUMENT, TFX_PITCH_BEND)
from .model import EPS, track_geom


def build_performance(song, cur_track=0, metronome=False, metro_accent=True):
    bl = song["barLines"]
    geoms = [track_geom(song, tr) for tr in song["tracks"]]

    bar_plain = []
    p = 0
    for b in bl:
        bar_plain.append((p, p + b["spaces"]))
        p += b["spaces"]

    # unroll repeats into a bar play order
    order = []
    section_start = 0
    pending = []
    for k, b in enumerate(bl):
        if b["open"]:
            section_start = k
        pending.append(k)
        if b["close"]:
            order.extend(b2 for b2 in pending if b2 < section_start)
            section = [b2 for b2 in pending if b2 >= section_start]
            passes = max(2, b["repeat"] or 0)
            for _ in range(passes):
                order.extend(section)
            pending = []
            section_start = k + 1
    order.extend(pending)

    # coalesce into plain segments with performance offsets
    segs = []
    for k in order:
        p0, p1 = bar_plain[k]
        if segs and abs(segs[-1]["p1"] - p0) < EPS:
            segs[-1]["p1"] = p1
            segs[-1]["barEnds"].append({"bar": k, "p0": p0, "p1": p1})
        else:
            segs.append({"p0": p0, "p1": p1, "perfStart": 0.0,
                         "barEnds": [{"bar": k, "p0": p0, "p1": p1}]})
    perf = 0.0
    for s in segs:
        s["perfStart"] = perf
        perf += s["p1"] - s["p0"]
    perf_total = perf

    # tempo map (tempo changes from any track apply globally)
    tempo_events = []
    for t, tr in enumerate(song["tracks"]):
        g = geoms[t]
        for k, fx in (tr.get("fx") or {}).items():
            if fx["t"] != TFX_TEMPO:
                continue
            col = min(int(k), g["cols"])
            tempo_events.append((g["plainStart"][col], max(10, min(999, fx["v"]))))
    tempo_events.sort()
    breaks = [{"pp": 0.0, "bpm": song["tempo"]}]
    for s in segs:
        for plain, bpm in tempo_events:
            if s["p0"] - EPS <= plain < s["p1"] - EPS:
                breaks.append({"pp": s["perfStart"] + (plain - s["p0"]), "bpm": bpm})
    breaks.sort(key=lambda b: b["pp"])
    sec = 0.0
    for i, b in enumerate(breaks):
        b["sec"] = sec
        b["spd"] = 60.0 / b["bpm"] / 4.0  # seconds per plain unit
        nxt = breaks[i + 1]["pp"] if i + 1 < len(breaks) else perf_total
        sec += (nxt - b["pp"]) * b["spd"]
    total_sec = sec
    break_pps = [b["pp"] for b in breaks]

    def sec_at(pp):
        i = bisect.bisect_right(break_pps, pp + EPS) - 1
        i = max(0, i)
        b = breaks[i]
        return b["sec"] + (pp - b["pp"]) * b["spd"]

    # note records with effective per-column state
    notes = []
    for t, tr in enumerate(song["tracks"]):
        g = geoms[t]
        fx_list = sorted(((int(k), v) for k, v in (tr.get("fx") or {}).items()),
                         key=lambda kv: kv[0])
        fi = 0
        vol, pan = tr["volume"], tr["pan"]
        prog, bend = tr["instrument"], tr.get("pitchBend", 0)
        ns = len(tr["tuning"])
        spaces = tr["spaces"]
        for c in range(g["cols"]):
            stroke = 0
            while fi < len(fx_list) and fx_list[fi][0] <= c:
                col_fx, fx = fx_list[fi]
                if col_fx == c and fx["t"] in (TFX_STROKE_DOWN, TFX_STROKE_UP):
                    stroke = fx["t"]
                if fx["t"] == TFX_VOLUME:
                    vol = fx["v"]
                elif fx["t"] == TFX_PAN:
                    pan = fx["v"]
                elif fx["t"] == TFX_INSTRUMENT:
                    prog = fx["v"] & 0x7F
                elif fx["t"] == TFX_PITCH_BEND:
                    bend = fx["v"]
                fi += 1
            sp = spaces[c] if c < len(spaces) else None
            if not sp:
                continue
            sounding = [s for s in range(ns) if sp[s] and sp[s]["fx"] != "*"]
            for s in sounding:
                cell = sp[s]
                cut = min(c + 64, g["cols"])
                for c2 in range(c + 1, cut):
                    sp2 = spaces[c2] if c2 < len(spaces) else None
                    if not sp2:
                        continue
                    if (any(sp2) if tr.get("cutAnyString") else sp2[s]):
                        cut = c2
                        break
                if stroke == TFX_STROKE_DOWN:
                    stroke_idx = len(sounding) - 1 - sounding.index(s)
                elif stroke == TFX_STROKE_UP:
                    stroke_idx = sounding.index(s)
                else:
                    stroke_idx = 0
                notes.append({
                    "t": t, "s": s, "cell": cell,
                    "plain": g["plainStart"][c],
                    "plainEnd": g["plainStart"][min(cut, g["cols"])],
                    "vol": vol, "pan": pan, "prog": prog, "bend": bend,
                    "strokeOff": stroke_idx * 0.018 if stroke else 0.0,
                })

    # playhead steps for the chosen track
    g = geoms[cur_track]
    steps = []
    for s in segs:
        for c in range(g["cols"]):
            ps = g["plainStart"][c]
            if s["p0"] - EPS <= ps < s["p1"] - EPS:
                steps.append({"pp": s["perfStart"] + (ps - s["p0"]), "col": c})
    steps.sort(key=lambda st: st["pp"])

    metro = []
    if metronome:
        for s in segs:
            for be in s["barEnds"]:
                q = be["p0"]
                while q < be["p1"] - EPS:
                    metro.append({"pp": s["perfStart"] + (q - s["p0"]),
                                  "accent": metro_accent and abs(q - be["p0"]) < EPS})
                    q += 4

    return {
        "segs": segs, "breaks": breaks, "secAt": sec_at, "totalSec": total_sec,
        "perfTotal": perf_total, "notes": notes, "steps": steps, "metro": metro,
        "geoms": geoms,
    }

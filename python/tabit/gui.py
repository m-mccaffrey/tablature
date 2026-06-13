"""TabIt Py — tkinter GUI.

A desktop recreation of the TabIt 2.03 editor: menu-driven, monospace
tab grid on a canvas, block cursor, keyboard fret entry, and rendered
audio playback.
"""


import json
import os
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser, simpledialog

from .constants import (GM_INSTRUMENTS, DRUM_KITS, BUILTIN_TUNINGS, NOTE_NAMES,
                        note_name, EFFECTS, TFX_NAMES,
                        TFX_STROKE_DOWN, TFX_STROKE_UP, TFX_TEMPO, TFX_INSTRUMENT,
                        TFX_VOLUME, TFX_PAN, TFX_CHORUS, TFX_REVERB, TFX_PITCH_BEND)

from .model import (blank_song, demo_song, make_bar, make_track, migrate,
                    get_cell, set_cell, track_geom, bar_of_col, normalize_bars,
                    track_insert_cols, track_remove_cols)
from . import tbtfile
from .exporters import build_text, build_midi, realtime_events
from .performance import build_performance
from . import audio
from . import midiplayer
from . import icons

PREFS_PATH = os.path.expanduser("~/.config/tabit-py.json")

FONT_SIZES = {"Small": (11, 14, 9), "Medium": (13, 17, 11), "Large": (16, 21, 13)}

DEFAULT_COLORS = {
    "bg": "#ffffff", "text": "#000000", "line": "#000000", "barnum": "#808080",
    "cursor": "#000080", "cursorText": "#ffffff", "sel": "#b0c4ff",
    "play": "#9090d0", "fxMark": "#800000",
}

LEFT_PAD = 40
TOP_PAD = 10
RULER_H = 16


def fx_label(fx):
    t, v = fx["t"], fx["v"]
    return {1: "↓", 2: "↑", 3: "T%d" % v, 4: "I%d" % ((v & 0x7F) + 1),
            5: "V%d" % v, 6: "P%d" % v, 7: "C%d" % v, 8: "R%d" % v,
            9: "M%d" % v, 10: "B%d" % v}.get(t, "?")


class App:
    def __init__(self, root):
        self.root = root
        self.song = demo_song()
        self.file_name = None
        self.cur_track = 0
        self.col = 0
        self.str_ = 0
        self.sel_anchor = None
        self.clipboard = None
        self.undo_stack = []
        self.redo_stack = []
        self.pending_digit = None
        self.pending_after = None
        self.caret_on = True
        self.playing = False
        self.play_steps = []
        self.play_idx = 0
        self.play_start_col = 0
        self.player = audio.Player()
        self.midi_player = midiplayer.MidiPlayer()
        self.opts = {
            "barNumbers": False, "caretBlink": True, "followPlayback": True,
            "rewindAfterStop": True, "metronome": False, "metroVolume": 80,
            "metroAccent": True, "loop": False, "fontSize": "Medium",
            "previewNotes": False, "playbackMode": "midi", "midiBackend": "auto",
        }
        self.colors = dict(DEFAULT_COLORS)
        self.user_tunings = {}
        self.load_prefs()

        root.configure(bg="#c0c0c0")
        self.build_menus()
        self.build_toolbar()

        frame = tk.Frame(root, bd=2, relief=tk.SUNKEN, bg="#c0c0c0")
        frame.pack(fill=tk.BOTH, expand=True, padx=2, pady=2)
        left = tk.Frame(frame, bg=self.colors["bg"])
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.ruler = tk.Canvas(left, height=RULER_H, bg="#c0c0c0", highlightthickness=0)
        self.ruler.pack(side=tk.TOP, fill=tk.X)
        self.canvas = tk.Canvas(left, bg=self.colors["bg"], highlightthickness=0)
        self.canvas.pack(side=tk.TOP, fill=tk.BOTH, expand=True)
        vbar = tk.Scrollbar(frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=vbar.set)
        vbar.pack(side=tk.RIGHT, fill=tk.Y)

        status = tk.Frame(root, bg="#c0c0c0")
        status.pack(fill=tk.X)
        self.st_track = self._panel(status, 12)
        self.st_bar = self._panel(status, 9)
        self.st_main = self._panel(status, 0, expand=True)

        root.bind("<Key>", self.on_key)
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Double-Button-1>", self.on_dblclick)
        self.canvas.bind("<Configure>", lambda e: self.redraw())
        root.protocol("WM_DELETE_WINDOW", self.on_quit)
        root.after(530, self.blink)
        self.update_title()
        self.redraw()

    # ---------- small helpers ----------

    def _panel(self, parent, width, expand=False):
        lbl = tk.Label(parent, bd=1, relief=tk.SUNKEN, anchor=tk.W,
                       bg="#c0c0c0", width=width, font=("TkDefaultFont", 9))
        lbl.pack(side=tk.LEFT, fill=tk.X, expand=expand, padx=1, pady=1)
        return lbl

    def track(self):
        return self.song["tracks"][self.cur_track]

    def geom(self, tr=None):
        return track_geom(self.song, tr or self.track())

    def n_strings(self):
        return len(self.track()["tuning"])

    def metrics(self):
        cw, ch, fs = FONT_SIZES.get(self.opts["fontSize"], FONT_SIZES["Medium"])
        return cw, ch, ("Courier", fs), ("Courier", max(7, fs - 3))

    def push_undo(self):
        self.undo_stack.append(json.dumps({"song": self.song, "track": self.cur_track}))
        if len(self.undo_stack) > 64:
            self.undo_stack.pop(0)
        self.redo_stack.clear()

    def undo(self):
        if not self.undo_stack:
            return
        self.redo_stack.append(json.dumps({"song": self.song, "track": self.cur_track}))
        self._restore(self.undo_stack.pop())

    def redo(self):
        if not self.redo_stack:
            return
        self.undo_stack.append(json.dumps({"song": self.song, "track": self.cur_track}))
        self._restore(self.redo_stack.pop())

    def _restore(self, state):
        st = json.loads(state)
        self.song = st["song"]
        self.cur_track = min(st["track"], len(self.song["tracks"]) - 1)
        self.clamp_cursor()
        self.redraw()

    def clamp_cursor(self):
        g = self.geom()
        self.str_ = max(0, min(self.n_strings() - 1, self.str_))
        self.col = max(0, min(g["cols"] - 1, self.col))

    def selection(self):
        if self.sel_anchor is None or self.sel_anchor == self.col:
            return None
        return (min(self.sel_anchor, self.col), max(self.sel_anchor, self.col))

    def load_prefs(self):
        try:
            with open(PREFS_PATH) as f:
                p = json.load(f)
            self.opts.update(p.get("opts", {}))
            self.colors.update(p.get("colors", {}))
            self.user_tunings = p.get("userTunings", {})
        except (OSError, ValueError):
            pass

    def save_prefs(self):
        try:
            os.makedirs(os.path.dirname(PREFS_PATH), exist_ok=True)
            with open(PREFS_PATH, "w") as f:
                json.dump({"opts": self.opts, "colors": self.colors,
                           "userTunings": self.user_tunings}, f, indent=1)
        except OSError:
            pass

    def all_tunings(self):
        d = dict(BUILTIN_TUNINGS)
        d.update(self.user_tunings)
        return d

    # ---------- layout / drawing ----------

    def layout(self):
        cw, ch, _, _ = self.metrics()
        g = self.geom()
        limit = max(300, self.canvas.winfo_width() - 24)
        row_h = (self.n_strings() + 3) * ch  # marker row + staff + bottom padding
        bar_pos = []
        x, row = LEFT_PAD, 0
        for b in g["bars"]:
            w = (b["cols"] + 1) * cw
            if x > LEFT_PAD and x + w + cw > limit:
                row += 1
                x = LEFT_PAD
            bar_pos.append((row, x))
            x += w
        return g, bar_pos, row_h, row + 1

    def col_to_xy(self, col, st, lay=None):
        cw, ch, _, _ = self.metrics()
        g, bar_pos, row_h, _ = lay or self.layout()
        k = bar_of_col(g, min(col, g["cols"] - 1))
        row, bx = bar_pos[k]
        x = bx + cw + (col - g["bars"][k]["start"]) * cw
        y = TOP_PAD + row * row_h + ch + st * ch
        return x, y, k

    def xy_to_col(self, px, py):
        cw, ch, _, _ = self.metrics()
        g, bar_pos, row_h, rows = self.layout()
        row = max(0, min(rows - 1, int((py - TOP_PAD) / row_h)))
        st = int((py - TOP_PAD - row * row_h - ch) / ch)
        st = max(0, min(self.n_strings() - 1, st))
        best = None
        for k, (r, bx) in enumerate(bar_pos):
            if r != row:
                continue
            if best is None or px >= bx:
                best = k
        if best is None:
            return 0, st
        b = g["bars"][best]
        in_bar = max(0, min(b["cols"] - 1, int((px - bar_pos[best][1]) / cw) - 1))
        return min(b["start"] + in_bar, g["cols"] - 1), st

    def redraw(self):
        normalize_bars(self.song)
        self.clamp_cursor()
        c = self.canvas
        c.delete("all")
        cw, ch, font, font_s = self.metrics()
        tr = self.track()
        ns = self.n_strings()
        bl = self.song["barLines"]
        lay = self.layout()
        g, bar_pos, row_h, rows = lay
        C = self.colors
        c.configure(bg=C["bg"])

        sel = self.selection()
        if sel:
            for cc in range(sel[0], min(sel[1] + 1, g["cols"])):
                x, y, _ = self.col_to_xy(cc, 0, lay)
                c.create_rectangle(x, y, x + cw, y + ns * ch, fill=C["sel"], width=0)
        if self.playing and 0 <= self.play_col() < g["cols"]:
            x, y, _ = self.col_to_xy(self.play_col(), 0, lay)
            c.create_rectangle(x, y, x + cw, y + ns * ch, fill=C["play"], width=0)

        for k, b in enumerate(g["bars"]):
            row, bx = bar_pos[k]
            y_top = TOP_PAD + row * row_h + ch
            line_top = y_top + ch // 2
            line_bot = y_top + (ns - 1) * ch + ch // 2
            wpx = (b["cols"] + 1) * cw

            if self.opts["barNumbers"]:
                c.create_text(bx + cw, y_top - ch // 2, text=str(k + 1),
                              fill=C["barnum"], font=font, anchor=tk.W)
            for s in range(ns):
                y = y_top + s * ch + ch // 2
                c.create_line(bx, y, bx + wpx, y, fill=C["line"])

            self.draw_barline(c, bx, line_top, line_bot,
                              k > 0 and bl[k - 1]["close"],
                              bl[k - 1]["repeat"] if k > 0 else 0,
                              bl[k]["open"], bl[k]["double"])
            row_end = k == len(g["bars"]) - 1 or bar_pos[k + 1][0] != row
            if row_end:
                self.draw_barline(c, bx + wpx, line_top, line_bot,
                                  bl[k]["close"], bl[k]["repeat"], False, False)

            if k == 0 or bar_pos[k - 1][0] != row:
                for s in range(ns):
                    label = "D" if tr["isDrum"] else NOTE_NAMES[tr["tuning"][s] % 12]
                    c.create_text(bx - 4, y_top + s * ch + ch // 2, text=label,
                                  fill=C["text"], font=font, anchor=tk.E)

            for cc in range(b["start"], b["start"] + b["cols"]):
                x = bx + cw + (cc - b["start"]) * cw
                key = str(cc)
                fx = tr["fx"].get(key)
                alt = tr.get("alt")
                if fx:
                    c.create_text(x + cw // 2, y_top - ch // 2 + 3, text=fx_label(fx),
                                  fill=C["fxMark"], font=font_s)
                elif alt and cc < len(alt) and alt[cc] and \
                        (cc == 0 or cc - 1 >= len(alt) or alt[cc - 1] != alt[cc]):
                    c.create_text(x + cw // 2, y_top - ch // 2 + 3,
                                  text="%d:%d" % tuple(alt[cc]),
                                  fill="#006000", font=font_s)
                elif tr["topText"].get(key):
                    c.create_text(x + cw // 2, y_top - ch // 2 + 3,
                                  text=tr["topText"][key], fill=C["text"], font=font_s)
                if tr["botText"].get(key):
                    c.create_text(x + cw // 2, y_top + ns * ch + 4,
                                  text=tr["botText"][key], fill=C["text"], font=font_s)
                sp = tr["spaces"][cc] if cc < len(tr["spaces"]) else None
                if not sp:
                    continue
                in_sel = sel and sel[0] <= cc <= sel[1]
                on_play = self.playing and cc == self.play_col()
                for s in range(ns):
                    cell = sp[s]
                    if not cell:
                        continue
                    y = y_top + s * ch
                    if not on_play:
                        c.create_rectangle(x, y + 1, x + cw, y + ch - 1,
                                           fill=C["sel"] if in_sel else C["bg"], width=0)
                    self.draw_cell(c, cell, x, y, C["text"])

        if not self.playing and (self.caret_on or not self.opts["caretBlink"]):
            x, y, _ = self.col_to_xy(self.col, self.str_, lay)
            c.create_rectangle(x, y + 1, x + cw, y + ch - 1, fill=C["cursor"], width=0)
            cell = get_cell(tr, self.col, self.str_)
            if cell:
                self.draw_cell(c, cell, x, y, C["cursorText"])
            else:
                c.create_text(x + cw // 2, y + ch // 2, text="-",
                              fill=C["cursorText"], font=font)

        height = TOP_PAD * 2 + rows * row_h
        c.configure(scrollregion=(0, 0, self.canvas.winfo_width(), height))
        self.draw_ruler(lay)
        self.update_status()

    def draw_ruler(self, lay=None):
        """Fixed horizontal ruler above the staff: minor ticks per space,
        taller ticks at bar lines, and a cursor-position marker."""
        r = getattr(self, "ruler", None)
        if r is None:
            return
        r.delete("all")
        cw, _, _, _ = self.metrics()
        g, bar_pos, _, _ = lay or self.layout()
        w = max(r.winfo_width(), self.canvas.winfo_width())
        H = RULER_H
        r.create_line(0, H - 1, w, H - 1, fill="#ffffff")
        r.create_line(0, 0, w, 0, fill="#808080")
        x = LEFT_PAD + cw
        while x < w:
            r.create_line(x, H - 2, x, H - 6, fill="#707070")
            x += cw
        for k, (row, bx) in enumerate(bar_pos):
            if row == 0:
                r.create_line(bx + cw, H - 2, bx + cw, H - 11, fill="#303030")
        cx, _, _ = self.col_to_xy(self.col, 0, lay)
        r.create_polygon(cx - 3, 1, cx + 4, 1, cx, 7, fill="#000000")

    def draw_cell(self, c, cell, x, y, fg):
        cw, ch, font, font_s = self.metrics()
        txt = "x" if cell["fx"] == "x" else "*" if cell["fx"] == "*" else str(cell["f"])
        c.create_text(x + cw // 2, y + ch // 2, text=txt, fill=fg,
                      font=font_s if len(txt) > 1 else font)
        if cell["fx"] and cell["fx"] not in ("x", "*"):
            c.create_text(x + cw - 2, y + 2, text=cell["fx"], fill=fg, font=font_s)

    def draw_barline(self, c, bx, top, bot, prev_close, prev_repeat, cur_open, cur_double):
        cw, _, font_s, _ = self.metrics()
        x = bx + cw // 2
        col = self.colors["line"]
        if prev_close or cur_open:
            c.create_line(x, top, x, bot, fill=col, width=3)
            dy = (bot - top) / 3
            if prev_close:
                c.create_line(x - 4, top, x - 4, bot, fill=col)
                c.create_rectangle(x - 8, top + dy - 2, x - 5, top + dy + 1, fill=col, width=0)
                c.create_rectangle(x - 8, top + 2 * dy - 2, x - 5, top + 2 * dy + 1, fill=col, width=0)
                if prev_repeat > 2:
                    c.create_text(x - 2, top - 8, text="%dx" % prev_repeat,
                                  fill=col, font=("Courier", 8), anchor=tk.E)
            if cur_open:
                c.create_line(x + 4, top, x + 4, bot, fill=col)
                c.create_rectangle(x + 5, top + dy - 2, x + 8, top + dy + 1, fill=col, width=0)
                c.create_rectangle(x + 5, top + 2 * dy - 2, x + 8, top + 2 * dy + 1, fill=col, width=0)
        elif cur_double:
            c.create_line(x - 2, top, x - 2, bot, fill=col)
            c.create_line(x + 2, top, x + 2, bot, fill=col)
        else:
            c.create_line(x, top, x, bot, fill=col)

    def blink(self):
        if self.opts["caretBlink"] and not self.playing:
            self.caret_on = not self.caret_on
            self.redraw()
        self.root.after(530, self.blink)

    def update_status(self):
        tr = self.track()
        g = self.geom()
        self.st_track.config(text=" Track: %d" % (self.cur_track + 1))
        self.st_bar.config(text=" Bar: %d" % (bar_of_col(g, self.col) + 1))
        sel = self.selection()
        if self.playing:
            main = "Playing..."
        elif sel:
            n = sel[1] - sel[0] + 1
            main = "1 space is selected." if n == 1 else "%d spaces are selected." % n
        else:
            title = (self.song.get("title") or "Untitled").strip()
            artist = (self.song.get("artist") or "").strip()
            main = "%s / %s" % (title, artist) if artist else title
        self.st_main.config(text=" " + main)
        self._sync_toolbar()

    def update_title(self):
        self.root.title((self.file_name or self.song["title"] or "Untitled") + " - TabIt")

    def ensure_visible(self):
        x, y, _ = self.col_to_xy(self.col, self.str_)
        _, ch, _, _ = self.metrics()
        c = self.canvas
        region = c.cget("scrollregion").split()
        total = float(region[3]) if len(region) == 4 else 1
        top = c.canvasy(0)
        h = c.winfo_height()
        if y - ch * 2 < top:
            c.yview_moveto(max(0, (y - ch * 2)) / total)
        elif y + ch * 3 > top + h:
            c.yview_moveto(max(0, (y + ch * 3 - h)) / total)

    # ---------- editing ----------

    def flush_pending(self):
        self.pending_digit = None
        if self.pending_after:
            self.root.after_cancel(self.pending_after)
            self.pending_after = None

    def move_cursor(self, dc, ds, extend=False):
        if extend:
            if self.sel_anchor is None:
                self.sel_anchor = self.col
        else:
            self.sel_anchor = None
        g = self.geom()
        if dc > 0 and self.col + dc > g["cols"] - 1:
            self.push_undo()
            self.song["barLines"].append(make_bar(self.song.get("spacesPerBar", 16)))
        self.col += dc
        self.str_ += ds
        self.clamp_cursor()
        self.flush_pending()
        self.redraw()
        self.ensure_visible()

    def type_digit(self, d):
        tr = self.track()
        if self.pending_digit is not None:
            v = self.pending_digit * 10 + d
            self.flush_pending()
            if v <= (99 if tr["isDrum"] else 28):
                cell = get_cell(tr, self.col, self.str_)
                set_cell(tr, self.col, self.str_, {"f": v, "fx": cell["fx"] if cell else None})
                if tr["isDrum"] and v <= 9:
                    self._arm_pending(v)
                self.redraw()
                self.preview()
                return
        self.push_undo()
        cell = get_cell(tr, self.col, self.str_)
        old_fx = cell["fx"] if cell and cell["fx"] not in ("x", "*") else None
        set_cell(tr, self.col, self.str_, {"f": d, "fx": old_fx})
        if d >= 1 and (d <= 2 or tr["isDrum"]):
            self._arm_pending(d)
        self.redraw()
        self.preview()

    def _arm_pending(self, v):
        self.pending_digit = v
        self.pending_after = self.root.after(700, self.flush_pending)

    def type_effect(self, ch):
        tr = self.track()
        if ch in ("x", "*"):
            self.push_undo()
            cell = get_cell(tr, self.col, self.str_)
            if cell and cell["fx"] == ch:
                set_cell(tr, self.col, self.str_, None)
            else:
                set_cell(tr, self.col, self.str_, {"f": 0, "fx": ch})
            self.redraw()
            return
        cell = get_cell(tr, self.col, self.str_)
        if not cell or cell["fx"] in ("x", "*"):
            return
        self.push_undo()
        cell["fx"] = None if cell["fx"] == ch else ch
        self.redraw()

    def set_track_fx(self, t, v):
        self.push_undo()
        tr = self.track()
        key = str(self.col)
        cur = tr["fx"].get(key)
        if cur and cur["t"] == t and t in (TFX_STROKE_DOWN, TFX_STROKE_UP):
            del tr["fx"][key]
        else:
            tr["fx"][key] = {"t": t, "v": int(v)}
        self.redraw()

    def remove_track_fx(self):
        tr = self.track()
        if str(self.col) in tr["fx"]:
            self.push_undo()
            del tr["fx"][str(self.col)]
            self.redraw()

    def repeat_prev_track_fx(self):
        tr = self.track()
        best = -1
        for k in tr["fx"]:
            c = int(k)
            if best < c < self.col:
                best = c
        if best < 0:
            return
        self.push_undo()
        tr["fx"][str(self.col)] = dict(tr["fx"][str(best)])
        self.redraw()

    def clear_track_fx(self):
        self.push_undo()
        self.track()["fx"] = {}
        self.redraw()

    def clear_cell(self):
        self.push_undo()
        tr = self.track()
        sel = self.selection()
        if sel:
            for c in range(sel[0], min(sel[1] + 1, len(tr["spaces"]))):
                tr["spaces"][c] = None
            self.sel_anchor = None
        else:
            set_cell(tr, self.col, self.str_, None)
        self.flush_pending()
        self.redraw()

    def copy_sel(self, cut=False):
        sel = self.selection() or (self.col, self.col)
        tr = self.track()
        cols = []
        for c in range(sel[0], sel[1] + 1):
            sp = tr["spaces"][c] if c < len(tr["spaces"]) else None
            cols.append([dict(cell) if cell else None for cell in sp] if sp else None)
        self.clipboard = cols
        if cut:
            self.push_undo()
            for c in range(sel[0], min(sel[1] + 1, len(tr["spaces"]))):
                tr["spaces"][c] = None
            self.sel_anchor = None
            self.redraw()

    def paste(self):
        if not self.clipboard:
            return
        self.push_undo()
        tr = self.track()
        while len(tr["spaces"]) < self.col + len(self.clipboard):
            tr["spaces"].append(None)
        ns = len(tr["tuning"])
        for i, src in enumerate(self.clipboard):
            if not src:
                tr["spaces"][self.col + i] = None
                continue
            dst = [None] * ns
            for s in range(min(len(src), ns)):
                dst[s] = dict(src[s]) if src[s] else None
            tr["spaces"][self.col + i] = dst if any(dst) else None
        self.redraw()

    def switch_track(self, d):
        self.cur_track = (self.cur_track + d) % len(self.song["tracks"])
        self.sel_anchor = None
        self.clamp_cursor()
        self.redraw()

    # ---------- input ----------

    def on_key(self, e):
        if isinstance(self.root.focus_get(), (tk.Entry, ttk.Combobox, tk.Text)):
            return
        sym = e.keysym
        ctrl = bool(e.state & 0x4)
        shift = bool(e.state & 0x1)
        if sym == "F5":
            return self.play_from(0)
        if sym == "F6":
            return self.play_from(self.col)
        if sym == "F8":
            return self.stop()
        if sym == "space":
            return self.stop() if self.playing else self.play_from(self.col)
        if self.playing:
            return
        if ctrl:
            m = {"z": self.undo, "y": self.redo,
                 "c": lambda: self.copy_sel(False), "x": lambda: self.copy_sel(True),
                 "v": self.paste, "a": self.select_all, "s": self.save_song,
                 "o": self.open_song, "n": self.new_song}
            low = sym.lower()
            if low in m:
                return m[low]()
            if sym == "Up":
                return self.switch_track(-1)
            if sym == "Down":
                return self.switch_track(1)
            if sym == "Home":
                self.col = 0
                self.sel_anchor = None
                self.redraw()
                return self.ensure_visible()
            if sym == "End":
                self.col = self.geom()["cols"] - 1
                self.sel_anchor = None
                self.redraw()
                return self.ensure_visible()
            if sym == "Delete":
                return self.delete_space()
            return
        g = self.geom()
        k = bar_of_col(g, self.col)
        if sym == "Left":
            return self.move_cursor(-1, 0, shift)
        if sym == "Right":
            return self.move_cursor(1, 0, shift)
        if sym == "Up":
            return self.move_cursor(0, -1, shift)
        if sym == "Down":
            return self.move_cursor(0, 1, shift)
        if sym == "Prior":
            return self.move_cursor(g["bars"][max(0, k - 1)]["start"] - self.col, 0, shift)
        if sym == "Next":
            nxt = g["bars"][k + 1]["start"] if k + 1 < len(g["bars"]) else g["cols"] - 1
            return self.move_cursor(nxt - self.col, 0, shift)
        if sym == "Home":
            self.col = g["bars"][k]["start"]
            if not shift:
                self.sel_anchor = None
            return self.redraw()
        if sym == "End":
            self.col = g["bars"][k]["start"] + g["bars"][k]["cols"] - 1
            self.clamp_cursor()
            if not shift:
                self.sel_anchor = None
            return self.redraw()
        if sym in ("Delete",):
            return self.clear_cell()
        if sym == "BackSpace":
            self.clear_cell()
            return self.move_cursor(-1, 0)
        if sym == "Insert":
            return self.insert_space()
        ch = e.char
        if ch.isdigit():
            return self.type_digit(int(ch))
        if ch == "-":
            return self.clear_cell()
        if ch == "u":
            return self.set_track_fx(TFX_STROKE_UP, 0)
        if ch == "d":
            return self.set_track_fx(TFX_STROKE_DOWN, 0)
        if ch in ("x", "*") or ch in EFFECTS:
            return self.type_effect(ch)

    def on_click(self, e):
        if self.playing:
            return
        self.col, self.str_ = self.xy_to_col(e.x, self.canvas.canvasy(e.y))
        self.sel_anchor = self.col
        self._dragging = True
        self.flush_pending()
        self.redraw()

    def on_drag(self, e):
        if not getattr(self, "_dragging", False):
            return
        self.col, self.str_ = self.xy_to_col(e.x, self.canvas.canvasy(e.y))
        self.redraw()

    def on_release(self, _e):
        if getattr(self, "_dragging", False) and self.sel_anchor == self.col:
            self.sel_anchor = None
        self._dragging = False
        self.redraw()

    def on_dblclick(self, e):
        col, _ = self.xy_to_col(e.x, self.canvas.canvasy(e.y))
        g = self.geom()
        k = bar_of_col(g, col)
        self.sel_anchor = g["bars"][k]["start"]
        self.col = min(g["bars"][k]["start"] + g["bars"][k]["cols"] - 1, g["cols"] - 1)
        self.redraw()

    def select_all(self):
        self.sel_anchor = 0
        self.col = self.geom()["cols"] - 1
        self.redraw()

    def insert_space(self):
        self.push_undo()
        track_insert_cols(self.track(), self.col, 1)
        self.redraw()

    def delete_space(self):
        self.push_undo()
        track_remove_cols(self.track(), self.col, 1)
        self.clamp_cursor()
        self.redraw()

    # ---------- playback ----------

    def play_col(self):
        if self.play_idx < len(self.play_steps):
            return self.play_steps[max(0, self.play_idx - 1)]["col"]
        return -1

    def preview(self):
        if not self.opts.get("previewNotes") or self.playing:
            return
        tr = self.track()
        cell = get_cell(tr, self.col, self.str_)
        if not cell or cell["fx"] == "*":
            return
        note = {"cell": cell, "s": self.str_, "vol": tr["volume"], "pan": tr["pan"],
                "prog": tr["instrument"], "bend": tr.get("pitchBend", 0), "strokeOff": 0,
                "t": self.cur_track, "plain": 0, "plainEnd": 4}

        def run():
            try:
                import wave as _w, io as _io
                buf = audio.render_note(tr, note, 0.5, 22050)
                out = _io.BytesIO()
                w = _w.open(out, "wb")
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(22050)
                data = bytearray()
                for v in buf:
                    iv = max(-32767, min(32767, int(v * 20000)))
                    data += iv.to_bytes(2, "little", signed=True)
                w.writeframes(bytes(data))
                w.close()
                audio.Player().play(out.getvalue())
            except Exception:
                pass
        threading.Thread(target=run, daemon=True).start()

    def play_from(self, col):
        if self.playing:
            self.stop(silent=True)
        self.play_start_col = self.col
        self._loop_col = col
        perf = build_performance(self.song, self.cur_track,
                                 self.opts["metronome"], self.opts["metroAccent"])
        steps = [s for s in perf["steps"]]
        start_step = next((s for s in steps if s["col"] >= col), steps[0] if steps else None)
        if start_step is None:
            return
        t_off = perf["secAt"](start_step["pp"])

        if self.opts.get("playbackMode", "midi") == "midi":
            self._play_midi(perf, start_step, t_off)
            return

        # synthesized (hi-fi) mode
        self._render_and_play(
            lambda: audio.render_performance(perf, self.song, t_off)[0],
            perf, t_off)

    def _resolve_midi_backend(self):
        pref = self.opts.get("midiBackend", "auto")
        if pref != "auto":
            if pref in [b for b, _ in midiplayer.available_backends()]:
                return pref
        return midiplayer.choose_backend()

    def _play_midi(self, perf, start_step, t_off):
        backend = self._resolve_midi_backend()
        if backend is None:
            messagebox.showerror("TabIt", midiplayer.backend_help())
            return
        start_pp = start_step["pp"]

        if backend == "fluidsynth-render":
            # Render the song to General MIDI audio and play it through the
            # same output as note preview, so playback is audible whenever
            # preview is.
            def make_wav():
                data = build_midi(self.song, perf, shift_pp=start_pp,
                                  respect_mute=True)
                wav = midiplayer.render_midi_to_wav(data)
                if wav is None:
                    raise RuntimeError("fluidsynth could not render the song.")
                return wav
            self._render_and_play(make_wav, perf, t_off)
            return

        try:
            if backend == "rtmidi":
                self.midi_player.play_events(realtime_events(self.song, perf), t_off)
            else:
                data = build_midi(self.song, perf, shift_pp=start_pp,
                                  respect_mute=True)
                self.midi_player.play_file(data, backend)
        except Exception as exc:
            messagebox.showerror("TabIt", "Error during playback:\n\n%s" % exc)
            return
        self._start_clock(perf, t_off)

    def _render_and_play(self, make_wav, perf, t_off):
        """Render WAV off-thread (make_wav callable) then play via the
        audio output and start the playhead clock."""
        self.st_main.config(text="Rendering...")
        self.root.update_idletasks()
        token = self._play_token = getattr(self, "_play_token", 0) + 1

        def worker():
            try:
                wav = make_wav()
            except Exception as exc:
                self.root.after(0, lambda exc=exc: (
                    self.st_main.config(text=""),
                    messagebox.showerror("TabIt", "Error during playback:\n\n%s" % exc)))
                return
            self.root.after(0, lambda: self._start_playback(perf, t_off, wav, token))

        threading.Thread(target=worker, daemon=True).start()

    def _start_playback(self, perf, t_off, wav, token=None):
        # a newer play request (or a stop) supersedes a stale render
        if token is not None and token != getattr(self, "_play_token", token):
            return
        try:
            self.player.play(wav)
        except RuntimeError as exc:
            self.st_main.config(text="")
            messagebox.showerror("TabIt", str(exc))
            return
        self._start_clock(perf, t_off)

    def _start_clock(self, perf, t_off):
        import time
        self.playing = True
        self._t0 = time.monotonic()
        self.play_steps = [{"sec": perf["secAt"](s["pp"]) - t_off, "col": s["col"]}
                           for s in perf["steps"] if perf["secAt"](s["pp"]) >= t_off - 1e-4]
        self._play_dur = perf["totalSec"] - t_off
        self.play_idx = 0
        self.update_status()
        self._tick()

    def _tick(self):
        if not self.playing:
            return
        import time
        el = time.monotonic() - self._t0
        if el >= self._play_dur + 0.4:
            if self.opts["loop"]:
                self.stop(silent=True)
                return self.play_from(self._loop_col)
            return self.stop()
        moved = False
        while self.play_idx < len(self.play_steps) and self.play_steps[self.play_idx]["sec"] <= el:
            self.play_idx += 1
            moved = True
        if moved:
            if self.opts["followPlayback"]:
                col = self.play_col()
                if col >= 0:
                    save = self.col
                    self.col = col
                    self.ensure_visible()
                    self.col = save
            self.redraw()
        self.root.after(30, self._tick)

    def stop(self, silent=False):
        was = self.playing
        self.playing = False
        self._play_token = getattr(self, "_play_token", 0) + 1
        self.player.stop()
        self.midi_player.stop()
        if was and not silent:
            if self.opts["rewindAfterStop"]:
                self.col = self.play_start_col
            self.clamp_cursor()
            self.redraw()
            self.ensure_visible()

    # ---------- toolbar ----------

    def build_toolbar(self):
        """Flat-button toolbar matched to TabIt 2.03's layout."""
        outer = tk.Frame(self.root, bg="#c0c0c0", bd=1, relief=tk.RAISED)
        outer.pack(fill=tk.X)
        bar = tk.Frame(outer, bg="#c0c0c0")
        bar.pack(side=tk.LEFT, padx=1, pady=1)
        self._tb_buttons = {}
        spec = [
            ("new", "New", self.new_song),
            ("open", "Open", self.open_song),
            ("save", "Save", self.save_song),
            None,
            ("songprops", "Song Properties", self.song_props),
            None,
            ("print", "Print", self.print_song),
            ("preview", "Print Preview", self.print_preview),
            None,
            ("cut", "Cut", lambda: self.copy_sel(True), lambda: self.selection() is not None),
            ("copy", "Copy", lambda: self.copy_sel(False), lambda: self.selection() is not None),
            ("paste", "Paste", self.paste, lambda: self.clipboard is not None),
            ("undo", "Undo", self.undo, lambda: bool(self.undo_stack)),
            None,
            ("properties", "Track Properties", self.track_props),
            None,
            ("play", "Play from Start (F5)", lambda: self.play_from(0)),
            ("playcur", "Play from Cursor (F6)", lambda: self.play_from(self.col)),
            ("stop", "Stop (F8)", self.stop, lambda: self.playing),
            None,
            ("metro", "Metronome", lambda: self._tb_toggle("metronome")),
        ]
        for item in spec:
            if item is None:
                tk.Frame(bar, width=2, bg="#808080").pack(side=tk.LEFT, fill=tk.Y, padx=(3, 0), pady=2)
                tk.Frame(bar, width=1, bg="#ffffff").pack(side=tk.LEFT, fill=tk.Y, padx=(0, 3), pady=2)
                continue
            name, tip, cmd = item[0], item[1], item[2]
            enabled = item[3] if len(item) > 3 else None
            self._tb_button(bar, name, tip, cmd, enabled)
        self._sync_toolbar()

    def _tb_button(self, parent, name, tip, cmd, enabled):
        toggle = name == "metro"
        b = tk.Label(parent, image=icons.get(name), bd=1, relief=tk.FLAT,
                     bg="#c0c0c0", takefocus=0, padx=2, pady=2)
        b.pack(side=tk.LEFT, padx=1)
        self._tb_buttons[name] = {"w": b, "icon": name, "enabled": enabled,
                                  "toggle": toggle}

        def active():
            return toggle and bool(self.opts.get("metronome"))

        def usable():
            return enabled is None or enabled()

        def on_enter(_e):
            if usable() and not active():
                b.config(relief=tk.RAISED)

        def on_leave(_e):
            b.config(relief=tk.SUNKEN if active() else tk.FLAT)

        def on_press(_e):
            if usable():
                b.config(relief=tk.SUNKEN)

        def on_release(_e):
            if not usable():
                return
            cmd()
            self.root.focus_set()
            self._sync_toolbar()

        b.bind("<Enter>", on_enter)
        b.bind("<Leave>", on_leave)
        b.bind("<ButtonPress-1>", on_press)
        b.bind("<ButtonRelease-1>", on_release)
        self._tip(b, tip)
        return b

    def _tb_toggle(self, key):
        self.opts[key] = not self.opts[key]
        self.save_prefs()

    def _sync_toolbar(self):
        for info in getattr(self, "_tb_buttons", {}).values():
            b, name = info["w"], info["icon"]
            on = info["toggle"] and bool(self.opts.get("metronome"))
            usable = info["enabled"] is None or info["enabled"]()
            b.config(image=icons.get(name, disabled=not usable),
                     relief=tk.SUNKEN if on else tk.FLAT)

    def _tip(self, widget, text):
        """Lightweight tooltip in the classic pale-yellow style."""
        tip = {"win": None, "after": None}

        def show():
            tip["after"] = None
            if tip["win"]:
                return
            x = widget.winfo_rootx() + 8
            y = widget.winfo_rooty() + widget.winfo_height() + 2
            w = tk.Toplevel(widget)
            w.wm_overrideredirect(True)
            w.wm_geometry("+%d+%d" % (x, y))
            tk.Label(w, text=text, bg="#ffffe1", fg="#000000",
                     bd=1, relief=tk.SOLID, font=("TkDefaultFont", 8),
                     padx=3, pady=1).pack()
            tip["win"] = w

        def enter(_e):
            tip["after"] = widget.after(500, show)

        def leave(_e):
            if tip["after"]:
                widget.after_cancel(tip["after"])
                tip["after"] = None
            if tip["win"]:
                tip["win"].destroy()
                tip["win"] = None

        widget.bind("<Enter>", enter, add="+")
        widget.bind("<Leave>", leave, add="+")
        widget.bind("<ButtonPress-1>", leave, add="+")

    # ---------- menus ----------

    def build_menus(self):
        m = tk.Menu(self.root)
        self.root.config(menu=m)

        # ---- File ----
        fm = tk.Menu(m, tearoff=0)
        fm.add_command(label="New", accelerator="Ctrl+N", command=self.new_song)
        fm.add_command(label="Open...", accelerator="Ctrl+O", command=self.open_song)
        fm.add_command(label="Save", accelerator="Ctrl+S", command=self.save_song)
        fm.add_command(label="Save As...", command=self.save_song)
        fm.add_command(label="Save as TabIt (.tbt)...", command=self.save_tbt)
        fm.add_separator()
        fm.add_command(label="Print", command=self.print_song)
        fm.add_command(label="Print Preview", command=self.print_preview)
        fm.add_separator()
        ex = tk.Menu(fm, tearoff=0)
        ex.add_command(label="Text...", command=self.export_text)
        ex.add_command(label="MIDI...", command=self.export_midi)
        ex.add_command(label="Audio (WAV/MP3)...", command=self.export_audio)
        fm.add_cascade(label="Export", menu=ex)
        fm.add_separator()
        fm.add_command(label="Exit", command=self.on_quit)
        m.add_cascade(label="File", menu=fm, underline=0)

        # ---- Edit ----
        em = tk.Menu(m, tearoff=0)
        em.add_command(label="Undo", accelerator="Ctrl+Z", command=self.undo)
        em.add_command(label="Redo", accelerator="Ctrl+Y", command=self.redo)
        em.add_separator()
        em.add_command(label="Cut", accelerator="Ctrl+X", command=lambda: self.copy_sel(True))
        em.add_command(label="Copy", accelerator="Ctrl+C", command=lambda: self.copy_sel(False))
        em.add_command(label="Paste", accelerator="Ctrl+V", command=self.paste)
        em.add_command(label="Clear", accelerator="Del", command=self.clear_cell)
        em.add_separator()
        em.add_command(label="Select All", accelerator="Ctrl+A", command=self.select_all)
        em.add_separator()
        em.add_command(label="Insert Space", accelerator="Ins", command=self.insert_space)
        em.add_command(label="Delete Space", accelerator="Ctrl+Del", command=self.delete_space)
        em.add_separator()
        em.add_command(label="Go to Bar...", command=self.goto_bar)
        m.add_cascade(label="Edit", menu=em, underline=0)

        # ---- View ----
        self.view_menu = tk.Menu(m, tearoff=0, postcommand=self.fill_view_menu)
        m.add_cascade(label="View", menu=self.view_menu, underline=0)

        # ---- Song ----
        self.song_menu = tk.Menu(m, tearoff=0, postcommand=self.fill_song_menu)
        m.add_cascade(label="Song", menu=self.song_menu, underline=0)

        # ---- Create ----
        self.create_menu = tk.Menu(m, tearoff=0, postcommand=self.fill_create_menu)
        m.add_cascade(label="Create", menu=self.create_menu, underline=0)

        # ---- Play ----
        self.player_menu = tk.Menu(m, tearoff=0, postcommand=self.fill_play_menu)
        m.add_cascade(label="Play", menu=self.player_menu, underline=0)

        # ---- Tools ----
        self.tools_menu = tk.Menu(m, tearoff=0, postcommand=self.fill_tools_menu)
        m.add_cascade(label="Tools", menu=self.tools_menu, underline=0)

        # ---- Help ----
        hm = tk.Menu(m, tearoff=0)
        hm.add_command(label="Keyboard Shortcuts...", command=self.show_shortcuts)
        hm.add_separator()
        hm.add_command(label="About TabIt...", command=self.show_about)
        m.add_cascade(label="Help", menu=hm, underline=0)

    def fill_view_menu(self):
        vm = self.view_menu
        vm.delete(0, tk.END)
        for key, label in (("barNumbers", "Bar Numbers"), ("caretBlink", "Cursor Blink")):
            vm.add_checkbutton(label=label, variable=tk.IntVar(value=1 if self.opts[key] else 0),
                               command=lambda key=key: self.toggle_opt(key))
        vm.add_separator()
        for sz in ("Small", "Medium", "Large"):
            vm.add_radiobutton(label="Font: " + sz,
                               variable=tk.StringVar(value=self.opts["fontSize"]), value=sz,
                               command=lambda sz=sz: self.set_font(sz))
        vm.add_separator()
        vm.add_command(label="Colors...", command=self.colors_dialog)

    def fill_song_menu(self):
        sm = self.song_menu
        sm.delete(0, tk.END)
        sm.add_command(label="Song Properties...", command=self.song_props)
        sm.add_separator()
        sm.add_command(label="Tempo...", command=self.tempo_dialog)
        sm.add_command(label="Tempo Tap...", command=self.tempo_tap)
        sm.add_separator()
        sm.add_command(label="New Track", command=self.add_track)
        sm.add_command(label="Delete Track", command=self.delete_track,
                       state=tk.NORMAL if len(self.song["tracks"]) > 1 else tk.DISABLED)
        sm.add_separator()
        for i, t in enumerate(self.song["tracks"]):
            sm.add_radiobutton(label="%d: %s" % (i + 1, t["name"]),
                               value=i, variable=tk.IntVar(value=self.cur_track),
                               command=lambda i=i: self.select_track(i))
        sm.add_separator()
        sm.add_command(label="Previous Track", accelerator="Ctrl+Up",
                       command=lambda: self.switch_track(-1))
        sm.add_command(label="Next Track", accelerator="Ctrl+Down",
                       command=lambda: self.switch_track(1))
        sm.add_separator()
        sm.add_command(label="Transpose...", command=self.transpose_dialog)
        sm.add_command(label="Track Properties...", command=self.track_props)

    def select_track(self, i):
        self.cur_track = i
        self.clamp_cursor()
        self.redraw()

    def fill_create_menu(self):
        cm = self.create_menu
        cm.delete(0, tk.END)
        tr = self.track()
        cell = get_cell(tr, self.col, self.str_)
        fx = tr["fx"].get(str(self.col))
        cm.add_command(label="Add Bars...", command=self.add_bars)
        cm.add_command(label="Insert Bar", command=self.insert_bar)
        cm.add_command(label="Delete Bar", command=self.delete_bar)
        cm.add_separator()
        cm.add_command(label="Bar Line Change...", command=self.bar_line_change)
        cm.add_separator()
        cm.add_command(label="Alternate-Time Region...", command=self.alt_region_dialog)
        cm.add_command(label="Remove Alternate-Time Region", command=self.remove_alt_region)
        cm.add_separator()

        ne = tk.Menu(cm, tearoff=0)
        for ch, name in EFFECTS.items():
            ne.add_checkbutton(label=name, accelerator=ch,
                               variable=tk.IntVar(value=1 if cell and cell["fx"] == ch else 0),
                               command=lambda ch=ch: self.type_effect(ch))
        ne.add_separator()
        ne.add_checkbutton(label="Dead Note", accelerator="x",
                           variable=tk.IntVar(value=1 if cell and cell["fx"] == "x" else 0),
                           command=lambda: self.type_effect("x"))
        ne.add_checkbutton(label="Stop String", accelerator="*",
                           variable=tk.IntVar(value=1 if cell and cell["fx"] == "*" else 0),
                           command=lambda: self.type_effect("*"))
        cm.add_cascade(label="Note Effect", menu=ne)

        te = tk.Menu(cm, tearoff=0)
        te.add_checkbutton(label="Stroke Down", accelerator="d",
                           variable=tk.IntVar(value=1 if fx and fx["t"] == TFX_STROKE_DOWN else 0),
                           command=lambda: self.set_track_fx(TFX_STROKE_DOWN, 0))
        te.add_checkbutton(label="Stroke Up", accelerator="u",
                           variable=tk.IntVar(value=1 if fx and fx["t"] == TFX_STROKE_UP else 0),
                           command=lambda: self.set_track_fx(TFX_STROKE_UP, 0))
        te.add_separator()
        for t in (TFX_TEMPO, TFX_INSTRUMENT, TFX_VOLUME, TFX_PAN, TFX_CHORUS,
                  TFX_REVERB, TFX_PITCH_BEND):
            te.add_command(label=TFX_NAMES[t] + "...",
                           command=lambda t=t: self.track_fx_dialog(t))
        te.add_separator()
        te.add_command(label="Repeat Previous Track Effect", command=self.repeat_prev_track_fx)
        te.add_command(label="Remove Track Effect", command=self.remove_track_fx,
                       state=tk.NORMAL if fx else tk.DISABLED)
        te.add_command(label="Clear Track Effects", command=self.clear_track_fx)
        cm.add_cascade(label="Track Effect", menu=te)

    def fill_play_menu(self):
        pm = self.player_menu
        pm.delete(0, tk.END)
        pm.add_command(label="Play from Start", accelerator="F5", command=lambda: self.play_from(0))
        pm.add_command(label="Play from Cursor", accelerator="F6",
                       command=lambda: self.play_from(self.col))
        pm.add_command(label="Stop", accelerator="F8", command=self.stop,
                       state=tk.NORMAL if self.playing else tk.DISABLED)
        pm.add_separator()
        pm.add_command(label="Tracks...", command=self.player_tracks)
        pm.add_separator()
        mode = self.opts.get("playbackMode", "midi")
        for value, label in (("midi", "MIDI Playback"),
                             ("synth", "Synthesized Playback (Hi-Fi)")):
            pm.add_radiobutton(label=label, value=value,
                               variable=tk.StringVar(value=mode),
                               command=lambda value=value: self.set_playback_mode(value))
        # MIDI output device submenu
        out_menu = tk.Menu(pm, tearoff=0)
        cur = self.opts.get("midiBackend", "auto")
        backends = midiplayer.available_backends()
        auto = midiplayer.choose_backend()
        auto_label = dict(backends + [("mci", "Windows MIDI (MCI)")]).get(auto, "none")
        out_menu.add_radiobutton(label="Automatic (%s)" % auto_label, value="auto",
                                 variable=tk.StringVar(value=cur),
                                 command=lambda: self.set_midi_backend("auto"))
        if backends:
            out_menu.add_separator()
        for bid, label in backends:
            out_menu.add_radiobutton(label=label, value=bid,
                                     variable=tk.StringVar(value=cur),
                                     command=lambda bid=bid: self.set_midi_backend(bid))
        pm.add_cascade(label="MIDI Output", menu=out_menu,
                       state=tk.NORMAL if mode == "midi" else tk.DISABLED)
        pm.add_separator()
        for key, label in (("loop", "Loop"), ("metronome", "Metronome")):
            pm.add_checkbutton(label=label, variable=tk.IntVar(value=1 if self.opts[key] else 0),
                               command=lambda key=key: self.toggle_opt(key))
        pm.add_command(label="Metronome Settings...", command=self.metronome_dialog)

    def fill_tools_menu(self):
        tm = self.tools_menu
        tm.delete(0, tk.END)
        for key, label in (("followPlayback", "Follow Playback"),
                           ("rewindAfterStop", "Rewind After Stop"),
                           ("previewNotes", "Preview Notes While Typing")):
            tm.add_checkbutton(label=label, variable=tk.IntVar(value=1 if self.opts[key] else 0),
                               command=lambda key=key: self.toggle_opt(key))
        tm.add_separator()
        tun = tk.Menu(tm, tearoff=0)
        tun.add_command(label="Save Preset Tuning...", command=self.save_tuning)
        tun.add_command(label="Delete Preset Tuning...", command=self.delete_tuning)
        tun.add_command(label="Reset Preset Tuning List", command=self.reset_tunings)
        tm.add_cascade(label="Tuning Presets", menu=tun)

    def toggle_opt(self, key):
        self.opts[key] = not self.opts[key]
        self.save_prefs()
        self._sync_toolbar()
        self.redraw()

    def set_playback_mode(self, mode):
        self.opts["playbackMode"] = mode
        self.save_prefs()

    def set_midi_backend(self, backend):
        self.opts["midiBackend"] = backend
        self.save_prefs()

    def set_font(self, sz):
        self.opts["fontSize"] = sz
        self.save_prefs()
        self.redraw()

    # ---------- dialogs ----------

    def _modal(self, title):
        win = tk.Toplevel(self.root)
        win.title(title)
        win.transient(self.root)
        win.grab_set()
        win.resizable(False, False)
        return win

    def _buttons(self, win, on_ok):
        f = tk.Frame(win)
        f.pack(fill=tk.X, pady=(8, 10), padx=10)
        tk.Button(f, text="OK", width=10,
                  command=lambda: (on_ok(), win.destroy())).pack(side=tk.RIGHT, padx=4)
        tk.Button(f, text="Cancel", width=10, command=win.destroy).pack(side=tk.RIGHT)

    def tempo_dialog(self):
        v = simpledialog.askinteger("Tempo", "Tempo (BPM):", parent=self.root,
                                    initialvalue=self.song["tempo"], minvalue=10, maxvalue=999)
        if v:
            self.push_undo()
            self.song["tempo"] = v

    def tempo_tap(self):
        win = self._modal("Tempo Tap")
        taps = []
        val = tk.StringVar(value="Tapped tempo: -")

        def tap():
            import time
            taps.append(time.monotonic())
            if len(taps) > 5:
                taps.pop(0)
            if len(taps) >= 2:
                bpm = round(60.0 * (len(taps) - 1) / (taps[-1] - taps[0]))
                val.set("Tapped tempo: %d BPM" % bpm)
                win.bpm = bpm
        win.bpm = None
        tk.Button(win, text="Tap", width=16, height=2, command=tap).pack(padx=24, pady=(16, 6))
        tk.Label(win, textvariable=val).pack(pady=4)

        def ok():
            if win.bpm:
                self.push_undo()
                self.song["tempo"] = max(10, min(999, win.bpm))
        self._buttons(win, ok)

    def metronome_dialog(self):
        win = self._modal("Metronome")
        on = tk.IntVar(value=1 if self.opts["metronome"] else 0)
        acc = tk.IntVar(value=1 if self.opts["metroAccent"] else 0)
        vol = tk.IntVar(value=self.opts["metroVolume"])
        tk.Checkbutton(win, text="Metronome on", variable=on).pack(anchor=tk.W, padx=12, pady=(10, 0))
        tk.Checkbutton(win, text="Accent first beat of bar", variable=acc).pack(anchor=tk.W, padx=12)
        tk.Label(win, text="Volume:").pack(anchor=tk.W, padx=12)
        tk.Scale(win, from_=0, to=127, orient=tk.HORIZONTAL, variable=vol,
                 length=200).pack(padx=12)

        def ok():
            self.opts["metronome"] = bool(on.get())
            self.opts["metroAccent"] = bool(acc.get())
            self.opts["metroVolume"] = vol.get()
            self.save_prefs()
        self._buttons(win, ok)

    def track_fx_dialog(self, t):
        tr = self.track()
        existing = tr["fx"].get(str(self.col))
        cur = existing["v"] if existing and existing["t"] == t else None
        if t == TFX_TEMPO:
            v = simpledialog.askinteger(TFX_NAMES[t], "New tempo (BPM):", parent=self.root,
                                        initialvalue=cur if cur is not None else self.song["tempo"],
                                        minvalue=10, maxvalue=999)
            if v is not None:
                self.set_track_fx(t, v)
        elif t == TFX_INSTRUMENT:
            win = self._modal(TFX_NAMES[t])
            tk.Label(win, text="Instrument:").pack(anchor=tk.W, padx=12, pady=(10, 2))
            names = ["%d - %s" % (i + 1, n) for i, n in enumerate(GM_INSTRUMENTS)]
            box = ttk.Combobox(win, values=names, state="readonly", width=34)
            box.current(cur if cur is not None else tr["instrument"])
            box.pack(padx=12)
            self._buttons(win, lambda: self.set_track_fx(t, box.current()))
        elif t == TFX_PITCH_BEND:
            v = simpledialog.askfloat(TFX_NAMES[t], "Pitch bend (semitones, -2 to +2):",
                                      parent=self.root,
                                      initialvalue=(cur / 8192 * 2) if cur is not None else 0.0,
                                      minvalue=-2, maxvalue=2)
            if v is not None:
                self.set_track_fx(t, max(-8192, min(8191, round(v / 2 * 8192))))
        else:
            default = {TFX_VOLUME: tr["volume"], TFX_PAN: tr["pan"],
                       TFX_CHORUS: tr.get("chorus", 0), TFX_REVERB: tr.get("reverb", 0)}.get(t, 64)
            v = simpledialog.askinteger(TFX_NAMES[t], TFX_NAMES[t] + " (0-127):",
                                        parent=self.root,
                                        initialvalue=cur if cur is not None else default,
                                        minvalue=0, maxvalue=127)
            if v is not None:
                self.set_track_fx(t, v)

    def add_bars(self):
        n = simpledialog.askinteger("Add Bars", "Number of bars to add:", parent=self.root,
                                    initialvalue=4, minvalue=1, maxvalue=500)
        if not n:
            return
        sp = simpledialog.askinteger("Add Bars", "Spaces per bar:", parent=self.root,
                                     initialvalue=self.song.get("spacesPerBar", 16),
                                     minvalue=1, maxvalue=64)
        if not sp:
            return
        self.push_undo()
        for _ in range(n):
            self.song["barLines"].append(make_bar(sp))
        self.redraw()

    def insert_bar(self):
        self.push_undo()
        k = bar_of_col(self.geom(), self.col)
        nb = make_bar(self.song.get("spacesPerBar", 16))
        starts = []
        for tr in self.song["tracks"]:
            g = track_geom(self.song, tr)
            starts.append(g["bars"][k]["start"] if k < len(g["bars"]) else g["cols"])
        for tr, at in zip(self.song["tracks"], starts):
            track_insert_cols(tr, at, nb["spaces"])
        self.song["barLines"].insert(k, nb)
        self.redraw()

    def delete_bar(self):
        if len(self.song["barLines"]) <= 1:
            return
        self.push_undo()
        k = bar_of_col(self.geom(), self.col)
        for tr in self.song["tracks"]:
            g = track_geom(self.song, tr)
            if k < len(g["bars"]):
                b = g["bars"][k]
                track_remove_cols(tr, b["start"], b["cols"])
        del self.song["barLines"][k]
        self.clamp_cursor()
        self.redraw()

    def bar_line_change(self):
        g = self.geom()
        k = bar_of_col(g, self.col)
        b = self.song["barLines"][k]
        win = self._modal("Bar Line Change")
        tk.Label(win, text="Bar %d — spaces in bar:" % (k + 1)).pack(anchor=tk.W, padx=12, pady=(10, 2))
        spaces = tk.IntVar(value=b["spaces"])
        tk.Spinbox(win, from_=1, to=64, textvariable=spaces, width=6).pack(anchor=tk.W, padx=12)
        dbl = tk.IntVar(value=1 if b["double"] else 0)
        opn = tk.IntVar(value=1 if b["open"] else 0)
        cls = tk.IntVar(value=1 if b["close"] else 0)
        rpt = tk.IntVar(value=max(2, b["repeat"] or 2))
        tk.Checkbutton(win, text="Double bar line", variable=dbl).pack(anchor=tk.W, padx=12)
        tk.Checkbutton(win, text="Open repeat", variable=opn).pack(anchor=tk.W, padx=12)
        row = tk.Frame(win)
        row.pack(anchor=tk.W, padx=12)
        tk.Checkbutton(row, text="Close repeat, play", variable=cls).pack(side=tk.LEFT)
        tk.Spinbox(row, from_=2, to=99, textvariable=rpt, width=4).pack(side=tk.LEFT, padx=4)
        tk.Label(row, text="times").pack(side=tk.LEFT)

        def ok():
            self.push_undo()
            new_spaces = max(1, min(64, spaces.get()))
            delta = new_spaces - b["spaces"]
            if delta:
                for tr in self.song["tracks"]:
                    gt = track_geom(self.song, tr)
                    if k < len(gt["bars"]):
                        bt = gt["bars"][k]
                        if delta > 0:
                            track_insert_cols(tr, bt["start"] + bt["cols"], delta)
                        else:
                            track_remove_cols(tr, bt["start"] + bt["cols"] + delta, -delta)
            b["spaces"] = new_spaces
            b["double"] = bool(dbl.get())
            b["open"] = bool(opn.get())
            b["close"] = bool(cls.get())
            b["repeat"] = max(2, min(99, rpt.get())) if b["close"] else 0
            self.clamp_cursor()
            self.redraw()
        self._buttons(win, ok)

    def goto_bar(self):
        g = self.geom()
        v = simpledialog.askinteger("Go to Bar", "Bar number:", parent=self.root,
                                    initialvalue=bar_of_col(g, self.col) + 1, minvalue=1)
        if not v:
            return
        k = min(v - 1, len(g["bars"]) - 1)
        self.col = g["bars"][k]["start"]
        self.sel_anchor = None
        self.redraw()
        self.ensure_visible()

    def alt_region_dialog(self):
        sel = self.selection() or (self.col, self.col)
        win = self._modal("Alternate-Time Region")
        tk.Label(win, text="Play the selected %d space(s) as:" %
                 (sel[1] - sel[0] + 1)).pack(anchor=tk.W, padx=12, pady=(10, 4))
        row = tk.Frame(win)
        row.pack(padx=12)
        num = tk.IntVar(value=3)
        den = tk.IntVar(value=2)
        tk.Spinbox(row, from_=1, to=32, textvariable=num, width=4).pack(side=tk.LEFT)
        tk.Label(row, text="notes in the time of").pack(side=tk.LEFT, padx=4)
        tk.Spinbox(row, from_=1, to=32, textvariable=den, width=4).pack(side=tk.LEFT)
        tk.Label(win, text="(e.g. 3 in the time of 2 = triplets)",
                 fg="#606060").pack(anchor=tk.W, padx=12, pady=(4, 0))

        def ok():
            n, d = max(1, num.get()), max(1, den.get())
            self.push_undo()
            tr = self.track()
            g = self.geom()
            if not tr.get("alt"):
                tr["alt"] = [None] * g["cols"]
            while len(tr["alt"]) < g["cols"]:
                tr["alt"].append(None)
            for c in range(sel[0], sel[1] + 1):
                tr["alt"][c] = [n, d]
            self.sel_anchor = None
            self.clamp_cursor()
            self.redraw()
        self._buttons(win, ok)

    def remove_alt_region(self):
        tr = self.track()
        if not tr.get("alt"):
            return
        sel = self.selection() or (self.col, self.col)
        self.push_undo()
        for c in range(sel[0], min(sel[1] + 1, len(tr["alt"]))):
            tr["alt"][c] = None
        if not any(tr["alt"]):
            tr["alt"] = None
        self.sel_anchor = None
        self.clamp_cursor()
        self.redraw()

    def transpose_dialog(self):
        tr = self.track()
        if tr["isDrum"]:
            messagebox.showinfo("TabIt", "Drum tracks cannot be transposed.")
            return
        v = simpledialog.askinteger(
            "Transpose", "Transpose this track by (semitones, -24 to +24):",
            parent=self.root, initialvalue=0, minvalue=-24, maxvalue=24)
        if not v:
            return
        self.push_undo()
        tr["tuning"] = [m + v for m in tr["tuning"]]
        self.redraw()

    def song_props(self):
        win = self._modal("Song Properties")
        fields = [("Title:", "title"), ("Artist:", "artist"), ("Album:", "album"),
                  ("Transcribed by:", "transcribedBy"), ("Comments:", "comments")]
        entries = {}
        body = tk.Frame(win)
        body.pack(padx=12, pady=10)
        for i, (label, key) in enumerate(fields):
            tk.Label(body, text=label).grid(row=i, column=0, sticky=tk.W, pady=2)
            e = tk.Entry(body, width=36)
            e.insert(0, self.song.get(key, ""))
            e.grid(row=i, column=1, pady=2)
            entries[key] = e

        def ok():
            self.push_undo()
            for key, e in entries.items():
                self.song[key] = e.get()
            self.update_title()
        self._buttons(win, ok)

    def track_props(self):
        tr = self.track()
        win = self._modal("Track %d Properties" % (self.cur_track + 1))
        body = tk.Frame(win)
        body.pack(padx=12, pady=10)
        r = 0
        tk.Label(body, text="Name:").grid(row=r, column=0, sticky=tk.W)
        name = tk.Entry(body, width=32)
        name.insert(0, tr["name"])
        name.grid(row=r, column=1, columnspan=2, sticky=tk.W)
        r += 1
        tk.Label(body, text="Instrument:").grid(row=r, column=0, sticky=tk.W)
        inst_names = ["%d - %s" % (i + 1, n) for i, n in enumerate(GM_INSTRUMENTS)] + \
            ["Drums - " + n for n in DRUM_KITS]
        inst = ttk.Combobox(body, values=inst_names, state="readonly", width=30)
        inst.current(128 + tr["drumKit"] if tr["isDrum"] else tr["instrument"])
        inst.grid(row=r, column=1, columnspan=2, sticky=tk.W)
        r += 1
        tk.Label(body, text="Tuning preset:").grid(row=r, column=0, sticky=tk.W)
        presets = ["-- preset --"] + list(self.all_tunings().keys())
        preset = ttk.Combobox(body, values=presets, state="readonly", width=30)
        preset.current(0)
        preset.grid(row=r, column=1, columnspan=2, sticky=tk.W)
        r += 1
        strings = []
        notes = [note_name(m) for m in range(16, 86)]
        for s, midi in enumerate(tr["tuning"]):
            tk.Label(body, text="String %d:" % (s + 1)).grid(row=r, column=0, sticky=tk.W)
            box = ttk.Combobox(body, values=notes, state="readonly", width=6)
            box.current(midi - 16)
            box.grid(row=r, column=1, sticky=tk.W)
            strings.append(box)
            r += 1

        def apply_preset(_e=None):
            p = self.all_tunings().get(preset.get())
            if not p:
                return
            for s, box in enumerate(strings):
                if s < len(p):
                    box.current(p[s] - 16)
        preset.bind("<<ComboboxSelected>>", apply_preset)

        sliders = {}
        for label, key in (("Volume:", "volume"), ("Pan:", "pan"),
                           ("Reverb:", "reverb"), ("Chorus:", "chorus")):
            tk.Label(body, text=label).grid(row=r, column=0, sticky=tk.W)
            var = tk.IntVar(value=tr.get(key, 0))
            tk.Scale(body, from_=0, to=127, orient=tk.HORIZONTAL, variable=var,
                     length=180, showvalue=True).grid(row=r, column=1, columnspan=2, sticky=tk.W)
            sliders[key] = var
            r += 1
        cut = tk.IntVar(value=1 if tr.get("cutAnyString") else 0)
        tk.Checkbutton(body, text="Notes ring until next event on any string",
                       variable=cut).grid(row=r, column=0, columnspan=3, sticky=tk.W)

        def ok():
            self.push_undo()
            tr["name"] = name.get() or ("Track %d" % (self.cur_track + 1))
            ci = inst.current()
            if ci >= 128:
                tr["isDrum"] = True
                tr["drumKit"] = ci - 128
            else:
                tr["isDrum"] = False
                tr["instrument"] = ci
            p = self.all_tunings().get(preset.get())
            if p:
                self.retune(tr, p)
            else:
                for s, box in enumerate(strings):
                    tr["tuning"][s] = box.current() + 16
            for key, var in sliders.items():
                tr[key] = var.get()
            tr["cutAnyString"] = bool(cut.get())
            self.clamp_cursor()
            self.redraw()
        self._buttons(win, ok)

    @staticmethod
    def retune(tr, tuning):
        old_n, new_n = len(tr["tuning"]), len(tuning)
        tr["tuning"] = list(tuning)
        if new_n != old_n:
            for c, sp in enumerate(tr["spaces"]):
                if not sp:
                    continue
                ns = [None] * new_n
                for s in range(min(old_n, new_n)):
                    ns[s] = sp[s]
                tr["spaces"][c] = ns if any(ns) else None

    def add_track(self):
        self.push_undo()
        t = make_track("Track %d" % (len(self.song["tracks"]) + 1), 27,
                       BUILTIN_TUNINGS["(Standard)"])
        self.song["tracks"].append(t)
        self.cur_track = len(self.song["tracks"]) - 1
        self.clamp_cursor()
        self.redraw()
        self.track_props()

    def delete_track(self):
        if len(self.song["tracks"]) <= 1:
            messagebox.showinfo("TabIt", "A song must contain at least one track.")
            return
        if not messagebox.askokcancel("Delete Track", "Delete track %d (%s)?" %
                                      (self.cur_track + 1, self.track()["name"])):
            return
        self.push_undo()
        del self.song["tracks"][self.cur_track]
        self.cur_track = max(0, self.cur_track - 1)
        self.clamp_cursor()
        self.redraw()

    def player_tracks(self):
        win = self._modal("Player Tracks")
        tk.Label(win, text="Tracks to play:").pack(anchor=tk.W, padx=12, pady=(10, 2))
        vars_ = []
        for i, t in enumerate(self.song["tracks"]):
            v = tk.IntVar(value=1 if t.get("played", True) else 0)
            tk.Checkbutton(win, text="%d: %s" % (i + 1, t["name"]), variable=v)\
                .pack(anchor=tk.W, padx=18)
            vars_.append(v)

        def ok():
            played = [bool(v.get()) for v in vars_]
            if not any(played):
                messagebox.showinfo("TabIt", "At least one track must be checked.")
                return
            for t, p in zip(self.song["tracks"], played):
                t["played"] = p
            self.redraw()
        self._buttons(win, ok)

    def save_tuning(self):
        tr = self.track()
        name = simpledialog.askstring(
            "Save Preset Tuning",
            "Save the current track's tuning (%s) as:" %
            " ".join(note_name(m) for m in tr["tuning"]), parent=self.root)
        if not name:
            return
        if name in BUILTIN_TUNINGS:
            messagebox.showinfo("TabIt", 'A tuning named "%s" already exists.' % name)
            return
        self.user_tunings[name] = list(tr["tuning"])
        self.save_prefs()

    def delete_tuning(self):
        if not self.user_tunings:
            messagebox.showinfo("TabIt", "There are no user preset tunings to delete.")
            return
        win = self._modal("Delete Preset Tuning")
        tk.Label(win, text="Delete the tuning:").pack(anchor=tk.W, padx=12, pady=(10, 2))
        box = ttk.Combobox(win, values=list(self.user_tunings.keys()), state="readonly")
        box.current(0)
        box.pack(padx=12)

        def ok():
            self.user_tunings.pop(box.get(), None)
            self.save_prefs()
        self._buttons(win, ok)

    def reset_tunings(self):
        if messagebox.askokcancel("TabIt", "Reset the preset tuning list, "
                                           "removing all user tunings?"):
            self.user_tunings = {}
            self.save_prefs()

    def colors_dialog(self):
        win = self._modal("Colors")
        fields = [("bg", "Background"), ("text", "Text"), ("line", "Lines"),
                  ("barnum", "Bar numbers"), ("cursor", "Cursor"),
                  ("cursorText", "Cursor text"), ("sel", "Selection"),
                  ("play", "Playhead"), ("fxMark", "Effect markers")]
        body = tk.Frame(win)
        body.pack(padx=12, pady=10)
        work = dict(self.colors)
        buttons = {}

        def pick(key):
            rgb, hexv = colorchooser.askcolor(work[key], parent=win)
            if hexv:
                work[key] = hexv
                buttons[key].config(bg=hexv)
        for i, (key, label) in enumerate(fields):
            tk.Label(body, text=label + ":").grid(row=i, column=0, sticky=tk.W, pady=1)
            b = tk.Button(body, width=8, bg=work[key],
                          command=lambda key=key: pick(key))
            b.grid(row=i, column=1, padx=6)
            buttons[key] = b
        tk.Button(body, text="Reset Defaults", command=lambda: [
            work.update(DEFAULT_COLORS),
            [buttons[k].config(bg=work[k]) for k, _ in fields]
        ]).grid(row=len(fields), column=0, columnspan=2, pady=(6, 0))

        def ok():
            self.colors.update(work)
            self.save_prefs()
            self.redraw()
        self._buttons(win, ok)

    def show_shortcuts(self):
        messagebox.showinfo("Keyboard Shortcuts",
            "Arrows\tMove cursor\n"
            "0-9\tEnter fret (combine digits for 10+)\n"
            "Del / -\tClear note or selection\n"
            "Backspace\tClear and move left\n"
            "Ins / Ctrl+Del\tInsert / delete space\n"
            "h p / \\ b ^ r ~\tHammer, pull, slides, bends, release, vibrato\n"
            "t s w ( < {\tTap, slap, whammy, soft, harmonic, tremolo\n"
            "x\tDead note    *  Stop string\n"
            "u / d\tStroke up / stroke down\n"
            "Shift+Arrows\tSelect spaces\n"
            "Ctrl+C/X/V\tCopy / Cut / Paste\n"
            "Ctrl+Up/Down\tPrevious / next track\n"
            "PgUp/PgDn\tPrevious / next bar\n"
            "F5 / F6 / F8\tPlay from start / from cursor / stop")

    def show_about(self):
        messagebox.showinfo("About TabIt",
            "TabIt Py — a tribute to TabIt version 2.03\n\n"
            "Original TabIt © GTAB Software (defunct).\n"
            "An unofficial fan recreation of the classic Windows\n"
            "tablature editor, ported to Python/tkinter from the\n"
            "web tribute, itself rebuilt from a Ghidra analysis of\n"
            "the original program.\n"
            "Opens original .tbt files (versions 0x6f-0x72).\n\n"
            "Not affiliated with or endorsed by the original authors.")

    # ---------- file ops ----------

    def new_song(self):
        if not messagebox.askokcancel("TabIt", "Discard the current song and start a new one?"):
            return
        self.song = blank_song()
        self.file_name = None
        self.cur_track = 0
        self.col = self.str_ = 0
        self.sel_anchor = None
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.update_title()
        self.redraw()

    def open_song(self):
        path = filedialog.askopenfilename(parent=self.root, title="Open",
            filetypes=[("TabIt files", "*.tbt *.tabit.json *.json"),
                       ("TabIt tablature", "*.tbt"), ("All files", "*")])
        if not path:
            return
        try:
            with open(path, "rb") as f:
                data = f.read()
            if data[:3] == b"TBT":
                song, _version, warnings = tbtfile.parse(data)
                self.song = migrate(song)
                if warnings:
                    messagebox.showwarning("TabIt", "\n".join(warnings))
            else:
                obj = json.loads(data.decode("utf-8"))
                if obj.get("format") not in ("tabit-web-1", "tabit-web-2") or \
                        "song" not in obj:
                    raise ValueError("incompatible version")
                self.song = migrate(obj["song"])
            self.file_name = os.path.splitext(os.path.basename(path))[0]\
                .removesuffix(".tabit")
            self.cur_track = 0
            self.col = self.str_ = 0
            self.sel_anchor = None
            self.undo_stack.clear()
            self.redo_stack.clear()
            self.update_title()
            self.canvas.yview_moveto(0)
            self.redraw()
        except Exception as exc:
            messagebox.showerror("TabIt", 'File "%s" could not be opened:\n%s' %
                                 (os.path.basename(path), exc))

    def save_song(self):
        base = (self.file_name or self.song["title"] or "Untitled")
        path = filedialog.asksaveasfilename(parent=self.root, title="Save",
            initialfile=base + ".tabit.json",
            defaultextension=".tabit.json",
            filetypes=[("TabIt Web song", "*.tabit.json"),
                       ("TabIt tablature", "*.tbt")])
        if not path:
            return
        try:
            if path.lower().endswith(".tbt"):
                from . import tbtwrite
                with open(path, "wb") as f:
                    f.write(tbtwrite.write(self.song))
            else:
                with open(path, "w") as f:
                    json.dump({"format": "tabit-web-2", "song": self.song}, f, indent=1)
        except Exception as exc:
            messagebox.showerror("TabIt", "Could not save:\n%s" % exc)
            return
        self.file_name = os.path.splitext(os.path.basename(path))[0].removesuffix(".tabit")
        self.update_title()

    def save_tbt(self):
        from . import tbtwrite
        base = (self.file_name or self.song["title"] or "Untitled")
        path = filedialog.asksaveasfilename(parent=self.root, title="Save as TabIt (.tbt)",
            initialfile=base + ".tbt", defaultextension=".tbt",
            filetypes=[("TabIt tablature", "*.tbt")])
        if not path:
            return
        try:
            with open(path, "wb") as f:
                f.write(tbtwrite.write(self.song))
        except Exception as exc:
            messagebox.showerror("TabIt", "Could not save .tbt:\n%s" % exc)

    def print_preview(self):
        win = tk.Toplevel(self.root)
        win.title("Print Preview")
        win.transient(self.root)
        win.geometry("680x520")
        txt = tk.Text(win, wrap="none", font=("Courier", 10), bg="#ffffff")
        yb = tk.Scrollbar(win, orient=tk.VERTICAL, command=txt.yview)
        xb = tk.Scrollbar(win, orient=tk.HORIZONTAL, command=txt.xview)
        txt.configure(yscrollcommand=yb.set, xscrollcommand=xb.set)
        txt.insert("1.0", build_text(self.song))
        txt.config(state=tk.DISABLED)
        bf = tk.Frame(win, bg="#c0c0c0")
        bf.pack(side=tk.BOTTOM, fill=tk.X)
        tk.Button(bf, text="Close", width=10, command=win.destroy).pack(side=tk.RIGHT, padx=6, pady=6)
        tk.Button(bf, text="Print", width=10,
                  command=lambda: self.print_song()).pack(side=tk.RIGHT, pady=6)
        yb.pack(side=tk.RIGHT, fill=tk.Y)
        xb.pack(side=tk.BOTTOM, fill=tk.X)
        txt.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

    def print_song(self):
        import shutil as _shutil
        import subprocess
        cmd = _shutil.which("lpr") or _shutil.which("lp")
        if not cmd:
            messagebox.showinfo("TabIt", "No printer command (lpr/lp) was found.\n\n"
                                "Use Print Preview, or File → Export Text to save "
                                "the tab to a file.")
            return
        try:
            subprocess.run([cmd], input=build_text(self.song).encode("utf-8"), check=True)
            self.st_main.config(text="Sent to printer")
        except Exception as exc:
            messagebox.showerror("TabIt", "Printing failed:\n%s" % exc)

    def export_text(self):
        path = filedialog.asksaveasfilename(parent=self.root, title="Export Text",
            initialfile=(self.song["title"] or "Untitled") + ".txt",
            defaultextension=".txt", filetypes=[("Text", "*.txt")])
        if not path:
            return
        with open(path, "w", newline="") as f:
            f.write(build_text(self.song))

    def export_midi(self):
        path = filedialog.asksaveasfilename(parent=self.root, title="Export MIDI",
            initialfile=(self.song["title"] or "Untitled") + ".mid",
            defaultextension=".mid", filetypes=[("MIDI", "*.mid")])
        if not path:
            return
        with open(path, "wb") as f:
            f.write(build_midi(self.song))

    def export_audio(self):
        import shutil as _shutil
        have_ffmpeg = bool(_shutil.which("ffmpeg"))
        types = [("WAV audio", "*.wav")]
        if have_ffmpeg:
            types.insert(0, ("MP3 audio", "*.mp3"))
        path = filedialog.asksaveasfilename(
            parent=self.root, title="Export Audio (high quality render)",
            initialfile=(self.song["title"] or "Untitled") +
                        (".mp3" if have_ffmpeg else ".wav"),
            defaultextension=".mp3" if have_ffmpeg else ".wav", filetypes=types)
        if not path:
            return
        if path.lower().endswith(".mp3") and not have_ffmpeg:
            messagebox.showerror("TabIt", "MP3 export needs ffmpeg installed; "
                                          "exporting WAV instead.")
            path = path[:-4] + ".wav"
        self.st_main.config(text="Rendering...")
        self.root.update_idletasks()

        def render():
            try:
                perf = build_performance(self.song, self.cur_track,
                                         self.opts["metronome"], self.opts["metroAccent"])
                wav, _dur = audio.render_performance(perf, self.song, 0.0)
                if path.lower().endswith(".mp3"):
                    import subprocess, tempfile
                    fd, tmp = tempfile.mkstemp(suffix=".wav", prefix="tabit-")
                    with os.fdopen(fd, "wb") as f:
                        f.write(wav)
                    try:
                        subprocess.run(["ffmpeg", "-y", "-loglevel", "quiet",
                                        "-i", tmp, "-b:a", "192k", path], check=True)
                    finally:
                        os.unlink(tmp)
                else:
                    with open(path, "wb") as f:
                        f.write(wav)
                self.root.after(0, lambda: self.st_main.config(
                    text="Exported %s" % os.path.basename(path)))
            except Exception as exc:
                self.root.after(0, lambda exc=exc: messagebox.showerror(
                    "TabIt", "Audio export failed:\n%s" % exc))

        threading.Thread(target=render, daemon=True).start()

    def on_quit(self):
        self.stop(silent=True)
        self.save_prefs()
        self.root.destroy()


def main():
    root = tk.Tk()
    root.title("Untitled - TabIt")
    root.geometry("1024x700")
    App(root)
    root.mainloop()

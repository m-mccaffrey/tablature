"""Optional screenshot drivers for tools.shoot.

Each driver takes the live ``App`` instance and mutates state before the
screenshot is taken. Add new ones here as needed.
"""


def loop_metro_on(app):
    app.opts["loop"] = True
    app.opts["metronome"] = True
    app._sync_toolbar()


def blank(app):
    from tabit.model import blank_song
    app.song = blank_song()
    app.cur_track = 0
    app.col = app.str_ = 0
    app.redraw()


def multitrack(app):
    """Add a couple of extra tracks to show the stacked view."""
    from tabit.model import make_track, set_cell
    from tabit.constants import BUILTIN_TUNINGS
    bass = make_track("Bass", 33, [28, 33, 38, 43])
    for col, (s, f) in enumerate([(0, 0), (3, 3), (1, 2), (2, 0)]):
        set_cell(bass, col * 2, s, {"f": f, "fx": None})
    drums = make_track("Drums", 0, [0, 0, 0])
    drums["isDrum"] = True
    for col in range(0, 16, 2):
        set_cell(drums, col, 0, {"f": 36, "fx": None})
    app.song["tracks"].append(bass)
    app.song["tracks"].append(drums)
    app.cur_track = 0
    app.redraw()


def selected(app):
    """Active selection + clipboard + undo so edit buttons enable."""
    app.opts["metronome"] = True
    app.sel_anchor = 2
    app.col = 6
    app.clipboard = [None]
    app.undo_stack.append("x")
    app.redraw()

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


def selected(app):
    """Active selection + clipboard + undo so edit buttons enable."""
    app.opts["metronome"] = True
    app.sel_anchor = 2
    app.col = 6
    app.clipboard = [None]
    app.undo_stack.append("x")
    app.redraw()

"""Headless screenshot harness for TabIt Py (dev tool).

Launches the tkinter app under the current X display, optionally runs a
small driver callback against the live App instance (to move the cursor,
open a dialog, type notes, etc.), captures the toplevel window to a PNG,
and exits. Intended for use under Xvfb so screenshots can be generated in
a headless environment.

Usage:
    DISPLAY=:99 python3.12 -m tools.shoot OUT.png [driver]

`driver` names a function in tools.drivers; with no driver the default
demo song is shown.
"""
import os
import sys
import tkinter as tk

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tabit.gui import App  # noqa: E402


def capture(widget, path):
    widget.update_idletasks()
    widget.update()
    x, y = widget.winfo_rootx(), widget.winfo_rooty()
    w, h = widget.winfo_width(), widget.winfo_height()
    os.system("import -window root -crop %dx%d+%d+%d +repage %s"
              % (w, h, x, y, path))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/tabit.png"
    driver = sys.argv[2] if len(sys.argv) > 2 else None
    root = tk.Tk()
    root.title("Untitled - TabIt")
    root.geometry("1000x640+0+0")
    app = App(root)

    def run():
        try:
            if driver:
                from tools import drivers
                getattr(drivers, driver)(app)
            root.update_idletasks()
            root.update()
            capture(root, out)
        finally:
            root.destroy()

    root.after(400, run)
    root.mainloop()
    print("wrote", out)


if __name__ == "__main__":
    main()

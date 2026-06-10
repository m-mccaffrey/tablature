/* TabIt Web — an unofficial tribute to TabIt 2.03 by GTAB Software.
   Instrument names, tuning presets, and UI wording recovered from a
   Ghidra analysis of the original WinTabIt executable. */
"use strict";

/* ================= constants ================= */

// GM instrument names exactly as the original binary stores them.
const GM_INSTRUMENTS = [
"Acoustic Grand Piano","Bright Acoustic Piano","Electric Grand Piano","Honky-tonk Piano",
"Rhodes Piano","Chorused Piano","Harpsichord","Clavinet Chromatic",
"Celesta","Glockenspiel","Music Box","Vibraphone","Marimba","Xylophone","Tubular Bells","Dulcimer",
"Hammond Organ","Percussive Organ","Rock Organ","Church Organ","Reed Organ","Accordion","Harmonica","Tango Accordion",
"Acoustic Guitar (nylon)","Acoustic Guitar (steel)","Electric Guitar (jazz)","Electric Guitar (clean)",
"Electric Guitar (muted)","Overdriven Guitar","Distortion Guitar","Guitar Harmonics",
"Acoustic Bass","Electric Bass (finger)","Electric Bass (pick)","Fretless Bass",
"Slap Bass 1","Slap Bass 2","Synth Bass 1","Synth Bass 2",
"Violin","Viola","Cello","Contrabass","Tremolo Strings","Pizzicato Strings","Orchestral Harp","Timpani",
"String Ensemble 1","String Ensemble 2","Synth Strings 1","Synth Strings 2",
"Choir","Voice","Synth Voice","Orchestra Hit",
"Trumpet","Trombone","Muted Trumpet","French Horn","Brass Section","Synth Brass 1","Synth Brass 2",
"Soprano Sax","Alto Sax","Tenor Sax","Baritone Sax","English Horn","Bassoon","Clarinet",
"Piccolo","Flute","Recorder","Pan Flute","Bottle Blow","Shakuhachi","Whistle","Ocarina",
"Lead 1 (square)","Lead 2 (sawtooth)","Lead 3 (caliope lead)","Lead 4 (chiff lead)",
"Lead 5 (charang)","Lead 6 (voice)","Lead 7 (fifths)","Lead 8 (brass + lead)",
"Pad 1 (new age)","Pad 2 (warm)","Pad 3 (polysynth)","Pad 4 (choir)",
"Pad 5 (bowed)","Pad 6 (metallic)","Pad 7 (halo)","Pad 8 (sweep)",
"FX 1 (rain)","FX 2 (soundtrack)","FX 3 (crystal)","FX 4 (atmosphere)",
"FX 5 (brightness)","FX 6 (goblins)","FX 7 (echoes)","FX 8 (sci-fi)",
"Sitar","Banjo","Shamisen","Kalimba","Bagpipe","Fiddle","Shanai",
"Tinkle Bell","Agogo","Steel Drums","Woodblock","Taiko Drum","Melodic Tom","Synth Drum","Reverse Cymbal",
"Guitar Fret Noise","Breath Noise","Seashore","Bird Tweet","Telephone","Helicopter","Applause","Gunshot"
];

const DRUM_KITS = ["Standard","Power","Electronic","TR-808","Brush","Orchestra"];

// Tuning presets recovered from the binary's preset tuning list.
// Pitches are MIDI note numbers, top (highest) display string first.
const TUNING_PRESETS = {
  "(Standard)":   [64,59,55,50,45,40],
  "Dropped D":    [64,59,55,50,45,38],
  "D Tuning":     [62,57,53,48,43,38],
  "C Tuning":     [60,55,51,46,41,36],
  "G Tuning":     [62,59,55,50,43,38],
  "Open A":       [64,61,57,52,45,40],
  "Open C":       [64,60,55,48,43,36],
  "Open D":       [62,57,54,50,45,38],
  "Open E":       [64,59,56,52,47,40],
  "Bass (Standard)": [43,38,33,28]
};

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

const EFFECTS = {
  "h": "Hammer-on", "p": "Pull-off", "/": "Slide Up", "\\": "Slide Down",
  "b": "Bend", "r": "Release", "~": "Vibrato", "t": "Tapping", "x": "Dead Note"
};

const MAX_FRET = 28;

/* ================= song model ================= */

function makeTrack(name, instrument, tuning) {
  return {
    name, instrument, isDrum: false, drumKit: 0,
    tuning: tuning.slice(), volume: 104, pan: 64,
    // spaces[col] is null or an array per string of null | {f: fret, fx: char|null}
    spaces: []
  };
}

function blankSong() {
  return {
    title: "Untitled", artist: "", comments: "",
    tempo: 120, spacesPerBar: 16,
    tracks: [makeTrack("Track 1", 27, TUNING_PRESETS["(Standard)"])]
  };
}

function demoSong() {
  const s = blankSong();
  s.title = "Demo";
  s.comments = "Demo song for TabIt Web.";
  s.tempo = 100;
  const g = s.tracks[0];
  g.name = "Guitar";
  g.instrument = 25; // Acoustic Guitar (steel)
  const b = makeTrack("Bass", 33, TUNING_PRESETS["Bass (Standard)"]); // Electric Bass (finger)
  b.volume = 96;
  s.tracks.push(b);

  const put = (tr, col, str, fret, fx) => {
    while (tr.spaces.length <= col) tr.spaces.push(null);
    if (!tr.spaces[col]) tr.spaces[col] = new Array(tr.tuning.length).fill(null);
    tr.spaces[col][str] = { f: fret, fx: fx || null };
  };
  // Em - C - G - D arpeggios, 16 spaces per bar
  const gp = [
    [0,5,0],[2,4,2],[4,3,2],[6,2,0],[8,1,0],[10,2,0],[12,3,2],[14,4,2],
    [16,4,3],[18,3,2],[20,2,0],[22,1,1],[24,0,0],[26,1,1],[28,2,0],[30,3,2],
    [32,5,3],[34,4,2],[36,3,0],[38,2,0],[40,1,0],[42,0,3],[44,1,0],[46,2,0],
    [48,3,0],[50,2,2],[52,1,3],[54,0,2],[56,1,3,"~"],[58,2,2],[60,1,3],[62,0,2,"~"]
  ];
  for (const [c, st, f, fx] of gp) put(g, c, st, f, fx);
  const bp = [
    [0,3,0],[4,3,0],[8,3,0],[12,3,0,"/"],
    [16,2,3],[20,2,3],[24,2,3],[28,2,3],
    [32,3,3],[36,3,3],[40,3,3],[44,3,3],
    [48,2,5],[52,2,5],[56,2,5],[60,2,5,"\\"]
  ];
  for (const [c, st, f, fx] of bp) put(b, c, st, f, fx);
  for (const tr of s.tracks) while (tr.spaces.length < 64) tr.spaces.push(null);
  return s;
}

/* ================= application state ================= */

let song = demoSong();
let fileName = null;          // null = Untitled
let curTrack = 0;
let cur = { col: 0, str: 0 }; // cursor
let selAnchor = null;         // selection anchor column, or null
let clipboard = null;
let undoStack = [], redoStack = [];
let pendingDigit = null, pendingTimer = null;
let caretOn = true;
let playing = false, playCol = -1, playStartCol = 0;
let opts = { caretBlink: true, barNumbers: true, followPlayback: true,
             rewindAfterStop: true, metronome: false, loop: false };

const track = () => song.tracks[curTrack];
const nStrings = () => track().tuning.length;
const songCols = () => Math.max(...song.tracks.map(t => t.spaces.length), song.spacesPerBar);
const nBars = () => Math.ceil(songCols() / song.spacesPerBar);

function ensureCols(tr, n) {
  while (tr.spaces.length < n) tr.spaces.push(null);
}

function getCell(tr, col, str) {
  const sp = tr.spaces[col];
  return sp ? sp[str] || null : null;
}

function setCell(tr, col, str, val) {
  ensureCols(tr, col + 1);
  if (!tr.spaces[col]) {
    if (val == null) return;
    tr.spaces[col] = new Array(tr.tuning.length).fill(null);
  }
  tr.spaces[col][str] = val;
  if (val == null && tr.spaces[col].every(c => c == null)) tr.spaces[col] = null;
}

/* ================= undo ================= */

function pushUndo() {
  undoStack.push(JSON.stringify({ song, curTrack }));
  if (undoStack.length > 64) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ song, curTrack }));
  restoreState(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ song, curTrack }));
  restoreState(redoStack.pop());
}

function restoreState(json) {
  const st = JSON.parse(json);
  song = st.song;
  curTrack = Math.min(st.curTrack, song.tracks.length - 1);
  clampCursor();
  fullRedraw();
}

/* ================= rendering ================= */

const pane = document.getElementById("editorpane");
const canvas = document.getElementById("tabcanvas");
const ctx2d = canvas.getContext("2d");

const CW = 13, CH = 16;          // character cell size
const LEFT_CHARS = 3;            // tuning label + "|"
const TOP_PAD = 8;
const FONT = "13px 'Courier New', monospace";
const FONT_SMALL = "10px 'Courier New', monospace";

const COL_BG = "#ffffff", COL_TEXT = "#000000", COL_LINE = "#000000",
      COL_BARNUM = "#808080", COL_CUR = "#000080", COL_CUR_TEXT = "#ffffff",
      COL_SEL = "#b0c4ff", COL_PLAY = "rgba(0,0,128,0.25)", COL_FX = "#000000";

let layout = { barsPerRow: 1, rowH: 0 };

function computeLayout() {
  const w = pane.clientWidth - 20;
  const usable = Math.floor(w / CW) - LEFT_CHARS - 1;
  layout.barsPerRow = Math.max(1, Math.floor(usable / (song.spacesPerBar + 1)));
  layout.rowH = (nStrings() + (opts.barNumbers ? 1 : 0) + 2) * CH;
}

// x of the bar-line cell that precedes bar `barInRow` of a row
const barlineX = barInRow => (LEFT_CHARS + barInRow * (song.spacesPerBar + 1)) * CW;

// top-left corner of the cell for (col, str)
function colToXY(col, str) {
  const spb = song.spacesPerBar;
  const bar = Math.floor(col / spb);
  const row = Math.floor(bar / layout.barsPerRow);
  const barInRow = bar % layout.barsPerRow;
  const x = barlineX(barInRow) + CW + (col % spb) * CW;
  const y = TOP_PAD + row * layout.rowH + (opts.barNumbers ? CH : 0) + str * CH;
  return { x, y, row };
}

function xyToCol(px, py) {
  const spb = song.spacesPerBar;
  const row = Math.max(0, Math.floor((py - TOP_PAD) / layout.rowH));
  let str = Math.floor((py - TOP_PAD - row * layout.rowH - (opts.barNumbers ? CH : 0)) / CH);
  str = Math.max(0, Math.min(nStrings() - 1, str));
  const cx = Math.floor(px / CW) - LEFT_CHARS;
  const barInRow = Math.max(0, Math.min(layout.barsPerRow - 1, Math.floor(cx / (spb + 1))));
  const inBar = Math.max(0, Math.min(spb - 1, cx - barInRow * (spb + 1) - 1));
  const col = (row * layout.barsPerRow + barInRow) * spb + inBar;
  return { col: Math.max(0, Math.min(col, songCols() - 1)), str };
}

function fullRedraw() {
  computeLayout();
  const rows = Math.ceil(nBars() / layout.barsPerRow);
  const wantW = pane.clientWidth - 4;
  const wantH = Math.max(pane.clientHeight - 4, TOP_PAD * 2 + rows * layout.rowH);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = wantW * dpr;
  canvas.height = wantH * dpr;
  canvas.style.width = wantW + "px";
  canvas.style.height = wantH + "px";
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
  updateStatus();
  updateTitle();
}

function drawCellText(cell, x, yTop, fg) {
  const cy = yTop + CH / 2;
  ctx2d.fillStyle = fg;
  const txt = cell.fx === "x" ? "x" : String(cell.f);
  ctx2d.font = txt.length > 1 ? FONT_SMALL : FONT;
  ctx2d.fillText(txt, x + CW / 2, cy);
  if (cell.fx && cell.fx !== "x") {
    ctx2d.font = FONT_SMALL;
    ctx2d.fillText(cell.fx, x + CW - 2, cy - 6);
  }
  ctx2d.font = FONT;
}

function draw() {
  const tr = track(), spb = song.spacesPerBar, ns = nStrings();
  const cols = songCols(), bars = nBars();
  ctx2d.fillStyle = COL_BG;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  ctx2d.font = FONT;
  ctx2d.textBaseline = "middle";
  ctx2d.textAlign = "center";
  ctx2d.lineWidth = 1;

  // selection
  const sel = selection();
  if (sel) {
    ctx2d.fillStyle = COL_SEL;
    for (let c = sel[0]; c <= sel[1]; c++) {
      const p = colToXY(c, 0);
      ctx2d.fillRect(p.x, p.y, CW, ns * CH);
    }
  }

  // playhead
  if (playing && playCol >= 0 && playCol < cols) {
    const pp = colToXY(playCol, 0);
    ctx2d.fillStyle = COL_PLAY;
    ctx2d.fillRect(pp.x, pp.y, CW, ns * CH);
  }

  for (let bar = 0; bar < bars; bar++) {
    const startCol = bar * spb;
    const barInRow = bar % layout.barsPerRow;
    const p0 = colToXY(startCol, 0); // top-left of first space cell
    const bx = barlineX(barInRow);   // bar-line cell to the left of it
    const lineTop = p0.y + CH / 2;   // center of string 0
    const lineBot = p0.y + (ns - 1) * CH + CH / 2;

    // bar number above the first space of the bar
    if (opts.barNumbers) {
      ctx2d.fillStyle = COL_BARNUM;
      ctx2d.textAlign = "left";
      ctx2d.fillText(String(bar + 1), p0.x, p0.y - CH / 2);
      ctx2d.textAlign = "center";
    }
    // horizontal string lines (covering the bar-line cell + all spaces)
    ctx2d.strokeStyle = COL_LINE;
    ctx2d.beginPath();
    for (let s = 0; s < ns; s++) {
      const y = Math.round(p0.y + s * CH + CH / 2) + 0.5;
      ctx2d.moveTo(bx, y);
      ctx2d.lineTo(bx + (spb + 1) * CW, y);
    }
    // vertical bar lines (start of bar; end too for the last bar in the row)
    ctx2d.moveTo(Math.round(bx + CW / 2) + 0.5, lineTop);
    ctx2d.lineTo(Math.round(bx + CW / 2) + 0.5, lineBot);
    if (barInRow === layout.barsPerRow - 1 || bar === bars - 1) {
      const ex = Math.round(bx + (spb + 1) * CW + CW / 2) + 0.5;
      ctx2d.moveTo(ex, lineTop);
      ctx2d.lineTo(ex, lineBot);
    }
    ctx2d.stroke();
    // tuning labels at the start of each staff row
    if (barInRow === 0) {
      ctx2d.fillStyle = COL_TEXT;
      ctx2d.textAlign = "right";
      for (let s = 0; s < ns; s++) {
        let label = NOTE_NAMES[tr.tuning[s] % 12];
        if (s === 0) label = label.toLowerCase();
        ctx2d.fillText(tr.isDrum ? "D" : label, bx - 3, p0.y + s * CH + CH / 2);
      }
      ctx2d.textAlign = "center";
    }
    // notes
    for (let c = startCol; c < Math.min(startCol + spb, cols); c++) {
      const sp = tr.spaces[c];
      if (!sp) continue;
      for (let s = 0; s < ns; s++) {
        const cell = sp[s];
        if (!cell) continue;
        const p = colToXY(c, s);
        const inSel = sel && c >= sel[0] && c <= sel[1];
        const onPlay = playing && c === playCol;
        // blank out the string line behind the number
        ctx2d.fillStyle = inSel ? COL_SEL : COL_BG;
        if (!onPlay) ctx2d.fillRect(p.x, p.y + 1, CW, CH - 2);
        drawCellText(cell, p.x, p.y, COL_TEXT);
      }
    }
  }

  // cursor
  if (!playing && (caretOn || !opts.caretBlink)) {
    const p = colToXY(cur.col, cur.str);
    ctx2d.fillStyle = COL_CUR;
    ctx2d.fillRect(p.x, p.y + 1, CW, CH - 2);
    const cell = getCell(track(), cur.col, cur.str);
    if (cell) drawCellText(cell, p.x, p.y, COL_CUR_TEXT);
    else {
      ctx2d.fillStyle = COL_CUR_TEXT;
      ctx2d.fillText("-", p.x + CW / 2, p.y + CH / 2);
    }
  }
}

function selection() {
  if (selAnchor == null || selAnchor === cur.col) return null;
  return [Math.min(selAnchor, cur.col), Math.max(selAnchor, cur.col)];
}

function ensureCursorVisible() {
  const p = colToXY(cur.col, cur.str);
  const top = p.y - CH * 2, bot = p.y + CH * 2;
  if (top < pane.scrollTop) pane.scrollTop = Math.max(0, top);
  else if (bot > pane.scrollTop + pane.clientHeight) pane.scrollTop = bot - pane.clientHeight;
}

/* ================= status / title ================= */

function updateStatus() {
  document.getElementById("st-track").textContent =
    " Track: " + (curTrack + 1) + " (" + track().name + ")";
  document.getElementById("st-bar").textContent =
    " Bar: " + (Math.floor(cur.col / song.spacesPerBar) + 1);
  const sel = selection();
  // selection wording matches the original binary
  document.getElementById("st-mode").textContent = playing ? "Playing..."
    : sel
    ? (sel[1] - sel[0] + 1) === 1 ? "1 space is selected."
      : (sel[1] - sel[0] + 1) + " spaces are selected."
    : "";
  document.getElementById("st-hint").textContent =
    "Type fret numbers; h p / \\ b r ~ t x for effects; F5 play, F6 from cursor, F8 stop";
}

function updateTitle() {
  const t = (fileName || song.title || "Untitled") + " - TabIt";
  document.getElementById("titletext").textContent = t;
  document.title = t;
}

/* ================= cursor / editing ================= */

function clampCursor() {
  cur.str = Math.max(0, Math.min(nStrings() - 1, cur.str));
  cur.col = Math.max(0, Math.min(songCols() - 1, cur.col));
}

function moveCursor(dc, ds, extend) {
  if (extend) { if (selAnchor == null) selAnchor = cur.col; }
  else selAnchor = null;
  cur.col += dc;
  cur.str += ds;
  if (cur.col >= songCols() && dc > 0) {
    // grow the song by a bar when stepping past the end, like the original
    pushUndo();
    ensureCols(track(), songCols() + song.spacesPerBar);
  }
  clampCursor();
  flushPendingDigit();
  ensureCursorVisible();
  fullRedraw();
}

function flushPendingDigit() {
  pendingDigit = null;
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
}

function typeDigit(d) {
  const tr = track();
  if (pendingDigit != null) {
    const v = pendingDigit * 10 + d;
    flushPendingDigit();
    if (v <= MAX_FRET) {
      const cell = getCell(tr, cur.col, cur.str);
      setCell(tr, cur.col, cur.str, { f: v, fx: cell ? cell.fx : null });
      fullRedraw();
      previewNote(tr, cur.col, cur.str);
      return;
    }
  }
  pushUndo();
  const cell = getCell(tr, cur.col, cur.str);
  setCell(tr, cur.col, cur.str, { f: d, fx: cell && cell.fx !== "x" ? cell.fx : null });
  if (d >= 1 && d <= 2) {
    pendingDigit = d;
    pendingTimer = setTimeout(() => { pendingDigit = null; }, 700);
  }
  fullRedraw();
  previewNote(tr, cur.col, cur.str);
}

function typeEffect(ch) {
  const tr = track();
  if (ch === "x") {
    pushUndo();
    const cell = getCell(tr, cur.col, cur.str);
    if (cell && cell.fx === "x") setCell(tr, cur.col, cur.str, null);
    else setCell(tr, cur.col, cur.str, { f: 0, fx: "x" });
    fullRedraw();
    return;
  }
  const cell = getCell(tr, cur.col, cur.str);
  if (!cell || cell.fx === "x") return;
  pushUndo();
  cell.fx = cell.fx === ch ? null : ch;
  fullRedraw();
}

function clearCell() {
  pushUndo();
  const sel = selection();
  const tr = track();
  if (sel) {
    for (let c = sel[0]; c <= sel[1] && c < tr.spaces.length; c++) tr.spaces[c] = null;
    selAnchor = null;
  } else {
    setCell(tr, cur.col, cur.str, null);
  }
  flushPendingDigit();
  fullRedraw();
}

function insertSpace() {
  pushUndo();
  const tr = track();
  ensureCols(tr, cur.col);
  tr.spaces.splice(cur.col, 0, null);
  fullRedraw();
}

function deleteSpace() {
  pushUndo();
  const tr = track();
  if (cur.col < tr.spaces.length) tr.spaces.splice(cur.col, 1);
  clampCursor();
  fullRedraw();
}

function selectAll() {
  selAnchor = 0;
  cur.col = songCols() - 1;
  fullRedraw();
}

function copySelection(cut) {
  const sel = selection() || [cur.col, cur.col];
  const tr = track();
  clipboard = {
    strings: tr.tuning.length,
    cols: []
  };
  for (let c = sel[0]; c <= sel[1]; c++) {
    const sp = tr.spaces[c];
    clipboard.cols.push(sp ? sp.map(cell => cell ? { ...cell } : null) : null);
  }
  if (cut) {
    pushUndo();
    for (let c = sel[0]; c <= sel[1] && c < tr.spaces.length; c++) tr.spaces[c] = null;
    selAnchor = null;
    fullRedraw();
  }
}

function pasteClipboard() {
  if (!clipboard) return;
  pushUndo();
  const tr = track();
  ensureCols(tr, cur.col + clipboard.cols.length);
  for (let i = 0; i < clipboard.cols.length; i++) {
    const src = clipboard.cols[i];
    if (!src) { tr.spaces[cur.col + i] = null; continue; }
    const dst = new Array(tr.tuning.length).fill(null);
    for (let s = 0; s < Math.min(src.length, dst.length); s++)
      dst[s] = src[s] ? { ...src[s] } : null;
    tr.spaces[cur.col + i] = dst.every(c => c == null) ? null : dst;
  }
  fullRedraw();
}

/* ================= keyboard ================= */

document.addEventListener("keydown", e => {
  if (!document.getElementById("dialoglayer").hidden) {
    if (e.key === "Escape") closeDialog(false);
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") closeDialog(true);
    return;
  }
  if (menuOpen != null && e.key === "Escape") { closeMenus(); return; }

  const k = e.key;
  if (k === "F5") { e.preventDefault(); playFrom(0); return; }
  if (k === "F6") { e.preventDefault(); playFrom(cur.col); return; }
  if (k === "F8") { e.preventDefault(); stopPlayback(); return; }
  if (k === " ") {
    e.preventDefault();
    if (playing) stopPlayback(); else playFrom(cur.col);
    return;
  }
  if (playing) return;

  if (e.ctrlKey || e.metaKey) {
    switch (k.toLowerCase()) {
      case "z": e.preventDefault(); e.shiftKey ? redo() : undo(); return;
      case "y": e.preventDefault(); redo(); return;
      case "c": e.preventDefault(); copySelection(false); return;
      case "x": e.preventDefault(); copySelection(true); return;
      case "v": e.preventDefault(); pasteClipboard(); return;
      case "a": e.preventDefault(); selectAll(); return;
      case "s": e.preventDefault(); saveSong(); return;
      case "o": e.preventDefault(); openSongDialog(); return;
      case "n": e.preventDefault(); newSong(); return;
      case "home": e.preventDefault(); cur.col = 0; selAnchor = null; ensureCursorVisible(); fullRedraw(); return;
      case "end": e.preventDefault(); cur.col = songCols() - 1; selAnchor = null; ensureCursorVisible(); fullRedraw(); return;
      case "arrowup": e.preventDefault(); switchTrack(-1); return;
      case "arrowdown": e.preventDefault(); switchTrack(1); return;
      case "delete": e.preventDefault(); deleteSpace(); return;
    }
    return;
  }

  switch (k) {
    case "ArrowLeft":  e.preventDefault(); moveCursor(-1, 0, e.shiftKey); return;
    case "ArrowRight": e.preventDefault(); moveCursor(1, 0, e.shiftKey); return;
    case "ArrowUp":    e.preventDefault(); moveCursor(0, -1, e.shiftKey); return;
    case "ArrowDown":  e.preventDefault(); moveCursor(0, 1, e.shiftKey); return;
    case "PageUp":     e.preventDefault(); moveCursor(-song.spacesPerBar, 0, e.shiftKey); return;
    case "PageDown":   e.preventDefault(); moveCursor(song.spacesPerBar, 0, e.shiftKey); return;
    case "Home": e.preventDefault();
      cur.col = Math.floor(cur.col / song.spacesPerBar) * song.spacesPerBar;
      selAnchor = e.shiftKey ? selAnchor : null; fullRedraw(); return;
    case "End": e.preventDefault();
      cur.col = Math.floor(cur.col / song.spacesPerBar) * song.spacesPerBar + song.spacesPerBar - 1;
      clampCursor(); selAnchor = e.shiftKey ? selAnchor : null; fullRedraw(); return;
    case "Delete": e.preventDefault(); clearCell(); return;
    case "Backspace": e.preventDefault(); clearCell(); moveCursor(-1, 0, false); return;
    case "Insert": e.preventDefault(); insertSpace(); return;
    case "-": e.preventDefault(); clearCell(); return;
  }

  if (/^[0-9]$/.test(k)) { e.preventDefault(); typeDigit(Number(k)); return; }
  if (EFFECTS[k.toLowerCase()] || k === "/" || k === "\\" || k === "~") {
    e.preventDefault();
    typeEffect(k === k.toUpperCase() && EFFECTS[k.toLowerCase()] ? k.toLowerCase() : k);
    return;
  }
});

function switchTrack(d) {
  curTrack = (curTrack + d + song.tracks.length) % song.tracks.length;
  clampCursor();
  selAnchor = null;
  fullRedraw();
}

/* ================= mouse ================= */

let dragging = false;
canvas.addEventListener("mousedown", e => {
  if (playing) return;
  const r = canvas.getBoundingClientRect();
  const hit = xyToCol(e.clientX - r.left, e.clientY - r.top);
  cur.col = hit.col; cur.str = hit.str;
  selAnchor = e.shiftKey ? (selAnchor ?? cur.col) : null;
  dragging = true;
  if (!e.shiftKey) selAnchor = cur.col;
  flushPendingDigit();
  fullRedraw();
});
canvas.addEventListener("mousemove", e => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  const hit = xyToCol(e.clientX - r.left, e.clientY - r.top);
  cur.col = hit.col; cur.str = hit.str;
  fullRedraw();
});
window.addEventListener("mouseup", () => {
  if (dragging && selAnchor === cur.col) selAnchor = null;
  dragging = false;
  fullRedraw();
});
canvas.addEventListener("dblclick", e => {
  const r = canvas.getBoundingClientRect();
  const hit = xyToCol(e.clientX - r.left, e.clientY - r.top);
  const spb = song.spacesPerBar;
  selAnchor = Math.floor(hit.col / spb) * spb;
  cur.col = Math.min(selAnchor + spb - 1, songCols() - 1);
  fullRedraw();
});

/* ================= menus ================= */

let menuOpen = null;

const MENUS = [
  ["File", () => [
    ["New", "Ctrl+N", newSong],
    ["Open...", "Ctrl+O", openSongDialog],
    ["Save", "Ctrl+S", saveSong],
    ["Save As...", "", saveSongAs],
    null,
    ["Export Text...", "", exportText],
    ["Export MIDI...", "", exportMidi],
    null,
    ["Song Properties...", "", songPropertiesDialog],
    null,
    ["Exit", "", () => msgBox("TabIt", "This is a web page — just close the tab!")]
  ]],
  ["Edit", () => [
    ["Undo", "Ctrl+Z", undo, !undoStack.length],
    ["Redo", "Ctrl+Y", redo, !redoStack.length],
    null,
    ["Cut", "Ctrl+X", () => copySelection(true)],
    ["Copy", "Ctrl+C", () => copySelection(false)],
    ["Paste", "Ctrl+V", pasteClipboard, !clipboard],
    ["Clear", "Del", clearCell],
    null,
    ["Select All", "Ctrl+A", selectAll],
    null,
    ["Insert Space", "Ins", insertSpace],
    ["Delete Space", "Ctrl+Del", deleteSpace]
  ]],
  ["Track", () => [
    ["Add Track", "", addTrack],
    ["Delete Track", "", deleteTrack, song.tracks.length <= 1],
    null,
    ...song.tracks.map((t, i) =>
      [(i + 1) + ": " + t.name, "", () => { curTrack = i; clampCursor(); fullRedraw(); },
       false, i === curTrack]),
    null,
    ["Previous Track", "Ctrl+Up", () => switchTrack(-1)],
    ["Next Track", "Ctrl+Down", () => switchTrack(1)],
    null,
    ["Properties...", "", trackPropertiesDialog]
  ]],
  ["Bar", () => [
    ["Add Bars...", "", addBarsDialog],
    ["Insert Bar", "", insertBar],
    ["Delete Bar", "", deleteBar],
    null,
    ["Go to Bar...", "", goToBarDialog]
  ]],
  ["Effects", () => [
    ...Object.entries(EFFECTS).map(([ch, name]) => {
      const cell = getCell(track(), cur.col, cur.str);
      return [name, ch, () => typeEffect(ch), false,
              !!(cell && cell.fx === ch)];
    }),
    null,
    ["Clear Track Effects", "", clearTrackEffects]
  ]],
  ["Player", () => [
    ["Play from Start", "F5", () => playFrom(0)],
    ["Play from Cursor", "F6", () => playFrom(cur.col)],
    ["Stop", "F8", stopPlayback, !playing],
    null,
    ["Loop", "", () => { opts.loop = !opts.loop; }, false, opts.loop],
    ["Metronome", "", () => { opts.metronome = !opts.metronome; }, false, opts.metronome],
    null,
    ["Tempo...", "", tempoDialog]
  ]],
  ["Options", () => [
    ["Bar Numbers", "", () => { opts.barNumbers = !opts.barNumbers; fullRedraw(); }, false, opts.barNumbers],
    ["Cursor Blink", "", () => { opts.caretBlink = !opts.caretBlink; fullRedraw(); }, false, opts.caretBlink],
    ["Follow Playback", "", () => { opts.followPlayback = !opts.followPlayback; }, false, opts.followPlayback],
    ["Rewind After Stop", "", () => { opts.rewindAfterStop = !opts.rewindAfterStop; }, false, opts.rewindAfterStop]
  ]],
  ["Help", () => [
    ["Keyboard Shortcuts...", "", shortcutsDialog],
    null,
    ["About TabIt...", "", aboutDialog]
  ]]
];

function buildMenuBar() {
  const bar = document.getElementById("menubar");
  bar.innerHTML = "";
  MENUS.forEach(([name], idx) => {
    const el = document.createElement("span");
    el.className = "menutitle armed";
    el.innerHTML = "<u>" + name[0] + "</u>" + name.slice(1);
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      menuOpen === idx ? closeMenus() : openMenu(idx);
    });
    el.addEventListener("mouseenter", () => { if (menuOpen != null && menuOpen !== idx) openMenu(idx); });
    bar.appendChild(el);
  });
}

function openMenu(idx) {
  closeMenus();
  menuOpen = idx;
  const bar = document.getElementById("menubar");
  const titleEl = bar.children[idx];
  titleEl.classList.add("open");
  const popup = document.createElement("div");
  popup.className = "menupopup";
  popup.style.left = titleEl.offsetLeft + "px";
  popup.style.top = "18px";
  for (const item of MENUS[idx][1]()) {
    if (!item) {
      const sep = document.createElement("div");
      sep.className = "menusep";
      popup.appendChild(sep);
      continue;
    }
    const [label, shortcut, fn, disabled, checked] = item;
    const el = document.createElement("div");
    el.className = "menuitem" + (disabled ? " disabled" : "") + (checked ? " checked" : "");
    el.innerHTML = "<span>" + label + "</span>" +
      (shortcut ? "<span class='shortcut'>" + shortcut + "</span>" : "");
    if (!disabled) el.addEventListener("mousedown", e => {
      e.preventDefault(); e.stopPropagation();
      closeMenus();
      fn();
    });
    popup.appendChild(el);
  }
  bar.appendChild(popup);
}

function closeMenus() {
  menuOpen = null;
  document.querySelectorAll(".menupopup").forEach(el => el.remove());
  document.querySelectorAll(".menutitle.open").forEach(el => el.classList.remove("open"));
}

document.addEventListener("mousedown", e => {
  if (menuOpen != null && !e.target.closest("#menubar")) closeMenus();
});

/* ================= dialogs ================= */

let dialogResolve = null;

function showDialog(title, bodyHTML, buttons) {
  const layer = document.getElementById("dialoglayer");
  layer.innerHTML =
    "<div class='dialog'><div class='dlgtitle'><span>" + title +
    "</span><span class='dlgclose'>✕</span></div>" +
    "<div class='dlgbody'>" + bodyHTML + "</div>" +
    "<div class='dlgbuttons'>" +
    buttons.map((b, i) => "<button data-i='" + i + "'>" + b + "</button>").join("") +
    "</div></div>";
  layer.hidden = false;
  layer.querySelector(".dlgclose").addEventListener("click", () => closeDialog(false));
  layer.querySelectorAll(".dlgbuttons button").forEach(btn =>
    btn.addEventListener("click", () => closeDialog(btn.dataset.i === "0")));
  const first = layer.querySelector("input,select,button");
  if (first) first.focus();
  return new Promise(res => { dialogResolve = res; });
}

function closeDialog(ok) {
  const layer = document.getElementById("dialoglayer");
  const values = {};
  layer.querySelectorAll("[id]").forEach(el => {
    if (el.tagName === "INPUT" || el.tagName === "SELECT")
      values[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  layer.hidden = true;
  layer.innerHTML = "";
  if (dialogResolve) { dialogResolve(ok ? values : null); dialogResolve = null; }
}

function msgBox(title, text) {
  return showDialog(title, "<div style='padding:4px 0'>" +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") +
    "</div>", ["OK"]);
}

async function tempoDialog() {
  const v = await showDialog("Tempo",
    "<label>Tempo (BPM):</label><input type='number' id='d-tempo' min='10' max='999' value='" +
    song.tempo + "'>", ["OK", "Cancel"]);
  if (!v) return;
  const t = Number(v["d-tempo"]);
  if (!(t >= 10 && t <= 999)) { msgBox("TabIt", "Tempo must be between 10 and 999."); return; }
  pushUndo();
  song.tempo = t;
}

async function addBarsDialog() {
  const v = await showDialog("Add Bars",
    "<label>Number of bars to add:</label><input type='number' id='d-bars' min='1' max='500' value='4'>",
    ["OK", "Cancel"]);
  if (!v) return;
  const n = Math.max(1, Math.min(500, Number(v["d-bars"]) || 0));
  pushUndo();
  for (const tr of song.tracks) ensureCols(tr, songCols() + n * song.spacesPerBar);
  fullRedraw();
}

function insertBar() {
  pushUndo();
  const at = Math.floor(cur.col / song.spacesPerBar) * song.spacesPerBar;
  for (const tr of song.tracks) {
    ensureCols(tr, at);
    tr.spaces.splice(at, 0, ...new Array(song.spacesPerBar).fill(null));
  }
  fullRedraw();
}

function deleteBar() {
  pushUndo();
  const at = Math.floor(cur.col / song.spacesPerBar) * song.spacesPerBar;
  for (const tr of song.tracks) {
    if (at < tr.spaces.length) tr.spaces.splice(at, song.spacesPerBar);
  }
  clampCursor();
  fullRedraw();
}

async function goToBarDialog() {
  const v = await showDialog("Go to Bar",
    "<label>Bar number:</label><input type='number' id='d-bar' min='1' value='" +
    (Math.floor(cur.col / song.spacesPerBar) + 1) + "'>", ["OK", "Cancel"]);
  if (!v) return;
  const b = Number(v["d-bar"]);
  if (!(b >= 1)) { msgBox("TabIt", "Bar number must be at least 1."); return; }
  cur.col = Math.min((b - 1) * song.spacesPerBar, songCols() - 1);
  selAnchor = null;
  ensureCursorVisible();
  fullRedraw();
}

async function songPropertiesDialog() {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const v = await showDialog("Song Properties",
    "<label>Title:</label><input type='text' id='d-title' value=\"" + esc(song.title) + "\" style='width:100%'>" +
    "<label>Artist:</label><input type='text' id='d-artist' value=\"" + esc(song.artist) + "\" style='width:100%'>" +
    "<label>Comments:</label><input type='text' id='d-comments' value=\"" + esc(song.comments) + "\" style='width:100%'>",
    ["OK", "Cancel"]);
  if (!v) return;
  pushUndo();
  song.title = v["d-title"];
  song.artist = v["d-artist"];
  song.comments = v["d-comments"];
  updateTitle();
}

async function trackPropertiesDialog() {
  const tr = track();
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const instOpts =
    GM_INSTRUMENTS.map((n, i) =>
      "<option value='" + i + "'" + (!tr.isDrum && tr.instrument === i ? " selected" : "") + ">" +
      (i + 1) + " - " + n + "</option>").join("") +
    DRUM_KITS.map((n, i) =>
      "<option value='d" + i + "'" + (tr.isDrum && tr.drumKit === i ? " selected" : "") + ">" +
      "Drums - " + n + "</option>").join("");
  const tunOpts = "<option value=''>-- preset --</option>" +
    Object.keys(TUNING_PRESETS).map(n => "<option>" + n + "</option>").join("");
  const stringRows = tr.tuning.map((m, s) =>
    "<div class='dlgrow'><span style='width:60px'>String " + (s + 1) + ":</span>" +
    "<select id='d-str" + s + "'>" +
    Array.from({ length: 60 }, (_, i) => i + 23).map(mm =>
      "<option value='" + mm + "'" + (mm === m ? " selected" : "") + ">" + noteName(mm) + "</option>").join("") +
    "</select></div>").join("");
  const dlg = showDialog("Track " + (curTrack + 1) + " Properties",
    "<label>Name:</label><input type='text' id='d-name' value=\"" + esc(tr.name) + "\" style='width:100%'>" +
    "<label>Instrument:</label><select id='d-inst' style='width:100%'>" + instOpts + "</select>" +
    "<label>Tuning preset:</label><select id='d-preset' style='width:100%'>" + tunOpts + "</select>" +
    stringRows +
    "<div class='dlgrow'><span style='width:60px'>Volume:</span>" +
    "<input type='range' id='d-vol' min='0' max='127' value='" + tr.volume + "'></div>" +
    "<div class='dlgrow'><span style='width:60px'>Pan:</span>" +
    "<input type='range' id='d-pan' min='0' max='127' value='" + tr.pan + "'></div>",
    ["OK", "Cancel"]);
  // picking a preset fills the string selects; editing a string clears the preset
  const presetSel = document.getElementById("d-preset");
  presetSel.addEventListener("change", () => {
    const p = TUNING_PRESETS[presetSel.value];
    if (!p) return;
    for (let s = 0; s < tr.tuning.length; s++) {
      const el = document.getElementById("d-str" + s);
      if (el && p[s] != null) el.value = p[s];
    }
  });
  tr.tuning.forEach((_, s) => {
    const el = document.getElementById("d-str" + s);
    if (el) el.addEventListener("change", () => { presetSel.value = ""; });
  });
  const v = await dlg;
  if (!v) return;
  pushUndo();
  tr.name = v["d-name"] || ("Track " + (curTrack + 1));
  const inst = v["d-inst"];
  if (String(inst).startsWith("d")) { tr.isDrum = true; tr.drumKit = Number(String(inst).slice(1)); }
  else { tr.isDrum = false; tr.instrument = Number(inst); }
  if (v["d-preset"] && TUNING_PRESETS[v["d-preset"]]) {
    const p = TUNING_PRESETS[v["d-preset"]];
    retuneTrack(tr, p);
  } else {
    for (let s = 0; s < tr.tuning.length; s++)
      if (v["d-str" + s] != null) tr.tuning[s] = Number(v["d-str" + s]);
  }
  tr.volume = Number(v["d-vol"]);
  tr.pan = Number(v["d-pan"]);
  clampCursor();
  fullRedraw();
}

function retuneTrack(tr, tuning) {
  const oldN = tr.tuning.length, newN = tuning.length;
  tr.tuning = tuning.slice();
  if (newN !== oldN) {
    for (let c = 0; c < tr.spaces.length; c++) {
      const sp = tr.spaces[c];
      if (!sp) continue;
      const ns = new Array(newN).fill(null);
      for (let s = 0; s < Math.min(oldN, newN); s++) ns[s] = sp[s];
      tr.spaces[c] = ns.every(x => x == null) ? null : ns;
    }
  }
}

async function addTrack() {
  pushUndo();
  const t = makeTrack("Track " + (song.tracks.length + 1), 27, TUNING_PRESETS["(Standard)"]);
  ensureCols(t, songCols());
  song.tracks.push(t);
  curTrack = song.tracks.length - 1;
  clampCursor();
  fullRedraw();
  trackPropertiesDialog();
}

async function deleteTrack() {
  if (song.tracks.length <= 1) {
    msgBox("TabIt", "A song must contain at least one track.");
    return;
  }
  const v = await showDialog("Delete Track",
    "Delete track " + (curTrack + 1) + " (" + track().name + ")?", ["OK", "Cancel"]);
  if (!v) return;
  pushUndo();
  song.tracks.splice(curTrack, 1);
  curTrack = Math.max(0, curTrack - 1);
  clampCursor();
  fullRedraw();
}

function clearTrackEffects() {
  pushUndo();
  for (const sp of track().spaces) {
    if (!sp) continue;
    for (const cell of sp) if (cell && cell.fx && cell.fx !== "x") cell.fx = null;
  }
  fullRedraw();
}

function shortcutsDialog() {
  msgBox("Keyboard Shortcuts",
    "Arrows\tMove cursor\n" +
    "0-9\tEnter fret number (1x/2x combine for 10-28)\n" +
    "Del / -\tClear note or selection\n" +
    "Backspace\tClear and move left\n" +
    "Ins\tInsert space   Ctrl+Del: delete space\n" +
    "h p / \\ b r ~ t\tNote effects\n" +
    "x\tDead note\n" +
    "Shift+Arrows\tSelect spaces\n" +
    "Ctrl+C/X/V\tCopy / Cut / Paste\n" +
    "Ctrl+Up/Down\tPrevious / next track\n" +
    "PgUp/PgDn\tPrevious / next bar\n" +
    "Home/End\tStart / end of bar\n" +
    "F5\tPlay from start\n" +
    "F6 / Space\tPlay from cursor\n" +
    "F8 / Space\tStop");
}

function aboutDialog() {
  msgBox("About TabIt",
    "TabIt Web — a tribute to TabIt version 2.03\n\n" +
    "Original TabIt © GTAB Software (defunct).\n" +
    "This is an unofficial fan recreation of the look and feel\n" +
    "of the classic Windows tablature editor, rebuilt for the\n" +
    "browser from a Ghidra analysis of the original program.\n\n" +
    "Not affiliated with or endorsed by the original authors.");
}

/* ================= file operations ================= */

function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function newSong() {
  const v = await showDialog("TabIt", "Discard the current song and start a new one?", ["OK", "Cancel"]);
  if (!v) return;
  song = blankSong();
  ensureCols(song.tracks[0], song.spacesPerBar * 4);
  fileName = null;
  curTrack = 0; cur = { col: 0, str: 0 }; selAnchor = null;
  undoStack.length = 0; redoStack.length = 0;
  fullRedraw();
}

function saveSong() {
  const name = (fileName || song.title || "Untitled") + ".tabit.json";
  download(name.replace(/\.tabit\.json(\.tabit\.json)?$/, "") + ".tabit.json",
    JSON.stringify({ format: "tabit-web-1", song }, null, 1), "application/json");
}

function saveSongAs() { saveSong(); }

function openSongDialog() {
  document.getElementById("fileinput").click();
}

document.getElementById("fileinput").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.format !== "tabit-web-1" || !data.song || !Array.isArray(data.song.tracks))
      throw new Error("incompatible version");
    song = data.song;
    fileName = f.name.replace(/\.tabit\.json$|\.json$/, "");
    curTrack = 0; cur = { col: 0, str: 0 }; selAnchor = null;
    undoStack.length = 0; redoStack.length = 0;
    fullRedraw();
  } catch (err) {
    msgBox("TabIt", "File \"" + f.name + "\" could not be opened:\n" + err.message);
  }
});

/* ---- text export (classic ASCII tab, variable column width) ---- */

function exportText() {
  const spb = song.spacesPerBar;
  const lines = [];
  lines.push(song.title + (song.artist ? " - " + song.artist : ""));
  lines.push("Tempo: " + song.tempo);
  lines.push("");
  for (const tr of song.tracks) {
    lines.push(tr.name + " (" + (tr.isDrum ? "Drums - " + DRUM_KITS[tr.drumKit] : GM_INSTRUMENTS[tr.instrument]) + ")");
    const ns = tr.tuning.length;
    const cols = Math.max(tr.spaces.length, spb);
    const bars = Math.ceil(cols / spb);
    const barsPerLine = 4;
    for (let lineStart = 0; lineStart < bars; lineStart += barsPerLine) {
      const rows = [];
      for (let s = 0; s < ns; s++) {
        let label = NOTE_NAMES[tr.tuning[s] % 12];
        if (s === 0) label = label.toLowerCase();
        rows.push((tr.isDrum ? "D" : label).padEnd(2) + "|");
      }
      for (let bar = lineStart; bar < Math.min(lineStart + barsPerLine, bars); bar++) {
        for (let c = bar * spb; c < (bar + 1) * spb; c++) {
          const sp = c < tr.spaces.length ? tr.spaces[c] : null;
          let w = 1;
          if (sp) for (const cell of sp) {
            if (!cell) continue;
            const t = (cell.fx === "x" ? "x" : String(cell.f)) + (cell.fx && cell.fx !== "x" ? cell.fx : "");
            w = Math.max(w, t.length);
          }
          for (let s = 0; s < ns; s++) {
            const cell = sp ? sp[s] : null;
            const t = cell ? (cell.fx === "x" ? "x" : String(cell.f)) + (cell.fx && cell.fx !== "x" ? cell.fx : "") : "";
            rows[s] += t.padEnd(w, "-");
          }
        }
        for (let s = 0; s < ns; s++) rows[s] += "|";
      }
      lines.push(...rows, "");
    }
    lines.push("");
  }
  lines.push("Generated by TabIt Web (tribute to TabIt 2.03)");
  download((song.title || "Untitled") + ".txt", lines.join("\r\n"), "text/plain");
}

/* ---- MIDI export ---- */

function exportMidi() {
  const TPQN = 480, TICKS_PER_SPACE = TPQN / 4; // each space is a 16th note
  const vlq = n => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const str2bytes = s => Array.from(s, c => c.charCodeAt(0) & 0xff);
  const trackChunk = events => {
    // events: [tick, [bytes...]]
    events.sort((a, b) => a[0] - b[0]);
    const data = [];
    let last = 0;
    for (const [tick, bytes] of events) {
      data.push(...vlq(tick - last), ...bytes);
      last = tick;
    }
    data.push(...vlq(0), 0xff, 0x2f, 0x00);
    return [0x4d, 0x54, 0x72, 0x6b,
      (data.length >>> 24) & 255, (data.length >>> 16) & 255,
      (data.length >>> 8) & 255, data.length & 255, ...data];
  };

  const chunks = [];
  // tempo track
  const usPerQuarter = Math.round(60000000 / song.tempo);
  chunks.push(trackChunk([
    [0, [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255]],
    [0, [0xff, 0x03, Math.min(127, song.title.length), ...str2bytes(song.title)]]
  ]));

  let chan = 0;
  for (const tr of song.tracks) {
    let ch = tr.isDrum ? 9 : chan;
    if (!tr.isDrum) { chan++; if (chan === 9) chan++; chan %= 16; }
    const ev = [];
    ev.push([0, [0xff, 0x03, Math.min(127, tr.name.length), ...str2bytes(tr.name)]]);
    if (!tr.isDrum) ev.push([0, [0xc0 | ch, tr.instrument & 127]]);
    ev.push([0, [0xb0 | ch, 7, tr.volume & 127]]);
    ev.push([0, [0xb0 | ch, 10, tr.pan & 127]]);
    const ns = tr.tuning.length;
    for (let s = 0; s < ns; s++) {
      for (let c = 0; c < tr.spaces.length; c++) {
        const cell = getCell(tr, c, s);
        if (!cell || cell.fx === "x") continue;
        const pitch = Math.min(127, tr.tuning[s] + cell.f);
        // sustain until the next note on the same string, max 2 bars
        let end = Math.min(c + song.spacesPerBar * 2, tr.spaces.length);
        for (let c2 = c + 1; c2 < end; c2++) {
          if (getCell(tr, c2, s)) { end = c2; break; }
        }
        ev.push([c * TICKS_PER_SPACE, [0x90 | ch, pitch, 96]]);
        ev.push([end * TICKS_PER_SPACE, [0x80 | ch, pitch, 0]]);
      }
    }
    chunks.push(trackChunk(ev));
  }

  const nTracks = chunks.length;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
    (nTracks >> 8) & 255, nTracks & 255, (TPQN >> 8) & 255, TPQN & 255];
  const bytes = new Uint8Array([...header, ...chunks.flat()]);
  download((song.title || "Untitled") + ".mid", new Blob([bytes], { type: "audio/midi" }));
}

/* ================= playback (Web Audio) ================= */

let audio = null, masterGain = null;
let schedTimer = null, playT0 = 0, playEndCol = 0, animReq = null;

function audioCtx() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audio.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audio.destination);
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// Karplus-Strong plucked string
function ksBuffer(ac, freq, dur, damp, drive) {
  const sr = ac.sampleRate;
  const n = Math.max(8, Math.floor(sr * dur));
  const buf = ac.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 0; i < n; i++) {
    const j = i % period;
    const next = ring[(j + 1) % period];
    const out = damp * 0.5 * (ring[j] + next);
    data[i] = ring[j];
    ring[j] = out;
  }
  if (drive) {
    for (let i = 0; i < n; i++) data[i] = Math.tanh(data[i] * drive) / Math.tanh(drive);
  }
  // short release fade
  const fade = Math.min(n, Math.floor(sr * 0.02));
  for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / fade;
  return buf;
}

function drumBuffer(ac, note) {
  const sr = ac.sampleRate;
  let dur = 0.2, gen;
  if (note === 35 || note === 36) { // kicks
    dur = 0.18;
    gen = t => Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 16);
  } else if (note === 38 || note === 40) { // snares
    dur = 0.22;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.8 +
               Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.5;
  } else if (note === 42 || note === 44) { // closed/pedal hat
    dur = 0.06;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 60);
  } else if (note === 46) { // open hat
    dur = 0.35;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 8);
  } else if (note === 49 || note === 57 || note === 55 || note === 52) { // crashes
    dur = 1.0;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 3);
  } else if (note === 51 || note === 59 || note === 53) { // rides
    dur = 0.5;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 7) * 0.6 +
               Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 9) * 0.3;
  } else if (note >= 41 && note <= 50) { // toms
    dur = 0.25;
    const f0 = 80 + (note - 41) * 18;
    gen = t => Math.sin(2 * Math.PI * (f0 + 60 * Math.exp(-t * 25)) * t) * Math.exp(-t * 12);
  } else {
    dur = 0.15;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.7;
  }
  const n = Math.floor(sr * dur);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = gen(i / sr);
  return buf;
}

const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

function instrumentTimbre(prog) {
  // crude timbre families for the synth
  if (prog >= 29 && prog <= 30) return { damp: 0.999, drive: 6 };   // overdrive/distortion
  if (prog >= 32 && prog <= 39) return { damp: 0.997, drive: 0 };   // basses
  if (prog >= 40 && prog <= 54) return { damp: 0.9993, drive: 0 };  // strings/voices
  if (prog >= 88 && prog <= 95) return { damp: 0.9995, drive: 0 };  // pads
  return { damp: 0.996, drive: 0 };                                  // guitars, default
}

function scheduleNote(ac, tr, dest, when, cell, str, sustainSpaces, spaceDur) {
  const vol = (tr.volume / 127) * 0.8;
  if (cell.fx === "x") {
    // dead note: short damped pluck
    const buf = tr.isDrum ? drumBuffer(ac, 37)
      : ksBuffer(ac, midiFreq(tr.tuning[str] + cell.f), 0.09, 0.92, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol * 0.7;
    src.connect(g).connect(dest);
    src.start(when);
    return;
  }
  if (tr.isDrum) {
    const src = ac.createBufferSource();
    src.buffer = drumBuffer(ac, Math.min(81, Math.max(35, tr.tuning[str] + cell.f)));
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g).connect(dest);
    src.start(when);
    return;
  }
  const pitch = tr.tuning[str] + cell.f;
  const dur = Math.min(sustainSpaces * spaceDur + 0.25, 3.0);
  const timbre = instrumentTimbre(tr.instrument);
  const src = ac.createBufferSource();
  src.buffer = ksBuffer(ac, midiFreq(pitch), dur, timbre.damp, timbre.drive);
  const g = ac.createGain();
  g.gain.value = vol * (cell.fx === "h" || cell.fx === "p" ? 0.65 : 1);
  src.connect(g).connect(dest);
  const st = 2 ** (2 / 12); // two-semitone interval for slides/bends
  switch (cell.fx) {
    case "/": src.playbackRate.setValueAtTime(1 / st, when);
              src.playbackRate.exponentialRampToValueAtTime(1, when + Math.min(0.12, dur / 2)); break;
    case "\\": src.playbackRate.setValueAtTime(1, when);
               src.playbackRate.exponentialRampToValueAtTime(1 / st, when + dur * 0.8); break;
    case "b": src.playbackRate.setValueAtTime(1, when);
              src.playbackRate.exponentialRampToValueAtTime(st, when + Math.min(0.18, dur / 2)); break;
    case "r": src.playbackRate.setValueAtTime(st, when);
              src.playbackRate.exponentialRampToValueAtTime(1, when + Math.min(0.18, dur / 2)); break;
    case "~": {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ac.createGain();
      lg.gain.value = 0.035;
      lfo.connect(lg).connect(src.playbackRate);
      lfo.start(when + 0.1);
      lfo.stop(when + dur);
      break;
    }
  }
  src.start(when);
}

function previewNote(tr, col, str) {
  if (playing) return;
  try {
    const ac = audioCtx();
    const cell = getCell(tr, col, str);
    if (!cell) return;
    const pan = makePanNode(ac, tr.pan);
    pan.connect(masterGain);
    scheduleNote(ac, tr, pan, ac.currentTime, cell, str, 4, 60 / song.tempo / 4);
    setTimeout(() => pan.disconnect(), 4000);
  } catch (e) { /* audio unavailable */ }
}

function makePanNode(ac, pan127) {
  if (ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = (pan127 - 64) / 64;
    return p;
  }
  return ac.createGain();
}

function playFrom(col) {
  stopPlayback(true);
  const ac = audioCtx();
  const spaceDur = 60 / song.tempo / 4;
  const startCol = Math.min(col, songCols() - 1);
  playStartCol = cur.col;
  playEndCol = songCols();
  const t0 = ac.currentTime + 0.08;
  playT0 = t0 - startCol * spaceDur;

  for (const tr of song.tracks) {
    const pan = makePanNode(ac, tr.pan);
    pan.connect(masterGain);
    const ns = tr.tuning.length;
    for (let s = 0; s < ns; s++) {
      for (let c = startCol; c < tr.spaces.length; c++) {
        const cell = getCell(tr, c, s);
        if (!cell) continue;
        let end = Math.min(c + song.spacesPerBar * 2, playEndCol);
        for (let c2 = c + 1; c2 < end; c2++) if (getCell(tr, c2, s)) { end = c2; break; }
        scheduleNote(ac, tr, pan, playT0 + c * spaceDur, cell, s, end - c, spaceDur);
      }
    }
  }
  if (opts.metronome) {
    const spb = song.spacesPerBar;
    for (let c = startCol - (startCol % 4); c < playEndCol; c += 4) {
      if (c < startCol) continue;
      const osc = ac.createOscillator();
      osc.frequency.value = c % spb === 0 ? 1700 : 1200;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.12, playT0 + c * spaceDur);
      g.gain.exponentialRampToValueAtTime(0.0001, playT0 + c * spaceDur + 0.04);
      osc.connect(g).connect(masterGain);
      osc.start(playT0 + c * spaceDur);
      osc.stop(playT0 + c * spaceDur + 0.05);
    }
  }

  playing = true;
  playCol = startCol;
  updateStatus();
  const tick = () => {
    if (!playing) return;
    const col = Math.floor((ac.currentTime - playT0) / spaceDur);
    if (col >= playEndCol) {
      if (opts.loop) { playFrom(startCol); return; }
      stopPlayback();
      return;
    }
    if (col !== playCol && col >= 0) {
      playCol = col;
      if (opts.followPlayback) {
        const p = colToXY(Math.max(0, playCol), 0);
        if (p.y < pane.scrollTop || p.y + CH * nStrings() > pane.scrollTop + pane.clientHeight)
          pane.scrollTop = Math.max(0, p.y - CH * 2);
      }
      draw();
    }
    animReq = requestAnimationFrame(tick);
  };
  animReq = requestAnimationFrame(tick);
}

function stopPlayback(silent) {
  if (animReq) { cancelAnimationFrame(animReq); animReq = null; }
  const wasPlaying = playing;
  playing = false;
  playCol = -1;
  if (audio) {
    // kill scheduled sound by rebuilding the master gain chain
    masterGain.disconnect();
    masterGain = audio.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audio.destination);
  }
  if (wasPlaying && !silent) {
    if (opts.rewindAfterStop) cur.col = playStartCol;
    clampCursor();
    ensureCursorVisible();
    fullRedraw();
  }
}

/* ================= boot ================= */

buildMenuBar();
setInterval(() => {
  if (opts.caretBlink && !playing && document.getElementById("dialoglayer").hidden) {
    caretOn = !caretOn;
    draw();
  }
}, 530);
window.addEventListener("resize", fullRedraw);
fullRedraw();

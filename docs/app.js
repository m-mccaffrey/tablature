/* TabIt Web — an unofficial tribute to TabIt 2.03 by GTAB Software.
   Instrument names, tuning presets, file format and UI wording recovered
   from a Ghidra analysis of the original WinTabIt executable and from the
   public .tbt file format documentation. */
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

// Built-in tuning presets recovered from the binary's preset tuning list.
// Pitches are MIDI note numbers, top (highest) display string first.
const BUILTIN_TUNINGS = {
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
let userTunings = {};
const allTunings = () => ({ ...BUILTIN_TUNINGS, ...userTunings });

const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName = m => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Note effects, displayed with the same characters the original uses.
const EFFECTS = {
  "h": "Hammer-on", "p": "Pull-off", "/": "Slide Up", "\\": "Slide Down",
  "b": "Bend", "^": "Bend Up", "r": "Release", "~": "Vibrato",
  "t": "Tapping", "s": "Slap", "w": "Whammy", "(": "Soft",
  "<": "Harmonic", "{": "Tremolo"
};

// Track effect change types (same ids as the .tbt format).
const TFX = { STROKE_DOWN: 1, STROKE_UP: 2, TEMPO: 3, INSTRUMENT: 4,
              VOLUME: 5, PAN: 6, CHORUS: 7, REVERB: 8, MODULATION: 9, PITCH_BEND: 10 };
const TFX_NAMES = { 1:"Stroke Down", 2:"Stroke Up", 3:"Tempo Change", 4:"Instrument Change",
                    5:"Volume Change", 6:"Pan Change", 7:"Chorus Change", 8:"Reverb Change",
                    9:"Modulation Change", 10:"Pitch Bend Change" };

const MAX_FRET = 99;

/* ================= song model ================= */

function makeBar(spaces) {
  return { spaces: spaces || song.spacesPerBar || 16,
           open: false, close: false, double: false, repeat: 0 };
}

function makeTrack(name, instrument, tuning) {
  return {
    name, instrument, isDrum: false, drumKit: 0,
    cutAnyString: false,
    tuning: tuning.slice(), volume: 104, pan: 64, reverb: 0, chorus: 0,
    modulation: 0, pitchBend: 0,
    played: true,
    spaces: [], fx: {}, topText: {}, botText: {}, alt: null
  };
}

function blankSong() {
  const s = {
    title: "Untitled", artist: "", album: "", transcribedBy: "", comments: "",
    tempo: 120, spacesPerBar: 16,
    barLines: [], tracks: []
  };
  for (let i = 0; i < 4; i++) s.barLines.push({ spaces: 16, open: false, close: false, double: false, repeat: 0 });
  s.tracks.push(makeTrack("Track 1", 27, BUILTIN_TUNINGS["(Standard)"]));
  return s;
}

function demoSong() {
  const s = blankSong();
  s.title = "Demo";
  s.comments = "Demo song for TabIt Web.";
  s.tempo = 100;
  s.barLines[0].open = true;
  s.barLines[3].close = true;
  s.barLines[3].repeat = 2;
  const g = s.tracks[0];
  g.name = "Guitar";
  g.instrument = 25;
  const b = makeTrack("Bass", 33, BUILTIN_TUNINGS["Bass (Standard)"]);
  b.volume = 96;
  s.tracks.push(b);
  const put = (tr, col, str, fret, fx) => {
    while (tr.spaces.length <= col) tr.spaces.push(null);
    if (!tr.spaces[col]) tr.spaces[col] = new Array(tr.tuning.length).fill(null);
    tr.spaces[col][str] = { f: fret, fx: fx || null };
  };
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
  return s;
}

/* ================= application state ================= */

let song = demoSong();
let fileName = null;
let curTrack = 0;
let cur = { col: 0, str: 0 };
let selAnchor = null;
let clipboard = null;
let undoStack = [], redoStack = [];
let pendingDigit = null, pendingTimer = null;
let caretOn = true;
let playing = false, playCol = -1, playStartCol = 0;
let geomVersion = 0;
const geomCache = new Map();

let opts = { caretBlink: true, barNumbers: true, followPlayback: true,
             rewindAfterStop: true, metronome: false, metroVolume: 80,
             metroAccent: true, loop: false, fontSize: "Medium" };

let COLORS = defaultColors();
function defaultColors() {
  return { bg: "#ffffff", text: "#000000", line: "#000000", barnum: "#808080",
           cursor: "#000080", cursorText: "#ffffff", sel: "#b0c4ff",
           play: "#9090d0", fxMark: "#800000" };
}

const FONT_SIZES = { Small: [11, 14, 11, 9], Medium: [13, 16, 13, 10], Large: [16, 20, 16, 12] };
let CW = 13, CH = 16, FPX = 13, FSPX = 10;
function applyFontSize() {
  const [cw, ch, f, fs] = FONT_SIZES[opts.fontSize] || FONT_SIZES.Medium;
  CW = cw; CH = ch; FPX = f; FSPX = fs;
}

const track = () => song.tracks[curTrack];
const nStrings = () => track().tuning.length;
const bars = () => song.barLines;
const plainTotal = () => bars().reduce((a, b) => a + b.spaces, 0);

/* ---- per-track geometry (handles alternate time regions) ---- */

const EPS = 1e-6;

function trackGeom(tr) {
  const c = geomCache.get(tr);
  if (c && c.v === geomVersion) return c.g;
  const bl = bars();
  const pt = plainTotal();
  const ratio = i => tr.alt && tr.alt[i] ? tr.alt[i][1] / tr.alt[i][0] : 1;
  // plain width of each track space; track spaces fill the plain timeline
  let cols;
  if (!tr.alt) cols = pt;
  else {
    let cum = 0; cols = 0;
    while (cum < pt - EPS) { cum += ratio(cols); cols++; }
  }
  cols = Math.max(cols, 1);
  const plainStart = new Float64Array(cols + 1);
  for (let i = 0; i < cols; i++) plainStart[i + 1] = plainStart[i] + ratio(i);
  // bar ranges in track-space columns
  const gBars = [];
  let p = 0, col = 0;
  for (const b of bl) {
    const end = p + b.spaces;
    const start = col;
    while (col < cols && plainStart[col] < end - EPS) col++;
    gBars.push({ start, cols: col - start, plain0: p, plain1: end });
    p = end;
  }
  const g = { cols, plainStart, bars: gBars, plainTotal: pt };
  geomCache.set(tr, { v: geomVersion, g });
  return g;
}

function barOfCol(g, col) {
  for (let k = g.bars.length - 1; k >= 0; k--)
    if (col >= g.bars[k].start) return k;
  return 0;
}

function invalidateGeom() { geomVersion++; }

function normalizeBars() {
  // make sure the bar grid covers every track's content
  let need = 0;
  for (const tr of song.tracks) {
    if (!tr.alt) need = Math.max(need, tr.spaces.length);
    else {
      let cum = 0;
      for (let i = 0; i < tr.spaces.length; i++)
        cum += tr.alt[i] ? tr.alt[i][1] / tr.alt[i][0] : 1;
      need = Math.max(need, Math.ceil(cum - EPS));
    }
  }
  let changed = false;
  while (plainTotal() < need) { bars().push(makeBar()); changed = true; }
  if (changed) invalidateGeom();
}

function getCell(tr, col, str) {
  const sp = tr.spaces[col];
  return sp ? sp[str] || null : null;
}

function setCell(tr, col, str, val) {
  while (tr.spaces.length <= col) tr.spaces.push(null);
  if (!tr.spaces[col]) {
    if (val == null) return;
    tr.spaces[col] = new Array(tr.tuning.length).fill(null);
  }
  tr.spaces[col][str] = val;
  if (val == null && tr.spaces[col].every(c => c == null)) tr.spaces[col] = null;
}

function shiftMaps(tr, atCol, delta) {
  for (const key of ["fx", "topText", "botText"]) {
    const src = tr[key] || {};
    const dst = {};
    for (const k of Object.keys(src)) {
      const c = Number(k);
      if (c < atCol) dst[c] = src[k];
      else if (c + delta >= atCol) dst[c + delta] = src[k];
    }
    tr[key] = dst;
  }
  if (tr.alt) {
    if (delta > 0) tr.alt.splice(atCol, 0, ...new Array(delta).fill(null));
    else tr.alt.splice(atCol, -delta);
  }
}

function trackInsertCols(tr, at, n) {
  while (tr.spaces.length < at) tr.spaces.push(null);
  shiftMaps(tr, at, n);
  tr.spaces.splice(at, 0, ...new Array(n).fill(null));
}

function trackRemoveCols(tr, at, n) {
  if (at < tr.spaces.length) tr.spaces.splice(at, Math.min(n, tr.spaces.length - at));
  shiftMaps(tr, at, -n);
}

/* ================= persistence (the web equivalent of
   Software\GTAB Software\WinTabIt) ================= */

function savePrefs() {
  try {
    localStorage.setItem("WinTabIt-Config", JSON.stringify({
      opts, colors: COLORS, userTunings,
      schemes: JSON.parse(localStorage.getItem("WinTabIt-Schemes") || "{}")
    }));
  } catch (e) { /* private browsing */ }
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("WinTabIt-Config") || "null");
    if (!p) return;
    Object.assign(opts, p.opts || {});
    Object.assign(COLORS, p.colors || {});
    userTunings = p.userTunings || {};
  } catch (e) { /* ignore */ }
}

/* ================= undo ================= */

const stripPrivate = (k, v) => k.startsWith("_") ? undefined : v;

function pushUndo() {
  undoStack.push(JSON.stringify({ song, curTrack }, stripPrivate));
  if (undoStack.length > 64) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ song, curTrack }, stripPrivate));
  restoreState(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ song, curTrack }, stripPrivate));
  restoreState(redoStack.pop());
}

function restoreState(json) {
  const st = JSON.parse(json);
  song = st.song;
  curTrack = Math.min(st.curTrack, song.tracks.length - 1);
  invalidateGeom();
  clampCursor();
  fullRedraw();
}

/* ================= rendering ================= */

const pane = document.getElementById("editorpane");
const canvas = document.getElementById("tabcanvas");
const ctx2d = canvas.getContext("2d");

const LEFT_CHARS = 3;
const TOP_PAD = 8;
const font = () => FPX + "px 'Courier New', monospace";
const fontSmall = () => FSPX + "px 'Courier New', monospace";

let layout = { rowH: 0, barPos: [], rows: 1 };

function computeLayout() {
  applyFontSize();
  const g = trackGeom(track());
  const limit = Math.max(200, pane.clientWidth - 24);
  layout.rowH = (nStrings() + (opts.barNumbers ? 1 : 0) + 2) * CH;
  layout.barPos = [];
  let x = LEFT_CHARS * CW, row = 0;
  for (let k = 0; k < g.bars.length; k++) {
    const w = (g.bars[k].cols + 1) * CW;
    if (x > LEFT_CHARS * CW && x + w + CW > limit) { row++; x = LEFT_CHARS * CW; }
    layout.barPos.push({ row, x });
    x += w;
  }
  layout.rows = row + 1;
}

function colToXY(col, str) {
  const g = trackGeom(track());
  const k = barOfCol(g, Math.min(col, g.cols - 1));
  const bp = layout.barPos[k] || { row: 0, x: LEFT_CHARS * CW };
  const x = bp.x + CW + (col - g.bars[k].start) * CW;
  const y = TOP_PAD + bp.row * layout.rowH + (opts.barNumbers ? CH : 0) + str * CH;
  return { x, y, row: bp.row, bar: k };
}

function xyToCol(px, py) {
  const g = trackGeom(track());
  const row = Math.max(0, Math.min(layout.rows - 1, Math.floor((py - TOP_PAD) / layout.rowH)));
  let str = Math.floor((py - TOP_PAD - row * layout.rowH - (opts.barNumbers ? CH : 0)) / CH);
  str = Math.max(0, Math.min(nStrings() - 1, str));
  let best = null;
  for (let k = 0; k < g.bars.length; k++) {
    const bp = layout.barPos[k];
    if (bp.row !== row) continue;
    if (best === null) best = k;
    if (px >= bp.x) best = k;
  }
  if (best === null) return { col: 0, str };
  const b = g.bars[best];
  const inBar = Math.max(0, Math.min(b.cols - 1, Math.floor((px - layout.barPos[best].x) / CW) - 1));
  return { col: Math.min(b.start + inBar, g.cols - 1), str };
}

function fullRedraw() {
  normalizeBars();
  computeLayout();
  const wantW = pane.clientWidth - 4;
  const wantH = Math.max(pane.clientHeight - 4, TOP_PAD * 2 + layout.rows * layout.rowH);
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

function fxLabel(fx) {
  switch (fx.t) {
    case TFX.STROKE_DOWN: return "↓";
    case TFX.STROKE_UP: return "↑";
    case TFX.TEMPO: return "T" + fx.v;
    case TFX.INSTRUMENT: return "I" + ((fx.v & 0x7f) + 1);
    case TFX.VOLUME: return "V" + fx.v;
    case TFX.PAN: return "P" + fx.v;
    case TFX.CHORUS: return "C" + fx.v;
    case TFX.REVERB: return "R" + fx.v;
    case TFX.MODULATION: return "M" + fx.v;
    case TFX.PITCH_BEND: return "B" + fx.v;
  }
  return "?";
}

function drawCellText(cell, x, yTop, fg) {
  const cy = yTop + CH / 2;
  ctx2d.fillStyle = fg;
  const txt = cell.fx === "x" ? "x" : cell.fx === "*" ? "*" : String(cell.f);
  ctx2d.font = txt.length > 1 ? fontSmall() : font();
  ctx2d.fillText(txt, x + CW / 2, cy);
  if (cell.fx && cell.fx !== "x" && cell.fx !== "*") {
    ctx2d.font = fontSmall();
    ctx2d.fillText(cell.fx, x + CW - 2, cy - CH / 2 + 2);
  }
  ctx2d.font = font();
}

function drawBarlineGlyph(bx, top, bot, prevClose, prevRepeat, curOpen, curDouble) {
  const x = Math.round(bx + CW / 2) + 0.5;
  ctx2d.strokeStyle = COLORS.line;
  ctx2d.beginPath();
  if (prevClose || curOpen) {
    ctx2d.lineWidth = 2.5;
    ctx2d.moveTo(x, top); ctx2d.lineTo(x, bot);
    ctx2d.stroke();
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    if (prevClose) { ctx2d.moveTo(x - 3.5, top); ctx2d.lineTo(x - 3.5, bot); }
    if (curOpen) { ctx2d.moveTo(x + 3.5, top); ctx2d.lineTo(x + 3.5, bot); }
    ctx2d.stroke();
    ctx2d.fillStyle = COLORS.line;
    const dy = (bot - top) / 3;
    if (prevClose) {
      ctx2d.fillRect(x - 7, top + dy - 1.5, 3, 3);
      ctx2d.fillRect(x - 7, top + 2 * dy - 1.5, 3, 3);
      if (prevRepeat > 2) {
        ctx2d.font = fontSmall();
        ctx2d.textAlign = "right";
        ctx2d.fillText(prevRepeat + "x", x - 2, top - 6);
        ctx2d.textAlign = "center";
        ctx2d.font = font();
      }
    }
    if (curOpen) {
      ctx2d.fillRect(x + 5, top + dy - 1.5, 3, 3);
      ctx2d.fillRect(x + 5, top + 2 * dy - 1.5, 3, 3);
    }
  } else if (curDouble) {
    ctx2d.lineWidth = 1;
    ctx2d.moveTo(x - 1.5, top); ctx2d.lineTo(x - 1.5, bot);
    ctx2d.moveTo(x + 1.5, top); ctx2d.lineTo(x + 1.5, bot);
    ctx2d.stroke();
  } else {
    ctx2d.lineWidth = 1;
    ctx2d.moveTo(x, top); ctx2d.lineTo(x, bot);
    ctx2d.stroke();
  }
  ctx2d.lineWidth = 1;
}

function draw() {
  const tr = track(), ns = nStrings();
  const g = trackGeom(tr);
  const bl = bars();
  ctx2d.fillStyle = COLORS.bg;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  ctx2d.font = font();
  ctx2d.textBaseline = "middle";
  ctx2d.textAlign = "center";
  ctx2d.lineWidth = 1;

  const sel = selection();
  if (sel) {
    ctx2d.fillStyle = COLORS.sel;
    for (let c = sel[0]; c <= sel[1] && c < g.cols; c++) {
      const p = colToXY(c, 0);
      ctx2d.fillRect(p.x, p.y, CW, ns * CH);
    }
  }
  if (playing && playCol >= 0 && playCol < g.cols) {
    const pp = colToXY(playCol, 0);
    ctx2d.fillStyle = COLORS.play;
    ctx2d.globalAlpha = 0.4;
    ctx2d.fillRect(pp.x, pp.y, CW, ns * CH);
    ctx2d.globalAlpha = 1;
  }

  for (let k = 0; k < g.bars.length; k++) {
    const b = g.bars[k];
    const bp = layout.barPos[k];
    const yTop = TOP_PAD + bp.row * layout.rowH + (opts.barNumbers ? CH : 0);
    const lineTop = yTop + CH / 2;
    const lineBot = yTop + (ns - 1) * CH + CH / 2;
    const wpx = (b.cols + 1) * CW;

    if (opts.barNumbers) {
      ctx2d.fillStyle = COLORS.barnum;
      ctx2d.textAlign = "left";
      ctx2d.fillText(String(k + 1), bp.x + CW, yTop - CH / 2);
      ctx2d.textAlign = "center";
    }
    ctx2d.strokeStyle = COLORS.line;
    ctx2d.beginPath();
    for (let s = 0; s < ns; s++) {
      const y = Math.round(yTop + s * CH + CH / 2) + 0.5;
      ctx2d.moveTo(bp.x, y);
      ctx2d.lineTo(bp.x + wpx, y);
    }
    ctx2d.stroke();

    drawBarlineGlyph(bp.x, lineTop, lineBot,
      k > 0 && bl[k - 1].close, k > 0 ? bl[k - 1].repeat : 0,
      bl[k].open, bl[k].double);
    const isRowEnd = k === g.bars.length - 1 || layout.barPos[k + 1].row !== bp.row;
    if (isRowEnd)
      drawBarlineGlyph(bp.x + wpx, lineTop, lineBot, bl[k].close, bl[k].repeat, false, false);

    // tuning labels at row start
    if (k === 0 || layout.barPos[k - 1].row !== bp.row) {
      ctx2d.fillStyle = COLORS.text;
      ctx2d.textAlign = "right";
      for (let s = 0; s < ns; s++) {
        let label = tr.isDrum ? "D" : NOTE_NAMES[((tr.tuning[s] % 12) + 12) % 12];
        if (s === 0 && !tr.isDrum) label = label.toLowerCase();
        ctx2d.fillText(label, bp.x - 3, yTop + s * CH + CH / 2);
      }
      ctx2d.textAlign = "center";
    }

    // contents of this bar
    for (let c = b.start; c < b.start + b.cols; c++) {
      const x = bp.x + CW + (c - b.start) * CW;
      // track effect / alt-region / text markers above the staff
      if (opts.barNumbers) {
        const fx = tr.fx && tr.fx[c];
        ctx2d.font = fontSmall();
        if (fx) {
          ctx2d.fillStyle = COLORS.fxMark;
          ctx2d.fillText(fxLabel(fx), x + CW / 2, yTop - CH / 2 + 4);
        } else if (tr.alt && tr.alt[c] &&
                   (c === 0 || !tr.alt[c - 1] || tr.alt[c - 1][0] !== tr.alt[c][0] ||
                    tr.alt[c - 1][1] !== tr.alt[c][1])) {
          ctx2d.fillStyle = "#006000";
          ctx2d.fillText(tr.alt[c][0] + ":" + tr.alt[c][1], x + CW / 2, yTop - CH / 2 + 4);
        } else if (tr.topText && tr.topText[c]) {
          ctx2d.fillStyle = COLORS.text;
          ctx2d.fillText(tr.topText[c], x + CW / 2, yTop - CH / 2 + 4);
        }
        ctx2d.font = font();
      }
      if (tr.botText && tr.botText[c]) {
        ctx2d.font = fontSmall();
        ctx2d.fillStyle = COLORS.text;
        ctx2d.fillText(tr.botText[c], x + CW / 2, yTop + ns * CH + 2);
        ctx2d.font = font();
      }
      const sp = tr.spaces[c];
      if (!sp) continue;
      const inSel = sel && c >= sel[0] && c <= sel[1];
      const onPlay = playing && c === playCol;
      for (let s = 0; s < ns; s++) {
        const cell = sp[s];
        if (!cell) continue;
        const y = yTop + s * CH;
        ctx2d.fillStyle = inSel ? COLORS.sel : COLORS.bg;
        if (!onPlay) ctx2d.fillRect(x, y + 1, CW, CH - 2);
        drawCellText(cell, x, y, COLORS.text);
      }
    }
  }

  // cursor
  if (!playing && (caretOn || !opts.caretBlink)) {
    const p = colToXY(cur.col, cur.str);
    ctx2d.fillStyle = COLORS.cursor;
    ctx2d.fillRect(p.x, p.y + 1, CW, CH - 2);
    const cell = getCell(track(), cur.col, cur.str);
    if (cell) drawCellText(cell, p.x, p.y, COLORS.cursorText);
    else {
      ctx2d.fillStyle = COLORS.cursorText;
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
  const top = p.y - CH * 2, bot = p.y + CH * 3;
  if (top < pane.scrollTop) pane.scrollTop = Math.max(0, top);
  else if (bot > pane.scrollTop + pane.clientHeight) pane.scrollTop = bot - pane.clientHeight;
}

/* ================= status / title ================= */

function updateStatus() {
  const g = trackGeom(track());
  document.getElementById("st-track").textContent =
    " Track: " + (curTrack + 1) + " (" + track().name + ")" + (track().played ? "" : " [muted]");
  document.getElementById("st-bar").textContent =
    " Bar: " + (barOfCol(g, cur.col) + 1);
  const sel = selection();
  document.getElementById("st-mode").textContent = playing ? "Playing..."
    : sel
    ? (sel[1] - sel[0] + 1) === 1 ? "1 space is selected."
      : (sel[1] - sel[0] + 1) + " spaces are selected."
    : "";
  document.getElementById("st-hint").textContent =
    "Frets: 0-9 | Effects: h p / \\ b ^ r ~ t s w ( < { | x dead, * stop, u/d stroke | F5 play, F6 cursor, F8 stop";
}

function updateTitle() {
  const t = (fileName || song.title || "Untitled") + " - TabIt";
  document.getElementById("titletext").textContent = t;
  document.title = t;
}

/* ================= cursor / editing ================= */

function clampCursor() {
  const g = trackGeom(track());
  cur.str = Math.max(0, Math.min(nStrings() - 1, cur.str));
  cur.col = Math.max(0, Math.min(g.cols - 1, cur.col));
}

function moveCursor(dc, ds, extend) {
  if (extend) { if (selAnchor == null) selAnchor = cur.col; }
  else selAnchor = null;
  const g = trackGeom(track());
  if (dc > 0 && cur.col + dc > g.cols - 1) {
    pushUndo();
    bars().push(makeBar());
    invalidateGeom();
  }
  cur.col += dc;
  cur.str += ds;
  clampCursor();
  flushPendingDigit();
  computeLayout();
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
    if (v <= (tr.isDrum ? MAX_FRET : 28)) {
      const cell = getCell(tr, cur.col, cur.str);
      setCell(tr, cur.col, cur.str, { f: v, fx: cell ? cell.fx : null });
      if (tr.isDrum && v <= 9) { pendingDigit = v; pendingTimer = setTimeout(() => { pendingDigit = null; }, 700); }
      fullRedraw();
      previewNote(tr, cur.col, cur.str);
      return;
    }
  }
  pushUndo();
  const cell = getCell(tr, cur.col, cur.str);
  const oldFx = cell && cell.fx !== "x" && cell.fx !== "*" ? cell.fx : null;
  setCell(tr, cur.col, cur.str, { f: d, fx: oldFx });
  if (d >= 1 && (d <= 2 || tr.isDrum)) {
    pendingDigit = d;
    pendingTimer = setTimeout(() => { pendingDigit = null; }, 700);
  }
  fullRedraw();
  previewNote(tr, cur.col, cur.str);
}

function typeEffect(ch) {
  const tr = track();
  if (ch === "x" || ch === "*") {
    pushUndo();
    const cell = getCell(tr, cur.col, cur.str);
    if (cell && cell.fx === ch) setCell(tr, cur.col, cur.str, null);
    else setCell(tr, cur.col, cur.str, { f: 0, fx: ch });
    fullRedraw();
    return;
  }
  const cell = getCell(tr, cur.col, cur.str);
  if (!cell || cell.fx === "x" || cell.fx === "*") return;
  pushUndo();
  cell.fx = cell.fx === ch ? null : ch;
  fullRedraw();
}

function setTrackFx(type, value) {
  pushUndo();
  const tr = track();
  if (!tr.fx) tr.fx = {};
  const curFx = tr.fx[cur.col];
  if (curFx && curFx.t === type && (type === TFX.STROKE_DOWN || type === TFX.STROKE_UP))
    delete tr.fx[cur.col];
  else tr.fx[cur.col] = { t: type, v: value | 0 };
  fullRedraw();
}

function removeTrackFx() {
  const tr = track();
  if (!tr.fx || !tr.fx[cur.col]) return;
  pushUndo();
  delete tr.fx[cur.col];
  fullRedraw();
}

function repeatPrevTrackFx() {
  const tr = track();
  if (!tr.fx) return;
  let best = -1;
  for (const k of Object.keys(tr.fx)) {
    const c = Number(k);
    if (c < cur.col && c > best) best = c;
  }
  if (best < 0) return;
  pushUndo();
  tr.fx[cur.col] = { ...tr.fx[best] };
  fullRedraw();
}

function clearTrackEffects() {
  pushUndo();
  track().fx = {};
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
  trackInsertCols(track(), cur.col, 1);
  fullRedraw();
}

function deleteSpace() {
  pushUndo();
  trackRemoveCols(track(), cur.col, 1);
  clampCursor();
  fullRedraw();
}

function selectAll() {
  selAnchor = 0;
  cur.col = trackGeom(track()).cols - 1;
  fullRedraw();
}

function copySelection(cut) {
  const sel = selection() || [cur.col, cur.col];
  const tr = track();
  clipboard = { cols: [] };
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
  while (tr.spaces.length < cur.col + clipboard.cols.length) tr.spaces.push(null);
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

function switchTrack(d) {
  curTrack = (curTrack + d + song.tracks.length) % song.tracks.length;
  clampCursor();
  selAnchor = null;
  fullRedraw();
}

/* ================= keyboard ================= */

document.addEventListener("keydown", e => {
  if (!document.getElementById("dialoglayer").hidden) {
    if (e.key === "Escape") closeDialog(false);
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON")
      closeDialog(true);
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
      case "p": e.preventDefault(); printPreview(); return;
      case "home": e.preventDefault(); cur.col = 0; selAnchor = null; ensureCursorVisible(); fullRedraw(); return;
      case "end": e.preventDefault(); cur.col = trackGeom(track()).cols - 1; selAnchor = null; ensureCursorVisible(); fullRedraw(); return;
      case "arrowup": e.preventDefault(); switchTrack(-1); return;
      case "arrowdown": e.preventDefault(); switchTrack(1); return;
      case "delete": e.preventDefault(); deleteSpace(); return;
    }
    return;
  }

  const g = trackGeom(track());
  const curBar = barOfCol(g, cur.col);
  switch (k) {
    case "ArrowLeft":  e.preventDefault(); moveCursor(-1, 0, e.shiftKey); return;
    case "ArrowRight": e.preventDefault(); moveCursor(1, 0, e.shiftKey); return;
    case "ArrowUp":    e.preventDefault(); moveCursor(0, -1, e.shiftKey); return;
    case "ArrowDown":  e.preventDefault(); moveCursor(0, 1, e.shiftKey); return;
    case "PageUp": e.preventDefault();
      moveCursor((g.bars[Math.max(0, curBar - 1)].start) - cur.col, 0, e.shiftKey); return;
    case "PageDown": e.preventDefault();
      moveCursor((curBar + 1 < g.bars.length ? g.bars[curBar + 1].start : g.cols - 1) - cur.col, 0, e.shiftKey); return;
    case "Home": e.preventDefault();
      cur.col = g.bars[curBar].start;
      if (!e.shiftKey) selAnchor = null;
      fullRedraw(); return;
    case "End": e.preventDefault();
      cur.col = g.bars[curBar].start + g.bars[curBar].cols - 1;
      clampCursor();
      if (!e.shiftKey) selAnchor = null;
      fullRedraw(); return;
    case "Delete": e.preventDefault(); clearCell(); return;
    case "Backspace": e.preventDefault(); clearCell(); moveCursor(-1, 0, false); return;
    case "Insert": e.preventDefault(); insertSpace(); return;
    case "-": e.preventDefault(); clearCell(); return;
  }

  if (/^[0-9]$/.test(k)) { e.preventDefault(); typeDigit(Number(k)); return; }
  if (k === "u") { e.preventDefault(); setTrackFx(TFX.STROKE_UP, 0); return; }
  if (k === "d") { e.preventDefault(); setTrackFx(TFX.STROKE_DOWN, 0); return; }
  if (k === "x" || k === "*") { e.preventDefault(); typeEffect(k); return; }
  if (EFFECTS[k]) { e.preventDefault(); typeEffect(k); return; }
});

/* ================= mouse ================= */

let dragging = false;
canvas.addEventListener("mousedown", e => {
  if (playing) return;
  const r = canvas.getBoundingClientRect();
  const hit = xyToCol(e.clientX - r.left, e.clientY - r.top);
  cur.col = hit.col; cur.str = hit.str;
  if (!e.shiftKey) selAnchor = cur.col;
  dragging = true;
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
  const g = trackGeom(track());
  const k = barOfCol(g, hit.col);
  selAnchor = g.bars[k].start;
  cur.col = Math.min(g.bars[k].start + g.bars[k].cols - 1, g.cols - 1);
  fullRedraw();
});

/* ================= menus ================= */

let menuOpen = null;

const MENUS = [
  ["File", () => [
    ["New", "Ctrl+N", newSong],
    ["Open...", "Ctrl+O", openSongDialog],
    ["Save", "Ctrl+S", saveSong],
    ["Save As...", "", saveSong],
    ["Save as TabIt (.tbt)...", "", saveSongTbt],
    null,
    ["Export Text...", "", exportText],
    ["Export MIDI...", "", exportMidi],
    null,
    ["Print Preview...", "Ctrl+P", printPreview],
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
    ["Save Preset Tuning...", "", saveTuningDialog],
    ["Delete Preset Tuning...", "", deleteTuningDialog],
    ["Reset Preset Tuning List", "", resetTunings],
    null,
    ["Properties...", "", trackPropertiesDialog]
  ]],
  ["Bar", () => [
    ["Add Bars...", "", addBarsDialog],
    ["Insert Bar", "", insertBar],
    ["Delete Bar", "", deleteBar],
    null,
    ["Bar Line Change...", "", barLineDialog],
    null,
    ["Go to Bar...", "", goToBarDialog]
  ]],
  ["Effects", () => {
    const tr = track();
    const cell = getCell(tr, cur.col, cur.str);
    const fx = tr.fx && tr.fx[cur.col];
    return [
      ...Object.entries(EFFECTS).map(([ch, name]) =>
        [name, ch, () => typeEffect(ch), false, !!(cell && cell.fx === ch)]),
      null,
      ["Stroke Down", "d", () => setTrackFx(TFX.STROKE_DOWN, 0), false, !!(fx && fx.t === TFX.STROKE_DOWN)],
      ["Stroke Up", "u", () => setTrackFx(TFX.STROKE_UP, 0), false, !!(fx && fx.t === TFX.STROKE_UP)],
      null,
      ["Tempo Change...", "", () => trackFxDialog(TFX.TEMPO)],
      ["Instrument Change...", "", () => trackFxDialog(TFX.INSTRUMENT)],
      ["Volume Change...", "", () => trackFxDialog(TFX.VOLUME)],
      ["Pan Change...", "", () => trackFxDialog(TFX.PAN)],
      ["Chorus Change...", "", () => trackFxDialog(TFX.CHORUS)],
      ["Reverb Change...", "", () => trackFxDialog(TFX.REVERB)],
      ["Pitch Bend Change...", "", () => trackFxDialog(TFX.PITCH_BEND)],
      null,
      ["Repeat Previous Track Effect", "", repeatPrevTrackFx],
      ["Remove Track Effect", "", removeTrackFx, !fx],
      ["Clear Track Effects", "", clearTrackEffects]
    ];
  }],
  ["Player", () => [
    ["Play from Start", "F5", () => playFrom(0)],
    ["Play from Cursor", "F6", () => playFrom(cur.col)],
    ["Stop", "F8", stopPlayback, !playing],
    null,
    ["Tracks...", "", playerTracksDialog],
    null,
    ["Loop", "", () => { opts.loop = !opts.loop; savePrefs(); }, false, opts.loop],
    ["Metronome", "", () => { opts.metronome = !opts.metronome; savePrefs(); }, false, opts.metronome],
    ["Metronome Settings...", "", metronomeDialog],
    null,
    ["Tempo...", "", tempoDialog],
    ["Tempo Tap...", "", tempoTapDialog]
  ]],
  ["Options", () => [
    ["Bar Numbers", "", () => { opts.barNumbers = !opts.barNumbers; savePrefs(); fullRedraw(); }, false, opts.barNumbers],
    ["Cursor Blink", "", () => { opts.caretBlink = !opts.caretBlink; savePrefs(); fullRedraw(); }, false, opts.caretBlink],
    ["Follow Playback", "", () => { opts.followPlayback = !opts.followPlayback; savePrefs(); }, false, opts.followPlayback],
    ["Rewind After Stop", "", () => { opts.rewindAfterStop = !opts.rewindAfterStop; savePrefs(); }, false, opts.rewindAfterStop],
    null,
    ...["Small", "Medium", "Large"].map(sz =>
      ["Font: " + sz, "", () => { opts.fontSize = sz; savePrefs(); fullRedraw(); }, false, opts.fontSize === sz]),
    null,
    ["Colors...", "", colorsDialog]
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
const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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
  return showDialog(title, "<div style='padding:4px 0;white-space:pre-wrap'>" +
    String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;") +
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

async function tempoTapDialog() {
  const p = showDialog("Tempo Tap",
    "<div style='text-align:center'><button id='d-tapbtn' style='width:140px;height:48px'>Tap</button>" +
    "<div style='margin-top:8px'>Tapped tempo: <b id='d-tapval'>-</b> BPM</div>" +
    "<input type='hidden' id='d-tap' value=''></div>", ["OK", "Cancel"]);
  const taps = [];
  document.getElementById("d-tapbtn").addEventListener("click", () => {
    taps.push(performance.now());
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      const bpm = Math.round(60000 / iv);
      document.getElementById("d-tapval").textContent = bpm;
      document.getElementById("d-tap").value = bpm;
    }
  });
  const v = await p;
  if (!v || !v["d-tap"]) return;
  const t = Math.max(10, Math.min(999, Number(v["d-tap"])));
  pushUndo();
  song.tempo = t;
}

async function metronomeDialog() {
  const v = await showDialog("Metronome",
    "<div class='dlgrow'><input type='checkbox' id='d-on'" + (opts.metronome ? " checked" : "") +
    "><label for='d-on' style='display:inline'>Metronome on</label></div>" +
    "<div class='dlgrow'><input type='checkbox' id='d-acc'" + (opts.metroAccent ? " checked" : "") +
    "><label for='d-acc' style='display:inline'>Accent first beat of bar</label></div>" +
    "<label>Volume:</label><input type='range' id='d-vol' min='0' max='127' value='" + opts.metroVolume + "'>",
    ["OK", "Cancel"]);
  if (!v) return;
  opts.metronome = v["d-on"];
  opts.metroAccent = v["d-acc"];
  opts.metroVolume = Number(v["d-vol"]);
  savePrefs();
}

async function trackFxDialog(type) {
  const tr = track();
  const existing = tr.fx && tr.fx[cur.col] && tr.fx[cur.col].t === type ? tr.fx[cur.col].v : null;
  let body, parse;
  if (type === TFX.TEMPO) {
    body = "<label>New tempo (BPM):</label><input type='number' id='d-v' min='10' max='999' value='" +
      (existing ?? song.tempo) + "'>";
    parse = v => Math.max(10, Math.min(999, Number(v) || song.tempo));
  } else if (type === TFX.INSTRUMENT) {
    body = "<label>Instrument:</label><select id='d-v' style='width:100%'>" +
      GM_INSTRUMENTS.map((n, i) => "<option value='" + i + "'" +
        ((existing ?? tr.instrument) === i ? " selected" : "") + ">" + (i + 1) + " - " + n + "</option>").join("") +
      "</select>";
    parse = v => Number(v) & 0x7f;
  } else if (type === TFX.PITCH_BEND) {
    body = "<label>Pitch bend (semitones, -2 to +2):</label>" +
      "<input type='number' id='d-v' min='-2' max='2' step='0.5' value='" +
      (existing != null ? (existing / 8192 * 2).toFixed(1) : "0") + "'>";
    parse = v => Math.max(-8192, Math.min(8191, Math.round(Number(v) / 2 * 8192)));
  } else {
    const def = { [TFX.VOLUME]: tr.volume, [TFX.PAN]: tr.pan,
                  [TFX.CHORUS]: tr.chorus, [TFX.REVERB]: tr.reverb }[type] ?? 64;
    body = "<label>" + TFX_NAMES[type] + " (0-127):</label>" +
      "<input type='number' id='d-v' min='0' max='127' value='" + (existing ?? def) + "'>";
    parse = v => Math.max(0, Math.min(127, Number(v) || 0));
  }
  const v = await showDialog(TFX_NAMES[type], body, ["OK", "Cancel"]);
  if (!v) return;
  setTrackFx(type, parse(v["d-v"]));
}

async function addBarsDialog() {
  const v = await showDialog("Add Bars",
    "<label>Number of bars to add:</label><input type='number' id='d-bars' min='1' max='500' value='4'>" +
    "<label>Spaces per bar:</label><input type='number' id='d-spaces' min='1' max='64' value='" +
    song.spacesPerBar + "'>",
    ["OK", "Cancel"]);
  if (!v) return;
  const n = Math.max(1, Math.min(500, Number(v["d-bars"]) || 0));
  const sp = Math.max(1, Math.min(64, Number(v["d-spaces"]) || 16));
  pushUndo();
  for (let i = 0; i < n; i++) bars().push({ spaces: sp, open: false, close: false, double: false, repeat: 0 });
  invalidateGeom();
  fullRedraw();
}

function insertBar() {
  pushUndo();
  const starts = song.tracks.map(tr => {
    const g = trackGeom(tr);
    const k = barOfCol(trackGeom(track()), cur.col);
    return g.bars[k] ? g.bars[k].start : g.cols;
  });
  const k = barOfCol(trackGeom(track()), cur.col);
  const nb = makeBar();
  song.tracks.forEach((tr, i) => trackInsertCols(tr, starts[i], nb.spaces));
  bars().splice(k, 0, nb);
  invalidateGeom();
  fullRedraw();
}

function deleteBar() {
  if (bars().length <= 1) return;
  pushUndo();
  const k = barOfCol(trackGeom(track()), cur.col);
  song.tracks.forEach(tr => {
    const g = trackGeom(tr);
    const b = g.bars[k];
    if (b) trackRemoveCols(tr, b.start, b.cols);
  });
  bars().splice(k, 1);
  invalidateGeom();
  clampCursor();
  fullRedraw();
}

async function barLineDialog() {
  const g = trackGeom(track());
  const k = barOfCol(g, cur.col);
  const b = bars()[k];
  const v = await showDialog("Bar Line Change",
    "<label>Bar " + (k + 1) + " — spaces in bar:</label>" +
    "<input type='number' id='d-spaces' min='1' max='64' value='" + b.spaces + "'>" +
    "<div class='dlgrow'><input type='checkbox' id='d-double'" + (b.double ? " checked" : "") +
    "><label for='d-double' style='display:inline'>Double bar line</label></div>" +
    "<div class='dlgrow'><input type='checkbox' id='d-open'" + (b.open ? " checked" : "") +
    "><label for='d-open' style='display:inline'>Open repeat</label></div>" +
    "<div class='dlgrow'><input type='checkbox' id='d-close'" + (b.close ? " checked" : "") +
    "><label for='d-close' style='display:inline'>Close repeat, play</label>" +
    "<input type='number' id='d-repeat' min='2' max='99' value='" + Math.max(2, b.repeat || 2) +
    "' style='width:50px'><span>times</span></div>",
    ["OK", "Cancel"]);
  if (!v) return;
  pushUndo();
  const newSpaces = Math.max(1, Math.min(64, Number(v["d-spaces"]) || b.spaces));
  const delta = newSpaces - b.spaces;
  if (delta !== 0) {
    song.tracks.forEach(tr => {
      const gt = trackGeom(tr);
      const bt = gt.bars[k];
      if (!bt) return;
      if (delta > 0) trackInsertCols(tr, bt.start + bt.cols, delta);
      else trackRemoveCols(tr, bt.start + bt.cols + delta, -delta);
    });
  }
  b.spaces = newSpaces;
  b.double = v["d-double"];
  b.open = v["d-open"];
  b.close = v["d-close"];
  b.repeat = b.close ? Math.max(2, Math.min(99, Number(v["d-repeat"]) || 2)) : 0;
  invalidateGeom();
  clampCursor();
  fullRedraw();
}

async function goToBarDialog() {
  const g = trackGeom(track());
  const v = await showDialog("Go to Bar",
    "<label>Bar number:</label><input type='number' id='d-bar' min='1' value='" +
    (barOfCol(g, cur.col) + 1) + "'>", ["OK", "Cancel"]);
  if (!v) return;
  const b = Number(v["d-bar"]);
  if (!(b >= 1)) { msgBox("TabIt", "Bar number must be at least 1."); return; }
  const k = Math.min(b - 1, g.bars.length - 1);
  cur.col = g.bars[k].start;
  selAnchor = null;
  ensureCursorVisible();
  fullRedraw();
}

async function songPropertiesDialog() {
  const v = await showDialog("Song Properties",
    "<label>Title:</label><input type='text' id='d-title' value=\"" + esc(song.title) + "\" style='width:100%'>" +
    "<label>Artist:</label><input type='text' id='d-artist' value=\"" + esc(song.artist) + "\" style='width:100%'>" +
    "<label>Album:</label><input type='text' id='d-album' value=\"" + esc(song.album || "") + "\" style='width:100%'>" +
    "<label>Transcribed by:</label><input type='text' id='d-trans' value=\"" + esc(song.transcribedBy || "") + "\" style='width:100%'>" +
    "<label>Comments:</label><input type='text' id='d-comments' value=\"" + esc(song.comments) + "\" style='width:100%'>",
    ["OK", "Cancel"]);
  if (!v) return;
  pushUndo();
  song.title = v["d-title"];
  song.artist = v["d-artist"];
  song.album = v["d-album"];
  song.transcribedBy = v["d-trans"];
  song.comments = v["d-comments"];
  updateTitle();
}

async function trackPropertiesDialog() {
  const tr = track();
  const instOpts =
    GM_INSTRUMENTS.map((n, i) =>
      "<option value='" + i + "'" + (!tr.isDrum && tr.instrument === i ? " selected" : "") + ">" +
      (i + 1) + " - " + n + "</option>").join("") +
    DRUM_KITS.map((n, i) =>
      "<option value='d" + i + "'" + (tr.isDrum && tr.drumKit === i ? " selected" : "") + ">" +
      "Drums - " + n + "</option>").join("");
  const tunOpts = "<option value=''>-- preset --</option>" +
    Object.keys(allTunings()).map(n => "<option>" + esc(n) + "</option>").join("");
  const stringRows = tr.tuning.map((m, s) =>
    "<div class='dlgrow'><span style='width:60px'>String " + (s + 1) + ":</span>" +
    "<select id='d-str" + s + "'>" +
    Array.from({ length: 70 }, (_, i) => i + 16).map(mm =>
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
    "<input type='range' id='d-pan' min='0' max='127' value='" + tr.pan + "'></div>" +
    "<div class='dlgrow'><span style='width:60px'>Reverb:</span>" +
    "<input type='range' id='d-rev' min='0' max='127' value='" + (tr.reverb || 0) + "'></div>" +
    "<div class='dlgrow'><span style='width:60px'>Chorus:</span>" +
    "<input type='range' id='d-cho' min='0' max='127' value='" + (tr.chorus || 0) + "'></div>" +
    "<div class='dlgrow'><input type='checkbox' id='d-cut'" + (tr.cutAnyString ? " checked" : "") +
    "><label for='d-cut' style='display:inline'>Notes ring until next event on any string</label></div>",
    ["OK", "Cancel"]);
  const presetSel = document.getElementById("d-preset");
  presetSel.addEventListener("change", () => {
    const p = allTunings()[presetSel.value];
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
  if (v["d-preset"] && allTunings()[v["d-preset"]]) {
    retuneTrack(tr, allTunings()[v["d-preset"]]);
  } else {
    for (let s = 0; s < tr.tuning.length; s++)
      if (v["d-str" + s] != null) tr.tuning[s] = Number(v["d-str" + s]);
  }
  tr.volume = Number(v["d-vol"]);
  tr.pan = Number(v["d-pan"]);
  tr.reverb = Number(v["d-rev"]);
  tr.chorus = Number(v["d-cho"]);
  tr.cutAnyString = v["d-cut"];
  invalidateGeom();
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

async function saveTuningDialog() {
  const tr = track();
  const v = await showDialog("Save Preset Tuning",
    "<label>Save the current track's tuning (" +
    tr.tuning.map(noteName).join(" ") + ") as:</label>" +
    "<input type='text' id='d-name' value='' style='width:100%'>", ["OK", "Cancel"]);
  if (!v || !v["d-name"]) return;
  const name = v["d-name"];
  if (allTunings()[name] && !userTunings[name]) {
    msgBox("TabIt", "A tuning named \"" + name + "\" already exists.");
    return;
  }
  userTunings[name] = tr.tuning.slice();
  savePrefs();
}

async function deleteTuningDialog() {
  const names = Object.keys(userTunings);
  if (!names.length) { msgBox("TabIt", "There are no user preset tunings to delete."); return; }
  const v = await showDialog("Delete Preset Tuning",
    "<label>Delete the tuning:</label><select id='d-name' style='width:100%'>" +
    names.map(n => "<option>" + esc(n) + "</option>").join("") + "</select>", ["OK", "Cancel"]);
  if (!v) return;
  delete userTunings[v["d-name"]];
  savePrefs();
}

async function resetTunings() {
  const v = await showDialog("TabIt", "Reset the preset tuning list, removing all user tunings?", ["OK", "Cancel"]);
  if (!v) return;
  userTunings = {};
  savePrefs();
}

async function addTrack() {
  pushUndo();
  const t = makeTrack("Track " + (song.tracks.length + 1), 27, BUILTIN_TUNINGS["(Standard)"]);
  song.tracks.push(t);
  curTrack = song.tracks.length - 1;
  invalidateGeom();
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
  invalidateGeom();
  clampCursor();
  fullRedraw();
}

async function playerTracksDialog() {
  const rows = song.tracks.map((t, i) =>
    "<div class='dlgrow'><input type='checkbox' id='d-tr" + i + "'" + (t.played ? " checked" : "") +
    "><label for='d-tr" + i + "' style='display:inline'>" + (i + 1) + ": " + esc(t.name) +
    "</label></div>").join("");
  const v = await showDialog("Player Tracks",
    "<label>Tracks to play:</label>" + rows, ["OK", "Cancel"]);
  if (!v) return;
  const played = song.tracks.map((_, i) => !!v["d-tr" + i]);
  if (!played.some(p => p)) {
    msgBox("TabIt", "At least one track must be checked.");
    return;
  }
  song.tracks.forEach((t, i) => { t.played = played[i]; });
  fullRedraw();
}

async function colorsDialog() {
  const fields = [["bg","Background"],["text","Text"],["line","Lines"],["barnum","Bar numbers"],
                  ["cursor","Cursor"],["cursorText","Cursor text"],["sel","Selection"],
                  ["play","Playhead"],["fxMark","Effect markers"]];
  const schemes = JSON.parse(localStorage.getItem("WinTabIt-Schemes") || "{}");
  const v = await showDialog("Colors",
    "<label>Scheme:</label><div class='dlgrow'><select id='d-scheme' style='flex:1'>" +
    "<option value=''>(current)</option>" +
    Object.keys(schemes).map(n => "<option>" + esc(n) + "</option>").join("") +
    "</select></div>" +
    fields.map(([k, label]) =>
      "<div class='dlgrow'><span style='width:90px'>" + label + ":</span>" +
      "<input type='color' id='d-col-" + k + "' value='" + COLORS[k] + "'></div>").join("") +
    "<div class='dlgrow'><span style='width:90px'>Save scheme:</span>" +
    "<input type='text' id='d-schemename' placeholder='name' style='flex:1'></div>" +
    "<div class='dlgrow'><button id='d-resetcol' type='button' style='min-width:120px'>Reset Defaults</button></div>",
    ["OK", "Cancel"]);
  const schemeSel = document.getElementById("d-scheme");
  if (schemeSel) schemeSel.addEventListener("change", () => {
    const s = schemes[schemeSel.value];
    if (!s) return;
    for (const [k] of fields) {
      const el = document.getElementById("d-col-" + k);
      if (el && s[k]) el.value = s[k];
    }
  });
  const resetBtn = document.getElementById("d-resetcol");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    const d = defaultColors();
    for (const [k] of fields) {
      const el = document.getElementById("d-col-" + k);
      if (el) el.value = d[k];
    }
  });
  if (!v) return;
  for (const [k] of fields) if (v["d-col-" + k]) COLORS[k] = v["d-col-" + k];
  if (v["d-schemename"]) {
    schemes[v["d-schemename"]] = { ...COLORS };
    try { localStorage.setItem("WinTabIt-Schemes", JSON.stringify(schemes)); } catch (e) {}
  }
  savePrefs();
  fullRedraw();
}

function shortcutsDialog() {
  msgBox("Keyboard Shortcuts",
    "Arrows\t\tMove cursor\n" +
    "0-9\t\tEnter fret (combine digits for 10+)\n" +
    "Del / -\t\tClear note or selection\n" +
    "Backspace\tClear and move left\n" +
    "Ins / Ctrl+Del\tInsert / delete space\n" +
    "h p / \\ b ^ r ~\tHammer, pull, slides, bends, release, vibrato\n" +
    "t s w ( < {\tTap, slap, whammy, soft, harmonic, tremolo\n" +
    "x\t\tDead note     *  Stop string\n" +
    "u / d\t\tStroke up / stroke down\n" +
    "Shift+Arrows\tSelect spaces\n" +
    "Ctrl+C/X/V\tCopy / Cut / Paste\n" +
    "Ctrl+Up/Down\tPrevious / next track\n" +
    "PgUp/PgDn\tPrevious / next bar\n" +
    "Home/End\tStart / end of bar\n" +
    "F5 / F6 / F8\tPlay from start / from cursor / stop\n" +
    "Space\t\tPlay from cursor / stop");
}

function aboutDialog() {
  msgBox("About TabIt",
    "TabIt Web — a tribute to TabIt version 2.03\n\n" +
    "Original TabIt © GTAB Software (defunct).\n" +
    "This is an unofficial fan recreation of the look and feel\n" +
    "of the classic Windows tablature editor, rebuilt for the\n" +
    "browser from a Ghidra analysis of the original program.\n" +
    "Opens original .tbt files (versions 0x6f-0x72).\n\n" +
    "Not affiliated with or endorsed by the original authors.");
}

/* ================= performance builder =================
   Produces the playback order with repeats unrolled, a tempo map,
   and note/effect events in "plain space" time units. */

function buildPerformance() {
  const bl = bars();
  const geoms = song.tracks.map(trackGeom);
  // bar plain ranges
  const barPlain = [];
  let p = 0;
  for (const b of bl) { barPlain.push([p, p + b.spaces]); p += b.spaces; }

  // unroll repeats into a bar play order
  const order = [];
  let sectionStart = 0, pending = [];
  for (let k = 0; k < bl.length; k++) {
    if (bl[k].open) sectionStart = k;
    pending.push(k);
    if (bl[k].close) {
      const pre = pending.filter(b2 => b2 < sectionStart);
      order.push(...pre);
      const section = pending.filter(b2 => b2 >= sectionStart);
      const passes = Math.max(2, bl[k].repeat || 0);
      for (let r = 0; r < passes; r++) order.push(...section);
      pending = [];
      sectionStart = k + 1;
    }
  }
  order.push(...pending);

  // coalesce into plain segments with performance offsets
  const segs = [];
  let perf = 0;
  for (const k of order) {
    const [p0, p1] = barPlain[k];
    const last = segs[segs.length - 1];
    if (last && Math.abs(last.p1 - p0) < EPS) { last.p1 = p1; last.barEnds.push({ bar: k, p0, p1 }); }
    else segs.push({ p0, p1, perfStart: 0, barEnds: [{ bar: k, p0, p1 }] });
  }
  for (const s of segs) { s.perfStart = perf; perf += s.p1 - s.p0; }
  const perfTotal = perf;

  // tempo map (tempo changes from any track apply globally)
  const tempoEvents = [];
  song.tracks.forEach((tr, t) => {
    for (const k of Object.keys(tr.fx || {})) {
      const fx = tr.fx[k];
      if (fx.t !== TFX.TEMPO) continue;
      const col = Number(k);
      const g = geoms[t];
      const plain = g.plainStart[Math.min(col, g.cols)];
      tempoEvents.push({ plain, bpm: Math.max(10, Math.min(999, fx.v)) });
    }
  });
  tempoEvents.sort((a, b) => a.plain - b.plain);
  const breaks = [{ pp: 0, bpm: song.tempo }];
  for (const s of segs) {
    for (const ev of tempoEvents) {
      if (ev.plain >= s.p0 - EPS && ev.plain < s.p1 - EPS)
        breaks.push({ pp: s.perfStart + (ev.plain - s.p0), bpm: ev.bpm });
    }
  }
  breaks.sort((a, b) => a.pp - b.pp);
  // integrate seconds
  let sec = 0;
  for (let i = 0; i < breaks.length; i++) {
    breaks[i].sec = sec;
    breaks[i].spd = 60 / breaks[i].bpm / 4; // seconds per plain unit
    const next = i + 1 < breaks.length ? breaks[i + 1].pp : perfTotal;
    sec += (next - breaks[i].pp) * breaks[i].spd;
  }
  const totalSec = sec;
  const secAt = pp => {
    let b = breaks[0];
    for (let i = breaks.length - 1; i >= 0; i--)
      if (breaks[i].pp <= pp + EPS) { b = breaks[i]; break; }
    return b.sec + (pp - b.pp) * b.spd;
  };

  // per-track per-column effect state + note records
  const notes = [];
  song.tracks.forEach((tr, t) => {
    const g = geoms[t];
    const fxList = Object.keys(tr.fx || {}).map(k => [Number(k), tr.fx[k]]).sort((a, b) => a[0] - b[0]);
    let fi = 0, vol = tr.volume, pan = tr.pan, prog = tr.instrument, bend = tr.pitchBend || 0;
    const ns = tr.tuning.length;
    for (let c = 0; c < g.cols; c++) {
      let stroke = 0;
      while (fi < fxList.length && fxList[fi][0] <= c) {
        const fx = fxList[fi][1];
        if (fxList[fi][0] === c && (fx.t === TFX.STROKE_DOWN || fx.t === TFX.STROKE_UP)) stroke = fx.t;
        if (fx.t === TFX.VOLUME) vol = fx.v;
        else if (fx.t === TFX.PAN) pan = fx.v;
        else if (fx.t === TFX.INSTRUMENT) prog = fx.v & 0x7f;
        else if (fx.t === TFX.PITCH_BEND) bend = fx.v;
        fi++;
      }
      const sp = tr.spaces[c];
      if (!sp) continue;
      // stroke order: collect sounding strings
      const sounding = [];
      for (let s = 0; s < ns; s++) if (sp[s] && sp[s].fx !== "*") sounding.push(s);
      for (const s of sounding) {
        const cell = sp[s];
        // sustain: next event on this string (or any string)
        let cut = Math.min(c + 64, g.cols);
        for (let c2 = c + 1; c2 < cut; c2++) {
          const sp2 = tr.spaces[c2];
          if (!sp2) continue;
          if (tr.cutAnyString ? sp2.some(x => x) : sp2[s]) { cut = c2; break; }
        }
        let strokeIdx = 0;
        if (stroke === TFX.STROKE_DOWN) strokeIdx = sounding.length - 1 - sounding.indexOf(s);
        else if (stroke === TFX.STROKE_UP) strokeIdx = sounding.indexOf(s);
        notes.push({
          t, s, cell,
          plain: g.plainStart[c],
          plainEnd: g.plainStart[Math.min(cut, g.cols)],
          vol, pan, prog, bend,
          strokeOff: stroke ? strokeIdx * 0.018 : 0
        });
      }
    }
  });

  // playhead steps for the current track
  const g = geoms[curTrack];
  const steps = [];
  for (const s of segs) {
    for (let c = 0; c < g.cols; c++) {
      const ps = g.plainStart[c];
      if (ps >= s.p0 - EPS && ps < s.p1 - EPS)
        steps.push({ pp: s.perfStart + (ps - s.p0), col: c });
    }
  }
  steps.sort((a, b) => a.pp - b.pp);

  // metronome ticks
  const metro = [];
  if (opts.metronome) {
    for (const s of segs) {
      for (const be of s.barEnds) {
        for (let q = be.p0; q < be.p1 - EPS; q += 4) {
          metro.push({ pp: s.perfStart + (q - s.p0), accent: opts.metroAccent && Math.abs(q - be.p0) < EPS });
        }
      }
    }
  }

  return { segs, breaks, secAt, totalSec, perfTotal, notes, steps, metro, geoms };
}

/* ================= playback (Web Audio) ================= */

let audio = null, masterGain = null;
let animReq = null;
let playSteps = null, playStepIdx = 0, playT0 = 0, playTotal = 0, loopCol = 0;

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

function ksBuffer(ac, freq, dur, damp, drive) {
  const sr = ac.sampleRate;
  const n = Math.max(8, Math.floor(sr * Math.min(dur, 4)));
  const buf = ac.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / Math.max(20, freq)));
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
    const t = Math.tanh(drive);
    for (let i = 0; i < n; i++) data[i] = Math.tanh(data[i] * drive) / t;
  }
  const fade = Math.min(n, Math.floor(sr * 0.02));
  for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / fade;
  return buf;
}

function drumBuffer(ac, note) {
  const sr = ac.sampleRate;
  let dur = 0.2, gen;
  if (note === 35 || note === 36) {
    dur = 0.18;
    gen = t => Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 16);
  } else if (note === 38 || note === 40) {
    dur = 0.22;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.8 +
               Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.5;
  } else if (note === 42 || note === 44) {
    dur = 0.06;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 60);
  } else if (note === 46) {
    dur = 0.35;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 8);
  } else if (note === 49 || note === 57 || note === 55 || note === 52) {
    dur = 1.0;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 3);
  } else if (note === 51 || note === 59 || note === 53) {
    dur = 0.5;
    gen = t => (Math.random() * 2 - 1) * Math.exp(-t * 7) * 0.6 +
               Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 9) * 0.3;
  } else if (note >= 41 && note <= 50) {
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
  if (prog >= 29 && prog <= 30) return { damp: 0.999, drive: 6 };
  if (prog >= 32 && prog <= 39) return { damp: 0.997, drive: 0 };
  if (prog >= 40 && prog <= 54) return { damp: 0.9993, drive: 0 };
  if (prog >= 88 && prog <= 95) return { damp: 0.9995, drive: 0 };
  return { damp: 0.996, drive: 0 };
}

const panNodes = new Map();
function panNodeFor(ac, pan) {
  const key = pan | 0;
  let n = panNodes.get(key);
  if (!n) {
    if (ac.createStereoPanner) {
      n = ac.createStereoPanner();
      n.pan.value = (pan - 64) / 64;
    } else n = ac.createGain();
    n.connect(masterGain);
    panNodes.set(key, n);
  }
  return n;
}

function scheduleNote(ac, tr, note, when, dur) {
  const cell = note.cell;
  const dest = panNodeFor(ac, note.pan);
  const vol = (note.vol / 127) * 0.8;
  if (cell.fx === "x") {
    const buf = tr.isDrum ? drumBuffer(ac, 37)
      : ksBuffer(ac, midiFreq(tr.tuning[note.s] + cell.f), 0.09, 0.92, 0);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gg = ac.createGain();
    gg.gain.value = vol * 0.7;
    src.connect(gg).connect(dest);
    src.start(when);
    return;
  }
  if (tr.isDrum) {
    const src = ac.createBufferSource();
    src.buffer = drumBuffer(ac, Math.min(81, Math.max(35, (tr.tuning[note.s] || 0) + cell.f)));
    const gg = ac.createGain();
    gg.gain.value = vol;
    src.connect(gg).connect(dest);
    src.start(when);
    return;
  }
  const bendFactor = Math.pow(2, (note.bend / 8192) * 2 / 12);
  let pitch = tr.tuning[note.s] + cell.f;
  let freq = midiFreq(pitch) * bendFactor;
  const timbre = instrumentTimbre(note.prog);
  let damp = timbre.damp, drive = timbre.drive, gmul = 1;
  if (cell.fx === "<") { freq *= 2; damp = Math.max(damp, 0.998); gmul = 0.8; }
  if (cell.fx === "(") gmul = 0.5;
  if (cell.fx === "s") drive = Math.max(drive, 4);
  if (cell.fx === "h" || cell.fx === "p") gmul = 0.65;
  const src = ac.createBufferSource();
  src.buffer = ksBuffer(ac, freq, Math.min(dur + 0.25, 3.0), damp, drive);
  const g = ac.createGain();
  g.gain.value = vol * gmul;
  src.connect(g).connect(dest);
  const st = 2 ** (2 / 12);
  switch (cell.fx) {
    case "/": src.playbackRate.setValueAtTime(1 / st, when);
              src.playbackRate.exponentialRampToValueAtTime(1, when + Math.min(0.12, dur / 2 + 0.02)); break;
    case "\\": src.playbackRate.setValueAtTime(1, when);
               src.playbackRate.exponentialRampToValueAtTime(1 / st, when + Math.max(0.05, dur * 0.8)); break;
    case "b": case "^":
      src.playbackRate.setValueAtTime(1, when);
      src.playbackRate.exponentialRampToValueAtTime(st, when + Math.min(0.18, dur / 2 + 0.02)); break;
    case "r": src.playbackRate.setValueAtTime(st, when);
              src.playbackRate.exponentialRampToValueAtTime(1, when + Math.min(0.18, dur / 2 + 0.02)); break;
    case "w": src.playbackRate.setValueAtTime(1, when);
              src.playbackRate.exponentialRampToValueAtTime(1 / st, when + Math.max(0.06, dur * 0.4));
              src.playbackRate.exponentialRampToValueAtTime(1, when + Math.max(0.12, dur * 0.8)); break;
    case "~": {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ac.createGain();
      lg.gain.value = 0.035;
      lfo.connect(lg).connect(src.playbackRate);
      lfo.start(when + 0.1);
      lfo.stop(when + dur + 0.2);
      break;
    }
    case "{": {
      const lfo = ac.createOscillator();
      lfo.frequency.value = 9;
      const lg = ac.createGain();
      lg.gain.value = vol * gmul * 0.5;
      lfo.connect(lg).connect(g.gain);
      lfo.start(when);
      lfo.stop(when + dur + 0.2);
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
    if (!cell || cell.fx === "*") return;
    scheduleNote(ac, tr, { cell, s: str, vol: tr.volume, pan: tr.pan,
      prog: tr.instrument, bend: tr.pitchBend || 0, strokeOff: 0 },
      ac.currentTime, 60 / song.tempo);
  } catch (e) { /* audio unavailable */ }
}

function playFrom(col) {
  stopPlayback(true);
  const ac = audioCtx();
  const perf = buildPerformance();
  loopCol = col;
  playStartCol = cur.col;

  // start at the first performance step at/after the requested column
  let startStep = perf.steps.find(s => s.col >= col) || perf.steps[0] || { pp: 0, col: 0 };
  const tOffset = perf.secAt(startStep.pp);
  const t0 = ac.currentTime + 0.1;
  playT0 = t0 - tOffset;
  playTotal = perf.totalSec;

  for (const note of perf.notes) {
    const tr = song.tracks[note.t];
    if (!tr.played) continue;
    // schedule every performance occurrence of this note
    for (const seg of perf.segs) {
      if (note.plain < seg.p0 - EPS || note.plain >= seg.p1 - EPS) continue;
      const pp = seg.perfStart + (note.plain - seg.p0);
      const start = perf.secAt(pp);
      if (start < tOffset - 1e-4) continue;
      const endPlain = Math.min(note.plainEnd, seg.p1);
      const dur = Math.max(0.05, perf.secAt(pp + (endPlain - note.plain)) - start);
      scheduleNote(ac, tr, note, playT0 + start + note.strokeOff, dur);
    }
  }
  const mv = (opts.metroVolume / 127) * 0.3;
  for (const m of perf.metro) {
    const start = perf.secAt(m.pp);
    if (start < tOffset - 1e-4) continue;
    const osc = ac.createOscillator();
    osc.frequency.value = m.accent ? 1700 : 1200;
    const g = ac.createGain();
    g.gain.setValueAtTime(m.accent ? mv * 1.4 : mv, playT0 + start);
    g.gain.exponentialRampToValueAtTime(0.0001, playT0 + start + 0.04);
    osc.connect(g).connect(masterGain);
    osc.start(playT0 + start);
    osc.stop(playT0 + start + 0.05);
  }

  // playhead steps in seconds
  playSteps = perf.steps
    .map(s => ({ sec: perf.secAt(s.pp), col: s.col }))
    .filter(s => s.sec >= tOffset - 1e-4);
  playStepIdx = 0;
  playing = true;
  playCol = startStep.col;
  updateStatus();

  const tick = () => {
    if (!playing) return;
    const el = ac.currentTime - playT0;
    if (el >= playTotal + 0.3) {
      if (opts.loop) { playFrom(loopCol); return; }
      stopPlayback();
      return;
    }
    while (playStepIdx < playSteps.length && playSteps[playStepIdx].sec <= el) {
      playCol = playSteps[playStepIdx].col;
      playStepIdx++;
      if (opts.followPlayback) {
        const p = colToXY(Math.max(0, Math.min(playCol, trackGeom(track()).cols - 1)), 0);
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
  playSteps = null;
  if (audio) {
    masterGain.disconnect();
    panNodes.clear();
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
  fileName = null;
  curTrack = 0; cur = { col: 0, str: 0 }; selAnchor = null;
  undoStack.length = 0; redoStack.length = 0;
  invalidateGeom();
  fullRedraw();
}

function saveSong() {
  const base = (fileName || song.title || "Untitled").replace(/\.tabit\.json$|\.json$|\.tbt$/i, "");
  download(base + ".tabit.json",
    JSON.stringify({ format: "tabit-web-2", song }, stripPrivate, 1), "application/json");
}

async function saveSongTbt() {
  const base = (fileName || song.title || "Untitled").replace(/\.tabit\.json$|\.json$|\.tbt$/i, "");
  try {
    const data = await TBT.write(song);
    download(base + ".tbt", new Blob([data], { type: "application/octet-stream" }));
  } catch (err) {
    msgBox("TabIt", "Could not save .tbt:\n" + err.message);
  }
}

function openSongDialog() {
  document.getElementById("fileinput").click();
}

function migrateV1(s) {
  // v1 files had a flat spacesPerBar instead of barLines
  if (!s.barLines) {
    const spb = s.spacesPerBar || 16;
    const cols = Math.max(...s.tracks.map(t => t.spaces.length), spb);
    s.barLines = [];
    for (let i = 0; i < Math.ceil(cols / spb); i++)
      s.barLines.push({ spaces: spb, open: false, close: false, double: false, repeat: 0 });
  }
  s.album = s.album || "";
  s.transcribedBy = s.transcribedBy || "";
  for (const t of s.tracks) {
    t.fx = t.fx || {};
    t.topText = t.topText || {};
    t.botText = t.botText || {};
    t.alt = t.alt || null;
    t.reverb = t.reverb || 0;
    t.chorus = t.chorus || 0;
    t.cutAnyString = !!t.cutAnyString;
    t.played = t.played !== false;
  }
  return s;
}

document.getElementById("fileinput").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const buf = await f.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 3));
    if (head[0] === 0x54 && head[1] === 0x42 && head[2] === 0x54) {
      const result = await TBT.parse(buf);
      song = migrateV1(result.song);
      if (result.warnings.length) msgBox("TabIt", result.warnings.join("\n"));
    } else {
      const data = JSON.parse(new TextDecoder().decode(buf));
      if (!(data.format === "tabit-web-1" || data.format === "tabit-web-2") ||
          !data.song || !Array.isArray(data.song.tracks))
        throw new Error("incompatible version");
      song = migrateV1(data.song);
    }
    fileName = f.name.replace(/\.tabit\.json$|\.json$|\.tbt$/i, "");
    curTrack = 0; cur = { col: 0, str: 0 }; selAnchor = null;
    undoStack.length = 0; redoStack.length = 0;
    invalidateGeom();
    pane.scrollTop = 0;
    fullRedraw();
  } catch (err) {
    msgBox("TabIt", "File \"" + f.name + "\" could not be opened:\n" + err.message);
  }
});

/* ---- text export (classic ASCII tab, variable column width) ---- */

function buildText() {
  const lines = [];
  lines.push(song.title + (song.artist ? " - " + song.artist : ""));
  if (song.album) lines.push("Album: " + song.album);
  if (song.transcribedBy) lines.push("Transcribed by: " + song.transcribedBy);
  lines.push("Tempo: " + song.tempo);
  if (song.comments) lines.push(song.comments);
  lines.push("");
  for (const tr of song.tracks) {
    const g = trackGeom(tr);
    lines.push(tr.name + " (" + (tr.isDrum ? "Drums - " + DRUM_KITS[tr.drumKit] : GM_INSTRUMENTS[tr.instrument]) + ")");
    const ns = tr.tuning.length;
    const barsPerLine = 4;
    for (let lineStart = 0; lineStart < g.bars.length; lineStart += barsPerLine) {
      const rows = [];
      for (let s = 0; s < ns; s++) {
        let label = tr.isDrum ? "D" : NOTE_NAMES[((tr.tuning[s] % 12) + 12) % 12];
        if (s === 0 && !tr.isDrum) label = label.toLowerCase();
        rows.push(label.padEnd(2) + "|");
      }
      for (let k = lineStart; k < Math.min(lineStart + barsPerLine, g.bars.length); k++) {
        const b = g.bars[k];
        for (let c = b.start; c < b.start + b.cols; c++) {
          const sp = c < tr.spaces.length ? tr.spaces[c] : null;
          let w = 1;
          if (sp) for (const cell of sp) {
            if (!cell) continue;
            const t = cellText(cell);
            w = Math.max(w, t.length);
          }
          for (let s = 0; s < ns; s++) {
            const cell = sp ? sp[s] : null;
            rows[s] += (cell ? cellText(cell) : "").padEnd(w, "-");
          }
        }
        for (let s = 0; s < ns; s++) rows[s] += "|";
        if (bars()[k].close) for (let s = 0; s < ns; s++) rows[s] += "|";
      }
      lines.push(...rows, "");
    }
    lines.push("");
  }
  lines.push("Generated by TabIt Web (tribute to TabIt 2.03)");
  return lines.join("\r\n");
}

function cellText(cell) {
  if (cell.fx === "x") return "x";
  if (cell.fx === "*") return "*";
  return String(cell.f) + (cell.fx || "");
}

function exportText() {
  download((song.title || "Untitled") + ".txt", buildText(), "text/plain");
}

/* ---- print preview ---- */

function printPreview() {
  let area = document.getElementById("printarea");
  if (!area) {
    area = document.createElement("div");
    area.id = "printarea";
    document.body.appendChild(area);
  }
  area.innerHTML = "<pre>" + buildText().replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>";
  showDialog("Print Preview",
    "<pre style='max-height:340px'>" + buildText().replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>",
    ["Print", "Close"]).then(v => {
    if (v) window.print();
  });
}

/* ---- MIDI export ---- */

function exportMidi() {
  const TPQN = 480, TICKS_PER_PLAIN = TPQN / 4;
  const perf = buildPerformance();
  const tk = pp => Math.max(0, Math.round(pp * TICKS_PER_PLAIN));
  const vlq = n => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    return out;
  };
  const str2bytes = s => Array.from(s, c => c.charCodeAt(0) & 0xff);
  const trackChunk = events => {
    events.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
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
  const tempoEv = perf.breaks.map(b => {
    const us = Math.round(60000000 / b.bpm);
    return [tk(b.pp), [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255], 0];
  });
  tempoEv.push([0, [0xff, 0x03, Math.min(127, song.title.length), ...str2bytes(song.title)], 0]);
  chunks.push(trackChunk(tempoEv));

  let chan = 0;
  song.tracks.forEach((tr, t) => {
    let ch = tr.isDrum ? 9 : chan;
    if (!tr.isDrum) { chan++; if (chan === 9) chan++; chan %= 16; }
    const ev = [];
    let seq = 0;
    const push = (tick, bytes) => ev.push([tick, bytes, seq++]);
    push(0, [0xff, 0x03, Math.min(127, tr.name.length), ...str2bytes(tr.name)]);
    if (!tr.isDrum) push(0, [0xc0 | ch, tr.instrument & 127]);
    push(0, [0xb0 | ch, 7, tr.volume & 127]);
    push(0, [0xb0 | ch, 10, tr.pan & 127]);
    push(0, [0xb0 | ch, 91, (tr.reverb || 0) & 127]);
    push(0, [0xb0 | ch, 93, (tr.chorus || 0) & 127]);
    // effect changes at every performance occurrence
    const g = perf.geoms[t];
    for (const k of Object.keys(tr.fx || {})) {
      const fx = tr.fx[k];
      const plain = g.plainStart[Math.min(Number(k), g.cols)];
      for (const seg of perf.segs) {
        if (plain < seg.p0 - EPS || plain >= seg.p1 - EPS) continue;
        const tick = tk(seg.perfStart + (plain - seg.p0));
        if (fx.t === TFX.VOLUME) push(tick, [0xb0 | ch, 7, fx.v & 127]);
        else if (fx.t === TFX.PAN) push(tick, [0xb0 | ch, 10, fx.v & 127]);
        else if (fx.t === TFX.CHORUS) push(tick, [0xb0 | ch, 93, fx.v & 127]);
        else if (fx.t === TFX.REVERB) push(tick, [0xb0 | ch, 91, fx.v & 127]);
        else if (fx.t === TFX.MODULATION) push(tick, [0xb0 | ch, 1, fx.v & 127]);
        else if (fx.t === TFX.INSTRUMENT && !tr.isDrum) push(tick, [0xc0 | ch, fx.v & 127]);
        else if (fx.t === TFX.PITCH_BEND) {
          const b14 = Math.max(0, Math.min(16383, fx.v + 8192));
          push(tick, [0xe0 | ch, b14 & 0x7f, (b14 >> 7) & 0x7f]);
        }
      }
    }
    for (const note of perf.notes) {
      if (note.t !== t || note.cell.fx === "x") continue;
      const pitch = tr.isDrum ? Math.min(127, Math.max(0, note.cell.f))
        : Math.min(127, Math.max(0, tr.tuning[note.s] + note.cell.f));
      for (const seg of perf.segs) {
        if (note.plain < seg.p0 - EPS || note.plain >= seg.p1 - EPS) continue;
        const on = tk(seg.perfStart + (note.plain - seg.p0)) + (note.strokeOff ? Math.round(note.strokeOff * 100) : 0);
        const off = Math.max(on + 1, tk(seg.perfStart + (Math.min(note.plainEnd, seg.p1) - seg.p0)));
        push(on, [0x90 | ch, pitch, 96]);
        push(off, [0x80 | ch, pitch, 0]);
      }
    }
    chunks.push(trackChunk(ev));
  });

  const nTracks = chunks.length;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
    (nTracks >> 8) & 255, nTracks & 255, (TPQN >> 8) & 255, TPQN & 255];
  const bytes = new Uint8Array([...header, ...chunks.flat()]);
  download((song.title || "Untitled") + ".mid", new Blob([bytes], { type: "audio/midi" }));
}

/* ================= boot ================= */

loadPrefs();
applyFontSize();
buildMenuBar();
setInterval(() => {
  if (opts.caretBlink && !playing && document.getElementById("dialoglayer").hidden) {
    caretOn = !caretOn;
    draw();
  }
}, 530);
window.addEventListener("resize", fullRedraw);
fullRedraw();

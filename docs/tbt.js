/* TabIt .tbt binary file format reader.
   Format documented by the tabit-file-format reverse-engineering project
   (github.com/bostick/tabit-file-format). Supports versions 0x6f-0x72
   (TabIt ~1.55 through 2.03). */
"use strict";

const TBT = (() => {

  // slot 0 = low E; offsets are relative to these open-string pitches
  const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64, 40, 40];

  const NOTE_EFFECT_CODES = {
    0x28: "(",  // Soft
    0x2f: "/",  // Slide up
    0x3c: "<",  // Harmonic
    0x5c: "\\", // Slide down
    0x5e: "^",  // Bend up
    0x62: "b",  // Bend
    0x68: "h",  // Hammer-on
    0x70: "p",  // Pull-off
    0x72: "r",  // Release
    0x73: "s",  // Slap
    0x74: "t",  // Tap
    0x77: "w",  // Whammy
    0x7b: "{",  // Tremolo
    0x7e: "~"   // Vibrato
  };

  // old-style (version <= 0x70) slot-16 track effect codes -> effect type ids
  const OLD_TRACK_FX = {
    0x44: 1,  // 'D' stroke down
    0x55: 2,  // 'U' stroke up
    0x54: 3,  // 'T' tempo
    0x74: 3,  // 't' tempo (value + 250)
    0x49: 4,  // 'I' instrument
    0x56: 5,  // 'V' volume
    0x50: 6,  // 'P' pan
    0x43: 7,  // 'C' chorus
    0x52: 8   // 'R' reverb
  };

  let crcTable = null;
  function crc32(bytes, len) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c;
      }
    }
    let c = 0xffffffff;
    for (let i = 0; i < len; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function inflate(u8) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("This browser cannot decompress .tbt files (no DecompressionStream).");
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function deflate(u8) {
    if (typeof CompressionStream === "undefined")
      throw new Error("This browser cannot write .tbt files (no CompressionStream).");
    const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  class Reader {
    constructor(u8) { this.b = u8; this.p = 0; }
    u8()  { return this.b[this.p++]; }
    i8()  { const v = this.u8(); return v > 0x7f ? v - 0x100 : v; }
    u16() { const v = this.b[this.p] | (this.b[this.p + 1] << 8); this.p += 2; return v; }
    i16() { const v = this.u16(); return v > 0x7fff ? v - 0x10000 : v; }
    u32() {
      const v = (this.b[this.p] | (this.b[this.p + 1] << 8) |
        (this.b[this.p + 2] << 16)) + this.b[this.p + 3] * 0x1000000;
      this.p += 4; return v;
    }
    bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
    pascal2() {
      const n = this.u16();
      return Array.from(this.bytes(n), c => String.fromCharCode(c)).join("");
    }
  }

  // Expand consecutive delta-list chunks until targetLen bytes are produced.
  // Chunk = u16 pairCount, then pairCount*2 bytes of (increment, payload)
  // entries; increment byte 0x00 means a u16 increment follows.
  function readDeltaList(r, targetLen) {
    const out = new Uint8Array(targetLen);
    let pos = 0;
    while (pos < targetLen) {
      const chunkBytes = r.u16() * 2;
      let consumed = 0;
      while (consumed < chunkBytes) {
        let inc = r.u8(); consumed += 1;
        if (inc === 0) { inc = r.u16(); consumed += 2; }
        const payload = r.u8(); consumed += 1;
        if (inc > 0) {
          out.fill(payload, pos, Math.min(targetLen, pos + inc));
          pos += inc;
        }
      }
    }
    return out;
  }

  async function parse(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    if (u8.length < 64 || u8[0] !== 0x54 || u8[1] !== 0x42 || u8[2] !== 0x54)
      throw new Error("Not a TabIt file (bad magic).");
    const version = u8[3];
    if (version < 0x6f || version > 0x72)
      throw new Error("incompatible version (0x" + version.toString(16) +
        "); only TabIt 1.55+ files (versions 0x6f-0x72) are supported.");

    const dv = new DataView(arrayBuffer);
    const trackCount = u8[5];
    const featureBits = u8[0x0b];
    const barCount = dv.getUint16(0x28, true);
    const spaceCount6f = dv.getUint16(0x2a, true);
    const tempo = dv.getUint16(0x2e, true);
    const metaLen = dv.getUint32(0x30, true);
    const crcHeader = dv.getUint32(0x3c, true);
    const warnings = [];
    if (crc32(u8, 60) !== crcHeader)
      warnings.push("Header checksum mismatch (file may be damaged).");

    const meta = new Reader(await inflate(u8.subarray(64, 64 + metaLen)));
    const body = new Reader(await inflate(u8.subarray(64 + metaLen)));

    /* ---- metadata ---- */
    const T = trackCount;
    const arr = fn => Array.from({ length: T }, fn);
    const spaceCounts = version >= 0x70 ? arr(() => meta.u32()) : arr(() => spaceCount6f);
    const stringCounts = arr(() => meta.u8());
    const cleanGuitar = arr(() => meta.u8());
    arr(() => meta.u8()); // mutedGuitar (program used for muted notes)
    const volumes = arr(() => meta.u8());
    let modulations = arr(() => 0), pitchBends = arr(() => 0);
    if (version >= 0x71) {
      modulations = arr(() => meta.u8());
      pitchBends = arr(() => meta.i16());
    }
    const transposes = arr(() => meta.i8());
    arr(() => meta.u8()); // midiBank
    const reverbs = arr(() => meta.u8());
    const choruses = arr(() => meta.u8());
    const pans = arr(() => meta.u8());
    arr(() => meta.u8()); // highestNote
    arr(() => meta.u8()); // displayMIDINoteNumbers
    arr(() => meta.u8()); // midiChannel
    arr(() => meta.u8()); // topLineText flag
    arr(() => meta.u8()); // bottomLineText flag
    const tunings = arr(() => Array.from({ length: 8 }, () => meta.i8()));
    const drums = arr(() => meta.u8());
    const title = meta.pascal2();
    const artist = meta.pascal2();
    const album = meta.pascal2();
    const transcribedBy = meta.pascal2();
    const comment = meta.pascal2();

    /* ---- body: bar lines ---- */
    const barLines = [];
    if (version >= 0x70) {
      for (let i = 0; i < barCount; i++) {
        const inc = body.u32();
        const flags = body.u8();
        const repeat = body.u8();
        if (flags & 0x04) { // close repeat belongs to the previous bar
          const prev = barLines[barLines.length - 1];
          if (prev) { prev.close = true; prev.repeat = repeat || 2; }
        }
        if (inc > 0) {
          barLines.push({
            spaces: inc,
            open: !!(flags & 0x02),
            double: !!(flags & 0x01),
            close: false, repeat: 0
          });
        }
      }
    } else {
      // one delta-encoded byte per space; barline markers split the spaces
      const bl = readDeltaList(body, spaceCount6f);
      let start = 0;
      let cur = { spaces: 0, open: false, double: false, close: false, repeat: 0 };
      const flush = end => {
        if (end > start) { cur.spaces = end - start; barLines.push(cur); }
      };
      for (let i = 1; i <= spaceCount6f; i++) {
        const v = i < spaceCount6f ? bl[i] : 1;
        const type = v & 0x0f;
        if (type === 0 && i < spaceCount6f) continue;
        if (type === 2) { // close repeat ends the bar we are flushing
          flush(i);
          if (barLines.length) {
            const prev = barLines[barLines.length - 1];
            prev.close = true; prev.repeat = (v >> 4) || 2;
          }
        } else flush(i);
        start = i;
        cur = { spaces: 0, open: type === 3, double: type === 4, close: false, repeat: 0 };
      }
    }
    if (!barLines.length) barLines.push({ spaces: 16, open: false, double: false, close: false, repeat: 0 });

    /* ---- body: notes per track ---- */
    const tracks = [];
    for (let t = 0; t < T; t++) {
      const sc = spaceCounts[t];
      const ns = Math.min(8, Math.max(1, stringCounts[t]));
      const isDrum = !!drums[t];
      const data = readDeltaList(body, 20 * sc);
      const spaces = new Array(sc).fill(null);
      const topText = {}, botText = {}, fx = {};
      for (let i = 0; i < sc; i++) {
        const base = i * 20;
        let sp = null;
        for (let slot = 0; slot < ns; slot++) {
          const v = data[base + slot];
          const e = data[base + 8 + slot];
          const sDisp = ns - 1 - slot; // display row 0 = highest string
          let cell = null;
          if (v >= 0x80) cell = { f: v - 0x80, fx: null };
          else if (v === 0x11) cell = { f: 0, fx: "x" };
          else if (v === 0x12) cell = { f: 0, fx: "*" };
          if (cell && NOTE_EFFECT_CODES[e] && !cell.fx) cell.fx = NOTE_EFFECT_CODES[e];
          if (cell) {
            if (!sp) sp = new Array(ns).fill(null);
            sp[sDisp] = cell;
          }
        }
        spaces[i] = sp;
        if (version <= 0x70) {
          const fe = data[base + 16];
          if (fe && OLD_TRACK_FX[fe] !== undefined) {
            let val = data[base + 19];
            if (fe === 0x74) val += 250;
            fx[i] = { t: OLD_TRACK_FX[fe], v: val };
          }
        }
        const tc = data[base + 17], bc = data[base + 18];
        if (tc >= 0x20 && tc < 0x7f) topText[i] = String.fromCharCode(tc);
        if (bc >= 0x20 && bc < 0x7f) botText[i] = String.fromCharCode(bc);
      }

      // display tuning: row 0 (top) = highest string = slot ns-1
      const tuning = [];
      for (let sDisp = 0; sDisp < ns; sDisp++) {
        const slot = ns - 1 - sDisp;
        tuning.push(isDrum ? 0 :
          OPEN_STRING_MIDI[slot] + tunings[t][slot] + transposes[t]);
      }

      tracks.push({
        name: "Track " + (t + 1),
        instrument: cleanGuitar[t] & 0x7f,
        isDrum, drumKit: 0,
        cutAnyString: !!(cleanGuitar[t] & 0x80),
        tuning,
        volume: volumes[t], pan: pans[t],
        reverb: reverbs[t], chorus: choruses[t],
        modulation: modulations[t], pitchBend: pitchBends[t],
        played: true,
        spaces, fx, topText, botText, alt: null
      });
    }

    /* ---- body: alternate time regions ---- */
    if (version >= 0x70 && (featureBits & 0x10)) {
      for (let t = 0; t < T; t++) {
        const sc = spaceCounts[t];
        const data = readDeltaList(body, 2 * sc);
        const alt = new Array(sc).fill(null);
        let any = false;
        for (let i = 0; i < sc; i++) {
          const den = data[i * 2], num = data[i * 2 + 1];
          if (den > 0 && num > 0) { alt[i] = [num, den]; any = true; }
        }
        if (any) tracks[t].alt = alt;
      }
    }

    /* ---- body: track effect changes ---- */
    if (version >= 0x71) {
      for (let t = 0; t < T; t++) {
        const byteLen = body.u32();
        const end = body.p + byteLen;
        let pos = 0;
        while (body.p + 8 <= end) {
          const d = body.u16();
          const type = body.u16();
          body.u16(); // reserved
          const value = body.i16();
          pos += d;
          if (type >= 1 && type <= 10) tracks[t].fx[pos] = { t: type, v: value };
        }
        body.p = end;
      }
    }

    return {
      song: {
        title: title || "Untitled", artist, album, transcribedBy, comments: comment,
        tempo, spacesPerBar: 16,
        barLines, tracks
      },
      version, warnings
    };
  }

  // ---- writer (version 0x72) ----

  const FX_TO_CODE = {};
  for (const code in NOTE_EFFECT_CODES) FX_TO_CODE[NOTE_EFFECT_CODES[code]] = Number(code);

  class Builder {
    constructor() { this.a = []; }
    u8(v) { this.a.push(v & 0xff); return this; }
    i8(v) { return this.u8(v < 0 ? v + 256 : v); }
    u16(v) { return this.u8(v).u8(v >> 8); }
    i16(v) { return this.u16(v < 0 ? v + 0x10000 : v); }
    u32(v) { return this.u8(v).u8(v >> 8).u8(v >> 16).u8(v >>> 24); }
    bytes(arr) { for (const b of arr) this.a.push(b & 0xff); return this; }
    pascal2(s) {
      const b = Array.from(String(s), c => c.charCodeAt(0) & 0xff).slice(0, 65535);
      this.u16(b.length); return this.bytes(b);
    }
    out() { return new Uint8Array(this.a); }
  }

  function writeDeltaList(arr) {
    const b = new Builder();
    const pairs = [];
    let nPairs = 0, i = 0;
    while (i < arr.length) {
      let j = i;
      while (j < arr.length && arr[j] === arr[i]) j++;
      let run = j - i;
      const val = arr[i];
      while (run > 0) {
        const take = Math.min(run, 65535);
        if (take < 256) { pairs.push(take, val); nPairs += 1; }
        else { pairs.push(0, take & 0xff, (take >> 8) & 0xff, val); nPairs += 2; }
        run -= take;
      }
      i = j;
    }
    b.u16(nPairs).bytes(pairs);
    return b.out();
  }

  // geometry helpers mirroring the editor's track geometry
  function trackCols(song, tr) {
    const pt = song.barLines.reduce((s, b) => s + b.spaces, 0);
    if (!tr.alt) return pt;
    let cum = 0, cols = 0;
    const ratio = i => tr.alt[i] ? tr.alt[i][1] / tr.alt[i][0] : 1;
    while (cum < pt - 1e-6) { cum += ratio(cols); cols++; }
    return Math.max(cols, 1);
  }

  async function write(song) {
    const tracks = song.tracks, T = tracks.length;
    const spaceCounts = tracks.map(tr => trackCols(song, tr));
    const hasAlt = tracks.some(tr => tr.alt);

    const m = new Builder();
    for (const sc of spaceCounts) m.u32(sc);
    m.bytes(tracks.map(tr => tr.tuning.length));
    m.bytes(tracks.map(tr => (tr.instrument & 0x7f) | (tr.cutAnyString ? 0x80 : 0)));
    m.bytes(tracks.map(tr => tr.instrument & 0x7f));            // mutedGuitar
    m.bytes(tracks.map(tr => tr.volume & 0x7f));
    m.bytes(tracks.map(tr => (tr.modulation || 0) & 0x7f));
    for (const tr of tracks) m.i16(Math.max(-8192, Math.min(8191, tr.pitchBend || 0)));
    for (let i = 0; i < T; i++) m.i8(0);                        // transpose (folded into tuning)
    for (let i = 0; i < T; i++) m.u8(0);                        // midiBank
    m.bytes(tracks.map(tr => (tr.reverb || 0) & 0x7f));
    m.bytes(tracks.map(tr => (tr.chorus || 0) & 0x7f));
    m.bytes(tracks.map(tr => tr.pan & 0x7f));
    for (let i = 0; i < T; i++) m.u8(0x18);                     // highestNote
    for (let i = 0; i < T; i++) m.u8(0);                        // displayMIDINoteNumbers
    for (let i = 0; i < T; i++) m.u8(0xff);                     // midiChannel auto
    m.bytes(tracks.map(tr => tr.topText && Object.keys(tr.topText).length ? 1 : 0));
    m.bytes(tracks.map(tr => tr.botText && Object.keys(tr.botText).length ? 1 : 0));
    for (const tr of tracks) {
      const ns = tr.tuning.length;
      for (let slot = 0; slot < 8; slot++) {
        if (tr.isDrum || slot >= ns) { m.i8(0); continue; }
        const disp = ns - 1 - slot;
        m.i8(Math.max(-128, Math.min(127, tr.tuning[disp] - OPEN_STRING_MIDI[slot])));
      }
    }
    m.bytes(tracks.map(tr => tr.isDrum ? 1 : 0));
    m.pascal2(song.title || "").pascal2(song.artist || "").pascal2(song.album || "")
     .pascal2(song.transcribedBy || "").pascal2(song.comments || "");

    const body = new Builder();
    let barRecords = 0;
    for (const b of song.barLines) {
      const flags = (b.double ? 0x01 : 0) | (b.open ? 0x02 : 0);
      body.u32(b.spaces).u8(flags).u8(0); barRecords++;
      if (b.close) { body.u32(0).u8(0x04).u8(Math.max(2, b.repeat || 2)); barRecords++; }
    }
    for (let t = 0; t < T; t++) {
      const tr = tracks[t], sc = spaceCounts[t], ns = tr.tuning.length;
      const data = new Uint8Array(20 * sc);
      for (let c = 0; c < Math.min(sc, tr.spaces.length); c++) {
        const sp = tr.spaces[c], base = c * 20;
        if (sp) for (let disp = 0; disp < ns; disp++) {
          const cell = sp[disp];
          if (!cell) continue;
          const slot = ns - 1 - disp;
          if (cell.fx === "x") data[base + slot] = 0x11;
          else if (cell.fx === "*") data[base + slot] = 0x12;
          else {
            data[base + slot] = 0x80 + Math.max(0, Math.min(99, cell.f));
            if (cell.fx && FX_TO_CODE[cell.fx]) data[base + 8 + slot] = FX_TO_CODE[cell.fx];
          }
        }
        const tc = tr.topText && tr.topText[c], bc = tr.botText && tr.botText[c];
        if (tc) data[base + 17] = tc.charCodeAt(0) & 0x7f;
        if (bc) data[base + 18] = bc.charCodeAt(0) & 0x7f;
      }
      body.bytes(writeDeltaList(data));
    }
    if (hasAlt) {
      for (let t = 0; t < T; t++) {
        const tr = tracks[t], sc = spaceCounts[t];
        const data = new Uint8Array(2 * sc);
        const alt = tr.alt || [];
        for (let c = 0; c < Math.min(sc, alt.length); c++) {
          if (alt[c]) { data[c * 2] = alt[c][1] & 0xff; data[c * 2 + 1] = alt[c][0] & 0xff; }
        }
        body.bytes(writeDeltaList(data));
      }
    }
    for (let t = 0; t < T; t++) {
      const fx = tracks[t].fx || {};
      const cols = Object.keys(fx).map(Number).sort((a, b) => a - b);
      const chunk = new Builder();
      let prev = 0;
      for (const col of cols) {
        chunk.i16(col - prev).i16(fx[col].t).i16(0)
             .i16(Math.max(-32768, Math.min(32767, fx[col].v)));
        prev = col;
      }
      const cbytes = chunk.out();
      body.u32(cbytes.length).bytes(cbytes);
    }

    const metaZ = await deflate(m.out());
    const bodyZ = await deflate(body.out());

    const header = new Uint8Array(64);
    const hv = new DataView(header.buffer);
    header[0] = 0x54; header[1] = 0x42; header[2] = 0x54; header[3] = 0x72;
    header[4] = Math.min(255, song.tempo);
    header[5] = T;
    header[6] = 4; header[7] = 50; header[8] = 46; header[9] = 48; header[10] = 51; // "2.03"
    header[0x0b] = 0x0f | (hasAlt ? 0x10 : 0);
    hv.setUint16(0x28, barRecords, true);
    hv.setUint16(0x2e, Math.min(65535, song.tempo), true);
    hv.setUint32(0x30, metaZ.length, true);
    hv.setUint32(0x34, crc32(bodyZ, bodyZ.length), true);
    hv.setUint32(0x38, 64 + metaZ.length + bodyZ.length, true);
    hv.setUint32(0x3c, crc32(header, 60), true);

    const out = new Uint8Array(64 + metaZ.length + bodyZ.length);
    out.set(header, 0);
    out.set(metaZ, 64);
    out.set(bodyZ, 64 + metaZ.length);
    return out;
  }

  return { parse, write, crc32, readDeltaList, Reader, OPEN_STRING_MIDI };
})();

if (typeof module !== "undefined") module.exports = TBT;

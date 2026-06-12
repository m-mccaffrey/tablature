"""Reader for the original TabIt .tbt binary file format.

Format documented by the tabit-file-format reverse-engineering project
(github.com/bostick/tabit-file-format). Supports versions 0x6f-0x72
(TabIt ~1.55 through 2.03).
"""

import struct
import zlib

from .model import make_bar

# slot 0 = low E; offsets are relative to these open-string pitches
OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64, 40, 40]

NOTE_EFFECT_CODES = {
    0x28: "(", 0x2F: "/", 0x3C: "<", 0x5C: "\\", 0x5E: "^", 0x62: "b",
    0x68: "h", 0x70: "p", 0x72: "r", 0x73: "s", 0x74: "t", 0x77: "w",
    0x7B: "{", 0x7E: "~",
}

# old-style (version <= 0x70) slot-16 track effect codes -> effect type ids
OLD_TRACK_FX = {
    0x44: 1, 0x55: 2, 0x54: 3, 0x74: 3, 0x49: 4, 0x56: 5, 0x50: 6, 0x43: 7, 0x52: 8,
}


class TbtError(Exception):
    pass


class Reader:
    def __init__(self, data):
        self.b = data
        self.p = 0

    def u8(self):
        v = self.b[self.p]
        self.p += 1
        return v

    def i8(self):
        v = self.u8()
        return v - 256 if v > 0x7F else v

    def u16(self):
        v = self.b[self.p] | (self.b[self.p + 1] << 8)
        self.p += 2
        return v

    def i16(self):
        v = self.u16()
        return v - 0x10000 if v > 0x7FFF else v

    def u32(self):
        (v,) = struct.unpack_from("<I", self.b, self.p)
        self.p += 4
        return v

    def pascal2(self):
        n = self.u16()
        s = self.b[self.p:self.p + n].decode("latin-1")
        self.p += n
        return s


def read_delta_list(r, target_len):
    """Expand consecutive delta-list chunks until target_len bytes are
    produced. Chunk = u16 pair count, then pairs of (increment, payload);
    increment byte 0x00 means a u16 increment follows."""
    out = bytearray(target_len)
    pos = 0
    while pos < target_len:
        chunk_bytes = r.u16() * 2
        consumed = 0
        while consumed < chunk_bytes:
            inc = r.u8()
            consumed += 1
            if inc == 0:
                inc = r.u16()
                consumed += 2
            payload = r.u8()
            consumed += 1
            if inc > 0:
                end = min(target_len, pos + inc)
                if payload and end > pos:
                    out[pos:end] = bytes([payload]) * (end - pos)
                pos += inc
    return bytes(out)


def parse(data):
    """Parse .tbt bytes -> (song dict, version, warnings)."""
    if len(data) < 64 or data[:3] != b"TBT":
        raise TbtError("Not a TabIt file (bad magic).")
    version = data[3]
    if not 0x6F <= version <= 0x72:
        raise TbtError(
            "incompatible version (0x%02x); only TabIt 1.55+ files "
            "(versions 0x6f-0x72) are supported." % version)

    track_count = data[5]
    feature_bits = data[0x0B]
    (bar_count,) = struct.unpack_from("<H", data, 0x28)
    (space_count_6f,) = struct.unpack_from("<H", data, 0x2A)
    (tempo,) = struct.unpack_from("<H", data, 0x2E)
    (meta_len,) = struct.unpack_from("<I", data, 0x30)
    (crc_header,) = struct.unpack_from("<I", data, 0x3C)
    warnings = []
    if zlib.crc32(data[:60]) != crc_header:
        warnings.append("Header checksum mismatch (file may be damaged).")

    meta = Reader(zlib.decompress(data[64:64 + meta_len]))
    body = Reader(zlib.decompress(data[64 + meta_len:]))

    T = track_count
    if version >= 0x70:
        space_counts = [meta.u32() for _ in range(T)]
    else:
        space_counts = [space_count_6f] * T
    string_counts = [meta.u8() for _ in range(T)]
    clean_guitar = [meta.u8() for _ in range(T)]
    [meta.u8() for _ in range(T)]  # mutedGuitar
    volumes = [meta.u8() for _ in range(T)]
    if version >= 0x71:
        modulations = [meta.u8() for _ in range(T)]
        pitch_bends = [meta.i16() for _ in range(T)]
    else:
        modulations = [0] * T
        pitch_bends = [0] * T
    transposes = [meta.i8() for _ in range(T)]
    [meta.u8() for _ in range(T)]  # midiBank
    reverbs = [meta.u8() for _ in range(T)]
    choruses = [meta.u8() for _ in range(T)]
    pans = [meta.u8() for _ in range(T)]
    [meta.u8() for _ in range(T)]  # highestNote
    [meta.u8() for _ in range(T)]  # displayMIDINoteNumbers
    [meta.u8() for _ in range(T)]  # midiChannel
    [meta.u8() for _ in range(T)]  # topLineText flag
    [meta.u8() for _ in range(T)]  # bottomLineText flag
    tunings = [[meta.i8() for _ in range(8)] for _ in range(T)]
    drums = [meta.u8() for _ in range(T)]
    title = meta.pascal2()
    artist = meta.pascal2()
    album = meta.pascal2()
    transcribed_by = meta.pascal2()
    comment = meta.pascal2()

    # ---- body: bar lines ----
    bar_lines = []
    if version >= 0x70:
        for _ in range(bar_count):
            inc = body.u32()
            flags = body.u8()
            repeat = body.u8()
            if flags & 0x04 and bar_lines:  # close repeat belongs to the previous bar
                bar_lines[-1]["close"] = True
                bar_lines[-1]["repeat"] = repeat or 2
            if inc > 0:
                bar_lines.append({
                    "spaces": inc, "open": bool(flags & 0x02),
                    "double": bool(flags & 0x01), "close": False, "repeat": 0,
                })
    else:
        bl = read_delta_list(body, space_count_6f)
        start = 0
        cur = make_bar(0)
        for i in range(1, space_count_6f + 1):
            v = bl[i] if i < space_count_6f else 1
            t = v & 0x0F
            if t == 0 and i < space_count_6f:
                continue
            if i > start:
                cur["spaces"] = i - start
                bar_lines.append(cur)
            if t == 2 and bar_lines:
                bar_lines[-1]["close"] = True
                bar_lines[-1]["repeat"] = (v >> 4) or 2
            start = i
            cur = make_bar(0)
            cur["open"] = t == 3
            cur["double"] = t == 4
    if not bar_lines:
        bar_lines.append(make_bar(16))

    # ---- body: notes per track ----
    tracks = []
    for t in range(T):
        sc = space_counts[t]
        ns = min(8, max(1, string_counts[t]))
        is_drum = bool(drums[t])
        data_t = read_delta_list(body, 20 * sc)
        spaces = [None] * sc
        top_text, bot_text, fx = {}, {}, {}
        for i in range(sc):
            base = i * 20
            sp = None
            for slot in range(ns):
                v = data_t[base + slot]
                e = data_t[base + 8 + slot]
                s_disp = ns - 1 - slot  # display row 0 = highest string
                cell = None
                if v >= 0x80:
                    cell = {"f": v - 0x80, "fx": None}
                elif v == 0x11:
                    cell = {"f": 0, "fx": "x"}
                elif v == 0x12:
                    cell = {"f": 0, "fx": "*"}
                if cell and e in NOTE_EFFECT_CODES and not cell["fx"]:
                    cell["fx"] = NOTE_EFFECT_CODES[e]
                if cell:
                    if sp is None:
                        sp = [None] * ns
                    sp[s_disp] = cell
            spaces[i] = sp
            if version <= 0x70:
                fe = data_t[base + 16]
                if fe in OLD_TRACK_FX:
                    val = data_t[base + 19]
                    if fe == 0x74:
                        val += 250
                    fx[str(i)] = {"t": OLD_TRACK_FX[fe], "v": val}
            tc, bc = data_t[base + 17], data_t[base + 18]
            if 0x20 <= tc < 0x7F:
                top_text[str(i)] = chr(tc)
            if 0x20 <= bc < 0x7F:
                bot_text[str(i)] = chr(bc)

        tuning = []
        for s_disp in range(ns):
            slot = ns - 1 - s_disp
            tuning.append(0 if is_drum else
                          OPEN_STRING_MIDI[slot] + tunings[t][slot] + transposes[t])

        tracks.append({
            "name": "Track %d" % (t + 1),
            "instrument": clean_guitar[t] & 0x7F,
            "isDrum": is_drum, "drumKit": 0,
            "cutAnyString": bool(clean_guitar[t] & 0x80),
            "tuning": tuning,
            "volume": volumes[t], "pan": pans[t],
            "reverb": reverbs[t], "chorus": choruses[t],
            "modulation": modulations[t], "pitchBend": pitch_bends[t],
            "played": True,
            "spaces": spaces, "fx": fx, "topText": top_text, "botText": bot_text,
            "alt": None,
        })

    # ---- body: alternate time regions ----
    if version >= 0x70 and feature_bits & 0x10:
        for t in range(T):
            sc = space_counts[t]
            data_t = read_delta_list(body, 2 * sc)
            alt = [None] * sc
            any_region = False
            for i in range(sc):
                den, num = data_t[i * 2], data_t[i * 2 + 1]
                if den > 0 and num > 0:
                    alt[i] = [num, den]
                    any_region = True
            if any_region:
                tracks[t]["alt"] = alt

    # ---- body: track effect changes ----
    if version >= 0x71:
        for t in range(T):
            byte_len = body.u32()
            end = body.p + byte_len
            pos = 0
            while body.p + 8 <= end:
                d = body.u16()
                etype = body.u16()
                body.u16()  # reserved
                value = body.i16()
                pos += d
                if 1 <= etype <= 10:
                    tracks[t]["fx"][str(pos)] = {"t": etype, "v": value}
            body.p = end

    song = {
        "title": title or "Untitled", "artist": artist, "album": album,
        "transcribedBy": transcribed_by, "comments": comment,
        "tempo": tempo, "spacesPerBar": 16,
        "barLines": bar_lines, "tracks": tracks,
    }
    return song, version, warnings

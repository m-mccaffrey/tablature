"""Writer for the original TabIt .tbt binary file format (version 0x72).

The inverse of tbtfile.parse: serializes a song dict so the result opens
in the original TabIt and round-trips through this package's reader.

Pitch is stored as per-string offsets from the standard open-string
pitches (transpose is folded into those offsets, matching how the reader
presents tuning), so any song authored here writes cleanly.
"""

import struct
import zlib

from .constants import (TFX_STROKE_DOWN, TFX_STROKE_UP)
from .model import track_geom, plain_total
from .tbtfile import OPEN_STRING_MIDI, NOTE_EFFECT_CODES

VERSION = 0x72

# our effect char -> .tbt per-string effect code (inverse of NOTE_EFFECT_CODES)
_FX_TO_CODE = {ch: code for code, ch in NOTE_EFFECT_CODES.items()}


def _write_delta_list(arr):
    """Encode a byte sequence as one delta-list chunk: u16 pair-count,
    then (increment, payload) entries. Runs >= 256 use the 0x00 + u16
    extended increment form."""
    pairs = bytearray()
    n_pairs = 0
    i, L = 0, len(arr)
    while i < L:
        j = i
        while j < L and arr[j] == arr[i]:
            j += 1
        run, val = j - i, arr[i]
        while run > 0:
            take = min(run, 65535)
            if take < 256:
                pairs.append(take)
                pairs.append(val)
                n_pairs += 1
            else:
                pairs.append(0)
                pairs += struct.pack("<H", take)
                pairs.append(val)
                n_pairs += 2
            run -= take
        i = j
    return struct.pack("<H", n_pairs) + bytes(pairs)


def _pascal2(s):
    b = s.encode("latin-1", "replace")[:65535]
    return struct.pack("<H", len(b)) + b


def write(song):
    """Serialize a song dict to .tbt bytes (version 0x72)."""
    tracks = song["tracks"]
    T = len(tracks)
    geoms = [track_geom(song, tr) for tr in tracks]
    space_counts = [g["cols"] for g in geoms]
    has_alt = any(tr.get("alt") for tr in tracks)

    # ---- metadata ----
    m = bytearray()
    for sc in space_counts:
        m += struct.pack("<I", sc)
    m += bytes(len(tr["tuning"]) for tr in tracks)                       # stringCount
    m += bytes((tr["instrument"] & 0x7F) | (0x80 if tr.get("cutAnyString") else 0)
               for tr in tracks)                                          # cleanGuitar
    m += bytes(tr["instrument"] & 0x7F for tr in tracks)                  # mutedGuitar
    m += bytes(tr["volume"] & 0x7F for tr in tracks)                      # volume
    m += bytes(tr.get("modulation", 0) & 0x7F for tr in tracks)          # modulation
    for tr in tracks:
        m += struct.pack("<h", max(-8192, min(8191, tr.get("pitchBend", 0))))  # pitchBend
    m += struct.pack("<%db" % T, *([0] * T))                             # transpose (folded into tuning)
    m += bytes(T)                                                         # midiBank
    m += bytes(tr.get("reverb", 0) & 0x7F for tr in tracks)              # reverb
    m += bytes(tr.get("chorus", 0) & 0x7F for tr in tracks)             # chorus
    m += bytes(tr["pan"] & 0x7F for tr in tracks)                        # pan
    m += bytes([0x18] * T)                                               # highestNote
    m += bytes(T)                                                         # displayMIDINoteNumbers
    m += bytes([0xFF] * T)                                               # midiChannel (auto)
    m += bytes(1 if tr.get("topText") else 0 for tr in tracks)          # topLineText flag
    m += bytes(1 if tr.get("botText") else 0 for tr in tracks)          # bottomLineText flag
    for tr in tracks:                                                     # tuning: 8 signed offsets
        ns = len(tr["tuning"])
        offs = []
        for slot in range(8):
            if tr.get("isDrum") or slot >= ns:
                offs.append(0)
            else:
                disp = ns - 1 - slot
                off = tr["tuning"][disp] - OPEN_STRING_MIDI[slot]
                offs.append(max(-128, min(127, off)))
        m += struct.pack("<8b", *offs)
    m += bytes(1 if tr.get("isDrum") else 0 for tr in tracks)            # drums
    m += _pascal2(song.get("title", ""))
    m += _pascal2(song.get("artist", ""))
    m += _pascal2(song.get("album", ""))
    m += _pascal2(song.get("transcribedBy", ""))
    m += _pascal2(song.get("comments", ""))

    # ---- body ----
    body = bytearray()

    # bar lines: one record per bar; a close-repeat adds a trailing
    # zero-increment record carrying the play count.
    bar_records = 0
    for b in song["barLines"]:
        flags = (0x01 if b.get("double") else 0) | (0x02 if b.get("open") else 0)
        body += struct.pack("<IBB", b["spaces"], flags, 0)
        bar_records += 1
        if b.get("close"):
            body += struct.pack("<IBB", 0, 0x04, max(2, b.get("repeat", 0) or 2))
            bar_records += 1

    # notes: 20 slots per space
    for t, tr in enumerate(tracks):
        sc = space_counts[t]
        ns = len(tr["tuning"])
        data = bytearray(20 * sc)
        for c in range(min(sc, len(tr["spaces"]))):
            sp = tr["spaces"][c]
            base = c * 20
            if sp:
                for disp in range(ns):
                    cell = sp[disp]
                    if not cell:
                        continue
                    slot = ns - 1 - disp
                    fx = cell.get("fx")
                    if fx == "x":
                        data[base + slot] = 0x11
                    elif fx == "*":
                        data[base + slot] = 0x12
                    else:
                        data[base + slot] = 0x80 + min(99, max(0, cell["f"]))
                        if fx and fx in _FX_TO_CODE:
                            data[base + 8 + slot] = _FX_TO_CODE[fx]
            tc = (tr.get("topText") or {}).get(str(c))
            bc = (tr.get("botText") or {}).get(str(c))
            if tc:
                data[base + 17] = ord(tc[0]) & 0x7F
            if bc:
                data[base + 18] = ord(bc[0]) & 0x7F
        body += _write_delta_list(data)

    # alternate time regions
    if has_alt:
        for t, tr in enumerate(tracks):
            sc = space_counts[t]
            data = bytearray(2 * sc)
            alt = tr.get("alt") or []
            for c in range(min(sc, len(alt))):
                if alt[c]:
                    num, den = alt[c]
                    data[c * 2] = den & 0xFF
                    data[c * 2 + 1] = num & 0xFF
            body += _write_delta_list(data)

    # track effect changes: chunk4 of 8-byte entries (relative increments)
    for t, tr in enumerate(tracks):
        entries = sorted((int(k), v) for k, v in (tr.get("fx") or {}).items())
        chunk = bytearray()
        prev = 0
        for col, fx in entries:
            inc = col - prev
            prev = col
            chunk += struct.pack("<hhhh", inc, fx["t"], 0,
                                 max(-32768, min(32767, fx["v"])))
        body += struct.pack("<I", len(chunk)) + bytes(chunk)

    meta_z = zlib.compress(bytes(m), 9)
    body_z = zlib.compress(bytes(body), 9)

    # ---- header (64 bytes) ----
    header = bytearray(64)
    header[0:3] = b"TBT"
    header[3] = VERSION
    header[4] = min(255, song["tempo"])                 # tempo1
    header[5] = T                                        # track count
    vs = b"2.03"
    header[6] = len(vs)
    header[7:7 + len(vs)] = vs                           # pascal1 version string
    header[0x0B] = 0x0F | (0x10 if has_alt else 0)       # feature bitfield
    struct.pack_into("<H", header, 0x28, bar_records)    # bar count (records)
    struct.pack_into("<H", header, 0x2A, 0)              # spaceCount (v6f only)
    struct.pack_into("<H", header, 0x2C, 0)              # lastNonEmptySpace (v6f only)
    struct.pack_into("<H", header, 0x2E, min(65535, song["tempo"]))  # tempo2
    struct.pack_into("<I", header, 0x30, len(meta_z))    # compressed metadata length
    struct.pack_into("<I", header, 0x34, zlib.crc32(body_z))  # CRC32 body
    total = 64 + len(meta_z) + len(body_z)
    struct.pack_into("<I", header, 0x38, total)          # total byte count
    struct.pack_into("<I", header, 0x3C, zlib.crc32(bytes(header[:60])))  # CRC32 header

    return bytes(header) + meta_z + body_z

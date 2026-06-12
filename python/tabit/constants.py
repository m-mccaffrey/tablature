"""Shared constants for TabIt Py.

Instrument names, tuning presets, and UI wording were recovered from a
Ghidra analysis of the original WinTabIt 2.03 executable.
"""

# GM instrument names exactly as the original binary stores them.
GM_INSTRUMENTS = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
    "Rhodes Piano", "Chorused Piano", "Harpsichord", "Clavinet Chromatic",
    "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
    "Hammond Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
    "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
    "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
    "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
    "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
    "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
    "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
    "Choir", "Voice", "Synth Voice", "Orchestra Hit",
    "Trumpet", "Trombone", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
    "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "English Horn", "Bassoon", "Clarinet",
    "Piccolo", "Flute", "Recorder", "Pan Flute", "Bottle Blow", "Shakuhachi", "Whistle", "Ocarina",
    "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (caliope lead)", "Lead 4 (chiff lead)",
    "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (brass + lead)",
    "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
    "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
    "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
    "Sitar", "Banjo", "Shamisen", "Kalimba", "Bagpipe", "Fiddle", "Shanai",
    "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
    "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone", "Helicopter", "Applause", "Gunshot",
]

DRUM_KITS = ["Standard", "Power", "Electronic", "TR-808", "Brush", "Orchestra"]

# Built-in tuning presets recovered from the binary's preset tuning list.
# MIDI note numbers, top (highest) display string first.
BUILTIN_TUNINGS = {
    "(Standard)":      [64, 59, 55, 50, 45, 40],
    "Dropped D":       [64, 59, 55, 50, 45, 38],
    "D Tuning":        [62, 57, 53, 48, 43, 38],
    "C Tuning":        [60, 55, 51, 46, 41, 36],
    "G Tuning":        [62, 59, 55, 50, 43, 38],
    "Open A":          [64, 61, 57, 52, 45, 40],
    "Open C":          [64, 60, 55, 48, 43, 36],
    "Open D":          [62, 57, 54, 50, 45, 38],
    "Open E":          [64, 59, 56, 52, 47, 40],
    "Bass (Standard)": [43, 38, 33, 28],
}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(m):
    return NOTE_NAMES[m % 12] + str(m // 12 - 1)


# Note effects, displayed with the same characters the original uses.
EFFECTS = {
    "h": "Hammer-on", "p": "Pull-off", "/": "Slide Up", "\\": "Slide Down",
    "b": "Bend", "^": "Bend Up", "r": "Release", "~": "Vibrato",
    "t": "Tapping", "s": "Slap", "w": "Whammy", "(": "Soft",
    "<": "Harmonic", "{": "Tremolo",
}

# Track effect change types (same ids as the .tbt format).
TFX_STROKE_DOWN = 1
TFX_STROKE_UP = 2
TFX_TEMPO = 3
TFX_INSTRUMENT = 4
TFX_VOLUME = 5
TFX_PAN = 6
TFX_CHORUS = 7
TFX_REVERB = 8
TFX_MODULATION = 9
TFX_PITCH_BEND = 10

TFX_NAMES = {
    1: "Stroke Down", 2: "Stroke Up", 3: "Tempo Change", 4: "Instrument Change",
    5: "Volume Change", 6: "Pan Change", 7: "Chorus Change", 8: "Reverb Change",
    9: "Modulation Change", 10: "Pitch Bend Change",
}

MAX_FRET = 99

# MidiSketch

Theory-driven MIDI chord arranger that runs entirely in the browser. Pick a key and scale, build progressions from diatonic chords, add bass and melody, preview instantly and export as a standard MIDI file.

## Run it

[Open MidiSketch](https://antoinefortin.github.io/Aideas/MidiSketch/)

## Features

- **10 scales**: Major, Natural Minor, Dorian, Mixolydian, Phrygian, Lydian, Harmonic Minor, Melodic Minor, Pentatonic Major/Minor, Blues
- **Diatonic chord palette**: triads shown by default, right-click for seventh chords
- **Common progressions**: one-click presets (I-IV-V-I, ii-V-I, Andalusian cadence, etc.) adapted to major and minor modes
- **Drag-and-drop arrangement**: reorder chords by dragging, remove with the X button
- **Three tracks**: chords, bassline (root-fifth patterns), melody (chord-tone and passing-tone patterns) — each toggleable
- **Live preview**: Web Audio API playback with highlighted active chord
- **MIDI export**: standard Format 1 MIDI file with separate tracks for chords, bass and melody
- **Configurable**: BPM and beats per chord (2, 4 or 8)

## How it works

All chord voicings, basslines and melodies are derived from music theory (diatonic harmony, voice leading, chord-tone targeting). No AI generation involved.

1. Select a root note and scale.
2. Click diatonic chords to add them, or pick a preset progression.
3. Toggle bass and melody tracks on or off.
4. Hit **Play** to preview.
5. Hit **Download MIDI** to export.

Import the MIDI file into any DAW (Ableton, FL Studio, Logic, Reaper, GarageBand, etc.) to assign real instruments.

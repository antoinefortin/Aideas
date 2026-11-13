# SilenceCut

Remove silence from audio recordings directly in your browser. No uploads, no server, no account.

## Features

- Volume-based silence detection with adjustable threshold, minimum duration and padding
- Long recording mode streams directly to disk (hours-long files supported)
- Side-by-side before/after playback with waveform visualisation
- 16-bit PCM WAV export (RF64 if the output exceeds 4 GiB)
- Works entirely client-side in a single HTML file

## Run it

Open the file locally or use the hosted version:

[Run SilenceCut](https://antoinefortin.github.io/Aideas/Silencer/)

## Usage

1. Drop or browse for an audio file (MP3, WAV, M4A, OGG, FLAC, WebM).
2. Adjust the three sliders: silence threshold, minimum silence duration, padding around speech.
3. Enable **Long recording mode** for large files (Chrome/Edge on desktop recommended).
4. Click **Remove silence** and preview the result.
5. Download the trimmed WAV.

## Credits

Uses Mediabunny 1.65.2 (MPL-2.0). See the embedded license and source notice in the HTML file.

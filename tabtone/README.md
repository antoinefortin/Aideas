# Tabtone

One click records the current Chrome tab. A second click stops and downloads a stereo, 192 kbps MP3. Audio is encoded locally; no server, account, microphone access, or upload is involved.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `tabtone` folder from your local copy of this repository.
4. Open Chrome’s puzzle-piece extensions menu and pin **Tabtone**.

Requires Chrome 116 or newer. This is a local, unpacked extension, not a Chrome Web Store listing.

## Record

Play audio in a regular website tab and click Tabtone’s toolbar icon. The **REC** badge confirms recording. Click the icon again to stop and save. You can switch tabs while recording; the original tab stays the recording source. Alternatively use **Alt+Shift+R** (customizable at `chrome://extensions/shortcuts`). Right-click the extension and choose **Options** for help and the most recent filename.

Files download into your configured Downloads folder under **Tabtone**, for example:

`An interesting podcast — example.com — 2026-11-11 23-42-08.mp3`

The name uses the page title and hostname at the moment recording starts, followed by your local date and time. Invalid filename characters are removed and duplicate filenames are handled by Chrome. Chrome’s “Ask where to save each file” setting can still display a save prompt.

Closing the captured tab finishes the recording. Keep Chrome running until saving completes. Browser internal pages, the Chrome Web Store, and some protected media may reject capture. A single tab can be recorded at a time. Very long recordings use increasing memory for the compressed MP3; audio is encoded continuously instead of retaining uncompressed PCM.

If a download fails, leave Chrome open and use **Retry last download** in Options. The latest MP3 is retained in memory until the next recording finishes or Chrome closes. Closing Chrome during a recording loses unsaved audio.

## Development

No build step or runtime package installation is required. After editing, reload the extension on `chrome://extensions`.

Run `npm test` for filename and real MP3 encoder tests. JavaScript can be syntax-checked with `node --check filename.js`.

Manual browser acceptance check:
- Play a tab, click the icon, verify REC and continued audible playback.
- Switch tabs; click again, verify the original tab’s title in the MP3 filename.
- Play the downloaded MP3 and verify captured audio.
- Start another recording and close the source tab; verify automatic saving.
- Try an internal Chrome page; verify the actionable error in Options.

Uses a Manifest V3 service worker, Chrome tabCapture, an offscreen document, an AudioWorklet, and a local worker running lamejs 1.2.1. The encoder is bundled under `vendor/`; its LGPL license is included alongside it. Source package: https://www.npmjs.com/package/lamejs; upstream: https://github.com/zhuker/lamejs.

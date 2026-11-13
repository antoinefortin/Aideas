# TorrentDrop

Paste a magnet link or drop a .torrent file and get direct download links for every file. No server, no backend — everything runs in your browser via WebRTC peer-to-peer.

## Run it

[Open TorrentDrop](https://antoinefortin.github.io/Aideas/TorrentDrop/)

## How it works

1. Paste a magnet link (or info hash) or drop a `.torrent` file.
2. The browser connects to peers via WebRTC using WebTorrent.
3. Files download directly into browser memory.
4. Click individual download buttons or grab everything as a ZIP.

## Limitations

- Only connects to **WebRTC-capable peers** (other WebTorrent users) and **web seeds**. Traditional BitTorrent-only peers (desktop clients without WebRTC) cannot be reached from the browser.
- Files are held in memory. Very large torrents may slow down or crash the tab.
- Requires a modern browser with WebRTC support (Chrome, Edge, Firefox, Safari 15+).

## Credits

- [WebTorrent](https://webtorrent.io/) (MIT) — streaming torrent client for the browser
- [JSZip](https://stuk.github.io/jszip/) (MIT) — ZIP generation for multi-file downloads

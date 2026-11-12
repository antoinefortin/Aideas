# Footfall

A three.js scene where a Mixamo-rigged character walks across snow, sand or mud and leaves real footprints — the ground mesh is vertex-displaced by a GPU height map that every footfall presses into. The walker can also stop, scoop snow into a ball, pack it and throw it; the ball punches a crater and crumbles into chunks that leave their own traces.

## Run it

**Live (GitHub Pages):** https://antoinefortin.github.io/Aideas/threejs-environment-experiments/footfall/

**Locally, in one command** (fetches only this folder, then serves it and opens the browser — needs git and Python 3):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/antoinefortin/Aideas.git && cd Aideas && git sparse-checkout set threejs-environment-experiments/footfall && sh threejs-environment-experiments/footfall/run.sh
```

**From an existing clone:** `sh threejs-environment-experiments/footfall/run.sh` (optionally a port: `sh threejs-environment-experiments/footfall/run.sh 9000`).

There's no build step — it's plain HTML + ES modules with three.js from a CDN, so any static server works. It can't be opened as a `file://` page (browsers block ES modules there). Add `?lite` to the URL for a lighter ground mesh.

## Controls

- **Click** the ground — walk there
- **Right-click** / **Shift-click** — throw a snowball at that spot
- **T** — throw straight ahead · **R** — walk / run · **C** — clear prints
- Drag to orbit · the panel on the right has surface presets, print depth, rim, tread, refill rate, sun, sound and a depth-map view
- Drop a Mixamo `.fbx` (downloaded "With Skin", with a walk clip) onto the page to swap the character

## How it works

- **`src/trail.js`** — two half-float render targets (ping-pong) store the pressed depth (R) and pushed-up rim (G). Prints are oriented quads drawn with MAX blending; shapes are a lugged boot sole, a round bowl (scoop, chunks) and an impact crater with spray streaks. A slow refill pass lets old prints fill back in.
- **`src/ground.js`** — a 1024×1024 plane whose vertices are displaced by that map in the vertex shader; normals are rebuilt per-pixel from the same height field, plus grain noise.
- **`src/walker.js`** — loads the character (default: the three.js Soldier sample, Mixamo rig), strips root motion, then calibrates walking speed and facing from how fast a planted foot slides in the in-place animation, so there's no foot sliding. Feet press only when low *and* still; the planted foot is locked while turning.
- **`src/throw.js`** — the snowball throw is procedural (the sample has no throw clip): hips drop, spine bends/twists, and two-bone IK keeps the feet planted and drives the hands through scoop → pack → wind-up → release. Ballistic flight, crater, chunk physics.
- **`src/effects.js`** — kicked-up powder particles and procedural Web Audio footsteps.

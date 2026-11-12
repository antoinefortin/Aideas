# Wake

A three.js scene where a Mixamo-rigged character wades through water. A GPU wave simulation reacts to everything that touches the surface — the walker's legs push a bow wave and leave a wake, dropped stones splash and send out rings, rain stipples it — and the surface mesh is vertex-displaced by those ripples plus wind waves. 12 water presets, from a tropical lagoon to liquid mercury.

## Run it

**Live (GitHub Pages):** https://antoinefortin.github.io/Aideas/threejs-environment-experiments/wake/

**Locally, in one command** (fetches only this folder, then serves it and opens the browser — needs git and Python 3):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/antoinefortin/Aideas.git && cd Aideas && git sparse-checkout set threejs-environment-experiments/wake && sh threejs-environment-experiments/wake/run.sh
```

**From an existing clone:** `sh threejs-environment-experiments/wake/run.sh` (optionally a port: `sh threejs-environment-experiments/wake/run.sh 9000`).

No build step — plain HTML + ES modules, three.js from a CDN. Add `?lite` for a lighter sim and mesh, or `?preset=Stormy%20Sea` to open on a preset.

## Presets

| | |
|---|---|
| **Calm Lake** | Still, clear freshwater over a sandy bed |
| **Tropical Lagoon** | Turquoise shallows, white sand, strong caustics |
| **Stormy Sea** | Dark swell, whitecaps, rain |
| **Mountain Stream** | Glass-clear, flowing, over pebbles |
| **Murky Swamp** | Brown-green, viscous, ripples die fast |
| **Swimming Pool** | Waist-deep over tiles and lane lines |
| **Moonlit Night** | Moon path and stars on black water |
| **Sunset Shallows** | Low golden sun, long glitter path |
| **Rainy Pond** | Grey drizzle stippling the surface |
| **Arctic Meltwater** | Icy cyan over cracked bedrock |
| **Liquid Mercury** | Opaque, mirror-bright liquid metal |
| **Bioluminescent Bay** | Night water that glows where it's disturbed |

Every value is adjustable in the panel: depth, wind waves, wake strength, ripple speed and lifetime, murkiness, foam, caustics, rain, sun.

## Controls

- **Click** the water — walk there · **Right-click** / **Shift-click** — drop a stone there
- **S** — stone ahead · **R** — walk / run · **1–9** or **[ ]** — presets · **C** — calm the water
- Drag to orbit · drop a Mixamo `.fbx` (with skin + a walk clip) to swap the character

## How it works

- **`src/sim.js`** — the discrete wave equation on a 512² half-float ping-pong texture (height, velocity, foam), with an absorbing border. Disturbances are queued as Gaussian impulses.
- **`src/wading.js`** — finds where each limb segment crosses the surface; its horizontal motion pushes water up in front and down behind (bow wave + V wake), fast plunges splash.
- **`src/water.js`** — vertices displaced by four Gerstner waves + the sim; per-pixel normals add capillary detail. The scene below is rendered to a texture with depth first, so the surface refracts it and absorbs light per colour channel by the length of water the view ray crosses (Beer–Lambert), blended with an analytic sky by Fresnel.
- **`src/floor.js`** — procedural sand ripples, pebbles, pool tiles, mud or rock, with caustics from animated Voronoi patterns modulated by the sim's curvature, so ripples focus light into rings on the bed.
- **`src/presets.js`** — the 12 water types. **`src/walker.js`** is shared with [Footfall](../footfall/): stride auto-calibration from the animation, so feet don't slide.

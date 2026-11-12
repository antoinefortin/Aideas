# Splinter

A first-person three.js scene: a procedurally modelled pump-action shotgun with physically based materials, firing at a target board made of pine planks. Every pellet punches a **real hole through the wood** — you can see through it, look at the torn end grain inside, and walk round the back to find the exit tear-out.

## Run it

**Live (GitHub Pages):** https://antoinefortin.github.io/Aideas/threejs-environment-experiments/splinter/

**Locally, in one command** (needs git and Python 3):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/antoinefortin/Aideas.git && cd Aideas && git sparse-checkout set threejs-environment-experiments/splinter && sh threejs-environment-experiments/splinter/run.sh
```

**From an existing clone:** `sh threejs-environment-experiments/splinter/run.sh` (optionally a port).

No build step — plain HTML + ES modules, three.js from a CDN, HDR skies from the three.js examples. Add `?lite` for a lower-resolution hole map.

## Controls

- **Click** / **Space** — fire at the cursor · hold **right-click** (or toggle **Z**) — zoom on the target
- **1–3** — ammo: 00 Buck (9 pellets, through-holes), Birdshot #7½ (140 pellets, shallow dents), Slug (one big hole, splits along the grain)
- **I** — inspect the board: orbit it, zoom in, go round the back · **G** — inspect the gun · **Esc** — back · **C** — new board
- Panel: spread (choke), distance, paper target, sky (5 HDRs), exposure, flash bloom, volume

## How it works

- **`src/holes.js`** — a half-float texture in board space stores, per pellet (MAX-blended): entry coverage, exit tear-out (bigger, ragged, stretched along the grain), penetration depth (through vs blind dent) and damage (crushed-fibre bruise + splits running along the grain).
- **`src/board.js`** — the planks are plain boxes; the holes are carved in the fragment shader. Where the map says "open", the view ray is marched through the 35 mm thickness: if it reaches the far side the pixel is discarded (see-through), otherwise it shades the hole wall — end grain from the same 3D wood function, darker with depth — or the bottom of a dent. Exit tear-out gets torn-fibre noise along the grain. A custom depth material lets sunlight through the holes in the shadows. The paper target shares the map (with a grey "bullet wipe" ring).
- **`src/glsl.js`** — procedural wood: growth rings around a pith running along the grain, slightly tilted to the cut so planks show cathedral arches; knots, fibres, walnut pores and figure; detail fades with distance to avoid aliasing.
- **`src/shotgun.js`** — the gun from primitives: rounded receiver, barrel with brushed anisotropic highlight, vent rib and brass bead, magazine tube, lathe-turned grooved walnut pump, extruded walnut stock under clearcoat, rubber pad, trigger group, ejection port with a moving bolt, engraved roll mark. Blued steel uses canvas-generated roughness maps (smudges, scratches). Recoil spring and a full pump cycle.
- **`src/effects.js`** — muzzle flash (blooms), light flash, smoke, wood chips and splinters (instanced, with physics), sawdust and dirt puffs, ejected shells that bounce and stay, procedural sound (report with outdoor slap-back, pump clacks, impact delayed by distance, shells hitting the ground).
- **`src/range.js`** — dirt floor and backstop berm; HDR sky as background and image-based lighting, with the sun direction found from the HDR's brightest pixel.

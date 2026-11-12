# three.js environment experiments

Interactive three.js scenes where a Mixamo-rigged walker leaves a trace in its environment. Each one is a self-contained folder: plain HTML + ES modules, three.js from a CDN, no build step.

| | | |
|---|---|---|
| **[Footfall](footfall/)** | Snow, sand or mud: every step presses vertex-displaced footprints into the ground; the walker can scoop, pack and throw snowballs that leave craters. | [▶ Run it](https://antoinefortin.github.io/Aideas/threejs-environment-experiments/footfall/) |
| **[Wake](wake/)** | Water: a GPU wave simulation reacts to the walker's legs (bow wave + wake), dropped stones and rain; 12 water presets from tropical lagoon to liquid mercury. | [▶ Run it](https://antoinefortin.github.io/Aideas/threejs-environment-experiments/wake/) |

## Run locally

Fetch just this folder, then start any of the experiments (needs git and Python 3):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/antoinefortin/Aideas.git && cd Aideas && git sparse-checkout set threejs-environment-experiments
```

```bash
sh threejs-environment-experiments/footfall/run.sh
```

```bash
sh threejs-environment-experiments/wake/run.sh
```

Each `run.sh` serves its folder and opens the browser (Footfall on port 8752, Wake on 8754; pass another port as an argument).

## Shared pieces

Both scenes use the same walker (`src/walker.js`): it loads a Mixamo character (default: the three.js Soldier sample), strips root motion and calibrates walking speed from the animation itself, so feet don't slide. You can drop your own Mixamo `.fbx` (with skin + a walk clip) onto either page.

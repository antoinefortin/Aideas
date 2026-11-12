import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { createSky, skyUniforms } from './sky.js';
import { setWaves, waveHeight, waveUniforms } from './waves.js';
import { WaveSim } from './sim.js';
import { createWater } from './water.js';
import { createFloor, floorHeight, floorState, FLOOR_TYPES } from './floor.js';
import { Walker, loadCharacter, DEFAULT_MODEL_URLS } from './walker.js';
import { Wading } from './wading.js';
import { Stones } from './stones.js';
import { Rain, Droplets, WaterSounds } from './effects.js';
import { PRESETS } from './presets.js';

const AREA = 24;
const query = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// Renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, query.has('lite') ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0ee, 30, 150);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 900);
camera.position.set(4.2, 2.4, 5.8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.4;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

const sky = createSky();
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const sim = new WaveSim(renderer, { area: AREA, resolution: query.has('lite') ? 384 : 512 });
const floor = createFloor({ sim, area: AREA });
scene.add(floor.mesh);
const water = createWater({ renderer, sim, area: AREA, segments: query.has('lite') ? 256 : 384 });
scene.add(water.group);

const walker = new Walker(scene);
walker.groundHeight = floorHeight;
const wading = new Wading(walker);
const stones = new Stones(scene);
const rain = new Rain(scene);
const droplets = new Droplets(scene);
const sounds = new WaterSounds();

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.22, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0, depthWrite: false })
);
marker.renderOrder = 3;
scene.add(marker);

// ---------------------------------------------------------------------------
// Settings + presets
const settings = {
  preset: query.get('preset') && PRESETS[query.get('preset')] ? query.get('preset') : 'Calm Lake',
  gait: 'Walk',
  pace: 1,
  autoWander: true,
  depth: 0.5,
  waveScale: 1,
  wake: 1,
  clarity: 1,
  speed: 1.8,
  damping: 0.995,
  foam: 1,
  caustics: 1,
  rain: 0,
  sunElev: 30,
  sunAzim: 150,
  follow: true,
  sound: false,
  showSim: false,
  dropStone: () => dropAhead(),
  calm: () => {
    sim.clear();
    stones.clear();
  },
};
let preset = PRESETS[settings.preset];

const $blurb = document.getElementById('blurb');
const $chips = document.getElementById('presets');

function applyPreset(name) {
  const P = PRESETS[name];
  if (!P) return;
  preset = P;
  settings.preset = name;
  Object.assign(settings, {
    depth: P.depth,
    waveScale: P.waveScale,
    clarity: P.clarity,
    speed: P.k,
    damping: P.damping,
    foam: P.foam,
    caustics: P.caustics,
    rain: P.rain,
    sunElev: P.sunElev,
    sunAzim: P.sunAzim,
  });

  floorState.variation = P.floorVar;
  const fu = floor.uniforms;
  fu.uFloorType.value = FLOOR_TYPES[P.floor];
  fu.uFloorA.value.set(P.floorA);
  fu.uFloorB.value.set(P.floorB);
  fu.uFloorVar.value = P.floorVar;

  setWaves(P.waves);
  waveUniforms.uDetail.value = P.detail;
  waveUniforms.uDetailScale.value = P.detailScale;
  waveUniforms.uFlow.value.fromArray(P.flow);

  const wu = water.uniforms;
  wu.uAbsorb.value.fromArray(P.absorb);
  wu.uScatter.value.set(P.scatter);
  wu.uOpaque.value = P.opaque;
  wu.uF0.value = P.f0;
  wu.uShininess.value = P.shininess;
  wu.uSpec.value = P.spec;
  wu.uRefract.value = P.refract;
  wu.uFoamColor.value.set(P.foamColor);
  wu.uFoamLight.value = P.foamLight;
  wu.uGlow.value = P.glow;
  wu.uWhitecaps.value = P.whitecaps;
  sim.material.uniforms.uFoamDecay.value = P.foamDecay;

  skyUniforms.uSkyTop.value.set(P.skyTop);
  skyUniforms.uSkyHorizon.value.set(P.skyHorizon);
  skyUniforms.uSkyBottom.value.set(P.skyBottom);
  skyUniforms.uSunColor.value.set(P.sun);
  skyUniforms.uSunIntensity.value = P.sunIntensity;
  skyUniforms.uSunSize.value = P.sunSize;
  skyUniforms.uStars.value = P.stars;
  sun.color.set(P.sun);
  sun.intensity = P.sunIntensity;
  hemi.color.set(P.hemiSky);
  hemi.groundColor.set(P.hemiGround);
  hemi.intensity = P.hemi;
  scene.fog.color.set(P.fog);
  scene.fog.near = P.fogNear;
  scene.fog.far = P.fogFar;
  wu.uFogColor.value.copy(scene.fog.color);
  wu.uFogNear.value = P.fogNear;
  wu.uFogFar.value = P.fogFar;
  renderer.toneMappingExposure = P.exposure;
  droplets.material.uniforms.uColor.value.set(P.glow ? P.foamColor : '#eaf6ff');
  rain.material.opacity = P.stars ? 0.15 : 0.5;

  walker.pace = settings.pace * P.pace;
  $blurb.textContent = P.blurb;
  [...$chips.children].forEach((c) => {
    c.classList.toggle('active', c.dataset.name === name);
    if (c.dataset.name === name) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  try {
    localStorage.setItem('wake.preset', name);
  } catch {}
}

function applySun() {
  const el = THREE.MathUtils.degToRad(settings.sunElev);
  const az = THREE.MathUtils.degToRad(settings.sunAzim);
  skyUniforms.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

// Preset chips
Object.keys(PRESETS).forEach((name, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.name = name;
  b.innerHTML = `<i style="background:${PRESETS[name].scatter};--glow:${PRESETS[name].glow ? PRESETS[name].foamColor : 'transparent'}"></i>${name}`;
  b.title = `${PRESETS[name].blurb}${i < 9 ? `  [${i + 1}]` : ''}`;
  b.addEventListener('click', () => {
    applyPreset(name);
    applySun();
  });
  $chips.appendChild(b);
});

// GUI
const gui = new GUI({ title: 'Wake' });
const fWalk = gui.addFolder('Walker');
const gaitCtl = fWalk
  .add(settings, 'gait', ['Walk', 'Run'])
  .name('Gait  [R]')
  .onChange((g) => walker.setGait(g.toLowerCase()));
fWalk.add(settings, 'pace', 0.4, 1.6, 0.01).name('Pace').onChange((v) => (walker.pace = v * preset.pace));
fWalk.add(settings, 'autoWander').name('Wander on its own').onChange((v) => {
  walker.autoWander = v;
  if (v) walker.moving = true;
});
fWalk.add(settings, 'dropStone').name('Drop a stone  [S]');
const fWater = gui.addFolder('Water');
fWater.add(settings, 'preset', Object.keys(PRESETS)).name('Preset').onChange((n) => {
  applyPreset(n);
  applySun();
});
fWater.add(settings, 'depth', 0.15, 1.3, 0.01).name('Depth (m)');
fWater.add(settings, 'waveScale', 0, 2, 0.01).name('Wind waves');
fWater.add(settings, 'wake', 0, 3, 0.01).name('Wake strength');
fWater.add(settings, 'speed', 0.3, 2, 0.01).name('Ripple speed');
fWater.add(settings, 'damping', 0.95, 0.999, 0.001).name('Ripple life');
fWater.add(settings, 'clarity', 0.1, 3, 0.01).name('Murkiness');
fWater.add(settings, 'foam', 0, 3, 0.01).name('Foam');
fWater.add(settings, 'caustics', 0, 3, 0.01).name('Caustics');
fWater.add(settings, 'rain', 0, 3000, 10).name('Rain (drops/s)');
fWater.add(settings, 'calm').name('Calm the water  [C]');
const fScene = gui.addFolder('Scene');
fScene.add(settings, 'sunElev', 2, 80, 0.5).name('Sun height (°)').onChange(applySun);
fScene.add(settings, 'sunAzim', 0, 360, 1).name('Sun direction (°)').onChange(applySun);
fScene.add(settings, 'follow').name('Camera follows');
fScene.add(settings, 'showSim').name('Show ripple sim');
fScene.add(settings, 'sound').name('Water sounds').onChange((v) => sounds.setEnabled(v));
if (window.innerWidth < 760) gui.close();

let startPreset = settings.preset;
try {
  if (!query.get('preset') && PRESETS[localStorage.getItem('wake.preset')]) startPreset = localStorage.getItem('wake.preset');
} catch {}
applyPreset(startPreset);
applySun();

// ---------------------------------------------------------------------------
// HUD + loading
const $stats = document.getElementById('stats');
const $loader = document.getElementById('loader');
function setStatus(text, isError = false) {
  $loader.textContent = text;
  $loader.classList.toggle('error', isError);
  $loader.classList.toggle('hidden', !text);
}

function useCharacter({ model, clips }) {
  setStatus('Calibrating stride…');
  const info = walker.setModel(model, clips);
  wading.attach();
  gaitCtl.enable(info.hasRun);
  if (!info.hasRun) {
    settings.gait = 'Walk';
    walker.setGait('walk');
    gaitCtl.updateDisplay();
  }
  walker.pace = settings.pace * preset.pace;
  setStatus('');
}

(async () => {
  setStatus('Loading walker…');
  for (const url of DEFAULT_MODEL_URLS) {
    try {
      useCharacter(await loadCharacter(url, 'glb'));
      return;
    } catch (e) {
      console.warn('Model load failed:', url, e);
    }
  }
  setStatus('Could not load the default character. Drop a Mixamo .fbx or .glb onto the page.', true);
})();

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['fbx', 'glb'].includes(ext)) return setStatus('Drop a .fbx or .glb file', true);
  const url = URL.createObjectURL(file);
  setStatus(`Loading ${file.name}…`);
  try {
    useCharacter(await loadCharacter(url, ext));
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Could not load that file', true);
  } finally {
    URL.revokeObjectURL(url);
  }
});

// ---------------------------------------------------------------------------
// Input
const raycaster = new THREE.Raycaster();
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let down = null;
let markerLife = 0;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 450;
  down = null;
  if (moved > 6 || !quick) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
  if (!hit) return;
  if (e.button === 2 || e.shiftKey) {
    stones.drop(hit.x, hit.z);
    return;
  }
  if (!walker.ready) return;
  const t = walker.walkTo(hit.x, hit.z);
  marker.position.set(t.x, waveHeight(t.x, t.z) + 0.02, t.z);
  markerLife = 1;
});
walker.onArrive = () => (markerLife = Math.min(markerLife, 0.35));

function dropAhead() {
  const p = walker.position;
  const d = 1.6 + Math.random() * 1.5;
  const a = walker.heading + (Math.random() - 0.5) * 0.8;
  stones.drop(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d);
}

const names = Object.keys(PRESETS);
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui')) return;
  const k = e.key.toLowerCase();
  if (k === 'r' && !gaitCtl._disabled) {
    settings.gait = settings.gait === 'Walk' ? 'Run' : 'Walk';
    walker.setGait(settings.gait.toLowerCase());
    gaitCtl.updateDisplay();
  } else if (k === 's') dropAhead();
  else if (k === 'c') settings.calm();
  else if (/^[1-9]$/.test(k) && names[+k - 1]) {
    applyPreset(names[+k - 1]);
    applySun();
  } else if (k === '[' || k === ']') {
    const i = (names.indexOf(settings.preset) + (k === ']' ? 1 : names.length - 1)) % names.length;
    applyPreset(names[i]);
    applySun();
  }
});

// Ripple-sim inset (debug)
const mapScene = new THREE.Scene();
const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mapMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D uMap; varying vec2 vUv;
    void main(){ vec4 s = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
      vec3 c = vec3(0.5) + vec3(s.r * 18.0, s.r * 18.0, s.r * 18.0) * vec3(0.9, 1.0, 1.1);
      c = mix(c, vec3(1.0), clamp(s.b, 0.0, 1.0) * 0.6);
      gl_FragColor = vec4(c, 1.0); }`,
  depthTest: false,
  toneMapped: false,
});
const mapQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mapMat);
mapQuad.frustumCulled = false;
mapScene.add(mapQuad);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  water.setSize();
  droplets.material.uniforms.uScale.value =
    (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------------------
// Loop
const clock = new THREE.Clock();
const focus = new THREE.Vector3(0, 0.6, 0);
const tmp = new THREE.Vector3();
const wind = new THREE.Vector2();
const pending = [];
let time = 0;
let strideCount = 0;
let splashCount = 0;
let hudTimer = 0;

function frame(dt) {
  time += dt;
  waveUniforms.uTime.value = time;
  waveUniforms.uWaveScale.value = settings.waveScale;

  // Live settings
  floorState.depth = settings.depth;
  floor.uniforms.uDepth.value = settings.depth;
  floor.uniforms.uCaustics.value = settings.caustics;
  water.uniforms.uClarity.value = settings.clarity;
  water.uniforms.uFoam.value = settings.foam;
  sim.material.uniforms.uK.value = settings.speed;
  sim.material.uniforms.uDamping.value = settings.damping;
  sim.material.uniforms.uFoamGain.value = 0.35 * settings.foam;

  const surface = waveHeight;

  // Walker + the water it pushes around
  const { strikes } = walker.update(dt);
  if (strikes.length) {
    strideCount += strikes.length;
    sounds.wade(0.6 + 0.6 * (walker.runWeight || 0));
  }
  const { drops, splashes } = wading.update(dt, surface, settings.wake);
  for (let i = 0; i < drops.length; i += 4) sim.addDrop(drops[i], drops[i + 1], drops[i + 2], drops[i + 3]);
  for (const s of splashes) {
    const n = Math.round(4 + s.speed * 6);
    droplets.burst(s.x, s.y, s.z, n, { up: 0.8 + s.speed * 0.45, out: 0.4 + s.speed * 0.2, dx: s.dx * s.speed * 0.4, dz: s.dz * s.speed * 0.4, size: 0.018 });
    if (s.speed > 1) sounds.splash(Math.min(1, s.speed / 4));
  }

  // Stones
  for (const ev of stones.update(dt, surface, floorHeight)) {
    splashCount++;
    const k = (ev.r / 0.1) * Math.min(ev.speed, 9) / 9;
    sim.addDrop(ev.x, ev.z, 0.12 + ev.r * 1.4, -0.06 * k * settings.wake);
    droplets.burst(ev.x, ev.y, ev.z, Math.round(18 + 30 * k), { up: 1.6 + k, out: 0.7 + 0.5 * k, size: 0.022, ring: true });
    pending.push({ at: time + 0.17, x: ev.x, y: ev.y, z: ev.z, k });
    sounds.plop(ev.r);
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    if (time < p.at) continue;
    // Worthington jet: the column that shoots up after the cavity collapses.
    droplets.burst(p.x, p.y, p.z, Math.round(8 + 10 * p.k), { up: 2.6 + 1.6 * p.k, out: 0.15, size: 0.028 });
    sim.addDrop(p.x, p.z, 0.1, 0.02 * p.k * settings.wake);
    pending.splice(i, 1);
  }

  // Rain
  const w0 = waveUniforms.uWaveA.value[0];
  wind.set(w0.x, w0.y).multiplyScalar(settings.waveScale * (waveUniforms.uWaveB.value[0].x > 0.05 ? 3 : 0.8));
  const rainHits = rain.update(dt, settings.rain, camera.position.clone().lerp(walker.position, 0.6), wind);
  for (let i = 0; i < rainHits.length; i += 2) {
    sim.addDrop(rainHits[i], rainHits[i + 1], 0.028, -0.011);
    if (Math.random() < 0.15) droplets.burst(rainHits[i], surface(rainHits[i], rainHits[i + 1]), rainHits[i + 1], 2, { up: 0.6, out: 0.25, size: 0.01 });
  }
  sounds.setRain(settings.rain);

  // Droplets falling back make their own tiny rings.
  const land = droplets.update(dt, surface);
  for (let i = 0; i < land.length && sim.dropRoom > 4; i += 3) sim.addDrop(land[i], land[i + 1], 0.03 + land[i + 2], -0.002);

  sim.step(dt);
  water.uniforms.uSim.value = sim.texture;
  floor.uniforms.uSim.value = sim.texture;

  // Marker
  if (markerLife > 0) {
    markerLife -= dt * 0.6;
    marker.material.opacity = Math.max(0, markerLife);
    const s = 1 + (1 - markerLife) * 0.6;
    marker.scale.set(s, 1, s);
    marker.position.y = waveHeight(marker.position.x, marker.position.z) + 0.02;
  }

  // Camera follow
  if (walker.ready && settings.follow) {
    tmp.copy(walker.position);
    tmp.y = Math.max(walker.position.y + 0.9, 0.35);
    const before = focus.clone();
    focus.lerp(tmp, 1 - Math.exp(-dt * 3));
    const delta = focus.clone().sub(before);
    camera.position.add(delta);
    controls.target.add(delta);
  }
  controls.update();
  if (camera.position.y < 0.3) camera.position.y = 0.3;

  sun.target.position.copy(walker.position);
  sun.position.copy(walker.position).addScaledVector(skyUniforms.uSunDir.value, 18);
  sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);

  water.renderRefraction(scene, camera, [rain.lines, droplets.points, marker]);
  renderer.render(scene, camera);

  if (settings.showSim) {
    const size = Math.round(Math.min(240, window.innerWidth * 0.38));
    mapMat.uniforms.uMap.value = sim.texture;
    renderer.setScissorTest(true);
    renderer.setViewport(16, 70, size, size);
    renderer.setScissor(16, 70, size, size);
    renderer.render(mapScene, mapCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    $stats.textContent = `${settings.preset} · ${settings.depth.toFixed(2)} m deep · ${walker.speedNow.toFixed(2)} m/s · ${strideCount} strides · ${splashCount} stones`;
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  frame(window.wake?.paused ? 0 : dt);
});

// Console handle for tinkering.
window.wake = {
  walker, sim, water, floor, stones, settings, camera, controls, renderer, scene, applyPreset,
  step: (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); },
};

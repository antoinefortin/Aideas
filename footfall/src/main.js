import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { TrailMap } from './trail.js';
import { createGround, baseHeight } from './ground.js';
import { Walker, loadCharacter, DEFAULT_MODEL_URLS } from './walker.js';
import { Puffs, Footsteps } from './effects.js';
import { SURFACES } from './surfaces.js';
import { Thrower } from './throw.js';

const AREA = 24; // metres of displaceable ground
const params = new URLSearchParams(location.search);
const SEGMENTS = params.has('lite') ? 512 : 1024;

// ---------------------------------------------------------------------------
// Renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdbe4ee, 16, 75);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 900);
camera.position.set(4.6, 2.9, 6.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.4;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.485;
controls.enablePan = false; // right-click is used to throw
controls.update();

// Sky dome
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
  vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vDir;
    void main(){ float h = max(vDir.y, 0.0); gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.55)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

// Lights — a low sun rakes across the ground so prints cast readable shading.
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -5;
sc.right = 5;
sc.top = 5;
sc.bottom = -5;
sc.near = 0.5;
sc.far = 40;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Ground + trail map
const trail = new TrailMap(renderer, { size: AREA, resolution: 2048 });
const ground = createGround({ trail, size: AREA, segments: SEGMENTS });
scene.add(ground.group);

const walker = new Walker(scene);
const puffs = new Puffs(scene);
const steps = new Footsteps();
const thrower = new Thrower({
  scene,
  walker,
  puffs,
  steps,
  getSurface: () => ({ name: settings.surface, ...SURFACES[settings.surface] }),
});

// Click target marker
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.22, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0, depthWrite: false })
);
marker.renderOrder = 2;
scene.add(marker);

// ---------------------------------------------------------------------------
// Settings
const settings = {
  surface: 'Snow',
  gait: 'Walk',
  pace: 1,
  autoWander: true,
  depth: 0.075,
  rim: 0.018,
  tread: 0.3,
  softness: 1,
  refill: 0.015,
  sink: 0.45,
  sunElevation: 20,
  sunAzimuth: 215,
  follow: true,
  showMap: false,
  sound: false,
  autoThrow: true,
  throwBall: () => thrower.request(null),
  clear: () => {
    trail.clear();
    thrower.clearChunks();
  },
};

function applySurface(name) {
  const s = SURFACES[name];
  settings.depth = s.depth;
  settings.rim = s.rim;
  settings.tread = s.tread;
  settings.softness = s.softness;
  settings.refill = s.refill;
  const u = ground.uniforms;
  u.uBaseColor.value.set(s.base);
  u.uPressedColor.value.set(s.pressed);
  u.uRimColor.value.set(s.rimColor);
  u.uRough.value = s.rough;
  u.uPressedRough.value = s.pressedRough;
  u.uGrain.value = s.grain;
  u.uGrainScale.value = s.grainScale;
  u.uCavity.value = s.cavity;
  skyMat.uniforms.uTop.value.set(s.skyTop);
  skyMat.uniforms.uHorizon.value.set(s.skyHorizon);
  scene.fog.color.set(s.skyHorizon);
  sun.color.set(s.sun);
  sun.intensity = s.sunIntensity;
  hemi.color.set(s.hemiSky);
  hemi.groundColor.set(s.hemiGround);
  hemi.intensity = s.hemiIntensity;
  renderer.toneMappingExposure = s.exposure;
  puffs.material.uniforms.uColor.value.set(s.particle);
  thrower.setColor(s.ball);
  document.documentElement.style.setProperty('--accent', s.skyTop);
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
}

const sunOffset = new THREE.Vector3();
function applySun() {
  const el = THREE.MathUtils.degToRad(settings.sunElevation);
  const az = THREE.MathUtils.degToRad(settings.sunAzimuth);
  sunOffset.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(18);
}

const gui = new GUI({ title: 'Footfall' });
const fWalker = gui.addFolder('Walker');
const gaitCtl = fWalker
  .add(settings, 'gait', ['Walk', 'Run'])
  .name('Gait  [R]')
  .onChange((g) => walker.setGait(g.toLowerCase()));
fWalker.add(settings, 'pace', 0.5, 1.6, 0.01).name('Pace').onChange((v) => (walker.pace = v));
fWalker.add(settings, 'autoWander').name('Wander on its own').onChange((v) => {
  walker.autoWander = v;
  if (v) walker.moving = true;
});
const throwCtl = fWalker.add(settings, 'throwBall').name('Throw a snowball  [T]');
fWalker.add(settings, 'autoThrow').name('Throws on its own');
const fGround = gui.addFolder('Ground');
fGround.add(settings, 'surface', Object.keys(SURFACES)).name('Surface').onChange(applySurface);
fGround.add(settings, 'depth', 0.005, 0.18, 0.001).name('Print depth (m)');
fGround.add(settings, 'rim', 0, 0.05, 0.001).name('Rim height (m)');
fGround.add(settings, 'tread', 0, 1, 0.01).name('Sole tread');
fGround.add(settings, 'softness', 0, 1, 0.01).name('Crumbly edges');
fGround.add(settings, 'refill', 0, 0.3, 0.001).name('Refill rate');
fGround.add(settings, 'sink', 0, 1, 0.01).name('Feet sink in');
fGround.add(settings, 'clear').name('Clear prints  [C]');
const fScene = gui.addFolder('Scene');
fScene.add(settings, 'sunElevation', 5, 75, 0.5).name('Sun height (°)').onChange(applySun);
fScene.add(settings, 'sunAzimuth', 0, 360, 1).name('Sun direction (°)').onChange(applySun);
fScene.add(settings, 'follow').name('Camera follows');
fScene.add(settings, 'showMap').name('Show depth map');
fScene.add(settings, 'sound').name('Footstep sound').onChange((v) => steps.setEnabled(v));
if (window.innerWidth < 700) gui.close();

applySurface(settings.surface);
applySun();

// ---------------------------------------------------------------------------
// HUD
const $status = document.getElementById('status');
const $stats = document.getElementById('stats');
const $loader = document.getElementById('loader');
function setStatus(text, isError = false) {
  $loader.textContent = text;
  $loader.classList.toggle('error', isError);
  $loader.classList.toggle('hidden', !text);
}

let stepCount = 0;
let distance = 0;
let modelInfo = null;

function useCharacter({ model, clips }, label) {
  setStatus('Calibrating stride…');
  const info = walker.setModel(model, clips);
  modelInfo = info;
  gaitCtl.enable(info.hasRun);
  throwCtl.enable(thrower.attach());
  if (!info.hasRun) {
    settings.gait = 'Walk';
    walker.setGait('walk');
    gaitCtl.updateDisplay();
  }
  $status.textContent = `${label} · stride calibrated: walk ${info.walkSpeed.toFixed(2)} m/s${
    info.runSpeed ? `, run ${info.runSpeed.toFixed(2)} m/s` : ''
  } · sole ${(info.footLength * 100).toFixed(0)} cm`;
  setStatus('');
}

async function loadDefault() {
  setStatus('Loading walker…');
  for (const url of DEFAULT_MODEL_URLS) {
    try {
      const res = await loadCharacter(url, 'glb');
      useCharacter(res, 'Soldier (Mixamo rig)');
      return;
    } catch (e) {
      console.warn('Model load failed:', url, e);
    }
  }
  setStatus('Could not load the default character. Drop a Mixamo .fbx or .glb onto the page.', true);
}
loadDefault();

// Drag & drop your own Mixamo character (.fbx "With Skin", or .glb)
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
  if (!['fbx', 'glb', 'gltf'].includes(ext)) {
    setStatus('Drop a .fbx or .glb file', true);
    return;
  }
  const url = URL.createObjectURL(file);
  setStatus(`Loading ${file.name}…`);
  try {
    const res = await loadCharacter(url, ext === 'fbx' ? 'fbx' : 'glb');
    useCharacter(res, file.name);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Could not load that file', true);
  } finally {
    URL.revokeObjectURL(url);
  }
});

// Click the ground to send the walker somewhere.
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 450;
  down = null;
  if (moved > 6 || !quick || !walker.ready) return;
  const hit = groundHit(e);
  if (!hit) return;
  if (e.shiftKey || e.button === 2) {
    thrower.request(hit);
    return;
  }
  const t = walker.walkTo(hit.x, hit.z);
  marker.position.set(t.x, baseHeight(t.x, t.z) + 0.012, t.z);
  marker.material.opacity = 1;
  markerLife = 1;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
function groundHit(e) {
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
}
let markerLife = 0;
walker.onArrive = () => (markerLife = Math.min(markerLife, 0.35));

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui')) return;
  if (e.key === 'r' || e.key === 'R') {
    if (!gaitCtl._disabled) {
      settings.gait = settings.gait === 'Walk' ? 'Run' : 'Walk';
      walker.setGait(settings.gait.toLowerCase());
      gaitCtl.updateDisplay();
    }
  } else if (e.key === 'c' || e.key === 'C') {
    settings.clear();
  } else if (e.key === 't' || e.key === 'T') {
    thrower.request(null);
  }
});

// Depth-map inset (debug view of the trail texture)
const mapScene = new THREE.Scene();
const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mapMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: null }, uChar: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec2 uChar; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
      vec3 c = vec3(0.94, 0.95, 0.97);
      c = mix(c, vec3(0.10, 0.14, 0.22), clamp(t.r, 0.0, 1.0));
      c = mix(c, vec3(0.45, 0.68, 1.0), clamp(t.g, 0.0, 1.0) * (1.0 - clamp(t.r, 0.0, 1.0)));
      float d = distance(vec2(vUv.x, 1.0 - vUv.y), uChar);
      c = mix(c, vec3(1.0, 0.42, 0.2), smoothstep(0.011, 0.006, d));
      gl_FragColor = vec4(c, 1.0);
    }`,
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
  puffs.material.uniforms.uScale.value =
    (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------------------
// Loop
const clock = new THREE.Clock();
const focus = new THREE.Vector3(0, 0.9, 0);
const tmp = new THREE.Vector3();
const camRight = new THREE.Vector3();
let hudTimer = 0;
let nextAutoThrow = 9;

function frame(dt) {

  ground.uniforms.uDepth.value = settings.depth;
  ground.uniforms.uRimH.value = settings.rim;
  walker.sink = settings.depth * settings.sink * 0.6;

  // Every so often the wanderer stops for a snowball.
  if (settings.autoThrow && walker.autoWander && !thrower.active && thrower.canThrow) {
    nextAutoThrow -= dt;
    if (nextAutoThrow <= 0) {
      thrower.request(null);
      nextAutoThrow = 14 + Math.random() * 12;
    }
  }

  const { stamps, strikes } = walker.update(dt);
  const throwStamps = thrower.update(dt);
  distance += walker.speedNow * dt;

  trail.refill(dt, settings.refill);
  trail.stamp(throwStamps.length ? stamps.concat(throwStamps) : stamps, {
    tread: settings.tread,
    softness: settings.softness,
    strength: 1 + 0.25 * (walker.runWeight || 0),
  });
  ground.uniforms.uTrail.value = trail.texture;

  if (strikes.length) {
    const s = SURFACES[settings.surface];
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const st of strikes) {
      stepCount++;
      const n = Math.round(s.puff.count * st.strength);
      puffs.emit(st.x, st.y - settings.depth * 0.3, st.z, st.dx * walker.speedNow * 0.4, st.dz * walker.speedNow * 0.4, n, {
        ...s.puff,
        lift: s.puff.lift * st.strength,
      });
      tmp.set(st.x, st.y, st.z).sub(camera.position);
      const dist = tmp.length();
      steps.step(settings.surface, st.strength, THREE.MathUtils.clamp(tmp.dot(camRight) / 4, -0.8, 0.8), 1 / (1 + dist * 0.15));
    }
  }
  puffs.update(dt);

  // Marker pulse
  if (markerLife > 0) {
    markerLife -= dt * 0.6;
    marker.material.opacity = Math.max(0, markerLife);
    const s = 1 + (1 - markerLife) * 0.6;
    marker.scale.set(s, 1, s);
  }

  // Camera follow (keeps the user's orbit offset)
  if (walker.ready && settings.follow) {
    tmp.copy(walker.position);
    tmp.y = baseHeight(tmp.x, tmp.z) + 0.9;
    const before = focus.clone();
    focus.lerp(tmp, 1 - Math.exp(-dt * 3));
    const delta = focus.clone().sub(before);
    camera.position.add(delta);
    controls.target.add(delta);
  }
  controls.update();

  // Sun + shadow frustum follow the walker
  sun.target.position.copy(walker.position);
  sun.position.copy(walker.position).add(sunOffset);
  sun.target.updateMatrixWorld();
  sky.position.copy(camera.position);

  renderer.render(scene, camera);

  if (settings.showMap) {
    const size = Math.round(Math.min(240, window.innerWidth * 0.38));
    mapMat.uniforms.uMap.value = trail.texture;
    mapMat.uniforms.uChar.value.set(walker.position.x / AREA + 0.5, walker.position.z / AREA + 0.5);
    renderer.setScissorTest(true);
    renderer.setViewport(16, 16, size, size);
    renderer.setScissor(16, 16, size, size);
    renderer.render(mapScene, mapCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }

  hudTimer -= dt;
  if (hudTimer <= 0 && modelInfo) {
    hudTimer = 0.2;
    $stats.textContent = `${stepCount} steps · ${distance.toFixed(1)} m · ${walker.speedNow.toFixed(2)} m/s`;
  }
}
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  frame(window.footfall?.paused ? 0 : dt);
});

// Handy for tinkering from the console.
Object.assign(window, { footfall: { walker, trail, ground, settings, renderer, scene, camera, controls, thrower, step: (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); } } });

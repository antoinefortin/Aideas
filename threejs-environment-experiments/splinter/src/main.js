import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { HoleMap, AMMO } from './holes.js';
import { createBoard, BOARD } from './board.js';
import { Shotgun } from './shotgun.js';
import { MuzzleFlash, Puffs, Chips, Shells, Sound } from './effects.js';
import { createRange, loadEnvironment, ENVIRONMENTS, bermHeight } from './range.js';

const query = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// Renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c4cc);
scene.backgroundBlurriness = 0.0;

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.01, 600);
const EYE = new THREE.Vector3(0, 1.62, 0);
camera.position.copy(EYE);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
controls.enableDamping = true;
controls.minDistance = 0.25;
controls.maxDistance = 8;

// Lights (IBL from the HDR does most of the work; the sun adds crisp shadows)
const sun = new THREE.DirectionalLight(0xfff1df, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 60 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.015;
scene.add(sun, sun.target);

// Post: multisampled HDR target -> bloom (only very bright things: the flash) -> tone map
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 2.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// World
const range = createRange();
scene.add(range.group);
const holes = new HoleMap(renderer, { width: BOARD.width, height: BOARD.height, resolution: query.has('lite') ? 1024 : 2048 });
const target = createBoard(holes);
scene.add(target.group);

const gun = new Shotgun();
camera.add(gun.group);
const flash = new MuzzleFlash(gun.muzzle, scene);
const puffs = new Puffs(scene);
const chips = new Chips(scene);
const shells = new Shells(scene, gun.shellMats);
const sound = new Sound();

// ---------------------------------------------------------------------------
// Settings
const settings = {
  ammo: '00 Buck',
  distance: 8,
  choke: 1,
  environment: 'Quarry',
  exposure: 0.82,
  bloom: 0.45,
  paper: true,
  volume: 0.8,
  inspect: () => setInspect(!inspecting),
  newBoard: () => resetBoard(),
};

function placeTarget() {
  target.group.position.set(0, 0, -settings.distance);
  range.berm.position.set(0, 0, -settings.distance);
  sun.target.position.set(0, 1, -settings.distance);
}
placeTarget();

let sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
async function setEnvironment(name) {
  setStatus(`Loading ${name} sky…`);
  try {
    const env = await loadEnvironment(name, scene);
    sunDir = env.sunDir;
    sun.intensity = env.sunStrength;
    setStatus('');
  } catch (e) {
    console.warn(e);
    setStatus('Could not load the HDR sky — using a plain one.', true);
  }
}

const gui = new GUI({ title: 'Splinter' });
const fGun = gui.addFolder('Gun');
const ammoCtl = fGun.add(settings, 'ammo', Object.keys(AMMO)).name('Ammo  [1–3]').onChange(updateAmmoChips);
fGun.add(settings, 'choke', 0.4, 2.5, 0.01).name('Spread (choke)');
fGun.add(settings, 'volume', 0, 1, 0.01).name('Volume').onChange((v) => sound.setVolume(v));
const fTarget = gui.addFolder('Target');
fTarget.add(settings, 'distance', 4, 20, 0.5).name('Distance (m)').onChange(placeTarget);
fTarget.add(settings, 'paper').name('Paper target').onChange((v) => (target.paper.visible = v));
fTarget.add(settings, 'inspect').name('Inspect board  [I]');
fTarget.add(settings, 'newBoard').name('New board  [C]');
const fLook = gui.addFolder('Look');
fLook.add(settings, 'environment', Object.keys(ENVIRONMENTS)).name('Sky').onChange(setEnvironment);
fLook.add(settings, 'exposure', 0.3, 2, 0.01).name('Exposure').onChange((v) => (renderer.toneMappingExposure = v));
fLook.add(settings, 'bloom', 0, 1.5, 0.01).name('Flash bloom').onChange((v) => (bloom.strength = v));
if (window.innerWidth < 760) gui.close();

// ---------------------------------------------------------------------------
// HUD
const $status = document.getElementById('loader');
const $stats = document.getElementById('stats');
const $cross = document.getElementById('crosshair');
const $ammo = document.getElementById('ammo');
const $inspect = document.getElementById('inspectHint');
function setStatus(t, err = false) {
  $status.textContent = t;
  $status.classList.toggle('error', err);
  $status.classList.toggle('hidden', !t);
}
Object.keys(AMMO).forEach((name, i) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.name = name;
  b.innerHTML = `<kbd>${i + 1}</kbd>${name}`;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    settings.ammo = name;
    ammoCtl.updateDisplay();
    updateAmmoChips();
  });
  $ammo.appendChild(b);
});
function updateAmmoChips() {
  [...$ammo.children].forEach((c) => c.classList.toggle('active', c.dataset.name === settings.ammo));
}
updateAmmoChips();

let shots = 0;
let pelletsOnBoard = 0;

// ---------------------------------------------------------------------------
// Aiming + input
const mouse = new THREE.Vector2(0, 0.05);
const raycaster = new THREE.Raycaster();
const aimWorld = new THREE.Vector3();
const aimCam = new THREE.Vector3(0, 0, -10);
let inspecting = false;
let inspectingGun = false;
let zoomHeld = false;
let zoom = 0;

window.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  $cross.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (inspecting || inspectingGun) return;
  if (e.button === 2) {
    zoomHeld = true;
    return;
  }
  if (e.button !== 0) return;
  sound.resume();
  fire();
});
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) zoomHeld = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui')) return;
  const k = e.key.toLowerCase();
  const names = Object.keys(AMMO);
  if (/^[1-3]$/.test(k)) {
    settings.ammo = names[+k - 1];
    ammoCtl.updateDisplay();
    updateAmmoChips();
  } else if (k === 'i') setInspect(!inspecting);
  else if (k === 'g') setInspectGun(!inspectingGun);
  else if (k === 'z' && !e.repeat) zoomHeld = !zoomHeld;
  else if (k === 'escape') {
    if (inspecting) setInspect(false);
    if (inspectingGun) setInspectGun(false);
  }
  else if (k === 'c') resetBoard();
  else if (k === ' ' && !inspecting && !inspectingGun) {
    e.preventDefault();
    sound.resume();
    fire();
  }
});

function updateAim() {
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects([...target.plankMeshes, range.group], true);
  if (hits.length) aimWorld.copy(hits[0].point);
  else aimWorld.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 40);
  aimCam.copy(aimWorld);
  camera.worldToLocal(aimCam);
}

// ---------------------------------------------------------------------------
// Firing
const pending = []; // impacts waiting for pellet flight time
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function fire() {
  if (!gun.fire()) return;
  shots++;
  const ammo = AMMO[settings.ammo];
  const muzzle = gun.muzzle.getWorldPosition(new THREE.Vector3());
  flash.fire(muzzle);
  sound.shot(settings.ammo === 'Slug' ? 1.2 : 1);
  camShake = 1;

  const aimDir = aimWorld.clone().sub(muzzle).normalize();
  // Smoke: a fast jet that slows into a lazy cloud.
  for (let i = 0; i < 18; i++) {
    const sp = 1 + Math.random() * 7;
    puffs.emit(muzzle, _v.copy(aimDir).multiplyScalar(sp), {
      color: new THREE.Color(0.55, 0.55, 0.56),
      size: 0.04,
      grow: 0.5,
      life: 2.6,
      drag: 3,
      lift: 0.18,
      alpha: 0.32,
      spread: 0.6,
    });
  }

  // Pellets: random directions inside the choke's cone.
  const spread = THREE.MathUtils.degToRad(ammo.spread * settings.choke);
  const perp1 = new THREE.Vector3().crossVectors(aimDir, new THREE.Vector3(0, 1, 0)).normalize();
  const perp2 = new THREE.Vector3().crossVectors(perp1, aimDir).normalize();
  for (let i = 0; i < ammo.pellets; i++) {
    const r = spread * Math.sqrt(-Math.log(1 - Math.random() * 0.98)) * 0.55; // ~Gaussian pattern
    const a = Math.random() * Math.PI * 2;
    const dir = aimDir
      .clone()
      .addScaledVector(perp1, Math.tan(r) * Math.cos(a))
      .addScaledVector(perp2, Math.tan(r) * Math.sin(a))
      .normalize();
    tracePellet(muzzle, dir, ammo);
  }
}

function tracePellet(origin, dir, ammo) {
  // Into board space.
  const inv = target.board.matrixWorld.clone().invert();
  const o = origin.clone().applyMatrix4(inv);
  const d = dir.clone().transformDirection(inv);
  const T = BOARD.thickness;
  if (d.z < -1e-4) {
    const s = (T / 2 - o.z) / d.z;
    const x = o.x + d.x * s;
    const y = o.y + d.y * s;
    const pw = target.pw;
    const fx = x + BOARD.width / 2;
    const onPlank = Math.abs(y) <= BOARD.height / 2 && fx >= 0 && fx <= BOARD.width && fx % (pw + BOARD.gap) <= pw;
    if (onPlank && !holes.isOpen(x, y)) {
      const depth = THREE.MathUtils.lerp(ammo.depth[0], ammo.depth[1], Math.random());
      const crack = THREE.MathUtils.lerp(ammo.crack[0], ammo.crack[1], Math.random());
      const exitOff = new THREE.Vector2((d.x / -d.z) * T, (d.y / -d.z) * T);
      pending.push({
        at: clock.elapsedTime + s / ammo.speed,
        kind: 'board',
        stamp: { x, y, r: ammo.r * (0.9 + Math.random() * 0.2), exit: ammo.exit * (0.8 + Math.random() * 0.4), depth, crack: Math.random() < 0.6 ? crack : crack * 0.3, bruise: ammo.bruise, ex: exitOff.x, ey: exitOff.y },
        dirLocal: d.clone(),
        ammo,
        through: depth > 0.99,
      });
      return;
    }
  }
  // Missed (or went through a hole / a gap): find where it lands in the dirt.
  for (let s = 0.5; s < 80; s += 0.15) {
    const p = origin.clone().addScaledVector(dir, s);
    const behind = -settings.distance - p.z;
    const h = Math.max(0, bermHeight(p.x, behind));
    if (p.y <= h) {
      pending.push({ at: clock.elapsedTime + s / ammo.speed, kind: 'dirt', point: p, dir: dir.clone(), ammo });
      return;
    }
  }
}

let impactSoundAt = 0;
function processImpacts() {
  const now = clock.elapsedTime;
  const stamps = [];
  for (let i = pending.length - 1; i >= 0; i--) {
    const ev = pending[i];
    if (ev.at > now) continue;
    pending.splice(i, 1);
    const ammo = ev.ammo;
    if (ev.kind === 'board') {
      stamps.push(ev.stamp);
      pelletsOnBoard++;
      const s = ev.stamp;
      const T = BOARD.thickness;
      const front = target.board.localToWorld(new THREE.Vector3(s.x, s.y, T / 2 + 0.002));
      const back = target.board.localToWorld(new THREE.Vector3(s.x + s.ex, s.y + s.ey, -T / 2 - 0.002));
      target.board.getWorldQuaternion(_q);
      const dirW = ev.dirLocal.clone().applyQuaternion(_q);
      const outW = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
      const big = ammo.r / 0.0042;

      // Chips blown back out of the entry, and a spray of splinters out of the exit.
      const nf = Math.random() < ammo.chipsFront % 1 ? Math.ceil(ammo.chipsFront) : Math.floor(ammo.chipsFront);
      for (let k = 0; k < nf; k++) chips.spawn(front, _v.copy(outW).multiplyScalar(1 + Math.random() * 3).addScaledVector(dirW, -0.5), { size: 0.007 * big, spread: 1.6 });
      if (ev.through) {
        for (let k = 0; k < ammo.chipsBack; k++) chips.spawn(back, _v.copy(dirW).multiplyScalar(2 + Math.random() * 6), { size: 0.011 * big, spread: 2.2, tint: 1.08 });
        puffs.emit(back, _v.copy(dirW).multiplyScalar(2.5), { color: new THREE.Color(0.78, 0.66, 0.5), size: 0.03 * Math.sqrt(big), grow: 0.35, life: 1.4, drag: 4, lift: 0.05, alpha: 0.4, spread: 0.8, count: 3 });
      }
      puffs.emit(front, _v.copy(outW).multiplyScalar(0.8), { color: new THREE.Color(0.8, 0.7, 0.55), size: 0.018 * Math.sqrt(big), grow: 0.3, life: 1, drag: 5, alpha: 0.3, spread: 0.4, count: ammo.pellets > 20 ? 1 : 2 });
      target.impulse(s.x, s.y, 0.05 * big * (ammo.pellets > 20 ? 0.1 : 1));
      if (now - impactSoundAt > 0.03) {
        impactSoundAt = now;
        sound.impact(0, Math.min(1.4, 0.6 + big * 0.4));
      }
    } else {
      const p = ev.point;
      puffs.emit(p, _v.set(0, 1.2, 0).addScaledVector(ev.dir, -0.6), { color: new THREE.Color(0.5, 0.42, 0.32), size: 0.06, grow: 0.5, life: 1.8, drag: 3, lift: 0.05, alpha: 0.45, spread: 0.8, count: ammo.pellets > 20 ? 1 : 3 });
      if (ammo.pellets < 20) for (let k = 0; k < 3; k++) chips.spawn(p, _v.set(0, 2, 0).addScaledVector(ev.dir, -1), { size: 0.008, spread: 1.5, grainUp: false, tint: 0.55 });
    }
  }
  if (stamps.length) holes.stamp(stamps);
}

function resetBoard() {
  holes.clear();
  chips.clear();
  shells.clear();
  pending.length = 0;
  pelletsOnBoard = 0;
  shots = 0;
}

// ---------------------------------------------------------------------------
// Inspect mode: orbit the board to see entry and exit damage up close.
const inspectPose = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
function setInspect(on) {
  inspecting = on;
  document.body.classList.toggle('inspecting', on);
  gun.group.visible = !on;
  controls.enabled = on;
  if (on) {
    const c = target.board.getWorldPosition(new THREE.Vector3());
    controls.target.copy(c);
    camera.position.set(c.x + 0.7, c.y + 0.25, c.z + 1.25);
    controls.update();
  } else {
    camera.position.copy(EYE);
  }
}

// Gun inspect: put the shotgun on a virtual bench and orbit it.
function setInspectGun(on) {
  if (on === inspectingGun) return;
  if (inspecting) setInspect(false);
  inspectingGun = on;
  document.body.classList.toggle('inspecting', on);
  controls.enabled = on;
  if (on) {
    scene.add(gun.group);
    gun.group.position.set(0, 1.25, -1.6);
    gun.group.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0.08));
    controls.target.set(0, 1.25, -1.6);
    camera.position.set(0.55, 1.42, -0.95);
    controls.minDistance = 0.12;
    controls.update();
  } else {
    camera.add(gun.group);
    camera.position.copy(EYE);
    controls.minDistance = 0.25;
  }
}
settings.inspectGun = () => setInspectGun(!inspectingGun);
fTarget.add(settings, 'inspectGun').name('Inspect the gun  [G]');

// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  puffs.material.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
window.addEventListener('resize', onResize);
onResize();

const clock = new THREE.Clock();
let camShake = 0;
let hudT = 0;

function frame(dt) {
  // Hold right mouse (or toggle Z) to zoom in on the target.
  zoom += ((zoomHeld && !inspecting && !inspectingGun ? 1 : 0) - zoom) * (1 - Math.exp(-dt * 10));
  const fov = THREE.MathUtils.lerp(48, 14, zoom);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  gun.base.lerpVectors(gun.hip, gun.adsBase, zoom);
  if (!inspecting && !inspectingGun) {
    // Shooter's view: look at the board, drift slightly toward the cursor.
    const look = new THREE.Vector3(mouse.x * 0.6 * (1 - zoom * 0.7), 1.15 + mouse.y * 0.35 * (1 - zoom * 0.7), -settings.distance);
    camera.position.copy(EYE);
    camera.lookAt(look);
    if (camShake > 0) {
      camShake = Math.max(0, camShake - dt * 5);
      camera.rotateX(camShake * camShake * 0.025);
      camera.rotateZ((Math.random() - 0.5) * camShake * 0.006);
    }
    camera.updateMatrixWorld();
    updateAim();
  } else {
    controls.update();
  }

  const gunEvents = inspectingGun ? [] : gun.update(dt, aimCam);
  for (const ev of gunEvents) {
    if (ev === 'pumpBack') sound.pumpBack();
    else if (ev === 'pumpForward') sound.pumpForward();
    else if (ev === 'eject') {
      const p = gun.port.getWorldPosition(new THREE.Vector3());
      const gq = gun.model.getWorldQuaternion(new THREE.Quaternion());
      const v = new THREE.Vector3(1.7 + Math.random() * 0.6, 1.3 + Math.random() * 0.5, 0.5).applyQuaternion(gq);
      const q = gq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
      shells.eject(p, v, q);
      puffs.emit(p, _v.set(0, 0.4, 0), { color: new THREE.Color(0.6, 0.6, 0.6), size: 0.02, grow: 0.4, life: 1.6, drag: 2, lift: 0.1, alpha: 0.2, spread: 0.2, count: 3 });
    }
  }

  flash.update(dt);
  processImpacts();
  target.update(dt);
  chips.update(dt);
  shells.update(dt, (s) => sound.shellDrop(s));
  puffs.update(dt);

  // Sun follows the HDR's sun; shadow box centred on the target.
  const c = new THREE.Vector3(0, 1, -settings.distance);
  sun.position.copy(c).addScaledVector(sunDir, 25);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();

  composer.render();

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.2;
    $stats.textContent = `${settings.ammo} · ${settings.distance} m · ${shots} shot${shots === 1 ? '' : 's'} · ${pelletsOnBoard} hit${pelletsOnBoard === 1 ? '' : 's'} on the board`;
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  frame(window.splinter?.paused ? 0 : dt);
});

setEnvironment(settings.environment);

window.splinter = {
  scene, camera, controls, gun, holes, target, settings, fire, setInspect, setInspectGun, mouse, clock,
  step: (n = 60, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      clock.elapsedTime += dt;
      frame(dt);
    }
  },
};

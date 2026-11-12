// Walker — loads a Mixamo-rigged character, calibrates its stride from the
// animation itself, moves it through the world without foot sliding, and
// reports where each foot is pressing into the ground every frame.
//
// Calibration (runs once per model):
//   * From a flat standing pose, the heel, ball and toe-tip of each foot are
//     expressed in the local space of the foot / toe bones, so we can track
//     the sole contact points through any animation.
//   * Each locomotion clip is sampled; while a foot is planted it slides
//     backwards relative to the body (in-place animation). That sliding
//     velocity is exactly how fast the character must travel — and its
//     direction tells us which way the model faces.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { baseHeight } from './ground.js';

export const DEFAULT_MODEL_URLS = [
  'https://threejs.org/examples/models/gltf/Soldier.glb',
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Soldier.glb',
];

const norm = (s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export async function loadCharacter(url, ext = 'glb') {
  if (ext === 'fbx') {
    const fbx = await new FBXLoader().loadAsync(url);
    return { model: fbx, clips: fbx.animations || [] };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return { model: gltf.scene, clips: gltf.animations || [] };
}

/** Removes net travel from the hips track so any clip plays "in place". */
function stripRootMotion(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const node = norm(track.name.slice(0, -'.position'.length));
    if (!/hips|pelvis/.test(node)) continue;
    const v = track.values;
    const t = track.times;
    const n = t.length;
    if (n < 2) continue;
    const T = t[n - 1] - t[0] || 1;
    const d = [v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]];
    for (let i = 0; i < n; i++) {
      const f = (t[i] - t[0]) / T;
      v[i * 3] -= d[0] * f;
      v[i * 3 + 1] -= d[1] * f;
      v[i * 3 + 2] -= d[2] * f;
    }
  }
}

export class Walker {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.heading = 0.6;
    this.target = null;
    this.clickTarget = false;
    this.autoWander = true;
    this.moving = true;
    this.gait = 'walk';
    this.pace = 1;
    this.sink = 0;
    this.bounds = 9;
    this.ready = false;
    this.speedNow = 0;
    this.turnSlow = 1;
    this.onArrive = null;
    this.hold = false; // a scripted action (throw) holds the walker in place
    this.faceHeading = null; // ...and may ask it to turn towards a heading
    this.poser = null; // procedural pose layer: { restore(), apply(dt) }

    this._stamps = [];
    this._strikes = [];
  }

  // ------------------------------------------------------------------------
  setModel(model, clips) {
    if (this.model) {
      this.mixer?.stopAllAction();
      this.group.remove(this.model);
    }
    this.ready = false;

    // Calibrate at the origin facing the default direction.
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.updateMatrixWorld(true);

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    this.group.add(model);

    // Normalise size (Mixamo FBX comes in centimetres) and stand on y = 0.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const h = box.max.y - box.min.y;
    if (h < 1.2 || h > 2.6) {
      model.scale.multiplyScalar(1.8 / h);
      model.updateMatrixWorld(true);
      box.setFromObject(model, true);
    }
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);
    this.height = box.max.y - box.min.y;
    this.model = model;

    // Bones.
    const bones = [];
    model.traverse((o) => {
      if (o.isBone) bones.push(o);
    });
    const find = (...suffixes) => {
      for (const s of suffixes) {
        const b = bones.find((b) => norm(b.name).endsWith(s));
        if (b) return b;
      }
      return null;
    };
    const side = (s) => ({
      foot: find(`${s}foot`),
      toe: find(`${s}toebase`, `${s}toe`, `${s}toes`),
      end: find(`${s}toeend`, `${s}toetip`, `${s}toesend`),
    });
    this.findBone = (s) => find(s);
    const L = side('left');
    const R = side('right');
    if (!L.foot || !R.foot) {
      throw new Error('Could not find LeftFoot / RightFoot bones — is this a Mixamo-rigged character?');
    }

    // Clips.
    const usable = clips.filter((c) => !/t-?pose/i.test(c.name) && c.duration > 0.1);
    const pick = (re) => usable.find((c) => re.test(c.name));
    let walk = pick(/walk/i);
    let run = pick(/run|jog|sprint/i);
    const idle = pick(/idle|stand|breath/i);
    if (!walk) walk = usable.find((c) => c !== run && c !== idle) || run;
    if (!walk) throw new Error('No animation found — download the Mixamo character "With Skin" and a walk clip.');
    if (run === walk) run = null;
    for (const c of [walk, run, idle]) if (c) stripRootMotion(c);

    this.mixer = new THREE.AnimationMixer(model);
    this.clips = { walk, run, idle };

    this.#calibrateFeet([L, R], idle);
    this.cal = {};
    for (const key of ['walk', 'run', 'idle']) {
      if (this.clips[key]) this.cal[key] = this.#calibrateClip(this.clips[key]);
    }
    const fw = this.cal.walk.forward;
    this.yawOffset = Math.atan2(fw.x, fw.y);
    if (!this.cal.walk.speed) this.cal.walk.speed = 1.3;
    if (this.cal.run && !this.cal.run.speed) this.cal.run.speed = 3.2;

    // Runtime actions with manually blended weights.
    this.mixer.stopAllAction();
    this.actions = {};
    this.weights = {};
    for (const key of ['walk', 'run', 'idle']) {
      const clip = this.clips[key];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.reset().play();
      a.setEffectiveWeight(0);
      this.actions[key] = a;
      this.weights[key] = 0;
    }
    const start = this.moving || !this.actions.idle ? (this.gait === 'run' && this.actions.run ? 'run' : 'walk') : 'idle';
    this.weights[start] = 1;
    this.actions[start].setEffectiveWeight(1);

    this.ready = true;
    return {
      walkSpeed: this.cal.walk.speed,
      runSpeed: this.cal.run?.speed ?? null,
      footLength: this.feet[0].L,
      hasRun: !!run,
      hasIdle: !!idle,
    };
  }

  #pose(clip, t) {
    this.mixer.stopAllAction();
    if (clip) {
      const a = this.mixer.clipAction(clip);
      a.reset().play();
      a.setEffectiveWeight(1);
      this.mixer.setTime(t);
    } else {
      this.model.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
    }
    this.group.updateMatrixWorld(true);
  }

  #calibrateFeet(sides, idleClip) {
    this.#pose(idleClip, 0);
    const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

    this.feet = sides.map((s, i) => {
      const A = wp(s.foot);
      const B = s.toe ? wp(s.toe) : null;
      const other = wp(sides[1 - i].foot);
      let dir = B ? new THREE.Vector2(B.x - A.x, B.z - A.z) : new THREE.Vector2(0, 1);
      const ab = B ? dir.length() : 0.15;
      dir.normalize();

      let tip;
      if (s.end) tip = wp(s.end);
      else tip = new THREE.Vector3(B ? B.x : A.x, 0, B ? B.z : A.z).addScaledVector(new THREE.Vector3(dir.x, 0, dir.y), ab * 0.45);
      tip.addScaledVector(new THREE.Vector3(dir.x, 0, dir.y), ab * 0.08);
      const heel = new THREE.Vector3(A.x - dir.x * ab * 0.4, 0, A.z - dir.y * ab * 0.4);
      const ball = new THREE.Vector3(B ? B.x : A.x + dir.x * ab, 0, B ? B.z : A.z + dir.y * ab);
      tip.y = 0;

      const toeBone = s.toe || s.foot;
      const foot = {
        foot: s.foot,
        toe: toeBone,
        heelLocal: s.foot.worldToLocal(heel.clone()),
        ballLocal: toeBone.worldToLocal(ball.clone()),
        tipLocal: toeBone.worldToLocal(tip.clone()),
        L: Math.hypot(tip.x - heel.x, tip.z - heel.z),
        heelW: new THREE.Vector3(),
        ballW: new THREE.Vector3(),
        tipW: new THREE.Vector3(),
        prevHeel: new THREE.Vector3(),
        prevBall: new THREE.Vector3(),
        prevTip: new THREE.Vector3(),
        hasPrev: false,
        lastHeelP: 0,
        lastToeP: 0,
        down: false,
        stamp: { x: 0, z: 0, dx: 0, dz: 1, L: 0, W: 0, heel: 0, toe: 0, inner: 1 },
      };
      foot.W = foot.L * 0.38;
      // Which side of the print is the arch: the side facing the other foot.
      const right = new THREE.Vector2(dir.y, -dir.x);
      foot.inner = Math.sign(right.dot(new THREE.Vector2(other.x - A.x, other.z - A.z))) || 1;
      return foot;
    });
  }

  #samplePoints() {
    for (const f of this.feet) {
      f.heelW.copy(f.heelLocal).applyMatrix4(f.foot.matrixWorld);
      f.ballW.copy(f.ballLocal).applyMatrix4(f.toe.matrixWorld);
      f.tipW.copy(f.tipLocal).applyMatrix4(f.toe.matrixWorld);
    }
  }

  #calibrateClip(clip) {
    const K = 200;
    const dur = clip.duration;
    const rows = [];
    for (let i = 0; i <= K; i++) {
      this.#pose(clip, (i / K) * dur * 0.99999);
      this.#samplePoints();
      rows.push(this.feet.map((f) => ({ heel: f.heelW.clone(), ball: f.ballW.clone(), tip: f.tipW.clone() })));
    }
    let minHeel = Infinity;
    let minBall = Infinity;
    let minTip = Infinity;
    for (const r of rows)
      for (const p of r) {
        minHeel = Math.min(minHeel, p.heel.y);
        minBall = Math.min(minBall, p.ball.y);
        minTip = Math.min(minTip, p.tip.y);
      }

    // Planted-foot sliding velocity => travel speed + facing.
    const dt = (dur * 0.99999) / K;
    const v = new THREE.Vector2();
    let n = 0;
    const tol = 0.012 * (this.height / 1.8);
    for (let i = 0; i < K; i++) {
      for (let f = 0; f < 2; f++) {
        const a = rows[i][f];
        const b = rows[i + 1][f];
        if (a.ball.y < minBall + tol && b.ball.y < minBall + tol && a.heel.y < minHeel + tol * 3) {
          v.x += (b.ball.x - a.ball.x) / dt;
          v.y += (b.ball.z - a.ball.z) / dt;
          n++;
        }
      }
    }
    if (n) v.divideScalar(n);
    const speed = v.length();
    const forward = speed > 0.2 ? v.clone().multiplyScalar(-1 / speed) : new THREE.Vector2(0, 1);
    return { minHeel, minBall, minTip, speed: speed > 0.2 ? speed : 0, forward };
  }

  // ------------------------------------------------------------------------
  setGait(g) {
    if (g === this.gait) return;
    const from = this.actions?.[this.gait];
    const to = this.actions?.[g];
    // Keep the legs in phase when switching walk <-> run.
    if (from && to && g !== 'idle') to.time = (from.time / from.getClip().duration) * to.getClip().duration;
    this.gait = g;
  }

  walkTo(x, z) {
    const r = Math.hypot(x, z);
    const lim = this.bounds + 1.5;
    if (r > lim) {
      x *= lim / r;
      z *= lim / r;
    }
    this.target = new THREE.Vector3(x, 0, z);
    this.clickTarget = true;
    this.moving = true;
    return this.target;
  }

  #pickWanderTarget() {
    const p = this.position;
    for (let i = 0; i < 40; i++) {
      const r = this.bounds * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.hypot(x - p.x, z - p.z) < 4.5) continue;
      const turn = Math.abs(wrapAngle(Math.atan2(x - p.x, z - p.z) - this.heading));
      if (turn > 1.7 && i < 34) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  /** Advances the walker. Returns { stamps, strikes }. */
  update(dt) {
    this._stamps.length = 0;
    this._strikes.length = 0;
    if (!this.ready) return { stamps: this._stamps, strikes: this._strikes };

    this.poser?.restore();
    const p = this.position;
    const canIdle = !!this.actions.idle;
    if (!canIdle) this.moving = true;
    const moving = this.moving && !(this.hold && canIdle);

    // --- steering --------------------------------------------------------
    if (moving && !this.target) this.target = this.#pickWanderTarget();
    let diff = 0;
    if (this.target) {
      const dx = this.target.x - p.x;
      const dz = this.target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const arrive = this.clickTarget ? 0.45 : 1.6;
      if (dist < arrive && moving) {
        if (this.clickTarget && !this.autoWander && canIdle) {
          this.moving = false;
          this.target = null;
        } else {
          this.target = this.#pickWanderTarget();
        }
        if (this.clickTarget) this.onArrive?.();
        this.clickTarget = false;
      }
      if (this.target) diff = wrapAngle(Math.atan2(this.target.x - p.x, this.target.z - p.z) - this.heading);
    }

    // --- gait weights ----------------------------------------------------
    const useRun = this.gait === 'run' && !!this.actions.run;
    const want = {
      walk: moving && !useRun ? 1 : 0,
      run: moving && useRun ? 1 : 0,
      idle: moving ? 0 : 1,
    };
    const k = 1 - Math.exp(-dt * 5);
    let sum = 0;
    for (const key in this.actions) {
      this.weights[key] += (want[key] - this.weights[key]) * k;
      sum += this.weights[key];
    }
    for (const key in this.actions) {
      this.weights[key] /= sum || 1;
      this.actions[key].setEffectiveWeight(this.weights[key]);
    }
    const loco = (this.weights.walk || 0) + (this.weights.run || 0);

    // Slow down into tight turns (keeps the turning circle small).
    const slowTarget = 1 - 0.5 * smoothstep(0.5, 1.8, Math.abs(diff));
    this.turnSlow += (slowTarget - this.turnSlow) * (1 - Math.exp(-dt * 4));
    const rate = this.pace * this.turnSlow;
    if (this.actions.walk) this.actions.walk.timeScale = rate;
    if (this.actions.run) this.actions.run.timeScale = rate;

    if (this.faceHeading != null) {
      // Turn on the spot towards a requested heading.
      const d = wrapAngle(this.faceHeading - this.heading);
      this.heading += clamp(d, -2.6 * dt, 2.6 * dt);
    } else {
      const turnRate = (1.5 + 0.9 * (this.weights.run || 0)) * Math.max(0.6, this.pace);
      this.heading += clamp(diff, -turnRate * dt, turnRate * dt) * loco;
    }

    this.mixer.update(dt);

    // --- travel ----------------------------------------------------------
    const speed =
      ((this.weights.walk || 0) * this.cal.walk.speed + (this.weights.run || 0) * (this.cal.run?.speed || 0)) * rate;
    this.speedNow = speed;
    p.x += Math.sin(this.heading) * speed * dt;
    p.z += Math.cos(this.heading) * speed * dt;
    p.y = baseHeight(p.x, p.z) - this.sink;
    this.group.position.copy(p);
    this.group.rotation.y = this.heading - this.yawOffset;
    this.group.updateMatrixWorld(true);
    this.poser?.apply(dt);

    // --- feet ------------------------------------------------------------
    let ref = { heel: 0, ball: 0, tip: 0 };
    for (const key in this.actions) {
      const c = this.cal[key];
      const w = this.weights[key];
      ref.heel += c.minHeel * w;
      ref.ball += c.minBall * w;
      ref.tip += c.minTip * w;
    }
    this.#samplePoints();

    // Foot lock: the planted contact point shouldn't move in the world. Any
    // residual drift (turning, gait blends) is pushed back into the body.
    let lock = null;
    let best = 0.5;
    for (const f of this.feet) {
      const c = Math.max(f.lastHeelP, f.lastToeP);
      if (f.hasPrev && c > best) {
        best = c;
        lock = f;
      }
    }
    if (lock) {
      const useHeel = lock.lastHeelP > lock.lastToeP;
      const now = useHeel ? lock.heelW : lock.tipW;
      const was = useHeel ? lock.prevHeel : lock.prevTip;
      let dx = now.x - was.x;
      let dz = now.z - was.z;
      const max = 0.4 * speed * dt + 0.004;
      const m = Math.hypot(dx, dz);
      if (m > max) {
        dx *= max / m;
        dz *= max / m;
      }
      const k = 0.9 * smoothstep(0.5, 0.95, best) * loco;
      p.x -= dx * k;
      p.z -= dz * k;
      p.y = baseHeight(p.x, p.z) - this.sink;
      this.group.position.copy(p);
      this.group.updateMatrixWorld(true);
      this.#samplePoints();
    }

    const range = 0.022 * (this.height / 1.8);
    const gy = p.y;
    const runW = this.weights.run || 0;

    for (const f of this.feet) {
      // A foot only presses when it is low AND (nearly) still in the world —
      // a swing that skims the surface must not smear the snow.
      const hs = (a, b) => (f.hasPrev && dt > 0 ? Math.hypot(a.x - b.x, a.z - b.z) / dt : 0);
      const still = (v) => 1 - smoothstep(0.35, 1.0, v / Math.max(0.5, this.pace));
      const heelStill = still(hs(f.heelW, f.prevHeel));
      const toeStill = still(Math.min(hs(f.ballW, f.prevBall), hs(f.tipW, f.prevTip)));
      f.prevHeel.copy(f.heelW);
      f.prevBall.copy(f.ballW);
      f.prevTip.copy(f.tipW);
      f.hasPrev = true;

      const heelP = (1 - smoothstep(0, range, f.heelW.y - gy - ref.heel)) * heelStill;
      const toeP =
        (1 - smoothstep(0, range, Math.min(f.ballW.y - gy - ref.ball, f.tipW.y - gy - ref.tip))) * toeStill;
      const contact = Math.max(heelP, toeP);
      f.lastHeelP = heelP;
      f.lastToeP = toeP;

      let dx = f.tipW.x - f.heelW.x;
      let dz = f.tipW.z - f.heelW.z;
      const len = Math.hypot(dx, dz);
      if (len < f.L * 0.3) {
        dx = Math.sin(this.heading);
        dz = Math.cos(this.heading);
      } else {
        dx /= len;
        dz /= len;
      }

      if (contact > 0.02) {
        // Anchor the print to whichever end of the foot is on the ground.
        const w = heelP / (heelP + toeP + 1e-5);
        const hx = f.heelW.x + (dx * f.L) / 2;
        const hz = f.heelW.z + (dz * f.L) / 2;
        const tx = f.tipW.x - (dx * f.L) / 2;
        const tz = f.tipW.z - (dz * f.L) / 2;
        const s = f.stamp;
        s.x = tx + (hx - tx) * w;
        s.z = tz + (hz - tz) * w;
        s.dx = dx;
        s.dz = dz;
        s.L = f.L;
        s.W = f.W;
        s.heel = heelP;
        s.toe = toeP;
        s.inner = f.inner;
        this._stamps.push(s);
      }

      if (!f.down && contact > 0.6) {
        f.down = true;
        if (loco > 0.3) {
          this._strikes.push({
            x: f.stamp.x,
            y: baseHeight(f.stamp.x, f.stamp.z),
            z: f.stamp.z,
            dx,
            dz,
            strength: (0.7 + 0.6 * runW) * Math.min(1.3, 0.6 + 0.4 * this.pace),
          });
        }
      } else if (f.down && contact < 0.15) {
        f.down = false;
      }
    }
    this.runWeight = runW;
    return { stamps: this._stamps, strikes: this._strikes };
  }
}

// Snowball: the walker stops, crouches, scoops snow out of the ground (leaving
// a bowl), packs it into a ball between its hands, winds up and throws.
// The ball flies ballistically, punches a crater with spray streaks into the
// surface, and crumbles into chunks that roll and leave their own tracks.
//
// Mixamo's sample clips have no pick-up / throw, so the motion is a
// procedural layer on top of the idle animation: hips drop, the spine bends
// and twists, legs are solved with two-bone IK to keep the feet planted, and
// arms are solved with two-bone IK towards keyframed hand targets.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { baseHeight } from './ground.js';

const UP = new THREE.Vector3(0, 1, 0);
const G = 9.81;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const norm = (s) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

// ---------------------------------------------------------------------------
// Bone helpers (world-space, independent of each rig's local bone axes)
const _pq = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _x = new THREE.Quaternion();
const wp = (o, out = new THREE.Vector3()) => out.setFromMatrixPosition(o.matrixWorld);

function rotateWorld(bone, qW) {
  bone.parent.getWorldQuaternion(_pq);
  _x.copy(_pq).invert().multiply(qW).multiply(_pq);
  bone.quaternion.premultiply(_x);
  bone.updateMatrixWorld(true);
}

function setWorldQuaternion(bone, qW) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(qW));
  bone.updateMatrixWorld(true);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _k = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();

/** Analytic two-bone IK with a pole direction for the middle joint. */
function twoBoneIK(root, mid, end, target, pole) {
  wp(root, _a);
  wp(mid, _b);
  wp(end, _c);
  const l1 = _a.distanceTo(_b);
  const l2 = _b.distanceTo(_c);
  _u.subVectors(target, _a);
  const d = clamp(_u.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
  _u.normalize();
  _v.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_v.lengthSq() < 1e-8) _v.subVectors(_b, _a).addScaledVector(_u, -_d1.subVectors(_b, _a).dot(_u));
  _v.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _k.copy(_a).addScaledVector(_u, l1 * cosA).addScaledVector(_v, l1 * sinA);

  _d1.subVectors(_b, _a).normalize();
  _d2.subVectors(_k, _a).normalize();
  rotateWorld(root, _q.setFromUnitVectors(_d1, _d2));

  wp(mid, _b);
  wp(end, _c);
  _t.copy(_a).addScaledVector(_u, d);
  _d1.subVectors(_c, _b).normalize();
  _d2.subVectors(_t, _b).normalize();
  rotateWorld(mid, _q.setFromUnitVectors(_d1, _d2));
}

// ---------------------------------------------------------------------------
function lumpy(detail, amount, seed, smooth) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  if (smooth) {
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
  }
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n =
      1 +
      amount *
        (Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2.1) * Math.sin(v.z * 6.7 + seed * 3.3) +
          0.5 * Math.sin(v.x * 11.0 + v.z * 9.0 + seed));
    p.setXYZ(i, v.x * n, v.y * n * (smooth ? 1 : 0.8), v.z * n);
  }
  g.computeVertexNormals();
  return g;
}

class Rig {
  constructor(find) {
    const f = (...names) => {
      for (const n of names) {
        const b = find(n);
        if (b) return b;
      }
      return null;
    };
    this.hips = f('hips', 'pelvis');
    this.spines = [f('spine'), f('spine1'), f('spine2')].filter(Boolean);
    this.legs = ['left', 'right'].map((s) => ({ up: f(`${s}upleg`), knee: f(`${s}leg`), foot: f(`${s}foot`) }));
    const arm = (s) => ({
      arm: f(`${s}arm`),
      fore: f(`${s}forearm`),
      hand: f(`${s}hand`),
      tip: f(`${s}handmiddle1`, `${s}handindex1`),
    });
    this.arms = { L: arm('left'), R: arm('right') };
    const all = [
      this.hips,
      ...this.spines,
      ...this.legs.flatMap((l) => [l.up, l.knee, l.foot]),
      ...['L', 'R'].flatMap((k) => [this.arms[k].arm, this.arms[k].fore, this.arms[k].hand]),
    ];
    this.ok = all.every(Boolean) && this.spines.length > 0;
    this.saved = all.filter(Boolean).map((b) => ({ b, q: b.quaternion.clone(), p: b.position.clone() }));
    this.dirty = false;
  }
  save() {
    for (const s of this.saved) {
      s.q.copy(s.b.quaternion);
      s.p.copy(s.b.position);
    }
    this.dirty = true;
  }
  restore() {
    if (!this.dirty) return;
    for (const s of this.saved) {
      s.b.quaternion.copy(s.q);
      s.b.position.copy(s.p);
    }
    this.dirty = false;
  }
  palm(side, out) {
    const a = this.arms[side];
    wp(a.hand, out);
    if (a.tip) out.lerp(wp(a.tip, _c), 0.6);
    return out;
  }
}

// Timeline (seconds). Hand targets are named; null = follow the animation.
const T_SETTLE = 0.5;
const T_RELEASE = 3.02;
const T_END = 3.9;
const KEYS = [
  { t: 0.0, crouch: 0, lean: 0, twist: 0, ik: 0, L: null, R: null },
  { t: 0.5, crouch: 0, lean: 0, twist: 0, ik: 0, L: null, R: null },
  { t: 1.1, crouch: 1, lean: 0.62, twist: 0, ik: 1, L: 'scoopOut', R: 'scoopOut' },
  { t: 1.8, crouch: 1, lean: 0.66, twist: 0, ik: 1, L: 'scoopIn', R: 'scoopIn' },
  { t: 2.45, crouch: 0.05, lean: 0.12, twist: 0, ik: 1, L: 'pack', R: 'pack' },
  { t: 2.88, crouch: 0.12, lean: -0.15, twist: -0.6, ik: 1, L: 'aim', R: 'wind' },
  { t: 3.06, crouch: 0.1, lean: 0.32, twist: 0.5, ik: 1, L: 'pull', R: 'release' },
  { t: 3.35, crouch: 0.06, lean: 0.28, twist: 0.4, ik: 0.85, L: 'pull', R: 'follow' },
  { t: T_END, crouch: 0, lean: 0, twist: 0, ik: 0, L: null, R: null },
];

export class Thrower {
  constructor({ scene, walker, puffs, steps, getSurface }) {
    this.scene = scene;
    this.walker = walker;
    this.puffs = puffs;
    this.steps = steps;
    this.getSurface = getSurface;
    this.active = false;
    this.rig = null;
    this.stamps = [];
    this.chunks = [];
    this.flying = null;
    this.ballRadius = 0.055;

    this.material = new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.92 });
    this.ball = new THREE.Mesh(lumpy(3, 0.07, 1.3, true), this.material);
    this.ball.castShadow = true;
    this.ball.visible = false;
    scene.add(this.ball);
    this.chunkGeos = [0.9, 2.2, 3.7].map((s) => lumpy(1, 0.28, s, false));

    // scratch
    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.leanAxis = new THREE.Vector3();
    this.ground = new THREE.Vector3();
    this.scoop = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.palms = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.prevPalmR = new THREE.Vector3();
  }

  setColor(hex) {
    this.material.color.set(hex);
  }

  /** Rebuild bone references after the walker loads a model. */
  attach() {
    this.cancel();
    this.rig = new Rig(this.walker.findBone);
    this.walker.poser = this;
    return this.rig.ok && !!this.walker.actions.idle;
  }

  get canThrow() {
    return !!(this.rig?.ok && this.walker.ready && this.walker.actions.idle);
  }

  cancel() {
    this.rig?.restore();
    this.active = false;
    this.ball.visible = !!this.flying;
    this.walker.hold = false;
    this.walker.faceHeading = null;
  }

  /** Start a throw. target: {x, z} on the ground, or null for "straight ahead". */
  request(target) {
    if (this.active || !this.canThrow) return false;
    const w = this.walker;
    const p = w.position;
    let tx;
    let tz;
    if (target) {
      tx = target.x;
      tz = target.z;
    } else {
      const dist = 7 + Math.random() * 3.5;
      tx = p.x + Math.sin(w.heading) * dist;
      tz = p.z + Math.cos(w.heading) * dist;
    }
    // Keep it on the print-able ground.
    const lim = w.bounds + 1.8;
    const r = Math.hypot(tx, tz);
    if (r > lim) {
      tx *= lim / r;
      tz *= lim / r;
    }
    if (Math.hypot(tx - p.x, tz - p.z) < 2.5) {
      // Too close: throw towards the centre instead.
      const a = Math.atan2(-p.x, -p.z);
      tx = p.x + Math.sin(a) * 6;
      tz = p.z + Math.cos(a) * 6;
    }
    this.target.set(tx, baseHeight(tx, tz), tz);
    w.hold = true;
    w.faceHeading = Math.atan2(tx - p.x, tz - p.z);
    this.active = true;
    this.t = 0;
    this.scooped = false;
    this.released = false;
    this.ballR = 0;
    this.packTick = 0;
    this.crumbTimer = 0;
    this.slideSeed = Math.random() * 100;
    return true;
  }

  // Called by the walker before the mixer writes the new animation pose.
  restore() {
    this.rig?.restore();
  }

  // Called by the walker after the animated pose + body transform are set.
  apply(dt) {
    if (!this.active || !this.rig?.ok) return;
    const w = this.walker;
    const s = w.height / 1.8;

    // Hold at the end of "settle" until the walker has stopped and turned.
    const facing = Math.abs(wrapAngle(w.faceHeading - w.heading)) < 0.12;
    const stopped = (w.weights.idle || 0) > 0.85;
    if (this.t >= T_SETTLE - 0.05 && this.t < T_SETTLE && !(facing && stopped)) {
      // waiting
    } else {
      this.t += dt;
    }
    const t = this.t;
    if (t >= T_END) {
      this.cancel();
      return;
    }

    // Body frame
    const h = w.heading;
    this.fwd.set(Math.sin(h), 0, Math.cos(h));
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    this.leanAxis.crossVectors(UP, this.fwd).normalize();
    this.ground.set(w.position.x, baseHeight(w.position.x, w.position.z), w.position.z);
    if (!this.scooped && t >= T_SETTLE) {
      this.scooped = true;
      this.scoop.copy(this.ground).addScaledVector(this.fwd, 0.5 * s);
      this.scoop.y = baseHeight(this.scoop.x, this.scoop.z);
    }

    const pose = this.#evaluate(t);
    const rig = this.rig;
    rig.save();

    // Remember where the feet are so the legs can be solved back to them.
    const feet = rig.legs.map((l) => ({ p: wp(l.foot), q: l.foot.getWorldQuaternion(new THREE.Quaternion()) }));

    // Crouch: hips drop and move back, pelvis tips forward.
    if (pose.crouch > 1e-3) {
      const hp = wp(rig.hips);
      hp.y -= pose.crouch * 0.5 * s;
      hp.addScaledVector(this.fwd, -pose.crouch * 0.1 * s);
      rig.hips.position.copy(rig.hips.parent.worldToLocal(hp));
      rig.hips.updateMatrixWorld(true);
      rotateWorld(rig.hips, _q.setFromAxisAngle(this.leanAxis, pose.crouch * 0.42));
    }

    // Spine: bend + twist, spread over the spine bones.
    if (Math.abs(pose.lean) > 1e-3 || Math.abs(pose.twist) > 1e-3) {
      const share = 1 / rig.spines.length;
      const qt = new THREE.Quaternion().setFromAxisAngle(UP, pose.twist * share);
      for (const b of rig.spines) {
        const ql = new THREE.Quaternion().setFromAxisAngle(this.leanAxis, pose.lean * share);
        rotateWorld(b, qt.clone().multiply(ql));
      }
    }

    // Legs: keep feet planted, knees pushed forward.
    rig.legs.forEach((l, i) => {
      const pole = wp(l.knee).sub(wp(l.up)).normalize().addScaledVector(this.fwd, 0.6);
      twoBoneIK(l.up, l.knee, l.foot, feet[i].p, pole);
      setWorldQuaternion(l.foot, feet[i].q);
    });

    // Arms.
    if (pose.ik > 1e-3) {
      for (const side of ['L', 'R']) {
        const a = rig.arms[side];
        const key = pose[side];
        if (!key) continue;
        const palm = rig.palm(side, new THREE.Vector3());
        const goal = this.#handTarget(key.a, side, s).lerp(this.#handTarget(key.b, side, s), key.f);
        const target = palm.clone().lerp(goal, pose.ik);
        const hand = wp(a.hand);
        target.sub(palm).add(hand); // palm goal -> wrist goal
        const out = side === 'R' ? 1 : -1;
        const designed = this.right
          .clone()
          .multiplyScalar(out)
          .addScaledVector(UP, -0.7)
          .addScaledVector(this.fwd, -0.25)
          .normalize();
        const current = wp(a.fore).sub(wp(a.arm)).normalize();
        const pole = current.lerp(designed, pose.ik).normalize();
        twoBoneIK(a.arm, a.fore, a.hand, target, pole);
      }
    }

    rig.palm('L', this.palms.L);
    rig.palm('R', this.palms.R);
    this.#ballAndSnow(t, dt, s);
  }

  #evaluate(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const A = KEYS[i];
    const B = KEYS[i + 1];
    const f = smoothstep(A.t, B.t, t);
    const mix = (k) => A[k] + (B[k] - A[k]) * f;
    const hand = (side) => {
      const a = A[side] || B[side];
      const b = B[side] || A[side];
      return a ? { a, b, f } : null;
    };
    return { crouch: mix('crouch'), lean: mix('lean'), twist: mix('twist'), ik: mix('ik'), L: hand('L'), R: hand('R') };
  }

  #handTarget(name, side, s) {
    const out = side === 'R' ? 1 : -1;
    const v = new THREE.Vector3();
    const sh = wp(this.rig.arms[side].arm);
    switch (name) {
      case 'scoopOut':
        return v.copy(this.scoop).addScaledVector(this.right, out * 0.2 * s).addScaledVector(this.fwd, 0.04 * s).setY(this.scoop.y + 0.035 * s);
      case 'scoopIn':
        return v.copy(this.scoop).addScaledVector(this.right, out * 0.07 * s).addScaledVector(this.fwd, -0.06 * s).setY(this.scoop.y + 0.06 * s);
      case 'pack': {
        const pat = Math.sin(this.t * 26) * 0.018 * s;
        return v
          .copy(this.ground)
          .addScaledVector(this.fwd, 0.36 * s)
          .addScaledVector(this.right, out * (0.075 * s + pat))
          .setY(this.ground.y + 1.12 * s);
      }
      case 'aim':
        return v
          .copy(sh)
          .addScaledVector(this.fwd, 0.5 * s)
          .addScaledVector(this.right, out * 0.12 * s)
          .addScaledVector(UP, 0.12 * s);
      case 'wind':
        return v
          .copy(sh)
          .addScaledVector(this.fwd, -0.3 * s)
          .addScaledVector(this.right, 0.12 * s)
          .addScaledVector(UP, 0.22 * s);
      case 'release':
        return v
          .copy(sh)
          .addScaledVector(this.fwd, 0.5 * s)
          .addScaledVector(this.right, -0.02 * s)
          .addScaledVector(UP, 0.12 * s);
      case 'follow':
        return v
          .copy(sh)
          .addScaledVector(this.fwd, 0.35 * s)
          .addScaledVector(this.right, -0.3 * s)
          .addScaledVector(UP, -0.4 * s);
      case 'pull':
        return v
          .copy(sh)
          .addScaledVector(this.fwd, 0.05 * s)
          .addScaledVector(this.right, out * 0.25 * s)
          .addScaledVector(UP, -0.38 * s);
      default:
        return v.copy(sh);
    }
  }

  #ballAndSnow(t, dt, s) {
    const surf = this.getSurface();
    const R = this.ballRadius * s;
    const ball = this.ball;

    // Scoop: a bowl grows where the hands gather the snow, and the palms
    // drag little furrows as they sweep in.
    if (t > 1.0 && t < 1.85) {
      const pr = smoothstep(1.05, 1.8, t);
      this.stamps.push({
        shape: 1,
        x: this.scoop.x,
        z: this.scoop.z - 0,
        dx: this.fwd.x,
        dz: this.fwd.z,
        W: (0.14 + 0.24 * pr) * s,
        L: (0.12 + 0.1 * pr) * s,
        heel: pr,
        toe: pr,
        strength: 1.05,
        seed: this.slideSeed,
      });
      for (const side of ['L', 'R']) {
        const p = this.palms[side];
        if (p.y - baseHeight(p.x, p.z) < 0.09 * s) {
          this.stamps.push({ shape: 1, x: p.x, z: p.z, dx: this.fwd.x, dz: this.fwd.z, W: 0.09 * s, L: 0.11 * s, heel: 0.8, toe: 0.8, strength: 0.6, seed: this.slideSeed + 3 });
        }
      }
    }

    // Ball grows in the hands while scooping, then is packed.
    if (t > 1.15 && !this.released) {
      ball.visible = true;
      this.ballR = R * (0.35 + 0.55 * smoothstep(1.15, 1.85, t) + 0.1 * smoothstep(1.9, 2.4, t));
      const squash = t > 1.85 && t < 2.45 ? 1 + 0.08 * Math.sin(t * 26) : 1;
      ball.scale.set(this.ballR * squash, this.ballR / squash, this.ballR * squash);
      if (t < 2.55) {
        ball.position.copy(this.palms.L).add(this.palms.R).multiplyScalar(0.5);
        ball.position.y += this.ballR * 0.25;
      } else {
        ball.position.copy(this.palms.R).addScaledVector(UP, this.ballR * 0.3);
      }
      ball.rotation.y += dt * (t < 2.45 ? 2.5 : 0);
    }

    // Packing: crumbs fall and the snow squeaks.
    if (t > 1.85 && t < 2.5) {
      this.crumbTimer -= dt;
      if (this.crumbTimer <= 0) {
        this.crumbTimer = 0.06;
        const p = ball.position;
        this.puffs.emit(p.x, p.y - this.ballR * 0.6, p.z, 0, 0, 2, { spread: 0.18, lift: 0.05, size: 0.012, life: 1.2 });
      }
      const tick = Math.floor((t - 1.85) / 0.19);
      if (tick !== this.packTick) {
        this.packTick = tick;
        this.steps.step(surf.name, 0.35, 0, 0.7);
      }
    }

    // Release.
    if (!this.released && t >= T_RELEASE) {
      this.released = true;
      const p0 = this.palms.R.clone().addScaledVector(UP, this.ballR * 0.3);
      const dist = Math.hypot(this.target.x - p0.x, this.target.z - p0.z);
      const tau = 0.42 + dist * 0.055;
      const vel = new THREE.Vector3().subVectors(this.target, p0).divideScalar(tau);
      vel.y += 0.5 * G * tau;
      this.flying = {
        pos: p0,
        vel,
        r: this.ballR,
        axis: new THREE.Vector3().crossVectors(UP, vel).normalize(),
        spin: 14 + Math.random() * 8,
        trail: 0,
      };
      this.steps.whoosh?.();
    }
  }

  /** Ball flight, impact and chunks. Returns stamps to press this frame. */
  update(dt) {
    const surf = this.getSurface();
    const f = this.flying;
    if (f) {
      f.vel.y -= G * dt;
      f.pos.addScaledVector(f.vel, dt);
      this.ball.visible = true;
      this.ball.position.copy(f.pos);
      this.ball.scale.setScalar(f.r);
      this.ball.rotateOnWorldAxis(f.axis, f.spin * dt);
      f.trail -= dt;
      if (f.trail <= 0) {
        f.trail = 0.03;
        this.puffs.emit(f.pos.x, f.pos.y, f.pos.z, f.vel.x * 0.05, f.vel.z * 0.05, 1, { spread: 0.05, lift: 0.02, size: 0.01, life: 0.5 });
      }
      const gy = baseHeight(f.pos.x, f.pos.z);
      if (f.pos.y - f.r * 0.3 <= gy) this.#impact(f, gy, surf);
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.age += dt;
      c.vel.y -= G * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      const p = c.mesh.position;
      const rest = baseHeight(p.x, p.z) + c.r * 0.35;
      const hs = Math.hypot(c.vel.x, c.vel.z);
      if (p.y <= rest) {
        p.y = rest;
        if (c.vel.y < -0.6) {
          c.vel.y *= -0.22;
          this.stamps.push({ shape: 1, x: p.x, z: p.z, dx: 0, dz: 1, W: c.r * 2.4, L: c.r * 2.4, heel: 1, toe: 1, strength: 0.32, seed: c.seed });
        } else c.vel.y = 0;
        const fr = Math.exp(-dt * 8);
        c.vel.x *= fr;
        c.vel.z *= fr;
        if (hs > 0.1) {
          // Rolling chunk leaves a little furrow.
          this.stamps.push({ shape: 1, x: p.x, z: p.z, dx: c.vel.x / hs, dz: c.vel.z / hs, W: c.r * 1.7, L: c.r * 2.0, heel: 0.8, toe: 0.8, strength: 0.22, seed: c.seed });
          _v.set(c.vel.z, 0, -c.vel.x).normalize();
          c.mesh.rotateOnWorldAxis(_v, (hs / c.r) * dt);
        }
      } else {
        c.mesh.rotateOnWorldAxis(c.axis, c.spin * dt);
      }
      // Melt away after a while.
      if (c.age > 28) {
        const k = 1 - (c.age - 28) / 3;
        if (k <= 0) {
          this.scene.remove(c.mesh);
          this.chunks.splice(i, 1);
          continue;
        }
        c.mesh.scale.setScalar(c.r * k);
      }
    }

    const out = this.stamps;
    this.stamps = [];
    return out;
  }

  #impact(f, gy, surf) {
    const hs = Math.hypot(f.vel.x, f.vel.z);
    const dx = hs > 1e-3 ? f.vel.x / hs : 0;
    const dz = hs > 1e-3 ? f.vel.z / hs : 1;
    const x = f.pos.x + dx * 0.03;
    const z = f.pos.z + dz * 0.03;
    const W = f.r * 3.6;
    this.stamps.push({
      shape: 2,
      x,
      z,
      dx,
      dz,
      W,
      L: W * (1 + Math.min(0.9, hs * 0.07)),
      heel: 1,
      toe: 1,
      strength: 0.85,
      seed: Math.random() * 50,
    });
    this.puffs.emit(x, gy, z, dx * hs * 0.25, dz * hs * 0.25, 50, { spread: 1.1, lift: 1.4, size: 0.02, life: 1.3 });
    this.steps.thud?.(surf.name);

    // Crumble into chunks.
    const n = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const r = f.r * (0.3 + Math.random() * 0.32);
      const mesh = new THREE.Mesh(this.chunkGeos[i % this.chunkGeos.length], this.material);
      mesh.castShadow = true;
      mesh.scale.setScalar(r);
      mesh.position.set(x + (Math.random() - 0.5) * 0.06, gy + f.r * 0.6, z + (Math.random() - 0.5) * 0.06);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const out = 0.15 + Math.random() * 0.55;
      const fwd = hs * (0.06 + Math.random() * 0.14);
      this.chunks.push({
        mesh,
        r,
        age: 0,
        seed: Math.random() * 50,
        vel: new THREE.Vector3(Math.cos(a) * out + dx * fwd, 0.6 + Math.random() * 1.4, Math.sin(a) * out + dz * fwd),
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: 6 + Math.random() * 10,
      });
    }
    while (this.chunks.length > 90) {
      const c = this.chunks.shift();
      this.scene.remove(c.mesh);
    }

    this.flying = null;
    this.ball.visible = false;
  }

  clearChunks() {
    for (const c of this.chunks) this.scene.remove(c.mesh);
    this.chunks.length = 0;
  }
}

// Muzzle flash, smoke, wood chips, sawdust / dirt puffs, ejected shells and
// procedural sound.

import * as THREE from 'three';
import { createShellMesh } from './shotgun.js';

const G = 9.81;

function flashTexture(star) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,250,235,1)');
  grd.addColorStop(0.15, 'rgba(255,214,140,0.95)');
  grd.addColorStop(0.45, 'rgba(255,140,40,0.45)');
  grd.addColorStop(1, 'rgba(255,90,10,0)');
  g.fillStyle = grd;
  if (star) {
    g.translate(s / 2, s / 2);
    for (let i = 0; i < 7; i++) {
      g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(s * (0.3 + Math.random() * 0.2), 0);
      g.lineTo(0, 6);
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.9;
  }
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

export class MuzzleFlash {
  constructor(parent, scene) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const mat = (tex, i) =>
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(14, 9, 5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const side = flashTexture(false);
    const star = flashTexture(true);
    this.planes = [];
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.24), mat(side));
      p.rotation.set(Math.PI / 2, i * (Math.PI / 2), 0);
      p.position.z = -0.1;
      this.group.add(p);
      this.planes.push(p);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat(star));
    front.position.z = -0.012;
    this.group.add(front);
    this.planes.push(front);
    this.group.visible = false;
    this.light = new THREE.PointLight(0xffb066, 0, 6, 2);
    scene.add(this.light);
    this.t = 1;
  }

  fire(worldPos) {
    this.t = 0;
    this.group.visible = true;
    this.group.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.group.scale.set(s, s, 0.8 + Math.random() * 0.6);
    this.light.position.copy(worldPos);
  }

  update(dt) {
    this.t += dt;
    this.group.visible = this.t < 0.045;
    this.light.intensity = Math.max(0, 1 - this.t / 0.07) * 40;
  }
}

// Soft sprite particles (smoke, sawdust, dirt) in one Points system.
export class Puffs {
  constructor(scene, max = 1500) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.span = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.lift = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: /* glsl */ `attribute float aSize; attribute float aAlpha; attribute vec3 color; uniform float uScale;
        varying float vA; varying vec3 vC; varying float vSeed;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vA = aAlpha; vC = color; vSeed = fract(position.x * 13.1 + position.z * 7.7);
          gl_PointSize = aAlpha > 0.0 ? aSize * uScale / -mv.z : 0.0; }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vC; varying float vSeed;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          float cloud = n(c * 6.0 + vSeed * 20.0) * 0.6 + n(c * 13.0 - vSeed * 9.0) * 0.4;
          float a = smoothstep(0.5, 0.05, d) * (0.55 + 0.6 * cloud) * vA;
          gl_FragColor = vec4(vC, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(p, v, { color, size = 0.05, grow = 0.3, life = 1.5, drag = 2, lift = 0, alpha = 0.5, spread = 0.2, count = 1 }) {
    for (let k = 0; k < count; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * size * 0.4;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * size * 0.4;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * size * 0.4;
      this.vel[i * 3] = v.x + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * spread;
      this.col[i * 3] = color.r;
      this.col[i * 3 + 1] = color.g;
      this.col[i * 3 + 2] = color.b;
      this.span[i] = life * (0.7 + Math.random() * 0.6);
      this.life[i] = this.span[i];
      this.size0[i] = size * (0.7 + Math.random() * 0.6);
      this.grow[i] = grow;
      this.drag[i] = drag;
      this.lift[i] = lift;
      this.alpha0[i] = alpha;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const f = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= f;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * f + this.lift[i] * dt;
      this.vel[i * 3 + 2] *= f;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const age = 1 - this.life[i] / this.span[i];
      this.size[i] = this.size0[i] * (1 + this.grow[i] * age * 10);
      this.alpha[i] = this.alpha0[i] * Math.min(1, age * 8) * (1 - age) * (1 - age);
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}

// Wood chips and splinters: instanced thin boxes with simple rigid physics.
export class Chips {
  constructor(scene, max = 2000) {
    this.max = max;
    this.count = 0;
    this.head = 0;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c.setRGB(1, 1, 1));
  }

  spawn(p, v, { size = 0.012, spread = 1, grainUp = true, tint = 1 } = {}) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const L = size * (0.6 + Math.random() * 1.8);
    const item = {
      p: p.clone(),
      v: new THREE.Vector3(v.x + (Math.random() - 0.5) * spread, v.y + (Math.random() - 0.3) * spread, v.z + (Math.random() - 0.5) * spread),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40),
      scale: grainUp ? new THREE.Vector3(L * (0.15 + Math.random() * 0.25), L, L * (0.05 + Math.random() * 0.08)) : new THREE.Vector3(L, L * 0.7, L * 0.5),
      rest: false,
    };
    this.items[i] = item;
    const c = new THREE.Color().setRGB(0.82, 0.62, 0.38).multiplyScalar((0.75 + Math.random() * 0.35) * tint);
    this.mesh.setColorAt(i, c);
    this.mesh.instanceColor.needsUpdate = true;
    this.count = Math.min(this.max, this.count + 1);
    this.mesh.count = this.count;
  }

  update(dt, groundY = 0) {
    const dq = new THREE.Quaternion();
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      if (!it) continue;
      if (!it.rest) {
        it.v.y -= G * dt;
        it.v.multiplyScalar(Math.exp(-dt * 0.8)); // light flakes feel air drag
        it.p.addScaledVector(it.v, dt);
        const wl = it.w.length();
        if (wl > 0) {
          dq.setFromAxisAngle(it.w.clone().divideScalar(wl), wl * dt);
          it.q.premultiply(dq);
        }
        const floor = groundY + it.scale.z * 0.5;
        if (it.p.y < floor) {
          it.p.y = floor;
          if (Math.abs(it.v.y) > 0.6) {
            it.v.y *= -0.25;
            it.v.x *= 0.5;
            it.v.z *= 0.5;
            it.w.multiplyScalar(0.5);
          } else {
            it.rest = true;
            // lie flat
            const e = new THREE.Euler().setFromQuaternion(it.q);
            it.q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, e.z));
          }
        }
      }
      this.m.compose(it.p, it.q, it.scale);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.count = 0;
    this.head = 0;
    this.mesh.count = 0;
  }
}

// Spent shells with bounce physics; they stay on the ground.
export class Shells {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.list = [];
  }

  eject(pos, vel, quat) {
    const mesh = createShellMesh(this.materials);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    this.scene.add(mesh);
    this.list.push({
      mesh,
      v: vel.clone(),
      w: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 20 - 10, 14 + Math.random() * 8),
      rest: false,
      bounces: 0,
    });
    while (this.list.length > 30) this.scene.remove(this.list.shift().mesh);
  }

  update(dt, onBounce) {
    const dq = new THREE.Quaternion();
    for (const s of this.list) {
      if (s.rest) continue;
      s.v.y -= G * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      const wl = s.w.length();
      if (wl > 0) {
        dq.setFromAxisAngle(s.w.clone().divideScalar(wl), wl * dt);
        s.mesh.quaternion.premultiply(dq);
      }
      if (s.mesh.position.y < 0.012) {
        s.mesh.position.y = 0.012;
        if (Math.abs(s.v.y) > 0.5 && s.bounces < 4) {
          onBounce?.(Math.min(1, Math.abs(s.v.y) / 4));
          s.v.y *= -0.32;
          s.v.x *= 0.6;
          s.v.z *= 0.6;
          s.w.multiplyScalar(0.6);
          s.bounces++;
        } else {
          s.rest = true;
          const e = new THREE.Euler().setFromQuaternion(s.mesh.quaternion, 'YXZ');
          s.mesh.quaternion.setFromEuler(new THREE.Euler(0, e.y, Math.PI / 2, 'YXZ'));
        }
      }
    }
  }

  clear() {
    for (const s of this.list) this.scene.remove(s.mesh);
    this.list.length = 0;
  }
}

// ---------------------------------------------------------------------------
export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
  }

  #init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // Outdoor slap-back / tail.
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const b = ir.getChannelData(ch);
      for (let i = 0; i < b.length; i++) {
        const t = i / ctx.sampleRate;
        const echo = t > 0.18 && t < 0.24 ? 1.6 : 1;
        b[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * echo * 0.5;
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.verb.connect(wet).connect(this.master);
  }

  resume() {
    this.#init();
    this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  #burst(t, dur, type, f0, f1, q, level, verb = 0.5) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    g.connect(this.master);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      g.connect(s).connect(this.verb);
    }
    src.start(t, Math.random(), dur + 0.05);
  }

  #thump(t, f0, f1, dur, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(heavy = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.003;
    this.#burst(t, 0.9, 'lowpass', 9000, 220, 0.6, 1.0, 0.9);
    this.#burst(t, 0.12, 'highpass', 2500, 0, 0.5, 0.6, 0.2);
    this.#thump(t, 120 * heavy, 38, 0.35, 0.9);
  }

  impact(distance, strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + distance / 343; // sound comes back from the board
    this.#burst(t, 0.09, 'bandpass', 1400, 600, 1.4, 0.45 * strength, 0.3);
    this.#thump(t, 260, 110, 0.08, 0.3 * strength);
  }

  pumpBack() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.#burst(t, 0.05, 'highpass', 3200, 0, 0.8, 0.35, 0.1);
    this.#burst(t + 0.06, 0.07, 'bandpass', 1800, 900, 2, 0.3, 0.1);
  }

  pumpForward() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.#burst(t, 0.05, 'bandpass', 1300, 2200, 1.5, 0.3, 0.1);
    this.#burst(t + 0.07, 0.06, 'highpass', 2800, 0, 0.9, 0.45, 0.15);
    this.#thump(t + 0.07, 340, 160, 0.05, 0.2);
  }

  shellDrop(s = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.#burst(t, 0.06, 'bandpass', 2400 + Math.random() * 1500, 0, 6, 0.12 * s, 0.05);
    this.#thump(t, 900 + Math.random() * 300, 700, 0.05, 0.05 * s);
  }
}

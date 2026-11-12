// Rain streaks, splash droplets, and procedural water sounds.

import * as THREE from 'three';

export class Rain {
  constructor(scene, count = 3000) {
    this.count = count;
    this.pos = new Float32Array(count * 6);
    this.seed = new Float32Array(count * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry = g;
    this.material = new THREE.LineBasicMaterial({ color: 0xc8d4dc, transparent: true, opacity: 0.5, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    for (let i = 0; i < count; i++) this.#respawn(i, new THREE.Vector3(), true);
    this.carry = 0;
  }

  #respawn(i, c, anywhere) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 10;
    this.seed[i * 3] = c.x + Math.cos(a) * r;
    this.seed[i * 3 + 1] = anywhere ? Math.random() * 6 : 4.5 + Math.random() * 2;
    this.seed[i * 3 + 2] = c.z + Math.sin(a) * r;
  }

  /** Moves streaks around `center`; returns impact points [x, z, ...] for the sim. */
  update(dt, rate, center, wind) {
    const active = Math.min(this.count, Math.round((rate / 1200) * this.count));
    this.lines.visible = active > 0;
    this.geometry.setDrawRange(0, active * 2);
    const vy = -9;
    const vx = wind.x;
    const vz = wind.y;
    for (let i = 0; i < active; i++) {
      let x = this.seed[i * 3] + vx * dt;
      let y = this.seed[i * 3 + 1] + vy * dt;
      let z = this.seed[i * 3 + 2] + vz * dt;
      if (y < 0 || Math.hypot(x - center.x, z - center.z) > 12) {
        this.#respawn(i, center, false);
        x = this.seed[i * 3];
        y = this.seed[i * 3 + 1];
        z = this.seed[i * 3 + 2];
      }
      this.seed[i * 3] = x;
      this.seed[i * 3 + 1] = y;
      this.seed[i * 3 + 2] = z;
      const o = i * 6;
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z;
      this.pos[o + 3] = x - vx * 0.03;
      this.pos[o + 4] = y + 0.28;
      this.pos[o + 5] = z - vz * 0.03;
    }
    this.geometry.attributes.position.needsUpdate = true;

    // Impacts on the water (independent of the visible streaks).
    const out = [];
    this.carry += rate * dt;
    let n = Math.floor(this.carry);
    this.carry -= n;
    n = Math.min(n, 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 11;
      out.push(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r);
    }
    return out;
  }
}

export class Droplets {
  constructor(scene, max = 1500) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.lifeN = new Float32Array(max);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.lifeN, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xeaf6ff) }, uScale: { value: 800 } },
      vertexShader: /* glsl */ `attribute float aLife; attribute float aSize; uniform float uScale; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vA = aLife;
          gl_PointSize = aLife > 0.0 ? aSize * uScale / -mv.z : 0.0; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA;
        void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
          float rim = smoothstep(0.5, 0.25, d);
          gl_FragColor = vec4(uColor * (0.8 + 0.5 * smoothstep(0.3, 0.0, length(c + vec2(0.12, 0.12)))), rim * min(1.0, vA * 3.0) * 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.landings = [];
  }

  /** Burst of droplets. up = vertical speed, out = radial speed. */
  burst(x, y, z, count, { up = 2, out = 1, dx = 0, dz = 0, size = 0.02, ring = false } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const o = ring ? out * (0.8 + Math.random() * 0.4) : out * Math.random();
      this.pos[i * 3] = x + Math.cos(a) * 0.03;
      this.pos[i * 3 + 1] = y + 0.01;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.03;
      this.vel[i * 3] = Math.cos(a) * o + dx;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random() * 0.7);
      this.vel[i * 3 + 2] = Math.sin(a) * o + dz;
      this.life[i] = 2.5;
      this.size[i] = size * (0.5 + Math.random());
    }
  }

  /** Returns landing points [x, z, size, ...] (droplets falling back make tiny ripples). */
  update(dt, surface) {
    this.landings.length = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.lifeN[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.81 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const x = this.pos[i * 3];
      const z = this.pos[i * 3 + 2];
      if (this.vel[i * 3 + 1] < 0 && this.pos[i * 3 + 1] < surface(x, z)) {
        this.life[i] = 0;
        if (this.landings.length < 60) this.landings.push(x, z, this.size[i]);
      }
      this.lifeN[i] = Math.max(0, Math.min(1, this.life[i]));
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.aLife.needsUpdate = a.aSize.needsUpdate = true;
    return this.landings;
  }
}

export class WaterSounds {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      const ctx = new AudioContext();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ctx.destination);
      // Rain bed: looping filtered noise.
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(f).connect(this.rainGain).connect(this.master);
      src.start();
      this.ctx = ctx;
    }
    if (this.ctx) on ? this.ctx.resume() : this.ctx.suspend();
  }

  setRain(rate) {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(Math.min(0.25, rate / 3500), this.ctx.currentTime, 0.3);
  }

  #noise(t, dur, type, f0, f1, q, level) {
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
    g.gain.linearRampToValueAtTime(level, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), dur + 0.05);
  }

  #bubble(t, f0, f1, dur, level) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A wading stride. */
  wade(strength = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this.#noise(t, 0.35, 'bandpass', 500, 1300, 1.2, 0.22 * strength);
    this.#noise(t + 0.05, 0.25, 'lowpass', 300, 0, 1, 0.18 * strength);
    if (Math.random() < 0.6) this.#bubble(t + 0.1 + Math.random() * 0.1, 400 + Math.random() * 300, 900, 0.05, 0.04 * strength);
  }

  splash(strength = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    this.#noise(t, 0.35 + 0.2 * strength, 'highpass', 900, 0, 0.7, 0.3 * Math.min(1.5, strength));
    this.#noise(t, 0.15, 'lowpass', 500, 0, 1, 0.35 * Math.min(1.5, strength));
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const f = 300 + Math.random() * 700;
      this.#bubble(t + 0.05 + Math.random() * 0.25, f, f * 2.4, 0.04 + Math.random() * 0.05, 0.05);
    }
  }

  plop(size = 0.08) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const f = 380 - size * 1500;
    this.#bubble(t, Math.max(140, f), Math.max(140, f) * 3, 0.09, 0.22);
    this.#noise(t, 0.25, 'bandpass', 1200, 600, 1, 0.18);
    this.#bubble(t + 0.12, f * 1.5, f * 3.5, 0.05, 0.06);
  }
}

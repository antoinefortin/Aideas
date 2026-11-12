// Small extras: kicked-up particles on each footfall and a procedural
// footstep sound (Web Audio, no samples).

import * as THREE from 'three';

export class Puffs {
  constructor(scene, max = 900) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.span = new Float32Array(max).fill(1);
    this.floor = new Float32Array(max);
    this.lifeN = new Float32Array(max);
    this.size = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.lifeN, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = g;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSize;
        uniform float uScale; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = aLife;
          gl_PointSize = aLife > 0.0 ? aSize * uScale / -mv.z * (0.7 + 0.3 * aLife) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * min(1.0, vA * 1.6) * 0.85);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, dx, dz, count, { spread = 0.6, lift = 1.0, size = 0.025, life = 0.9 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.08;
      this.pos[i * 3] = x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = y + 0.01;
      this.pos[i * 3 + 2] = z + Math.sin(a) * r;
      const out = spread * (0.3 + Math.random() * 0.7);
      this.vel[i * 3] = Math.cos(a) * out + dx * 0.35;
      this.vel[i * 3 + 1] = lift * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * out + dz * 0.35;
      this.span[i] = life * (0.6 + Math.random() * 0.6);
      this.life[i] = this.span[i];
      this.floor[i] = y - 0.02;
      this.size[i] = size * (0.5 + Math.random());
    }
  }

  update(dt) {
    const drag = Math.exp(-dt * 2.5);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.lifeN[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 3.2 * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < this.floor[i]) {
        this.pos[i * 3 + 1] = this.floor[i];
        this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
      }
      this.lifeN[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }
}

export class Footsteps {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) return;
    if (!this.ctx) {
      const ctx = new AudioContext();
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ctx.destination);
      this.ctx = ctx;
    }
    this.ctx.resume();
  }

  #noiseBurst(t, dur, type, freq, level, sweepTo, q = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.03);
  }

  /** Arm swing / ball leaving the hand. */
  whoosh() {
    if (!this.enabled || !this.ctx) return;
    this.#noiseBurst(this.ctx.currentTime + 0.005, 0.28, 'bandpass', 500, 0.35, 2600, 1.6);
  }

  /** Snowball hitting the ground. */
  thud(kind) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    this.#noiseBurst(t, 0.22, 'lowpass', kind === 'Mud' ? 380 : 650, 0.8, 0, 1.2);
    this.step(kind, 1.3, 0, 0.8);
  }

  step(kind, strength = 1, pan = 0, gain = 1) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.005;
    const out = ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.master);
    const amp = strength * gain;

    const burst = (t, dur, type, freq, q, level, sweepTo) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.7, dur + 0.03);
    };

    if (kind === 'Snow') {
      // Compression crunch: a cluster of tiny bright crackles + a soft thud.
      burst(t0, 0.16, 'lowpass', 700, 0.8, 0.35 * amp);
      const n = 10 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        const t = t0 + Math.pow(Math.random(), 1.6) * 0.17;
        burst(t, 0.008 + Math.random() * 0.02, 'bandpass', 1600 + Math.random() * 4200, 1.4, 0.32 * amp);
      }
    } else if (kind === 'Sand') {
      burst(t0, 0.17, 'bandpass', 2400, 0.6, 0.28 * amp);
      burst(t0 + 0.015, 0.12, 'highpass', 5200, 0.7, 0.12 * amp);
      burst(t0, 0.09, 'lowpass', 400, 0.7, 0.25 * amp);
    } else {
      burst(t0, 0.2, 'lowpass', 420, 2.5, 0.6 * amp);
      burst(t0 + 0.03, 0.16, 'bandpass', 320, 7, 0.45 * amp, 1300);
    }
  }
}

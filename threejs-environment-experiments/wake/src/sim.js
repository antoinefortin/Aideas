// GPU wave simulation: a height field + velocity solved with the discrete
// wave equation on a half-float ping-pong texture. Anything that disturbs
// the water (legs, stones, rain, falling droplets) queues a Gaussian
// impulse; the sim spreads it as rings that reflect, interfere and fade.
//
// texel: R = height (m), G = vertical velocity (m/step), B = foam.

import * as THREE from 'three';

const MAX_DROPS = 64;
const STEP = 1 / 60;

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
uniform sampler2D uState;
uniform float uTexel;
uniform float uK;
uniform float uDamping;
uniform float uArea;
uniform float uFoamDecay;
uniform float uFoamGain;
uniform vec4 uDrops[${MAX_DROPS}];
uniform int uDropCount;
varying vec2 vUv;

void main() {
  vec4 s = texture2D(uState, vUv);
  float h = s.r;
  float v = s.g;
  float avg = 0.25 * (texture2D(uState, vUv + vec2(uTexel, 0.0)).r + texture2D(uState, vUv - vec2(uTexel, 0.0)).r +
                      texture2D(uState, vUv + vec2(0.0, uTexel)).r + texture2D(uState, vUv - vec2(0.0, uTexel)).r);
  v += (avg - h) * uK;

  // Absorbing border so rings don't bounce off the edge of the sim.
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float sponge = smoothstep(0.0, 0.07, edge);
  v *= uDamping * mix(0.8, 1.0, sponge);

  vec2 w = (vUv - 0.5) * uArea;
  float imp = 0.0;
  float big = 0.0; // impulses from limbs / stones (rain and droplets are small and make no foam)
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 d = uDrops[i];
    vec2 dd = w - d.xy;
    float q = dot(dd, dd) / (d.z * d.z);
    if (q < 9.0) {
      float g = d.w * exp(-q);
      imp += g;
      if (d.z > 0.05) big += abs(g);
    }
  }
  v += imp;
  h += v;
  h *= mix(0.85, 1.0, sponge);

  // Only real disturbances (wakes, splashes) whip up foam — not rain or faint ripples.
  float foam = s.b * uFoamDecay + uFoamGain * (max(big - 0.0008, 0.0) * 60.0 + max(abs(v) - 0.012, 0.0) * 30.0);
  gl_FragColor = vec4(h, v, clamp(foam, 0.0, 1.5), 1.0);
}`;

export class WaveSim {
  constructor(renderer, { area = 24, resolution = 512 } = {}) {
    this.renderer = renderer;
    this.area = area;
    this.resolution = resolution;
    this.accum = 0;
    this.drops = [];
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.targets = [new THREE.WebGLRenderTarget(resolution, resolution, opts), new THREE.WebGLRenderTarget(resolution, resolution, opts)];
    this.index = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uState: { value: null },
        uTexel: { value: 1 / resolution },
        uK: { value: 1.8 },
        uDamping: { value: 0.995 },
        uArea: { value: area },
        uFoamDecay: { value: 0.97 },
        uFoamGain: { value: 0.5 },
        uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
        uDropCount: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.camera = new THREE.OrthographicCamera();
    this.clear();
  }

  get texture() {
    return this.targets[this.index].texture;
  }

  clear() {
    const r = this.renderer;
    const c = r.getClearColor(new THREE.Color());
    const a = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of this.targets) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setRenderTarget(null);
    r.setClearColor(c, a);
  }

  /** Push the water at (x, z): radius r (m), strength s (m/step, + up / - down). */
  addDrop(x, z, r, s) {
    if (this.drops.length >= MAX_DROPS * 4) return;
    if (Math.abs(x) > this.area / 2 || Math.abs(z) > this.area / 2) return;
    this.drops.push(x, z, r, s);
  }

  get dropRoom() {
    return MAX_DROPS - this.drops.length / 4;
  }

  step(dt) {
    this.accum = Math.min(this.accum + dt, STEP * 4);
    let n = 0;
    while (this.accum >= STEP && n < 3) {
      this.accum -= STEP;
      this.#substep(n === 0);
      n++;
    }
  }

  #substep(withDrops) {
    const u = this.material.uniforms;
    const count = withDrops ? this.drops.length / 4 : 0;
    for (let i = 0; i < count; i++) u.uDrops.value[i].fromArray(this.drops, i * 4);
    u.uDropCount.value = count;
    if (withDrops) this.drops.length = 0;
    u.uState.value = this.texture;
    const r = this.renderer;
    r.setRenderTarget(this.targets[1 - this.index]);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.index = 1 - this.index;
  }
}

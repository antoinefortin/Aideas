// TrailMap — a GPU height field that remembers every footfall.
//
// Two half-float render targets (ping-pong) cover the walkable square of the
// ground. Channel R = how deep the surface has been pressed (0..1+),
// channel G = how much material was pushed up into a rim around the print.
// Footprints are drawn as oriented quads with MAX blending, so a foot that
// stays planted for several frames never digs deeper than its full press,
// and overlapping prints keep the deepest value. A slow "refill" pass
// (decay + blur) lets old prints soften and disappear like drifting snow.

import * as THREE from 'three';

const STAMP_VERT = /* glsl */ `
uniform vec2 uCenter;   // world XZ of the print centre
uniform vec2 uDir;      // unit XZ heel -> toe
uniform vec2 uHalf;     // half extents of the quad (across, along) in metres
uniform float uMapSize; // world size covered by the map
varying vec2 vQ;        // print-local metres: x across, y along (heel < 0 < toe)
varying vec2 vWorld;
void main() {
  vec2 q = position.xy * uHalf;
  vec2 right = vec2(uDir.y, -uDir.x);
  vec2 w = uCenter + right * q.x + uDir * q.y;
  vQ = q;
  vWorld = w;
  vec2 tuv = w / uMapSize + 0.5;
  gl_Position = vec4(tuv * 2.0 - 1.0, 0.0, 1.0);
}`;

const STAMP_FRAG = /* glsl */ `
uniform float uL;        // sole length (m)
uniform float uW;        // sole width (m)
uniform float uHeel;     // 0..1 how hard the heel is pressing
uniform float uToe;      // 0..1 how hard the forefoot is pressing
uniform float uTread;    // 0..1 lug pattern strength
uniform float uSoft;     // 0..1 crumbly soft walls (snow) vs crisp (mud)
uniform float uInner;    // +1/-1 : which side of the quad is the arch side
uniform float uStrength; // overall weight (running presses harder)
uniform float uShape;    // 0 = boot print, 1 = round bowl (scoop, chunk), 2 = impact crater + spray
uniform float uSeed;
varying vec2 vQ;
varying vec2 vWorld;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float sdEllipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void bowl() {
  // Spherical imprint: sqrt(1 - k^2) profile, crumbly edge, raised rim.
  vec2 r = vec2(uW, uL) * 0.5;
  float k = length(vQ / r);
  k += (vnoise(vWorld * 70.0 + uSeed) - 0.5) * 0.22 * (0.4 + uSoft);
  float inside = sqrt(clamp(1.0 - k * k, 0.0, 1.0));
  float rimD = (k - 1.12) / (0.18 + 0.12 * uSoft);
  float rim = exp(-rimD * rimD);
  float spray = 0.0;
  if (uShape > 1.5) {
    // Snow thrown out of the crater in streaks, longer in the travel direction.
    float a = atan(vQ.x, vQ.y);
    float fwd = max(0.0, vQ.y / (length(vQ) + 1e-4));
    float reach = mix(1.7, 3.0, fwd * fwd);
    float rays = smoothstep(0.45, 0.85, vnoise(vec2(a * 5.0 + uSeed * 7.0, uSeed)));
    rays *= smoothstep(0.95, 1.15, k) * (1.0 - smoothstep(1.2, reach, k));
    float clumps = smoothstep(0.62, 0.8, vnoise(vWorld * 55.0 + uSeed * 3.0));
    spray = rays * (0.7 + 1.1 * clumps);
  }
  float press = max(uHeel, uToe);
  gl_FragColor = vec4(inside * press * uStrength, (rim + spray) * press * uStrength * 0.8, 0.0, 1.0);
}

void main() {
  if (uShape > 0.5) { bowl(); return; }
  float L = uL, W = uW;
  vec2 q = vQ;
  vec2 qi = vec2(q.x * uInner, q.y);           // +x = arch / big-toe side

  // Boot outline: heel pad + wider forefoot, slightly toed-in, smooth waist.
  float heel = sdEllipse(qi - vec2(-W * 0.02, -L * 0.29), vec2(W * 0.37, L * 0.21));
  float fore = sdEllipse(qi - vec2( W * 0.05,  L * 0.15), vec2(W * 0.50, L * 0.35));
  float d = smin(heel, fore, W * 0.35);

  // Crumbly edges in soft material.
  d += (vnoise(vWorld * 90.0) - 0.5) * 0.007 * uSoft;
  d += (vnoise(vWorld * 260.0) - 0.5) * 0.003 * uSoft;

  float s = mix(0.003, 0.016, uSoft);           // wall softness (m)
  float inside = 1.0 - smoothstep(-s, s * 0.6, d);

  // Lug sole: chevrons + a raised perimeter ring, a shallower arch.
  float t = fract(q.y / (L * 0.06) + abs(q.x) / (L * 0.085));
  float lug = smoothstep(0.08, 0.22, t) * smoothstep(0.72, 0.58, t);
  float perim = smoothstep(-0.016, -0.006, d);
  float sole = max(lug, perim);
  float depthMul = 1.0 - uTread * 0.32 * (1.0 - sole);
  float shank = exp(-pow((q.y + L * 0.06) / (L * 0.09), 2.0));
  depthMul *= 1.0 - shank * 0.45 * smoothstep(-W * 0.25, W * 0.35, qi.x);

  // Heel-to-toe roll: each half of the print only presses while that part
  // of the foot is on the ground.
  float u = q.y / L + 0.5;
  float press = mix(uHeel, uToe, smoothstep(0.32, 0.62, u));

  // Displaced material piles up in a ring just outside the wall.
  float rimD = (d - W * 0.12) / (W * (0.10 + 0.08 * uSoft));
  float rim = exp(-rimD * rimD) * smoothstep(-s, W * 0.06, d);
  rim *= 0.75 + 0.5 * vnoise(vWorld * 40.0);

  float r = inside * depthMul * press * uStrength;
  float g = rim * max(press, 0.6 * max(uHeel, uToe)) * uStrength;
  gl_FragColor = vec4(r, g, 0.0, 1.0);
}`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const REFILL_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uKeep;
uniform float uSub;
uniform float uSmooth;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uPrev, vUv);
  vec4 b = 0.25 * (texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)) + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)) +
                   texture2D(uPrev, vUv + vec2(0.0, uTexel.y)) + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)));
  c = mix(c, b, uSmooth);
  gl_FragColor = max(c * uKeep - uSub, vec4(0.0));
}`;

export class TrailMap {
  constructor(renderer, { size = 24, resolution = 2048, maxStamps = 12 } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.resolution = resolution;
    this.accum = 0;

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
    this.targets = [
      new THREE.WebGLRenderTarget(resolution, resolution, opts),
      new THREE.WebGLRenderTarget(resolution, resolution, opts),
    ];
    this.index = 0;
    this.camera = new THREE.OrthographicCamera();

    // Stamp scene: one quad per possible simultaneous print.
    this.stampScene = new THREE.Scene();
    this.stampMeshes = [];
    const quad = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < maxStamps; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: STAMP_VERT,
        fragmentShader: STAMP_FRAG,
        uniforms: {
          uCenter: { value: new THREE.Vector2() },
          uDir: { value: new THREE.Vector2(0, 1) },
          uHalf: { value: new THREE.Vector2() },
          uMapSize: { value: size },
          uL: { value: 0.28 },
          uW: { value: 0.1 },
          uHeel: { value: 0 },
          uToe: { value: 0 },
          uTread: { value: 0.5 },
          uSoft: { value: 0.5 },
          uInner: { value: 1 },
          uStrength: { value: 1 },
          uShape: { value: 0 },
          uSeed: { value: 0 },
        },
        blending: THREE.CustomBlending,
        blendEquation: THREE.MaxEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      const mesh = new THREE.Mesh(quad, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.stampScene.add(mesh);
      this.stampMeshes.push(mesh);
    }

    // Refill (decay + blur) pass.
    this.refillMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: REFILL_FRAG,
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / resolution, 1 / resolution) },
        uKeep: { value: 1 },
        uSub: { value: 0 },
        uSmooth: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.refillScene = new THREE.Scene();
    const fs = new THREE.Mesh(quad, this.refillMat);
    fs.frustumCulled = false;
    this.refillScene.add(fs);

    this.clear();
  }

  get texture() {
    return this.targets[this.index].texture;
  }

  clear() {
    const r = this.renderer;
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const t of this.targets) {
      r.setRenderTarget(t);
      r.clear(true, false, false);
    }
    r.setRenderTarget(null);
    r.setClearColor(prevColor, prevAlpha);
  }

  /** Slowly fills old prints back in. rate is in "1/seconds". */
  refill(dt, rate) {
    if (rate <= 0) {
      this.accum = 0;
      return;
    }
    this.accum += dt;
    // Half floats can't represent tiny per-frame multipliers, so batch them.
    if (rate * this.accum < 0.008) return;
    const k = rate * this.accum;
    const u = this.refillMat.uniforms;
    u.uPrev.value = this.texture;
    u.uKeep.value = Math.exp(-k);
    u.uSub.value = k * 0.02;
    u.uSmooth.value = Math.min(0.6, k * 3);
    const write = this.targets[1 - this.index];
    this.#render(this.refillScene, write);
    this.index = 1 - this.index;
    this.accum = 0;
  }

  /**
   * Presses prints into the map.
   * stamps: [{ x, z, dx, dz, L, W, heel, toe, inner, shape?, strength?, seed? }]
   * shape 0 = boot print, 1 = round bowl, 2 = impact crater with spray.
   */
  stamp(stamps, { tread, softness, strength }) {
    const per = this.stampMeshes.length;
    for (let start = 0; start < stamps.length; start += per) {
      this.stampMeshes.forEach((m, i) => {
        const s = stamps[start + i];
        m.visible = !!s;
        if (!s) return;
        const u = m.material.uniforms;
        const shape = s.shape || 0;
        u.uCenter.value.set(s.x, s.z);
        u.uDir.value.set(s.dx, s.dz);
        if (shape === 2) u.uHalf.value.set(s.W * 1.6, s.L * 1.6);
        else if (shape === 1) u.uHalf.value.set(s.W * 0.75, s.L * 0.75);
        else {
          const margin = s.W * 0.55;
          u.uHalf.value.set(s.W * 0.5 + margin, s.L * 0.5 + margin);
        }
        u.uL.value = s.L;
        u.uW.value = s.W;
        u.uHeel.value = s.heel;
        u.uToe.value = s.toe;
        u.uInner.value = s.inner ?? 1;
        u.uTread.value = tread;
        u.uSoft.value = softness;
        u.uStrength.value = s.strength ?? strength;
        u.uShape.value = shape;
        u.uSeed.value = s.seed ?? 0;
      });
      this.#render(this.stampScene, this.targets[this.index], false);
    }
  }

  #render(scene, target, clear = true) {
    const r = this.renderer;
    const autoClear = r.autoClear;
    r.autoClear = clear;
    r.setRenderTarget(target);
    r.render(scene, this.camera);
    r.setRenderTarget(null);
    r.autoClear = autoClear;
  }

  dispose() {
    this.targets.forEach((t) => t.dispose());
  }
}

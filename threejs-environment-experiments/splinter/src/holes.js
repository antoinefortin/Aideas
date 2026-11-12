// HoleMap — the board's damage, stored in a half-float texture laid out in
// board space (metres → UV). Every pellet stamps four fields with MAX
// blending:
//   R  entry coverage   1 at the centre, 0.5 at the hole edge, 0 at 2× radius
//   G  exit coverage    bigger, ragged, stretched along the grain (tear-out)
//   B  penetration      1 = through, <1 = blind dent that stops at that depth
//   A  damage           crushed-fibre bruise + splits running along the grain
// The plank shader ray-marches these fields through the board's thickness.

import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const VERT = /* glsl */ `
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform vec2 uBoard;
varying vec2 vQ;
void main() {
  vQ = position.xy * uHalf;
  vec2 b = uCenter + vQ;
  gl_Position = vec4((b / uBoard) * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
uniform float uR;
uniform float uExit;
uniform float uDepth;
uniform float uSeed;
uniform float uCrack;
uniform float uBruise;
uniform vec2 uExitOff;
varying vec2 vQ;

void main() {
  vec2 q = vQ;
  float ang = atan(q.y, q.x);

  // Entry: a slightly ragged round punch, fibres torn a touch along the grain.
  float jag = (vnoise2(vec2(ang * 3.0 + uSeed, uSeed)) - 0.5) * 0.22 + (vnoise2(vec2(ang * 13.0, uSeed * 2.0)) - 0.5) * 0.12;
  float de = length(q * vec2(1.0, 0.86)) / uR * (1.0 + jag);
  float R = clamp(1.5 - de, 0.0, 1.0);

  // Exit: wood tears out the back, long splinters along the grain.
  float G = 0.0;
  if (uDepth > 0.99) {
    vec2 qe = q - uExitOff;
    float ae = atan(qe.y, qe.x);
    // one or two splinters peel off along the grain
    float lobe = pow(abs(sin(ae)), 14.0) * (0.25 + 0.75 * hash11(uSeed * 5.1 + (qe.y > 0.0 ? 1.0 : 0.0)));
    float jag2 = (vnoise2(vec2(ae * 2.5 + uSeed * 4.0, 1.7)) - 0.5) * 0.4 + (vnoise2(vec2(ae * 8.0, uSeed)) - 0.5) * 0.14;
    float dx = length(qe * vec2(1.0, 0.62)) / (uR * uExit) * (1.0 + jag2) / (1.0 + lobe * 0.9);
    G = clamp(1.5 - dx, 0.0, 1.0);
  }

  // Splits running up / down the grain from the hole.
  float crack = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    if (fi >= uCrack * 3.0) break;
    float dir = hash11(uSeed + fi * 3.1) > 0.5 ? 1.0 : -1.0;
    float len = uR * (5.0 + 22.0 * hash11(uSeed * 2.3 + fi)) * (0.4 + uCrack);
    float y = q.y * dir;
    float xoff = (hash11(uSeed * 3.7 + fi) - 0.5) * uR * 1.2 + (vnoise2(vec2(y * 140.0, fi * 7.0 + uSeed)) - 0.5) * 0.0025;
    float w = 0.0004 + 0.0011 * (1.0 - clamp(y / len, 0.0, 1.0)) * (0.5 + uCrack);
    float c = step(uR * 0.7, y) * (1.0 - smoothstep(len * 0.55, len, y)) * (1.0 - smoothstep(w * 0.4, w, abs(q.x - xoff)));
    crack = max(crack, c);
  }
  float bruise = (1.0 - smoothstep(uR * 1.0, uR * 2.8, length(q))) * uBruise;
  float B = uDepth * step(0.004, max(R, G));
  gl_FragColor = vec4(R, G, B, max(bruise * 0.55, crack));
}`;

export const AMMO = {
  '00 Buck': { pellets: 9, spread: 1.7, r: 0.0042, exit: 1.9, depth: [1, 1], crack: [0, 0.35], bruise: 0.7, chipsFront: 3, chipsBack: 7, speed: 400 },
  'Birdshot #7½': { pellets: 140, spread: 1.5, r: 0.00125, exit: 1, depth: [0.18, 0.5], crack: [0, 0], bruise: 0.35, chipsFront: 0.15, chipsBack: 0, speed: 380 },
  'Slug': { pellets: 1, spread: 0.12, r: 0.0095, exit: 2.8, depth: [1, 1], crack: [0.6, 1], bruise: 1, chipsFront: 14, chipsBack: 45, speed: 460 },
};

export class HoleMap {
  constructor(renderer, { width = 1, height = 1.2, resolution = 2048, maxStamps = 16 } = {}) {
    this.renderer = renderer;
    this.size = new THREE.Vector2(width, height);
    this.holes = []; // CPU copy for pass-through tests
    this.target = new THREE.WebGLRenderTarget(resolution, Math.round(resolution * (height / width)), {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.texel = new THREE.Vector2(width / this.target.width, height / this.target.height);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera();
    this.meshes = [];
    const quad = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < maxStamps; i++) {
      const m = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms: {
            uCenter: { value: new THREE.Vector2() },
            uHalf: { value: new THREE.Vector2() },
            uBoard: { value: this.size },
            uR: { value: 0.004 },
            uExit: { value: 2 },
            uDepth: { value: 1 },
            uSeed: { value: 0 },
            uCrack: { value: 0 },
            uBruise: { value: 0.6 },
            uExitOff: { value: new THREE.Vector2() },
          },
          blending: THREE.CustomBlending,
          blendEquation: THREE.MaxEquation,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneFactor,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        })
      );
      m.frustumCulled = false;
      m.visible = false;
      this.scene.add(m);
      this.meshes.push(m);
    }
    this.clear();
  }

  get texture() {
    return this.target.texture;
  }

  clear() {
    const r = this.renderer;
    const c = r.getClearColor(new THREE.Color());
    const a = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.target);
    r.clear(true, false, false);
    r.setRenderTarget(null);
    r.setClearColor(c, a);
    this.holes.length = 0;
  }

  /** Is (x, y) inside an existing through-hole? (pellet passes straight through) */
  isOpen(x, y) {
    for (const h of this.holes) if (h.through && (x - h.x) ** 2 + (y - h.y) ** 2 < (h.r * 0.85) ** 2) return true;
    return false;
  }

  /** stamps: [{ x, y, r, exit, depth, crack, bruise, ex, ey }] in board metres */
  stamp(stamps) {
    if (!stamps.length) return;
    const per = this.meshes.length;
    const r = this.renderer;
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.target);
    for (let start = 0; start < stamps.length; start += per) {
      this.meshes.forEach((m, i) => {
        const s = stamps[start + i];
        m.visible = !!s;
        if (!s) return;
        const u = m.material.uniforms;
        u.uCenter.value.set(s.x, s.y);
        const reach = Math.max(s.r * 3.0, s.r * s.exit * 1.5 * 1.25 * 1.62 * 1.95 + Math.hypot(s.ex, s.ey), s.crack > 0 ? s.r * 27 * (0.4 + s.crack) + s.r : 0);
        u.uHalf.value.set(reach, reach);
        u.uR.value = s.r;
        u.uExit.value = s.exit;
        u.uDepth.value = s.depth;
        u.uSeed.value = Math.random() * 100;
        u.uCrack.value = s.crack;
        u.uBruise.value = s.bruise;
        u.uExitOff.value.set(s.ex, s.ey);
      });
      r.render(this.scene, this.camera);
    }
    r.setRenderTarget(null);
    r.autoClear = autoClear;
    for (const s of stamps) this.holes.push({ x: s.x, y: s.y, r: s.r, through: s.depth > 0.99 });
  }
}

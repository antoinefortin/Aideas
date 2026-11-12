// Wind waves: up to four Gerstner waves (shared by the GPU water shader and
// the CPU, which needs the surface height to know where limbs cross it),
// plus a GLSL "detail" layer of small capillary waves for the normals.
import * as THREE from 'three';

const G = 9.81;
const MAX = 4;

export const waveUniforms = {
  uWaveA: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // dir.x, dir.z, k, omega
  uWaveB: { value: Array.from({ length: MAX }, () => new THREE.Vector2()) }, // amplitude, steepness Q
  uWaveScale: { value: 1 },
  uTime: { value: 0 },
  uDetail: { value: 0.5 },
  uDetailScale: { value: 1 },
  uFlow: { value: new THREE.Vector2() },
};

/** defs: [[directionDeg, amplitude m, wavelength m, steepness 0..1], ...] */
export function setWaves(defs = []) {
  const n = Math.max(1, defs.length);
  for (let i = 0; i < MAX; i++) {
    const d = defs[i];
    const A = waveUniforms.uWaveA.value[i];
    const B = waveUniforms.uWaveB.value[i];
    if (!d) {
      A.set(1, 0, 1, 1);
      B.set(0, 0);
      continue;
    }
    const [deg, amp, len, steep] = d;
    const a = THREE.MathUtils.degToRad(deg);
    const k = (2 * Math.PI) / len;
    A.set(Math.cos(a), Math.sin(a), k, Math.sqrt(G * k));
    B.set(amp, (steep * 0.5) / (k * amp * n));
  }
}

/** Surface height of the wind waves at (x, z) (horizontal Gerstner shift ignored). */
export function waveHeight(x, z) {
  const t = waveUniforms.uTime.value;
  const s = waveUniforms.uWaveScale.value;
  let h = 0;
  for (let i = 0; i < MAX; i++) {
    const A = waveUniforms.uWaveA.value[i];
    const amp = waveUniforms.uWaveB.value[i].x;
    if (amp <= 0) continue;
    h += amp * s * Math.sin(A.z * (A.x * x + A.y * z) - A.w * t);
  }
  return h;
}

export const WAVES_GLSL = /* glsl */ `
uniform vec4 uWaveA[4];
uniform vec2 uWaveB[4];
uniform float uWaveScale;
uniform float uTime;
uniform float uDetail;
uniform float uDetailScale;
uniform vec2 uFlow;

// Returns the Gerstner displacement; grad = (dh/dx, dh/dz).
vec3 gerstner(vec2 p, out vec2 grad) {
  vec3 d = vec3(0.0);
  grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 a = uWaveA[i];
    float amp = uWaveB[i].x * uWaveScale;
    if (amp <= 0.0) continue;
    float q = uWaveB[i].y;
    float ph = a.z * dot(a.xy, p) - a.w * uTime;
    float s = sin(ph), c = cos(ph);
    d.x += q * amp * a.x * c;
    d.z += q * amp * a.y * c;
    d.y += amp * s;
    grad += a.xy * (amp * a.z * c);
  }
  return d;
}

// Small capillary ripples, analytic gradient only (for normals).
vec2 detailGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  p -= uFlow * t;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float ang = fi * 2.39996 + 0.4;
    vec2 d = vec2(cos(ang), sin(ang));
    float L = mix(0.09, 1.0, fract(fi * 0.618 + 0.13)) / uDetailScale;
    float k = 6.28318 / L;
    float w = sqrt(9.81 * k);
    float A = L * 0.011;
    float ph = k * dot(d, p) - w * t + fi * 1.7;
    g += d * (A * k * cos(ph));
  }
  return g * uDetail;
}
`;

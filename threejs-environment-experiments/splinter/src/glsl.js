// Shared GLSL: noise and procedural wood (pine planks, walnut furniture).

export const NOISE_GLSL = /* glsl */ `
float hash11(float n) { return fract(sin(n * 127.1 + 0.37) * 43758.5453); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p *= 2.03; a *= 0.5; }
  return s;
}
vec3 srgbToLinear3(vec3 c) { return pow(c, vec3(2.2)); }

// Bump-mapped normal from a scalar height using screen-space derivatives.
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, float h, float scale) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * scale * r1 + dFdy(h) * scale * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

// Wood is modelled as growth rings around a pith (the log's centre) that runs
// roughly along +y, cut by a flat plank: the face shows "cathedral" arches,
// the end grain (inside bullet holes) shows the rings themselves.
export const WOOD_GLSL = /* glsl */ `
// p: metres, grain along +y. kind 0 = pine, 1 = walnut.
void wood(vec3 p, float seed, float kind, float detail, out vec3 col, out float rough, out float h) {
  float s1 = hash11(seed * 1.7 + 0.3), s2 = hash11(seed * 3.1 + 1.1), s3 = hash11(seed * 5.3 + 2.7);
  float ringsPerM = kind < 0.5 ? 85.0 + 55.0 * s3 : 70.0;
  vec2 pith = vec2((s1 - 0.5) * 0.5 + (s1 > 0.5 ? 0.1 : -0.1), -0.1 - 0.25 * s2);
  float tilt = kind < 0.5 ? 0.11 : 0.3;
  vec2 c = vec2(p.x, p.z) - pith + vec2(p.y * (s2 - 0.5) * tilt, p.y * (0.4 + 0.6 * s3) * tilt);
  float warp = (fbm3(vec3(p.x * 5.0, p.y * 0.55, p.z * 5.0) + seed * 13.0) - 0.5) * (kind < 0.5 ? 0.026 : 0.05)
             + (kind > 0.5 ? (fbm3(vec3(p.x * 14.0, p.y * 3.0, p.z * 14.0) + seed) - 0.5) * 0.03 : 0.0);
  float knot = 0.0;
  if (kind < 0.5) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      if (hash11(seed * 17.0 + fk) < 0.35) continue;
      vec2 kp = vec2((hash11(seed * 7.0 + fk * 3.3) - 0.5) * 0.14, (hash11(seed * 11.0 + fk * 5.1) - 0.5) * 1.05);
      float kr = 0.006 + 0.011 * hash11(seed * 13.0 + fk);
      vec2 dk = (p.xy - kp) * vec2(1.0, 0.72);
      float dd = length(dk);
      warp += exp(-dd * dd / (kr * kr * 30.0)) * 0.035;
      knot = max(knot, 1.0 - smoothstep(kr * 0.65, kr * 1.1, dd));
    }
  }
  float r = length(c) + warp;
  float ring = fract(r * ringsPerM);
  float soft = mix(0.25, 0.0, detail);
  float late = smoothstep(0.5 - soft, 0.82, ring) * (1.0 - smoothstep(0.9 - soft, 1.0, ring));
  late = mix(0.35, late, 0.4 + 0.6 * detail);
  float fiber = vnoise3(vec3(p.x * 1300.0, p.y * 24.0, p.z * 1300.0));
  float big = fbm3(p * vec3(6.0, 1.1, 6.0) + seed);
  vec3 early, lateC;
  if (kind < 0.5) {
    early = srgbToLinear3(vec3(0.82, 0.64, 0.42));
    lateC = srgbToLinear3(vec3(0.6, 0.39, 0.21));
  } else {
    early = srgbToLinear3(vec3(0.36, 0.22, 0.13));
    lateC = srgbToLinear3(vec3(0.22, 0.12, 0.065));
  }
  col = mix(early, lateC, late * (kind < 0.5 ? 0.85 : 0.55));
  col *= 1.0 + (fiber - 0.5) * 0.12 * detail;
  col *= 0.84 + 0.32 * big;
  if (kind > 0.5) {
    // Walnut: open pores and a little figure.
    float pores = smoothstep(0.86, 0.95, vnoise3(vec3(p.x * 1600.0, p.y * 70.0, p.z * 1600.0)));
    col *= 1.0 - 0.45 * pores;
    col *= 0.78 + 0.35 * smoothstep(0.25, 0.75, fbm3(vec3(p.x * 18.0, p.y * 4.0, p.z * 18.0) + seed * 3.0)); // figure / colour streaks
  }
  col = mix(col, srgbToLinear3(vec3(0.3, 0.16, 0.07)), knot * 0.9);
  rough = mix(0.74, 0.58, late) - knot * 0.1;
  h = late * 0.35 + fiber * 0.08 * detail - knot * 0.3;
}
`;

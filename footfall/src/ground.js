// The ground: a densely tessellated plane whose vertices are pushed down by
// the trail map (vertex displacement), plus a gentle rolling base shape.
// Fragment normals are rebuilt from the same height field so prints read
// crisply even between vertices, and a fine grain noise gives the surface
// its snow / sand / mud texture.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Base terrain — must stay identical between GLSL and JS (the walker uses
// the JS version to stand on the surface).
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const terrain = { amplitude: 0.07, half: 12 };

export function baseHeight(x, z) {
  const h =
    Math.sin(x * 0.23 + 1.7) * Math.cos(z * 0.19 - 0.4) * 0.6 +
    Math.sin(x * 0.7 - z * 0.5 + 2.3) * 0.25 +
    Math.sin(x * 0.31 + z * 0.42 + 0.5) * 0.35;
  const e = 1 - smoothstep(terrain.half - 3.5, terrain.half - 0.5, Math.max(Math.abs(x), Math.abs(z)));
  return h * terrain.amplitude * e;
}

const COMMON_GLSL = /* glsl */ `
uniform sampler2D uTrail;
uniform float uMapSize;
uniform float uDepth;
uniform float uRimH;
uniform float uUndulate;
uniform float uHalf;
varying vec2 vTuv;
varying vec2 vWorldXZ;

float baseH(vec2 p) {
  float h = sin(p.x * 0.23 + 1.7) * cos(p.y * 0.19 - 0.4) * 0.6
          + sin(p.x * 0.7 - p.y * 0.5 + 2.3) * 0.25
          + sin(p.x * 0.31 + p.y * 0.42 + 0.5) * 0.35;
  float e = 1.0 - smoothstep(uHalf - 3.5, uHalf - 0.5, max(abs(p.x), abs(p.y)));
  return h * uUndulate * e;
}
float trailH(vec4 t) {
  return -uDepth * t.r + uRimH * t.g * (1.0 - smoothstep(0.0, 0.35, t.r));
}
`;

const FRAG_GLSL = /* glsl */ `
uniform float uRes;
uniform vec3 uBaseColor;
uniform vec3 uPressedColor;
uniform vec3 uRimColor;
uniform float uRough;
uniform float uPressedRough;
uniform float uGrain;
uniform float uGrainScale;
uniform float uCavity;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float grainH(vec2 p) {
  return (vnoise(p * uGrainScale) * 0.6 + vnoise(p * uGrainScale * 2.7 + 7.1) * 0.4) * uGrain;
}
`;

export function createGround({ trail, size = 24, segments = 1024 }) {
  terrain.half = size / 2;

  const uniforms = {
    uTrail: { value: trail.texture },
    uMapSize: { value: trail.size },
    uRes: { value: trail.resolution },
    uDepth: { value: 0.07 },
    uRimH: { value: 0.016 },
    uUndulate: { value: terrain.amplitude },
    uHalf: { value: size / 2 },
    uBaseColor: { value: new THREE.Color('#eef3f8') },
    uPressedColor: { value: new THREE.Color('#b3c3d8') },
    uRimColor: { value: new THREE.Color('#ffffff') },
    uRough: { value: 0.85 },
    uPressedRough: { value: 0.6 },
    uGrain: { value: 0.004 },
    uGrainScale: { value: 9 },
    uCavity: { value: 0.45 },
  };

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec2 pW = (modelMatrix * vec4(transformed, 1.0)).xz;
        vTuv = pW / uMapSize + 0.5;
        vWorldXZ = pW;
        transformed.y += baseH(pW) + trailH(texture2D(uTrail, vTuv));`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_GLSL}\n${FRAG_GLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec4 trailS = texture2D(uTrail, vTuv);
        float footDep = clamp(trailS.r, 0.0, 1.5);
        float footRim = trailS.g * (1.0 - smoothstep(0.0, 0.35, trailS.r));
        float tint = vnoise(vWorldXZ * 1.3) * 0.6 + vnoise(vWorldXZ * 4.1) * 0.4;
        vec3 groundCol = uBaseColor * (0.94 + 0.12 * tint);
        groundCol = mix(groundCol, uPressedColor, smoothstep(0.03, 0.75, footDep));
        groundCol = mix(groundCol, uRimColor, clamp(footRim * 0.7, 0.0, 1.0));
        diffuseColor.rgb = groundCol;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(uRough, uPressedRough, smoothstep(0.1, 0.8, footDep));`
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          float e = uMapSize / uRes;              // one texel in metres
          vec2 du = vec2(1.0 / uRes, 0.0);
          float hL = trailH(texture2D(uTrail, vTuv - du.xy)) + baseH(vWorldXZ - vec2(e, 0.0));
          float hR = trailH(texture2D(uTrail, vTuv + du.xy)) + baseH(vWorldXZ + vec2(e, 0.0));
          float hD = trailH(texture2D(uTrail, vTuv - du.yx)) + baseH(vWorldXZ - vec2(0.0, e));
          float hU = trailH(texture2D(uTrail, vTuv + du.yx)) + baseH(vWorldXZ + vec2(0.0, e));
          float gx = (hR - hL) / (2.0 * e);
          float gz = (hU - hD) / (2.0 * e);

          // Fine grain, faded with distance to avoid shimmer.
          float fade = 1.0 - smoothstep(5.0, 22.0, length(vViewPosition));
          float ge = 0.15 / uGrainScale;
          float g0 = grainH(vWorldXZ);
          gx += (grainH(vWorldXZ + vec2(ge, 0.0)) - g0) / ge * fade;
          gz += (grainH(vWorldXZ + vec2(0.0, ge)) - g0) / ge * fade;

          vec3 nW = normalize(vec3(-gx, 1.0, -gz));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
        float cavity = 1.0 - uCavity * smoothstep(0.0, 1.0, footDep);
        reflectedLight.indirectDiffuse *= cavity;
        reflectedLight.directDiffuse *= mix(1.0, cavity, 0.35);`
      );
  };

  const group = new THREE.Group();

  // Dense displaced field where the walker roams.
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const field = new THREE.Mesh(geo, material);
  field.receiveShadow = true;
  field.frustumCulled = false;
  group.add(field);

  // Coarse skirt out to the horizon, same material (flat there).
  const far = 600;
  const band = (far - size) / 2;
  const parts = [
    [far, band, 0, size / 2 + band / 2],
    [far, band, 0, -(size / 2 + band / 2)],
    [band, size, size / 2 + band / 2, 0],
    [band, size, -(size / 2 + band / 2), 0],
  ].map(([w, h, x, z]) => {
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 8)));
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, z);
    return g;
  });
  const skirt = new THREE.Mesh(mergeGeometries(parts), material);
  skirt.receiveShadow = true;
  group.add(skirt);

  return { group, material, uniforms, field };
}

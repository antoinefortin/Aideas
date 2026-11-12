// The bed under the water: procedural sand ripples / pebbles / pool tiles /
// mud / rock, with animated caustics. Caustics combine a moving Voronoi
// pattern with the wave sim's curvature, so ripples from the walker and
// stones focus light into rings on the floor.

import * as THREE from 'three';
import { waveUniforms } from './waves.js';
import { skyUniforms } from './sky.js';

export const floorState = { depth: 0.5, variation: 0.08 };
export const FLOOR_TYPES = { sand: 0, pebbles: 1, tiles: 2, mud: 3, rock: 4 };

export function floorHeight(x, z) {
  const v =
    Math.sin(x * 0.27 + 0.6) * Math.cos(z * 0.21 - 1.1) * 0.6 +
    Math.sin(x * 0.83 - z * 0.61 + 2.0) * 0.25 +
    Math.sin(x * 0.4 + z * 0.5) * 0.3;
  return -floorState.depth + floorState.variation * v;
}

const COMMON = /* glsl */ `
uniform float uDepth;
uniform float uFloorVar;
varying vec2 vFloorXZ;
float floorH(vec2 p) {
  float v = sin(p.x * 0.27 + 0.6) * cos(p.y * 0.21 - 1.1) * 0.6
          + sin(p.x * 0.83 - p.y * 0.61 + 2.0) * 0.25
          + sin(p.x * 0.4 + p.y * 0.5) * 0.3;
  return -uDepth + uFloorVar * v;
}
`;

const FRAG = /* glsl */ `
uniform float uFloorType;
uniform vec3 uFloorA;
uniform vec3 uFloorB;
uniform float uCaustics;
uniform sampler2D uSim;
uniform float uArea;
uniform float uSimTexel;
uniform float uTime;
uniform float uWaveScale;
uniform vec2 uFlow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
// Voronoi: x = F1, y = F2, zw = nearest cell id
vec4 voronoi(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = hash22(i + g);
      vec2 o = g + 0.5 + 0.4 * sin(t + 6.2831 * h) - f;
      float d = dot(o, o);
      if (d < f1) { f2 = f1; f1 = d; id = i + g; }
      else if (d < f2) f2 = d;
    }
  return vec4(sqrt(f1), sqrt(f2), id);
}

vec3 floorPattern(vec2 p, out vec2 bump) {
  bump = vec2(0.0);
  float n = vnoise(p * 1.7) * 0.6 + vnoise(p * 6.0) * 0.4;
  if (uFloorType < 0.5) {            // sand ripples
    float w = p.x * 6.5 + sin(p.y * 1.1) * 1.4 + vnoise(p * 0.7) * 3.0;
    float r = sin(w);
    bump = vec2(cos(w) * 0.05, 0.0);
    return mix(uFloorA, uFloorB, clamp(n * 0.7 + r * 0.12, 0.0, 1.0));
  } else if (uFloorType < 1.5) {     // rounded pebbles of mixed size on gravelly sand
    vec3 sand = mix(uFloorB * 0.85, uFloorA * 0.95, n);
    vec3 c = sand;
    for (int layer = 0; layer < 2; layer++) {
      float sc = layer == 0 ? 4.5 : 9.0;
      vec2 q = p * sc + float(layer) * 13.7;
      vec4 v = voronoi(q, 0.0);
      float h = hash21(v.zw + float(layer));
      float rad = 0.26 + 0.2 * h;
      float stone = smoothstep(rad, rad - 0.06, v.x);
      vec2 centre = v.zw + 0.5 + 0.4 * sin(6.2831 * hash22(v.zw));
      vec3 sc3 = mix(uFloorA, uFloorB, hash21(v.zw + 3.1)) * (0.7 + 0.55 * h);
      sc3 *= mix(0.85, 1.1, vnoise(q * 3.0));
      c = mix(c, sc3, stone);
      bump = mix(bump, (q - centre) / rad * 0.9, stone);
    }
    return c;
  } else if (uFloorType < 2.5) {     // pool tiles + lane lines
    vec2 g = abs(fract(p / 0.25) - 0.5);
    float grout = smoothstep(0.47, 0.49, max(g.x, g.y));
    float lane = smoothstep(0.12, 0.1, abs(fract(p.x / 2.5) - 0.5) * 2.5) * step(abs(fract(p.y / 12.0) - 0.5) * 12.0, 5.2);
    vec3 c = mix(uFloorA, uFloorB, lane);
    return mix(c, c * 0.72, grout) * (0.96 + 0.06 * n);
  } else if (uFloorType < 3.5) {     // mud
    float m = vnoise(p * 0.9) * 0.6 + vnoise(p * 3.7) * 0.3 + vnoise(p * 11.0) * 0.1;
    bump = vec2(vnoise(p * 3.0 + 1.0) - 0.5, vnoise(p * 3.0 - 4.0) - 0.5) * 0.2;
    return mix(uFloorB, uFloorA, m);
  }
  // rock
  vec4 v = voronoi(p * 1.3, 0.0);
  float crack = 1.0 - smoothstep(0.0, 0.05, v.y - v.x);
  vec3 c = mix(uFloorA, uFloorB, n * 0.8 + hash21(v.zw) * 0.3);
  bump = vec2(vnoise(p * 4.0) - 0.5, vnoise(p * 4.0 + 7.0) - 0.5) * 0.3;
  return mix(c, uFloorB * 0.5, crack * 0.8);
}

float caustics(vec2 p, float t) {
  vec4 a = voronoi(p * 2.2 + vec2(t * 0.11, t * 0.07) - uFlow * t * 0.6, t * 0.9);
  vec4 b = voronoi(p * 3.1 - vec2(t * 0.08, -t * 0.12) - uFlow * t * 0.6 + 4.7, t * 1.1);
  float ca = exp(-(a.y - a.x) * 9.0);
  float cb = exp(-(b.y - b.x) * 9.0);
  return ca * 0.75 + cb * 0.6 + ca * cb * 1.2;
}
`;

export function createFloor({ sim, area = 24, size = 260, segments = 300 }) {
  const uniforms = {
    uDepth: { value: floorState.depth },
    uFloorVar: { value: floorState.variation },
    uFloorType: { value: 0 },
    uFloorA: { value: new THREE.Color() },
    uFloorB: { value: new THREE.Color() },
    uCaustics: { value: 1 },
    uSim: { value: sim.texture },
    uArea: { value: area },
    uSimTexel: { value: 1 / sim.resolution },
    uTime: waveUniforms.uTime,
    uWaveScale: waveUniforms.uWaveScale,
    uFlow: waveUniforms.uFlow,
    uSunDir: skyUniforms.uSunDir,
    uSunColor: skyUniforms.uSunColor,
    uSunIntensity: skyUniforms.uSunIntensity,
  };

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec2 fp = (modelMatrix * vec4(transformed, 1.0)).xz;
        vFloorXZ = fp;
        transformed.y += floorH(fp);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${FRAG}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec2 floorBump;
        diffuseColor.rgb = floorPattern(vFloorXZ, floorBump);`
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        {
          float e = 0.05;
          float gx = (floorH(vFloorXZ + vec2(e, 0.0)) - floorH(vFloorXZ - vec2(e, 0.0))) / (2.0 * e);
          float gz = (floorH(vFloorXZ + vec2(0.0, e)) - floorH(vFloorXZ - vec2(0.0, e))) / (2.0 * e);
          vec3 nW = normalize(vec3(-(gx + floorBump.x), 1.0, -(gz + floorBump.y)));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          float waterDepth = max(0.0, -floorH(vFloorXZ));
          float c = caustics(vFloorXZ, uTime) * (0.55 + 0.45 * min(uWaveScale, 1.5));
          vec2 suv = vFloorXZ / uArea + 0.5;
          if (all(greaterThan(suv, vec2(0.0))) && all(lessThan(suv, vec2(1.0)))) {
            float t = uSimTexel;
            float h = texture2D(uSim, suv).r;
            float lap = texture2D(uSim, suv + vec2(t, 0.0)).r + texture2D(uSim, suv - vec2(t, 0.0)).r +
                        texture2D(uSim, suv + vec2(0.0, t)).r + texture2D(uSim, suv - vec2(0.0, t)).r - 4.0 * h;
            c *= clamp(1.0 - lap * 900.0, 0.0, 3.0);
          }
          float atten = exp(-waterDepth * 0.9) * max(uSunDir.y, 0.0);
          totalEmissiveRadiance += uSunColor * uSunIntensity * diffuseColor.rgb * c * uCaustics * atten * 0.22;
        }`
      );
  };

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, uniforms, material };
}

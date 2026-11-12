// Water surface: vertices displaced by Gerstner wind waves + the wave sim;
// per-pixel normals from both plus capillary detail. The scene under the
// water is rendered to a texture first (with depth), so the surface can
// refract it and absorb light by how much water the view ray crosses
// (Beer–Lambert), then blend with sky reflections by Fresnel.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKY_GLSL, skyUniforms } from './sky.js';
import { WAVES_GLSL, waveUniforms } from './waves.js';

const VERT = /* glsl */ `
${WAVES_GLSL}
uniform sampler2D uSim;
uniform float uArea;
varying vec3 vWorld;
varying vec2 vBase;
varying vec2 vSimUv;
varying vec4 vClip;
varying vec3 vViewPos;
varying float vCrest;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 base = wp.xz;
  vec2 grad;
  vec3 g = gerstner(base, grad);
  vec2 suv = base / uArea + 0.5;
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float hs = texture2D(uSim, suv).r * inside;
  wp.xyz += g;
  wp.y += hs;
  vWorld = wp.xyz;
  vBase = base;
  vSimUv = suv;
  vCrest = g.y;
  vec4 mv = viewMatrix * wp;
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}`;

const FRAG = /* glsl */ `
#include <packing>
${SKY_GLSL}
${WAVES_GLSL}
uniform sampler2D uSim;
uniform float uArea;
uniform float uSimTexel;
uniform sampler2D uRefraction;
uniform sampler2D uDepthTex;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uAbsorb;
uniform float uClarity;
uniform vec3 uScatter;
uniform float uOpaque;
uniform float uF0;
uniform float uShininess;
uniform float uSpec;
uniform float uRefract;
uniform vec3 uFoamColor;
uniform float uFoamLight;
uniform float uFoam;
uniform float uGlow;
uniform float uWhitecaps;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
varying vec2 vBase;
varying vec2 vSimUv;
varying vec4 vClip;
varying vec3 vViewPos;
varying float vCrest;

float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  float dist = length(vViewPos);
  vec2 grad;
  gerstner(vBase, grad);

  // Wave-sim slope, velocity, foam.
  vec2 sg = vec2(0.0);
  float simV = 0.0;
  float foam = 0.0;
  bool inside = all(greaterThan(vSimUv, vec2(0.0))) && all(lessThan(vSimUv, vec2(1.0)));
  if (inside) {
    float e = uArea * uSimTexel;
    vec2 dx = vec2(uSimTexel, 0.0);
    float hL = texture2D(uSim, vSimUv - dx.xy).r;
    float hR = texture2D(uSim, vSimUv + dx.xy).r;
    float hD = texture2D(uSim, vSimUv - dx.yx).r;
    float hU = texture2D(uSim, vSimUv + dx.yx).r;
    sg = vec2(hR - hL, hU - hD) / (2.0 * e);
    vec4 s = texture2D(uSim, vSimUv);
    simV = s.g;
    foam = s.b;
  }
  vec2 dg = detailGrad(vBase, uTime) * (1.0 - 0.75 * smoothstep(12.0, 70.0, dist));
  vec3 N = normalize(vec3(-(grad.x + sg.x + dg.x), 1.0, -(grad.y + sg.y + dg.y)));

  vec3 V = normalize(cameraPosition - vWorld);
  float NdV = max(dot(N, V), 0.0);
  float fres = uF0 + (1.0 - uF0) * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), uShininess) * uSpec * (uShininess + 8.0) / 25.0;
  vec3 specC = uSunColor * uSunIntensity * spec * max(uSunDir.y, 0.0) * 0.08;

  // Refraction + absorption.
  vec2 scr = vClip.xy / vClip.w * 0.5 + 0.5;
  float waterD = -vViewPos.z;
  vec2 ruv = scr + N.xz * uRefract / (1.0 + dist * 0.12);
  float sd = -perspectiveDepthToViewZ(texture2D(uDepthTex, ruv).x, uCameraNear, uCameraFar);
  if (sd < waterD) {
    ruv = scr;
    sd = -perspectiveDepthToViewZ(texture2D(uDepthTex, ruv).x, uCameraNear, uCameraFar);
  }
  vec3 refr = texture2D(uRefraction, ruv).rgb;
  float thick = max(sd - waterD, 0.0) * (dist / max(waterD, 1e-3));
  vec3 T = exp(-uAbsorb * uClarity * thick);
  vec3 under = mix(refr * T + uScatter * (1.0 - T), uScatter, uOpaque);

  vec3 col = mix(under, refl, fres) + specC;

  // Foam: from the sim (wakes, splashes) and wind-wave crests.
  float fn = vnoise(vBase * 7.0 + uTime * 0.3) * 0.6 + vnoise(vBase * 19.0 - uTime * 0.2) * 0.4;
  float f = clamp(foam * uFoam, 0.0, 1.4) * smoothstep(0.25, 0.75, fn + 0.25 * foam);
  f += uWhitecaps * smoothstep(0.55, 1.0, vCrest / max(0.001, uWaveScale * 0.18)) * smoothstep(0.4, 0.8, fn);
  f = clamp(f, 0.0, 1.0);
  if (uGlow > 0.5) {
    // Plankton flash where the water is actually stirred, sparkly rather than a solid sheet.
    float stir = clamp((abs(simV) - 0.0035) * 45.0 * uFoam, 0.0, 1.0);
    float sparkle = smoothstep(0.35, 0.9, vnoise(vBase * 38.0 + uTime * 1.5));
    col += uFoamColor * (f * 0.45 + stir * (0.15 + 0.9 * sparkle));
  } else {
    col = mix(col, uFoamColor * uFoamLight, f * 0.85);
  }

  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWater({ renderer, sim, area = 24, segments = 384 }) {
  const uniforms = {
    ...skyUniforms,
    ...waveUniforms,
    uSim: { value: sim.texture },
    uArea: { value: area },
    uSimTexel: { value: 1 / sim.resolution },
    uRefraction: { value: null },
    uDepthTex: { value: null },
    uCameraNear: { value: 0.05 },
    uCameraFar: { value: 900 },
    uAbsorb: { value: new THREE.Vector3(0.5, 0.15, 0.1) },
    uClarity: { value: 1 },
    uScatter: { value: new THREE.Color() },
    uOpaque: { value: 0 },
    uF0: { value: 0.02 },
    uShininess: { value: 240 },
    uSpec: { value: 1 },
    uRefract: { value: 0.035 },
    uFoamColor: { value: new THREE.Color(1, 1, 1) },
    uFoamLight: { value: 1 },
    uFoam: { value: 1 },
    uGlow: { value: 0 },
    uWhitecaps: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 30 },
    uFogFar: { value: 150 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true, // draw after opaque things so they can be refracted
    depthWrite: true,
  });

  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(area, area, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const field = new THREE.Mesh(geo, material);
  field.frustumCulled = false;
  group.add(field);

  const far = 900;
  const band = (far - area) / 2;
  const parts = [
    [far, band, 0, area / 2 + band / 2],
    [far, band, 0, -(area / 2 + band / 2)],
    [band, area, area / 2 + band / 2, 0],
    [band, area, -(area / 2 + band / 2), 0],
  ].map(([w, h, x, z]) => {
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 1.5)), Math.max(1, Math.round(h / 1.5)));
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, z);
    return g;
  });
  const skirt = new THREE.Mesh(mergeGeometries(parts), material);
  skirt.frustumCulled = false;
  group.add(skirt);

  // Refraction target (scene without the water, plus its depth).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  uniforms.uRefraction.value = target.texture;
  uniforms.uDepthTex.value = target.depthTexture;

  return {
    group,
    uniforms,
    material,
    setSize() {
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      target.setSize(s.x, s.y);
    },
    /** Renders everything except the water (and `hide` objects) into the refraction target. */
    renderRefraction(scene, camera, hide = []) {
      uniforms.uSim.value = sim.texture;
      uniforms.uCameraNear.value = camera.near;
      uniforms.uCameraFar.value = camera.far;
      group.visible = false;
      const vis = hide.map((o) => o.visible);
      hide.forEach((o) => (o.visible = false));
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      hide.forEach((o, i) => (o.visible = vis[i]));
      group.visible = true;
    },
  };
}

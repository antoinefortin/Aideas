// The range: a dirt floor, an earth backstop berm, and an HDR sky that also
// lights everything (image-based lighting). The sun's direction is found
// by scanning the HDR for its brightest pixel so shadows match the sky.

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { NOISE_GLSL } from './glsl.js';

export const ENVIRONMENTS = {
  Quarry: 'quarry_01_1k.hdr',
  Sunrise: 'spruit_sunrise_1k.hdr',
  'Beach sunrise': 'blouberg_sunrise_2_1k.hdr',
  Sunset: 'venice_sunset_1k.hdr',
  Overpass: 'pedestrian_overpass_1k.hdr',
};
const HDR_BASE = 'https://threejs.org/examples/textures/equirectangular/';

export function bermHeight(x, dz) {
  // dz: distance behind the board along -z
  const ridge = Math.exp(-(((dz - 6) / 2.6) ** 2));
  const lumps = Math.sin(x * 0.7 + 1.3) * 0.15 + Math.sin(x * 1.9 - dz * 0.8) * 0.06;
  return Math.max(0, (3.1 + lumps) * ridge);
}

function dirtMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nvarying vec3 vW;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vW.xz;
        float n1 = fbm3(vec3(p * 0.35, vW.y * 0.3));
        float n2 = vnoise2(p * 6.0);
        float pebble = smoothstep(0.84, 0.9, vnoise2(p * 22.0 + 3.1)) * smoothstep(0.35, 0.65, vnoise2(p * 1.3 + 7.0));
        vec3 dry = srgbToLinear3(vec3(0.62, 0.52, 0.4));
        vec3 dark = srgbToLinear3(vec3(0.36, 0.28, 0.2));
        vec3 grass = srgbToLinear3(vec3(0.38, 0.4, 0.22));
        vec3 c = mix(dark, dry, smoothstep(0.3, 0.7, n1));
        c = mix(c, grass, smoothstep(0.62, 0.8, fbm3(vec3(p * 0.6 + 9.0, 1.0))) * 0.55 * step(vW.y, 0.4));
        c *= 0.85 + 0.25 * n2;
        c = mix(c, srgbToLinear3(vec3(0.55, 0.52, 0.48)) * (0.7 + 0.4 * n2), pebble * 0.6);
        diffuseColor.rgb = c;
        float dirtH = n2 * 0.6 + pebble * 1.2 + vnoise2(p * 140.0) * 0.4;`
      )
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = bumpNormal(-vViewPosition, normal, dirtH, 0.004);');
  };
  return mat;
}

export function createRange() {
  const group = new THREE.Group();
  const dirt = dirtMaterial();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2), dirt);
  ground.receiveShadow = true;
  group.add(ground);

  // Berm (follows the board distance).
  const berm = new THREE.Group();
  const geo = new THREE.PlaneGeometry(44, 16, 220, 80).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i); // local: -8..8
    const dz = -z + 6; // 0 near the board side
    p.setY(i, bermHeight(x, dz) + 0.002);
    p.setZ(i, z - 6);
  }
  geo.computeVertexNormals();
  const bermMesh = new THREE.Mesh(geo, dirt);
  bermMesh.receiveShadow = true;
  bermMesh.castShadow = true;
  berm.add(bermMesh);
  group.add(berm);

  return { group, berm };
}

/** Loads an HDR as background + lighting; returns the sun direction found in it. */
export async function loadEnvironment(name, scene) {
  const tex = await new RGBELoader().loadAsync(HDR_BASE + ENVIRONMENTS[name]);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = tex;
  scene.background = tex;

  // Brightest pixel -> sun direction.
  const { data, width, height } = tex.image;
  const half = data instanceof Uint16Array;
  const f = (v) => (half ? THREE.DataUtils.fromHalfFloat(v) : v);
  let best = -1;
  let bi = 0;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = f(data[i]) * 0.2126 + f(data[i + 1]) * 0.7152 + f(data[i + 2]) * 0.0722;
      if (l > best) {
        best = l;
        bi = y * width + x;
      }
    }
  }
  const px = bi % width;
  const py = Math.floor(bi / width);
  const u = (px + 0.5) / width;
  const v = 1 - (py + 0.5) / height;
  const lat = (v - 0.5) * Math.PI;
  const lon = (u - 0.5) * Math.PI * 2;
  const dir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)).normalize();
  if (dir.y < 0.08) dir.y = 0.08;
  return { texture: tex, sunDir: dir.normalize(), sunStrength: Math.min(8, Math.max(1.5, Math.log2(best + 1) * 0.6)) };
}

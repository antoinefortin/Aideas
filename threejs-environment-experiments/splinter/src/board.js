// The target: five pine planks nailed to two battens on posts, with an
// optional paper target. Plank faces are flat boxes; the holes are carved
// in the fragment shader — where the hole map says "open", the view ray is
// marched through the 35 mm thickness: if it reaches the far side the pixel
// is discarded (you see through), otherwise it shades the hole's wall (end
// grain, darker with depth) or the bottom of a blind dent.

import * as THREE from 'three';
import { NOISE_GLSL, WOOD_GLSL } from './glsl.js';

export const BOARD = { width: 1.0, height: 1.2, planks: 5, gap: 0.005, thickness: 0.035 };

const MASK_GLSL = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uBoardSize;
uniform vec2 uPlankOffset;
uniform vec3 uPlankHalf;
vec4 maskAt(vec2 xy) { return texture2D(uMask, (xy + uPlankOffset) / uBoardSize + 0.5); }
// Open-ness of the hole field at depth t (0 = front face, 1 = back face).
float coverage(vec4 m, float t) {
  if (m.b > 0.985) return mix(m.r, max(m.r, m.g), smoothstep(0.62, 1.0, t));
  if (t < m.b) return m.r * (1.0 - 0.55 * t / max(m.b, 1e-3));
  return 0.0;
}
`;

function plankMaterial(mask, offset, half, seed, holes = true) {
  const uniforms = {
    uMask: { value: mask.texture },
    uBoardSize: { value: mask.size },
    uPlankOffset: { value: offset },
    uPlankHalf: { value: half },
    uSeed: { value: seed },
    uMaskTexel: { value: mask.texel },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0 });
  if (!holes) mat.defines = { NO_HOLES: '' };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying vec3 vCamLocal;\nvarying vec3 vAxX;\nvarying vec3 vAxY;\nvarying vec3 vAxZ;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLocal = position;
        vCamLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vAxX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
        vAxY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vAxZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${NOISE_GLSL}
        ${WOOD_GLSL}
        ${MASK_GLSL}
        uniform float uSeed;
        uniform vec2 uMaskTexel;
        // Exit tear-out is made of torn fibres: break the field up along the grain.
        float coverageF(vec4 m, float t, vec2 xy) {
          if (m.b > 0.985) {
            vec2 b = xy + uPlankOffset;
            float fib = vnoise2(vec2(b.x * 900.0, b.y * 50.0)) * 0.6 + vnoise2(vec2(b.x * 2600.0, b.y * 150.0)) * 0.4;
            float g = m.g + (fib - 0.5) * 0.75 * smoothstep(0.0, 0.7, m.g);
            return mix(m.r, max(m.r, g), smoothstep(0.62, 1.0, t));
          }
          return coverage(m, t);
        }
        varying vec3 vLocal;
        varying vec3 vCamLocal;
        varying vec3 vAxX;
        varying vec3 vAxY;
        varying vec3 vAxZ;`
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float T = uPlankHalf.z * 2.0;
        bool front = vLocal.z > uPlankHalf.z - 1e-4;
        bool back = vLocal.z < -uPlankHalf.z + 1e-4;
        vec3 woodCol; float woodRough; float woodH;
        // Wood coordinates: x across the plank, y along the grain, z through it.
        float woodDetail = clamp(1.6 - fwidth(vLocal.x) * 1100.0, 0.0, 1.0);
        wood(vec3(vLocal.x, vLocal.y + uSeed * 3.1, vLocal.z), uSeed, 0.0, woodDetail, woodCol, woodRough, woodH);

        vec4 m0 = vec4(0.0);
        #ifndef NO_HOLES
        m0 = maskAt(vLocal.xy);
        #endif
        float tFace = front ? 0.0 : 1.0;
        float c0 = (front || back) ? coverageF(m0, tFace, vLocal.xy) : 0.0;
        bool wallHit = false;
        vec3 wallN = vec3(0.0, 0.0, 1.0);
        float wallDepth = 0.0;

        if (c0 > 0.5) {
          vec3 rd = normalize(vLocal - vCamLocal);
          float sMax = T / max(abs(rd.z), 0.08);
          float sPrev = 0.0;
          bool hit = false;
          vec3 hp = vLocal;
          for (int i = 1; i <= 40; i++) {
            float s = sMax * float(i) / 40.0;
            vec3 p = vLocal + rd * s;
            float t = (uPlankHalf.z - p.z) / T;
            bool outside = abs(p.x) > uPlankHalf.x || abs(p.y) > uPlankHalf.y;
            if (outside || coverageF(maskAt(p.xy), clamp(t, 0.0, 1.0), p.xy) < 0.5) {
              // refine the crossing
              float a = sPrev, b = s;
              for (int j = 0; j < 5; j++) {
                float mid = 0.5 * (a + b);
                vec3 pm = vLocal + rd * mid;
                float tm = clamp((uPlankHalf.z - pm.z) / T, 0.0, 1.0);
                if (coverageF(maskAt(pm.xy), tm, pm.xy) < 0.5) b = mid; else a = mid;
              }
              hp = vLocal + rd * b;
              hit = true;
              break;
            }
            sPrev = s;
          }
          if (!hit) discard; // straight through: see what's behind the board

          wallHit = true;
          float th = clamp((uPlankHalf.z - hp.z) / T, 0.0, 1.0);
          wallDepth = front ? th : 1.0 - th;
          vec4 mh = maskAt(hp.xy);
          float dt = front ? 0.03 : -0.03;
          bool bottom = coverageF(mh, clamp(th - dt, 0.0, 1.0), hp.xy) > 0.5 && coverageF(mh, th, hp.xy) < 0.5 && mh.b < 0.985;
          if (bottom) {
            wallN = vec3(0.0, 0.0, front ? 1.0 : -1.0);
          } else {
            vec2 e = uMaskTexel * 1.5;
            float gx = coverageF(maskAt(hp.xy + vec2(e.x, 0.0)), th, hp.xy + vec2(e.x, 0.0)) - coverageF(maskAt(hp.xy - vec2(e.x, 0.0)), th, hp.xy - vec2(e.x, 0.0));
            float gy = coverageF(maskAt(hp.xy + vec2(0.0, e.y)), th, hp.xy + vec2(0.0, e.y)) - coverageF(maskAt(hp.xy - vec2(0.0, e.y)), th, hp.xy - vec2(0.0, e.y));
            wallN = normalize(vec3(gx, gy, (front ? 1.0 : -1.0) * 0.15 * length(vec2(gx, gy)) + 1e-5));
          }
          // End grain: the rings seen across, fibres torn, darker inside.
          vec3 eg; float er; float eh;
          wood(vec3(hp.x, hp.y + uSeed * 3.1, hp.z), uSeed, 0.0, woodDetail, eg, er, eh);
          float fuzz = vnoise3(hp * vec3(2500.0, 300.0, 2500.0));
          woodCol = eg * (0.62 + 0.25 * fuzz) * mix(1.0, 0.35, wallDepth);
          if (bottom) woodCol = eg * 0.45 * (0.7 + 0.3 * fuzz);
          woodRough = 0.92;
          woodH = fuzz;
        } else if (front || back) {
          // Around holes: crushed fibres, splits, and fresh torn wood on the exit side.
          float rim = smoothstep(0.02, 0.5, c0);
          float bruise = max(m0.a, rim * 0.6);
          woodCol *= 1.0 - 0.55 * bruise;
          // lead smear + compressed fibres right at the lip
          if (front) woodCol *= 1.0 - 0.6 * smoothstep(0.0, 0.5, c0);
          woodH -= rim * 1.2;
          if (m0.a > 0.6) { woodCol *= 0.45; woodH -= 1.5 * m0.a; }
          if (back) {
            float tear = smoothstep(0.05, 0.5, coverageF(m0, 1.0, vLocal.xy));
            float fib = vnoise2(vec2(vLocal.x * 1400.0, vLocal.y * 60.0));
            woodCol = mix(woodCol, srgbToLinear3(vec3(0.85, 0.7, 0.5)) * (0.65 + 0.45 * fib), tear * 0.5);
            woodH += tear * (fib * 3.0 - 1.0);
            woodRough = mix(woodRough, 0.95, tear);
          }
        }
        diffuseColor.rgb = woodCol;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = woodRough;`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        if (wallHit) {
          normal = normalize(vAxX * wallN.x + vAxY * wallN.y + vAxZ * wallN.z);
        } else {
          normal = bumpNormal(-vViewPosition, normal, woodH, 0.0009);
        }`
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        if (wallHit) {
          float occ = mix(0.85, 0.15, wallDepth);
          reflectedLight.indirectDiffuse *= occ;
          reflectedLight.indirectSpecular *= occ;
          reflectedLight.directDiffuse *= mix(1.0, 0.25, wallDepth);
        }`
      );
  };
  return mat;
}

function plankDepthMaterial(mask, offset, half) {
  const uniforms = {
    uMask: { value: mask.texture },
    uBoardSize: { value: mask.size },
    uPlankOffset: { value: offset },
    uPlankHalf: { value: half },
  };
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MASK_GLSL}\nvarying vec3 vLocal;`)
      .replace(
        'void main() {',
        `void main() {
        { vec4 m = maskAt(vLocal.xy); if (m.b > 0.985 && coverage(m, 0.5) > 0.5) discard; }`
      );
  };
  return mat;
}

function paperTexture() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#efeadf';
  g.fillRect(0, 0, s, s);
  // paper fibre noise
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const cx = s / 2;
  const rings = 10;
  for (let i = rings; i >= 1; i--) {
    const r = (i / rings) * s * 0.46;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fillStyle = i <= 4 ? '#161616' : '#efeadf';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = i <= 4 ? '#efeadf' : '#161616';
    g.stroke();
  }
  g.font = '600 26px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i < rings; i++) {
    const r = ((i + 0.5) / rings) * s * 0.46;
    g.fillStyle = i < 4 ? '#efeadf' : '#161616';
    const score = rings - i;
    g.fillText(String(score), cx + r, cx);
    g.fillText(String(score), cx - r, cx);
  }
  g.fillStyle = '#c4361d';
  g.beginPath();
  g.arc(cx, cx, s * 0.018, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function paperMaterial(mask, offset, half) {
  const uniforms = {
    uMask: { value: mask.texture },
    uBoardSize: { value: mask.size },
    uPlankOffset: { value: offset },
    uPlankHalf: { value: half },
  };
  const mat = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${MASK_GLSL}\nvarying vec3 vLocal;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec4 m = maskAt(vLocal.xy);
          if (m.r > 0.47) discard;
          // grey "bullet wipe" ring where the lead brushed the paper
          diffuseColor.rgb *= 1.0 - 0.55 * smoothstep(0.36, 0.46, m.r);
        }`
      );
  };
  return mat;
}

export function createBoard(mask) {
  const group = new THREE.Group(); // pivot at ground level under the board
  const board = new THREE.Group(); // board space: origin at the board centre, +z towards the shooter
  board.position.y = 1.15;
  group.add(board);

  const { width, height, planks, gap, thickness } = BOARD;
  const pw = (width - gap * (planks - 1)) / planks;
  const plankMeshes = [];
  for (let i = 0; i < planks; i++) {
    const x = -width / 2 + pw / 2 + i * (pw + gap);
    const offset = new THREE.Vector2(x, 0);
    const half = new THREE.Vector3(pw / 2, height / 2, thickness / 2);
    const geo = new THREE.BoxGeometry(pw, height, thickness);
    const mesh = new THREE.Mesh(geo, plankMaterial(mask, offset, half, 1 + i * 7.31 + Math.random() * 3));
    mesh.customDepthMaterial = plankDepthMaterial(mask, offset, half);
    mesh.position.set(x, 0, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    board.add(mesh);
    plankMeshes.push(mesh);
  }

  // Battens and posts: same wood, no hole map.
  const plain = (seed, w, h, d) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      plankMaterial(mask, new THREE.Vector2(), new THREE.Vector3(w / 2, h / 2, d / 2), seed, false)
    );
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  for (const y of [-0.4, 0.4]) {
    const b = plain(40 + y, 0.09, width + 0.12, 0.04); // grain along local y, turned horizontal
    b.rotation.z = Math.PI / 2;
    b.position.set(0, y, -thickness / 2 - 0.02);
    board.add(b);
  }
  const postH = 1.95;
  for (const x of [-0.56, 0.56]) {
    const p = plain(60 + x, 0.09, postH, 0.09);
    p.position.set(x, postH / 2 - 0.1, -thickness / 2 - 0.085);
    group.add(p);
  }
  const nailMat = new THREE.MeshStandardMaterial({ color: 0x55534e, metalness: 1, roughness: 0.55 });
  const nailGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12).rotateX(Math.PI / 2);
  for (let i = 0; i < planks; i++) {
    const x = -width / 2 + pw / 2 + i * (pw + gap);
    for (const y of [-0.4, 0.4]) for (const dx of [-0.045, 0.045]) {
      const n = new THREE.Mesh(nailGeo, nailMat);
      n.position.set(x + dx + (Math.random() - 0.5) * 0.01, y + (Math.random() - 0.5) * 0.02, thickness / 2 + 0.0008);
      board.add(n);
    }
  }

  // Paper target, stapled on (shares the hole map).
  const paperSize = 0.44;
  const paperOffset = new THREE.Vector2(0, 0.1);
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(paperSize, paperSize, 1, 1),
    paperMaterial(mask, paperOffset, new THREE.Vector3(paperSize / 2, paperSize / 2, 0.0002))
  );
  paper.position.set(paperOffset.x, paperOffset.y, thickness / 2 + 0.0012);
  paper.receiveShadow = true;
  board.add(paper);

  // Wobble on impact.
  const wobble = { rx: 0, ry: 0, vx: 0, vy: 0 };
  function impulse(x, y, strength) {
    wobble.vx += strength * (0.6 + y * 0.5); // tips back, more if hit high
    wobble.vy += -x * strength * 1.5; // twists if hit off-centre
  }
  function update(dt) {
    const k = 260;
    const c = 9;
    wobble.vx += (-k * wobble.rx - c * wobble.vx) * dt;
    wobble.vy += (-k * wobble.ry - c * wobble.vy) * dt;
    wobble.rx += wobble.vx * dt;
    wobble.ry += wobble.vy * dt;
    board.rotation.x = -wobble.rx * 0.01;
    board.rotation.y = wobble.ry * 0.01;
  }

  return { group, board, paper, plankMeshes, impulse, update, pw };
}

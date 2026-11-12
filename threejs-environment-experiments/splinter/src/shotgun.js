// A pump-action shotgun built from primitives, with physically based
// materials: blued steel (roughness map with smudges + scratches, brushed
// barrel with anisotropic highlights), walnut stock and forend under a
// clearcoat varnish, rubber butt pad, brass bead. Gun space: x right,
// y up, barrel along -z; origin at the back of the receiver.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NOISE_GLSL, WOOD_GLSL } from './glsl.js';

// ---------------------------------------------------------------------------
// Procedural textures
function canvasTexture(size, paint, srgb = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Roughness map (green channel): base sheen, handling smudges, fine scratches. */
function metalRoughness(base = 78, scratches = 260) {
  return canvasTexture(1024, (g, s) => {
    g.fillStyle = `rgb(${base},${base},${base})`;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 30 + Math.random() * 140;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const v = Math.random() < 0.5 ? 255 : 0;
      grd.addColorStop(0, `rgba(${v},${v},${v},${0.05 + Math.random() * 0.1})`);
      grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round';
    for (let i = 0; i < scratches; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = (Math.random() - 0.5) * 0.6 + (Math.random() < 0.7 ? 0 : Math.PI / 2);
      const l = 8 + Math.random() * 90;
      g.strokeStyle = `rgba(200,200,200,${0.08 + Math.random() * 0.25})`;
      g.lineWidth = 0.5 + Math.random() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  });
}

/** Subtle colour variation for blued steel (wear shows lighter, greyer metal). */
function bluingColor() {
  return canvasTexture(
    512,
    (g, s) => {
      g.fillStyle = '#5d636e';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const r = 20 + Math.random() * 90;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(${Math.random() < 0.5 ? '120,124,132' : '44,48,58'},${0.15 + Math.random() * 0.2})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    true
  );
}

/** Rubber butt pad: fine horizontal ribs as a bump map. */
function ribBump() {
  return canvasTexture(256, (g, s) => {
    for (let y = 0; y < s; y++) {
      const v = 128 + 110 * Math.sin((y / s) * Math.PI * 2 * 14);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, s, 1);
    }
  });
}

// ---------------------------------------------------------------------------
// Materials
function walnut(seed, grain) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.22,
  });
  const uniforms = { uSeed: { value: seed }, uGrain: { value: grain } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${WOOD_GLSL}\nuniform float uSeed;\nuniform mat3 uGrain;\nvarying vec3 vLocal;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wc; float wr; float wh;
        wood(uGrain * vLocal + vec3(0.0, uSeed, 0.0), uSeed, 1.0, clamp(1.6 - fwidth(vLocal.x) * 1100.0, 0.0, 1.0), wc, wr, wh);
        diffuseColor.rgb = wc;`
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.45, 0.7, wr);')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = bumpNormal(-vViewPosition, normal, wh, 0.00035);');
  };
  return mat;
}

const GRAIN_Z = new THREE.Matrix3().set(1, 0, 0, 0, 0, 1, 0, 1, 0); // grain along local z

export function createShellMesh(materials) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0106, 0.0106, 0.052, 32), materials.hull);
  hull.position.y = 0.026 + 0.016;
  const crimp = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0106, 0.004, 32), materials.crimp);
  crimp.position.y = 0.052 + 0.016 + 0.002;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0109, 0.0109, 0.016, 32), materials.brass);
  head.position.y = 0.008;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0117, 0.0117, 0.0018, 32), materials.brass);
  rim.position.y = 0.0009;
  const primer = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0004, 20), materials.primer);
  primer.position.y = -0.0001;
  g.add(hull, crimp, head, rim, primer);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

// ---------------------------------------------------------------------------
export class Shotgun {
  constructor() {
    const rough = metalRoughness();
    const roughFine = metalRoughness(92, 120);
    roughFine.repeat.set(1, 4);
    const blued = bluingColor();

    this.mats = {
      steel: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: blued, metalness: 1, roughness: 1, roughnessMap: rough }),
      barrel: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: blued,
        metalness: 1,
        roughness: 1,
        roughnessMap: roughFine,
        anisotropy: 0.55,
        anisotropyRotation: Math.PI / 2,
      }),
      bright: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 1, roughness: 0.2 }),
      alu: new THREE.MeshPhysicalMaterial({ color: 0x2b2d31, metalness: 0.9, roughness: 0.38, clearcoat: 0.25 }),
      bore: new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 1, roughness: 0.6, side: THREE.BackSide }),
      port: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, metalness: 0.6, roughness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.88, metalness: 0, bumpMap: ribBump(), bumpScale: 1.2 }),
      spacer: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 }),
      brass: new THREE.MeshPhysicalMaterial({ color: 0xd8b26a, metalness: 1, roughness: 0.24, clearcoat: 0.3 }),
      hull: new THREE.MeshPhysicalMaterial({ color: 0x9e1b17, roughness: 0.42, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3 }),
      crimp: new THREE.MeshStandardMaterial({ color: 0x7c1512, roughness: 0.55 }),
      primer: new THREE.MeshStandardMaterial({ color: 0xc9c6c0, metalness: 1, roughness: 0.3 }),
      stock: walnut(4.2, GRAIN_Z),
      forend: walnut(9.7, GRAIN_Z),
    };
    const M = this.mats;

    this.group = new THREE.Group(); // aim / recoil pivot (camera space)
    this.model = new THREE.Group();
    this.group.add(this.model);
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = this.model) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const alongZ = (geo) => geo.rotateX(Math.PI / 2);

    // Receiver
    add(new RoundedBoxGeometry(0.036, 0.074, 0.205, 5, 0.006), M.steel, 0, 0, -0.1025);
    // Roll mark engraved on the left of the receiver: bright, rougher steel where the bluing is cut.
    const mark = canvasTexture(1024, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '600 92px "Times New Roman", serif';
      g.fillText('SPLINTER ARMS', s / 2, s / 2 - 70);
      g.font = '500 58px "Times New Roman", serif';
      g.fillText('PUMP · 12 GA · 3" CHAMBER', s / 2, s / 2 + 40);
      g.lineWidth = 6;
      g.strokeStyle = '#ffffff';
      g.strokeRect(70, s / 2 - 160, s - 140, 290);
    });
    const markMat = new THREE.MeshStandardMaterial({ map: mark, color: 0x6c7078, metalness: 1, roughness: 0.55, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    const markMesh = add(new THREE.PlaneGeometry(0.085, 0.085), markMat, -0.01805, -0.008, -0.1);
    markMesh.rotation.y = -Math.PI / 2;
    markMesh.castShadow = false;

    // Receiver pins and the bolt-release / safety.
    for (const z of [-0.03, -0.178]) add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.0368, 16).rotateZ(Math.PI / 2), M.bright, 0, -0.022, z);
    add(new THREE.CylinderGeometry(0.0034, 0.0034, 0.046, 16).rotateZ(Math.PI / 2), M.alu, 0, -0.042, -0.014);

    // Ejection port (right side) with the bolt visible inside.
    add(new THREE.BoxGeometry(0.0022, 0.026, 0.072), M.port, 0.0175, 0.012, -0.107);
    this.bolt = new THREE.Group();
    this.model.add(this.bolt);
    add(new THREE.BoxGeometry(0.003, 0.016, 0.055), M.bright, 0.0168, 0.012, -0.114, this.bolt);
    add(new THREE.BoxGeometry(0.0035, 0.004, 0.012), M.bright, 0.0186, 0.006, -0.1, this.bolt);

    // Barrel, rib, bead, muzzle, bore
    add(alongZ(new THREE.CylinderGeometry(0.0142, 0.0142, 0.035, 40)), M.steel, 0, 0.017, -0.2225);
    add(alongZ(new THREE.CylinderGeometry(0.0115, 0.0122, 0.66, 48, 1, true)), M.barrel, 0, 0.017, -0.535);
    add(new THREE.RingGeometry(0.0091, 0.0115, 48).rotateY(Math.PI), M.steel, 0, 0.017, -0.865);
    add(alongZ(new THREE.CylinderGeometry(0.0091, 0.0091, 0.16, 32, 1, true)), M.bore, 0, 0.017, -0.785);
    add(new THREE.BoxGeometry(0.0078, 0.0032, 0.645), M.steel, 0, 0.017 + 0.0122 + 0.0016, -0.54);
    add(new THREE.SphereGeometry(0.0021, 16, 12), M.brass, 0, 0.017 + 0.0122 + 0.0042, -0.852);

    // Magazine tube, cap, barrel band
    add(alongZ(new THREE.CylinderGeometry(0.0105, 0.0105, 0.52, 40)), M.steel, 0, -0.0085, -0.465);
    add(alongZ(new THREE.CylinderGeometry(0.0118, 0.0112, 0.03, 40)), M.steel, 0, -0.0085, -0.74);
    add(new RoundedBoxGeometry(0.026, 0.04, 0.014, 3, 0.004), M.steel, 0, 0.004, -0.705);

    // Pump (forend): a lathe with grip grooves, walnut, slides on the tube.
    this.pump = new THREE.Group();
    this.pump.position.z = -0.37;
    this.model.add(this.pump);
    const prof = [];
    const L = 0.2;
    prof.push(new THREE.Vector2(0.0108, -L / 2), new THREE.Vector2(0.019, -L / 2), new THREE.Vector2(0.0214, -L / 2 + 0.006));
    for (let y = -L / 2 + 0.018; y < L / 2 - 0.016; y += 0.0105) {
      prof.push(new THREE.Vector2(0.0222, y), new THREE.Vector2(0.0222, y + 0.005), new THREE.Vector2(0.0202, y + 0.0068), new THREE.Vector2(0.0202, y + 0.0088));
    }
    prof.push(new THREE.Vector2(0.0214, L / 2 - 0.006), new THREE.Vector2(0.019, L / 2), new THREE.Vector2(0.0108, L / 2));
    const lathe = new THREE.LatheGeometry(prof, 64).rotateX(-Math.PI / 2);
    lathe.scale(1, 0.86, 1);
    add(lathe, M.forend, 0, -0.012, 0, this.pump);

    // Stock: extruded side profile with rounded edges.
    const sh = new THREE.Shape();
    sh.moveTo(-0.004, 0.031);
    sh.lineTo(0.06, 0.027);
    sh.quadraticCurveTo(0.19, 0.021, 0.334, 0.012);
    sh.lineTo(0.352, 0.013);
    sh.lineTo(0.357, -0.126);
    sh.lineTo(0.332, -0.129);
    sh.quadraticCurveTo(0.2, -0.104, 0.122, -0.072);
    sh.quadraticCurveTo(0.072, -0.05, 0.046, -0.046);
    sh.lineTo(-0.004, -0.035);
    sh.closePath();
    const stockGeo = new THREE.ExtrudeGeometry(sh, {
      depth: 0.024,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.0055,
      bevelSegments: 6,
      curveSegments: 32,
    });
    stockGeo.translate(0, 0, -0.012);
    stockGeo.rotateY(-Math.PI / 2);
    stockGeo.computeVertexNormals();
    add(stockGeo, M.stock, 0, 0, 0);
    const pad = add(new RoundedBoxGeometry(0.04, 0.146, 0.022, 3, 0.006), M.rubber, 0, -0.057, 0.369);
    pad.rotation.x = -0.035;
    const spacer = add(new THREE.BoxGeometry(0.038, 0.142, 0.003), M.spacer, 0, -0.057, 0.3575);
    spacer.rotation.x = -0.035;

    // Trigger guard + trigger
    add(new RoundedBoxGeometry(0.016, 0.008, 0.095, 2, 0.003), M.alu, 0, -0.04, -0.05);
    const guard = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.043, -0.012),
      new THREE.Vector3(0, -0.068, -0.016),
      new THREE.Vector3(0, -0.081, -0.04),
      new THREE.Vector3(0, -0.077, -0.072),
      new THREE.Vector3(0, -0.06, -0.088),
      new THREE.Vector3(0, -0.044, -0.09),
    ]);
    const g1 = add(new THREE.TubeGeometry(guard, 48, 0.0034, 12), M.alu);
    g1.scale.x = 2.0;
    const trig = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.043, -0.052),
      new THREE.Vector3(0, -0.055, -0.056),
      new THREE.Vector3(0, -0.067, -0.051),
    ]);
    const t1 = add(new THREE.TubeGeometry(trig, 20, 0.0024, 10), M.bright);
    t1.scale.x = 1.7;

    // Anchors
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.017, -0.872);
    this.model.add(this.muzzle);
    this.port = new THREE.Object3D();
    this.port.position.set(0.024, 0.014, -0.11);
    this.model.add(this.port);

    // A shell visible in the port while racking.
    this.shellMats = { hull: M.hull, crimp: M.crimp, brass: M.brass, primer: M.primer };

    // Pose
    this.base = new THREE.Vector3(0.118, -0.138, -0.23);
    this.adsBase = new THREE.Vector3(0.05, -0.115, -0.26);
    this.hip = this.base.clone();
    this.ads = 0;
    this.group.position.copy(this.base);
    this.aimQ = new THREE.Quaternion();
    this.kick = 0;
    this.kickV = 0;
    this.time = 10;
    this.firing = false;
    this.ejected = true;
    this.events = []; // 'pumpBack', 'eject', 'pumpForward', 'ready'
  }

  get ready() {
    return !this.firing;
  }

  fire() {
    if (this.firing) return false;
    this.firing = true;
    this.time = 0;
    this.kickV += 9.5;
    this.ejected = false;
    this.flags = {};
    return true;
  }

  /** aimCam: aim point in camera space. Returns events since last frame. */
  update(dt, aimCam) {
    this.events.length = 0;
    // Aim the barrel at the point under the cursor.
    const dir = aimCam.clone().sub(this.base).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.aimQ.slerp(q, 1 - Math.exp(-dt * 14));

    // Recoil: damped spring on a single "kick" coordinate.
    this.kickV += (-140 * this.kick - 16 * this.kickV) * dt;
    this.kick += this.kickV * dt;
    const k = Math.max(-0.2, this.kick);

    // Pump cycle.
    let pump = 0;
    if (this.firing) {
      this.time += dt;
      const t = this.time;
      const back = (a) => Math.min(1, Math.max(0, a));
      const ease = (x) => x * x * (3 - 2 * x);
      if (t > 0.3 && !this.flags.back) {
        this.flags.back = true;
        this.events.push('pumpBack');
      }
      if (t > 0.41 && !this.flags.eject) {
        this.flags.eject = true;
        this.events.push('eject');
      }
      if (t > 0.5 && !this.flags.fwd) {
        this.flags.fwd = true;
        this.events.push('pumpForward');
      }
      pump = ease(back((t - 0.3) / 0.11)) * (1 - ease(back((t - 0.5) / 0.1)));
      if (t > 0.66) {
        this.firing = false;
        this.events.push('ready');
      }
    }
    this.pump.position.z = -0.37 + pump * 0.088;
    this.bolt.position.z = pump * 0.088;

    this.group.position.copy(this.base).add(new THREE.Vector3(0, k * 0.025 - pump * 0.006, k * 0.12 + pump * 0.01));
    const recoilQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(k * 0.32, 0, -pump * 0.07));
    this.group.quaternion.copy(this.aimQ).multiply(recoilQ);
    return this.events;
  }
}

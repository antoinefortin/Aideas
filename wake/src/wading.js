// Wading: finds where the walker's limbs cut through the water surface and
// turns their motion into wave-sim impulses — a bulge in front of each
// moving leg and a trough behind it, which together grow into a bow wave
// and a V-shaped wake. Limbs plunging in fast produce splashes.

import * as THREE from 'three';

const SEGMENTS = [
  // [from bone, to bone, radius m]
  ['leftupleg', 'leftleg', 0.085],
  ['leftleg', 'leftfoot', 0.065],
  ['leftfoot', 'lefttoebase', 0.055],
  ['rightupleg', 'rightleg', 0.085],
  ['rightleg', 'rightfoot', 0.065],
  ['rightfoot', 'righttoebase', 0.055],
  ['hips', 'spine2', 0.16],
  ['leftarm', 'leftforearm', 0.05],
  ['leftforearm', 'lefthand', 0.045],
  ['rightarm', 'rightforearm', 0.05],
  ['rightforearm', 'righthand', 0.045],
];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Wading {
  constructor(walker) {
    this.walker = walker;
    this.segs = [];
  }

  attach() {
    const f = this.walker.findBone;
    this.segs = SEGMENTS.map(([a, b, r]) => ({ a: f(a), b: f(b), r, prev: null, prevLow: null }))
      .filter((s) => s.a && s.b)
      .map((s) => ({ ...s, prev: new THREE.Vector3(), has: false, low: new THREE.Vector3(), lowHas: false }));
  }

  /**
   * surface(x, z) -> water height. Returns { drops: [x,z,r,s,...], splashes: [{x,y,z,dx,dz,speed,size}] }
   */
  update(dt, surface, wake = 1) {
    const drops = [];
    const splashes = [];
    if (!this.walker.ready || dt <= 0) return { drops, splashes };
    const scale = this.walker.height / 1.8;

    for (const s of this.segs) {
      _a.setFromMatrixPosition(s.a.matrixWorld);
      _b.setFromMatrixPosition(s.b.matrixWorld);
      const h = surface((_a.x + _b.x) / 2, (_a.z + _b.z) / 2);
      const da = _a.y - h;
      const db = _b.y - h;
      const lower = da < db ? _a : _b;

      // Splash when a limb end plunges into the water quickly.
      if (s.lowHas) {
        const vy = (lower.y - s.low.y) / dt;
        const wasAbove = s.low.y > h + 0.005;
        if (wasAbove && lower.y <= h && vy < -0.6) {
          splashes.push({ x: lower.x, y: h, z: lower.z, dx: 0, dz: 0, speed: -vy, size: s.r });
          drops.push(lower.x, lower.z, s.r * 1.4, -0.006 * Math.min(4, -vy) * wake);
        }
      }
      s.low.copy(lower);
      s.lowHas = true;

      if (da * db >= 0) {
        s.has = false;
        continue;
      }
      // Where the segment pierces the surface.
      const t = da / (da - db);
      const px = _a.x + (_b.x - _a.x) * t;
      const pz = _a.z + (_b.z - _a.z) * t;
      if (s.has) {
        const vx = (px - s.prev.x) / dt;
        const vz = (pz - s.prev.z) / dt;
        const sp = Math.hypot(vx, vz);
        if (sp > 0.05 && sp < 12) {
          const dx = vx / sp;
          const dz = vz / sp;
          const r = s.r * scale;
          const amp = wake * Math.min(sp, 6) * dt * 0.06 * (r / 0.07);
          drops.push(px + dx * r * 0.8, pz + dz * r * 0.8, r * 1.1, amp);
          drops.push(px - dx * r * 1.0, pz - dz * r * 1.0, r * 1.3, -amp * 1.15);
          if (sp > 2.3 && Math.random() < dt * 14) {
            splashes.push({ x: px, y: h, z: pz, dx, dz, speed: sp * 0.6, size: r * 0.6 });
          }
        }
      }
      s.prev.set(px, h, pz);
      s.has = true;
    }
    return { drops, splashes };
  }
}

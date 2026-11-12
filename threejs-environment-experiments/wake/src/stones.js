// Stones dropped into the water: fall, punch a splash + ring into the sim,
// sink slowly and rest on the bed (visible through the refraction).

import * as THREE from 'three';

function rockGeometry(seed) {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = 1 + 0.18 * Math.sin(v.x * 4.1 + seed) * Math.sin(v.y * 3.7 + seed * 2) * Math.sin(v.z * 5.3 + seed * 3);
    p.setXYZ(i, v.x * n * 1.15, v.y * n * 0.7, v.z * n);
  }
  g.computeVertexNormals();
  return g;
}

export class Stones {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geos = [0.7, 2.1, 3.9].map(rockGeometry);
    this.material = new THREE.MeshStandardMaterial({ color: 0x7c7a74, roughness: 0.85, flatShading: true });
  }

  drop(x, z, size = 0.06 + Math.random() * 0.07) {
    const mesh = new THREE.Mesh(this.geos[Math.floor(Math.random() * 3)], this.material);
    mesh.scale.setScalar(size);
    mesh.castShadow = true;
    mesh.position.set(x + (Math.random() - 0.5) * 0.1, 3.2 + Math.random(), z + (Math.random() - 0.5) * 0.1);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(mesh);
    this.list.push({
      mesh,
      r: size,
      state: 'air',
      age: 0,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, -1, (Math.random() - 0.5) * 0.4),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    });
    while (this.list.length > 40) this.#remove(0);
  }

  /** Returns entry events [{x, y, z, speed, r}]. */
  update(dt, surface, floor) {
    const events = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      const p = s.mesh.position;
      s.age += dt;
      if (s.state === 'air') {
        s.vel.y -= 9.81 * dt;
        p.addScaledVector(s.vel, dt);
        s.mesh.rotateOnWorldAxis(s.spin, dt * 4);
        const h = surface(p.x, p.z);
        if (p.y <= h) {
          events.push({ x: p.x, y: h, z: p.z, speed: -s.vel.y, r: s.r });
          s.state = 'water';
          s.vel.multiplyScalar(0.2);
        }
      } else if (s.state === 'water') {
        s.vel.y += (-0.9 - s.vel.y) * Math.min(1, dt * 4);
        s.vel.x *= Math.exp(-dt * 3);
        s.vel.z *= Math.exp(-dt * 3);
        p.addScaledVector(s.vel, dt);
        s.mesh.rotateOnWorldAxis(s.spin, dt * 1.2);
        const f = floor(p.x, p.z) + s.r * 0.55;
        if (p.y <= f) {
          p.y = f;
          s.state = 'rest';
        }
      }
      if (s.age > 90) this.#remove(i);
    }
    return events;
  }

  clear() {
    while (this.list.length) this.#remove(0);
  }

  #remove(i) {
    this.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }
}

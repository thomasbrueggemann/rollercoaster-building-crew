// Flood visuals: floating debris bobbing on the surface, rain ripples, foam around attractions.
import * as THREE from 'three';
import { scene, cam } from '../scene.js';
import { G } from '../state.js';
import { isUltra, isLow } from '../quality.js';
import { rippleFx, foamFx } from '../effects.js';
import { TILE_RING } from './shared.js';

const T = isUltra() ? 0 : isLow() ? 2 : 1;
const N_DEBRIS = [40, 24, 10][T];
const RIPPLES_PER_SEC = [80, 46, 16][T];
const rnd = (a, b) => a + Math.random() * (b - a);

export class FloodFx {
  constructor(bounds, spots) {
    this.t = 0;
    this.b = { x0: bounds.x0 - 2, z0: bounds.z0 - 2, x1: bounds.x1 + 2, z1: bounds.z1 + 2 };
    this.spots = spots;
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    this.box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N_DEBRIS);
    this.box.frustumCulled = false;
    this.box.castShadow = !isLow();
    this.barrel = null;
    const cols = ['#7a5a3a', '#8a6a4a', '#6d4c41', '#b08a58', '#c0392b', '#2f6bb0'];
    const c = new THREE.Color();
    this.items = Array.from({ length: N_DEBRIS }, (_, i) => {
      const kind = i % 6 === 0 ? 'crate' : 'plank';
      this.box.setColorAt(i, c.set(kind === 'crate' ? cols[3 + (i % 3)] : cols[i % 3]));
      return {
        x: rnd(this.b.x0, this.b.x1), z: rnd(this.b.z0, this.b.z1), rot: rnd(0, 6.28), rv: rnd(-0.3, 0.3), ph: rnd(0, 6.28),
        sc: kind === 'crate' ? [0.22, 0.2, 0.22] : [rnd(0.4, 0.7), 0.04, rnd(0.08, 0.14)], vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3),
      };
    });
    this.group.add(this.box);
    scene.add(this.group);
    this.acc = 0; this.foamAcc = 0;
    this._o = new THREE.Object3D();
  }

  update(sdt) {
    this.t += sdt;
    const lvl = G.waterLevel, t = this.t;
    const up = Math.max(0, Math.min(1, (lvl + 0.05) / 0.25));
    this.group.visible = up > 0.01;
    if (up <= 0.01 || sdt <= 0) return;
    const o = this._o, b = this.b;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.x += (it.vx + Math.sin(t * 0.4 + it.ph) * 0.15) * sdt;
      it.z += (it.vz + Math.cos(t * 0.35 + it.ph) * 0.15) * sdt;
      if (it.x < b.x0 || it.x > b.x1) it.vx *= -1;
      if (it.z < b.z0 || it.z > b.z1) it.vz *= -1;
      it.rot += it.rv * sdt;
      const bob = Math.sin(t * 1.9 + it.ph) * 0.025;
      o.position.set(it.x, lvl + it.sc[1] * 0.3 + bob, it.z);
      o.rotation.set(Math.sin(t * 1.3 + it.ph) * 0.08, it.rot, Math.cos(t * 1.1 + it.ph) * 0.08);
      o.scale.set(it.sc[0] * up, it.sc[1] * up, it.sc[2] * up);
      o.updateMatrix();
      this.box.setMatrixAt(i, o.matrix);
      if (Math.random() < sdt * 0.5 && up > 0.5)
        rippleFx.emit({ x: it.x, y: lvl + 0.02, z: it.z, size: 0.18, grow: 3.5, life: 1.2, a: 0.5, r: 0.9, g: 0.97, b: 1, tile: TILE_RING, fadeIn: 0.05 });
    }
    this.box.instanceMatrix.needsUpdate = true;
    // rain ripples around the visible area
    this.acc += sdt * RIPPLES_PER_SEC * up * Math.min(1, 0.3 + G.storm);
    const R = Math.min(18, cam.view * 1.6);
    while (this.acc >= 1) {
      this.acc -= 1;
      rippleFx.emit({
        x: cam.target.x + rnd(-R, R), y: lvl + 0.02, z: cam.target.z + rnd(-R, R), size: 0.12, grow: rnd(2.5, 4),
        life: rnd(0.6, 1), a: 0.55, r: 0.9, g: 0.97, b: 1, tile: TILE_RING, fadeIn: 0.05,
      });
    }
    // foam where water laps against attractions
    if (this.spots.length && up > 0.4) {
      this.foamAcc += sdt * [14, 8, 3][T];
      while (this.foamAcc >= 1) {
        this.foamAcc -= 1;
        const s = this.spots[(Math.random() * this.spots.length) | 0];
        const a = Math.random() * 6.283, d = rnd(0.3, 1.1);
        foamFx.emit({ x: s.x + Math.cos(a) * d, y: lvl + 0.04, z: s.z + Math.sin(a) * d, vx: rnd(-0.05, 0.05), vz: rnd(-0.05, 0.05), life: rnd(1.2, 2), size: rnd(0.2, 0.35), grow: 1.2, a: 0.4, r: 0.95, g: 0.98, b: 1, rot: rnd(0, 6.28), tile: (Math.random() * 3) | 0 });
      }
    }
  }

  dispose() {
    scene.remove(this.group);
    this.box.geometry.dispose();
    this.box.material.dispose();
    this.box.dispose();
  }
}

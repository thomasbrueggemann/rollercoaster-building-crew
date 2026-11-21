// Earthquake visuals: jittering rocks, ground cracks, dust bursts at attraction bases.
import * as THREE from 'three';
import { scene } from '../scene.js';
import { isUltra, isLow } from '../quality.js';
import { dustPuff } from '../effects.js';

const T = isUltra() ? 0 : isLow() ? 2 : 1;
const N_ROCKS = [44, 26, 10][T];
const N_CRACKS = [10, 6, 3][T];
const rnd = (a, b) => a + Math.random() * (b - a);

function crackGeometry(x, z, ang) {
  const verts = [], idx = [];
  const segs = 14 + ((Math.random() * 8) | 0);
  let px = x, pz = z, a = ang;
  const pts = [];
  const len = rnd(0.12, 0.2);
  for (let i = 0; i < segs; i++) {
    pts.push([px, pz, 0.05 * Math.sin((i / (segs - 1)) * Math.PI) + 0.012]);
    a += rnd(-0.6, 0.6);
    px += Math.cos(a) * len; pz += Math.sin(a) * len;
  }
  for (let i = 0; i < pts.length; i++) {
    const [qx, qz, w] = pts[i];
    const nx = i < pts.length - 1 ? pts[i + 1][0] - qx : qx - pts[i - 1][0];
    const nz = i < pts.length - 1 ? pts[i + 1][1] - qz : qz - pts[i - 1][1];
    const l = Math.hypot(nx, nz) || 1;
    const sx = -nz / l * w, sz = nx / l * w;
    verts.push(qx - sx, 0.018, qz - sz, qx + sx, 0.018, qz + sz);
  }
  // index order follows the path so drawRange reveals the crack progressively
  for (let i = 0; i < pts.length - 1; i++) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.userData.total = idx.length;
  return g;
}

export class QuakeFx {
  constructor(spots) {
    this.t = 0;
    this.spots = spots;                 // [{x,z}] attraction bases
    this.group = new THREE.Group();
    const pickSpot = () => spots.length ? spots[(Math.random() * spots.length) | 0] : { x: 24, z: 24 };
    // rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 0.95, flatShading: true });
    this.rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, N_ROCKS);
    this.rocks.castShadow = !isLow();
    this.rocks.frustumCulled = false;
    const c = new THREE.Color();
    this.rockData = Array.from({ length: N_ROCKS }, (_, i) => {
      const s = pickSpot(), a = rnd(0, 6.283), d = rnd(0.5, 2.2);
      this.rocks.setColorAt(i, c.set(['#8d8578', '#7a736a', '#a29a8b', '#6b665e'][i % 4]));
      return { x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d, sz: rnd(0.04, 0.11), ph: rnd(0, 6.28), f: rnd(14, 26), rx: rnd(0, 6), rv: rnd(-4, 4), hop: rnd(0.6, 1.4), delay: rnd(0, 1.2) };
    });
    this.group.add(this.rocks);
    // cracks
    this.cracks = [];
    this.crackMat = new THREE.MeshBasicMaterial({ color: '#150f09', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide });
    for (let i = 0; i < N_CRACKS; i++) {
      const s = pickSpot(), a = rnd(0, 6.283), d = rnd(0.6, 2);
      const m = new THREE.Mesh(crackGeometry(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, rnd(0, 6.283)), this.crackMat);
      m.geometry.setDrawRange(0, 0);
      m.userData.delay = rnd(0, 1.5);
      m.frustumCulled = false;
      this.group.add(m);
      this.cracks.push(m);
    }
    scene.add(this.group);
    // initial dust burst at every attraction
    for (const s of spots.slice(0, 14)) for (let i = 0; i < [7, 4, 2][T]; i++) dustPuff(s.x + rnd(-0.7, 0.7), 0.1, s.z + rnd(-0.7, 0.7), { size: 0.8, a: 0.45, speed: 2 });
    this.acc = 0;
  }

  update(sdt, amp, dur) {
    if (sdt <= 0) return;
    this.t += sdt;
    const t = this.t, o = new THREE.Object3D();
    const fadeOut = Math.max(0, Math.min(1, (dur - t) / 1.5));
    for (let i = 0; i < this.rockData.length; i++) {
      const r = this.rockData[i];
      const on = Math.max(0, Math.min(1, (t - r.delay) * 4)) * fadeOut;
      const hop = Math.max(0, Math.sin(t * r.f + r.ph)) * (0.03 + amp * 0.35) * r.hop;
      o.position.set(r.x, r.sz * 0.6 + hop, r.z);
      o.rotation.set(r.rx + t * r.rv * amp * 2, r.ph, 0);
      o.scale.setScalar(r.sz * on);
      o.updateMatrix();
      this.rocks.setMatrixAt(i, o.matrix);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    for (const m of this.cracks) {
      const k = Math.max(0, Math.min(1, (t - m.userData.delay) / 1.2));
      const tot = m.geometry.userData.total;
      m.geometry.setDrawRange(0, Math.floor((k * tot) / 6) * 6);
    }
    this.crackMat.opacity = 0.9 * fadeOut;
    // continuing dust
    this.acc += sdt * [14, 8, 3][T] * Math.min(1, amp * 2.5);
    while (this.acc >= 1 && this.spots.length) {
      this.acc -= 1;
      const s = this.spots[(Math.random() * this.spots.length) | 0];
      dustPuff(s.x + rnd(-0.8, 0.8), 0.08, s.z + rnd(-0.8, 0.8), { size: 0.55, a: 0.32, speed: 1.4 });
    }
  }

  dispose() {
    scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    this.crackMat.dispose();
    this.rocks.material.dispose();
    this.rocks.dispose();
  }
}

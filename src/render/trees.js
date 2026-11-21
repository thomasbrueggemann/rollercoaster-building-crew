// Wild (unowned) land vegetation: instanced conifers, broadleaf trees, birches, bushes, rocks, grass tufts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const hash3 = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function part(geo, color, { pos = [0, 0, 0], scale = [1, 1, 1], jitter = 0, rotY = 0 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.scale(scale[0], scale[1], scale[2]);
  g.rotateY(rotY);
  g.translate(pos[0], pos[1], pos[2]);
  if (jitter) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (hash3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * jitter;
      const k2 = (hash3(Math.round(z * 50), Math.round(x * 50), Math.round(y * 50)) - 0.5) * jitter;
      p.setXYZ(i, x + k, y + k2 * 0.8, z + (k + k2) * 0.5);
    }
    g.computeVertexNormals();
  }
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };

function conifer() {
  const cone = (r, h) => new THREE.ConeGeometry(r, h, 8, 1);
  return merge([
    part(new THREE.CylinderGeometry(0.05, 0.08, 0.35, 6), '#5b4030', { pos: [0, 0.17, 0] }),
    part(cone(0.42, 0.65), '#2a5e36', { pos: [0, 0.55, 0], jitter: 0.05 }),
    part(cone(0.33, 0.6), '#2f6b3a', { pos: [0, 0.9, 0], jitter: 0.05 }),
    part(cone(0.23, 0.55), '#377841', { pos: [0, 1.22, 0], jitter: 0.04 }),
  ]);
}
function broadleaf() {
  const blob = (r) => new THREE.IcosahedronGeometry(r, 1);
  return merge([
    part(new THREE.CylinderGeometry(0.06, 0.1, 0.55, 6), '#6a4a35', { pos: [0, 0.27, 0] }),
    part(blob(0.4), '#3f8a3f', { pos: [0, 0.82, 0], scale: [1, 0.9, 1], jitter: 0.12 }),
    part(blob(0.28), '#4b9a46', { pos: [0.22, 0.68, 0.1], jitter: 0.1 }),
    part(blob(0.25), '#357a39', { pos: [-0.2, 0.95, -0.12], jitter: 0.1 }),
  ]);
}
function birch() {
  const blob = (r) => new THREE.IcosahedronGeometry(r, 1);
  return merge([
    part(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 6), '#e8e4d8', { pos: [0, 0.4, 0] }),
    part(blob(0.26), '#8fc24a', { pos: [0, 0.95, 0], scale: [1, 1.3, 1], jitter: 0.1 }),
    part(blob(0.18), '#a5d15a', { pos: [0.12, 0.7, 0.05], jitter: 0.08 }),
  ]);
}
const bush = () => merge([
  part(new THREE.IcosahedronGeometry(0.26, 1), '#3f7f3a', { pos: [0, 0.16, 0], scale: [1.2, 0.8, 1.1], jitter: 0.1 }),
  part(new THREE.IcosahedronGeometry(0.17, 1), '#4f9144', { pos: [0.2, 0.12, 0.08], jitter: 0.08 }),
]);
const rock = () => merge([
  part(new THREE.DodecahedronGeometry(0.22, 0), '#8c8f93', { pos: [0, 0.1, 0], scale: [1.2, 0.75, 1], jitter: 0.1 }),
  part(new THREE.DodecahedronGeometry(0.12, 0), '#777b80', { pos: [0.22, 0.05, 0.1], jitter: 0.06 }),
]);
function tuft() {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry();
    const w = 0.035, h = 0.2 + i * 0.03;
    const lean = 0.05 + i * 0.02;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, lean, h, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.35, 0.5, 0.25, 0.35, 0.5, 0.25, 0.85, 1, 0.55], 3));
    g.rotateY((i * Math.PI) / 3);
    blades.push(g);
  }
  // group of 3 blades + a second cluster offset
  const second = blades.map((b) => b.clone().translate(0.07, 0, 0.05).scale(0.8, 0.8, 0.8));
  return merge([...blades, ...second]);
}

export function createVegetation(scene, { tufts = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: false });
  const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const cap = 2400;
  const defs = {
    conifer: [conifer(), true], broadleaf: [broadleaf(), true], birch: [birch(), true],
    bush: [bush(), true], rock: [rock(), true],
  };
  const meshes = {};
  const group = new THREE.Group();
  for (const [k, [geo, shadow]] of Object.entries(defs)) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    meshes[k] = m; group.add(m);
  }
  let tuftMesh = null;
  if (tufts) {
    tuftMesh = new THREE.InstancedMesh(tuft(), tuftMat, cap * 6);
    tuftMesh.frustumCulled = false; tuftMesh.count = 0; tuftMesh.receiveShadow = true;
    tuftMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    group.add(tuftMesh);
  }
  scene.add(group);

  const o = new THREE.Object3D();
  const col = new THREE.Color();

  return function rebuild(N, isOwned) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = {}; for (const k in meshes) n[k] = 0;
    let nt = 0;
    const put = (kind, x, y, z, s, rot, tint) => {
      const m = meshes[kind];
      if (n[kind] >= cap) return;
      o.position.set(x, y, z); o.rotation.set(0, rot, 0); o.scale.setScalar(s); o.updateMatrix();
      m.setMatrixAt(n[kind], o.matrix);
      m.setColorAt(n[kind], tint);
      n[kind]++;
    };
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const r = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd();
        if (isOwned(x, z)) continue;
        const rim = x < 1 || z < 1 || x >= N - 1 || z >= N - 1;
        const px = x + 0.15 + r2 * 0.7, pz = z + 0.15 + r3 * 0.7;
        if (!rim && r < 0.2) {
          const s = 0.75 + r4 * 0.6;
          col.setHSL(0.27 + (r5 - 0.5) * 0.07, 0.15 + r6 * 0.1, 0.82 + r6 * 0.25);
          if (r6 > 0.93) col.set('#ffb25a'); // the odd autumn tree
          if (r < 0.09) put('conifer', px, 0, pz, s, r4 * 6.28, col.setScalar(0.85 + r5 * 0.3));
          else if (r < 0.15) put('broadleaf', px, 0, pz, s, r4 * 6.28, col);
          else put('birch', px, 0, pz, s * 0.95, r4 * 6.28, col.setScalar(0.9 + r5 * 0.2));
        } else if (r > 0.88 && r < 0.95 && !rim) {
          put('bush', px, 0, pz, 0.8 + r4 * 0.7, r5 * 6.28, col.setScalar(0.85 + r6 * 0.3));
        } else if (r > 0.97) {
          put('rock', px, 0, pz, 0.7 + r4 * 1.0, r5 * 6.28, col.setScalar(0.85 + r6 * 0.3));
        }
        if (tuftMesh && !rim) {
          let s2 = ((z * N + x + 1) * 48271) % 2147483647;
          const rnd2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
          const k = 4 + ((r5 * 4) | 0);
          for (let i = 0; i < k && nt < cap * 6; i++) {
            o.position.set(x + rnd2(), 0, z + rnd2());
            o.rotation.set(0, rnd2() * 6.28, 0);
            o.scale.setScalar(0.8 + rnd2() * 0.7);
            o.updateMatrix();
            tuftMesh.setMatrixAt(nt, o.matrix);
            tuftMesh.setColorAt(nt, col.setHSL(0.24 + rnd2() * 0.06, 0.45, 0.45 + rnd2() * 0.15));
            nt++;
          }
        }
      }
    for (const k in meshes) {
      const m = meshes[k];
      m.count = n[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (tuftMesh) {
      tuftMesh.count = nt;
      tuftMesh.instanceMatrix.needsUpdate = true;
      tuftMesh.instanceColor.needsUpdate = true;
    }
  };
}

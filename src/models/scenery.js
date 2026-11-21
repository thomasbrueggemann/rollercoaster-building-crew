import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, bulbs, ring, kit, done, mesh, seg, BOX, RBOX, CYL, SPH, TORUS, LATHE, geo } from './kit.js';
import { woodTex, noiseTex, barkTex, waterTex, streakTex } from './textures.js';
import { isLow, isUltra } from '../quality.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- TREE
// Foliage is one merged, vertex-coloured geometry (brightness variation) so the paint colour tints it uniformly.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function jitter(g, amp) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // same displacement for identical positions -> no cracks
    const kx = Math.round(x * 50), ky = Math.round(y * 50), kz = Math.round(z * 50);
    p.setXYZ(i, x + (hash3(kx, ky, kz) - 0.5) * amp, y + (hash3(ky, kz, kx + 3) - 0.5) * amp, z + (hash3(kz, kx, ky + 7) - 0.5) * amp);
  }
}
const foliageCache = [];
function foliage(variant) {
  if (foliageCache[variant]) return foliageCache[variant];
  const detail = isLow() ? 0 : isUltra() ? 2 : 1;
  const parts = [];
  const blob = (x, y, z, r, sy = 0.85, d = detail) => {
    const g = new THREE.IcosahedronGeometry(r, d);
    g.scale(1, sy, 1);
    jitter(g, r * 0.35);
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  if (variant === 0) {
    blob(0, 1.0, 0, 0.34); blob(0.22, 0.82, 0.08, 0.26); blob(-0.2, 0.86, -0.1, 0.27);
    blob(0.05, 1.28, -0.04, 0.25); blob(0.06, 0.72, -0.22, 0.2); blob(-0.14, 0.76, 0.2, 0.22); blob(0.18, 1.1, -0.15, 0.18);
  } else if (variant === 1) {
    blob(0, 1.1, 0, 0.3, 1.1); blob(0.2, 0.9, 0.12, 0.24); blob(-0.22, 0.95, 0.05, 0.25); blob(0.0, 0.8, -0.24, 0.23);
    blob(-0.05, 1.42, 0.05, 0.2, 1); blob(0.15, 1.25, -0.15, 0.2);
  } else {
    // conifer
    const tiers = [[0.44, 0.5, 0.4], [0.36, 0.48, 0.72], [0.28, 0.44, 1.02], [0.2, 0.4, 1.3], [0.12, 0.36, 1.55]];
    for (const [r, h, y] of tiers) {
      const g = new THREE.ConeGeometry(r, h, isLow() ? 7 : 9, 2).toNonIndexed();
      jitter(g, r * 0.2);
      g.translate(0, y, 0);
      parts.push(g);
    }
  }
  // brightness gradient + noise as vertex colours
  let minY = 1e9, maxY = -1e9;
  for (const g of parts) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); } }
  for (const g of parts) {
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const u = (p.getY(i) - minY) / (maxY - minY);
      const l = 0.62 + 0.38 * u + (hash3(Math.round(p.getX(i) * 20), Math.round(p.getY(i) * 20), Math.round(p.getZ(i) * 20)) - 0.5) * 0.12;
      col[i * 3] = l; col[i * 3 + 1] = l; col[i * 3 + 2] = l;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
  }
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  foliageCache[variant] = merged;
  return merged;
}

export function tree(color) {
  const k = kit(color), g = new THREE.Group();
  const bark = k.M('#8a6a50', { map: barkTex(), roughness: 0.95 });
  const leaf = k.P(color, { vertexColors: true, roughness: 0.85, clearcoat: 0, metalness: 0 });
  const variant = Math.random() < 0.35 ? 2 : Math.random() < 0.5 ? 0 : 1;
  const b = new Batch();
  // flared trunk + branches + roots
  b.put(LATHE('trunk', [[0, 0], [0.14, 0], [0.1, 0.07], [0.07, 0.2], [0.058, 0.5], [0.05, 0.85], [0, 0.85]], seg(9)), bark);
  if (variant !== 2) {
    b.rod([0, 0.45, 0], [0.18, 0.85, 0.05], 0.022, bark, 5);
    b.rod([0, 0.5, 0], [-0.17, 0.88, -0.06], 0.02, bark, 5);
  }
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; b.rod([Math.sin(a) * 0.06, 0.04, Math.cos(a) * 0.06], [Math.sin(a) * 0.17, 0.0, Math.cos(a) * 0.17], 0.025, bark, 4); }
  // a few stones and grass tufts at the base
  const rock = k.M('#8b8f98', { roughness: 0.95 });
  b.put(geo('rock', () => new THREE.IcosahedronGeometry(0.06, 0).toNonIndexed()), rock, 0.22, 0.02, 0.1, 0.3, 0.5, 0, 1, 0.6, 1.2);
  b.put(geo('rock', () => new THREE.IcosahedronGeometry(0.06, 0).toNonIndexed()), rock, -0.2, 0.015, 0.18, 0.1, 1.5, 0, 0.8, 0.5, 1);
  b.flush(g);
  const fol = new THREE.Mesh(foliage(variant), leaf);
  fol.castShadow = fol.receiveShadow = true;
  fol.rotation.y = Math.random() * TAU;
  const sc = (0.92 + Math.random() * 0.2) * 0.74;
  fol.scale.set(sc, sc, sc);
  g.add(fol);
  return done(k, g, () => {}, variant === 2 ? 1.85 : 1.75);
}

// ---------------------------------------------------------------- FOUNTAIN
export function fountain(color) {
  const k = kit(color), g = new THREE.Group();
  const stoneMap = noiseTex('stone', [4, 2]);
  const stone = k.P(color, { map: stoneMap, roughness: 0.75, clearcoat: 0.1 });
  const stone2 = k.P(color, { map: stoneMap, roughness: 0.75, clearcoat: 0.1 });
  const gold = k.steel('#e3c15d', 0.3);
  const S = seg(40);

  // lower basin: outer wall, scalloped lip, inner floor
  const b = new Batch();
  b.put(LATHE('fBasin', [[0, 0], [0.88, 0], [0.97, 0.05], [0.98, 0.28], [1.0, 0.3], [1.0, 0.33], [0.9, 0.33], [0.9, 0.3], [0.88, 0.16], [0, 0.16]], S), stone);
  // pedestal: stacked vase profile
  b.put(LATHE('fPed', [[0, 0.16], [0.22, 0.16], [0.2, 0.24], [0.12, 0.34], [0.1, 0.5], [0.14, 0.58], [0.1, 0.64], [0.09, 0.78], [0.24, 0.86], [0.0, 0.86]], seg(20)), stone2);
  // upper bowl
  b.put(LATHE('fBowl', [[0, 0.84], [0.1, 0.84], [0.3, 0.9], [0.48, 1.0], [0.52, 1.06], [0.5, 1.07], [0.44, 1.03], [0.28, 0.97], [0.0, 0.95]], seg(32)), stone);
  // finial pillar + gold ball
  b.put(LATHE('fPillar', [[0, 0.95], [0.07, 0.95], [0.045, 1.05], [0.04, 1.25], [0.06, 1.3], [0, 1.3]], 10), gold);
  // little lion-head spouts around the lower rim (gold)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.sph(0.04, gold, Math.sin(a) * 0.99, 0.22, Math.cos(a) * 0.99, 6, 1, 1, 1.1);
  }
  b.flush(g);

  // water surface (animated texture offset), transparent + glossy
  const wTex = waterTex();
  const water = new THREE.MeshPhysicalMaterial({
    color: '#4cc9f0', map: wTex, emissive: '#1b8fbf', emissiveIntensity: 0.15, roughness: 0.06, metalness: 0,
    transparent: true, opacity: 0.8, depthWrite: false, clearcoat: isLow() ? 0 : 1,
  });
  if (isLow()) { /* keep Physical for simplicity of ghost clone */ }
  g.add(mesh(CYL(0.89, 0.89, 0.012, S), water, 0, 0.215, 0));
  const water2 = water.clone();
  g.add(mesh(CYL(0.43, 0.43, 0.01, seg(28)), water2, 0, 0.99, 0));
  // falling sheet from the upper bowl
  const sTex = streakTex();
  const sheet = new THREE.MeshStandardMaterial({ color: '#bfeaff', map: sTex, transparent: true, opacity: 0.4, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false, emissive: '#2a8fbf', emissiveIntensity: 0.12 });
  g.add(mesh(CYL(0.53, 0.66, 0.85, seg(40), true), sheet, 0, 0.215 + 0.425, 0));
  // central jet
  const jet = mesh(CYL(0.02, 0.05, 0.5, 8), water, 0, 1.3, 0);
  jet.castShadow = false;
  jet.position.y = 1.3 + 0.25; g.add(jet);
  // drops: instanced, arcs from the jet into the upper bowl
  const ND = 24;
  const dropM = new THREE.MeshStandardMaterial({ color: '#d5f3ff', transparent: true, opacity: 0.8, roughness: 0.05, emissive: '#6cc6ea', emissiveIntensity: 0.15 });
  const drops = new THREE.InstancedMesh(SPH(0.032, 6), dropM, ND);
  drops.frustumCulled = false; drops.castShadow = false;
  g.add(drops);
  // underwater lamps
  g.add(bulbs(k.L('#aef0ff', '#ffffff'), ring(10, 0.8, 0.19), 0.035, 6));
  g.add(bulbs(k.L('#aef0ff', '#ffffff'), ring(6, 0.38, 1.0), 0.03, 6));
  g.add(mesh(SPH(0.06, 10), k.L('#ffe9a8'), 0, 1.36, 0));

  const dm = new THREE.Matrix4(), dp = new THREE.Vector3(), dq = new THREE.Quaternion(), ds = new THREE.Vector3(1, 1, 1);
  return done(k, g, (dt, s) => {
    const t = s.clock;
    sTex.offset.y = -(t * 0.9) % 1;
    wTex.offset.set((t * 0.02) % 1, (t * 0.03) % 1);
    for (let i = 0; i < ND; i++) {
      const u = (t * 0.7 + i / ND) % 1;
      const a = (i / ND) * TAU * 3.0 + Math.floor(t * 0.7 + i / ND) * 0.5;
      const r = 0.04 + u * 0.4;
      const y = 1.28 + Math.sin(u * Math.PI) * 0.22 - u * u * 0.32;
      dp.set(Math.sin(a) * r, y, Math.cos(a) * r);
      dm.compose(dp, dq, ds);
      drops.setMatrixAt(i, dm);
    }
    drops.instanceMatrix.needsUpdate = true;
    jet.scale.y = 0.85 + Math.sin(t * 6) * 0.15;
  }, 1.7);
}

// ---------------------------------------------------------------- BENCH + LAMP
export function bench(color) {
  const k = kit(color), g = new THREE.Group();
  const iron = k.M('#2e3238', { roughness: 0.5, metalness: 0.5 });
  const wood = k.P(color, { map: woodTex([1, 1]), roughness: 0.6, clearcoat: 0.2 });
  const b = new Batch();
  // slatted seat + back
  for (let i = 0; i < 4; i++) b.rbox(0.72, 0.026, 0.055, 0.008, wood, 0, 0.255, -0.09 + i * 0.065);
  for (let i = 0; i < 3; i++) b.put(RBOX(0.72, 0.06, 0.02, 0.008), wood, 0, 0.36 + i * 0.075, -0.145 - i * 0.012, -0.18, 0, 0);
  // cast-iron scroll ends (tube along a spline)
  const curve = (x) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, 0, 0.12), new THREE.Vector3(x, 0.12, 0.1), new THREE.Vector3(x, 0.235, 0.08),
    new THREE.Vector3(x, 0.24, -0.05), new THREE.Vector3(x, 0.3, -0.13), new THREE.Vector3(x, 0.5, -0.18), new THREE.Vector3(x, 0.54, -0.19),
  ]);
  for (const x of [-0.3, 0.3]) {
    b.put(geo('benchTube' + x, () => new THREE.TubeGeometry(curve(x), 16, 0.013, 5)), iron);
    b.rod([x, 0, -0.14], [x, 0.24, -0.06], 0.012, iron, 5);
    b.rod([x, 0.24, 0.07], [x, 0.31, 0.1], 0.011, iron, 5); // armrest support
    b.rod([x, 0.31, 0.1], [x, 0.31, -0.1], 0.013, iron, 5); // armrest
    b.sph(0.02, iron, x, 0.31, 0.1, 6);
    b.cyl(0.03, 0.03, 0.012, iron, x, 0, 0.12, 8);
    b.cyl(0.03, 0.03, 0.012, iron, x, 0, -0.14, 8);
  }
  b.rod([-0.3, 0.1, 0.1], [0.3, 0.1, 0.1], 0.008, iron, 4);
  // lamp post: base, fluted pole, lantern with glowing bulb
  const lx = 0.43, lz = -0.12;
  b.put(LATHE('lampBase', [[0, 0], [0.065, 0], [0.06, 0.04], [0.035, 0.1], [0.026, 0.2], [0.02, 0.3], [0, 0.3]], seg(10)), iron, lx, 0, lz);
  b.cyl(0.018, 0.022, 0.7, iron, lx, 0.3, lz, 8);
  b.put(TORUS(0.026, 0.008, 4, 10), iron, lx, 0.62, lz, Math.PI / 2);
  b.cyl(0.05, 0.035, 0.02, iron, lx, 1.0, lz, 8);
  b.put(CYL(0, 0.07, 0.07, 8), iron, lx, 1.2, lz);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.rod([lx + sx * 0.04, 1.02, lz + sz * 0.04], [lx + sx * 0.04, 1.16, lz + sz * 0.04], 0.005, iron, 3);
  b.cyl(0.006, 0.006, 0.05, iron, lx, 1.24, lz, 4);
  b.flush(g);
  const lamp = k.L('#fff3b0');
  g.add(mesh(SPH(0.052, 10), lamp, lx, 1.09, lz));
  const halo = k.glass('#fff3b0', 0.18);
  g.add(mesh(SPH(0.075, 10), halo, lx, 1.09, lz));
  return done(k, g, () => {}, 1.3);
}

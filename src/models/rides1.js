import * as THREE from 'three';
import { Batch, bulbs, ring, kit, done, mesh, seg, BOX, RBOX, CYL, SPH, TORUS, LATHE, geo } from './kit.js';
import { woodTex, noiseTex, mirrorTex, roundingTex, signTex, diamondTex, checkTex } from './textures.js';
import { isLow, isUltra } from '../quality.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- horse (cached per coat)
const horseCache = new Map();
function horseProto(k, coat, mane, saddleMat, goldMat) {
  const key = coat + mane;
  // materials are per-build (paint tinting) so we only cache nothing but geometry via Batch/geo cache
  const b = new Batch();
  const body = k.lacquer(coat, { roughness: 0.4 });
  const manem = k.M(mane, { roughness: 0.6 });
  const dark = k.M('#2b2118', { roughness: 0.5 });
  const s = isLow() ? 6 : 8;
  // barrel + chest + rump
  b.put(geo('hcap', () => new THREE.CapsuleGeometry(0.075, 0.2, 3, s)), body, 0, 0.1, 0, Math.PI / 2, 0, 0, 0.95, 1, 1);
  b.sph(0.088, body, 0, 0.115, 0.14, s + 2);
  b.sph(0.092, body, 0, 0.11, -0.13, s + 2);
  // neck
  b.put(CYL(0.045, 0.07, 0.22, s), body, 0, 0.245, 0.18, 0.62, 0, 0);
  // head + muzzle
  b.put(RBOX(0.075, 0.085, 0.15, 0.025), body, 0, 0.36, 0.29, 0.75, 0, 0);
  b.put(RBOX(0.062, 0.062, 0.07, 0.02), body, 0, 0.32, 0.375, 0.75, 0, 0);
  b.sph(0.012, dark, 0.04, 0.37, 0.295, 5); b.sph(0.012, dark, -0.04, 0.37, 0.295, 5);
  // ears
  b.put(CYL(0, 0.02, 0.05, 5), body, 0.028, 0.43, 0.245, 0.3, 0, 0.15);
  b.put(CYL(0, 0.02, 0.05, 5), body, -0.028, 0.43, 0.245, 0.3, 0, -0.15);
  // mane + forelock + tail
  b.put(BOX(0.022, 0.2, 0.06), manem, 0, 0.275, 0.12, 0.62, 0, 0);
  b.put(BOX(0.03, 0.05, 0.03), manem, 0, 0.42, 0.265, 0.6, 0, 0);
  b.put(CYL(0.035, 0.008, 0.22, 5), manem, 0, 0.065, -0.235, 0.5, 0, 0);
  // legs (front legs reach forward, hind legs tucked) with hooves
  for (const sx of [-1, 1]) {
    b.put(CYL(0.026, 0.017, 0.2, 5), body, sx * 0.05, 0.0, 0.17, -0.45, 0, 0);
    b.put(CYL(0.02, 0.02, 0.03, 5), dark, sx * 0.05, -0.1, 0.215, -0.45, 0, 0);
    b.put(CYL(0.03, 0.018, 0.2, 5), body, sx * 0.05, 0.0, -0.15, 0.35, 0, 0);
    b.put(CYL(0.02, 0.02, 0.03, 5), dark, sx * 0.05, -0.1, -0.185, 0.35, 0, 0);
  }
  // blanket, saddle, bridle
  b.rbox(0.17, 0.02, 0.15, 0.01, goldMat, 0, 0.17, -0.01);
  b.rbox(0.14, 0.04, 0.11, 0.015, saddleMat, 0, 0.19, -0.01);
  b.put(TORUS(0.06, 0.006, 4, 10), goldMat, 0, 0.31, 0.31, 0.75 + Math.PI / 2, 0, 0, 1, 1, 1);
  const grp = new THREE.Group();
  b.flush(grp);
  return grp;
}

// ---------------------------------------------------------------- CAROUSEL
export function carousel(color) {
  const k = kit(color), g = new THREE.Group();
  const stone = k.M('#aab3c2', { map: noiseTex('stone', [3, 3]), roughness: 0.85 });
  const gold = k.steel('#ffd166', 0.3);
  const cream = k.M('#fbf3e2', { roughness: 0.5 });
  const wood = k.M('#d2a97a', { map: woodTex([2, 2]), roughness: 0.55 });
  const mirror = k.M('#ffffff', { map: mirrorTex(), metalness: 0.55, roughness: 0.08 });
  const roofP = k.P();
  const roofP2 = k.P();
  const S = seg(32);

  // --- static base
  const base = new Batch();
  base.put(LATHE('carBase', [[0, 0], [1.0, 0], [1.0, 0.07], [0.97, 0.1], [0.97, 0.13], [0, 0.13]], seg(40)), stone);
  base.put(TORUS(0.985, 0.018, 5, seg(48)), gold, 0, 0.1, 0, Math.PI / 2);
  // steps
  base.rbox(0.5, 0.05, 0.14, 0.02, stone, 0, 0, 1.0);
  base.flush(g);
  g.add(bulbs(k.L('#fff0b0'), ring(24, 0.99, 0.15), 0.025));

  // --- rotating part
  const spin = new THREE.Group();
  g.add(spin);
  const sb = new Batch();
  sb.cyl(0.93, 0.93, 0.06, wood, 0, 0.13, 0, S);
  sb.put(TORUS(0.93, 0.02, 5, S), gold, 0, 0.2, 0, Math.PI / 2);
  // centre column: core + mirror panels + gold trim
  sb.cyl(0.22, 0.26, 0.06, gold, 0, 0.19, 0, 16);
  sb.cyl(0.19, 0.19, 1.3, cream, 0, 0.2, 0, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    sb.put(BOX(0.13, 1.0, 0.012), mirror, Math.sin(a) * 0.196, 0.85, Math.cos(a) * 0.196, 0, a, 0);
    sb.put(BOX(0.025, 1.1, 0.03), gold, Math.sin(a - TAU / 16) * 0.2, 0.85, Math.cos(a - TAU / 16) * 0.2, 0, a - TAU / 16, 0);
  }
  sb.cyl(0.23, 0.2, 0.08, gold, 0, 1.38, 0, 16);
  // underside of canopy
  sb.cyl(0.98, 0.98, 0.05, cream, 0, 1.47, 0, S);
  sb.put(TORUS(0.9, 0.012, 4, S), gold, 0, 1.465, 0, Math.PI / 2);
  // rounding board scallops hanging below the band
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    sb.sph(0.05, i & 1 ? gold : cream, Math.sin(a) * 0.985, 1.455, Math.cos(a) * 0.985, 6, 1, 0.75, 1);
  }
  // roof: alternating wedges of lathe + gold ribs
  const NW = 12;
  const roofPts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; roofPts.push([1.06 * Math.pow(1 - t, 1.05) + 0.04, 1.74 + 0.5 * (1 - Math.pow(1 - t, 2.3))]); }
  for (let i = 0; i < NW; i++) {
    sb.put(LATHE('carRoof', roofPts, 4, (i / NW) * TAU, TAU / NW), i & 1 ? roofP : roofP2, 0, 0, 0);
  }
  for (let i = 0; i < NW; i++) {
    const a = (i / NW) * TAU, s = Math.sin(a), c = Math.cos(a);
    sb.rod([s * 1.07, 1.74, c * 1.07], [s * 0.05, 2.24, c * 0.05], 0.014, gold);
  }
  // top finial
  sb.put(LATHE('carFin', [[0.0, 2.2], [0.1, 2.2], [0.06, 2.3], [0.03, 2.36], [0.0, 2.4]], 10), gold);
  sb.put(SPH(0.07, 10), gold, 0, 2.43, 0);
  // supports to canopy from column
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    sb.rod([Math.sin(a) * 0.19, 1.45, Math.cos(a) * 0.19], [Math.sin(a) * 0.9, 1.52, Math.cos(a) * 0.9], 0.012, gold);
  }
  sb.flush(spin);

  // rounding board (textured band, tinted by the paint colour)
  const bandMat = k.P('#ffffff', { map: roundingTex(), side: THREE.DoubleSide, clearcoat: 0.3 });
  bandMat.color.set(color);
  spin.add(mesh(CYL(1.0, 1.0, 0.24, S, true), bandMat, 0, 1.52 + 0.12, 0));
  const band2 = k.P(color, { clearcoat: 0.3 });
  const ring2 = mesh(CYL(1.04, 1.04, 0.04, S), band2, 0, 1.72, 0);
  spin.add(ring2);

  // bulbs: rim, band, roof ribs
  const bulbWarm = k.L('#fff0b0'), bulbPink = k.L('#ff9ecb');
  spin.add(bulbs(bulbWarm, ring(28, 1.02, 1.5, 0.05), 0.028));
  spin.add(bulbs(bulbPink, ring(28, 1.02, 1.74, 0.11), 0.028));
  const ribBulbs = [];
  for (let i = 0; i < NW; i++) {
    const a = ((i + 0.5) / NW) * TAU;
    for (let j = 1; j <= 4; j++) {
      const t = j / 5;
      ribBulbs.push([Math.sin(a) * (1.05 * (1 - t) + 0.07) * 1.02, 1.76 + 0.5 * (1 - Math.pow(1 - t, 2.3)) + 0.03, Math.cos(a) * (1.05 * (1 - t) + 0.07) * 1.02]);
    }
  }
  spin.add(bulbs(bulbWarm, ribBulbs, 0.024));
  spin.add(bulbs(bulbPink, ring(12, 0.55, 1.455), 0.03));

  // horses on poles
  const horseDefs = [
    ['#ffffff', '#b97a57', k.P('#c1121f', { clearcoat: 0.3 })],
    ['#ffe5ec', '#f4c95d', k.P('#264653', { clearcoat: 0.3 })],
    ['#e6f4f1', '#8d5524', k.P('#ff9f1c', { clearcoat: 0.3 })],
    ['#c9a27a', '#3d2b1f', k.P('#6a4c93', { clearcoat: 0.3 })],
  ];
  // the saddle materials above are accents; keep them OUT of the paint list so only roofs follow the paint colour
  for (const d of horseDefs) { const i = k.paint.indexOf(d[2]); if (i >= 0) k.paint.splice(i, 1); }
  const protos = horseDefs.map(([c, m, sad]) => horseProto(k, c, m, sad, gold));
  const horses = [];
  const NH = 8;
  const polesB = new Batch();
  for (let i = 0; i < NH; i++) {
    const a = (i / NH) * TAU, r = 0.66;
    const px = Math.sin(a) * r, pz = Math.cos(a) * r;
    polesB.cyl(0.018, 0.018, 1.3, gold, px, 0.2, pz, 6);
    polesB.sph(0.03, gold, px, 1.5, pz, 6);
    const h = protos[i % protos.length].clone();
    h.position.set(px, 0.6, pz);
    h.rotation.y = a + Math.PI / 2;
    h.userData.base = i % 2 ? 0.72 : 0.56;
    spin.add(h);
    horses.push(h);
  }
  polesB.flush(spin);

  return done(k, g, (dt, s) => {
    spin.rotation.y += dt * s.speed * 1.4;
    horses.forEach((h, i) => { h.position.y = h.userData.base + Math.sin(s.t * 4 + i * 1.7) * 0.1 * s.speed; });
  }, 2.45);
}

// ---------------------------------------------------------------- FERRIS WHEEL
function gondola(k, bodyMat, roofMat, glassM, steel, dark) {
  const b = new Batch();
  // hanger frame
  b.rod([0, 0, 0], [0.11, -0.2, 0.0], 0.008, steel, 4);
  b.rod([0, 0, 0], [-0.11, -0.2, 0.0], 0.008, steel, 4);
  b.sph(0.02, steel, 0, 0, 0, 6);
  // roof dome
  b.put(SPH(0.2, 14, Math.PI / 2), roofMat, 0, -0.205, 0, 0, 0, 0, 0.95, 0.5, 1.0);
  b.cyl(0.02, 0.02, 0.03, steel, 0, -0.2, 0, 6);
  // glass band and corner posts
  b.box(0.32, 0.13, 0.34, glassM, 0, -0.37, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * 0.16, -0.235, sz * 0.17], [sx * 0.16, -0.37, sz * 0.17], 0.01, steel, 4);
  // lower body + floor
  b.rbox(0.34, 0.1, 0.36, 0.03, bodyMat, 0, -0.47, 0);
  b.box(0.3, 0.02, 0.32, dark, 0, -0.365, 0);
  // benches inside
  b.box(0.26, 0.03, 0.07, dark, 0, -0.34, 0.1);
  b.box(0.26, 0.03, 0.07, dark, 0, -0.34, -0.1);
  const grp = new THREE.Group();
  b.flush(grp);
  return grp;
}

export function ferris(color) {
  const k = kit(color), g = new THREE.Group();
  const R = 1.3, HY = 2.0;
  const concrete = k.M('#9aa3b2', { map: noiseTex('conc', [3, 1]), roughness: 0.9 });
  const white = k.steel('#f1f3f5', 0.42);
  const dark = k.M('#2b2d42', { roughness: 0.6 });
  const rimP = k.P(), rimP2 = k.P();
  const glassM = k.glass('#cdeeff', 0.38);
  const wood = k.M('#d2a97a', { map: woodTex([1, 1]), roughness: 0.6 });

  const st = new Batch();
  // platform and steps
  st.rbox(2.6, 0.12, 1.2, 0.03, concrete, 0, 0, 0);
  st.rbox(1.2, 0.07, 0.4, 0.02, wood, 0, 0, 0.72);
  st.rbox(0.9, 0.04, 0.2, 0.015, wood, 0, 0, 0.98);
  // A-frame legs with lattice, at both z sides
  for (const z of [-0.5, 0.5]) {
    for (const sx of [-1, 1]) {
      st.beam([sx * 1.0, 0.12, z], [sx * 0.04, HY, z], 0.085, white);
      st.beam([sx * 1.0, 0.12, z * 1.15], [sx * 0.04, HY, z * 0.9], 0.04, rimP2); // accent stripe
    }
    // horizontal braces + diagonals
    const xAt = (y) => 1.0 * (1 - (y - 0.12) / (HY - 0.12));
    for (const y of [0.55, 1.0, 1.45]) st.beam([-xAt(y), y, z], [xAt(y), y, z], 0.035, white);
    for (let i = 0; i < 3; i++) {
      const y0 = [0.12, 0.55, 1.0][i], y1 = [0.55, 1.0, 1.45][i];
      st.rod([-xAt(y0), y0, z], [xAt(y1), y1, z], 0.014, white);
      st.rod([xAt(y0), y0, z], [-xAt(y1), y1, z], 0.014, white);
    }
  }
  // cross members between the two frames
  for (const sx of [-1, 1]) { st.beam([sx * 1.0, 0.15, -0.5], [sx * 1.0, 0.15, 0.5], 0.06, white); st.beam([sx * 0.5, 1.0 + 0.1, -0.5], [sx * 0.5, 1.1, 0.5], 0.03, white); }
  // axle + bearing housings
  st.put(CYL(0.07, 0.07, 1.4, 12), white, 0, HY, 0, Math.PI / 2, 0, 0);
  for (const z of [-0.5, 0.5]) st.put(CYL(0.12, 0.12, 0.1, 14), dark, 0, HY, z, Math.PI / 2, 0, 0);
  // ticket booth
  st.rbox(0.36, 0.45, 0.3, 0.02, k.M('#f8f1e3'), -1.0, 0.12, 0.5);
  st.rbox(0.46, 0.05, 0.4, 0.02, rimP, -1.0, 0.57, 0.5);
  st.box(0.2, 0.14, 0.01, glassM, -1.0, 0.3, 0.655);
  // queue rail
  for (let i = 0; i < 6; i++) st.rod([-0.5 + i * 0.2, 0.19, 1.12], [-0.5 + i * 0.2, 0.5, 1.12], 0.012, white, 5);
  st.rod([-0.5, 0.5, 1.12], [0.5, 0.5, 1.12], 0.012, white, 5);
  st.rod([-0.5, 0.36, 1.12], [0.5, 0.36, 1.12], 0.01, white, 5);
  st.flush(g);

  // sign
  const sg = new THREE.Group();
  const signM = k.sign(signTex('FERRIS WHEEL', '#1d3557', '#ffe066'));
  const plane = new THREE.Mesh(geo('plane1.1x.28', () => new THREE.PlaneGeometry(1.1, 0.28)), signM);
  plane.position.set(0, 0.0, 0.026); plane.castShadow = false;
  sg.add(mesh(RBOX(1.18, 0.34, 0.05, 0.02), dark, 0, 0, 0), plane);
  sg.position.set(0, 0.9, 1.15);
  g.add(sg);
  const sgb = new Batch();
  sgb.rod([-0.45, 0.14, 1.15], [-0.45, 0.8, 1.15], 0.02, white); sgb.rod([0.45, 0.14, 1.15], [0.45, 0.8, 1.15], 0.02, white);
  sgb.flush(g);

  // --- wheel
  const wheel = new THREE.Group();
  wheel.position.set(0, HY, 0);
  g.add(wheel);
  const wb = new Batch();
  const rimSeg = seg(56);
  for (const z of [-0.3, 0.3]) {
    wb.put(TORUS(R, 0.045, 6, rimSeg), rimP, 0, 0, z);
    wb.put(TORUS(R - 0.1, 0.018, 5, rimSeg), white, 0, 0, z);
    wb.put(TORUS(0.55, 0.03, 5, seg(32)), rimP2, 0, 0, z);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      wb.rod([Math.cos(a) * 0.12, Math.sin(a) * 0.12, z], [Math.cos(a) * (R - 0.03), Math.sin(a) * (R - 0.03), z], 0.014, white, 4);
    }
    // zigzag lattice between inner and outer ring
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 0.5) / 16) * TAU, a2 = ((i + 1) / 16) * TAU;
      wb.rod([Math.cos(a0) * 0.55, Math.sin(a0) * 0.55, z], [Math.cos(a1) * (R - 0.1), Math.sin(a1) * (R - 0.1), z], 0.01, white, 3);
      wb.rod([Math.cos(a1) * (R - 0.1), Math.sin(a1) * (R - 0.1), z], [Math.cos(a2) * 0.55, Math.sin(a2) * 0.55, z], 0.01, white, 3);
    }
  }
  // cross ties between the two rims
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    wb.rod([Math.cos(a) * R, Math.sin(a) * R, -0.3], [Math.cos(a) * R, Math.sin(a) * R, 0.3], 0.012, white, 3);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    wb.rod([Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.3], [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.3], 0.012, white, 3);
  }
  // gondola pivot rods
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    wb.rod([Math.cos(a) * R, Math.sin(a) * R, -0.3], [Math.cos(a) * R, Math.sin(a) * R, 0.3], 0.02, white, 5);
  }
  // hub
  wb.put(CYL(0.16,0.16, 0.7, 16), rimP, 0, 0, 0, Math.PI / 2);
  wb.put(SPH(0.14, 12), white, 0, 0, 0.36, 0, 0, 0, 1, 1, 0.7);
  wb.put(SPH(0.14, 12), white, 0, 0, -0.36, 0, 0, 0, 1, 1, 0.7);
  wb.flush(wheel);
  // bulbs on both rims (alternating colours) + hub star
  const bA = k.L('#ffd6ff'), bB = k.L('#ffe27a'), bC = k.L('#9be7ff');
  const rimA = [], rimB = [], inner = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    for (const z of [-0.33, 0.33]) (i & 1 ? rimA : rimB).push([Math.cos(a) * R, Math.sin(a) * R, z]);
  }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; for (const z of [-0.33, 0.33]) inner.push([Math.cos(a) * 0.55, Math.sin(a) * 0.55, z]); }
  wheel.add(bulbs(bA, rimA, 0.03), bulbs(bB, rimB, 0.03), bulbs(bC, inner, 0.026));
  const spokeB = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; for (const rr of [0.3, 0.8, 1.1]) spokeB.push([Math.cos(a) * rr, Math.sin(a) * rr, 0.32]); }
  wheel.add(bulbs(bB, spokeB, 0.022));

  // gondolas
  const NG = 12;
  const gA = gondola(k, k.P(), rimP, glassM, white, dark);
  const gB = gondola(k, k.lacquer('#ffffff'), k.lacquer('#f4f4f4'), glassM, white, dark);
  const pivots = [];
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * TAU;
    const p = (i & 1 ? gA : gB).clone();
    p.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    wheel.add(p);
    pivots.push(p);
  }
  return done(k, g, (dt, s) => {
    wheel.rotation.z += dt * s.speed * 0.4;
    for (const p of pivots) p.rotation.z = -wheel.rotation.z;
  }, 3.6);
}

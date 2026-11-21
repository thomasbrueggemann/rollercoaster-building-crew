import * as THREE from 'three';
import { Batch, bulbs, kit, done, mesh, seg, BOX, RBOX, CYL, SPH, TORUS, LATHE, geo } from './kit.js';
import { woodTex, noiseTex, signTex, menuTex, stripeTex, waffleTex, checkTex } from './textures.js';

const TAU = Math.PI * 2;
const plane = (w, h) => geo(`plane${w}x${h}`, () => new THREE.PlaneGeometry(w, h));

// A little shopfront: counter, back wall with shelves, striped scalloped awning, roof sign, menus, bulbs.
function stand(color, name, signCols, menu, topper) {
  const k = kit(color), g = new THREE.Group();
  const cream = k.M('#f7ecd9', { roughness: 0.75 });
  const white = k.lacquer('#ffffff', { roughness: 0.5 });
  const stone = k.M('#9aa3b2', { map: noiseTex('stone', [2, 2]), roughness: 0.9 });
  const wood = k.M('#c79a6b', { map: woodTex([1, 1]), roughness: 0.55 });
  const laminate = k.lacquer('#f2f2f0', { roughness: 0.3 });
  const steel = k.steel('#d5dae0', 0.3);
  const dark = k.M('#2b2d42', { roughness: 0.5 });
  const roofP = k.P();
  const awnP = k.P();
  const b = new Batch();

  b.rbox(0.94, 0.05, 0.9, 0.02, stone, 0, 0, 0);
  // shell: back wall, side walls
  b.box(0.86, 1.0, 0.05, cream, 0, 0.05, -0.4);
  b.box(0.05, 1.0, 0.62, cream, -0.405, 0.05, -0.1);
  b.box(0.05, 1.0, 0.62, cream, 0.405, 0.05, -0.1);
  // wainscot trim
  b.box(0.88, 0.04, 0.06, wood, 0, 0.3, -0.395);
  // counter + top + front panel with painted stripe
  b.rbox(0.84, 0.4, 0.22, 0.015, wood, 0, 0.05, 0.14);
  b.rbox(0.92, 0.035, 0.32, 0.012, laminate, 0, 0.45, 0.15);
  b.rbox(0.84, 0.07, 0.012, 0.004, roofP, 0, 0.2, 0.255);
  // back shelves with jars
  b.box(0.7, 0.025, 0.12, wood, 0, 0.55, -0.32);
  b.box(0.7, 0.025, 0.12, wood, 0, 0.78, -0.32);
  const cols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5'];
  for (let i = 0; i < 6; i++) {
    const jm = k.M(cols[i], { roughness: 0.4 });
    b.cyl(0.04, 0.04, 0.1, jm, -0.27 + i * 0.108, 0.575, -0.32, 8);
    b.cyl(0.035, 0.035, 0.09, jm, -0.27 + i * 0.108, 0.805, -0.32, 8);
  }
  // cash register
  b.rbox(0.11, 0.07, 0.1, 0.01, dark, 0.3, 0.485, 0.1);
  b.put(BOX(0.1, 0.07, 0.01), k.M('#9be7ff', { emissive: '#4cc9f0', emissiveIntensity: 0.4 }), 0.3, 0.57, 0.07, -0.35, 0, 0);
  // roof with trim
  b.rbox(1.0, 0.06, 0.94, 0.02, roofP, 0, 1.04, -0.02);
  b.rbox(0.94, 0.04, 0.88, 0.015, white, 0, 1.1, -0.02);
  // corner posts
  for (const x of [-0.43, 0.43]) b.rod([x, 0.46, 0.44], [x, 1.04, 0.44], 0.02, white, 6);
  // awning: alternating panels + scalloped edge
  const NP = 8, PW = 1.0 / NP, A = 0.4, L = 0.15;
  const sx = 0, sy = 1.03, sz = 0.3;
  const dy = -Math.sin(A), dz = Math.cos(A);
  for (let i = 0; i < NP; i++) {
    const m = i & 1 ? white : awnP;
    const x = -0.5 + PW * (i + 0.5);
    b.put(BOX(PW - 0.002, 0.016, L), m, x, sy + dy * L / 2, sz + dz * L / 2, A, 0, 0);
    b.put(CYL(PW / 2 - 0.001, PW / 2 - 0.001, 0.016, 8, false, -Math.PI / 2, Math.PI), m, x, sy + dy * L, sz + dz * L, A, 0, 0);
  }
  b.flush(g);

  // bulbs under the awning edge + along roof
  const warm = k.L('#fff0b0');
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push([-0.45 + i * 0.1, sy + dy * (L + 0.05) - 0.03, sz + dz * (L + 0.05) + 0.01]);
  g.add(bulbs(warm, pts, 0.022));
  g.add(bulbs(k.L('#ffd6a5'), [[-0.45, 1.13, 0.44], [0.45, 1.13, 0.44], [-0.45, 1.13, -0.46], [0.45, 1.13, -0.46]], 0.026));

  // roof sign board (stands behind the topper)
  const sg = new THREE.Group();
  const signM = k.sign(signTex(name, signCols[0], signCols[1]));
  const pl = new THREE.Mesh(plane(0.8, 0.24), signM);
  pl.position.z = 0.026;
  sg.add(mesh(RBOX(0.86, 0.3, 0.05, 0.02), dark), pl);
  sg.position.set(0, 1.4, -0.28);
  g.add(sg);
  const sgb = new Batch();
  for (const x of [-0.32, 0.32]) sgb.rod([x, 1.1, -0.28], [x, 1.25, -0.28], 0.015, steel, 5);
  sgb.flush(g);

  // side menu boards
  if (menu) {
    const mm = new THREE.MeshStandardMaterial({ map: menuTex(menu[0], menu[1]), roughness: 0.6 });
    const mp = new THREE.Mesh(plane(0.26, 0.32), mm);
    mp.position.set(0.432, 0.62, -0.1); mp.rotation.y = Math.PI / 2;
    const mp2 = mp.clone(); mp2.position.x = -0.432; mp2.rotation.y = -Math.PI / 2;
    g.add(mp, mp2);
  }
  topper(k, g, { white, steel, dark, wood });
  return done(k, g, () => {}, 1.95);
}

const topG = (g, y = 1.12, z = 0.12) => { const t = new THREE.Group(); t.position.set(0, y, z); g.add(t); return t; };

// ---------------------------------------------------------------- burger
export const burger = (c) => stand(c, 'BURGERS', ['#b23a48', '#fff1c1'], ['MENU', [['Burger', '$3'], ['Cheese', '$4'], ['Fries', '$2'], ['Shake', '$3']]], (k, g) => {
  const t = topG(g, 1.12, 0.1);
  const bun = k.lacquer('#e0902f', { roughness: 0.6 });
  const b = new Batch();
  b.put(SPH(0.17, 18, Math.PI / 2), bun, 0, 0.07, 0, Math.PI, 0, 0, 1, 0.55, 1);
  b.put(TORUS(0.165, 0.028, 5, 16), k.M('#5aa832'), 0, 0.085, 0, Math.PI / 2, 0, 0, 1, 1, 0.8);
  b.put(BOX(0.3, 0.012, 0.3), k.M('#ffcc33', { roughness: 0.4 }), 0, 0.105, 0, 0, Math.PI / 4, 0);
  b.cyl(0.16, 0.16, 0.055, k.M('#5a3220', { roughness: 0.85 }), 0, 0.11, 0, 16);
  b.cyl(0.15, 0.15, 0.025, k.M('#d7263d', { roughness: 0.5 }), 0, 0.165, 0, 16);
  b.put(SPH(0.18, 18, Math.PI / 2), bun, 0, 0.19, 0, 0, 0, 0, 1, 0.85, 1);
  const seed = k.M('#fff2d0');
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, r = 0.03 + (i % 4) * 0.035;
    const x = Math.sin(a) * r, z = Math.cos(a) * r, y = 0.19 + Math.sqrt(Math.max(0.0001, 0.18 * 0.18 - x * x - z * z)) * 0.85 - 0.005;
    b.sph(0.014, seed, x, y, z, 5, 1, 0.5, 1.4);
  }
  b.flush(t);
  // little flag on top
  t.add(mesh(CYL(0.006, 0.006, 0.12, 4), k.steel(), 0, 0.42, 0));
});

// ---------------------------------------------------------------- ice cream
export const icecream = (c) => stand(c, 'ICE CREAM', ['#f15bb5', '#ffffff'], ['FLAVOURS', [['Vanilla', '$2'], ['Berry', '$2'], ['Mint', '$2'], ['Choco', '$3']]], (k, g) => {
  const t = topG(g, 1.1, 0.1);
  const cone = new THREE.MeshStandardMaterial({ color: '#ffffff', map: waffleTex(), roughness: 0.8 });
  const b = new Batch();
  b.put(CYL(0.13, 0.01, 0.4, 14), cone, 0, 0.2, 0);
  b.put(TORUS(0.12, 0.022, 6, 18), k.M('#f6d29a'), 0, 0.4, 0, Math.PI / 2);
  const scoops = [['#ffafcc', 0.15, 0.5], ['#fff1e6', 0.125, 0.67], ['#a8e6cf', 0.1, 0.8]];
  for (const [c2, r, y] of scoops) {
    const m = k.lacquer(c2, { roughness: 0.55 });
    b.sph(r, m, 0, y, 0, 14, 1, 0.9, 1);
    b.put(TORUS(r * 0.95, r * 0.22, 5, 14), m, 0, y - r * 0.7, 0, Math.PI / 2);
  }
  b.sph(0.035, k.lacquer('#c1121f'), 0, 0.92, 0, 8);
  b.rod([0, 0.94, 0], [0.04, 1.0, 0.0], 0.005, k.M('#4a7c2f'), 3);
  const sprinkle = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.1, r = 0.12;
    b.put(BOX(0.025, 0.006, 0.008), k.M(sprinkle[i % 4]), Math.sin(a) * r * 0.9, 0.5 + (i % 3) * 0.03, Math.cos(a) * r * 0.9, 0.3, a, 0.2);
  }
  b.flush(t);
  t.rotation.y = 0.4; t.scale.setScalar(0.72);
});

// ---------------------------------------------------------------- drinks
export const drinks = (c) => stand(c, 'DRINKS', ['#0b7a75', '#ffffff'], ['COLD', [['Cola', '$2'], ['Lemon', '$2'], ['Juice', '$2'], ['Water', '$1']]], (k, g) => {
  const t = topG(g, 1.1, 0.1);
  const cup = new THREE.MeshStandardMaterial({ color: '#ffffff', map: stripeTex('#ffffff', '#e63946', 10), roughness: 0.45 });
  const white = k.lacquer('#ffffff');
  const straw = k.M('#ffd23f', { roughness: 0.4 });
  const b = new Batch();
  b.put(CYL(0.16, 0.115, 0.42, seg(20)), cup, 0, 0.21, 0);
  b.put(LATHE('cupLid', [[0, 0.42], [0.175, 0.42], [0.175, 0.45], [0.16, 0.47], [0.1, 0.5], [0, 0.52]], seg(20)), white);
  b.rod([0.02, 0.5, 0], [0.04, 0.68, 0], 0.016, straw, 5);
  b.rod([0.04, 0.68, 0], [0.12, 0.74, 0], 0.016, straw, 5);
  // lemon slice on the rim
  b.put(CYL(0.07, 0.07, 0.016, 14), k.M('#ffe066'), 0.15, 0.43, 0, 0, 0, 0.8);
  b.put(CYL(0.058, 0.058, 0.02, 14), k.M('#fff5b0'), 0.15, 0.43, 0, 0, 0, 0.8);
  b.flush(t);
  // second smaller cup
  const t2 = t.clone(); t2.scale.setScalar(0.55); t2.position.set(-0.34, 0.9, 0.22); t2.rotation.y = 1.2; t2.position.y = 0.5;
  g.add(t2);
});

// ---------------------------------------------------------------- gift shop
export const gift = (c) => stand(c, 'GIFTS', ['#3a0ca3', '#ffd23f'], ['SOUVENIRS', [['Plush', '$5'], ['Mug', '$4'], ['Hat', '$3'], ['Cards', '$1']]], (k, g) => {
  const t = topG(g, 1.1, 0.1);
  const ribbon = k.lacquer('#ffd23f', { roughness: 0.3 });
  const b = new Batch();
  const boxes = [['#4cc9f0', 0.34, 0.2, 0, 0, '#ffd23f'], ['#ef476f', 0.24, 0.17, 0.0, 0.2, '#ffffff'], ['#06d6a0', 0.17, 0.14, 0, 0.38, '#ffd23f']];
  let y = 0;
  for (const [col, w, h, , , rb] of boxes) {
    const m = k.lacquer(col, { roughness: 0.4 });
    b.rbox(w, h, w, 0.01, m, 0, y, 0);
    const rm = rb === '#ffd23f' ? ribbon : k.lacquer(rb);
    b.rbox(w + 0.006, h + 0.006, 0.04, 0.003, rm, 0, y - 0.003, 0);
    b.rbox(0.04, h + 0.006, w + 0.006, 0.003, rm, 0, y - 0.003, 0);
    y += h;
  }
  // bow
  b.put(TORUS(0.045, 0.012, 5, 12), ribbon, 0.05, y + 0.05, 0, 0, 0, 0.0, 1, 1.0, 1);
  b.put(TORUS(0.045, 0.012, 5, 12), ribbon, -0.05, y + 0.05, 0, 0, 0, 0.0);
  b.sph(0.02, ribbon, 0, y + 0.03, 0, 6);
  b.flush(t);
  // balloons on strings
  const bm = ['#ef476f', '#ffd23f', '#4cc9f0'];
  const bb = new Batch();
  bm.forEach((cc, i) => {
    const x = -0.28 + i * 0.28, yy = 0.55 + (i % 2) * 0.1;
    bb.sph(0.09, k.lacquer(cc, { roughness: 0.3 }), x, yy + 0.38, 0.0, 12, 1, 1.15, 1);
    bb.rod([x, 0.04, 0.0], [x * 0.2, yy + 0.28, 0], 0.003, k.M('#dddddd'), 3);
  });
  const tb = new THREE.Group(); tb.position.set(0, 1.1, 0.05);
  bb.flush(tb); tb.scale.setScalar(0.6); tb.position.set(0.05, 1.08, -0.1);
  g.add(tb);
});

// ---------------------------------------------------------------- restrooms
export function toilet(color) {
  const k = kit(color), g = new THREE.Group();
  const wall = k.M('#f3f4f6', { map: noiseTex('plaster', [2, 2], 235, 12), roughness: 0.85 });
  const stone = k.M('#9aa3b2', { map: noiseTex('stone', [2, 2]), roughness: 0.9 });
  const white = k.lacquer('#ffffff', { roughness: 0.5 });
  const steel = k.steel('#cfd5dc', 0.3);
  const dark = k.M('#2b2d42', { roughness: 0.5 });
  const roofP = k.P();
  const doorB = k.lacquer('#3a86ff'), doorP = k.lacquer('#ff5d8f');
  const b = new Batch();
  b.rbox(0.94, 0.05, 0.84, 0.02, stone, 0, 0, 0);
  b.box(0.82, 1.0, 0.7, wall, 0, 0.05, 0);
  // vertical ribs (panelling)
  for (let i = 0; i < 5; i++) b.box(0.025, 1.0, 0.012, white, -0.34 + i * 0.17, 0.05, 0.356);
  for (let i = 0; i < 4; i++) { b.box(0.012, 1.0, 0.025, white, 0.416, 0.05, -0.27 + i * 0.18); b.box(0.012, 1.0, 0.025, white, -0.416, 0.05, -0.27 + i * 0.18); }
  b.box(0.85, 0.06, 0.72, white, 0, 0.05, 0);
  // doors with louvres and handles
  for (const [x, m] of [[-0.19, doorB], [0.19, doorP]]) {
    b.rbox(0.27, 0.62, 0.025, 0.008, m, x, 0.05, 0.362);
    for (let j = 0; j < 4; j++) b.box(0.19, 0.012, 0.012, white, x, 0.12 + j * 0.035, 0.38);
    b.sph(0.016, steel, x + (x < 0 ? 0.09 : -0.09), 0.38, 0.385, 6);
    b.box(0.27, 0.03, 0.03, white, x, 0.67, 0.365);
  }
  // roof w/ overhang + gutter + vent
  b.rbox(1.0, 0.07, 0.92, 0.025, roofP, 0, 1.05, 0);
  b.put(CYL(0.012, 0.012, 0.98, 6), steel, 0, 1.065, 0.47, 0, 0, Math.PI / 2);
  b.cyl(0.05, 0.05, 0.1, steel, 0.25, 1.12, -0.2, 10);
  b.cyl(0.07, 0.07, 0.015, steel, 0.25, 1.22, -0.2, 10);
  b.flush(g);
  // glowing WC sign + gender plaques
  const wc = k.sign(signTex('WC', '#0077b6', '#ffffff'));
  const pl = new THREE.Mesh(plane(0.36, 0.14), wc);
  pl.position.set(0, 0.86, 0.372); g.add(pl);
  const pm = new THREE.Mesh(plane(0.12, 0.12), k.sign(signTex('M', '#3a86ff', '#ffffff'), false));
  pm.position.set(-0.19, 0.78, 0.376); g.add(pm);
  const pf = new THREE.Mesh(plane(0.12, 0.12), k.sign(signTex('W', '#ff5d8f', '#ffffff'), false));
  pf.position.set(0.19, 0.78, 0.376); g.add(pf);
  g.add(bulbs(k.L('#c8f7ff'), [[-0.46, 1.07, 0.47], [-0.23, 1.07, 0.47], [0, 1.07, 0.47], [0.23, 1.07, 0.47], [0.46, 1.07, 0.47]], 0.024));
  // a lamp over the doors
  g.add(mesh(CYL(0.04, 0.03, 0.04, 8), steel, 0, 0.96, 0.4));
  return done(k, g, () => {}, 1.3);
}

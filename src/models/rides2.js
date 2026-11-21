import * as THREE from 'three';
import { Batch, bulbs, ring, kit, done, mesh, seg, BOX, RBOX, CYL, SPH, TORUS, LATHE, geo } from './kit.js';
import { woodTex, noiseTex, signTex, diamondTex, checkTex, brushedTex } from './textures.js';
import { rand } from '../util.js';
import { isLow, isUltra } from '../quality.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- DROP TOWER
function seatModule(k, seatM, barM, dark, steel) {
  const b = new Batch();
  b.rbox(0.19, 0.045, 0.17, 0.02, seatM, 0, 0.0, 0.0);
  b.rbox(0.19, 0.24, 0.045, 0.02, seatM, 0, 0.02, -0.075);
  b.rbox(0.14, 0.07, 0.04, 0.02, seatM, 0, 0.22, -0.075); // headrest
  b.rbox(0.19, 0.03, 0.06, 0.012, dark, 0, -0.03, 0.09); // footrest
  // over-the-shoulder restraint (U-shape + lap bar)
  b.rod([-0.06, 0.26, -0.03], [-0.07, 0.07, 0.05], 0.014, barM, 5);
  b.rod([0.06, 0.26, -0.03], [0.07, 0.07, 0.05], 0.014, barM, 5);
  b.rod([-0.07, 0.07, 0.05], [0.07, 0.07, 0.05], 0.016, barM, 5);
  b.rod([-0.06, 0.26, -0.03], [0.06, 0.26, -0.03], 0.012, barM, 5);
  b.rod([-0.05, 0.0, -0.06], [-0.05, -0.05, 0.0], 0.008, steel, 4);
  const grp = new THREE.Group();
  b.flush(grp);
  return grp;
}

export function dropTower(color) {
  const k = kit(color), g = new THREE.Group();
  const white = k.steel('#f2f4f6', 0.4);
  const dark = k.M('#2b2d42', { roughness: 0.55 });
  const steel = k.steel('#c8ced6', 0.3, { map: brushedTex([1, 1]) });
  const plate = k.M('#9aa3b2', { map: diamondTex([3, 3]), roughness: 0.6, metalness: 0.2 });
  const legP = k.P();
  const capP = k.P();
  const H = 3.75, Y0 = 0.14, O = 0.17;

  const st = new Batch();
  // plinth with diamond plate top
  st.rbox(1.8, 0.14, 1.8, 0.03, k.M('#8d99ae', { map: noiseTex('stone', [3, 3]), roughness: 0.9 }), 0, 0, 0);
  st.box(1.6, 0.01, 1.6, plate, 0, 0.14, 0);
  // 4 main legs + lattice
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) st.cyl(0.04, 0.045, H, legP, sx * O, Y0, sz * O, 8);
  const bays = 8, bh = H / bays;
  for (let i = 0; i <= bays; i++) {
    const y = Y0 + i * bh;
    st.beam([-O, y, -O], [O, y, -O], 0.022, white); st.beam([-O, y, O], [O, y, O], 0.022, white);
    st.beam([-O, y, -O], [-O, y, O], 0.022, white); st.beam([O, y, -O], [O, y, O], 0.022, white);
    if (i < bays) {
      const y1 = y + bh, f = i & 1 ? 1 : -1;
      st.rod([-O, y, -O * f], [O, y1, -O * f], 0.01, white, 3);
      st.rod([-O, y, O * f], [O, y1, O * f], 0.01, white, 3);
      st.rod([-O * f, y, -O], [-O * f, y1, O], 0.01, white, 3);
      st.rod([O * f, y, -O], [O * f, y1, O], 0.01, white, 3);
    }
  }
  // guide rails on each face
  for (const [x, z] of [[0, -O - 0.04], [0, O + 0.04]]) st.beam([x, Y0, z], [x, Y0 + H, z], 0.025, steel);
  for (const [x, z] of [[-O - 0.04, 0], [O + 0.04, 0]]) st.beam([x, Y0, z], [x, Y0 + H, z], 0.025, steel);
  // crown
  const top = Y0 + H;
  st.rbox(0.56, 0.12, 0.56, 0.03, dark, 0, top, 0);
  st.put(LATHE('dtCap', [[0, top + 0.12], [0.3, top + 0.12], [0.3, top + 0.16], [0.22, top + 0.22], [0.12, top + 0.3], [0.05, top + 0.36], [0, top + 0.38]], seg(24)), capP);
  st.cyl(0.015, 0.015, 0.35, white, 0, top + 0.38, 0, 5);
  // fence + gates around the base
  for (const side of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      st.cyl(0.012, 0.012, 0.22, white, i * 0.22, 0.14, side * 0.82, 5);
      st.cyl(0.012, 0.012, 0.22, white, side * 0.82, 0.14, i * 0.22, 5);
    }
    st.rod([-0.66, 0.34, side * 0.82], [0.66, 0.34, side * 0.82], 0.012, white, 5);
    st.rod([side * 0.82, 0.34, -0.66], [side * 0.82, 0.34, 0.66], 0.012, white, 5);
  }
  st.flush(g);
  const beacon = k.L('#ff4d6d');
  g.add(mesh(SPH(0.07, 12), beacon, 0, top + 0.76, 0));
  const lights = k.L('#ffffff', '#dddddd');
  const lp = [];
  for (let y = 0.4; y < top; y += 0.2) for (const sx of [-1, 1]) for (const sz of [-1, 1]) lp.push([sx * (O + 0.045), y, sz * (O + 0.045)]);
  g.add(bulbs(lights, lp, 0.022, 5));
  g.add(bulbs(k.L('#ffd23f'), ring(16, 0.3, top + 0.125), 0.024));
  // sign
  const st2b = new Batch();
  const signM = k.sign(signTex('DROP TOWER', '#7b2cbf', '#ffffff'));
  const sp = new THREE.Mesh(geo('plane.9x.26', () => new THREE.PlaneGeometry(0.9, 0.26)), signM);
  sp.position.set(0, 0.0, 0.03);
  const sgn = new THREE.Group(); sgn.add(mesh(RBOX(0.96, 0.32, 0.05, 0.02), dark), sp);
  sgn.position.set(0, 0.7, 0.86);
  for (const x of [-0.4, 0.4]) st2b.rod([x, 0.14, 0.86], [x, 0.55, 0.86], 0.02, white);
  st2b.flush(g);
  g.add(sgn);

  // --- ride car: square collar around the tower + 8 outward-facing seats
  const car = new THREE.Group();
  const cb = new Batch();
  const colM = k.P('#ffd23f');
  cb.rbox(0.7, 0.28, 0.1, 0.03, dark, 0, 0, -0.29);
  cb.rbox(0.7, 0.28, 0.1, 0.03, dark, 0, 0, 0.29);
  cb.rbox(0.1, 0.28, 0.5, 0.03, dark, -0.29, 0, 0);
  cb.rbox(0.1, 0.28, 0.5, 0.03, dark, 0.29, 0, 0);
  cb.rbox(0.74, 0.04, 0.74, 0.015, colM, 0, 0.28, 0);
  cb.rbox(0.74, 0.04, 0.74, 0.015, colM, 0, -0.02, 0);
  cb.flush(car);
  const seatM = k.lacquer('#2d3142');
  const barM = k.lacquer('#ffd23f', { roughness: 0.35 });
  const seatProto = seatModule(k, seatM, barM, dark, steel);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    for (const off of [-0.15, 0.15]) {
      const s = seatProto.clone();
      const nx = Math.sin(a), nz = Math.cos(a);
      s.position.set(nx * 0.4 + nz * off, 0.02, nz * 0.4 - nx * off);
      s.rotation.y = a;
      car.add(s);
    }
  }
  car.position.y = 0.2;
  g.add(car);
  let y = 0;
  const profile = (t) => {
    const c = t % 6;
    if (c < 3) { const u = c / 3; return u * u * (3 - 2 * u) * 3.0; }
    if (c < 3.7) return 3.0;
    if (c < 4.3) { const u = (c - 3.7) / 0.6; return 3.0 * (1 - u * u); }
    if (c < 4.8) return Math.abs(Math.sin((c - 4.3) * 6)) * 0.15;
    return 0;
  };
  return done(k, g, (dt, s) => {
    const goal = s.running ? profile(s.t) : 0;
    y += (goal - y) * Math.min(1, dt * (s.running ? 18 : 2));
    car.position.y = 0.2 + y;
    beacon.emissiveIntensity = 0.3 + (Math.sin(s.t * 8) > 0 ? 1.2 : 0) * s.speed;
  }, 4.8);
}

// ---------------------------------------------------------------- BUMPER CARS
function carModel(k, bodyMat, accent) {
  const b = new Batch();
  k.glassC ??= k.glass('#cdeeff', 0.45);
  const rubber = k.M('#16181d', { roughness: 0.9 });
  const seatM = k.M('#2b2d42', { roughness: 0.7 });
  const chrome = k.steel('#e5e9ee', 0.2);
  const skin = k.M('#f1c27d', { roughness: 0.8 });
  // chassis + rubber bumper ring
  b.rbox(0.42, 0.05, 0.5, 0.02, rubber, 0, 0.02, 0);
  b.rbox(0.36, 0.1, 0.44, 0.04, bodyMat, 0, 0.07, 0);
  // hood and cabin
  b.rbox(0.3, 0.06, 0.16, 0.02, bodyMat, 0, 0.15, 0.14);
  b.rbox(0.28, 0.1, 0.18, 0.03, bodyMat, 0, 0.15, -0.1);
  b.put(BOX(0.26, 0.002, 0.12), accent, 0, 0.215, 0.14);
  // windshield
  b.put(BOX(0.26, 0.09, 0.012), k.glassC, 0, 0.28, 0.0, -0.4, 0, 0);
  // seat + driver head + steering wheel
  b.rbox(0.16, 0.06, 0.04, 0.015, seatM, 0, 0.22, -0.17);
  b.sph(0.038, skin, 0, 0.31, -0.1, 8);
  b.put(TORUS(0.035, 0.006, 4, 10), chrome, 0, 0.27, 0.0, 0.9, 0, 0);
  // pole
  b.rod([0, 0.22, -0.16], [0, 1.5, -0.16], 0.011, chrome, 5);
  b.sph(0.02, chrome, 0, 1.52, -0.16, 6);
  // lights
  k.lampW ??= k.L('#fff6c8'); k.lampR ??= k.L('#ff4d4d');
  b.sph(0.026, k.lampW, 0.11, 0.12, 0.225, 6); b.sph(0.026, k.lampW, -0.11, 0.12, 0.225, 6);
  b.sph(0.02, k.lampR, 0.11, 0.12, -0.225, 6); b.sph(0.02, k.lampR, -0.11, 0.12, -0.225, 6);
  const grp = new THREE.Group();
  b.flush(grp);
  return grp;
}

export function bumperCars(color) {
  const k = kit(color), g = new THREE.Group();
  const steel = k.steel('#ced4da', 0.3, { map: brushedTex([1, 3]) });
  const dark = k.M('#2b2d42', { roughness: 0.6 });
  const floorM = k.lacquer('#ffffff', { map: checkTex(10, '#51557a', '#2a2c47'), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.15 });
  const wallP = k.P();
  const rubber = k.M('#15171c', { roughness: 0.9 });

  const st = new Batch();
  st.box(2.9, 0.1, 2.9, floorM, 0, 0, 0);
  // low walls with rubber top rail
  for (const z of [-1.35, 1.35]) { st.rbox(2.9, 0.22, 0.1, 0.03, wallP, 0, 0.1, z); st.rbox(2.9, 0.05, 0.14, 0.02, rubber, 0, 0.32, z); }
  for (const x of [-1.35, 1.35]) { st.rbox(0.1, 0.22, 2.7, 0.03, wallP, x, 0.1, 0); st.rbox(0.14, 0.05, 2.7, 0.02, rubber, x, 0.32, 0); }
  // support posts (corners + mid) and ceiling grid
  const posts = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35], [0, -1.35], [0, 1.35], [-1.35, 0], [1.35, 0]];
  for (const [x, z] of posts) { st.cyl(0.045, 0.05, 1.5, steel, x, 0.1, z, 8); st.cyl(0.07, 0.07, 0.04, dark, x, 0.1, z, 8); }
  const CY = 1.62;
  for (const z of [-1.35, 1.35]) st.rbox(2.9, 0.08, 0.08, 0.02, wallP, 0, CY - 0.02, z);
  for (const x of [-1.35, 1.35]) st.rbox(0.08, 0.08, 2.9, 0.02, wallP, x, CY - 0.02, 0);
  const grid = [-0.9, -0.45, 0, 0.45, 0.9];
  for (const v of grid) { st.beam([-1.35, CY, v], [1.35, CY, v], 0.018, steel); st.beam([v, CY, -1.35], [v, CY, 1.35], 0.018, steel); }
  st.flush(g);
  // entrance gate rails at the front
  const gb = new Batch();
  gb.rod([-0.3, 0.45, 1.35], [-0.3, 0.1, 1.35], 0.012, steel, 5);
  gb.rod([0.3, 0.45, 1.35], [0.3, 0.1, 1.35], 0.012, steel, 5);
  gb.flush(g);
  // sign above the front beam
  const sg = new THREE.Group();
  const sM = k.sign(signTex('BUMPER CARS', '#d00000', '#ffe066', '#ffffff'));
  const pl = new THREE.Mesh(geo('plane1.5x.4', () => new THREE.PlaneGeometry(1.5, 0.4)), sM);
  pl.position.z = 0.036;
  sg.add(mesh(RBOX(1.58, 0.46, 0.06, 0.03), dark), pl);
  sg.position.set(0, 1.95, 1.36);
  g.add(sg);
  const sgb = new Batch();
  for (const x of [-0.65, 0.65]) sgb.rod([x, 1.66, 1.36], [x, 1.78, 1.36], 0.025, steel, 5);
  sgb.flush(g);
  // light strings: perimeter + hanging lamps on grid nodes
  const bulb = k.L('#ffe066');
  const per = [];
  for (let i = 0; i <= 14; i++) {
    const u = -1.4 + (i * 2.8) / 14;
    per.push([u, CY - 0.07, 1.4], [u, CY - 0.07, -1.4], [1.4, CY - 0.07, u], [-1.4, CY - 0.07, u]);
  }
  g.add(bulbs(bulb, per, 0.03));
  const nodes = [];
  for (const x of [-0.9, 0, 0.9]) for (const z of [-0.9, 0, 0.9]) nodes.push([x, CY - 0.06, z]);
  g.add(bulbs(k.L('#c8f7ff'), nodes, 0.04, 6));
  const stars = [];
  for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) stars.push([x, CY - 0.05, z]);
  g.add(bulbs(k.L('#ff9ecb'), stars, 0.035, 6));

  // cars
  const carCols = ['#ef476f', '#06d6a0', '#118ab2', '#ffd166', '#9b5de5', '#f78c6b'];
  const cars = [];
  for (let i = 0; i < 6; i++) {
    const bodyMat = i < 2 ? k.P(undefined, { clearcoat: 1 }) : k.lacquer(carCols[i]);
    const c = carModel(k, bodyMat, k.M('#ffffff'));
    const st2 = { x: rand(-0.9, 0.9), z: rand(-0.9, 0.9), a: rand(0, 6.28), turn: rand(-1, 1) };
    c.position.set(st2.x, 0.1, st2.z);
    g.add(c);
    cars.push([c, st2]);
  }
  return done(k, g, (dt, s) => {
    for (const [c, st2] of cars) {
      if (Math.random() < dt * 0.8) st2.turn = rand(-2.5, 2.5);
      st2.a += st2.turn * dt * s.speed;
      st2.x += Math.sin(st2.a) * dt * 1.1 * s.speed;
      st2.z += Math.cos(st2.a) * dt * 1.1 * s.speed;
      if (Math.abs(st2.x) > 1.05) { st2.x = Math.sign(st2.x) * 1.05; st2.a = -st2.a; }
      if (Math.abs(st2.z) > 1.05) { st2.z = Math.sign(st2.z) * 1.05; st2.a = Math.PI - st2.a; }
      c.position.set(st2.x, 0.1, st2.z);
      c.rotation.y = st2.a;
    }
  }, 2.2);
}

// ---------------------------------------------------------------- WAVE SWINGER
function swingChair(k, seatM, accentM, chain) {
  const b = new Batch();
  const L = 0.78;
  // two chains made of short links + hanger plate
  for (const z of [-0.05, 0.05]) {
    for (let i = 0; i < 13; i++) {
      const y0 = -i * (L / 13), y1 = -(i + 0.7) * (L / 13);
      b.rod([0, y0, z], [0, y1, z], i & 1 ? 0.007 : 0.01, chain, 4);
    }
    b.rod([0, -L, z], [0.0, -L - 0.02, z], 0.012, chain, 4);
  }
  b.rbox(0.18, 0.035, 0.16, 0.015, seatM, -0.02, -L - 0.07, 0);
  b.rbox(0.03, 0.17, 0.16, 0.012, seatM, -0.1, -L - 0.04, 0);
  b.rbox(0.06, 0.03, 0.16, 0.012, accentM, 0.06, -L - 0.12, 0);
  b.rod([0.1, -L - 0.03, -0.06], [0.1, -L - 0.04, 0.06], 0.012, chain, 4);
  b.rod([0, -L - 0.03, -0.06], [0.1, -L + 0.01, -0.06], 0.008, chain, 4);
  b.rod([0, -L - 0.03, 0.06], [0.1, -L + 0.01, 0.06], 0.008, chain, 4);
  const grp = new THREE.Group();
  b.flush(grp);
  return grp;
}

export function swingRide(color) {
  const k = kit(color), g = new THREE.Group();
  const stone = k.M('#8d99ae', { map: noiseTex('stone', [3, 3]), roughness: 0.9 });
  const white = k.steel('#eef0f3', 0.4);
  const chain = k.steel('#b8c0c8', 0.35);
  const gold = k.steel('#ffd166', 0.3);
  const colP = k.P();
  const topP = k.P(), topP2 = k.P();

  const st = new Batch();
  st.put(LATHE('swBase', [[0, 0], [0.96, 0], [0.96, 0.08], [0.9, 0.12], [0, 0.12]], seg(32)), stone);
  // tower column: stacked lathe rings
  st.put(LATHE('swCol', [[0.0, 0.12], [0.26, 0.12], [0.24, 0.2], [0.17, 0.3], [0.13, 0.6], [0.12, 1.2], [0.13, 1.75], [0.18, 1.83], [0.0, 1.83]], seg(20)), white);
  for (const y of [0.35, 0.8, 1.25]) st.put(LATHE('swBand' + y, [[0.12, y], [0.2, y], [0.2, y + 0.07], [0.12, y + 0.07]], seg(20)), colP);
  // low fence
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    st.cyl(0.012, 0.012, 0.22, white, Math.sin(a) * 0.92, 0.12, Math.cos(a) * 0.92, 5);
  }
  st.put(TORUS(0.92, 0.01, 4, seg(40)), white, 0, 0.34, 0, Math.PI / 2);
  st.flush(g);

  const top = new THREE.Group();
  top.position.y = 1.9;
  g.add(top);
  const tb = new Batch();
  const R = 0.88;
  // rotating crown: hub, spokes, ring, umbrella
  tb.cyl(0.2, 0.2, 0.1, gold, 0, 0, 0, 16);
  tb.put(LATHE('swDisc', [[0, 0.0], [R, -0.02], [R + 0.04, 0.0], [R + 0.04, 0.07], [R, 0.09], [0, 0.09]], seg(36)), topP);
  tb.put(LATHE('swUmb', [[R, 0.09], [0.8, 0.16], [0.5, 0.34], [0.22, 0.5], [0.08, 0.58], [0, 0.6]], seg(36)), topP2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    tb.rod([Math.sin(a) * R, 0.1, Math.cos(a) * R], [Math.sin(a) * 0.08, 0.6, Math.cos(a) * 0.08], 0.01, gold);
    // under-disc scallop trim
    tb.sph(0.07, i & 1 ? gold : white, Math.sin(a + 0.26) * (R + 0.02), -0.02, Math.cos(a + 0.26) * (R + 0.02), 6, 1, 0.5, 1);
  }
  tb.put(LATHE('swFin', [[0, 0.58], [0.06, 0.58], [0.03, 0.7], [0, 0.78]], 8), gold);
  tb.sph(0.05, gold, 0, 0.8, 0, 8);
  // hanger brackets
  const NS = 12, RP = 0.58;
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * TAU;
    tb.rod([Math.sin(a) * (RP - 0.1), 0, Math.cos(a) * (RP - 0.1)], [Math.sin(a) * RP, -0.06, Math.cos(a) * RP], 0.014, white);
    tb.sph(0.025, gold, Math.sin(a) * RP, -0.06, Math.cos(a) * RP, 6);
  }
  tb.flush(top);
  const bulbA = k.L('#c8f7ff'), bulbB = k.L('#ffe9a8');
  top.add(bulbs(bulbA, ring(24, R + 0.05, 0.04), 0.03));
  top.add(bulbs(bulbB, ring(12, 0.55, 0.26 + 0.03), 0.025));
  top.add(bulbs(bulbB, ring(12, 0.8, -0.06), 0.022, 5));
  top.add(mesh(SPH(0.04, 8), k.L('#ffffff'), 0, 0.82, 0));

  // swings
  const seatM = k.lacquer('#ffd23f');
  const accent = k.P();
  const proto = swingChair(k, seatM, accent, chain);
  const hangs = [];
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * TAU;
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * RP, -0.06, Math.cos(a) * RP);
    pivot.rotation.y = a;
    const hang = proto.clone();
    pivot.add(hang);
    top.add(pivot);
    hangs.push(hang);
  }
  return done(k, g, (dt, s) => {
    top.rotation.y += dt * s.speed * 2.4;
    for (const h of hangs) h.rotation.x = -0.6 * s.speed;
  }, 2.75);
}

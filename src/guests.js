import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, GATE, STAFF } from './constants.js';
import { G, emit, spend, hourOf } from './state.js';
import { scene } from './scene.js';
import { findPath, randomWalkableNear, gateTiles, walkable } from './path.js';
import { entranceTiles, stats, fairPrice, isRide, center } from './entities.js';
import { rand, pick, clamp } from './util.js';

// ---------- figures ----------
// Low-poly people: <= 6 meshes (torso, legs, arms, head, hair, hat), shared geometries and materials.
const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b', '#f15bb5', '#00bbf9', '#fee440', '#ffffff'];
const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const PANTS = ['#2b3a67', '#3d405b', '#5f6c7b', '#6b4f3a', '#1d3557', '#8d99ae', '#4a5240', '#7a306c'];
const HAIR = ['#2b1b12', '#5a3825', '#a0522d', '#d9a441', '#e8d8a8', '#1a1a1a', '#b5442b', '#6c6c6c'];
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const shirtMats = SHIRTS.map((c) => std(c));
const skinMats = SKIN.map((c) => std(c));
const pantMats = PANTS.map((c) => std(c));
const hairMats = HAIR.map((c) => std(c, { roughness: 0.9 }));
const shoeMat = std('#2a2a2e');
const balloonGeo = new THREE.SphereGeometry(0.075, 10, 8);
balloonGeo.scale(1, 1.18, 1);
const balloonStringGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.32, 3);
const balloonKnotGeo = new THREE.ConeGeometry(0.014, 0.025, 5).rotateX(Math.PI);
const stringMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8' });

const torsoGeo = new THREE.CapsuleGeometry(0.062, 0.1, 3, 8);
torsoGeo.scale(1.12, 1, 0.8);
const headGeo = new THREE.SphereGeometry(0.056, 10, 8);
// merged left+right limbs
function pair(make) {
  const a = make(1), b = make(-1);
  return mergeGeometries([a, b]);
}
const legsGeo = pair((s) => {
  const leg = new THREE.CylinderGeometry(0.028, 0.024, 0.15, 6);
  leg.translate(s * 0.036, 0.075, 0);
  const shoe = new THREE.BoxGeometry(0.05, 0.03, 0.09);
  shoe.translate(s * 0.036, 0.015, 0.012);
  return mergeGeometries([leg.toNonIndexed(), shoe.toNonIndexed()]);
});
const armsGeo = pair((s) => {
  const arm = new THREE.CapsuleGeometry(0.02, 0.09, 2, 6);
  arm.rotateZ(s * 0.18);
  arm.translate(s * 0.095, 0.205, 0);
  return arm.toNonIndexed();
});
// hair styles share a few merged geometries
const cap = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58);
const hairShort = cap.clone().translate(0, 0.335, -0.004);
const hairLong = mergeGeometries([cap.clone().translate(0, 0.335, -0.004).toNonIndexed(), (() => { const b = new THREE.CapsuleGeometry(0.05, 0.07, 2, 6); b.scale(1.1, 1, 0.7); b.translate(0, 0.3, -0.04); return b.toNonIndexed(); })()]);
const hairBun = mergeGeometries([cap.clone().translate(0, 0.335, -0.004).toNonIndexed(), new THREE.SphereGeometry(0.03, 6, 5).translate(0, 0.395, -0.03).toNonIndexed()]);
const hairStyles = [hairShort, hairShort, hairLong, hairBun, null];
const hatDome = mergeGeometries([
  new THREE.SphereGeometry(0.064, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 0.345, 0).toNonIndexed(),
  new THREE.CylinderGeometry(0.075, 0.075, 0.01, 12).translate(0, 0.348, 0.02).toNonIndexed(),
]);
const hatMats = new Map();
const hatMat = (c) => { let m = hatMats.get(c); if (!m) hatMats.set(c, (m = std(c, { roughness: 0.5 }))); return m; };

function figure(shirt, hatColor) {
  const g = new THREE.Group();
  const add = (geo, mat, y = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const skin = pick(skinMats);
  add(legsGeo, pick(pantMats));
  add(torsoGeo, shirt, 0.215);
  add(armsGeo, skin);
  add(headGeo, skin, 0.335);
  if (hatColor) add(hatDome, hatMat(hatColor));
  else {
    const hs = pick(hairStyles);
    if (hs) add(hs, pick(hairMats));
  }
  g.scale.setScalar(1.3);
  scene.add(g);
  return g;
}

// ---------- shared movement ----------
const tileOf = (a) => Math.floor(a.z) * N + Math.floor(a.x);
function setPath(a, path) {
  a.path = path;
  a.state = 'walk';
}
// returns true when the path is finished
function walk(a, sdt, speed) {
  if (!a.path.length) return true;
  const ti = a.path[0];
  if (!G.walk[ti]) return null; // blocked by new construction -> caller replans
  const tx = (ti % N) + 0.5 + a.ox, tz = ((ti / N) | 0) + 0.5 + a.oz;
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  const step = speed * sdt * (G.waterLevel > 0.02 ? 0.5 : 1);
  if (d <= step) { a.x = tx; a.z = tz; a.path.shift(); }
  else { a.x += (dx / d) * step; a.z += (dz / d) * step; }
  if (d > 1e-3) a.mesh.rotation.y = Math.atan2(dx, dz);
  a.walkT = (a.walkT || 0) + sdt;
  return a.path.length === 0;
}
function syncMesh(a) {
  const wet = G.waterLevel > 0.02 ? Math.min(0.25, G.waterLevel) * 0.4 : 0;
  a.mesh.position.set(a.x, Math.abs(Math.sin((a.walkT || 0) * 9)) * (a.state === 'walk' ? 0.05 : 0) - wet, a.z);
}
function pathToEntity(a, e) {
  const goals = new Set(entranceTiles(e));
  if (!goals.size) return null;
  return findPath(Math.floor(a.x), Math.floor(a.z), (i) => goals.has(i));
}
function wanderPath(a, r = 6) {
  const t = randomWalkableNear(a.x, a.z, r);
  if (t < 0) return null;
  return findPath(Math.floor(a.x), Math.floor(a.z), (i) => i === t);
}

// ---------- guests ----------
let spawnAcc = 0;
let ratingT = 0;

function spawnGuest() {
  const gx = GATE.x + Math.floor(Math.random() * GATE.w);
  const g = {
    mesh: figure(pick(shirtMats)),
    x: gx + 0.5, z: GATE.z + 0.5,
    ox: rand(-0.25, 0.25), oz: rand(-0.25, 0.25),
    path: [], state: 'idle', wait: rand(0.2, 1), goal: null,
    wallet: Math.round(rand(25, 80)),
    hunger: rand(0, 0.4), thirst: rand(0, 0.4), bladder: rand(0, 0.3),
    happy: rand(60, 80), thrill: Math.random(), stay: rand(150, 330),
    ridden: {}, litterT: -1, leaving: false,
  };
  g.mesh.scale.setScalar(0.01);
  G.guests.push(g);
}

function despawn(g) {
  scene.remove(g.mesh);
  const i = G.guests.indexOf(g);
  if (i >= 0) G.guests.splice(i, 1);
}

function goTo(g, e) {
  const path = pathToEntity(g, e);
  if (!path) return false;
  g.goal = { type: 'ent', id: e.id };
  setPath(g, path);
  return true;
}
function leave(g) {
  g.leaving = true;
  const goals = new Set(gateTiles());
  const path = findPath(Math.floor(g.x), Math.floor(g.z), (i) => goals.has(i));
  if (!path) return despawn(g);
  g.goal = { type: 'gate' };
  setPath(g, path);
}
function wander(g) {
  const path = wanderPath(g);
  if (path) { g.goal = { type: 'tile' }; setPath(g, path); }
  else { g.state = 'idle'; g.wait = rand(1, 3); }
}
function open(e) {
  return e.hp > 0 && e.queue.length < stats(e).cap * 2 + 6;
}
function nearest(g, filter) {
  return [...G.entities.values()]
    .filter((e) => e.kind === 'shop' && filter(e) && open(e) && e.price <= g.wallet)
    .sort((a, b) => dist(g, a) - dist(g, b));
}
const dist = (g, e) => { const c = center(e); return Math.hypot(c.x - g.x, c.z - g.z); };

function chooseRide(g) {
  const cands = [];
  let tooPricey = false;
  for (const e of G.entities.values()) {
    if (!isRide(e) || !open(e)) continue;
    if (e.price > g.wallet) continue;
    if (e.price > fairPrice(e)) { tooPricey = true; continue; }
    const ex = stats(e).exc;
    const match = 1.6 - Math.abs(ex / 10 - g.thrill);
    const w = ((ex + 1) * match) / (1 + (g.ridden[e.id] || 0) * 1.5) / (1 + dist(g, e) * 0.03);
    cands.push([e, w]);
  }
  if (!cands.length && tooPricey) { g.happy -= 4; g.thought = 'too expensive'; }
  const out = [];
  while (cands.length && out.length < 3) {
    const total = cands.reduce((s, c) => s + c[1], 0);
    let r = Math.random() * total;
    const i = cands.findIndex((c) => (r -= c[1]) <= 0);
    out.push(cands.splice(Math.max(0, i), 1)[0][0]);
  }
  return out;
}

function decide(g) {
  if (g.stay <= 0 || g.happy < 12 || g.wallet < 1) return leave(g);
  const needs = [];
  if (g.bladder > 0.7) needs.push((e) => e.def.need === 'bladder');
  if (g.thirst > 0.65) needs.push((e) => e.def.need === 'thirst');
  if (g.hunger > 0.65) needs.push((e) => e.def.need === 'hunger' || e.def.need === 'treat');
  for (const f of needs) for (const e of nearest(g, f).slice(0, 3)) if (goTo(g, e)) return;
  const r = Math.random();
  if (r < 0.68) { for (const e of chooseRide(g)) if (goTo(g, e)) return; }
  else if (r < 0.8 && g.wallet > 6) {
    for (const e of nearest(g, (e) => e.def.need === 'gift' || e.def.need === 'treat').slice(0, 2)) if (goTo(g, e)) return;
  }
  wander(g);
}

function arrive(g) {
  const goal = g.goal;
  g.goal = null;
  if (goal?.type === 'gate') return despawn(g);
  if (goal?.type === 'ent') {
    const e = G.entities.get(goal.id);
    if (!e || !open(e)) { g.happy -= 4; g.state = 'idle'; g.wait = rand(0.5, 1.5); return; }
    e.queue.push(g);
    g.state = 'queue';
    g.queueAt = e.id;
    g.patience = rand(45, 90);
    return;
  }
  g.state = 'idle';
  g.wait = rand(1, 4);
}

function replan(g) {
  const goal = g.goal;
  if (goal?.type === 'gate') return leave(g);
  if (goal?.type === 'ent') {
    const e = G.entities.get(goal.id);
    if (e && goTo(g, e)) return;
  }
  g.state = 'idle';
  g.wait = 0.3;
}

// called by facilities when a guest is done (or kicked out)
export function releaseGuest(g, e, done, scared = false) {
  g.mesh.visible = true;
  if (g.state === 'ride') {
    const ents = entranceTiles(e);
    const i = ents.length ? pick(ents) : tileOf(g);
    g.x = (i % N) + 0.5 + g.ox;
    g.z = ((i / N) | 0) + 0.5 + g.oz;
  }
  if (done) {
    if (e.kind === 'shop') {
      const need = e.def.need;
      if (need === 'hunger') g.hunger = Math.max(0, g.hunger - 0.8);
      if (need === 'treat') { g.hunger = Math.max(0, g.hunger - 0.3); g.happy += 8; }
      if (need === 'thirst') g.thirst = 0;
      if (need === 'bladder') g.bladder = 0;
      if (need === 'gift') { g.happy += 15; addBalloon(g); }
      if (Math.random() < (e.def.litter || 0)) g.litterT = rand(3, 14);
    } else {
      const ex = stats(e).exc;
      g.happy += 6 + ex * 2.2;
      g.ridden[e.id] = (g.ridden[e.id] || 0) + 1;
      g.thirst += 0.06;
      g.bladder += 0.05;
    }
  } else g.happy -= 3;
  if (scared) g.happy -= 15;
  g.happy = clamp(g.happy, 0, 100);
  g.queueAt = null;
  g.state = 'idle';
  g.wait = rand(0.4, 1.5);
  g.path = [];
}

function addBalloon(g) {
  if (g.balloon) return;
  const b = new THREE.Mesh(balloonGeo, new THREE.MeshStandardMaterial({ color: pick(SHIRTS), roughness: 0.25, metalness: 0.1 }));
  b.position.set(0.12, 0.72, 0);
  b.castShadow = true;
  const str = new THREE.Mesh(balloonStringGeo, stringMat);
  str.position.set(-0.03, -0.2, 0);
  b.add(str);
  const knot = new THREE.Mesh(balloonKnotGeo, b.material);
  knot.position.y = -0.09;
  b.add(knot);
  g.mesh.add(b);
  g.balloon = b;
}

export function updateGuests(dt, sdt) {
  // ---- spawning ----
  let rides = 0, shops = 0;
  for (const e of G.entities.values()) {
    if (isRide(e) && e.hp > 0) rides++;
    if (e.kind === 'shop') shops++;
  }
  const hour = hourOf();
  const night = hour < 7 || hour > 21;
  const maxGuests = Math.min(170, 12 + rides * 12 + shops * 3);
  if (rides > 0 && G.guests.length < maxGuests) {
    spawnAcc += sdt * (0.12 + rides * 0.05) * (0.4 + G.rating / 100) * (night ? 0.3 : 1);
    while (spawnAcc >= 1) { spawnAcc -= 1; spawnGuest(); }
  }

  const flooded = G.waterLevel > 0.02;
  for (let k = G.guests.length - 1; k >= 0; k--) {
    const g = G.guests[k];
    if (g.mesh.scale.x < 1.3) g.mesh.scale.setScalar(Math.min(1.3, g.mesh.scale.x + dt * 3));
    if (g.state === 'ride') continue;
    g.hunger += sdt * 0.005;
    g.thirst += sdt * 0.007;
    g.bladder += sdt * 0.004;
    g.stay -= sdt;
    let dh = 0;
    if (g.hunger > 0.9 || g.thirst > 0.9) dh -= 1.2;
    if (g.bladder > 0.95) dh -= 2;
    if (flooded) dh -= 2;
    const ti = tileOf(g);
    if (G.beauty && G.beauty[ti]) dh += Math.min(0.8, G.beauty[ti] * 0.25);
    for (const l of G.litter) if (Math.abs(l.x - g.x) < 2 && Math.abs(l.z - g.z) < 2) dh -= 0.25;
    g.happy = clamp(g.happy + dh * sdt, 0, 100);

    if (g.litterT > 0) {
      g.litterT -= sdt;
      if (g.litterT <= 0) { g.litterT = -1; if (walkable(Math.floor(g.x), Math.floor(g.z))) dropLitter(g.x, g.z); }
    }

    switch (g.state) {
      case 'idle':
        g.wait -= sdt;
        if (g.wait <= 0) decide(g);
        break;
      case 'walk': {
        const r = walk(g, sdt, g.leaving ? 1.5 : 1.2);
        if (r === null) replan(g);
        else if (r) arrive(g);
        break;
      }
      case 'queue':
        g.patience -= sdt;
        if (g.patience <= 0) {
          const e = G.entities.get(g.queueAt);
          if (e) { const i = e.queue.indexOf(g); if (i >= 0) e.queue.splice(i, 1); }
          g.happy -= 10;
          g.thought = 'queue too long';
          g.queueAt = null;
          g.state = 'idle';
          g.wait = 1;
        }
        break;
    }
    if (G.guests[k] === g) syncMesh(g);
  }

  // ---- park rating (once a second) ----
  ratingT -= sdt;
  if (ratingT <= 0) {
    ratingT = 1;
    const avg = G.guests.length ? G.guests.reduce((s, g) => s + g.happy, 0) / G.guests.length : 60;
    let wrecked = 0;
    const needs = new Set();
    for (const e of G.entities.values()) {
      if (e.hp <= 0 && e.kind !== 'scenery') wrecked++;
      if (e.kind === 'shop') needs.add(e.def.need);
    }
    const target = clamp(
      18 + avg * 0.45 + Math.min(20, rides * 3) +
      (needs.has('hunger') ? 4 : 0) + (needs.has('thirst') ? 4 : 0) + (needs.has('bladder') ? 6 : 0) -
      G.litter.length * 0.6 - wrecked * 6, 0, 100);
    G.rating += (target - G.rating) * 0.15;
    G.avgHappy = avg;
  }
}

// ---------- litter ----------
// litter: crumpled wrapper, flattened cup, napkin
const litterGeos = [
  new THREE.IcosahedronGeometry(0.05, 0).scale(1.2, 0.7, 1),
  new THREE.CylinderGeometry(0.04, 0.03, 0.07, 8).rotateZ(1.4),
  new THREE.BoxGeometry(0.12, 0.012, 0.09),
];
const litterMats = ['#ffffff', '#ef233c', '#ffd166', '#4cc9f0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true }));
export function dropLitter(x, z) {
  if (G.litter.length >= 60) return;
  const m = new THREE.Mesh(pick(litterGeos), pick(litterMats));
  m.castShadow = true;
  m.position.set(x, 0.03, z);
  m.rotation.y = Math.random() * 6;
  m.scale.setScalar(1.6);
  const l = { x, z, mesh: m };
  m.userData.litter = l;
  scene.add(m);
  G.litter.push(l);
}
export function removeLitter(l) {
  const i = G.litter.indexOf(l);
  if (i < 0) return false;
  G.litter.splice(i, 1);
  scene.remove(l.mesh);
  return true;
}

// ---------- staff ----------
export function spawnStaff(kind) {
  const def = STAFF[kind];
  const s = {
    kind, mesh: figure(new THREE.MeshStandardMaterial({ color: def.color }), kind === 'mechanic' ? '#ffd23f' : '#ffffff'),
    x: GATE.x + 0.5, z: GATE.z - 0.5, ox: rand(-0.15, 0.15), oz: rand(-0.15, 0.15),
    path: [], state: 'idle', wait: 0.5, task: null,
  };
  G.staff.push(s);
  return s;
}
export function hireStaff(kind) {
  if (!spend(STAFF[kind].hire)) return false;
  spawnStaff(kind);
  emit('staff');
  return true;
}
export function fireStaff(kind) {
  for (let i = G.staff.length - 1; i >= 0; i--)
    if (G.staff[i].kind === kind) {
      scene.remove(G.staff[i].mesh);
      G.staff.splice(i, 1);
      emit('staff');
      return true;
    }
  return false;
}

function claimed(kind, obj, self) {
  return G.staff.some((s) => s !== self && s.kind === kind && s.task === obj);
}
function findJob(s) {
  if (s.kind === 'mechanic') {
    const jobs = [...G.entities.values()]
      .filter((e) => e.kind !== 'scenery' && e.hp < 85 && !claimed('mechanic', e, s))
      .sort((a, b) => a.hp - b.hp || dist(s, a) - dist(s, b));
    for (const e of jobs.slice(0, 3)) {
      const p = pathToEntity(s, e);
      if (p) { s.task = e; setPath(s, p); return true; }
    }
  } else {
    const jobs = G.litter.filter((l) => !claimed('janitor', l, s)).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
    for (const l of jobs.slice(0, 3)) {
      const lx = Math.floor(l.x), lz = Math.floor(l.z);
      const p = findPath(Math.floor(s.x), Math.floor(s.z), (i) => Math.abs((i % N) - lx) <= 1 && Math.abs(((i / N) | 0) - lz) <= 1);
      if (p) { s.task = l; setPath(s, p); return true; }
    }
  }
  return false;
}

export function updateStaff(dt, sdt) {
  for (const s of G.staff) {
    switch (s.state) {
      case 'idle':
        s.wait -= sdt;
        if (s.wait > 0) break;
        if (!findJob(s)) {
          const p = wanderPath(s, 5);
          s.task = null;
          if (p) setPath(s, p); else s.wait = 1;
        }
        break;
      case 'walk': {
        const r = walk(s, sdt, 1.6);
        if (r === null) { s.state = 'idle'; s.wait = 0.2; s.task = null; }
        else if (r) {
          if (s.task) { s.state = 'work'; s.workT = 0; }
          else { s.state = 'idle'; s.wait = rand(0.5, 2); }
        }
        break;
      }
      case 'work': {
        s.workT += sdt;
        s.mesh.rotation.y += sdt * 4;
        if (s.kind === 'mechanic') {
          const e = s.task;
          if (!G.entities.has(e?.id) || e.hp >= 100) { s.state = 'idle'; s.task = null; s.wait = 0.5; break; }
          e.hp = Math.min(100, e.hp + sdt * 14);
          e.dirty = true;
        } else if (s.workT > 0.8) {
          removeLitter(s.task);
          s.task = null;
          s.state = 'idle';
          s.wait = 0.3;
        }
        break;
      }
    }
    syncMesh(s);
  }
}

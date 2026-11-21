import * as THREE from 'three';
import { N, GATE, RES_STEP, UPGRADE_COST } from './constants.js';
import { G, emit, earn, spend, isOwnedTile } from './state.js';
import { CATALOG } from './catalog.js';
import { scene } from './scene.js';
import { rebuildWalk, walkable } from './path.js';
import * as C from './coaster.js';
import { makeIcon, popText, smoke } from './effects.js';
import { releaseGuest } from './guests.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';

const DAMAGED = new THREE.Color('#4a3b2f');
const LOAD_WAIT = 4;

// ---------- geometry helpers ----------
export function footprintTiles(e) {
  if (e.kind === 'coaster') return e.points.map((p) => [p.x, p.z]);
  const out = [];
  for (let dz = 0; dz < e.size; dz++) for (let dx = 0; dx < e.size; dx++) out.push([e.x + dx, e.z + dz]);
  return out;
}
// keep the gate and the tile row in front of it clear so guests can always get in
export const reservedTile = (x, z) => (z === GATE.z || z === GATE.z - 1) && x >= GATE.x && x < GATE.x + GATE.w;
export const tileFree = (x, z) => isOwnedTile(x, z) && G.occ[z * N + x] === 0 && !reservedTile(x, z);
export function canPlace(ax, az, size) {
  for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) if (!tileFree(ax + dx, az + dz)) return false;
  return true;
}
export function center(e) {
  if (e.kind === 'coaster') return { x: e.points[0].x + 0.5, z: e.points[0].z + 0.5 };
  return { x: e.x + e.size / 2, z: e.z + e.size / 2 };
}
export function distTo(e, x, z) {
  if (e.kind === 'coaster') {
    let best = 1e9;
    for (const p of e.points) best = Math.min(best, Math.hypot(p.x + 0.5 - x, p.z + 0.5 - z));
    return best;
  }
  const c = center(e);
  return Math.max(0, Math.hypot(c.x - x, c.z - z) - e.size * 0.5);
}
export function entranceTiles(e) {
  const tiles = e.kind === 'coaster' ? [[e.points[0].x, e.points[0].z]] : footprintTiles(e);
  const own = new Set(footprintTiles(e).map(([x, z]) => z * N + x));
  const out = new Set();
  for (const [x, z] of tiles)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (z + dz) * N + x + dx;
        if (!own.has(i) && walkable(x + dx, z + dz)) out.add(i);
      }
  return [...out];
}

// ---------- stats ----------
export function stats(e) {
  if (e.kind === 'coaster') return { cap: C.CARS * 2, exc: e.exc, dur: e.dur };
  if (e.kind === 'ride') return { cap: Math.max(2, Math.round(e.def.cap * e.w)), exc: +(e.def.exc * Math.pow(e.h, 0.8)).toFixed(1), dur: e.def.dur };
  if (e.kind === 'shop') return { cap: e.def.cap, exc: 0, dur: e.def.dur };
  return { cap: 0, exc: 0, dur: 0 };
}
export const fairPrice = (e) => (e.kind === 'shop' ? Math.max(1, e.def.price * 2) : Math.floor(1.5 + stats(e).exc * 0.7));
export const isFacility = (e) => e.kind === 'ride' || e.kind === 'shop' || e.kind === 'coaster';
export const isRide = (e) => e.kind === 'ride' || e.kind === 'coaster';

export function exposure(e, kind) {
  if (e.kind === 'coaster') {
    const h = (e.info.maxY - C.BASE) / C.UNIT;
    // long tracks sit in the wind for a long time, so per-second exposure is lower
    if (kind === 'wind') return 0.55 + h * 0.06;
    return kind === 'flood' ? 0.45 : 1 + h * 0.08;
  }
  const tall = e.type === 'ferris' || e.type === 'drop' ? 0.3 : 0;
  if (kind === 'wind') return 0.5 + 0.5 * e.h + tall;
  if (kind === 'quake') return 0.7 + 0.3 * e.h + tall * 0.5;
  return 1;
}

// ---------- create / remove ----------
function tag(root, id) {
  root.traverse((o) => (o.userData.eid = id));
}

export function createEntity(d) {
  const def = CATALOG[d.type];
  const e = {
    id: G.nextId++, type: d.type, def, kind: def.kind, name: def.name,
    x: d.x ?? 0, z: d.z ?? 0, size: def.size, rot: d.rot || 0,
    color: d.color || def.color, w: d.w ?? 1, h: d.h ?? 1,
    price: d.price ?? def.price ?? 0, hp: d.hp ?? 100,
    resist: { wind: 0, flood: 0, quake: 0, ...(d.resist || {}) },
    income: d.income || 0, riddenTotal: 0,
    queue: [], riders: [], state: 'idle', loadT: 0, runT: 0, handFix: 0,
    anim: { speed: 0, t: 0, clock: Math.random() * 10, running: false },
    dirty: true, glowApplied: null,
  };
  if (e.kind === 'coaster') {
    e.points = d.points.map((p) => ({ x: p.x, z: p.z, h: p.h }));
    e.name = d.name || `Coaster ${coasterCount() + 1}`;
    buildCoaster(e);
  } else buildModel(e);
  for (const [x, z] of footprintTiles(e)) G.occ[z * N + x] = e.id;
  G.entities.set(e.id, e);
  rebuildWalk();
  emit('entities');
  return e;
}
const coasterCount = () => [...G.entities.values()].filter((e) => e.kind === 'coaster').length;

function buildModel(e) {
  const b = e.def.build(e.color);
  const root = new THREE.Group();
  root.position.set(e.x + e.size / 2, 0, e.z + e.size / 2);
  root.rotation.y = (e.rot * Math.PI) / 2;
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  body.add(b.group);
  tilt.add(body);
  root.add(tilt);
  Object.assign(e, { root, tilt, body, paint: b.paint, glow: b.glow, animate: b.animate, top: b.top });
  tag(root, e.id);
  scene.add(root);
  applyScale(e);
}

function buildCoaster(e) {
  const root = new THREE.Group();
  const tr = C.buildTrack(e.points, e.color, true);
  const st = C.buildStation(e.points, e.color, e.name.toUpperCase());
  const train = C.buildTrain(e.color);
  root.add(tr.group, st.group, train.group);
  e.curve = tr.curve;
  e.info = C.analyse(tr.curve);
  e.exc = C.coasterExcitement(e.info);
  e.dur = C.lapTime(e.info, tr.curve);
  e.train = train;
  e.paint = [...tr.paint, ...st.paint, ...train.paint];
  e.glow = st.glow;
  e.top = e.info.maxY + 0.4;
  e.idleU = ((C.CARS - 1) / 2) * C.carSpacingU(e.info.L);
  e.trainU = e.idleU;
  C.placeTrain(train, e.curve, e.info.L, e.trainU, 0);
  Object.assign(e, { root, tilt: null, body: null });
  tag(root, e.id);
  scene.add(root);
}

export function applyScale(e) {
  if (!e.body) return;
  e.body.scale.set(e.w, e.h, e.w);
  if (e.icon) e.icon.position.y = e.top * e.h + 0.5;
}

function disposeTree(o) {
  o.traverse((c) => {
    c.geometry?.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
  });
}

export function removeEntity(e) {
  e.queue.splice(0).forEach((g) => releaseGuest(g, e, false));
  e.riders.splice(0).forEach((g) => releaseGuest(g, e, false));
  for (const [x, z] of footprintTiles(e)) G.occ[z * N + x] = 0;
  scene.remove(e.root);
  disposeTree(e.root);
  G.entities.delete(e.id);
  if (G.selected === e) G.selected = null;
  rebuildWalk();
  emit('entities');
}

export function rotateEntity(e) {
  if (e.kind === 'coaster') return;
  e.rot = (e.rot + 1) % 4;
  e.root.rotation.y = (e.rot * Math.PI) / 2;
}

// ---------- appearance ----------
export function applyPaint(e) {
  const dmg = clamp((100 - e.hp) / 100, 0, 1) * 0.55;
  for (const m of e.paint) m.color.set(e.color).lerp(DAMAGED, dmg);
  if (e.tilt) {
    e.tilt.rotation.z = e.hp <= 0 ? 0.13 : 0;
    e.tilt.rotation.x = e.hp <= 0 ? 0.06 : 0;
  }
  const want = e.kind === 'scenery' ? null : e.hp <= 0 ? '⚠️' : e.hp < 60 ? '🔧' : null;
  if (want !== e.iconText) {
    if (e.icon) { e.root.remove(e.icon); e.icon.material.dispose(); e.icon = null; }
    if (want) {
      e.icon = makeIcon(want, 0.9);
      if (e.kind === 'coaster') { const c = center(e); e.icon.position.set(c.x, e.top + 0.6, c.z); }
      else e.icon.position.y = e.top * e.h + 0.5;
      e.icon.userData.eid = e.id;
      e.root.add(e.icon);
    }
    e.iconText = want;
  }
}
export function setColor(e, color) {
  e.color = color;
  e.dirty = true;
}

// ---------- damage / repair / upgrades ----------
export function damage(e, amount, kind) {
  if (e.kind === 'scenery' || amount <= 0 || e.hp <= 0) return 0;
  const before = e.hp;
  e.hp = Math.max(0, e.hp - amount * (1 - RES_STEP * (e.resist[kind] || 0)));
  e.dirty = true;
  if (e.hp <= 0) emit('wrecked', e);
  return before - e.hp;
}
export const repairCost = (e) => Math.ceil((100 - e.hp) * 0.4);
export function repairNow(e) {
  if (e.hp >= 100) return false;
  if (!spend(repairCost(e))) return false;
  e.hp = 100; e.handFix = 0; e.dirty = true;
  return true;
}
export function upgrade(e, kind) {
  const lvl = e.resist[kind];
  if (lvl >= 3 || !spend(UPGRADE_COST[lvl])) return false;
  e.resist[kind]++;
  return true;
}

// ---------- facility simulation ----------
let coinSfxT = 0;
function startRun(e, st) {
  const boarding = e.queue.splice(0, st.cap);
  let paid = 0;
  for (const g of boarding) {
    if (g.wallet >= e.price) {
      g.wallet -= e.price;
      paid += e.price;
      g.state = 'ride';
      g.mesh.visible = false;
      e.riders.push(g);
    } else releaseGuest(g, e, false);
  }
  if (!e.riders.length) return;
  if (paid > 0) {
    earn(paid);
    e.income += paid;
    const c = center(e);
    popText(c.x, (e.kind === 'coaster' ? 1.2 : e.top * e.h) + 0.3, c.z, `+${paid}`);
    if (coinSfxT <= 0) { sfx.coin(); coinSfxT = 0.6; }
  }
  e.state = 'run';
  e.runT = 0;
  e.loadT = 0;
}
function finishRun(e) {
  const riders = e.riders.splice(0);
  e.riddenTotal += riders.length;
  riders.forEach((g) => releaseGuest(g, e, true));
  e.state = 'idle';
}
function updateFacility(e, sdt) {
  if (e.hp <= 0) {
    if (e.queue.length) e.queue.splice(0).forEach((g) => releaseGuest(g, e, false));
    if (e.riders.length) e.riders.splice(0).forEach((g) => releaseGuest(g, e, false, true));
    e.state = 'idle';
    return;
  }
  if (G.quakeAmp > 0.03 && e.kind !== 'shop') return; // rides pause while the ground shakes
  const st = stats(e);
  if (e.state === 'idle') {
    if (e.queue.length) {
      e.loadT += sdt;
      if (e.queue.length >= st.cap || e.loadT >= (e.kind === 'shop' ? 0.3 : LOAD_WAIT)) startRun(e, st);
    } else e.loadT = 0;
  } else if (e.kind === 'coaster') {
    const u = e.trainU - e.idleU;
    e.trainU += (C.speedAt(e.info, e.curve, u) * sdt) / e.info.L;
    if (e.trainU - e.idleU >= 1) { e.trainU = e.idleU; finishRun(e); }
  } else {
    e.runT += sdt;
    if (e.runT >= st.dur) finishRun(e);
  }
}

export function updateEntities(dt, sdt) {
  coinSfxT -= dt;
  const glow = Math.round(G.glow * 40) / 40;
  for (const e of G.entities.values()) {
    if (isFacility(e)) updateFacility(e, sdt);
    const a = e.anim;
    a.running = e.state === 'run';
    a.speed += ((a.running ? 1 : 0) - a.speed) * Math.min(1, sdt * 1.5);
    a.t += sdt * a.speed;
    a.clock += sdt;
    e.animate?.(sdt, a);
    if (e.kind === 'coaster') C.placeTrain(e.train, e.curve, e.info.L, e.trainU, e.riders.length);

    if (e.handFix > 0 && e.hp > -1) {
      e.handFix += sdt / 6;
      if (e.handFix >= 1) { e.handFix = 0; e.hp = 100; e.dirty = true; emit('toast', `✋ ${e.def.icon} Fixed!`, 'good'); sfx.upgrade(); }
    }
    if (e.dirty) { applyPaint(e); e.dirty = false; e.glowApplied = null; }
    if (e.glowApplied !== glow) {
      for (const m of e.glow) m.emissiveIntensity = e.hp > 0 ? glow : 0.03;
      e.glowApplied = glow;
    }
    if (e.kind !== 'scenery' && e.hp < 40 && Math.random() < sdt * (e.hp <= 0 ? 4 : 1.5)) {
      const c = center(e);
      smoke(c.x, e.kind === 'coaster' ? 0.8 : e.top * e.h * 0.7, c.z);
    }
    if (e.tilt) {
      if (G.quakeAmp > 0.01) {
        e.tilt.position.set((Math.random() - 0.5) * G.quakeAmp * 0.4, 0, (Math.random() - 0.5) * G.quakeAmp * 0.4);
      } else if (e.tilt.position.x) e.tilt.position.set(0, 0, 0);
    }
  }
}

// ---------- placement ghost ----------
export function createGhost(type) {
  const def = CATALOG[type];
  const b = def.build(def.color);
  b.group.traverse((o) => {
    if (o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.6;
      o.material.depthWrite = false;
      o.castShadow = false;
    }
  });
  const g = new THREE.Group();
  g.add(b.group);
  g.userData.def = def;
  return g;
}

export function serializeEntity(e) {
  const o = { type: e.type, x: e.x, z: e.z, rot: e.rot, color: e.color, w: e.w, h: e.h, price: e.price, hp: e.hp, resist: e.resist, income: e.income };
  if (e.kind === 'coaster') { o.points = e.points; o.name = e.name; }
  return o;
}

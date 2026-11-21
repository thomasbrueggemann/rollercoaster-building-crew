import * as THREE from 'three';
import { N } from './constants.js';
import { G, emit, hourOf } from './state.js';
import { scene, water } from './scene.js';
import { damage, distTo, exposure, center } from './entities.js';
import { TornadoFx } from './fx/tornado.js';
import { QuakeFx } from './fx/quake.js';
import { FloodFx } from './fx/flood.js';
import { updateWeather } from './fx/weather.js';
import { removeLitter } from './guests.js';
import { sfx } from './audio.js';
import { rand, pick, clamp } from './util.js';

export const DISASTERS = {
  tornado: { name: 'Tornado', icon: '🌪️', warn: 'Wind is coming!', resist: 'wind' },
  flood: { name: 'Flood', icon: '🌊', warn: 'Rain is coming!', resist: 'flood' },
  quake: { name: 'Quake', icon: '🌋', warn: 'The ground will shake!', resist: 'quake' },
};

export const D = { next: 160, warn: null, active: [] };

function ownedBounds() {
  let x0 = N, z0 = N, x1 = 0, z1 = 0;
  G.owned.forEach((row, pz) => row.forEach((o, px) => {
    if (!o) return;
    x0 = Math.min(x0, px * 8); z0 = Math.min(z0, pz * 8);
    x1 = Math.max(x1, px * 8 + 8); z1 = Math.max(z1, pz * 8 + 8);
  }));
  return { x0, z0, x1, z1 };
}

// ground positions of all attractions (used by dust / foam visuals)
function spots() {
  return [...G.entities.values()].filter((e) => e.kind !== 'scenery').map((e) => { const c = center(e); return { x: c.x, z: c.z }; });
}

function tracker(type) {
  return { type, t: 0, hit: new Map() };
}
function hurt(d, e, amount, kind) {
  const before = e.hp;
  const dealt = damage(e, amount, kind);
  if (dealt > 0) {
    const rec = d.hit.get(e) || { dealt: 0, wrecked: false };
    rec.dealt += dealt;
    if (before > 0 && e.hp <= 0) rec.wrecked = true;
    d.hit.set(e, rec);
  }
}

// ---------- tornado ----------
function startTornado() {
  const d = tracker('tornado');
  const fx = new TornadoFx();
  const g = fx.group;
  d.fx = fx;
  const b = ownedBounds();
  const aim = new THREE.Vector2(rand(b.x0 + 3, b.x1 - 3), rand(b.z0 + 3, b.z1 - 3));
  const ang = rand(0, Math.PI * 2);
  const start = new THREE.Vector2(aim.x + Math.cos(ang) * 26, aim.y + Math.sin(ang) * 26);
  const dir = aim.clone().sub(start).normalize();
  Object.assign(d, { g, x: start.x, z: start.y, dx: dir.x, dz: dir.y, R: 3.2 });
  g.position.set(d.x, 0, d.z);
  scene.add(g);
  sfx.wind();
  return d;
}
function updateTornado(d, sdt) {
  d.t += sdt;
  const wob = Math.sin(d.t * 0.9) * 0.9;
  d.x += (d.dx * 2.2 - d.dz * wob) * sdt;
  d.z += (d.dz * 2.2 + d.dx * wob) * sdt;
  d.g.position.set(d.x, 0, d.z);
  d.fx.update(sdt, d.x, d.z);
  if (Math.random() < sdt * 0.25) sfx.wind();
  for (const e of G.entities.values()) {
    const dist = distTo(e, d.x, d.z);
    if (dist < d.R) hurt(d, e, 17 * (1 - dist / d.R) * exposure(e, 'wind') * sdt, 'wind');
  }
  for (const g of G.guests) if (Math.hypot(g.x - d.x, g.z - d.z) < d.R + 1) g.happy -= 14 * sdt;
  for (const l of [...G.litter]) if (Math.hypot(l.x - d.x, l.z - d.z) < d.R) removeLitter(l);
  G.quakeAmp = Math.max(G.quakeAmp, 0.04);
  const inside = d.x > 0 && d.z > 0 && d.x < N && d.z < N;
  if (inside) d.entered = true;
  const out = d.x < -10 || d.z < -10 || d.x > N + 10 || d.z > N + 10;
  if ((out && d.entered) || d.t > 60) { scene.remove(d.g); d.fx.dispose(); return true; }
  return false;
}

// ---------- flood ----------
function startFlood() {
  sfx.splash();
  const d = tracker('flood');
  d.fx = new FloodFx(ownedBounds(), spots());
  return d;
}
function updateFlood(d, sdt) {
  d.t += sdt;
  const RISE = 6, HOLD = 22, FALL = 30;
  let lvl;
  if (d.t < RISE) lvl = -0.6 + (d.t / RISE) * 0.95;
  else if (d.t < HOLD) lvl = 0.35 + Math.sin(d.t * 1.5) * 0.02;
  else lvl = 0.35 - ((d.t - HOLD) / (FALL - HOLD)) * 0.95;
  G.waterLevel = lvl;
  d.fx.update(sdt);
  if (lvl > 0.02) for (const e of G.entities.values()) hurt(d, e, 1.5 * exposure(e, 'flood') * sdt, 'flood');
  if (d.t >= FALL) { G.waterLevel = -0.6; d.fx.dispose(); return true; }
  return false;
}

// ---------- earthquake ----------
function startQuake() {
  const d = tracker('quake');
  sfx.rumble();
  for (const e of G.entities.values()) hurt(d, e, rand(12, 26) * exposure(e, 'quake'), 'quake');
  for (const g of G.guests) g.happy -= 10;
  d.fx = new QuakeFx(spots());
  return d;
}
function updateQuake(d, sdt) {
  d.t += sdt;
  const DUR = 7;
  G.quakeAmp = Math.max(G.quakeAmp, 0.45 * (1 - d.t / DUR));
  for (const e of G.entities.values()) hurt(d, e, 1.6 * exposure(e, 'quake') * sdt, 'quake');
  if (d.t > 3 && !d.second) { d.second = true; sfx.rumble(); }
  d.fx.update(sdt, G.quakeAmp, DUR);
  if (d.t >= DUR) { d.fx.dispose(); return true; }
  return false;
}

const STARTERS = { tornado: startTornado, flood: startFlood, quake: startQuake };
const UPDATERS = { tornado: updateTornado, flood: updateFlood, quake: updateQuake };

export function warnDisaster(type) {
  if (D.warn) return;
  D.warn = { type, t: 10 };
  sfx.siren();
  emit('warning', type);
}

function report(d) {
  const info = DISASTERS[d.type];
  const n = d.hit.size;
  const wrecked = [...d.hit.values()].filter((r) => r.wrecked).length;
  let msg = `${info.icon} It is over!`;
  if (!n) msg += ' All OK! 👍';
  else msg += wrecked ? ` 💥 ${wrecked} broke. Fix them 🔧` : ' Some rides need 🔧';
  emit('toast', msg, wrecked ? 'bad' : 'warn');
}

export function updateDisasters(sdt) {
  G.quakeAmp = Math.max(0, G.quakeAmp - sdt * 0.5);
  if (G.disastersOn && !D.warn) {
    const h = hourOf();
    const night = h < 6 || h > 21;
    D.next -= sdt * (night ? 1.5 : 1);
    if (D.next <= 0 && G.entities.size > 0) {
      const busy = new Set(D.active.map((a) => a.type));
      const options = Object.keys(DISASTERS).filter((k) => !busy.has(k));
      if (options.length) warnDisaster(pick(options));
      // sometimes two disasters overlap
      D.next = Math.random() < 0.22 ? rand(6, 14) : rand(120, 220);
    }
  }
  if (D.warn) {
    D.warn.t -= sdt;
    if (D.warn.t <= 0) {
      const type = D.warn.type;
      D.warn = null;
      D.active.push(STARTERS[type]());
      emit('disaster', type);
    }
  }
  for (let i = D.active.length - 1; i >= 0; i--) {
    const d = D.active[i];
    if (UPDATERS[d.type](d, sdt)) { D.active.splice(i, 1); report(d); }
  }
  const stormGoal = D.active.some((a) => a.type === 'tornado' || a.type === 'flood') ? 1 : D.warn ? 0.6 : 0;
  G.storm += (stormGoal - G.storm) * clamp(sdt * 0.8, 0, 1);
  const tor = D.active.find((a) => a.type === 'tornado');
  updateWeather(sdt, G.storm, tor ? () => ({ x: tor.x, z: tor.z }) : null);
  water.visible = G.waterLevel > -0.55;
  water.position.y = G.waterLevel;
}

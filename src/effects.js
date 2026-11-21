import * as THREE from 'three';
import { scene } from './scene.js';
import { QUALITY, isUltra, isLow } from './quality.js';
import { updateShared } from './fx/shared.js';
import { Emitter } from './fx/emitter.js';

const TIER = isUltra() ? 0 : isLow() ? 2 : 1;
const pick3 = (a, b, c) => [a, b, c][TIER];

// ---------- text / emoji sprites ----------
const texCache = new Map();
export function textTexture(text, color = '#ffffff', size = 64) {
  const key = `${text}|${color}|${size}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `bold ${size}px ui-rounded, system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w; c.height = size + 16;
  ctx.font = `bold ${size}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size / 8; ctx.strokeStyle = 'rgba(20,20,40,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, w / 2, c.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData = { aspect: w / c.height };
  texCache.set(key, tex);
  return tex;
}

export function makeIcon(text, height = 0.7) {
  const tex = textTexture(text);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(height * tex.userData.aspect, height, 1);
  s.renderOrder = 10;
  s.layers.set(1); // overlay layer: drawn after ambient occlusion
  return s;
}

// ---------- shared particle emitters ----------
const SMOKE_CAP = pick3(520, 320, 140);
const smokeFx = new Emitter(scene, SMOKE_CAP);                       // billowing smoke + dust (normal blend)
const sparkFx = new Emitter(scene, pick3(260, 160, 60), { additive: true, light: false, fadeOut: 1.5 });
export const dustFx = new Emitter(scene, pick3(700, 420, 160));      // quake / tornado dust, splashes
export const rippleFx = new Emitter(scene, pick3(160, 90, 36), { flat: true, light: false });
export const foamFx = new Emitter(scene, pick3(260, 150, 50), { light: true });

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- floating coin pops ----------
const popTexCache = new Map();
function popTexture(text, color) {
  const key = `${text}|${color}`;
  if (popTexCache.has(key)) return popTexCache.get(key);
  const size = 56, coin = size * 0.95, gap = 6;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `800 ${size}px ui-rounded, system-ui, sans-serif`;
  const tw = Math.ceil(meas.measureText(text).width);
  const c = document.createElement('canvas');
  const w = Math.ceil(coin + gap + tw + 20), h = size + 20;
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // coin
  const cx = 10 + coin / 2, cy = h / 2, r = coin / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fff3a0'); g.addColorStop(0.55, '#ffc928'); g.addColorStop(1, '#d68a00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3; ctx.strokeStyle = '#b86e00';
  ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,240,170,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#b86e00';
  ctx.font = `800 ${size * 0.55}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('$', cx, cy + 2);
  // text
  ctx.font = `800 ${size}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  const tx = 10 + coin + gap;
  ctx.lineJoin = 'round'; ctx.lineWidth = size / 6; ctx.strokeStyle = 'rgba(20,20,40,0.9)';
  ctx.strokeText(text, tx, cy + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, tx, cy + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData = { aspect: w / h };
  popTexCache.set(key, tex);
  return tex;
}

const pops = [];
const popPool = [];
export function popText(x, y, z, text, color = '#ffe066') {
  if (pops.length > 40) return;
  const tex = popTexture(text, color);
  let s = popPool.pop();
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    s.renderOrder = 11;
    s.layers.set(1);
  }
  s.material.map = tex;
  s.material.opacity = 1;
  s.material.needsUpdate = true;
  s.userData.aspect = tex.userData.aspect;
  s.scale.set(0.01, 0.01, 1);
  s.position.set(x, y, z);
  scene.add(s);
  pops.push({ s, life: 1.4, age: 0, x, sway: Math.random() * 6.28 });
  if (!isLow()) for (let i = 0; i < 4; i++) {
    const a = Math.random() * 6.283;
    sparkFx.emit({ x, y, z, vx: Math.cos(a) * 0.8, vy: rnd(0.3, 1.1), vz: Math.sin(a) * 0.8, life: rnd(0.35, 0.6), size: 0.07, a: 0.9, r: 1, g: 0.8, b: 0.25, drag: 3, grav: 1.5, tile: 0 });
  }
}

// ---------- smoke from damaged rides ----------
// dark: true | false | 0..1 (1 = black, wrecked)
export function smoke(x, y, z, dark = true) {
  const d = dark === true ? 0.65 : dark === false ? 0.1 : dark;
  const puffs = isLow() ? 1 : 2;
  for (let i = 0; i < puffs; i++) {
    const v = 0.22 + (1 - d) * 0.5 + Math.random() * 0.12;
    const sz = rnd(0.3, 0.46) * (i ? 0.7 : 1);
    smokeFx.emit({
      x: x + rnd(-0.18, 0.18), y: y + rnd(-0.05, 0.1), z: z + rnd(-0.18, 0.18),
      vx: rnd(-0.15, 0.15) + 0.12, vy: rnd(0.55, 0.95), vz: rnd(-0.15, 0.15) - 0.06,
      life: rnd(2.2, 3.4), size: sz, grow: rnd(2.2, 3.6), rot: rnd(0, 6.28), rotV: rnd(-0.5, 0.5),
      a: 0.55 + d * 0.2, r: v, g: v, b: v * 1.04, drag: 0.55, tile: (Math.random() * 3) | 0, fadeIn: 0.12,
    });
  }
  // flickering embers when badly wrecked / occasionally otherwise
  if (!isLow() && Math.random() < 0.18 + d * 0.15) sparkBurst(x, y, z, 3 + ((Math.random() * 3) | 0));
}

export function sparkBurst(x, y, z, n = 5, speed = 1.3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = rnd(0.3, 1) * speed;
    sparkFx.emit({
      x, y, z, vx: Math.cos(a) * s, vy: rnd(0.8, 2.2) * speed * 0.7, vz: Math.sin(a) * s,
      life: rnd(0.4, 0.9), size: rnd(0.04, 0.08), a: 1, r: 1, g: rnd(0.45, 0.8), b: 0.15, drag: 1.2, grav: 4, tile: 0, fadeIn: 0,
    });
  }
}

// dust cloud (quake, tornado skirt): tan puffs that expand and settle
export function dustPuff(x, y, z, o = {}) {
  const v = o.tone ?? 0.62;
  const a = Math.random() * 6.283, s = rnd(0.1, 0.5) * (o.speed ?? 1);
  dustFx.emit({
    x, y, z, vx: Math.cos(a) * s, vy: rnd(0.15, 0.6) * (o.rise ?? 1), vz: Math.sin(a) * s,
    life: rnd(1.0, 1.9) * (o.life ?? 1), size: (o.size ?? 0.5) * rnd(0.7, 1.2), grow: rnd(1.4, 2.6),
    rot: rnd(0, 6.28), rotV: rnd(-0.7, 0.7), a: o.a ?? 0.4,
    r: v * 1.0, g: v * 0.88, b: v * 0.7, drag: 1.1, tile: (Math.random() * 3) | 0, fadeIn: 0.1,
  });
}

export function updateEffects(dt) {
  updateShared();
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.age += dt; p.life -= dt;
    const t = p.age;
    const pop = t < 0.18 ? (t / 0.18) * 1.2 : t < 0.3 ? 1.2 - ((t - 0.18) / 0.12) * 0.2 : 1;
    const h = 0.5 * pop;
    p.s.scale.set(h * p.s.userData.aspect, h, 1);
    p.s.position.y += dt * (0.9 * Math.max(0.25, p.life / 1.4) + 0.2);
    p.s.position.x = p.x + Math.sin(p.sway + t * 4) * 0.04;
    p.s.material.opacity = Math.min(1, p.life * 2.2);
    if (p.life <= 0) { scene.remove(p.s); popPool.push(p.s); pops.splice(i, 1); }
  }
  smokeFx.update(dt);
  sparkFx.update(dt);
  dustFx.update(dt);
  rippleFx.update(dt);
  foamFx.update(dt);
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from './util.js';
import { G } from './state.js';
import { isUltra, isLow } from './quality.js';

export const UNIT = 0.7;   // height of one track level
export const BASE = 0.3;   // track height at level 0
export const trackY = (h) => BASE + h * UNIT;
export const CARS = 4;
const CAR_GAP = 0.62;
const UP = new THREE.Vector3(0, 1, 0);

const TIER = isUltra() ? 0 : isLow() ? 2 : 1;
const RAD = [8, 6, 5][TIER];          // radial segments for tubes
const PER_UNIT = [10, 8, 5][TIER];    // path samples per world unit
const SHADOW_SMALL = TIER < 2;        // ties / bracing / railings cast shadows

export function makeCurve(points, closed) {
  if (points.length < 2) return null;
  const pts = points.map((p) => new THREE.Vector3(p.x + 0.5, trackY(p.h), p.z + 0.5));
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  c.arcLengthDivisions = Math.max(200, points.length * 40);
  return c;
}

// ---------- shared materials / geometry (created lazily, reused by every coaster) ----------
let M = null;
function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M = {
    rail: std({ color: '#d3dae2', metalness: 0.9, roughness: 0.25 }),
    support: std({ color: '#aab3bd', metalness: 0.75, roughness: 0.42 }),
    concrete: std({ color: '#a39f96', roughness: 0.92 }),
    dark: std({ color: '#30343b', metalness: 0.5, roughness: 0.55 }),
    chain: std({ color: '#23262b', metalness: 0.8, roughness: 0.4 }),
    walk: std({ color: '#7d858e', metalness: 0.6, roughness: 0.6 }),
    handrail: std({ color: '#f2c230', metalness: 0.3, roughness: 0.5 }),
    steel: std({ color: '#e4e8ec', metalness: 0.85, roughness: 0.3 }),
    white: std({ color: '#f3f5f7', metalness: 0.25, roughness: 0.5 }),
    paving: std({ color: '#d9d2c5', roughness: 0.9 }),
    stone: std({ color: '#928b80', roughness: 0.95 }),
    yellow: std({ color: '#ffd23f', roughness: 0.6 }),
    wheel: std({ color: '#1d1f23', metalness: 0.2, roughness: 0.7 }),
  };
  return M;
}
let UG = null;
function unitGeos() {
  if (UG) return UG;
  UG = { cyl: new THREE.CylinderGeometry(1, 1, 1, RAD, 1), box: new THREE.BoxGeometry(1, 1, 1) };
  return UG;
}
const paintMat = (color) => (TIER < 2
  ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 })
  : new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }));

// ---------- helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const _mb = new THREE.Matrix4(), _x = new THREE.Vector3();

class Inst {
  constructor() { this.a = []; this.n = 0; }
  push(m) { const e = m.elements; for (let k = 0; k < 16; k++) this.a.push(e[k]); this.n++; }
  cyl(ax, ay, az, bx, by, bz, r) {
    _a.set(ax, ay, az); _b.set(bx, by, bz);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
    _p.addVectors(_a, _b).multiplyScalar(0.5);
    this.push(_m.compose(_p, _q, _s.set(r, len, r)));
  }
  box(px, py, pz, q, sx, sy, sz) { this.push(_m.compose(_p.set(px, py, pz), q, _s.set(sx, sy, sz))); }
  mesh(geo, mat, shadow) {
    if (!this.n) return null;
    const im = new THREE.InstancedMesh(geo, mat, this.n);
    im.instanceMatrix.array.set(this.a);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow;
    return im;
  }
}

// rings = cross sections swept along the track (hard-edged for boxes, smooth for tubes)
function circleRing(r, seg) {
  const pts = [], nrm = [], edges = [];
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r); nrm.push(Math.cos(a), Math.sin(a));
    edges.push([j, (j + 1) % seg]);
  }
  return { n: seg, pts, nrm, edges };
}
function boxRing(w, h) {
  const c = [[w, -h], [w, h], [-w, h], [-w, -h]], nn = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const pts = [], nrm = [], edges = [];
  for (let e = 0; e < 4; e++) {
    pts.push(...c[e], ...c[(e + 1) % 4]); nrm.push(...nn[e], ...nn[e]); edges.push([e * 2, e * 2 + 1]);
  }
  return { n: 8, pts, nrm, edges };
}

// path samples with frames: S.pos / S.tan / S.up / S.side (Float32Array xyz)
const BANK = 0.7, BANK_MAX = 0.45;
function makeFrame(t, kx, kz, up, side) {
  let bx = kx * BANK, bz = kz * BANK;
  const bl = Math.hypot(bx, bz);
  if (bl > BANK_MAX) { bx *= BANK_MAX / bl; bz *= BANK_MAX / bl; }
  up.set(bx, 1, bz);
  up.addScaledVector(t, -up.dot(t));
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  up.normalize();
  side.crossVectors(t, up);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
}

function sweep(S, cs, cu, ring, i0, i1, wrap) {
  const nv = ring.n, ns = i1 - i0 + 1;
  const pos = new Float32Array(ns * nv * 3), nor = new Float32Array(ns * nv * 3);
  for (let k = 0; k < ns; k++) {
    const i = (i0 + k) * 3;
    const cx = S.pos[i] + S.side[i] * cs + S.up[i] * cu;
    const cy = S.pos[i + 1] + S.side[i + 1] * cs + S.up[i + 1] * cu;
    const cz = S.pos[i + 2] + S.side[i + 2] * cs + S.up[i + 2] * cu;
    for (let j = 0; j < nv; j++) {
      const rx = ring.pts[j * 2], ry = ring.pts[j * 2 + 1], nx = ring.nrm[j * 2], ny = ring.nrm[j * 2 + 1];
      const o = (k * nv + j) * 3;
      pos[o] = cx + S.side[i] * rx + S.up[i] * ry;
      pos[o + 1] = cy + S.side[i + 1] * rx + S.up[i + 1] * ry;
      pos[o + 2] = cz + S.side[i + 2] * rx + S.up[i + 2] * ry;
      nor[o] = S.side[i] * nx + S.up[i] * ny;
      nor[o + 1] = S.side[i + 1] * nx + S.up[i + 1] * ny;
      nor[o + 2] = S.side[i + 2] * nx + S.up[i + 2] * ny;
    }
  }
  const segs = wrap ? ns : ns - 1;
  const idx = new Uint32Array(segs * ring.edges.length * 6);
  let w = 0;
  for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % ns;
    for (const [a, b] of ring.edges) {
      const a0 = k * nv + a, b0 = k * nv + b, a1 = k1 * nv + a, b1 = k1 * nv + b;
      idx[w++] = a0; idx[w++] = b1; idx[w++] = b0;
      idx[w++] = a0; idx[w++] = a1; idx[w++] = b1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// interpolated frame at fractional sample index
const F = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), s: new THREE.Vector3() };
const _t2 = new THREE.Vector3();
function frameAt(S, fi) {
  let i0 = Math.floor(fi);
  const f = fi - i0;
  let i1 = i0 + 1;
  if (S.closed) { i0 %= S.count; i1 %= S.count; } else { i0 = Math.min(i0, S.count - 1); i1 = Math.min(i1, S.count - 1); }
  const L = (arr, out) => out.set(
    arr[i0 * 3] * (1 - f) + arr[i1 * 3] * f,
    arr[i0 * 3 + 1] * (1 - f) + arr[i1 * 3 + 1] * f,
    arr[i0 * 3 + 2] * (1 - f) + arr[i1 * 3 + 2] * f);
  L(S.pos, F.p); L(S.tan, F.t).normalize(); L(S.up, F.u).normalize();
  F.s.crossVectors(F.t, F.u).normalize();
  return F;
}
const frameQuat = (f, q) => q.setFromRotationMatrix(_mb.makeBasis(_x.copy(f.s).negate(), f.u, f.t));
const yawQuat = (a) => new THREE.Quaternion().setFromAxisAngle(UP, a);

// Track mesh for a list of grid pieces. Used both for the live preview and finished coasters.
export function buildTrack(points, color, closed) {
  const group = new THREE.Group();
  const paint = [];
  const curve = makeCurve(points, closed);
  if (!curve) return { group, paint, curve: null };
  const L = curve.getLength();
  const n = Math.max(12, Math.ceil(L * PER_UNIT));
  const count = closed ? n : n + 1;
  const S = { count, closed, pos: new Float32Array(count * 3), tan: new Float32Array(count * 3), up: new Float32Array(count * 3), side: new Float32Array(count * 3) };
  const p = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const u = Math.min(i / n, 1);
    curve.getPointAt(u, p); curve.getTangentAt(u, t);
    S.pos.set([p.x, p.y, p.z], i * 3); S.tan.set([t.x, t.y, t.z], i * 3);
  }
  const ds = L / n, w = Math.max(1, Math.round(0.25 / ds));
  for (let i = 0; i < count; i++) {
    const ia = closed ? (i - w + count) % count : Math.max(0, i - w);
    const ib = closed ? (i + w) % count : Math.min(count - 1, i + w);
    const span = closed ? 2 * w * ds : Math.max(1, ib - ia) * ds;
    const kx = (S.tan[ib * 3] - S.tan[ia * 3]) / span, kz = (S.tan[ib * 3 + 2] - S.tan[ia * 3 + 2]) / span;
    t.set(S.tan[i * 3], S.tan[i * 3 + 1], S.tan[i * 3 + 2]);
    makeFrame(t, kx, kz, up, side);
    S.up.set([up.x, up.y, up.z], i * 3); S.side.set([side.x, side.y, side.z], i * 3);
  }

  const m = mats(), ug = unitGeos();
  const sp = paintMat(color);
  paint.push(sp);
  const add = (geo, mat, shadow = true) => { const me = new THREE.Mesh(geo, mat); me.castShadow = shadow; group.add(me); return me; };

  // running rails + painted spine
  const railRing = circleRing(0.028, Math.max(4, RAD - 1));
  add(sweep(S, -0.15, 0, railRing, 0, count - 1, closed), m.rail);
  add(sweep(S, 0.15, 0, railRing, 0, count - 1, closed), m.rail);
  add(sweep(S, 0, -0.11, circleRing(0.052, RAD), 0, count - 1, closed), sp);

  // cross ties + V lattice struts
  const ties = new Inst(), struts = new Inst();
  const tieN = Math.max(2, Math.floor(L / 0.2));
  for (let k = 0; k < tieN; k++) {
    const f = frameAt(S, closed ? (k / tieN) * n : (k / (tieN - 1)) * n);
    frameQuat(f, _q);
    ties.box(f.p.x - f.u.x * 0.03, f.p.y - f.u.y * 0.03, f.p.z - f.u.z * 0.03, _q, 0.36, 0.02, 0.035);
    for (const sg of [-1, 1]) {
      struts.cyl(
        f.p.x + f.s.x * 0.15 * sg - f.u.x * 0.012, f.p.y + f.s.y * 0.15 * sg - f.u.y * 0.012, f.p.z + f.s.z * 0.15 * sg - f.u.z * 0.012,
        f.p.x - f.u.x * 0.095, f.p.y - f.u.y * 0.095, f.p.z - f.u.z * 0.095, 0.011);
    }
  }
  const tm = ties.mesh(ug.box, m.dark, SHADOW_SMALL); if (tm) group.add(tm);
  const stm = struts.mesh(ug.cyl, m.dark, false); if (stm) group.add(stm);

  // chain lift + catwalk with railing from the station to the first peak
  const info = analyse(curve);
  const liftEnd = info.uPeak * n;
  const liftStart = (0.6 / L) * n;
  if (liftEnd - liftStart > 1.5) {
    const chain = new Inst();
    const step = (0.07 / L) * n;
    let alt = 0;
    for (let fi = liftStart; fi < liftEnd; fi += step, alt ^= 1) {
      const f = frameAt(S, fi);
      frameQuat(f, _q);
      if (alt) chain.box(f.p.x - f.u.x * 0.022, f.p.y - f.u.y * 0.022, f.p.z - f.u.z * 0.022, _q, 0.012, 0.03, 0.05);
      else chain.box(f.p.x - f.u.x * 0.022, f.p.y - f.u.y * 0.022, f.p.z - f.u.z * 0.022, _q, 0.034, 0.011, 0.05);
    }
    const cm = chain.mesh(ug.box, m.chain, false); if (cm) group.add(cm);
    const walkStart = Math.ceil(((0.9 / L) * n));
    const wEnd = Math.floor(liftEnd);
    if (wEnd - walkStart > 2) {
      add(sweep(S, 0.27, -0.1, boxRing(0.07, 0.007), walkStart, wEnd, false), m.walk, false);
      add(sweep(S, 0.335, 0.07, circleRing(0.01, 5), walkStart, wEnd, false), m.handrail, false);
      add(sweep(S, 0.335, -0.01, circleRing(0.007, 4), walkStart, wEnd, false), m.handrail, false);
      const posts = new Inst();
      const pstep = (0.45 / L) * n;
      for (let fi = walkStart; fi <= wEnd; fi += pstep) {
        const f = frameAt(S, fi);
        frameQuat(f, _q);
        const o = 0.335, h = -0.015;
        posts.box(f.p.x + f.s.x * o + f.u.x * h, f.p.y + f.s.y * o + f.u.y * h, f.p.z + f.s.z * o + f.u.z * h, _q, 0.012, 0.17, 0.012);
      }
      const pm = posts.mesh(ug.box, m.handrail, false); if (pm) group.add(pm);
    }
  }

  // supports: T-posts, Y-forks and braced A-frame towers, down to concrete footers
  const legs = new Inst(), beams = new Inst(), feet = new Inst();
  const N = points.length;
  for (let i = 0; i < N; i++) {
    const pt = points[i], x = pt.x + 0.5, z = pt.z + 0.5, topY = trackY(pt.h) - 0.17;
    if (topY < 0.3) continue;
    curve.getTangent(i / (closed ? N : N - 1), _t2);
    let hx = _t2.x, hz = _t2.z;
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-3) { hx = 1; hz = 0; } else { hx /= hl; hz /= hl; }
    const lx = -hz, lz = hx;
    const q = yawQuat(Math.atan2(-lz, lx));
    const P = (lat, y) => [x + lx * lat, y, z + lz * lat];
    const cyl = (a, b, r) => legs.cyl(a[0], a[1], a[2], b[0], b[1], b[2], r);
    const foot = (lat) => feet.box(x + lx * lat, 0.025, z + lz * lat, q, 0.2, 0.05, 0.2);
    beams.box(x, topY - 0.015, z, q, 0.38, 0.03, 0.06);
    if (topY <= 0.9) {
      cyl(P(0, 0.04), P(0, topY), 0.04);
      foot(0);
    } else if (topY <= 2.1) {
      const yf = topY * 0.55;
      cyl(P(0, 0.04), P(0, yf), 0.045);
      cyl(P(0, yf), P(0.14, topY), 0.03);
      cyl(P(0, yf), P(-0.14, topY), 0.03);
      foot(0);
    } else {
      const wTop = 0.12, wBase = Math.min(0.5, 0.16 + topY * 0.05);
      const lat = (y) => wTop + (wBase - wTop) * (1 - y / topY);
      for (const sg of [-1, 1]) { cyl(P(sg * wBase, 0.04), P(sg * wTop, topY), 0.036); foot(sg * wBase); }
      const m1 = Math.max(1, Math.floor(topY / 0.9));
      const ys = [0.04];
      for (let k = 1; k <= m1; k++) ys.push((topY * k) / (m1 + 1));
      ys.push(topY - 0.02);
      for (let k = 1; k < ys.length - 1; k++) cyl(P(-lat(ys[k]), ys[k]), P(lat(ys[k]), ys[k]), 0.014);
      for (let k = 0; k < ys.length - 1; k++) {
        const ya = ys[k], yb = ys[k + 1];
        cyl(P(-lat(ya), ya), P(lat(yb), yb), 0.011);
        cyl(P(lat(ya), ya), P(-lat(yb), yb), 0.011);
      }
    }
  }
  const lm = legs.mesh(ug.cyl, m.support, true); if (lm) group.add(lm);
  const bm = beams.mesh(ug.box, m.support, SHADOW_SMALL); if (bm) group.add(bm);
  const fm = feet.mesh(ug.box, m.concrete, false); if (fm) { fm.receiveShadow = true; group.add(fm); }
  return { group, paint, curve, length: L };
}

// ---------- geometry merge helper (static parts of stations / cars) ----------
class Merge {
  constructor() { this.g = []; }
  add(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(new THREE.Euler(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    this.g.push(g);
    return this;
  }
  box(x, y, z, sx, sy, sz, ry = 0) { return this.add(BOX, x, y, z, 0, ry, 0, sx, sy, sz); }
  cyl(x, y, z, r, h, rx = 0, rz = 0) { return this.add(CYL, x, y, z, rx, 0, rz, r, h, r); }
  build() {
    if (!this.g.length) return null;
    const r = mergeGeometries(this.g, false);
    this.g.forEach((g) => g.dispose());
    return r;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
const meshOf = (geo, mat, shadow = true) => {
  const me = new THREE.Mesh(geo, mat);
  me.castShadow = shadow; me.receiveShadow = true;
  return me;
};

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 144;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 144);
  g.addColorStop(0, '#2a3350'); g.addColorStop(1, '#171c30');
  x.fillStyle = g;
  x.beginPath(); x.roundRect(4, 4, 504, 136, 26); x.fill();
  x.lineWidth = 6; x.strokeStyle = '#ffd23f'; x.stroke();
  x.fillStyle = '#fff6d0'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 70px ui-rounded, system-ui, sans-serif';
  x.fillText(text, 270, 76);
  x.font = '60px system-ui, sans-serif';
  x.fillText('\u{1F3A2}', 56, 78);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildStation(points, color, name = 'COASTER') {
  const g = new THREE.Group();
  const paint = [];
  const a = points[0], b = points[1];
  const along = b.x !== a.x ? 'x' : 'z';
  const m = mats();
  const roofM = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
  paint.push(roofM);
  const bulbM = new THREE.MeshStandardMaterial({ color: '#4a4636', emissive: '#ffe9a8', emissiveIntensity: 0.3 });
  const tex = signTexture(String(name).toUpperCase());
  const signM = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.6 });

  // local frame: z runs along the track; rotated into place at the end
  const loc = new THREE.Group();
  const stone = new Merge(), paving = new Merge(), yellow = new Merge(), white = new Merge(), dark = new Merge(), bulbs = new Merge();
  stone.box(0, 0.01, 0, 1.0, 0.02, 1.0);
  for (const s of [-1, 1]) {
    stone.box(s * 0.38, 0.11, 0, 0.24, 0.2, 1.0);
    paving.box(s * 0.38, 0.215, 0, 0.26, 0.03, 1.02);
    yellow.box(s * 0.265, 0.232, 0, 0.03, 0.004, 1.0);
    // queue railing along the outer edge
    for (let z = -0.5; z <= 0.501; z += 0.25) white.box(s * 0.5, 0.33, z, 0.016, 0.22, 0.016);
    white.box(s * 0.5, 0.43, 0, 0.014, 0.014, 1.0);
    white.box(s * 0.5, 0.35, 0, 0.012, 0.012, 1.0);
    white.box(s * 0.5, 0.27, 0, 0.012, 0.012, 1.0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    white.cyl(sx * 0.47, 0.6, sz * 0.43, 0.028, 1.0);
    white.cyl(sx * 0.47, 0.235, sz * 0.43, 0.045, 0.03);
    bulbs.box(sx * 0.3, 1.045, sz * 0.3, 0.12, 0.02, 0.12);
  }
  for (const sz of [-1, 1]) white.box(0, 1.08, sz * 0.62, 1.3, 0.06, 0.045);
  for (const sx of [-1, 1]) white.box(sx * 0.62, 1.08, 0, 0.045, 0.06, 1.3);
  // ridge beam + sign posts
  dark.box(0, 1.37, 0, 0.03, 0.03, 1.1);
  for (const sx of [-1, 1]) dark.cyl(sx * 0.32, 1.46, 0, 0.012, 0.3);
  for (const [mer, mat, sh] of [[stone, m.stone, false], [paving, m.paving, false], [yellow, m.yellow, false], [white, m.white, true], [dark, m.dark, true], [bulbs, bulbM, false]]) {
    const geo = mer.build();
    if (geo) loc.add(meshOf(geo, mat, sh));
  }
  // gable roof
  const shape = new THREE.Shape();
  shape.moveTo(-0.67, -0.03); shape.lineTo(0.67, -0.03); shape.lineTo(0.67, 0); shape.lineTo(0, 0.3); shape.lineTo(-0.67, 0); shape.closePath();
  const roofG = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false });
  roofG.translate(0, 1.09, -0.65);
  const roof = meshOf(roofG, roofM);
  loc.add(roof);
  // sign board (readable from both ends of the platform)
  const board = new THREE.PlaneGeometry(0.8, 0.225);
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(board, signM);
    pl.position.set(0, 1.6, s * 0.015);
    pl.rotation.y = s > 0 ? 0 : Math.PI;
    loc.add(pl);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.02), m.dark);
  back.position.set(0, 1.6, 0);
  back.castShadow = true;
  loc.add(back);
  if (along === 'x') loc.rotation.y = Math.PI / 2;
  g.add(loc);
  g.position.set(a.x + 0.5, 0, a.z + 0.5);
  return { group: g, paint, glow: [bulbM, signM] };
}

// ---------- train ----------
const SKINS = ['#ffcc99', '#f1c27d', '#c68642', '#8d5524', '#ffdbac'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
const SHIRTS = ['#e63946', '#2a9d8f', '#f4a261', '#4361ee', '#9b5de5', '#f1faee', '#ffbe0b', '#06d6a0'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
let RG = null;
function riderGeos() {
  if (RG) return RG;
  RG = {
    torso: new THREE.CapsuleGeometry(0.048, 0.07, 3, 8).translate(0, 0.1, -0.005),
    head: new THREE.SphereGeometry(0.042, 10, 8).translate(0, 0.228, 0.005),
    arm: new THREE.CylinderGeometry(0.014, 0.012, 0.115, 5).translate(0, 0.0575, 0),
  };
  return RG;
}
function makeRider(k) {
  const g = riderGeos();
  const grp = new THREE.Group();
  const shirt = SHIRTS[(k * 3 + 1) % SHIRTS.length];
  const torso = new THREE.Mesh(g.torso, shirt), head = new THREE.Mesh(g.head, SKINS[k % SKINS.length]);
  torso.castShadow = head.castShadow = true;
  grp.add(torso, head);
  const arms = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(s * 0.062, 0.15, 0);
    const arm = new THREE.Mesh(g.arm, shirt);
    pv.add(arm);
    grp.add(pv);
    arms.push(pv);
  }
  grp.userData.arms = arms;
  grp.userData.up = null;
  setArms(grp, false);
  return grp;
}
function setArms(rider, up) {
  if (rider.userData.up === up) return;
  rider.userData.up = up;
  const [l, r] = rider.userData.arms;
  if (up) { l.rotation.set(0, 0, 0.28); r.rotation.set(0, 0, -0.28); }
  else { l.rotation.set(1.3, 0, 0.15); r.rotation.set(1.3, 0, -0.15); }
}

const carCache = {};
function carGeos(kind) {
  if (carCache[kind]) return carCache[kind];
  const body = new Merge(), dark = new Merge(), steel = new Merge(), lens = new Merge(), wheels = new Merge();
  const SPH = new THREE.SphereGeometry(1, 14, 10);
  body.add(new RoundedBoxGeometry(0.36, 0.12, 0.5, 3, 0.04), 0, 0.17, 0);
  if (kind === 'front') {
    body.add(SPH, 0, 0.15, 0.3, 0, 0, 0, 0.175, 0.07, 0.2);
    for (const s of [-1, 1]) lens.add(SPH, s * 0.075, 0.155, 0.468, 0, 0, 0, 0.024, 0.024, 0.024);
  } else if (kind === 'last') {
    body.add(SPH, 0, 0.16, -0.27, 0, 0, 0, 0.15, 0.06, 0.1);
  }
  dark.box(0, 0.1, 0, 0.2, 0.04, 0.42);
  const seat = new RoundedBoxGeometry(0.26, 0.05, 0.12, 2, 0.02), back = new RoundedBoxGeometry(0.26, 0.15, 0.04, 2, 0.015);
  const arc = new THREE.TorusGeometry(0.075, 0.011, 6, 12, Math.PI);
  for (const z of [-0.13, 0.1]) {
    dark.add(seat, 0, 0.245, z);
    dark.add(back, 0, 0.31, z - 0.065);
    steel.add(arc, 0, 0.245, z + 0.09);
    steel.cyl(0, 0.255, z + 0.075, 0.01, 0.04, Math.PI / 2);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    wheels.cyl(sx * 0.155, 0.075, sz * 0.17, 0.045, 0.035, 0, Math.PI / 2);
    wheels.cyl(sx * 0.115, 0.04, sz * 0.17, 0.03, 0.03);
    wheels.cyl(sx * 0.15, -0.045, sz * 0.17, 0.03, 0.03, 0, Math.PI / 2);
    steel.box(sx * 0.19, 0.04, sz * 0.17, 0.014, 0.17, 0.05);
  }
  if (kind !== 'last') steel.box(0, 0.1, -0.31, 0.03, 0.03, 0.14);
  SPH.dispose();
  return (carCache[kind] = { body: body.build(), dark: dark.build(), steel: steel.build(), wheels: wheels.build(), lens: lens.build() });
}

export function buildTrain(color) {
  const group = new THREE.Group();
  const paint = [];
  const m = mats();
  const body = paintMat(color);
  paint.push(body);
  const lensM = new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#fff2c0', emissiveIntensity: 0.6 });
  const cars = [];
  for (let i = 0; i < CARS; i++) {
    const kind = i === 0 ? 'front' : i === CARS - 1 ? 'last' : 'mid';
    const gs = carGeos(kind);
    const car = new THREE.Group();
    car.add(meshOf(gs.body, body), meshOf(gs.dark, m.dark), meshOf(gs.steel, m.steel), meshOf(gs.wheels, m.wheel, false));
    if (gs.lens) car.add(meshOf(gs.lens, lensM, false));
    const seats = [];
    for (const z of [-0.13, 0.1]) {
      const r = makeRider(i * 2 + seats.length);
      r.position.set(0, 0.27, z);
      r.visible = false;
      car.add(r);
      seats.push(r);
    }
    car.userData.seats = seats;
    group.add(car);
    cars.push(car);
  }
  return { group, cars, paint, glow: [lensM] };
}

// --- ride dynamics: chain lift to the highest point, then gravity does the work ---
export function analyse(curve) {
  const L = curve.getLength();
  let peakY = -1, uPeak = 0, maxY = 0, drops = 0, prevY = null, falling = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    curve.getPointAt(u, p);
    if (p.y > peakY + 1e-4) { peakY = p.y; uPeak = u; }
    maxY = Math.max(maxY, p.y);
    if (prevY !== null) {
      if (p.y < prevY - 1e-3) falling += prevY - p.y;
      else { if (falling > 0.6) drops++; falling = 0; }
    }
    prevY = p.y;
  }
  return { L, peakY, uPeak, maxY, drops };
}

export function speedAt(info, curve, u) {
  if (u < info.uPeak) return 1.8;
  const y = curve.getPointAt(((u % 1) + 1) % 1).y;
  return clamp(2.4 * Math.sqrt(Math.max(0, info.peakY - y) + 0.05), 1.6, 9);
}

export function lapTime(info, curve) {
  let u = 0, t = 0;
  while (u < 1 && t < 300) {
    u += (speedAt(info, curve, u) * 0.05) / info.L;
    t += 0.05;
  }
  return t;
}

export function coasterExcitement(info) {
  const h = (info.maxY - BASE) / UNIT;
  return +clamp(2 + h * 0.8 + info.L / 14 + info.drops * 0.6, 2, 10).toFixed(1);
}

export const carSpacingU = (L) => CAR_GAP / L;

const _tp = new THREE.Vector3(), _tt = new THREE.Vector3(), _t0 = new THREE.Vector3(), _t1 = new THREE.Vector3();
const _up = new THREE.Vector3(), _sd = new THREE.Vector3();
export function placeTrain(train, curve, L, headU, riders) {
  const e = 0.25 / L;
  if (train.glow) { const v = 0.5 + G.glow * 1.3; if (train.glow[0].emissiveIntensity !== v) train.glow.forEach((gm) => (gm.emissiveIntensity = v)); }
  train.cars.forEach((car, i) => {
    const u = (((headU - i * carSpacingU(L)) % 1) + 1) % 1;
    curve.getPointAt(u, _tp);
    curve.getTangentAt(u, _tt);
    curve.getTangentAt((u + e) % 1, _t1);
    curve.getTangentAt((u - e + 1) % 1, _t0);
    makeFrame(_tt, (_t1.x - _t0.x) / 0.5, (_t1.z - _t0.z) / 0.5, _up, _sd);
    car.position.copy(_tp);
    car.quaternion.setFromRotationMatrix(_mb.makeBasis(_x.copy(_sd).negate(), _up, _tt));
    const armsUp = _tt.y < -0.2;
    car.userData.seats.forEach((s, j) => {
      s.visible = i * 2 + j < riders;
      if (s.visible) setArms(s, armsUp);
    });
  });
}

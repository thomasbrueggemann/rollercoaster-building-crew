// Shared building blocks for procedural models: geometry cache, static-geometry batching,
// instanced bulbs and a per-build material kit (paint / glow bookkeeping).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isLow, isUltra } from '../quality.js';

// radial segment count by quality tier
export const seg = (n) => (isLow() ? Math.max(6, n >> 1) : isUltra() ? Math.ceil(n * 1.25) : n);

// ---------- geometry cache (shared by every model instance) ----------
const cache = new Map();
export const geo = (key, make) => {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
};
export const BOX = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const RBOX = (w, h, d, r) => geo(`rb${w},${h},${d},${r},${isLow()}`, () => new RoundedBoxGeometry(w, h, d, isLow() ? 1 : 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
export const CYL = (rt, rb, h, s = 12, open = false, ts = 0, tl = Math.PI * 2) => geo(`c${rt},${rb},${h},${s},${open},${ts},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl));
export const SPH = (r, s = 12, tl = Math.PI) => geo(`s${r},${s},${tl}`, () => new THREE.SphereGeometry(r, s, Math.max(4, (s * 0.7) | 0), 0, Math.PI * 2, 0, tl));
export const TORUS = (r, t, rs = 6, ts = 24, arc = Math.PI * 2) => geo(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
export const LATHE = (key, pts, s = 24, ps = 0, pl = Math.PI * 2) => geo(`l${key},${s},${ps},${pl}`, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), s, ps, pl));

// ---------- batching: collect many parts, bake transforms, merge per material ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Batch {
  constructor() { this.map = new Map(); }
  // raw, centre-based placement with optional euler rotation and scale
  put(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    return this._push(g, m, _m);
  }
  _push(g, m, mat) {
    const c = g.clone().applyMatrix4(mat);
    let l = this.map.get(m);
    if (!l) this.map.set(m, (l = []));
    l.push(c);
    return this;
  }
  // bottom-based primitives (y = bottom)
  box(w, h, d, m, x = 0, y = 0, z = 0, ry = 0) { return this.put(BOX(w, h, d), m, x, y + h / 2, z, 0, ry, 0); }
  rbox(w, h, d, r, m, x = 0, y = 0, z = 0, ry = 0) { return this.put(RBOX(w, h, d, r), m, x, y + h / 2, z, 0, ry, 0); }
  cyl(rt, rb, h, m, x = 0, y = 0, z = 0, s = 12) { return this.put(CYL(rt, rb, h, s), m, x, y + h / 2, z); }
  // centre-based
  sph(r, m, x = 0, y = 0, z = 0, s = 10, sx = 1, sy = 1, sz = 1) { return this.put(SPH(r, s), m, x, y, z, 0, 0, 0, sx, sy, sz); }
  // cylinder between two points
  rod(a, b, r, m, s = 5) {
    _a.set(...a); _b.set(...b);
    const len = _a.distanceTo(_b);
    _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    _m.compose(_v.copy(_a).add(_b).multiplyScalar(0.5), _q, _s.set(1, len, 1));
    return this._push(CYL(r, r, 1, s), m, _m);
  }
  // square beam between two points
  beam(a, b, t, m) {
    _a.set(...a); _b.set(...b);
    const len = _a.distanceTo(_b);
    _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    _m.compose(_v.copy(_a).add(_b).multiplyScalar(0.5), _q, _s.set(1, len, 1));
    return this._push(BOX(t, 1, t), m, _m);
  }
  flush(parent, { shadow = true } = {}) {
    for (const [m, list] of this.map) {
      const allIdx = list.every((g) => g.index);
      const gs = allIdx ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of gs) for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      const merged = mergeGeometries(gs, false);
      if (!merged) continue;
      const o = new THREE.Mesh(merged, m);
      o.castShadow = shadow; o.receiveShadow = true;
      parent.add(o);
    }
    this.map.clear();
    return parent;
  }
}

// ---------- instanced bulbs (one draw call per set; glow via shared emissive material) ----------
export function bulbs(m, pts, r = 0.03, s = 6) {
  const im = new THREE.InstancedMesh(SPH(r, s), m, pts.length);
  pts.forEach((p, i) => { _m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, _m); });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false; im.receiveShadow = false;
  return im;
}
export const ring = (n, r, y, off = 0) => Array.from({ length: n }, (_, i) => { const a = off + (i / n) * Math.PI * 2; return [Math.sin(a) * r, y, Math.cos(a) * r]; });

// a plain mesh (cached geometry) helper for animated pieces
export function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}

// ---------- per-build material kit ----------
export function kit(color) {
  const paint = [], glow = [];
  const phys = !isLow();
  return {
    paint, glow, color,
    // painted surface: .color is the visible hue (game overwrites it). Glossy clearcoat on medium/ultra.
    P(c = color, o = {}) {
      const { clearcoat = 0.55, clearcoatRoughness = 0.25, ...rest } = o;
      const m = phys
        ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, metalness: 0.05, clearcoat, clearcoatRoughness, ...rest })
        : new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...rest });
      paint.push(m);
      return m;
    },
    M: (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }),
    // metal tuned to look fine without an environment map
    steel: (c = '#dfe3e8', r = 0.38, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: r, ...o }),
    // glossy lacquer / car paint in a fixed colour
    lacquer: (c, o = {}) => (phys
      ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, ...o })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o })),
    glass: (c = '#bfe6ff', op = 0.35) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, metalness: 0, transparent: true, opacity: op, depthWrite: false, clearcoat: phys ? 1 : 0 }),
    // emissive bulb / neon (intensity driven by the game)
    L(c, base) {
      const m = new THREE.MeshStandardMaterial({ color: base || c, emissive: c, emissiveIntensity: 0.3, roughness: 0.3 });
      glow.push(m);
      return m;
    },
    // glowing sign plaque: texture is both colour and emissive map
    sign(tex, glowing = true) {
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
      if (glowing) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = tex; m.emissiveIntensity = 0.2; glow.push(m); }
      return m;
    },
  };
}
export const done = (k, group, animate = () => {}, top = 1.5) => ({ group, paint: k.paint, glow: k.glow, animate, top });

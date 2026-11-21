// CPU-simulated pooled emitter on top of Particles (one draw call, no per-particle allocation).
import { Particles } from './particles.js';

const S = 20; // floats of simulation state per particle
const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, LIFE = 6, MAX = 7, SZ = 8, GROW = 9, ROT = 10, ROTV = 11,
  A0 = 12, R = 13, G = 14, B = 15, DRAG = 16, GRAV = 17, TILE = 18, FADE = 19;

export class Emitter {
  constructor(scene, cap, opts = {}) {
    this.ps = new Particles(cap, opts);
    this.cap = cap;
    this.n = 0;
    this.st = new Float32Array(cap * S);
    this.fadeOut = opts.fadeOut ?? 1;
    scene.add(this.ps.points);
  }
  get free() { return this.cap - this.n; }
  emit(o) {
    if (this.n >= this.cap) return false;
    const k = this.n++ * S, s = this.st;
    s[k + X] = o.x; s[k + Y] = o.y; s[k + Z] = o.z;
    s[k + VX] = o.vx || 0; s[k + VY] = o.vy || 0; s[k + VZ] = o.vz || 0;
    s[k + LIFE] = s[k + MAX] = o.life;
    s[k + SZ] = o.size; s[k + GROW] = o.grow || 0;
    s[k + ROT] = o.rot || 0; s[k + ROTV] = o.rotV || 0;
    s[k + A0] = o.a ?? 0.5;
    s[k + R] = o.r ?? 1; s[k + G] = o.g ?? 1; s[k + B] = o.b ?? 1;
    s[k + DRAG] = o.drag || 0; s[k + GRAV] = o.grav || 0;
    s[k + TILE] = o.tile ?? 0; s[k + FADE] = o.fadeIn ?? 0.15;
    return true;
  }
  update(dt) {
    const s = this.st, ps = this.ps;
    if (this.n === 0) { if (ps.n) ps.setCount(0); return; }
    for (let i = 0; i < this.n; ) {
      const k = i * S;
      s[k + LIFE] -= dt;
      if (s[k + LIFE] <= 0) {
        const last = --this.n;
        if (i !== last) { s.copyWithin(k, last * S, last * S + S); }
        continue;
      }
      const d = Math.exp(-s[k + DRAG] * dt);
      s[k + VX] *= d; s[k + VY] = s[k + VY] * d - s[k + GRAV] * dt; s[k + VZ] *= d;
      s[k + X] += s[k + VX] * dt; s[k + Y] += s[k + VY] * dt; s[k + Z] += s[k + VZ] * dt;
      s[k + ROT] += s[k + ROTV] * dt;
      i++;
    }
    for (let i = 0; i < this.n; i++) {
      const k = i * S;
      const age = 1 - s[k + LIFE] / s[k + MAX];
      const fi = s[k + FADE] > 0 ? Math.min(1, age / s[k + FADE]) : 1;
      const fo = Math.pow(1 - age, this.fadeOut);
      ps.set(i, s[k + X], s[k + Y], s[k + Z], s[k + SZ] * (1 + s[k + GROW] * age),
        s[k + R], s[k + G], s[k + B], s[k + A0] * fi * fo, s[k + ROT], s[k + TILE]);
    }
    ps.setCount(this.n);
    ps.flush();
  }
}

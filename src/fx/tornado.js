// Volumetric-looking tornado: hundreds of soft dust sprites spiralling up a funnel,
// a dark core, a ground dust skirt, a contact ring and orbiting / ejected debris.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { isUltra, isLow } from '../quality.js';
import { dustPuff } from '../effects.js';

const T = isUltra() ? 0 : isLow() ? 2 : 1;
const N_FUNNEL = [900, 520, 200][T];
const N_SKIRT = [170, 100, 36][T];
const N_CORE = [70, 40, 16][T];
const N_DEBRIS = [52, 30, 12][T];
const H = 5.8;
const rad = (h) => 0.2 + h * 0.4;
const rnd = (a, b) => a + Math.random() * (b - a);

export class TornadoFx {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    const n = N_FUNNEL + N_SKIRT + N_CORE;
    this.ps = new Particles(n);
    this.group.add(this.ps.points);
    this.ps.setCount(n);
    const mk = (count, f) => Array.from({ length: count }, f);
    this.funnel = mk(N_FUNNEL, () => ({ h0: Math.random(), a0: rnd(0, 6.283), j: rnd(0.55, 1.15), s: rnd(0.7, 1.3), w: rnd(0.85, 1.15), tile: (Math.random() * 3) | 0, shade: Math.random(), rv: rnd(-0.8, 0.8) }));
    this.skirt = mk(N_SKIRT, () => ({ a0: rnd(0, 6.283), r: rnd(0.3, 1), h: Math.random(), s: rnd(0.6, 1.2), w: rnd(0.8, 1.4), tile: (Math.random() * 3) | 0, rv: rnd(-1, 1) }));
    this.core = mk(N_CORE, () => ({ h0: Math.random(), a0: rnd(0, 6.283), s: rnd(0.8, 1.3), tile: (Math.random() * 3) | 0 }));

    // ground contact rings
    const ringMat = new THREE.MeshBasicMaterial({ color: '#2e2418', transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.025;
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 32), ringMat);
    this.ring2.rotation.x = -Math.PI / 2;
    this.ring2.position.y = 0.03;
    this.group.add(this.ring, this.ring2);

    // debris
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    this.im = new THREE.InstancedMesh(geo, mat, N_DEBRIS);
    this.im.frustumCulled = false;
    this.im.castShadow = !isLow();
    const cols = ['#6d4c41', '#8a6a4a', '#495057', '#2f6b3a', '#3f8a46', '#b0a08a'];
    const c = new THREE.Color();
    this.debris = mk(N_DEBRIS, (_, i) => {
      const leaf = i % 3 === 0;
      this.im.setColorAt(i, c.set(leaf ? cols[3 + (i % 2)] : cols[i % 3 === 1 ? 0 : 1 + (i % 2)]));
      return {
        a: rnd(0, 6.283), h: rnd(0.2, 4.8), sp: rnd(3, 7), rf: rnd(0.9, 1.4), fly: false, v: new THREE.Vector3(), p: new THREE.Vector3(),
        sc: leaf ? [0.14, 0.012, 0.1] : [rnd(0.16, 0.34), 0.035, rnd(0.05, 0.1)], rx: rnd(0, 6), ry: rnd(0, 6), rxv: rnd(3, 9), ryv: rnd(2, 6), life: 0,
      };
    });
    this.group.add(this.im);
    this._o = new THREE.Object3D();
    this.dustAcc = 0;
  }

  update(sdt, wx, wz) {
    if (sdt <= 0) return;
    this.t += sdt;
    const t = this.t, ps = this.ps;
    let k = 0;
    const sway = (h) => [Math.sin(t * 2 + h * 0.9) * 0.1 * h, Math.cos(t * 2 + h * 0.9) * 0.1 * h];
    // funnel
    for (const p of this.funnel) {
      const hh = ((p.h0 + t * 0.07 * p.w) % 1) * H;
      const a = p.a0 + t * (6.5 - hh * 0.55) * p.w;
      const r = rad(hh) * p.j + p.rv * 0.12;
      const [sx, sz] = sway(hh);
      const f = hh / H;
      const edge = Math.min(1, hh / 0.5) * Math.min(1, (H - hh) / 1.2);
      const mix = f * 0.85 + p.shade * 0.15;
      // dark brown dust near the ground -> grey cloud at the top
      const brown = Math.max(0, 1 - f * 2.4);
      const v = 0.2 + mix * 0.42;
      ps.set(k++, sx + Math.cos(a) * r, hh, sz + Math.sin(a) * r, (0.42 + hh * 0.2) * p.s,
        v + brown * 0.16, v + brown * 0.07, v - brown * 0.04, 0.2 * edge, a * 0.5, p.tile);
    }
    // dust skirt on the ground
    for (const p of this.skirt) {
      const a = p.a0 + t * (3 + p.w) * (1.4 - p.r * 0.6);
      const rr = (0.5 + p.r * 2.4) * (0.9 + Math.sin(t * 2 + p.a0) * 0.1);
      const y = 0.08 + ((p.h + t * 0.5 * p.w) % 1) * 0.7;
      ps.set(k++, Math.cos(a) * rr, y, Math.sin(a) * rr, (0.6 + p.r * 0.5) * p.s,
        0.5, 0.42, 0.32, 0.26 * (1 - (y - 0.08) / 0.7), a, p.tile);
    }
    // dark core
    for (const p of this.core) {
      const hh = ((p.h0 + t * 0.1) % 1) * H;
      const a = p.a0 + t * 4;
      const [sx, sz] = sway(hh);
      const r = rad(hh) * 0.28;
      ps.set(k++, sx + Math.cos(a) * r, hh, sz + Math.sin(a) * r, (0.55 + hh * 0.16) * p.s, 0.1, 0.1, 0.11,
        0.28 * Math.min(1, hh / 0.6) * Math.min(1, (H - hh) / 1.5), a, p.tile);
    }
    ps.flush();

    // rings
    const pulse = 1 + Math.sin(t * 5) * 0.06;
    this.ring.scale.setScalar(1.9 * pulse);
    this.ring2.scale.setScalar(1.2 * pulse);
    this.ring.rotation.z += sdt * 1.5;

    // debris
    const o = this._o;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.fly) {
        d.life += sdt;
        d.v.y -= 7 * sdt;
        d.p.addScaledVector(d.v, sdt);
        if (d.p.y < 0.04 || d.life > 2.2) { d.fly = false; d.h = rnd(0.2, 1.5); d.a = rnd(0, 6.283); }
      } else {
        d.a += sdt * d.sp;
        const r = (0.5 + d.h * 0.45) * d.rf;
        d.p.set(Math.cos(d.a) * r, d.h, Math.sin(d.a) * r);
        d.h += Math.sin(t * 1.3 + i) * sdt * 0.2;
        if (Math.random() < sdt * 0.04) {
          d.fly = true; d.life = 0;
          const tx = -Math.sin(d.a), tz = Math.cos(d.a);
          const sp = d.sp * r * 0.8;
          d.v.set(tx * sp + Math.cos(d.a) * 2.5, rnd(1.5, 4), tz * sp + Math.sin(d.a) * 2.5);
        }
      }
      d.rx += sdt * d.rxv; d.ry += sdt * d.ryv;
      o.position.copy(d.p);
      o.rotation.set(d.rx, d.ry, 0);
      o.scale.set(d.sc[0], d.sc[1], d.sc[2]);
      o.updateMatrix();
      this.im.setMatrixAt(i, o.matrix);
    }
    this.im.instanceMatrix.needsUpdate = true;

    // world-space dust kicked up along the path
    this.dustAcc += sdt * (isLow() ? 6 : isUltra() ? 18 : 11);
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const a = Math.random() * 6.283, r = rnd(0.8, 2.6);
      dustPuff(wx + Math.cos(a) * r, 0.1, wz + Math.sin(a) * r, { size: 0.6, a: 0.32, speed: 2.4, rise: 1.2, tone: 0.5 });
    }
  }

  dispose() {
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.im.dispose();
  }
}

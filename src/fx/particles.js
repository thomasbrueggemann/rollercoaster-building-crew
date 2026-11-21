// Pooled billboard particle system: one Points draw call, CPU-simulated by the owner.
// Per-particle size (world units), colour, alpha, rotation, atlas tile.
import * as THREE from 'three';
import { U, puffAtlas } from './shared.js';

const VERT = /* glsl */`
  attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aRot; attribute float aTile;
  varying vec3 vColor; varying float vAlpha; varying float vRot; varying float vTile;
  uniform float uPx;
  void main() {
    vColor = aColor; vAlpha = aAlpha; vRot = aRot; vTile = aTile;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aAlpha <= 0.001 ? 0.0 : aSize * uPx;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uMap; uniform float uLight; uniform float uSquash; uniform float uFlat;
  varying vec3 vColor; varying float vAlpha; varying float vRot; varying float vTile;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    if (uFlat > 0.5) p.y /= uSquash;            // lie flat on the ground in the isometric view
    float cs = cos(vRot), sn = sin(vRot);
    p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    vec2 cell = vec2(mod(vTile, 2.0), floor(vTile / 2.0));
    vec4 t = texture2D(uMap, (p + cell) * 0.5);
    float a = t.a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * uLight, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Particles {
  constructor(cap, { additive = false, flat = false, light = true } = {}) {
    this.cap = cap;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    this.tile = new Float32Array(cap);
    const dyn = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('aSize', dyn(this.size, 1));
    g.setAttribute('aColor', dyn(this.col, 3));
    g.setAttribute('aAlpha', dyn(this.alpha, 1));
    g.setAttribute('aRot', dyn(this.rot, 1));
    g.setAttribute('aTile', dyn(this.tile, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uPx: U.uPx, uSquash: U.uSquash,
        uLight: light ? U.uLight : { value: 1 },
        uMap: { value: puffAtlas() },
        uFlat: { value: flat ? 1 : 0 },
      },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  // set the number of live particles; owner fills arrays [0..n)
  setCount(n) {
    this.n = n;
    this.geo.setDrawRange(0, n);
  }
  set(i, x, y, z, size, r, g, b, a, rot = 0, tile = 0) {
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.size[i] = size;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.alpha[i] = a; this.rot[i] = rot; this.tile[i] = tile;
  }
  copy(dst, src) {
    this.pos.copyWithin(dst * 3, src * 3, src * 3 + 3);
    this.col.copyWithin(dst * 3, src * 3, src * 3 + 3);
    this.size[dst] = this.size[src]; this.alpha[dst] = this.alpha[src];
    this.rot[dst] = this.rot[src]; this.tile[dst] = this.tile[src];
  }
  flush() {
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aColor.needsUpdate =
      a.aAlpha.needsUpdate = a.aRot.needsUpdate = a.aTile.needsUpdate = true;
  }
}

// Rain (GPU-animated instanced streaks) + lightning (flash light, screen flash, jagged bolt).
import * as THREE from 'three';
import { scene, camera, cam, renderer } from '../scene.js';
import { U } from './shared.js';
import { isUltra, isLow } from '../quality.js';

export const RAIN_COUNT = isUltra() ? 6000 : isLow() ? 1200 : 3000;

const RAIN_VERT = /* glsl */`
  attribute vec2 corner; attribute vec4 aSeed;
  uniform float uTime, uArea, uIntensity, uWidth, uSpeed, uHeight;
  uniform vec2 uCenter, uWind, uRes;
  varying float vA;
  void main() {
    float vis = step(aSeed.w, uIntensity);
    vec2 rel = mod(aSeed.xy * uArea - uCenter + uArea * 0.5, uArea) - uArea * 0.5;
    float sp = uSpeed * (0.85 + fract(aSeed.z * 17.3) * 0.3);
    float y = mod(aSeed.z * uHeight - uTime * sp, uHeight);
    float len = 0.45 + fract(aSeed.x * 91.7) * 0.25;
    vec2 xz = uCenter + rel + uWind * (uHeight - y) * 0.06;
    vec3 bot = vec3(xz.x, y, xz.y);
    vec3 top = bot + vec3(uWind.x * 0.06 * len * 4.0, len, uWind.y * 0.06 * len * 4.0);
    vec4 cb = projectionMatrix * viewMatrix * vec4(bot, 1.0);
    vec4 ct = projectionMatrix * viewMatrix * vec4(top, 1.0);
    vec2 sb = cb.xy / cb.w * uRes * 0.5, st = ct.xy / ct.w * uRes * 0.5;
    vec2 d = st - sb; float dl = length(d);
    d = dl > 0.001 ? d / dl : vec2(0.0, 1.0);
    vec2 n = vec2(-d.y, d.x);
    vec2 p = mix(sb, st, corner.y) + n * corner.x * uWidth * 0.5;
    gl_Position = vec4(p / (uRes * 0.5), mix(cb.z / cb.w, ct.z / ct.w, corner.y), 1.0);
    vA = vis * mix(1.0, 0.12, corner.y) * smoothstep(0.0, 0.5, y) * smoothstep(0.0, 1.0, uHeight - y);
    if (vis < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha, uLight;
  varying float vA;
  void main() { gl_FragColor = vec4(uColor * uLight, vA * uAlpha); }`;

const rainU = {
  uTime: { value: 0 }, uArea: { value: 40 }, uIntensity: { value: 0 }, uWidth: { value: 1.3 }, uSpeed: { value: 20 },
  uHeight: { value: 15 }, uCenter: { value: new THREE.Vector2() }, uWind: { value: new THREE.Vector2(-1.2, -0.6) },
  uRes: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color('#cfe0f5') }, uAlpha: { value: 0.5 },
  uLight: U.uLight,
};
let rain = null;
function makeRain() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(RAIN_COUNT * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = RAIN_COUNT;
  const m = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: rainU, transparent: true, depthWrite: false });
  rain = new THREE.Mesh(g, m);
  rain.frustumCulled = false;
  rain.renderOrder = 6;
  rain.visible = false;
  scene.add(rain);
}

// ---------- lightning ----------
let flashLight, flashEl, bolt, boltMat;
let strikeT = -10;      // performance.now()/1000 of last strike
let strikeAmp = 1;
let nextStrike = 3;
const _v = new THREE.Vector3();

function makeLightning() {
  flashLight = new THREE.DirectionalLight('#cfe0ff', 0);
  flashLight.position.set(20, 60, 10);
  flashLight.target.position.set(24, 0, 24);
  scene.add(flashLight, flashLight.target);
  if (typeof document !== 'undefined') {
    flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:#dce6ff;opacity:0;mix-blend-mode:screen;z-index:4;';
    document.body.appendChild(flashEl);
  }
  boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 4), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.frustumCulled = false;
  bolt.renderOrder = 20;
  bolt.visible = false;
  scene.add(bolt);
}

function buildBolt(x, z) {
  const right = _v.setFromMatrixColumn(camera.matrixWorld, 0).clone();
  const pts = [];
  const segs = 12, H = 18;
  let cx = x, cz = z;
  for (let i = 0; i <= segs; i++) {
    const y = H * (1 - i / segs);
    pts.push([cx, y, cz, 0.16 * (1 - i / segs * 0.5)]);
    cx += (Math.random() - 0.5) * 1.6; cz += (Math.random() - 0.5) * 1.6;
  }
  // fork
  const f0 = 3 + ((Math.random() * 4) | 0);
  const fork = [];
  let fx = pts[f0][0], fz = pts[f0][2];
  const dx = (Math.random() - 0.5) * 2.6, dz = (Math.random() - 0.5) * 2.6;
  for (let i = 0; i < 5; i++) {
    fork.push([fx, pts[f0][1] - i * 1.4, fz, 0.08 * (1 - i / 6)]);
    fx += dx * 0.5 + (Math.random() - 0.5) * 0.8; fz += dz * 0.5 + (Math.random() - 0.5) * 0.8;
  }
  const lines = [pts, fork];
  const verts = [], idx = [];
  for (const line of lines) {
    const base = verts.length / 3;
    for (const p of line) {
      verts.push(p[0] - right.x * p[3], p[1] - right.y * p[3], p[2] - right.z * p[3]);
      verts.push(p[0] + right.x * p[3], p[1] + right.y * p[3], p[2] + right.z * p[3]);
    }
    for (let i = 0; i < line.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  bolt.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  bolt.geometry = g;
}

export function strike(x, z, amp = 1) {
  if (!bolt) makeLightning();
  buildBolt(x, z);
  strikeT = performance.now() / 1000;
  strikeAmp = amp;
}

function flashEnv(t) {
  // double-flicker envelope in seconds since strike
  if (t < 0 || t > 0.7) return 0;
  const a = t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 9);
  const b = t > 0.16 && t < 0.3 ? 0.7 * Math.sin(((t - 0.16) / 0.14) * Math.PI) : 0;
  return Math.min(1, a + b);
}

export function updateWeather(sdt, storm, strikeAt) {
  if (!rain) makeRain();
  if (!bolt) makeLightning();
  // rain
  const aspect = camera.right / Math.max(0.001, camera.top);
  rainU.uTime.value += sdt;
  rainU.uArea.value = Math.min(120, Math.max(24, cam.view * Math.max(1, aspect) * 2.6));
  rainU.uCenter.value.set(cam.target.x, cam.target.z);
  rainU.uIntensity.value = Math.max(0, Math.min(1, (storm - 0.05) / 0.9)) * (isLow() ? 0.7 : 1);
  rainU.uWind.value.set(-1.2 + Math.sin(rainU.uTime.value * 0.3) * 0.5, -0.6);
  renderer.getDrawingBufferSize(rainU.uRes.value);
  rainU.uWidth.value = 1.1 * renderer.getPixelRatio();
  rain.visible = rainU.uIntensity.value > 0.01;
  // lightning scheduling
  if (storm > 0.55 && sdt > 0) {
    nextStrike -= sdt;
    if (nextStrike <= 0) {
      nextStrike = (2 + Math.random() * 5) / (0.6 + storm * 0.6);
      const p = strikeAt ? strikeAt() : null;
      const x = p ? p.x + (Math.random() - 0.5) * 6 : cam.target.x + (Math.random() - 0.5) * 22;
      const z = p ? p.z + (Math.random() - 0.5) * 6 : cam.target.z + (Math.random() - 0.5) * 22;
      strike(x, z, 0.7 + Math.random() * 0.5);
    }
  }
  const t = performance.now() / 1000 - strikeT;
  const f = flashEnv(t) * strikeAmp;
  flashLight.intensity = f * 5;
  flashLight.target.position.set(cam.target.x, 0, cam.target.z);
  flashLight.position.set(cam.target.x + 20, 60, cam.target.z + 10);
  if (flashEl) flashEl.style.opacity = (f * 0.14).toFixed(3);
  bolt.visible = t >= 0 && t < 0.28;
  boltMat.opacity = bolt.visible ? Math.min(1, flashEnv(t) * 1.4) : 0;
}

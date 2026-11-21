import * as THREE from 'three';
import { N, PLOT, PLOTS, GATE } from './constants.js';
import { G } from './state.js';
import { clamp, lerp } from './util.js';
import { QUALITY, isUltra, isLow } from './quality.js';
import { createPipeline } from './render/pipeline.js';
import { createEnvironment } from './render/sky.js';
import { createTerrainMaterial } from './render/terrain.js';
import { createSeaMaterial, createFloodMaterial, waterUniforms } from './render/water.js';
import { createVegetation } from './render/trees.js';
import { makeWoodTexture } from './render/textures.js';

const LEVEL = QUALITY.level;
export const renderer = new THREE.WebGLRenderer({
  antialias: isLow(), // other tiers use MSAA render targets inside the composer
  powerPreference: 'high-performance',
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in recent three; PCF + radius is soft
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(isUltra() ? 2 : isLow() ? 1 : 1.5, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe2ff');
if (!isLow()) scene.environment = createEnvironment(renderer, isUltra() ? 128 : 64);

// ---------- camera (isometric orthographic) ----------
export const cam = {
  target: new THREE.Vector3(N / 2, 0, N / 2 + 1),
  yaw: Math.PI / 4,
  yawGoal: Math.PI / 4,
  pitch: Math.atan(1 / Math.SQRT2), // true isometric
  view: 11,
  viewGoal: 11,
  shake: new THREE.Vector3(),
};
export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

function applyProjection() {
  const a = window.innerWidth / window.innerHeight;
  camera.left = -cam.view * a;
  camera.right = cam.view * a;
  camera.top = cam.view;
  camera.bottom = -cam.view;
  camera.updateProjectionMatrix();
}
applyProjection();

export function updateCamera(dt) {
  cam.yaw = lerp(cam.yaw, cam.yawGoal, Math.min(1, dt * 8));
  cam.view = lerp(cam.view, cam.viewGoal, Math.min(1, dt * 10));
  cam.target.x = clamp(cam.target.x, -2, N + 2);
  cam.target.z = clamp(cam.target.z, -2, N + 2);
  const D = 100;
  const cp = Math.cos(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * D + cam.shake.x,
    cam.target.y + Math.sin(cam.pitch) * D + cam.shake.y,
    cam.target.z + Math.cos(cam.yaw) * cp * D + cam.shake.z,
  );
  camera.lookAt(cam.target.x + cam.shake.x, cam.target.y + cam.shake.y, cam.target.z + cam.shake.z);
  applyProjection();
}

export function panCamera(dxPx, dyPx) {
  const s = (2 * cam.view) / window.innerHeight;
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  cam.target.addScaledVector(right, -dxPx * s);
  cam.target.addScaledVector(fwd, (dyPx * s) / Math.sin(cam.pitch));
}
export function panWorld(dx, dz) {
  const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  cam.target.addScaledVector(right, dx).addScaledVector(fwd, dz);
}
export const zoomBy = (f) => (cam.viewGoal = clamp(cam.viewGoal * f, 6, 40));
export const rotateCam = (dir) => (cam.yawGoal += (dir * Math.PI) / 2);

window.addEventListener('resize', () => {
  applyProjection();
  pipeline.setSize();
});

// ---------- lights ----------
export const hemi = new THREE.HemisphereLight('#cfeaff', '#4f7a3a', 0.6);
scene.add(hemi);
// single key light: the sun by day, the moon by night (it owns the shadow map)
export const sun = new THREE.DirectionalLight('#fff4dd', 2.2);
const CENTER = new THREE.Vector3(N / 2, 0, N / 2);
sun.target.position.copy(CENTER);
sun.castShadow = true;
{
  const sz = isUltra() ? 4096 : isLow() ? 1024 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const R = 37; // fitted to the island's circumscribed circle
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 230 });
  sun.shadow.bias = isUltra() ? -0.0002 : -0.0005;
  sun.shadow.normalBias = isUltra() ? 0.025 : 0.04;
  sun.shadow.radius = isUltra() ? 3 : 2;
  sun.shadow.blurSamples = 12;
}
scene.add(sun, sun.target);

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), keyDir = new THREE.Vector3();
const SKY = {
  zenithDay: new THREE.Color('#4f9be8'), horizonDay: new THREE.Color('#bfe2ff'),
  zenithDusk: new THREE.Color('#4a5fa8'), horizonDusk: new THREE.Color('#ff9a62'),
  zenithNight: new THREE.Color('#050a1e'), horizonNight: new THREE.Color('#1a2548'),
  zenithStorm: new THREE.Color('#4f5a66'), horizonStorm: new THREE.Color('#7c8794'),
};
const SEA = {
  deepDay: new THREE.Color('#0f5594'), shallowDay: new THREE.Color('#33c9c2'),
  deepNight: new THREE.Color('#041430'), shallowNight: new THREE.Color('#0b2e40'),
  deepStorm: new THREE.Color('#23404f'), shallowStorm: new THREE.Color('#3c6670'),
};
const HEMI_DAY = new THREE.Color('#cfeaff'), HEMI_NIGHT = new THREE.Color('#6f86d6');

export function updateLighting(hour) {
  // daylight 0..1 with soft dawn (5-8h) and dusk (18-21h)
  const d = hour < 12 ? clamp((hour - 5) / 3, 0, 1) : clamp((21 - hour) / 3, 0, 1);
  const day = d * d * (3 - 2 * d);
  G.daylight = day;
  G.glow = 0.15 + (1 - day) * 1.6;
  const storm = G.storm;
  const night = 1 - day;

  // sun path: rises east-ish (-z side), crosses behind the camera's right, sets on the other side
  const t = clamp((hour - 5.5) / 15, 0, 1);
  const el = lerp(0.2, 1.1, Math.sin(Math.PI * t));
  const az = lerp(-0.9, 1.8, t);
  sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  const maz = hour * 0.2 + 2.2;
  moonDir.set(Math.cos(maz) * 0.55, 0.85, Math.sin(maz) * 0.55).normalize();
  const dayMix = clamp(day / 0.3, 0, 1);
  keyDir.copy(moonDir).lerp(sunDir, dayMix * dayMix * (3 - 2 * dayMix)).normalize();
  sun.position.copy(CENTER).addScaledVector(keyDir, 100);

  // warm low sun
  const warm = (1 - clamp((el - 0.2) / 0.5, 0, 1)) * dayMix;
  _c1.setRGB(1, 0.95 - warm * 0.38, 0.88 - warm * 0.62); // sun
  _c2.set('#8fa8ff');                                    // moon
  sun.color.copy(_c2).lerp(_c1, dayMix);
  const sunI = (0.15 + day * 2.2) * (1 - storm * 0.55);
  const moonI = 0.9 * (1 - storm * 0.3);
  sun.intensity = lerp(moonI, sunI, dayMix);

  hemi.intensity = (0.5 + day * 0.1) * (1 - storm * 0.3);
  hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAY, day);
  scene.environmentIntensity = (0.12 + day * 0.42) * (1 - storm * 0.4);

  // sky colours: day / dusk (warm horizon when the sun is low) / night / storm
  const dusk = warm * clamp(day * 2, 0, 1);
  const zen = _c1.copy(SKY.zenithNight).lerp(SKY.zenithDay, day).lerp(SKY.zenithDusk, dusk * 0.6).lerp(SKY.zenithStorm, storm * 0.8);
  const hor = _c2.copy(SKY.horizonNight).lerp(SKY.horizonDay, day).lerp(SKY.horizonDusk, dusk * 0.75).lerp(SKY.horizonStorm, storm * 0.8 * (0.4 + day * 0.6));
  scene.background.copy(hor);

  const wu = waterUniforms;
  wu.uZenith.value.copy(zen);
  wu.uHorizon.value.copy(hor);
  wu.uLightDir.value.copy(keyDir);
  wu.uLightCol.value.copy(sun.color).multiplyScalar(clamp(sun.intensity / 2.2, 0, 1.2) * (dayMix > 0.02 ? 1 : 0.5));
  wu.uAmbient.value = (0.3 + 0.7 * day) * (1 - storm * 0.35);
  wu.uNight.value = night;
  wu.uStorm.value = storm;
  wu.uDeep.value.copy(SEA.deepNight).lerp(SEA.deepDay, day).lerp(SEA.deepStorm, storm * 0.7);
  wu.uShallow.value.copy(SEA.shallowNight).lerp(SEA.shallowDay, day).lerp(SEA.shallowStorm, storm * 0.6);

  pipeline.setLook(day, storm);
}

// ---------- pipeline ----------
const pipeline = createPipeline(renderer, scene, camera, LEVEL);
let lastT = performance.now(), ema = 1 / 60, slow = 0, age = 0;
export function renderFrame() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastT) / 1000);
  lastT = now;
  waterUniforms.uTime.value = now / 1000;
  // back off quality if we are clearly too slow (ignore the first seconds: shader compiles)
  age += dt;
  if (age > 4 && dt < 0.2) {
    ema = ema * 0.95 + dt * 0.05;
    slow = ema > 1 / 28 ? slow + dt : Math.max(0, slow - dt);
    if (slow > 3) { slow = 0; ema = 1 / 60; pipeline.degrade(); }
  }
  pipeline.render(dt);
}

// ---------- sea + island tiles ----------
export const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), createSeaMaterial(N));
sea.rotation.x = -Math.PI / 2;
sea.position.set(N / 2, -0.7, N / 2);
scene.add(sea);

const tileGeo = new THREE.BoxGeometry(1, 1.4, 1);
export const tiles = new THREE.InstancedMesh(tileGeo, createTerrainMaterial(N, isUltra() ? 8 : 4), N * N);
tiles.receiveShadow = true;
{
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      m.setPosition(x + 0.5, -0.7, z + 0.5);
      tiles.setMatrixAt(z * N + x, m);
      tiles.setColorAt(z * N + x, c.set('#6fbf5f'));
    }
}
scene.add(tiles);

const COL = {
  ownA: new THREE.Color('#7ccd63'), ownB: new THREE.Color('#74c35c'),
  saleA: new THREE.Color('#d6cf6a'), saleB: new THREE.Color('#cbc563'),
  wildA: new THREE.Color('#5f9b52'), wildB: new THREE.Color('#5a944e'),
};
export function plotBuyable(px, pz) {
  if (px < 0 || pz < 0 || px >= PLOTS || pz >= PLOTS || G.owned[pz][px]) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => G.owned[pz + dz]?.[px + dx]);
}
export function refreshTiles() {
  const landMode = G.tool.mode === 'land';
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const px = Math.floor(x / PLOT), pz = Math.floor(z / PLOT);
      const chk = (x + z) % 2 === 0;
      let c;
      if (G.owned[pz][px]) c = chk ? COL.ownA : COL.ownB;
      else if (landMode && plotBuyable(px, pz)) c = chk ? COL.saleA : COL.saleB;
      else c = chk ? COL.wildA : COL.wildB;
      tiles.setColorAt(z * N + x, c);
    }
  tiles.instanceColor.needsUpdate = true;
  rebuildFences();
}

// wild (unowned) land gets trees, bushes, rocks (and grass tufts on ultra) so it reads as "not yours yet"
const vegetation = createVegetation(scene, { tufts: isUltra() });
export function rebuildWildTrees() {
  vegetation(N, (x, z) => G.owned[Math.floor(z / PLOT)][Math.floor(x / PLOT)]);
}

// ---------- fences around owned land ----------
let fence = null;
const fenceGeo = new THREE.BoxGeometry(1, 0.08, 0.06);
const postGeo = new THREE.BoxGeometry(0.08, 0.36, 0.08);
const woodTex = makeWoodTexture(128);
const fenceMat = new THREE.MeshStandardMaterial({ color: '#f1dcb4', map: woodTex, roughness: 0.78, metalness: 0 });
const postMat = new THREE.MeshStandardMaterial({ color: '#d8bd90', map: woodTex, roughness: 0.82, metalness: 0 });
function rebuildFences() {
  if (fence) { scene.remove(fence); fence.children.forEach((c) => c.dispose?.()); }
  fence = new THREE.Group();
  const rails = [], posts = [];
  const owned = (x, z) => x >= 0 && z >= 0 && x < N && z < N && G.owned[Math.floor(z / PLOT)][Math.floor(x / PLOT)];
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!owned(x, z)) continue;
      if (!owned(x, z + 1) && !(z === GATE.z && x >= GATE.x - 1 && x <= GATE.x + GATE.w)) rails.push([x + 0.5, z + 1, 0]);
      if (!owned(x, z - 1)) rails.push([x + 0.5, z, 0]);
      if (!owned(x + 1, z)) rails.push([x + 1, z + 0.5, 1]);
      if (!owned(x - 1, z)) rails.push([x, z + 0.5, 1]);
    }
  const rm = new THREE.InstancedMesh(fenceGeo, fenceMat, rails.length * 2);
  const pm = new THREE.InstancedMesh(postGeo, postMat, rails.length);
  const o = new THREE.Object3D();
  rails.forEach(([x, z, v], i) => {
    o.rotation.set(0, v ? Math.PI / 2 : 0, 0);
    o.position.set(x, 0.18, z); o.updateMatrix(); rm.setMatrixAt(i * 2, o.matrix);
    o.position.set(x, 0.32, z); o.updateMatrix(); rm.setMatrixAt(i * 2 + 1, o.matrix);
    o.rotation.set(0, 0, 0);
    o.position.set(v ? x : x - 0.5, 0.18, v ? z - 0.5 : z); o.updateMatrix(); pm.setMatrixAt(i, o.matrix);
  });
  rm.castShadow = pm.castShadow = true;
  rm.frustumCulled = pm.frustumCulled = false;
  fence.add(rm, pm);
  scene.add(fence);
}

// ---------- park gate ----------
export function buildGate() {
  const g = new THREE.Group();
  const pillar = new THREE.MeshPhysicalMaterial({ color: '#ff5d73', metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  const sign = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.55, roughness: 0.3, emissive: '#ffb703', emissiveIntensity: 0.2 });
  for (const x of [GATE.x - 0.5, GATE.x + GATE.w + 0.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.2, 0.45), pillar);
    p.position.set(x, 1.1, GATE.z + 0.5);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 4), sign);
    cap.position.set(x, 2.45, GATE.z + 0.5);
    cap.rotation.y = Math.PI / 4;
    p.castShadow = cap.castShadow = true;
    g.add(p, cap);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const c2 = canvas.getContext('2d');
  c2.fillStyle = '#ffd23f'; c2.fillRect(0, 0, 512, 96);
  c2.fillStyle = '#2b2d42'; c2.font = 'bold 44px ui-rounded, system-ui, sans-serif';
  c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillText('COASTER CREW PARK', 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(GATE.w + 1.6, 0.6, 0.12),
    [sign, sign, sign, sign, new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }), new THREE.MeshStandardMaterial({ map: tex })],
  );
  banner.position.set(GATE.x + GATE.w / 2, 2.0, GATE.z + 0.5);
  banner.castShadow = true;
  g.add(banner);
  g.userData.signMat = sign;
  scene.add(g);
  return g;
}

// ---------- flood water ----------
export const water = new THREE.Mesh(new THREE.PlaneGeometry(N + 6, N + 6), createFloodMaterial());
water.rotation.x = -Math.PI / 2;
water.position.set(N / 2, -0.6, N / 2);
water.visible = false;
scene.add(water);

// ---------- overlays: hover tile / plot / footprint ----------
function overlay(color, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  m.visible = false;
  scene.add(m);
  return m;
}
export const footprint = overlay('#4ade80', 0.45);
export const plotHover = overlay('#ffe066', 0.35);
export const selection = new THREE.Group();
scene.add(selection);
const selMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
const selGeo = new THREE.PlaneGeometry(1, 1);
export function showSelection(rects) {
  selection.clear();
  for (const [x, z, w, d] of rects) {
    const m = new THREE.Mesh(selGeo, selMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + w / 2, 0.03, z + d / 2);
    m.scale.set(w, d, 1);
    m.renderOrder = 2;
    selection.add(m);
  }
}
export function pulseSelection(t) {
  selMat.opacity = 0.25 + Math.sin(t * 5) * 0.12;
}

// ---------- picking ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function setPointer(clientX, clientY) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
export function groundPoint() {
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(ground, p) ? p : null;
}
export function pickObjects(objs) {
  return ray.intersectObjects(objs, true);
}

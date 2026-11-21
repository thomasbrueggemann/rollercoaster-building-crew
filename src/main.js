import './style.css';
import { N, PLOT, GATE, STAFF } from './constants.js';
import { G, on, emit, hourOf, dayOf } from './state.js';
import {
  renderer, scene, camera, cam, renderFrame, updateCamera, panCamera, panWorld, zoomBy, rotateCam,
  updateLighting, refreshTiles, rebuildWildTrees, buildGate, setPointer, groundPoint, pickObjects, pulseSelection,
} from './scene.js';
import { updateEntities, createEntity } from './entities.js';
import { updateGuests, updateStaff } from './guests.js';
import { updateDisasters } from './disasters.js';
import { updateEffects } from './effects.js';
import { rebuildWalk } from './path.js';
import { setTool, onHover, onClick, rotateTool, select, coasterHeight, coasterUndo, demolishSelected } from './tools.js';
import { initUI, updateHUD, toast, showTitle } from './ui.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { unlockAudio } from './audio.js';
import * as Entities from './entities.js';
import * as Tools from './tools.js';
import * as Disasters from './disasters.js';

// ---------- world setup ----------
function blockGate() {
  for (const x of [GATE.x - 1, GATE.x + GATE.w]) G.occ[GATE.z * N + x] = -1;
}
function newGame() {
  for (const pz of [2, 3]) for (const px of [2, 3]) G.owned[pz][px] = true;
  blockGate();
  // a little starter decoration by the gate
  createEntity({ type: 'tree', x: 20, z: 29, color: '#3a9d5d' });
  createEntity({ type: 'tree', x: 27, z: 29, color: '#e76f51' });
  createEntity({ type: 'bench', x: 21, z: 28 });
  createEntity({ type: 'bench', x: 26, z: 28, rot: 2 });
}

function startWorld(fromSave) {
  if (!(fromSave && loadGame())) newGame();
  blockGate();
  rebuildWalk();
  refreshTiles();
  rebuildWildTrees();
  computeBeauty();
  G.lastDay = dayOf();
  G.started = true;
  emit('money');
}

// scenery makes nearby guests happier
function computeBeauty() {
  G.beauty = new Float32Array(N * N);
  for (const e of G.entities.values()) {
    if (e.kind !== 'scenery') continue;
    const r = e.type === 'fountain' ? 3 : 2;
    const cx = e.x + e.size / 2, cz = e.z + e.size / 2;
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (x >= 0 && z >= 0 && x < N && z < N) G.beauty[z * N + x] += e.type === 'fountain' ? 2 : 1;
  }
}
on('entities', computeBeauty);

buildGate();
initUI({
  onStart: (fromSave) => { startWorld(fromSave); },
  onNewGame: () => { clearSave(); G.started = false; location.reload(); },
  clearSave,
  hasSave: hasSave(),
});

// ---------- input ----------
const el = renderer.domElement;
let down = null;
const keys = new Set();

function hitTest(x, y) {
  setPointer(x, y);
  const objs = [...[...G.entities.values()].map((e) => e.root), ...G.litter.map((l) => l.mesh)];
  for (const h of pickObjects(objs)) {
    let o = h.object;
    while (o) {
      if (o.userData.litter) return { litter: o.userData.litter };
      if (o.userData.eid) return { entity: G.entities.get(o.userData.eid) };
      o = o.parent;
    }
  }
  return null;
}

el.addEventListener('contextmenu', (e) => e.preventDefault());
// Works for mouse, pen and touch:
//  tap / click  -> act (place, select, buy…)
//  1-finger / left / right drag -> pan
//  2-finger pinch -> zoom + pan
const pointers = new Map();
let pinch = null;
const pinchState = () => {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
};
el.addEventListener('pointerdown', (e) => {
  unlockAudio();
  el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, btn: e.button, moved: false, touch: e.pointerType !== 'mouse' };
  } else if (pointers.size === 2) {
    if (down) down.moved = true; // a second finger cancels the tap
    pinch = { ...pinchState(), view: cam.viewGoal };
  }
});
el.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const s = pinchState();
    cam.viewGoal = Math.min(40, Math.max(6, (pinch.view * pinch.d) / Math.max(20, s.d)));
    panCamera(s.mx - pinch.mx, s.my - pinch.my);
    pinch.mx = s.mx; pinch.my = s.my;
    return;
  }
  if (down) {
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > (down.touch ? 12 : 6)) down.moved = true;
    if (down.moved) panCamera(dx, dy);
    down.lx = e.clientX; down.ly = e.clientY;
  }
  if (e.pointerType === 'mouse') {
    setPointer(e.clientX, e.clientY);
    onHover(groundPoint());
    hoverX = e.clientX; hoverY = e.clientY;
  }
});
let hoverX = 0, hoverY = 0;
function endPointer(e, cancelled) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size > 0) return;
  if (!cancelled && down && down.btn === 0 && !down.moved && G.started) {
    setPointer(e.clientX, e.clientY);
    onHover(groundPoint());
    hoverX = e.clientX; hoverY = e.clientY;
    onClick(hitTest(e.clientX, e.clientY));
  } else if (!cancelled && down && down.btn === 2 && !down.moved && G.tool.mode !== 'select') {
    setTool('select'); // right-click cancels the current tool
  }
  down = null;
}
el.addEventListener('pointerup', (e) => endPointer(e, false));
el.addEventListener('pointercancel', (e) => endPointer(e, true));

// on-screen camera buttons (tablets have no wheel or Q/E keys)
document.getElementById('camctl').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  unlockAudio();
  ({ 'zoom-in': () => zoomBy(0.8), 'zoom-out': () => zoomBy(1.25), 'rot-l': () => rotateCam(-1), 'rot-r': () => rotateCam(1) })[b.dataset.cam]?.();
});
el.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (!G.started) return;
  if (k === 'q') rotateCam(-1);
  else if (k === 'e') rotateCam(1);
  else if (k === 'r') rotateTool();
  else if (k === 'escape') { if (G.tool.mode !== 'select') setTool('select'); else select(null); }
  else if (k === 'delete') demolishSelected();
  else if (k === 'backspace' && G.tool.mode === 'coaster') { e.preventDefault(); coasterUndo(); }
  else if (k === ' ') { e.preventDefault(); G.paused = !G.paused; emit('speed'); }
  else if (k === '[' || k === 'f' || k === 'pagedown') coasterHeight(-1);
  else if (k === ']' || k === 't' || k === 'pageup') coasterHeight(1);
  else if (k === '1' || k === '2' || k === '3') { G.speed = +k; G.paused = false; emit('speed'); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// ---------- main loop ----------
let last = performance.now();
let hudT = 0, saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const sdt = G.started && !G.paused ? dt * G.speed : 0;
  G.t += sdt;

  const pan = (cam.view * 1.4) * dt;
  let px = 0, pz = 0;
  if (keys.has('w') || keys.has('arrowup')) pz += pan;
  if (keys.has('s') || keys.has('arrowdown')) pz -= pan;
  if (keys.has('a') || keys.has('arrowleft')) px -= pan;
  if (keys.has('d') || keys.has('arrowright')) px += pan;
  if (px || pz) {
    panWorld(px, pz);
    setPointer(hoverX, hoverY);
    onHover(groundPoint());
  }

  simulate(dt, sdt);

  const amp = G.quakeAmp;
  cam.shake.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.5, (Math.random() - 0.5) * amp);
  updateCamera(dt);
  pulseSelection(now / 1000);
  renderFrame();

  hudT -= dt;
  if (hudT <= 0) { hudT = 0.2; updateHUD(); }
  saveT += dt;
  if (G.started && saveT > 20) { saveT = 0; saveGame(); }
}

function simulate(dt, sdt) {
  updateLighting(hourOf());
  if (G.started) {
    const d = dayOf();
    if (d !== G.lastDay) newDay(d);
    updateEntities(dt, sdt);
    updateGuests(dt, sdt);
    updateStaff(dt, sdt);
    updateDisasters(sdt);
  }
  updateEffects(dt);
}

// fast-forward the simulation (debug / testing helper): __game.step(30)
function step(seconds) {
  for (let t = 0; t < seconds; t += 0.05) {
    G.t += 0.05;
    simulate(0.05, 0.05);
  }
  updateCamera(0.05);
  renderFrame();
  updateHUD();
}

function newDay(d) {
  const wages = G.staff.reduce((s, st) => s + STAFF[st.kind].wage, 0);
  const paid = Math.min(wages, Math.max(0, G.money));
  G.money -= paid;
  const y = G.today;
  toast(`🌅 Day ${d}! You got 🪙 ${Math.round(y.income)}`, 'good');
  G.today = { income: 0, spent: 0 };
  G.lastDay = d;
}

window.addEventListener('beforeunload', () => { if (G.started) saveGame(); });
// installed PWAs on tablets get suspended rather than unloaded, so save when hidden too
document.addEventListener('visibilitychange', () => { if (document.hidden && G.started) saveGame(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW failed', err)));
}
requestAnimationFrame(frame);
showTitle();

// handy for debugging in the console
window.__game = { G, step, PLOT, E: Entities, T: Tools, D: Disasters };

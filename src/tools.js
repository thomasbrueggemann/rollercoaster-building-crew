import * as THREE from 'three';
import { N, PLOT, MAX_TRACK_H } from './constants.js';
import { G, emit, spend } from './state.js';
import { CATALOG } from './catalog.js';
import { scene, footprint, plotHover, refreshTiles, plotBuyable, rebuildWildTrees, showSelection } from './scene.js';
import { canPlace, createEntity, createGhost, removeEntity, footprintTiles, tileFree, rotateEntity } from './entities.js';
import { buildTrack, trackY } from './coaster.js';
import { rebuildWalk } from './path.js';
import { removeLitter } from './guests.js';
import { popText } from './effects.js';
import { sfx } from './audio.js';

let ghost = null;
const okMat = footprint.material;
const badColor = new THREE.Color('#f87171');
const goodColor = new THREE.Color('#4ade80');

export function setTool(mode, type = null) {
  if (G.tool.mode === 'coaster' && mode !== 'coaster') coasterCancel(true);
  const wasLand = G.tool.mode === 'land';
  G.tool = { mode, type, rot: G.tool.rot || 0 };
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (mode === 'place' && type) {
    ghost = createGhost(type);
    ghost.visible = false;
    ghost.rotation.y = (G.tool.rot * Math.PI) / 2;
    scene.add(ghost);
  }
  if (mode === 'coaster') G.cb = { points: [], h: 0, preview: null, marker: null };
  if (mode !== 'select') select(null);
  footprint.visible = false;
  plotHover.visible = false;
  if (wasLand !== (mode === 'land')) refreshTiles();
  emit('tool');
}

export function select(e) {
  G.selected = e;
  if (!e) showSelection([]);
  else if (e.kind === 'coaster') showSelection(e.points.map((p) => [p.x, p.z, 1, 1]));
  else showSelection([[e.x, e.z, e.size, e.size]]);
  emit('select', e);
}

// ---------- land ----------
export const ownedPlots = () => G.owned.flat().filter(Boolean).length;
export const plotPrice = () => 30 + (ownedPlots() - 4) * 15;
export function buyPlot(px, pz) {
  if (!plotBuyable(px, pz)) { sfx.error(); emit('toast', '🟨 Tap yellow land!', 'warn'); return false; }
  const price = plotPrice();
  if (!spend(price)) { sfx.error(); emit('toast', `🪙 ${price}? Not yet!`, 'warn'); return false; }
  G.owned[pz][px] = true;
  rebuildWalk();
  refreshTiles();
  rebuildWildTrees();
  sfx.buy();
  popText(px * PLOT + PLOT / 2, 1, pz * PLOT + PLOT / 2, `-${price}`, '#ff8fa3');
  emit('land');
  return true;
}

// ---------- hover ----------
export function onHover(p) {
  G.hover = p ? { x: Math.floor(p.x), z: Math.floor(p.z), px: p.x, pz: p.z } : null;
  const m = G.tool.mode;
  if (m === 'place' && ghost) {
    if (!p) { ghost.visible = footprint.visible = false; return; }
    const size = ghost.userData.def.size;
    const ax = Math.round(p.x - size / 2), az = Math.round(p.z - size / 2);
    const ok = canPlace(ax, az, size);
    ghost.visible = footprint.visible = true;
    ghost.position.set(ax + size / 2, 0, az + size / 2);
    footprint.position.set(ax + size / 2, 0.03, az + size / 2);
    footprint.scale.set(size, size, 1);
    okMat.color.copy(ok ? goodColor : badColor);
    G.tool.anchor = { ax, az, ok };
  } else if (m === 'land') {
    if (!p) { plotHover.visible = false; return; }
    const px = Math.floor(p.x / PLOT), pz = Math.floor(p.z / PLOT);
    const inside = px >= 0 && pz >= 0 && px < N / PLOT && pz < N / PLOT;
    plotHover.visible = inside && !G.owned[pz]?.[px];
    plotHover.position.set(px * PLOT + PLOT / 2, 0.04, pz * PLOT + PLOT / 2);
    plotHover.scale.set(PLOT, PLOT, 1);
    plotHover.material.color.set(plotBuyable(px, pz) ? '#ffe066' : '#f87171');
    G.tool.plot = inside ? { px, pz } : null;
  } else if (m === 'coaster') {
    coasterHover();
  } else {
    footprint.visible = false;
  }
}

export function rotateTool() {
  if (G.tool.mode === 'place' && ghost) {
    G.tool.rot = (G.tool.rot + 1) % 4;
    ghost.rotation.y = (G.tool.rot * Math.PI) / 2;
  } else if (G.selected) rotateEntity(G.selected);
}

// ---------- click ----------
export function onClick(hit) {
  const m = G.tool.mode;
  if (m === 'place') {
    const a = G.tool.anchor;
    if (!a) return;
    if (!a.ok) { sfx.error(); return; }
    const def = CATALOG[G.tool.type];
    createEntity({ type: G.tool.type, x: a.ax, z: a.az, rot: G.tool.rot });
    sfx.place();
    G.tool.anchor.ok = false;
    onHover({ x: G.hover.px, z: G.hover.pz });
    emit('placed', def);
  } else if (m === 'land') {
    if (G.tool.plot) buyPlot(G.tool.plot.px, G.tool.plot.pz);
  } else if (m === 'coaster') {
    coasterClick();
  } else if (m === 'demolish') {
    if (hit?.entity) {
      const e = hit.entity;
      removeEntity(e);
      sfx.remove();
      emit('toast', `🗑️ ${e.def.icon} Gone!`);
    }
  } else {
    if (hit?.litter) {
      if (removeLitter(hit.litter)) {
        G.money += 2; G.today.income += 2;
        popText(hit.litter.x, 0.6, hit.litter.z, '+2');
        sfx.coin();
        G.jobsDone = (G.jobsDone || 0) + 1;
      }
      return;
    }
    select(hit?.entity || null);
    if (hit?.entity) sfx.click();
  }
}

// ---------- coaster builder ----------
const markerMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.6, depthWrite: false });
const ghostPiece = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.7 }));
const ghostPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.5 }));
ghostPiece.visible = ghostPole.visible = false;
scene.add(ghostPiece, ghostPole);
const stationMarker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), markerMat);
stationMarker.rotation.x = -Math.PI / 2;
stationMarker.visible = false;
scene.add(stationMarker);

const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;

function nextPiece(tx, tz) {
  const cb = G.cb, pts = cb.points;
  if (!pts.length) return tileFree(tx, tz) ? { x: tx, z: tz, h: 0 } : null;
  const last = pts[pts.length - 1];
  if (!adjacent(last, { x: tx, z: tz })) return null;
  if (pts.some((p) => p.x === tx && p.z === tz)) return null;
  if (!tileFree(tx, tz)) return null;
  const h = Math.max(last.h - 1, Math.min(last.h + 1, cb.h));
  if (pts.length === 1 && h !== 0) return { x: tx, z: tz, h: 0 }; // station exit stays flat
  return { x: tx, z: tz, h };
}
function canClose() {
  const pts = G.cb.points;
  if (pts.length < 8) return 'Make it longer!';
  const first = pts[0], last = pts[pts.length - 1];
  if (!adjacent(first, last)) return 'Go back to the 🚉!';
  if (last.h > 1) return 'Go down ⬇ first!';
  return null;
}

function coasterHover() {
  const cb = G.cb;
  const hv = G.hover;
  ghostPiece.visible = ghostPole.visible = false;
  if (!cb || !hv) return;
  const first = cb.points[0];
  if (first && hv.x === first.x && hv.z === first.z && cb.points.length > 1) return;
  const piece = nextPiece(hv.x, hv.z);
  if (!piece) return;
  const y = trackY(piece.h);
  ghostPiece.position.set(piece.x + 0.5, y, piece.z + 0.5);
  ghostPole.position.set(piece.x + 0.5, y / 2, piece.z + 0.5);
  ghostPole.scale.y = y;
  ghostPiece.visible = ghostPole.visible = true;
}

function refreshPreview() {
  const cb = G.cb;
  if (cb.preview) {
    scene.remove(cb.preview);
    cb.preview.traverse((o) => { o.geometry?.dispose(); });
    cb.preview = null;
  }
  const pts = cb.points;
  const g = new THREE.Group();
  for (const p of pts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), markerMat);
    m.position.set(p.x + 0.5, 0.03, p.z + 0.5);
    g.add(m);
  }
  if (pts.length >= 2) g.add(buildTrack(pts, '#ff5d73', false).group);
  else if (pts.length === 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: '#ff5d73' }));
    m.position.set(pts[0].x + 0.5, trackY(0), pts[0].z + 0.5);
    g.add(m);
  }
  cb.preview = g;
  scene.add(g);
  stationMarker.visible = pts.length > 0;
  if (pts.length) stationMarker.position.set(pts[0].x + 0.5, 0.05, pts[0].z + 0.5);
  emit('coaster');
}

function coasterClick() {
  const cb = G.cb, hv = G.hover;
  if (!cb || !hv) return;
  const first = cb.points[0];
  if (first && hv.x === first.x && hv.z === first.z && cb.points.length > 1) {
    const why = canClose();
    if (why) { sfx.error(); emit('toast', `🎢 ${why}`, 'warn'); return; }
    finishCoaster();
    return;
  }
  const piece = nextPiece(hv.x, hv.z);
  if (!piece) { sfx.error(); return; }
  cb.points.push(piece);
  cb.h = piece.h;
  sfx.click();
  refreshPreview();
  coasterHover();
}

function finishCoaster() {
  const cb = G.cb;
  const pts = cb.points.slice();
  coasterCancel(true);
  const e = createEntity({ type: 'coaster', points: pts, color: CATALOG.coaster.color });
  sfx.upgrade();
  emit('toast', `🎢 Your coaster is open! ${'⭐'.repeat(Math.max(1, Math.round(e.exc / 2)))}`, 'good');
  setTool('select');
  select(e);
}

export function coasterHeight(d) {
  if (!G.cb) return;
  G.cb.h = Math.max(0, Math.min(MAX_TRACK_H, G.cb.h + d));
  coasterHover();
  emit('coaster');
}
export function coasterUndo() {
  if (!G.cb?.points.length) return;
  G.cb.points.pop();
  G.cb.h = G.cb.points.at(-1)?.h ?? 0;
  refreshPreview();
  coasterHover();
}
export function coasterCancel(silent = false) {
  const cb = G.cb;
  if (!cb) return;
  if (cb.preview) { scene.remove(cb.preview); cb.preview = null; }
  cb.points = [];
  stationMarker.visible = false;
  ghostPiece.visible = ghostPole.visible = false;
  if (!silent) emit('coaster');
}
export const coasterStatus = () => {
  const cb = G.cb;
  if (!cb) return null;
  return { pieces: cb.points.length, h: cb.h, closeIssue: cb.points.length ? canClose() : 'empty' };
};

export function demolishSelected() {
  const e = G.selected;
  if (!e) return;
  removeEntity(e);
  sfx.remove();
  select(null);
}

export { footprintTiles };

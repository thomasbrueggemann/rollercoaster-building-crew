import { G } from './state.js';
import { createEntity, serializeEntity } from './entities.js';
import { spawnStaff } from './guests.js';
import { D } from './disasters.js';

const KEY = 'rollercoaster-building-crew-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function saveGame() {
  try {
    const data = {
      v: 1,
      money: G.money, t: G.t, owned: G.owned, rating: G.rating,
      disastersOn: G.disastersOn, muted: G.muted, next: D.next,
      entities: [...G.entities.values()].map(serializeEntity),
      staff: G.staff.map((s) => s.kind),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}
export function loadGame() {
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { return false; }
  if (!data || data.v !== 1) return false;
  G.money = data.money;
  G.t = data.t;
  G.rating = data.rating ?? 50;
  G.disastersOn = data.disastersOn ?? true;
  G.muted = !!data.muted;
  D.next = data.next ?? 160;
  data.owned.forEach((row, z) => row.forEach((o, x) => (G.owned[z][x] = o)));
  for (const e of data.entities) {
    try { createEntity(e); } catch (err) { console.warn('skipped broken save entry', e, err); }
  }
  data.staff.forEach((k) => spawnStaff(k));
  return true;
}

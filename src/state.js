import { N, PLOT, PLOTS, START_MONEY, DAY_SECONDS, START_HOUR } from './constants.js';

const handlers = {};
export const on = (evt, fn) => (handlers[evt] ||= []).push(fn);
export const emit = (evt, ...args) => (handlers[evt] || []).forEach((fn) => fn(...args));

export const G = {
  money: START_MONEY,
  t: 0,               // simulated seconds since start
  speed: 1,
  paused: false,
  entities: new Map(),
  nextId: 1,
  occ: new Int32Array(N * N),   // entity id per tile, -1 = static blocker, 0 = free
  walk: new Uint8Array(N * N),  // 1 = guests may walk here
  owned: Array.from({ length: PLOTS }, () => Array(PLOTS).fill(false)),
  guests: [],
  staff: [],
  litter: [],
  tool: { mode: 'select', type: null, rot: 0 },
  selected: null,
  hover: null,
  rating: 50,
  daylight: 1,
  glow: 0,
  storm: 0,
  waterLevel: -0.6,
  quakeAmp: 0,
  disastersOn: true,
  muted: false,
  lastDay: 1,
  today: { income: 0, spent: 0 },
};

export const hourOf = () => (START_HOUR + (G.t / DAY_SECONDS) * 24) % 24;
export const dayOf = () => Math.floor((START_HOUR + (G.t / DAY_SECONDS) * 24) / 24) + 1;

export const isOwnedTile = (x, z) =>
  x >= 0 && z >= 0 && x < N && z < N && G.owned[Math.floor(z / PLOT)][Math.floor(x / PLOT)];

export function earn(v) {
  G.money += v;
  G.today.income += v;
}
export function spend(v) {
  if (G.money < v) return false;
  G.money -= v;
  G.today.spent += v;
  emit('money');
  return true;
}

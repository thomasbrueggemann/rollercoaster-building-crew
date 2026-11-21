export const N = 48;            // map is N x N tiles
export const PLOT = 8;          // land is sold in PLOT x PLOT chunks
export const PLOTS = N / PLOT;
export const GATE = { x: 23, z: 31, w: 2 }; // walkable gate tiles: x 23..24, row 31
export const DAY_SECONDS = 150; // real seconds per in-game day at 1x speed
export const START_HOUR = 8;
export const START_MONEY = 600;
export const MAX_TRACK_H = 8;
export const RES_STEP = 0.27;   // damage reduction per protection level
export const UPGRADE_COST = [50, 90, 140];
export const STAFF = {
  mechanic: { name: 'Fixer', icon: '🔧', hire: 60, wage: 15, color: '#3a86ff', desc: 'Fixes rides.' },
  janitor: { name: 'Cleaner', icon: '🧹', hire: 40, wage: 10, color: '#2a9d8f', desc: 'Picks up trash.' },
};
export const SWATCHES = [
  '#ff5d73', '#ff9f1c', '#ffd23f', '#7bd389', '#2ec4b6', '#4cc9f0',
  '#4361ee', '#9b5de5', '#f15bb5', '#f4f1de', '#8d6e63', '#2b2d42',
];

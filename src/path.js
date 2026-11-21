import { N, PLOT, GATE } from './constants.js';
import { G } from './state.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const seen = new Uint32Array(N * N);
const prev = new Int32Array(N * N);
const queue = new Int32Array(N * N);
let stamp = 0;

export function rebuildWalk() {
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      G.walk[i] = G.owned[Math.floor(z / PLOT)][Math.floor(x / PLOT)] && G.occ[i] === 0 ? 1 : 0;
    }
}

export const walkable = (x, z) => x >= 0 && z >= 0 && x < N && z < N && G.walk[z * N + x] === 1;
export const gateTiles = () => Array.from({ length: GATE.w }, (_, i) => GATE.z * N + GATE.x + i);

// Breadth-first search over walkable tiles (8-way, no corner cutting).
// Returns the list of tile indices to walk through (excluding start), or null.
export function findPath(sx, sz, isGoal) {
  stamp++;
  let qh = 0, qt = 0;
  const s = sz * N + sx;
  queue[qt++] = s;
  seen[s] = stamp;
  prev[s] = -1;
  while (qh < qt) {
    const c = queue[qh++];
    if (isGoal(c)) {
      const path = [];
      for (let k = c; k !== s; k = prev[k]) path.push(k);
      return path.reverse();
    }
    const cx = c % N, cz = (c / N) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const ni = nz * N + nx;
      if (seen[ni] === stamp || !G.walk[ni]) continue;
      if (dx && dz && (!G.walk[cz * N + nx] || !G.walk[nz * N + cx])) continue;
      seen[ni] = stamp;
      prev[ni] = c;
      queue[qt++] = ni;
    }
  }
  return null;
}

export function randomWalkableNear(x, z, r) {
  for (let i = 0; i < 20; i++) {
    const tx = Math.round(x + (Math.random() * 2 - 1) * r);
    const tz = Math.round(z + (Math.random() * 2 - 1) * r);
    if (walkable(tx, tz)) return tz * N + tx;
  }
  return -1;
}

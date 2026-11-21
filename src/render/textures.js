// Procedural canvas textures (no network assets).
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// draw a shape so it wraps around the canvas edges (seamless tiling)
function wrapped(w, h, x, y, r, fn) {
  for (const ox of [-w, 0, w]) {
    if (x + ox + r < 0 || x + ox - r > w) continue;
    for (const oy of [-h, 0, h]) {
      if (y + oy + r < 0 || y + oy - r > h) continue;
      fn(x + ox, y + oy);
    }
  }
}

function finish(c, { repeat = true, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Neutral-ish (near white) grass: multiplied by per-tile ownership colour in the terrain shader.
export function makeGrassTexture(size = 512) {
  const [c, g] = canvas(size, size);
  const R = rng(1234);
  g.fillStyle = 'rgb(200,210,190)';
  g.fillRect(0, 0, size, size);
  // soft patches
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size, r = 25 + R() * 70;
    const l = R() < 0.5 ? 255 : 120, a = 0.05 + R() * 0.09;
    const hue = R() < 0.5 ? [l, l, l * 0.8] : [l * 0.9, l, l * 0.85];
    wrapped(size, size, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(${hue[0] | 0},${hue[1] | 0},${hue[2] | 0},${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  // blades
  g.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = R() * size, y = R() * size;
    const len = 4 + R() * 9, ang = -Math.PI / 2 + (R() - 0.5) * 1.3;
    const v = R();
    const L = v < 0.5 ? 150 + R() * 40 : 215 + R() * 40;
    g.strokeStyle = `rgba(${(L * (0.88 + R() * 0.12)) | 0},${L | 0},${(L * (0.7 + R() * 0.2)) | 0},${0.35 + R() * 0.4})`;
    g.lineWidth = 0.8 + R() * 1.1;
    wrapped(size, size, x, y, len, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      g.stroke();
    });
  }
  // tiny clover / flower dots
  for (let i = 0; i < 160; i++) {
    const x = R() * size, y = R() * size;
    g.fillStyle = R() < 0.6 ? 'rgba(255,255,235,0.55)' : 'rgba(255,230,140,0.5)';
    wrapped(size, size, x, y, 3, (px, py) => { g.beginPath(); g.arc(px, py, 1 + R() * 1.2, 0, 7); g.fill(); });
  }
  return finish(c);
}

// Soil / rock strata for the island cliffs. Colour is final (not tinted).
export function makeCliffTexture(size = 256) {
  const [c, g] = canvas(size, size);
  const R = rng(99);
  const bands = ['#7a5a3c', '#6b4d33', '#8a6a48', '#5e4430', '#7d6a55', '#6f5b48'];
  let y = 0;
  while (y < size) {
    const h = 10 + R() * 28;
    g.fillStyle = bands[(R() * bands.length) | 0];
    g.fillRect(0, y, size, h);
    y += h;
  }
  for (let i = 0; i < 2600; i++) {
    const x = R() * size, yy = R() * size;
    const l = R() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${l},${l},${l},${0.04 + R() * 0.1})`;
    const w = 2 + R() * 9;
    wrapped(size, size, x, yy, w, (px, py) => g.fillRect(px, py, w, 1 + R() * 3));
  }
  for (let i = 0; i < 40; i++) { // pebbles
    const x = R() * size, yy = R() * size, r = 2 + R() * 5;
    wrapped(size, size, x, yy, r, (px, py) => {
      g.fillStyle = `rgba(${90 + R() * 70 | 0},${85 + R() * 60 | 0},${75 + R() * 50 | 0},0.8)`;
      g.beginPath(); g.ellipse(px, py, r, r * 0.7, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(px + 1, py + 1.5, r, r * 0.6, 0, 0, 7); g.fill();
    });
  }
  return finish(c);
}

export function makeSandTexture(size = 256) {
  const [c, g] = canvas(size, size);
  const R = rng(7);
  g.fillStyle = '#e6d3a0';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const l = R() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${l},${l},${l},${0.04 + R() * 0.08})`;
    g.fillRect(R() * size, R() * size, 1 + R() * 2, 1 + R() * 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = R() * size, y = R() * size, r = 12 + R() * 30;
    wrapped(size, size, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(${R() < 0.5 ? '255,245,210' : '200,170,120'},0.12)`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, 2 * r, 2 * r);
    });
  }
  return finish(c);
}

// Wood planks, used for fences. Mostly neutral warm grain, tinted by material colour.
export function makeWoodTexture(size = 128) {
  const [c, g] = canvas(size, size);
  const R = rng(55);
  g.fillStyle = '#d9c3a0';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    const y = R() * size, l = R() < 0.5 ? 0 : 255;
    g.strokeStyle = `rgba(${l},${l},${l},${0.05 + R() * 0.12})`;
    g.lineWidth = 0.6 + R() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
    g.stroke();
  }
  return finish(c);
}

// Tileable fractal value-noise heightfield, values 0..1 (Float32Array size*size).
function noiseHeights(size, seed, octaves = 4, grid = 8) {
  const R = rng(seed);
  const base = new Float32Array(grid * grid).map(() => R());
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const xa = x0 % grid, xb = (x0 + 1) % grid, ya = y0 % grid, yb = (y0 + 1) % grid;
    const a = base[ya * grid + xa], b = base[ya * grid + xb], c = base[yb * grid + xa], d = base[yb * grid + xb];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, sum = 0;
      for (let o = 0; o < octaves; o++) {
        const f = 1 << o;
        v += amp * n((x / size) * grid * f, (y / size) * grid * f);
        sum += amp; amp *= 0.5;
      }
      out[y * size + x] = v / sum;
    }
  return out;
}

function dataTex(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Greyscale noise (linear data).
export function makeNoiseTexture(size = 256) {
  const h = noiseHeights(size, 4242);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = (h[i] * 255) | 0; data[i * 4 + 3] = 255; }
  return dataTex(data, size);
}

// Tileable tangent-space-ish normal map (xy in rg, 0.5 = flat) for water ripples.
export function makeWaterNormalTexture(size = 256) {
  const h = noiseHeights(size, 777, 5, 8);
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, 128 + dx * 900));
      data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 900));
      data[i + 2] = (h[y * size + x] * 255) | 0; // height, for foam masks
      data[i + 3] = 255;
    }
  return dataTex(data, size);
}

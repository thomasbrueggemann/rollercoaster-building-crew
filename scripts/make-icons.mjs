// Generates the PWA icons into public/icons (no dependencies).
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = {
  top: hex('#4b3f9e'), bottom: hex('#171a34'), sun: hex('#ffd23f'), track: hex('#ff5d73'),
  rail: hex('#ffffff'), support: hex('#c9d1dc'), car: hex('#ffd23f'), ground: hex('#4ade80'), ground2: hex('#2f9e5a'),
};
const trackY = (u) => 0.6 - 0.29 * Math.exp(-(((u - 0.36) / 0.15) ** 2)) - 0.12 * Math.exp(-(((u - 0.74) / 0.1) ** 2));

// colour at unit coords (u,v) inside the artwork, or null for transparent
function shade(u, v, full) {
  if (!full) {
    const r = 0.22, dx = Math.max(r - u, 0, u - (1 - r)), dy = Math.max(r - v, 0, v - (1 - r));
    if (dx * dx + dy * dy > r * r) return null;
  }
  const s = full ? 0.8 : 1; // maskable icons keep the art in the central safe zone
  const a = (u - 0.5) / s + 0.5, b = (v - 0.5) / s + 0.5;
  let c = C.top.map((t, i) => t + (C.bottom[i] - t) * v);
  if ((a - 0.74) ** 2 + (b - 0.27) ** 2 < 0.11 ** 2) c = C.sun;
  for (let k = 0; k < 7; k++) {
    const su = 0.17 + k * 0.11;
    if (Math.abs(a - su) < 0.012 && b > trackY(su) && b < 0.84) c = C.support;
  }
  if (a > 0.06 && a < 0.94) {
    const ty = trackY(a);
    if (Math.abs(b - ty) < 0.032) c = C.track;
    if (Math.abs(b - (ty - 0.026)) < 0.008) c = C.rail;
    for (const cu of [0.3, 0.38]) {
      const cy = trackY(cu);
      if (Math.abs(a - cu) < 0.035 && b > cy - 0.1 && b < cy - 0.03) c = C.car;
    }
  }
  const g = 0.82 + 0.03 * Math.sin(a * 9);
  if (b > g) c = b > g + 0.06 ? C.ground2 : C.ground;
  return c;
}

function render(size, full) {
  const SS = 4, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, full);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      const i = (y * size + x) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = (a / (SS * SS)) * 255;
    }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
const out = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
for (const [name, size, full] of out) {
  writeFileSync(`public/icons/${name}`, png(size, render(size, full)));
  console.log('wrote', name);
}

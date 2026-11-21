// Procedural canvas textures, cached at module level and shared by every model instance.
import * as THREE from 'three';
import { isLow } from '../quality.js';

const cache = new Map();
const hasDom = typeof document !== 'undefined';

function make(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  let tex = null;
  if (hasDom) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = isLow() ? 1 : 4;
    if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  }
  cache.set(key, tex);
  return tex;
}

// small seeded rng so textures look identical every load
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Neutral (near white) wood grain: multiplies nicely with a tint colour.
export const woodTex = (rep = [1, 1]) => make('wood' + rep, 256, 256, (g, w, h) => {
  const r = rng(7);
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const y = r() * h, l = 0.78 + r() * 0.22;
    g.strokeStyle = `rgba(${(l * 190) | 0},${(l * 190) | 0},${(l * 190) | 0},${0.25 + r() * 0.35})`;
    g.lineWidth = 0.6 + r() * 1.8;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5 + (r() - 0.5) * 1.5);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,120,120,.55)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke(); }
}, { repeat: rep });

// Neutral brushed-metal streaks
export const brushedTex = (rep = [1, 1]) => make('brushed' + rep, 256, 256, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const l = 150 + r() * 105;
    g.strokeStyle = `rgba(${l | 0},${l | 0},${l | 0},${0.15 + r() * 0.3})`;
    g.lineWidth = 0.5 + r();
    const y = r() * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 2); g.stroke();
  }
}, { repeat: rep });

// Greyscale noise for foliage / bark / ground detail (tintable)
export const noiseTex = (name, rep = [1, 1], base = 215, amp = 40, seed = 3) => make('noise' + name + rep, 128, 128, (g, w, h) => {
  const r = rng(seed);
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const l = base + (r() - 0.5) * amp * 2;
    g.fillStyle = `rgba(${l | 0},${l | 0},${l | 0},0.55)`;
    const s = 2 + r() * 7;
    g.beginPath(); g.arc(r() * w, r() * h, s, 0, 7); g.fill();
  }
}, { repeat: rep });

export const barkTex = () => make('bark', 64, 128, (g, w, h) => {
  const r = rng(5);
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, l = 90 + r() * 90;
    g.strokeStyle = `rgba(${l | 0},${l | 0},${l | 0},.8)`; g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y < h; y += 16) g.lineTo(x + (r() - 0.5) * 6, y);
    g.stroke();
  }
}, { repeat: [2, 1] });

// Black/white check (floor tiles, plaza)
export const checkTex = (n = 8, a = '#f2f2f2', b = '#c4c4c4') => make('check' + n + a + b, 128, 128, (g, w, h) => {
  const s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) & 1 ? a : b; g.fillRect(x * s, y * s, s, s); }
}, { repeat: [1, 1] });

// Vertical stripes: fixed colours (second awning material)
export const stripeTex = (a = '#ffffff', b = '#d62839', n = 8) => make('stripe' + a + b + n, 128, 16, (g, w, h) => {
  const s = w / n;
  for (let i = 0; i < n; i++) { g.fillStyle = i & 1 ? b : a; g.fillRect(i * s, 0, s, h); }
}, {});

// Diamond-plate floor, neutral
export const diamondTex = (rep = [3, 3]) => make('diamond' + rep, 64, 64, (g, w, h) => {
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = '#eee';
    g.save(); g.translate(x * 16 + 8 + (y & 1) * 8, y * 16 + 8); g.rotate(((x + y) & 1 ? 0.8 : -0.8));
    g.fillRect(-5, -1.5, 10, 3); g.restore();
  }
}, { repeat: rep });

// Signage: text on a coloured plaque. Fixed colours, cached by text.
export const signTex = (text, bg = '#1d3557', fg = '#ffe066', border = '#ffffff') => make('sign' + text + bg + fg, 256, 96, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 54;
  g.font = `900 ${fs}px "Trebuchet MS", Verdana, sans-serif`;
  while (g.measureText(text).width > w - 36 && fs > 14) { fs -= 3; g.font = `900 ${fs}px "Trebuchet MS", Verdana, sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 3);
});

// Little menu board: rows of "item ..... price"
export const menuTex = (title, rows, bg = '#2a2d34') => make('menu' + title, 128, 160, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9a66b'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = '#fff3b0'; g.textAlign = 'center'; g.font = '900 20px sans-serif'; g.fillText(title, w / 2, 28);
  g.font = '700 15px sans-serif'; g.textAlign = 'left';
  rows.forEach((r, i) => {
    g.fillStyle = i & 1 ? '#ffffff' : '#bde0fe';
    g.fillText(r[0], 12, 58 + i * 26);
    g.textAlign = 'right'; g.fillText(r[1], w - 12, 58 + i * 26); g.textAlign = 'left';
  });
});

// Mirror panel with gradient (carousel centre column)
export const mirrorTex = () => make('mirror', 64, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#e8f7ff'); gr.addColorStop(0.45, '#7aa6c2'); gr.addColorStop(0.55, '#f4fbff'); gr.addColorStop(1, '#6f95b0');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

// Ornate band for carousel rounding boards: painted scallops + dots in neutral grey/white (tintable)
export const roundingTex = () => make('rounding', 256, 64, (g, w, h) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9a9a9a';
  for (let i = 0; i < 8; i++) {
    const cx = (i + 0.5) * (w / 8);
    g.beginPath(); g.arc(cx, 0, 22, 0, Math.PI); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, h * 0.62, 6, 0, 7); g.fill(); g.fillStyle = '#9a9a9a';
  }
  g.strokeStyle = '#777'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
}, { repeat: [3, 1] });

// Water ripples (white-blue, used as a map on a transparent surface; offset animated by the fountain)
export const waterTex = () => make('water', 128, 128, (g, w, h) => {
  g.fillStyle = '#bfe9ff'; g.fillRect(0, 0, w, h);
  const r = rng(21);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.5})`; g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 26, 0, 7); g.stroke();
  }
  g.fillStyle = 'rgba(70,150,200,.25)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 9, 0, 7); g.fill(); }
}, { repeat: [3, 3] });

// vertical water streaks (falling sheet)
export const streakTex = () => make('streak', 64, 128, (g, w, h) => {
  g.fillStyle = '#9fd8f5'; g.fillRect(0, 0, w, h);
  const r = rng(9);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.lineWidth = 1 + r() * 2.5;
    const x = r() * w, y = r() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20 + r() * 50); g.stroke();
  }
}, { repeat: [4, 1] });

// Tiny waffle pattern for ice-cream cones (fixed colour)
export const waffleTex = () => make('waffle', 64, 64, (g, w, h) => {
  g.fillStyle = '#e3b06b'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b97f3c'; g.lineWidth = 3;
  for (let i = -h; i < w + h; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
  }
}, { repeat: [3, 2] });

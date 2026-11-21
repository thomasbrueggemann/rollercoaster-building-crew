// Shared uniforms + soft sprite atlas for all billboard-particle effects.
import * as THREE from 'three';
import { renderer, camera, cam } from '../scene.js';
import { G } from '../state.js';

export const U = {
  uPx: { value: 100 },        // pixels per world unit (orthographic camera)
  uLight: { value: 1 },       // day/night tint for unlit particles
  uSquash: { value: Math.sin(cam.pitch) },
};
const _s = new THREE.Vector2();
export function updateShared() {
  renderer.getDrawingBufferSize(_s);
  U.uPx.value = _s.y / Math.max(0.001, camera.top - camera.bottom);
  U.uLight.value = 0.3 + 0.7 * (G.daylight ?? 1);
}

// 2x2 atlas: three irregular puffs + one soft ring (for ripples / shockwaves)
let atlas = null;
export function puffAtlas() {
  if (atlas) return atlas;
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 3; t++) {
    const ox = (t % 2) * S, oy = Math.floor(t / 2) * S;
    const blobs = 7 + t * 2;
    for (let i = 0; i < blobs; i++) {
      const a = rnd() * 6.283, d = i === 0 ? 0 : 0.12 + rnd() * 0.2;
      const x = ox + S / 2 + Math.cos(a) * d * S, y = oy + S / 2 + Math.sin(a) * d * S;
      const r = S * (i === 0 ? 0.42 : 0.16 + rnd() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, S, S);
    }
  }
  // ring tile
  {
    const ox = S, oy = S;
    const g = ctx.createRadialGradient(ox + S / 2, oy + S / 2, S * 0.18, ox + S / 2, oy + S / 2, S * 0.48);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, S, S);
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  return atlas;
}
export const TILE_RING = 3;

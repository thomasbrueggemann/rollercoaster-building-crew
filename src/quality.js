// Graphics quality tier shared by all rendering code.
// 'ultra' = desktop, 'high' = tablets / touch devices, 'low' = fallback for weak GPUs.
const KEY = 'coaster-crew-quality';
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
let saved = null;
try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }

export const QUALITY = {
  level: ['ultra', 'high', 'low'].includes(saved) ? saved : coarse ? 'high' : 'ultra',
};
export const isUltra = () => QUALITY.level === 'ultra';
export const isLow = () => QUALITY.level === 'low';
export function setQuality(level) {
  try { localStorage.setItem(KEY, level); } catch { /* ignore */ }
  location.reload();
}

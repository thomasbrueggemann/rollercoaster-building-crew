import { G } from './state.js';

let ctx = null;
function ac() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const unlockAudio = () => ac();

function tone(freq, dur, type = 'sine', vol = 0.06, slide = 0, delay = 0) {
  if (G.muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, freq, vol) {
  if (G.muted) return;
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  place: () => { tone(520, 0.08, 'triangle', 0.07); tone(780, 0.12, 'triangle', 0.07, 0, 0.07); },
  remove: () => tone(300, 0.18, 'triangle', 0.07, -150),
  click: () => tone(880, 0.04, 'square', 0.025),
  coin: () => { tone(1320, 0.05, 'square', 0.025); tone(1760, 0.08, 'square', 0.025, 0, 0.05); },
  error: () => tone(160, 0.2, 'sawtooth', 0.05),
  buy: () => { tone(660, 0.1, 'triangle', 0.07); tone(990, 0.16, 'triangle', 0.07, 0, 0.1); },
  upgrade: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, 0, i * 0.07)); },
  siren: () => { for (let i = 0; i < 3; i++) tone(560, 0.35, 'sawtooth', 0.035, 320, i * 0.4); },
  rumble: () => noise(3.5, 140, 0.5),
  wind: () => noise(4, 600, 0.25),
  splash: () => noise(2, 900, 0.2),
};

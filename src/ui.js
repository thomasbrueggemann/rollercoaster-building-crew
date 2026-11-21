import { QUALITY, setQuality } from './quality.js';
import { STAFF, SWATCHES, UPGRADE_COST, PLOTS } from './constants.js';
import { G, on, emit, hourOf, dayOf } from './state.js';
import { CATALOG } from './catalog.js';
import {
  stats, fairPrice, isFacility, applyScale, setColor, upgrade, repairNow, repairCost, rotateEntity, entranceTiles,
} from './entities.js';
import { setTool, select, rotateTool, coasterHeight, coasterUndo, coasterCancel, coasterStatus, plotPrice, ownedPlots, demolishSelected } from './tools.js';
import { hireStaff, fireStaff } from './guests.js';
import { D, DISASTERS, warnDisaster } from './disasters.js';
import { saveGame } from './save.js';
import { sfx, unlockAudio } from './audio.js';
import { UNIT, BASE } from './coaster.js';

// Early-reader friendly: short words, lots of icons, and everything can be read aloud.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TABS = [
  { id: 'select', ico: '👆', label: 'Look' },
  { id: 'rides', ico: '🎠', label: 'Rides' },
  { id: 'coaster', ico: '🎢', label: 'Coaster' },
  { id: 'shops', ico: '🍔', label: 'Food' },
  { id: 'scenery', ico: '🌳', label: 'Trees' },
  { id: 'land', ico: '🗺️', label: 'Land' },
  { id: 'staff', ico: '👷', label: 'Crew' },
  { id: 'demolish', ico: '🗑️', label: 'Remove' },
];
const PROT = [
  { k: 'wind', ico: '🌪️', name: 'Wind' },
  { k: 'flood', ico: '🌊', name: 'Rain' },
  { k: 'quake', ico: '🌋', name: 'Shake' },
];
const NEED_ICON = { hunger: '🍔', treat: '🍦', thirst: '🥤', gift: '🎈', bladder: '🚻' };

let tab = 'select';
let opts;

// ---------- read aloud ----------
const VOICE_KEY = 'coaster-crew-voice';
let voiceOn = (() => { try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; } })();
export function say(text) {
  if (!voiceOn || G.muted || !('speechSynthesis' in window) || !text) return;
  const clean = String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/🪙\s*(\d+)/gu, '$1 coins')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    .replace(/[•·×✕➕➖]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.9;
    u.pitch = 1.1;
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
function setVoice(onOff) {
  voiceOn = onOff;
  try { localStorage.setItem(VOICE_KEY, onOff ? 'on' : 'off'); } catch { /* ignore */ }
  $('btn-voice').textContent = voiceOn ? '🔊' : '🔈';
  $('btn-voice').classList.toggle('off', !voiceOn);
  if (voiceOn) say('I will read for you!');
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ---------- title ----------
export function showTitle() {
  $('title').classList.remove('hidden');
}
function start(fromSave) {
  unlockAudio();
  $('title').classList.add('hidden');
  ['hud', 'toolbar', 'hint', 'camctl'].forEach((id) => $(id).classList.remove('hidden'));
  opts.onStart(fromSave);
  $('opt-disasters').checked = G.disastersOn;
  $('opt-mute').checked = G.muted;
  renderTabs();
  renderTray();
  updateHint();
  if (!fromSave) {
    setTimeout(() => toast('👋 Hi! Tap 🎠 to make a ride!', 'good'), 400);
    setTimeout(() => toast('🌪️ Storms can come! Make rides strong 💪'), 9000);
  } else toast('🎢 Welcome back!', 'good');
}

// ---------- toasts ----------
export function toast(msg, kind = '') {
  const box = $('toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  t.title = 'Tap to hear';
  t.onclick = () => say(msg);
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 6500);
  say(msg);
}

// ---------- little helpers ----------
const starsOf = (exc) => Math.max(1, Math.min(5, Math.round(exc / 2)));
const stars = (exc) => {
  const n = starsOf(exc);
  return `<span class="stars" title="Fun">${'⭐'.repeat(n)}<span class="dim">${'⭐'.repeat(5 - n)}</span></span>`;
};
const coins = (n) => (n ? `🪙 ${n}` : 'Free');

// ---------- tabs & tray ----------
function renderTabs() {
  $('tabs').innerHTML = TABS.map((t) =>
    `<button class="tab ${t.id === tab ? 'on' : ''}" data-tab="${t.id}"><span class="ico">${t.ico}</span>${t.label}</button>`).join('');
}
function openTab(id) {
  tab = tab === id && id !== 'select' ? 'select' : id;
  if (tab === 'coaster') setTool('coaster');
  else if (tab === 'land') setTool('land');
  else if (tab === 'demolish') setTool('demolish');
  else setTool('select');
  sfx.click();
  say(TABS.find((t) => t.id === tab)?.label);
  renderTabs();
  renderTray();
  updateHint();
}

function itemCard(type) {
  const d = CATALOG[type];
  const on = G.tool.mode === 'place' && G.tool.type === type;
  let meta = '';
  if (d.kind === 'ride') meta = stars(d.exc);
  if (d.kind === 'shop') meta = `<span class="free">${d.price ? '' : 'Free'}</span>`;
  return `<button class="item ${on ? 'on' : ''}" data-place="${type}" title="${esc(d.desc)}">
    <span class="ico">${d.icon}</span><span class="nm">${d.name}</span><span class="meta">${meta}</span></button>`;
}

function renderTray() {
  const tray = $('tray');
  let h = '';
  if (tab === 'rides' || tab === 'shops' || tab === 'scenery') {
    const types = Object.keys(CATALOG).filter((k) => CATALOG[k].tab === tab);
    const title = { rides: '🎠 Rides', shops: '🍔 Food and more', scenery: '🌳 Make it pretty' }[tab];
    h = `<div class="tray-head"><h3>${title} <span class="free">Free!</span></h3><button data-act="rot" title="Turn (R)">🔄 Turn</button></div>
      <div class="items">${types.map(itemCard).join('')}</div>`;
  } else if (tab === 'coaster') {
    const s = coasterStatus() || { pieces: 0, h: 0, closeIssue: 'empty' };
    let status;
    if (!s.pieces) status = '1️⃣ Tap the grass. That is the 🚉 start.';
    else if (s.closeIssue) status = `2️⃣ Tap next to the track. <span class="status-warn">${esc(s.closeIssue)}</span>`;
    else status = '<span class="status-ok">✅ Tap the 🚉 to finish!</span>';
    h = `<div class="tray-head"><h3>🎢 Build a coaster</h3><span class="pieces">🧩 ${s.pieces}</span></div>
      <div class="tray-text big">${status}</div>
      <div class="coaster-ctl">
        <div class="hbox"><button data-act="h-" title="Down">⬇️</button><b>⛰️ ${s.h}</b><button data-act="h+" title="Up">⬆️</button></div>
        <button data-act="undo" ${s.pieces ? '' : 'disabled'}>↩️ Back</button>
        <button data-act="cancel" ${s.pieces ? '' : 'disabled'}>❌ Stop</button>
      </div>`;
  } else if (tab === 'land') {
    h = `<div class="tray-head"><h3>🗺️ Buy land</h3><span class="small">${ownedPlots()} / ${PLOTS * PLOTS}</span></div>
      <div class="tray-text big">Tap <b style="color:#ffe066">🟨 yellow</b> land. <b style="color:var(--yellow)">🪙 ${plotPrice()}</b></div>`;
  } else if (tab === 'staff') {
    const rows = Object.entries(STAFF).map(([k, s]) => {
      const n = G.staff.filter((x) => x.kind === k).length;
      return `<div class="staff-row"><span class="ico">${s.icon}</span><div class="grow"><b>${s.name}</b><div class="small">${s.desc}</div></div>
        <button data-fire="${k}" ${n ? '' : 'disabled'} title="Less">➖</button><span class="count">${n}</span>
        <button class="primary" data-hire="${k}" title="More">➕ 🪙 ${s.hire}</button></div>`;
    }).join('');
    h = `<div class="tray-head"><h3>👷 Your crew</h3></div>${rows}`;
  } else if (tab === 'demolish') {
    h = `<div class="tray-head"><h3>🗑️ Remove</h3></div><div class="tray-text big">Tap a ride to remove it.</div>`;
  }
  tray.innerHTML = h;
  tray.classList.toggle('hidden', !h);
}

function updateHint() {
  const m = G.tool.mode;
  const txt = {
    select: '👆 Tap a ride to look. 🗑️ Tap trash = 🪙 2',
    place: '👆 Tap the grass to build.',
    coaster: '🎢 Tap next to the track.',
    land: '🟨 Tap yellow land.',
    demolish: '🗑️ Tap to remove.',
  }[m];
  $('hint').innerHTML = txt || '';
}

// ---------- inspector ----------
const fmt = (n) => Math.round(n).toLocaleString();
function renderInspector() {
  const ins = $('inspector');
  const e = G.selected;
  if (!e || !G.entities.has(e.id)) { ins.classList.add('hidden'); return; }
  ins.classList.remove('hidden');
  const fac = isFacility(e);
  const s = stats(e);
  let h = `<div class="ins-head"><span class="ins-icon">${e.def.icon}</span><div><div class="ins-name">${esc(e.name)}</div>
    <div class="status" id="i-status"></div></div><button class="x" data-act="close" title="Close">✕</button></div>`;
  if (e.kind !== 'scenery') h += `<div class="life"><span title="Health">❤️</span><div class="hp"><div id="i-hp"></div></div></div><div class="progress hidden" id="i-fixbar"><div></div></div>`;

  if (fac) {
    const cells = [];
    if (e.kind !== 'shop') cells.push(['Fun', `<span id="i-exc">${stars(s.exc)}</span>`]);
    if (e.kind === 'coaster') cells.push(['High', `⛰️ ${((e.info.maxY - BASE) / UNIT).toFixed(0)}`]);
    if (e.kind !== 'shop') cells.push(['Seats', `🪑 <span id="i-cap">${s.cap}</span>`]);
    else cells.push(['Sells', NEED_ICON[e.def.need]]);
    cells.push(['Coins', `🪙 <span id="i-earned">0</span>`]);
    cells.push(['People', `🧑 <span id="i-served">0</span>`]);
    h += `<section><div class="statgrid">${cells.map(([k, v]) => `<div class="stat" title="${k}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>`;
    if (!entranceTiles(e).length) h += `<div class="warnline">⚠️ No way in! Make space.</div>`;
    h += `</section>`;
    h += `<section><h4>🎟️ Price</h4>
      <div class="price"><button data-act="price-">➖</button><b id="i-price"></b><button data-act="price+">➕</button>
      <span class="mood" id="i-fair"></span></div></section>`;
  }

  h += `<section><h4>🎨 Color</h4><div class="swatches">${SWATCHES.map((c) =>
    `<button class="sw ${c === e.color ? 'on' : ''}" style="background:${c}" data-color="${c}" title="${c}"></button>`).join('')}
    <span class="sw" title="More colors"><input type="color" id="i-color" value="${e.color}"></span></div></section>`;

  if (e.kind !== 'coaster') {
    h += `<section><h4>📏 Size</h4>
      <div class="slider"><span title="Wide">↔️</span><input type="range" id="i-w" min="0.7" max="1.4" step="0.05" value="${e.w}"></div>
      <div class="slider"><span title="Tall">↕️</span><input type="range" id="i-h" min="0.6" max="1.7" step="0.05" value="${e.h}"></div></section>`;
  }

  if (e.kind !== 'scenery') {
    h += `<section><h4>💪 Make it strong</h4>${PROT.map((p) => {
      const lvl = e.resist[p.k];
      const btn = lvl >= 3 ? '<button disabled>✅</button>' : `<button data-up="${p.k}" class="primary">💪 🪙 ${UPGRADE_COST[lvl]}</button>`;
      return `<div class="prot"><span class="nm">${p.ico} ${p.name}</span><span class="shields">${'🛡️'.repeat(lvl)}<span class="dim">${'🛡️'.repeat(3 - lvl)}</span></span>${btn}</div>`;
    }).join('')}</section>`;
  }

  h += `<section class="actions">`;
  if (e.kind !== 'scenery') h += `<button data-act="repair" id="i-repair">🔧 Fix</button><button data-act="hand" id="i-hand" title="Free!">✋ Fix</button>`;
  if (e.kind !== 'coaster') h += `<button data-act="rotate">🔄 Turn</button>`;
  h += `<button data-act="remove" class="danger">🗑️</button></section>`;
  ins.innerHTML = h;
  liveInspector();
}

function liveInspector() {
  const e = G.selected;
  if (!e || !G.entities.has(e.id) || $('inspector').classList.contains('hidden')) return;
  const st = $('i-status');
  if (st) {
    let t = '';
    if (e.kind === 'scenery') t = '🌼';
    else if (e.hp <= 0) t = '💥 Broken!';
    else if (e.state === 'run') t = `▶️ 🧑 ${e.riders.length}`;
    else t = '⏳';
    if (e.queue.length) t += ` · 🧍 ${e.queue.length}`;
    st.textContent = t;
  }
  const hp = $('i-hp');
  if (hp) {
    hp.style.width = `${Math.max(0, e.hp)}%`;
    hp.style.background = e.hp > 60 ? 'var(--green)' : e.hp > 25 ? 'var(--yellow)' : 'var(--red)';
    const r = $('i-repair');
    const cost = repairCost(e);
    r.textContent = e.hp >= 100 ? '🔧 👍' : `🔧 Fix 🪙 ${cost}`;
    r.disabled = e.hp >= 100 || G.money < cost;
    const hand = $('i-hand');
    hand.disabled = e.hp >= 100 || e.handFix > 0;
    hand.textContent = e.handFix > 0 ? '✋ …' : '✋ Fix free';
    const bar = $('i-fixbar');
    bar.classList.toggle('hidden', !(e.handFix > 0));
    bar.firstChild.style.width = `${Math.round(e.handFix * 100)}%`;
  }
  if ($('i-earned')) $('i-earned').textContent = fmt(e.income);
  if ($('i-served')) $('i-served').textContent = fmt(e.riddenTotal);
  if ($('i-price')) {
    $('i-price').textContent = coins(e.price);
    const fair = fairPrice(e);
    $('i-fair').innerHTML = e.price > fair ? '<span style="color:var(--red)">😠 Too much!</span>' : e.price <= fair - 2 ? '😀' : '🙂';
  }
  document.querySelectorAll('#inspector [data-up]').forEach((b) => {
    b.disabled = G.money < UPGRADE_COST[e.resist[b.dataset.up]];
  });
}

function onInspectorClick(ev) {
  const e = G.selected;
  if (!e) return;
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.color) { setColor(e, b.dataset.color); sfx.click(); renderInspector(); return; }
  if (b.dataset.up) {
    const p = PROT.find((x) => x.k === b.dataset.up);
    if (upgrade(e, b.dataset.up)) { sfx.upgrade(); toast(`💪 ${p.ico} Stronger!`, 'good'); }
    else { sfx.error(); toast('🪙 Not enough!', 'warn'); }
    renderInspector();
    return;
  }
  switch (b.dataset.act) {
    case 'close': select(null); break;
    case 'price-': e.price = Math.max(0, e.price - 1); sfx.click(); liveInspector(); break;
    case 'price+': e.price = Math.min(20, e.price + 1); sfx.click(); liveInspector(); break;
    case 'repair': if (repairNow(e)) { sfx.upgrade(); toast(`🔧 ${e.def.icon} Fixed!`, 'good'); } else sfx.error(); liveInspector(); break;
    case 'hand': if (e.hp < 100 && !(e.handFix > 0)) { e.handFix = 0.001; sfx.click(); say('Fixing!'); } liveInspector(); break;
    case 'rotate': rotateEntity(e); sfx.click(); break;
    case 'remove': demolishSelected(); break;
  }
}
function onInspectorInput(ev) {
  const e = G.selected;
  if (!e) return;
  const t = ev.target;
  if (t.id === 'i-color') { setColor(e, t.value); document.querySelectorAll('#inspector .sw.on').forEach((s) => s.classList.remove('on')); }
  if (t.id === 'i-w' || t.id === 'i-h') {
    e[t.id === 'i-w' ? 'w' : 'h'] = +t.value;
    applyScale(e);
    const s = stats(e);
    if ($('i-exc')) $('i-exc').innerHTML = stars(s.exc);
    if ($('i-cap')) $('i-cap').textContent = s.cap;
    liveInspector();
  }
}

// ---------- HUD ----------
let lastMoney = 0;
export function updateHUD() {
  if (!G.started) return;
  $('money').textContent = fmt(G.money);
  if (G.money < lastMoney - 0.5) { const p = $('money').parentElement; p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash'); }
  lastMoney = G.money;
  const hr = hourOf();
  const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60 / 10) * 10;
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('day').textContent = dayOf();
  $('sky').textContent = G.storm > 0.5 ? '⛈️' : G.daylight > 0.8 ? '☀️' : G.daylight > 0.05 ? '🌅' : '🌙';
  $('guests').textContent = G.guests.length;
  $('rating').textContent = Math.round(G.rating);
  const hap = G.avgHappy ?? 0;
  $('happy').textContent = !G.guests.length ? '–' : hap > 70 ? '😀' : hap > 45 ? '🙂' : hap > 25 ? '😐' : '😢';
  document.querySelectorAll('.speed button').forEach((b) => {
    const s = +b.dataset.speed;
    b.classList.toggle('on', s === 0 ? G.paused : !G.paused && G.speed === s);
  });
  const ban = $('banner');
  if (D.warn) {
    const info = DISASTERS[D.warn.type];
    ban.className = '';
    ban.innerHTML = `${info.icon} ${info.warn} <b>${Math.ceil(D.warn.t)}</b><span class="sub">💪 Make rides strong!</span>`;
  } else if (D.active.length) {
    ban.className = 'active';
    ban.innerHTML = D.active.map((a) => `${DISASTERS[a.type].icon} ${DISASTERS[a.type].name}!`).join(' + ') + '<span class="sub">Hold on! 😱</span>';
  } else ban.className = 'hidden';
  liveInspector();
}

// ---------- wiring ----------
export function initUI(o) {
  opts = o;
  if (o.hasSave) $('btn-continue').classList.remove('hidden');
  $('btn-start').onclick = () => {
    if (o.hasSave && !confirm('Start a new park? Your old park will be gone.')) return;
    o.clearSave();
    start(false);
  };
  $('btn-continue').onclick = () => start(true);

  $('btn-voice').textContent = voiceOn ? '🔊' : '🔈';
  $('btn-voice').classList.toggle('off', !voiceOn);
  $('btn-voice').onclick = () => setVoice(!voiceOn);
  $('hint').onclick = () => say($('hint').textContent);

  $('tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });
  $('tray').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.place) {
      if (G.tool.mode === 'place' && G.tool.type === b.dataset.place) setTool('select');
      else { setTool('place', b.dataset.place); say(CATALOG[b.dataset.place].name); }
      sfx.click();
      renderTray();
    } else if (b.dataset.hire) {
      const s = STAFF[b.dataset.hire];
      if (hireStaff(b.dataset.hire)) { sfx.buy(); toast(`${s.icon} New ${s.name}!`, 'good'); }
      else { sfx.error(); toast('🪙 Not enough!', 'warn'); }
    } else if (b.dataset.fire) { fireStaff(b.dataset.fire); sfx.remove(); }
    else if (b.dataset.act === 'rot') { rotateTool(); sfx.click(); }
    else if (b.dataset.act === 'h-') { coasterHeight(-1); say('Down'); }
    else if (b.dataset.act === 'h+') { coasterHeight(1); say('Up'); }
    else if (b.dataset.act === 'undo') coasterUndo();
    else if (b.dataset.act === 'cancel') coasterCancel();
  });
  $('inspector').addEventListener('click', onInspectorClick);
  $('inspector').addEventListener('input', onInspectorInput);

  document.querySelectorAll('.speed button').forEach((b) => (b.onclick = () => {
    const s = +b.dataset.speed;
    if (s === 0) G.paused = !G.paused; else { G.speed = s; G.paused = false; }
    sfx.click();
    updateHUD();
  }));
  $('btn-settings').onclick = () => $('settings').classList.toggle('hidden');
  $('opt-disasters').onchange = (ev) => { G.disastersOn = ev.target.checked; if (!G.disastersOn) D.warn = null; };
  $('opt-mute').onchange = (ev) => (G.muted = ev.target.checked);
  $('opt-quality').value = QUALITY.level;
  $('opt-quality').onchange = (ev) => setQuality(ev.target.value);
  document.querySelectorAll('[data-test]').forEach((b) => (b.onclick = () => {
    if (D.warn) return toast('⏳ Wait!', 'warn');
    warnDisaster(b.dataset.test);
    $('settings').classList.add('hidden');
  }));
  $('btn-save').onclick = () => toast(saveGame() ? '💾 Saved!' : '💾 Oops!', 'good');
  $('btn-new').onclick = () => { if (confirm('Start a new park? Your old park will be gone.')) o.onNewGame(); };

  on('toast', toast);
  on('select', (e) => { renderInspector(); if (e) say(e.name); });
  on('entities', () => { if (G.selected && !G.entities.has(G.selected.id)) select(null); });
  on('tool', () => {
    if (G.tool.mode === 'select' && ['coaster', 'land', 'demolish'].includes(tab)) { tab = 'select'; renderTabs(); }
    renderTray();
    updateHint();
  });
  on('coaster', renderTray);
  on('land', renderTray);
  on('staff', renderTray);
  on('wrecked', (e) => toast(`💥 ${e.def.icon} ${e.name} broke! 🔧`, 'bad'));
  on('warning', (type) => toast(`${DISASTERS[type].icon} ${DISASTERS[type].warn}`, 'bad'));
  let firstRide = true;
  on('placed', (def) => {
    if (firstRide && (def.kind === 'ride')) {
      firstRide = false;
      toast('🎉 People are coming!', 'good');
      setTimeout(() => toast('🍔 🥤 🚻 They need food and a toilet!'), 5000);
    }
  });
}

export { emit };

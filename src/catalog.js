import { carousel, ferris } from './models/rides1.js';
import { dropTower, bumperCars, swingRide } from './models/rides2.js';
import { burger, icecream, drinks, gift, toilet } from './models/shops.js';
import { tree, fountain, bench } from './models/scenery.js';

// Procedural PBR models live in src/models/*. Every builder returns { group, paint, glow, animate, top }.

// ---------- catalog ----------
// kind: ride | shop | scenery. Rides & shops are free to place (the twist: no buying rides).
export const CATALOG = {
  carousel: { kind: 'ride', tab: 'rides', name: 'Horses', icon: '🎠', size: 2, color: '#ff5d73', cap: 8, dur: 14, exc: 3, price: 2, build: carousel, desc: 'Slow and fun.' },
  ferris: { kind: 'ride', tab: 'rides', name: 'Big Wheel', icon: '🎡', size: 3, color: '#4cc9f0', cap: 10, dur: 22, exc: 4, price: 3, build: ferris, desc: 'Up high!' },
  swing: { kind: 'ride', tab: 'rides', name: 'Swings', icon: '🪁', size: 2, color: '#9b5de5', cap: 10, dur: 14, exc: 5, price: 3, build: swingRide, desc: 'Spin and fly!' },
  bumper: { kind: 'ride', tab: 'rides', name: 'Bump Cars', icon: '🚗', size: 3, color: '#ffd23f', cap: 6, dur: 16, exc: 5, price: 2, build: bumperCars, desc: 'Bump bump!' },
  drop: { kind: 'ride', tab: 'rides', name: 'Drop', icon: '🗼', size: 2, color: '#ff9f1c', cap: 4, dur: 12, exc: 8, price: 4, build: dropTower, desc: 'Up… and DOWN!' },
  burger: { kind: 'shop', tab: 'shops', name: 'Burger', icon: '🍔', size: 1, color: '#ef233c', cap: 2, dur: 2.5, price: 3, need: 'hunger', litter: 0.6, build: burger, desc: 'Yum!' },
  icecream: { kind: 'shop', tab: 'shops', name: 'Ice Cream', icon: '🍦', size: 1, color: '#f15bb5', cap: 2, dur: 2, price: 2, need: 'treat', litter: 0.5, build: icecream, desc: 'Cold and yum!' },
  drinks: { kind: 'shop', tab: 'shops', name: 'Drinks', icon: '🥤', size: 1, color: '#2ec4b6', cap: 2, dur: 2, price: 2, need: 'thirst', litter: 0.5, build: drinks, desc: 'Glug glug!' },
  gift: { kind: 'shop', tab: 'shops', name: 'Gifts', icon: '🎁', size: 1, color: '#4361ee', cap: 2, dur: 3, price: 5, need: 'gift', litter: 0, build: gift, desc: 'Fun toys!' },
  toilet: { kind: 'shop', tab: 'shops', name: 'Toilet', icon: '🚻', size: 1, color: '#4cc9f0', cap: 2, dur: 3, price: 0, need: 'bladder', litter: 0, build: toilet, desc: 'Free!' },
  tree: { kind: 'scenery', tab: 'scenery', name: 'Tree', icon: '🌲', size: 1, color: '#3a9d5d', build: tree, desc: 'Nice and green.' },
  bench: { kind: 'scenery', tab: 'scenery', name: 'Bench', icon: '🪑', size: 1, color: '#a0522d', build: bench, desc: 'Has a lamp.' },
  fountain: { kind: 'scenery', tab: 'scenery', name: 'Fountain', icon: '⛲', size: 2, color: '#e9ecef', build: fountain, desc: 'So pretty!' },
  coaster: { kind: 'coaster', tab: 'coaster', name: 'Coaster', icon: '🎢', size: 1, color: '#ff5d73', cap: 8, price: 4, desc: 'Build it!' },
};

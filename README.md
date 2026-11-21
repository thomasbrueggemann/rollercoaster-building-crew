# Rollercoaster Building Crew 🎢

An isometric theme-park builder in Three.js, playable with mouse or touch and installable as a PWA.

## The idea (from the voice memos)

- RollerCoaster Tycoon-style park seen from above, but **rides and shops are free**: you just place them.
- **Paint** anything and make it **wider / taller** (wider = more riders, taller = more exciting but catches wind).
- **Roller coasters are built piece by piece**: lay track tile by tile, raise it into hills, close the loop at the station.
- **Buy more land** cheaply. Money is pretend coins, earned from ticket sales and shops.
- **Guests** walk in, ride, eat, drink, use the toilets, drop litter. **Staff** (mechanics, janitors) walk around working.
  You can do **odd jobs** yourself: tap litter for coins, or fix a ride by hand.
- **Disasters**: tornadoes, floods and earthquakes, sometimes overlapping and sometimes at night.
  Upgrade each attraction's storm bracing, flood barriers and quake dampers.

## Run

```bash
npm install
npm run dev        # http://localhost:5317
npm run build      # production build in dist/
npm run preview    # serve dist/ (service worker active here)
```

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Place / select / buy | click | tap |
| Move camera | drag, right-drag, WASD | one-finger drag |
| Zoom | scroll | pinch, ＋ / － buttons |
| Rotate view | Q / E | ⟲ ⟳ buttons |
| Rotate item | R | "Rotate item" button |
| Coaster height | T / F | ▲ ▼ in the coaster panel |
| Pause / speed | Space, 1-3 | ⏸ ▶ ⏩ ⏭ |

## PWA

`public/manifest.webmanifest` and `public/sw.js` make the production build installable and playable offline.
Bump `VERSION` in `sw.js` when you ship a new build. Icons are generated with `node scripts/make-icons.mjs`.
The park auto-saves to `localStorage`.

## Code map

- `src/scene.js`: renderer, isometric camera, island, land plots, lighting / day-night
- `src/catalog.js`: procedural low-poly rides, shops, scenery
- `src/coaster.js`: track meshes, station, train, ride physics
- `src/entities.js`: placement, ride simulation, damage / repair / upgrades
- `src/guests.js`: guests, staff, litter, pathfinding use
- `src/disasters.js`: tornado, flood, earthquake
- `src/tools.js`: build tools (place, coaster builder, land, remove)
- `src/ui.js`: HUD, toolbar, inspector, toasts
- `src/main.js`: input (mouse + touch), game loop, debug hook `window.__game.step(seconds)`

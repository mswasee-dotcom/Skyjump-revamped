# NEON ROADRUNNER

A 3D arcade racer inspired by the 1993 classic **SkyRoads**, with a clean retro-arcade look: solid-colour bevelled blocks, bold tile symbols, banded planets and a pixel-font interface. Fly a small ship along a narrow neon road suspended over the void: steer, manage your speed, jump the gaps, read the tiles, and reach the finish gate without falling into space.

Built with TypeScript, Three.js and Vite. Runs entirely in the browser — no backend, no accounts, no network calls. All visuals and audio are generated procedurally at runtime, so the game ships with no image or sound assets, and none of SkyRoads' original assets, music or levels are used.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build        # type-checks, then builds to dist/
npm run preview      # serves dist/ at http://localhost:4173
npm run build:single # one self-contained HTML file in dist-single/ (easy to share or open on a phone)
```

Requires Node 18+ and a browser with WebGL (any current Chrome, Edge, Firefox or Safari, desktop or mobile).

## Publishing

The game is a static site (everything is in `dist/` after `npm run build`), so any static host works.

**Cloudflare Workers (free; keeps the repo private):**

```bash
npm run deploy      # builds, then deploys dist/ with wrangler (opens a browser login the first time)
```

The game appears at `https://neon-roadrunner.<your-subdomain>.workers.dev`. For automatic deploys on every push, connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Import a repository) with build command `npm run build` and deploy command `npx wrangler deploy`.

**GitHub Pages:** `.github/workflows/pages.yml` deploys on push to `main` once Pages is set to "GitHub Actions" (free plan needs a public repo).

## How to play

Your ship flies forward on its own. Steer, accelerate or brake, and jump to reach the finish gate. Falling off the road or hitting a wall costs a life; you respawn at the last checkpoint.

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | A / D or ← / → | Left stick or d-pad | ◀ ▶ buttons |
| Accelerate | W or ↑ | RT | ▲ button |
| Brake | S or ↓ | LT | ▼ button |
| Jump | Space or J | A | JUMP button |
| Pause | Esc or P | Start | ❚❚ button |
| Restart | R | Y | Pause menu |

All keys can be remapped in **Settings → Controls**. Touch buttons appear automatically on touch screens (or force them on/off in Settings).

### Track tiles

| Tile | Effect |
|---|---|
| Standard (sector colour) | Normal grip and speed |
| Accelerator (green chevrons) | Pushes your speed up while you ride it |
| Drag plate (orange, reversed chevrons) | Bleeds your speed while you ride it |
| Boost strip (white) | A burst of speed above top speed for ~1.25 s |
| Launch pad (yellow ring) | Throws you high into the air automatically |
| Cryo ice (pale blue) | Almost no steering traction — you keep sliding |
| Fragile (violet, dashed) | Collapses just after you cross it |
| Plasma (red stripes) | Destroys the ship on contact |
| Low block | Raised block you can jump onto and ride along |
| Wall | Tall block — steer around it |

Plus moving blocks that slide across the road, ramps, drop-offs and floating energy orbs.

### Scoring and medals

Points for clearing the sector, finishing fast (time under the silver mark), energy orbs, clean landings, time spent near top speed, and taking the risky side routes. Crashes cost points. **Gold** needs the gold time *and* a crash-free run; **silver** needs the silver time; **bronze** is any clear. Best times, scores, medals and statistics are saved locally.

### Progression

- **10 campaign sectors**, each teaching or combining mechanics: First Flight → The Gap → Thermal Run → Frozen Orbit → Vanishing Road → Hazard Sector → Speed Trial → Broken Circuit → Orbital Descent → Final Approach.
- **Endless mode** (unlocked after sector 1): a procedurally generated road that never ends and ramps up in difficulty.
- **Garage**: three original ships — COMET (balanced, default), WISP (light and twitchy, clear sector 3), BASTION (heavy, grips ice, clear sector 6). Recolour hull, neon accents and engine trail; unlock trail effects (Ion Stream, Spark Storm, Prism, Nova) through medals and endless distance.

## Project structure

```
src/
  core/        pure game logic, no rendering (testable in Node)
    constants.ts   all tuning numbers in one place
    tiles.ts       tile types and metadata
    track.ts       track grid, per-run state (fragile tiles, orbs), surface queries
    physics.ts     fixed-step vehicle physics and collision
    vehicles.ts    ship stats
    scoring.ts     score keeping, medals
    progress.ts    unlocks, records
    save.ts        versioned, self-repairing local save data
    autopilot.ts   lookahead bot that drives with the real physics (tests + verification)
  levels/
    dsl.ts         compact text format for authoring tracks
    campaign.ts    the 10 authored sectors
    endless.ts     seeded procedural generator for endless mode
    themes.ts      per-sector colours, planets, fog
  render/        Three.js: renderer + bloom, chunked instanced track, ships, environment, particles, camera
  audio/         Web Audio synthesizer: engine, effects, procedural synthwave music
  game/          game controller, race session, menu showcase, input (keyboard/gamepad/touch)
  ui/            DOM menus, HUD and overlays, styles
tests/           Vitest unit tests (+ campaign.slow.ts full playthrough)
scripts/         browser smoke tests (Playwright) and level-design probes
```

### Architecture notes

- **Fixed-step physics at 120 Hz** with render interpolation, so behaviour is identical at 30, 60 or 144 fps. Frame time is clamped, and the game auto-pauses when the tab is hidden, so there are no physics jumps after a tab switch.
- **Logic is separated from rendering.** Everything in `src/core` and `src/levels` runs in Node, which lets the test suite simulate whole levels.
- **Levels are data.** Each sector is a short text layout (see `src/levels/dsl.ts`), parsed into a tile grid. Hints, risky-route bonus zones and moving obstacles are inline directives.
- **Track rendering is chunked and instanced**: only the 24-row chunks near the camera exist, each drawing all tiles of a type in one call. Memory and draw calls stay flat however long a run gets (which is what makes endless mode possible). Chunks are disposed as they fall behind.
- **One pooled particle system** handles every effect (exhaust trails, sparks, explosions, landing dust, orbs, crumbling tiles) with a fixed capacity and no per-frame allocation.
- **Save data is versioned and sanitised field by field**, so a corrupted or outdated save never wipes progress; corrupted data is backed up to a `.corrupt` key.
- **Two looks** (Settings → Graphics → Look): *Arcade* (default; flat-shaded solid tiles, no bloom) and *Neon* (glowing synthwave grid with bloom).
- **Quality levels**: High (bloom, up to 2× pixel ratio), Medium (half-resolution bloom), Low (no post-processing, 1× pixel ratio) for older laptops and phones.

## Testing

```bash
npm test             # 85 unit tests: DSL, physics, collisions, every tile, save repair, progression, scoring, levels, endless generator
npm run test:levels  # slow (~6 min): the autopilot drives all 10 sectors start to finish with the real physics
SHIPS=comet,wisp,bastion npm run test:levels   # ...with every ship
```

Browser tests (need Python 3 with Playwright and a running preview server):

```bash
npm run build && npm run preview &
python3 scripts/smoke_play.py http://localhost:4173/ ./screenshots   # 27 gameplay checks
python3 scripts/smoke.py http://localhost:4173/ ./screenshots        # menu screenshots
```

`smoke_play.py` checks: title → menu, countdown, auto-forward motion, steering, accelerate/brake, jump, pause/resume, falling off, life loss and respawn, finishing, results, records saved, restart, quit, persistence across reload, endless unlock and generation, game over, settings changing real behaviour, and no console errors.

### Adding or editing a level

Layouts live in `src/levels/campaign.ts`. One line per row, in driving order:

```
8|=======|          8 rows of standard track, 7 lanes wide
:hint Press SPACE   tutorial banner shown as you reach the next row
2|  ===  |          a 3-lane strip
3|       |          a 3-row gap
|  >>>  |           accelerators     <  drag   !  boost   ^  launch pad
|  ~x%  |           ice, plasma, fragile
|  b#o* |           low block, wall, orb on a tile, orb floating over the void
|  /v   |           ramp up / ramp down (raises/lowers following rows)
@2                  set floor height for following rows
2|CCCCCCC|          checkpoint
3|FFFFFFF|          finish
```

Then run `npm run test:levels` to prove it's still completable.

## Known limitations

- Medal times were calibrated against the autopilot's runs; a very skilled player may beat gold comfortably on some sectors.
- Fullscreen may be unavailable inside some embedded browsers (the game shows a notice); iPhone Safari doesn't support page fullscreen — use "Add to Home Screen" for a full-screen experience.
- Audio starts after the first key press or tap, as browsers require.
- Moving obstacles keep moving while you respawn; they never block a checkpoint.

## Credits

Original game design, code, geometry, textures, music and sound. Inspired by *SkyRoads* (Bluemoon Interactive, 1993). Fonts: Press Start 2P, Orbitron and Rajdhani (SIL Open Font License), bundled via Fontsource.

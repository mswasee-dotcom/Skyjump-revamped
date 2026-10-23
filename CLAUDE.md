# CLAUDE.md — NEON ROADRUNNER

Notes for future Claude Code sessions working in this repo.

## What this is
A SkyRoads-inspired 3D browser racer. TypeScript + Three.js + Vite, no backend. See README.md for player-facing docs.

## Commands
- `npm run dev` — dev server
- `npm run build` — `tsc --noEmit` + Vite build (must stay green)
- `npm test` — fast unit tests (~40 s)
- `npm run test:levels` — slow autopilot playthrough of all 10 sectors (~6 min). Run after any change to physics constants or level layouts.
- `npm run build:single` — single self-contained HTML in `dist-single/`
- Browser checks: `python3 scripts/smoke_play.py <url> <outdir>` against `npm run preview`
- Level-design probes (dev only): `PROBE=1 npx vitest run scripts/levels.probe.ts`; `LEVEL=n FROM=a TO=b` with `dump.probe.ts` / `trace.probe.ts`

## Architectural invariants
1. **`src/core` and `src/levels` must never import Three.js or touch the DOM.** They run in Node for tests and the autopilot.
2. **Physics is fixed-step (`PHYSICS_DT`, 120 Hz) and deterministic.** Never step physics with a variable dt. All gameplay numbers live in `src/core/constants.ts` and `src/core/vehicles.ts`.
3. **Every campaign layout must be completable** by the autopilot with each ship within the sector's lives (`tests/campaign.slow.ts`). Gaps must stay within a cruise-speed jump (≈4.5 rows normal, ≈6.9 rows launch pad; jumps were deliberately tightened for challenge); `tests/levels.test.ts` enforces ≤7.
4. **All three ships share cruise speed (16) and near-identical jump arcs** so that level fairness doesn't depend on ship choice. Ships differ in top speed, steering and grip.
5. **Endless patterns must be fair by construction**: start and end on plain tiles inside the corridor, keep ≥2 adjacent safe lanes beside walls/plasma. `tests/levels.test.ts` checks 60 seeds × 1500 rows structurally.
6. **Save data goes through `sanitize()`**. Add new fields with defaults there; bump `SAVE_VERSION` and extend `migrate()` for layout changes. Never let a bad field wipe progress.
7. **No external network calls, no assets with licensing questions.** Textures are canvas-drawn, audio is synthesized, fonts are bundled.
8. **Every UI control must do something.** No dead buttons.
9. Respawns call `track.resetState(checkpoint)` without restoring orbs (no farming); a full restart creates a new Session.

## Power-ups
`src/core/items.ts` (kinds, tuning) → cells carry `item`; `track.itemTaken` mirrors `orbTaken` (not restored on respawn). Effects live in `physics.ts` (`applyItem`, `absorb` for shields; wings = mid-air jump; nitro = `DriveInput.nitroPressed`). Extra life and the score multiplier are handled by `Session`/`ScoreKeeper`. Endless items use a separate RNG stream so they never change the road for a seed. The autopilot saves/restores `itemTaken` around rollouts — any new per-run track state must be added there too.

## Visual style
Default look is `arcade` (src/render/style.ts): Lambert flat-shaded tiles with textures from `retroTextures.ts`, no bloom, pixel font UI (`html.pixel-ui`). `neon` is the alternative. Keep standard-tile tints away from special-tile colours (tested).

## Where things are
- Game flow / state machine: `src/game/game.ts`; one race: `src/game/session.ts`
- Tile behaviour: `src/core/physics.ts` (search "Surface effects")
- Track streaming/instancing: `src/render/trackView.ts`
- Menus/HUD: `src/ui/ui.ts`, styles in `src/ui/styles.css`
- `window.__game.debug()` exposes state, `advance(seconds, steer, throttle)` and `startLevel(id)` for browser tests.

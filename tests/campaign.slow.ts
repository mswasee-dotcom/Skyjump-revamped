/**
 * Full playthrough verification (slow: several minutes). Run with `npm run test:levels`.
 * The physics-driven autopilot must finish every campaign sector, within the sector's lives,
 * with each ship. This is the proof that no level contains an impossible section.
 */
import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { autoRun } from '../src/core/autopilot';
import { spawnState } from '../src/core/physics';
import { VEHICLES, VehicleId } from '../src/core/vehicles';

const ships = (process.env.SHIPS ?? 'comet').split(',') as VehicleId[];

describe.each(ships)('campaign playthrough with %s', (ship) => {
  for (const def of CAMPAIGN) {
    it(`L${def.id} ${def.name}`, () => {
      const track = buildTrack(def);
      const stats = VEHICLES[ship];
      const r = autoRun(track, stats, (row) => spawnState(track, row, stats), { maxCrashes: def.lives - 1 });
      if (!r.finished) console.error(def.name, ship, r.crashLog);
      expect(r.finished).toBe(true);
      expect(r.crashes).toBeLessThan(def.lives);
    }, 600_000);
  }
});

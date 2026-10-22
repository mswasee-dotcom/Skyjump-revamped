// Dev probe (not part of the suite): drives every level with the autopilot and prints results.
import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { autoRun } from '../src/core/autopilot';
import { spawnState } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';

const only = process.env.LEVEL ? Number(process.env.LEVEL) : 0;
const vehicle = (process.env.VEHICLE ?? 'comet') as keyof typeof VEHICLES;

it('probe', () => {
  for (const def of CAMPAIGN) {
    if (only && def.id !== only) continue;
    const track = buildTrack(def);
    const stats = VEHICLES[vehicle];
    const t0 = performance.now();
    const r = autoRun(track, stats, (row) => spawnState(track, row, stats), { maxCrashes: 6 });
    const ms = performance.now() - t0;
    process.stderr.write(
      `L${def.id} ${def.name.padEnd(16)} rows=${track.length} fin=${r.finished} t=${r.time.toFixed(1)}s crashes=${r.crashes} orbs=${r.orbs}/${track.countOrbs()} maxRow=${r.maxRow} cpu=${(ms / 1000).toFixed(1)}s ${JSON.stringify(r.crashLog)}\n`,
    );
  }
}, 1_000_000);

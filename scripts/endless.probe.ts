import { it } from 'vitest';
import { EndlessGenerator } from '../src/levels/endless';
import { autoRun } from '../src/core/autopilot';
import { spawnState } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';

it('endless', () => {
  const seeds = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
  const rows = Number(process.env.ROWS ?? 500);
  for (const seed of seeds) {
    const g = new EndlessGenerator(seed);
    g.ensure(rows + 60);
    const stats = VEHICLES.comet;
    const r = autoRun(g.track, stats, (row) => spawnState(g.track, row, stats), { maxRow: rows, maxCrashes: 10, maxTime: 400 });
    process.stderr.write(`seed ${seed}: fin=${r.finished} t=${r.time.toFixed(1)} crashes=${r.crashes} maxRow=${r.maxRow} ${JSON.stringify(r.crashLog)}\n`);
  }
}, 1e7);

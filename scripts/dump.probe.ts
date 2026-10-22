// Dev probe: prints a level's rows with indices. LEVEL=n FROM=a TO=b
import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { TileType, BlockKind } from '../src/core/tiles';

const CH: Record<number, string> = {
  [TileType.Empty]: ' ', [TileType.Standard]: '=', [TileType.Accel]: '>', [TileType.Slow]: '<', [TileType.Jump]: '^',
  [TileType.Ice]: '~', [TileType.Hazard]: 'x', [TileType.Fragile]: '%', [TileType.Boost]: '!', [TileType.Finish]: 'F', [TileType.Checkpoint]: 'C',
};

it('dump', () => {
  if (!process.env.LEVEL) return;
  const def = CAMPAIGN.find((l) => l.id === Number(process.env.LEVEL))!;
  const t = buildTrack(def);
  const a = Number(process.env.FROM ?? 0);
  const b = Number(process.env.TO ?? t.length - 1);
  let out = '';
  for (let r = a; r <= b && r < t.length; r++) {
    const row = t.rows[r];
    const s = row.cells
      .map((c) => (c.block === BlockKind.Wall ? '#' : c.block === BlockKind.Low ? 'b' : c.rise > 0 ? '/' : c.rise < 0 ? 'v' : c.orb && c.type === TileType.Empty ? '*' : c.orb ? 'o' : CH[c.type]))
      .join('');
    out += `${String(r).padStart(4)} y=${row.y.toFixed(0).padStart(2)} |${s}|\n`;
  }
  process.stderr.write(out);
});

import { BlockKind, TileType } from '../core/tiles';
import type { AltZone, Cell, Hint, MovingObstacle, Row } from '../core/track';
import { HEIGHT_UNIT } from '../core/constants';
import { ITEM_INFO, ITEM_ORDER, ItemKind, itemFromWord } from '../core/items';

/**
 * Compact text format for authoring tracks. One line per row, listed in driving order
 * (the first line is where you start).
 *
 *   |  ===  |        a row; the pipes mark the track edges. Shorter rows are centred.
 *   12|  ===  |      repeat the row 12 times
 *   @2               set the floor height (in height units) for following rows
 *   :hint Text       show a tutorial hint when the pilot reaches the next row
 *   :alt L0 L1 BONUS Label   start a risky-route bonus zone over lanes L0..L1 (0-based)
 *   :altend          end the current bonus zone
 *   :obs LANE AMP PERIOD WIDTH ROWS [PHASE] [HEIGHT]   moving block starting at the next row
 *   :item KIND [LANE]   power-up on the next row (shield, magnet, wings, nitro, x2, life); without a
 *                    lane it goes on the plain tile nearest the centre
 *   # anything else  ignored (comments)
 *
 * Cell characters:
 *   space or .  void            =  standard        >  accelerator    <  drag plate
 *   ^  launch pad               ~  ice             x  plasma hazard  %  fragile
 *   !  boost strip              F  finish          C  checkpoint     o  standard + orb
 *   *  orb floating over void   b  low block (jump onto it)          #  wall
 *   /  ramp up one unit         v  ramp down one unit
 *   Power-ups on a standard tile:  S shield  M magnet  W wings  N nitro  2 x2 score  H extra life
 *
 * A row containing ramps raises (or lowers) the floor of all following rows by one unit.
 */
const CHAR_MAP: Record<string, Partial<Cell> & { type: TileType }> = {
  ' ': { type: TileType.Empty },
  '.': { type: TileType.Empty },
  '=': { type: TileType.Standard },
  '>': { type: TileType.Accel },
  '<': { type: TileType.Slow },
  '^': { type: TileType.Jump },
  '~': { type: TileType.Ice },
  x: { type: TileType.Hazard },
  '%': { type: TileType.Fragile },
  '!': { type: TileType.Boost },
  F: { type: TileType.Finish },
  C: { type: TileType.Checkpoint },
  o: { type: TileType.Standard, orb: true },
  '*': { type: TileType.Empty, orb: true },
  b: { type: TileType.Standard, block: BlockKind.Low },
  '#': { type: TileType.Standard, block: BlockKind.Wall },
  '/': { type: TileType.Standard, rise: 1 },
  v: { type: TileType.Standard, rise: -1 },
};

for (const k of ITEM_ORDER) {
  const inf = ITEM_INFO[k as Exclude<ItemKind, ItemKind.None>];
  CHAR_MAP[inf.dsl] = { type: TileType.Standard, item: k };
}

export function parseCell(ch: string): Cell {
  const spec = CHAR_MAP[ch];
  if (!spec) throw new Error(`Unknown track character '${ch}'`);
  return {
    type: spec.type,
    block: spec.block ?? BlockKind.None,
    rise: spec.rise ?? 0,
    orb: spec.orb ?? false,
    ...(spec.item ? { item: spec.item } : {}),
  };
}

export interface ParseResult {
  rows: Row[];
  endY: number;
  hints: Hint[];
  altZones: AltZone[];
  obstacles: MovingObstacle[];
}

const ROW_RE = /^(\d+)?\|(.*)\|/;

export function parseTrack(text: string, width: number, startY = 0): ParseResult {
  const rows: Row[] = [];
  const hints: Hint[] = [];
  const altZones: AltZone[] = [];
  const obstacles: MovingObstacle[] = [];
  let openAlt: AltZone | null = null;
  let pendingItem: { kind: ItemKind; lane: number | null } | null = null;
  let y = startY;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(':')) {
      const [cmd, ...args] = line.slice(1).split(/\s+/);
      const row = rows.length;
      if (cmd === 'hint') hints.push({ row, text: args.join(' ') });
      else if (cmd === 'alt') {
        openAlt = { row0: row, row1: row, lane0: Number(args[0]), lane1: Number(args[1]), bonus: Number(args[2]), label: args.slice(3).join(' ') || 'RISKY ROUTE' };
      } else if (cmd === 'altend') {
        if (!openAlt) throw new Error(':altend without :alt');
        openAlt.row1 = row - 1;
        altZones.push(openAlt);
        openAlt = null;
      } else if (cmd === 'obs') {
        const n = args.map(Number);
        obstacles.push({ row, lane: n[0], amplitude: n[1], period: n[2], width: n[3], rows: n[4], phase: n[5] ?? 0, height: n[6] ?? 2.2 });
      } else if (cmd === 'item') {
        const kind = itemFromWord(args[0] ?? '');
        if (kind === ItemKind.None) throw new Error(`Unknown item in '${line}'`);
        pendingItem = { kind, lane: args[1] !== undefined ? Number(args[1]) : null };
      } else throw new Error(`Unknown directive '${line}'`);
      continue;
    }
    if (line.startsWith('@')) {
      const v = Number(line.slice(1));
      if (Number.isNaN(v)) throw new Error(`Bad height line '${line}'`);
      y = v * HEIGHT_UNIT;
      continue;
    }
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const repeat = m[1] ? Number(m[1]) : 1;
    let body = m[2];
    if (body.length > width) throw new Error(`Row '${body}' is wider than ${width}`);
    const padL = Math.floor((width - body.length) / 2);
    body = ' '.repeat(padL) + body + ' '.repeat(width - body.length - padL);
    for (let k = 0; k < repeat; k++) {
      const cells = [...body].map(parseCell);
      if (pendingItem && k === 0) {
        let lane = pendingItem.lane;
        if (lane === null) {
          const mid = (width - 1) / 2;
          // Prefer a plain standard tile nearest the centre; otherwise any safe surface (ice, fragile, ...).
          const pick = (ok: (c: Cell) => boolean) => {
            let best = -1;
            for (let l = 0; l < width; l++) {
              if (!ok(cells[l])) continue;
              if (best < 0 || Math.abs(l - mid) < Math.abs(best - mid)) best = l;
            }
            return best;
          };
          let best = pick((c) => c.type === TileType.Standard && !c.block && !c.rise && !c.orb);
          if (best < 0) best = pick((c) => c.type !== TileType.Empty && c.type !== TileType.Hazard && !c.block && !c.rise && !c.orb);
          if (best < 0) throw new Error(`No plain tile for ':item' on row ${rows.length}`);
          lane = best;
        }
        cells[lane] = { ...cells[lane], item: pendingItem.kind };
        pendingItem = null;
      }
      rows.push({ y, cells });
      const rise = cells.reduce((acc, c) => (c.rise !== 0 ? c.rise : acc), 0);
      if (rise !== 0) y += rise * HEIGHT_UNIT;
    }
  }
  if (openAlt) throw new Error('Unclosed :alt zone');
  if (pendingItem) throw new Error(':item at the end of a layout');
  return { rows, endY: y, hints, altZones, obstacles };
}

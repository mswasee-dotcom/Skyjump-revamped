import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { EndlessGenerator, ENDLESS_WIDTH } from '../src/levels/endless';
import { THEMES } from '../src/levels/themes';
import { TILE_INFO, TileType } from '../src/core/tiles';
import { Track } from '../src/core/track';
import { autoRun } from '../src/core/autopilot';
import { spawnState } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';

/** Longest run of rows in which no lane has a surface. */
function longestGap(t: Track): number {
  let best = 0;
  let cur = 0;
  for (let r = 0; r < t.length; r++) {
    const any = t.rows[r].cells.some((c) => c.type !== TileType.Empty);
    cur = any ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

describe('campaign', () => {
  it('has ten levels with unique ids, names and themes', () => {
    expect(CAMPAIGN).toHaveLength(10);
    expect(new Set(CAMPAIGN.map((l) => l.id)).size).toBe(10);
    expect(new Set(CAMPAIGN.map((l) => l.theme)).size).toBe(10);
    CAMPAIGN.forEach((l, i) => expect(l.id).toBe(i + 1));
  });

  for (const def of CAMPAIGN) {
    describe(`L${def.id} ${def.name}`, () => {
      const t = buildTrack(def);
      it('parses with a safe start, checkpoints and a finish', () => {
        expect(t.length).toBeGreaterThan(200);
        for (let r = 0; r < 6; r++) expect(t.rows[r].cells.some((c) => c.type === TileType.Standard)).toBe(true);
        expect(t.finishRow).toBeGreaterThan(100);
        expect(t.checkpoints.length).toBeGreaterThanOrEqual(3);
        expect(t.rows.slice(t.finishRow).every((r) => r.cells.some((c) => c.type !== TileType.Empty))).toBe(true);
      });
      it('has sane medals, lives and theme', () => {
        expect(def.medals.gold).toBeGreaterThan(5);
        expect(def.medals.silver).toBeGreaterThan(def.medals.gold);
        expect(def.lives).toBeGreaterThanOrEqual(3);
        expect(THEMES[def.theme]).toBeDefined();
      });
      it('never asks for an impossible gap', () => {
        // A launch pad covers ~7.7 rows at cruise speed; nothing in the campaign is longer.
        expect(longestGap(t)).toBeLessThanOrEqual(7);
      });
    });
  }

  it('introduces each tile type in the level named after it', () => {
    const types = (id: number) => new Set(buildTrack(CAMPAIGN[id - 1]).rows.flatMap((r) => r.cells.map((c) => c.type)));
    expect(types(3).has(TileType.Accel) && types(3).has(TileType.Slow) && types(3).has(TileType.Boost)).toBe(true);
    expect(types(4).has(TileType.Ice)).toBe(true);
    expect(types(5).has(TileType.Fragile)).toBe(true);
    expect(types(6).has(TileType.Hazard)).toBe(true);
    expect(buildTrack(CAMPAIGN[5]).obstacles.length).toBeGreaterThan(0);
    expect(types(7).has(TileType.Jump)).toBe(true);
    expect(buildTrack(CAMPAIGN[7]).altZones.length).toBeGreaterThanOrEqual(2);
    expect(new Set(buildTrack(CAMPAIGN[8]).rows.map((r) => r.y)).size).toBeGreaterThan(4);
    const final = types(10);
    for (const tt of [TileType.Accel, TileType.Slow, TileType.Boost, TileType.Jump, TileType.Ice, TileType.Hazard, TileType.Fragile]) expect(final.has(tt)).toBe(true);
  });

  it('teaches with hints in the early sectors', () => {
    for (const id of [1, 2, 3, 4, 5, 6, 7]) expect(buildTrack(CAMPAIGN[id - 1]).hints.length).toBeGreaterThan(0);
  });
});

describe('themes', () => {
  it('never tint standard tiles in a colour a special tile uses', () => {
    const rgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const special = [TileType.Accel, TileType.Slow, TileType.Jump, TileType.Ice, TileType.Hazard, TileType.Fragile, TileType.Boost].map((t) => rgb(parseInt(TILE_INFO[t].color.slice(1), 16)));
    for (const [id, th] of Object.entries(THEMES)) {
      const c = rgb(th.neon);
      for (const sp of special) {
        const dist = Math.hypot(c[0] - sp[0], c[1] - sp[1], c[2] - sp[2]);
        expect(dist, `${id} neon too close to a tile colour`).toBeGreaterThan(60);
      }
    }
  });
});

describe('endless generator', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = new EndlessGenerator(42);
    const b = new EndlessGenerator(42);
    const c = new EndlessGenerator(43);
    a.ensure(800);
    b.ensure(800);
    c.ensure(800);
    expect(a.track.rows.slice(0, 800)).toEqual(b.track.rows.slice(0, 800));
    expect(a.track.rows.slice(0, 800)).not.toEqual(c.track.rows.slice(0, 800));
  });

  it('keeps every course structurally fair across many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = new EndlessGenerator(seed);
      g.ensure(1500);
      const t = g.track;
      expect(t.width).toBe(ENDLESS_WIDTH);
      expect(longestGap(t)).toBeLessThanOrEqual(5);
      expect(t.checkpoints.length).toBeGreaterThan(10);
      for (const row of t.rows) {
        const present = row.cells.filter((c) => c.type !== TileType.Empty);
        if (!present.length) continue;
        // Any non-gap row offers at least one lane that is neither plasma nor wall.
        expect(present.some((c) => c.type !== TileType.Hazard && c.block !== 2)).toBe(true);
      }
      // Rows with walls always leave two adjacent open lanes.
      for (const row of t.rows) {
        if (!row.cells.some((c) => c.block === 2)) continue;
        const open = row.cells.map((c) => c.type !== TileType.Empty && c.block !== 2);
        expect(open.some((o, i) => o && open[i + 1])).toBe(true);
      }
    }
  });

  it('can be driven by the autopilot', () => {
    const g = new EndlessGenerator(7);
    g.ensure(340);
    const stats = VEHICLES.comet;
    const r = autoRun(g.track, stats, (row) => spawnState(g.track, row, stats), { maxRow: 280, maxCrashes: 2 });
    expect(r.finished).toBe(true);
  }, 120_000);
});

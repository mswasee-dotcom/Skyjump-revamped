import { describe, expect, it } from 'vitest';
import { parseTrack } from '../src/levels/dsl';
import { BlockKind, TileType } from '../src/core/tiles';

describe('track DSL', () => {
  it('parses rows in driving order, with repeats', () => {
    const r = parseTrack(`
      3|=====|
      |>><<!|
    `, 5);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[3].cells.map((c) => c.type)).toEqual([TileType.Accel, TileType.Accel, TileType.Slow, TileType.Slow, TileType.Boost]);
  });

  it('centres rows narrower than the track', () => {
    const r = parseTrack('|=|', 5);
    expect(r.rows[0].cells.map((c) => c.type)).toEqual([0, 0, TileType.Standard, 0, 0]);
  });

  it('rejects rows wider than the track and unknown characters', () => {
    expect(() => parseTrack('|=======|', 5)).toThrow();
    expect(() => parseTrack('|==Q==|', 5)).toThrow(/Unknown/);
  });

  it('handles heights, ramps, blocks and orbs', () => {
    const r = parseTrack(`
      |=|
      |/|
      |=|
      @-2
      |b|
      |#|
      |o|
      |*|
    `, 1);
    expect(r.rows.map((x) => x.y)).toEqual([0, 0, 1, -2, -2, -2, -2]);
    expect(r.rows[1].cells[0].rise).toBe(1);
    expect(r.rows[3].cells[0].block).toBe(BlockKind.Low);
    expect(r.rows[4].cells[0].block).toBe(BlockKind.Wall);
    expect(r.rows[5].cells[0].orb).toBe(true);
    expect(r.rows[6].cells[0]).toMatchObject({ type: TileType.Empty, orb: true });
  });

  it('records hints, alt zones and moving obstacles at the next row', () => {
    const r = parseTrack(`
      2|===|
      :hint Jump!
      :alt 0 1 500 Sky Route
      3|===|
      :altend
      :obs 1 1 2 1 2 0.5
      |===|
    `, 3);
    expect(r.hints).toEqual([{ row: 2, text: 'Jump!' }]);
    expect(r.altZones[0]).toMatchObject({ row0: 2, row1: 4, lane0: 0, lane1: 1, bonus: 500, label: 'Sky Route' });
    expect(r.obstacles[0]).toMatchObject({ row: 5, lane: 1, amplitude: 1, period: 2, width: 1, rows: 2, phase: 0.5 });
  });

  it('rejects unbalanced alt zones', () => {
    expect(() => parseTrack(':alt 0 1 5 x\n|=|', 1)).toThrow();
    expect(() => parseTrack(':altend', 1)).toThrow();
  });
});

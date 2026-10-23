import { describe, expect, it } from 'vitest';
import { comet, has, sim, track } from './helpers';
import { applyItem, carryItems, spawnState } from '../src/core/physics';
import { AIR_JUMP_FACTOR, ItemKind, MAX_NITRO, MAX_WINGS, itemFromWord } from '../src/core/items';
import { parseTrack } from '../src/levels/dsl';
import { ScoreKeeper, POINTS } from '../src/core/scoring';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { EndlessGenerator } from '../src/levels/endless';
import { GRAVITY } from '../src/core/constants';

const straight = (n: number, row = '|=====|') => `${n}${row}`;
const N = { steer: 0, throttle: 0, jumpPressed: false };

describe('power-up DSL', () => {
  it('maps item characters and words', () => {
    const p = parseTrack('|S M W|\n|N 2 H|', 5);
    expect(p.rows[0].cells.map((c) => c.item ?? 0)).toEqual([ItemKind.Shield, 0, ItemKind.Magnet, 0, ItemKind.Wings]);
    expect(p.rows[1].cells.map((c) => c.item ?? 0)).toEqual([ItemKind.Nitro, 0, ItemKind.Multiplier, 0, ItemKind.Life]);
    expect(itemFromWord('x2')).toBe(ItemKind.Multiplier);
    expect(itemFromWord('nope')).toBe(ItemKind.None);
  });

  it(':item places the item on the next row, nearest the centre, or on a given lane', () => {
    const p = parseTrack(':item shield\n2|=====|\n:item nitro 0\n|=====|', 5);
    expect(p.rows[0].cells[2].item).toBe(ItemKind.Shield);
    expect(p.rows[1].cells.some((c) => c.item)).toBe(false);
    expect(p.rows[2].cells[0].item).toBe(ItemKind.Nitro);
    expect(() => parseTrack(':item banana\n|=====|', 5)).toThrow();
    expect(() => parseTrack('|=====|\n:item wings', 5)).toThrow();
  });
});

describe('collecting power-ups', () => {
  it('flying through an item collects it once and fires an event', () => {
    const t = track(`${straight(4)}\n:item shield\n${straight(30)}`);
    const r = sim(t, 1.2);
    const ev = r.events.filter((e) => e.type === 'item');
    expect(ev).toHaveLength(1);
    expect(r.s.shield).toBe(1);
    expect(t.countItems()).toBe(1);
    // Respawning does not restore items (no farming); a full reset does.
    t.resetState(0);
    expect(t.itemTaken.some((v) => v === 1)).toBe(true);
    t.resetState(0, true);
    expect(t.itemTaken.every((v) => v === 0)).toBe(true);
  });

  it('missing the lane does not collect the item', () => {
    const t = track(`${straight(4)}\n:item shield 0\n${straight(30)}`);
    const r = sim(t, 1.2, { steer: 0.6, throttle: 0, jumpPressed: false });
    expect(has(r.events, 'item')).toBe(false);
  });

  it('stacks wings and nitro up to their caps', () => {
    const s = spawnState(track(straight(10)), 0, comet);
    for (let i = 0; i < 5; i++) {
      applyItem(s, ItemKind.Wings);
      applyItem(s, ItemKind.Nitro);
    }
    expect(s.wings).toBe(MAX_WINGS);
    expect(s.nitro).toBe(MAX_NITRO);
  });
});

describe('shield', () => {
  it('absorbs a wall crash and phases through', () => {
    const t = track(`${straight(6)}\n|#####|\n${straight(20)}`);
    const s = spawnState(t, 0, comet);
    s.shield = 1;
    const r = sim(t, 2, N, s);
    expect(has(r.events, 'crash')).toBe(false);
    expect(has(r.events, 'shieldHit')).toBe(true);
    expect(r.s.alive).toBe(true);
    expect(r.s.shield).toBe(0);
  });

  it('absorbs plasma', () => {
    const t = track(`${straight(4)}\n4|xxxxx|\n${straight(20)}`);
    const s = spawnState(t, 0, comet);
    s.shield = 1;
    const r = sim(t, 2, N, s);
    expect(r.s.alive).toBe(true);
    expect(r.events.find((e) => e.type === 'shieldHit')).toMatchObject({ cause: 'hazard' });
  });

  it('only works once: a second wall after the phase window still crashes', () => {
    const t = track(`${straight(6)}\n|#####|\n${straight(30)}\n|#####|\n${straight(10)}`);
    const s = spawnState(t, 0, comet);
    s.shield = 1;
    const r = sim(t, 6, N, s);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'wall' });
  });

  it('does not save you from falling into the void', () => {
    const t = track(`${straight(4)}\n12|     |\n${straight(10)}`);
    const s = spawnState(t, 0, comet);
    s.shield = 1;
    const r = sim(t, 4, N, s);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'fall' });
  });
});

describe('wings', () => {
  it('pressing jump in mid-air uses a wing for a second jump', () => {
    const t = track(straight(120));
    const s = spawnState(t, 0, comet);
    s.wings = 1;
    let pressed = 0;
    const r = sim(t, 0.5, (time) => {
      const p = (time < 0.01 && pressed === 0) || (time > 0.25 && pressed === 1);
      if (p) pressed++;
      return { steer: 0, throttle: 0, jumpPressed: p };
    }, s);
    const jumps = r.events.filter((e) => e.type === 'jump');
    expect(jumps).toHaveLength(2);
    expect(jumps[1]).toMatchObject({ airJump: true });
    expect(r.s.wings).toBe(0);
    expect(r.s.grounded).toBe(false);
    // Total airtime is longer than one jump.
    const rest = sim(t, 2, N, r.s);
    const land = rest.events.find((e) => e.type === 'land') as { airTime: number };
    expect(land.airTime).toBeGreaterThan(2 * comet.jumpImpulse / GRAVITY + 0.2 * AIR_JUMP_FACTOR);
  });

  it('without wings a mid-air press does nothing', () => {
    const t = track(straight(120));
    let n = 0;
    const r = sim(t, 0.5, (time) => {
      const p = (time < 0.01 && n === 0) || (time > 0.25 && n === 1);
      if (p) n++;
      return { steer: 0, throttle: 0, jumpPressed: p };
    });
    expect(r.events.filter((e) => e.type === 'jump')).toHaveLength(1);
  });
});

describe('nitro', () => {
  it('fires a stored charge for a speed burst', () => {
    const t = track(straight(200));
    const s = spawnState(t, 0, comet);
    s.nitro = 2;
    const r = sim(t, 0.3, (time) => ({ steer: 0, throttle: 0, jumpPressed: false, nitroPressed: time < 0.005 }), s);
    expect(has(r.events, 'nitro')).toBe(true);
    expect(r.s.nitro).toBe(1);
    expect(r.s.speed).toBeGreaterThan(comet.maxSpeed);
  });

  it('does nothing with no charges', () => {
    const t = track(straight(200));
    const r = sim(t, 0.3, { steer: 0, throttle: 0, jumpPressed: false, nitroPressed: true });
    expect(has(r.events, 'nitro')).toBe(false);
    expect(r.s.speed).toBeLessThanOrEqual(comet.cruise + 0.01);
  });
});

describe('magnet', () => {
  it('pulls in orbs from two lanes away', () => {
    const layout = `${straight(4)}\n|o    |\n${straight(20)}`;
    const plain = sim(track(layout), 1.5);
    expect(has(plain.events, 'orb')).toBe(false);
    const t = track(layout);
    const s = spawnState(t, 0, comet);
    s.magnetTimer = 8;
    const r = sim(t, 1.5, N, s);
    expect(has(r.events, 'orb')).toBe(true);
    expect(r.s.magnetTimer).toBeLessThan(8);
  });
});

describe('score multiplier and carry-over', () => {
  it('doubles positive points only and reports the bonus', () => {
    const k = new ScoreKeeper();
    k.multiplier = 2;
    k.handle({ type: 'orb', row: 0, lane: 0 });
    k.handle({ type: 'crash', cause: 'wall' });
    expect(k.live).toBe(0); // 200 - 250 clamps at zero on the HUD
    k.handle({ type: 'item', kind: ItemKind.Magnet, row: 0, lane: 0 });
    expect(k.multBonus).toBe(POINTS.orb + POINTS.item);
    const f = k.finalize(100, 0, { gold: 10, silver: 20 });
    expect(f.breakdown.some((b) => b.label === '2× Score bonus' && b.points === POINTS.orb + POINTS.item)).toBe(true);
  });

  it('stored wings, nitro and shield carry over a respawn; timers do not', () => {
    const t = track(straight(20));
    const a = spawnState(t, 0, comet);
    Object.assign(a, { wings: 2, nitro: 1, shield: 1, magnetTimer: 5, multTimer: 5 });
    const b = spawnState(t, 0, comet);
    carryItems(a, b);
    expect([b.wings, b.nitro, b.shield, b.magnetTimer, b.multTimer]).toEqual([2, 1, 1, 0, 0]);
  });
});

describe('placement', () => {
  it('every campaign sector has power-ups, all sitting on safe tiles', () => {
    for (const def of CAMPAIGN) {
      const t = buildTrack(def);
      expect(t.countItems(), def.name).toBeGreaterThanOrEqual(2);
    }
  });

  it('endless mode spawns power-ups deterministically without changing the road', () => {
    const a = new EndlessGenerator(42);
    a.ensure(3000);
    const b = new EndlessGenerator(42);
    b.ensure(3000);
    expect(a.track.countItems()).toBeGreaterThan(5);
    expect(a.track.countItems()).toBe(b.track.countItems());
  });
});

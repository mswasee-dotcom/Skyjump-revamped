import { describe, expect, it } from 'vitest';
import { comet, has, sim, track } from './helpers';
import { spawnState, VehicleState } from '../src/core/physics';
import { BOOST_BONUS_SPEED, GRAVITY, LANE_WIDTH, ROW_LENGTH } from '../src/core/constants';
import { TileType } from '../src/core/tiles';
import { VEHICLES } from '../src/core/vehicles';

const straight = (n: number, row = '|=====|') => `${n}${row}`;
const J = { steer: 0, throttle: 0, jumpPressed: true };
const N = { steer: 0, throttle: 0, jumpPressed: false };

describe('vehicle movement', () => {
  it('moves forward automatically at cruise speed', () => {
    const t = track(straight(60));
    const { s } = sim(t, 1);
    expect(s.alive).toBe(true);
    expect(s.d - ROW_LENGTH / 2).toBeCloseTo(comet.cruise, 0);
  });

  it('accelerates and brakes within the vehicle limits', () => {
    const t = track(straight(200));
    const up = sim(t, 3, { steer: 0, throttle: 1, jumpPressed: false }).s;
    expect(up.speed).toBeCloseTo(comet.maxSpeed, 5);
    const down = sim(track(straight(200)), 3, { steer: 0, throttle: -1, jumpPressed: false }).s;
    expect(down.speed).toBeCloseTo(8, 5);
  });

  it('drifts back to cruise speed with no input', () => {
    const t = track(straight(400));
    const s = sim(t, 2, { steer: 0, throttle: 1, jumpPressed: false }).s;
    const after = sim(t, 4, N, s).s;
    expect(after.speed).toBeCloseTo(comet.cruise, 3);
  });

  it('steers left and right, scaled by sensitivity', () => {
    const t = track(straight(60));
    const r = sim(t, 0.4, { steer: 1, throttle: 0, jumpPressed: false }).s;
    const l = sim(track(straight(60)), 0.4, { steer: -1, throttle: 0, jumpPressed: false }).s;
    expect(r.x).toBeGreaterThan(1);
    expect(l.x).toBeLessThan(-1);
    expect(r.x).toBeCloseTo(-l.x, 5);
  });

  it('jumps in a predictable ballistic arc and lands', () => {
    const t = track(straight(80));
    const { s, events, time } = sim(t, 0.05, J);
    expect(has(events, 'jump')).toBe(true);
    expect(s.grounded).toBe(false);
    const flight = 2 * comet.jumpImpulse / GRAVITY;
    const rest = sim(t, flight + 0.2, N, s);
    const land = rest.events.find((e) => e.type === 'land');
    expect(land).toBeDefined();
    expect((land as { airTime: number }).airTime).toBeCloseTo(flight, 1);
    expect(rest.s.grounded).toBe(true);
    void time;
  });

  it('clears a gap with a jump but falls into it without one', () => {
    const layout = `${straight(8)}\n3|     |\n${straight(20)}`;
    const jumpAt = (time: number) => ({ steer: 0, throttle: 0, jumpPressed: time > 0.8 && time < 0.81 });
    const ok = sim(track(layout), 2, jumpAt);
    expect(ok.s.alive).toBe(true);
    expect(ok.s.d).toBeGreaterThan(11 * ROW_LENGTH);
    const fail = sim(track(`${straight(8)}\n6|     |\n${straight(20)}`), 3);
    expect(fail.s.alive).toBe(false);
    expect(has(fail.events, 'leaveTrack')).toBe(true);
    expect(fail.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'fall' });
  });

  it('allows a jump shortly after leaving a ledge (coyote time)', () => {
    const layout = `${straight(8)}\n4|     |\n${straight(20)}`;
    // Press jump just after the hull has left the edge.
    let pressed = false;
    const r = sim(track(layout), 2, (_t, s: VehicleState) => {
      if (!pressed && !s.grounded && s.vy <= 0) {
        pressed = true;
        return J;
      }
      return N;
    });
    expect(pressed).toBe(true);
    expect(r.events.filter((e) => e.type === 'jump')).toHaveLength(1);
    expect(r.s.alive).toBe(true);
  });

  it('buffers a jump pressed just before landing', () => {
    const t = track(straight(100));
    const air = sim(t, 0.05, J).s;
    let n = 0;
    const r = sim(t, 1.5, (_time, s) => {
      // press once, slightly before touching down
      if (!s.grounded && s.vy < 0 && s.y < 0.25 && n === 0) {
        n++;
        return J;
      }
      return N;
    }, air);
    expect(n).toBe(1);
    expect(r.events.filter((e) => e.type === 'jump').length).toBe(1);
  });

  it('falls off the side of the track', () => {
    const r = sim(track(straight(120, '|=|')), 3, { steer: 1, throttle: 0, jumpPressed: false });
    expect(r.s.alive).toBe(false);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'fall' });
  });

  it('is deterministic for identical input', () => {
    const layout = `${straight(10)}\n2|     |\n${straight(10, '|>>>>>|')}\n${straight(30)}`;
    const inp = (time: number) => ({ steer: Math.sin(time * 3), throttle: time > 1 ? 1 : 0, jumpPressed: Math.abs(time - 0.6) < 0.005 });
    const a = sim(track(layout), 2.5, inp).s;
    const b = sim(track(layout), 2.5, inp).s;
    expect(a).toEqual(b);
  });
});

describe('collisions', () => {
  it('crashes head-on into a wall', () => {
    const r = sim(track(`${straight(6)}\n|#####|\n${straight(10)}`), 2);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'wall' });
  });

  it('never tunnels through a wall even at boosted speed', () => {
    const t = track(`${straight(4)}\n|!!!!!|\n${straight(10, '|>>>>>|')}\n|#####|\n${straight(10)}`);
    const r = sim(t, 3, { steer: 0, throttle: 1, jumpPressed: false });
    expect(r.s.alive).toBe(false);
    expect(r.s.d).toBeLessThan(16 * ROW_LENGTH);
  });

  it('slides along walls when steering into them instead of crashing', () => {
    const t = track(`40|#===#|`);
    const r = sim(t, 2, { steer: 1, throttle: 0, jumpPressed: false });
    expect(r.s.alive).toBe(true);
    expect(has(r.events, 'scrape')).toBe(true);
    expect(r.s.x).toBeLessThanOrEqual(LANE_WIDTH * 1.5 - 0.35);
  });

  it('can jump onto a low block and drive along its top', () => {
    const layout = `${straight(8)}\n12|bbbbb|\n${straight(10)}`;
    const blocked = sim(track(layout), 1.5);
    expect(blocked.s.alive).toBe(false);
    const jumped = sim(track(layout), 1.4, (time) => ({ steer: 0, throttle: 0, jumpPressed: time > 0.7 && time < 0.71 }));
    expect(jumped.s.alive).toBe(true);
    expect(jumped.s.y).toBeCloseTo(1, 5);
  });

  it('crashes into a moving obstacle', () => {
    const t = track(`4|=====|\n:obs 2 0 1 5 3\n${straight(20)}`);
    const r = sim(t, 2);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'obstacle' });
  });

  it('follows ramps up and down while grounded', () => {
    const t = track(`${straight(4)}\n|/////|\n${straight(4)}\n|vvvvv|\n${straight(8)}`);
    const peak = sim(t, (5.5 * ROW_LENGTH) / comet.cruise).s;
    expect(peak.grounded).toBe(true);
    expect(peak.y).toBeCloseTo(1, 1);
    const end = sim(t, 1.0, N, peak).s;
    expect(end.alive).toBe(true);
    expect(end.y).toBeCloseTo(0, 1);
  });
});

describe('tile effects', () => {
  it('accelerator tiles raise speed, drag plates lower it', () => {
    const fast = sim(track(`${straight(2)}\n20|>>>>>|`), 0.8).s;
    expect(fast.speed).toBeGreaterThan(comet.cruise + 8);
    const slow = sim(track(`${straight(2)}\n20|<<<<<|`), 0.8).s;
    expect(slow.speed).toBeLessThan(comet.cruise - 6);
  });

  it('boost strips fire once per strip for a temporary burst above top speed', () => {
    const r = sim(track(`${straight(2)}\n|!!!!!|\n${straight(30)}`), 0.5);
    expect(r.events.filter((e) => e.type === 'boost')).toHaveLength(1);
    expect(r.s.speed).toBeGreaterThan(comet.cruise + BOOST_BONUS_SPEED - 2);
    expect(r.s.boostTimer).toBeGreaterThan(0);
    const later = sim(track(`${straight(2)}\n|!!!!!|\n${straight(60)}`), 3).s;
    expect(later.speed).toBeLessThanOrEqual(comet.maxSpeed);
  });

  it('launch pads throw the vehicle higher than a normal jump', () => {
    const r = sim(track(`${straight(2)}\n|^^^^^|\n${straight(30)}`), 0.6);
    expect(r.events.find((e) => e.type === 'jump')).toMatchObject({ launchPad: true });
    expect(r.s.y).toBeGreaterThan(2.5);
  });

  it('ice drastically reduces steering response', () => {
    const grip = sim(track(straight(40)), 0.3, { steer: 1, throttle: 0, jumpPressed: false }).s;
    const ice = sim(track(straight(40, '|~~~~~|')), 0.3, { steer: 1, throttle: 0, jumpPressed: false }).s;
    expect(Math.abs(ice.vx)).toBeLessThan(Math.abs(grip.vx) * 0.6);
    // and keeps sliding when you let go
    const slide = sim(track(straight(60, '|~~~~~|')), 0.3, N, { ...ice }).s;
    expect(Math.abs(slide.vx)).toBeGreaterThan(Math.abs(ice.vx) * 0.4);
  });

  it('plasma hazards destroy the vehicle on contact', () => {
    const r = sim(track(`${straight(4)}\n4|xxxxx|\n${straight(10)}`), 2);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'hazard' });
  });

  it('jumping over plasma is safe', () => {
    const r = sim(track(`${straight(6)}\n3|xxxxx|\n${straight(20)}`), 1.6, (time) => ({ steer: 0, throttle: 0, jumpPressed: time > 0.6 && time < 0.61 }));
    expect(r.s.alive).toBe(true);
  });

  it('fragile tiles collapse after being crossed', () => {
    const t = track(`${straight(3)}\n6|%%%%%|\n${straight(30)}`);
    const r = sim(t, 1.2);
    expect(r.s.alive).toBe(true);
    expect(t.isPresent(4, 2)).toBe(false);
    t.resetState(0);
    expect(t.isPresent(4, 2)).toBe(true);
  });

  it('a collapsed fragile road is gone for the rest of the attempt', () => {
    const t = track(`${straight(3)}\n8|%%%%%|\n${straight(30)}`);
    expect(sim(t, 1.5).s.alive).toBe(true);
    // Drive the same stretch again without restoring the track: the ship drops through.
    const again = sim(t, 3);
    expect(again.s.alive).toBe(false);
    expect(again.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'fall' });
  });

  it('passes underneath slabs once it has fallen below them', () => {
    const r = sim(track(`${straight(8)}\n6|     |\n${straight(30)}`), 3);
    expect(r.events.find((e) => e.type === 'crash')).toMatchObject({ cause: 'fall' });
  });

  it('collects orbs once, including floating ones over gaps', () => {
    const t = track(`${straight(2)}\n|  o  |\n${straight(6)}\n2|  *  |\n${straight(10)}`);
    const r = sim(t, 2.5, (time) => ({ steer: 0, throttle: 0, jumpPressed: time > 0.48 && time < 0.49 }));
    expect(r.events.filter((e) => e.type === 'orb')).toHaveLength(2);
    expect(t.takeOrb(2, 2)).toBe(false);
  });

  it('reports checkpoints and the finish', () => {
    const t = track(`${straight(4)}\n2|CCCCC|\n${straight(4)}\n|FFFFF|\n${straight(4)}`);
    const r = sim(t, 3);
    expect(r.events.find((e) => e.type === 'checkpoint')).toMatchObject({ row: 4 });
    expect(r.s.finished).toBe(true);
    expect(r.s.lastCheckpoint).toBe(4);
  });

  it('respawns on the safest lane of a checkpoint row', () => {
    const t = track(`|x===x|\n|==x==|`);
    const s = spawnState(t, 1, VEHICLES.comet);
    expect(t.cell(1, Math.round(s.x / LANE_WIDTH + 2)).type).toBe(TileType.Standard);
  });
});

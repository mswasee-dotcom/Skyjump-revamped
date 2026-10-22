import { Track } from '../src/core/track';
import { parseTrack } from '../src/levels/dsl';
import { PHYSICS_DT } from '../src/core/constants';
import { DriveInput, PhysicsEvent, VehicleState, spawnState, stepVehicle } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';

export const comet = VEHICLES.comet;

export function track(layout: string, width = 5): Track {
  const p = parseTrack(layout, width);
  const t = new Track(width);
  t.appendRows(p.rows);
  t.hints.push(...p.hints);
  t.altZones.push(...p.altZones);
  t.obstacles.push(...p.obstacles);
  return t;
}

export interface SimResult {
  s: VehicleState;
  events: PhysicsEvent[];
  time: number;
}

/** Run the physics for `seconds` with a fixed input (or an input function of time). */
export function sim(
  t: Track,
  seconds: number,
  input: DriveInput | ((time: number, s: VehicleState) => DriveInput) = { steer: 0, throttle: 0, jumpPressed: false },
  start?: VehicleState,
  stats = comet,
): SimResult {
  const s = start ?? spawnState(t, 0, stats);
  const events: PhysicsEvent[] = [];
  let time = 0;
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    const inp = typeof input === 'function' ? input(time, s) : input;
    const step: PhysicsEvent[] = [];
    stepVehicle(s, inp, stats, t, time, PHYSICS_DT, step);
    t.updateFragile(PHYSICS_DT, Math.floor(s.d / 2) - 4, Math.floor(s.d / 2) + 4);
    events.push(...step);
    time += PHYSICS_DT;
    if (!s.alive || s.finished) break;
  }
  return { s, events, time };
}

export const has = (events: PhysicsEvent[], type: PhysicsEvent['type']) => events.some((e) => e.type === type);

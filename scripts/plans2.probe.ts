import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { Autopilot, DEFAULT_AUTOPILOT } from '../src/core/autopilot';
import { PhysicsEvent, spawnState, stepVehicle, DriveInput } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';
import { PHYSICS_DT } from '../src/core/constants';

it('plans2', () => {
  if (!process.env.LEVEL) return;
  const def = CAMPAIGN.find((l) => l.id === Number(process.env.LEVEL))!;
  const track = buildTrack(def);
  const stats = VEHICLES.comet;
  const pilot = new Autopilot(track, stats, DEFAULT_AUTOPILOT) as any;
  const s0 = spawnState(track, 0, stats);
  const plan = { first: { steer: -1, throttle: 0, jumpPressed: false }, second: { steer: -1, throttle: 0, jumpPressed: false } };
  process.stderr.write('score ' + pilot.rollout(s0, 0, plan) + '\n');
  // replicate rollout with logging
  const s = { ...s0 };
  const reflex: DriveInput = { steer: 0, throttle: 0, jumpPressed: false };
  const ev: PhysicsEvent[] = [];
  let out = '';
  for (let i = 0; i < 264; i++) {
    let input: DriveInput;
    if (i < 60) input = plan.first;
    else { pilot.reflex(s, reflex); input = reflex; }
    ev.length = 0;
    stepVehicle(s, input, stats, track, i * PHYSICS_DT, PHYSICS_DT, ev);
    if (i % 8 === 0 || ev.length) out += `i=${i} row=${(s.d / 2).toFixed(2)} lane=${(s.x / 1.25 + 4).toFixed(2)} y=${s.y.toFixed(2)} in=${input.steer.toFixed(2)},${input.jumpPressed} ${ev.map((e) => e.type).join(',')}\n`;
    if (!s.alive || s.lost) break;
  }
  process.stderr.write(out);
});

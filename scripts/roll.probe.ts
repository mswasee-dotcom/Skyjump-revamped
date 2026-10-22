// Dev probe: roll a fixed input from spawn and print the trajectory.
import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { PhysicsEvent, spawnState, stepVehicle } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';
import { PHYSICS_DT } from '../src/core/constants';

it('roll', () => {
  if (!process.env.LEVEL) return;
  const def = CAMPAIGN.find((l) => l.id === Number(process.env.LEVEL))!;
  const track = buildTrack(def);
  const stats = VEHICLES.comet;
  const s = spawnState(track, 0, stats);
  const steer = Number(process.env.STEER ?? 0);
  let out = '';
  const ev: PhysicsEvent[] = [];
  for (let i = 0; i < 300; i++) {
    ev.length = 0;
    stepVehicle(s, { steer: i < 30 ? steer : 0, throttle: 0, jumpPressed: false }, stats, track, i * PHYSICS_DT, PHYSICS_DT, ev);
    if (i % 10 === 0 || ev.length) out += `i=${i} row=${(s.d / 2).toFixed(2)} lane=${(s.x / 1.25 + 4).toFixed(2)} y=${s.y.toFixed(2)} g=${s.grounded} surf=${s.surface} ${ev.map((e) => JSON.stringify(e)).join(' ')}\n`;
    if (!s.alive) break;
  }
  process.stderr.write(out);
});

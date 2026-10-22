// Dev probe: drive to a row and print the best/worst plan scores at that point.
import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { Autopilot, DEFAULT_AUTOPILOT } from '../src/core/autopilot';
import { PhysicsEvent, spawnState, stepVehicle } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';
import { PHYSICS_DT } from '../src/core/constants';

it('plans', () => {
  if (!process.env.LEVEL) return;
  const def = CAMPAIGN.find((l) => l.id === Number(process.env.LEVEL))!;
  const track = buildTrack(def);
  const stats = VEHICLES.comet;
  const at = Number(process.env.AT);
  const pilot = new Autopilot(track, stats, DEFAULT_AUTOPILOT) as any;
  const s = spawnState(track, Number(process.env.START ?? 0), stats);
  let time = 0;
  const ev: PhysicsEvent[] = [];
  while (s.d / 2 < at) {
    const inp = pilot.update(s, time, PHYSICS_DT);
    ev.length = 0;
    stepVehicle(s, inp, stats, track, time, PHYSICS_DT, ev);
    time += PHYSICS_DT;
  }
  let out = `state row=${(s.d / 2).toFixed(2)} lane=${(s.x / 1.25 + 3).toFixed(2)} y=${s.y.toFixed(2)} vy=${s.vy.toFixed(2)} v=${s.speed.toFixed(1)} g=${s.grounded}\n`;
  const res = pilot.plans.map((p: any) => ({ p, sc: pilot.rollout(s, time, p) }));
  res.sort((a: any, b: any) => b.sc - a.sc);
  for (const r of res.slice(0, 8)) out += `${r.sc.toFixed(1)} ${JSON.stringify(r.p)}\n`;
  process.stderr.write(out);
});

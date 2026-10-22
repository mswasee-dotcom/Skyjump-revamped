// Dev probe: trace the autopilot through a row window. LEVEL=n FROM=a TO=b START=checkpointRow
import { it } from 'vitest';
import { CAMPAIGN } from '../src/levels/campaign';
import { buildTrack } from '../src/levels/types';
import { Autopilot, DEFAULT_AUTOPILOT } from '../src/core/autopilot';
import { PhysicsEvent, spawnState, stepVehicle } from '../src/core/physics';
import { VEHICLES } from '../src/core/vehicles';
import { PHYSICS_DT } from '../src/core/constants';

it('trace', () => {
  if (!process.env.LEVEL) return;
  const def = CAMPAIGN.find((l) => l.id === Number(process.env.LEVEL))!;
  const track = buildTrack(def);
  const stats = VEHICLES.comet;
  const from = Number(process.env.FROM ?? 0);
  const to = Number(process.env.TO ?? 9999);
  const pilot = new Autopilot(track, stats, DEFAULT_AUTOPILOT);
  const s = spawnState(track, Number(process.env.START ?? 0), stats);
  let time = 0;
  let out = '';
  const ev: PhysicsEvent[] = [];
  for (let i = 0; i < 120 * 120; i++) {
    const inp = pilot.update(s, time, PHYSICS_DT);
    ev.length = 0;
    stepVehicle(s, inp, stats, track, time, PHYSICS_DT, ev);
    track.updateFragile(PHYSICS_DT, Math.floor(s.d / 2) - 4, Math.floor(s.d / 2) + 4);
    time += PHYSICS_DT;
    const row = s.d / 2;
    if (row >= from && row <= to && (i % 3 === 0 || ev.length)) {
      out += `t=${time.toFixed(3)} row=${row.toFixed(2)} lane=${(s.x / 1.25 + (track.width - 1) / 2).toFixed(2)} y=${s.y.toFixed(2)} vy=${s.vy.toFixed(1)} v=${s.speed.toFixed(1)} g=${s.grounded ? 1 : 0} in=${inp.steer},${inp.throttle},${inp.jumpPressed ? 'J' : '-'} ${ev.map((e) => e.type).join(',')}\n`;
    }
    if (!s.alive || s.finished || row > to) break;
  }
  process.stderr.write(out);
});

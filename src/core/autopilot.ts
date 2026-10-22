import { PHYSICS_DT, ROW_LENGTH } from './constants';
import { DriveInput, PhysicsEvent, PhysicsTuning, DEFAULT_TUNING, VehicleState, stepVehicle } from './physics';
import { Track, laneToX, xToLane } from './track';
import { TileType } from './tiles';
import type { VehicleStats } from './vehicles';

/**
 * Lookahead autopilot that drives with the real physics model. Every `decisionInterval`
 * seconds it simulates a set of short two-stage action plans and commits to the first stage
 * of the best one. Used by the test-suite to prove levels are completable, and by the menu's
 * attract-mode demo.
 */
export interface AutopilotOptions {
  decisionInterval: number;
  horizon: number;
  /** Allow the planner to use the throttle (faster but riskier). */
  useThrottle: boolean;
  /** Physics step used inside rollouts (coarser = faster planning). */
  rolloutDt: number;
}

export const DEFAULT_AUTOPILOT: AutopilotOptions = {
  decisionInterval: 0.05,
  horizon: 2.2,
  useThrottle: true,
  rolloutDt: PHYSICS_DT,
};

interface Plan {
  first: DriveInput;
  second: DriveInput;
}

const STEERS = [-1, -0.5, 0, 0.5, 1];

export class Autopilot {
  private plans: Plan[];
  private current: DriveInput = { steer: 0, throttle: 0, jumpPressed: false };
  private timer = 0;
  private scratchEvents: PhysicsEvent[] = [];

  constructor(
    private track: Track,
    private stats: VehicleStats,
    private opts: AutopilotOptions = DEFAULT_AUTOPILOT,
    private tuning: PhysicsTuning = DEFAULT_TUNING,
  ) {
    const throttles = opts.useThrottle ? [0, 1, -1] : [0];
    this.plans = [];
    for (const throttle of throttles) {
      for (const steer of STEERS) {
        for (const jump of [false, true]) {
          for (const steer2 of [-1, 0, 1]) {
            for (const jump2 of [false, true]) {
              if (jump && jump2) continue;
              this.plans.push({
                first: { steer, throttle, jumpPressed: jump },
                second: { steer: steer2, throttle, jumpPressed: jump2 },
              });
            }
          }
        }
      }
    }
  }

  /** Returns the input to apply for this physics step. */
  update(state: VehicleState, time: number, dt: number): DriveInput {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.opts.decisionInterval;
      this.current = this.decide(state, time);
      return this.current;
    }
    // Only the first step of a decision carries the jump press.
    return { steer: this.current.steer, throttle: this.current.throttle, jumpPressed: false };
  }

  private decide(state: VehicleState, time: number): DriveInput {
    const t = this.track;
    const savedFS = t.fragileState.slice();
    const savedFT = t.fragileTimer.slice();
    const savedOrb = t.orbTaken.slice();
    const cbF = t.onFragileChange;
    const cbO = t.onOrbChange;
    t.onFragileChange = null;
    t.onOrbChange = null;

    let best: Plan = this.plans[0];
    let bestScore = -Infinity;
    const prev = this.current;
    for (const plan of this.plans) {
      let score = this.rollout(state, time, plan);
      // Hysteresis: symmetric choices (left vs right around a hazard) otherwise make the pilot dither.
      score -= Math.abs(plan.first.steer - prev.steer) * 1.5;
      score -= Math.abs(plan.second.steer - prev.steer) * 0.5;
      if (plan.first.jumpPressed) score -= 1.5;
      if (plan.second.jumpPressed) score -= 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = plan;
      }
      t.fragileState.set(savedFS);
      t.fragileTimer.set(savedFT);
      t.orbTaken.set(savedOrb);
    }
    t.onFragileChange = cbF;
    t.onOrbChange = cbO;
    return best.first;
  }

  private rollout(start: VehicleState, time: number, plan: Plan): number {
    const s: VehicleState = { ...start };
    const dt = this.opts.rolloutDt;
    const steps = Math.ceil(this.opts.horizon / dt);
    const firstSteps = Math.ceil(this.opts.decisionInterval / dt);
    const secondSteps = firstSteps + Math.ceil(0.45 / dt);
    const ev = this.scratchEvents;
    let orbs = 0;
    let minClear = 0.5;
    const reflex: DriveInput = { steer: 0, throttle: 0, jumpPressed: false };
    for (let i = 0; i < steps; i++) {
      let input: DriveInput;
      if (i < secondSteps) {
        const base = i < firstSteps ? plan.first : plan.second;
        input = { steer: base.steer, throttle: base.throttle, jumpPressed: base.jumpPressed && (i === 0 || i === firstSteps) };
      } else {
        this.reflex(s, reflex);
        input = reflex;
      }
      ev.length = 0;
      stepVehicle(s, input, this.stats, this.track, time + i * dt, dt, ev, this.tuning);
      for (const e of ev) if (e.type === 'orb') orbs++;
      this.track.updateFragile(dt, Math.floor(s.d / 2) - 3, Math.floor(s.d / 2) + 3);
      if (s.finished) return 1e6 - i;
      if (s.grounded && i % 4 === 0) minClear = Math.min(minClear, this.clearance(s));
      if (!s.alive || s.lost) {
        // Dying inside the committed part of the plan is the plan's fault; dying during the
        // reflex tail is only weak evidence, so it is penalised less.
        const tail = i >= secondSteps;
        return (tail ? -1e3 : -1e5) + i * 10 + s.d * 0.01;
      }
    }
    // Survived the horizon: prefer progress, being on the ground, and a centred, calm hull.
    let score = 1e4 + s.d * 0.25 + orbs * 1.5 + minClear * 20;
    if (s.grounded) score += 4;
    score -= Math.abs(s.vx) * 0.15;
    const lx = xToLane(s.x, this.track.width);
    score -= Math.abs(lx - Math.round(lx)) * 2;
    if (plan.first.throttle < 0) score -= 1;
    // Hanging around below cruise speed rarely helps and makes later gaps harder.
    if (s.speed < this.stats.cruise - 2) score -= (this.stats.cruise - s.speed) * 0.3;
    return score;
  }

  /** Lateral distance (in lanes, capped at 0.5) from the hull centre to an unsafe neighbouring edge. */
  private clearance(s: VehicleState): number {
    const t = this.track;
    const lx = xToLane(s.x, t.width);
    const L = Math.round(lx);
    const row = Math.floor(s.d / ROW_LENGTH);
    const frac = lx - L;
    const safe = (l: number) => t.isPresent(row, l) && t.cell(row, l).type !== TileType.Hazard && t.cell(row, l).block === 0;
    const left = safe(L - 1) ? 0.5 : frac + 0.5 - 0.29;
    const right = safe(L + 1) ? 0.5 : 0.5 - frac - 0.29;
    return Math.max(0, Math.min(0.5, left, right));
  }

  /** Simple reactive driver used for the tail of each rollout: steer to the nearest safe lane, jump at edges. */
  private reflex(s: VehicleState, out: DriveInput): void {
    const t = this.track;
    const lane = xToLane(s.x, t.width);
    const look = Math.max(3, s.speed * 0.35);
    let targetLane = Math.round(lane);
    const baseRow = Math.floor((s.d + look) / ROW_LENGTH);
    search: for (let r = baseRow; r < baseRow + 8; r++) {
      let best = -1;
      let bestDist = Infinity;
      for (let l = 0; l < t.width; l++) {
        if (!t.isPresent(r, l)) continue;
        const c = t.cell(r, l);
        if (c.type === TileType.Hazard) continue;
        const top = t.topAt(r, l, r * ROW_LENGTH + 1);
        if (top !== null && top > s.y + 1.5) continue;
        const dist = Math.abs(l - lane);
        if (dist < bestDist) {
          bestDist = dist;
          best = l;
        }
      }
      if (best >= 0) {
        targetLane = best;
        break search;
      }
    }
    out.steer = Math.max(-1, Math.min(1, (laneToX(targetLane, t.width) - s.x) * 1.6));
    out.throttle = 0;
    out.jumpPressed = false;
    if (s.grounded) {
      const ahead = s.d + s.speed * 0.08 + 0.75;
      const top = t.surfaceAt(s.x, ahead);
      const { row, lane: l } = t.cellCoords(s.x, ahead);
      const hazard = t.isPresent(row, l) && t.cell(row, l).type === TileType.Hazard;
      if (top === null || top > s.y + 0.3 || top < s.y - 0.5 || hazard) out.jumpPressed = true;
    }
  }
}

export interface RunResult {
  finished: boolean;
  time: number;
  crashes: number;
  orbs: number;
  maxRow: number;
  crashLog: Array<{ row: number; cause: string }>;
}

/**
 * Drive a whole track headlessly with the autopilot. Crashes respawn at the last checkpoint
 * like the real game; gives up after `maxCrashes`.
 */
export function autoRun(
  track: Track,
  stats: VehicleStats,
  spawn: (row: number) => VehicleState,
  opts: { maxTime?: number; maxCrashes?: number; maxRow?: number; autopilot?: Partial<AutopilotOptions> } = {},
): RunResult {
  const maxTime = opts.maxTime ?? 240;
  const maxCrashes = opts.maxCrashes ?? 3;
  const pilot = new Autopilot(track, stats, { ...DEFAULT_AUTOPILOT, ...opts.autopilot });
  let s = spawn(0);
  let time = 0;
  let crashes = 0;
  let orbs = 0;
  let maxRow = 0;
  const crashLog: RunResult['crashLog'] = [];
  const events: PhysicsEvent[] = [];
  let leftRow = -1;
  while (time < maxTime) {
    const input = pilot.update(s, time, PHYSICS_DT);
    events.length = 0;
    stepVehicle(s, input, stats, track, time, PHYSICS_DT, events);
    track.updateFragile(PHYSICS_DT, Math.floor(s.d / 2) - 4, Math.floor(s.d / 2) + 4);
    time += PHYSICS_DT;
    for (const e of events) {
      if (e.type === 'orb') orbs++;
      if (e.type === 'leaveTrack') leftRow = Math.floor(s.d / 2);
    }
    maxRow = Math.max(maxRow, Math.floor(s.d / 2));
    if (opts.maxRow !== undefined && maxRow >= opts.maxRow) return { finished: true, time, crashes, orbs, maxRow, crashLog };
    if (s.finished) return { finished: true, time, crashes, orbs, maxRow, crashLog };
    if (!s.alive) {
      const cause = (events.find((e) => e.type === 'crash') as { cause: string } | undefined)?.cause ?? '?';
      crashLog.push({ row: cause === 'fall' && leftRow >= 0 ? leftRow : Math.floor(s.d / 2), cause });
      leftRow = -1;
      crashes++;
      if (crashes > maxCrashes) break;
      const cp = s.lastCheckpoint;
      track.resetState(cp + 1 > 0 ? cp : 0);
      s = spawn(cp);
    }
  }
  return { finished: false, time, crashes, orbs, maxRow, crashLog };
}

import {
  ACCEL_TILE_RATE,
  BOOST_BONUS_SPEED,
  BOOST_DURATION,
  COYOTE_TIME,
  FALL_DEATH_Y,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_TILE_IMPULSE,
  LANE_WIDTH,
  MIN_SPEED,
  ROW_LENGTH,
  SLOW_TILE_RATE,
  SNAP_DOWN,
  STEP_UP,
  VEHICLE_HALF_LENGTH,
  VEHICLE_HALF_WIDTH,
  VEHICLE_HEIGHT,
} from './constants';
import { TileType } from './tiles';
import { Track, itemHeight, laneToX, orbHeight, xToLane } from './track';
import {
  AIR_JUMP_FACTOR,
  ItemKind,
  MAGNET_DURATION,
  MAX_NITRO,
  MAX_WINGS,
  MULTIPLIER_DURATION,
  NITRO_DURATION,
  SHIELD_GHOST,
} from './items';
import type { VehicleStats } from './vehicles';

export interface DriveInput {
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** -1 (brake) .. 1 (accelerate) */
  throttle: number;
  /** True only on the step the jump button was pressed. */
  jumpPressed: boolean;
  /** True only on the step the nitro button was pressed. */
  nitroPressed?: boolean;
}

export const NO_INPUT: DriveInput = { steer: 0, throttle: 0, jumpPressed: false };

export type CrashCause = 'wall' | 'hazard' | 'obstacle' | 'fall';

export type PhysicsEvent =
  | { type: 'jump'; launchPad: boolean; airJump?: boolean }
  | { type: 'item'; kind: ItemKind; row: number; lane: number }
  | { type: 'shieldHit'; cause: CrashCause }
  | { type: 'nitro' }
  | { type: 'land'; airTime: number; clean: boolean; hard: boolean }
  | { type: 'boost' }
  | { type: 'scrape' }
  | { type: 'crash'; cause: CrashCause }
  | { type: 'orb'; row: number; lane: number }
  | { type: 'checkpoint'; row: number }
  | { type: 'finish' }
  | { type: 'surface'; tile: TileType }
  | { type: 'leaveTrack' };

export interface VehicleState {
  /** Lateral position (world X). */
  x: number;
  /** Bottom of the hull (world Y). */
  y: number;
  /** Forward distance along the track (world Z is -d). */
  d: number;
  vx: number;
  vy: number;
  speed: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  boostTimer: number;
  airTime: number;
  alive: boolean;
  finished: boolean;
  /** True once the vehicle has dropped below the track and can no longer recover. */
  lost: boolean;
  surface: TileType;
  lastCheckpoint: number;
  /** Cell of the last boost strip that fired, so one strip fires once. */
  lastBoostCell: number;
  /** Total seconds spent above 90% of top speed (score bonus). */
  highSpeedTime: number;
  // ---- Power-ups ----
  /** 1 while a shield is equipped. */
  shield: number;
  /** Seconds left of phase-through after a shield absorbed a hit. */
  ghost: number;
  magnetTimer: number;
  multTimer: number;
  /** Mid-air jumps available. */
  wings: number;
  /** Stored nitro charges. */
  nitro: number;
}

/** Power-up state carried across a respawn (a crash keeps what you had stored, timers expire). */
export function carryItems(from: VehicleState, to: VehicleState): void {
  to.shield = from.shield;
  to.wings = from.wings;
  to.nitro = from.nitro;
}

export interface PhysicsTuning {
  /** Multiplier on maximum steering speed (player setting). */
  steerSensitivity: number;
  /** Seconds a fragile tile survives after first contact. */
  fragileDelay: number;
}

export const DEFAULT_TUNING: PhysicsTuning = { steerSensitivity: 1, fragileDelay: 0.22 };

export function spawnState(track: Track, row: number, stats: VehicleStats): VehicleState {
  const lane = spawnLane(track, row);
  const x = laneToX(lane, track.width);
  const d = row * ROW_LENGTH + ROW_LENGTH * 0.5;
  const y = track.topAt(row, lane, d) ?? track.rowY(row);
  return {
    x,
    y,
    d,
    vx: 0,
    vy: 0,
    speed: stats.cruise,
    grounded: true,
    coyote: 0,
    jumpBuffer: 0,
    boostTimer: 0,
    airTime: 0,
    alive: true,
    finished: false,
    lost: false,
    surface: TileType.Standard,
    lastCheckpoint: row,
    lastBoostCell: -1,
    highSpeedTime: 0,
    shield: 0,
    ghost: 0,
    magnetTimer: 0,
    multTimer: 0,
    wings: 0,
    nitro: 0,
  };
}

/** Lane to spawn in on a given row: the present, safe cell closest to the track centre. */
export function spawnLane(track: Track, row: number): number {
  const mid = (track.width - 1) / 2;
  let best = Math.floor(mid);
  let bestDist = Infinity;
  for (let lane = 0; lane < track.width; lane++) {
    const c = track.cell(row, lane);
    if (c.type === TileType.Empty || c.type === TileType.Hazard || c.block !== 0) continue;
    const dist = Math.abs(lane - mid) + (c.type === TileType.Checkpoint ? -0.25 : 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = lane;
    }
  }
  return best;
}

/** Sample points under the hull used for ground support, relative to (x, d). */
const SUPPORT_SAMPLES: Array<[number, number]> = [
  [0, 0],
  [0, VEHICLE_HALF_LENGTH * 0.8],
  [0, -VEHICLE_HALF_LENGTH * 0.8],
  [-VEHICLE_HALF_WIDTH * 0.55, 0],
  [VEHICLE_HALF_WIDTH * 0.55, 0],
];

/** Corner/edge points used for wall collision, relative to (x, d). */
const HULL_SAMPLES: Array<[number, number]> = [
  [-VEHICLE_HALF_WIDTH, VEHICLE_HALF_LENGTH],
  [0, VEHICLE_HALF_LENGTH],
  [VEHICLE_HALF_WIDTH, VEHICLE_HALF_LENGTH],
  [-VEHICLE_HALF_WIDTH, 0],
  [VEHICLE_HALF_WIDTH, 0],
  [-VEHICLE_HALF_WIDTH, -VEHICLE_HALF_LENGTH],
  [VEHICLE_HALF_WIDTH, -VEHICLE_HALF_LENGTH],
];

/** Returns the top of a surface that blocks a hull point at (px, pd) for a hull bottom at y, or null. */
function blockingTop(track: Track, px: number, pd: number, y: number): number | null {
  const top = track.surfaceAt(px, pd);
  if (top === null) return null;
  if (top <= y + STEP_UP) return null;
  // A ship that has dropped below a slab flies underneath it.
  if (y + VEHICLE_HEIGHT < track.bottomUnder(px, pd)) return null;
  return top;
}

function hullBlocked(track: Track, x: number, d: number, y: number): { blocked: boolean; side: number } {
  let left = false;
  let right = false;
  let centre = false;
  for (const [ox, od] of HULL_SAMPLES) {
    if (blockingTop(track, x + ox, d + od, y) !== null) {
      if (ox < 0) left = true;
      else if (ox > 0) right = true;
      else centre = true;
    }
  }
  const blocked = left || right || centre;
  const side = centre || (left && right) ? 0 : left ? -1 : 1;
  return { blocked, side };
}

function obstacleHit(track: Track, x: number, d: number, y: number, time: number): boolean {
  for (const o of track.obstacles) {
    const d0 = o.row * ROW_LENGTH;
    const d1 = (o.row + o.rows) * ROW_LENGTH;
    if (d + VEHICLE_HALF_LENGTH < d0 || d - VEHICLE_HALF_LENGTH > d1) continue;
    const top = track.rowY(o.row) + o.height;
    if (y >= top - 0.05) continue;
    if (y + VEHICLE_HEIGHT < track.rowY(o.row)) continue;
    const ox = laneToX(track.obstaclePosition(o, time), track.width);
    const half = (o.width * LANE_WIDTH) / 2 - 0.05;
    if (Math.abs(x - ox) < half + VEHICLE_HALF_WIDTH) return true;
  }
  return false;
}

/** Highest supporting surface under the hull that the vehicle could stand on at height y. */
function supportTop(track: Track, x: number, d: number, y: number): { top: number | null; samples: number } {
  let best: number | null = null;
  let samples = 0;
  let centre = false;
  for (let i = 0; i < SUPPORT_SAMPLES.length; i++) {
    const [ox, od] = SUPPORT_SAMPLES[i];
    const t = track.surfaceAt(x + ox, d + od);
    if (t === null || t > y + STEP_UP) continue;
    samples++;
    if (i === 0) centre = true;
    if (best === null || t > best) best = t;
  }
  // Any contact point keeps the hull up: edges are forgiving, as befits an arcade racer.
  void centre;
  return { top: best, samples };
}

/**
 * Advance the vehicle by one fixed physics step. Pure apart from mutating `s` and the
 * track's per-run state (fragile tiles, orbs); emits gameplay events into `events`.
 */
export function stepVehicle(
  s: VehicleState,
  input: DriveInput,
  stats: VehicleStats,
  track: Track,
  time: number,
  dt: number,
  events: PhysicsEvent[],
  tuning: PhysicsTuning = DEFAULT_TUNING,
): void {
  if (!s.alive || s.finished) return;

  s.coyote = Math.max(0, s.coyote - dt);
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  if (input.jumpPressed) s.jumpBuffer = JUMP_BUFFER;
  if (s.boostTimer > 0) s.boostTimer = Math.max(0, s.boostTimer - dt);
  if (s.ghost > 0) s.ghost = Math.max(0, s.ghost - dt);
  if (s.magnetTimer > 0) s.magnetTimer = Math.max(0, s.magnetTimer - dt);
  if (s.multTimer > 0) s.multTimer = Math.max(0, s.multTimer - dt);
  if (input.nitroPressed && s.nitro > 0) {
    s.nitro--;
    s.boostTimer = Math.max(s.boostTimer, NITRO_DURATION);
    // Straight past top speed, whatever speed you were doing.
    s.speed = Math.min(stats.maxSpeed + BOOST_BONUS_SPEED, Math.max(s.speed + BOOST_BONUS_SPEED, stats.maxSpeed + 3));
    events.push({ type: 'nitro' });
  }

  // ---- Forward speed -------------------------------------------------------
  const boosting = s.boostTimer > 0;
  const cap = stats.maxSpeed + (boosting ? BOOST_BONUS_SPEED : 0);
  const throttleScale = s.grounded ? 1 : 0.5;
  if (input.throttle > 0.05) {
    if (s.speed < cap) s.speed = Math.min(cap, s.speed + stats.accel * input.throttle * throttleScale * dt);
  } else if (input.throttle < -0.05) {
    s.speed = Math.max(MIN_SPEED, s.speed + stats.brake * input.throttle * throttleScale * dt);
  } else if (s.grounded) {
    // Drift back toward cruise speed when hands-off.
    if (s.speed > stats.cruise && !boosting) s.speed = Math.max(stats.cruise, s.speed - 4 * dt);
    else if (s.speed < stats.cruise) s.speed = Math.min(stats.cruise, s.speed + 6 * dt);
  }
  if (!boosting && s.speed > stats.maxSpeed) s.speed = Math.max(stats.maxSpeed, s.speed - 10 * dt);

  if (s.grounded) {
    if (s.surface === TileType.Accel) s.speed = Math.min(cap, s.speed + ACCEL_TILE_RATE * dt);
    else if (s.surface === TileType.Slow) s.speed = Math.max(MIN_SPEED, s.speed - SLOW_TILE_RATE * dt);
  }
  if (s.speed >= stats.maxSpeed * 0.9) s.highSpeedTime += dt;

  // ---- Lateral velocity -----------------------------------------------------
  const maxLat = stats.steerSpeed * tuning.steerSensitivity;
  const target = Math.max(-1, Math.min(1, input.steer)) * maxLat;
  let traction = stats.traction;
  if (!s.grounded) traction *= stats.airControl;
  else if (s.surface === TileType.Ice) traction = stats.iceTraction;
  s.vx += (target - s.vx) * Math.min(1, traction * dt);

  // ---- Jumping ----------------------------------------------------------------
  const canJump = s.grounded || s.coyote > 0;
  if (s.grounded && s.surface === TileType.Jump) {
    s.vy = JUMP_TILE_IMPULSE;
    s.grounded = false;
    s.coyote = 0;
    s.jumpBuffer = 0;
    s.airTime = 0;
    events.push({ type: 'jump', launchPad: true });
  } else if (s.jumpBuffer > 0 && canJump) {
    s.vy = stats.jumpImpulse;
    s.grounded = false;
    s.coyote = 0;
    s.jumpBuffer = 0;
    s.airTime = 0;
    events.push({ type: 'jump', launchPad: false });
  } else if (input.jumpPressed && !s.grounded && s.wings > 0 && !s.lost) {
    // Wings: one extra jump in mid-air.
    s.wings--;
    s.vy = stats.jumpImpulse * AIR_JUMP_FACTOR;
    s.jumpBuffer = 0;
    events.push({ type: 'jump', launchPad: false, airJump: true });
  }

  // ---- Forward movement + head-on collisions ---------------------------------
  const newD = s.d + s.speed * dt;
  const fwd = s.ghost > 0 ? { blocked: false, side: 0 } : hullBlocked(track, s.x, newD, s.y);
  if (fwd.blocked) {
    // Clipping a block with one wingtip nudges the ship aside; anything more is a crash.
    const nudged = fwd.side !== 0 ? s.x - fwd.side * 0.22 : s.x;
    if (fwd.side !== 0 && !hullBlocked(track, nudged, newD, s.y).blocked && !hullBlocked(track, nudged, s.d, s.y).blocked) {
      s.x = nudged;
      s.vx = -fwd.side * Math.abs(s.vx) * 0.3;
      s.d = newD;
      events.push({ type: 'scrape' });
    } else if (absorb(s, events, 'wall')) {
      s.d = newD;
      s.speed = Math.max(MIN_SPEED, s.speed * 0.6);
    } else {
      crash(s, events, 'wall');
      return;
    }
  } else {
    s.d = newD;
  }

  // ---- Lateral movement + side collisions -------------------------------------
  const newX = s.x + s.vx * dt;
  if (s.ghost <= 0 && hullBlocked(track, newX, s.d, s.y).blocked) {
    if (Math.abs(s.vx) > 2) events.push({ type: 'scrape' });
    s.vx = -s.vx * 0.25;
  } else {
    s.x = newX;
  }

  if (s.ghost <= 0 && obstacleHit(track, s.x, s.d, s.y, time) && !absorb(s, events, 'obstacle')) {
    crash(s, events, 'obstacle');
    return;
  }

  // ---- Vertical movement, ground support, landing ----------------------------
  if (s.grounded) {
    const sup = supportTop(track, s.x, s.d, s.y);
    if (sup.top === null) {
      s.grounded = false;
      s.coyote = COYOTE_TIME;
      s.airTime = 0;
    } else if (sup.top >= s.y - SNAP_DOWN) {
      s.y = sup.top;
      s.vy = 0;
    } else {
      // Drove off a ledge onto something lower: fall to it.
      s.grounded = false;
      s.coyote = COYOTE_TIME;
      s.airTime = 0;
    }
  }

  if (!s.grounded) {
    s.airTime += dt;
    s.vy -= GRAVITY * dt;
    const newY = s.y + s.vy * dt;
    if (s.vy <= 0) {
      const sup = supportTop(track, s.x, s.d, s.y);
      if (sup.top !== null && newY <= sup.top) {
        const hard = s.vy < -14;
        const clean = s.airTime > 0.35 && sup.samples >= 4;
        s.y = sup.top;
        s.vy = 0;
        s.grounded = true;
        if (s.airTime > 0.12) events.push({ type: 'land', airTime: s.airTime, clean, hard });
        s.airTime = 0;
      } else {
        s.y = newY;
      }
    } else {
      s.y = newY;
    }
  }

  // ---- Surface effects ----------------------------------------------------------
  const { row, lane } = track.cellCoords(s.x, s.d);
  let surface = TileType.Empty;
  if (s.grounded) {
    const lx = xToLane(s.x, track.width);
    const centreLane = Math.abs(lx - lane) <= 0.5 ? lane : -1;
    surface = track.isPresent(row, centreLane) ? track.cell(row, centreLane).type : TileType.Empty;
    // If the centre hangs over the void, use the tile we are actually resting on.
    if (surface === TileType.Empty) {
      for (const [ox, od] of SUPPORT_SAMPLES) {
        const c = track.cellCoords(s.x + ox, s.d + od);
        if (track.isPresent(c.row, c.lane)) {
          surface = track.cell(c.row, c.lane).type;
          break;
        }
      }
    }
    // Start collapsing every fragile tile under the hull.
    for (const [ox, od] of SUPPORT_SAMPLES) {
      const c = track.cellCoords(s.x + ox, s.d + od);
      track.touchFragile(c.row, c.lane, tuning.fragileDelay);
    }
    if (surface === TileType.Hazard && s.ghost <= 0 && !absorb(s, events, 'hazard')) {
      crash(s, events, 'hazard');
      return;
    }
    if (surface === TileType.Boost) {
      const idx = track.index(row, lane);
      if (idx !== s.lastBoostCell) {
        s.lastBoostCell = idx;
        s.boostTimer = BOOST_DURATION;
        s.speed = Math.min(stats.maxSpeed + BOOST_BONUS_SPEED, s.speed + BOOST_BONUS_SPEED);
        events.push({ type: 'boost' });
      }
    }
  }
  if (surface !== s.surface) {
    s.surface = surface;
    if (s.grounded) events.push({ type: 'surface', tile: surface });
  }

  // ---- Orbs (a magnet widens the pickup to two lanes either side) ---------------------
  const magnet = s.magnetTimer > 0;
  const reachL = magnet ? 2 : 1;
  const reachR = magnet ? 2 : 1;
  for (let r = row - reachR; r <= row + reachR; r++) {
    for (let l = lane - reachL; l <= lane + reachL; l++) {
      if (!track.cell(r, l).orb) continue;
      const ox = laneToX(l, track.width);
      const od = r * ROW_LENGTH + ROW_LENGTH / 2;
      const oy = orbHeight(track, r, l);
      const hit = magnet
        ? Math.abs(ox - s.x) < 2.8 && Math.abs(od - s.d) < 2.6 && Math.abs(oy - (s.y + 0.25)) < 2.5
        : Math.abs(ox - s.x) < 0.75 && Math.abs(od - s.d) < 1.0 && Math.abs(oy - (s.y + 0.25)) < 1.1;
      if (hit && track.takeOrb(r, l)) events.push({ type: 'orb', row: r, lane: l });
    }
  }

  // ---- Power-ups ---------------------------------------------------------------------
  for (let r = row - 1; r <= row + 1; r++) {
    for (let l = lane - 1; l <= lane + 1; l++) {
      if (!track.cell(r, l).item) continue;
      const ix = laneToX(l, track.width);
      const id = r * ROW_LENGTH + ROW_LENGTH / 2;
      const iy = itemHeight(track, r, l);
      if (Math.abs(ix - s.x) < 0.8 && Math.abs(id - s.d) < 1.1 && Math.abs(iy - (s.y + 0.25)) < 1.3) {
        const kind = track.takeItem(r, l);
        if (kind !== ItemKind.None) {
          applyItem(s, kind);
          events.push({ type: 'item', kind, row: r, lane: l });
        }
      }
    }
  }

  // ---- Checkpoints / finish ----------------------------------------------------------
  for (const cp of track.checkpoints) {
    if (cp > s.lastCheckpoint && s.d >= cp * ROW_LENGTH + ROW_LENGTH * 0.5) {
      s.lastCheckpoint = cp;
      events.push({ type: 'checkpoint', row: cp });
    }
  }
  if (track.finishRow >= 0 && s.d >= track.finishRow * ROW_LENGTH + ROW_LENGTH * 0.5 && s.y > track.rowY(track.finishRow) - 1.5) {
    s.finished = true;
    events.push({ type: 'finish' });
    return;
  }

  // ---- Falling into the void -------------------------------------------------------------
  if (!s.grounded && !s.lost) {
    const floor = Math.min(track.rowY(row), track.rowY(row + 1), track.rowY(row - 1));
    if (s.y < floor - 2.2) {
      s.lost = true;
      events.push({ type: 'leaveTrack' });
    }
  }
  if (s.y < FALL_DEATH_Y + Math.min(0, track.rowY(row))) crash(s, events, 'fall');
}

/** Apply a collected power-up to the vehicle. Extra lives are handled by the game session. */
export function applyItem(s: VehicleState, kind: ItemKind): void {
  switch (kind) {
    case ItemKind.Shield:
      s.shield = 1;
      break;
    case ItemKind.Magnet:
      s.magnetTimer = MAGNET_DURATION;
      break;
    case ItemKind.Wings:
      s.wings = Math.min(MAX_WINGS, s.wings + 1);
      break;
    case ItemKind.Nitro:
      s.nitro = Math.min(MAX_NITRO, s.nitro + 1);
      break;
    case ItemKind.Multiplier:
      s.multTimer = MULTIPLIER_DURATION;
      break;
    default:
      break;
  }
}

/** A shield absorbs one crash (never a fall) and grants a short phase-through window. */
function absorb(s: VehicleState, events: PhysicsEvent[], cause: CrashCause): boolean {
  if (s.shield <= 0) return false;
  s.shield = 0;
  s.ghost = SHIELD_GHOST;
  events.push({ type: 'shieldHit', cause });
  return true;
}

function crash(s: VehicleState, events: PhysicsEvent[], cause: CrashCause): void {
  s.alive = false;
  events.push({ type: 'crash', cause });
}

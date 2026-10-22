export type VehicleId = 'comet' | 'wisp' | 'bastion';

export interface VehicleStats {
  id: VehicleId;
  name: string;
  tagline: string;
  description: string;
  /** Speed the vehicle settles to with no throttle input. */
  cruise: number;
  /** Top speed under throttle (boost strips can exceed it briefly). */
  maxSpeed: number;
  accel: number;
  brake: number;
  /** Maximum sideways speed at sensitivity 1. */
  steerSpeed: number;
  /** How quickly sideways speed reaches the steering target on normal tiles (1/s). */
  traction: number;
  /** Traction on ice. */
  iceTraction: number;
  /** Fraction of ground traction available while airborne. */
  airControl: number;
  jumpImpulse: number;
  /** 0..1 values for the garage stat bars. */
  bars: { speed: number; handling: number; stability: number };
  /** How the vehicle is unlocked. */
  unlock: { type: 'default' } | { type: 'level'; level: number };
}

/**
 * All three ships share the same cruise speed and near-identical jump arcs so that every
 * campaign gap is fair with any ship; they differ in top speed, steering response and grip.
 */
export const VEHICLES: Record<VehicleId, VehicleStats> = {
  comet: {
    id: 'comet',
    name: 'COMET',
    tagline: 'Balanced all-rounder',
    description: 'Predictable grip, honest top speed and a forgiving jump. The ship every pilot learns on.',
    cruise: 16,
    maxSpeed: 27,
    accel: 12,
    brake: 24,
    steerSpeed: 7.2,
    traction: 16,
    iceTraction: 2.2,
    airControl: 0.3,
    jumpImpulse: 10.2,
    bars: { speed: 0.6, handling: 0.6, stability: 0.6 },
    unlock: { type: 'default' },
  },
  wisp: {
    id: 'wisp',
    name: 'WISP',
    tagline: 'Lightweight and twitchy',
    description: 'Razor-sharp steering and the best air control. Punishing on ice, brilliant everywhere else.',
    cruise: 16,
    maxSpeed: 28.5,
    accel: 14,
    brake: 24,
    steerSpeed: 8.6,
    traction: 23,
    iceTraction: 1.6,
    airControl: 0.42,
    jumpImpulse: 10.2,
    bars: { speed: 0.8, handling: 0.9, stability: 0.3 },
    unlock: { type: 'level', level: 3 },
  },
  bastion: {
    id: 'bastion',
    name: 'BASTION',
    tagline: 'Heavy and planted',
    description: 'Slower to turn, but its weight bites into ice and keeps it steady at speed.',
    cruise: 16,
    maxSpeed: 26,
    accel: 11,
    brake: 26,
    steerSpeed: 6.6,
    traction: 13,
    iceTraction: 5,
    airControl: 0.24,
    jumpImpulse: 10.5,
    bars: { speed: 0.45, handling: 0.4, stability: 0.95 },
    unlock: { type: 'level', level: 6 },
  },
};

export const VEHICLE_ORDER: VehicleId[] = ['comet', 'wisp', 'bastion'];

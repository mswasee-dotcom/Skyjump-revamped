/**
 * World-space units. The track is a grid: lanes along X, rows along -Z (forward).
 * Everything that affects gameplay lives here so it can be tuned in one place
 * and shared by the physics, the level validator and the autopilot tests.
 */
export const LANE_WIDTH = 1.25;
export const ROW_LENGTH = 2.0;
/** Height of one "step" unit used by the level DSL for row elevation. */
export const HEIGHT_UNIT = 1.0;
/** Visual thickness of a track slab. */
export const TILE_THICKNESS = 0.45;

/** Height of a low block ("b") above its row's floor. Can be jumped onto. */
export const LOW_BLOCK_HEIGHT = 1.0;
/** Height of a wall block ("#") above its row's floor. Cannot be jumped over. */
export const WALL_HEIGHT = 3.0;

/** Physics runs at a fixed rate regardless of render frame rate. */
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Never simulate more than this much time in one frame (tab switches, hitches). */
export const MAX_FRAME_TIME = 0.1;

export const GRAVITY = 32;
/** Vertical distance the vehicle will step up onto without being stopped. */
export const STEP_UP = 0.3;
/** Vertical distance the vehicle will "stick" down to follow ramps while grounded. */
export const SNAP_DOWN = 0.35;
/** Grace period after leaving a ledge during which a jump is still allowed. */
export const COYOTE_TIME = 0.1;
/** A jump pressed slightly before landing is remembered for this long. */
export const JUMP_BUFFER = 0.12;
/** Below this height the vehicle is considered lost in the void. */
export const FALL_DEATH_Y = -18;

export const VEHICLE_HALF_WIDTH = 0.36;
export const VEHICLE_HALF_LENGTH = 0.62;
export const VEHICLE_HEIGHT = 0.42;

export const MIN_SPEED = 8;
export const BOOST_DURATION = 1.25;
export const BOOST_BONUS_SPEED = 9;

/** Tile effect rates (units/s^2). */
export const ACCEL_TILE_RATE = 30;
export const SLOW_TILE_RATE = 30;
export const JUMP_TILE_IMPULSE = 15.5;

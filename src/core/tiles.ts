/** Every surface the vehicle can drive on. */
export enum TileType {
  Empty = 0,
  Standard = 1,
  Accel = 2,
  Slow = 3,
  Jump = 4,
  Ice = 5,
  Hazard = 6,
  Fragile = 7,
  Boost = 8,
  Finish = 9,
  Checkpoint = 10,
}

/** Raised geometry sitting on a cell. The block's top surface is driveable and uses the cell's tile type. */
export enum BlockKind {
  None = 0,
  /** Low block — the vehicle can jump onto it and drive along its top. */
  Low = 1,
  /** Tall wall — must be steered around. */
  Wall = 2,
}

export interface TileInfo {
  name: string;
  short: string;
  description: string;
  /** CSS/hex colour used for the tile's neon accent and the HUD legend. */
  color: string;
}

export const TILE_INFO: Record<TileType, TileInfo> = {
  [TileType.Empty]: { name: 'Void', short: '', description: 'Nothing but a long way down.', color: '#000000' },
  [TileType.Standard]: { name: 'Standard', short: '', description: 'Normal grip and speed.', color: '#2de2ff' },
  [TileType.Accel]: { name: 'Accelerator', short: 'ACCEL', description: 'Pushes your speed up while you ride it.', color: '#39ff88' },
  [TileType.Slow]: { name: 'Drag Plate', short: 'DRAG', description: 'Bleeds your speed while you ride it.', color: '#ff9b2f' },
  [TileType.Jump]: { name: 'Launch Pad', short: 'LAUNCH', description: 'Throws you high into the air automatically.', color: '#ffe14a' },
  [TileType.Ice]: { name: 'Cryo Ice', short: 'ICE', description: 'Almost no steering traction. Plan your line early.', color: '#a8e8ff' },
  [TileType.Hazard]: { name: 'Plasma', short: 'HAZARD', description: 'Burns through your hull. Never touch it.', color: '#ff2d6f' },
  [TileType.Fragile]: { name: 'Fragile', short: 'FRAGILE', description: 'Collapses moments after you cross it.', color: '#b77bff' },
  [TileType.Boost]: { name: 'Boost Strip', short: 'BOOST', description: 'A burst of extra speed for a short time.', color: '#ffffff' },
  [TileType.Finish]: { name: 'Finish', short: '', description: 'Cross it to clear the sector.', color: '#ffffff' },
  [TileType.Checkpoint]: { name: 'Checkpoint', short: '', description: 'You respawn here after a crash.', color: '#2de2ff' },
};

/** Tiles that destroy the vehicle when it is grounded on them. */
export function isLethal(t: TileType): boolean {
  return t === TileType.Hazard;
}

/** Tile types listed in the in-game "How to play" legend, in teaching order. */
export const LEGEND_TILES: TileType[] = [
  TileType.Standard,
  TileType.Accel,
  TileType.Slow,
  TileType.Boost,
  TileType.Jump,
  TileType.Ice,
  TileType.Fragile,
  TileType.Hazard,
];

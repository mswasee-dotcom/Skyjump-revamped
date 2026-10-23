import { BlockKind, TileType } from './tiles';
import { ItemKind } from './items';
import {
  HEIGHT_UNIT,
  LANE_WIDTH,
  LOW_BLOCK_HEIGHT,
  ROW_LENGTH,
  TILE_THICKNESS,
  WALL_HEIGHT,
} from './constants';

export interface Cell {
  type: TileType;
  block: BlockKind;
  /** Ramp: top rises linearly by rise * HEIGHT_UNIT from the start to the end of the row. */
  rise: number;
  /** An energy orb sits above this cell. */
  orb: boolean;
  /** A power-up floats above this cell (ItemKind.None for none). */
  item?: ItemKind;
}

export interface Row {
  /** Floor height of the row in world units. */
  y: number;
  cells: Cell[];
}

/** A block that slides side to side across the track. */
export interface MovingObstacle {
  row: number;
  /** Length in rows. */
  rows: number;
  /** Centre lane (may be fractional). */
  lane: number;
  /** Half-travel in lanes. */
  amplitude: number;
  /** Seconds per full oscillation. */
  period: number;
  phase: number;
  /** Width in lanes. */
  width: number;
  height: number;
}

/** Driving through this rectangle awards a one-off "risky route" bonus. */
export interface AltZone {
  row0: number;
  row1: number;
  lane0: number;
  lane1: number;
  bonus: number;
  label: string;
}

export interface Hint {
  row: number;
  text: string;
}

export const EMPTY_CELL: Cell = Object.freeze({ type: TileType.Empty, block: BlockKind.None, rise: 0, orb: false });

export function laneToX(lane: number, width: number): number {
  return (lane - (width - 1) / 2) * LANE_WIDTH;
}

export function xToLane(x: number, width: number): number {
  return x / LANE_WIDTH + (width - 1) / 2;
}

/**
 * Runtime track: immutable layout plus mutable per-run state (collapsed fragile tiles, collected orbs).
 * Forward distance `d` is measured in world units from the start of row 0; render Z is `-d`.
 */
export class Track {
  readonly width: number;
  readonly rows: Row[] = [];
  readonly obstacles: MovingObstacle[] = [];
  readonly altZones: AltZone[] = [];
  readonly hints: Hint[] = [];
  /** Row indices that contain checkpoint tiles, ascending. */
  readonly checkpoints: number[] = [];
  /** First row containing a finish tile, or -1 for endless tracks. */
  finishRow = -1;

  /** 0 = intact, 1 = cracking (timer running), 2 = gone. */
  fragileState: Uint8Array = new Uint8Array(0);
  fragileTimer: Float32Array = new Float32Array(0);
  orbTaken: Uint8Array = new Uint8Array(0);
  itemTaken: Uint8Array = new Uint8Array(0);

  /** Listeners notified when a fragile tile changes state, used by the renderer. */
  onFragileChange: ((row: number, lane: number, state: number) => void) | null = null;
  onOrbChange: ((row: number, lane: number, taken: boolean) => void) | null = null;
  onItemChange: ((row: number, lane: number, taken: boolean) => void) | null = null;

  constructor(width: number) {
    this.width = width;
  }

  get length(): number {
    return this.rows.length;
  }

  /** Append rows (used by both level parsing and the endless generator). */
  appendRows(rows: Row[]): void {
    const start = this.rows.length;
    for (const r of rows) {
      if (r.cells.length !== this.width) throw new Error(`Row width ${r.cells.length} != track width ${this.width}`);
      this.rows.push(r);
    }
    this.growState();
    for (let i = start; i < this.rows.length; i++) {
      const cells = this.rows[i].cells;
      if (cells.some((c) => c.type === TileType.Checkpoint)) {
        const last = this.checkpoints[this.checkpoints.length - 1];
        if (last === undefined || i > last + 1) this.checkpoints.push(i);
      }
      if (this.finishRow < 0 && cells.some((c) => c.type === TileType.Finish)) this.finishRow = i;
    }
  }

  private growState(): void {
    const n = this.rows.length * this.width;
    if (this.fragileState.length >= n) return;
    const cap = Math.max(n, this.fragileState.length * 2);
    const fs = new Uint8Array(cap);
    fs.set(this.fragileState);
    const ft = new Float32Array(cap);
    ft.set(this.fragileTimer);
    const ot = new Uint8Array(cap);
    ot.set(this.orbTaken);
    const it = new Uint8Array(cap);
    it.set(this.itemTaken);
    this.fragileState = fs;
    this.fragileTimer = ft;
    this.orbTaken = ot;
    this.itemTaken = it;
  }

  cell(row: number, lane: number): Cell {
    if (row < 0 || row >= this.rows.length || lane < 0 || lane >= this.width) return EMPTY_CELL;
    return this.rows[row].cells[lane];
  }

  index(row: number, lane: number): number {
    return row * this.width + lane;
  }

  isPresent(row: number, lane: number): boolean {
    const c = this.cell(row, lane);
    if (c.type === TileType.Empty) return false;
    if (c.type === TileType.Fragile && this.fragileState[this.index(row, lane)] === 2) return false;
    return true;
  }

  rowY(row: number): number {
    if (row < 0) return this.rows.length ? this.rows[0].y : 0;
    if (row >= this.rows.length) return this.rows.length ? this.rows[this.rows.length - 1].y : 0;
    return this.rows[row].y;
  }

  /** Top surface height of a cell at forward position `d` (only meaningful within that row). Null if no surface. */
  topAt(row: number, lane: number, d: number): number | null {
    if (!this.isPresent(row, lane)) return null;
    const c = this.rows[row].cells[lane];
    const base = this.rows[row].y;
    if (c.block === BlockKind.Low) return base + LOW_BLOCK_HEIGHT;
    if (c.block === BlockKind.Wall) return base + WALL_HEIGHT;
    if (c.rise !== 0) {
      const f = Math.min(1, Math.max(0, d / ROW_LENGTH - row));
      return base + c.rise * HEIGHT_UNIT * f;
    }
    return base;
  }

  /** Underside of a cell's slab: anything below this passes underneath it. */
  bottomAt(row: number, lane: number): number {
    const c = this.cell(row, lane);
    return this.rowY(row) - TILE_THICKNESS + Math.min(0, c.rise) * HEIGHT_UNIT;
  }

  /** Underside of the slab under world point (x, d). */
  bottomUnder(x: number, d: number): number {
    const row = Math.floor(d / ROW_LENGTH);
    const lane = Math.round(xToLane(x, this.width));
    return this.bottomAt(row, lane);
  }

  /** Surface height directly under world point (x, d), or null over the void. */
  surfaceAt(x: number, d: number): number | null {
    const row = Math.floor(d / ROW_LENGTH);
    const lane = Math.round(xToLane(x, this.width));
    const lx = xToLane(x, this.width);
    if (Math.abs(lx - lane) > 0.5) return null;
    return this.topAt(row, lane, d);
  }

  /** Cell coordinates under a point; lane may be out of range. */
  cellCoords(x: number, d: number): { row: number; lane: number } {
    return { row: Math.floor(d / ROW_LENGTH), lane: Math.round(xToLane(x, this.width)) };
  }

  obstaclePosition(o: MovingObstacle, time: number): number {
    return o.lane + o.amplitude * Math.sin((time / o.period) * Math.PI * 2 + o.phase);
  }

  /**
   * Restore per-run state for rows >= fromRow. Collected orbs and power-ups are only restored
   * when `resetOrbs` is set (a full restart), so respawning can't be used to farm them.
   */
  resetState(fromRow = 0, resetOrbs = false): void {
    const start = Math.max(0, fromRow) * this.width;
    for (let i = start; i < this.rows.length * this.width; i++) {
      if (this.fragileState[i] !== 0) {
        this.fragileState[i] = 0;
        this.fragileTimer[i] = 0;
        this.onFragileChange?.(Math.floor(i / this.width), i % this.width, 0);
      }
      if (resetOrbs && this.orbTaken[i]) {
        this.orbTaken[i] = 0;
        this.onOrbChange?.(Math.floor(i / this.width), i % this.width, false);
      }
      if (resetOrbs && this.itemTaken[i]) {
        this.itemTaken[i] = 0;
        this.onItemChange?.(Math.floor(i / this.width), i % this.width, false);
      }
    }
  }

  /** Start the collapse timer of a fragile tile the vehicle is touching. */
  touchFragile(row: number, lane: number, delay: number): void {
    const c = this.cell(row, lane);
    if (c.type !== TileType.Fragile) return;
    const i = this.index(row, lane);
    if (this.fragileState[i] === 0) {
      this.fragileState[i] = 1;
      this.fragileTimer[i] = delay;
      this.onFragileChange?.(row, lane, 1);
    }
  }

  /** Advance fragile tile timers. Only rows in [rowFrom, rowTo] are scanned for efficiency. */
  updateFragile(dt: number, rowFrom: number, rowTo: number): void {
    const a = Math.max(0, rowFrom) * this.width;
    const b = Math.min(this.rows.length, rowTo + 1) * this.width;
    for (let i = a; i < b; i++) {
      if (this.fragileState[i] === 1) {
        this.fragileTimer[i] -= dt;
        if (this.fragileTimer[i] <= 0) {
          this.fragileState[i] = 2;
          this.onFragileChange?.(Math.floor(i / this.width), i % this.width, 2);
        }
      }
    }
  }

  takeOrb(row: number, lane: number): boolean {
    const c = this.cell(row, lane);
    if (!c.orb) return false;
    const i = this.index(row, lane);
    if (this.orbTaken[i]) return false;
    this.orbTaken[i] = 1;
    this.onOrbChange?.(row, lane, true);
    return true;
  }

  /** Collect the power-up on a cell. Returns its kind, or ItemKind.None if there is none left. */
  takeItem(row: number, lane: number): ItemKind {
    const c = this.cell(row, lane);
    if (!c.item) return ItemKind.None;
    const i = this.index(row, lane);
    if (this.itemTaken[i]) return ItemKind.None;
    this.itemTaken[i] = 1;
    this.onItemChange?.(row, lane, true);
    return c.item;
  }

  countItems(): number {
    let n = 0;
    for (const r of this.rows) for (const c of r.cells) if (c.item) n++;
    return n;
  }

  countOrbs(): number {
    let n = 0;
    for (const r of this.rows) for (const c of r.cells) if (c.orb) n++;
    return n;
  }
}

/** Height above a cell's surface at which its orb floats. Air orbs (over empty cells) float higher. */
export function orbHeight(track: Track, row: number, lane: number): number {
  const c = track.cell(row, lane);
  const base = track.rowY(row);
  if (c.type === TileType.Empty) return base + 1.3;
  if (c.block === BlockKind.Low) return base + LOW_BLOCK_HEIGHT + 0.7;
  return base + 0.7 + Math.max(0, c.rise) * 0.5;
}

/** Height at which a power-up floats over its cell. */
export function itemHeight(track: Track, row: number, lane: number): number {
  const c = track.cell(row, lane);
  const base = track.rowY(row);
  if (c.type === TileType.Empty) return base + 1.3;
  if (c.block === BlockKind.Low) return base + LOW_BLOCK_HEIGHT + 0.8;
  return base + 0.8 + Math.max(0, c.rise) * 0.5;
}

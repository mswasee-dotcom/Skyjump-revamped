import { Track } from '../core/track';
import type { Row } from '../core/track';
import { parseCell } from './dsl';

/** Deterministic PRNG (mulberry32) so a seed always produces the same course. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ENDLESS_WIDTH = 9;

type Fill = (lane: number, inCorridor: boolean) => string;

/**
 * Procedural track for endless mode. The course is built from a library of patterns, each of which
 * is fair by construction: it starts and ends on plain standard tiles inside a "corridor" of safe
 * lanes, never asks for a jump longer than a cruise-speed jump can cover, and leaves at least two
 * safe lanes wherever it adds hazards or walls. Difficulty ramps up with distance.
 */
export class EndlessGenerator {
  readonly track: Track;
  private rand: () => number;
  /** Corridor centre lane and half-width (in lanes). */
  private c = 4;
  private hw = 2;
  private y = 0;
  private sinceCheckpoint = 0;
  private lastPattern = '';

  constructor(readonly seed: number) {
    this.track = new Track(ENDLESS_WIDTH);
    this.rand = rng(seed);
    this.emit(10, () => '=', 4, 4); // wide, safe start
    this.c = 4;
    this.hw = 2;
    this.checkpoint();
  }

  get difficulty(): number {
    return Math.min(1, this.track.length / 1600);
  }

  /** Generate until the track has at least `rows` rows. */
  ensure(rows: number): void {
    while (this.track.length < rows) this.next();
  }

  private r(n: number): number {
    return Math.floor(this.rand() * n);
  }

  private chance(p: number): boolean {
    return this.rand() < p;
  }

  /** Append `n` rows; `fill` decides each corridor cell, cells outside the corridor are void. */
  private emit(n: number, fill: Fill, c = this.c, hw = this.hw, all = false): void {
    const rows: Row[] = [];
    for (let k = 0; k < n; k++) {
      const cells = [];
      for (let lane = 0; lane < ENDLESS_WIDTH; lane++) {
        const inside = Math.abs(lane - c) <= hw;
        const ch = inside || all ? fill(lane, inside) : ' ';
        cells.push(parseCell(ch));
      }
      rows.push({ y: this.y, cells });
    }
    this.track.appendRows(rows);
    this.sinceCheckpoint += n;
  }

  private straight(n: number): void {
    this.emit(n, () => '=');
  }

  private checkpoint(): void {
    this.straight(3);
    this.emit(2, () => 'C');
    this.sinceCheckpoint = 0;
  }

  private next(): void {
    if (this.sinceCheckpoint > 70) {
      this.checkpoint();
      return;
    }
    const D = this.difficulty;
    const patterns: Array<[string, number, () => void]> = [
      ['straight', 1.2 - D * 0.6, () => this.pStraight()],
      ['shift', 1.5, () => this.pShift()],
      ['width', 0.8, () => this.pWidth()],
      ['gap', 1.6, () => this.pGap()],
      ['accelGap', 0.6 + D * 0.6, () => this.pAccelGap()],
      ['dragGap', 0.4 + D * 0.5, () => this.pDragGap()],
      ['boost', 0.6, () => this.pBoost()],
      ['ice', 0.3 + D * 0.8, () => this.pIce()],
      ['fragile', 0.3 + D * 0.8, () => this.pFragile()],
      ['hazard', 0.3 + D * 1.0, () => this.pHazard()],
      ['walls', 0.3 + D * 0.8, () => this.pWalls()],
      ['blocks', 0.5, () => this.pBlocks()],
      ['launch', 0.3 + D * 0.5, () => this.pLaunch()],
      ['ramp', 0.5, () => this.pRamp()],
      ['mover', 0.2 + D * 0.8, () => this.pMover()],
    ];
    const pool = patterns.filter(([name]) => name !== this.lastPattern);
    const total = pool.reduce((a, p) => a + Math.max(0, p[1]), 0);
    let pick = this.rand() * total;
    for (const [name, w, fn] of pool) {
      pick -= Math.max(0, w);
      if (pick <= 0) {
        this.lastPattern = name;
        fn();
        // Every pattern ends with a short recovery stretch.
        this.straight(3 + Math.round((1 - D) * 3));
        return;
      }
    }
    this.pStraight();
  }

  private pStraight(): void {
    const n = 6 + this.r(8);
    const orbLane = this.c - this.hw + this.r(this.hw * 2 + 1);
    this.emit(n, (lane) => (lane === orbLane && this.chance(0.35) ? 'o' : '='));
  }

  private pShift(): void {
    const dir = this.chance(0.5) ? -1 : 1;
    const steps = 1 + this.r(2);
    for (let i = 0; i < steps; i++) {
      const nc = this.c + dir;
      if (nc - this.hw < 0 || nc + this.hw >= ENDLESS_WIDTH) break;
      // Overlap old and new corridor for a row so the shift is always drivable.
      const lo = Math.min(this.c, nc) - this.hw;
      const hi = Math.max(this.c, nc) + this.hw;
      this.emit(2, () => '=', (lo + hi) / 2, (hi - lo) / 2);
      this.c = nc;
      this.straight(3);
    }
  }

  private pWidth(): void {
    const target = 1 + this.r(3); // 1..3
    const maxHw = Math.min(this.c, ENDLESS_WIDTH - 1 - this.c);
    this.hw = Math.max(1, Math.min(target, maxHw));
    this.straight(6 + this.r(6));
  }

  private pGap(): void {
    const D = this.difficulty;
    this.straight(4);
    const len = 2 + this.r(D > 0.5 ? 3 : 2); // 2..3, later 2..4
    if (len >= 4) this.emit(3, () => '>');
    const orb = this.chance(0.6);
    for (let i = 0; i < len; i++) this.emit(1, (lane) => (orb && lane === this.c && i === Math.floor(len / 2) ? '*' : ' '));
    // Landing may be offset by a lane at higher difficulty.
    if (D > 0.3 && this.chance(0.4)) {
      const nc = Math.max(this.hw, Math.min(ENDLESS_WIDTH - 1 - this.hw, this.c + (this.chance(0.5) ? 1 : -1)));
      this.c = nc;
    }
    this.straight(6);
  }

  private pAccelGap(): void {
    this.straight(3);
    this.emit(6, () => '>');
    const len = 4 + this.r(2); // 4..5
    for (let i = 0; i < len; i++) this.emit(1, (lane) => (lane === this.c && i === 2 ? '*' : ' '));
    this.straight(8);
  }

  private pDragGap(): void {
    this.straight(3);
    this.emit(3, () => '<');
    this.emit(2, () => ' ');
    this.straight(5);
  }

  private pBoost(): void {
    this.straight(3);
    this.emit(1, () => '!');
    this.emit(8, (lane) => (lane === this.c && this.chance(0.2) ? 'o' : '='));
  }

  private pIce(): void {
    this.straight(3);
    const n = 6 + this.r(8);
    this.emit(n, () => '~');
    if (this.hw >= 2 && this.chance(0.5)) {
      // A gentle one-lane drift on ice.
      const nc = this.c + (this.chance(0.5) ? 1 : -1);
      if (nc - this.hw >= 0 && nc + this.hw < ENDLESS_WIDTH) {
        const lo = Math.min(this.c, nc) - this.hw;
        const hi = Math.max(this.c, nc) + this.hw;
        this.emit(4, () => '~', (lo + hi) / 2, (hi - lo) / 2);
        this.c = nc;
        this.emit(6, () => '~');
      }
    }
  }

  private pFragile(): void {
    this.straight(3);
    const segs = 1 + this.r(this.difficulty > 0.4 ? 3 : 2);
    for (let i = 0; i < segs; i++) {
      this.emit(4 + this.r(5), () => '%');
      if (i < segs - 1) this.emit(2, () => ' ');
    }
  }

  private pHazard(): void {
    if (this.hw < 2) {
      this.hw = Math.min(2, this.c, ENDLESS_WIDTH - 1 - this.c);
      if (this.hw < 2) {
        this.c = 4;
        this.hw = 2;
        this.straight(4);
      }
    }
    this.straight(6);
    const lo = this.c - this.hw;
    const hi = this.c + this.hw;
    const kind = this.r(3);
    const n = 5 + this.r(5);
    if (kind === 0) {
      // Plasma in the middle, safe edges.
      this.emit(n, (lane) => (lane > lo && lane < hi ? 'x' : '='));
    } else if (kind === 1) {
      // Plasma on one side, two or more safe lanes on the other.
      const left = this.chance(0.5);
      const cut = left ? lo + Math.max(1, this.hw - 1) : hi - Math.max(1, this.hw - 1);
      this.emit(n, (lane) => ((left ? lane < cut : lane > cut) ? 'x' : '='));
    } else {
      // Stripes of plasma with a safe lane between each.
      this.emit(n, (lane) => ((lane - lo) % 2 === 1 ? 'x' : '='));
    }
  }

  private pWalls(): void {
    if (this.hw < 2) return this.pGap();
    this.straight(5);
    const lo = this.c - this.hw;
    const hi = this.c + this.hw;
    const count = 1 + this.r(this.difficulty > 0.5 ? 3 : 2);
    let side = this.chance(0.5);
    for (let i = 0; i < count; i++) {
      // Block all but two lanes on alternating sides.
      this.emit(2, (lane) => ((side ? lane <= hi - 2 : lane >= lo + 2) ? '#' : '='));
      this.straight(i < count - 1 ? 7 : 3);
      side = !side;
    }
    void lo;
  }

  private pBlocks(): void {
    this.straight(4);
    this.emit(4 + this.r(5), () => 'b');
    if (this.chance(0.4)) {
      this.emit(2, () => ' ');
      this.emit(3 + this.r(3), () => 'b');
    }
  }

  private pLaunch(): void {
    this.straight(4);
    this.emit(1, () => '^');
    for (let i = 0; i < 4; i++) this.emit(1, (lane) => (lane === this.c && i === 2 ? '*' : ' '));
    const savedHw = this.hw;
    this.hw = Math.max(this.hw, Math.min(2, this.c, ENDLESS_WIDTH - 1 - this.c));
    this.straight(12);
    this.hw = savedHw;
  }

  private pRamp(): void {
    this.straight(3);
    if (this.y > 2 || (this.y > -3 && this.chance(0.5))) {
      // Drop down a level over a small gap.
      this.emit(1, () => ' ');
      this.y -= 1 + this.r(2);
      this.straight(6);
    } else {
      this.emit(1, () => '/');
      this.y += 1;
      this.straight(5);
    }
  }

  private pMover(): void {
    const savedC = this.c;
    const savedHw = this.hw;
    this.c = 4;
    this.hw = 3;
    // Bridge from the old corridor to the wide one.
    const lo = Math.min(savedC - savedHw, 1);
    const hi = Math.max(savedC + savedHw, 7);
    this.emit(3, () => '=', (lo + hi) / 2, (hi - lo) / 2);
    this.straight(4);
    const D = this.difficulty;
    this.track.obstacles.push({
      row: this.track.length,
      rows: 2,
      lane: 4,
      amplitude: 2.5,
      period: 2.6 - D * 0.8,
      phase: this.rand() * Math.PI * 2,
      width: 1.5,
      height: 2.2,
    });
    this.straight(10);
    void savedHw;
  }
}

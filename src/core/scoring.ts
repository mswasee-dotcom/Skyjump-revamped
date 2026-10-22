import type { PhysicsEvent } from './physics';

export const POINTS = {
  orb: 100,
  cleanLanding: 50,
  crash: -250,
  completion: 1000,
  flawless: 1000,
  /** Per second spent near top speed. */
  speedPerSecond: 25,
  /** Per second under the silver time. */
  timePerSecond: 60,
  /** Endless: per row travelled. */
  endlessPerRow: 10,
};

export interface ScoreBreakdown {
  label: string;
  points: number;
}

/** Tracks score during a run. Feed it physics events; it keeps a running total and a breakdown. */
export class ScoreKeeper {
  orbs = 0;
  cleanLandings = 0;
  crashes = 0;
  altBonus = 0;
  altRoutes: string[] = [];
  jumps = 0;
  private running = 0;

  /** Score shown on the HUD while racing. */
  get live(): number {
    return Math.max(0, this.running);
  }

  handle(e: PhysicsEvent): number {
    let pts = 0;
    switch (e.type) {
      case 'orb':
        this.orbs++;
        pts = POINTS.orb;
        break;
      case 'land':
        if (e.clean) {
          this.cleanLandings++;
          pts = POINTS.cleanLanding;
        }
        break;
      case 'jump':
        this.jumps++;
        break;
      case 'crash':
        this.crashes++;
        pts = POINTS.crash;
        break;
    }
    this.running += pts;
    return pts;
  }

  addAlt(label: string, bonus: number): void {
    this.altBonus += bonus;
    this.altRoutes.push(label);
    this.running += bonus;
  }

  addDistance(points: number): void {
    this.running += points;
  }

  /** Final campaign score with a breakdown for the results screen. */
  finalize(time: number, highSpeedTime: number, medals: { gold: number; silver: number }): { total: number; breakdown: ScoreBreakdown[] } {
    const breakdown: ScoreBreakdown[] = [
      { label: 'Sector clear', points: POINTS.completion },
      { label: `Time bonus`, points: Math.max(0, Math.round((medals.silver - time) * POINTS.timePerSecond)) },
      { label: `Energy orbs ×${this.orbs}`, points: this.orbs * POINTS.orb },
      { label: `Clean landings ×${this.cleanLandings}`, points: this.cleanLandings * POINTS.cleanLanding },
      { label: 'Speed bonus', points: Math.round(highSpeedTime * POINTS.speedPerSecond) },
    ];
    if (this.altBonus > 0) breakdown.push({ label: `Risky routes ×${this.altRoutes.length}`, points: this.altBonus });
    if (this.crashes === 0) breakdown.push({ label: 'Flawless run', points: POINTS.flawless });
    else breakdown.push({ label: `Crashes ×${this.crashes}`, points: this.crashes * POINTS.crash });
    const total = Math.max(0, breakdown.reduce((a, b) => a + b.points, 0));
    return { total, breakdown };
  }
}

/** 3 gold, 2 silver, 1 bronze. Gold needs both the time and a crash-free run. */
export function medalFor(time: number, crashes: number, medals: { gold: number; silver: number }): number {
  if (time <= medals.gold && crashes === 0) return 3;
  if (time <= medals.silver) return 2;
  return 1;
}

export const MEDAL_NAMES = ['—', 'Bronze', 'Silver', 'Gold'];

export function formatTime(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

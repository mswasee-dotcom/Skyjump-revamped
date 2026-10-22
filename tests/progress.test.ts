import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { applyUnlocks, isEndlessUnlocked, isLevelUnlocked, nextLevel, recordAttempt, recordCompletion } from '../src/core/progress';
import { ScoreKeeper, formatTime, medalFor, POINTS } from '../src/core/scoring';

describe('progression', () => {
  it('unlocks levels in order and endless after sector 1', () => {
    const s = defaultSave();
    expect(isLevelUnlocked(s, 1)).toBe(true);
    expect(isLevelUnlocked(s, 2)).toBe(false);
    expect(isEndlessUnlocked(s)).toBe(false);
    recordCompletion(s, 1, 40, 3000, 1);
    expect(isLevelUnlocked(s, 2)).toBe(true);
    expect(isEndlessUnlocked(s)).toBe(true);
    expect(nextLevel(s)).toBe(2);
  });

  it('keeps the best time, best score and best medal', () => {
    const s = defaultSave();
    const a = recordCompletion(s, 4, 50, 2000, 1);
    expect(a.firstClear && a.newBestTime && a.newBestScore).toBe(true);
    const b = recordCompletion(s, 4, 55, 2500, 2);
    expect(b.newBestTime).toBe(false);
    expect(b.newBestScore).toBe(true);
    expect(s.levels['4']).toMatchObject({ bestTime: 50, bestScore: 2500, medal: 2 });
    recordCompletion(s, 4, 60, 100, 1);
    expect(s.levels['4'].medal).toBe(2);
    expect(s.highScore).toBe(2500);
  });

  it('counts attempts', () => {
    const s = defaultSave();
    recordAttempt(s, 2);
    recordAttempt(s, 2);
    expect(s.levels['2'].attempts).toBe(2);
    expect(s.stats.attempts).toBe(2);
  });

  it('unlocks ships and trail effects when earned, once', () => {
    const s = defaultSave();
    expect(applyUnlocks(s)).toEqual([]);
    for (let i = 1; i <= 3; i++) recordCompletion(s, i, 10, 10, 3);
    expect(applyUnlocks(s)).toEqual(['Ship: WISP', 'Trail: Ion Stream']);
    expect(applyUnlocks(s)).toEqual([]);
    for (let i = 4; i <= 10; i++) recordCompletion(s, i, 10, 10, 3);
    expect(applyUnlocks(s)).toEqual(['Ship: BASTION', 'Trail: Spark Storm', 'Trail: Prism']);
    s.endless.bestDistance = 3200;
    expect(applyUnlocks(s)).toEqual(['Trail: Nova']);
    expect(nextLevel(s)).toBe(10);
  });
});

describe('scoring', () => {
  it('awards medals by time, with gold needing a clean run', () => {
    const m = { gold: 30, silver: 40 };
    expect(medalFor(29, 0, m)).toBe(3);
    expect(medalFor(29, 1, m)).toBe(2);
    expect(medalFor(39, 0, m)).toBe(2);
    expect(medalFor(41, 0, m)).toBe(1);
  });

  it('rewards skill and penalises crashes', () => {
    const k = new ScoreKeeper();
    k.handle({ type: 'orb', row: 1, lane: 1 });
    k.handle({ type: 'land', airTime: 0.6, clean: true, hard: false });
    k.handle({ type: 'land', airTime: 0.6, clean: false, hard: false });
    k.addAlt('SKY', 500);
    expect(k.live).toBe(POINTS.orb + POINTS.cleanLanding + 500);
    const clean = k.finalize(30, 2, { gold: 32, silver: 40 });
    expect(clean.breakdown.map((b) => b.label)).toContain('Flawless run');
    expect(clean.total).toBe(1000 + 600 + 100 + 50 + 50 + 500 + 1000);
    k.handle({ type: 'crash', cause: 'wall' });
    const crashed = k.finalize(30, 2, { gold: 32, silver: 40 });
    expect(crashed.total).toBe(clean.total - 1000 + POINTS.crash);
  });

  it('never reports a negative score', () => {
    const k = new ScoreKeeper();
    for (let i = 0; i < 10; i++) k.handle({ type: 'crash', cause: 'fall' });
    expect(k.live).toBe(0);
    expect(k.finalize(999, 0, { gold: 1, silver: 2 }).total).toBeGreaterThanOrEqual(0);
  });

  it('formats times', () => {
    expect(formatTime(65.432)).toBe('01:05.43');
    expect(formatTime(null)).toBe('--:--.--');
  });
});

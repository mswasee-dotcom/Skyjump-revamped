import type { LevelRecord, SaveData, TrailEffect } from './save';
import { VEHICLES, VEHICLE_ORDER, VehicleId } from './vehicles';

export const TOTAL_LEVELS = 10;

export const EFFECT_INFO: Record<TrailEffect, { name: string; description: string; requirement: string }> = {
  plasma: { name: 'Plasma', description: 'Soft glowing exhaust.', requirement: 'Default' },
  ion: { name: 'Ion Stream', description: 'Long, thin, white-hot trail.', requirement: 'Earn 3 gold medals' },
  spark: { name: 'Spark Storm', description: 'Crackling sparks that scatter wide.', requirement: 'Clear all 10 sectors' },
  prism: { name: 'Prism', description: 'A rainbow that cycles as you fly.', requirement: 'Earn 10 gold medals' },
  nova: { name: 'Nova', description: 'Big, bright, flaring exhaust.', requirement: 'Reach 3,000 m in Endless' },
};

export const EFFECT_ORDER: TrailEffect[] = ['plasma', 'ion', 'spark', 'prism', 'nova'];

export function levelRecord(save: SaveData, id: number): LevelRecord {
  return save.levels[String(id)] ?? { completed: false, bestTime: null, bestScore: 0, medal: 0, attempts: 0 };
}

export function isLevelUnlocked(save: SaveData, id: number): boolean {
  return id <= 1 || levelRecord(save, id - 1).completed;
}

export function isEndlessUnlocked(save: SaveData): boolean {
  return levelRecord(save, 1).completed;
}

export function goldCount(save: SaveData): number {
  return Object.values(save.levels).filter((l) => l.medal >= 3).length;
}

export function completedCount(save: SaveData): number {
  return Object.values(save.levels).filter((l) => l.completed).length;
}

/** The level "Play" should launch: the first unfinished one, or the last level. */
export function nextLevel(save: SaveData): number {
  for (let i = 1; i <= TOTAL_LEVELS; i++) if (!levelRecord(save, i).completed) return i;
  return TOTAL_LEVELS;
}

function effectEarned(save: SaveData, e: TrailEffect): boolean {
  switch (e) {
    case 'plasma':
      return true;
    case 'ion':
      return goldCount(save) >= 3;
    case 'spark':
      return completedCount(save) >= TOTAL_LEVELS;
    case 'prism':
      return goldCount(save) >= TOTAL_LEVELS;
    case 'nova':
      return save.endless.bestDistance >= 3000;
  }
}

export function vehicleRequirement(id: VehicleId): string {
  const u = VEHICLES[id].unlock;
  return u.type === 'default' ? 'Default' : `Clear sector ${u.level}`;
}

/**
 * Grant any vehicles and cosmetic effects the player has newly earned. Mutates the save and
 * returns human-readable names of what was unlocked, for the results screen.
 */
export function applyUnlocks(save: SaveData): string[] {
  const out: string[] = [];
  for (const id of VEHICLE_ORDER) {
    const u = VEHICLES[id].unlock;
    if (save.garage.unlocked.includes(id)) continue;
    if (u.type === 'default' || levelRecord(save, u.level).completed) {
      save.garage.unlocked.push(id);
      out.push(`Ship: ${VEHICLES[id].name}`);
    }
  }
  for (const e of EFFECT_ORDER) {
    if (save.garage.unlockedEffects.includes(e)) continue;
    if (effectEarned(save, e)) {
      save.garage.unlockedEffects.push(e);
      out.push(`Trail: ${EFFECT_INFO[e].name}`);
    }
  }
  return out;
}

export interface LevelOutcome {
  record: LevelRecord;
  newBestTime: boolean;
  newBestScore: boolean;
  firstClear: boolean;
}

/** Fold a finished run into the level's record. */
export function recordCompletion(save: SaveData, id: number, time: number, score: number, medal: number): LevelOutcome {
  const prev = levelRecord(save, id);
  const rec: LevelRecord = { ...prev };
  const firstClear = !prev.completed;
  const newBestTime = prev.bestTime === null || time < prev.bestTime;
  const newBestScore = score > prev.bestScore;
  rec.completed = true;
  if (newBestTime) rec.bestTime = time;
  if (newBestScore) rec.bestScore = score;
  rec.medal = Math.max(prev.medal, medal);
  save.levels[String(id)] = rec;
  save.highScore = Math.max(save.highScore, score);
  return { record: rec, newBestTime, newBestScore, firstClear };
}

export function recordAttempt(save: SaveData, id: number): void {
  const rec = levelRecord(save, id);
  save.levels[String(id)] = { ...rec, attempts: rec.attempts + 1 };
  save.stats.attempts++;
}

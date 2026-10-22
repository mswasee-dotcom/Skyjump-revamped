import { Track } from '../core/track';
import { parseTrack } from './dsl';
import type { ThemeId } from './themes';

export interface LevelDef {
  id: number;
  name: string;
  tagline: string;
  theme: ThemeId;
  /** Lanes across. */
  width: number;
  /** Track layout in the DSL described in dsl.ts. */
  layout: string;
  /** Medal thresholds in seconds. Gold additionally requires a crash-free run. */
  medals: { gold: number; silver: number };
  lives: number;
  /** Music tempo for this sector. */
  bpm: number;
}

export function buildTrack(def: Pick<LevelDef, 'width' | 'layout'>): Track {
  const parsed = parseTrack(def.layout, def.width);
  const track = new Track(def.width);
  track.appendRows(parsed.rows);
  track.hints.push(...parsed.hints);
  track.altZones.push(...parsed.altZones);
  track.obstacles.push(...parsed.obstacles);
  return track;
}

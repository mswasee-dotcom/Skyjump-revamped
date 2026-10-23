import { VEHICLE_ORDER, VehicleId } from './vehicles';

export type Action = 'left' | 'right' | 'accel' | 'brake' | 'jump' | 'nitro' | 'pause' | 'restart';
export const ACTIONS: Action[] = ['left', 'right', 'accel', 'brake', 'jump', 'nitro', 'pause', 'restart'];
export const ACTION_LABELS: Record<Action, string> = {
  left: 'Steer left',
  right: 'Steer right',
  accel: 'Accelerate',
  brake: 'Brake',
  jump: 'Jump',
  nitro: 'Fire nitro',
  pause: 'Pause',
  restart: 'Restart',
};

/** KeyboardEvent.code values. Each action keeps a primary and secondary binding. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  accel: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyJ'],
  nitro: ['KeyE', 'ShiftLeft'],
  pause: ['Escape', 'KeyP'],
  restart: ['KeyR', ''],
};

export type Quality = 'low' | 'medium' | 'high';
export type TrailEffect = 'plasma' | 'ion' | 'spark' | 'prism' | 'nova';
export type LookSetting = 'arcade' | 'neon';
const LOOKS: LookSetting[] = ['arcade', 'neon'];

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  steerSensitivity: number;
  /** 0.5 (loose, cinematic) .. 1.5 (tight) */
  cameraStiffness: number;
  reducedShake: boolean;
  quality: Quality;
  /** Visual style preset (see render/style.ts). */
  look: LookSetting;
  showFps: boolean;
  touchControls: 'auto' | 'on' | 'off';
  keys: Record<Action, string[]>;
}

export interface LevelRecord {
  completed: boolean;
  bestTime: number | null;
  bestScore: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold */
  medal: number;
  attempts: number;
}

export interface Customization {
  body: string;
  accent: string;
  trail: string;
  effect: TrailEffect;
}

export interface SaveData {
  version: number;
  levels: Record<string, LevelRecord>;
  endless: { bestDistance: number; bestScore: number; runs: number };
  stats: {
    attempts: number;
    crashes: number;
    distance: number;
    orbs: number;
    jumps: number;
    playSeconds: number;
  };
  highScore: number;
  garage: {
    selected: VehicleId;
    unlocked: VehicleId[];
    unlockedEffects: TrailEffect[];
    custom: Record<VehicleId, Customization>;
  };
  settings: Settings;
  seenTutorial: boolean;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'neon-roadrunner/save';

export const DEFAULT_CUSTOM: Record<VehicleId, Customization> = {
  comet: { body: '#d9e6ff', accent: '#2de2ff', trail: '#2de2ff', effect: 'plasma' },
  wisp: { body: '#ffffff', accent: '#ff4fd8', trail: '#ff4fd8', effect: 'plasma' },
  bastion: { body: '#3a4256', accent: '#ffd02d', trail: '#ff8a2d', effect: 'plasma' },
};

export const PALETTE = ['#d9e6ff', '#ffffff', '#3a4256', '#1b1f2e', '#2de2ff', '#39ff88', '#ffd02d', '#ff8a2d', '#ff2d6f', '#ff4fd8', '#b57bff', '#5b8cff'];

export function defaultSettings(): Settings {
  return {
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    steerSensitivity: 1,
    cameraStiffness: 1,
    reducedShake: false,
    quality: 'high',
    look: 'arcade',
    showFps: false,
    touchControls: 'auto',
    keys: structuredClone(DEFAULT_KEYS),
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    endless: { bestDistance: 0, bestScore: 0, runs: 0 },
    stats: { attempts: 0, crashes: 0, distance: 0, orbs: 0, jumps: 0, playSeconds: 0 },
    highScore: 0,
    garage: {
      selected: 'comet',
      unlocked: ['comet'],
      unlockedEffects: ['plasma'],
      custom: structuredClone(DEFAULT_CUSTOM),
    },
    settings: defaultSettings(),
    seenTutorial: false,
  };
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const color = (v: unknown, d: string): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const EFFECTS: TrailEffect[] = ['plasma', 'ion', 'spark', 'prism', 'nova'];

/**
 * Validate and repair arbitrary parsed JSON into a well-formed SaveData. Unknown or malformed
 * fields fall back to defaults field-by-field, so one bad value never wipes a player's progress.
 */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  const r = obj(raw);
  const out = defaultSave();
  out.version = SAVE_VERSION;

  for (const [k, v] of Object.entries(obj(r.levels))) {
    if (!/^\d+$/.test(k)) continue;
    const l = obj(v);
    const bt = l.bestTime;
    out.levels[k] = {
      completed: bool(l.completed, false),
      bestTime: typeof bt === 'number' && Number.isFinite(bt) && bt > 0 ? bt : null,
      bestScore: num(l.bestScore, 0, 0),
      medal: Math.round(num(l.medal, 0, 0, 3)),
      attempts: Math.round(num(l.attempts, 0, 0)),
    };
  }
  const e = obj(r.endless);
  out.endless = { bestDistance: num(e.bestDistance, 0, 0), bestScore: num(e.bestScore, 0, 0), runs: num(e.runs, 0, 0) };
  const st = obj(r.stats);
  for (const key of Object.keys(d.stats) as Array<keyof SaveData['stats']>) out.stats[key] = num(st[key], 0, 0);
  out.highScore = num(r.highScore, 0, 0);

  const g = obj(r.garage);
  const unlocked = Array.isArray(g.unlocked) ? (g.unlocked.filter((x) => VEHICLE_ORDER.includes(x as VehicleId)) as VehicleId[]) : [];
  out.garage.unlocked = Array.from(new Set<VehicleId>(['comet', ...unlocked]));
  out.garage.selected = VEHICLE_ORDER.includes(g.selected as VehicleId) && out.garage.unlocked.includes(g.selected as VehicleId) ? (g.selected as VehicleId) : 'comet';
  const fx = Array.isArray(g.unlockedEffects) ? (g.unlockedEffects.filter((x) => EFFECTS.includes(x as TrailEffect)) as TrailEffect[]) : [];
  out.garage.unlockedEffects = Array.from(new Set<TrailEffect>(['plasma', ...fx]));
  const custom = obj(g.custom);
  for (const id of VEHICLE_ORDER) {
    const c = obj(custom[id]);
    const def = DEFAULT_CUSTOM[id];
    const effect = EFFECTS.includes(c.effect as TrailEffect) && out.garage.unlockedEffects.includes(c.effect as TrailEffect) ? (c.effect as TrailEffect) : 'plasma';
    out.garage.custom[id] = { body: color(c.body, def.body), accent: color(c.accent, def.accent), trail: color(c.trail, def.trail), effect };
  }

  const s = obj(r.settings);
  const ds = d.settings;
  out.settings = {
    musicVolume: num(s.musicVolume, ds.musicVolume, 0, 1),
    sfxVolume: num(s.sfxVolume, ds.sfxVolume, 0, 1),
    muted: bool(s.muted, ds.muted),
    steerSensitivity: num(s.steerSensitivity, ds.steerSensitivity, 0.6, 1.4),
    cameraStiffness: num(s.cameraStiffness, ds.cameraStiffness, 0.5, 1.5),
    reducedShake: bool(s.reducedShake, ds.reducedShake),
    quality: (['low', 'medium', 'high'] as Quality[]).includes(s.quality as Quality) ? (s.quality as Quality) : ds.quality,
    look: LOOKS.includes(s.look as LookSetting) ? (s.look as LookSetting) : ds.look,
    showFps: bool(s.showFps, ds.showFps),
    touchControls: (['auto', 'on', 'off'] as const).includes(s.touchControls as 'auto') ? (s.touchControls as Settings['touchControls']) : 'auto',
    keys: structuredClone(DEFAULT_KEYS),
  };
  const keys = obj(s.keys);
  for (const a of Object.keys(DEFAULT_KEYS) as Action[]) {
    const k = keys[a];
    if (Array.isArray(k) && k.every((x) => typeof x === 'string')) out.settings.keys[a] = [String(k[0] ?? ''), String(k[1] ?? '')];
  }
  out.seenTutorial = bool(r.seenTutorial, false);
  return out;
}

/** Upgrade older save layouts. Version 0 had no version field; nothing else to migrate yet. */
export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = typeof raw.version === 'number' ? raw.version : 0;
  if (v > SAVE_VERSION) return raw; // From a newer build: sanitize keeps what it understands.
  return raw;
}

/** JSON with sorted keys, so structurally equal objects compare equal. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface LoadResult {
  data: SaveData;
  status: 'new' | 'ok' | 'repaired' | 'corrupt';
}

export function loadSave(store: KV | null): LoadResult {
  if (!store) return { data: defaultSave(), status: 'new' };
  let text: string | null = null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return { data: defaultSave(), status: 'new' };
  }
  if (!text) return { data: defaultSave(), status: 'new' };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    const migrated = migrate(parsed);
    const data = sanitize(migrated);
    const status = stable(data) === stable(migrated) ? 'ok' : 'repaired';
    return { data, status };
  } catch {
    try {
      store.setItem(SAVE_KEY + '.corrupt', text);
    } catch {
      /* ignore */
    }
    return { data: defaultSave(), status: 'corrupt' };
  }
}

export function writeSave(store: KV | null, data: SaveData): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Display name for a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Enter: 'Enter', Tab: 'Tab',
  };
  return map[code] ?? code;
}

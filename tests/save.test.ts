import { describe, expect, it } from 'vitest';
import { KV, SAVE_KEY, defaultSave, loadSave, sanitize, writeSave } from '../src/core/save';

class Mem implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('save data', () => {
  it('starts fresh when nothing is stored', () => {
    const r = loadSave(new Mem());
    expect(r.status).toBe('new');
    expect(r.data.garage.selected).toBe('comet');
  });

  it('round-trips progress and settings', () => {
    const store = new Mem();
    const d = defaultSave();
    d.levels['3'] = { completed: true, bestTime: 41.5, bestScore: 9000, medal: 2, attempts: 7 };
    d.settings.musicVolume = 0.2;
    d.settings.keys.jump = ['KeyK', ''];
    d.garage.unlocked.push('wisp');
    d.garage.selected = 'wisp';
    expect(writeSave(store, d)).toBe(true);
    const r = loadSave(store);
    expect(r.status).toBe('ok');
    expect(r.data).toEqual(d);
  });

  it('recovers from corrupted JSON and keeps a backup of the bad data', () => {
    const store = new Mem();
    store.setItem(SAVE_KEY, '{"levels": {"1": ');
    const r = loadSave(store);
    expect(r.status).toBe('corrupt');
    expect(r.data).toEqual(defaultSave());
    expect(store.getItem(SAVE_KEY + '.corrupt')).toContain('levels');
  });

  it('repairs malformed fields without losing the good ones', () => {
    const store = new Mem();
    store.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        levels: { '1': { completed: true, bestTime: 30, bestScore: 'lots', medal: 9 }, nope: {} },
        settings: { musicVolume: 7, quality: 'ultra', keys: { jump: 'Space' } },
        garage: { selected: 'bastion', unlocked: ['comet', 'ufo'], custom: { comet: { body: 'red', accent: '#00ff00' } } },
        stats: { crashes: -4, jumps: 12 },
      }),
    );
    const r = loadSave(store);
    expect(r.status).toBe('repaired');
    expect(r.data.levels['1']).toEqual({ completed: true, bestTime: 30, bestScore: 0, medal: 3, attempts: 0 });
    expect(r.data.levels.nope).toBeUndefined();
    expect(r.data.settings.musicVolume).toBe(1);
    expect(r.data.settings.quality).toBe('high');
    expect(r.data.settings.keys.jump).toEqual(['Space', 'KeyJ']);
    // bastion isn't unlocked, so selection falls back
    expect(r.data.garage.selected).toBe('comet');
    expect(r.data.garage.unlocked).toEqual(['comet']);
    expect(r.data.garage.custom.comet.accent).toBe('#00ff00');
    expect(r.data.garage.custom.comet.body).toBe(defaultSave().garage.custom.comet.body);
    expect(r.data.stats.crashes).toBe(0);
    expect(r.data.stats.jumps).toBe(12);
  });

  it('treats old saves without a version as upgradable', () => {
    const store = new Mem();
    store.setItem(SAVE_KEY, JSON.stringify({ levels: { '2': { completed: true, bestTime: 12, bestScore: 5, medal: 1, attempts: 1 } } }));
    const r = loadSave(store);
    expect(r.status).toBe('repaired');
    expect(r.data.levels['2'].completed).toBe(true);
    expect(r.data.version).toBe(1);
  });

  it('survives unavailable or throwing storage', () => {
    expect(loadSave(null).status).toBe('new');
    const broken: KV = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(loadSave(broken).status).toBe('new');
    expect(writeSave(broken, defaultSave())).toBe(false);
  });

  it('sanitize is idempotent', () => {
    const d = defaultSave();
    expect(sanitize(sanitize(d))).toEqual(sanitize(d));
  });
});

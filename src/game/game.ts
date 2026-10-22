import { CAMPAIGN } from '../levels/campaign';
import type { LevelDef } from '../levels/types';
import { AudioEngine } from '../audio/audio';
import { Renderer } from '../render/renderer';
import { Input } from './input';
import { Session, RunResult } from './session';
import { Showcase } from './showcase';
import { UI } from '../ui/ui';
import { Customization, KV, SaveData, Settings, defaultSave, loadSave, writeSave } from '../core/save';
import { applyUnlocks, isEndlessUnlocked, isLevelUnlocked, nextLevel, recordAttempt, recordCompletion } from '../core/progress';
import type { VehicleId } from '../core/vehicles';
import { DEFAULT_TUNING } from '../core/physics';

type Mode = 'title' | 'menu' | 'playing' | 'paused' | 'results' | 'gameover';

function storage(): KV | null {
  try {
    const k = '__nr_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Top-level game controller: owns the render loop, switches between the menu showcase and
 * race sessions, persists progress, and routes UI actions.
 */
export class Game {
  private renderer: Renderer;
  private audio = new AudioEngine();
  private input: Input;
  private ui: UI;
  private store = storage();
  private save: SaveData;
  private session: Session | null = null;
  private showcase: Showcase | null = null;
  private mode: Mode = 'title';
  private level: LevelDef | null = null;
  private endlessSeed = 1;
  private lastFrame = 0;
  private fps = 60;
  private sessionCommitted = true;
  private saveTimer = 0;

  constructor(host: HTMLElement, uiRoot: HTMLElement) {
    const loaded = loadSave(this.store);
    this.save = loaded.data;
    this.renderer = new Renderer(host, this.save.settings.quality);
    this.appliedQuality = this.save.settings.quality;
    this.input = new Input(this.save.settings.keys);
    this.applyAudioSettings();
    this.ui = new UI(uiRoot, this.uiActions(), () => this.save);
    this.input.onAnyPress = () => this.audio.unlock();
    this.input.onKeyDown = (e) => this.menuKey(e);
    uiRoot.addEventListener('pointerdown', () => this.audio.unlock());

    this.showcase = new Showcase(this.renderer, this.save.garage.selected, this.save.garage.custom[this.save.garage.selected], 'dawn', this.save.settings.quality);
    this.ui.showTitle();
    if (loaded.status === 'corrupt') window.setTimeout(() => this.ui.toast('SAVE DATA WAS DAMAGED — STARTED FRESH', 'bad'), 400);
    if (!this.store) window.setTimeout(() => this.ui.toast('STORAGE UNAVAILABLE — PROGRESS WON’T BE SAVED', 'bad'), 400);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'playing') this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
      this.lastFrame = performance.now();
    });
    window.addEventListener('beforeunload', () => this.persist());
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- loop
  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.input.pollGamepads();
    this.handleMenuPad();

    if (this.mode === 'playing' && this.session) {
      if (this.input.consume('pause')) {
        this.pause();
      } else if (this.input.consume('restart')) {
        this.restart();
        return;
      } else {
        if (this.input.consume('jump')) this.session.queueJump();
        this.session.frame(dt, this.input.drive());
        this.ui.updateHud(this.session.hud(), this.fps);
        this.save.stats.playSeconds += dt;
      }
    } else if (this.mode === 'paused') {
      this.input.clearPresses();
    } else if ((this.mode === 'results' || this.mode === 'gameover') && this.session) {
      this.session.frame(dt, { steer: 0, throttle: 0, jumpPressed: false });
      if (this.input.consume('restart')) {
        this.restart();
        return;
      }
      this.input.clearPresses();
    } else {
      this.showcase?.frame(dt);
      this.input.clearPresses();
    }
    this.renderer.render();
  };

  private handleMenuPad(): void {
    const ev = this.input.menuEvents;
    if (!ev.length) return;
    if (this.mode === 'playing') {
      ev.length = 0;
      return;
    }
    for (const e of ev) {
      if (this.mode === 'title') {
        this.start();
        break;
      }
      if (e === 'up') this.ui.navigate(-1);
      else if (e === 'down') this.ui.navigate(1);
      else if (e === 'back') this.ui.goBack();
      else if (e === 'confirm') (document.activeElement as HTMLElement | null)?.click();
    }
    ev.length = 0;
    this.input.clearPresses();
  }

  private menuKey(e: KeyboardEvent): boolean {
    if (this.mode === 'title') {
      e.preventDefault();
      this.start();
      return true;
    }
    if (this.mode === 'playing') return false;
    const focusIsRange = (document.activeElement as HTMLInputElement | null)?.type === 'range';
    const isPauseKey = e.code === 'Escape' || this.save.settings.keys.pause.includes(e.code);
    if (isPauseKey) {
      e.preventDefault();
      if (e.repeat) return true;
      if (this.mode === 'paused') {
        if (!this.ui.goBack()) this.resume();
      } else if (e.code === 'Escape') this.ui.goBack();
      return true;
    }
    if (e.code === 'ArrowDown' || (e.code === 'ArrowRight' && !focusIsRange)) {
      e.preventDefault();
      this.ui.navigate(1);
      return true;
    }
    if (e.code === 'ArrowUp' || (e.code === 'ArrowLeft' && !focusIsRange)) {
      e.preventDefault();
      this.ui.navigate(-1);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- flow
  private start(): void {
    if (this.mode !== 'title') return;
    this.audio.unlock();
    this.audio.setMusic('menu', 96, 1);
    this.mode = 'menu';
    this.save.seenTutorial = true;
    this.persist();
    this.ui.showMainMenu();
  }

  private beginSession(): void {
    this.commitSessionStats();
    this.session?.dispose();
    this.session = null;
    this.showcase?.dispose();
    this.showcase = null;
    const v = this.save.garage.selected;
    if (this.level) recordAttempt(this.save, this.level.id);
    else this.save.stats.attempts++;
    this.session = new Session(
      {
        level: this.level,
        endlessSeed: this.endlessSeed,
        vehicle: v,
        custom: this.save.garage.custom[v],
        tuning: { ...DEFAULT_TUNING, steerSensitivity: this.save.settings.steerSensitivity },
        reducedShake: this.save.settings.reducedShake,
        cameraStiffness: this.save.settings.cameraStiffness,
        quality: this.save.settings.quality,
      },
      this.renderer,
      this.audio,
      {
        hint: (t) => this.ui.hint(t),
        toast: (t, k) => this.ui.toast(t, k),
        countdown: (n) => this.ui.countdown(n),
        finished: (r) => this.onFinished(r),
        gameOver: (r) => this.onGameOver(r),
      },
    );
    this.sessionCommitted = false;
    this.ui.showHud(this.touchEnabled(), this.save.settings.showFps);
    this.audio.setMusic('race', this.level?.bpm ?? 130, this.level ? this.level.id : 3);
    this.mode = 'playing';
    this.input.clearPresses();
    this.lastFrame = performance.now();
    this.persist();
  }

  private touchEnabled(): boolean {
    const t = this.save.settings.touchControls;
    if (t !== 'auto') return t === 'on';
    return (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && window.matchMedia('(pointer: coarse)').matches;
  }

  startLevel(id: number): void {
    if (!isLevelUnlocked(this.save, id) || id < 1 || id > CAMPAIGN.length) return;
    this.level = CAMPAIGN[id - 1];
    this.beginSession();
  }

  startEndless(): void {
    if (!isEndlessUnlocked(this.save)) return;
    this.level = null;
    this.endlessSeed = (Math.random() * 1e9) | 0;
    this.beginSession();
  }

  restart(): void {
    if (!this.session) return;
    if (!this.level) this.endlessSeed = (Math.random() * 1e9) | 0;
    this.beginSession();
  }

  pause(): void {
    if (this.mode !== 'playing' || !this.session) return;
    this.mode = 'paused';
    this.session.pauseAudio();
    this.ui.showPause();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.ui.hideOverlay();
    this.input.clearPresses();
    this.lastFrame = performance.now();
  }

  quitToMenu(): void {
    this.commitSessionStats();
    this.session?.dispose();
    this.session = null;
    this.ui.hideHud();
    this.ui.clearScreens();
    const v = this.save.garage.selected;
    this.showcase?.dispose();
    this.showcase = new Showcase(this.renderer, v, this.save.garage.custom[v], CAMPAIGN[nextLevel(this.save) - 1].theme, this.save.settings.quality);
    this.mode = 'menu';
    this.audio.setMusic('menu', 96, 1);
    this.persist();
    this.ui.showMainMenu();
  }

  private commitSessionStats(): void {
    if (this.sessionCommitted || !this.session) return;
    const st = this.session.sessionStats();
    this.save.stats.crashes += st.crashes;
    this.save.stats.jumps += st.jumps;
    this.save.stats.distance += st.distance;
    this.save.stats.orbs += st.orbs;
    this.sessionCommitted = true;
  }

  private onFinished(r: RunResult): void {
    if (!this.level) return;
    this.mode = 'results';
    this.commitSessionStats();
    const outcome = recordCompletion(this.save, this.level.id, r.time, r.score, r.medal);
    const unlocks = applyUnlocks(this.save);
    this.persist();
    this.ui.showResults(r, this.level, outcome, unlocks, this.level.id < CAMPAIGN.length);
  }

  private onGameOver(r: RunResult): void {
    this.mode = 'gameover';
    this.commitSessionStats();
    let best = false;
    if (r.endless) {
      this.save.endless.runs++;
      if (r.distance > this.save.endless.bestDistance) {
        this.save.endless.bestDistance = r.distance;
        best = true;
      }
      this.save.endless.bestScore = Math.max(this.save.endless.bestScore, r.score);
      this.save.highScore = Math.max(this.save.highScore, r.score);
      for (const u of applyUnlocks(this.save)) this.ui.toast(`UNLOCKED ${u.toUpperCase()}`, 'good');
    }
    this.persist();
    this.ui.showGameOver(r, this.level, best);
  }

  // ---------------------------------------------------------------- settings / save
  private applyAudioSettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
  }

  private persist(): void {
    writeSave(this.store, this.save);
  }

  private persistSoon(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 250);
  }

  private uiActions() {
    return {
      start: () => this.start(),
      play: () => this.startLevel(nextLevel(this.save)),
      startLevel: (id: number) => this.startLevel(id),
      startEndless: () => this.startEndless(),
      setShowcase: (mode: 'menu' | 'garage') => {
        if (this.showcase) this.showcase.mode = mode;
        if (mode === 'menu' && this.showcase) {
          const v = this.save.garage.selected;
          this.showcase.setShip(v, this.save.garage.custom[v]);
        }
      },
      previewShip: (id: VehicleId, c: Customization) => this.showcase?.setShip(id, c),
      selectVehicle: (id: VehicleId) => {
        if (!this.save.garage.unlocked.includes(id)) return;
        this.save.garage.selected = id;
        this.persist();
      },
      setCustom: (id: VehicleId, c: Customization) => {
        if (!this.save.garage.unlockedEffects.includes(c.effect)) c.effect = 'plasma';
        this.save.garage.custom[id] = c;
        this.persistSoon();
      },
      settingsChanged: (s: Settings) => {
        this.save.settings = s;
        this.applyAudioSettings();
        this.input.setKeys(s.keys);
        if (s.quality !== this.appliedQuality) {
          this.appliedQuality = s.quality;
          this.renderer.applyQuality(s.quality);
        }
        this.ui.setFpsVisible(s.showFps);
        this.persistSoon();
      },
      resetProgress: () => {
        const settings = this.save.settings;
        this.save = defaultSave();
        this.save.settings = settings;
        this.save.seenTutorial = true;
        this.persist();
        this.showcase?.setShip('comet', this.save.garage.custom.comet);
      },
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.restart(),
      quitToMenu: () => this.quitToMenu(),
      toggleFullscreen: () => {
        const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
        const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
        if (document.fullscreenElement || d.webkitFullscreenElement) (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
        else (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => this.ui.toast('FULLSCREEN NOT AVAILABLE', 'bad'));
      },
      captureKey: (cb: (code: string) => void) => this.input.captureNext(cb),
      sound: (k: 'click' | 'hover') => (k === 'click' ? this.audio.click() : this.audio.hover()),
      touch: (a: Parameters<Input['setTouch']>[0], down: boolean) => this.input.setTouch(a, down),
      unlockAudio: () => this.audio.unlock(),
    };
  }

  private appliedQuality = '';

  /** Exposed for automated browser tests. */
  debug() {
    return {
      mode: this.mode,
      session: this.session,
      save: this.save,
      startLevel: (id: number) => {
        this.mode = this.mode === 'title' ? 'menu' : this.mode;
        this.startLevel(id);
      },
      /** Step the simulation synchronously (no rendering) — lets slow software-GL test browsers cover real time. */
      advance: (seconds: number, steer = 0, throttle = 0, jumpEvery = 0) => {
        let t = 0;
        let nextJump = jumpEvery;
        while (t < seconds && this.session && (this.mode === 'playing' || this.mode === 'results' || this.mode === 'gameover')) {
          if (jumpEvery && t >= nextJump) {
            this.session.queueJump();
            nextJump += jumpEvery;
          }
          this.session.frame(1 / 60, { steer, throttle, jumpPressed: false });
          t += 1 / 60;
        }
        if (this.session) this.ui.updateHud(this.session.hud(), this.fps);
        return t;
      },
      unlockAll: () => {
        for (const l of CAMPAIGN) this.save.levels[String(l.id)] = { completed: true, bestTime: null, bestScore: 0, medal: 0, attempts: 0 };
        applyUnlocks(this.save);
      },
    };
  }
}

import * as THREE from 'three';
import { BOOST_DURATION, MAX_FRAME_TIME, PHYSICS_DT, ROW_LENGTH } from '../core/constants';
import { DriveInput, PhysicsEvent, VehicleState, spawnState, stepVehicle, DEFAULT_TUNING, PhysicsTuning } from '../core/physics';
import { ScoreKeeper, POINTS, medalFor } from '../core/scoring';
import { TileType } from '../core/tiles';
import { Track, laneToX, xToLane } from '../core/track';
import { VEHICLES, VehicleId } from '../core/vehicles';
import type { Customization, TrailEffect } from '../core/save';
import type { LevelDef } from '../levels/types';
import { buildTrack } from '../levels/types';
import { EndlessGenerator } from '../levels/endless';
import { THEMES, Theme } from '../levels/themes';
import { TrackView } from '../render/trackView';
import { Environment } from '../render/environment';
import { buildShip, ShipModel } from '../render/ships';
import { Particles } from '../render/particles';
import { CameraRig } from '../render/cameraRig';
import type { Renderer } from '../render/renderer';
import type { AudioEngine } from '../audio/audio';

export type Phase = 'countdown' | 'racing' | 'dead' | 'respawn' | 'finished' | 'gameover';

export interface HudState {
  title: string;
  lives: number;
  maxLives: number;
  time: number;
  score: number;
  speed: number;
  speed01: number;
  progress: number;
  distance: number;
  effects: string[];
  endless: boolean;
  orbs: number;
}

export interface RunResult {
  levelId: number;
  time: number;
  crashes: number;
  orbs: number;
  totalOrbs: number;
  score: number;
  breakdown: Array<{ label: string; points: number }>;
  medal: number;
  distance: number;
  endless: boolean;
  jumps: number;
}

export interface SessionCallbacks {
  hint(text: string): void;
  toast(text: string, kind?: 'good' | 'bad' | 'info'): void;
  countdown(n: number): void;
  finished(r: RunResult): void;
  gameOver(r: RunResult): void;
}

export interface SessionConfig {
  level: LevelDef | null;
  endlessSeed?: number;
  vehicle: VehicleId;
  custom: Customization;
  tuning: PhysicsTuning;
  reducedShake: boolean;
  cameraStiffness: number;
  quality: 'low' | 'medium' | 'high';
}

const TRAIL_STYLE: Record<TrailEffect, { size: number; life: number; spread: number; rate: number; white: number }> = {
  plasma: { size: 0.34, life: 0.35, spread: 0.25, rate: 1, white: 0.25 },
  ion: { size: 0.22, life: 0.7, spread: 0.05, rate: 1.4, white: 0.55 },
  spark: { size: 0.2, life: 0.45, spread: 1.6, rate: 1.6, white: 0.6 },
  prism: { size: 0.32, life: 0.5, spread: 0.3, rate: 1.2, white: 0.1 },
  nova: { size: 0.5, life: 0.45, spread: 0.45, rate: 1.1, white: 0.4 },
};

/** One attempt at a level (or an endless run): owns its scene objects and simulation state. */
export class Session {
  readonly track: Track;
  readonly theme: Theme;
  readonly endless: EndlessGenerator | null;
  private view: TrackView;
  private env: Environment;
  private ship: ShipModel;
  private particles: Particles;
  private rig: CameraRig;
  private shockMat: THREE.MeshBasicMaterial;
  private shock: THREE.Mesh;
  private shockT = -1;

  state: VehicleState;
  private prev = { x: 0, y: 0, d: 0 };
  phase: Phase = 'countdown';
  private phaseTime = 0;
  private acc = 0;
  /** Simulation clock (drives moving obstacles). */
  time = 0;
  /** Race clock shown to the player. */
  raceTime = 0;
  lives: number;
  readonly maxLives: number;
  score = new ScoreKeeper();
  private events: PhysicsEvent[] = [];
  private hintsShown = new Set<number>();
  private altState = new Map<number, 'in' | 'done' | 'out'>();
  private lastCountdown = 4;
  private distanceRows = 0;
  private rowPointsAwarded = 0;
  private totalOrbs: number;
  private jumpQueued = false;
  private trailHue = 0;
  private emitAcc = 0;
  private finishedResult: RunResult | null = null;
  private stats = { crashes: 0, jumps: 0, distance: 0 };

  constructor(
    private cfg: SessionConfig,
    private renderer: Renderer,
    private audio: AudioEngine,
    private cb: SessionCallbacks,
  ) {
    if (cfg.level) {
      this.track = buildTrack(cfg.level);
      this.endless = null;
      this.theme = THEMES[cfg.level.theme];
      this.maxLives = cfg.level.lives;
    } else {
      this.endless = new EndlessGenerator(cfg.endlessSeed ?? 1);
      this.endless.ensure(240);
      this.track = this.endless.track;
      this.theme = THEMES.endless;
      this.maxLives = 3;
    }
    this.lives = this.maxLives;
    this.totalOrbs = this.track.countOrbs();

    const scene = renderer.scene;
    scene.fog = new THREE.Fog(this.theme.fog, this.theme.fogNear, this.theme.fogFar);
    this.env = new Environment(this.theme, cfg.quality);
    scene.add(this.env.group);
    this.view = new TrackView(this.track, this.theme.neon);
    scene.add(this.view.group);
    this.ship = buildShip(cfg.vehicle, cfg.custom);
    scene.add(this.ship.group);
    this.particles = new Particles(cfg.quality === 'low' ? 1500 : 3500);
    scene.add(this.particles.points);
    this.particles.setViewportHeight(renderer.renderer.domElement.height);
    renderer.onResize = (_w, h) => this.particles.setViewportHeight(h);
    this.view.onCrumble = (p) => {
      this.particles.emit({ x: p.x, y: p.y, z: p.z, spread: 1.2, vy: -2, count: 14, color: '#b77bff', color2: '#ffffff', size: 0.35, life: 0.8, gravity: 12 });
      this.audio.crumble();
    };

    this.shockMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), this.shockMat);
    this.shock.rotation.x = -Math.PI / 2;
    scene.add(this.shock);

    this.rig = new CameraRig(renderer.camera, () => renderer.baseFov);
    this.rig.stiffness = cfg.cameraStiffness;
    this.rig.shakeScale = cfg.reducedShake ? 0.25 : 1;

    this.state = spawnState(this.track, 0, this.stats_());
    this.copyPrev();
    this.rig.snap(this.camTarget(1));
    this.view.update(this.state.d, 0);
    this.applyShipTransform(1, 0);
  }

  private stats_() {
    return VEHICLES[this.cfg.vehicle];
  }

  get vehicle() {
    return VEHICLES[this.cfg.vehicle];
  }

  /** Debug/testing: place the ship on a row as if respawning there. */
  teleport(row: number): void {
    this.state = spawnState(this.track, row, this.vehicle);
    this.copyPrev();
    this.rig.snap(this.camTarget(1));
  }

  /** Called by the game when the jump button is pressed; applied on the next physics step. */
  queueJump(): void {
    if (this.phase === 'racing') this.jumpQueued = true;
  }

  private copyPrev(): void {
    this.prev.x = this.state.x;
    this.prev.y = this.state.y;
    this.prev.d = this.state.d;
  }

  /** Advance simulation and visuals by one rendered frame. */
  frame(rawDt: number, input: DriveInput): void {
    const dt = Math.min(MAX_FRAME_TIME, rawDt);
    this.phaseTime += dt;

    switch (this.phase) {
      case 'countdown':
      case 'respawn': {
        const total = this.phase === 'countdown' ? 3 : 1.2;
        const left = total - this.phaseTime;
        const n = Math.ceil(left);
        if (this.phase === 'countdown' && n < this.lastCountdown && n >= 1) {
          this.lastCountdown = n;
          this.cb.countdown(n);
          this.audio.countdown(false);
        }
        if (left <= 0) {
          if (this.phase === 'countdown') {
            this.cb.countdown(0);
            this.audio.countdown(true);
          }
          this.setPhase('racing');
          this.audio.startEngine();
        }
        this.time += dt; // keep obstacles moving
        break;
      }
      case 'racing':
      case 'dead':
      case 'finished': {
        this.acc += dt;
        while (this.acc >= PHYSICS_DT) {
          this.acc -= PHYSICS_DT;
          this.copyPrev();
          this.physicsStep(input);
        }
        if (this.phase === 'racing' || this.phase === 'dead') this.raceTime += dt;
        if (this.phase === 'dead' && this.phaseTime > 1.5) this.afterDeath();
        if (this.phase === 'finished' && this.phaseTime > 1.6 && this.finishedResult) {
          const r = this.finishedResult;
          this.finishedResult = null;
          this.cb.finished(r);
        }
        break;
      }
      case 'gameover':
        this.time += dt;
        break;
    }

    const alpha = this.phase === 'racing' || this.phase === 'dead' || this.phase === 'finished' ? this.acc / PHYSICS_DT : 1;
    this.applyShipTransform(alpha, dt);
    this.updateVisuals(dt, alpha);
  }

  private physicsStep(input: DriveInput): void {
    const s = this.state;
    if (this.phase === 'finished') {
      // Cruise through the finish gate on autopilot.
      s.d += s.speed * PHYSICS_DT;
      s.speed = Math.max(10, s.speed - 6 * PHYSICS_DT);
      s.vx *= 0.95;
      s.x += s.vx * PHYSICS_DT;
      this.time += PHYSICS_DT;
      return;
    }
    if (this.phase !== 'racing') {
      this.time += PHYSICS_DT;
      if (this.phase === 'dead' && !s.alive && s.lost) {
        // Keep falling for the camera.
        s.vy -= 30 * PHYSICS_DT;
        s.y += s.vy * PHYSICS_DT;
        s.d += s.speed * 0.6 * PHYSICS_DT;
      }
      return;
    }
    const inp: DriveInput = { steer: input.steer, throttle: input.throttle, jumpPressed: this.jumpQueued };
    this.jumpQueued = false;
    this.events.length = 0;
    stepVehicle(s, inp, this.vehicle, this.track, this.time, PHYSICS_DT, this.events, this.cfg.tuning ?? DEFAULT_TUNING);
    this.time += PHYSICS_DT;
    const row = Math.floor(s.d / ROW_LENGTH);
    this.track.updateFragile(PHYSICS_DT, row - 4, row + 4);
    for (const e of this.events) this.handleEvent(e);

    if (s.alive) {
      this.checkAltZones(row);
      for (const h of this.track.hints) {
        if (!this.hintsShown.has(h.row) && row >= h.row - 3) {
          this.hintsShown.add(h.row);
          this.cb.hint(h.text);
        }
      }
      if (row > this.distanceRows) {
        this.stats.distance += (row - this.distanceRows) * ROW_LENGTH;
        this.distanceRows = row;
      }
      if (this.endless) {
        this.endless.ensure(row + 200);
        const pts = Math.floor(row / 1) * POINTS.endlessPerRow;
        if (pts > this.rowPointsAwarded) {
          this.score.addDistance(pts - this.rowPointsAwarded);
          this.rowPointsAwarded = pts;
        }
      }
    }
  }

  private handleEvent(e: PhysicsEvent): void {
    const s = this.state;
    const pos = new THREE.Vector3(s.x, s.y, -s.d);
    const custom = this.cfg.custom;
    this.score.handle(e);
    switch (e.type) {
      case 'jump':
        this.stats.jumps++;
        if (e.launchPad) {
          this.audio.launch();
          this.particles.emit({ x: pos.x, y: pos.y + 0.1, z: pos.z, ring: 4, spread: 0.6, count: 26, color: '#ffe14a', color2: '#ffffff', size: 0.4, life: 0.5 });
          this.rig.addShake(0.2);
        } else {
          this.audio.jump();
          this.particles.emit({ x: pos.x, y: pos.y + 0.05, z: pos.z, ring: 2.5, count: 12, color: custom.trail, size: 0.3, life: 0.35 });
        }
        break;
      case 'land': {
        const v = Math.min(1, e.airTime / 0.9);
        this.audio.land(v);
        this.particles.emit({ x: pos.x, y: pos.y + 0.05, z: pos.z, ring: 3 + v * 3, spread: 0.3, count: 10 + Math.round(v * 18), color: custom.accent, color2: '#ffffff', size: 0.3, life: 0.4, drag: 3 });
        if (e.hard) this.rig.addShake(0.25);
        if (e.clean) this.cb.toast(`CLEAN LANDING +${POINTS.cleanLanding}`, 'good');
        break;
      }
      case 'boost':
        this.audio.boost();
        this.rig.addShake(0.12);
        this.particles.emit({ x: pos.x, y: pos.y + 0.2, z: pos.z, vz: 6, spread: 2, count: 30, color: '#ffffff', color2: custom.trail, size: 0.35, life: 0.45 });
        break;
      case 'scrape':
        this.audio.scrape();
        this.particles.emit({ x: pos.x, y: pos.y + 0.2, z: pos.z - 0.5, spread: 3, vy: 2, count: 14, color: '#ffd02d', color2: '#ffffff', size: 0.16, life: 0.35, gravity: 10 });
        this.rig.addShake(0.1);
        break;
      case 'orb':
        this.audio.orb();
        this.particles.emit({ x: laneToX(e.lane, this.track.width), y: pos.y + 0.8, z: -(e.row + 0.5) * ROW_LENGTH, spread: 2.5, count: 18, color: '#7dfcff', color2: '#ffffff', size: 0.25, life: 0.5, drag: 2 });
        break;
      case 'checkpoint':
        this.audio.checkpoint();
        this.cb.toast('CHECKPOINT', 'info');
        break;
      case 'surface':
        if (e.tile === TileType.Ice) this.audio.surfaceIce();
        else if (e.tile === TileType.Accel) this.audio.surfaceAccel();
        else if (e.tile === TileType.Slow) this.audio.surfaceDrag();
        break;
      case 'leaveTrack':
        this.audio.fall();
        break;
      case 'crash':
        this.onCrash(e.cause);
        break;
      case 'finish':
        this.onFinish();
        break;
    }
  }

  private onCrash(cause: string): void {
    const s = this.state;
    this.stats.crashes++;
    this.setPhase('dead');
    this.audio.stopEngine();
    if (cause !== 'fall') {
      this.audio.crash();
      this.rig.addShake(0.8);
      const p = { x: s.x, y: s.y + 0.25, z: -s.d };
      this.particles.emit({ ...p, spread: 6, vy: 2, count: 90, color: '#ffffff', color2: this.cfg.custom.trail, size: 0.55, sizeEnd: 0.1, life: 0.9, drag: 1.5, gravity: 6 });
      this.particles.emit({ ...p, spread: 9, vy: 5, count: 60, color: '#ffb02d', color2: '#ff2d6f', size: 0.22, life: 1.3, gravity: 14 });
      this.particles.emit({ ...p, spread: 1, count: 6, color: '#ffffff', size: 4, sizeEnd: 6, life: 0.25 });
      this.shock.position.set(p.x, p.y, p.z);
      this.shockT = 0;
      this.ship.group.visible = false;
      this.cb.toast(cause === 'hazard' ? 'HULL BREACH' : 'CRASHED', 'bad');
    } else {
      this.cb.toast('LOST IN THE VOID', 'bad');
    }
  }

  private afterDeath(): void {
    this.lives--;
    if (this.lives <= 0) {
      this.setPhase('gameover');
      this.audio.fail();
      this.cb.gameOver(this.result(false));
      return;
    }
    const cp = this.state.lastCheckpoint;
    this.track.resetState(cp);
    // Re-show orbs collected after the checkpoint? They stay collected: no farming.
    this.state = spawnState(this.track, cp, this.vehicle);
    this.copyPrev();
    this.ship.group.visible = true;
    this.particles.clear();
    this.rig.snap(this.camTarget(1));
    this.setPhase('respawn');
    this.cb.toast(this.lives === 1 ? 'LAST LIFE' : 'GET READY', this.lives === 1 ? 'bad' : 'info');
    this.jumpQueued = false;
  }

  private onFinish(): void {
    this.setPhase('finished');
    this.audio.complete();
    this.audio.stopEngine();
    this.finishedResult = this.result(true);
    const s = this.state;
    this.particles.emit({ x: s.x, y: s.y + 1, z: -s.d - 2, spread: 8, vy: 4, count: 120, color: this.theme.neon, color2: '#ffffff', size: 0.4, life: 1.4, gravity: 4 });
  }

  private result(finished: boolean): RunResult {
    const def = this.cfg.level;
    const medals = def?.medals ?? { gold: 0, silver: 0 };
    let score = this.score.live;
    let breakdown: RunResult['breakdown'] = [];
    let medal = 0;
    if (finished && def) {
      const f = this.score.finalize(this.raceTime, this.state.highSpeedTime, medals);
      score = f.total;
      breakdown = f.breakdown;
      medal = medalFor(this.raceTime, this.score.crashes, medals);
    } else if (this.endless) {
      breakdown = [
        { label: `Distance ${Math.round(this.stats.distance)} m`, points: this.rowPointsAwarded },
        { label: `Energy orbs ×${this.score.orbs}`, points: this.score.orbs * POINTS.orb },
        { label: `Clean landings ×${this.score.cleanLandings}`, points: this.score.cleanLandings * POINTS.cleanLanding },
        { label: `Crashes ×${this.score.crashes}`, points: this.score.crashes * POINTS.crash },
      ];
    }
    return {
      levelId: def?.id ?? 0,
      time: this.raceTime,
      crashes: this.score.crashes,
      orbs: this.score.orbs,
      totalOrbs: this.totalOrbs,
      score,
      breakdown,
      medal,
      distance: this.stats.distance,
      endless: !!this.endless,
      jumps: this.stats.jumps,
    };
  }

  private checkAltZones(row: number): void {
    const s = this.state;
    const lane = xToLane(s.x, this.track.width);
    this.track.altZones.forEach((z, i) => {
      const st = this.altState.get(i);
      if (st === 'done') return;
      const inside = lane >= z.lane0 - 0.5 && lane <= z.lane1 + 0.5;
      if (row >= z.row0 && row <= z.row0 + 1) {
        if (inside && st === undefined) this.altState.set(i, 'in');
        else if (!inside) this.altState.set(i, 'out');
      } else if (row >= z.row1 && st === 'in') {
        if (inside) {
          this.altState.set(i, 'done');
          this.score.addAlt(z.label, z.bonus);
          this.cb.toast(`${z.label} +${z.bonus}`, 'good');
        } else this.altState.set(i, 'out');
      }
    });
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  // ------------------------------------------------------------------ visuals
  private camTarget(alpha: number) {
    const s = this.state;
    return {
      x: this.prev.x + (s.x - this.prev.x) * alpha,
      y: this.prev.y + (s.y - this.prev.y) * alpha,
      d: this.prev.d + (s.d - this.prev.d) * alpha,
      speed: this.phase === 'racing' ? s.speed : this.phase === 'finished' ? s.speed * 0.6 : 16,
      vx: s.vx,
      grounded: s.grounded,
      lost: s.lost,
    };
  }

  private applyShipTransform(alpha: number, dt: number): void {
    const t = this.camTarget(alpha);
    const s = this.state;
    const g = this.ship.group;
    g.position.set(t.x, t.y, -t.d);
    const bank = -s.vx * 0.055;
    const pitch = s.grounded ? 0 : Math.max(-0.35, Math.min(0.3, s.vy * 0.022));
    const b = this.ship.body;
    const k = 1 - Math.exp(-(dt || 0.016) * 10);
    b.rotation.z += (bank - b.rotation.z) * k;
    b.rotation.x += (pitch - b.rotation.x) * k;
    if (s.lost && this.phase === 'dead') {
      b.rotation.x -= dt * 2.5;
      b.rotation.z += dt * 1.7;
    }
    // Hover bob on the ground.
    b.position.y = s.grounded ? Math.sin(this.time * 9) * 0.015 : 0;
  }

  private updateVisuals(dt: number, alpha: number): void {
    const s = this.state;
    const speed01 = Math.max(0, (s.speed - 8) / (this.vehicle.maxSpeed - 8));
    const boosting = s.boostTimer > 0;
    const racing = this.phase === 'racing' || this.phase === 'finished';
    this.ship.setThrust(racing ? speed01 : 0.2, boosting, this.time);
    this.audio.setEngine(speed01, boosting, !s.grounded, this.phase === 'racing');

    // Exhaust trail
    if (this.ship.group.visible && this.phase !== 'gameover') {
      const style = TRAIL_STYLE[this.cfg.custom.effect];
      this.emitAcc += dt * (racing ? 60 : 20) * style.rate * (boosting ? 2 : 1);
      this.trailHue = (this.trailHue + dt * 0.6) % 1;
      const world = new THREE.Vector3();
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        for (const n of this.ship.nozzles) {
          world.copy(n);
          this.ship.body.localToWorld(world);
          let color: THREE.ColorRepresentation = this.cfg.custom.trail;
          if (this.cfg.custom.effect === 'prism') color = new THREE.Color().setHSL(this.trailHue, 1, 0.6);
          this.particles.emit({
            x: world.x,
            y: world.y,
            z: world.z,
            vz: racing ? 4 : 1.5,
            spread: style.spread,
            color,
            color2: this.cfg.custom.effect === 'nova' ? '#ffffff' : new THREE.Color(color).lerp(new THREE.Color('#ffffff'), style.white),
            size: style.size * (boosting ? 1.5 : 1),
            sizeEnd: 0.02,
            life: style.life,
            drag: 2,
          });
        }
      }
    }

    // Crash shockwave
    if (this.shockT >= 0) {
      this.shockT += dt;
      const k = this.shockT / 0.6;
      this.shock.scale.setScalar(1 + k * 9);
      this.shockMat.opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) this.shockT = -1;
    }

    this.particles.update(dt);
    const t = this.camTarget(alpha);
    if (this.phase !== 'gameover') this.rig.update(Math.max(dt, 1e-4), t);
    this.view.update(t.d, this.time);
    this.env.update(this.renderer.camera, this.time);
  }

  hud(): HudState {
    const s = this.state;
    const fin = this.track.finishRow;
    return {
      title: this.cfg.level ? `${String(this.cfg.level.id).padStart(2, '0')} · ${this.cfg.level.name.toUpperCase()}` : 'ENDLESS',
      lives: this.lives,
      maxLives: this.maxLives,
      time: this.raceTime,
      score: this.score.live,
      speed: Math.round(s.speed * 15),
      speed01: Math.min(1.2, s.speed / this.vehicle.maxSpeed),
      progress: fin > 0 ? Math.min(1, s.d / (fin * ROW_LENGTH)) : 0,
      distance: this.stats.distance,
      effects: this.effects(),
      endless: !!this.endless,
      orbs: this.score.orbs,
    };
  }

  private effects(): string[] {
    const s = this.state;
    const out: string[] = [];
    if (s.boostTimer > 0) out.push(`BOOST ${(s.boostTimer / BOOST_DURATION * 100).toFixed(0)}%`);
    if (!s.grounded && s.alive) out.push('AIRBORNE');
    if (s.grounded && s.surface === TileType.Ice) out.push('ICE');
    if (s.grounded && s.surface === TileType.Accel) out.push('ACCEL');
    if (s.grounded && s.surface === TileType.Slow) out.push('DRAG');
    if (s.grounded && s.surface === TileType.Fragile) out.push('FRAGILE');
    return out;
  }

  /** Stats to fold into the save file when the session ends. */
  sessionStats() {
    return { crashes: this.stats.crashes, jumps: this.stats.jumps, distance: this.stats.distance, orbs: this.score.orbs };
  }

  pauseAudio(): void {
    this.audio.setEngine(0, false, false, false);
  }

  dispose(): void {
    const scene = this.renderer.scene;
    scene.remove(this.env.group, this.view.group, this.ship.group, this.particles.points, this.shock);
    this.env.dispose();
    this.view.dispose();
    this.ship.dispose();
    this.particles.dispose();
    this.shock.geometry.dispose();
    this.shockMat.dispose();
    this.renderer.onResize = null;
    this.audio.stopEngine();
    scene.fog = null;
  }
}

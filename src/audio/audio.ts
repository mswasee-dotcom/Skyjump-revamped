/**
 * Fully synthesized audio: every sound effect and the music are generated with the Web Audio API
 * at runtime, so the game ships with no audio files. The AudioContext is created on the first
 * user gesture to comply with browser autoplay rules.
 */
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

type MusicMode = 'off' | 'menu' | 'race';

// Chord roots (MIDI) and qualities for a few synthwave-friendly progressions.
const PROGRESSIONS: Array<Array<[number, 'min' | 'maj']>> = [
  [[57, 'min'], [53, 'maj'], [48, 'maj'], [55, 'maj']], // Am F C G
  [[57, 'min'], [52, 'min'], [53, 'maj'], [55, 'maj']], // Am Em F G
  [[50, 'min'], [58, 'maj'], [53, 'maj'], [57, 'min']], // Dm Bb F Am
  [[52, 'min'], [48, 'maj'], [55, 'maj'], [50, 'maj']], // Em C G D
];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engineNodes: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; noiseGain: GainNode; noise: AudioBufferSourceNode } | null = null;
  private volumes = { music: 0.6, sfx: 0.8, muted: false };
  private mode: MusicMode = 'off';
  private bpm = 120;
  private progression = PROGRESSIONS[0];
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private lastHover = 0;

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.volumes = { music, sfx, muted };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 1, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.02);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.42, t, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ---------------------------------------------------------------- helpers
  private env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0.0001): void {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest?: AudioNode, when = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1: number, q = 1, when = 0, dest?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, vol, dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- engine
  startEngine(): void {
    if (!this.ctx || this.engineNodes) return;
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    nf.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.sfx);
    noise.connect(nf).connect(noiseGain).connect(this.sfx);
    osc1.start();
    osc2.start();
    noise.start();
    this.engineNodes = { osc1, osc2, filter, gain, noiseGain, noise };
  }

  /** speed01: 0 at minimum speed, 1 at top speed (boost can exceed 1). */
  setEngine(speed01: number, boost: boolean, airborne: boolean, on: boolean): void {
    const e = this.engineNodes;
    if (!this.ctx || !e) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed01 * 70 + (boost ? 18 : 0);
    e.osc1.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 0.5 + 0.7, t, 0.05);
    e.filter.frequency.setTargetAtTime(300 + speed01 * 1700 + (boost ? 900 : 0) + (airborne ? -150 : 0), t, 0.06);
    e.gain.gain.setTargetAtTime(on ? 0.085 + speed01 * 0.04 : 0, t, 0.08);
    e.noiseGain.gain.setTargetAtTime(on ? 0.02 + speed01 * 0.05 + (boost ? 0.05 : 0) : 0, t, 0.08);
  }

  stopEngine(): void {
    const e = this.engineNodes;
    if (!this.ctx || !e) return;
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0, t, 0.05);
    e.noiseGain.gain.setTargetAtTime(0, t, 0.05);
    const nodes = e;
    window.setTimeout(() => {
      try {
        nodes.osc1.stop();
        nodes.osc2.stop();
        nodes.noise.stop();
      } catch {
        /* already stopped */
      }
    }, 300);
    this.engineNodes = null;
  }

  // ---------------------------------------------------------------- effects
  jump(): void {
    this.tone('square', 220, 660, 0.16, 0.12);
    this.tone('sine', 330, 990, 0.18, 0.1);
  }

  launch(): void {
    this.tone('sawtooth', 110, 880, 0.45, 0.14);
    this.noiseBurst(0.45, 0.2, 'bandpass', 600, 4000, 1.2);
  }

  land(intensity: number): void {
    const v = Math.min(1, intensity);
    this.tone('sine', 140, 45, 0.18, 0.25 * v + 0.08);
    this.noiseBurst(0.12, 0.12 * v + 0.03, 'lowpass', 1600, 200);
  }

  boost(): void {
    this.noiseBurst(0.6, 0.28, 'bandpass', 500, 5000, 0.8);
    this.tone('sawtooth', 180, 720, 0.5, 0.1);
  }

  scrape(): void {
    this.noiseBurst(0.14, 0.18, 'highpass', 3000, 1500, 2);
  }

  crash(): void {
    this.noiseBurst(1.2, 0.6, 'lowpass', 3000, 60, 0.5);
    this.tone('sine', 90, 25, 0.9, 0.5);
    this.tone('sawtooth', 300, 40, 0.5, 0.15);
  }

  fall(): void {
    this.tone('triangle', 660, 80, 1.1, 0.16);
  }

  orb(): void {
    const base = 880 + Math.random() * 80;
    this.tone('sine', base, base, 0.12, 0.12);
    this.tone('sine', base * 1.5, base * 1.5, 0.18, 0.08, undefined, 0.05);
  }

  checkpoint(): void {
    [0, 4, 7].forEach((s, i) => this.tone('triangle', midi(76 + s), midi(76 + s), 0.18, 0.12, undefined, i * 0.07));
  }

  surfaceAccel(): void {
    this.tone('sawtooth', 220, 440, 0.25, 0.05);
  }

  surfaceDrag(): void {
    this.tone('sawtooth', 300, 120, 0.3, 0.06);
  }

  surfaceIce(): void {
    this.noiseBurst(0.3, 0.06, 'highpass', 6000, 9000, 3);
  }

  crumble(): void {
    this.noiseBurst(0.25, 0.08, 'lowpass', 900, 200, 1);
  }

  complete(): void {
    const notes = [69, 72, 76, 81, 84, 88];
    notes.forEach((n, i) => {
      this.tone('square', midi(n), midi(n), 0.25, 0.08, undefined, i * 0.09);
      this.tone('sine', midi(n - 12), midi(n - 12), 0.4, 0.1, undefined, i * 0.09);
    });
  }

  fail(): void {
    [64, 60, 57, 52].forEach((n, i) => this.tone('sawtooth', midi(n), midi(n - 1), 0.3, 0.08, undefined, i * 0.18));
  }

  countdown(final: boolean): void {
    const f = final ? midi(81) : midi(69);
    this.tone('square', f, f, final ? 0.4 : 0.15, 0.12);
  }

  click(): void {
    this.tone('square', 1200, 900, 0.05, 0.06);
  }

  hover(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastHover < 0.04) return;
    this.lastHover = now;
    this.tone('sine', 1800, 1600, 0.03, 0.025);
  }

  // ---------------------------------------------------------------- music
  setMusic(mode: MusicMode, bpm = 120, seed = 0): void {
    if (this.mode === mode && this.bpm === bpm && this.progression === PROGRESSIONS[seed % PROGRESSIONS.length]) return;
    const restart = this.mode !== mode;
    this.mode = mode;
    this.bpm = bpm;
    this.progression = PROGRESSIONS[seed % PROGRESSIONS.length];
    if (restart && this.ctx) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
    }
  }

  private schedule(): void {
    if (!this.ctx || this.mode === 'off' || this.ctx.state !== 'running') return;
    const stepDur = 60 / this.bpm / 4;
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private voice(type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff: number, attack = 0.005, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(f).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private drum(kind: 'kick' | 'snare' | 'hat', t: number): void {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 0.35);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 8000 : 1800;
      const g = ctx.createGain();
      const len = kind === 'hat' ? 0.04 : 0.18;
      g.gain.setValueAtTime(kind === 'hat' ? 0.14 : 0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(this.music);
      src.start(t, Math.random());
      src.stop(t + len + 0.02);
    }
  }

  private playStep(step: number, t: number, sd: number): void {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const [root, quality] = this.progression[bar];
    const third = quality === 'min' ? 3 : 4;
    const chord = [root, root + third, root + 7];
    const race = this.mode === 'race';
    const section = Math.floor(step / 64) % 4; // vary density every 4 bars

    // Pad on each bar
    if (s === 0) {
      for (const n of chord) {
        this.voice('sawtooth', midi(n), t, sd * 15, race ? 0.035 : 0.05, 1200, sd * 4, -7);
        this.voice('sawtooth', midi(n), t, sd * 15, race ? 0.035 : 0.05, 1200, sd * 4, 7);
      }
    }
    // Arpeggio
    const arpPattern = [0, 1, 2, 1, 0, 2, 1, 2];
    if (s % 2 === 0 && (race || s % 4 === 0)) {
      const n = chord[arpPattern[(s / 2) % 8]] + 12 + (section === 3 && s >= 8 ? 12 : 0);
      this.voice('square', midi(n), t, sd * 1.6, race ? 0.045 : 0.035, 2600);
    }
    if (!race) return;
    // Bass: driving eighths
    if (s % 2 === 0) {
      const n = root - 12 + (s % 8 === 6 ? 7 : 0);
      this.voice('sawtooth', midi(n), t, sd * 1.7, 0.16, 520 + (s % 4 === 0 ? 300 : 0));
    }
    // Drums
    if (s % 4 === 0) this.drum('kick', t);
    if (s === 4 || s === 12) this.drum('snare', t);
    if (section > 0 && s % 2 === 1) this.drum('hat', t);
    if (section === 2 && s === 14) this.drum('kick', t);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.stopEngine();
    void this.ctx?.close();
  }
}

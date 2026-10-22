import { CAMPAIGN } from '../levels/campaign';
import type { LevelDef } from '../levels/types';
import { ACTIONS, ACTION_LABELS, Action, Customization, DEFAULT_CUSTOM, DEFAULT_KEYS, PALETTE, SaveData, Settings, TrailEffect, keyLabel } from '../core/save';
import { VEHICLES, VEHICLE_ORDER, VehicleId } from '../core/vehicles';
import { EFFECT_INFO, EFFECT_ORDER, LevelOutcome, completedCount, goldCount, isEndlessUnlocked, isLevelUnlocked, levelRecord, nextLevel, vehicleRequirement } from '../core/progress';
import { MEDAL_NAMES, formatTime } from '../core/scoring';
import { LEGEND_TILES, TILE_INFO } from '../core/tiles';
import type { HudState, RunResult } from '../game/session';
import { drawTile } from '../render/textures';

export interface UiActions {
  start(): void;
  play(): void;
  startLevel(id: number): void;
  startEndless(): void;
  setShowcase(mode: 'menu' | 'garage'): void;
  previewShip(id: VehicleId, custom: Customization): void;
  selectVehicle(id: VehicleId): void;
  setCustom(id: VehicleId, c: Customization): void;
  settingsChanged(s: Settings): void;
  resetProgress(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  quitToMenu(): void;
  toggleFullscreen(): void;
  captureKey(cb: (code: string) => void): void;
  sound(kind: 'click' | 'hover'): void;
  touch(action: Action, down: boolean): void;
  unlockAudio(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ICONS = {
  sound: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m5 15 7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m5 9 7 7 7-7"/></svg>',
};

function medal(m: number, big = false): string {
  return `<span class="medal m${m}${big ? ' big' : ''}" title="${MEDAL_NAMES[m]}">${m ? '★' : ''}</span>`;
}

/** DOM-based menus, HUD and overlays. Pure presentation: every decision goes through UiActions. */
export class UI {
  private screen: HTMLElement;
  private hudLayer: HTMLElement;
  private overlay: HTMLElement;
  private modal: HTMLElement;
  private back: (() => void) | null = null;
  private hudEls: Record<string, HTMLElement> = {};
  private hintTimer = 0;
  private legendCache = new Map<number, string>();
  private lastHud = '';
  /** Which screen the settings/how-to pages return to. */
  private returnTo: 'menu' | 'pause' = 'menu';
  private garageVehicle: VehicleId = 'comet';

  constructor(root: HTMLElement, private act: UiActions, private save: () => SaveData) {
    this.hudLayer = this.mk('div', 'passthrough');
    this.screen = this.mk('div');
    this.overlay = this.mk('div');
    this.modal = this.mk('div');
    root.append(this.hudLayer, this.screen, this.overlay, this.modal);
    for (const el of [this.screen, this.overlay, this.modal]) {
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
    }
    root.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement).closest('.btn, .level-card, .ship-tab, .fx, .swatch');
      if (t && !(t as HTMLButtonElement).disabled) this.act.sound('hover');
    });
  }

  private mk(tag: string, cls = ''): HTMLElement {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }

  private setScreen(html: string, back: (() => void) | null, layer: HTMLElement = this.screen): HTMLElement {
    layer.innerHTML = html;
    layer.style.pointerEvents = html ? 'auto' : 'none';
    this.back = back;
    const first = layer.querySelector<HTMLElement>('[autofocus], .btn.primary, .btn, .level-card');
    first?.focus({ preventScroll: true });
    return layer;
  }

  private on(layer: HTMLElement, handlers: Record<string, (el: HTMLElement) => void>): void {
    layer.onclick = (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const h = handlers[el.dataset.act!];
      if (h) {
        this.act.sound('click');
        h(el);
      }
    };
  }

  clearScreens(): void {
    this.setScreen('', null);
    this.setScreen('', null, this.overlay);
    this.closeModal();
  }

  /** Escape / B button: go back if the current screen allows it. */
  goBack(): boolean {
    if (this.modal.innerHTML) {
      this.closeModal();
      return true;
    }
    if (this.back) {
      this.act.sound('click');
      this.back();
      return true;
    }
    return false;
  }

  /** Arrow-key focus navigation between visible buttons. */
  navigate(dir: 1 | -1): void {
    const layer = this.modal.innerHTML ? this.modal : this.overlay.innerHTML ? this.overlay : this.screen;
    const items = [...layer.querySelectorAll<HTMLElement>('.btn:not([disabled]), .level-card:not(.locked), .ship-tab, .fx, .swatch, .toggle, .keybtn, .seg button, input[type=range]')].filter((e) => e.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + dir + items.length) % items.length];
    next.focus();
    this.act.sound('hover');
  }

  get inModal(): boolean {
    return !!this.modal.innerHTML;
  }

  // ------------------------------------------------------------------ title
  showTitle(): void {
    const firstRun = !this.save().seenTutorial;
    const layer = this.setScreen(
      `<div class="screen main-menu" data-act="start">
        <div class="title-block">
          ${this.logo()}
          <div class="press-start">PRESS ANY KEY · TAP TO START</div>
          <div class="rotate-note">Tip: turn your phone sideways for the best view.</div>
          ${firstRun ? `<p class="note" style="margin-top:22px;max-width:520px">Steer with <span class="kbd">A</span><span class="kbd">D</span> or arrows, jump with <span class="kbd">Space</span>, accelerate <span class="kbd">W</span>, brake <span class="kbd">S</span>. On touch screens use the on-screen buttons. Stay on the road — the void is unforgiving.</p>` : ''}
        </div>
        <div class="corner bl">An original game inspired by the 1993 classic SkyRoads</div>
        <div class="corner br">v1.0</div>
      </div>`,
      null,
    );
    this.on(layer, { start: () => this.act.start() });
  }

  private logo(): string {
    return `<h1 class="logo">NEON<span class="line2">ROADRUNNER</span></h1><div class="horizon-line"></div><div class="logo-sub">RACE THE ROAD ABOVE THE VOID</div>`;
  }

  // ------------------------------------------------------------------ main menu
  showMainMenu(): void {
    this.act.setShowcase('menu');
    const save = this.save();
    const next = nextLevel(save);
    const done = completedCount(save);
    const s = save.settings;
    const layer = this.setScreen(
      `<div class="screen main-menu">
        <div class="title-block">${this.logo()}</div>
        <div class="menu-list">
          <button class="btn primary" data-act="play">${done === 0 ? 'Start campaign' : done >= 10 ? 'Play' : 'Continue'}<span class="hint">Sector ${next} · ${esc(CAMPAIGN[next - 1].name)}</span></button>
          <button class="btn" data-act="levels">Level select</button>
          <button class="btn" data-act="endless" ${isEndlessUnlocked(save) ? '' : 'disabled'}>Endless run${isEndlessUnlocked(save) ? '' : '<span class="hint">Clear sector 1</span>'}</button>
          <button class="btn" data-act="garage">Garage</button>
          <button class="btn" data-act="records">Records</button>
          <button class="btn" data-act="howto">How to play</button>
          <button class="btn" data-act="settings">Settings</button>
        </div>
        <div class="corner tr">
          <button class="icon-btn ${s.muted ? 'off' : ''}" data-act="mute" title="Sound on/off" aria-label="Toggle sound">${s.muted ? ICONS.mute : ICONS.sound}</button>
          <button class="icon-btn ${s.musicVolume === 0 ? 'off' : ''}" data-act="music" title="Music on/off" aria-label="Toggle music">${ICONS.music}</button>
          <button class="icon-btn" data-act="full" title="Fullscreen" aria-label="Fullscreen">${ICONS.full}</button>
        </div>
        <div class="corner br">${done}/10 sectors · ${goldCount(save)} gold · best ${save.highScore.toLocaleString()}</div>
      </div>`,
      null,
    );
    this.on(layer, {
      play: () => this.act.play(),
      levels: () => this.showLevelSelect(),
      endless: () => this.act.startEndless(),
      garage: () => this.showGarage(),
      records: () => this.showRecords(),
      howto: () => this.showHowTo('menu'),
      settings: () => this.showSettings('menu'),
      mute: () => {
        const st = this.save().settings;
        st.muted = !st.muted;
        this.act.settingsChanged(st);
        this.showMainMenu();
      },
      music: () => {
        const st = this.save().settings;
        st.musicVolume = st.musicVolume > 0 ? 0 : 0.6;
        this.act.settingsChanged(st);
        this.showMainMenu();
      },
      full: () => this.act.toggleFullscreen(),
    });
  }

  // ------------------------------------------------------------------ level select
  showLevelSelect(): void {
    const save = this.save();
    const cards = CAMPAIGN.map((l, i) => {
      const rec = levelRecord(save, l.id);
      const unlocked = isLevelUnlocked(save, l.id);
      return `<button class="level-card panel ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'level' : 'locked'}" data-id="${l.id}" style="animation-delay:${i * 0.03}s" ${unlocked ? '' : 'aria-disabled="true"'}>
        <div class="meta"><span class="num">${String(l.id).padStart(2, '0')}</span>${medal(rec.medal)}</div>
        <div class="name">${esc(l.name.toUpperCase())}</div>
        <div class="tag">${unlocked ? esc(l.tagline) : 'Locked — clear the previous sector'}</div>
        <div class="meta"><span class="best">BEST ${formatTime(rec.bestTime)}</span><span class="best">GOLD ${formatTime(l.medals.gold)}</span></div>
      </button>`;
    }).join('');
    const eu = isEndlessUnlocked(save);
    const endless = `<button class="level-card panel endless ${eu ? '' : 'locked'}" data-act="${eu ? 'endless' : 'locked'}" style="animation-delay:0.32s">
        <div class="meta"><span class="num">∞</span></div>
        <div class="name">ENDLESS RUN</div>
        <div class="tag">${eu ? 'A procedurally generated road that never ends and keeps getting harder.' : 'Locked — clear sector 1'}</div>
        <div class="meta"><span class="best">BEST ${Math.round(save.endless.bestDistance).toLocaleString()} m</span><span class="best">${save.endless.bestScore.toLocaleString()} PTS</span></div>
      </button>`;
    const layer = this.setScreen(
      `<div class="screen dim">
        <div class="header"><button class="btn small" data-act="back">← Back</button><h2>SELECT SECTOR</h2></div>
        <div class="level-grid">${cards}${endless}</div>
      </div>`,
      () => this.showMainMenu(),
    );
    this.on(layer, {
      back: () => this.showMainMenu(),
      level: (el) => this.act.startLevel(Number(el.dataset.id)),
      endless: () => this.act.startEndless(),
    });
  }

  // ------------------------------------------------------------------ garage
  showGarage(vehicle?: VehicleId): void {
    this.act.setShowcase('garage');
    const save = this.save();
    const id = vehicle ?? this.garageVehicle ?? save.garage.selected;
    this.garageVehicle = id;
    const v = VEHICLES[id];
    const unlocked = save.garage.unlocked.includes(id);
    const custom = save.garage.custom[id];
    this.act.previewShip(id, custom);
    const tabs = VEHICLE_ORDER.map((vid) => `<button class="ship-tab ${vid === id ? 'active' : ''} ${save.garage.unlocked.includes(vid) ? '' : 'locked'}" data-act="ship" data-id="${vid}">${VEHICLES[vid].name}${save.garage.selected === vid ? ' ✓' : ''}</button>`).join('');
    const sw = (field: 'body' | 'accent' | 'trail') =>
      `<div class="swatches">${PALETTE.map((c) => `<button class="swatch ${custom[field].toLowerCase() === c ? 'active' : ''}" data-act="color" data-field="${field}" data-color="${c}" style="background:${c};color:${c}" aria-label="${field} ${c}"></button>`).join('')}</div>`;
    const fx = EFFECT_ORDER.map((e) => {
      const has = save.garage.unlockedEffects.includes(e);
      return `<button class="fx ${custom.effect === e ? 'active' : ''} ${has ? '' : 'locked'}" data-act="${has ? 'fx' : 'none'}" data-fx="${e}"><span>${EFFECT_INFO[e].name}<br><small>${has ? EFFECT_INFO[e].description : '🔒 ' + EFFECT_INFO[e].requirement}</small></span>${custom.effect === e ? '✓' : ''}</button>`;
    }).join('');
    const layer = this.setScreen(
      `<div class="screen">
        <div class="header"><button class="btn small" data-act="back">← Back</button><h2>GARAGE</h2></div>
        <div class="garage">
          <div class="panel">
            <div class="ship-tabs">${tabs}</div>
            <h3>${v.name} — ${esc(v.tagline.toUpperCase())}</h3>
            <p class="note">${esc(v.description)}</p>
            <div class="stat">SPEED<div class="bar"><i style="width:${v.bars.speed * 100}%"></i></div></div>
            <div class="stat">HANDLING<div class="bar"><i style="width:${v.bars.handling * 100}%"></i></div></div>
            <div class="stat">STABILITY<div class="bar"><i style="width:${v.bars.stability * 100}%"></i></div></div>
            ${unlocked ? '' : `<div class="lock-note">🔒 ${vehicleRequirement(id)} to unlock this ship.</div>`}
            <h3>HULL</h3>${sw('body')}
            <h3>NEON ACCENTS</h3>${sw('accent')}
            <h3>ENGINE TRAIL</h3>${sw('trail')}
            <h3>TRAIL EFFECT</h3><div class="fx-list">${fx}</div>
            <div class="actions">
              <button class="btn primary" data-act="select" ${unlocked ? '' : 'disabled'}>${save.garage.selected === id ? 'Selected' : 'Fly this ship'}</button>
              <button class="btn small" data-act="defaults">Default colours</button>
            </div>
          </div>
          <div></div>
        </div>
      </div>`,
      () => this.showMainMenu(),
    );
    const update = (c: Customization) => {
      this.act.setCustom(id, c);
      this.showGarage(id);
    };
    this.on(layer, {
      back: () => this.showMainMenu(),
      ship: (el) => this.showGarage(el.dataset.id as VehicleId),
      color: (el) => update({ ...custom, [el.dataset.field!]: el.dataset.color! }),
      fx: (el) => update({ ...custom, effect: el.dataset.fx as TrailEffect }),
      defaults: () => update({ ...DEFAULT_CUSTOM[id], effect: custom.effect }),
      select: () => {
        this.act.selectVehicle(id);
        this.showGarage(id);
      },
    });
  }

  // ------------------------------------------------------------------ records
  showRecords(): void {
    const save = this.save();
    const st = save.stats;
    const rows = CAMPAIGN.map((l) => {
      const r = levelRecord(save, l.id);
      return `<tr><td>${String(l.id).padStart(2, '0')} ${esc(l.name)}</td><td class="mono">${formatTime(r.bestTime)}</td><td class="mono">${r.bestScore ? r.bestScore.toLocaleString() : '—'}</td><td>${medal(r.medal)}</td><td class="mono">${r.attempts}</td></tr>`;
    }).join('');
    const box = (k: string, v: string) => `<div class="statbox"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    const hours = Math.floor(st.playSeconds / 3600);
    const mins = Math.floor((st.playSeconds % 3600) / 60);
    const layer = this.setScreen(
      `<div class="screen dim">
        <div class="header"><button class="btn small" data-act="back">← Back</button><h2>RECORDS</h2></div>
        <div class="two-col">
          <div class="panel">
            <h3>CAREER</h3>
            <div class="statgrid">
              ${box('High score', save.highScore.toLocaleString())}
              ${box('Sectors cleared', `${completedCount(save)}/10`)}
              ${box('Gold medals', String(goldCount(save)))}
              ${box('Attempts', st.attempts.toLocaleString())}
              ${box('Crashes', st.crashes.toLocaleString())}
              ${box('Jumps', st.jumps.toLocaleString())}
              ${box('Distance', `${(st.distance / 1000).toFixed(1)} km`)}
              ${box('Energy orbs', st.orbs.toLocaleString())}
              ${box('Endless best', `${Math.round(save.endless.bestDistance).toLocaleString()} m`)}
              ${box('Time flown', `${hours}h ${mins}m`)}
            </div>
          </div>
          <div class="panel">
            <h3>SECTORS</h3>
            <table class="records"><thead><tr><th>Sector</th><th>Best time</th><th>Score</th><th>Medal</th><th>Tries</th></tr></thead><tbody>${rows}</tbody></table>
            <p class="note">Gold needs the gold time <em>and</em> a crash-free run. Silver needs the silver time.</p>
          </div>
        </div>
      </div>`,
      () => this.showMainMenu(),
    );
    this.on(layer, { back: () => this.showMainMenu() });
  }

  // ------------------------------------------------------------------ settings
  showSettings(from: 'menu' | 'pause'): void {
    this.returnTo = from;
    const s = this.save().settings;
    const layerEl = from === 'pause' ? this.overlay : this.screen;
    const backFn = () => (from === 'pause' ? this.showPause() : this.showMainMenu());
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<div class="row"><label for="s-${key}">${label}</label><input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-key="${key}"><span class="val" data-val="${key}">${fmt(s[key] as number)}</span></div>`;
    const toggle = (key: keyof Settings, label: string) =>
      `<div class="row"><label>${label}</label><button class="toggle ${s[key] ? 'on' : ''}" data-act="toggle" data-key="${key}" role="switch" aria-checked="${!!s[key]}" aria-label="${label}"></button></div>`;
    const seg = (key: keyof Settings, label: string, opts: string[]) =>
      `<div class="row"><label>${label}</label><div class="seg">${opts.map((o) => `<button class="${s[key] === o ? 'active' : ''}" data-act="seg" data-key="${key}" data-v="${o}">${o.toUpperCase()}</button>`).join('')}</div></div>`;
    const keys = ACTIONS.map((a) => `<span>${ACTION_LABELS[a]}</span>${[0, 1].map((slot) => `<button class="keybtn" data-act="bind" data-action="${a}" data-slot="${slot}">${keyLabel(s.keys[a][slot] ?? '')}</button>`).join('')}`).join('');
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const mult = (v: number) => `${v.toFixed(2)}×`;
    const layer = this.setScreen(
      `<div class="screen dim">
        <div class="header"><button class="btn small" data-act="back">← Back</button><h2>SETTINGS</h2></div>
        <div class="two-col">
          <div class="panel">
            <h3>AUDIO</h3>
            ${slider('musicVolume', 'Music volume', 0, 1, 0.05, pct)}
            ${slider('sfxVolume', 'Effects volume', 0, 1, 0.05, pct)}
            ${toggle('muted', 'Mute everything')}
            <h3>HANDLING & CAMERA</h3>
            ${slider('steerSensitivity', 'Steering sensitivity', 0.6, 1.4, 0.05, mult)}
            ${slider('cameraStiffness', 'Camera responsiveness', 0.5, 1.5, 0.05, mult)}
            ${toggle('reducedShake', 'Reduced screen shake')}
            <h3>GRAPHICS</h3>
            ${seg('quality', 'Quality', ['low', 'medium', 'high'])}
            ${toggle('showFps', 'Show FPS')}
            <div class="row"><label>Fullscreen</label><button class="btn small" data-act="full">Toggle</button></div>
            <p class="note">Low disables bloom and renders at native resolution — use it on older laptops and phones.</p>
          </div>
          <div class="panel">
            <h3>CONTROLS</h3>
            <div class="keymap">${keys}</div>
            <div class="actions"><button class="btn small" data-act="resetkeys">Reset keys</button></div>
            <p class="note">Click a key slot, then press the new key (Esc clears the slot). Gamepads: left stick / d-pad to steer, RT accelerate, LT brake, A jump, Start pause, Y restart.</p>
            ${seg('touchControls', 'Touch buttons', ['auto', 'on', 'off'])}
            <h3>DATA</h3>
            <p class="note">Progress is saved in this browser only. Nothing is sent anywhere.</p>
            <button class="btn danger small" data-act="reset">Reset all progress</button>
          </div>
        </div>
      </div>`,
      backFn,
      layerEl,
    );
    const changed = () => this.act.settingsChanged(s);
    layer.oninput = (e) => {
      const el = e.target as HTMLInputElement;
      const key = el.dataset.key as keyof Settings | undefined;
      if (!key) return;
      (s as unknown as Record<string, number>)[key] = Number(el.value);
      const v = layer.querySelector<HTMLElement>(`[data-val="${key}"]`);
      if (v) v.textContent = key.includes('Volume') ? pct(Number(el.value)) : mult(Number(el.value));
      changed();
    };
    this.on(layer, {
      back: backFn,
      toggle: (el) => {
        const k = el.dataset.key as 'muted' | 'reducedShake' | 'showFps';
        s[k] = !s[k];
        el.classList.toggle('on', s[k]);
        el.setAttribute('aria-checked', String(s[k]));
        changed();
      },
      seg: (el) => {
        (s as unknown as Record<string, string>)[el.dataset.key!] = el.dataset.v!;
        el.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === el));
        changed();
      },
      full: () => this.act.toggleFullscreen(),
      bind: (el) => {
        el.classList.add('listening');
        el.textContent = 'PRESS…';
        this.act.captureKey((code) => {
          const a = el.dataset.action as Action;
          const slot = Number(el.dataset.slot);
          if (code) {
            // A key can only do one thing: remove it from any other slot.
            for (const other of ACTIONS) s.keys[other] = s.keys[other].map((k) => (k === code ? '' : k));
          }
          s.keys[a][slot] = code;
          changed();
          this.showSettings(from);
        });
      },
      resetkeys: () => {
        s.keys = structuredClone(DEFAULT_KEYS);
        changed();
        this.showSettings(from);
      },
      reset: () =>
        this.confirm('Reset all progress?', 'This erases best times, medals, unlocked ships and statistics. Settings are kept. This cannot be undone.', 'Erase progress', () => {
          this.act.resetProgress();
          this.showSettings(from);
          this.toast('PROGRESS RESET', 'info');
        }),
    });
  }

  // ------------------------------------------------------------------ how to play
  private tileImg(t: number): string {
    let url = this.legendCache.get(t);
    if (!url) {
      url = drawTile(t).toDataURL();
      this.legendCache.set(t, url);
    }
    return url;
  }

  showHowTo(from: 'menu' | 'pause'): void {
    const layerEl = from === 'pause' ? this.overlay : this.screen;
    const backFn = () => (from === 'pause' ? this.showPause() : this.showMainMenu());
    const k = this.save().settings.keys;
    const keyRow = (a: Action) => `<span>${k[a].filter(Boolean).map((c) => `<span class="kbd">${keyLabel(c)}</span>`).join(' ')}</span><span>${ACTION_LABELS[a]}</span>`;
    const legend = LEGEND_TILES.map((t) => `<div class="legend-item"><img alt="" src="${this.tileImg(t)}"><div><b style="color:${TILE_INFO[t].color}">${TILE_INFO[t].name.toUpperCase()}</b><span>${TILE_INFO[t].description}</span></div></div>`).join('');
    const layer = this.setScreen(
      `<div class="screen dim">
        <div class="header"><button class="btn small" data-act="back">← Back</button><h2>HOW TO PLAY</h2></div>
        <div class="two-col">
          <div class="panel">
            <h3>GOAL</h3>
            <p class="note">Your ship flies forward on its own. Steer, manage your speed and jump the gaps to reach the finish gate of each sector. Falling off the road or hitting a wall costs a life; you respawn at the last checkpoint.</p>
            <h3>CONTROLS</h3>
            <div class="controls-table">${(['left', 'right', 'accel', 'brake', 'jump', 'pause', 'restart'] as Action[]).map(keyRow).join('')}</div>
            <h3>TIPS</h3>
            <p class="note">• Speed changes how far you jump: hold accelerate before long gaps.<br>• Low blocks can be jumped onto; tall walls must be steered around.<br>• Gold medals need the gold time and zero crashes.<br>• Risky side routes award bonus points.</p>
          </div>
          <div class="panel"><h3>TRACK TILES</h3><div class="legend">${legend}</div></div>
        </div>
      </div>`,
      backFn,
      layerEl,
    );
    this.on(layer, { back: backFn });
  }

  // ------------------------------------------------------------------ HUD
  showHud(touch: boolean, showFps: boolean): void {
    this.clearScreens();
    this.lastHud = '';
    this.hudLayer.innerHTML = `<div class="hud${touch ? ' touch-on' : ''}">
      <div class="tl"><div class="level-title" data-h="title"></div><div class="lives" data-h="lives"></div></div>
      <div class="tc"><div class="label" data-h="timeLabel">TIME</div><div class="time" data-h="time">00:00.00</div></div>
      <div class="tr"><div class="label">SCORE</div><div class="score" data-h="score">0</div><div class="orbs" data-h="orbs"></div></div>
      <div class="progress" data-h="progressWrap"><em>FINISH</em><i data-h="progress"></i></div>
      <div class="speedo"><div class="chips" data-h="chips"></div><div class="speed-num" data-h="speed">0</div><div class="speed-unit">KM/H</div><div class="speed-bar"><i data-h="speedbar"></i></div></div>
      <div class="fps" data-h="fps" style="display:${showFps ? 'block' : 'none'}"></div>
      <div data-h="hint"></div>
      <div class="toasts" data-h="toasts"></div>
      <div data-h="count"></div>
    </div>`;
    this.hudEls = {};
    this.hudLayer.querySelectorAll<HTMLElement>('[data-h]').forEach((el) => (this.hudEls[el.dataset.h!] = el));
    // Interactive HUD bits (pause button, touch controls) live in the overlay-free screen layer.
    this.screen.innerHTML = `<button class="icon-btn pause-btn" data-act="pause" aria-label="Pause">${ICONS.pause}</button>${touch ? this.touchControls() : ''}`;
    this.screen.style.pointerEvents = 'none';
    this.screen.querySelectorAll<HTMLElement>('button, .tbtn').forEach((b) => (b.style.pointerEvents = 'auto'));
    this.back = null;
    this.on(this.screen, { pause: () => this.act.pause() });
    this.wireTouch();
  }

  private touchControls(): string {
    return `<div class="touch">
      <div class="tbtn left" data-touch="left">${ICONS.left}</div>
      <div class="tbtn right" data-touch="right">${ICONS.right}</div>
      <div class="tbtn accel" data-touch="accel">${ICONS.up}</div>
      <div class="tbtn brake" data-touch="brake">${ICONS.down}</div>
      <div class="tbtn jump" data-touch="jump">JUMP</div>
    </div>`;
  }

  private wireTouch(): void {
    const pointers = new Map<number, HTMLElement>();
    const set = (el: HTMLElement, down: boolean) => {
      el.classList.toggle('down', down);
      this.act.touch(el.dataset.touch as Action, down);
    };
    this.screen.querySelectorAll<HTMLElement>('[data-touch]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic or already-released pointer */
        }
        pointers.set(e.pointerId, el);
        this.act.unlockAudio();
        set(el, true);
      });
      const up = (e: PointerEvent) => {
        if (pointers.get(e.pointerId) === el) {
          pointers.delete(e.pointerId);
          set(el, false);
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    });
  }

  hideHud(): void {
    this.hudLayer.innerHTML = '';
    this.hudEls = {};
    window.clearTimeout(this.hintTimer);
  }

  updateHud(h: HudState, fps: number): void {
    const e = this.hudEls;
    if (!e.time) return;
    const lives = Array.from({ length: h.maxLives }, (_, i) => `<i class="${i < h.lives ? 'on' : ''}"></i>`).join('');
    const key = `${h.title}|${h.lives}`;
    if (key !== this.lastHud) {
      e.title.textContent = h.title;
      e.lives.innerHTML = lives;
      e.progressWrap.style.display = h.endless ? 'none' : '';
      e.timeLabel.textContent = h.endless ? 'DISTANCE' : 'TIME';
      this.lastHud = key;
    }
    e.time.textContent = h.endless ? `${Math.round(h.distance).toLocaleString()} m` : formatTime(h.time);
    e.score.textContent = h.score.toLocaleString();
    e.orbs.textContent = h.orbs ? `◆ ${h.orbs}` : '';
    e.speed.textContent = String(h.speed);
    e.speedbar.style.width = `${Math.min(100, h.speed01 * 100)}%`;
    e.progress.style.height = `${h.progress * 100}%`;
    const chips = h.effects.map((c) => `<span class="chip" style="color:${this.chipColor(c)}">${c}</span>`).join('');
    if (e.chips.innerHTML !== chips) e.chips.innerHTML = chips;
    if (e.fps.style.display !== 'none') e.fps.textContent = `${fps.toFixed(0)} FPS`;
  }

  setFpsVisible(v: boolean): void {
    if (this.hudEls.fps) this.hudEls.fps.style.display = v ? 'block' : 'none';
  }

  private chipColor(c: string): string {
    if (c.startsWith('BOOST')) return '#ffffff';
    if (c === 'ICE') return TILE_INFO[5].color;
    if (c === 'ACCEL') return TILE_INFO[2].color;
    if (c === 'DRAG') return TILE_INFO[3].color;
    if (c === 'FRAGILE') return TILE_INFO[7].color;
    return '#2de2ff';
  }

  hint(text: string): void {
    const el = this.hudEls.hint;
    if (!el) return;
    el.innerHTML = `<div class="hint-wrap"><div class="hint-banner panel">${esc(text)}</div></div>`;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      if (el) el.innerHTML = '';
    }, 4200);
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const host = this.hudEls.toasts ?? this.modal;
    const t = this.mk('div', `toast ${kind}`);
    t.textContent = text;
    host.appendChild(t);
    while (host.childElementCount > 3) host.firstElementChild?.remove();
    window.setTimeout(() => t.remove(), 1600);
  }

  countdown(n: number): void {
    const el = this.hudEls.count;
    if (!el) return;
    el.innerHTML = `<div class="count-wrap"><div class="countdown">${n === 0 ? 'GO!' : n}</div></div>`;
    if (n === 0) window.setTimeout(() => (el.innerHTML = ''), 700);
  }

  // ------------------------------------------------------------------ pause / results
  showPause(): void {
    const layer = this.setScreen(
      `<div class="screen dim center">
        <div class="panel" style="padding:26px;width:min(380px,90vw)">
          <h2 style="margin-bottom:18px">PAUSED</h2>
          <div class="menu-list" style="margin-top:0;width:100%">
            <button class="btn primary" data-act="resume">Resume</button>
            <button class="btn" data-act="restart">Restart sector</button>
            <button class="btn" data-act="howto">How to play</button>
            <button class="btn" data-act="settings">Settings</button>
            <button class="btn" data-act="quit">Quit to menu</button>
          </div>
        </div>
      </div>`,
      () => this.act.resume(),
      this.overlay,
    );
    this.on(layer, {
      resume: () => this.act.resume(),
      restart: () => this.act.restart(),
      howto: () => this.showHowTo('pause'),
      settings: () => this.showSettings('pause'),
      quit: () => this.act.quitToMenu(),
    });
  }

  hideOverlay(): void {
    this.setScreen('', null, this.overlay);
  }

  showResults(r: RunResult, def: LevelDef, outcome: LevelOutcome, unlocks: string[], hasNext: boolean): void {
    const rec = outcome.record;
    const breakdown = r.breakdown.map((b, i) => `<div style="animation-delay:${0.4 + i * 0.08}s"><span>${esc(b.label)}</span><b style="color:${b.points < 0 ? 'var(--bad)' : 'inherit'}">${b.points > 0 ? '+' : ''}${b.points.toLocaleString()}</b></div>`).join('');
    const layer = this.setScreen(
      `<div class="screen dim center">
        <div class="panel results">
          <div style="text-align:center">${medal(r.medal, true)}<div class="display" style="margin-top:10px;font-size:13px;letter-spacing:0.2em">${MEDAL_NAMES[r.medal].toUpperCase()}</div></div>
          <div>
            <div class="sub">SECTOR ${String(def.id).padStart(2, '0')} CLEARED · ${esc(def.name.toUpperCase())}</div>
            <div class="big-time">${formatTime(r.time)}${outcome.newBestTime ? '<span class="badge">NEW BEST</span>' : ''}</div>
            <div class="sub">Best ${formatTime(rec.bestTime)} · Gold ${formatTime(def.medals.gold)} · Silver ${formatTime(def.medals.silver)} · Orbs ${r.orbs}/${r.totalOrbs}</div>
            <div class="breakdown">${breakdown}<div class="total"><span>SCORE</span><span>${r.score.toLocaleString()}${outcome.newBestScore ? '<span class="badge">RECORD</span>' : ''}</span></div></div>
            ${unlocks.map((u) => `<div class="unlock">UNLOCKED · ${esc(u.toUpperCase())}</div>`).join('')}
            ${r.medal < 3 && r.crashes === 0 && r.time > def.medals.gold ? `<p class="note">Gold needs ${formatTime(def.medals.gold)} — try holding accelerate on safe straights.</p>` : ''}
            ${r.medal < 3 && r.crashes > 0 ? `<p class="note">Gold requires a crash-free run.</p>` : ''}
            <div class="actions">
              ${hasNext ? '<button class="btn primary" data-act="next">Next sector</button>' : '<button class="btn primary" data-act="menu">Campaign complete!</button>'}
              <button class="btn" data-act="retry">Retry</button>
              <button class="btn" data-act="levels">Level select</button>
              ${hasNext ? '<button class="btn" data-act="menu">Menu</button>' : ''}
            </div>
          </div>
        </div>
      </div>`,
      () => this.act.quitToMenu(),
      this.overlay,
    );
    this.on(layer, {
      next: () => this.act.startLevel(def.id + 1),
      retry: () => this.act.restart(),
      levels: () => {
        this.act.quitToMenu();
        this.showLevelSelect();
      },
      menu: () => this.act.quitToMenu(),
    });
  }

  showGameOver(r: RunResult, def: LevelDef | null, endlessBest: boolean): void {
    const title = r.endless ? 'RUN OVER' : 'SIGNAL LOST';
    const breakdown = r.endless ? r.breakdown.map((b) => `<div><span>${esc(b.label)}</span><b>${b.points > 0 ? '+' : ''}${b.points.toLocaleString()}</b></div>`).join('') : '';
    const layer = this.setScreen(
      `<div class="screen dim center">
        <div class="panel" style="padding:26px;width:min(520px,92vw)">
          <h2 style="color:${r.endless ? 'var(--neon)' : 'var(--bad)'};text-shadow:0 0 18px currentColor">${title}</h2>
          <p class="sub" style="color:var(--dim);margin:8px 0 0">${r.endless ? `${Math.round(r.distance).toLocaleString()} m travelled${endlessBest ? ' <span class="badge">NEW BEST</span>' : ''}` : `${esc(def?.name ?? '')} — out of lives after ${formatTime(r.time)}.`}</p>
          ${r.endless ? `<div class="breakdown">${breakdown}<div class="total"><span>SCORE</span><span>${r.score.toLocaleString()}</span></div></div>` : `<p class="note">You reached ${Math.round(r.distance)} m with ${r.orbs} orbs. Checkpoints keep your progress within a run — study the road and try again.</p>`}
          <div class="actions">
            <button class="btn primary" data-act="retry">${r.endless ? 'New run' : 'Try again'}</button>
            <button class="btn" data-act="menu">Menu</button>
          </div>
        </div>
      </div>`,
      () => this.act.quitToMenu(),
      this.overlay,
    );
    this.on(layer, { retry: () => this.act.restart(), menu: () => this.act.quitToMenu() });
  }

  // ------------------------------------------------------------------ modal
  confirm(title: string, text: string, yes: string, onYes: () => void): void {
    this.modal.innerHTML = `<div class="modal-wrap"><div class="panel modal"><h2 style="font-size:22px">${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn danger" data-act="yes">${esc(yes)}</button><button class="btn" data-act="no" autofocus>Cancel</button></div></div></div>`;
    this.modal.style.pointerEvents = 'auto';
    this.modal.querySelector<HTMLElement>('[data-act="no"]')?.focus();
    this.on(this.modal, {
      yes: () => {
        this.closeModal();
        onYes();
      },
      no: () => this.closeModal(),
    });
  }

  closeModal(): void {
    this.modal.innerHTML = '';
    this.modal.style.pointerEvents = 'none';
  }

  fatal(title: string, html: string): void {
    this.setScreen(`<div class="screen center"><div class="panel fatal"><h2>${esc(title)}</h2>${html}</div></div>`, null);
  }

  get returnTarget(): 'menu' | 'pause' {
    return this.returnTo;
  }
}

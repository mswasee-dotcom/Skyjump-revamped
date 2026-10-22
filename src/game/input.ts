import type { Action } from '../core/save';
import type { DriveInput } from '../core/physics';

/**
 * Unified input: keyboard (remappable), gamepad (standard mapping) and on-screen touch controls.
 * Continuous actions are polled; one-shot actions (jump, pause, restart) are queued as presses so
 * a quick tap between frames is never lost.
 */
export class Input {
  private held = new Set<Action>();
  private touchHeld = new Set<Action>();
  private presses = new Set<Action>();
  private keyMap = new Map<string, Action>();
  private capture: ((code: string) => void) | null = null;
  private padPrev = new Map<number, boolean>();
  private padSteer = 0;
  private padThrottle = 0;
  /** Gamepad menu navigation events, consumed by the menus. */
  menuEvents: Array<'up' | 'down' | 'confirm' | 'back'> = [];
  /** Fires for any key/button press (used by menus to unlock audio and navigate). */
  onAnyPress: (() => void) | null = null;
  /** Return true to mark the key as handled (it then won't trigger a game action). */
  onKeyDown: ((e: KeyboardEvent) => boolean | void) | null = null;
  enabled = true;

  constructor(keys: Record<Action, string[]>) {
    this.setKeys(keys);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.clear);
  }

  setKeys(keys: Record<Action, string[]>): void {
    this.keyMap.clear();
    for (const [action, codes] of Object.entries(keys) as Array<[Action, string[]]>) {
      for (const c of codes) if (c) this.keyMap.set(c, action);
    }
  }

  /** Capture the next key press for rebinding. Escape cancels (passes ''). */
  captureNext(cb: (code: string) => void): void {
    this.capture = cb;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  private keydown = (e: KeyboardEvent): void => {
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code === 'Escape' ? '' : e.code);
      return;
    }
    this.onAnyPress?.();
    if (this.onKeyDown?.(e) === true) return;
    const a = this.keyMap.get(e.code);
    if (!a) return;
    // Keep the page from scrolling with arrows/space while playing.
    if (e.target === document.body || (e.target as HTMLElement)?.tagName === 'CANVAS') e.preventDefault();
    if (!e.repeat) this.presses.add(a);
    this.held.add(a);
  };

  private keyup = (e: KeyboardEvent): void => {
    const a = this.keyMap.get(e.code);
    if (a) this.held.delete(a);
  };

  private clear = (): void => {
    this.held.clear();
    this.touchHeld.clear();
  };

  setTouch(a: Action, down: boolean): void {
    if (down) {
      if (!this.touchHeld.has(a)) this.presses.add(a);
      this.touchHeld.add(a);
      this.onAnyPress?.();
    } else this.touchHeld.delete(a);
  }

  pressTouch(a: Action): void {
    this.presses.add(a);
    this.onAnyPress?.();
  }

  /** Poll gamepads; call once per frame. */
  pollGamepads(): void {
    this.padSteer = 0;
    this.padThrottle = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      const dead = Math.abs(ax) < 0.18 ? 0 : ax;
      let steer = dead;
      if (p.buttons[14]?.pressed) steer = -1;
      if (p.buttons[15]?.pressed) steer = 1;
      if (Math.abs(steer) > Math.abs(this.padSteer)) this.padSteer = steer;
      const rt = p.buttons[7]?.value ?? 0;
      const lt = p.buttons[6]?.value ?? 0;
      const up = p.buttons[12]?.pressed ? 1 : 0;
      const down = p.buttons[13]?.pressed ? 1 : 0;
      const thr = Math.max(rt, up) - Math.max(lt, down);
      if (Math.abs(thr) > Math.abs(this.padThrottle)) this.padThrottle = thr;
      const edge = (btn: number, action: Action | null, menu?: 'up' | 'down' | 'confirm' | 'back') => {
        const key = p.index * 100 + btn;
        const now = !!p.buttons[btn]?.pressed;
        if (now && !this.padPrev.get(key)) {
          if (action) this.presses.add(action);
          if (menu) this.menuEvents.push(menu);
          this.onAnyPress?.();
        }
        this.padPrev.set(key, now);
      };
      edge(0, 'jump', 'confirm');
      edge(1, null, 'back');
      edge(9, 'pause');
      edge(3, 'restart');
      edge(12, null, 'up');
      edge(13, null, 'down');
    }
  }

  isHeld(a: Action): boolean {
    return this.held.has(a) || this.touchHeld.has(a);
  }

  /** Consume a queued press. */
  consume(a: Action): boolean {
    if (!this.presses.has(a)) return false;
    this.presses.delete(a);
    return true;
  }

  clearPresses(): void {
    this.presses.clear();
  }

  drive(): DriveInput {
    if (!this.enabled) return { steer: 0, throttle: 0, jumpPressed: false };
    let steer = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    if (steer === 0) steer = this.padSteer;
    let throttle = (this.isHeld('accel') ? 1 : 0) - (this.isHeld('brake') ? 1 : 0);
    if (throttle === 0) throttle = this.padThrottle;
    return { steer, throttle, jumpPressed: false };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.clear);
  }
}

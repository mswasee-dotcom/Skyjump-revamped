import * as THREE from 'three';
import { TileType } from '../core/tiles';

/**
 * Textures for the Arcade look: flat colours, a bevelled edge and bold, simple symbols,
 * drawn as clean vector shapes at 64×128 (lane width : row length) and filtered smoothly.
 */
const TW = 64;
const TH = 128;

type RGB = [number, number, number];

export function hexToRgb(hex: string | number): RGB {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const shade = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Standard-tile colour for a sector: its theme hue pulled toward steel grey. */
export function retroBase(neon: number): RGB {
  return shade(mix(hexToRgb(neon), [112, 120, 140], 0.35), 0.85);
}

export const RETRO_COLORS: Partial<Record<TileType, { fill: RGB; mark: RGB }>> = {
  [TileType.Accel]: { fill: [46, 150, 78], mark: [170, 255, 185] },
  [TileType.Slow]: { fill: [176, 98, 34], mark: [72, 34, 8] },
  [TileType.Boost]: { fill: [208, 230, 255], mark: [40, 120, 255] },
  [TileType.Jump]: { fill: [218, 180, 36], mark: [74, 50, 0] },
  [TileType.Ice]: { fill: [156, 218, 242], mark: [255, 255, 255] },
  [TileType.Hazard]: { fill: [196, 24, 50], mark: [80, 0, 16] },
  [TileType.Fragile]: { fill: [124, 74, 180], mark: [44, 14, 80] },
};

function canvas(w = TW, h = TH): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Solid fill with a bevelled edge: light top-left, dark bottom-right. */
function bevel(ctx: CanvasRenderingContext2D, fill: RGB, w = TW, h = TH, b = 4): void {
  ctx.fillStyle = css(fill);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(shade(fill, 1.3));
  ctx.fillRect(0, 0, w, b);
  ctx.fillRect(0, 0, b, h);
  ctx.fillStyle = css(shade(fill, 0.58));
  ctx.fillRect(0, h - b, w, b);
  ctx.fillRect(w - b, 0, b, h);
}

function chevron(ctx: CanvasRenderingContext2D, cy: number, up: boolean, color: RGB): void {
  const d = up ? -1 : 1;
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.moveTo(32, cy + d * 10);
  ctx.lineTo(52, cy - d * 6);
  ctx.lineTo(52, cy + d * 4);
  ctx.lineTo(32, cy + d * 20);
  ctx.lineTo(12, cy + d * 4);
  ctx.lineTo(12, cy - d * 6);
  ctx.closePath();
  ctx.fill();
}

export function drawRetroTile(type: TileType, base: RGB): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const spec = RETRO_COLORS[type];
  const fill = spec?.fill ?? base;
  const mark = spec?.mark ?? shade(base, 1.4);

  if (type === TileType.Finish) {
    const s = 16;
    for (let y = 0; y < TH; y += s) for (let x = 0; x < TW; x += s) {
      ctx.fillStyle = ((x + y) / s) % 2 === 0 ? '#f0f0f0' : '#181818';
      ctx.fillRect(x, y, s, s);
    }
    return c;
  }

  bevel(ctx, fill);
  switch (type) {
    case TileType.Standard:
      ctx.strokeStyle = css(shade(base, 0.82));
      ctx.lineWidth = 2;
      ctx.strokeRect(13, 13, TW - 26, TH - 26);
      break;
    case TileType.Checkpoint:
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(8, 54, TW - 16, 12);
      break;
    case TileType.Accel:
      chevron(ctx, 34, true, mark);
      chevron(ctx, 64, true, mark);
      chevron(ctx, 94, true, mark);
      break;
    case TileType.Slow:
      chevron(ctx, 24, false, mark);
      chevron(ctx, 54, false, mark);
      chevron(ctx, 84, false, mark);
      break;
    case TileType.Boost:
      ctx.fillStyle = css(mark);
      for (let i = 0; i < 4; i++) ctx.fillRect(12, 18 + i * 26, TW - 24, 8);
      break;
    case TileType.Jump:
      ctx.fillStyle = css(mark);
      ctx.beginPath();
      ctx.moveTo(32, 36);
      ctx.lineTo(52, 60);
      ctx.lineTo(40, 60);
      ctx.lineTo(40, 92);
      ctx.lineTo(24, 92);
      ctx.lineTo(24, 60);
      ctx.lineTo(12, 60);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(12, 24, TW - 24, 4);
      ctx.fillRect(12, 100, TW - 24, 4);
      break;
    case TileType.Ice:
      ctx.strokeStyle = css(mark);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[12, 16, 32, 36], [36, 70, 52, 86], [16, 94, 28, 106]]) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      break;
    case TileType.Hazard:
      ctx.save();
      ctx.beginPath();
      ctx.rect(4, 4, TW - 8, TH - 8);
      ctx.clip();
      ctx.fillStyle = css(mark);
      for (let i = -TH; i < TW + TH; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 12, 0);
        ctx.lineTo(i + 12 - TH, TH);
        ctx.lineTo(i - TH, TH);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    case TileType.Fragile:
      ctx.strokeStyle = css(mark);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(16, 12);
      ctx.lineTo(28, 40);
      ctx.lineTo(22, 62);
      ctx.lineTo(40, 84);
      ctx.lineTo(34, 116);
      ctx.moveTo(28, 40);
      ctx.lineTo(48, 52);
      ctx.moveTo(22, 62);
      ctx.lineTo(10, 74);
      ctx.stroke();
      ctx.fillStyle = css(mark);
      for (let y = 10; y < TH - 10; y += 16) {
        ctx.fillRect(5, y, 4, 8);
        ctx.fillRect(TW - 9, y, 4, 8);
      }
      break;
  }
  return c;
}

/** Side of a slab or block: a darker face with a lighter lip. Walls get warning stripes. */
export function drawRetroSide(base: RGB, wall: boolean): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 32);
  const face = wall ? ([96, 100, 116] as RGB) : shade(base, 0.6);
  ctx.fillStyle = css(face);
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = css(shade(face, 1.45));
  ctx.fillRect(0, 0, 64, 4);
  if (wall) {
    ctx.fillStyle = '#d8b020';
    for (let x = -32; x < 64; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 8, 32);
      ctx.lineTo(x + 32, 8);
      ctx.lineTo(x + 24, 8);
      ctx.closePath();
      ctx.fill();
    }
  }
  return c;
}

export function cleanTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Planet with a few flat colour bands (arcade-style posterisation, smooth edges). */
export function retroPlanet(a: number, b: number, seed: number, levels = 6): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  for (let y = 0; y < 128; y++) {
    const t = 0.5 + 0.5 * Math.sin(y * 0.14 + Math.sin(y * 0.05) * 2 + seed);
    const q = Math.round(t * (levels - 1)) / (levels - 1);
    ctx.fillStyle = css(mix(ca, cb, q * 0.85));
    ctx.fillRect(0, y, 256, 1);
  }
  return cleanTexture(c);
}

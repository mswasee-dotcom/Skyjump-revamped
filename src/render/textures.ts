import * as THREE from 'three';
import { TileType, TILE_INFO } from '../core/tiles';

/**
 * All textures are drawn procedurally on canvases at startup: no image assets, no licensing
 * questions, and every tile type gets a distinct, readable symbol.
 * Canvas "up" maps to the forward (-Z) direction of a tile's top face.
 */
const W = 160;
const H = 256;

function canvas(w = W, h = H): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function glowStroke(ctx: CanvasRenderingContext2D, color: string, width: number, blur: number, path: () => void): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.restore();
}

function base(ctx: CanvasRenderingContext2D, tint: string, dark = '#070a16'): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark);
  g.addColorStop(1, '#10162c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // faint tint wash
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function border(ctx: CanvasRenderingContext2D, color: string, dashed = false): void {
  ctx.save();
  if (dashed) ctx.setLineDash([18, 12]);
  glowStroke(ctx, color, 6, 16, () => ctx.rect(7, 7, W - 14, H - 14));
  ctx.restore();
}

function chevrons(ctx: CanvasRenderingContext2D, color: string, up: boolean, count: number): void {
  const step = H / (count + 1);
  for (let i = 1; i <= count; i++) {
    const y = i * step;
    const dy = up ? 26 : -26;
    glowStroke(ctx, color, 12, 14, () => {
      ctx.moveTo(W * 0.22, y + dy / 2);
      ctx.lineTo(W * 0.5, y - dy / 2);
      ctx.lineTo(W * 0.78, y + dy / 2);
    });
  }
}

export function drawTile(type: TileType): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const col = TILE_INFO[type].color;
  switch (type) {
    case TileType.Standard:
    case TileType.Checkpoint: {
      base(ctx, col);
      ctx.strokeStyle = 'rgba(45,226,255,0.10)';
      ctx.lineWidth = 2;
      for (let x = 40; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 32; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      border(ctx, col);
      if (type === TileType.Checkpoint) {
        for (let i = 0; i < 3; i++) glowStroke(ctx, '#ffffff', 8, 18, () => {
          ctx.moveTo(18, 70 + i * 55);
          ctx.lineTo(W - 18, 70 + i * 55);
        });
      }
      break;
    }
    case TileType.Accel:
      base(ctx, col);
      border(ctx, col);
      chevrons(ctx, col, true, 3);
      break;
    case TileType.Slow:
      base(ctx, col);
      border(ctx, col);
      chevrons(ctx, col, false, 3);
      break;
    case TileType.Boost: {
      base(ctx, '#2de2ff', '#0a1430');
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, 'rgba(45,226,255,0.1)');
      g.addColorStop(1, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(14, 14, W - 28, H - 28);
      border(ctx, '#ffffff');
      for (let i = 0; i < 3; i++) {
        const y = 60 + i * 64;
        glowStroke(ctx, '#ffffff', 14, 22, () => {
          ctx.moveTo(W * 0.18, y + 22);
          ctx.lineTo(W * 0.5, y - 14);
          ctx.lineTo(W * 0.82, y + 22);
        });
      }
      break;
    }
    case TileType.Jump: {
      base(ctx, col);
      border(ctx, col);
      glowStroke(ctx, col, 10, 18, () => ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2));
      glowStroke(ctx, col, 12, 16, () => {
        ctx.moveTo(W / 2, H / 2 + 32);
        ctx.lineTo(W / 2, H / 2 - 32);
        ctx.moveTo(W / 2 - 24, H / 2 - 8);
        ctx.lineTo(W / 2, H / 2 - 32);
        ctx.lineTo(W / 2 + 24, H / 2 - 8);
      });
      break;
    }
    case TileType.Ice: {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#2a5a7a');
      g.addColorStop(0.5, '#6fb7d9');
      g.addColorStop(1, '#2a4a6a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(230,250,255,0.55)';
      ctx.lineWidth = 2;
      const pts = [
        [10, 40, 90, 120], [90, 120, 150, 60], [90, 120, 60, 210], [60, 210, 140, 250], [60, 210, 10, 170], [150, 60, 120, 0],
      ];
      for (const [a, b, d, e] of pts) {
        ctx.beginPath();
        ctx.moveTo(a, b);
        ctx.lineTo(d, e);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(70, 20);
      ctx.lineTo(20, 90);
      ctx.fill();
      border(ctx, col);
      break;
    }
    case TileType.Hazard: {
      ctx.fillStyle = '#2a0412';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(10, 10, W - 20, H - 20);
      ctx.clip();
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      for (let i = -H; i < W + H; i += 44) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 22, 0);
        ctx.lineTo(i + 22 - H, H);
        ctx.lineTo(i - H, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      border(ctx, '#ffd0de');
      break;
    }
    case TileType.Fragile: {
      base(ctx, col, '#0d0618');
      border(ctx, col, true);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      const cracks = [
        [[30, 30], [62, 90], [50, 140], [80, 200]],
        [[62, 90], [120, 110], [140, 170]],
        [[50, 140], [20, 190]],
        [[120, 110], [130, 40]],
      ];
      for (const line of cracks) {
        ctx.beginPath();
        ctx.moveTo(line[0][0], line[0][1]);
        for (const [x, y] of line.slice(1)) ctx.lineTo(x, y);
        ctx.stroke();
      }
      break;
    }
    case TileType.Finish: {
      const s = 32;
      for (let y = 0; y < H; y += s) {
        for (let x = 0; x < W; x += s) {
          ctx.fillStyle = ((x + y) / s) % 2 === 0 ? '#f4f8ff' : '#0b0f1e';
          ctx.fillRect(x, y, s, s);
        }
      }
      border(ctx, '#ffffff');
      break;
    }
    default:
      base(ctx, '#000');
  }
  return c;
}

/** Side faces of slabs and blocks: dark plating with a glowing top rim. */
export function drawSide(color: string, wall = false): HTMLCanvasElement {
  const [c, ctx] = canvas(128, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#1a2140');
  g.addColorStop(1, '#05070f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  if (wall) {
    ctx.fillStyle = 'rgba(255,45,111,0.55)';
    for (let x = -64; x < 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 16, 64);
      ctx.lineTo(x + 48, 32);
      ctx.lineTo(x + 32, 32);
      ctx.fill();
    }
  }
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillRect(0, 0, 128, 5);
  return c;
}

export function canvasTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Soft radial blob used for glows, particles and nebulae. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c);
}

/** Banded gas-giant / rocky planet surface. */
export function planetTexture(a: number, b: number, seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y++) {
    const t = 0.5 + 0.5 * Math.sin(y * 0.09 + Math.sin(y * 0.031) * 3 + seed);
    const col = ca.clone().lerp(cb, t * 0.85 + rand() * 0.1);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, y, 512, 1);
  }
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
    ctx.beginPath();
    ctx.ellipse(rand() * 512, rand() * 256, 20 + rand() * 60, 3 + rand() * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvasTexture(c);
}

export function ringTexture(color: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 16);
  const col = new THREE.Color(color);
  for (let x = 0; x < 256; x++) {
    const a = 0.15 + 0.5 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037));
    ctx.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 16);
  }
  return canvasTexture(c);
}

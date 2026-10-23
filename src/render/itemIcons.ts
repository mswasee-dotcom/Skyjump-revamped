import { ItemKind, info } from '../core/items';

/** Canvas-drawn power-up badges (used by the 3D sprites and the How to Play legend). */
const cache = new Map<string, HTMLCanvasElement>();

export function itemIconCanvas(kind: ItemKind, size = 128): HTMLCanvasElement {
  const key = `${kind}:${size}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  drawItemIcon(c.getContext('2d')!, kind, size);
  cache.set(key, c);
  return c;
}

export function itemIconUrl(kind: ItemKind, size = 96): string {
  return itemIconCanvas(kind, size).toDataURL();
}

export function drawItemIcon(g: CanvasRenderingContext2D, kind: ItemKind, size: number): void {
  const col = info(kind).color;
  const s = size / 128;
  g.save();
  g.scale(s, s);
  // Badge: dark disc, coloured ring, white inner ring.
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fillStyle = '#0b0f24';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = col;
  g.stroke();
  g.beginPath();
  g.arc(64, 64, 48, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.stroke();

  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case ItemKind.Shield:
      g.beginPath();
      g.moveTo(64, 30);
      g.lineTo(92, 40);
      g.quadraticCurveTo(92, 82, 64, 98);
      g.quadraticCurveTo(36, 82, 36, 40);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(64, 40);
      g.lineTo(82, 46);
      g.quadraticCurveTo(82, 76, 64, 88);
      g.closePath();
      g.globalAlpha = 0.55;
      g.fill();
      g.globalAlpha = 1;
      break;
    case ItemKind.Magnet:
      g.lineWidth = 16;
      g.lineCap = 'butt';
      g.beginPath();
      g.arc(64, 62, 22, Math.PI, 0, true);
      g.moveTo(42, 62);
      g.lineTo(42, 40);
      g.moveTo(86, 62);
      g.lineTo(86, 40);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(34, 30, 16, 12);
      g.fillRect(78, 30, 16, 12);
      break;
    case ItemKind.Wings: {
      const wing = (dir: number) => {
        g.beginPath();
        g.moveTo(64 + dir * 6, 74);
        g.quadraticCurveTo(64 + dir * 20, 36, 64 + dir * 44, 38);
        g.quadraticCurveTo(64 + dir * 40, 52, 64 + dir * 32, 54);
        g.quadraticCurveTo(64 + dir * 38, 60, 64 + dir * 28, 66);
        g.quadraticCurveTo(64 + dir * 30, 72, 64 + dir * 20, 78);
        g.closePath();
        g.fill();
      };
      wing(-1);
      wing(1);
      g.fillStyle = '#7dfcff';
      g.beginPath();
      g.moveTo(64, 62);
      g.lineTo(72, 86);
      g.lineTo(56, 86);
      g.closePath();
      g.fill();
      break;
    }
    case ItemKind.Nitro:
      g.beginPath();
      g.moveTo(72, 24);
      g.lineTo(42, 70);
      g.lineTo(62, 70);
      g.lineTo(54, 104);
      g.lineTo(88, 54);
      g.lineTo(67, 54);
      g.closePath();
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
      break;
    case ItemKind.Multiplier:
      g.font = 'bold 46px Orbitron, "Press Start 2P", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('2×', 64, 67);
      break;
    case ItemKind.Life:
      g.beginPath();
      g.moveTo(64, 98);
      g.bezierCurveTo(28, 74, 28, 38, 50, 38);
      g.bezierCurveTo(58, 38, 62, 44, 64, 50);
      g.bezierCurveTo(66, 44, 70, 38, 78, 38);
      g.bezierCurveTo(100, 38, 100, 74, 64, 98);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath();
      g.arc(50, 52, 6, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      break;
  }
  g.restore();
}

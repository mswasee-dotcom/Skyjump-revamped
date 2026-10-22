/**
 * Visual style presets. Gameplay is identical across styles; only presentation changes.
 *  - arcade: the default — flat, solid-colour bevelled tiles with clear symbols, banded planets,
 *            plain starfield, no bloom. Retro arcade feel, rendered clean at full resolution.
 *  - neon:   the glowing synthwave grid with bloom.
 */
export type VisualStyle = 'arcade' | 'neon';

export interface StyleSpec {
  label: string;
  blurb: string;
  /** Flat-shaded, solid-colour arcade rendering (false = glowing neon materials). */
  flat: boolean;
  bloom: boolean;
  nebula: boolean;
  /** Use the retro pixel display font in the interface. */
  pixelFont: boolean;
}

export const STYLES: Record<VisualStyle, StyleSpec> = {
  arcade: {
    label: 'Arcade',
    blurb: 'Solid-colour blocks, clear tile symbols, banded planets.',
    flat: true,
    bloom: false,
    nebula: false,
    pixelFont: true,
  },
  neon: {
    label: 'Neon',
    blurb: 'Glowing synthwave grid with bloom.',
    flat: false,
    bloom: true,
    nebula: true,
    pixelFont: false,
  },
};

export const STYLE_ORDER: VisualStyle[] = ['arcade', 'neon'];

let current: VisualStyle = 'arcade';
export function setStyle(s: VisualStyle): void {
  current = s;
}
export function style(): StyleSpec {
  return STYLES[current];
}
export function styleId(): VisualStyle {
  return current;
}

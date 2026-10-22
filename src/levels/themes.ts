/**
 * Per-sector visual identity. Pure data so it can be imported by tests without Three.js.
 * A theme's `neon` tints the standard tiles, so it must never match a colour that a special
 * tile uses to communicate (green accel, orange drag, yellow launch, pale-blue ice, red plasma,
 * violet fragile, white boost).
 */
export type ThemeId =
  | 'dawn'
  | 'rift'
  | 'thermal'
  | 'frost'
  | 'vanish'
  | 'hazard'
  | 'speed'
  | 'broken'
  | 'descent'
  | 'final'
  | 'endless';

export interface Theme {
  /** Background / fog colour at the horizon. */
  sky: number;
  /** Deep space colour overhead. */
  skyTop: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** Primary neon used for track edges, gates and HUD accents. */
  neon: number;
  /** Secondary neon. */
  neon2: number;
  /** Planets: [radius, x, y, z, colorA, colorB, ring] */
  planets: Array<{ r: number; pos: [number, number, number]; a: number; b: number; ring?: boolean }>;
  nebula: number;
  starDensity: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  dawn: {
    sky: 0x0b1030, skyTop: 0x02030a, fog: 0x0b1030, fogNear: 60, fogFar: 240,
    neon: 0x2de2ff, neon2: 0x8f5bff,
    planets: [
      { r: 70, pos: [-180, 30, -520], a: 0x3a6bff, b: 0x0b1550, ring: true },
      { r: 14, pos: [120, 80, -400], a: 0xffb36b, b: 0x6b2a10 },
    ],
    nebula: 0x3b2a8a, starDensity: 1,
  },
  rift: {
    sky: 0x120a2a, skyTop: 0x030108, fog: 0x120a2a, fogNear: 55, fogFar: 220,
    neon: 0x6f7bff, neon2: 0x2de2ff,
    planets: [
      { r: 110, pos: [220, -40, -620], a: 0x8a3bff, b: 0x1a0640 },
      { r: 10, pos: [-90, 60, -300], a: 0xd9e3ff, b: 0x51608a },
    ],
    nebula: 0x6a1f8a, starDensity: 1.2,
  },
  thermal: {
    sky: 0x2a0d14, skyTop: 0x090205, fog: 0x2a0d14, fogNear: 55, fogFar: 230,
    neon: 0xff4fd8, neon2: 0x39ff88,
    planets: [
      { r: 95, pos: [-200, 10, -560], a: 0xff6a2d, b: 0x501008 },
      { r: 22, pos: [150, 70, -420], a: 0xffd36b, b: 0x8a4a10, ring: true },
    ],
    nebula: 0x8a2a1f, starDensity: 0.8,
  },
  frost: {
    sky: 0x0b2236, skyTop: 0x01060c, fog: 0x0f2a40, fogNear: 50, fogFar: 210,
    neon: 0x5b8cff, neon2: 0x5b8cff,
    planets: [
      { r: 85, pos: [190, 40, -540], a: 0xcff4ff, b: 0x2a5a80, ring: true },
      { r: 16, pos: [-140, 90, -380], a: 0x8ab8ff, b: 0x1a2a60 },
    ],
    nebula: 0x1f5a8a, starDensity: 1.3,
  },
  vanish: {
    sky: 0x1a0b2a, skyTop: 0x05020a, fog: 0x1a0b2a, fogNear: 50, fogFar: 220,
    neon: 0x2dffd8, neon2: 0xff4fd8,
    planets: [
      { r: 130, pos: [-250, -60, -680], a: 0xc04fff, b: 0x200840 },
      { r: 12, pos: [110, 50, -330], a: 0xffe0ff, b: 0x7a3a8a },
    ],
    nebula: 0x8a1f7a, starDensity: 1.1,
  },
  hazard: {
    sky: 0x260614, skyTop: 0x070105, fog: 0x260614, fogNear: 50, fogFar: 210,
    neon: 0x5bc0ff, neon2: 0xffd02d,
    planets: [
      { r: 100, pos: [210, 20, -580], a: 0xff2d4f, b: 0x400614 },
      { r: 30, pos: [-170, 100, -460], a: 0xff9a5b, b: 0x501a08 },
    ],
    nebula: 0x8a0f3a, starDensity: 0.9,
  },
  speed: {
    sky: 0x041a24, skyTop: 0x010508, fog: 0x041a24, fogNear: 70, fogFar: 260,
    neon: 0x6bffe0, neon2: 0x2de2ff,
    planets: [
      { r: 75, pos: [-160, 50, -520], a: 0x39ffb0, b: 0x05402a, ring: true },
      { r: 12, pos: [150, 20, -350], a: 0xe0fff0, b: 0x2a6a50 },
    ],
    nebula: 0x0f6a5a, starDensity: 1.4,
  },
  broken: {
    sky: 0x1a1406, skyTop: 0x050401, fog: 0x1a1406, fogNear: 55, fogFar: 220,
    neon: 0xff8adf, neon2: 0xff4fd8,
    planets: [
      { r: 120, pos: [230, -30, -640], a: 0xffb02d, b: 0x402a06 },
      { r: 18, pos: [-130, 80, -380], a: 0xff7a5b, b: 0x501a14, ring: true },
    ],
    nebula: 0x6a4a0f, starDensity: 1,
  },
  descent: {
    sky: 0x06142a, skyTop: 0x010309, fog: 0x081a34, fogNear: 55, fogFar: 230,
    neon: 0x5b8cff, neon2: 0x2dffd8,
    planets: [
      { r: 160, pos: [0, -180, -700], a: 0x2d6aff, b: 0x050f40, ring: true },
      { r: 14, pos: [160, 90, -400], a: 0xffffff, b: 0x6a7a9a },
    ],
    nebula: 0x1f3a8a, starDensity: 1.2,
  },
  final: {
    sky: 0x1a0620, skyTop: 0x040106, fog: 0x1a0620, fogNear: 55, fogFar: 230,
    neon: 0xff4fd8, neon2: 0x2de2ff,
    planets: [
      { r: 140, pos: [-230, 10, -640], a: 0xff4fd8, b: 0x30062a, ring: true },
      { r: 60, pos: [200, 90, -560], a: 0x2de2ff, b: 0x062a40 },
    ],
    nebula: 0x8a1f8a, starDensity: 1.5,
  },
  endless: {
    sky: 0x0a0a24, skyTop: 0x020208, fog: 0x0a0a24, fogNear: 60, fogFar: 240,
    neon: 0x2de2ff, neon2: 0xff4fd8,
    planets: [
      { r: 90, pos: [200, 30, -560], a: 0x5b6bff, b: 0x0a0f40, ring: true },
      { r: 20, pos: [-150, 80, -420], a: 0xff8adf, b: 0x401030 },
    ],
    nebula: 0x3a1f8a, starDensity: 1.2,
  },
};

import type { Age } from '../sim/types';

/**
 * TEXEL DENSITY
 * The game is authored on a two-pixel texel grid: one authored art pixel is
 * always exactly 2 canvas pixels at native resolution. Every sprite, backdrop,
 * prop and projectile obeys this rule, which is what stops the scene from
 * looking like several different artists pasted assets on top of each other.
 */
export const PIXEL_SCALE = 2;

/**
 * The single ink colour used for every silhouette outline in the game. It is
 * deliberately age-independent so units never look like floating cut-outs.
 */
export const OUTLINE = 0x1a1528;
export const OUTLINE_HEX = '#1a1528';

/**
 * Team cloth. These two colours are the single deliberate addition to the
 * eight-per-age fill palettes: player and enemy units, flags and tower
 * heraldry all use them, so the player can instantly tell whose army is whose
 * in any age without every sprite being washed out by a full-body tint.
 */
export const TEAM_COLORS = { player: 0x53b6ff, ai: 0xff5b5b } as const;
export type TeamColor = (typeof TEAM_COLORS)[keyof typeof TEAM_COLORS];

export interface AgePalette {
  dark: number;
  panel: number;
  mid: number;
  edge: number;
  body: number;
  accent: number;
  light: number;
  highlight: number;
}

/**
 * Eight fill colours per age. Gameplay art (units, towers, projectiles, props,
 * particles and UI chrome) samples exclusively from these eight values, plus
 * the universal OUTLINE ink above.
 */
export const AGE_PALETTES: Record<Age, AgePalette> = {
  stone: {
    dark: 0x171009,
    panel: 0x2b1e12,
    mid: 0x4d3720,
    edge: 0x8a5a2c,
    body: 0xb08354,
    accent: 0xd9a25e,
    light: 0xffe0b0,
    highlight: 0xf4c85b,
  },
  medieval: {
    dark: 0x0a0f1f,
    panel: 0x161d33,
    mid: 0x2a3660,
    edge: 0x425aa8,
    body: 0x7a8fcf,
    accent: 0xffd166,
    light: 0xffe9b0,
    highlight: 0xd64a4a,
  },
  modern: {
    dark: 0x050d12,
    panel: 0x0a1a20,
    mid: 0x123340,
    edge: 0x16c0b3,
    body: 0x38fff0,
    accent: 0xc8fff8,
    light: 0xffb648,
    highlight: 0xef5350,
  },
};

/**
 * The eight "character" colours above are deliberately tight: they are what
 * makes units and HUD chrome read as a single family. Landscapes need a wider
 * range than eight values or every backdrop collapses into a sepia smear
 * (jungle greens, dusk sky ramps, wet stone). These are the landscape colours
 * for each age — chosen in the same hue family as the palette above, and
 * sampled by `scripts/build-backdrops.ts` when the panoramas are posterised.
 */
export const BACKDROP_EXTRA: Record<Age, number[]> = {
  stone: [
    // jungle
    0x1d2a14, 0x2f4a1c, 0x466c26, 0x638f34, 0x8fb84a,
    // dusk sky ramp
    0x3a2450, 0x6d2f4e, 0xb04a3c, 0xe0723a, 0xff9c45, 0xffc873,
    // volcano
    0xff5324, 0xffb02e,
    // rock / ash / river
    0x6d6a70, 0xa9a3ad, 0x4c5866,
  ],
  medieval: [
    // sky
    0x1f4d8c, 0x3d7cc0, 0x6fb0e0, 0xa8d8f2, 0xe6f6ff,
    // meadow
    0x1f3a22, 0x2f5a2c, 0x4a7f37, 0x6ba544, 0x94c65a,
    // road
    0x4a3a24, 0x6f5735, 0x97794b,
    // castle stone
    0x76808f, 0xa7aebb, 0xcfd5df,
  ],
  modern: [
    // night sky / smog
    0x0c1420, 0x141f2e, 0x1f2d40, 0x2e3f56, 0x46576f, 0x64748c,
    0x0e2a3a, 0x12455c,
    // fire
    0xff7a1a, 0xffb648, 0xffe2a0, 0xff4a2a,
    // neon
    0x27e0d0, 0x8ffcf2,
    // war rift
    0x6a2c86, 0xa846c8,
  ],
};

/**
 * Lane terrain shades. Fields, tracks, flagstones and asphalt are drawn with
 * these so the ground a unit stands on belongs to the same landscape as the
 * painted sky band behind it, while units and towers keep the tight eight-colour
 * character palette above.
 */
export interface LanePalette {
  /** Furthest field band, right under the horizon. */
  fieldFar: number;
  field: number;
  fieldNear: number;
  track: number;
  trackEdge: number;
  detail: number;
  accent: number;
}

export const LANE_PALETTES: Record<Age, LanePalette> = {
  stone: {
    fieldFar: 0x2f4a1c, field: 0x466c26, fieldNear: 0x3a5a20,
    track: 0x6f5735, trackEdge: 0x4a3a24,
    detail: 0x638f34, accent: 0x8fb84a,
  },
  medieval: {
    fieldFar: 0x2f5a2c, field: 0x4a7f37, fieldNear: 0x3d6b2e,
    track: 0x6f5735, trackEdge: 0x4a3a24,
    detail: 0x6ba544, accent: 0x94c65a,
  },
  modern: {
    fieldFar: 0x243244, field: 0x3a4a63, fieldNear: 0x2c3b50,
    track: 0x54657f, trackEdge: 0x243244,
    detail: 0x66788f, accent: 0x16c0b3,
  },
};

export function lanePaletteFor(age: Age): LanePalette {
  return LANE_PALETTES[age];
}

export function paletteFor(age: Age): AgePalette {
  return AGE_PALETTES[age];
}

export function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Every colour an age may legitimately draw with: 8 character + landscape set. */
export function fullPalette(age: Age): number[] {
  return [...Object.values(AGE_PALETTES[age]), ...BACKDROP_EXTRA[age]];
}

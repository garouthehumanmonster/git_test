import type { Age } from '../sim/types';

/**
 * The game is authored on a two-pixel texel grid. OUTLINE is intentionally
 * universal: it is the single ink colour used to keep every silhouette legible.
 * The eight remaining colours are the complete fill palette for each age.
 */
export const PIXEL_SCALE = 2;
export const OUTLINE = 0x1a1528;
export const OUTLINE_HEX = '#1a1528';

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

export function paletteFor(age: Age): AgePalette {
  return AGE_PALETTES[age];
}

export function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

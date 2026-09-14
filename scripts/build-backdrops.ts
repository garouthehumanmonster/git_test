/**
 * Offline art pipeline — painted age backdrops.
 *
 * The four panoramas in `art/source/` were painted as pixel art but arrived
 * with the problems that made the project read as "AI generated":
 *   - their own free-floating colour ramp, unrelated to the game palette
 *   - ~4x more texel density than the gameplay sprites, so they looked pasted
 *     onto the scene instead of belonging to it
 *   - bright mid-tones that washed out the units standing in front of them
 *
 * This script fixes all three, deterministically:
 *   1. crop each panorama to the aspect ratio of the in-game sky band, framing
 *      the horizon so the lane sits on it
 *   2. resample to 450x143, displayed at PIXEL_SCALE (2x) -> 900x286 on screen,
 *      which is the exact same texel grid as every unit and building
 *   3. grade it (saturation, contrast, age tint, vertical falloff)
 *   4. posterise onto the age's landscape palette with a light ordered dither
 *      so skies keep gradients without introducing thousands of off-palette
 *      colours
 *
 * Output: `public/atlas/bg_<age>.png` (shipped) + `art/preview/*` (ignored).
 *
 * Usage: npm run art:build
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode as decodeJpeg } from 'jpeg-js';
import { encodePng } from './lib/png';
import { BAYER4, crop, hexToRgb, nearestColor, resizeArea, type Raster, type Rgb } from './lib/image';
import { AGE_PALETTES, BACKDROP_EXTRA } from '../src/render/palette';
import type { Age } from '../src/sim/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Sky band size in authored pixels; drawn at PIXEL_SCALE (2x) => 900x286. */
export const BACKDROP_W = 450;
export const BACKDROP_H = 143;

interface AgeRecipe {
  source: string;
  /** Vertical crop offset, in source pixels (source is 1584x672). */
  cropTop: number;
  /** How strongly the image is pulled towards the age's darkest colour. */
  tint: number;
  gain: number;
  saturation: number;
  contrast: number;
  /** Extra darkening towards the bottom of the band (0..1). */
  falloff: number;
  dither: number;
}

const RECIPES: Record<Age, AgeRecipe> = {
  stone: {
    source: 'bg_stone.jpg',
    cropTop: 60,
    tint: 0.16,
    gain: 1.02,
    saturation: 1.2,
    contrast: 1.05,
    falloff: 0.42,
    dither: 0.55,
  },
  medieval: {
    source: 'bg_medieval.jpg',
    cropTop: 96,
    tint: 0.1,
    gain: 0.96,
    saturation: 1.2,
    contrast: 1.06,
    falloff: 0.38,
    dither: 0.55,
  },
  modern: {
    source: 'bg_modern.jpg',
    cropTop: 96,
    tint: 0.06,
    gain: 0.92,
    saturation: 1.3,
    contrast: 1.12,
    falloff: 0.38,
    dither: 0.55,
  },
};

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function loadJpeg(path: string): Raster {
  const buf = readFileSync(path);
  const decoded = decodeJpeg(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  return { width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data) };
}

/** Build one graded + posterised backdrop. */
export function buildBackdrop(age: Age): Raster {
  const recipe = RECIPES[age];
  const base = AGE_PALETTES[age];
  const palette: Rgb[] = [...Object.values(base), ...BACKDROP_EXTRA[age]].map(hexToRgb);
  const dark = hexToRgb(base.dark);

  const src = loadJpeg(join(ROOT, 'art', 'source', recipe.source));
  const targetAspect = BACKDROP_W / BACKDROP_H;
  const cropH = Math.min(src.height, Math.round(src.width / targetAspect));
  const top = Math.min(recipe.cropTop, src.height - cropH);
  const band = crop(src, 0, top, src.width, cropH);
  const small = resizeArea(band, BACKDROP_W, BACKDROP_H);

  const out = new Uint8Array(BACKDROP_W * BACKDROP_H * 4);
  for (let y = 0; y < BACKDROP_H; y++) {
    // Vertical falloff keeps the horizon band darker than the sky so the lane
    // edge and the units standing on it stay the brightest things on screen.
    const t = y / (BACKDROP_H - 1);
    const falloff = 1 - recipe.falloff * t * t;
    for (let x = 0; x < BACKDROP_W; x++) {
      const i = (y * BACKDROP_W + x) * 4;
      let r = small.data[i]!;
      let g = small.data[i + 1]!;
      let b = small.data[i + 2]!;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * recipe.saturation;
      g = luma + (g - luma) * recipe.saturation;
      b = luma + (b - luma) * recipe.saturation;
      r = 128 + (r - 128) * recipe.contrast;
      g = 128 + (g - 128) * recipe.contrast;
      b = 128 + (b - 128) * recipe.contrast;

      r = (r + (dark[0] - r) * recipe.tint) * recipe.gain * falloff;
      g = (g + (dark[1] - g) * recipe.tint) * recipe.gain * falloff;
      b = (b + (dark[2] - b) * recipe.tint) * recipe.gain * falloff;

      const d = (BAYER4[y & 3]![x & 3]! / 15 - 0.5) * 22 * recipe.dither;
      const [pr, pg, pb] = palette[nearestColor(clamp255(r + d), clamp255(g + d), clamp255(b + d), palette)]!;
      out[i] = pr;
      out[i + 1] = pg;
      out[i + 2] = pb;
      out[i + 3] = 255;
    }
  }
  return { width: BACKDROP_W, height: BACKDROP_H, data: out };
}

/** 2x nearest-neighbour upscale, for eyeballing the result during development. */
function upscale2x(src: Raster): Raster {
  const out = new Uint8Array(src.width * 2 * src.height * 2 * 4);
  for (let y = 0; y < src.height * 2; y++) {
    for (let x = 0; x < src.width * 2; x++) {
      const si = ((y >> 1) * src.width + (x >> 1)) * 4;
      const di = (y * src.width * 2 + x) * 4;
      out[di] = src.data[si]!;
      out[di + 1] = src.data[si + 1]!;
      out[di + 2] = src.data[si + 2]!;
      out[di + 3] = src.data[si + 3]!;
    }
  }
  return { width: src.width * 2, height: src.height * 2, data: out };
}

function main(): void {
  mkdirSync(join(ROOT, 'public', 'atlas'), { recursive: true });
  mkdirSync(join(ROOT, 'art', 'preview'), { recursive: true });
  for (const age of Object.keys(RECIPES) as Age[]) {
    const raster = buildBackdrop(age);
    const outPath = join(ROOT, 'public', 'atlas', `bg_${age}.png`);
    writeFileSync(outPath, encodePng(raster.width, raster.height, raster.data));
    const preview = upscale2x(raster);
    writeFileSync(join(ROOT, 'art', 'preview', `bg_${age}@2x.png`), encodePng(preview.width, preview.height, preview.data));
    const kb = (readFileSync(outPath).length / 1024).toFixed(1);
    console.log(`bg_${age}.png  ${raster.width}x${raster.height}  ${kb} KB`);
  }
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('build-backdrops.ts') || invoked.endsWith('build-backdrops.js')) main();

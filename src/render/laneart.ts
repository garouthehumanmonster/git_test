import type { Age } from '../sim/types';
import { LANE_BOTTOM, LANE_TOP, LANE_WIDTH } from '../sim/types';
import type { PixelGraphics } from './gfx';
import { paletteFor, lanePaletteFor } from './palette';

/**
 * Lane terrain, drawn as code on the same pixel grid as everything else.
 *
 * The ground is built from flat palette bands plus hand-placed detail — a
 * winding track, grass tufts, pebbles, flagstones, cracks — rather than large
 * ordered-dither fields, which read as checkerboard noise behind the units.
 * It is pure code so the offline preview rasteriser can render it too.
 */
export const SKY_HEIGHT = 286;
/** Screen row the front-most lane edge sits on (props, then the HUD panel). */
export const FORE_BOTTOM = LANE_BOTTOM + 16;

/**
 * Cheap deterministic hash for scattering detail. Using a hash instead of
 * arithmetic progressions avoids the visible diagonal lattice that
 * `(i * k) % width` produces.
 */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Screen row a unit's feet rest on: a shallow valley through the lane. */
export function laneGroundY(x: number): number {
  const t = x / LANE_WIDTH;
  return LANE_TOP + 60 + Math.sin(Math.PI * t) * 6;
}

export function paintLane(g: PixelGraphics, age: Age, _characterPalette?: unknown): void {
  g.clear();
  const char = paletteFor(age);
  const terrain = lanePaletteFor(age);
  const top = LANE_TOP;
  const bottom = FORE_BOTTOM;

  // A) Distance haze under the horizon, then receding field bands. Transitions
  // are three dithered rows so the bands read as distance, not as shelves.
  fill(g, 0, top, LANE_WIDTH, 8, char.panel);
  ditherBand(g, top + 8, char.panel, terrain.fieldFar);
  fill(g, 0, top + 11, LANE_WIDTH, 30, terrain.fieldFar);
  ditherBand(g, top + 41, terrain.fieldFar, terrain.field);
  fill(g, 0, top + 44, LANE_WIDTH, 32, terrain.field);
  ditherBand(g, top + 76, terrain.field, terrain.fieldNear);
  fill(g, 0, top + 79, LANE_WIDTH, bottom - (top + 79), terrain.fieldNear);

  paintFieldPatches(g, age, terrain);
  paintTrack(g, age, terrain);
  paintTerrainDetail(g, age, terrain.detail, terrain.accent, char);

  // B) Ink line where the sky meets the ground, and a heavier lip at the front
  // edge of the lane so the terrain reads as a solid slab.
  fill(g, 0, top - 2, LANE_WIDTH, 2, char.dark);
  fill(g, 0, FORE_BOTTOM - 5, LANE_WIDTH, 5, char.dark);

  // C) Corner vignettes, kept to a handful of dithered columns at each end.
  for (let i = 0; i < 18; i++) {
    const alpha = 1 - i / 18;
    for (let y = top; y < bottom; y += 2) {
      const h = ((i * 5 + y * 3) % 11) / 11;
      if (h < alpha) fill(g, i, y, 1, 2, char.dark, 0.9);
      if (h < alpha) fill(g, LANE_WIDTH - 1 - i, y, 1, 2, char.dark, 0.9);
    }
  }
}

/** Three dithered rows blending `a` into `b`, ordered per column. */
function ditherBand(g: PixelGraphics, y: number, a: number, b: number): void {
  for (let row = 0; row < 3; row++) {
    for (let x = 0; x < LANE_WIDTH; x++) {
      const h = hash(x * 7 + row * 131) ;
      const threshold = (row + 1) / 4;
      fill(g, x, y + row, 1, 1, h < threshold ? b : a);
    }
  }
}

function fill(g: PixelGraphics, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

/**
 * Large soft patches of slightly different field colour, so the ground reads as
 * a landscape with weather and terrain in it rather than one flat fill.
 */
function paintFieldPatches(
  g: PixelGraphics,
  age: Age,
  terrain: { fieldFar: number; field: number; fieldNear: number; detail: number },
): void {
  const tones = [terrain.fieldFar, terrain.fieldNear, terrain.field];
  for (let i = 0; i < 26; i++) {
    const cx = hash(i * 71 + 3) * LANE_WIDTH;
    const cy = LANE_TOP + 16 + hash(i * 73 + 9) * 118;
    const rx = 30 + hash(i * 79 + 5) * 70;
    const ry = 5 + hash(i * 83 + 7) * 9;
    const tone = tones[i % tones.length]!;
    for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
      if (y < LANE_TOP + 12 || y > FORE_BOTTOM - 14) continue;
      const dy = (y - cy) / ry;
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
      const drift = Math.round(hash(i * 89 + y) * 4) - 2;
      fill(g, Math.round(cx) - span + drift, y, span * 2, 1, tone);
    }
  }
  // Modern gets a few lighter spill patches for wet asphalt.
  if (age === 'modern') {
    for (let i = 0; i < 12; i++) {
      const cx = hash(i * 97 + 11) * LANE_WIDTH;
      const cy = LANE_TOP + 30 + hash(i * 101 + 3) * 96;
      const rx = 18 + hash(i * 103 + 5) * 40;
      for (let y = Math.round(cy - 3); y <= Math.round(cy + 3); y++) {
        const dy = (y - cy) / 3;
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
        fill(g, Math.round(cx) - span, y, span * 2, 1, terrain.detail, 0.45);
      }
    }
  }
}

/** The winding path armies walk down, following the lane's gentle valley. */
function paintTrack(g: PixelGraphics, age: Age, terrain: { track: number; trackEdge: number }): void {
  const base = age === 'modern' ? 10 : 8;
  const { track, trackEdge } = terrain;
  for (let x = 0; x < LANE_WIDTH; x++) {
    const y = Math.round(laneGroundY(x));
    // Ragged edges: the field nibbles into the track instead of a hard line.
    const topEdge = y - base - Math.round(hash(x * 3) * 3);
    const botEdge = y + base + Math.round(hash(x * 5 + 7) * 3);
    fill(g, x, topEdge, 1, botEdge - topEdge, track);
    fill(g, x, topEdge, 1, 1, trackEdge);
    fill(g, x, botEdge - 1, 1, 1, trackEdge);
  }
}

/** Age-specific surface texture: grass and stones, flagstones, cracked asphalt. */
function paintTerrainDetail(
  g: PixelGraphics,
  age: Age,
  detail: number,
  accent: number,
  char: { dark: number; panel: number },
): void {
  if (age === 'stone' || age === 'medieval') {
    // Grass blades, tufts and pebbles, scattered by hash so there is no lattice.
    for (let i = 0; i < 420; i++) {
      const x = Math.floor(hash(i * 3 + 1) * LANE_WIDTH);
      const band = hash(i * 3 + 2);
      const y = band < 0.34
        ? LANE_TOP + 12 + Math.floor(hash(i * 3 + 3) * 30)
        : band < 0.6
          ? laneGroundY(x) - 26 + Math.floor(hash(i * 3 + 3) * 18)
          : laneGroundY(x) + 16 + Math.floor(hash(i * 3 + 3) * 52);
      if (y > FORE_BOTTOM - 16) continue;
      if (Math.abs(y - laneGroundY(x)) < (age === 'medieval' ? 12 : 10)) continue;
      fill(g, x, y, 1, 2, detail);
      if (hash(i * 7) > 0.6) fill(g, x + 1, y + 1, 1, 1, detail);
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i * 11 + 5) * LANE_WIDTH);
      const y = LANE_TOP + 14 + Math.floor(hash(i * 13 + 3) * 100);
      if (Math.abs(y - laneGroundY(x)) < 12) continue;
      fill(g, x, y - 2, 1, 4, accent);
      fill(g, x + 2, y - 1, 1, 3, accent);
    }
    for (let i = 0; i < 56; i++) {
      const x = Math.floor(hash(i * 17 + 9) * LANE_WIDTH);
      const y = LANE_TOP + 20 + Math.floor(hash(i * 19 + 4) * 108);
      if (Math.abs(y - laneGroundY(x)) < 12) continue;
      fill(g, x, y, 3, 2, detail);
      fill(g, x, y, 3, 1, accent);
    }
  }

  if (age === 'medieval') {
    // Flagstones laid across the walking surface, following the valley.
    for (let row = -1; row <= 2; row++) {
      for (let x = -8; x < LANE_WIDTH; x += 16) {
        const cx = x + (row % 2 === 0 ? 0 : 8);
        const y = Math.round(laneGroundY(cx)) + row * 8 - 4;
        if (y < LANE_TOP + 8 || y > FORE_BOTTOM - 20) continue;
        fill(g, cx, y, 13, 6, detail);
        fill(g, cx, y, 13, 1, accent);
      }
    }
    for (const [px, w] of [[150, 40], [560, 52], [780, 30]] as const) {
      const y = Math.round(laneGroundY(px)) + 20;
      fill(g, px, y, w, 3, accent, 0.45);
    }
  }

  if (age === 'modern') {
    // Faded lane markings, patch repairs and cracks.
    for (let x = 4; x < LANE_WIDTH; x += 22) {
      const y = Math.round(laneGroundY(x));
      fill(g, x, y + 5, 10, 2, accent, 0.5);
    }
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(hash(i * 23 + 2) * LANE_WIDTH);
      const y = LANE_TOP + 16 + Math.floor(hash(i * 29 + 6) * 128);
      if (y > FORE_BOTTOM - 18) continue;
      if (Math.abs(y - laneGroundY(x)) < 4) continue;
      fill(g, x, y, 5, 1, detail);
      if (hash(i * 31) > 0.5) fill(g, x + 2, y + 1, 1, 3, detail);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(hash(i * 37 + 8) * LANE_WIDTH);
      const y = LANE_TOP + 24 + Math.floor(hash(i * 41 + 3) * 116);
      fill(g, x, y, 9, 2, detail, 0.6);
    }
  }

  // Scattered debris in the near band, for every age.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i * 43 + 12) * LANE_WIDTH);
    const y = Math.round(laneGroundY(x)) + 24 + Math.floor(hash(i * 47 + 5) * 14);
    if (y > FORE_BOTTOM - 18) continue;
    fill(g, x, y, 2, 1, detail);
  }

  paintForegroundFringe(g, age, char.dark, char.panel);
}

/** Blocky rubble/barbed-wire fringe for the modern age. */
function paintDebrisFringe(g: PixelGraphics, dark: number, panel: number): void {
  const baseY = FORE_BOTTOM - 6;
  // Continuous low bank of rubble.
  for (let x = 0; x < LANE_WIDTH; x++) {
    const h = hash(x * 13 + 5);
    const height = 5 + Math.round(h * 5);
    fill(g, x, baseY - height, 1, FORE_BOTTOM - (baseY - height), dark);
    if (h > 0.8) fill(g, x, baseY - height, 1, 1, panel);
  }
  // Broken slabs and wire posts sticking up out of it.
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(hash(i * 43 + 7) * LANE_WIDTH);
    const height = 9 + Math.floor(hash(i * 47 + 2) * 9);
    const w = 2 + Math.floor(hash(i * 53 + 1) * 4);
    fill(g, x, baseY - height, w, height, dark);
    fill(g, x, baseY - height, w, 2, i % 3 === 0 ? panel : dark);
  }
}

/**
 * A dark band of foliage (or scrap, in the modern age) along the very front of
 * the lane. It frames the battlefield the way a foreground silhouette does in
 * hand-drawn pixel art, and stops the near band reading as empty grass.
 */
function paintForegroundFringe(
  g: PixelGraphics,
  age: Age,
  dark: number,
  panel: number,
): void {
  void age;
  const baseY = FORE_BOTTOM - 6;
  if (age === 'modern') {
    paintDebrisFringe(g, dark, panel);
    return;
  }
  for (let x = 0; x < LANE_WIDTH; x++) {
    const h = hash(x * 9 + 3);
    const tall = hash(x * 5 + 11) > 0.72;
    const height = (tall ? 16 : 9) + Math.round(h * 7);
    const y = baseY - height;
    fill(g, x, y, 1, FORE_BOTTOM - y, dark);
    // Lit top edge so the fringe does not read as a flat black bar.
    const top = h > 0.5 ? panel : dark;
    fill(g, x, y, 1, 2, top);
    if (h > 0.85) fill(g, x, y - 3, 1, 3, top);
  }
  // A few taller fronds poking further up, at irregular intervals.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash(i * 53 + 4) * LANE_WIDTH);
    const height = 22 + Math.floor(hash(i * 59 + 2) * 12);
    for (let k = 0; k < height; k++) {
      const width = k < height - 8 ? 1 : 2;
      fill(g, x - Math.round(hash(i * 61) * 4), baseY - k, width, 1, dark);
    }
  }
}

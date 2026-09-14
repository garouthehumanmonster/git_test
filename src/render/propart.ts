import type { Age } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Landscape set dressing.
 *
 * These are what turn the painted sky band into a scene: silhouettes that sit
 * on the horizon, and solid props planted in the lane and the foreground band
 * so the battlefield has depth instead of reading as a flat strip.
 *
 * Every prop is authored on the same 1:1 texel grid as the units, at a size
 * chosen relative to a unit (a tree is roughly two units tall, a rock is knee
 * high), and every one gets the same 1px ink outline from `paintOps`.
 */
export type PropSlot = 'skyline' | 'ground' | 'front';

export interface PropDef {
  key: string;
  /** Authored minimum canvas. */
  w: number;
  h: number;
  ops: SpriteOp[];
  /** Final texture geometry, fitted so the ink outline is never clipped. */
  fit: FittedSprite;
}

/** Build a prop definition, computing its fitted texture geometry once. */
function prop(key: string, w: number, h: number, ops: SpriteOp[]): PropDef {
  return { key, w, h, ops, fit: fitSprite(ops, w, h) };
}

// ---------------------------------------------------------------- builders

/** Solid conifer with a shaded right flank and optional snow caps. */
function conifer(w: number, h: number, snow: boolean): SpriteOp[] {
  const ops: SpriteOp[] = [];
  const cx = Math.floor(w / 2);
  const trunkH = Math.max(4, Math.round(h * 0.26));
  const trunkW = Math.max(2, Math.round(w * 0.16));
  const canopyH = h - trunkH;
  const halfAt = (y: number): number => Math.max(1, Math.round(((y + 1.5) / canopyH) * (w / 2)));
  for (let y = 0; y < canopyH; y++) {
    const half = halfAt(y);
    ops.push(r(cx - half, y, half * 2, 1, 'body'));
  }
  for (let y = 2; y < canopyH; y++) {
    const half = halfAt(y);
    ops.push(r(cx + Math.floor(half * 0.2), y, Math.max(1, half - 1), 1, 'edge'));
  }
  if (snow) {
    // Snow settles in sparse stripes over the sunlit left flank only.
    for (let y = 2; y < canopyH * 0.7; y += 6) {
      const half = halfAt(y);
      ops.push(r(cx - half, y, Math.max(1, half), 1, 'light'));
    }
  }
  ops.push(r(cx - Math.floor(trunkW / 2), canopyH, trunkW, trunkH, 'mid'));
  return ops;
}

/** Curved jungle palm with four fronds. */
function palm(w: number, h: number): SpriteOp[] {
  const cx = Math.floor(w / 2);
  const trunkH = Math.round(h * 0.7);
  const ops: SpriteOp[] = [];
  ops.push(r(cx - 1, h - 6, 3, 6, 'mid'));
  for (let i = 0; i < trunkH; i++) {
    const x = cx - 1 + Math.round(Math.sin((i / trunkH) * 1.4) * 2);
    ops.push(r(x, h - 6 - i, 2, 1, 'edge'));
  }
  const topY = h - 6 - trunkH;
  ops.push(tri(cx, topY - 2, cx - Math.round(w / 2), topY + 6, cx - 3, topY + 1, 'body'));
  ops.push(tri(cx, topY - 2, cx + Math.round(w / 2), topY + 6, cx + 3, topY + 1, 'body'));
  ops.push(tri(cx, topY, cx - 5, topY + 8, cx + 1, topY + 7, 'body'));
  ops.push(tri(cx + 1, topY + 1, cx + 6, topY + 8, cx, topY + 7, 'body'));
  ops.push(r(cx - 2, topY - 1, 4, 2, 'accent'));
  return ops;
}

/** Chunky boulder made of stacked slabs. */
function rock(w: number, h: number): SpriteOp[] {
  const ops: SpriteOp[] = [
    r(1, Math.round(h * 0.45), w - 2, Math.round(h * 0.55), 'edge'),
    r(Math.round(w * 0.15), Math.round(h * 0.2), Math.round(w * 0.6), Math.round(h * 0.4), 'body'),
    r(Math.round(w * 0.28), Math.round(h * 0.1), Math.round(w * 0.34), Math.round(h * 0.2), 'body'),
    r(Math.round(w * 0.34), Math.round(h * 0.06), Math.round(w * 0.2), 2, 'light'),
    r(2, h - 4, Math.round(w * 0.22), 3, 'panel'),
  ];
  return ops;
}

// ------------------------------------------------------------ stone props

const HUT: SpriteOp[] = [
  r(4, 12, 20, 12, 'mid'),
  tri(14, 0, 1, 13, 27, 13, 'body'),
  tri(14, 3, 5, 12, 23, 12, 'body'),
  r(9, 16, 6, 8, 'panel'),
  r(10, 18, 4, 6, 'ink'),
  r(19, 8, 2, 5, 'edge'),
];

const TOTEM: SpriteOp[] = [
  r(5, 6, 5, 24, 'edge'),
  r(3, 0, 9, 8, 'light'),
  r(5, 2, 2, 2, 'ink'), r(9, 2, 2, 2, 'ink'),
  r(6, 9, 3, 2, 'panel'),
  tri(5, 7, 0, 2, 3, 10, 'highlight'),
  tri(10, 7, 18, 2, 12, 10, 'accent'),
  r(4, 16, 8, 2, 'body'),
  r(4, 22, 8, 2, 'body'),
];

const CAMPFIRE: SpriteOp[] = [
  r(2, 9, 6, 3, 'edge'), r(13, 9, 6, 3, 'edge'),
  r(5, 8, 11, 3, 'panel'),
  r(3, 4, 4, 4, 'body'), r(13, 4, 4, 4, 'body'), r(8, 2, 4, 3, 'body'),
  r(6, 0, 3, 3, 'light'), r(10, 1, 3, 3, 'light'),
];

const RACK: SpriteOp[] = [
  r(1, 2, 2, 24, 'edge'), r(15, 2, 2, 24, 'edge'),
  r(3, 4, 12, 12, 'body'),
  r(5, 6, 8, 8, 'body'),
  r(8, 4, 2, 3, 'panel'),
  r(0, 24, 18, 2, 'mid'),
];

const FERN: SpriteOp[] = [
  r(7, 9, 6, 4, 'body'),
  tri(10, 8, 0, 0, 8, 12, 'body'),
  tri(10, 8, 20, 2, 12, 12, 'body'),
  tri(10, 10, 4, 2, 9, 12, 'body'),
  tri(10, 10, 17, 4, 11, 12, 'body'),
  r(3, 12, 14, 2, 'panel'),
];

const BONES: SpriteOp[] = [
  r(0, 7, 8, 2, 'light'),
  r(8, 4, 7, 5, 'light'),
  r(10, 5, 1, 1, 'ink'), r(12, 5, 1, 1, 'ink'),
  r(15, 8, 5, 2, 'light'),
  r(9, 9, 4, 1, 'panel'),
];

const WATCH_POST: SpriteOp[] = [
  r(7, 10, 4, 26, 'body'),
  r(11, 6, 2, 10, 'edge'),
  r(4, 2, 14, 5, 'edge'),
  r(4, 2, 14, 1, 'light'),
  r(5, 7, 12, 3, 'body'),
  tri(18, 2, 24, 4, 18, 7, 'highlight'),
];

const SMOKE_HOLE: SpriteOp[] = [
  r(4, 12, 12, 8, 'edge'),
  r(6, 8, 8, 5, 'mid'),
  r(5, 4, 4, 5, 'panel'), r(10, 2, 4, 6, 'panel'), r(7, 0, 5, 4, 'panel'),
  r(3, 20, 14, 3, 'edge'),
];

const FIRE_PIT: SpriteOp[] = [
  r(3, 14, 16, 5, 'edge'),
  r(5, 9, 12, 5, 'body'),
  r(6, 5, 4, 5, 'accent'), r(11, 3, 4, 7, 'highlight'),
  r(2, 19, 18, 3, 'panel'),
];

const STRETCHER: SpriteOp[] = [
  r(1, 8, 22, 5, 'edge'),
  r(1, 8, 22, 1, 'body'),
  r(2, 13, 20, 2, 'mid'),
  r(4, 3, 7, 6, 'panel'), r(12, 4, 5, 5, 'panel'),
  r(8, 12, 3, 5, 'mid'), r(15, 12, 3, 5, 'mid'),
];

const THORNS: SpriteOp[] = [
  r(1, 9, 2, 10, 'body'), r(16, 9, 2, 10, 'body'),
  r(2, 11, 15, 2, 'edge'),
  r(4, 7, 1, 5, 'panel'), r(8, 6, 1, 6, 'panel'), r(12, 7, 1, 5, 'panel'),
  r(6, 14, 1, 5, 'panel'), r(10, 15, 1, 5, 'panel'), r(14, 14, 1, 5, 'panel'),
];

const CRAG_L = rock(24, 16);
const CRAG_S = rock(18, 12);

// --------------------------------------------------------- medieval props

const KEEP_FAR: SpriteOp[] = [
  r(6, 20, 28, 26, 'edge'),
  r(4, 12, 32, 9, 'body'),
  r(4, 6, 5, 7, 'body'), r(12, 6, 5, 7, 'body'), r(20, 6, 5, 7, 'body'), r(29, 6, 5, 7, 'body'),
  r(0, 14, 8, 32, 'body'), r(32, 14, 8, 32, 'body'),
  r(1, 8, 6, 7, 'edge'), r(33, 8, 6, 7, 'edge'),
  r(9, 24, 3, 6, 'panel'), r(18, 24, 3, 6, 'panel'), r(27, 24, 3, 6, 'panel'),
  r(12, 34, 4, 4, 'light'), r(24, 34, 4, 4, 'light'),
  r(15, 38, 10, 8, 'panel'),
  tri(15, 38, 25, 38, 20, 32, 'edge'),
];

const SIEGE_FAR: SpriteOp[] = [
  r(3, 10, 20, 24, 'edge'),
  r(3, 10, 20, 3, 'body'),
  r(4, 8, 4, 4, 'body'), r(11, 8, 4, 4, 'body'), r(18, 8, 4, 4, 'body'),
  r(5, 16, 16, 2, 'mid'), r(5, 24, 16, 2, 'mid'),
  r(10, 30, 6, 6, 'panel'),
  r(1, 34, 8, 6, 'mid'), r(17, 34, 8, 6, 'mid'),
];

const TENT: SpriteOp[] = [
  tri(14, 0, 0, 22, 28, 22, 'body'),
  tri(14, 0, 7, 22, 21, 22, 'mid'),
  r(13, 2, 3, 20, 'edge'),
  r(11, 14, 6, 8, 'panel'),
  r(14, 0, 1, 4, 'body'),
  tri(15, 0, 24, 3, 15, 6, 'highlight'),
];

const BANNER: SpriteOp[] = [
  r(1, 1, 2, 30, 'edge'),
  r(3, 2, 14, 11, 'highlight'),
  r(6, 5, 6, 5, 'light'),
  tri(17, 2, 22, 7, 17, 13, 'highlight'),
];

const BARREL: SpriteOp[] = [
  r(2, 6, 8, 14, 'body'),
  r(2, 8, 8, 2, 'panel'), r(2, 16, 8, 2, 'panel'),
  r(3, 6, 6, 1, 'body'),
  r(3, 11, 2, 4, 'mid'),
];

const CRATE: SpriteOp[] = [
  r(1, 6, 12, 13, 'edge'),
  r(1, 6, 12, 2, 'body'),
  r(2, 10, 10, 1, 'edge'), r(2, 15, 10, 1, 'edge'),
  r(2, 11, 2, 4, 'panel'),
];

const CATAPULT: SpriteOp[] = [
  r(2, 14, 20, 5, 'edge'),
  r(4, 12, 16, 3, 'body'),
  r(6, 2, 3, 12, 'mid'),
  r(9, 3, 9, 3, 'body'),
  r(18, 2, 4, 4, 'light'),
  r(2, 19, 5, 4, 'panel'), r(17, 19, 5, 4, 'panel'),
  r(9, 10, 7, 2, 'mid'),
];

const RACK_MED: SpriteOp[] = [
  r(1, 2, 2, 22, 'edge'), r(15, 2, 2, 22, 'edge'),
  r(3, 4, 12, 10, 'highlight'),
  r(5, 6, 8, 6, 'light'),
  r(0, 22, 18, 2, 'mid'),
];

// ----------------------------------------------------------- modern props

const WATCH_FAR: SpriteOp[] = [
  r(5, 8, 16, 32, 'mid'),
  r(5, 8, 3, 32, 'edge'),
  r(2, 2, 22, 7, 'body'),
  r(2, 2, 22, 1, 'body'),
  r(6, 12, 3, 4, 'highlight'),
  r(16, 12, 3, 4, 'highlight'),
  r(9, 20, 8, 3, 'edge'),
  r(3, 34, 20, 3, 'edge'),
  r(12, 0, 2, 5, 'light'),
];

const RADAR_FAR: SpriteOp[] = [
  r(1, 12, 3, 24, 'mid'), r(16, 12, 3, 24, 'mid'),
  r(3, 10, 14, 4, 'edge'),
  r(1, 6, 18, 3, 'body'),
  r(4, 0, 12, 5, 'body'),
  r(9, 0, 2, 5, 'light'),
  r(3, 24, 14, 2, 'panel'),
];

const CHIMNEY: SpriteOp[] = [
  r(3, 34, 15, 8, 'edge'),
  r(6, 2, 9, 32, 'mid'),
  r(6, 8, 9, 3, 'light'),
  r(6, 20, 9, 3, 'light'),
  r(8, 0, 4, 2, 'body'),
  r(4, 30, 13, 3, 'body'),
];

const RIFT: SpriteOp[] = [
  r(4, 2, 10, 36, 'edge'),
  r(6, 4, 6, 32, 'body'),
  r(8, 6, 2, 28, 'highlight'),
  r(7, 0, 4, 3, 'body'),
  r(7, 36, 4, 3, 'body'),
];

const SANDBAGS: SpriteOp[] = [
  r(0, 8, 8, 4, 'body'), r(9, 8, 8, 4, 'body'), r(18, 8, 8, 4, 'body'),
  r(0, 8, 8, 1, 'body'), r(9, 8, 8, 1, 'body'), r(18, 8, 8, 1, 'body'),
  r(4, 4, 8, 4, 'edge'), r(13, 4, 8, 4, 'edge'),
  r(4, 4, 8, 1, 'body'), r(13, 4, 8, 1, 'body'),
  r(8, 0, 8, 4, 'body'),
  r(8, 0, 8, 1, 'body'),
  r(1, 12, 24, 2, 'panel'),
];

const WRECK: SpriteOp[] = [
  r(3, 10, 26, 10, 'edge'),
  r(6, 4, 14, 7, 'edge'),
  r(7, 5, 5, 4, 'panel'),
  r(4, 18, 7, 5, 'panel'), r(18, 18, 7, 5, 'panel'),
  r(4, 19, 7, 2, 'mid'), r(18, 19, 7, 2, 'mid'),
  r(25, 6, 5, 5, 'body'),
  tri(26, 2, 31, 7, 26, 9, 'highlight'),
];

const RUBBLE: SpriteOp[] = [
  r(1, 6, 7, 6, 'body'), r(9, 8, 6, 4, 'edge'),
  r(15, 5, 6, 7, 'body'), r(5, 3, 5, 4, 'body'), r(12, 2, 5, 4, 'edge'),
];

const WIRE: SpriteOp[] = [
  r(1, 8, 2, 12, 'edge'), r(16, 8, 2, 12, 'edge'),
  r(2, 9, 15, 1, 'light'), r(2, 13, 15, 1, 'light'),
  r(8, 6, 2, 8, 'mid'),
];

const DEAD_TREE: SpriteOp[] = [
  r(6, 12, 3, 14, 'mid'),
  r(4, 4, 2, 9, 'edge'), r(9, 2, 2, 11, 'edge'),
  r(6, 6, 4, 2, 'mid'), r(2, 10, 4, 2, 'mid'),
  r(5, 26, 6, 2, 'panel'),
];

// ---------------------------------------------------------------- tables

const STONE_PROPS: Record<string, PropDef> = {
  pine: prop('prop_pine_stone', 16, 26, conifer(16, 26, false)),
  pine_large: prop('prop_pine_large_stone', 20, 36, conifer(20, 36, false)),
  palm: prop('prop_palm_stone', 22, 30, palm(22, 30)),
  hut: prop('prop_hut_stone', 28, 24, HUT),
  totem: prop('prop_totem_stone', 18, 30, TOTEM),
  campfire: prop('prop_campfire_stone', 20, 12, CAMPFIRE),
  rack: prop('prop_rack_stone', 18, 26, RACK),
  fern: prop('prop_fern_stone', 20, 14, FERN),
  fern_large: prop('prop_fern_large_stone', 26, 18, FERN),
  bones: prop('prop_bones_stone', 20, 10, BONES),
  crag: prop('prop_crag_stone', 24, 16, CRAG_L),
  crag_small: prop('prop_crag_small_stone', 18, 12, CRAG_S),
  // Stone-age answers for the shared layout slots.
  keep: prop('prop_keep_stone', 40, 48, HUT),
  siege: prop('prop_siege_stone', 26, 40, TOTEM),
  watchtower: prop('prop_watchtower_stone', 26, 40, WATCH_POST),
  radar: prop('prop_radar_stone', 20, 36, TOTEM),
  chimney: prop('prop_chimney_stone', 22, 44, SMOKE_HOLE),
  rift: prop('prop_rift_stone', 20, 22, FIRE_PIT),
  banner: prop('prop_banner_stone', 22, 32, TOTEM),
  tent: prop('prop_tent_stone', 28, 22, HUT),
  catapult: prop('prop_catapult_stone', 24, 22, STRETCHER),
  wreck: prop('prop_wreck_stone', 32, 22, FIRE_PIT),
  wire: prop('prop_wire_stone', 20, 20, THORNS),
  sandbags: prop('prop_sandbags_stone', 26, 14, STRETCHER),
  rubble: prop('prop_rubble_stone', 22, 14, RUBBLE),
  barrel: prop('prop_barrel_stone', 12, 20, BARREL),
  crate: prop('prop_crate_stone', 14, 20, CRATE),
};

const MEDIEVAL_PROPS: Record<string, PropDef> = {
  keep: prop('prop_keep_medieval', 40, 48, KEEP_FAR),
  siege: prop('prop_siege_medieval', 26, 40, SIEGE_FAR),
  tent: prop('prop_tent_medieval', 28, 22, TENT),
  banner: prop('prop_banner_medieval', 22, 32, BANNER),
  rack: prop('prop_rack_medieval', 18, 26, RACK_MED),
  catapult: prop('prop_catapult_medieval', 24, 22, CATAPULT),
  barrel: prop('prop_barrel_medieval', 12, 20, BARREL),
  crate: prop('prop_crate_medieval', 14, 20, CRATE),
  pine: prop('prop_pine_medieval', 16, 26, conifer(16, 26, true)),
  pine_large: prop('prop_pine_large_medieval', 20, 36, conifer(20, 36, true)),
  campfire: prop('prop_campfire_medieval', 20, 12, CAMPFIRE),
  fern: prop('prop_fern_medieval', 20, 14, FERN),
  fern_large: prop('prop_fern_large_medieval', 26, 18, FERN),
  bones: prop('prop_bones_medieval', 20, 10, BONES),
  // Medieval answers for the shared layout slots.
  watchtower: prop('prop_watchtower_medieval', 26, 40, SIEGE_FAR),
  radar: prop('prop_radar_medieval', 20, 36, KEEP_FAR),
  chimney: prop('prop_chimney_medieval', 22, 44, KEEP_FAR),
  rift: prop('prop_rift_medieval', 20, 22, CATAPULT),
  wreck: prop('prop_wreck_medieval', 32, 22, CATAPULT),
  wire: prop('prop_wire_medieval', 20, 20, RACK_MED),
  sandbags: prop('prop_sandbags_medieval', 26, 14, RACK_MED),
  crag: prop('prop_crag_medieval', 24, 16, CRAG_L),
  crag_small: prop('prop_crag_small_medieval', 18, 12, CRAG_S),
  rubble: prop('prop_rubble_medieval', 22, 14, RUBBLE),
  totem: prop('prop_totem_medieval', 18, 30, BANNER),
  hut: prop('prop_hut_medieval', 28, 24, TENT),
  palm: prop('prop_palm_medieval', 22, 30, conifer(22, 30, true)),
};

const MODERN_PROPS: Record<string, PropDef> = {
  chimney: prop('prop_chimney_modern', 22, 44, CHIMNEY),
  radar: prop('prop_radar_modern', 20, 36, RADAR_FAR),
  watchtower: prop('prop_watchtower_modern', 26, 40, WATCH_FAR),
  rift: prop('prop_rift_modern', 18, 40, RIFT),
  sandbags: prop('prop_sandbags_modern', 26, 14, SANDBAGS),
  wreck: prop('prop_wreck_modern', 32, 22, WRECK),
  wire: prop('prop_wire_modern', 20, 20, WIRE),
  rubble: prop('prop_rubble_modern', 22, 14, RUBBLE),
  barrel: prop('prop_barrel_modern', 12, 20, BARREL),
  crate: prop('prop_crate_modern', 14, 20, CRATE),
  campfire: prop('prop_campfire_modern', 20, 12, CAMPFIRE),
  bones: prop('prop_bones_modern', 20, 10, BONES),
  fern: prop('prop_fern_modern', 20, 14, WIRE),
  fern_large: prop('prop_fern_large_modern', 26, 18, SANDBAGS),
  crag: prop('prop_crag_modern', 24, 16, RUBBLE),
  crag_small: prop('prop_crag_small_modern', 18, 12, RUBBLE),
  rack: prop('prop_rack_modern', 18, 26, WIRE),
  totem: prop('prop_totem_modern', 18, 30, WATCH_FAR),
  hut: prop('prop_hut_modern', 28, 24, WRECK),
  palm: prop('prop_palm_modern', 22, 30, DEAD_TREE),
  pine: prop('prop_pine_modern', 16, 26, DEAD_TREE),
  pine_large: prop('prop_pine_large_modern', 20, 36, conifer(20, 36, false)),
  keep: prop('prop_keep_modern', 40, 48, CHIMNEY),
  siege: prop('prop_siege_modern', 26, 40, WATCH_FAR),
  tent: prop('prop_tent_modern', 28, 22, WRECK),
  banner: prop('prop_banner_modern', 22, 32, RIFT),
  catapult: prop('prop_catapult_modern', 24, 22, WRECK),
};

export const AGE_PROPS: Record<Age, Record<string, PropDef>> = {
  stone: STONE_PROPS,
  medieval: MEDIEVAL_PROPS,
  modern: MODERN_PROPS,
};

/**
 * Where each prop is planted, as a fraction of the lane width, plus the slot
 * that decides its depth and the row it stands on. The same list drives every
 * age so the battlefield keeps a consistent rhythm while the silhouettes change
 * completely between ages.
 */
export interface PropPlacement {
  prop: string;
  /** 0..1 across the lane width. */
  at: number;
  slot: PropSlot;
  /** Vertical jitter in pixels, so props do not sit on a perfect line. */
  offset: number;
  /** Optional idle animation. */
  anim?: 'flicker' | 'spin' | 'pulse' | 'none';
}

export const PROP_LAYOUT: PropPlacement[] = [
  // Horizon silhouettes, sitting inside the painted sky band.
  { prop: 'keep', at: 0.055, slot: 'skyline', offset: 0 },
  { prop: 'keep', at: 0.95, slot: 'skyline', offset: 0 },
  { prop: 'siege', at: 0.2, slot: 'skyline', offset: 6 },
  { prop: 'watchtower', at: 0.8, slot: 'skyline', offset: 4 },
  { prop: 'radar', at: 0.31, slot: 'skyline', offset: 8, anim: 'spin' },
  { prop: 'chimney', at: 0.66, slot: 'skyline', offset: 2 },
  { prop: 'totem', at: 0.135, slot: 'skyline', offset: 22 },
  { prop: 'rift', at: 0.88, slot: 'skyline', offset: 12, anim: 'pulse' },
  { prop: 'banner', at: 0.72, slot: 'skyline', offset: 20, anim: 'flicker' },
  { prop: 'pine_large', at: 0.45, slot: 'skyline', offset: 26 },
  { prop: 'pine_large', at: 0.55, slot: 'skyline', offset: 30 },

  // Planted along the walkable strip, behind the units.
  { prop: 'pine_large', at: 0.1, slot: 'ground', offset: 2 },
  { prop: 'palm', at: 0.145, slot: 'ground', offset: 26 },
  { prop: 'pine_large', at: 0.885, slot: 'ground', offset: 4 },
  { prop: 'hut', at: 0.185, slot: 'ground', offset: 34 },
  { prop: 'crag', at: 0.225, slot: 'ground', offset: 30 },
  { prop: 'totem', at: 0.28, slot: 'ground', offset: 20 },
  { prop: 'campfire', at: 0.42, slot: 'ground', offset: 40, anim: 'flicker' },
  { prop: 'rack', at: 0.5, slot: 'ground', offset: 14 },
  { prop: 'banner', at: 0.57, slot: 'ground', offset: 36, anim: 'flicker' },
  { prop: 'tent', at: 0.63, slot: 'ground', offset: 16 },
  { prop: 'siege', at: 0.7, slot: 'ground', offset: 38 },
  { prop: 'catapult', at: 0.78, slot: 'ground', offset: 18 },
  { prop: 'wreck', at: 0.35, slot: 'ground', offset: 38 },
  { prop: 'sandbags', at: 0.46, slot: 'ground', offset: 30 },

  // Foreground band: below the walk line, close to camera.
  { prop: 'fern_large', at: 0.075, slot: 'front', offset: 0 },
  { prop: 'bones', at: 0.155, slot: 'front', offset: 10 },
  { prop: 'crag', at: 0.24, slot: 'front', offset: 4 },
  { prop: 'barrel', at: 0.325, slot: 'front', offset: 14 },
  { prop: 'crate', at: 0.395, slot: 'front', offset: 2 },
  { prop: 'rubble', at: 0.47, slot: 'front', offset: 12 },
  { prop: 'bones', at: 0.545, slot: 'front', offset: 0 },
  { prop: 'crate', at: 0.615, slot: 'front', offset: 10 },
  { prop: 'barrel', at: 0.685, slot: 'front', offset: 0 },
  { prop: 'wire', at: 0.755, slot: 'front', offset: 8 },
  { prop: 'crag_small', at: 0.825, slot: 'front', offset: 0 },
  { prop: 'rubble', at: 0.885, slot: 'front', offset: 12 },
  { prop: 'fern_large', at: 0.945, slot: 'front', offset: 2 },
];

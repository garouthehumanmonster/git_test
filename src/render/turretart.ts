import type { Age } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Base-defence turret art and the small effect sprites the juice layer needs.
 *
 * Same contract as every other asset in the game: a list of pixel primitives,
 * one shared 1px ink outline, drawn 1:1 at `PIXEL_SCALE`. Weapon art points
 * right; the renderer mirrors it for the enemy base.
 */
export interface TurretCanvas {
  w: number;
  h: number;
  foot: number;
}

/** Turrets are drawn to match the tower scale, not the unit scale. */
export const TURRET_CANVAS: TurretCanvas = { w: 44, h: 34, foot: 32 };

export function turretKey(age: Age | string, side: 'player' | 'ai' = 'player'): string {
  return `turret_${age}_${side}`;
}

export function turretIconKey(age: Age | string): string {
  return `icon_turret_${age}`;
}

export function ultIconKey(age: Age | string): string {
  return `icon_ult_${age}`;
}

// --------------------------------------------------------------- stone age
// A lashed wooden frame with a thick sinew sling: slow, heavy, single shot.
const SLING_TOWER: SpriteOp[] = [
  // timber trestle
  r(8, 24, 4, 8, 'panel'), r(30, 24, 4, 8, 'panel'),
  r(6, 22, 32, 3, 'edge'),
  r(10, 18, 3, 6, 'mid'), r(29, 18, 3, 6, 'mid'),
  // frame head + pivot
  r(14, 12, 14, 3, 'edge'),
  r(17, 10, 3, 4, 'mid'), r(24, 10, 3, 4, 'mid'),
  // sling pouch and its cord
  r(20, 4, 6, 7, 'body'),
  r(22, 6, 3, 4, 'accent'),
  r(18, 8, 1, 5, 'panel'), r(27, 8, 1, 5, 'panel'),
  // stone counterweight
  r(24, 2, 5, 4, 'mid'),
  r(12, 16, 3, 2, 'body'), r(28, 16, 3, 2, 'body'),
];

// ------------------------------------------------------------ medieval age
// A bolt-thrower: torsion bundles, iron bow arms, a loaded bolt.
const BALLISTA: SpriteOp[] = [
  // wheeled carriage
  r(7, 22, 5, 10, 'panel'), r(31, 22, 5, 10, 'panel'),
  r(6, 20, 32, 3, 'edge'),
  r(10, 17, 24, 4, 'mid'),
  r(13, 21, 8, 4, 'light'),
  // torsion bundles + stock
  r(12, 10, 4, 8, 'accent'), r(28, 10, 4, 8, 'accent'),
  r(14, 12, 16, 4, 'edge'),
  r(21, 12, 5, 5, 'body'),
  // bow arms swept forward
  r(13, 6, 4, 5, 'mid'), r(27, 6, 4, 5, 'mid'),
  r(11, 3, 3, 4, 'light'), r(30, 3, 3, 4, 'light'),
  // bolt + string
  r(15, 14, 14, 2, 'light'),
  tri(29, 13, 33, 15, 29, 17, 'highlight'),
  r(16, 11, 1, 8, 'panel'), r(26, 11, 1, 8, 'panel'),
  // crew shield
  r(3, 10, 5, 9, 'body'),
  r(4, 12, 3, 5, 'light'),
];

// -------------------------------------------------------------- modern age
// Twin autocannon on a sandbagged turntable.
const FLAK: SpriteOp[] = [
  // sandbag ring + steel plate
  r(4, 24, 36, 8, 'mid'),
  r(6, 26, 5, 4, 'panel'), r(13, 27, 5, 4, 'panel'), r(20, 26, 5, 4, 'panel'), r(27, 27, 5, 4, 'panel'),
  r(8, 20, 28, 5, 'edge'),
  // turntable + receiver
  r(14, 14, 16, 7, 'edge'),
  r(16, 15, 12, 4, 'body'),
  r(18, 12, 8, 3, 'mid'),
  // twin barrels
  r(24, 12, 17, 2, 'mid'), r(24, 15, 17, 2, 'mid'),
  r(40, 12, 2, 2, 'light'), r(40, 15, 2, 2, 'light'),
  // radar dish + ammo drum + sight
  r(8, 8, 8, 5, 'mid'),
  r(10, 9, 4, 3, 'accent'),
  r(4, 14, 6, 6, 'panel'),
  r(19, 9, 4, 3, 'light'),
];

export const TURRET_ART: Record<Age, SpriteOp[]> = {
  stone: SLING_TOWER,
  medieval: BALLISTA,
  modern: FLAK,
};

export const TURRET_FIT: Record<Age, FittedSprite> = {
  stone: fitSprite(SLING_TOWER, TURRET_CANVAS.w, TURRET_CANVAS.h, TURRET_CANVAS.foot),
  medieval: fitSprite(BALLISTA, TURRET_CANVAS.w, TURRET_CANVAS.h, TURRET_CANVAS.foot),
  modern: fitSprite(FLAK, TURRET_CANVAS.w, TURRET_CANVAS.h, TURRET_CANVAS.foot),
};

// ---------------------------------------------------------------------------
// Effect sprites
// ---------------------------------------------------------------------------

/**
 * A melee swing arc: a thick crescent that reads as a weapon sweeping through
 * the air. Pivoted near the bottom-left so it rotates about the unit's hand.
 */
export const SLASH_ARC: SpriteOp[] = [
  r(0, 9, 5, 4, 'light'),
  r(3, 6, 6, 5, 'light'),
  r(4, 7, 5, 3, 'highlight'),
  r(7, 3, 7, 5, 'light'),
  r(8, 4, 5, 3, 'highlight'),
  r(12, 0, 7, 4, 'accent'),
  r(13, 1, 5, 2, 'highlight'),
  r(1, 12, 6, 3, 'accent'),
  r(9, 8, 6, 3, 'accent'),
  r(15, 4, 5, 3, 'light'),
];

/** Four-point muzzle star, drawn at the weapon's tip. */
export const MUZZLE_FLASH: SpriteOp[] = [
  r(0, 3, 11, 3, 'highlight'),
  r(3, 0, 4, 3, 'light'),
  r(3, 6, 4, 3, 'light'),
  r(10, 1, 4, 3, 'accent'),
  r(10, 5, 4, 3, 'accent'),
  r(5, 3, 4, 3, 'light'),
];

/** Ground shock ring for a tank slam: an open ellipse with bright tips. */
export const SHOCK_RING: SpriteOp[] = [
  r(0, 5, 4, 3, 'highlight'),
  r(3, 3, 5, 2, 'light'),
  r(7, 2, 6, 2, 'accent'),
  r(12, 3, 5, 2, 'light'),
  r(16, 5, 4, 3, 'highlight'),
  r(3, 8, 5, 2, 'light'),
  r(7, 9, 6, 2, 'accent'),
  r(12, 8, 5, 2, 'light'),
];

/** Falling meteor head: a burning rock with a trail. */
export const METEOR: SpriteOp[] = [
  r(0, 4, 3, 2, 'accent'),
  r(2, 3, 4, 4, 'highlight'),
  r(4, 2, 5, 6, 'light'),
  r(8, 3, 5, 4, 'accent'),
  r(9, 4, 3, 2, 'highlight'),
];

/** Bomb silhouette for the modern airstrike. */
export const BOMB: SpriteOp[] = [
  r(0, 3, 3, 2, 'mid'),
  r(2, 2, 3, 4, 'edge'),
  r(4, 1, 5, 6, 'body'),
  r(8, 2, 4, 4, 'mid'),
  r(3, 0, 3, 2, 'accent'),
  r(3, 6, 3, 2, 'accent'),
];

export interface FxDef {
  key: string;
  ops: SpriteOp[];
  w: number;
  h: number;
  /** Row inside the canvas the sprite pivots/rests on. */
  foot: number;
  /** Origin as a fraction of the fitted sprite, for rotation about a joint. */
  origin?: { x: number; y: number };
}

export const FX_DEFS: FxDef[] = [
  { key: 'fx_slash', ops: SLASH_ARC, w: 21, h: 16, foot: 16, origin: { x: 0.08, y: 0.62 } },
  { key: 'fx_muzzle', ops: MUZZLE_FLASH, w: 15, h: 10, foot: 10, origin: { x: 0, y: 0.5 } },
  { key: 'fx_shock', ops: SHOCK_RING, w: 21, h: 12, foot: 12, origin: { x: 0.5, y: 0.5 } },
  { key: 'fx_meteor', ops: METEOR, w: 14, h: 10, foot: 10, origin: { x: 0.5, y: 0.5 } },
  { key: 'fx_bomb', ops: BOMB, w: 13, h: 8, foot: 8, origin: { x: 0.5, y: 0.5 } },
];

export const FX_FIT: Record<string, FittedSprite> = {};
for (const def of FX_DEFS) {
  FX_FIT[def.key] = fitSprite(def.ops, def.w, def.h, def.foot);
}

/** Rotation pivot per drawn texture key (`fx_slash_stone`, ...). */
export const FX_ORIGIN: Record<string, { x: number; y: number }> = {};
for (const def of FX_DEFS) {
  for (const age of ['stone', 'medieval', 'modern'] as const) {
    FX_ORIGIN[`${def.key}_${age}`] = def.origin ?? { x: 0.5, y: 0.5 };
  }
}

// ---------------------------------------------------------------------------
// HUD icons
// ---------------------------------------------------------------------------

const ICON_TURRET: Record<Age, SpriteOp[]> = {
  stone: [
    r(2, 12, 3, 3, 'panel'), r(12, 12, 3, 3, 'panel'),
    r(1, 10, 15, 2, 'edge'),
    r(6, 4, 5, 6, 'body'), r(8, 1, 4, 4, 'mid'),
  ],
  medieval: [
    r(2, 12, 3, 3, 'panel'), r(12, 12, 3, 3, 'panel'),
    r(1, 10, 15, 2, 'edge'),
    r(5, 4, 8, 6, 'mid'), r(8, 2, 5, 3, 'light'),
  ],
  modern: [
    r(2, 12, 14, 3, 'panel'),
    r(3, 7, 10, 5, 'edge'), r(6, 4, 9, 3, 'mid'),
    r(14, 4, 3, 2, 'light'), r(14, 7, 3, 2, 'light'),
  ],
};

const ICON_ULT: Record<Age, SpriteOp[]> = {
  stone: [
    tri(9, 1, 15, 8, 3, 8, 'light'),
    tri(9, 5, 14, 13, 4, 13, 'accent'),
    r(7, 12, 5, 3, 'highlight'),
  ],
  medieval: [
    r(8, 1, 2, 14, 'mid'),
    tri(6, 1, 12, 4, 6, 7, 'light'),
    r(5, 12, 8, 2, 'accent'), r(6, 9, 6, 3, 'body'),
  ],
  modern: [
    r(2, 7, 14, 3, 'mid'),
    tri(2, 7, 6, 3, 6, 7, 'body'), tri(16, 7, 12, 3, 12, 7, 'body'),
    r(7, 5, 4, 2, 'light'), r(7, 9, 4, 2, 'accent'),
  ],
};

export const ICON_TURRET_ART: Record<Age, SpriteOp[]> = ICON_TURRET;
export const ICON_ULT_ART: Record<Age, SpriteOp[]> = ICON_ULT;
export const ICON_CANVAS = { w: 18, h: 16 };

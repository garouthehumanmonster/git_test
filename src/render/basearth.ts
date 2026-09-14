import type { Age, Side } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Base towers, one per age and side.
 *
 * Authored at 46x62 and displayed at PIXEL_SCALE (92x124) — deliberately about
 * two and a half units tall, so the towers anchor the battlefield without
 * swallowing it. Player and enemy towers share the same architecture and are
 * separated only by their heraldry colour.
 */
export const BASE_CANVAS = { w: 46, h: 62 };
/** Row inside the canvas that touches the ground. */
export const BASE_FOOT_ROW = 61;

const PALISADE: SpriteOp[] = [
  // palisade wall of sharpened logs
  r(5, 26, 36, 36, 'edge'),
  r(6, 28, 3, 34, 'mid'), r(12, 28, 3, 34, 'mid'), r(18, 28, 3, 34, 'mid'),
  r(24, 28, 3, 34, 'mid'), r(30, 28, 3, 34, 'mid'), r(36, 28, 3, 34, 'mid'),
  // fighting platform with crenellations
  r(3, 20, 40, 7, 'body'),
  r(3, 14, 5, 7, 'body'), r(13, 14, 5, 7, 'body'), r(23, 14, 5, 7, 'body'), r(36, 14, 5, 7, 'body'),
  r(3, 20, 40, 2, 'body'),
  // thatched hall roof behind the wall
  tri(23, 2, 10, 20, 36, 20, 'body'),
  tri(23, 7, 14, 20, 32, 20, 'body'),
  r(21, 0, 4, 6, 'edge'),
  // gate and brazier
  r(18, 44, 10, 18, 'panel'),
  tri(18, 44, 28, 44, 23, 38, 'mid'),
  r(7, 32, 4, 6, 'highlight'),
  r(8, 30, 2, 2, 'light'),
];

const KEEP: SpriteOp[] = [
  // central keep
  r(10, 22, 26, 40, 'edge'),
  r(6, 15, 34, 8, 'body'),
  r(6, 9, 6, 8, 'body'), r(16, 9, 6, 8, 'body'), r(26, 9, 6, 8, 'body'), r(34, 9, 6, 8, 'body'),
  // flanking towers
  r(0, 18, 9, 44, 'body'),
  r(37, 18, 9, 44, 'body'),
  r(1, 12, 7, 7, 'edge'), r(38, 12, 7, 7, 'edge'),
  r(2, 13, 2, 5, 'body'), r(6, 13, 2, 5, 'body'),
  r(38, 13, 2, 5, 'body'), r(42, 13, 2, 5, 'body'),
  // stonework: arrow slits, lit windows, machicolations
  r(13, 28, 3, 7, 'panel'), r(22, 28, 3, 7, 'panel'), r(31, 28, 3, 7, 'panel'),
  r(16, 40, 4, 5, 'light'), r(27, 40, 4, 5, 'light'),
  r(10, 48, 26, 2, 'mid'),
  // archway and steps
  r(18, 48, 10, 14, 'panel'),
  tri(18, 48, 28, 48, 23, 42, 'edge'),
  r(14, 55, 18, 2, 'mid'),
];

const BUNKER: SpriteOp[] = [
  // concrete blockhouse
  r(5, 24, 36, 38, 'mid'),
  r(3, 18, 40, 8, 'edge'),
  r(3, 18, 40, 2, 'body'),
  // armoured turret with a radar mast
  r(12, 6, 22, 14, 'edge'),
  r(13, 4, 20, 3, 'body'),
  r(16, 0, 14, 5, 'body'),
  r(22, 0, 2, 6, 'light'),
  r(35, 8, 5, 5, 'body'),
  // plating, vents, hazard stripe
  r(7, 28, 13, 6, 'panel'), r(26, 28, 13, 6, 'panel'),
  r(7, 29, 13, 1, 'body'),
  r(6, 38, 34, 3, 'light'),
  r(6, 48, 34, 3, 'panel'),
  // blast door
  r(17, 46, 12, 16, 'panel'),
  r(18, 48, 9, 13, 'mid'),
  r(20, 53, 2, 2, 'body'),
];

function withHeraldry(ops: SpriteOp[], side: Side): SpriteOp[] {
  // Team cloth: a hanging banner in the side's colour.
  const cloth: SpriteOp[] = side === 'player'
    ? [r(34, 32, 8, 10, 'team'), tri(34, 42, 42, 42, 38, 47, 'team'), r(36, 34, 4, 2, 'light')]
    : [r(4, 32, 8, 10, 'team'), tri(4, 42, 12, 42, 8, 47, 'team'), r(6, 34, 4, 2, 'light')];
  return [...ops, ...cloth];
}

export const BASE_ART: Record<Age, (side: Side) => SpriteOp[]> = {
  stone: (side) => withHeraldry(PALISADE, side),
  medieval: (side) => withHeraldry(KEEP, side),
  modern: (side) => withHeraldry(BUNKER, side),
};

/** Fitted geometry per age and side; guarantees an intact ink outline. */
export const BASE_FIT: Record<Age, Record<Side, FittedSprite>> = {
  stone: {}, medieval: {}, modern: {},
} as unknown as Record<Age, Record<Side, FittedSprite>>;

for (const age of Object.keys(BASE_ART) as Age[]) {
  for (const side of ['player', 'ai'] as Side[]) {
    BASE_FIT[age][side] = fitSprite(BASE_ART[age](side), BASE_CANVAS.w, BASE_CANVAS.h, BASE_FOOT_ROW);
  }
}

export function baseKey(age: Age | string, side: Side | string): string {
  return `base_${age}_${side}`;
}

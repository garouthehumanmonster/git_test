import type { Age, Side } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Base towers, one per age and side.
 *
 * Authored at 54x76 and displayed at PIXEL_SCALE (108x152) — the tallest and
 * widest silhouette on the field by contract (see `test/render/art.test.ts`):
 * a tower is ~2.7x a human unit and just over 2x a war beast, so the base
 * always anchors the battlefield instead of being dwarfed by the units it
 * spawns. Each tower is a vertical structure — crown, shaft, grounded base —
 * never a squat hut. Player and enemy towers share architecture and are
 * separated only by their hanging heraldry.
 */
export const BASE_CANVAS = { w: 54, h: 76 };
/** Row inside the canvas that touches the ground. */
export const BASE_FOOT_ROW = 75;

const PALISADE: SpriteOp[] = [
  // grounded log wall — the widest mass of the tower
  r(4, 42, 46, 34, 'edge'),
  r(8, 44, 3, 31, 'mid'), r(16, 44, 3, 31, 'mid'), r(24, 44, 3, 31, 'mid'),
  r(32, 44, 3, 31, 'mid'), r(40, 44, 3, 31, 'mid'), r(46, 44, 3, 31, 'mid'),
  // watch platform on posts
  r(12, 34, 30, 9, 'body'),
  r(14, 43, 3, 7, 'mid'), r(24, 43, 3, 7, 'mid'), r(36, 43, 3, 7, 'mid'),
  // palisade crown above the platform
  r(12, 26, 30, 9, 'body'),
  r(12, 22, 5, 5, 'body'), r(20, 22, 5, 5, 'body'), r(28, 22, 5, 5, 'body'), r(37, 22, 5, 5, 'body'),
  // signal brazier on the platform rail
  r(6, 29, 4, 3, 'mid'), r(7, 26, 2, 3, 'highlight'), r(7, 25, 2, 1, 'light'),
  // conical thatched roof over the crown
  tri(27, 0, 6, 23, 48, 23, 'body'),
  tri(27, 5, 12, 23, 42, 23, 'edge'),
  r(26, 0, 2, 6, 'edge'),
  // gate with a hide awning
  r(20, 58, 14, 18, 'panel'),
  tri(20, 58, 34, 58, 27, 48, 'mid'),
  r(22, 61, 10, 15, 'dark'),
];

const KEEP: SpriteOp[] = [
  // curtain wall with dressing
  r(6, 44, 42, 32, 'edge'),
  r(10, 46, 3, 29, 'mid'), r(20, 46, 3, 29, 'mid'), r(30, 46, 3, 29, 'mid'), r(40, 46, 3, 29, 'mid'),
  // wall-walk and crenellations
  r(6, 40, 42, 5, 'body'),
  r(6, 36, 5, 5, 'body'), r(14, 36, 5, 5, 'body'), r(22, 36, 5, 5, 'body'),
  r(30, 36, 5, 5, 'body'), r(39, 36, 5, 5, 'body'), r(46, 36, 5, 5, 'body'),
  // flanking towers with crowned parapets
  r(6, 18, 10, 22, 'body'),
  r(38, 18, 10, 22, 'body'),
  r(5, 14, 12, 5, 'edge'), r(37, 14, 12, 5, 'edge'),
  r(6, 10, 3, 5, 'body'), r(11, 10, 3, 5, 'body'),
  r(38, 10, 3, 5, 'body'), r(43, 10, 3, 5, 'body'),
  r(9, 22, 3, 6, 'panel'), r(41, 22, 3, 6, 'panel'),
  // great donjon rising through the middle of the composition
  r(19, 8, 16, 32, 'edge'),
  r(21, 10, 3, 29, 'mid'), r(30, 10, 3, 29, 'mid'),
  r(17, 4, 20, 5, 'body'),
  r(17, 0, 4, 5, 'body'), r(23, 0, 4, 5, 'body'), r(29, 0, 4, 5, 'body'), r(35, 0, 4, 5, 'body'),
  r(24, 14, 5, 6, 'light'), r(24, 26, 5, 6, 'panel'),
  // gatehouse arch and steps
  r(20, 58, 14, 18, 'panel'),
  tri(20, 58, 34, 58, 27, 46, 'edge'),
  r(22, 61, 10, 15, 'dark'),
  r(14, 73, 26, 3, 'mid'),
];

const BUNKER: SpriteOp[] = [
  // radar mast with a rotating dish and a warning beacon
  r(25, 4, 3, 9, 'edge'),
  r(17, 2, 8, 6, 'body'), r(16, 3, 2, 4, 'light'), r(23, 4, 3, 2, 'light'),
  r(26, 1, 2, 2, 'highlight'),
  // control cab with lit windows
  r(16, 13, 22, 15, 'edge'),
  r(18, 16, 6, 4, 'light'), r(26, 16, 6, 4, 'light'),
  r(16, 26, 22, 2, 'body'),
  // support column
  r(22, 28, 10, 8, 'mid'),
  // reinforced blockhouse
  r(4, 35, 46, 41, 'mid'),
  r(4, 35, 46, 3, 'edge'),
  r(8, 40, 3, 31, 'panel'), r(16, 40, 3, 31, 'panel'), r(28, 40, 3, 31, 'panel'),
  r(38, 40, 3, 31, 'panel'), r(44, 40, 3, 31, 'panel'),
  r(6, 52, 42, 3, 'light'),
  r(10, 58, 8, 4, 'edge'), r(34, 58, 8, 4, 'edge'),
  // blast door
  r(21, 60, 12, 16, 'edge'),
  r(23, 62, 8, 13, 'panel'),
  r(26, 68, 2, 2, 'body'),
];

function withHeraldry(ops: SpriteOp[], side: Side): SpriteOp[] {
  // Team cloth: a hanging banner in the side's colour, mid-tower where it
  // stays clear of the turret sill and the roofline flag.
  const cloth: SpriteOp[] = side === 'player'
    ? [r(41, 28, 8, 12, 'team'), tri(41, 40, 49, 40, 45, 46, 'team'), r(43, 30, 4, 2, 'light')]
    : [r(5, 28, 8, 12, 'team'), tri(5, 40, 13, 40, 9, 46, 'team'), r(7, 30, 4, 2, 'light')];
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

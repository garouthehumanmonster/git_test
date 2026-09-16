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
  // boulder/stone plinth foundation anchoring the base
  r(3, 69, 48, 6, 'panel'),
  r(2, 72, 50, 4, 'dark'),
  r(4, 70, 7, 3, 'body'), r(13, 70, 6, 3, 'body'), r(21, 70, 6, 3, 'body'),
  r(29, 70, 6, 3, 'body'), r(37, 70, 6, 3, 'body'), r(45, 70, 5, 3, 'body'),
  // grounded defensive log wall
  r(4, 40, 46, 30, 'edge'),
  // sharpened palisade stake tops along the wall crest
  tri(6, 38, 4, 41, 8, 41, 'body'), tri(12, 37, 10, 41, 14, 41, 'body'),
  tri(18, 38, 16, 41, 20, 41, 'body'), tri(34, 38, 32, 41, 36, 41, 'body'),
  tri(40, 37, 38, 41, 42, 41, 'body'), tri(46, 38, 44, 41, 48, 41, 'body'),
  // vertical log planking with shadow and sunlit grain
  r(7, 41, 3, 28, 'mid'), r(10, 41, 1, 28, 'body'),
  r(15, 41, 3, 28, 'mid'), r(18, 41, 1, 28, 'body'),
  r(35, 41, 3, 28, 'mid'), r(38, 41, 1, 28, 'body'),
  r(43, 41, 3, 28, 'mid'), r(46, 41, 1, 28, 'body'),
  // heavy cross-timber bracing beams with forged iron/leather pins
  r(4, 48, 46, 3, 'panel'), r(4, 49, 46, 1, 'body'),
  r(4, 62, 46, 3, 'panel'), r(4, 63, 46, 1, 'body'),
  r(8, 48, 2, 3, 'dark'), r(16, 48, 2, 3, 'dark'), r(36, 48, 2, 3, 'dark'), r(44, 48, 2, 3, 'dark'),
  // reinforced gate with heavy timber lintel & skull trophy
  r(19, 53, 16, 22, 'panel'),
  tri(27, 49, 21, 54, 33, 54, 'light'), tri(27, 51, 23, 54, 31, 54, 'dark'),
  r(21, 57, 12, 18, 'dark'),
  r(22, 59, 4, 15, 'panel'), r(28, 59, 4, 15, 'panel'),
  r(23, 61, 2, 13, 'mid'), r(29, 61, 2, 13, 'mid'),
  // watch platform on corbel posts
  tri(14, 35, 12, 40, 16, 40, 'mid'), tri(27, 35, 25, 40, 29, 40, 'mid'), tri(40, 35, 38, 40, 42, 40, 'mid'),
  r(10, 32, 34, 5, 'panel'), r(10, 32, 34, 2, 'body'),
  // upper palisade parapet with notched battlements
  r(12, 23, 30, 9, 'edge'),
  r(12, 20, 5, 4, 'body'), r(20, 20, 5, 4, 'body'), r(29, 20, 5, 4, 'body'), r(37, 20, 5, 4, 'body'),
  tri(14, 18, 12, 21, 16, 21, 'body'), tri(22, 18, 20, 21, 24, 21, 'body'),
  tri(31, 18, 29, 21, 33, 21, 'body'), tri(39, 18, 37, 21, 41, 21, 'body'),
  // war brazier on platform rail with active flame
  r(6, 26, 5, 4, 'panel'), r(7, 27, 3, 2, 'dark'),
  r(7, 23, 3, 4, 'highlight'), r(8, 22, 1, 2, 'light'),
  // conical thatched straw roof with layered eaves
  tri(27, 0, 4, 21, 50, 21, 'body'),
  tri(27, 4, 8, 21, 46, 21, 'edge'),
  tri(27, 7, 13, 21, 41, 21, 'body'),
  r(26, 0, 2, 7, 'edge'),
  tri(27, 0, 24, 4, 27, 5, 'accent'),
  r(8, 20, 38, 2, 'panel'),
];

const KEEP: SpriteOp[] = [
  // stone plinth foundation
  r(3, 72, 48, 4, 'dark'),
  r(5, 69, 44, 4, 'panel'),
  tri(5, 68, 2, 72, 5, 72, 'mid'), tri(49, 68, 49, 72, 52, 72, 'mid'),
  // curtain wall with ashlar masonry courses
  r(6, 42, 42, 28, 'edge'),
  r(6, 49, 42, 1, 'dark'), r(6, 56, 42, 1, 'dark'), r(6, 63, 42, 1, 'dark'),
  r(14, 43, 1, 6, 'dark'), r(26, 43, 1, 6, 'dark'), r(38, 43, 1, 6, 'dark'),
  r(10, 50, 1, 6, 'dark'), r(22, 50, 1, 6, 'dark'), r(34, 50, 1, 6, 'dark'), r(44, 50, 1, 6, 'dark'),
  r(16, 57, 1, 6, 'dark'), r(30, 57, 1, 6, 'dark'), r(40, 57, 1, 6, 'dark'),
  r(7, 43, 6, 1, 'body'), r(19, 43, 6, 1, 'body'), r(31, 43, 6, 1, 'body'),
  r(11, 50, 6, 1, 'body'), r(23, 50, 6, 1, 'body'), r(35, 50, 6, 1, 'body'),
  // wall-walk machicolation and crenellations
  r(5, 38, 44, 4, 'panel'), r(5, 38, 44, 1, 'body'),
  r(7, 40, 3, 3, 'mid'), r(15, 40, 3, 3, 'mid'), r(23, 40, 3, 3, 'mid'),
  r(31, 40, 3, 3, 'mid'), r(39, 40, 3, 3, 'mid'), r(45, 40, 3, 3, 'mid'),
  r(5, 33, 5, 5, 'body'), r(13, 33, 5, 5, 'body'), r(21, 33, 5, 5, 'body'),
  r(29, 33, 5, 5, 'body'), r(37, 33, 5, 5, 'body'), r(45, 33, 5, 5, 'body'),
  // flanking towers with arrow slits
  r(5, 15, 11, 20, 'body'), r(13, 15, 3, 20, 'edge'), r(9, 21, 2, 6, 'dark'),
  r(38, 15, 11, 20, 'body'), r(46, 15, 3, 20, 'edge'), r(42, 21, 2, 6, 'dark'),
  r(4, 12, 13, 3, 'edge'), r(37, 12, 13, 3, 'edge'),
  r(4, 8, 3, 4, 'body'), r(9, 8, 3, 4, 'body'), r(14, 8, 3, 4, 'body'),
  r(37, 8, 3, 4, 'body'), r(42, 8, 3, 4, 'body'), r(47, 8, 3, 4, 'body'),
  // great central donjon keep
  r(18, 5, 18, 34, 'edge'), r(19, 6, 16, 32, 'body'),
  r(16, 3, 22, 3, 'panel'), r(16, 3, 22, 1, 'highlight'),
  r(16, 0, 4, 3, 'body'), r(22, 0, 4, 3, 'body'), r(28, 0, 4, 3, 'body'), r(34, 0, 4, 3, 'body'),
  // donjon arched window
  r(23, 11, 8, 10, 'dark'), tri(27, 8, 23, 11, 30, 11, 'dark'),
  r(24, 12, 6, 8, 'light'), r(26, 12, 2, 8, 'edge'), r(24, 15, 6, 1, 'edge'),
  // portcullis gatehouse & steps
  r(19, 56, 16, 17, 'panel'),
  tri(27, 50, 19, 56, 34, 56, 'mid'),
  r(22, 59, 10, 14, 'dark'),
  r(24, 60, 1, 13, 'edge'), r(27, 60, 1, 13, 'edge'), r(30, 60, 1, 13, 'edge'),
  r(16, 73, 22, 3, 'mid'),
];

const BUNKER: SpriteOp[] = [
  // heavy blast foundation
  r(2, 71, 50, 5, 'dark'),
  r(3, 72, 48, 3, 'mid'),
  // reinforced composite blockhouse
  r(4, 34, 46, 38, 'mid'),
  r(4, 34, 46, 3, 'edge'), r(4, 34, 46, 1, 'light'),
  // armored vertical seams & recessed expansion joints
  r(14, 37, 2, 34, 'dark'), r(27, 37, 2, 22, 'dark'), r(40, 37, 2, 34, 'dark'),
  // industrial hazard warning band
  r(6, 49, 42, 3, 'light'),
  r(10, 49, 3, 3, 'dark'), r(20, 49, 3, 3, 'dark'), r(30, 49, 3, 3, 'dark'), r(40, 49, 3, 3, 'dark'),
  // fortified embrasures & corner rivets
  r(8, 42, 5, 2, 'dark'), r(41, 42, 5, 2, 'dark'),
  r(6, 37, 2, 2, 'light'), r(6, 65, 2, 2, 'light'),
  r(46, 37, 2, 2, 'light'), r(46, 65, 2, 2, 'light'),
  // heavy pneumatic blast door
  r(20, 58, 14, 15, 'edge'), r(21, 59, 12, 13, 'dark'),
  r(22, 60, 10, 11, 'panel'),
  r(26, 64, 2, 2, 'highlight'),
  // command observation deck on pylons
  r(18, 26, 4, 8, 'dark'), r(32, 26, 4, 8, 'dark'),
  r(12, 12, 30, 15, 'edge'), r(13, 13, 28, 13, 'mid'),
  // narrow panoramic ballistic visor
  r(16, 16, 22, 5, 'dark'),
  r(17, 17, 9, 3, 'body'), r(28, 17, 9, 3, 'body'),
  r(18, 17, 3, 1, 'light'), r(29, 17, 3, 1, 'light'),
  // radar array & communications mast
  r(26, 3, 2, 9, 'edge'),
  r(18, 2, 7, 5, 'body'), r(17, 3, 2, 3, 'light'), tri(22, 1, 18, 4, 24, 4, 'edge'),
  r(26, 0, 2, 3, 'highlight'), r(26, 1, 2, 1, 'light'),
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

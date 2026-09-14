import type { Age, UnitRole } from '../sim/types';
import { r, tri, type SpriteOp } from './spriteops';

/**
 * Interface portraits: the same 1:1 pixel grid as the battlefield, authored at
 * 16x18 and displayed at PIXEL_SCALE (32x36) inside the deploy buttons.
 */
export const PORTRAIT_CANVAS = { w: 16, h: 18 };

const STONE_SWARM: SpriteOp[] = [
  r(6, 9, 6, 6, 'mid'),
  r(7, 4, 5, 5, 'body'),
  r(7, 3, 5, 2, 'dark'),
  r(5, 12, 2, 5, 'panel'), r(11, 12, 2, 5, 'panel'),
  r(11, 6, 4, 2, 'mid'), r(14, 4, 2, 4, 'edge'),
  r(3, 8, 3, 6, 'edge'),
];

const STONE_TANK: SpriteOp[] = [
  r(2, 8, 11, 6, 'mid'),
  r(11, 6, 4, 6, 'mid'),
  r(13, 12, 3, 1, 'light'),
  r(2, 14, 2, 4, 'panel'), r(5, 14, 2, 4, 'panel'),
  r(9, 14, 2, 4, 'panel'), r(12, 14, 2, 4, 'panel'),
  r(3, 3, 5, 5, 'body'),
  r(2, 2, 6, 2, 'dark'),
  r(9, 1, 1, 9, 'mid'),
];

const STONE_RANGED: SpriteOp[] = [
  r(6, 9, 6, 6, 'body'),
  r(5, 14, 3, 4, 'panel'),
  r(7, 4, 5, 5, 'body'),
  r(6, 3, 6, 2, 'dark'),
  r(11, 5, 2, 2, 'dark'), r(13, 7, 2, 2, 'dark'), r(12, 10, 2, 2, 'dark'),
  r(13, 7, 3, 3, 'edge'),
];

const MEDIEVAL_SWARM: SpriteOp[] = [
  r(6, 9, 6, 7, 'mid'),
  r(5, 8, 8, 2, 'edge'),
  r(7, 3, 5, 5, 'light'),
  r(10, 5, 2, 2, 'ink'),
  r(2, 8, 4, 7, 'edge'),
  r(4, 10, 2, 4, 'light'),
  r(12, 3, 2, 8, 'light'),
  r(11, 9, 4, 1, 'accent'),
];

const MEDIEVAL_TANK: SpriteOp[] = [
  r(2, 9, 10, 5, 'panel'),
  r(3, 7, 8, 3, 'edge'),
  r(11, 5, 4, 6, 'panel'),
  r(2, 14, 2, 4, 'panel'), r(5, 14, 2, 4, 'panel'),
  r(9, 14, 2, 4, 'panel'), r(12, 14, 2, 4, 'panel'),
  r(4, 1, 5, 6, 'mid'),
  r(5, 0, 3, 2, 'highlight'),
  r(9, 2, 6, 1, 'mid'),
];

const MEDIEVAL_RANGED: SpriteOp[] = [
  r(6, 9, 6, 6, 'mid'),
  r(5, 14, 3, 4, 'panel'), r(9, 14, 3, 4, 'panel'),
  r(7, 4, 5, 5, 'mid'),
  r(10, 6, 2, 2, 'body'),
  r(2, 4, 3, 11, 'mid'),
  r(3, 5, 1, 9, 'light'),
  r(4, 9, 8, 1, 'light'),
];

const MODERN_SWARM: SpriteOp[] = [
  r(6, 9, 6, 7, 'mid'),
  r(5, 8, 8, 2, 'edge'),
  r(6, 3, 6, 5, 'edge'),
  r(10, 5, 2, 2, 'body'),
  r(2, 8, 3, 6, 'panel'),
  r(2, 2, 1, 6, 'light'),
  r(12, 10, 4, 2, 'mid'),
  r(3, 14, 10, 2, 'dark'),
];

const MODERN_TANK: SpriteOp[] = [
  r(2, 10, 12, 4, 'mid'),
  r(1, 13, 14, 4, 'panel'),
  r(14, 10, 2, 3, 'edge'),
  r(4, 5, 6, 5, 'mid'),
  r(9, 6, 7, 2, 'edge'),
  r(12, 3, 1, 4, 'light'),
  r(3, 6, 1, 4, 'light'),
];

const MODERN_RANGED: SpriteOp[] = [
  r(5, 10, 7, 6, 'mid'),
  r(3, 8, 4, 8, 'panel'),
  r(6, 5, 6, 5, 'body'),
  r(5, 4, 8, 2, 'edge'),
  r(12, 12, 4, 2, 'edge'),
  r(12, 10, 3, 2, 'panel'),
  r(4, 15, 12, 2, 'dark'),
];

export const PORTRAIT_ART: Record<Age, Record<UnitRole, SpriteOp[]>> = {
  stone: { swarm: STONE_SWARM, tank: STONE_TANK, ranged: STONE_RANGED },
  medieval: { swarm: MEDIEVAL_SWARM, tank: MEDIEVAL_TANK, ranged: MEDIEVAL_RANGED },
  modern: { swarm: MODERN_SWARM, tank: MODERN_TANK, ranged: MODERN_RANGED },
};

/** Unused triangles import guard (kept for future portrait detailing). */
export const _tri = tri;

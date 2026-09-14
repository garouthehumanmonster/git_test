import type { Age, UnitRole } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Unit art.
 *
 * Canvases are small on purpose — a unit is roughly a fifth of the lane's
 * height — and every silhouette is drawn at 1:1 with PIXEL_SCALE (2x), the same
 * texel density as the lane terrain, the props and the backdrop.
 *
 * Faces point right; the renderer mirrors the sprite for the enemy side.
 * Silhouettes are shared between the three ages of a role so the counter
 * triangle stays legible, while equipment, cloth and detail change completely:
 * club and hide shield, plated man-at-arms with a great sword, rifle-toting
 * commando.
 */
export interface UnitCanvas {
  w: number;
  h: number;
  /** Row inside the canvas where the feet rest. */
  foot: number;
}

export const UNIT_SIZES: Record<UnitRole, UnitCanvas> = {
  swarm: { w: 40, h: 26, foot: 24 },
  tank: { w: 56, h: 30, foot: 28 },
  ranged: { w: 34, h: 26, foot: 24 },
};

/** Kept for backwards-compatible imports in the HUD/preview. */
export const UNIT_CANVAS = UNIT_SIZES.swarm;
export const FOOT_ROW = UNIT_SIZES.swarm.foot;

export function unitKey(age: Age | string, role: UnitRole | string, side: 'player' | 'ai' = 'player'): string {
  return `unit_${age}_${role}_${side}`;
}

// ---------------------------------------------------------------- stone age

const CLUBBER: SpriteOp[] = [
  // hide shield, held on the far side
  r(8, 8, 5, 9, 'body'),
  r(9, 11, 3, 3, 'accent'),
  // legs + bare feet
  r(14, 16, 3, 8, 'mid'), r(18, 16, 3, 8, 'mid'),
  r(13, 24, 4, 1, 'panel'), r(18, 24, 4, 1, 'panel'),
  // bare torso with a team sash and leather belt
  r(13, 9, 8, 7, 'edge'),
  r(14, 9, 7, 2, 'body'),
  r(13, 11, 8, 1, 'team'),
  r(13, 15, 8, 1, 'panel'),
  // head, hair, headband, eye
  r(14, 3, 6, 6, 'body'),
  r(13, 2, 7, 2, 'panel'),
  r(14, 4, 6, 1, 'team'),
  r(18, 6, 1, 1, 'ink'),
  // club: forearm, shaft, knotted head
  r(21, 9, 3, 2, 'body'),
  r(24, 8, 3, 2, 'body'),
  r(27, 8, 7, 2, 'edge'),
  r(33, 5, 6, 5, 'body'),
  r(34, 6, 2, 1, 'accent'),
];

const WAR_MAMMOTH: SpriteOp[] = [
  // four legs + feet
  r(6, 20, 4, 8, 'mid'), r(13, 20, 4, 8, 'mid'),
  r(22, 20, 4, 8, 'mid'), r(29, 20, 4, 8, 'mid'),
  r(5, 28, 5, 1, 'panel'), r(12, 28, 5, 1, 'panel'),
  r(21, 28, 5, 1, 'panel'), r(28, 28, 5, 1, 'panel'),
  // tail, shaggy body, shoulder fur
  r(2, 11, 2, 5, 'mid'),
  r(4, 10, 34, 11, 'edge'),
  r(4, 19, 34, 2, 'mid'),
  r(7, 12, 7, 6, 'body'),
  // ear, head, eye, tusk, trunk
  r(36, 6, 4, 4, 'mid'),
  r(38, 7, 9, 9, 'edge'),
  r(43, 10, 1, 1, 'ink'),
  r(46, 13, 3, 3, 'light'),
  r(46, 11, 2, 3, 'body'),
  r(47, 15, 2, 3, 'light'),
  // rider: cape, head, spear with pennant
  r(14, 3, 6, 8, 'body'),
  r(13, 4, 7, 1, 'team'),
  r(15, 0, 4, 4, 'body'),
  r(14, 0, 5, 1, 'panel'),
  r(22, 0, 1, 12, 'edge'),
  tri(23, 0, 30, 3, 23, 6, 'team'),
];

const SLINGER: SpriteOp[] = [
  // rock pouch
  r(12, 10, 4, 4, 'body'),
  // legs + feet
  r(13, 16, 4, 8, 'body'), r(18, 16, 4, 8, 'body'),
  r(12, 24, 5, 1, 'panel'), r(18, 24, 5, 1, 'panel'),
  // torso, team sash, hide skirt
  r(12, 9, 9, 7, 'body'),
  r(12, 11, 9, 1, 'team'),
  r(11, 15, 11, 2, 'mid'),
  // head, hair, eye
  r(14, 3, 6, 6, 'body'),
  r(13, 2, 7, 2, 'panel'),
  r(18, 6, 1, 1, 'ink'),
  // whirling sling: cord, stone, forearm
  r(21, 9, 3, 2, 'body'),
  r(24, 6, 1, 1, 'panel'), r(25, 8, 1, 2, 'panel'), r(25, 11, 1, 2, 'panel'), r(24, 13, 2, 1, 'panel'),
  r(25, 7, 3, 3, 'body'),
  r(26, 8, 1, 1, 'light'),
];

// ------------------------------------------------------------ medieval age

const MAN_AT_ARMS: SpriteOp[] = [
  // kite shield with a heraldic cross
  r(7, 7, 6, 9, 'body'),
  tri(6, 16, 14, 16, 10, 21, 'body'),
  r(9, 9, 2, 6, 'light'),
  r(7, 11, 6, 2, 'light'),
  // legs in mail + sabatons
  r(14, 16, 3, 8, 'mid'), r(18, 16, 3, 8, 'mid'),
  r(13, 24, 4, 1, 'panel'), r(18, 24, 4, 1, 'panel'),
  // mail hauberk with pauldrons and a tabard stripe
  r(13, 9, 8, 7, 'edge'),
  r(12, 9, 10, 2, 'body'),
  r(15, 10, 4, 6, 'team'),
  r(13, 15, 8, 1, 'panel'),
  // great helm with a visor slot and a plume
  r(14, 2, 6, 7, 'light'),
  r(14, 8, 6, 1, 'body'),
  r(18, 5, 2, 2, 'ink'),
  r(15, 0, 4, 2, 'team'),
  // raised sword: fist, blade, crossguard, pommel
  r(21, 9, 3, 3, 'body'),
  r(24, 1, 2, 12, 'light'),
  r(22, 11, 6, 1, 'accent'),
  r(25, 13, 1, 2, 'panel'),
];

const KNIGHT_HORSE: SpriteOp[] = [
  // horse legs + hooves
  r(6, 20, 4, 8, 'mid'), r(13, 20, 4, 8, 'mid'),
  r(24, 20, 4, 8, 'mid'), r(31, 20, 4, 8, 'mid'),
  r(5, 28, 5, 1, 'panel'), r(12, 28, 5, 1, 'panel'),
  r(23, 28, 5, 1, 'panel'), r(30, 28, 5, 1, 'panel'),
  // tail, barrel, caparison with a team trim
  r(2, 12, 3, 6, 'edge'),
  r(5, 12, 32, 10, 'edge'),
  r(7, 10, 28, 5, 'body'),
  r(7, 10, 28, 1, 'team'),
  // neck, head, mane, muzzle, eye
  r(36, 6, 6, 8, 'mid'),
  r(41, 4, 7, 7, 'mid'),
  r(47, 9, 3, 3, 'edge'),
  r(46, 5, 1, 1, 'ink'),
  r(39, 2, 3, 4, 'edge'),
  // rider: plate, helm, shield
  r(13, 2, 8, 9, 'edge'),
  r(12, 2, 10, 1, 'team'),
  r(15, 0, 5, 4, 'light'),
  r(20, 2, 6, 9, 'body'),
  r(22, 4, 2, 5, 'light'),
  // couched lance with a pennant
  r(26, 6, 28, 2, 'edge'),
  tri(54, 5, 55, 7, 54, 9, 'light'),
  tri(34, 0, 44, 3, 34, 6, 'team'),
];

const ARCHER: SpriteOp[] = [
  // quiver and arrows over the shoulder
  r(9, 8, 5, 8, 'body'),
  r(9, 5, 1, 3, 'light'), r(12, 4, 1, 4, 'light'),
  // legs + boots
  r(14, 16, 3, 8, 'mid'), r(18, 16, 3, 8, 'mid'),
  r(13, 24, 4, 1, 'panel'), r(18, 24, 4, 1, 'panel'),
  // gambeson with a team trim
  r(13, 9, 8, 7, 'edge'),
  r(12, 9, 10, 2, 'body'),
  r(13, 12, 8, 1, 'team'),
  r(13, 15, 8, 1, 'panel'),
  // hood and face
  r(14, 2, 6, 7, 'edge'),
  r(14, 2, 6, 1, 'team'),
  r(17, 5, 3, 3, 'body'),
  r(19, 6, 1, 1, 'ink'),
  // longbow, string and nocked arrow
  r(24, 2, 2, 18, 'edge'),
  r(23, 0, 3, 3, 'edge'), r(23, 19, 3, 3, 'edge'),
  r(22, 3, 1, 16, 'light'),
  r(23, 10, 9, 1, 'light'),
  tri(32, 8, 33, 10, 32, 12, 'light'),
];

// -------------------------------------------------------------- modern age

const COMMANDO: SpriteOp[] = [
  // field radio and antenna on the back
  r(7, 8, 5, 7, 'mid'),
  r(8, 1, 1, 7, 'light'),
  r(8, 9, 1, 1, 'highlight'),
  // legs + boots
  r(14, 16, 3, 8, 'mid'), r(18, 16, 3, 8, 'mid'),
  r(13, 24, 4, 1, 'panel'), r(18, 24, 4, 1, 'panel'),
  // plate carrier over fatigues
  r(13, 9, 8, 7, 'body'),
  r(12, 10, 10, 3, 'edge'),
  r(14, 13, 2, 2, 'mid'), r(17, 13, 2, 2, 'mid'),
  r(13, 15, 8, 1, 'team'),
  // helmet with a lit rim, and goggles
  r(14, 2, 6, 5, 'body'),
  r(14, 2, 6, 1, 'body'),
  r(18, 5, 3, 2, 'body'),
  r(19, 6, 1, 1, 'ink'),
  // carbine: stock, receiver, optic, barrel, magazine
  r(21, 12, 3, 3, 'mid'),
  r(24, 11, 8, 3, 'edge'),
  r(25, 11, 6, 1, 'accent'),
  r(30, 9, 5, 2, 'body'),
  r(35, 12, 5, 1, 'light'),
  r(25, 14, 3, 4, 'mid'),
  r(26, 10, 2, 2, 'body'),
];

const HEAVY_TANK: SpriteOp[] = [
  // track assembly
  r(2, 20, 38, 6, 'mid'),
  r(4, 21, 4, 4, 'panel'), r(10, 21, 4, 4, 'panel'), r(16, 21, 4, 4, 'panel'),
  r(22, 21, 4, 4, 'panel'), r(28, 21, 4, 4, 'panel'), r(34, 21, 4, 4, 'panel'),
  r(2, 19, 38, 2, 'edge'),
  // hull, glacis plate, team panel
  r(4, 12, 30, 7, 'body'),
  r(5, 13, 27, 1, 'body'),
  r(5, 12, 26, 1, 'accent'),
  r(6, 15, 8, 3, 'team'),
  r(33, 12, 8, 7, 'body'),
  // turret, hatch, antenna
  r(9, 5, 18, 8, 'edge'),
  r(10, 5, 16, 1, 'body'),
  r(10, 8, 16, 4, 'body'),
  r(10, 5, 16, 1, 'body'),
  r(10, 2, 6, 3, 'mid'),
  r(24, 1, 1, 4, 'light'),
  // main gun
  r(26, 6, 3, 5, 'mid'),
  r(29, 7, 17, 3, 'body'),
  r(45, 5, 7, 7, 'light'),
  // cupola machine gun
  r(19, 2, 11, 2, 'mid'),
  r(28, 2, 6, 1, 'panel'),
];

const SNIPER: SpriteOp[] = [
  // ghillie cape with a lit edge
  r(6, 9, 16, 13, 'mid'),
  r(6, 9, 16, 1, 'edge'),
  r(6, 9, 4, 4, 'body'), r(14, 17, 5, 5, 'body'), r(8, 19, 5, 3, 'edge'),
  // kneeling legs
  r(13, 20, 5, 4, 'edge'), r(18, 18, 5, 6, 'body'),
  r(12, 24, 6, 1, 'panel'), r(18, 24, 6, 1, 'panel'),
  // torso
  r(12, 10, 9, 9, 'body'),
  r(12, 10, 9, 1, 'team'),
  // head, cap, eye
  r(14, 4, 6, 6, 'body'),
  r(13, 3, 7, 1, 'body'),
  r(19, 6, 1, 1, 'ink'),
  // anti-materiel rifle: stock, receiver, scope, bipod, muzzle
  r(17, 13, 5, 3, 'mid'),
  r(22, 12, 8, 2, 'body'),
  r(22, 12, 7, 1, 'accent'),
  r(24, 8, 5, 3, 'mid'),
  r(28, 9, 2, 1, 'accent'),
  r(29, 14, 2, 6, 'light'), r(30, 19, 5, 1, 'light'),
  r(30, 12, 4, 2, 'light'),
];

export const UNIT_ART: Record<Age, Record<UnitRole, SpriteOp[]>> = {
  stone: { swarm: CLUBBER, tank: WAR_MAMMOTH, ranged: SLINGER },
  medieval: { swarm: MAN_AT_ARMS, tank: KNIGHT_HORSE, ranged: ARCHER },
  modern: { swarm: COMMANDO, tank: HEAVY_TANK, ranged: SNIPER },
};

/**
 * Final texture geometry for every unit. `fitSprite` guarantees the 1px ink
 * outline is never clipped by the canvas edge, and the fitted `foot` row is
 * what the renderer uses as the sprite origin so units stand on the ground line.
 */
export const UNIT_FIT: Record<Age, Record<UnitRole, FittedSprite>> = {
  stone: {}, medieval: {}, modern: {},
} as unknown as Record<Age, Record<UnitRole, FittedSprite>>;

for (const age of Object.keys(UNIT_ART) as Age[]) {
  for (const role of Object.keys(UNIT_ART[age]) as UnitRole[]) {
    const size = UNIT_SIZES[role];
    UNIT_FIT[age][role] = fitSprite(UNIT_ART[age][role], size.w, size.h, size.foot);
  }
}

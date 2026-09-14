import type { Age, UnitRole } from '../sim/types';
import { fitSprite, r, tri, type FittedSprite, type SpriteOp } from './spriteops';

/**
 * Unit art.
 *
 * Scale contract (see `test/render/art.test.ts`): human units are authored 28
 * art px tall (56 on screen), beast/vehicle heavies 36 (72), base towers 76
 * (152). Every silhouette is drawn at 1:1 with PIXEL_SCALE (2x), the same
 * texel density as the lane terrain, the props and the backdrop — so a tower
 * is ~2.7x a human and ~2x a war beast, and heavies read as half a tower, not
 * as its rival.
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
  swarm: { w: 40, h: 28, foot: 26 },
  tank: { w: 48, h: 36, foot: 34 },
  ranged: { w: 36, h: 28, foot: 26 },
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
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
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
  // club raised overhead: forearm, wrist, shaft, knotted head. Held high so the
  // weapon reads above the file instead of barring across the next unit's face.
  r(21, 9, 3, 2, 'body'),
  r(24, 7, 4, 2, 'body'),
  r(27, 5, 6, 2, 'edge'),
  r(31, 1, 5, 5, 'body'),
  r(32, 2, 2, 1, 'accent'),
];

/**
 * War mammoth. Read as an animal first: a domed skull taller than the rider,
 * a trunk hanging down the front of the chest, tusks sweeping up past it, a
 * high shoulder hump sloping to low hindquarters and daylight under the belly
 * between the leg pairs. Kept inside a 48-wide canvas so the beast — however
 * massive — never out-sizes the base tower (54 wide).
 */
const WAR_MAMMOTH: SpriteOp[] = [
  // legs — near pair in body tone so they read as limbs, far pair darkened
  r(8, 24, 4, 10, 'edge'), r(13, 24, 3, 10, 'mid'),
  r(29, 24, 4, 10, 'edge'), r(34, 24, 3, 10, 'mid'),
  r(7, 34, 6, 1, 'panel'), r(13, 34, 4, 1, 'panel'),
  r(28, 34, 6, 1, 'panel'), r(34, 34, 4, 1, 'panel'),
  // body: barrel, then the hump stepping up to the skull crown
  r(3, 15, 35, 9, 'edge'),
  r(17, 11, 21, 5, 'edge'),
  r(23, 8, 14, 4, 'edge'),
  r(4, 21, 33, 2, 'mid'),
  r(20, 10, 9, 1, 'body'),
  r(6, 14, 9, 1, 'body'),
  r(12, 16, 4, 6, 'mid'),
  r(9, 18, 3, 4, 'body'),
  // tail with a tuft
  r(1, 16, 2, 4, 'edge'), r(0, 19, 2, 4, 'mid'), r(1, 23, 2, 2, 'edge'),
  // skull: high domed crown over a short face, ear, cheek, eye
  r(36, 9, 9, 8, 'edge'),
  r(38, 5, 6, 5, 'edge'),
  r(35, 10, 3, 5, 'mid'),
  r(39, 12, 3, 3, 'body'),
  r(42, 11, 1, 1, 'ink'),
  // trunk down the front of the chest, curling at the tip
  r(44, 13, 2, 8, 'edge'), r(43, 21, 3, 2, 'edge'), r(43, 23, 3, 1, 'mid'),
  // tusks sweeping forward and up past the trunk
  r(42, 19, 2, 2, 'light'), r(44, 17, 3, 2, 'light'),
  r(46, 13, 1, 4, 'light'), r(45, 11, 1, 2, 'light'),
  // rider: fur-clad chief with a team blanket, spear and pennant
  r(21, 8, 5, 5, 'mid'),
  r(17, 12, 12, 2, 'team'),
  r(20, 4, 6, 6, 'body'),
  r(20, 4, 6, 1, 'team'),
  r(21, 1, 4, 3, 'body'),
  r(20, 1, 6, 1, 'panel'),
  r(26, 0, 1, 9, 'edge'),
  tri(27, 0, 34, 2, 27, 5, 'team'),
];

const SLINGER: SpriteOp[] = [
  // rock pouch
  r(12, 10, 4, 4, 'body'),
  // legs + feet
  r(13, 16, 4, 10, 'body'), r(18, 16, 4, 10, 'body'),
  r(12, 26, 5, 1, 'panel'), r(18, 26, 5, 1, 'panel'),
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
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
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
  r(7, 24, 4, 10, 'edge'), r(13, 24, 4, 10, 'mid'),
  r(28, 24, 4, 10, 'mid'), r(34, 24, 4, 10, 'edge'),
  r(6, 34, 6, 1, 'panel'), r(12, 34, 6, 1, 'panel'),
  r(27, 34, 6, 1, 'panel'), r(33, 34, 6, 1, 'panel'),
  // tail, barrel, caparison with a team trim
  r(2, 14, 3, 8, 'edge'),
  r(5, 15, 34, 10, 'edge'),
  r(7, 12, 30, 5, 'body'),
  r(7, 12, 30, 1, 'team'),
  // arched neck, head, mane, muzzle, eye
  r(37, 7, 7, 10, 'edge'),
  r(42, 4, 6, 8, 'edge'),
  r(45, 8, 2, 3, 'mid'),
  r(45, 6, 1, 1, 'ink'),
  r(38, 3, 3, 5, 'mid'),
  // rider: plate, helm with a plume and visor, shield
  r(14, 3, 8, 10, 'edge'),
  r(13, 3, 10, 1, 'team'),
  r(16, 0, 5, 4, 'light'),
  r(15, 0, 2, 2, 'team'),
  r(19, 2, 1, 1, 'ink'),
  r(22, 3, 6, 10, 'body'),
  r(24, 5, 2, 6, 'light'),
  // couched lance with a pennant
  r(27, 7, 18, 2, 'edge'),
  tri(45, 6, 46, 8, 45, 10, 'light'),
  tri(33, 0, 43, 3, 33, 6, 'team'),
];

const ARCHER: SpriteOp[] = [
  // quiver and arrows over the shoulder
  r(9, 8, 5, 8, 'body'),
  r(9, 5, 1, 3, 'light'), r(12, 4, 1, 4, 'light'),
  // legs + boots
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
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
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
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
  // track assembly reaching the ground row
  r(2, 24, 40, 2, 'edge'),
  r(2, 26, 40, 9, 'mid'),
  r(4, 27, 4, 5, 'panel'), r(10, 27, 4, 5, 'panel'), r(16, 27, 4, 5, 'panel'),
  r(22, 27, 4, 5, 'panel'), r(28, 27, 4, 5, 'panel'), r(34, 27, 4, 5, 'panel'),
  // hull, glacis plate, team panel
  r(4, 18, 34, 8, 'body'),
  r(6, 19, 28, 1, 'accent'),
  r(6, 18, 26, 1, 'body'),
  r(6, 21, 8, 4, 'team'),
  r(36, 18, 6, 8, 'body'),
  // turret, hatch, antenna
  r(10, 8, 20, 10, 'edge'),
  r(11, 8, 18, 2, 'body'),
  r(11, 12, 18, 4, 'body'),
  r(12, 5, 6, 3, 'mid'),
  r(26, 2, 1, 5, 'light'),
  // main gun: mantlet, barrel, muzzle brake
  r(29, 9, 3, 5, 'mid'),
  r(32, 10, 12, 3, 'body'),
  r(43, 8, 4, 7, 'light'),
  // cupola machine gun
  r(20, 4, 11, 2, 'mid'),
  r(29, 4, 6, 1, 'panel'),
];

const SNIPER: SpriteOp[] = [
  // ghillie cape with a lit edge
  r(6, 9, 16, 13, 'mid'),
  r(6, 9, 16, 1, 'edge'),
  r(6, 9, 4, 4, 'body'), r(14, 17, 5, 5, 'body'), r(8, 19, 5, 3, 'edge'),
  // kneeling legs
  r(13, 22, 5, 4, 'edge'), r(18, 20, 5, 6, 'body'),
  r(12, 26, 6, 1, 'panel'), r(18, 26, 6, 1, 'panel'),
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

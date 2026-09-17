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
  // hide shield, held on the far side with bold team face and wood boss
  r(7, 8, 6, 9, 'mid'),
  r(8, 9, 4, 7, 'team'),
  r(9, 11, 2, 3, 'accent'),
  // legs with calf definition + bare feet
  r(13, 16, 4, 5, 'edge'), r(14, 21, 3, 5, 'mid'),
  r(18, 16, 4, 5, 'edge'), r(19, 21, 3, 5, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(19, 26, 4, 1, 'panel'),
  // bare torso: back shadow, muscle mid-tone, chest highlight, sash & team war-kilt
  r(12, 9, 9, 7, 'edge'),
  r(14, 9, 6, 5, 'body'),
  r(17, 10, 3, 2, 'accent'),
  r(12, 11, 9, 2, 'team'),
  r(12, 14, 9, 3, 'team'),
  r(12, 17, 9, 1, 'panel'),
  // head: ragged hair fringe, headband, brow ridge, eye, jawline
  r(14, 3, 6, 6, 'body'),
  r(13, 1, 5, 2, 'panel'), r(17, 2, 3, 1, 'panel'),
  r(13, 3, 7, 2, 'team'),
  r(19, 5, 1, 1, 'body'), // nose bridge
  r(18, 5, 1, 1, 'ink'),  // eye
  // club raised overhead: angled arm, knotted heavy stone cudgel with flake highlights
  r(20, 8, 3, 3, 'body'),
  r(23, 6, 4, 2, 'body'),
  r(26, 4, 5, 3, 'edge'),
  r(29, 0, 7, 6, 'mid'),
  r(30, 1, 5, 4, 'edge'),
  r(31, 2, 3, 2, 'accent'),
  r(32, 1, 1, 1, 'light'),
];

/**
 * War mammoth. High domed skull, curved ivory tusks with sharp points,
 * shaggy belly fringe, muscular hump and detailed rider.
 */
const WAR_MAMMOTH: SpriteOp[] = [
  // legs — muscular stance with massive padded feet
  r(8, 24, 5, 10, 'edge'), r(13, 24, 3, 10, 'mid'),
  r(29, 24, 5, 10, 'edge'), r(34, 24, 3, 10, 'mid'),
  r(7, 34, 7, 1, 'panel'), r(13, 34, 4, 1, 'panel'),
  r(28, 34, 7, 1, 'panel'), r(34, 34, 4, 1, 'panel'),
  // body: barrel, hump, shaggy fur fringe
  r(3, 15, 35, 9, 'edge'),
  r(17, 11, 21, 5, 'edge'),
  r(23, 8, 14, 4, 'edge'),
  r(4, 21, 33, 2, 'mid'),
  r(20, 10, 9, 1, 'body'),
  r(6, 14, 9, 1, 'body'),
  r(12, 16, 4, 6, 'mid'),
  r(9, 18, 3, 4, 'body'),
  // shaggy underbelly fur tufts
  tri(9, 24, 13, 26, 15, 24, 'mid'),
  tri(19, 24, 23, 26, 26, 24, 'mid'),
  // tail with hair tuft
  r(1, 16, 2, 4, 'edge'), r(0, 19, 2, 4, 'mid'), r(1, 23, 2, 2, 'edge'),
  // skull: high domed crown, ear flap, eye
  r(36, 9, 9, 8, 'edge'),
  r(38, 5, 6, 5, 'edge'),
  r(35, 10, 3, 5, 'mid'),
  r(39, 11, 3, 4, 'body'),
  r(42, 11, 1, 1, 'ink'),
  // trunk curling at tip
  r(44, 13, 2, 8, 'edge'),
  r(43, 21, 3, 2, 'edge'),
  r(44, 23, 2, 1, 'mid'),
  // sharp curving ivory tusks
  tri(41, 20, 44, 16, 43, 20, 'light'),
  tri(43, 16, 46, 10, 44, 16, 'light'),
  tri(45, 11, 46, 8, 47, 11, 'light'),
  r(42, 18, 2, 2, 'accent'),
  // rider: fur-clad chieftain, broad team blanket with gold fringe, spear with pennant
  r(21, 8, 5, 5, 'mid'),
  r(14, 11, 18, 5, 'team'),
  r(13, 16, 20, 1, 'accent'),
  r(20, 4, 6, 6, 'body'),
  r(19, 3, 8, 2, 'team'),
  r(21, 1, 4, 3, 'body'),
  r(20, 1, 6, 1, 'panel'),
  r(26, 0, 1, 9, 'edge'),
  tri(27, 0, 36, 2, 27, 6, 'team'),
];

const SLINGER: SpriteOp[] = [
  // rock pouch on hip
  r(11, 11, 4, 4, 'panel'),
  r(12, 12, 2, 2, 'mid'),
  // legs: dynamic braced throwing stance
  r(12, 16, 4, 5, 'edge'), r(13, 21, 4, 5, 'body'),
  r(18, 16, 4, 5, 'edge'), r(19, 21, 4, 5, 'body'),
  r(12, 26, 5, 1, 'panel'), r(19, 26, 5, 1, 'panel'),
  // torso, team war-tunic drape & skirt
  r(12, 9, 9, 7, 'edge'),
  r(12, 9, 8, 7, 'team'),
  r(12, 13, 8, 1, 'panel'),
  r(11, 15, 10, 2, 'team'),
  // head, hair, brow, eye, team feathered band
  r(14, 3, 6, 6, 'body'),
  r(13, 2, 7, 2, 'team'),
  tri(11, 0, 14, 2, 13, 4, 'team'),
  r(19, 5, 1, 1, 'body'),
  r(18, 5, 1, 1, 'ink'),
  // whirling sling: extended cords, stone pouch with rock
  r(21, 9, 3, 2, 'body'),
  r(24, 6, 1, 2, 'panel'),
  r(25, 8, 1, 3, 'panel'),
  r(24, 11, 2, 2, 'panel'),
  r(25, 6, 3, 3, 'mid'),
  r(26, 7, 2, 2, 'light'),
];

// ------------------------------------------------------------ medieval age

const MAN_AT_ARMS: SpriteOp[] = [
  // kite shield with bold heraldic team face, gold border and bright cross
  r(7, 7, 6, 9, 'team'),
  tri(6, 16, 14, 16, 10, 21, 'team'),
  r(6, 7, 1, 9, 'accent'),
  r(9, 8, 2, 8, 'highlight'),
  r(7, 11, 6, 2, 'highlight'),
  // legs in steel mail & poleyns + sabatons
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(14, 19, 3, 2, 'light'), r(18, 19, 3, 2, 'light'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
  // mail hauberk with layered pauldrons and bold team tabard
  r(13, 9, 8, 7, 'edge'),
  r(11, 8, 4, 3, 'light'), r(19, 8, 4, 3, 'light'),
  r(11, 10, 3, 1, 'mid'), r(20, 10, 3, 1, 'mid'),
  r(13, 10, 6, 6, 'team'),
  r(13, 15, 8, 1, 'panel'),
  // great helm with brass crown band, visor slot and heraldic plume
  r(14, 2, 6, 7, 'light'),
  r(14, 3, 6, 1, 'accent'),
  r(14, 8, 6, 1, 'body'),
  r(17, 5, 3, 1, 'ink'),
  tri(13, 0, 17, 0, 12, 3, 'team'),
  // raised arming sword: pommel, crossguard, tapered blade with edge gleam
  r(21, 9, 3, 3, 'body'),
  r(22, 11, 6, 1, 'accent'),
  r(24, 12, 2, 2, 'accent'),
  r(24, 2, 2, 9, 'light'),
  r(24, 3, 1, 7, 'accent'),
  tri(24, 2, 26, 2, 25, 0, 'light'),
];

const KNIGHT_HORSE: SpriteOp[] = [
  // horse legs + armored hooves
  r(7, 24, 4, 10, 'edge'), r(13, 24, 4, 10, 'mid'),
  r(28, 24, 4, 10, 'mid'), r(34, 24, 4, 10, 'edge'),
  r(6, 34, 6, 1, 'panel'), r(12, 34, 6, 1, 'panel'),
  r(27, 34, 6, 1, 'panel'), r(33, 34, 6, 1, 'panel'),
  // tail, barrel, caparison with scalloped heraldic trim
  r(2, 14, 3, 8, 'edge'),
  r(5, 15, 34, 10, 'edge'),
  r(6, 13, 32, 7, 'mid'),
  r(7, 12, 30, 6, 'team'),
  r(7, 18, 30, 1, 'accent'),
  tri(11, 19, 14, 21, 17, 19, 'accent'),
  tri(21, 19, 24, 21, 27, 19, 'accent'),
  // arched neck, barded chanfron (head armor), muzzle, eye slit
  r(37, 7, 7, 10, 'edge'),
  tri(36, 14, 40, 6, 44, 14, 'edge'),
  r(41, 4, 6, 8, 'body'),
  r(42, 3, 3, 2, 'accent'),
  r(45, 8, 2, 3, 'panel'),
  r(44, 6, 1, 1, 'ink'),
  r(38, 3, 3, 5, 'mid'),
  // rider: plate armor, grand helm with crest, bold team heater shield
  r(14, 3, 8, 10, 'edge'),
  r(13, 3, 10, 1, 'team'),
  r(16, 0, 5, 5, 'light'),
  tri(13, 0, 16, 1, 14, 3, 'team'),
  r(19, 2, 1, 1, 'ink'),
  r(22, 3, 6, 9, 'team'),
  r(22, 3, 6, 1, 'accent'),
  r(22, 11, 6, 1, 'accent'),
  r(24, 5, 2, 6, 'highlight'),
  // couched lance: vamplate, shaft, steel spearhead, fluttering pennant
  r(26, 5, 3, 5, 'accent'),
  r(28, 7, 17, 2, 'edge'),
  tri(45, 6, 47, 8, 45, 10, 'light'),
  tri(33, 1, 44, 3, 33, 6, 'team'),
];

const ARCHER: SpriteOp[] = [
  // leather quiver, chest strap, fletched arrows
  r(8, 8, 5, 8, 'panel'),
  r(12, 10, 6, 2, 'panel'),
  r(8, 4, 2, 4, 'light'), r(11, 3, 2, 5, 'light'),
  r(8, 3, 2, 1, 'highlight'), r(11, 2, 2, 1, 'highlight'),
  // legs + leather boots
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
  // padded gambeson with bold team tunic
  r(13, 9, 8, 7, 'edge'),
  r(12, 9, 9, 6, 'team'),
  r(12, 12, 9, 1, 'panel'),
  r(13, 15, 8, 1, 'panel'),
  // archer hood with feather and eye
  r(14, 2, 6, 7, 'edge'),
  r(14, 3, 6, 2, 'team'),
  tri(10, 0, 14, 1, 12, 4, 'team'),
  r(17, 5, 3, 3, 'body'),
  r(19, 6, 1, 1, 'ink'),
  // recurve longbow: curved limb tips, stave, grip, taut bowstring, nocked arrow
  tri(22, 0, 25, 0, 25, 3, 'edge'),
  tri(22, 21, 25, 21, 25, 18, 'edge'),
  r(24, 2, 2, 18, 'edge'),
  r(23, 9, 3, 3, 'mid'),
  r(21, 3, 1, 16, 'light'),
  r(20, 10, 12, 1, 'light'),
  tri(32, 9, 34, 10, 32, 11, 'light'),
];

// -------------------------------------------------------------- modern age

const COMMANDO: SpriteOp[] = [
  // field radio pack, beacon, whip antenna
  r(6, 7, 6, 8, 'panel'),
  r(7, 0, 1, 7, 'panel'),
  r(7, 0, 1, 2, 'team'),
  r(8, 9, 1, 1, 'highlight'),
  // legs + combat boots
  r(14, 16, 3, 10, 'mid'), r(18, 16, 3, 10, 'mid'),
  r(13, 26, 4, 1, 'panel'), r(18, 26, 4, 1, 'panel'),
  // plate carrier with ceramic plates, team chest webbing & arm patch
  r(12, 9, 10, 7, 'body'),
  r(13, 10, 8, 4, 'edge'),
  r(13, 10, 8, 2, 'team'),
  r(13, 14, 2, 2, 'panel'), r(16, 14, 2, 2, 'panel'), r(19, 14, 2, 2, 'panel'),
  r(11, 10, 2, 3, 'team'),
  // tactical helmet, NVG night vision goggles, comms mic, team headband
  r(13, 2, 7, 5, 'mid'),
  r(13, 3, 7, 2, 'team'),
  r(18, 4, 3, 2, 'edge'),
  r(19, 4, 2, 1, 'body'),
  r(17, 6, 3, 1, 'panel'),
  r(19, 6, 1, 1, 'ink'),
  // carbine: receiver, holographic sight, magazine, barrel, flash hider
  r(21, 11, 3, 3, 'panel'),
  r(24, 10, 8, 3, 'mid'),
  r(25, 8, 4, 2, 'panel'),
  r(26, 8, 1, 1, 'highlight'),
  r(25, 13, 3, 4, 'panel'),
  r(30, 12, 2, 3, 'panel'),
  r(32, 11, 5, 2, 'edge'),
  r(37, 11, 1, 2, 'light'),
];

const HEAVY_TANK: SpriteOp[] = [
  // track assembly, roadwheels with hubs, drive sprocket
  r(2, 24, 40, 2, 'panel'),
  r(1, 25, 42, 9, 'panel'),
  r(4, 26, 5, 7, 'mid'), r(6, 28, 1, 3, 'edge'),
  r(11, 26, 5, 7, 'mid'), r(13, 28, 1, 3, 'edge'),
  r(18, 26, 5, 7, 'mid'), r(20, 28, 1, 3, 'edge'),
  r(25, 26, 5, 7, 'mid'), r(27, 28, 1, 3, 'edge'),
  r(32, 26, 5, 7, 'mid'), r(34, 28, 1, 3, 'edge'),
  r(38, 26, 4, 6, 'edge'),
  // hull with sloped glacis, ERA reactive armor tiles, bold team insignia
  r(4, 18, 34, 7, 'body'),
  tri(34, 24, 44, 24, 42, 18, 'edge'),
  r(15, 18, 4, 3, 'edge'), r(20, 18, 4, 3, 'edge'), r(25, 18, 4, 3, 'edge'),
  r(5, 19, 10, 4, 'team'),
  // angular wedge turret, commander cupola, thermal optic, antenna pennant
  r(10, 8, 20, 9, 'edge'),
  r(12, 10, 16, 2, 'team'),
  tri(29, 8, 33, 12, 29, 16, 'edge'),
  r(12, 5, 5, 3, 'panel'),
  r(15, 6, 2, 1, 'body'),
  r(11, 1, 1, 5, 'panel'),
  tri(11, 1, 15, 2, 11, 4, 'team'),
  // main smoothbore cannon: armored mantlet, thermal bore sleeve, muzzle brake
  r(29, 10, 4, 5, 'panel'),
  r(33, 11, 10, 3, 'edge'),
  r(43, 9, 3, 7, 'mid'),
  r(46, 10, 1, 5, 'body'),
];

const SNIPER: SpriteOp[] = [
  // textured ghillie cape with ragged camouflage tufts, team shoulder mantle
  r(5, 8, 17, 13, 'panel'),
  tri(5, 12, 3, 15, 6, 17, 'edge'),
  tri(7, 18, 5, 21, 9, 21, 'mid'),
  tri(12, 20, 10, 23, 14, 21, 'edge'),
  r(9, 8, 8, 3, 'team'),
  // kneeling legs + tactical boots
  r(13, 22, 5, 4, 'edge'), r(18, 20, 5, 6, 'body'),
  r(12, 26, 6, 1, 'panel'), r(18, 26, 6, 1, 'panel'),
  // sniper boonie hat, mesh veil, eye, team hatband
  r(13, 4, 8, 2, 'panel'),
  r(13, 4, 8, 1, 'team'),
  r(14, 2, 6, 3, 'mid'),
  r(17, 5, 3, 3, 'edge'),
  r(18, 6, 1, 1, 'ink'),
  // heavy 50 cal anti-materiel rifle: stock, receiver, long range optic, fluted barrel, muzzle brake, bipod
  r(17, 13, 5, 3, 'panel'),
  r(22, 12, 7, 3, 'mid'),
  r(22, 8, 7, 3, 'panel'),
  r(21, 9, 1, 2, 'body'),
  r(28, 8, 2, 3, 'body'),
  r(29, 13, 5, 2, 'edge'),
  r(34, 12, 2, 4, 'panel'),
  r(29, 15, 1, 10, 'panel'), r(31, 15, 1, 10, 'panel'),
  r(28, 25, 5, 1, 'panel'),
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

import Phaser from 'phaser';
import type { Age, UnitRole } from '../sim/types';
import { OUTLINE, TEAM_COLORS, paletteFor } from './palette';
import { UNIT_ART, UNIT_SIZES, unitKey } from './unitart';
import { AGE_PROPS } from './propart';
import { BASE_ART, BASE_CANVAS, BASE_FOOT_ROW } from './basearth';
import { makeTexture, paintOps, r, tri, type SpriteOp } from './spriteops';
import { PORTRAIT_ART, PORTRAIT_CANVAS } from './portraits';

const AGES: Age[] = ['stone', 'medieval', 'modern'];
const ROLES: UnitRole[] = ['swarm', 'tank', 'ranged'];

/**
 * Every texture in the game is generated here at runtime on one shared pixel
 * grid (1 authored pixel = PIXEL_SCALE canvas pixels). Nothing is imported as a
 * bitmap, so there is no chance of a mismatched texel density or a background
 * bleeding through a sprite.
 */
export function generateTextures(scene: Phaser.Scene): void {
  generateUnitTextures(scene);
  generatePortraitTextures(scene);
  generateBaseTextures(scene);
  generatePropTextures(scene);
  generateProjectileTextures(scene);
  generateParticleTextures(scene);
  generateFlagTextures(scene);
  generateUITextures(scene);
  generateFlameTextures(scene);
}

function generateUnitTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    for (const role of ROLES) {
      // One tint per side: units are painted with their team cloth baked in,
      // rather than washed out by a whole-sprite tint at runtime.
      const size = UNIT_SIZES[role];
      for (const side of ['player', 'ai'] as const) {
        makeTexture(
          scene,
          unitKey(age, role, side),
          UNIT_ART[age][role],
          pal,
          TEAM_COLORS[side],
          size.w,
          size.h,
          size.foot,
        );
      }
    }
  }
}

/**
 * Compact HUD portraits. Same pixel grid as the battlefield, but authored at a
 * smaller size so a unit's silhouette fits inside an interface button.
 */
function generatePortraitTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    for (const role of ROLES) {
      makeTexture(
        scene,
        `portrait_${age}_${role}`,
        PORTRAIT_ART[age][role],
        pal,
        TEAM_COLORS.player,
        PORTRAIT_CANVAS.w,
        PORTRAIT_CANVAS.h,
        PORTRAIT_CANVAS.h,
      );
    }
  }
}

function generateBaseTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    for (const side of ['player', 'ai'] as const) {
      makeTexture(
        scene,
        `base_${age}_${side}`,
        BASE_ART[age](side),
        pal,
        TEAM_COLORS[side],
        BASE_CANVAS.w,
        BASE_CANVAS.h,
        BASE_FOOT_ROW,
      );
    }
  }
}

function generatePropTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    for (const def of Object.values(AGE_PROPS[age])) {
      makeTexture(scene, def.key, def.ops, pal, 0xffffff, def.fit.w, def.fit.h);
    }
  }
}

function generateProjectileTextures(scene: Phaser.Scene): void {
  const ops: Record<string, { w: number; h: number; list: SpriteOp[] }> = {
    // A spinning sling stone.
    proj_stone_ranged: {
      w: 8, h: 8,
      list: [r(2, 2, 5, 5, 'edge'), r(3, 3, 2, 2, 'light')],
    },
    // A fletched arrow.
    proj_medieval_ranged: {
      w: 20, h: 8,
      list: [
        r(2, 3, 14, 2, 'mid'),
        tri(16, 1, 19, 4, 16, 7, 'light'),
        r(0, 2, 3, 1, 'highlight'), r(0, 5, 3, 1, 'highlight'),
        r(3, 2, 3, 4, 'accent'),
      ],
    },
    // A tracer round with a hot core.
    proj_modern_ranged: {
      w: 16, h: 6,
      list: [r(0, 2, 14, 2, 'edge'), r(4, 1, 10, 4, 'body'), r(7, 2, 6, 2, 'accent')],
    },
    // Generic impact spark.
    proj_spark: {
      w: 8, h: 8,
      list: [r(3, 0, 2, 8, 'light'), r(0, 3, 8, 2, 'light'), r(3, 3, 2, 2, 'accent')],
    },
  };
  for (const [key, def] of Object.entries(ops)) {
    makeTexture(scene, key, def.list, paletteFor('stone'), 0xffffff, def.w, def.h);
  }
}

function generateParticleTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('particle_square')) {
    makeTexture(scene, 'particle_square', [r(0, 0, 2, 2, 'light')], paletteFor('stone'), 0xffffff, 2, 2);
  }
  // Soft round puff used for smoke and dust: white so the emitter can tint it.
  if (!scene.textures.exists('particle_puff')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(2, 0, 4, 6);
    g.fillRect(0, 2, 6, 4);
    g.fillRect(1, 1, 4, 4);
    g.generateTexture('particle_puff', 6, 6);
    g.destroy();
  }
  // Chunky debris with a dark rim, so battle dust keeps the pixel-art look.
  if (!scene.textures.exists('particle_chunk')) {
    makeTexture(
      scene,
      'particle_chunk',
      [r(0, 0, 6, 6, 'ink'), r(1, 1, 4, 4, 'light')],
      paletteFor('stone'),
      0xffffff,
      6,
      6,
    );
  }
  if (!scene.textures.exists('particle_circle')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 0, 2, 4);
    g.fillRect(0, 1, 4, 2);
    g.generateTexture('particle_circle', 4, 4);
    g.destroy();
  }
}

function generateFlagTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    for (const side of ['player', 'ai'] as const) {
      const key = `flag_${age}_${side}`;
      const ops: SpriteOp[] = [
        r(0, 0, 16, 12, 'ink'),
        r(1, 1, 14, 10, 'team'),
        r(2, 2, 12, 3, side === 'player' ? 'light' : 'edge'),
        tri(2, 5, 13, 6, 2, 10, side === 'player' ? 'edge' : 'light'),
        r(0, 0, 2, 18, 'mid'),
      ];
      makeTexture(scene, key, ops, pal, TEAM_COLORS[side], 18, 20, 20);
    }
  }
}

/** Small animated fire used by campfires and burning wrecks. */
function generateFlameTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    const ops: SpriteOp[] = [
      tri(6, 0, 0, 12, 12, 12, 'highlight'),
      tri(6, 3, 2, 15, 10, 15, 'light'),
      r(4, 12, 5, 3, 'highlight'),
    ];
    makeTexture(scene, `fx_flame_${age}`, ops, pal, 0xffffff, 13, 16, 16);
  }
}

// ------------------------------------------------------------------ UI icons

function generateUITextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const pal = paletteFor(age);
    makeCrest(scene, age);
    makeResourceIcons(scene, age);
    makeEvolveIcon(scene, age);
    makeResultIcons(scene, age);
    makeUpgradeIcons(scene, age);
    // Silence unused-palette lint: crest/result art below uses the palette too.
    void pal;
  }
}

const CREST_SYMBOL: Record<Age, SpriteOp[]> = {
  stone: [r(6, 4, 4, 8, 'accent'), r(4, 8, 8, 4, 'accent'), r(7, 2, 2, 3, 'light')],
  medieval: [r(7, 2, 2, 9, 'accent'), r(4, 7, 8, 2, 'accent')],
  modern: [tri(8, 2, 4, 12, 12, 12, 'accent'), r(6, 12, 4, 2, 'light')],
};

function makeCrest(scene: Phaser.Scene, age: Age): void {
  const pal = paletteFor(age);
  const ops: SpriteOp[] = [
    r(3, 1, 10, 10, 'edge'),
    tri(3, 10, 13, 10, 8, 15, 'edge'),
    r(4, 2, 8, 8, 'panel'),
    tri(4, 9, 12, 9, 8, 13, 'panel'),
    ...CREST_SYMBOL[age],
  ];
  makeTexture(scene, `crest_${age}`, ops, pal, 0xffffff, 16, 16, 16);
}

function makeResourceIcons(scene: Phaser.Scene, age: Age): void {
  const pal = paletteFor(age);
  makeTexture(scene, `icon_gold_${age}`, [
    r(1, 1, 10, 10, 'highlight'),
    r(2, 2, 8, 8, 'light'),
    r(3, 3, 4, 4, 'highlight'),
    r(7, 3, 2, 2, 'light'),
    r(2, 7, 8, 2, 'accent'),
  ], pal, 0xffffff, 12, 12);
  makeTexture(scene, `icon_xp_${age}`, [
    tri(6, 0, 11, 6, 6, 11, 'body'),
    tri(0, 6, 6, 0, 6, 11, 'edge'),
    r(5, 3, 2, 5, 'light'),
  ], pal, 0xffffff, 12, 12);
}

function makeEvolveIcon(scene: Phaser.Scene, age: Age): void {
  const pal = paletteFor(age);
  makeTexture(scene, `icon_evolve_${age}`, [
    tri(8, 1, 2, 8, 14, 8, 'highlight'),
    r(6, 8, 4, 4, 'accent'),
    r(4, 12, 8, 2, 'edge'),
    r(7, 3, 2, 4, 'light'),
  ], pal, 0xffffff, 16, 16);
}

function makeResultIcons(scene: Phaser.Scene, age: Age): void {
  const pal = paletteFor(age);
  makeTexture(scene, `ui_victory_${age}`, [
    r(8, 3, 16, 12, 'highlight'),
    r(5, 5, 3, 7, 'highlight'), r(24, 5, 3, 7, 'highlight'),
    r(10, 15, 12, 4, 'accent'),
    r(12, 19, 8, 5, 'edge'),
    r(6, 24, 20, 4, 'mid'),
    r(11, 5, 4, 6, 'light'),
  ], pal, 0xffffff, 32, 32);
  makeTexture(scene, `ui_defeat_${age}`, [
    r(8, 4, 16, 14, 'light'),
    r(10, 8, 4, 4, 'dark'), r(18, 8, 4, 4, 'dark'),
    r(13, 14, 6, 3, 'dark'),
    r(9, 20, 14, 6, 'mid'),
    r(14, 6, 4, 12, 'dark'),
    r(7, 5, 2, 8, 'mid'), r(23, 5, 2, 8, 'mid'),
  ], pal, 0xffffff, 32, 32);
}

function makeUpgradeIcons(scene: Phaser.Scene, age: Age): void {
  const pal = paletteFor(age);
  // Forge: an anvil struck by sparks.
  makeTexture(scene, `icon_forge_${age}`, [
    r(2, 4, 12, 4, 'edge'),
    r(1, 3, 14, 2, 'accent'),
    r(5, 8, 6, 3, 'mid'),
    r(3, 11, 10, 3, 'dark'),
    r(6, 0, 2, 3, 'highlight'), r(10, 1, 2, 2, 'light'),
  ], pal, 0xffffff, 16, 16);
  // Armor: a breastplate.
  makeTexture(scene, `icon_armor_${age}`, [
    r(3, 2, 10, 10, 'edge'),
    tri(3, 11, 13, 11, 8, 15, 'edge'),
    r(4, 3, 8, 8, 'body'),
    tri(4, 10, 12, 10, 8, 13, 'body'),
    r(5, 4, 3, 5, 'light'),
    r(7, 3, 2, 8, 'mid'),
  ], pal, 0xffffff, 16, 16);
}

/** Exposed so tests can assert the ink outline rule holds for generated art. */
export function outlineProbe(scene: Phaser.Scene, key: string, w: number, h: number, ops: SpriteOp[], age: Age): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  paintOps(g, ops, paletteFor(age), true);
  paintOps(g, ops, paletteFor(age), false);
  g.generateTexture(key, w, h);
  g.destroy();
}

export { OUTLINE };

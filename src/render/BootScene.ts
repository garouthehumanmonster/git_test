import Phaser from 'phaser';
import { generateTextures } from './textures';
import { crazyLoadingStop, crazyLoadData } from '../crazygames';
import { CAMPAIGN_STORAGE_KEY, loadProgress, mergeProgress, saveProgress } from '../campaign';

import { unitKey } from './unitart';
import { baseKey } from './basearth';

const AGES = ['stone', 'medieval', 'modern'] as const;
const ROLES = ['swarm', 'tank', 'ranged'] as const;
const SIDES = ['player', 'ai'] as const;
/** Fallen plates that actually read as downed. The others fade in place. */
const FALLEN = new Set([
  'stone_swarm', 'stone_tank', 'stone_ranged',
  'medieval_swarm', 'medieval_tank', 'medieval_ranged',
  'modern_swarm', 'modern_tank', 'modern_ranged',
]);

/**
 * Preloads the high-resolution raster backdrops, units, and base towers.
 * Procedural fallback textures are populated in create() for any missing assets.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL ?? './';
    for (const age of AGES) {
      this.load.image(`bg_${age}`, `${base}atlas/bg_${age}.png`);
      for (const role of ROLES) {
        for (const side of SIDES) {
          this.load.image(unitKey(age, role, side), `${base}atlas/units/unit_${age}_${role}_${side}.png`);
          // Four foot-aligned walk frames. Missing files fall back to the
          // static atlas image; the scene only swaps when the texture exists.
          for (let frame = 0; frame < 4; frame++) {
            this.load.image(
              `${unitKey(age, role, side)}_w${frame}`,
              `${base}atlas/anim/unit_${age}_${role}_${side}_w${frame}.png`,
            );
          }
          // Strike plate, same canvas as the idle frame. Missing files fall
          // back to the walk cycle; the scene only swaps when it loaded.
          this.load.image(
            `${unitKey(age, role, side)}_atk`,
            `${base}atlas/anim/unit_${age}_${role}_${side}_atk.png`,
          );
          if (FALLEN.has(`${age}_${role}`)) {
            this.load.image(
              `${unitKey(age, role, side)}_die`,
              `${base}atlas/anim/unit_${age}_${role}_${side}_die.png`,
            );
          }
        }
      }
      for (const side of SIDES) {
        this.load.image(baseKey(age, side), `${base}atlas/bases/base_${age}_${side}.png`);
      }
    }
  }

  async create(): Promise<void> {
    // Illustrated plates are painted, not pixels. Linear keeps the strike
    // from shimmering against the walk cycle it replaces for one hit.
    for (const age of AGES) {
      for (const role of ROLES) {
        for (const side of SIDES) {
          for (let frame = 0; frame < 4; frame++) {
            const walk = `${unitKey(age, role, side)}_w${frame}`;
            if (this.textures.exists(walk)) {
              this.textures.get(walk).setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
          }
          for (const suffix of ['_atk', '_die'] as const) {
            const plate = `${unitKey(age, role, side)}${suffix}`;
            if (this.textures.exists(plate)) {
              this.textures.get(plate).setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
          }
        }
      }
    }
    generateTextures(this);
    try {
      const cloud = await crazyLoadData(CAMPAIGN_STORAGE_KEY);
      if (cloud) {
        const local = loadProgress();
        const parsed = JSON.parse(cloud);
        const merged = mergeProgress(local, parsed);
        saveProgress(merged);
      }
    } catch {
      // Cloud sync error ignored, local storage remains authoritative
    }
    crazyLoadingStop();
    // The campaign front end comes first; it hands a stage id to GameScene.
    this.scene.start('MenuScene');
  }
}

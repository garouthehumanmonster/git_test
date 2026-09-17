import Phaser from 'phaser';
import { generateTextures } from './textures';
import { crazyLoadingStop, crazyLoadData } from '../crazygames';
import { CAMPAIGN_STORAGE_KEY, loadProgress, mergeProgress, saveProgress } from '../campaign';

import { unitKey } from './unitart';
import { baseKey } from './basearth';

const AGES = ['stone', 'medieval', 'modern'] as const;
const ROLES = ['swarm', 'tank', 'ranged'] as const;
const SIDES = ['player', 'ai'] as const;

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
        }
      }
      for (const side of SIDES) {
        this.load.image(baseKey(age, side), `${base}atlas/bases/base_${age}_${side}.png`);
      }
    }
  }

  async create(): Promise<void> {
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

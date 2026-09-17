import Phaser from 'phaser';
import { generateTextures } from './textures';
import { crazyLoadingStop, crazyLoadData } from '../crazygames';
import { CAMPAIGN_STORAGE_KEY, loadProgress, mergeProgress, saveProgress } from '../campaign';

const AGES = ['stone', 'medieval', 'modern'] as const;

/**
 * Loads the only raster assets in the project — the four painted age
 * panoramas, pre-graded offline onto the game's landscape palette by
 * `npm run art:build`. Everything else is generated procedurally.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL ?? './';
    for (const age of AGES) {
      this.load.image(`bg_${age}`, `${base}atlas/bg_${age}.png`);
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

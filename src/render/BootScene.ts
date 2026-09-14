import Phaser from 'phaser';
import { generateTextures } from './textures';

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

  create(): void {
    generateTextures(this);
    this.scene.start('GameScene');
  }
}

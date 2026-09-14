import Phaser from 'phaser';
import { generateTextures } from './textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Gameplay art is generated locally. No raster backgrounds or sprite sheets
    // are imported, so the entire scene shares the same pixel grid and palette.
  }

  create(): void {
    generateTextures(this);
    this.scene.start('GameScene');
  }
}

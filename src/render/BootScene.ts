import Phaser from 'phaser';
import { generateTextures } from './textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Backgrounds per age — fallback to bg_game if a file is missing.
    this.load.image('bg_stone', '/bg_stone.jpg');
    this.load.image('bg_medieval', '/bg_medieval.jpg');
    this.load.image('bg_modern', '/bg_modern.jpg');
    this.load.image('bg_game', '/bg_game.jpg');
  }

  create(): void {
    generateTextures(this);
    // Create a 1×1 transparent placeholder texture for missing UI icons.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('__DUMMY', 1, 1);
    g.destroy();
    this.scene.start('GameScene');
  }
}

import Phaser from 'phaser';
import { generateTextures } from './textures';

// AI-generated art assets (procedural textures act as fallback for any missing file).
const AI_SKINS: string[] = [
  // Units
  'unit_stone_swarm', 'unit_stone_tank', 'unit_stone_ranged',
  'unit_medieval_swarm', 'unit_medieval_tank', 'unit_medieval_ranged',
  'unit_modern_swarm', 'unit_modern_tank', 'unit_modern_ranged',
  // Bases (per age × per side, 6 total)
  'base_stone_player', 'base_stone_ai',
  'base_medieval_player', 'base_medieval_ai',
  'base_modern_player', 'base_modern_ai',
  // UI art
  'ui_title',
  'crest_stone', 'crest_medieval', 'crest_modern',
  'icon_gold', 'icon_xp', 'icon_evolve',
  'ui_victory', 'ui_defeat',
];

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
    for (const key of AI_SKINS) {
      this.load.image(key, `/sprites/${key}.png`);
    }
    this.load.on('loaderror', (_file: Phaser.Loader.File) => {
      // missing AI skin — generateTextures() will provide the procedural fallback
    });
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

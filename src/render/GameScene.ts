import Phaser from 'phaser';
import { LANE_WIDTH, LANE_HEIGHT, PLAYER_BASE_X, AI_BASE_X } from '../sim/types';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    // Lane background
    const bg = this.add.graphics();
    bg.fillStyle(0x1e1e24, 1);
    bg.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);

    // Lane track (the walking line)
    bg.fillStyle(0x2b2b36, 1);
    bg.fillRect(0, 110, LANE_WIDTH, 40);
    bg.lineStyle(2, 0x3d3d4e, 1);
    bg.lineBetween(0, 110, LANE_WIDTH, 110);
    bg.lineBetween(0, 150, LANE_WIDTH, 150);

    // Bases
    this.add.image(PLAYER_BASE_X, 120, 'base_player').setOrigin(0.5, 0.8);
    this.add.image(AI_BASE_X, 120, 'base_ai').setOrigin(0.5, 0.8);

    // Status label
    this.add.text(LANE_WIDTH / 2, 30, 'TIMELINE WAR', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(LANE_WIDTH / 2, 60, 'M0: Lane Skeleton Active', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#888888',
    }).setOrigin(0.5);
  }
}

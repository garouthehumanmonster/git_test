import Phaser from 'phaser';
import { BootScene } from './render/BootScene';
import { GameScene } from './render/GameScene';
import { LANE_WIDTH, LANE_HEIGHT } from './sim/types';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: LANE_WIDTH,
  height: LANE_HEIGHT,
  parent: 'app',
  backgroundColor: '#121214',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene],
};

new Phaser.Game(config);

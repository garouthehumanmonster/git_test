import Phaser from 'phaser';
import type { Age, UnitRole } from '../sim/types';

const AGE_COLORS: Record<Age, number> = {
  stone: 0x8d6e63,
  medieval: 0x5c6bc0,
  modern: 0x26a69a,
};

const ROLE_SIZES: Record<UnitRole, { w: number; h: number }> = {
  swarm: { w: 16, h: 16 },
  tank: { w: 28, h: 28 },
  ranged: { w: 20, h: 20 },
};

export function generateTextures(scene: Phaser.Scene): void {
  const ages: Age[] = ['stone', 'medieval', 'modern'];
  const roles: UnitRole[] = ['swarm', 'tank', 'ranged'];

  // Unit textures: ${age}_${role}
  for (const age of ages) {
    for (const role of roles) {
      const key = `${age}_${role}`;
      if (scene.textures.exists(key)) continue;

      const { w, h } = ROLE_SIZES[role];
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(AGE_COLORS[age], 1);

      if (role === 'ranged') {
        g.fillTriangle(0, h, w / 2, 0, w, h);
      } else if (role === 'tank') {
        g.fillRect(0, 0, w, h);
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeRect(1, 1, w - 2, h - 2);
      } else {
        g.fillRect(0, 0, w, h);
      }

      g.generateTexture(key, w, h);
      g.destroy();
    }
  }

  // Base textures
  if (!scene.textures.exists('base_player')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x1976d2, 1);
    g.fillRect(0, 0, 40, 90);
    g.lineStyle(2, 0x64b5f6, 1);
    g.strokeRect(1, 1, 38, 88);
    g.generateTexture('base_player', 40, 90);
    g.destroy();
  }

  if (!scene.textures.exists('base_ai')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xd32f2f, 1);
    g.fillRect(0, 0, 40, 90);
    g.lineStyle(2, 0xef5350, 1);
    g.strokeRect(1, 1, 38, 88);
    g.generateTexture('base_ai', 40, 90);
    g.destroy();
  }
}

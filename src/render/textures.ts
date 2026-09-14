import Phaser from 'phaser';
import type { Age, UnitRole } from '../sim/types';
import { ROLE_SIZES } from './sprites';

// Age palettes (body, accent, outline).
const AGE_PALETTE: Record<Age, { body: number; accent: number; outline: number; glow: number }> = {
  stone:    { body: 0xb08354, accent: 0x6b4a2a, outline: 0x3a2814, glow: 0xe6b97a },
  medieval: { body: 0x7a8fcf, accent: 0xe0c36b, outline: 0x2b2f54, glow: 0xb4c4ff },
  modern:   { body: 0x3ed6c0, accent: 0xffd166, outline: 0x0e3a36, glow: 0x9dffef },
};

/** Generates all procedural textures used by the renderer. Idempotent. */
export function generateTextures(scene: Phaser.Scene): void {
  generateUnitTextures(scene);
  generateBaseTextures(scene);
  generateProjectileTexture(scene);
  generateParticleTextures(scene);
  generateFlagTextures(scene);
}

function generateUnitTextures(scene: Phaser.Scene): void {
  const ages: Age[] = ['stone', 'medieval', 'modern'];
  const roles: UnitRole[] = ['swarm', 'tank', 'ranged'];

  for (const age of ages) {
    for (const role of roles) {
      const key = `unit_${age}_${role}`;
      if (scene.textures.exists(key)) continue;
      const { w, h } = ROLE_SIZES[role];
      const pal = AGE_PALETTE[age];

      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      // Drop shadow
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(w / 2, h + 2, w * 0.9, 4);

      // Body shape per role
      if (role === 'tank') {
        // Broad-shouldered, rectangular tank.
        g.fillStyle(pal.outline, 1);
        g.fillRoundedRect(0, 0, w, h, 4);
        g.fillStyle(pal.body, 1);
        g.fillRoundedRect(2, 2, w - 4, h - 6, 3);
        // Armor plate
        g.fillStyle(pal.accent, 1);
        g.fillRect(4, h * 0.35, w - 8, 4);
        // Visor/eye slit
        g.fillStyle(pal.outline, 1);
        g.fillRect(w * 0.3, h * 0.15, w * 0.4, 3);
        // Shoulder highlights
        g.fillStyle(pal.glow, 0.6);
        g.fillRect(2, 2, w - 4, 2);
      } else if (role === 'ranged') {
        // Triangular ranged unit (arrow/hood).
        g.fillStyle(pal.outline, 1);
        g.fillTriangle(-1, h + 1, w / 2, -2, w + 1, h + 1);
        g.fillStyle(pal.body, 1);
        g.fillTriangle(1, h - 1, w / 2, 2, w - 1, h - 1);
        // Hood tip accent
        g.fillStyle(pal.accent, 1);
        g.fillTriangle(w / 2 - 2, 2, w / 2 + 2, 2, w / 2, 7);
        // Eye
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(w / 2, h * 0.55, 2);
        g.fillStyle(pal.outline, 1);
        g.fillCircle(w / 2, h * 0.55, 1);
      } else {
        // Swarm: small round-headed soldier.
        g.fillStyle(pal.outline, 1);
        g.fillRoundedRect(0, 2, w, h - 2, 3);
        g.fillStyle(pal.body, 1);
        g.fillRoundedRect(1, 3, w - 2, h - 5, 2);
        // Head
        g.fillStyle(pal.accent, 1);
        g.fillCircle(w / 2, 4, 3);
        // Eye
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(w / 2 + 1, 4, 1);
      }

      g.generateTexture(key, w, h + 4);
      g.destroy();
    }
  }
}

function generateBaseTextures(scene: Phaser.Scene): void {
  const makeBase = (key: string, primary: number, secondary: number, light: number) => {
    if (scene.textures.exists(key)) return;
    const w = 56, h = 110;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    // Shadow
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(w / 2, h - 2, w + 6, 6);
    // Foundation
    g.fillStyle(0x181822, 1);
    g.fillRect(2, h - 12, w - 4, 12);
    // Main tower body
    g.fillStyle(primary, 1);
    g.fillRoundedRect(6, 18, w - 12, h - 30, 3);
    // Battlements
    g.fillStyle(primary, 1);
    for (let i = 0; i < 4; i++) {
      g.fillRect(6 + i * 11, 12, 7, 8);
    }
    // Outline
    g.lineStyle(2, 0x0a0a12, 0.9);
    g.strokeRoundedRect(6, 18, w - 12, h - 30, 3);
    // Window/flag slot
    g.fillStyle(secondary, 1);
    g.fillRect(w / 2 - 6, 34, 12, 14);
    g.fillStyle(0x000000, 0.5);
    g.fillRect(w / 2 - 4, 36, 8, 10);
    // Light
    g.fillStyle(light, 0.8);
    g.fillRect(8, 20, 2, h - 34);
    // Door
    g.fillStyle(0x2a1810, 1);
    g.fillRoundedRect(w / 2 - 7, h - 26, 14, 16, 2);
    g.fillStyle(secondary, 1);
    g.fillCircle(w / 2 + 3, h - 18, 1);

    g.generateTexture(key, w, h);
    g.destroy();
  };
  makeBase('base_player', 0x1e88e5, 0x64b5f6, 0x90caf9);
  makeBase('base_ai',     0xd32f2f, 0xef5350, 0xff8a80);
}

function generateProjectileTexture(scene: Phaser.Scene): void {
  // Age×role projectiles. Ranged units get distinct ammo per age; melee doesn't
  // use a projectile, but we still include a generic impact spark.
  const defs: Array<{ key: string; draw: (g: Phaser.GameObjects.Graphics) => void; w: number; h: number }> = [
    // Stone-age slinger: round brown pebble
    {
      key: 'proj_stone_ranged', w: 6, h: 6,
      draw(g) {
        g.fillStyle(0x6b4a2a, 1); g.fillCircle(3, 3, 3);
        g.fillStyle(0x8d6e63, 1); g.fillCircle(2, 2, 1);
      },
    },
    // Medieval archer: slim arrow, feathered nock
    {
      key: 'proj_medieval_ranged', w: 12, h: 4,
      draw(g) {
        // shaft
        g.fillStyle(0xd9b37a, 1); g.fillRect(1, 1, 8, 1);
        // head
        g.fillStyle(0xcfd8dc, 1); g.fillTriangle(9, 0, 12, 1.5, 9, 3);
        // fletching
        g.fillStyle(0xb32929, 1); g.fillRect(0, 0, 2, 3);
      },
    },
    // Modern sniper: cyan energy bolt with glow
    {
      key: 'proj_modern_ranged', w: 10, h: 4,
      draw(g) {
        g.fillStyle(0x38fff0, 1); g.fillRect(1, 1, 8, 2);
        g.fillStyle(0xffffff, 0.9); g.fillRect(3, 1, 5, 1);
        g.fillStyle(0x38fff0, 0.4); g.fillRect(0, 0, 10, 4);
      },
    },
    // Generic impact/spark (used when melee hits)
    {
      key: 'proj_spark', w: 6, h: 6,
      draw(g) {
        g.fillStyle(0xffffff, 1); g.fillCircle(3, 3, 2);
        g.fillStyle(0xffffff, 0.5); g.fillCircle(3, 3, 4);
      },
    },
  ];
  for (const { key, draw, w, h } of defs) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}

function generateParticleTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('particle_square')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('particle_square', 4, 4);
    g.destroy();
  }
  if (!scene.textures.exists('particle_circle')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('particle_circle', 6, 6);
    g.destroy();
  }
}

function generateFlagTextures(scene: Phaser.Scene): void {
  const makeFlag = (key: string, color: number) => {
    if (scene.textures.exists(key)) return;
    const w = 32, h = 20;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillTriangle(0, 0, w, h / 2, 0, h);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  makeFlag('flag_player', 0x64b5f6);
  makeFlag('flag_ai', 0xef5350);
}

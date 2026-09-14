import Phaser from 'phaser';
import type { Age, UnitRole } from '../sim/types';
import { OUTLINE, paletteFor } from './palette';
import { ROLE_SIZES } from './sprites';

const AGES: Age[] = ['stone', 'medieval', 'modern'];
const ROLES: UnitRole[] = ['swarm', 'tank', 'ranged'];

/**
 * All runtime art is authored at logical resolution and displayed at 2×.
 * There are no imported gameplay sprites: every shape is a small, deliberate
 * pixel primitive with the same one-texel ink outline.
 */
export function generateTextures(scene: Phaser.Scene): void {
  generateUnitTextures(scene);
  generateBaseTextures(scene);
  generateProjectileTextures(scene);
  generateParticleTextures(scene);
  generateFlagTextures(scene);
  generateUITextures(scene);
}

function generateUnitTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    for (const role of ROLES) {
      const key = `unit_${age}_${role}`;
      if (scene.textures.exists(key)) continue;
      const { w, h } = ROLE_SIZES[role];
      const pal = paletteFor(age);
      const g = scene.make.graphics({ x: 0, y: 0 }, false);

      if (role === 'tank') {
        g.fillStyle(OUTLINE, 1);
        g.fillRect(0, 1, w, h - 1);
        g.fillStyle(pal.body, 1);
        g.fillRect(1, 2, w - 2, h - 4);
        g.fillStyle(pal.accent, 1);
        g.fillRect(2, 6, w - 4, 2);
        g.fillRect(3, 12, w - 6, 2);
        g.fillStyle(pal.light, 1);
        g.fillRect(2, 2, w - 4, 1);
        g.fillStyle(OUTLINE, 1);
        g.fillRect(5, 4, w - 10, 1);
      } else if (role === 'ranged') {
        g.fillStyle(OUTLINE, 1);
        g.fillTriangle(0, h - 1, Math.floor(w / 2), 0, w - 1, h - 1);
        g.fillStyle(pal.body, 1);
        g.fillTriangle(2, h - 2, Math.floor(w / 2), 2, w - 3, h - 2);
        g.fillStyle(pal.accent, 1);
        g.fillRect(Math.floor(w / 2) - 1, 3, 2, 3);
        g.fillStyle(pal.light, 1);
        g.fillRect(Math.floor(w / 2), 8, 1, 1);
      } else {
        g.fillStyle(OUTLINE, 1);
        g.fillRect(1, 3, w - 2, h - 3);
        g.fillStyle(pal.body, 1);
        g.fillRect(2, 4, w - 4, h - 5);
        g.fillStyle(pal.accent, 1);
        g.fillRect(3, 1, w - 6, 4);
        g.fillStyle(pal.light, 1);
        g.fillRect(6, 2, 1, 1);
      }

      g.generateTexture(key, w, h);
      g.destroy();
    }
  }
}

function generateBaseTextures(scene: Phaser.Scene): void {
  const makeBase = (key: string, age: Age, side: 'player' | 'ai'): void => {
    if (scene.textures.exists(key)) return;
    const pal = paletteFor(age);
    const w = 28;
    const h = 39;
    const primary = side === 'player' ? pal.edge : pal.highlight;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);

    // One logical pixel of ink around the tower silhouette.
    g.fillStyle(OUTLINE, 1);
    g.fillRect(2, 7, w - 4, h - 7);
    for (let i = 0; i < 4; i++) g.fillRect(2 + i * 6, 4, 4, 4);
    g.fillStyle(primary, 1);
    g.fillRect(4, 8, w - 8, h - 10);
    g.fillStyle(pal.accent, 1);
    g.fillRect(4, 8, w - 8, 2);
    g.fillRect(5, 16, w - 10, 5);
    g.fillStyle(pal.dark, 1);
    g.fillRect(11, 17, 6, 4);
    g.fillStyle(pal.light, 1);
    g.fillRect(5, 10, 1, h - 21);
    g.fillStyle(OUTLINE, 1);
    g.fillRect(10, h - 9, 8, 8);
    g.fillStyle(pal.accent, 1);
    g.fillRect(16, h - 6, 1, 1);

    g.generateTexture(key, w, h);
    g.destroy();
  };

  for (const age of AGES) {
    makeBase(`base_${age}_player`, age, 'player');
    makeBase(`base_${age}_ai`, age, 'ai');
  }
  // Fallback keys retained for older scene snapshots.
  makeBase('base_player', 'stone', 'player');
  makeBase('base_ai', 'stone', 'ai');
}

function generateProjectileTextures(scene: Phaser.Scene): void {
  const defs: Array<{ key: string; w: number; h: number; draw: (g: Phaser.GameObjects.Graphics) => void }> = [
    {
      key: 'proj_stone_ranged', w: 3, h: 3,
      draw(g) {
        const p = paletteFor('stone');
        g.fillStyle(OUTLINE, 1); g.fillRect(0, 0, 3, 3);
        g.fillStyle(p.body, 1); g.fillRect(1, 1, 1, 1);
      },
    },
    {
      key: 'proj_medieval_ranged', w: 6, h: 2,
      draw(g) {
        const p = paletteFor('medieval');
        g.fillStyle(OUTLINE, 1); g.fillRect(0, 0, 6, 2);
        g.fillStyle(p.accent, 1); g.fillRect(1, 0, 3, 1);
        g.fillStyle(p.light, 1); g.fillRect(4, 0, 2, 2);
      },
    },
    {
      key: 'proj_modern_ranged', w: 5, h: 2,
      draw(g) {
        const p = paletteFor('modern');
        g.fillStyle(OUTLINE, 1); g.fillRect(0, 0, 5, 2);
        g.fillStyle(p.body, 1); g.fillRect(1, 0, 4, 2);
        g.fillStyle(p.accent, 1); g.fillRect(2, 0, 2, 1);
      },
    },
    {
      key: 'proj_spark', w: 3, h: 3,
      draw(g) {
        const p = paletteFor('modern');
        g.fillStyle(OUTLINE, 1); g.fillRect(1, 0, 1, 3); g.fillRect(0, 1, 3, 1);
        g.fillStyle(p.light, 1); g.fillRect(1, 1, 1, 1);
      },
    },
  ];

  for (const { key, w, h, draw } of defs) {
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
    g.fillStyle(OUTLINE, 1); g.fillRect(0, 0, 2, 2);
    g.generateTexture('particle_square', 2, 2);
    g.destroy();
  }
  if (!scene.textures.exists('particle_circle')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(OUTLINE, 1); g.fillRect(1, 0, 1, 3); g.fillRect(0, 1, 3, 1);
    g.generateTexture('particle_circle', 3, 3);
    g.destroy();
  }
}

function generateFlagTextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const p = paletteFor(age);
    for (const side of ['player', 'ai'] as const) {
      const key = `flag_${age}_${side}`;
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(OUTLINE, 1);
      g.fillRect(0, 0, 16, 10);
      g.fillStyle(side === 'player' ? p.accent : p.highlight, 1);
      g.fillTriangle(1, 1, 15, 5, 1, 9);
      g.generateTexture(key, 16, 10);
      g.destroy();
    }
  }
}

function generateUITextures(scene: Phaser.Scene): void {
  for (const age of AGES) {
    const p = paletteFor(age);
    makeCrest(scene, age, p);
    makeResourceIcons(scene, age, p);
    makeEvolveIcon(scene, age, p);
    makeResultIcon(scene, age, p, 'victory');
    makeResultIcon(scene, age, p, 'defeat');
  }
}

function makeCrest(scene: Phaser.Scene, age: Age, p: ReturnType<typeof paletteFor>): void {
  const key = `crest_${age}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(OUTLINE, 1); g.fillCircle(7, 7, 7);
  g.fillStyle(p.panel, 1); g.fillCircle(7, 7, 5);
  g.lineStyle(1, p.accent, 1); g.lineBetween(3, 7, 11, 7); g.lineBetween(7, 3, 7, 11);
  g.generateTexture(key, 14, 14); g.destroy();
}

function makeResourceIcons(scene: Phaser.Scene, age: Age, p: ReturnType<typeof paletteFor>): void {
  const goldKey = `icon_gold_${age}`;
  if (!scene.textures.exists(goldKey)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(OUTLINE, 1); g.fillRect(1, 0, 6, 8);
    g.fillStyle(p.highlight, 1); g.fillRect(2, 1, 4, 6);
    g.fillStyle(p.light, 1); g.fillRect(3, 2, 1, 1);
    g.generateTexture(goldKey, 8, 8); g.destroy();
  }
  const xpKey = `icon_xp_${age}`;
  if (!scene.textures.exists(xpKey)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(OUTLINE, 1); g.fillTriangle(4, 0, 8, 4, 4, 8); g.fillTriangle(0, 4, 4, 0, 4, 8);
    g.fillStyle(p.body, 1); g.fillRect(3, 2, 2, 4);
    g.generateTexture(xpKey, 8, 8); g.destroy();
  }
}

function makeEvolveIcon(scene: Phaser.Scene, age: Age, p: ReturnType<typeof paletteFor>): void {
  const key = `icon_evolve_${age}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(OUTLINE, 1); g.fillRect(3, 1, 2, 2); g.fillRect(1, 3, 2, 2); g.fillRect(5, 3, 2, 2); g.fillRect(3, 5, 2, 2);
  g.fillStyle(p.accent, 1); g.fillRect(3, 2, 2, 1); g.fillRect(2, 3, 1, 2); g.fillRect(5, 3, 1, 2); g.fillRect(3, 5, 2, 1);
  g.generateTexture(key, 8, 8); g.destroy();
}

function makeResultIcon(scene: Phaser.Scene, age: Age, p: ReturnType<typeof paletteFor>, kind: 'victory' | 'defeat'): void {
  const key = `ui_${kind}_${age}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(OUTLINE, 1); g.fillRect(4, 2, 16, 18);
  g.fillStyle(kind === 'victory' ? p.highlight : p.highlight, 1);
  if (kind === 'victory') {
    g.fillRect(6, 4, 12, 12); g.fillRect(3, 7, 3, 8); g.fillRect(18, 7, 3, 8);
  } else {
    g.fillRect(6, 4, 12, 12); g.fillRect(8, 16, 8, 3);
    g.fillStyle(p.dark, 1); g.fillRect(8, 8, 3, 3); g.fillRect(13, 8, 3, 3);
  }
  g.generateTexture(key, 24, 24); g.destroy();
}

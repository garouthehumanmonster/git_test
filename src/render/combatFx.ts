import Phaser from 'phaser';
import {
  type StrikeKind,
  type UnitState,
  LANE_TOP,
  PLAYER_BASE_X,
  TICK_MS,
} from '../sim/types';
import { FX_ORIGIN } from './turretart';
import { PIXEL_SCALE, colorHex, paletteFor } from './palette';

export const FX_DEPTH = {
  unit: 3,
  projectile: 4,
  particles: 6,
  strike: 7,
  float: 8,
} as const;

/** Screen shake per superweapon, so a meteor lands heavier than a flak burst. */
export const STRIKE_SHAKE: Record<StrikeKind, number> = { meteor: 22, volley: 12, airstrike: 16 };

export class FloatingTextManager {
  private activeTexts: Phaser.GameObjects.Text[] = [];
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public addFloat(x: number, y: number, text: string, color: number, ttl: number, pop = false): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: pop ? '17px' : '14px',
      color: colorHex(color),
      fontStyle: 'bold',
      stroke: '#050d12',
      strokeThickness: pop ? 4 : 3,
    }).setOrigin(0.5).setDepth(FX_DEPTH.float);

    if (pop) {
      t.setScale(1.25);
      this.scene.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.easeOut' });
    }
    this.activeTexts.push(t);
    this.scene.tweens.add({
      targets: t,
      y: y - (pop ? 34 : 24),
      x: x + (Math.random() - 0.5) * 14,
      alpha: 0,
      duration: ttl * TICK_MS,
      onComplete: () => {
        t.destroy();
        this.activeTexts = this.activeTexts.filter((f) => f.active);
      },
    });
  }

  public clear(): void {
    for (const f of this.activeTexts) f.destroy();
    this.activeTexts = [];
  }
}

/**
 * Code-driven weapon effect. Melee units swing an arc from the weapon tip,
 * tanks crack the ground at their feet and ranged units flash at the muzzle.
 */
export function spawnAttackFx(
  scene: Phaser.Scene,
  u: UnitState,
  kind: 'slash' | 'muzzle' | 'shock',
  groundY: number
): void {
  const key = `fx_${kind}_${u.def.age}`;
  if (!scene.textures.exists(key)) return;
  const origin = FX_ORIGIN[key] ?? { x: 0.5, y: 0.5 };
  const lift = u.def.role === 'tank' ? 6 : u.def.role === 'ranged' ? 30 : 26;
  const forward = u.def.role === 'tank' ? 10 : 12;
  const x = u.x + u.dir * forward;
  const y = groundY - lift;
  const fx = scene.add.image(x, y, key)
    .setOrigin(origin.x, origin.y)
    .setScale(PIXEL_SCALE)
    .setDepth(FX_DEPTH.unit + 0.5);
  if (u.dir === -1) fx.setFlipX(true);
  if (kind === 'slash') {
    fx.setAngle(u.dir * -50);
    scene.tweens.add({ targets: fx, angle: u.dir * 55, alpha: 0, duration: 170, onComplete: () => fx.destroy() });
  } else if (kind === 'shock') {
    fx.setScale(PIXEL_SCALE * 0.6);
    scene.tweens.add({ targets: fx, scaleX: PIXEL_SCALE * 1.5, scaleY: PIXEL_SCALE * 1.5, alpha: 0, duration: 200, onComplete: () => fx.destroy() });
  } else {
    scene.tweens.add({ targets: fx, alpha: 0, scaleX: PIXEL_SCALE * 1.3, duration: 110, onComplete: () => fx.destroy() });
  }
}

/**
 * Tracer + muzzle flash for a base turret shot.
 */
export function fireTurretTracer(
  scene: Phaser.Scene,
  side: 'player' | 'ai',
  fromX: number,
  toX: number,
  toY: number,
  age: 'stone' | 'medieval' | 'modern'
): void {
  const pal = paletteFor(age);
  const fromY = LANE_TOP + 42;
  const g = scene.add.graphics().setDepth(FX_DEPTH.projectile);
  g.lineStyle(2, side === 'player' ? pal.accent : pal.highlight, 0.85);
  g.lineBetween(fromX, fromY, toX, toY);
  scene.tweens.add({ targets: g, alpha: 0, duration: 130, onComplete: () => g.destroy() });

  const muzzleKey = `fx_muzzle_${age}`;
  if (scene.textures.exists(muzzleKey)) {
    const flash = scene.add.image(fromX, fromY, muzzleKey).setOrigin(0, 0.5).setScale(PIXEL_SCALE * 1.2).setDepth(FX_DEPTH.particles);
    if (side === 'ai') flash.setFlipX(true);
    scene.tweens.add({ targets: flash, alpha: 0, scaleX: PIXEL_SCALE * 0.6, duration: 140, onComplete: () => flash.destroy() });
  }
}

/**
 * Visual projectile falling into blast for superweapons.
 */
export function renderStrikeVisuals(
  scene: Phaser.Scene,
  strikeLayer: Phaser.GameObjects.Container,
  dust: Phaser.GameObjects.Particles.ParticleEmitter,
  kind: StrikeKind,
  x: number,
  y: number,
  radius: number,
  age: 'stone' | 'medieval' | 'modern'
): void {
  const pal = paletteFor(age);
  const key = kind === 'meteor' ? 'fx_meteor' : kind === 'airstrike' ? 'fx_bomb' : 'fx_muzzle';

  if (scene.textures.exists(`${key}_${age}`)) {
    const img = scene.add.image(x, kind === 'volley' ? y - 180 : LANE_TOP - 30, `${key}_${age}`)
      .setOrigin(0.5)
      .setScale(PIXEL_SCALE * 1.4)
      .setDepth(FX_DEPTH.strike);
    if (kind === 'volley') img.setAngle(20);
    strikeLayer.add(img);
    scene.tweens.add({
      targets: img,
      y,
      angle: kind === 'volley' ? -10 : 0,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => img.destroy(),
    });
  }

  const ring = scene.add.circle(x, y + 6, radius * 0.35, pal.highlight, 0.55).setDepth(FX_DEPTH.particles);
  scene.tweens.add({
    targets: ring,
    scaleX: 3.1,
    scaleY: 1.4,
    alpha: 0,
    duration: 320,
    onComplete: () => ring.destroy(),
  });
  const scorch = scene.add.ellipse(x, y + 14, radius * 1.1, 16, pal.dark, 0.45).setOrigin(0.5).setDepth(FX_DEPTH.particles);
  scene.tweens.add({ targets: scorch, alpha: 0, duration: 900, onComplete: () => scorch.destroy() });

  dust.setParticleTint(pal.highlight);
  dust.emitParticleAt(x, y + 6, kind === 'meteor' ? 22 : 14);
  dust.setParticleTint(pal.accent);
  dust.emitParticleAt(x, y + 12, 12);
}

/** Animated gold coin drifting toward player base HUD. */
export function spawnCoinPickup(scene: Phaser.Scene, startX: number, startY: number): void {
  const coin = scene.add.circle(startX, startY, 4.5, 0xffd700).setDepth(FX_DEPTH.float);
  const core = scene.add.circle(startX, startY, 2.5, 0xfffacd).setDepth(FX_DEPTH.float + 1);
  scene.tweens.add({
    targets: [coin, core],
    x: PLAYER_BASE_X + 35,
    y: LANE_TOP + 20,
    scaleX: 0.35,
    scaleY: 0.35,
    alpha: 0.2,
    duration: 520,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      coin.destroy();
      core.destroy();
    },
  });
}

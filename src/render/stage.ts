import Phaser from 'phaser';
import { LANE_WIDTH, type Age } from '../sim/types';
import { PIXEL_SCALE, paletteFor, type AgePalette } from './palette';
import { AGE_PROPS, PROP_LAYOUT, type PropDef, type PropPlacement } from './propart';
import { FORE_BOTTOM, SKY_HEIGHT, laneGroundY, paintLane } from './laneart';

export { laneGroundY, FORE_BOTTOM, SKY_HEIGHT };

/** Authored backdrop size; drawn at PIXEL_SCALE so it fills the 900px sky band. */
export const BACKDROP_W = 450;
export const BACKDROP_H = 143;

interface PropInstance {
  img: Phaser.GameObjects.Image;
  placement: PropPlacement;
  baseX: number;
  baseY: number;
  factor: number;
  phase: number;
}

/**
 * Screen row a prop stands on inside the lane.
 * Exposed so the offline preview rasteriser places props identically.
 */
export function propScreenY(placement: PropPlacement, baseX: number): number {
  if (placement.slot === 'skyline') return SKY_HEIGHT + 2 + placement.offset;
  if (placement.slot === 'ground') return laneGroundY(baseX) + 16 + placement.offset;
  return FORE_BOTTOM + placement.offset - 6;
}

export function propParallaxFactor(placement: PropPlacement): number {
  if (placement.slot === 'skyline') return 0.9;
  if (placement.slot === 'ground') return 1;
  return 1.06;
}

export function propDepth(placement: PropPlacement): number {
  if (placement.slot === 'skyline') return -10;
  if (placement.slot === 'ground') return 1;
  return 5;
}

/**
 * Owns everything that is scenery rather than gameplay: the painted sky band,
 * the parallax prop layers and the hand-drawn lane terrain.
 */
export class Stage {
  private scene: Phaser.Scene;
  private sky!: Phaser.GameObjects.Image;
  private lane!: Phaser.GameObjects.Graphics;
  private props: PropInstance[] = [];
  private propIndex = 0;
  private age: Age = 'stone';
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build(age: Age): void {
    this.age = age;
    const pal = paletteFor(age);

    this.scene.cameras.main.setBackgroundColor(pal.panel);

    const key = `bg_${age}`;
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(pal.panel, 1);
      g.fillRect(0, 0, BACKDROP_W, BACKDROP_H);
      g.generateTexture(key, BACKDROP_W, BACKDROP_H);
      g.destroy();
    }
    this.sky = this.scene.add.image(0, 0, key).setOrigin(0, 0).setScale(PIXEL_SCALE).setDepth(-12);

    this.lane = this.scene.add.graphics().setDepth(0);
    this.drawLane(pal);
    this.buildProps(age);
  }

  /** Swap every texture to the new age; positions and depth stay identical. */
  setAge(age: Age): void {
    if (age === this.age) return;
    this.age = age;
    const pal = paletteFor(age);
    if (this.scene.textures.exists(`bg_${age}`)) this.sky.setTexture(`bg_${age}`);
    this.drawLane(pal);
    this.scene.cameras.main.setBackgroundColor(pal.panel);
    for (const inst of this.props) {
      const def = this.propDefFor(age, inst.placement.prop);
      if (def && this.scene.textures.exists(def.key)) inst.img.setTexture(def.key);
    }
  }

  private propDefFor(age: Age, name: string): PropDef | undefined {
    return AGE_PROPS[age][name];
  }

  private buildProps(age: Age): void {
    for (const inst of this.props) inst.img.destroy();
    this.props = [];
    this.propIndex = 0;
    for (const placement of PROP_LAYOUT) {
      const def = this.propDefFor(age, placement.prop);
      if (!def || !this.scene.textures.exists(def.key)) continue;
      const baseX = placement.at * LANE_WIDTH;
      const baseY = propScreenY(placement, baseX);
      const img = this.scene.add.image(baseX, baseY, def.key)
        .setOrigin(0.5, 1)
        .setScale(PIXEL_SCALE)
        .setDepth(propDepth(placement));
      if (placement.slot === 'skyline') img.setAlpha(0.94);
      this.props.push({
        img,
        placement,
        baseX,
        baseY,
        factor: propParallaxFactor(placement),
        phase: this.propIndex * 1.7,
      });
      this.propIndex++;
    }
  }

  /** Camera parallax + idle prop animation. */
  update(cameraX: number, cameraY: number, deltaMs: number): void {
    this.time += deltaMs;
    const t = this.time / 1000;
    this.sky.x = -cameraX * 0.06;
    this.sky.y = -cameraY * 0.06;
    for (const inst of this.props) {
      const shift = inst.factor - 1;
      inst.img.x = inst.baseX - cameraX * shift;
      inst.img.y = inst.baseY - cameraY * shift;
      switch (inst.placement.anim) {
        case 'flicker':
          inst.img.setAlpha(0.86 + Math.sin(t * 7 + inst.phase) * 0.14);
          break;
        case 'spin':
          inst.img.setAngle(Math.sin(t * 0.6 + inst.phase) * 6);
          break;
        case 'pulse': {
          const k = 0.94 + Math.sin(t * 2.4 + inst.phase) * 0.06;
          inst.img.setScale(PIXEL_SCALE * k);
          break;
        }
        default:
          break;
      }
    }
  }

  private drawLane(_pal: AgePalette): void {
    paintLane(this.lane, this.age);
  }

  destroy(): void {
    for (const inst of this.props) inst.img.destroy();
    this.props = [];
    this.sky?.destroy();
    this.lane?.destroy();
  }
}

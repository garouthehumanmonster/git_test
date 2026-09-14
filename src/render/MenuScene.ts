import Phaser from 'phaser';
import { LANE_HEIGHT, LANE_WIDTH } from '../sim/types';
import {
  type StageProgress,
  STAGES,
  type StageDef,
  isUnlocked,
  loadProgress,
  totalStars,
  MAX_STARS,
} from '../campaign';
import { colorHex, paletteFor } from './palette';

/**
 * Campaign stage select.
 *
 * Built from the same pixel primitives and per-age palettes as the battle HUD,
 * so the front end and the game read as one product rather than a menu bolted
 * onto a prototype.
 */
export class MenuScene extends Phaser.Scene {
  private progress!: StageProgress;
  private cards: Phaser.GameObjects.Container[] = [];

  constructor() { super('MenuScene'); }

  create(): void {
    this.progress = loadProgress();
    const pal = paletteFor('stone');
    this.cameras.main.setBackgroundColor(pal.dark);
    this.cards = [];

    // Backdrop band, drawn rather than loaded: no extra payload for a menu.
    const sky = this.add.graphics();
    sky.fillStyle(pal.dark, 1);
    sky.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);
    sky.fillStyle(pal.panel, 1);
    sky.fillRect(0, 76, LANE_WIDTH, 3);
    for (let i = 0; i < 46; i++) {
      const x = (i * 137) % LANE_WIDTH;
      const y = 40 + ((i * 61) % 380);
      sky.fillStyle(i % 3 === 0 ? pal.edge : pal.mid, 0.55);
      sky.fillRect(x, y, 2, 2);
    }
    const glow = this.add.graphics();
    glow.fillStyle(pal.accent, 0.12);
    glow.fillEllipse(LANE_WIDTH / 2, LANE_HEIGHT - 40, LANE_WIDTH * 0.8, 180);

    this.add.text(LANE_WIDTH / 2, 34, 'TIMELINE  WAR', {
      fontFamily: 'monospace', fontSize: '34px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(LANE_WIDTH / 2, 64, 'A TUG-OF-WAR ACROSS THREE AGES', {
      fontFamily: 'monospace', fontSize: '13px', color: '#d9a25e',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5);

    const starText = this.add.text(LANE_WIDTH / 2, LANE_HEIGHT - 22, `STARS  ${totalStars(this.progress)} / ${MAX_STARS}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#f4c85b', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5);
    starText.setAlpha(0.9);

    this.buildCards();
  }

  private buildCards(): void {
    // Five stage cards across the lane, plus a skirmish card underneath.
    const count = STAGES.length;
    const cardW = 158;
    const cardH = 210;
    const gap = 12;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (LANE_WIDTH - totalW) / 2 + cardW / 2;
    const y = 236;

    STAGES.forEach((stage, i) => {
      const x = startX + i * (cardW + gap);
      this.cards.push(this.makeStageCard(stage, x, y, cardW, cardH));
    });

    // Endless skirmish — the same rules the balance harness runs.
    const skirmishY = LANE_HEIGHT - 74;
    const btn = this.add.rectangle(LANE_WIDTH / 2, skirmishY, 300, 40, 0x2b1e12, 1)
      .setStrokeStyle(2, 0x8a5a2c)
      .setInteractive({ useHandCursor: true });
    this.add.text(LANE_WIDTH / 2, skirmishY, 'ENDLESS SKIRMISH', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5);
    btn.on('pointerover', () => btn.setFillStyle(0x4d3720));
    btn.on('pointerout', () => btn.setFillStyle(0x2b1e12));
    btn.on('pointerdown', () => this.startStage(0));
  }

  private makeStageCard(stage: StageDef, x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const unlocked = isUnlocked(this.progress, stage.id);
    const stars = this.progress.stars[stage.id] ?? 0;
    const best = this.progress.bestMs?.[stage.id];
    const agePal = paletteFor(stage.rules.aiStartAge);
    const c = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, unlocked ? agePal.dark : 0x120e1c, 1)
      .setStrokeStyle(3, unlocked ? agePal.edge : 0x2b1e12);
    const top = this.add.rectangle(0, -h / 2 + 5, w - 6, 6, unlocked ? agePal.edge : 0x2b1e12).setOrigin(0.5);

    const num = this.add.text(-w / 2 + 14, -h / 2 + 20, `${stage.id}`, {
      fontFamily: 'monospace', fontSize: '30px',
      color: unlocked ? colorHex(agePal.light) : '#4d3720', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 5,
    }).setOrigin(0, 0.5);

    const name = this.add.text(0, -h / 2 + 62, stage.name.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '15px',
      color: unlocked ? '#ffe0b0' : '#4d3720', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 4,
      align: 'center',
      wordWrap: { width: w - 16 },
    }).setOrigin(0.5);

    const tagline = this.add.text(0, -h / 2 + 108, stage.brief, {
      fontFamily: 'monospace', fontSize: '10px',
      color: unlocked ? colorHex(agePal.body) : '#3a2a18',
      stroke: '#171009', strokeThickness: 3,
      align: 'center',
      wordWrap: { width: w - 20 },
    }).setOrigin(0.5, 0);

    const starRow = this.add.text(0, h / 2 - 46, [0, 1, 2].map((i) => (i < stars ? '★' : '☆')).join(' '), {
      fontFamily: 'monospace', fontSize: '19px',
      color: stars > 0 ? '#f4c85b' : '#4d3720',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5);

    const bestText = this.add.text(0, h / 2 - 22, best ? `BEST ${(best / 1000).toFixed(1)}s` : 'NOT CLEARED', {
      fontFamily: 'monospace', fontSize: '10px',
      color: unlocked ? '#d9a25e' : '#3a2a18',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5);

    c.add([bg, top, num, name, tagline, starRow, bestText]);

    if (unlocked) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => { bg.setFillStyle(agePal.panel); c.setScale(1.02); });
      bg.on('pointerout', () => { bg.setFillStyle(agePal.dark); c.setScale(1); });
      bg.on('pointerdown', () => this.startStage(stage.id));
    } else {
      const lock = this.add.text(0, 4, 'LOCKED', {
        fontFamily: 'monospace', fontSize: '13px', color: '#4d3720', fontStyle: 'bold',
        stroke: '#171009', strokeThickness: 4,
      }).setOrigin(0.5).setAngle(-12);
      const hint = this.add.text(0, 24, `clear stage ${stage.id - 1}`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#3a2a18',
        stroke: '#171009', strokeThickness: 3,
      }).setOrigin(0.5);
      c.add([lock, hint]);
      c.setAlpha(0.85);
    }
    return c;
  }

  private startStage(stageId: number): void {
    this.cameras.main.fadeOut(180, 11, 9, 24);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene', { stageId: stageId === 0 ? Math.min(5, this.progress.unlocked) : stageId });
    });
  }
}

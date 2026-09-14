import Phaser from 'phaser';
import type { SimState, UnitRole } from '../sim/types';
import {
  AGE_LABEL,
  ARMOR_COSTS,
  BASE_HP,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  FORGE_COSTS,
  LANE_HEIGHT,
  LANE_WIDTH,
  MAX_UPGRADE_RANK,
  ROLE_HOTKEY,
  UNIT_DEFS,
} from '../sim/types';
import { colorHex } from './palette';
import { PIXEL_SCALE } from './palette';

// ---------------- per-age UI theme ----------------
interface Theme {
  panel: number; panelLight: number; panelDark: number;
  mid: number; edge: number; body: number;
  border: number; borderGlow: number;
  accent: number; accentText: string;
  gold: number; xp: number;
  hpPlayer: number; hpEnemy: number;
  btnReady: number; btnLocked: number;
  evolveBg: number; evolveBorder: number; evolveGlow: string;
  banner: number; outline: string;
}

const THEMES: Record<'stone' | 'medieval' | 'modern', Theme> = {
  stone: {
    panel: 0x2b1e12, panelLight: 0x4d3720, panelDark: 0x171009,
    mid: 0x4d3720, edge: 0x8a5a2c, body: 0xb08354,
    border: 0x8a5a2c, borderGlow: 0xd9a25e,
    accent: 0xd9a25e, accentText: '#ffe0b0',
    gold: 0xf4c85b, xp: 0xb08354,
    hpPlayer: 0xd9a25e, hpEnemy: 0x8a5a2c,
    btnReady: 0x8a5a2c, btnLocked: 0x2b1e12,
    evolveBg: 0x4d3720, evolveBorder: 0xd9a25e, evolveGlow: '#ffe0b0',
    banner: 0x2b1e12, outline: '#171009',
  },
  medieval: {
    panel: 0x161d33, panelLight: 0x2a3660, panelDark: 0x0a0f1f,
    mid: 0x2a3660, edge: 0x425aa8, body: 0x7a8fcf,
    border: 0x425aa8, borderGlow: 0xffd166,
    accent: 0xffd166, accentText: '#ffe9b0',
    gold: 0xffd166, xp: 0x7a8fcf,
    hpPlayer: 0x7a8fcf, hpEnemy: 0xd64a4a,
    btnReady: 0x425aa8, btnLocked: 0x161d33,
    evolveBg: 0x2a3660, evolveBorder: 0xffd166, evolveGlow: '#ffe9b0',
    banner: 0x161d33, outline: '#0a0f1f',
  },
  modern: {
    panel: 0x0a1a20, panelLight: 0x123340, panelDark: 0x050d12,
    mid: 0x123340, edge: 0x16c0b3, body: 0x38fff0,
    border: 0x16c0b3, borderGlow: 0x38fff0,
    accent: 0xc8fff8, accentText: '#c8fff8',
    gold: 0xffb648, xp: 0x38fff0,
    hpPlayer: 0x38fff0, hpEnemy: 0xef5350,
    btnReady: 0x16c0b3, btnLocked: 0x0a1a20,
    evolveBg: 0x123340, evolveBorder: 0x38fff0, evolveGlow: '#c8fff8',
    banner: 0x0a1a20, outline: '#050d12',
  },
};

/** Top HUD strip height; the painted sky is untouched below it. */
const TOP_H = 64;
/** Bottom action panel: buttons, and nothing else below the lane. */
const PANEL_Y = LANE_HEIGHT - 78;

export class Hud {
  private scene: Phaser.Scene;
  private goldText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private ageText!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private musicBtn!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private aiHpBar!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;
  private aiHpText!: Phaser.GameObjects.Text;
  private playerHpFrame!: Phaser.GameObjects.Rectangle;
  private aiHpFrame!: Phaser.GameObjects.Rectangle;
  private topPanel!: Phaser.GameObjects.Graphics;
  private bottomPanel!: Phaser.GameObjects.Graphics;
  private crest!: Phaser.GameObjects.Image;
  private goldIcon!: Phaser.GameObjects.Image;
  private xpIcon!: Phaser.GameObjects.Image;

  onSpawnRequest?: (role: UnitRole) => void;
  onEvolveRequest?: () => void;
  onUpgradeForge?: () => void;
  onUpgradeArmor?: () => void;
  onRestartRequest?: () => void;
  onToggleMusic?: () => void;
  onTogglePause?: () => void;
  onCycleSpeed?: () => void;
  onRewardedAdRequest?: () => void;

  private buttons: Array<{
    role: UnitRole;
    bg: Phaser.GameObjects.Rectangle;
    accent: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    hotkey: Phaser.GameObjects.Text;
    stats: Phaser.GameObjects.Text;
    cd: Phaser.GameObjects.Rectangle;
    frame: Phaser.GameObjects.Graphics;
  }> = [];

  private evolveBtn!: {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    hotkey: Phaser.GameObjects.Text;
    frame: Phaser.GameObjects.Graphics;
    pulse: number;
  };

  private upgradeBtns: Record<'forge' | 'armor', {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    pips: Phaser.GameObjects.Rectangle[];
    frame: Phaser.GameObjects.Graphics;
    hotkey: Phaser.GameObjects.Text;
  }> = {} as never;

  private gameOverGroup?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private speedBtn!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Text;
  private musicOn = true;
  private currentTheme: 'stone' | 'medieval' | 'modern' = 'stone';

  static readonly BAR_W = 180;
  static readonly BAR_H = 14;
  static readonly BTN_W = 148;
  static readonly BTN_H = 66;
  static readonly UPG_BTN_W = 104;
  static readonly EVOLVE_BTN_W = 132;
  static readonly PANEL_Y = PANEL_Y;
  static readonly SPAWN_LOCK_TICKS = 8;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildStatic();
  }

  // ------------------------------------------------------------ construction

  private buildStatic(): void {
    const s = this.scene;
    const w = LANE_WIDTH;

    this.topPanel = s.add.graphics().setDepth(9);
    this.bottomPanel = s.add.graphics().setDepth(9);

    // Title
    s.add.text(w / 2, 18, 'TIMELINE  WAR', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 5,
    }).setOrigin(0.5, 0.5).setDepth(10);

    // Resources (top left)
    this.crest = s.add.image(30, 32, 'crest_stone').setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(10);
    this.goldIcon = s.add.image(58, 21, 'icon_gold_stone').setOrigin(0, 0.5).setScale(PIXEL_SCALE).setDepth(10);
    this.goldText = s.add.text(86, 21, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f4c85b', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);
    this.xpIcon = s.add.image(58, 45, 'icon_xp_stone').setOrigin(0, 0.5).setScale(PIXEL_SCALE).setDepth(10);
    this.xpText = s.add.text(86, 45, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#b08354',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);
    this.ageText = s.add.text(58, 61, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);

    // Base health bars (top centre)
    const barW = Hud.BAR_W, barH = Hud.BAR_H;
    this.playerHpFrame = s.add.rectangle(w / 2 - 8, 32, barW + 6, barH + 6, 0x171009, 1)
      .setOrigin(1, 0.5).setDepth(10).setStrokeStyle(2, 0x8a5a2c);
    this.playerHpBar = s.add.rectangle(w / 2 - 11, 32, barW, barH, 0xd9a25e).setOrigin(1, 0.5).setDepth(11);
    this.playerHpText = s.add.text(w / 2 - 8, 48, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(10);

    this.aiHpFrame = s.add.rectangle(w / 2 + 8, 32, barW + 6, barH + 6, 0x171009, 1)
      .setOrigin(0, 0.5).setDepth(10).setStrokeStyle(2, 0x8a5a2c);
    this.aiHpBar = s.add.rectangle(w / 2 + 11, 32, barW, barH, 0x8a5a2c).setOrigin(0, 0.5).setDepth(11);
    this.aiHpText = s.add.text(w / 2 + 8, 48, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);

    // Controls (top right)
    const btnStyle = { fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#171009', padding: { x: 8, y: 5 } };
    const bonusBtn = s.add.text(w - 14, 34, 'BONUS +100G', { ...btnStyle, color: '#f4c85b', fontStyle: 'bold' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    bonusBtn.on('pointerdown', () => this.onRewardedAdRequest?.());
    bonusBtn.on('pointerover', () => bonusBtn.setStyle({ color: '#ffe0b0' }));
    bonusBtn.on('pointerout', () => bonusBtn.setStyle({ color: '#f4c85b' }));

    this.musicBtn = s.add.text(w - 14, 10, 'SND', { ...btnStyle, color: '#d9a25e' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.musicBtn.on('pointerdown', () => { this.musicOn = !this.musicOn; this.onToggleMusic?.(); this.updateMusicIcon(); });

    this.speedBtn = s.add.text(w - 78, 10, '> 1x', { ...btnStyle, color: '#ffe0b0' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.speedBtn.on('pointerdown', () => this.onCycleSpeed?.());
    this.speedBtn.on('pointerover', () => this.speedBtn.setStyle({ color: '#f4c85b' }));
    this.speedBtn.on('pointerout', () => this.speedBtn.setStyle({ color: '#ffe0b0' }));

    this.pauseBtn = s.add.text(w - 140, 10, '||', { ...btnStyle, color: '#f4c85b' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => this.onTogglePause?.());

    // Action bar
    const roles: UnitRole[] = ['swarm', 'tank', 'ranged'];
    const btnW = Hud.BTN_W, btnH = Hud.BTN_H, upgW = Hud.UPG_BTN_W;
    const gap = 8;
    const totalW = btnW * 3 + upgW * 2 + Hud.EVOLVE_BTN_W + gap * 5;
    let x = (w - totalW) / 2 + btnW / 2;
    const y = PANEL_Y + Math.round((LANE_HEIGHT - PANEL_Y) / 2);
    for (const role of roles) {
      this.makeSpawnButton(x, y, btnW, btnH, role);
      x += btnW + gap;
    }
    this.makeUpgradeButton(x, y, upgW, btnH, 'forge');
    x += upgW + gap;
    this.makeUpgradeButton(x, y, upgW, btnH, 'armor');
    x += upgW + gap;
    this.makeEvolveButton(x, y, Hud.EVOLVE_BTN_W, btnH);

    this.subtitle = s.add.text(w / 2, PANEL_Y - 12, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.applyTheme(THEMES.stone);
  }

  // ------------------------------------------------- panel/frame drawing

  private drawBtnFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, theme: Theme, ready: boolean): void {
    g.clear();
    const border = ready ? theme.btnReady : theme.btnLocked;
    g.fillStyle(theme.panelDark, 1);
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle(theme.panel, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(theme.panelLight, 0.6);
    g.fillRect(x, y, w, 2);
    g.lineStyle(2, border, 1);
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (ready) {
      g.lineStyle(2, theme.borderGlow, 0.5);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
  }

  private applyTheme(t: Theme): void {
    this.topPanel.clear();
    this.topPanel.fillStyle(t.banner, 0.72);
    this.topPanel.fillRect(0, 0, LANE_WIDTH, TOP_H);
    this.topPanel.fillStyle(t.border, 0.9);
    this.topPanel.fillRect(0, TOP_H - 3, LANE_WIDTH, 3);
    this.topPanel.fillStyle(t.borderGlow, 0.5);
    this.topPanel.fillRect(0, TOP_H, LANE_WIDTH, 1);

    this.bottomPanel.clear();
    this.bottomPanel.fillStyle(t.banner, 0.92);
    this.bottomPanel.fillRect(0, PANEL_Y, LANE_WIDTH, LANE_HEIGHT - PANEL_Y);
    this.bottomPanel.fillStyle(t.border, 0.9);
    this.bottomPanel.fillRect(0, PANEL_Y, LANE_WIDTH, 3);
    this.bottomPanel.fillStyle(t.borderGlow, 0.35);
    this.bottomPanel.fillRect(0, PANEL_Y + 3, LANE_WIDTH, 1);

    this.playerHpFrame.setStrokeStyle(2, t.hpPlayer, 0.9);
    this.aiHpFrame.setStrokeStyle(2, t.hpEnemy, 0.9);

    const age = this.currentTheme;
    if (this.scene.textures.exists(`crest_${age}`)) this.crest.setTexture(`crest_${age}`);
    this.crest.setScale(PIXEL_SCALE);
    this.goldIcon.setTexture(`icon_gold_${age}`).setScale(PIXEL_SCALE);
    this.xpIcon.setTexture(`icon_xp_${age}`).setScale(PIXEL_SCALE);
    this.evolveBtn?.icon.setTexture(`icon_evolve_${age}`).setScale(PIXEL_SCALE);
    for (const btn of this.buttons) {
      const tex = `portrait_${age}_${btn.role}`;
      if (this.scene.textures.exists(tex)) btn.icon.setTexture(tex).setScale(PIXEL_SCALE);
    }
    for (const which of ['forge', 'armor'] as const) {
      const btn = this.upgradeBtns[which];
      if (!btn) continue;
      const tex = `icon_${which}_${age}`;
      if (this.scene.textures.exists(tex)) btn.icon.setTexture(tex).setScale(PIXEL_SCALE);
    }

    this.goldText.setColor(colorHex(t.gold));
    this.xpText.setColor(colorHex(t.xp));
    this.ageText.setColor(t.accentText);
    this.subtitle.setColor(t.accentText);
    for (const child of this.scene.children.list) {
      if (child instanceof Phaser.GameObjects.Text) child.setStroke(t.outline, 3);
    }
  }

  private makeSpawnButton(x: number, y: number, w: number, h: number, role: UnitRole): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const accent = s.add.rectangle(x - w / 2 + 3, y - h / 2 + 3, 5, h - 6, 0xffe0b0).setOrigin(0, 0).setDepth(11);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    const icon = s.add.image(x - w / 2 + 26, y, `portrait_stone_${role}`)
      .setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x - w / 2 + 48, y - h / 2 + 8, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(12);
    const cost = s.add.text(x - w / 2 + 48, y - h / 2 + 26, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(12);
    const stats = s.add.text(x - w / 2 + 8, y + h / 2 - 20, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#b08354',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 12, y - h / 2 + 8, ROLE_HOTKEY[role], {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    const cd = s.add.rectangle(x - w / 2 + 3, y - h / 2 + 3, 0, h - 6, 0x171009, 0.62).setOrigin(0, 0).setDepth(13).setVisible(false);

    bg.on('pointerdown', () => this.onSpawnRequest?.(role));
    bg.on('pointerover', () => bg.setFillStyle(0x4d3720));
    bg.on('pointerout', () => bg.setFillStyle(0x171009));

    this.buttons.push({ role, bg, accent, icon, label, cost, hotkey, stats, cd, frame });
  }

  private makeEvolveButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x4d3720).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const icon = s.add.image(x, y - h / 2 + 22, 'icon_evolve_stone').setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x, y + 6, 'EVOLVE', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 16, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#d9a25e',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 12, y - h / 2 + 8, 'E', {
      fontFamily: 'monospace', fontSize: '12px', color: '#d9a25e',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    bg.on('pointerdown', () => this.onEvolveRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x8a5a2c));
    bg.on('pointerout', () => bg.setFillStyle(0x4d3720));
    this.evolveBtn = { bg, icon, label, cost, hotkey, frame, pulse: 0 };
  }

  private makeUpgradeButton(x: number, y: number, w: number, h: number, which: 'forge' | 'armor'): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const icon = s.add.image(x, y - h / 2 + 22, `icon_${which}_stone`).setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x, y + 4, which === 'forge' ? 'FORGE' : 'ARMOR', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 20, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 12, y - h / 2 + 8, which === 'forge' ? 'U' : 'Y', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < MAX_UPGRADE_RANK; i++) {
      pips.push(s.add.rectangle(x - 14 + i * 14, y + 20, 10, 4, 0x4d3720).setDepth(12).setOrigin(0.5));
    }
    if (which === 'forge') bg.on('pointerdown', () => this.onUpgradeForge?.());
    else bg.on('pointerdown', () => this.onUpgradeArmor?.());
    bg.on('pointerover', () => bg.setFillStyle(0x4d3720));
    bg.on('pointerout', () => bg.setFillStyle(0x171009));
    this.upgradeBtns[which] = { bg, icon, label, cost, pips, frame, hotkey };
  }

  // ------------------------------------------------------------ interaction

  private updateMusicIcon(): void {
    const theme = THEMES[this.currentTheme];
    this.musicBtn.setText(this.musicOn ? 'SND' : 'MUTE');
    this.musicBtn.setStyle({
      color: this.musicOn ? theme.accentText : colorHex(theme.mid),
      backgroundColor: colorHex(theme.panelDark),
    });
  }
  setMusic(on: boolean): void { this.musicOn = on; this.updateMusicIcon(); }

  shakeButton(role: UnitRole): void {
    const btn = this.buttons.find((b) => b.role === role);
    if (!btn) return;
    this.nudge([btn.bg, btn.icon, btn.label, btn.cost, btn.hotkey, btn.stats]);
  }

  shakeUpgrade(which: 'forge' | 'armor'): void {
    const btn = this.upgradeBtns[which];
    if (!btn) return;
    this.nudge([btn.bg, btn.icon, btn.label, btn.cost, btn.hotkey, ...btn.pips]);
  }

  private nudge(objs: Phaser.GameObjects.GameObject[]): void {
    const originX = new Map<Phaser.GameObjects.GameObject, number>();
    for (const o of objs) originX.set(o, (o as Phaser.GameObjects.Rectangle).x);
    let step = 0;
    const steps = 6;
    this.scene.time.addEvent({
      delay: 40,
      repeat: steps - 1,
      callback: () => {
        const offset = step < steps ? (step % 2 === 0 ? 4 : -4) : 0;
        for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = (originX.get(o) ?? 0) + offset;
        step++;
        if (step >= steps) for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = originX.get(o) ?? 0;
      },
    });
  }

  setPaused(paused: boolean, speed: number): void {
    this.pauseBtn.setText(paused ? '>' : '||');
    this.speedBtn.setText((paused ? '|| ' : '> ') + speed + 'x');
    if (paused && !this.pauseOverlay) {
      const s = this.scene;
      const c = s.add.container(LANE_WIDTH / 2, LANE_HEIGHT / 2 - 20).setDepth(40);
      const theme = THEMES[this.currentTheme];
      const bg = s.add.rectangle(0, 0, 380, 104, theme.panelDark, 0.86).setStrokeStyle(3, theme.gold);
      const t = s.add.text(0, -12, 'PAUSED', {
        fontFamily: 'monospace', fontSize: '32px', color: colorHex(theme.gold), fontStyle: 'bold',
        stroke: theme.outline, strokeThickness: 5,
      }).setOrigin(0.5);
      const h = s.add.text(0, 24, 'Press P or click || to resume', {
        fontFamily: 'monospace', fontSize: '13px', color: colorHex(theme.body),
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(0.5);
      c.add([bg, t, h]);
      this.pauseOverlay = c;
    } else if (!paused && this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
    }
  }

  // ------------------------------------------------------------------ update

  update(state: SimState, canEvolveNow: boolean): void {
    const p = state.player;
    const theme = THEMES[p.age];
    if (theme !== THEMES[this.currentTheme]) {
      this.currentTheme = p.age;
      this.applyTheme(theme);
    }

    this.goldText.setText(`${Math.floor(p.gold)} G`);
    this.xpText.setText(`${Math.floor(p.xp)} XP`);
    this.ageText.setText(AGE_LABEL[p.age].toUpperCase());

    const barW = Hud.BAR_W;
    const pRatio = Math.max(0, p.baseHp) / BASE_HP;
    this.playerHpBar.width = barW * pRatio;
    this.playerHpBar.setFillStyle(pRatio < 0.3 ? theme.hpEnemy : pRatio < 0.6 ? theme.gold : theme.hpPlayer);
    this.playerHpText.setText(`YOU   ${Math.max(0, Math.ceil(p.baseHp))} / ${BASE_HP}`);

    const a = state.ai;
    const aRatio = Math.max(0, a.baseHp) / BASE_HP;
    this.aiHpBar.width = barW * aRatio;
    this.aiHpBar.setFillStyle(aRatio < 0.3 ? theme.hpEnemy : aRatio < 0.6 ? theme.gold : theme.hpEnemy);
    this.aiHpText.setText(`${Math.max(0, Math.ceil(a.baseHp))} / ${BASE_HP}   ENEMY`);

    const roleAccent: Record<UnitRole, number> = {
      swarm: theme.xp,
      tank: theme.hpPlayer,
      ranged: theme.hpEnemy,
    };

    for (const btn of this.buttons) {
      const def = UNIT_DEFS[p.age][btn.role];
      const affordable = p.gold >= def.cost && p.spawnLockTicks === 0 && state.result === 'playing';
      btn.icon.setAlpha(affordable ? 1 : 0.45);
      btn.label.setText(def.label.toUpperCase());
      btn.cost.setText(`${def.cost} G`);
      btn.stats.setText(`HP${def.hp} DMG${def.damage} RNG${Math.round(def.range)}`);
      btn.bg.setFillStyle(affordable ? theme.btnReady : theme.btnLocked);
      btn.label.setColor(affordable ? theme.accentText : colorHex(theme.mid));
      btn.cost.setColor(affordable ? colorHex(theme.gold) : colorHex(theme.edge));
      btn.stats.setColor(affordable ? theme.accentText : colorHex(theme.mid));
      btn.accent.setFillStyle(roleAccent[btn.role], affordable ? 1 : 0.35);
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2, btn.bg.y - btn.bg.height / 2,
        btn.bg.width, btn.bg.height,
        theme, affordable,
      );
      const cdRatio = Math.max(0, Math.min(1, p.spawnLockTicks / Hud.SPAWN_LOCK_TICKS));
      btn.cd.setVisible(cdRatio > 0);
      btn.cd.width = (Hud.BTN_W - 6) * cdRatio;
      btn.cd.height = Hud.BTN_H - 6;
    }

    // Evolve button
    const ageIdx = ['stone', 'medieval', 'modern'].indexOf(p.age);
    const nextAge = ageIdx < 2 ? (['medieval', 'modern'] as const)[ageIdx]! : null;
    this.drawBtnFrame(
      this.evolveBtn.frame,
      this.evolveBtn.bg.x - this.evolveBtn.bg.width / 2, this.evolveBtn.bg.y - this.evolveBtn.bg.height / 2,
      this.evolveBtn.bg.width, this.evolveBtn.bg.height,
      { ...theme, btnReady: theme.evolveBorder, btnLocked: theme.panelDark, borderGlow: theme.evolveBorder },
      canEvolveNow && !!nextAge,
    );
    if (nextAge) {
      const cost = EVOLVE_COST[nextAge];
      const xpReq = EVOLVE_XP_REQ[nextAge];
      const shortName = nextAge === 'medieval' ? 'MEDIEVAL' : 'MODERN';
      this.evolveBtn.label.setText(`> ${shortName}`);
      this.evolveBtn.cost.setText(`${cost}G  ${Math.floor(p.xp)}/${xpReq} XP`);
      this.evolveBtn.bg.setFillStyle(canEvolveNow ? theme.evolveBg : theme.panelDark);
      this.evolveBtn.label.setColor(canEvolveNow ? theme.accentText : colorHex(theme.mid));
      this.evolveBtn.cost.setColor(canEvolveNow ? theme.evolveGlow : colorHex(theme.mid));
      this.evolveBtn.bg.setInteractive({ useHandCursor: canEvolveNow });
      if (canEvolveNow) {
        this.evolveBtn.pulse += 0.08;
        const alpha = 0.85 + Math.sin(this.evolveBtn.pulse) * 0.15;
        this.evolveBtn.bg.setAlpha(alpha);
        this.evolveBtn.icon.setAlpha(alpha);
      } else {
        this.evolveBtn.bg.setAlpha(1);
        this.evolveBtn.icon.setAlpha(0.6);
      }
    } else {
      this.evolveBtn.label.setText('MAX AGE');
      this.evolveBtn.cost.setText('--');
      this.evolveBtn.bg.setFillStyle(theme.panelDark);
      this.evolveBtn.label.setColor(colorHex(theme.mid));
      this.evolveBtn.cost.setColor(colorHex(theme.mid));
      this.evolveBtn.icon.setAlpha(0.4);
      this.evolveBtn.bg.disableInteractive();
      this.evolveBtn.bg.setAlpha(1);
    }

    (['forge', 'armor'] as const).forEach((which) => {
      const btn = this.upgradeBtns[which];
      if (!btn) return;
      const rank = which === 'forge' ? p.forgeRank : p.armorRank;
      const maxed = rank >= MAX_UPGRADE_RANK;
      const costs = which === 'forge' ? FORGE_COSTS : ARMOR_COSTS;
      const cost = maxed ? 0 : costs[p.age][rank]!;
      const accent = which === 'forge' ? theme.hpEnemy : theme.hpPlayer;
      const affordable = !maxed && p.gold >= cost && state.result === 'playing';
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2, btn.bg.y - btn.bg.height / 2,
        btn.bg.width, btn.bg.height,
        { ...theme, btnReady: accent, btnLocked: theme.panelDark, borderGlow: accent },
        affordable,
      );
      btn.bg.setFillStyle(affordable ? theme.panel : theme.panelDark);
      btn.label.setColor(maxed ? colorHex(accent) : affordable ? theme.accentText : colorHex(theme.mid));
      btn.cost.setColor(maxed ? colorHex(accent) : affordable ? colorHex(theme.gold) : colorHex(theme.edge));
      btn.cost.setText(maxed ? 'MAX' : `${cost} G`);
      btn.icon.setAlpha(affordable || maxed ? 1 : 0.45);
      btn.bg.setInteractive({ useHandCursor: affordable });
      btn.pips.forEach((pip, i) => pip.setFillStyle(i < rank ? accent : theme.panelLight));
    });

    if (state.result !== 'playing') {
      this.subtitle.setText(state.result === 'win'
        ? 'VICTORY - timeline secured  |  SPACE to play again'
        : 'DEFEAT - timeline lost  |  SPACE to retry');
    } else if (p.spawnLockTicks > 0) {
      this.subtitle.setText('Deploying...');
    } else if (p.age === 'stone' && p.xp >= EVOLVE_XP_REQ.medieval) {
      this.subtitle.setText('XP READY  |  press E to enter the Medieval Age');
    } else if (p.age === 'medieval' && p.xp >= EVOLVE_XP_REQ.modern) {
      this.subtitle.setText('XP READY  |  press E to enter the Modern Age');
    } else {
      const enemies = state.units.filter((u) => u.side === 'ai' && u.state !== 'die').length;
      if (enemies > 8) this.subtitle.setText('ALERT  |  enemy massing - build tanks and ranged');
      else if (enemies === 0) this.subtitle.setText('PUSH  |  lane clear - send the swarm');
      else this.subtitle.setText('Deploy units  1 / 2 / 3   |   U forge   Y armor   E evolve');
    }
  }

  showGameOver(result: 'win' | 'loss'): void {
    if (this.gameOverGroup) return;
    const s = this.scene;
    const theme = THEMES[this.currentTheme];
    const c = s.add.container(LANE_WIDTH / 2, 250).setDepth(50);

    const bg = s.add.rectangle(0, 0, 560, 220, theme.panelDark, 0.9)
      .setStrokeStyle(3, result === 'win' ? theme.gold : theme.hpEnemy);
    const t1 = s.add.text(0, -62, result === 'win' ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'monospace', fontSize: '42px',
      color: colorHex(result === 'win' ? theme.gold : theme.hpEnemy),
      fontStyle: 'bold', stroke: theme.outline, strokeThickness: 6,
    }).setOrigin(0.5);
    const decoKey = `ui_${result === 'win' ? 'victory' : 'defeat'}_${this.currentTheme}`;
    if (s.textures.exists(decoKey)) {
      const img = s.add.image(0, 6, decoKey).setOrigin(0.5).setScale(PIXEL_SCALE);
      c.add(img);
    }
    const t2 = s.add.text(0, 48, result === 'win' ? 'You erased the enemy timeline.' : 'The enemy erased yours.', {
      fontFamily: 'monospace', fontSize: '16px', color: theme.accentText,
      stroke: theme.outline, strokeThickness: 4,
    }).setOrigin(0.5);
    const t3 = s.add.text(0, 78, 'Press SPACE or click to play again', {
      fontFamily: 'monospace', fontSize: '14px', color: colorHex(theme.body),
      stroke: theme.outline, strokeThickness: 3,
    }).setOrigin(0.5);
    c.add([bg, t1, t2, t3]);
    this.gameOverGroup = c;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onRestartRequest?.());
    c.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: c, scaleX: 1, scaleY: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
  }

  resetGameOver(): void {
    if (this.gameOverGroup) { this.gameOverGroup.destroy(); this.gameOverGroup = undefined; }
    if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = undefined; }
    for (const b of this.buttons) b.cd.setVisible(false);
    this.setPaused(false, 1);
  }
}

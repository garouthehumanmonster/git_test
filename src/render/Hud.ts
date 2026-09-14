import Phaser from 'phaser';
import type { SimState, UnitRole } from '../sim/types';
import { FORGE_COSTS, ARMOR_COSTS, MAX_UPGRADE_RANK } from '../sim/types';
import {
  AGE_LABEL,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  LANE_HEIGHT,
  LANE_WIDTH,
  ROLE_HOTKEY,
  UNIT_DEFS,
} from '../sim/types';
import { unitKey } from './sprites';

// ---------------- per-age UI theme ----------------
interface Theme {
  panel: number; panelLight: number; panelDark: number;
  border: number; borderGlow: number;
  accent: number; accentText: string;
  gold: number; xp: number;
  hpPlayer: number; hpEnemy: number;
  btnReady: number; btnLocked: number;
  evolveBg: number; evolveBorder: number; evolveGlow: string;
  banner: number;
}

const THEMES: Record<'stone' | 'medieval' | 'modern', Theme> = {
  stone: {
    panel: 0x2b1e12, panelLight: 0x4d3720, panelDark: 0x171009,
    border: 0x8a5a2c, borderGlow: 0xd9a25e,
    accent: 0xd9a25e, accentText: '#ffe0b0',
    gold: 0xf4c85b, xp: 0x9bcf76,
    hpPlayer: 0x5aa0d8, hpEnemy: 0xd64a4a,
    btnReady: 0x6b4a22, btnLocked: 0x2b1e12,
    evolveBg: 0x3a2814, evolveBorder: 0xb07d3b, evolveGlow: '#f6d893',
    banner: 0x3a2814,
  },
  medieval: {
    panel: 0x161d33, panelLight: 0x2a3660, panelDark: 0x0a0f1f,
    border: 0x425aa8, borderGlow: 0xffd166,
    accent: 0xffd166, accentText: '#ffe9b0',
    gold: 0xffd166, xp: 0x9dffef,
    hpPlayer: 0x4a7fd8, hpEnemy: 0xd64a4a,
    btnReady: 0x2d4480, btnLocked: 0x161d33,
    evolveBg: 0x2a1b3d, evolveBorder: 0x863bff, evolveGlow: '#d9b8ff',
    banner: 0x1d2648,
  },
  modern: {
    panel: 0x0a1a20, panelLight: 0x123340, panelDark: 0x050d12,
    border: 0x16c0b3, borderGlow: 0x38fff0,
    accent: 0x38fff0, accentText: '#c8fff8',
    gold: 0xffb648, xp: 0x38fff0,
    hpPlayer: 0x2ea7d6, hpEnemy: 0xd64a4a,
    btnReady: 0x0f4a52, btnLocked: 0x0a1a20,
    evolveBg: 0x130e2a, evolveBorder: 0x6ee7ff, evolveGlow: '#c8fbff',
    banner: 0x0b1a22,
  },
};

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
  private titleImg?: Phaser.GameObjects.Image;

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

  private gameOverGroup?: Phaser.GameObjects.Container;
  private currentTheme: 'stone' | 'medieval' | 'modern' = 'stone';

  static readonly BAR_W = 230;
  static readonly BAR_H = 16;
  static readonly BTN_W = 98;
  static readonly BTN_H = 62;
  static readonly UPG_BTN_W = 72;
  static readonly UPG_BTN_H = 62;
  static readonly SPAWN_LOCK_TICKS = 8;
  static readonly ICON_PX = 38;

  onSpawnRequest?: (role: UnitRole) => void;
  onEvolveRequest?: () => void;
  onUpgradeForge?: () => void;
  onUpgradeArmor?: () => void;
  onRestartRequest?: () => void;
  onToggleMusic?: () => void;
  onTogglePause?: () => void;
  onCycleSpeed?: () => void;

  private upgradeBtns: Record<'forge'|'armor', {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    pips: Phaser.GameObjects.Rectangle[];
    frame: Phaser.GameObjects.Graphics;
    hotkey: Phaser.GameObjects.Text;
  }> = {} as any;

  shakeUpgrade(which: 'forge'|'armor'): void {
    const btn = this.upgradeBtns[which];
    if (!btn) return;
    const objs: Phaser.GameObjects.GameObject[] = [btn.bg, btn.icon, btn.label, btn.cost, btn.hotkey, ...btn.pips];
    const originalX = new Map<Phaser.GameObjects.GameObject, number>();
    for (const o of objs) originalX.set(o, (o as Phaser.GameObjects.Rectangle).x);
    let step = 0;
    const steps = 6;
    this.scene.time.addEvent({
      delay: 40,
      repeat: steps - 1,
      callback: () => {
        const offset = step < steps ? (step % 2 === 0 ? 3 : -3) : 0;
        for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = (originalX.get(o) ?? 0) + offset;
        step++;
        if (step >= steps) for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = originalX.get(o) ?? 0;
      },
    });
  }

  private musicOn = true;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private speedBtn!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Text;

  shakeButton(role: UnitRole): void {
    const btn = this.buttons.find((b) => b.role === role);
    if (!btn) return;
    const objs: Phaser.GameObjects.GameObject[] = [btn.bg, btn.icon, btn.label, btn.cost, btn.hotkey, btn.stats];
    const originalX = new Map<Phaser.GameObjects.GameObject, number>();
    for (const o of objs) originalX.set(o, (o as Phaser.GameObjects.Rectangle).x);
    let step = 0;
    const steps = 6;
    this.scene.time.addEvent({
      delay: 40,
      repeat: steps - 1,
      callback: () => {
        const offset = step < steps ? (step % 2 === 0 ? 3 : -3) : 0;
        for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = (originalX.get(o) ?? 0) + offset;
        step++;
        if (step >= steps) for (const o of objs) (o as Phaser.GameObjects.Rectangle).x = originalX.get(o) ?? 0;
      },
    });
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildStatic();
  }

  private buildStatic(): void {
    const s = this.scene;
    const w = LANE_WIDTH;

    // Top and bottom decorative panels — redrawn per age.
    this.topPanel = s.add.graphics().setDepth(9);
    this.bottomPanel = s.add.graphics().setDepth(9);

    // Title: use AI-generated banner if available, else text fallback.
    if (s.textures.exists('ui_title')) {
      this.titleImg = s.add.image(w / 2, 24, 'ui_title').setOrigin(0.5).setDepth(10);
      // Scale title to fit
      const tw = this.titleImg.width;
      this.titleImg.setScale(Math.min(1, 320 / tw));
    } else {
      s.add.text(w / 2, 20, 'TIMELINE  WAR', {
        fontFamily: 'monospace', fontSize: '26px', color: '#ffe9b0', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(10);
    }

    this.subtitle = s.add.text(w / 2, 50, 'Click to begin · 1/2/3 deploy · U/Y forge/armor · E evolve · M mute', {
      fontFamily: 'monospace', fontSize: '11px', color: '#c6c2dc',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // Age crest
    this.crest = s.add.image(16, 70, 'crest_stone').setOrigin(0, 0.5).setDepth(10);
    this.crest.setScale(0.45);

    // Resource icons + labels
    this.goldIcon = s.add.image(62, 72, s.textures.exists('icon_gold') ? 'icon_gold' : '__DUMMY').setOrigin(0, 0.5).setDepth(10).setVisible(s.textures.exists('icon_gold'));
    if (this.goldIcon.visible) this.goldIcon.setScale(0.55);
    this.xpIcon = s.add.image(62, 90, s.textures.exists('icon_xp') ? 'icon_xp' : '__DUMMY').setOrigin(0, 0.5).setDepth(10).setVisible(s.textures.exists('icon_xp'));
    if (this.xpIcon.visible) this.xpIcon.setScale(0.55);
    this.goldText = s.add.text(80, 64, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd166', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(10);
    this.xpText = s.add.text(80, 82, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#9dffef',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(10);
    this.ageText = s.add.text(62, 100, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(10);

    // Top-right controls: pause, speed, music
    const btnStyle = { fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#1b1b28', padding: { x: 6, y: 3 } };
    this.musicBtn = s.add.text(w - 16, 66, '♪ ♫', { ...btnStyle, color: '#c7a6ff' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.musicBtn.on('pointerdown', () => { this.musicOn = !this.musicOn; this.onToggleMusic?.(); this.updateMusicIcon(); });

    this.speedBtn = s.add.text(w - 70, 66, '▶ 1x', { ...btnStyle, color: '#9dffef' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.speedBtn.on('pointerdown', () => this.onCycleSpeed?.());
    this.speedBtn.on('pointerover', () => this.speedBtn.setStyle({ color: '#ffffff' }));
    this.speedBtn.on('pointerout', () => this.speedBtn.setStyle({ color: '#9dffef' }));

    this.pauseBtn = s.add.text(w - 120, 66, '❚❚', { ...btnStyle, color: '#ffd166' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => this.onTogglePause?.());

    // HP bars (framed)
    const barW = Hud.BAR_W, barH = Hud.BAR_H;
    // Player frame
    this.playerHpFrame = s.add.rectangle(128, 116, barW + 4, barH + 4, 0x0a0a14).setOrigin(0, 0.5).setDepth(10);
    this.playerHpFrame.setStrokeStyle(1, 0x334);
    s.add.rectangle(130, 116, barW, barH, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(10);
    this.playerHpBar = s.add.rectangle(130, 116, barW, barH, 0x4a7fd8).setOrigin(0, 0.5).setDepth(11);
    this.playerHpText = s.add.text(130, 126, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#cfd8dc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(10);

    // AI frame (right-aligned)
    this.aiHpFrame = s.add.rectangle(w - 128, 116, barW + 4, barH + 4, 0x0a0a14).setOrigin(1, 0.5).setDepth(10);
    this.aiHpFrame.setStrokeStyle(1, 0x433);
    s.add.rectangle(w - 130, 116, barW, barH, 0x000000, 0.6).setOrigin(1, 0.5).setDepth(10);
    this.aiHpBar = s.add.rectangle(w - 130, 116, barW, barH, 0xd64a4a).setOrigin(1, 0.5).setDepth(11);
    this.aiHpText = s.add.text(w - 130, 126, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#cfd8dc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(10);

    // Buttons
    const roles: UnitRole[] = ['swarm', 'tank', 'ranged'];
    const btnW = Hud.BTN_W, btnH = Hud.BTN_H, upgW = Hud.UPG_BTN_W, gap = 6;
    const totalW = btnW * 3 + upgW * 2 + gap * 4;
    let x = (w - totalW) / 2 + btnW / 2;
    const y = LANE_HEIGHT - btnH / 2 - 8;
    for (const role of roles) {
      this.makeSpawnButton(x, y, btnW, btnH, role);
      x += btnW + gap;
    }
    this.makeUpgradeButton(x, y, upgW, btnH, 'forge');
    x += upgW + gap;
    this.makeUpgradeButton(x, y, upgW, btnH, 'armor');
    x += upgW + gap;
    // Evolve button now at the far right
    this.makeEvolveButton(x, y, upgW + 14, btnH);

    this.applyTheme(THEMES.stone);
  }

  // ----------------- panel/frame drawing helpers -----------------
  private drawBtnFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, theme: Theme, ready: boolean): void {
    g.clear();
    const border = ready ? theme.btnReady : theme.btnLocked;
    g.fillStyle(theme.panelDark, 1);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(theme.panel, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(theme.panelLight, 0.6);
    g.fillRect(x, y, w, 2);
    g.lineStyle(1, border, 1);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (ready) {
      g.lineStyle(1, theme.borderGlow, 0.5);
      g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
  }

  private applyTheme(t: Theme): void {
    // Redraw top panel (under title + HUD)
    this.topPanel.clear();
    this.topPanel.fillStyle(t.banner, 0.88);
    this.topPanel.fillRect(0, 0, LANE_WIDTH, 148);
    // bottom edge gradient line
    this.topPanel.fillStyle(t.border, 0.9);
    this.topPanel.fillRect(0, 146, LANE_WIDTH, 2);
    this.topPanel.fillStyle(t.borderGlow, 0.5);
    this.topPanel.fillRect(0, 148, LANE_WIDTH, 1);

    // Bottom panel (from lane bottom to screen bottom = 240-190=50 px area but we push buttons down into a 72px panel)
    const panelY = 180;
    this.bottomPanel.clear();
    this.bottomPanel.fillStyle(t.banner, 0.94);
    this.bottomPanel.fillRect(0, panelY, LANE_WIDTH, LANE_HEIGHT - panelY);
    this.bottomPanel.fillStyle(t.border, 0.9);
    this.bottomPanel.fillRect(0, panelY, LANE_WIDTH, 2);
    this.bottomPanel.fillStyle(t.borderGlow, 0.3);
    this.bottomPanel.fillRect(0, panelY + 2, LANE_WIDTH, 1);

    // HP bar frames color
    this.playerHpFrame.setStrokeStyle(1, t.hpPlayer, 0.8);
    this.aiHpFrame.setStrokeStyle(1, t.hpEnemy, 0.8);

    // Crest
    const crestKey = t === THEMES.stone ? 'crest_stone' : t === THEMES.medieval ? 'crest_medieval' : 'crest_modern';
    if (this.scene.textures.exists(crestKey)) this.crest.setTexture(crestKey);

    // Resource text colors
    this.goldText.setColor('#' + t.gold.toString(16).padStart(6, '0'));
    this.xpText.setColor('#' + t.xp.toString(16).padStart(6, '0'));
    this.ageText.setColor(t.accentText);
    this.subtitle.setColor(t.accentText);
    this.subtitle.setAlpha(0.85);
  }

  private makeSpawnButton(x: number, y: number, w: number, h: number, role: UnitRole): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    // accent strip (tinted per role later)
    const accent = s.add.rectangle(x - w / 2 + 2, y - h / 2 + 2, 4, h - 4, 0xffffff).setOrigin(0, 0).setDepth(11);
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x1b1b28).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    const initKey = unitKey('stone', role);
    const icon = s.add.image(x - w / 2 + 20, y - 6, initKey).setOrigin(0.5).setDepth(12);
    if (icon.frame) {
      const scl = Hud.ICON_PX / icon.frame.realHeight;
      icon.setDisplaySize(icon.frame.realWidth * scl, icon.frame.realHeight * scl);
    }
    const label = s.add.text(x - w / 2 + 44, y - h / 2 + 6, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const cost = s.add.text(x - w / 2 + 44, y - h / 2 + 22, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffd166',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const stats = s.add.text(x - w / 2 + 6, y + h / 2 - 12, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#9aa0c4',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0, 0).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, ROLE_HOTKEY[role], {
      fontFamily: 'monospace', fontSize: '9px', color: '#aaa',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    const cd = s.add.rectangle(x - w / 2, y - h / 2, 0, h, 0x000000, 0.6).setOrigin(0, 0).setDepth(13).setVisible(false);

    bg.on('pointerdown', () => this.onSpawnRequest?.(role));
    bg.on('pointerover', () => { bg.setFillStyle(0x2b2b48); });
    bg.on('pointerout', () => { bg.setFillStyle(0x1b1b28); });

    this.buttons.push({ role, bg, accent, icon, label, cost, hotkey, stats, cd, frame });
  }

  private makeEvolveButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x2a1b3d).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const iconKey = s.textures.exists('icon_evolve') ? 'icon_evolve' : '__DUMMY';
    const icon = s.add.image(x, y - h / 2 + 18, iconKey).setOrigin(0.5).setDepth(12);
    if (iconKey === 'icon_evolve') icon.setScale(0.42); else icon.setVisible(false);
    const label = s.add.text(x, y + 6, 'EVOLVE', {
      fontFamily: 'monospace', fontSize: '10px', color: '#e0c3ff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#c7a6ff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, 'E', {
      fontFamily: 'monospace', fontSize: '9px', color: '#a680d6',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    bg.on('pointerdown', () => this.onEvolveRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x3d2658));
    bg.on('pointerout', () => bg.setFillStyle(0x2a1b3d));
    this.evolveBtn = { bg, icon: icon as Phaser.GameObjects.Image, label, cost, hotkey, frame, pulse: 0 };
  }

  private makeUpgradeButton(x: number, y: number, w: number, h: number, which: 'forge' | 'armor'): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const accent = which === 'forge' ? 0xef5350 : 0x42a5f5;
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x1b1b28).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const iconChar = which === 'forge' ? '⚒' : '🛡';
    const icon = s.add.text(x, y - h / 2 + 16, iconChar, {
      fontFamily: 'monospace', fontSize: '20px', color: '#' + accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setDepth(12);
    const labelStr = which === 'forge' ? 'FORGE' : 'ARMOR';
    const label = s.add.text(x, y + 6, labelStr, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffd166',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const hotkeyChar = which === 'forge' ? 'U' : 'Y';
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, hotkeyChar, {
      fontFamily: 'monospace', fontSize: '9px', color: '#aaa',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    // Rank pips (3 dots) above label
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < MAX_UPGRADE_RANK; i++) {
      const px = x - 10 + i * 10;
      const py = y + 17;
      pips.push(s.add.rectangle(px, py, 6, 3, 0x333344).setDepth(12).setOrigin(0.5));
    }
    if (which === 'forge') {
      bg.on('pointerdown', () => this.onUpgradeForge?.());
    } else {
      bg.on('pointerdown', () => this.onUpgradeArmor?.());
    }
    bg.on('pointerover', () => bg.setFillStyle(0x2b2b48));
    bg.on('pointerout', () => bg.setFillStyle(0x1b1b28));
    this.upgradeBtns[which] = { bg, icon, label, cost, pips, frame, hotkey };
  }

  private updateMusicIcon(): void {
    this.musicBtn.setText(this.musicOn ? '♪ ♫' : '♪ ✕');
    this.musicBtn.setStyle({
      color: this.musicOn ? '#c7a6ff' : '#555',
      backgroundColor: '#1b1b28',
    });
  }
  setMusic(on: boolean): void { this.musicOn = on; this.updateMusicIcon(); }

  setPaused(paused: boolean, speed: number): void {
    this.pauseBtn.setText(paused ? '▶' : '❚❚');
    this.speedBtn.setText((paused ? '❚❚ ' : '▶ ') + speed + 'x');
    if (paused && !this.pauseOverlay) {
      const s = this.scene;
      const c = s.add.container(LANE_WIDTH / 2, LANE_HEIGHT / 2).setDepth(40);
      const bg = s.add.rectangle(0, 0, 280, 70, 0x000000, 0.82).setStrokeStyle(2, 0xffd166);
      const t = s.add.text(0, -4, 'PAUSED', {
        fontFamily: 'monospace', fontSize: '24px', color: '#ffd166', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5);
      const h = s.add.text(0, 20, 'Press P or click ❚❚ to resume', {
        fontFamily: 'monospace', fontSize: '10px', color: '#c6c2dc',
      }).setOrigin(0.5);
      c.add([bg, t, h]);
      this.pauseOverlay = c;
    } else if (!paused && this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
    }
  }

  update(state: SimState, canEvolveNow: boolean): void {
    const p = state.player;
    const theme = THEMES[p.age];
    if (theme !== THEMES[this.currentTheme]) {
      this.currentTheme = p.age;
      this.applyTheme(theme);
    }

    this.goldText.setText(`${Math.floor(p.gold)}  Gold`);
    this.xpText.setText(`${Math.floor(p.xp)}  XP`);
    this.ageText.setText(`⚔  ${AGE_LABEL[p.age]}`);

    // HP bars
    const barW = Hud.BAR_W;
    const pRatio = Math.max(0, p.baseHp) / 800;
    this.playerHpBar.width = barW * pRatio;
    this.playerHpBar.setFillStyle(pRatio < 0.3 ? 0xef5350 : pRatio < 0.6 ? 0xffb74d : theme.hpPlayer);
    this.playerHpText.setText(`YOU       ${Math.max(0, Math.ceil(p.baseHp))} / 800`);

    const a = state.ai;
    const aRatio = Math.max(0, a.baseHp) / 800;
    this.aiHpBar.width = barW * aRatio;
    this.aiHpBar.setFillStyle(aRatio < 0.3 ? 0xef5350 : aRatio < 0.6 ? 0xffb74d : theme.hpEnemy);
    this.aiHpText.setText(`${Math.max(0, Math.ceil(a.baseHp))} / 800       ENEMY`);

    // Role accent colors per role (works across all ages)
    const roleAccent: Record<UnitRole, number> = {
      swarm: 0x9ccc65,  // green
      tank: 0x42a5f5,   // blue
      ranged: 0xef5350, // red
    };

    for (const btn of this.buttons) {
      const def = UNIT_DEFS[p.age][btn.role];
      const tex = unitKey(p.age, btn.role);
      if (btn.icon.texture.key !== tex && this.scene.textures.exists(tex)) {
        btn.icon.setTexture(tex);
        if (btn.icon.frame) {
          const scl = Hud.ICON_PX / btn.icon.frame.realHeight;
          btn.icon.setDisplaySize(btn.icon.frame.realWidth * scl, btn.icon.frame.realHeight * scl);
        }
      }
      const affordable = p.gold >= def.cost && p.spawnLockTicks === 0 && state.result === 'playing';
      btn.icon.setAlpha(affordable ? 1 : 0.45);
      btn.cost.setText(`${def.cost}g · ${def.label}`);
      btn.label.setText(def.label.toUpperCase());
      btn.stats.setText(`HP ${def.hp}   DMG ${def.damage}   RNG ${Math.round(def.range)}`);

      btn.bg.setFillStyle(affordable ? theme.btnReady : theme.btnLocked);
      btn.label.setColor(affordable ? '#ffffff' : '#6b6b80');
      btn.cost.setColor(affordable ? '#' + theme.gold.toString(16).padStart(6, '0') : '#80693b');
      btn.stats.setColor(affordable ? '#cfd3e8' : '#5a5e78');
      btn.accent.setFillStyle(roleAccent[btn.role], affordable ? 1 : 0.35);
      // Redraw frame with theme border
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2,
        btn.bg.y - btn.bg.height / 2,
        btn.bg.width,
        btn.bg.height,
        theme,
        affordable,
      );

      const cdRatio = Math.max(0, Math.min(1, p.spawnLockTicks / Hud.SPAWN_LOCK_TICKS));
      btn.cd.setVisible(cdRatio > 0);
      btn.cd.width = Hud.BTN_W * cdRatio;
      btn.cd.height = Hud.BTN_H;
    }

    // Evolve button
    const ageIdx = ['stone', 'medieval', 'modern'].indexOf(p.age);
    const nextAge = ageIdx < 2 ? (['medieval', 'modern'] as const)[ageIdx]! : null;
    // Evolve frame
    this.drawBtnFrame(
      this.evolveBtn.frame,
      this.evolveBtn.bg.x - this.evolveBtn.bg.width / 2,
      this.evolveBtn.bg.y - this.evolveBtn.bg.height / 2,
      this.evolveBtn.bg.width,
      this.evolveBtn.bg.height,
      { ...theme, btnReady: theme.evolveBorder, btnLocked: theme.panelDark, borderGlow: theme.evolveBorder },
      canEvolveNow && !!nextAge,
    );
    if (nextAge) {
      const cost = EVOLVE_COST[nextAge];
      const xpReq = EVOLVE_XP_REQ[nextAge];
      const shortName = nextAge === 'medieval' ? 'MEDIEVAL' : 'MODERN';
      this.evolveBtn.label.setText(`→ ${shortName.slice(0,4)}`);
      this.evolveBtn.cost.setText(`${cost}g ${Math.floor(p.xp)}/${xpReq}xp`);
      const canDo = canEvolveNow;
      this.evolveBtn.bg.setFillStyle(canDo ? theme.evolveBg : theme.panelDark);
      this.evolveBtn.bg.setStrokeStyle(0);
      this.evolveBtn.label.setColor(canDo ? '#ffffff' : '#6b5b82');
      this.evolveBtn.cost.setColor(canDo ? theme.evolveGlow : '#5f4e78');
      this.evolveBtn.bg.setInteractive({ useHandCursor: canDo });
      if (canDo) {
        this.evolveBtn.pulse += 0.08;
        const a = 0.85 + Math.sin(this.evolveBtn.pulse) * 0.15;
        this.evolveBtn.bg.setAlpha(a);
        this.evolveBtn.icon.setAlpha(a);
      } else {
        this.evolveBtn.bg.setAlpha(1);
        this.evolveBtn.icon.setAlpha(0.6);
      }
    } else {
      this.evolveBtn.label.setText('MAX AGE');
      this.evolveBtn.cost.setText('—');
      this.evolveBtn.bg.setFillStyle(theme.panelDark);
      this.evolveBtn.label.setColor('#888');
      this.evolveBtn.cost.setColor('#666');
      this.evolveBtn.icon.setAlpha(0.4);
      this.evolveBtn.bg.disableInteractive();
      this.evolveBtn.bg.setAlpha(1);
    }

    // Upgrade buttons (forge / armor)
    (['forge','armor'] as const).forEach((which) => {
      const btn = this.upgradeBtns[which];
      if (!btn) return;
      const rank = which === 'forge' ? p.forgeRank : p.armorRank;
      const maxed = rank >= MAX_UPGRADE_RANK;
      const costs = which === 'forge' ? FORGE_COSTS : ARMOR_COSTS;
      const cost = maxed ? 0 : costs[p.age][rank]!;
      const accent = which === 'forge' ? 0xef5350 : 0x42a5f5;
      const affordable = !maxed && p.gold >= cost && state.result === 'playing';
      const ready = affordable && !maxed;
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2,
        btn.bg.y - btn.bg.height / 2,
        btn.bg.width,
        btn.bg.height,
        { ...theme, btnReady: accent, btnLocked: theme.panelDark, borderGlow: accent },
        ready,
      );
      btn.bg.setFillStyle(ready ? 0x221418 : theme.panelDark);
      btn.label.setColor(maxed ? '#' + accent.toString(16).padStart(6,'0') : affordable ? '#ffffff' : '#6b6b80');
      btn.cost.setColor(maxed ? '#' + accent.toString(16).padStart(6,'0') : affordable ? '#' + theme.gold.toString(16).padStart(6,'0') : '#80693b');
      btn.cost.setText(maxed ? 'MAX' : `${cost}g`);
      btn.icon.setAlpha(affordable || maxed ? 1 : 0.45);
      btn.bg.setInteractive({ useHandCursor: ready });
      // Pips
      btn.pips.forEach((p_, i) => {
        if (i < rank) p_.setFillStyle(accent);
        else p_.setFillStyle(0x333344);
      });
    });

    // Context subtitle
    if (state.result !== 'playing') {
      this.subtitle.setText(state.result === 'win'
        ? 'VICTORY — timeline secured   ·   SPACE to play again'
        : 'DEFEAT — timeline lost   ·   SPACE to retry');
    } else if (p.spawnLockTicks > 0) {
      this.subtitle.setText('Deploying…   ·   counter the enemy composition');
    } else if (p.xp >= EVOLVE_XP_REQ.medieval && p.age === 'stone') {
      this.subtitle.setText('★ XP ready — press E to advance to the Medieval Age ★');
    } else if (p.xp >= EVOLVE_XP_REQ.modern && p.age === 'medieval') {
      this.subtitle.setText('★ XP ready — press E to advance to the Modern Age ★');
    } else {
      const enemies = state.units.filter((u) => u.side === 'ai' && u.state !== 'die').length;
      if (enemies > 8) this.subtitle.setText('⚠ Enemy massing — build tanks and ranged!');
      else if (enemies === 0) this.subtitle.setText('⚔ Push! The lane is clear — swarm ahead!');
      else this.subtitle.setText(`Deploy units · 1 / 2 / 3   ·   ${AGE_LABEL[p.age]}`);
    }
  }

  showGameOver(result: 'win' | 'loss'): void {
    if (this.gameOverGroup) return;
    const s = this.scene;
    const c = s.add.container(LANE_WIDTH / 2, 130).setDepth(50);

    const bg = s.add.rectangle(0, 0, 520, 180, 0x000000, 0.88).setStrokeStyle(2, result === 'win' ? 0xffd166 : 0xef5350);
    const t1 = s.add.text(0, -44, result === 'win' ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'monospace', fontSize: '36px',
      color: result === 'win' ? '#ffd166' : '#ef5350',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    // Decorative crest (victory laurel or defeat skull)
    const decoKey = result === 'win' ? 'ui_victory' : 'ui_defeat';
    if (s.textures.exists(decoKey)) {
      const img = s.add.image(0, -4, decoKey).setOrigin(0.5);
      img.setScale(0.55);
      c.add(img);
    }
    const t2 = s.add.text(0, 22, result === 'win' ? 'You erased the enemy timeline.' : 'The enemy erased yours.', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const t3 = s.add.text(0, 46, 'Press SPACE or click to play again', {
      fontFamily: 'monospace', fontSize: '12px', color: '#c6c2dc',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);
    c.add([bg, t1, t2, t3]);
    this.gameOverGroup = c;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.onRestartRequest?.());
    // Enter tween
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

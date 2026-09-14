import Phaser from 'phaser';
import type { SimState, UnitRole } from '../sim/types';
import { FORGE_COSTS, ARMOR_COSTS, MAX_UPGRADE_RANK } from '../sim/types';
import {
  AGE_LABEL,
  BASE_HP,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  LANE_HEIGHT,
  LANE_WIDTH,
  ROLE_HOTKEY,
  UNIT_DEFS,
} from '../sim/types';
import { unitKey } from './sprites';
import { colorHex } from './palette';

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
  onRewardedAdRequest?: () => void;

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
        fontFamily: 'monospace', fontSize: '26px', color: '#ffe0b0', fontStyle: 'bold',
        stroke: '#171009', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(10);
    }

    this.subtitle = s.add.text(w / 2, 50, 'Click to begin | 1/2/3 deploy | U/Y upgrade | E evolve | M mute', {
      fontFamily: 'monospace', fontSize: '11px', color: '#b08354',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // Age crest and resource icons are also 2× logical textures.
    this.crest = s.add.image(24, 84, 'crest_stone').setOrigin(0.5, 0.5).setScale(2).setDepth(10);
    this.goldIcon = s.add.image(48, 72, 'icon_gold_stone').setOrigin(0, 0.5).setScale(2).setDepth(10);
    this.xpIcon = s.add.image(48, 90, 'icon_xp_stone').setOrigin(0, 0.5).setScale(2).setDepth(10);
    this.goldText = s.add.text(68, 64, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#f4c85b', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 2,
    }).setDepth(10);
    this.xpText = s.add.text(68, 82, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#b08354',
      stroke: '#171009', strokeThickness: 2,
    }).setDepth(10);
    this.ageText = s.add.text(48, 104, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 2,
    }).setDepth(10);

    // Top-right controls: pause, speed, music
    const btnStyle = { fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#171009', padding: { x: 6, y: 3 } };
    this.musicBtn = s.add.text(w - 16, 66, 'SND', { ...btnStyle, color: '#d9a25e' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.musicBtn.on('pointerdown', () => { this.musicOn = !this.musicOn; this.onToggleMusic?.(); this.updateMusicIcon(); });

    this.speedBtn = s.add.text(w - 70, 66, '> 1x', { ...btnStyle, color: '#ffe0b0' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.speedBtn.on('pointerdown', () => this.onCycleSpeed?.());
    this.speedBtn.on('pointerover', () => this.speedBtn.setStyle({ color: '#f4c85b' }));
    this.speedBtn.on('pointerout', () => this.speedBtn.setStyle({ color: '#ffe0b0' }));

    this.pauseBtn = s.add.text(w - 120, 66, '||', { ...btnStyle, color: '#f4c85b' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', () => this.onTogglePause?.());

    const rewardBtn = s.add.text(w - 152, 66, 'BONUS +100G', { ...btnStyle, color: '#f4c85b', fontStyle: 'bold' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    rewardBtn.on('pointerdown', () => this.onRewardedAdRequest?.());
    rewardBtn.on('pointerover', () => rewardBtn.setStyle({ color: '#ffe0b0' }));
    rewardBtn.on('pointerout', () => rewardBtn.setStyle({ color: '#f4c85b' }));

    // HP bars (framed)
    const barW = Hud.BAR_W, barH = Hud.BAR_H;
    // Player frame
    this.playerHpFrame = s.add.rectangle(128, 116, barW + 4, barH + 4, 0x171009).setOrigin(0, 0.5).setDepth(10);
    this.playerHpFrame.setStrokeStyle(1, 0x8a5a2c);
    s.add.rectangle(130, 116, barW, barH, 0x171009, 0.8).setOrigin(0, 0.5).setDepth(10);
    this.playerHpBar = s.add.rectangle(130, 116, barW, barH, 0xd9a25e).setOrigin(0, 0.5).setDepth(11);
    this.playerHpText = s.add.text(130, 126, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(10);

    // AI frame (right-aligned)
    this.aiHpFrame = s.add.rectangle(w - 128, 116, barW + 4, barH + 4, 0x171009).setOrigin(1, 0.5).setDepth(10);
    this.aiHpFrame.setStrokeStyle(1, 0x8a5a2c);
    s.add.rectangle(w - 130, 116, barW, barH, 0x171009, 0.8).setOrigin(1, 0.5).setDepth(10);
    this.aiHpBar = s.add.rectangle(w - 130, 116, barW, barH, 0x8a5a2c).setOrigin(1, 0.5).setDepth(11);
    this.aiHpText = s.add.text(w - 130, 126, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 2,
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

    // Age-specific logical icons.
    const age = this.currentTheme;
    const crestKey = `crest_${age}`;
    if (this.scene.textures.exists(crestKey)) this.crest.setTexture(crestKey);
    this.crest.setScale(2);
    this.goldIcon.setTexture(`icon_gold_${age}`).setScale(2);
    this.xpIcon.setTexture(`icon_xp_${age}`).setScale(2);
    this.evolveBtn.icon.setTexture(`icon_evolve_${age}`).setScale(2);

    // Resource text colors and age-appropriate text strokes.
    this.goldText.setColor(colorHex(t.gold));
    this.xpText.setColor(colorHex(t.xp));
    this.ageText.setColor(t.accentText);
    this.subtitle.setColor(t.accentText);
    this.subtitle.setAlpha(0.85);
    for (const child of this.scene.children.list) {
      if (child instanceof Phaser.GameObjects.Text) child.setStroke(t.outline, 2);
    }
  }

  private makeSpawnButton(x: number, y: number, w: number, h: number, role: UnitRole): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    // accent strip (tinted per role later)
    const accent = s.add.rectangle(x - w / 2 + 2, y - h / 2 + 2, 4, h - 4, 0xffe0b0).setOrigin(0, 0).setDepth(11);
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    const initKey = unitKey('stone', role);
    const icon = s.add.image(x - w / 2 + 20, y - 6, initKey).setOrigin(0.5).setScale(2).setDepth(12);
    const label = s.add.text(x - w / 2 + 44, y - h / 2 + 6, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const cost = s.add.text(x - w / 2 + 44, y - h / 2 + 22, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const stats = s.add.text(x - w / 2 + 6, y + h / 2 - 12, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#b08354',
      stroke: '#171009', strokeThickness: 1,
    }).setOrigin(0, 0).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, ROLE_HOTKEY[role], {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    const cd = s.add.rectangle(x - w / 2, y - h / 2, 0, h, 0x171009, 0.6).setOrigin(0, 0).setDepth(13).setVisible(false);

    bg.on('pointerdown', () => this.onSpawnRequest?.(role));
    bg.on('pointerover', () => { bg.setFillStyle(0x4d3720); });
    bg.on('pointerout', () => { bg.setFillStyle(0x171009); });

    this.buttons.push({ role, bg, accent, icon, label, cost, hotkey, stats, cd, frame });
  }

  private makeEvolveButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x4d3720).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const icon = s.add.image(x, y - h / 2 + 16, 'icon_evolve_stone').setOrigin(0.5).setScale(2).setDepth(12);
    const label = s.add.text(x, y + 6, 'EVOLVE', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#d9a25e',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, 'E', {
      fontFamily: 'monospace', fontSize: '9px', color: '#d9a25e',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    bg.on('pointerdown', () => this.onEvolveRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x8a5a2c));
    bg.on('pointerout', () => bg.setFillStyle(0x4d3720));
    this.evolveBtn = { bg, icon: icon as Phaser.GameObjects.Image, label, cost, hotkey, frame, pulse: 0 };
  }

  private makeUpgradeButton(x: number, y: number, w: number, h: number, which: 'forge' | 'armor'): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const accent = which === 'forge' ? 0x8a5a2c : 0xd9a25e;
    const bg = s.add.rectangle(x, y, w - 4, h - 4, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const iconChar = which === 'forge' ? 'F' : 'A';
    const icon = s.add.text(x, y - h / 2 + 16, iconChar, {
      fontFamily: 'monospace', fontSize: '20px', color: '#' + accent.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setDepth(12);
    const labelStr = which === 'forge' ? 'FORGE' : 'ARMOR';
    const label = s.add.text(x, y + 6, labelStr, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const hotkeyChar = which === 'forge' ? 'U' : 'Y';
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 4, hotkeyChar, {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(1, 0).setDepth(12);
    // Rank pips (3 dots) above label
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < MAX_UPGRADE_RANK; i++) {
      const px = x - 10 + i * 10;
      const py = y + 17;
      pips.push(s.add.rectangle(px, py, 6, 3, 0x4d3720).setDepth(12).setOrigin(0.5));
    }
    if (which === 'forge') {
      bg.on('pointerdown', () => this.onUpgradeForge?.());
    } else {
      bg.on('pointerdown', () => this.onUpgradeArmor?.());
    }
    bg.on('pointerover', () => bg.setFillStyle(0x4d3720));
    bg.on('pointerout', () => bg.setFillStyle(0x171009));
    this.upgradeBtns[which] = { bg, icon, label, cost, pips, frame, hotkey };
  }

  private updateMusicIcon(): void {
    const theme = THEMES[this.currentTheme];
    this.musicBtn.setText(this.musicOn ? 'SND' : 'MUTE');
    this.musicBtn.setStyle({
      color: this.musicOn ? theme.accentText : colorHex(theme.mid),
      backgroundColor: colorHex(theme.panelDark),
    });
  }
  setMusic(on: boolean): void { this.musicOn = on; this.updateMusicIcon(); }

  setPaused(paused: boolean, speed: number): void {
    this.pauseBtn.setText(paused ? '>' : '||');
    this.speedBtn.setText((paused ? '|| ' : '> ') + speed + 'x');
    if (paused && !this.pauseOverlay) {
      const s = this.scene;
      const c = s.add.container(LANE_WIDTH / 2, LANE_HEIGHT / 2).setDepth(40);
      const theme = THEMES[this.currentTheme];
      const bg = s.add.rectangle(0, 0, 280, 70, theme.panelDark, 0.82).setStrokeStyle(2, theme.gold);
      const t = s.add.text(0, -4, 'PAUSED', {
        fontFamily: 'monospace', fontSize: '24px', color: colorHex(theme.gold), fontStyle: 'bold',
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(0.5);
      const h = s.add.text(0, 20, 'Press P or click || to resume', {
        fontFamily: 'monospace', fontSize: '10px', color: colorHex(theme.body),
        stroke: theme.outline, strokeThickness: 1,
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
    this.ageText.setText(`AGE  ${AGE_LABEL[p.age]}`);

    // HP bars
    const barW = Hud.BAR_W;
    const pRatio = Math.max(0, p.baseHp) / BASE_HP;
    this.playerHpBar.width = barW * pRatio;
    this.playerHpBar.setFillStyle(pRatio < 0.3 ? theme.hpEnemy : pRatio < 0.6 ? theme.gold : theme.hpPlayer);
    this.playerHpText.setText(`YOU       ${Math.max(0, Math.ceil(p.baseHp))} / ${BASE_HP}`);

    const a = state.ai;
    const aRatio = Math.max(0, a.baseHp) / BASE_HP;
    this.aiHpBar.width = barW * aRatio;
    this.aiHpBar.setFillStyle(aRatio < 0.3 ? theme.hpEnemy : aRatio < 0.6 ? theme.gold : theme.hpEnemy);
    this.aiHpText.setText(`${Math.max(0, Math.ceil(a.baseHp))} / ${BASE_HP}       ENEMY`);

    // Role accent colors per role (works across all ages)
    const roleAccent: Record<UnitRole, number> = {
      swarm: theme.xp,
      tank: theme.hpPlayer,
      ranged: theme.hpEnemy,
    };

    for (const btn of this.buttons) {
      const def = UNIT_DEFS[p.age][btn.role];
      const tex = unitKey(p.age, btn.role);
      if (btn.icon.texture.key !== tex && this.scene.textures.exists(tex)) {
        btn.icon.setTexture(tex);
        btn.icon.setScale(2);
      }
      const affordable = p.gold >= def.cost && p.spawnLockTicks === 0 && state.result === 'playing';
      btn.icon.setAlpha(affordable ? 1 : 0.45);
      btn.cost.setText(`${def.cost}g · ${def.label}`);
      btn.label.setText(def.label.toUpperCase());
      btn.stats.setText(`HP ${def.hp}   DMG ${def.damage}   RNG ${Math.round(def.range)}`);

      btn.bg.setFillStyle(affordable ? theme.btnReady : theme.btnLocked);
      btn.label.setColor(affordable ? theme.accentText : colorHex(theme.mid));
      btn.cost.setColor(affordable ? colorHex(theme.gold) : colorHex(theme.edge));
      btn.stats.setColor(affordable ? theme.accentText : colorHex(theme.mid));
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
      this.evolveBtn.label.setColor(canDo ? theme.accentText : colorHex(theme.mid));
      this.evolveBtn.cost.setColor(canDo ? theme.evolveGlow : colorHex(theme.mid));
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
      this.evolveBtn.label.setColor(colorHex(theme.mid));
      this.evolveBtn.cost.setColor(colorHex(theme.mid));
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
      const accent = which === 'forge' ? theme.hpEnemy : theme.hpPlayer;
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
      btn.bg.setFillStyle(ready ? theme.panel : theme.panelDark);
      btn.label.setColor(maxed ? colorHex(accent) : affordable ? theme.accentText : colorHex(theme.mid));
      btn.cost.setColor(maxed ? colorHex(accent) : affordable ? colorHex(theme.gold) : colorHex(theme.edge));
      btn.cost.setText(maxed ? 'MAX' : `${cost}g`);
      btn.icon.setAlpha(affordable || maxed ? 1 : 0.45);
      btn.bg.setInteractive({ useHandCursor: ready });
      // Pips
      btn.pips.forEach((p_, i) => {
        if (i < rank) p_.setFillStyle(accent);
        else p_.setFillStyle(0x4d3720);
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
      this.subtitle.setText('XP READY | press E for Medieval Age');
    } else if (p.xp >= EVOLVE_XP_REQ.modern && p.age === 'medieval') {
      this.subtitle.setText('XP READY | press E for Modern Age');
    } else {
      const enemies = state.units.filter((u) => u.side === 'ai' && u.state !== 'die').length;
      if (enemies > 8) this.subtitle.setText('ALERT | enemy massing - build tanks and ranged');
      else if (enemies === 0) this.subtitle.setText('PUSH | lane clear - send the swarm');
      else this.subtitle.setText(`Deploy units · 1 / 2 / 3   ·   ${AGE_LABEL[p.age]}`);
    }
  }

  showGameOver(result: 'win' | 'loss'): void {
    if (this.gameOverGroup) return;
    const s = this.scene;
    const theme = THEMES[this.currentTheme];
    const c = s.add.container(LANE_WIDTH / 2, 130).setDepth(50);

    const bg = s.add.rectangle(0, 0, 520, 180, theme.panelDark, 0.88)
      .setStrokeStyle(2, result === 'win' ? theme.gold : theme.hpEnemy);
    const t1 = s.add.text(0, -44, result === 'win' ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'monospace', fontSize: '36px',
      color: colorHex(result === 'win' ? theme.gold : theme.hpEnemy),
      fontStyle: 'bold', stroke: theme.outline, strokeThickness: 4,
    }).setOrigin(0.5);
    // Decorative crest (victory laurel or defeat skull)
    const decoKey = `ui_${result === 'win' ? 'victory' : 'defeat'}_${this.currentTheme}`;
    if (s.textures.exists(decoKey)) {
      const img = s.add.image(0, -4, decoKey).setOrigin(0.5);
      img.setScale(1.1);
      c.add(img);
    }
    const t2 = s.add.text(0, 22, result === 'win' ? 'You erased the enemy timeline.' : 'The enemy erased yours.', {
      fontFamily: 'monospace', fontSize: '14px', color: theme.accentText,
      stroke: theme.outline, strokeThickness: 3,
    }).setOrigin(0.5);
    const t3 = s.add.text(0, 46, 'Press SPACE or click to play again', {
      fontFamily: 'monospace', fontSize: '12px', color: colorHex(theme.body),
      stroke: theme.outline, strokeThickness: 2,
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

import Phaser from 'phaser';
import type { SimState, UnitRole } from '../sim/types';
import type { ResultsPayload } from '../campaign';
import {
  AGE_LABEL,
  ARMOR_COSTS,
  TURRET_COSTS,
  BASE_HP,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  FORGE_COSTS,
  LANE_HEIGHT,
  LANE_TOP,
  LANE_WIDTH,
  PLAYER_BASE_X,
  AI_BASE_X,
  MAX_TURRET_RANK,
  MAX_UPGRADE_RANK,
  ROLE_HOTKEY,
  ULT_DEFS,
  ULT_MAX,
  CHRONO_MAX,
  UNIT_DEFS,
} from '../sim/types';
import { colorHex } from './palette';
import { PIXEL_SCALE } from './palette';
import { crazyHasAdblock } from '../crazygames';

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
    hpPlayer: 0x2ecc71, hpEnemy: 0xef5350,
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
    hpPlayer: 0x2ecc71, hpEnemy: 0xef5350,
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
  private towFrame!: Phaser.GameObjects.Rectangle;
  private towBarPlayer!: Phaser.GameObjects.Rectangle;
  private towBarAi!: Phaser.GameObjects.Rectangle;
  private towMarker!: Phaser.GameObjects.Rectangle;
  private topPanel!: Phaser.GameObjects.Graphics;
  private bottomPanel!: Phaser.GameObjects.Graphics;
  private crest!: Phaser.GameObjects.Image;
  private goldIcon!: Phaser.GameObjects.Image;
  private xpIcon!: Phaser.GameObjects.Image;

  onSpawnRequest?: (role: UnitRole) => void;
  onSpawnHover?: (role: UnitRole | null) => void;
  onEvolveRequest?: () => void;
  onUpgradeForge?: () => void;
  onUpgradeArmor?: () => void;
  onRestartRequest?: () => void;
  onToggleMusic?: () => void;
  onTogglePause?: () => void;
  onCycleSpeed?: () => void;
  onRewardedAdRequest?: () => void;
  onReviveRequest?: () => void;
  onToggleFullscreen?: () => void;
  onTurretRequest?: () => void;
  onUltimateRequest?: () => void;
  onChronoSurgeRequest?: () => void;
  onNextStageRequest?: () => void;
  onMenuRequest?: () => void;

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

  private turretBtn!: {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    hotkey: Phaser.GameObjects.Text;
    pips: Phaser.GameObjects.Rectangle[];
    frame: Phaser.GameObjects.Graphics;
  };
  private ultBtn!: {
    bg: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    meter: Phaser.GameObjects.Rectangle;
    meterBg: Phaser.GameObjects.Rectangle;
    hotkey: Phaser.GameObjects.Text;
    frame: Phaser.GameObjects.Graphics;
    pulse: number;
  };
  private chronoBtn!: {
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    statusText: Phaser.GameObjects.Text;
    meter: Phaser.GameObjects.Rectangle;
    meterBg: Phaser.GameObjects.Rectangle;
    hotkey: Phaser.GameObjects.Text;
    frame: Phaser.GameObjects.Graphics;
    pulse: number;
  };
  private collapseBanner!: Phaser.GameObjects.Container;
  private gameOverGroup?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private speedBtn!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Text;
  private bonusBtn!: Phaser.GameObjects.Text;
  private musicOn = true;
  private currentTheme: 'stone' | 'medieval' | 'modern' = 'stone';

  static readonly BAR_W = 180;
  static readonly BAR_H = 14;
  static readonly BTN_W = 124;
  static readonly BTN_H = 66;
  static readonly UPG_BTN_W = 88;
  static readonly EVOLVE_BTN_W = 108;
  static readonly TURRET_BTN_W = 96;
  static readonly ULT_BTN_W = 100;
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
      .setOrigin(1, 0.5).setDepth(10).setStrokeStyle(2, 0x2ecc71);
    this.playerHpBar = s.add.rectangle(w / 2 - 11, 32, barW, barH, 0x2ecc71).setOrigin(1, 0.5).setDepth(11);
    this.playerHpText = s.add.text(w / 2 - 8, 48, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(10);

    this.aiHpFrame = s.add.rectangle(w / 2 + 8, 32, barW + 6, barH + 6, 0x171009, 1)
      .setOrigin(0, 0.5).setDepth(10).setStrokeStyle(2, 0xef5350);
    this.aiHpBar = s.add.rectangle(w / 2 + 11, 32, barW, barH, 0xef5350).setOrigin(0, 0.5).setDepth(11);
    this.aiHpText = s.add.text(w / 2 + 8, 48, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(10);

    // Live tug-of-war front line / momentum bar
    const towW = 140, towH = 4;
    this.towFrame = s.add.rectangle(w / 2, 57, towW + 4, towH + 4, 0x171009, 0.9)
      .setOrigin(0.5, 0.5).setDepth(10).setStrokeStyle(1, 0x4d3720);
    this.towBarPlayer = s.add.rectangle(w / 2 - towW / 2, 57, towW / 2, towH, 0x2ecc71)
      .setOrigin(0, 0.5).setDepth(11);
    this.towBarAi = s.add.rectangle(w / 2, 57, towW / 2, towH, 0xef5350)
      .setOrigin(0, 0.5).setDepth(11);
    this.towMarker = s.add.rectangle(w / 2, 57, 2, towH + 4, 0xffd166)
      .setOrigin(0.5, 0.5).setDepth(12);

    // Controls (top right)
    const btnStyle = { fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#171009', padding: { x: 8, y: 5 } };
    this.bonusBtn = s.add.text(w - 14, 34, 'BONUS +100G', { ...btnStyle, color: '#f4c85b', fontStyle: 'bold' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    this.bonusBtn.on('pointerdown', () => this.onRewardedAdRequest?.());
    this.bonusBtn.on('pointerover', () => this.bonusBtn.setStyle({ color: '#ffe0b0' }));
    this.bonusBtn.on('pointerout', () => this.bonusBtn.setStyle({ color: '#f4c85b' }));
    if (crazyHasAdblock()) this.bonusBtn.setVisible(false);

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

    const fsBtn = s.add.text(w - 180, 10, 'FS', { ...btnStyle, color: '#ffe0b0' })
      .setOrigin(1, 0).setDepth(10).setInteractive({ useHandCursor: true });
    fsBtn.on('pointerdown', () => this.onToggleFullscreen?.());
    fsBtn.on('pointerover', () => fsBtn.setStyle({ color: '#f4c85b' }));
    fsBtn.on('pointerout', () => fsBtn.setStyle({ color: '#ffe0b0' }));

    // Action bar
    const roles: UnitRole[] = ['swarm', 'tank', 'ranged'];
    const btnW = 114, btnH = Hud.BTN_H, upgW = 76;
    const turretW = 84, ultW = 88, chronoW = 92;
    const gap = 5;
    const totalW = btnW * 3 + upgW * 2 + turretW + ultW + chronoW + Hud.EVOLVE_BTN_W + gap * 8;
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
    this.makeTurretButton(x, y, turretW, btnH);
    x += turretW + gap;
    this.makeUltimateButton(x, y, ultW, btnH);
    x += ultW + gap;
    this.makeChronoButton(x, y, chronoW, btnH);
    x += chronoW + gap;
    this.makeEvolveButton(x, y, Hud.EVOLVE_BTN_W, btnH);

    this.subtitle = s.add.text(w / 2, PANEL_Y - 14, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 4,
      backgroundColor: '#171009cc', padding: { x: 12, y: 3 },
    }).setOrigin(0.5).setDepth(15);

    this.makeCollapseBanner();
    this.applyTheme(THEMES.stone);
  }

  /**
   * Warning strip shown when the timeline starts tearing itself apart. The
   * collapse drains both bases, so the player needs to know the clock is now
   * the enemy as much as the lane is.
   */
  private makeCollapseBanner(): void {
    const s = this.scene;
    const c = s.add.container(LANE_WIDTH / 2, LANE_TOP - 26).setDepth(14).setVisible(false);
    const bg = s.add.rectangle(0, 0, 460, 34, 0x171009, 0.82).setStrokeStyle(2, 0xd64a4a);
    const t = s.add.text(0, -6, 'TIMELINE COLLAPSE', {
      fontFamily: 'monospace', fontSize: '15px', color: '#d64a4a', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 4,
    }).setOrigin(0.5);
    const t2 = s.add.text(0, 9, 'both bases are decaying - win the race', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5);
    c.add([bg, t, t2]);
    this.collapseBanner = c;
  }

  /** Show the collapse warning; the second argument dims it once it is old news. */
  setCollapse(active: boolean, justStarted = false): void {
    this.collapseBanner.setVisible(active);
    if (!active) return;
    if (justStarted) {
      this.collapseBanner.setScale(1.3).setAlpha(0);
      this.scene.tweens.add({ targets: this.collapseBanner, scaleX: 1, scaleY: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    }
    this.collapseBanner.setAlpha(0.75 + Math.sin(this.scene.time.now / 220) * 0.25);
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

    const icon = s.add.image(x - w / 2 + 24, y, `portrait_stone_${role}`)
      .setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x - w / 2 + 42, y - h / 2 + 8, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(12);
    const cost = s.add.text(x - w / 2 + 42, y - h / 2 + 23, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(12);
    const stats = s.add.text(x - w / 2 + 8, y + h / 2 - 16, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#b08354',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 7, y - h / 2 + 7, ROLE_HOTKEY[role], {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffd166', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    const cd = s.add.rectangle(x - w / 2 + 3, y - h / 2 + 3, 0, h - 6, 0x171009, 0.62).setOrigin(0, 0).setDepth(13).setVisible(false);

    bg.on('pointerdown', () => this.onSpawnRequest?.(role));
    bg.on('pointerover', () => {
      bg.setFillStyle(0x4d3720);
      this.onSpawnHover?.(role);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x171009);
      this.onSpawnHover?.(null);
    });

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

  /** Base-defence turret: bought once, then upgraded twice, straight from the HUD. */
  private makeTurretButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x4d3720).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const icon = s.add.image(x, y - h / 2 + 22, 'icon_turret_stone').setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x, y + 6, 'TURRET', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const cost = s.add.text(x, y + h / 2 - 18, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#f4c85b',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const hotkey = s.add.text(x + w / 2 - 10, y - h / 2 + 8, 'T', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    const pips: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < MAX_TURRET_RANK; i++) {
      pips.push(s.add.rectangle(x - 12 + i * 12, y + 20, 8, 4, 0x2b1e12).setDepth(12).setOrigin(0.5));
    }
    bg.on('pointerdown', () => this.onTurretRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x8a5a2c));
    bg.on('pointerout', () => bg.setFillStyle(0x4d3720));
    this.turretBtn = { bg, icon, label, cost, hotkey, pips, frame };
  }

  /** Shared ultimate meter: charges with time and kills, fires the age's superweapon. */
  private makeUltimateButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const icon = s.add.image(x, y - h / 2 + 20, 'icon_ult_stone').setOrigin(0.5).setScale(PIXEL_SCALE).setDepth(12);
    const label = s.add.text(x, y + 4, 'METEOR', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0', fontStyle: 'bold',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const meterBg = s.add.rectangle(x, y + h / 2 - 16, w - 20, 7, 0x2b1e12).setOrigin(0.5).setDepth(12);
    const meter = s.add.rectangle(x - (w - 20) / 2, y + h / 2 - 16, w - 20, 7, 0xf4c85b).setOrigin(0, 0.5).setDepth(13);
    const hotkey = s.add.text(x + w / 2 - 10, y - h / 2 + 8, 'SPC', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    bg.on('pointerdown', () => this.onUltimateRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x2b1e12));
    bg.on('pointerout', () => bg.setFillStyle(0x171009));
    this.ultBtn = { bg, icon, label, meter, meterBg, hotkey, frame, pulse: 0 };
  }

  /** Tactical Chrono Surge: triggers time warp stasis on enemies and army haste. */
  private makeChronoButton(x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const frame = s.add.graphics().setDepth(10);
    const bg = s.add.rectangle(x, y, w - 6, h - 6, 0x171009).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    const label = s.add.text(x, y - 8, 'TIME WARP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#38fff0', fontStyle: 'bold',
      stroke: '#050d12', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(12);
    const statusText = s.add.text(x, y + 6, '0%', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffe0b0',
      stroke: '#171009', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(12);
    const meterBg = s.add.rectangle(x, y + h / 2 - 14, w - 16, 5, 0x0a1a20).setOrigin(0.5).setDepth(12);
    const meter = s.add.rectangle(x - (w - 16) / 2, y + h / 2 - 14, 0.001, 5, 0x16c0b3).setOrigin(0, 0.5).setDepth(13);
    const hotkey = s.add.text(x + w / 2 - 8, y - h / 2 + 7, 'Q', {
      fontFamily: 'monospace', fontSize: '10px', color: '#38fff0',
      stroke: '#050d12', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(12);
    bg.on('pointerdown', () => this.onChronoSurgeRequest?.());
    bg.on('pointerover', () => bg.setFillStyle(0x123340));
    bg.on('pointerout', () => bg.setFillStyle(0x171009));
    this.chronoBtn = { bg, label, statusText, meter, meterBg, hotkey, frame, pulse: 0 };
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
      const bg = s.add.rectangle(0, 0, 420, 210, theme.panelDark, 0.95).setStrokeStyle(3, theme.gold);
      const t = s.add.text(0, -72, 'GAME PAUSED', {
        fontFamily: 'monospace', fontSize: '26px', color: colorHex(theme.gold), fontStyle: 'bold',
        stroke: theme.outline, strokeThickness: 5,
      }).setOrigin(0.5);
      const sub = s.add.text(0, -44, 'Progress auto-saved to Cloud & Local Storage', {
        fontFamily: 'monospace', fontSize: '11px', color: '#4ade80',
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(0.5);

      const mkBtn = (y: number, text: string, primary: boolean, onClick: () => void) => {
        const btnBg = s.add.rectangle(0, y, 320, 34, primary ? theme.panel : theme.panelDark, 1)
          .setStrokeStyle(2, primary ? theme.gold : theme.edge)
          .setInteractive({ useHandCursor: true });
        const label = s.add.text(0, y, text, {
          fontFamily: 'monospace', fontSize: '13px', color: primary ? '#f4c85b' : theme.accentText,
          fontStyle: 'bold', stroke: theme.outline, strokeThickness: 3,
        }).setOrigin(0.5);
        btnBg.on('pointerdown', onClick);
        btnBg.on('pointerover', () => btnBg.setFillStyle(primary ? theme.panelLight : theme.panel));
        btnBg.on('pointerout', () => btnBg.setFillStyle(primary ? theme.panel : theme.panelDark));
        return [btnBg, label];
      };

      const resumeBtns = mkBtn(-6, 'RESUME BATTLE (P)', true, () => this.onTogglePause?.());
      const saveLeaveBtns = mkBtn(36, 'SAVE & EXIT TO MAP', false, () => this.onMenuRequest?.());
      const sndBtns = mkBtn(76, this.musicOn ? 'SOUND: ON' : 'SOUND: MUTED', false, () => {
        this.musicOn = !this.musicOn;
        this.onToggleMusic?.();
        this.updateMusicIcon();
        (sndBtns[1] as Phaser.GameObjects.Text).setText(this.musicOn ? 'SOUND: ON' : 'SOUND: MUTED');
      });

      c.add([bg, t, sub, ...resumeBtns, ...saveLeaveBtns, ...sndBtns]);
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

    // Tug-of-war momentum derived from unit combat power & front line positions
    let playerPower = 10;
    let aiPower = 10;
    let maxPlayerX = PLAYER_BASE_X;
    let minAiX = AI_BASE_X;

    for (const u of state.units) {
      if (u.state === 'die') continue;
      const power = u.hp * 0.5 + u.def.damage * 2 + u.def.cost;
      if (u.side === 'player') {
        playerPower += power;
        if (u.x > maxPlayerX) maxPlayerX = u.x;
      } else {
        aiPower += power;
        if (u.x < minAiX) minAiX = u.x;
      }
    }
    const powerRatio = playerPower / (playerPower + aiPower);
    const scrimmageX = (maxPlayerX + minAiX) / 2;
    const posRatio = Phaser.Math.Clamp((scrimmageX - PLAYER_BASE_X) / (AI_BASE_X - PLAYER_BASE_X), 0.05, 0.95);
    const towRatio = Phaser.Math.Clamp(posRatio * 0.5 + powerRatio * 0.5, 0.05, 0.95);

    const towW = 140;
    const splitX = (LANE_WIDTH / 2 - towW / 2) + towW * towRatio;
    this.towBarPlayer.width = towW * towRatio;
    this.towBarAi.x = splitX;
    this.towBarAi.width = towW * (1 - towRatio);
    this.towMarker.x = splitX;
    this.towBarPlayer.setFillStyle(theme.hpPlayer);
    this.towBarAi.setFillStyle(theme.hpEnemy);
    this.towFrame.setStrokeStyle(1, theme.border);

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

    // Turret: buy or upgrade, always at the player's current age.
    {
      const btn = this.turretBtn;
      const maxed = p.turret.rank >= MAX_TURRET_RANK;
      const cost = maxed ? 0 : TURRET_COSTS[p.age][p.turret.rank]!;
      const affordable = !maxed && p.gold >= cost && state.result === 'playing';
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2, btn.bg.y - btn.bg.height / 2,
        btn.bg.width, btn.bg.height,
        { ...theme, btnReady: theme.gold, btnLocked: theme.panelDark, borderGlow: theme.gold },
        affordable || maxed,
      );
      btn.bg.setFillStyle(affordable ? theme.panel : theme.panelDark);
      btn.label.setColor(maxed ? theme.accentText : affordable ? theme.accentText : colorHex(theme.mid));
      btn.label.setText(maxed ? 'TURRET MAX' : p.turret.rank === 0 ? 'TURRET' : `TURRET ${p.turret.rank + 1}`);
      btn.cost.setText(maxed ? 'MAX' : `${cost} G`);
      btn.cost.setColor(maxed ? colorHex(theme.gold) : affordable ? colorHex(theme.gold) : colorHex(theme.edge));
      btn.icon.setTexture(`icon_turret_${p.age}`);
      btn.icon.setAlpha(affordable || maxed || p.turret.rank > 0 ? 1 : 0.5);
      btn.bg.setInteractive({ useHandCursor: affordable });
      btn.pips.forEach((pip, i) => pip.setFillStyle(i < p.turret.rank ? theme.gold : theme.panelLight));
    }

    // Ultimate meter: fills with time and kills.
    {
      const btn = this.ultBtn;
      const def = ULT_DEFS[p.age];
      const full = p.ultCharge >= ULT_MAX;
      const ratio = Math.max(0, Math.min(1, p.ultCharge / ULT_MAX));
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2, btn.bg.y - btn.bg.height / 2,
        btn.bg.width, btn.bg.height,
        { ...theme, btnReady: theme.gold, btnLocked: theme.panelDark, borderGlow: theme.gold },
        full,
      );
      btn.icon.setTexture(`icon_ult_${p.age}`);
      btn.label.setText(def.label.toUpperCase());
      btn.meter.width = Math.max(0.001, (btn.meterBg.width) * ratio);
      btn.meter.setFillStyle(full ? theme.gold : theme.accent);
      btn.bg.setInteractive({ useHandCursor: full });
      if (full) {
        btn.pulse += 0.12;
        const glow = 0.8 + Math.sin(btn.pulse) * 0.2;
        btn.bg.setAlpha(glow);
        btn.icon.setAlpha(glow);
      } else {
        btn.bg.setAlpha(1);
        btn.icon.setAlpha(0.55);
      }
    }

    // Chrono Surge meter: fills with time and combat, activates temporal stasis.
    {
      const btn = this.chronoBtn;
      const charge = p.chronoCharge ?? 0;
      const surgeActive = (state.chronoSurgeTicks ?? 0) > 0;
      const ready = charge >= CHRONO_MAX && !surgeActive;
      const ratio = surgeActive ? (state.chronoSurgeTicks! / 40) : Math.max(0, Math.min(1, charge / CHRONO_MAX));
      this.drawBtnFrame(
        btn.frame,
        btn.bg.x - btn.bg.width / 2, btn.bg.y - btn.bg.height / 2,
        btn.bg.width, btn.bg.height,
        { ...theme, btnReady: 0x38fff0, btnLocked: theme.panelDark, borderGlow: 0x38fff0 },
        ready || surgeActive,
      );
      btn.meter.width = Math.max(0.001, btn.meterBg.width * ratio);
      btn.meter.setFillStyle(surgeActive ? 0xffd166 : ready ? 0x38fff0 : 0x16c0b3);
      btn.statusText.setText(surgeActive ? `${Math.ceil((state.chronoSurgeTicks! * 100) / 1000)}s WARP` : ready ? 'READY!' : `${Math.floor(charge)}%`);
      btn.bg.setInteractive({ useHandCursor: ready });
      if (ready || surgeActive) {
        btn.pulse += 0.12;
        const glow = 0.8 + Math.sin(btn.pulse) * 0.2;
        btn.bg.setAlpha(glow);
      } else {
        btn.bg.setAlpha(1);
      }
    }

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
      if (enemies > 8) this.subtitle.setText('ALERT  |  enemy massing - Q Time Warp / build tanks');
      else if (enemies === 0) this.subtitle.setText('PUSH  |  lane clear - send the swarm');
      else this.subtitle.setText('Deploy 1/2/3 | Q Time Warp | SPC Ult | U forge | Y armor | E evolve');
    }
  }

  /**
   * End-of-match results: star rating, clear time, units spawned and enemies
   * destroyed, plus the two actions that matter (next stage / retry).
   */
  showResults(payload: ResultsPayload, canRevive = false): void {
    if (this.gameOverGroup) return;
    const s = this.scene;
    const theme = THEMES[this.currentTheme];
    const win = payload.result === 'win';
    const c = s.add.container(LANE_WIDTH / 2, 250).setDepth(50);

    const bg = s.add.rectangle(0, 0, 560, 240, theme.panelDark, 0.96)
      .setStrokeStyle(3, win ? theme.gold : theme.borderGlow);
    const t1 = s.add.text(0, -84, win ? 'VICTORY' : 'DEFEAT', {
      fontFamily: 'monospace', fontSize: '36px',
      color: win ? '#f4c85b' : theme.accentText,
      fontStyle: 'bold', stroke: theme.outline, strokeThickness: 6,
    }).setOrigin(0.5);

    // Stars: filled for earned, dim for still to come.
    const stars: Phaser.GameObjects.GameObject[] = [];
    for (let i = 0; i < 3; i++) {
      const earned = i < payload.stars;
      const x = -40 + i * 40;
      const star = s.add.text(x, -46, earned ? '★' : '☆', {
        fontFamily: 'monospace', fontSize: '30px',
        color: earned ? '#f4c85b' : colorHex(theme.mid),
        stroke: theme.outline, strokeThickness: 4,
      }).setOrigin(0.5);
      stars.push(star);
      if (earned) {
        star.setScale(0.4);
        s.tweens.add({
          targets: star,
          scaleX: 1, scaleY: 1,
          delay: 260 + i * 180,
          duration: 320,
          ease: 'Back.easeOut',
        });
      }
    }

    const decoKey = `ui_${win ? 'victory' : 'defeat'}_${this.currentTheme}`;
    if (s.textures.exists(decoKey)) {
      const img = s.add.image(0, -6, decoKey).setOrigin(0.5).setScale(PIXEL_SCALE * 0.8).setAlpha(0.9);
      c.add(img);
    }

    const mm = Math.floor(payload.elapsedMs / 60000);
    const ss = Math.floor((payload.elapsedMs % 60000) / 1000).toString().padStart(2, '0');
    const rows = [
      ['CLEAR TIME', `${mm}:${ss}${payload.isBest ? '  (BEST)' : ''}`],
      ['UNITS SPAWNED', `${payload.unitsSpawned}`],
      ['ENEMIES DESTROYED', `${payload.enemiesDestroyed}`],
      ['UNITS LOST', `${payload.unitsLost}`],
      ['BASE INTEGRITY', `${Math.round(payload.baseHpRatio * 100)}%`],
    ];
    const rowObjs: Phaser.GameObjects.GameObject[] = [];
    rows.forEach(([label, value], i) => {
      const y = 6 + i * 19;
      rowObjs.push(s.add.text(-262, y, label, {
        fontFamily: 'monospace', fontSize: '13px', color: colorHex(theme.mid),
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(0, 0.5));
      rowObjs.push(s.add.text(262, y, value, {
        fontFamily: 'monospace', fontSize: '13px', color: theme.accentText, fontStyle: 'bold',
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(1, 0.5));
    });

    const mkBtn = (x: number, text: string, primary: boolean, onClick: () => void) => {
      const btnBg = s.add.rectangle(x, 96, 168, 38, primary ? theme.panel : theme.panelDark, 1)
        .setStrokeStyle(2, primary ? theme.gold : theme.edge)
        .setInteractive({ useHandCursor: true });
      const label = s.add.text(x, 96, text, {
        fontFamily: 'monospace', fontSize: '15px',
        color: primary ? theme.accentText : colorHex(theme.body),
        fontStyle: 'bold', stroke: theme.outline, strokeThickness: 4,
      }).setOrigin(0.5);
      btnBg.on('pointerdown', onClick);
      btnBg.on('pointerover', () => btnBg.setFillStyle(primary ? theme.panelLight : theme.panel));
      btnBg.on('pointerout', () => btnBg.setFillStyle(primary ? theme.panel : theme.panelDark));
      return [btnBg, label];
    };

    const buttons: Phaser.GameObjects.GameObject[] = [];
    if (payload.hasNextStage && win) {
      buttons.push(...mkBtn(-90, 'NEXT LEVEL', true, () => this.onNextStageRequest?.()));
      buttons.push(...mkBtn(90, 'RETRY', false, () => this.onRestartRequest?.()));
    } else if (win) {
      // Final stage cleared, or an endless run won.
      buttons.push(...mkBtn(-90, 'PLAY AGAIN', true, () => this.onRestartRequest?.()));
      buttons.push(...mkBtn(90, 'STAGE MAP', false, () => this.onMenuRequest?.()));
    } else if (canRevive && this.onReviveRequest) {
      buttons.push(...mkBtn(-90, 'REVIVE (AD)', true, () => this.onReviveRequest?.()));
      buttons.push(...mkBtn(90, 'RETRY', false, () => this.onRestartRequest?.()));
    } else {
      buttons.push(...mkBtn(0, 'RETRY', true, () => this.onRestartRequest?.()));
    }
    const hint = s.add.text(0, 126, win ? 'Press ENTER for the next level' : (canRevive && this.onReviveRequest) ? 'Revive to keep fighting, or RETRY' : 'Press ENTER to retry', {
      fontFamily: 'monospace', fontSize: '11px', color: colorHex(theme.body),
      stroke: theme.outline, strokeThickness: 3,
    }).setOrigin(0.5);

    c.add([bg, t1, ...stars, ...rowObjs, ...buttons, hint]);
    this.gameOverGroup = c;
    c.setScale(0.6).setAlpha(0);
    s.tweens.add({ targets: c, scaleX: 1, scaleY: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
  }

  /** Compact banner used by the campaign for stage titles. */
  announce(text: string, sub = '', ms = 2200): void {
    const s = this.scene;
    const theme = THEMES[this.currentTheme];
    const c = s.add.container(LANE_WIDTH / 2, 168).setDepth(45);
    const banner = s.add.rectangle(0, 0, 520, sub ? 68 : 46, theme.banner, 0.9)
      .setStrokeStyle(2, theme.borderGlow);
    const title = s.add.text(0, sub ? -12 : 0, text, {
      fontFamily: 'monospace', fontSize: '24px', color: theme.accentText,
      fontStyle: 'bold', stroke: theme.outline, strokeThickness: 5,
    }).setOrigin(0.5);
    c.add([banner, title]);
    if (sub) {
      c.add(s.add.text(0, 16, sub, {
        fontFamily: 'monospace', fontSize: '13px', color: colorHex(theme.body),
        stroke: theme.outline, strokeThickness: 3,
      }).setOrigin(0.5));
    }
    c.setAlpha(0).setScale(0.85);
    s.tweens.add({ targets: c, alpha: 1, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    s.tweens.add({
      targets: c, alpha: 0, delay: ms, duration: 300,
      onComplete: () => c.destroy(),
    });
  }

  setBonusButtonVisible(visible: boolean): void {
    if (this.bonusBtn) this.bonusBtn.setVisible(visible);
  }

  resetGameOver(): void {
    if (this.gameOverGroup) { this.gameOverGroup.destroy(); this.gameOverGroup = undefined; }
    if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = undefined; }
    for (const b of this.buttons) b.cd.setVisible(false);
    this.setPaused(false, 1);
  }
}

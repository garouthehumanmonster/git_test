import Phaser from 'phaser';
import {
  type Intent,
  type Projectile,
  type SimState,
  type UnitRole,
  type UnitState,
  AGE_LABEL,
  AI_BASE_X,
  LANE_BOTTOM,
  LANE_CENTER_Y,
  LANE_HEIGHT,
  LANE_TOP,
  LANE_WIDTH,
  PLAYER_BASE_X,
  TICK_MS,
} from '../sim/types';
import { canEvolve, canSpawn, canUpgrade, createInitialState, tick } from '../sim/sim';
import { Hud } from './Hud';
import { ROLE_SIZES, unitKey } from './sprites';
import { audio } from '../audio/audio';
import { voice } from '../audio/voice';
import {
  crazyGameplayStart,
  crazyGameplayStop,
  crazyHappytime,
  crazyShowMidgameAd,
  crazyShowRewardedAd,
} from '../crazygames';

// ---- Art sizing constants (pixels on screen) -----------------------------
// Target heights for each visual element regardless of source texture size.
const UNIT_H: Record<UnitRole, number> = { swarm: 28, tank: 36, ranged: 30 };
const BASE_H = 78; // tower height in pixels on screen
const SHADOW_OFFSET_Y = 2;

interface UnitGfx {
  id: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  chev1: Phaser.GameObjects.Triangle;
  chev2: Phaser.GameObjects.Triangle;
  flashTimer: number;
  halfHeight: number;
  currentVet: number;
}

interface ProjGfx {
  id: number;
  sprite: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Arc;
  color: number;
}

export class GameScene extends Phaser.Scene {
  private sim!: SimState;
  private tickAccumMs = 0;
  private hud!: Hud;
  private lane!: Phaser.GameObjects.Graphics;
  private laneAge: 'stone' | 'medieval' | 'modern' = 'stone';
  private bgImage!: Phaser.GameObjects.Image;
  private playerBase!: Phaser.GameObjects.Image;
  private speedMul = 1;
  private paused = false;
  private aiBase!: Phaser.GameObjects.Image;
  private playerFlag!: Phaser.GameObjects.Image;
  private aiFlag!: Phaser.GameObjects.Image;
  private playerBaseHpBar!: Phaser.GameObjects.Rectangle;
  private aiBaseHpBar!: Phaser.GameObjects.Rectangle;
  private playerBaseFlash = 0;
  private aiBaseFlash = 0;
  private unitGfx = new Map<number, UnitGfx>();
  private projGfx = new Map<number, ProjGfx>();
  private floatingText: Phaser.GameObjects.Text[] = [];
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokePlayer!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeAi!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.Graphics;
  private gameOverHandled = false;
  private audioStarted = false;
  private shakeTime = 0;
  private shakeMag = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private hitStopMs = 0;
  private pendingIntents: Intent[] = [];
  private bgAge: 'stone' | 'medieval' | 'modern' = 'stone';

  constructor() { super('GameScene'); }

  create(): void {
    this.sim = createInitialState(Math.floor(Math.random() * 0xffffffff));
    this.tickAccumMs = 0;
    this.gameOverHandled = false;
    this.pendingIntents = [];

    crazyGameplayStart();
    voice.play('battle_begins', 5000);

    // Solid backdrop so nothing bleeds through as transparent checkers.
    this.cameras.main.setBackgroundColor('#0b0918');

    // Full-canvas solid fill in case the camera bg hasn't painted yet.
    const fill = this.add.rectangle(0, 0, LANE_WIDTH, LANE_HEIGHT, 0x0b0918).setOrigin(0, 0).setDepth(-3);
    void fill;

    // Age-specific background, falling back to generic bg_game then flat color.
    this.bgAge = this.sim.player.age;
    const startBgKey = this.textures.exists(`bg_${this.bgAge}`) ? `bg_${this.bgAge}` : (this.textures.exists('bg_game') ? 'bg_game' : null);
    if (startBgKey) {
      this.bgImage = this.add.image(LANE_WIDTH / 2, LANE_HEIGHT / 2, startBgKey)
        .setDisplaySize(LANE_WIDTH, LANE_HEIGHT).setDepth(-2).setAlpha(0.9);
    } else {
      // Dummy invisible placeholder so field is always assigned.
      this.bgImage = this.add.rectangle(0, 0, 1, 1, 0).setVisible(false).setDepth(-2) as unknown as Phaser.GameObjects.Image;
    }

    this.stars = this.add.graphics();
    this.drawStars();

    this.lane = this.add.graphics();
    this.drawLane(this.sim.player.age);

    // Bases — pick AI art if we have it, else procedural.
    this.playerBase = this.makeBase('player');
    this.aiBase = this.makeBase('ai');

    this.playerFlag = this.add.image(PLAYER_BASE_X + 26, LANE_TOP - 4, 'flag_player').setOrigin(0, 0.5).setDepth(1);
    this.aiFlag = this.add.image(AI_BASE_X - 26, LANE_TOP - 4, 'flag_ai').setOrigin(1, 0.5).setDepth(1).setFlipX(true);

    // World-space HP bars above towers.
    const tbarW = 70, tbarH = 6;
    this.add.rectangle(PLAYER_BASE_X, LANE_TOP - 8, tbarW, tbarH, 0x11111a, 0.9).setOrigin(0.5).setDepth(3);
    this.playerBaseHpBar = this.add.rectangle(PLAYER_BASE_X - tbarW / 2, LANE_TOP - 8, tbarW, tbarH, 0x64b5f6).setOrigin(0, 0.5).setDepth(4);
    this.add.rectangle(PLAYER_BASE_X, LANE_TOP - 8, tbarW, tbarH, 0, 0).setOrigin(0.5).setDepth(5).setStrokeStyle(1, 0x8ab4f8);
    this.add.rectangle(AI_BASE_X, LANE_TOP - 8, tbarW, tbarH, 0x11111a, 0.9).setOrigin(0.5).setDepth(3);
    this.aiBaseHpBar = this.add.rectangle(AI_BASE_X + tbarW / 2, LANE_TOP - 8, tbarW, tbarH, 0xef5350).setOrigin(1, 0.5).setDepth(4);
    this.add.rectangle(AI_BASE_X, LANE_TOP - 8, tbarW, tbarH, 0, 0).setOrigin(0.5).setDepth(5).setStrokeStyle(1, 0xff8a80);

    // Particles
    this.particles = this.add.particles(0, 0, 'particle_circle', {
      lifespan: 320,
      speed: { min: 30, max: 110 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 0,
      emitting: false,
    }).setDepth(6);

    const smoke = (x: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      lifespan: 1500,
      speed: { min: 5, max: 16 },
      scale: { start: 0.8, end: 2 },
      alpha: { start: 0.35, end: 0 },
      gravityY: -14,
      emitting: false,
      tint: 0x5a4a4a,
      angle: { min: 75, max: 105 },
      frequency: 380,
      x,
      y: LANE_TOP + 6,
    });
    this.smokePlayer = this.add.particles(0, 0, 'particle_circle', smoke(PLAYER_BASE_X)).setDepth(2);
    this.smokeAi = this.add.particles(0, 0, 'particle_circle', smoke(AI_BASE_X)).setDepth(2);

    // HUD
    this.hud = new Hud(this);
    this.hud.onSpawnRequest = (role) => this.trySpawn('player', role);
    this.hud.onEvolveRequest = () => this.tryEvolve('player');
    this.hud.onUpgradeForge = () => this.tryUpgrade('forge');
    this.hud.onRestartRequest = () => safeRestart();
    this.hud.onRewardedAdRequest = () => {
      crazyShowRewardedAd(() => {
        this.sim.player.gold += 100;
        voice.play('reinforcements');
        audio.sfxGold();
        this.addFloat(PLAYER_BASE_X + 40, LANE_TOP - 20, '+100g REWARD!', 0xffd166, 60);
      });
    };
    this.hud.onToggleMusic = () => { audio.toggleMusic(); this.hud.setMusic(!audio.musicIsMuted()); };
    this.hud.onTogglePause = () => this.togglePause();
    this.hud.onCycleSpeed = () => this.cycleSpeed();
    this.hud.setMusic(!audio.musicIsMuted());

    const safeRestart = () => crazyShowMidgameAd(() => this.restart());

    // Audio unlock
    const unlock = async () => {
      if (this.audioStarted) return;
      this.audioStarted = true;
      await audio.init();
      audio.setMusicAge(this.sim.player.age);
      audio.startMusic();
      audio.setMusicState('playing');
    };
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);

    // Ensure camera starts at origin (no stale offset from shake state).
    this.cameras.main.setScroll(0, 0);
    this.shakeTime = 0; this.shakeMag = 0; this.shakeOffsetX = 0; this.shakeOffsetY = 0;

    // Keyboard
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const mKey = () => { audio.toggleMusic(); this.hud.setMusic(!audio.musicIsMuted()); };
      if (e.key === 'p' || e.key === 'P' || e.code === 'Escape') { this.togglePause(); return; }
      if (this.sim.result !== 'playing') {
        if (e.code === 'Space' || e.key === 'r' || e.key === 'R') safeRestart();
        else if (e.key === 'm' || e.key === 'M') mKey();
        return;
      }
      if (e.key === '1') this.trySpawn('player', 'swarm');
      else if (e.key === '2') this.trySpawn('player', 'tank');
      else if (e.key === '3') this.trySpawn('player', 'ranged');
      else if (e.key === 'e' || e.key === 'E') this.tryEvolve('player');
      else if (e.key === 'u' || e.key === 'U') this.tryUpgrade('forge');
      else if (e.key === 'y' || e.key === 'Y') this.tryUpgrade('armor');
      else if (e.key === 'm' || e.key === 'M') mKey();
      else if (e.key === ' ') this.cycleSpeed();
    });
  }

  /** Build a base tower image, scaled to BASE_H and positioned on the ground. */
  private makeBase(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = side === 'player' ? this.sim.player.age : this.sim.ai.age;
    const key = this.textures.exists(`base_${age}_${side}`) ? `base_${age}_${side}` : `base_${side}`;
    const img = this.add.image(
      side === 'player' ? PLAYER_BASE_X : AI_BASE_X,
      LANE_BOTTOM - 4, // ground line
      key,
    ).setOrigin(0.5, 1).setDepth(2);
    // Scale to fixed on-screen height regardless of source texture size.
    const src = img.frame;
    if (src) {
      const s = BASE_H / src.realHeight;
      img.setScale(s);
    }
    return img;
  }

  private restart(): void {
    for (const u of this.unitGfx.values()) u.container.destroy();
    this.unitGfx.clear();
    for (const p of this.projGfx.values()) { p.sprite.destroy(); p.trail.destroy(); }
    this.projGfx.clear();
    for (const f of this.floatingText) f.destroy();
    this.floatingText = [];
    this.hud.resetGameOver();
    if (this.audioStarted) audio.setMusicState('playing');
    audio.setTension(0);
    this.paused = false;
    this.speedMul = 1;
    this.scene.restart();
  }

  private trySpawn(side: 'player' | 'ai', role: UnitRole): void {
    if (side === 'player') {
      if (canSpawn(this.sim, 'player', role)) {
        this.pendingIntents.push({ type: 'spawn', side: 'player', role });
        audio.sfxSpawn(this.sim.player.age);
      } else {
        this.hud.shakeButton(role);
        audio.sfxError();
      }
    }
  }

  private tryEvolve(side: 'player' | 'ai'): void {
    if (side === 'player' && canEvolve(this.sim, 'player')) {
      this.pendingIntents.push({ type: 'evolve', side: 'player' });
      audio.sfxEvolve();
    } else if (side === 'player') {
      audio.sfxError();
    }
  }

  private tryUpgrade(which: 'forge' | 'armor'): void {
    if (canUpgrade(this.sim, 'player', which)) {
      this.pendingIntents.push({ type: 'upgrade', side: 'player', which });
      audio.sfxEvolve();
    } else {
      audio.sfxError();
      this.hud.shakeUpgrade(which);
    }
  }

  private togglePause(): void {
    if (this.sim.result !== 'playing') return;
    this.paused = !this.paused;
    audio.sfxClick();
  }

  private cycleSpeed(): void {
    this.speedMul = this.speedMul === 1 ? 2 : this.speedMul === 2 ? 3 : 1;
    audio.sfxClick();
  }

  update(_time: number, deltaMs: number): void {
    if (!this.sim) return;
    if (this.paused) {
      this.cameras.main.setScroll(0, 0);
      this.hud.update(this.sim, canEvolve(this.sim, 'player'));
      this.hud.setPaused(true, this.speedMul);
      return;
    }
    this.hud.setPaused(false, this.speedMul);

    // Apply speed multiplier — scale sim time (but not hit-stop shake math).
    deltaMs *= this.speedMul;

    // Hit-stop: freeze sim ticks for `hitStopMs`, BUT do not mutate the caller's
    // deltaMs (that caused the 2× speed bug before). Instead, only feed the
    // remaining time into tick accum / shake.
    let simDelta = deltaMs;
    let fxDelta = deltaMs;
    if (this.hitStopMs > 0) {
      const consumed = Math.min(deltaMs, this.hitStopMs);
      this.hitStopMs -= consumed;
      simDelta = deltaMs - consumed;
    }

    this.tickAccumMs += simDelta;
    while (this.tickAccumMs >= TICK_MS && this.sim.result === 'playing') {
      tick(this.sim, this.pendingIntents);
      this.pendingIntents = [];
      this.tickAccumMs -= TICK_MS;
      this.drainEvents();
    }

    // Shake (runs even during hit-stop). Always apply scroll so (0,0) is default.
    if (this.shakeTime > 0) {
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeMag * 2;
      this.shakeTime -= fxDelta;
      if (this.shakeTime <= 0) { this.shakeOffsetX = 0; this.shakeOffsetY = 0; this.shakeMag = 0; }
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
    this.cameras.main.setScroll(this.shakeOffsetX, this.shakeOffsetY);

    this.syncUnits();
    this.syncProjectiles();
    this.updateDecor();
    // Redraw lane if age changed
    if (this.sim.player.age !== this.laneAge) this.drawLane(this.sim.player.age);
    this.hud.update(this.sim, canEvolve(this.sim, 'player'));

    if (this.sim.result !== 'playing' && !this.gameOverHandled) {
      this.gameOverHandled = true;
      this.hud.showGameOver(this.sim.result);
      audio.setMusicState(this.sim.result === 'win' ? 'win' : 'lose');
      crazyGameplayStop();
      if (this.sim.result === 'win') {
        audio.sfxVictory();
        voice.play('victory');
        crazyHappytime();
      } else {
        audio.sfxDefeat();
        voice.play('defeat');
      }
      this.shake(400, 10);
    }
  }

  private shake(ms: number, magnitude: number): void {
    this.shakeTime = Math.max(this.shakeTime, ms);
    this.shakeMag = Math.max(this.shakeMag, magnitude);
  }

  // ---------------------------------------------------------------- drawing

  private drawStars(): void {
    const g = this.stars; g.clear();
    // Soft vignette, not a full overlay — per-age backgrounds should show through.
    g.fillStyle(0x05030f, 0.25);
    g.fillRect(0, 0, LANE_WIDTH, LANE_HEIGHT);
    let seed = 12345;
    const rng = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 10000) / 10000; };
    for (let i = 0; i < 110; i++) {
      const x = rng() * LANE_WIDTH;
      const y = rng() * (LANE_TOP + 10);
      const size = rng() * 1.4 + 0.3;
      g.fillStyle(0xffffff, 0.3 + rng() * 0.5);
      g.fillCircle(x, y, size);
    }
    g.fillStyle(0x0a071a, 0.7);
    g.fillRect(0, 0, LANE_WIDTH, 60);
    g.fillStyle(0x0a071a, 0.3);
    g.fillRect(0, LANE_TOP - 12, LANE_WIDTH, 12);
  }

  private drawLane(age: 'stone' | 'medieval' | 'modern'): void {
    this.laneAge = age;
    const g = this.lane; g.clear();
    // Per-age palette for ground/path/edges
    const palettes = {
      stone:    { ground: 0x2a1f13, path: 0x4d3824, edge: 0x7a5a33, center: 0x8a6a40, spawnP: 0x3a5a8a, spawnA: 0x8a3a3a },
      medieval: { ground: 0x17212e, path: 0x2d3f58, edge: 0x527199, center: 0x6f8cbf, spawnP: 0x2a4a8a, spawnA: 0x8a2a2a },
      modern:   { ground: 0x0a181e, path: 0x153039, edge: 0x1f7a76, center: 0x38fff0, spawnP: 0x0e6079, spawnA: 0x7a1a22 },
    } as const;
    const p = palettes[age];
    g.fillStyle(p.ground, 1);
    g.fillRect(0, LANE_TOP, LANE_WIDTH, LANE_BOTTOM - LANE_TOP);
    g.fillStyle(p.path, 1);
    g.fillRect(0, LANE_TOP + 6, LANE_WIDTH, LANE_BOTTOM - LANE_TOP - 12);
    g.lineStyle(2, p.edge, 1);
    g.lineBetween(0, LANE_TOP + 2, LANE_WIDTH, LANE_TOP + 2);
    g.lineBetween(0, LANE_BOTTOM - 2, LANE_WIDTH, LANE_BOTTOM - 2);
    g.lineStyle(1, p.center, 0.4);
    for (let x = 0; x < LANE_WIDTH; x += 20) g.lineBetween(x, LANE_CENTER_Y, x + 10, LANE_CENTER_Y);
    g.fillStyle(p.spawnP, 0.12);
    g.fillRect(0, LANE_TOP, 96, LANE_BOTTOM - LANE_TOP);
    g.fillStyle(p.spawnA, 0.12);
    g.fillRect(LANE_WIDTH - 96, LANE_TOP, 96, LANE_BOTTOM - LANE_TOP);
  }

  // ---------------------------------------------------------------- units

  private syncUnits(): void {
    const seen = new Set<number>();
    for (const u of this.sim.units) {
      seen.add(u.id);
      let g = this.unitGfx.get(u.id);
      if (!g) {
        g = this.createUnitGfx(u);
        this.unitGfx.set(u.id, g);
        this.particles.setParticleTint(u.side === 'player' ? 0x64b5f6 : 0xef5350);
        this.particles.emitParticleAt(u.x, LANE_CENTER_Y + u.yOffset + 4, 8);
      }
      this.updateUnitGfx(g, u);
    }
    for (const [id, g] of this.unitGfx) {
      if (!seen.has(id)) {
        this.tweens.add({
          targets: g.container,
          alpha: 0,
          angle: g.container.angle + (Math.random() * 40 - 20),
          y: g.container.y + 10,
          scaleX: 0.4, scaleY: 0.4,
          duration: 280,
          ease: 'Sine.easeIn',
          onComplete: () => g.container.destroy(),
        });
        this.unitGfx.delete(id);
      }
    }
  }

  private createUnitGfx(u: UnitState): UnitGfx {
    const role = u.def.role;
    const container = this.add.container(u.x, LANE_CENTER_Y + u.yOffset).setDepth(3);
    const key = this.textures.exists(unitKey(u.def.age, role))
      ? unitKey(u.def.age, role)
      : unitKey('stone', 'swarm');
    const sprite = this.add.image(0, 0, key).setFlipX(u.dir === -1).setOrigin(0.5, 1);

    // Compute scale to hit target on-screen height regardless of source texture size.
    const srcH = sprite.frame?.realHeight ?? ROLE_SIZES[role].h;
    const targetH = UNIT_H[role];
    const s = targetH / srcH;
    sprite.setScale(s);

    // Very subtle side tint — just enough to read friend/foe without washing out art.
    if (u.side === 'player') sprite.setTint(0xdcebff);
    else sprite.setTint(0xffe4e4);

    // Shadow on ground
    const shadowW = targetH * 0.9;
    const shadow = this.add.ellipse(0, SHADOW_OFFSET_Y, shadowW, 4, 0x000000, 0.4).setOrigin(0.5, 1);

    // HP bar above the unit
    const hpW = Math.max(18, targetH * 0.9);
    const hpBarBg = this.add.rectangle(0, -targetH - 6, hpW, 3, 0x000000, 0.7).setOrigin(0.5);
    const hpBar = this.add.rectangle(-hpW / 2, -targetH - 6, hpW, 3, u.side === 'player' ? 0x64b5f6 : 0xef5350).setOrigin(0, 0.5);

    // Veterancy chevrons (hidden initially; shown when vet > 0).
    const chevColor = 0xffd166;
    const makeChev = (ox: number) => this.add.triangle(
      ox, -targetH - 10,
      -3, 0, 0, 4, 3, 0,
      chevColor,
    ).setOrigin(0.5).setDepth(5).setVisible(false);
    const chev1 = makeChev(-4);
    const chev2 = makeChev(4);

    container.add([shadow, sprite, hpBarBg, hpBar, chev1, chev2]);
    container.setScale(0.2).setAlpha(0);
    this.tweens.add({
      targets: container,
      scaleX: 1, scaleY: 1, alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    return { id: u.id, container, sprite, shadow, hpBar, hpBarBg, chev1, chev2, flashTimer: 0, halfHeight: targetH, currentVet: 0 };
  }

  private updateUnitGfx(g: UnitGfx, u: UnitState): void {
    // Defensive: rebind texture if age changed
    const expectedKey = unitKey(u.def.age, u.def.role);
    if (g.sprite.texture.key !== expectedKey && this.textures.exists(expectedKey)) {
      g.sprite.setTexture(expectedKey);
      const srcH = g.sprite.frame?.realHeight ?? ROLE_SIZES[u.def.role].h;
      const s = UNIT_H[u.def.role] / srcH;
      g.sprite.setScale(s);
    }

    const targetX = u.x;
    const targetY = LANE_CENTER_Y + u.yOffset;
    g.container.x += (targetX - g.container.x) * 0.4;
    g.container.y += (targetY - g.container.y) * 0.4;

    const walkPhase = (u.ageTicks + u.animSeed * 0.001) * 0.45;
    const h = g.halfHeight;
    if (u.state === 'walk') {
      g.sprite.y = Math.sin(walkPhase) * 1.2 - 1;
      g.sprite.x = 0;
      g.sprite.angle = 0;
      g.container.angle = u.dir * Math.sin(walkPhase) * 2.5;
    } else if (u.state === 'fight') {
      g.sprite.y = 0;
      const atk = 1 - u.cooldown / u.def.attackRate;
      if (u.def.role === 'ranged') {
        g.container.angle = u.dir * -1;
        if (atk < 0.08) { g.sprite.x = -u.dir * 1; g.sprite.angle = u.dir * 4; }
        else if (atk < 0.2)  { g.sprite.x = -u.dir * 2; g.sprite.angle = u.dir * -5; }
        else { g.sprite.x = 0; g.sprite.angle = 0; }
      } else {
        g.container.angle = 0;
        if (atk < 0.14) { g.sprite.x = -u.dir * 1; g.sprite.angle = u.dir * -3; }
        else if (atk < 0.3)  { g.sprite.x = u.dir * 2; g.sprite.angle = u.dir * 4; }
        else { g.sprite.x = 0; g.sprite.angle = 0; }
      }
    } else {
      g.sprite.y = 0; g.sprite.x = 0; g.sprite.angle = 0; g.container.angle = 0;
    }

    if (g.flashTimer > 0) {
      g.flashTimer--;
      g.sprite.setTint(0xffffff);
    } else {
      // Re-apply side tint after flash
      g.sprite.setTint(u.side === 'player' ? 0xdcebff : 0xffe4e4);
    }

    // HP bar — ratio vs current effective max (includes vet and armor upgrades).
    const hpW = Math.max(18, h * 0.9);
    const owner = u.side === 'player' ? this.sim.player : this.sim.ai;
    const effMax = u.def.hp * u.hpMul * (1 + owner.armorRank * 0.15);
    const ratio = Math.max(0, Math.min(1, u.hp / effMax));
    g.hpBar.width = hpW * ratio;
    g.hpBar.x = -hpW / 2;
    if (ratio < 0.3) g.hpBar.setFillStyle(0xef5350);
    else if (ratio < 0.6) g.hpBar.setFillStyle(0xffd166);
    else g.hpBar.setFillStyle(u.side === 'player' ? 0x64b5f6 : 0xef5350);

    // Veterancy chevrons — show & color-shift by rank.
    if (u.vet !== g.currentVet) {
      g.currentVet = u.vet;
      g.chev1.setVisible(u.vet >= 1);
      g.chev2.setVisible(u.vet >= 2);
      const vetColor = u.vet >= 2 ? 0x38fff0 : 0xffd166;
      g.chev1.setFillStyle(vetColor);
      g.chev2.setFillStyle(vetColor);
      // Pop animation on promotion.
      if (u.vet > 0) {
        this.tweens.add({
          targets: [g.chev1, g.chev2],
          scaleX: 1.6, scaleY: 1.6,
          yoyo: true, duration: 180, ease: 'Sine.easeOut',
        });
      }
    }
  }

  private syncProjectiles(): void {
    const seen = new Set<number>();
    for (const p of this.sim.projectiles) {
      seen.add(p.id);
      let g = this.projGfx.get(p.id);
      if (!g) {
        const color = p.side === 'player' ? 0x64b5f6 : 0xef5350;
        const tex = `proj_${p.age}_ranged`;
        const sprite = this.add.image(p.x, p.y, this.textures.exists(tex) ? tex : 'proj_spark').setDepth(4);
        if (p.side === 'ai') sprite.setFlipX(true);
        sprite.setTint(color);
        if (p.age === 'modern') sprite.setBlendMode(Phaser.BlendModes.ADD);
        // Scale projectiles to small on-screen size regardless of source.
        const srcW = sprite.frame?.realWidth ?? 6;
        const targetW = p.age === 'modern' ? 10 : p.age === 'medieval' ? 12 : 6;
        const sp = targetW / Math.max(1, srcW);
        sprite.setScale(sp);
        const trailR = p.age === 'modern' ? 5 : 3;
        const trail = this.add.circle(p.x, p.y, trailR, color, 0.5).setDepth(3);
        g = { id: p.id, sprite, trail, color };
        this.projGfx.set(p.id, g);
      }
      g.sprite.x = p.x; g.sprite.y = p.y;
      const dir = p.side === 'player' ? 1 : -1;
      g.sprite.angle = dir * Math.atan2(p.y - LANE_CENTER_Y, (p.targetX - p.x) * dir + 0.0001) * (180 / Math.PI) * 0.1;
      g.trail.x += (p.x - g.trail.x) * 0.3;
      g.trail.y += (p.y - g.trail.y) * 0.3;
      g.trail.alpha = Math.max(0.1, g.trail.alpha * 0.85);
    }
    for (const [id, g] of this.projGfx) {
      if (!seen.has(id)) {
        this.particles.setParticleTint(g.color);
        this.particles.emitParticleAt(g.sprite.x, g.sprite.y, 6);
        g.sprite.destroy(); g.trail.destroy();
        this.projGfx.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- events

  private lastProjectileCount = 0;

  private drainEvents(): void {
    for (const ev of this.sim.events) {
      if (ev.kind === 'hit') {
        this.addFloat(ev.x, ev.y, `-${ev.damage}`, ev.color, 24);
        this.particles.setParticleTint(ev.color);
        this.particles.emitParticleAt(ev.x, ev.y + 4, 4);
        audio.sfxMeleeHit();
        this.hitStopMs = Math.max(this.hitStopMs, 20);
        this.shake(60, 1.5);
        for (const u of this.sim.units) {
          if (Math.abs(u.x - ev.x) < 6 && u.state !== 'die') {
            const g = this.unitGfx.get(u.id);
            if (g) g.flashTimer = 3;
          }
        }
      } else if (ev.kind === 'baseHit') {
        const bx = ev.side === 'player' ? PLAYER_BASE_X : AI_BASE_X;
        const color = ev.side === 'player' ? 0x64b5f6 : 0xef5350;
        this.addFloat(bx, LANE_TOP + 12, `-${ev.damage}`, color, 22);
        this.particles.setParticleTint(color);
        this.particles.emitParticleAt(bx, LANE_BOTTOM - 20, 8);
        audio.sfxBaseHit();
        this.hitStopMs = Math.max(this.hitStopMs, 50);
        this.shake(150, ev.damage > 20 ? 5 : 3);
        if (ev.side === 'player') this.playerBaseFlash = 8; else this.aiBaseFlash = 8;
      } else if (ev.kind === 'death') {
        this.particles.setParticleTint(ev.color);
        this.particles.emitParticleAt(ev.x, ev.y, 10);
        this.hitStopMs = Math.max(this.hitStopMs, 35);
        this.shake(80, 2);
      } else if (ev.kind === 'gold') {
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 18 : AI_BASE_X - 18,
          LANE_TOP - 2,
          `+${ev.amount}g`,
          0xffd166,
          28,
        );
        if (ev.side === 'player') audio.sfxGold();
      } else if (ev.kind === 'upgrade') {
        const label = ev.which === 'forge' ? 'FORGE' : 'ARMOR';
        const color = ev.which === 'forge' ? 0xef5350 : 0x42a5f5;
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 20 : AI_BASE_X - 20,
          LANE_TOP - 22,
          `↑ ${label} ${'I'.repeat(ev.rank)}`,
          color,
          50,
        );
        if (ev.side === 'player') audio.sfxEvolve();
      } else if (ev.kind === 'evolve') {
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 18 : AI_BASE_X - 18,
          LANE_TOP - 14,
          `↑ ${AGE_LABEL[ev.to]}`,
          0xc7a6ff,
          60,
        );
        if (ev.side === 'player') {
          const nextKey = `base_${ev.to}_player`;
          if (this.textures.exists(nextKey)) {
            this.playerBase.setTexture(nextKey);
            const src = this.playerBase.frame;
            if (src) {
              const s = BASE_H / src.realHeight;
              this.playerBase.setScale(s);
            }
          }
          if (this.textures.exists(`bg_${ev.to}`) && ev.to !== this.bgAge) {
            this.bgAge = ev.to;
            this.tweens.add({
              targets: this.bgImage, alpha: 0, duration: 250,
              onComplete: () => {
                this.bgImage.setTexture(`bg_${ev.to}`);
                this.bgImage.setDisplaySize(LANE_WIDTH, LANE_HEIGHT);
                this.tweens.add({ targets: this.bgImage, alpha: 0.9, duration: 350 });
              },
            });
          }
          audio.setMusicAge(ev.to);
          voice.play(ev.to === 'medieval' ? 'medieval_age' : 'modern_age');
          crazyHappytime();
        } else {
          audio.sfxEvolve();
          const nextKey = `base_${ev.to}_ai`;
          if (this.textures.exists(nextKey)) {
            this.aiBase.setTexture(nextKey);
            const src = this.aiBase.frame;
            if (src) {
              const s = BASE_H / src.realHeight;
              this.aiBase.setScale(s);
            }
          }
        }
      }
    }
    const now = this.sim.projectiles.length;
    if (now > this.lastProjectileCount) {
      for (const p of this.sim.projectiles) {
        if (!this.projGfx.has(p.id)) audio.sfxArrow(p.age);
      }
    }
    this.lastProjectileCount = now;
  }

  private addFloat(x: number, y: number, text: string, color: number, ttl: number): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '11px', color: hex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(8);
    this.floatingText.push(t);
    this.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: ttl * TICK_MS,
      onComplete: () => {
        t.destroy();
        this.floatingText = this.floatingText.filter((f) => f.active);
      },
    });
  }

  // ---------------------------------------------------------------- decor

  private updateDecor(): void {
    const t = this.time.now / 1000;
    this.playerFlag.angle = Math.sin(t * 4) * 8;
    this.aiFlag.angle = Math.sin(t * 4 + Math.PI) * 8;

    const tbarW = 70;
    const pRatio = Math.max(0, this.sim.player.baseHp) / 800;
    this.playerBaseHpBar.width = tbarW * pRatio;
    this.playerBaseHpBar.x = PLAYER_BASE_X - tbarW / 2;
    this.playerBaseHpBar.setFillStyle(pRatio < 0.3 ? 0xef5350 : pRatio < 0.6 ? 0xffd166 : 0x64b5f6);

    const aRatio = Math.max(0, this.sim.ai.baseHp) / 800;
    this.aiBaseHpBar.width = tbarW * aRatio;
    this.aiBaseHpBar.x = AI_BASE_X + tbarW / 2;
    this.aiBaseHpBar.setFillStyle(aRatio < 0.3 ? 0xef5350 : aRatio < 0.6 ? 0xffd166 : 0xef5350);

    const danger = 1 - Math.max(pRatio, aRatio);
    audio.setTension(danger * danger);
    if (pRatio < 0.28 && this.sim.player.baseHp > 0) {
      voice.play('base_low', 14000);
    }

    // Tower tint per damage level
    const towerLook = (img: Phaser.GameObjects.Image, ratio: number, flash: number) => {
      if (flash > 0) img.setTint(0xffffff);
      else if (ratio > 0.6) img.clearTint();
      else if (ratio > 0.3) img.setTint(0xc8a0a0);
      else img.setTint(0x8a4040);
    };
    towerLook(this.playerBase, pRatio, this.playerBaseFlash);
    towerLook(this.aiBase, aRatio, this.aiBaseFlash);

    const pCrit = pRatio < 0.4, pDying = pRatio < 0.15;
    const aCrit = aRatio < 0.4, aDying = aRatio < 0.15;
    if (pCrit && !this.smokePlayer.emitting) this.smokePlayer.start();
    else if (!pCrit && this.smokePlayer.emitting) this.smokePlayer.stop();
    if (pCrit) this.smokePlayer.frequency = pDying ? 160 : 380;
    if (aCrit && !this.smokeAi.emitting) this.smokeAi.start();
    else if (!aCrit && this.smokeAi.emitting) this.smokeAi.stop();
    if (aCrit) this.smokeAi.frequency = aDying ? 160 : 380;

    const pBaseScale = this.playerBase.scale;
    const aBaseScale = this.aiBase.scale;
    if (this.playerBaseFlash > 0) {
      this.playerBase.x = PLAYER_BASE_X + (Math.random() * 2 - 1);
      this.playerBaseFlash--;
    } else this.playerBase.x = PLAYER_BASE_X;
    this.playerBase.y = LANE_BOTTOM - 4;
    this.playerBase.setScale(pBaseScale);
    if (this.aiBaseFlash > 0) {
      this.aiBase.x = AI_BASE_X + (Math.random() * 2 - 1);
      this.aiBaseFlash--;
    } else this.aiBase.x = AI_BASE_X;
    this.aiBase.y = LANE_BOTTOM - 4;
    this.aiBase.setScale(aBaseScale);
  }
}

export type { Projectile };

import Phaser from 'phaser';
import {
  type Intent,
  type SimState,
  type UnitRole,
  type UnitState,
  AGE_LABEL,
  AI_BASE_X,
  BASE_HP,
  LANE_BOTTOM,
  LANE_TOP,
  LANE_WIDTH,
  PLAYER_BASE_X,
  TICK_MS,
} from '../sim/types';
import { canEvolve, canSpawn, canUpgrade, createInitialState, tick } from '../sim/sim';
import { Hud } from './Hud';
import { UNIT_FIT, unitKey } from './unitart';
import { baseKey } from './basearth';
import { PIXEL_SCALE, colorHex, paletteFor } from './palette';
import { Stage, laneGroundY } from './stage';
import { audio } from '../audio/audio';
import { voice } from '../audio/voice';
import {
  crazyGameplayStart,
  crazyGameplayStop,
  crazyHappytime,
  crazyShowMidgameAd,
  crazyShowRewardedAd,
} from '../crazygames';

// ---- Presentation constants ---------------------------------------------
/** On-screen tower height (authored 78px canvas at PIXEL_SCALE). */
const BASE_H = 156;
/** How high above the foot line projectiles fly, so arrows leave the bow. */
const MUZZLE_LIFT = 20;
/** Extra vertical spread so a stacked front line reads as a crowd, not a blob. */
const CROWD_SPREAD = 2.4;
const HIT_FLASH_MS = 60;

const DEPTH = {
  lantern: -6,
  midProp: 5,
  unit: 3,
  projectile: 4,
  particles: 6,
  float: 8,
} as const;

interface UnitGfx {
  id: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  chev1: Phaser.GameObjects.Triangle;
  chev2: Phaser.GameObjects.Triangle;
  flashUntilMs: number;
  currentVet: number;
  dying: boolean;
}

interface ProjGfx {
  id: number;
  sprite: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Arc;
  color: number;
}

export class GameScene extends Phaser.Scene {
  private sim!: SimState;
  private stage!: Stage;
  private hud!: Hud;
  private tickAccumMs = 0;
  private speedMul = 1;
  private paused = false;
  private playerBase!: Phaser.GameObjects.Image;
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
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokePlayer!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeAi!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gameOverHandled = false;
  private rewardInFlight = false;
  private audioStarted = false;
  private shakeTime = 0;
  private shakeMag = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private hitStopMs = 0;
  private pendingIntents: Intent[] = [];
  private parallaxX = 0;
  private parallaxY = 0;
  private lastAge = 'stone';

  constructor() { super('GameScene'); }

  create(): void {
    this.sim = createInitialState(Math.floor(Math.random() * 0xffffffff));
    this.tickAccumMs = 0;
    this.gameOverHandled = false;
    this.pendingIntents = [];
    this.rewardInFlight = false;
    this.paused = false;
    this.speedMul = 1;
    this.playerBaseFlash = 0;
    this.aiBaseFlash = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.hitStopMs = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.unitGfx = new Map();
    this.projGfx = new Map();
    this.floatingText = [];
    this.lastAge = this.sim.player.age;

    crazyGameplayStart();
    voice.play('battle_begins', 5000);

    // Scenery: painted sky band + parallax props + hand-drawn lane terrain.
    this.stage = new Stage(this);
    this.stage.build(this.sim.player.age);

    this.playerBase = this.makeBase('player');
    this.aiBase = this.makeBase('ai');
    this.playerFlag = this.makeFlag('player');
    this.aiFlag = this.makeFlag('ai');
    this.makeTowerHpBars();

    // Particles: battle dust, tower smoke and per-age atmosphere.
    this.dust = this.add.particles(0, 0, 'particle_chunk', {
      lifespan: 420,
      speed: { min: 40, max: 150 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      gravityY: 220,
      alpha: { start: 1, end: 0.2 },
      emitting: false,
    }).setDepth(DEPTH.particles);

    const smoke = (x: number, y: number, tint: number) => ({
      lifespan: 1700,
      speed: { min: 6, max: 20 },
      scale: { start: 1.1, end: 2.6 },
      alpha: { start: 0.4, end: 0 },
      gravityY: -16,
      emitting: false,
      tint,
      angle: { min: 70, max: 110 },
      frequency: 320,
      x,
      y,
    });
    const pal = paletteFor(this.sim.player.age);
    this.smokePlayer = this.add.particles(0, 0, 'particle_puff', smoke(PLAYER_BASE_X, LANE_TOP + 46, pal.panel)).setDepth(DEPTH.particles);
    this.smokeAi = this.add.particles(0, 0, 'particle_puff', smoke(AI_BASE_X, LANE_TOP + 46, pal.panel)).setDepth(DEPTH.particles);

    this.ambient = this.add.particles(0, 0, 'particle_puff', {
      lifespan: 4200,
      speed: { min: 4, max: 14 },
      scale: { start: 0.5, end: 1.6 },
      alpha: { start: 0.16, end: 0 },
      gravityY: -8,
      frequency: 340,
      x: { min: 0, max: LANE_WIDTH },
      y: LANE_BOTTOM,
      tint: pal.body,
      emitting: true,
    }).setDepth(DEPTH.lantern);
    this.applyAmbient(this.sim.player.age);

    // HUD
    this.hud = new Hud(this);
    this.hud.onSpawnRequest = (role) => this.trySpawn('player', role);
    this.hud.onEvolveRequest = () => this.tryEvolve('player');
    this.hud.onUpgradeForge = () => this.tryUpgrade('forge');
    this.hud.onUpgradeArmor = () => this.tryUpgrade('armor');
    this.hud.onRestartRequest = () => safeRestart();
    this.hud.onRewardedAdRequest = () => {
      if (this.rewardInFlight || this.sim.result !== 'playing') return;
      this.rewardInFlight = true;
      crazyShowRewardedAd(
        () => {
          this.rewardInFlight = false;
          this.sim.player.gold += 100;
          voice.play('reinforcements');
          audio.sfxGold();
          this.addFloat(PLAYER_BASE_X + 60, LANE_TOP + 30, '+100G REWARD', paletteFor(this.sim.player.age).highlight, 60);
        },
        () => {
          this.rewardInFlight = false;
          audio.sfxError();
        },
      );
    };
    // The sound control is a master mute, so M and the on-screen control
    // consistently silence music, effects and announcer voice together.
    this.hud.onToggleMusic = () => { this.hud.setMusic(!audio.toggleMute()); };
    this.hud.onTogglePause = () => this.togglePause();
    this.hud.onCycleSpeed = () => this.cycleSpeed();
    this.hud.setMusic(!audio.isMuted());

    const safeRestart = () => crazyShowMidgameAd(() => this.restart());

    // Audio unlock
    const unlock = async () => {
      if (this.audioStarted) return;
      this.audioStarted = true;
      await audio.init();
      audio.setMusicAge(this.sim.player.age);
      audio.setVoiceAge(this.sim.player.age);
      audio.startMusic();
      audio.setMusicState('playing');
    };
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);

    this.cameras.main.setScroll(0, 0);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const mKey = () => { this.hud.setMusic(!audio.toggleMute()); };
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

  private applyAmbient(age: 'stone' | 'medieval' | 'modern'): void {
    const pal = paletteFor(age);
    if (age === 'modern') {
      // Rising embers and smog over the battlefield.
      this.ambient.setConfig({
        lifespan: 3600,
        speed: { min: 8, max: 26 },
        scale: { start: 0.5, end: 0.2 },
        alpha: { start: 0.55, end: 0 },
        gravityY: -22,
        frequency: 260,
        x: { min: 0, max: LANE_WIDTH },
        y: LANE_BOTTOM + 10,
        tint: pal.light,
        emitting: true,
      });
    } else if (age === 'medieval') {
      this.ambient.setConfig({
        lifespan: 5000,
        speed: { min: 3, max: 12 },
        scale: { start: 0.4, end: 1.2 },
        alpha: { start: 0.1, end: 0 },
        gravityY: -4,
        frequency: 420,
        x: { min: 0, max: LANE_WIDTH },
        y: LANE_TOP + 10,
        tint: pal.light,
        emitting: true,
      });
    } else {
      this.ambient.setConfig({
        lifespan: 4200,
        speed: { min: 5, max: 16 },
        scale: { start: 0.6, end: 1.8 },
        alpha: { start: 0.14, end: 0 },
        gravityY: -10,
        frequency: 300,
        x: { min: 0, max: LANE_WIDTH },
        y: LANE_BOTTOM,
        tint: pal.accent,
        emitting: true,
      });
    }
  }

  /** Base tower image: authored canvas displayed at exactly PIXEL_SCALE. */
  private makeBase(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = side === 'player' ? this.sim.player.age : this.sim.ai.age;
    const key = baseKey(age, side);
    const groundY = laneGroundY(side === 'player' ? PLAYER_BASE_X : AI_BASE_X) + 12;
    return this.add.image(side === 'player' ? PLAYER_BASE_X : AI_BASE_X, groundY, key)
      .setOrigin(0.5, 1)
      .setScale(PIXEL_SCALE)
      .setDepth(2);
  }

  private makeFlag(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = this.sim.player.age;
    const x = side === 'player' ? PLAYER_BASE_X + 30 : AI_BASE_X - 30;
    const y = LANE_TOP + 12;
    const img = this.add.image(x, y, `flag_${age}_${side}`)
      .setOrigin(side === 'player' ? 0 : 1, 0.5)
      .setScale(PIXEL_SCALE)
      .setDepth(3.6);
    if (side === 'ai') img.setFlipX(true);
    return img;
  }

  private makeTowerHpBars(): void {
    const pal = paletteFor(this.sim.player.age);
    const barW = 96;
    const barH = 8;
    const y = LANE_TOP + 66;
    this.add.rectangle(PLAYER_BASE_X, y, barW + 4, barH + 4, pal.dark, 0.92)
      .setOrigin(0.5).setDepth(3.4).setStrokeStyle(1, pal.edge);
    this.add.rectangle(PLAYER_BASE_X, y, barW, barH, pal.panel, 1).setOrigin(0.5).setDepth(3.5);
    this.playerBaseHpBar = this.add.rectangle(PLAYER_BASE_X - barW / 2, y, barW, barH, pal.accent).setOrigin(0, 0.5).setDepth(3.6);
    this.add.rectangle(AI_BASE_X, y, barW + 4, barH + 4, pal.dark, 0.92)
      .setOrigin(0.5).setDepth(3.4).setStrokeStyle(1, pal.edge);
    this.add.rectangle(AI_BASE_X, y, barW, barH, pal.panel, 1).setOrigin(0.5).setDepth(3.5);
    this.aiBaseHpBar = this.add.rectangle(AI_BASE_X + barW / 2, y, barW, barH, pal.highlight).setOrigin(1, 0.5).setDepth(3.6);
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
    this.stage.destroy();
    this.scene.restart();
  }

  private trySpawn(side: 'player' | 'ai', role: UnitRole): void {
    if (side !== 'player') return;
    if (canSpawn(this.sim, 'player', role)) {
      this.pendingIntents.push({ type: 'spawn', side: 'player', role });
      audio.sfxSpawn(this.sim.player.age);
    } else {
      this.hud.shakeButton(role);
      audio.sfxError();
    }
  }

  private tryEvolve(side: 'player' | 'ai'): void {
    if (side !== 'player') return;
    if (canEvolve(this.sim, 'player')) {
      this.pendingIntents.push({ type: 'evolve', side: 'player' });
      audio.sfxEvolve();
    } else {
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
    this.stage.update(this.parallaxX, this.parallaxY, deltaMs);
    if (this.paused) {
      this.cameras.main.setScroll(0, 0);
      this.hud.update(this.sim, canEvolve(this.sim, 'player'));
      this.hud.setPaused(true, this.speedMul);
      return;
    }
    this.hud.setPaused(false, this.speedMul);

    deltaMs *= this.speedMul;

    // Hit-stop freezes simulation ticks without ever mutating the loop's delta,
    // which is what previously caused 2x speed to leak into 3x.
    let simDelta = deltaMs;
    const fxDelta = deltaMs;
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

    // Parallax trails the camera, so the shake gives the scenery a little life.
    this.parallaxX += (this.shakeOffsetX - this.parallaxX) * 0.5;
    this.parallaxY += (this.shakeOffsetY - this.parallaxY) * 0.5;

    if (this.sim.player.age !== this.lastAge) this.onAgeChange(this.sim.player.age);

    this.syncUnits();
    this.syncProjectiles();
    this.updateDecor();
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

  /** Player evolved: repaint scenery, sky, towers and atmosphere for the age. */
  private onAgeChange(age: 'stone' | 'medieval' | 'modern'): void {
    this.lastAge = age;
    this.stage.setAge(age);
    this.applyAmbient(age);
    const pal = paletteFor(age);
    if (this.textures.exists(baseKey(age, 'player'))) this.playerBase.setTexture(baseKey(age, 'player'));
    this.playerFlag.setTexture(`flag_${age}_player`);
    this.playerBaseHpBar.setFillStyle(pal.accent);
    const blob = this.add.circle(PLAYER_BASE_X, laneGroundY(PLAYER_BASE_X) + 10, 90, pal.light, 0.45)
      .setDepth(DEPTH.particles);
    this.tweens.add({ targets: blob, scale: 2.2, alpha: 0, duration: 700, onComplete: () => blob.destroy() });
    audio.setMusicAge(age);
    audio.setVoiceAge(age);
    voice.play(age === 'medieval' ? 'medieval_age' : 'modern_age');
  }

  private syncUnits(): void {
    const seen = new Set<number>();
    for (const u of this.sim.units) {
      seen.add(u.id);
      let g = this.unitGfx.get(u.id);
      if (!g) {
        g = this.createUnitGfx(u);
        this.unitGfx.set(u.id, g);
        const unitPalette = paletteFor(u.def.age);
        this.dust.setParticleTint(u.side === 'player' ? unitPalette.accent : unitPalette.highlight);
        this.dust.emitParticleAt(u.x, this.unitGroundY(u) + 2, 6);
      }
      this.updateUnitGfx(g, u);
    }
    for (const [id, g] of this.unitGfx) {
      if (!seen.has(id)) {
        if (!g.dying) {
          g.dying = true;
          const pal = paletteFor(this.sim.player.age);
          this.dust.setParticleTint(pal.highlight);
          this.dust.emitParticleAt(g.container.x, g.container.y + 10, 10);
          this.tweens.add({
            targets: g.container,
            alpha: 0,
            angle: g.container.angle + (Math.random() * 40 - 20),
            y: g.container.y + 12,
            scaleX: 0.4, scaleY: 0.4,
            duration: 280,
            ease: 'Sine.easeIn',
            onComplete: () => g.container.destroy(),
          });
        }
        this.unitGfx.delete(id);
      }
    }
  }

  /** Screen row a unit's feet touch: lane slope + its own lane offset. */
  private unitGroundY(u: UnitState): number {
    const spread = ((u.id * 37) % 9 - 4) * CROWD_SPREAD;
    return laneGroundY(u.x) + u.yOffset * 0.75 + spread;
  }

  private createUnitGfx(u: UnitState): UnitGfx {
    const role = u.def.role;
    const groundY = this.unitGroundY(u);
    const container = this.add.container(u.x, groundY).setDepth(DEPTH.unit);
    const key = unitKey(u.def.age, role, u.side);
    const fit = UNIT_FIT[u.def.age][role];
    const sprite = this.add.image(0, 0, key)
      .setFlipX(u.dir === -1)
      // Origin is the fitted foot row, so the unit stands exactly on the ground
      // line instead of floating above it.
      .setOrigin(0.5, fit.foot / fit.h)
      .setScale(PIXEL_SCALE);
    // Authoring scale is fixed, so a texel is always exactly 2 canvas pixels.
    const unitPalette = paletteFor(u.def.age);

    // Shadow pinned to the foot line, never to the sprite's walk bob.
    const shadowW = Math.max(20, fit.w * 0.7);
    const shadow = this.add.ellipse(0, 0, shadowW, 6, 0x000000, 0.35).setOrigin(0.5, 0.5);

    const hpW = Math.max(20, fit.w * 0.8);
    const hpY = -fit.h * PIXEL_SCALE + 8;
    const hpBarBg = this.add.rectangle(0, hpY, hpW, 5, unitPalette.dark, 0.9).setOrigin(0.5);
    const hpBar = this.add.rectangle(-hpW / 2, hpY, hpW, 5, u.side === 'player' ? unitPalette.accent : unitPalette.highlight).setOrigin(0, 0.5);

    const makeChev = (ox: number) => this.add.triangle(ox, hpY - 12, -4, 0, 0, 5, 4, 0, unitPalette.light)
      .setOrigin(0.5).setVisible(false);
    const chev1 = makeChev(-5);
    const chev2 = makeChev(5);

    container.add([shadow, sprite, hpBarBg, hpBar, chev1, chev2]);
    container.setScale(0.2).setAlpha(0);
    this.tweens.add({
      targets: container,
      scaleX: PIXEL_SCALE, scaleY: PIXEL_SCALE,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    return {
      id: u.id, container, sprite, shadow, hpBar, hpBarBg, chev1, chev2,
      flashUntilMs: 0, currentVet: 0, dying: false,
    };
  }

  private updateUnitGfx(g: UnitGfx, u: UnitState): void {
    const expectedKey = unitKey(u.def.age, u.def.role, u.side);
    if (g.sprite.texture.key !== expectedKey && this.textures.exists(expectedKey)) {
      g.sprite.setTexture(expectedKey);
      g.sprite.setScale(PIXEL_SCALE);
    }
    // The container is scaled during the spawn pop-in, so animated offsets are
    // applied to the children rather than the container.
    const targetX = u.x;
    const targetY = this.unitGroundY(u);
    g.container.x += (targetX - g.container.x) * 0.4;
    g.container.y += (targetY - g.container.y) * 0.4;
    // Depth follows the foot line so overlapping crowds layer correctly.
    g.container.setDepth(DEPTH.unit + (targetY - LANE_TOP) / 4000);

    const walkPhase = (u.ageTicks + u.animSeed * 0.001) * 0.45;
    if (u.state === 'walk') {
      g.sprite.y = Math.sin(walkPhase) * 2 - 2;
      g.sprite.x = 0;
      g.sprite.angle = Math.sin(walkPhase) * 3 * u.dir;
      g.sprite.setScale(PIXEL_SCALE, PIXEL_SCALE * (1 + Math.sin(walkPhase) * 0.02));
    } else if (u.state === 'fight') {
      g.sprite.y = -2;
      const atk = 1 - u.cooldown / u.def.attackRate;
      if (u.def.role === 'ranged') {
        const recoil = atk < 0.12 ? 3 : 0;
        g.sprite.x = -u.dir * recoil;
        g.sprite.angle = recoil ? u.dir * -6 : 0;
      } else if (atk < 0.14) {
        g.sprite.x = -u.dir * 2;
        g.sprite.angle = u.dir * -4;
      } else if (atk < 0.3) {
        g.sprite.x = u.dir * 5;
        g.sprite.angle = u.dir * 6;
      } else {
        g.sprite.x = 0;
        g.sprite.angle = 0;
      }
      g.sprite.setScale(PIXEL_SCALE);
    } else {
      g.sprite.y = -2; g.sprite.x = 0; g.sprite.angle = 0; g.sprite.setScale(PIXEL_SCALE);
    }

    const unitPalette = paletteFor(u.def.age);
    if (this.time.now < g.flashUntilMs) {
      // Time-based flash: exactly 60ms at any render rate, then the art returns.
      g.sprite.setTint(0xffffff);
    } else if (g.sprite.isTinted) {
      g.sprite.clearTint();
    }

    const hpW = Math.max(20, UNIT_FIT[u.def.age][u.def.role].w * 0.8);
    const owner = u.side === 'player' ? this.sim.player : this.sim.ai;
    const effMax = u.def.hp * u.hpMul * (1 + owner.armorRank * 0.15);
    const ratio = Math.max(0, Math.min(1, u.hp / effMax));
    g.hpBar.width = Math.max(0.001, hpW * ratio);
    g.hpBar.x = -hpW / 2;
    if (ratio < 0.3) g.hpBar.setFillStyle(unitPalette.highlight);
    else if (ratio < 0.6) g.hpBar.setFillStyle(unitPalette.accent);
    else g.hpBar.setFillStyle(u.side === 'player' ? unitPalette.body : unitPalette.highlight);
    g.hpBarBg.setVisible(ratio < 1);

    if (u.vet !== g.currentVet) {
      g.currentVet = u.vet;
      g.chev1.setVisible(u.vet >= 1);
      g.chev2.setVisible(u.vet >= 2);
      const vetColor = u.vet >= 2 ? unitPalette.body : unitPalette.light;
      g.chev1.setFillStyle(vetColor);
      g.chev2.setFillStyle(vetColor);
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
        const projectilePalette = paletteFor(p.age);
        const color = p.side === 'player' ? projectilePalette.light : projectilePalette.highlight;
        const tex = `proj_${p.age}_ranged`;
        const sprite = this.add.image(p.x, p.y - MUZZLE_LIFT, this.textures.exists(tex) ? tex : 'proj_spark')
          .setDepth(DEPTH.projectile).setScale(PIXEL_SCALE).setTint(color);
        if (p.side === 'ai') sprite.setFlipX(true);
        const trailR = p.age === 'modern' ? 6 : 4;
        const trail = this.add.circle(p.x, p.y - MUZZLE_LIFT, trailR, color, 0.42).setDepth(DEPTH.projectile - 0.1);
        audio.sfxArrow(p.age);
        g = { id: p.id, sprite, trail, color };
        this.projGfx.set(p.id, g);
      }
      g.sprite.x = p.x;
      g.sprite.y = p.y - MUZZLE_LIFT;
      g.sprite.angle = p.age === 'modern' ? 0 : (p.side === 'player' ? 1 : 179);
      g.trail.x += (p.x - g.trail.x) * 0.3;
      g.trail.y += (p.y - MUZZLE_LIFT - g.trail.y) * 0.3;
      g.trail.alpha = Math.max(0.08, g.trail.alpha * 0.85);
    }
    for (const [id, g] of this.projGfx) {
      if (!seen.has(id)) {
        this.dust.setParticleTint(g.color);
        this.dust.emitParticleAt(g.sprite.x, g.sprite.y, 5);
        g.sprite.destroy(); g.trail.destroy();
        this.projGfx.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- events

  private drainEvents(): void {
    const age = this.sim.player.age;
    const p = paletteFor(age);
    for (const ev of this.sim.events) {
      if (ev.kind === 'hit') {
        this.addFloat(ev.x, ev.y + 4, `-${ev.damage}`, p.highlight, 24);
        this.dust.setParticleTint(p.accent);
        this.dust.emitParticleAt(ev.x, ev.y + 18, 4);
        audio.sfxMeleeHit();
        this.hitStopMs = Math.max(this.hitStopMs, 20);
        this.shake(60, 1.5);
        for (const u of this.sim.units) {
          if (Math.abs(u.x - ev.x) < 8 && u.state !== 'die') {
            const g = this.unitGfx.get(u.id);
            if (g) g.flashUntilMs = this.time.now + HIT_FLASH_MS;
          }
        }
      } else if (ev.kind === 'baseHit') {
        const bx = ev.side === 'player' ? PLAYER_BASE_X : AI_BASE_X;
        const basePalette = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        this.addFloat(bx, LANE_TOP + 40, `-${ev.damage}`, basePalette.highlight, 22);
        this.dust.setParticleTint(basePalette.accent);
        this.dust.emitParticleAt(bx, LANE_BOTTOM - 60, 8);
        audio.sfxBaseHit();
        this.hitStopMs = Math.max(this.hitStopMs, 50);
        this.shake(150, ev.damage > 20 ? 5 : 3);
        if (ev.side === 'player') this.playerBaseFlash = 8; else this.aiBaseFlash = 8;
      } else if (ev.kind === 'death') {
        this.dust.setParticleTint(p.highlight);
        this.dust.emitParticleAt(ev.x, ev.y + 10, 12);
        this.hitStopMs = Math.max(this.hitStopMs, 35);
        this.shake(80, 2);
      } else if (ev.kind === 'gold') {
        const gp = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 46 : AI_BASE_X - 46,
          LANE_TOP + 22,
          `+${ev.amount}G`,
          gp.highlight,
          28,
        );
        if (ev.side === 'player') audio.sfxGold();
      } else if (ev.kind === 'upgrade') {
        const up = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        const label = ev.which === 'forge' ? 'FORGE' : 'ARMOR';
        const color = ev.which === 'forge' ? up.highlight : up.accent;
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 46 : AI_BASE_X - 46,
          LANE_TOP + 4,
          `+ ${label} ${'I'.repeat(ev.rank)}`,
          color,
          50,
        );
        if (ev.side === 'player') audio.sfxEvolve();
      } else if (ev.kind === 'evolve') {
        const ep = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 46 : AI_BASE_X - 46,
          LANE_TOP + 12,
          `+ ${AGE_LABEL[ev.to]}`,
          ep.light,
          60,
        );
        if (ev.side === 'ai') {
          audio.sfxEvolve();
          if (this.textures.exists(baseKey(ev.to, 'ai'))) this.aiBase.setTexture(baseKey(ev.to, 'ai'));
          this.aiFlag.setTexture(`flag_${ev.to}_ai`);
          this.aiFlag.setFlipX(true);
        } else {
          crazyHappytime();
        }
      }
    }
    // Simulation events are a one-frame hand-off to the renderer. Keeping them
    // around made every hit, sound and floating number replay on every tick.
    this.sim.events = this.sim.events.filter((event) => event.kind === 'gameover');
  }

  private addFloat(x: number, y: number, text: string, color: number, ttl: number): void {
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '16px', color: colorHex(color), fontStyle: 'bold',
      stroke: colorHex(paletteFor(this.sim.player.age).dark), strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.float);
    this.floatingText.push(t);
    this.tweens.add({
      targets: t,
      y: y - 26,
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
    this.playerFlag.angle = Math.sin(t * 4) * 7;
    this.aiFlag.angle = Math.sin(t * 4 + Math.PI) * 7;

    const barW = 96;
    const playerPalette = paletteFor(this.sim.player.age);
    const aiPalette = paletteFor(this.sim.ai.age);

    const pRatio = Math.max(0, this.sim.player.baseHp) / BASE_HP;
    this.playerBaseHpBar.width = barW * pRatio;
    this.playerBaseHpBar.x = PLAYER_BASE_X - barW / 2;
    this.playerBaseHpBar.setFillStyle(pRatio < 0.3 ? playerPalette.highlight : pRatio < 0.6 ? playerPalette.accent : playerPalette.body);

    const aRatio = Math.max(0, this.sim.ai.baseHp) / BASE_HP;
    this.aiBaseHpBar.width = barW * aRatio;
    this.aiBaseHpBar.x = AI_BASE_X + barW / 2;
    this.aiBaseHpBar.setFillStyle(aRatio < 0.3 ? aiPalette.highlight : aRatio < 0.6 ? aiPalette.accent : aiPalette.highlight);

    const danger = 1 - Math.max(pRatio, aRatio);
    audio.setTension(danger * danger);
    if (pRatio < 0.28 && this.sim.player.baseHp > 0) voice.play('base_low', 14000);

    const towerLook = (img: Phaser.GameObjects.Image, ratio: number, flash: number, pal: ReturnType<typeof paletteFor>) => {
      if (flash > 0) img.setTint(0xffffff);
      else if (ratio > 0.6) img.clearTint();
      else if (ratio > 0.3) img.setTint(pal.body);
      else img.setTint(pal.mid);
    };
    towerLook(this.playerBase, pRatio, this.playerBaseFlash, playerPalette);
    towerLook(this.aiBase, aRatio, this.aiBaseFlash, aiPalette);

    if (pRatio < 0.4 && !this.smokePlayer.emitting) this.smokePlayer.start();
    else if (pRatio >= 0.4 && this.smokePlayer.emitting) this.smokePlayer.stop();
    if (pRatio < 0.4) this.smokePlayer.frequency = pRatio < 0.15 ? 140 : 320;
    if (aRatio < 0.4 && !this.smokeAi.emitting) this.smokeAi.start();
    else if (aRatio >= 0.4 && this.smokeAi.emitting) this.smokeAi.stop();
    if (aRatio < 0.4) this.smokeAi.frequency = aRatio < 0.15 ? 140 : 320;

    const baseY = laneGroundY(PLAYER_BASE_X) + 12;
    const aiBaseY = laneGroundY(AI_BASE_X) + 12;
    this.playerBase.y = baseY;
    this.aiBase.y = aiBaseY;
    if (this.playerBaseFlash > 0) { this.playerBase.x = PLAYER_BASE_X + (Math.random() * 4 - 2); this.playerBaseFlash--; }
    else this.playerBase.x = PLAYER_BASE_X;
    if (this.aiBaseFlash > 0) { this.aiBase.x = AI_BASE_X + (Math.random() * 4 - 2); this.aiBaseFlash--; }
    else this.aiBase.x = AI_BASE_X;

    this.playerFlag.x = this.playerBase.x + 30;
    this.aiFlag.x = this.aiBase.x - 30;
  }
}

export { BASE_H, LANE_WIDTH };

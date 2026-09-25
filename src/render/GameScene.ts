import Phaser from 'phaser';
import { claimBootKeys, type KeyEvent } from './inputBuffer';
import { dispatchKey, type InputActions, type InputModifiers, type KeyPhase } from './inputActions';
import { countdownSeconds, nextSpeed, secondsFromTicks } from './affordance';
import {
  type Intent,
  type SimState,
  type StrikeKind,
  type UnitRole,
  type UnitState,
  AGE_LABEL,
  AI_BASE_X,
  BASE_HP,
  COLLAPSE_START_TICK,
  LANE_BOTTOM,
  LANE_TOP,
  LANE_WIDTH,
  PLAYER_BASE_X,
  TICK_MS,
  ULT_DEFS,
  UNIT_DEFS,
  collapseRate,
} from '../sim/types';
import { track, getElapsedBucket, getDurationBucket } from '../analytics';
import { isSupplyDropEligible } from '../ads';
import {
  canBuildTurret,
  canCastUltimate,
  canChronoSurge,
  canWarCry,
  canEvolve,
  evolveBlockReason,
  canSpawn,
  canUpgrade,
  createInitialState,
  endReasonLabel,
  reinforceBlockReason,
  reinforceCostFor,
  tick,
} from '../sim/sim';
import { type MatchOutcome, type ResultsPayload, baseHpRatio, recordResult, stageById, starRating, STAGES, saveProgress, loadProgress } from '../campaign';
import { TURRET_FIT, TURRET_SILL, turretKey } from './turretart';
import { Hud } from './Hud';
import { UNIT_FIT, unitKey } from './unitart';
import { animFrameKey, attackFrameKey, attackProgress, combatFrameIndex, deathFrameKey, inStrikeWindow, isIllustratedPose, modelScreenHeight, STRIKE_START, walkFrameIndex } from './unitAnim';
import { BASE_FIT, baseKey } from './basearth';
import { PIXEL_SCALE, paletteFor } from './palette';
import { Stage, laneGroundY } from './stage';
import { audio } from '../audio/audio';
import { voice } from '../audio/voice';
import {
  crazyGameplayStart,
  crazyGameplayStop,
  crazyHappytime,
  crazyHasAdblock,
  crazyShowMidgameAd,
  crazyShowRewardedAd,
} from '../crazygames';
import {
  FloatingTextManager,
  fireTurretTracer,
  renderStrikeVisuals,
  spawnAttackFx,
  spawnCoinPickup,
  STRIKE_SHAKE,
} from './combatFx';
import { coalesceHits, type HitFlash } from './readability';

// ---- Presentation constants ---------------------------------------------
/** How high above the foot line projectiles fly, so arrows leave the bow. */
const MUZZLE_LIFT = 20;
/** Extra vertical spread so a stacked front line reads as a crowd, not a blob. */
const CROWD_SPREAD = 2.4;
const HIT_FLASH_MS = 60;

const DEPTH = {
  lantern: -6,
  turret: 2.5,
  unit: 3,
  projectile: 4,
  midProp: 5,
  particles: 6,
  strike: 7,
  float: 8,
} as const;

/** Victory is savoured: 0.3x for 1.5s before the results card appears. */
const VICTORY_SLOWMO_MUL = 0.3;
const VICTORY_SLOWMO_MS = 1500;

interface UnitGfx {
  id: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  chev1: Phaser.GameObjects.Triangle;
  chev2: Phaser.GameObjects.Triangle;
  forgePip: Phaser.GameObjects.Arc;
  armorPip: Phaser.GameObjects.Arc;
  flashUntilMs: number;
  currentVet: number;
  dying: boolean;
  dir?: number;
  /** Screen-space knockback push from the last hit, in px. */
  knock: number;
  /** Ticks left of the current attack's wind-up, used to time the weapon FX. */
  lastAttackTick: number;
  hovered: boolean;
  wasFull: boolean;
  baseScale: number;
  /** True when this sprite is a generated walk-cycle drawing, not the pixel fallback. */
  illustrated: boolean;
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
  private inputActions!: InputActions;
  /** Set in create(): the ad-wrapped restart that Enter and the results card share. */
  private doRestart!: () => void;
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
  private floatMgr!: FloatingTextManager;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokePlayer!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeAi!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gameOverHandled = false;
  private rewardInFlight = false;
  private revivedThisMatch = false;
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
  private stageId = 1;
  private collapseWarned = false;
  private resultsShown = false;
  private playerTurret!: Phaser.GameObjects.Image;
  private aiTurret!: Phaser.GameObjects.Image;
  private turretRank = { player: 0, ai: 0 };
  private ghostPreview: Phaser.GameObjects.Image | null = null;
  private ghostTimer: ReturnType<typeof setTimeout> | null = null;
  /** Recoil offset in px, decaying, applied on top of the turret's rest pose. */
  private turretKick = { player: 0, ai: 0 };
  private strikeLayer!: Phaser.GameObjects.Container;
  private firstActionLogged = false;
  private supplyDropGranted = false;
  private supplyDropVisible = false;

  private logFirstAction(action: 'spawn' | 'upgrade' | 'turret' | 'ultimate' | 'chrono' | 'rally' | 'reinforce'): void {
    if (this.firstActionLogged) return;
    this.firstActionLogged = true;
    track({
      name: 'first_action',
      action,
      elapsedBucket: getElapsedBucket(secondsFromTicks(this.sim.tick)),
    });
  }

  constructor() { super('GameScene'); }

  /**
   * The campaign hands the scene a stage; the endless skirmish (and the
   * headless tooling) simply omit it.
   */
  init(data?: { stageId?: number }): void {
    this.stageId = data?.stageId ?? 1;
  }

  create(): void {
    // Stage 0 is the endless skirmish: default rules, nothing persisted.
    const stage = this.stageId === 0 ? null : stageById(this.stageId);
    this.sim = createInitialState(Math.floor(Math.random() * 0xffffffff), stage?.rules);
    this.collapseWarned = false;
    this.resultsShown = false;
    this.tickAccumMs = 0;
    this.gameOverHandled = false;
    this.pendingIntents = [];
    this.rewardInFlight = false;
    this.firstActionLogged = false;
    this.supplyDropGranted = false;
    this.supplyDropVisible = false;
    this.paused = false;

    const progress = loadProgress();
    const priorStars = (this.stageId > 0 && progress.stars[this.stageId])
      ? (progress.stars[this.stageId] as 0 | 1 | 2 | 3)
      : 0;
    track({ name: 'stage_start', stageId: this.stageId, priorStars });
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
    this.floatMgr = new FloatingTextManager(this);
    this.lastAge = this.sim.player.age;

    crazyGameplayStart();
    voice.play('battle_begins', 5000);

    // Scenery: painted sky band + parallax props + hand-drawn lane terrain.
    this.stage = new Stage(this);
    this.stage.build(this.sim.player.age);

    this.playerBase = this.makeBase('player');
    this.aiBase = this.makeBase('ai');
    this.strikeLayer = this.add.container(0, 0).setDepth(DEPTH.strike);
    this.playerTurret = this.makeTurret('player');
    this.aiTurret = this.makeTurret('ai');
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

    // Death burst: red chunks that arc away from the falling unit.
    this.burst = this.add.particles(0, 0, 'particle_chunk', {
      lifespan: 520,
      speed: { min: 50, max: 170 },
      angle: { min: 200, max: 340 },
      scale: { start: 1.1, end: 0 },
      gravityY: 320,
      alpha: { start: 1, end: 0 },
      tint: [0xef5350, 0xd64a4a, 0xffe0b0],
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
    this.hud.initStage(this.stageId);
    this.hud.onSpawnRequest = (role) => this.trySpawn('player', role);
    this.hud.onSpawnHover = (role) => {
      if (this.ghostTimer) {
        clearTimeout(this.ghostTimer);
        this.ghostTimer = null;
      }
      if (!role || this.sim.result !== 'playing') {
        if (this.ghostPreview) {
          this.ghostPreview.destroy();
          this.ghostPreview = null;
        }
        return;
      }
      this.ghostTimer = setTimeout(() => {
        if (!this.scene.isActive() || this.sim.result !== 'playing') return;
        if (this.ghostPreview) this.ghostPreview.destroy();
        const spawnX = PLAYER_BASE_X + 46;
        const groundY = laneGroundY(spawnX);
        const key = unitKey(this.sim.player.age, role, 'player');
        const fit = UNIT_FIT[this.sim.player.age][role];
        this.ghostPreview = this.add.image(spawnX, groundY, key)
          .setOrigin(0.5, fit.foot / fit.h)
          .setScale(PIXEL_SCALE)
          .setDepth(DEPTH.unit - 0.2)
          .setAlpha(0.48)
          .setTint(0x53b6ff);
        this.tweens.add({
          targets: this.ghostPreview,
          alpha: { from: 0.3, to: 0.65 },
          duration: 480,
          yoyo: true,
          repeat: -1,
        });
      }, 1000);
    };
    this.hud.onEvolveRequest = () => this.tryEvolve('player');
    this.hud.onUpgradeForge = () => this.tryUpgrade('forge');
    this.hud.onUpgradeArmor = () => this.tryUpgrade('armor');
    this.hud.onRestartRequest = () => safeRestart();
    this.hud.onNextStageRequest = () => this.gotoStage(this.stageId + 1);
    this.hud.onMenuRequest = () => this.toMenu();
    this.hud.onTurretRequest = () => this.tryTurret();
    this.hud.onUltimateRequest = () => this.tryUltimate();
    this.hud.onChronoSurgeRequest = () => this.tryChronoSurge();
    this.hud.onReinforceRequest = () => this.tryReinforce();
    this.hud.onRewardedAdRequest = () => {
      if (this.rewardInFlight || this.sim.result !== 'playing' || this.supplyDropGranted) return;
      this.rewardInFlight = true;
      this.hud.setBonusButtonInFlight(true);
      track({
        name: 'rewarded_offer',
        placement: 'gold',
        result: 'accepted',
      });
      crazyShowRewardedAd(
        () => {
          this.rewardInFlight = false;
          this.hud.setBonusButtonInFlight(false);
          if (!this.scene.isActive()) return;
          this.supplyDropGranted = true;
          this.supplyDropVisible = false;
          this.hud.setBonusButtonVisible(false);
          track({
            name: 'rewarded_offer',
            placement: 'gold',
            result: 'completed',
          });
          this.sim.player.gold += 100;
          voice.play('reinforcements');
          audio.sfxGold();
          this.addFloat(PLAYER_BASE_X + 60, LANE_TOP + 30, '+100G SUPPLY DROP', paletteFor(this.sim.player.age).highlight, 60);
        },
        () => {
          this.rewardInFlight = false;
          this.hud.setBonusButtonInFlight(false);
          if (!this.scene.isActive()) return;
          track({
            name: 'rewarded_offer',
            placement: 'gold',
            result: 'error',
          });
          audio.sfxError();
          this.supplyDropVisible = false;
          this.hud.setBonusButtonVisible(false);
        },
      );
    };
    // The sound control is a master mute, so M and the on-screen control
    // consistently silence music, effects and announcer voice together.
    this.hud.onToggleMusic = () => { this.hud.setMusic(!audio.toggleMute()); };
    this.hud.onTogglePause = () => this.togglePause();
    this.hud.onCycleSpeed = () => this.cycleSpeed();
    this.hud.onToggleFullscreen = () => this.toggleFullscreen();
    this.hud.onReviveRequest = () => this.secondWind();
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

    if (stage) {
      this.hud.announce(stage.name.toUpperCase(), stage.tagline, 2600);
      this.announceStageIntro(stage.rules.playerStartAge, stage.rules.aiStartAge);
    } else {
      this.hud.announce('ENDLESS SKIRMISH', 'hold the lane as long as you can', 2200);
    }

    this.doRestart = safeRestart;
    this.inputActions = {
      togglePause: () => this.togglePause(),
      toggleFullscreen: () => this.toggleFullscreen(),
      spawn: (kind) => this.trySpawn('player', kind),
      evolve: () => this.tryEvolve('player'),
      upgrade: (which) => this.tryUpgrade(which),
      turret: () => this.tryTurret(),
      chronoSurge: () => this.tryChronoSurge(),
      warCry: () => this.tryWarCry(),
      reinforce: () => this.tryReinforce(),
      ultimate: () => this.tryUltimate(),
      cycleSpeed: () => this.cycleSpeed(),
      muteKey: (mods) => this.handleMuteKey(mods),
      resultsAdvance: () => this.resultsAdvance(),
      resultsRestart: () => this.doRestart(),
    };
    // The scene can act on input now: claim the keyboard and replay whatever
    // was typed before it could.
    this.claimKeyboard();
  }

  // ---------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------

  /**
   * Take over the app-wide keyboard and replay anything typed while the boot
   * or menu scene had the floor.
   */
  private claimKeyboard(): void {
    for (const buffered of claimBootKeys((event) => this.runKeyEvent(event))) {
      this.runKeyEvent(buffered);
    }
  }

  shutdown(): void {
    // Release the keyboard so presses between scenes are buffered, not lost.
    claimBootKeys(null);
  }

  private handleMuteKey(mods: InputModifiers): void {
    if (mods.shiftKey) {
      const vMuted = voice.toggleVoice();
      this.hud.announce('VOICE', vMuted ? 'MUTED' : 'ENABLED', 1000);
    } else if (mods.ctrlKey || mods.metaKey) {
      const mMuted = audio.toggleMusic();
      this.hud.announce('MUSIC', mMuted ? 'MUTED' : 'ENABLED', 1000);
    } else {
      this.hud.setMusic(!audio.toggleMute());
    }
  }

  private runKeyEvent(event: KeyEvent): void {
    const phase: KeyPhase = this.sim.result === 'playing' ? 'playing' : 'results';
    dispatchKey(event.key, event.code, phase, this.inputActions, {
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
  }

  private resultsAdvance(): void {
    const cleared = this.sim.result === 'win' || this.sim.result === 'draw';
    if (cleared && this.stageId > 0 && this.stageId < STAGES.length) this.gotoStage(this.stageId + 1);
    else this.doRestart();
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

  /** Screen row of the tower roof line, from the live base image. */
  private towerTopY(side: 'player' | 'ai'): number {
    const img = side === 'player' ? this.playerBase : this.aiBase;
    return img.y - img.displayHeight;
  }

  /** Base tower image: authored canvas displayed at exactly PIXEL_SCALE. */
  private makeBase(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = side === 'player' ? this.sim.player.age : this.sim.ai.age;
    const key = baseKey(age, side);
    const baseFit = BASE_FIT[age][side];
    const groundY = laneGroundY(side === 'player' ? PLAYER_BASE_X : AI_BASE_X) + 12;
    const img = this.add.image(side === 'player' ? PLAYER_BASE_X : AI_BASE_X, groundY, key)
      .setOrigin(0.5, 1)
      .setDepth(2);
    img.setScale((baseFit.h * PIXEL_SCALE) / (img.height || baseFit.h));
    return img;
  }

  /**
   * Base-defence turret. Hidden until bought, then swapped to the age's
   * silhouette on evolution and tilted up as its rank rises. Planted on the
   * tower itself — watch platform, wall-walk or blockhouse roof — at the age's
   * sill height, so the emplacement is part of the tower's architecture.
   */
  private makeTurret(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = side === 'player' ? this.sim.player.age : this.sim.ai.age;
    const x = side === 'player' ? PLAYER_BASE_X + 14 : AI_BASE_X - 14;
    const y = this.towerTopY(side) + TURRET_SILL[age];
    const img = this.add.image(x, y, turretKey(age, side))
      .setOrigin(0.5, 1)
      .setScale(PIXEL_SCALE)
      .setDepth(DEPTH.turret)
      .setVisible(false);
    if (side === 'ai') img.setFlipX(true);
    void TURRET_FIT;
    return img;
  }

  private syncTurret(side: 'player' | 'ai'): void {
    const p = side === 'player' ? this.sim.player : this.sim.ai;
    const img = side === 'player' ? this.playerTurret : this.aiTurret;
    const key = turretKey(p.age, side);
    if (img.texture.key !== key && this.textures.exists(key)) {
      img.setTexture(key);
      img.setScale(PIXEL_SCALE);
    }
    img.setVisible(p.turret.rank > 0);
    if (p.turret.rank === 0) return;
    // Higher ranks sit taller and lean further out over the lane.
    const scale = PIXEL_SCALE * (1 + (p.turret.rank - 1) * 0.06);
    img.setScale(scale, scale);
    if (this.turretRank[side] !== p.turret.rank) {
      this.turretRank[side] = p.turret.rank;
      const bob = this.add.circle(img.x, img.y - 20, 26, paletteFor(p.age).highlight, 0.4).setDepth(DEPTH.particles);
      this.tweens.add({ targets: bob, scale: 1.9, alpha: 0, duration: 380, onComplete: () => bob.destroy() });
    }
    // Lean toward whatever it is tracking, and kick back when it fires.
    const target = p.turret.targetId;
    const enemy = target != null ? this.sim.units.find((u) => u.id === target) : undefined;
    const restX = side === 'player' ? PLAYER_BASE_X + 14 : AI_BASE_X - 14;
    const aim = enemy ? Phaser.Math.Clamp((enemy.x - restX) * 0.4, -26, 26) : 0;
    if (this.turretKick[side] !== 0) {
      this.turretKick[side] *= 0.7;
      if (Math.abs(this.turretKick[side]) < 0.05) this.turretKick[side] = 0;
    }
    img.x = restX + aim * 0.12 - this.turretKick[side] * (side === 'player' ? 1 : -1);
    img.y = this.towerTopY(side) + TURRET_SILL[p.age];
  }

  private announceStageIntro(playerAge: string, aiAge: string): void {
    if (playerAge === aiAge) return;
    this.hud.announce('AGE ADVANTAGE', `the enemy starts in the ${aiAge} age`, 3000);
  }

  /** Buy the turret or upgrade it, straight from the HUD. */
  private tryTurret(): void {
    if (this.sim.result !== 'playing') return;
    this.logFirstAction('turret');
    if (canBuildTurret(this.sim, 'player')) {
      this.pendingIntents.push({ type: 'turret', side: 'player' });
      const rank = this.sim.player.turret.rank + 1;
      audio.sfxEvolve();
      this.hud.announce(rank === 1 ? 'TURRET RAISED' : `TURRET RANK ${rank}`, 'it defends the base', 1200);
    } else {
      audio.sfxError();
    }
  }

  /** Fire the age's superweapon at the enemy cluster. */
  private tryUltimate(): void {
    if (this.sim.result !== 'playing') return;
    this.logFirstAction('ultimate');
    if (!canCastUltimate(this.sim, 'player')) {
      audio.sfxError();
      return;
    }
    this.pendingIntents.push({ type: 'ultimate', side: 'player', x: this.aimUltimateAt() });
  }

  /** Trigger tactical Chrono Surge (Timeline Warp: enemy stasis + army haste). */
  private tryChronoSurge(): void {
    if (this.sim.result !== 'playing') return;
    this.logFirstAction('chrono');
    if (!canChronoSurge(this.sim, 'player')) {
      audio.sfxError();
      return;
    }
    this.pendingIntents.push({ type: 'chronoSurge', side: 'player' });
  }

  /** Trigger tactical War Cry (Commander rally: +25% speed & attack rate). */
  private tryWarCry(): void {
    if (this.sim.result !== 'playing') return;
    this.logFirstAction('rally');
    if (!canWarCry(this.sim, 'player')) {
      const p = this.sim.player;
      if (p.gold < 25) this.hud.announce('WAR CRY LOCKED', 'Requires 25 Gold!', 900);
      else if ((p.rallyCooldown ?? 0) > 0) this.hud.announce('WAR CRY COOLDOWN', `${countdownSeconds(p.rallyCooldown ?? 0)}s left`, 900);
      audio.sfxError();
      return;
    }
    this.pendingIntents.push({ type: 'warCry', side: 'player' });
  }

  /**
   * Buy a reinforcement call-up. Every refusal is explained, because a silent
   * no-op on a 300-gold button reads as a broken button.
   */
  private tryReinforce(): void {
    if (this.sim.result !== 'playing') return;
    this.logFirstAction('reinforce');
    const reason = reinforceBlockReason(this.sim, 'player');
    if (reason) {
      audio.sfxError();
      this.hud.announce('CALL-UP UNAVAILABLE', reason, 1400);
      this.hud.shakeReinforce();
      return;
    }
    this.pendingIntents.push({ type: 'reinforce', side: 'player' });
    const cost = reinforceCostFor(this.sim, 'player');
    audio.sfxEvolve();
    voice.play('reinforcements');
    this.hud.announce('REINFORCEMENTS', `${cost}G committed - squad inbound`, 1500);
  }

  /**
   * Aim point: the densest knot of enemy units in the lane, biased toward the
   * front. Falls back to the mid-lane when the lane is clear.
   */
  private aimUltimateAt(): number {
    const foes = this.sim.units.filter((u) => u.side === 'ai' && u.state !== 'die');
    if (foes.length === 0) return AI_BASE_X - 120;
    let bestX = foes[0]!.x;
    let bestScore = -1;
    for (const cand of foes) {
      let score = 0;
      for (const other of foes) if (Math.abs(other.x - cand.x) < 70) score++;
      if (score > bestScore) { bestScore = score; bestX = cand.x; }
    }
    return bestX;
  }

  private gotoStage(stageId: number): void {
    this.scene.restart({ stageId: Math.min(STAGES.length, Math.max(1, stageId)) });
  }

  /** Back to the campaign map — saves progress and exits cleanly. */
  private toMenu(): void {
    if (this.ghostTimer) { clearTimeout(this.ghostTimer); this.ghostTimer = null; }
    if (this.ghostPreview) { this.ghostPreview.destroy(); this.ghostPreview = null; }
    this.time.timeScale = 1;
    this.speedMul = 1;
    crazyGameplayStop();
    saveProgress(loadProgress());
    this.scene.start('MenuScene');
  }

  private makeFlag(side: 'player' | 'ai'): Phaser.GameObjects.Image {
    const age = this.sim.player.age;
    const x = side === 'player' ? PLAYER_BASE_X + 10 : AI_BASE_X - 10;
    const y = this.towerTopY(side) - 2;
    const img = this.add.image(x, y, `flag_${age}_${side}`)
      .setOrigin(side === 'player' ? 0 : 1, 1)
      .setScale(PIXEL_SCALE)
      .setDepth(3.6);
    if (side === 'ai') img.setFlipX(true);
    return img;
  }

  private makeTowerHpBars(): void {
    // Top HUD already features prominent base integrity meters.
    // Keep zero-sized invisible handles for state/theme updates without mid-air clutter.
    this.playerBaseHpBar = this.add.rectangle(0, 0, 0, 0, 0).setVisible(false);
    this.aiBaseHpBar = this.add.rectangle(0, 0, 0, 0, 0).setVisible(false);
  }

  private restart(): void {
    if (this.ghostTimer) { clearTimeout(this.ghostTimer); this.ghostTimer = null; }
    if (this.ghostPreview) { this.ghostPreview.destroy(); this.ghostPreview = null; }
    this.time.timeScale = 1;
    this.speedMul = 1;
    this.resultsShown = false;
    this.revivedThisMatch = false;
    this.turretRank = { player: 0, ai: 0 };
    this.turretKick = { player: 0, ai: 0 };
    for (const u of this.unitGfx.values()) u.container.destroy();
    this.unitGfx.clear();
    for (const p of this.projGfx.values()) { p.sprite.destroy(); p.trail.destroy(); }
    this.projGfx.clear();
    this.floatMgr.clear();
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
    this.logFirstAction('spawn');
    if (this.ghostTimer) { clearTimeout(this.ghostTimer); this.ghostTimer = null; }
    if (this.ghostPreview) { this.ghostPreview.destroy(); this.ghostPreview = null; }
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
    const blocked = evolveBlockReason(this.sim, 'player');
    if (blocked === null) {
      track({
        name: 'evolve_attempt',
        age: this.sim.player.age,
        outcome: 'success',
        reasonCode: 'none',
      });
      this.pendingIntents.push({ type: 'evolve', side: 'player' });
      audio.sfxEvolve();
      return;
    }
    track({
      name: 'evolve_attempt',
      age: this.sim.player.age,
      outcome: 'blocked',
      reasonCode: blocked.includes('XP') ? 'xp' : blocked.includes('gold') ? 'gold' : blocked.includes('Modern') ? 'max_age' : 'none',
    });
    // Never a silent refusal: E has two gates and the banner used to name one.
    audio.sfxError();
    this.hud.announce('CANNOT EVOLVE', blocked, 1600);
  }

  private tryUpgrade(which: 'forge' | 'armor'): void {
    this.logFirstAction('upgrade');
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
    this.speedMul = nextSpeed(this.speedMul);
    // Push the new multiplier to the chip immediately, so a press replayed
    // during boot is visibly acknowledged before the next update() tick.
    this.hud.setPaused(this.paused, this.speedMul);
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
    this.syncTurret('player');
    this.syncTurret('ai');
    this.updateDecor();
    this.updateMatchClock();

    if (this.sim.result === 'playing') {
      const pAge = this.sim.player.age;
      const minUnitCost = Math.min(
        UNIT_DEFS[pAge].swarm.cost,
        UNIT_DEFS[pAge].ranged.cost,
        UNIT_DEFS[pAge].tank.cost,
      );
      const playerUnitCount = this.sim.units.filter((u) => u.side === 'player' && u.state !== 'die').length;
      const elapsedSec = secondsFromTicks(this.sim.tick);
      const eligible = isSupplyDropEligible({
        gold: this.sim.player.gold,
        minUnitCost,
        livingPlayerUnits: playerUnitCount,
        elapsedSeconds: elapsedSec,
        hasAdblock: crazyHasAdblock(),
        tutorialActive: this.stageId === 1 && elapsedSec < 60,
        alreadyOfferedOrUsed: this.supplyDropGranted,
        matchResult: this.sim.result,
      });
      if (eligible !== this.supplyDropVisible) {
        this.supplyDropVisible = eligible;
        this.hud.setBonusButtonVisible(eligible);
        if (eligible) {
          track({
            name: 'rewarded_offer',
            placement: 'gold',
            result: 'shown',
          });
        }
      }
    }

    this.hud.update(this.sim, canEvolve(this.sim, 'player'));

    if (this.sim.result !== 'playing' && !this.gameOverHandled) {
      this.gameOverHandled = true;
      this.onMatchEnd();
    }
  }

  /**
   * Timeline collapse telegraph: the banner appears the moment the clock
   * passes the collapse tick, so the drain is never a mystery.
   */
  private updateMatchClock(): void {
    if (this.sim.result !== 'playing') return;
    const active = this.sim.tick >= COLLAPSE_START_TICK && collapseRate(this.sim.tick) > 0;
    const justStarted = active && !this.collapseWarned;
    if (justStarted) this.collapseWarned = true;
    this.hud.setCollapse(active, justStarted);
    // A low, constant tremor once the timeline is tearing apart.
    if (active) this.shake(60, 0.6);
  }

  /**
   * Win/lose presentation. A victory plays out in slow motion for 1.5s first —
   * the last push and the fanfare land before the results card covers them.
   */
  private onMatchEnd(): void {
    const win = this.sim.result === 'win';
    const draw = this.sim.result === 'draw';
    audio.setMusicState(win ? 'win' : 'lose');
    crazyGameplayStop();
    if (draw) {
      // A collapse draw is neither a fanfare nor a funeral: the timeline tore
      // itself apart with both commanders still standing.
      audio.sfxCollapse();
      voice.play('collapse');
      this.cameras.main.flash(260, 180, 180, 200, false);
      this.shake(500, 8);
      window.setTimeout(() => {
        if (!this.scene.isActive()) return;
        this.showResults();
      }, 700);
      return;
    }
    if (win) {
      audio.sfxVictory();
      voice.play('victory');
      crazyHappytime();
      this.speedMul = VICTORY_SLOWMO_MUL;
      this.time.timeScale = VICTORY_SLOWMO_MUL;
      this.cameras.main.flash(220, 255, 224, 176, false);
      window.setTimeout(() => {
        if (!this.scene.isActive()) return;
        this.time.timeScale = 1;
        this.speedMul = 1;
        this.showResults();
      }, VICTORY_SLOWMO_MS);
    } else {
      audio.sfxDefeat();
      voice.play('defeat');
      this.shake(400, 10);
      this.showResults();
    }
  }

  /** Turn the finished sim into the campaign's results card. */
  private showResults(): void {
    if (this.resultsShown) return;
    this.resultsShown = true;
    const stats = this.sim.stats;
    const summary = {
      stageId: this.stageId,
      result: (this.sim.result === 'playing' ? 'loss' : this.sim.result) as MatchOutcome,
      // Sim time, not wall clock: speed toggles and pauses must not inflate it.
      elapsedMs: this.sim.tick * TICK_MS,
      unitsSpawned: stats.unitsSpawned.player,
      enemiesDestroyed: stats.kills.player,
      unitsLost: stats.unitsLost.player,
      baseHpRatio: baseHpRatio(Math.max(0, this.sim.player.baseHp)),
      // Honest one-liner: "Collapse tiebreak: base damage", never a fake base kill.
      reason: endReasonLabel(this.sim),
    };
    const payload: ResultsPayload = this.stageId === 0
      ? { ...summary, stars: starRating(summary.result, summary.baseHpRatio), isBest: false, hasNextStage: false }
      : recordResult(summary);
    // A draw was not a defeat, so there is nothing to revive from.
    const canRevive = this.sim.result === 'loss' && !this.revivedThisMatch && !crazyHasAdblock();
    if (canRevive) {
      track({
        name: 'rewarded_offer',
        placement: 'revive',
        result: 'shown',
      });
    }
    const outcome: 'win' | 'loss' | 'draw' | 'timeout' =
      summary.result === 'win' || summary.result === 'draw' ? summary.result : 'loss';
    const elapsedSeconds = secondsFromTicks(this.sim.tick);
    track({
      name: 'match_end',
      stageId: this.stageId,
      outcome,
      durationBucket: getDurationBucket(elapsedSeconds),
      ageReached: this.sim.player.age,
      stars: (payload.stars >= 0 && payload.stars <= 3 ? payload.stars : 0) as 0 | 1 | 2 | 3,
    });
    this.hud.showResults(payload, canRevive);
  }

  private secondWind(): void {
    if (this.revivedThisMatch) return;
    track({
      name: 'rewarded_offer',
      placement: 'revive',
      result: 'accepted',
    });
    crazyShowRewardedAd(
      () => {
        if (!this.scene.isActive()) return;
        track({
          name: 'rewarded_offer',
          placement: 'revive',
          result: 'completed',
        });
        this.revivedThisMatch = true;
        this.sim.result = 'playing';
        // The previous verdict no longer applies; the match decides again.
        this.sim.endReason = undefined;
        this.sim.endHpSnapshot = undefined;
        this.sim.player.baseHp = Math.floor(BASE_HP * 0.35);
        this.resultsShown = false;
        this.hud.resetGameOver();
        crazyGameplayStart();
        audio.setMusicState('playing');
        audio.sfxEvolve();
        voice.play('reinforcements');
        this.addFloat(PLAYER_BASE_X + 60, LANE_TOP + 30, 'SECOND WIND! +35% HP', paletteFor(this.sim.player.age).highlight, 60);
      },
      () => {
        if (!this.scene.isActive()) return;
        track({
          name: 'rewarded_offer',
          placement: 'revive',
          result: 'error',
        });
        audio.sfxError();
      },
    );
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
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
    if (this.textures.exists(baseKey(age, 'player'))) {
      this.playerBase.setTexture(baseKey(age, 'player'));
      const baseFit = BASE_FIT[age].player;
      this.playerBase.setScale((baseFit.h * PIXEL_SCALE) / (this.playerBase.height || baseFit.h));
    }
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
          g.hpBar.setVisible(false);
          g.hpBarBg.setVisible(false);
          g.chev1.setVisible(false);
          g.chev2.setVisible(false);
          g.forgePip.setVisible(false);
          g.armorPip.setVisible(false);
          this.burst.emitParticleAt(g.container.x, g.container.y - 8, 16);
          this.tweens.killTweensOf(g.container);
          this.tweens.killTweensOf(g.sprite);
          if (g.illustrated) {
            // A painted figure is not a sticker. Spinning the container and
            // squashing it smears the face. Drop the fallen plate, if it
            // loaded, and let the body settle on the foot line.
            const dieKey = deathFrameKey(g.sprite.texture.key);
            if (this.textures.exists(dieKey)) {
              g.sprite.setTexture(dieKey);
              g.sprite.setOrigin(0.5, 1);
              g.sprite.setScale(g.baseScale);
              this.textures.get(dieKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
            }
            g.sprite.angle = 0;
            g.container.angle = 0;
            this.tweens.add({
              targets: g.sprite,
              y: 1,
              duration: 180,
              ease: 'Quad.easeOut',
            });
            this.tweens.add({
              targets: g.container,
              alpha: 0,
              duration: 420,
              delay: 200,
              ease: 'Quad.easeIn',
              onComplete: () => g.container.destroy(),
            });
          } else {
            const dir = g.dir || 1;
            this.tweens.add({
              targets: g.container,
              x: g.container.x - dir * 16,
              y: g.container.y - 12,
              angle: -dir * 75,
              duration: 160,
              ease: 'Cubic.easeOut',
              onComplete: () => {
                this.dust.emitParticleAt(g.container.x, g.container.y + 4, 6);
                this.tweens.add({
                  targets: g.container,
                  alpha: 0,
                  y: g.container.y + 14,
                  scaleX: 0.8,
                  scaleY: 0.35,
                  duration: 220,
                  ease: 'Quad.easeIn',
                  onComplete: () => g.container.destroy(),
                });
              },
            });
          }
        }
        this.unitGfx.delete(id);
      }
    }
  }

  /**
   * Screen row a unit's feet touch: lane slope + its lane slot.
   *
   * The sim's 48px corridor is drawn at full scale. Squeezing it to 0.75 put
   * five ranks inside 36 screen pixels while the sprites are 52-60px tall, so a
   * queued column painted over itself into one slab of outlined rectangles.
   */
  private unitGroundY(u: UnitState): number {
    const spread = ((u.id * 37) % 9 - 4) * CROWD_SPREAD;
    return laneGroundY(u.x) + u.yOffset + spread;
  }

  private createUnitGfx(u: UnitState): UnitGfx {
    const role = u.def.role;
    const groundY = this.unitGroundY(u);
    const container = this.add.container(u.x, groundY).setDepth(DEPTH.unit);
    const key = unitKey(u.def.age, role, u.side);
    const idleAnim = animFrameKey(key, 0);
    const illustrated = this.textures.exists(idleAnim);
    const textureKey = illustrated ? idleAnim : key;
    const fit = UNIT_FIT[u.def.age][role];
    const sprite = this.add.image(0, 0, textureKey)
      .setFlipX(u.dir === -1)
      .setOrigin(0.5, 1);
    const srcH = sprite.height || 1;
    const targetH = illustrated
      ? modelScreenHeight(role, sprite.width || srcH, srcH)
      : fit.h * PIXEL_SCALE;
    const unitScale = targetH / srcH;
    sprite.setScale(unitScale);
    if (illustrated) this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    // Authoring scale is fixed, so a texel is always exactly 2 canvas pixels.
    const unitPalette = paletteFor(u.def.age);

    // Shadow pinned to the foot line, never to the sprite's walk bob.
    const shadowW = Math.max(20, (sprite.displayWidth || fit.w * PIXEL_SCALE) * 0.65);
    const shadow = this.add.ellipse(0, 0, shadowW, 5 * PIXEL_SCALE, 0x000000, 0.35).setOrigin(0.5, 0.5);

    const hpW = Math.max(24, (sprite.displayWidth || fit.w * PIXEL_SCALE) * 0.75);
    const hpY = -targetH - 6;
    const hpBarBg = this.add.rectangle(0, hpY, hpW, 5, unitPalette.dark, 0.9).setOrigin(0.5);
    const hpBar = this.add.rectangle(-hpW / 2, hpY, hpW, 5, u.side === 'player' ? unitPalette.accent : unitPalette.highlight).setOrigin(0, 0.5);

    const makeChev = (ox: number) => this.add.triangle(ox, hpY - 10, -4, 0, 0, 5, 4, 0, unitPalette.light)
      .setOrigin(0.5).setVisible(false);
    const chev1 = makeChev(-5);
    const chev2 = makeChev(5);
    const forgePip = this.add.circle(hpW / 2 + 5, hpY, 2.5, 0xf4c85b).setOrigin(0.5).setVisible(false);
    const armorPip = this.add.circle(-hpW / 2 - 5, hpY, 2.5, 0x38fff0).setOrigin(0.5).setVisible(false);

    container.add([shadow, sprite, hpBarBg, hpBar, chev1, chev2, forgePip, armorPip]);
    container.setScale(0.2).setAlpha(0);
    this.tweens.add({
      targets: container,
      scaleX: 1, scaleY: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    // Health bars appear only when a unit is hurt or the player inspects it.
    const hitW = Math.max(fit.w * PIXEL_SCALE, sprite.displayWidth);
    container.setInteractive(new Phaser.Geom.Rectangle(-hitW * 0.5, -targetH, hitW, targetH + 4), Phaser.Geom.Rectangle.Contains);
    const g: UnitGfx = {
      id: u.id, container, sprite, shadow, hpBar, hpBarBg, chev1, chev2, forgePip, armorPip,
      flashUntilMs: 0, currentVet: 0, dying: false, knock: 0, lastAttackTick: u.cooldown,
      hovered: false, wasFull: true, baseScale: unitScale, illustrated,
    };
    container.on('pointerover', () => { g.hovered = true; });
    container.on('pointerout', () => { g.hovered = false; });
    container.on('pointerdown', () => {
      const cp = paletteFor(u.def.age);
      this.addFloat(u.x, LANE_TOP + 60, `${AGE_LABEL[u.def.age]} ${u.def.role.toUpperCase()}`, cp.light, 30);
    });
    return g;
  }

  /**
   * Walk-cycle drawings face right. The enemy side is the same set, mirrored,
   * with team cloth already shifted to red in the atlas.
   */
  private poseTextureKey(u: UnitState): string {
    const base = unitKey(u.def.age, u.def.role, u.side);
    if (!this.textures.exists(animFrameKey(base, 0))) return base;
    let frame = 0;
    if (u.state === 'fight') {
      const progress = attackProgress(u.cooldown, u.def.attackRate);
      // The strike plate is the hit. Walk drawings cover the wind-up and recovery.
      if (inStrikeWindow(progress)) {
        const strike = attackFrameKey(base);
        if (this.textures.exists(strike)) return strike;
      }
      frame = combatFrameIndex(progress);
    } else if (u.state === 'walk' && !u.reserve) {
      frame = walkFrameIndex(u.ageTicks, u.animSeed);
    } else if (this.sim.result !== 'playing') {
      frame = walkFrameIndex(Math.floor(this.time.now / 50), u.animSeed);
    }
    const key = animFrameKey(base, frame);
    return this.textures.exists(key) ? key : base;
  }

  /**
   * The drawing already has a stride. Squash-and-stretch on top of it turns
   * a face into a smear, so illustrated units only hop, lunge and breathe.
   */
  private poseIllustrated(g: UnitGfx, u: UnitState): void {
    g.sprite.setScale(g.baseScale);
    g.sprite.angle = 0;
    g.sprite.x = 0;
    g.sprite.y = -2;
    if (this.sim.result !== 'playing') {
      const winner = (this.sim.result === 'win' && u.side === 'player')
        || (this.sim.result === 'loss' && u.side === 'ai');
      if (winner) {
        const hop = Math.max(0, Math.sin(this.time.now * 0.008 + u.animSeed * 0.01));
        g.sprite.y = -2 - hop * 6;
      } else {
        g.sprite.y = 3;
        g.sprite.angle = u.dir * -10;
      }
      return;
    }
    if (u.state === 'walk' && u.reserve) {
      g.sprite.y = -2 + Math.sin(this.time.now * 0.003 + u.animSeed) * 1.1;
    } else if (u.state === 'walk') {
      const hop = Math.abs(Math.sin((u.ageTicks + u.animSeed * 0.001) * 0.48));
      g.sprite.y = -2 - hop * 2.5;
    } else if (u.state === 'fight') {
      const atk = attackProgress(u.cooldown, u.def.attackRate);
      const strike = inStrikeWindow(atk);
      g.sprite.x = strike ? u.dir * 8 : -u.dir * 2;
      g.sprite.y = strike ? 0 : -3;
      if (atk < STRIKE_START + 0.09 && atk > STRIKE_START) {
        const kind = u.def.role === 'ranged' ? 'muzzle' : u.def.role === 'tank' ? 'shock' : 'slash';
        this.spawnAttackFx(u, kind);
      }
    }
  }

  private updateUnitGfx(g: UnitGfx, u: UnitState): void {
    const poseKey = this.poseTextureKey(u);
    if (g.sprite.texture.key !== poseKey && this.textures.exists(poseKey)) {
      g.sprite.setTexture(poseKey);
      g.sprite.setOrigin(0.5, 1);
      const srcH = g.sprite.height || 1;
      // `_atk` does not contain `_w`. Missing it used to drop the unit back
      // onto the procedural squash for the exact frame the hit lands.
      const illustrated = isIllustratedPose(poseKey);
      const keepScale = g.illustrated && illustrated;
      g.illustrated = illustrated;
      if (!keepScale) {
        const targetH = illustrated
          ? modelScreenHeight(u.def.role, g.sprite.width || srcH, srcH)
          : UNIT_FIT[u.def.age][u.def.role].h * PIXEL_SCALE;
        g.baseScale = targetH / srcH;
      }
      g.sprite.setScale(g.baseScale);
      if (g.illustrated) this.textures.get(poseKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    // The container is scaled during the spawn pop-in, so animated offsets are
    // applied to the children rather than the container.
    const targetX = u.x + g.knock;
    const targetY = this.unitGroundY(u);
    g.container.x += (targetX - g.container.x) * 0.4;
    g.container.y += (targetY - g.container.y) * 0.4;
    // Depth follows the foot line so lower units draw in front of higher ones.
    g.container.setDepth(DEPTH.unit + (targetY - LANE_TOP) / 4000);

    // Micro knockback decays back to the unit's true position.
    if (g.knock !== 0) {
      g.knock *= 0.72;
      if (Math.abs(g.knock) < 0.05) g.knock = 0;
    }

    g.dir = u.dir;
    g.sprite.setFlipX(u.dir === -1);

    if (g.illustrated) {
      this.poseIllustrated(g, u);
    } else if (this.sim.result !== 'playing') {
      const isWinner = (this.sim.result === 'win' && u.side === 'player') || (this.sim.result === 'loss' && u.side === 'ai');
      if (isWinner) {
        // Joyous victory hopping & cheering
        const cheerPhase = (this.time.now * 0.008 + u.animSeed * 0.01) % (Math.PI * 2);
        const cheerHop = Math.max(0, Math.sin(cheerPhase));
        g.sprite.y = -2 - cheerHop * 10;
        g.sprite.x = 0;
        g.sprite.angle = Math.sin(cheerPhase) * 10;
        g.sprite.setScale(g.baseScale * (1 - cheerHop * 0.08), g.baseScale * (1 + cheerHop * 0.15));
      } else {
        // Dejected defeat slump
        g.sprite.y = 4;
        g.sprite.x = 0;
        g.sprite.angle = u.dir * -24;
        g.sprite.setScale(g.baseScale * 1.05, g.baseScale * 0.85);
      }
    } else if (u.state === 'walk') {
      if (u.reserve) {
        // Reserves hold formation: steady, weapons held, organic breathing
        const breath = Math.sin(this.time.now * 0.0035 + u.animSeed);
        g.sprite.y = -2 + breath * 1.2;
        g.sprite.x = 0;
        g.sprite.angle = breath * 1.5 * u.dir;
        g.sprite.setScale(g.baseScale * (1 - breath * 0.02), g.baseScale * (1 + breath * 0.03));
      } else {
        // Natural bipedal/quadruped stride: vertical hop on push-off, squash on heel plant, pendulum leg lean
        const walkPhase = (u.ageTicks + u.animSeed * 0.001) * 0.48;
        const sinVal = Math.sin(walkPhase);
        const strideHop = -Math.abs(sinVal) * 5;
        const strideTilt = sinVal * 6.5 * u.dir;
        const footContact = Math.abs(sinVal) < 0.25;

        g.sprite.y = strideHop - 2;
        g.sprite.x = u.dir * (footContact ? 1 : -0.5);
        g.sprite.angle = strideTilt;

        const stretch = footContact ? -0.06 : 0.05;
        g.sprite.setScale(g.baseScale * (1 - stretch), g.baseScale * (1 + stretch));

        if (footContact && u.ageTicks % 5 === 0) {
          this.dust.emitParticleAt(u.x - u.dir * 6, this.unitGroundY(u), 1);
        }
      }
    } else if (u.state === 'fight') {
      const atk = 1 - u.cooldown / Math.max(1, u.def.attackRate);
      if (u.def.role === 'ranged') {
        // Ranged 3-phase: draw bow/aim rifle, release snap + muzzle flash, reload recovery
        if (atk < 0.28) {
          const p = atk / 0.28;
          g.sprite.x = -u.dir * (2 + p * 4);
          g.sprite.y = -2 - p * 2;
          g.sprite.angle = -u.dir * (3 + p * 8);
          g.sprite.setScale(g.baseScale * 0.94, g.baseScale * 1.05);
        } else if (atk < 0.50) {
          g.sprite.x = u.dir * 4;
          g.sprite.y = -2;
          g.sprite.angle = u.dir * 5;
          g.sprite.setScale(g.baseScale * 1.08, g.baseScale * 0.94);
          if (atk < 0.34) this.spawnAttackFx(u, 'muzzle');
        } else {
          const p = (atk - 0.50) / 0.50;
          g.sprite.x = u.dir * (4 * (1 - p));
          g.sprite.y = -2;
          g.sprite.angle = u.dir * (5 * (1 - p));
          g.sprite.setScale(g.baseScale);
        }
      } else if (u.def.role === 'tank') {
        // Tank 3-phase: heavy rear-up, devastating ground slam / battering ram, recovery
        if (atk < 0.25) {
          const p = atk / 0.25;
          g.sprite.x = -u.dir * (2 + p * 5);
          g.sprite.y = -2 - p * 6;
          g.sprite.angle = -u.dir * (2 + p * 6);
          g.sprite.setScale(g.baseScale * 0.95, g.baseScale * 1.08);
        } else if (atk < 0.52) {
          g.sprite.x = u.dir * 9;
          g.sprite.y = 1;
          g.sprite.angle = u.dir * 6;
          g.sprite.setScale(g.baseScale * 1.15, g.baseScale * 0.88);
          if (atk < 0.32) this.spawnAttackFx(u, 'shock');
        } else {
          const p = (atk - 0.52) / 0.48;
          g.sprite.x = u.dir * (9 * (1 - p));
          g.sprite.y = -2 + (3 * (1 - p));
          g.sprite.angle = u.dir * (6 * (1 - p));
          g.sprite.setScale(g.baseScale * (1 + 0.05 * (1 - p)));
        }
      } else {
        // Melee 3-phase: weapon backswing anticipation, lunging slash, follow-through
        if (atk < 0.25) {
          const p = atk / 0.25;
          g.sprite.x = -u.dir * (2 + p * 6);
          g.sprite.y = -2 + p * 1;
          g.sprite.angle = -u.dir * (4 + p * 12);
          g.sprite.setScale(g.baseScale * 1.08, g.baseScale * 0.90);
        } else if (atk < 0.50) {
          g.sprite.x = u.dir * 11;
          g.sprite.y = -4;
          g.sprite.angle = u.dir * 14;
          g.sprite.setScale(g.baseScale * 1.12, g.baseScale * 0.96);
          if (atk < 0.32) this.spawnAttackFx(u, 'slash');
        } else {
          const p = (atk - 0.50) / 0.50;
          g.sprite.x = u.dir * (11 * (1 - p));
          g.sprite.y = -2;
          g.sprite.angle = u.dir * (14 * (1 - p));
          g.sprite.setScale(g.baseScale);
        }
      }
    } else {
      g.sprite.y = -2; g.sprite.x = 0; g.sprite.angle = 0; g.sprite.setScale(g.baseScale);
    }

    // Ground the unit. The shadow is a separate child pinned to the foot line,
    // so while the sprite hopped the shadow stayed exactly where it was — which
    // is what made a moving unit read as a sticker lifting off its own shadow.
    // Shrinking and fading it with height plants the unit in the lane.
    const airborne = Math.min(1, Math.max(0, -g.sprite.y / 9));
    g.shadow.setScale(1 - airborne * 0.3, 1);
    g.shadow.setAlpha(1 - airborne * 0.45);

    const unitPalette = paletteFor(u.def.age);
    const isSurgeActive = (this.sim.chronoSurgeTicks ?? 0) > 0;
    const isEnemyStasis = isSurgeActive && u.side !== this.sim.chronoSurgeSide;
    const isFriendlySurge = isSurgeActive && u.side === this.sim.chronoSurgeSide;
    const isRally = ((u.side === 'player' ? this.sim.player.rallyTicks : this.sim.ai.rallyTicks) ?? 0) > 0;

    if (this.time.now < g.flashUntilMs) {
      // Time-based flash: exactly 60ms at any render rate, then the art returns.
      // Illustrated models only flash white — squash turns a face into a smear.
      g.sprite.setTint(0xffffff);
      if (!g.illustrated) {
        g.sprite.x += -u.dir * 4;
        g.sprite.angle += -u.dir * 6;
        g.sprite.scaleX *= 1.12;
        g.sprite.scaleY *= 0.90;
      }
    } else if (isEnemyStasis) {
      // Temporal stasis: icy cyan freeze
      g.sprite.setTint(0x5ce1e6);
    } else if (isFriendlySurge) {
      // Temporal haste: golden temporal rush
      g.sprite.setTint(0xffd166);
    } else if (isRally) {
      // War cry morale aura: fiery crimson-gold glow
      g.sprite.setTint(0xffa834);
    } else if (u.vet >= 2) {
      // Elite veteran: distinct prestige shine
      g.sprite.setTint(0xffeb3b);
    } else if (g.sprite.isTinted) {
      g.sprite.clearTint();
    }

    const hpW = Math.max(24, UNIT_FIT[u.def.age][u.def.role].w * PIXEL_SCALE * 0.75);
    const owner = u.side === 'player' ? this.sim.player : this.sim.ai;
    const effMax = u.def.hp * u.hpMul * (1 + owner.armorRank * 0.15);
    const ratio = Math.max(0, Math.min(1, u.hp / effMax));
    g.hpBar.width = Math.max(0.001, hpW * ratio);
    g.hpBar.x = -hpW / 2;
    if (ratio < 0.3) g.hpBar.setFillStyle(unitPalette.highlight);
    else if (ratio < 0.6) g.hpBar.setFillStyle(unitPalette.accent);
    else g.hpBar.setFillStyle(u.side === 'player' ? unitPalette.body : unitPalette.highlight);
    // A full-health unit is clean art; the bar only shows once it matters, or
    // when the player deliberately hovers it.
    const showBar = ratio < 1 || g.hovered;
    g.hpBar.setVisible(showBar);
    g.hpBarBg.setVisible(showBar);
    g.forgePip.setVisible(showBar && owner.forgeRank > 0);
    g.armorPip.setVisible(showBar && owner.armorRank > 0);
    g.wasFull = ratio >= 1;

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
    const hits: HitFlash[] = [];
    for (const ev of this.sim.events) {
      if (ev.kind === 'hit') {
        // Same crit rule as before: an explicit flag wins, otherwise a heavy
        // hit reads as a crit. Collected, not drawn, so a clump is one number.
        hits.push({
          x: ev.x,
          y: ev.y,
          damage: ev.damage,
          isCrit: ev.isCrit ?? ev.damage >= 22,
        });
      } else if (ev.kind === 'chronoSurge') {
        const isPlayer = ev.side === 'player';
        this.hud.announce('TIME WARP', isPlayer ? 'CHRONO STASIS ACTIVATED!' : 'ENEMY WARPED TIME!', 1800, 'important');
        this.shake(350, 5);
        audio.sfxChronoSurge();
        if (isPlayer) voice.play('chrono_surge');
        this.cameras.main.flash(200, 100, 220, 255, false);
      } else if (ev.kind === 'warCry') {
        const isPlayer = ev.side === 'player';
        this.hud.announce('WAR CRY', isPlayer ? 'ALL UNITS RALLY (+25% SPD)!' : 'ENEMY WAR CRY!', 1800, 'important');
        this.shake(250, 4);
        audio.sfxWarCry();
        if (isPlayer) voice.play('war_cry');
        // No full-screen flash. The rally is a speed buff; washing the lane
        // yellow hid the units that just got faster.
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
        this.burst.emitParticleAt(ev.x, ev.y - 6, 12);
        this.dust.setParticleTint(p.highlight);
        this.dust.emitParticleAt(ev.x, ev.y + 10, 8);
        audio.sfxDeath();
        this.spawnCoinPickup(ev.x, ev.y);
        this.hitStopMs = Math.max(this.hitStopMs, 35);
        this.shake(80, 2);
      } else if (ev.kind === 'turretShot') {
        this.fireTurretFx(ev.side, ev.fromX, ev.toX, ev.toY, ev.age);
      } else if (ev.kind === 'turretBuilt') {
        const tp = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        const bx = ev.side === 'player' ? PLAYER_BASE_X + 26 : AI_BASE_X - 26;
        this.addFloat(bx, LANE_TOP + 34, `TURRET ${ev.rank}`, tp.highlight, 46);
        if (ev.side === 'player' && ev.rank === 1) voice.play('turret_online');
      } else if (ev.kind === 'ultCast') {
        const cp = paletteFor(ev.age);
        this.hud.announce(ULT_DEFS[ev.age].label.toUpperCase(), ev.side === 'player' ? 'incoming' : 'brace!', 1400, 'important');
        this.addFloat(ev.x, LANE_BOTTOM - 30, ev.strike === 'meteor' ? 'METEOR STRIKE' : ev.strike === 'volley' ? 'RAIN OF FIRE' : 'AIRSTRIKE', cp.light, 54);
        this.shake(300, 6);
        audio.sfxEvolve();
      } else if (ev.kind === 'strike') {
        this.impactStrikeFx(ev.strike, ev.x, ev.y, ev.radius, ev.side);
      } else if (ev.kind === 'reinforce') {
        const rp = paletteFor(ev.age);
        this.addFloat(PLAYER_BASE_X + 60, LANE_TOP + 30, `+${ev.roles.length} REINFORCEMENTS`, rp.highlight, 56);
        this.dust.setParticleTint(rp.accent);
        this.dust.emitParticleAt(PLAYER_BASE_X + 40, LANE_BOTTOM - 60, 12);
        if (ev.side === 'player') { audio.sfxGold(); this.shake(180, 3); }
      } else if (ev.kind === 'collapse') {
        this.hud.announce('TIMELINE COLLAPSE', 'both bases are decaying - finish it', 3000, 'important');
        this.shake(900, 7);
        audio.sfxCollapse();
        voice.play('collapse');
      } else if (ev.kind === 'gold') {
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 46 : AI_BASE_X - 46,
          LANE_TOP + 22,
          `+${ev.amount}G`,
          0xffd700,
          28,
        );
        if (ev.side === 'player') audio.sfxGold();
      } else if (ev.kind === 'upgrade') {
        const up = paletteFor(ev.side === 'player' ? this.sim.player.age : this.sim.ai.age);
        const label = ev.which === 'forge' ? 'FORGE' : 'ARMOR';
        const color = ev.which === 'forge' ? up.highlight : up.accent;
        this.addFloat(
          ev.side === 'player' ? PLAYER_BASE_X + 46 : AI_BASE_X - 46,
          LANE_TOP + 22,
          `${label} ${ev.rank}`,
          color,
          36,
        );
        this.hud.announce(`${label} UPGRADED`, `rank ${ev.rank}`, 1600);
        audio.sfxUpgrade();
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
          if (this.textures.exists(baseKey(ev.to, 'ai'))) {
            this.aiBase.setTexture(baseKey(ev.to, 'ai'));
            const baseFit = BASE_FIT[ev.to].ai;
            this.aiBase.setScale((baseFit.h * PIXEL_SCALE) / (this.aiBase.height || baseFit.h));
          }
          this.aiFlag.setTexture(`flag_${ev.to}_ai`);
          this.aiFlag.setFlipX(true);
        } else {
          crazyHappytime();
        }
      }
    }
    this.presentHits(hits);
    // Simulation events are a one-frame hand-off to the renderer. Keeping them
    // around made every hit, sound and floating number replay on every tick.
    this.sim.events = this.sim.events.filter((event) => event.kind === 'gameover');
  }

  /**
   * One label, one hit sound and one camera kick per exchange — not per
   * damage event. A six-unit melee used to stack six CRIT labels and six
   * crit stings on the same pixel.
   */
  private presentHits(hits: HitFlash[]): void {
    if (hits.length === 0) return;
    const groups = coalesceHits(hits);
    let anyCrit = false;
    for (const g of groups) {
      if (g.crits > 0) anyCrit = true;
      const color = g.crits > 0 ? 0xffd700 : 0xffd166;
      this.addFloat(g.x, g.y - 14, g.text, color, g.pop ? 36 : 24, g.pop);
      this.dust.setParticleTint(color);
      this.dust.emitParticleAt(g.x, g.y, Math.min(12, 3 + g.hits));
      for (const u of this.sim.units) {
        if (Math.abs(u.x - g.x) < 18 && u.state !== 'die') {
          const gfx = this.unitGfx.get(u.id);
          if (gfx) {
            gfx.flashUntilMs = this.time.now + HIT_FLASH_MS;
            const away = u.side === 'player' ? -1 : 1;
            gfx.knock = away * (2 + (Math.round(g.damage) % 3));
          }
        }
      }
    }
    if (anyCrit) {
      audio.sfxCrit();
      this.hitStopMs = Math.max(this.hitStopMs, 45);
      this.shake(90, 3.5);
    } else {
      audio.sfxMeleeHit();
      this.hitStopMs = Math.max(this.hitStopMs, 20);
      this.shake(50, 1.5);
    }
  }

  private spawnAttackFx(u: UnitState, kind: 'slash' | 'muzzle' | 'shock'): void {
    spawnAttackFx(this, u, kind, this.unitGroundY(u));
  }

  private fireTurretFx(side: 'player' | 'ai', fromX: number, toX: number, toY: number, age: 'stone' | 'medieval' | 'modern'): void {
    fireTurretTracer(this, side, fromX, toX, toY, age);
    this.turretKick[side] = 5;
    this.shake(70, 2);
    audio.sfxTurret(age);
  }

  private impactStrikeFx(kind: StrikeKind, x: number, y: number, radius: number, side: 'player' | 'ai'): void {
    const age = side === 'player' ? this.sim.player.age : this.sim.ai.age;
    renderStrikeVisuals(this, this.strikeLayer, this.dust, kind, x, y, radius, age);
    this.shake(360, STRIKE_SHAKE[kind] * 1.6);
    this.cameras.main.flash(120, 255, kind === 'volley' ? 160 : 230, 130, false);
    this.hitStopMs = Math.max(this.hitStopMs, 55);
    audio.sfxStrike(kind);
  }

  private spawnCoinPickup(startX: number, startY: number): void {
    spawnCoinPickup(this, startX, startY);
  }

  private addFloat(x: number, y: number, text: string, color: number, ttl: number, pop = false): void {
    this.floatMgr.addFloat(x, y, text, color, ttl, pop);
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
      else if (ratio > 0.75) img.clearTint();
      else if (ratio > 0.45) img.setTint(0xe6ded1);
      else if (ratio > 0.20) img.setTint(pal.body);
      else img.setTint(pal.highlight);
    };
    towerLook(this.playerBase, pRatio, this.playerBaseFlash, playerPalette);
    towerLook(this.aiBase, aRatio, this.aiBaseFlash, aiPalette);

    if (pRatio < 0.65 && !this.smokePlayer.emitting) this.smokePlayer.start();
    else if (pRatio >= 0.65 && this.smokePlayer.emitting) this.smokePlayer.stop();
    if (pRatio < 0.65) this.smokePlayer.frequency = pRatio < 0.20 ? 90 : pRatio < 0.40 ? 180 : 380;
    if (aRatio < 0.65 && !this.smokeAi.emitting) this.smokeAi.start();
    else if (aRatio >= 0.65 && this.smokeAi.emitting) this.smokeAi.stop();
    if (aRatio < 0.65) this.smokeAi.frequency = aRatio < 0.20 ? 90 : aRatio < 0.40 ? 180 : 380;

    const baseY = laneGroundY(PLAYER_BASE_X) + 12;
    const aiBaseY = laneGroundY(AI_BASE_X) + 12;
    this.playerBase.y = baseY;
    this.aiBase.y = aiBaseY;
    const pShudder = pRatio < 0.22 && this.sim.player.baseHp > 0 ? Math.sin(t * 18) * 1.5 : 0;
    const aShudder = aRatio < 0.22 && this.sim.ai.baseHp > 0 ? Math.sin(t * 18 + 1) * 1.5 : 0;
    if (this.playerBaseFlash > 0) { this.playerBase.x = PLAYER_BASE_X + (Math.random() * 4 - 2); this.playerBaseFlash--; }
    else this.playerBase.x = PLAYER_BASE_X + pShudder;
    if (this.aiBaseFlash > 0) { this.aiBase.x = AI_BASE_X + (Math.random() * 4 - 2); this.aiBaseFlash--; }
    else this.aiBase.x = AI_BASE_X + aShudder;

    this.playerFlag.x = this.playerBase.x + 10;
    this.aiFlag.x = this.aiBase.x - 10;
    this.playerFlag.y = this.playerBase.y - this.playerBase.displayHeight - 2;
    this.aiFlag.y = this.aiBase.y - this.aiBase.displayHeight - 2;
  }
}

export { LANE_WIDTH };

// --- Sim types: zero Phaser imports ---

export type Age = 'stone' | 'medieval' | 'modern';
export type UnitRole = 'swarm' | 'tank' | 'ranged';
export type Side = 'player' | 'ai';

export interface UnitDef {
  role: UnitRole;
  age: Age;
  hp: number;
  damage: number;
  speed: number;   // px per tick
  range: number;   // px between unit origins
  attackRate: number; // ticks between attacks
  cost: number;
  xpValue: number;
  /** Damage multiplier vs this role (rock-paper-scissors). */
  strongVs: UnitRole;
  /** Human-readable label for HUD. */
  label: string;
}

export interface Projectile {
  id: number;
  side: Side;
  x: number;
  y: number;
  startX: number;
  targetId: number;
  /** Unit that fired the projectile, for kill/veterancy credit. */
  attackerId: number;
  speed: number;
  damage: number;
  /** Set when the target dies before the projectile lands — projectile then chases last known x. */
  targetX: number;
  /** Owner age — purely for rendering color. */
  age: Age;
}

export interface UnitState {
  id: number;
  def: UnitDef;
  side: Side;
  x: number;
  /**
   * Vertical offset (0 = lane centre) taken from the unit's id so the rank and
   * file never collapses onto a single line. See `laneYOffsetFor`.
   */
  yOffset: number;
  /** True while this unit is queued behind the front line and holding position. */
  reserve: boolean;
  hp: number;
  state: 'walk' | 'fight' | 'die';
  /** Ticks until next attack fires. */
  cooldown: number;
  target: number | null;
  /** Last enemy this unit damaged; used for accurate kill/veterancy credit. */
  lastAttackerId: number | null;
  /** Facing: 1 = toward enemy for player (right), -1 for ai (left). */
  dir: 1 | -1;
  /** Animation jitter seed (per-unit constant). */
  animSeed: number;
  /** Ticks the unit has been alive; used for walk bob. */
  ageTicks: number;
  /** Kills credited to this unit. */
  kills: number;
  /** Veterancy rank: 0 = green, 1 = veteran (+25% HP/DMG), 2 = elite (+50%, +speed). */
  vet: 0 | 1 | 2;
  /** Multiplier applied to damage based on vet (cached for performance). */
  dmgMul: number;
  /** Multiplier applied to max HP based on vet (cached). */
  hpMul: number;
  /** Speed multiplier. */
  spdMul: number;
}

export interface PlayerState {
  gold: number;
  xp: number;
  age: Age;
  baseHp: number;
  /** Ticks until you can spawn again (global cooldown). */
  spawnLockTicks: number;
  /** Ticks until evolution available / in progress (unused now; reserved). */
  evolveLockTicks: number;
  /** In-age upgrade ranks: forge (+DMG to all units) and armor (+HP to all units). Each stacks 3x. */
  forgeRank: 0 | 1 | 2 | 3;
  armorRank: 0 | 1 | 2 | 3;
  /** Base defence turret. Rank 0 means "not built yet". */
  turret: TurretState;
  /** Ultimate meter, 0..ULT_MAX. */
  ultCharge: number;
  /** Chrono meter for tactical timeline warp, 0..CHRONO_MAX. */
  chronoCharge?: number;
  /** War Cry morale boost ticks remaining (0 = inactive). */
  rallyTicks?: number;
  /** Cooldown ticks until War Cry can be used again. */
  rallyCooldown?: number;
  /**
   * Reinforcement call-ups purchased so far this match. Capped at
   * `REINFORCE_MAX_PURCHASES` so the gold sink has a hard ceiling.
   */
  reinforceUsed?: number;
  /** Ticks until another reinforcement call-up can be bought. */
  reinforceCooldown?: number;
}

export interface TurretState {
  rank: 0 | 1 | 2 | 3;
  /** Ticks until the turret can fire again. */
  cooldown: number;
  /** Current target, re-acquired every tick from the defensive perimeter. */
  targetId: number | null;
}

/** One scheduled impact belonging to a superweapon strike. */
export interface StrikeHit {
  /** Absolute tick at which this impact lands. */
  atTick: number;
  x: number;
  /** Radius of the splash in lane pixels. */
  radius: number;
  damage: number;
  visual: 'meteor' | 'fire' | 'bomb';
}

export type StrikeKind = 'meteor' | 'volley' | 'airstrike';

/**
 * A running superweapon strike. Impacts are scheduled up-front from the seeded
 * RNG so a replay lands exactly the same hits at exactly the same ticks.
 */
export interface StrikeEffect {
  id: number;
  side: Side;
  age: Age;
  kind: StrikeKind;
  x: number;
  /** Impacts still to come, ordered by `atTick`. */
  hits: StrikeHit[];
  /** Index of the next impact to resolve. */
  nextHit: number;
  reachedTick: number;
}

/** Per-match counters for the results screen. */
export interface MatchStats {
  unitsSpawned: Record<Side, number>;
  unitsLost: Record<Side, number>;
  kills: Record<Side, number>;
  turretKills: Record<Side, number>;
  ultimatesUsed: Record<Side, number>;
  goldEarned: Record<Side, number>;
  /**
   * Siege damage this side's units dealt to the ENEMY base. This is the
   * authoritative "who actually broke through" number, and it is the primary
   * combat-performance tiebreaker when both bases fall on the same tick.
   * Tracked in the sim (not the renderer) so it survives a replay.
   */
  baseDamage: Record<Side, number>;
}

/**
 * Why the match ended. Persisted on the state so the results screen and the
 * campaign can describe the outcome honestly instead of guessing from HP.
 *
 * - `enemyBaseDestroyed` / `playerBaseDestroyed`: a normal base kill.
 * - `collapseBaseHp`: both bases hit zero on the same tick; the side with more
 *   base HP immediately before that tick takes it.
 * - `collapseBaseDamage`: HP was level too; higher net base damage wins.
 * - `collapseKills`: damage was level too; higher kill count wins.
 * - `collapseDraw`: every tiebreaker is level — an honest draw, never a loss.
 */
export type EndReason =
  | 'enemyBaseDestroyed'
  | 'playerBaseDestroyed'
  | 'collapseBaseHp'
  | 'collapseBaseDamage'
  | 'collapseKills'
  | 'collapseDraw';

export type MatchResult = 'playing' | 'win' | 'loss' | 'draw';

/**
 * Match-level modifiers. A skirmish is just the identity ruleset; campaign
 * stages override starting age, income, AI aggression and AI behaviour.
 */
export interface MatchRules {
  stageId: number;
  stageName: string;
  stageTagline: string;
  /** Starting age per side. */
  playerStartAge: Age;
  aiStartAge: Age;
  /** Multipliers on passive income. */
  playerGoldMul: number;
  aiGoldMul: number;
  /** Multiplier on XP earned from kills. */
  aiXpMul: number;
  /** 0..1 — higher spends sooner and pushes harder. */
  aiAggression: number;
  /** Whether the AI may call superweapons. */
  aiUsesUltimate: boolean;
  /** Relative AI spawn weights per role. */
  aiWeights: Record<UnitRole, number>;
  /** Starting gold per side. */
  playerStartGold: number;
  aiStartGold: number;
  /** Starting in-age upgrade ranks per side. */
  aiForgeRank: 0 | 1 | 2 | 3;
  aiArmorRank: 0 | 1 | 2 | 3;
  /** Campaign stages can hand the AI a pre-built turret. */
  aiTurretRank: 0 | 1 | 2 | 3;
}

export function skirmishRules(): MatchRules {
  return {
    stageId: 0,
    stageName: 'Skirmish',
    stageTagline: 'Endless lane war',
    playerStartAge: 'stone',
    aiStartAge: 'stone',
    playerGoldMul: 1,
    aiGoldMul: 1,
    aiXpMul: 1,
    aiAggression: AI_AGGRESSION,
    // A skirmish opponent plays with the full kit, including superweapons.
    aiUsesUltimate: true,
    aiWeights: { swarm: 1, tank: 1, ranged: 1 },
    playerStartGold: STARTING_GOLD,
    aiStartGold: STARTING_GOLD,
    aiForgeRank: 0,
    aiArmorRank: 0,
    aiTurretRank: 0,
  };
}

export interface SimState {
  tick: number;
  units: UnitState[];
  projectiles: Projectile[];
  /** Running superweapon strikes. */
  strikes: StrikeEffect[];
  player: PlayerState;
  ai: PlayerState;
  nextId: number;
  result: MatchResult;
  /** Set exactly once, on the tick the match ends. Null-ish while playing. */
  endReason?: EndReason;
  /**
   * Base HP of each side at the START of the tick that ended the match, i.e.
   * immediately before any collapse drain or siege hit of that tick landed.
   * Kept on the state so the tiebreak is auditable after the fact.
   */
  endHpSnapshot?: Record<Side, number>;
  rngState: number;
  /** Match modifiers (identity rules for a plain skirmish). */
  rules: MatchRules;
  /** Counters for the results screen. */
  stats: MatchStats;
  /** Active Chrono Surge ticks remaining (0 = inactive). */
  chronoSurgeTicks?: number;
  chronoSurgeSide?: Side | null;
  /** Floating combat text events the renderer can consume and then clear. */
  events: SimEvent[];
  /**
   * Last tick either base took siege damage (0 = never). Feeds the attrition
   * ramp, and it is part of the replayed state so a replay ramps identically.
   */
  lastBreakthroughTick: number;
}

export type SimEvent =
  | { kind: 'hit'; x: number; y: number; damage: number; color: number; ttl: number; isCrit?: boolean }
  | { kind: 'death'; x: number; y: number; color: number; ttl: number }
  | { kind: 'gold'; side: Side; amount: number; ttl: number }
  | { kind: 'evolve'; side: Side; to: Age; ttl: number }
  | { kind: 'upgrade'; side: Side; which: 'forge' | 'armor'; rank: number; ttl: number }
  | { kind: 'baseHit'; side: Side; damage: number; ttl: number }
  | { kind: 'turretShot'; side: Side; age: Age; fromX: number; toX: number; toY: number; ttl: number }
  | { kind: 'turretBuilt'; side: Side; rank: number; ttl: number }
  | { kind: 'chronoSurge'; side: Side; ttl: number }
  | { kind: 'warCry'; side: Side; ttl: number }
  | {
      kind: 'strike';
      side: Side;
      age: Age;
      strike: StrikeKind;
      x: number;
      y: number;
      radius: number;
      damage: number;
      visual: StrikeHit['visual'];
      ttl: number;
    }
  | { kind: 'ultCast'; side: Side; age: Age; strike: StrikeKind; x: number; ttl: number }
  /** Announced once when the timeline starts tearing itself apart. */
  | { kind: 'collapse'; ttl: number }
  /** A paid reinforcement squad arrived at the base. */
  | { kind: 'reinforce'; side: Side; age: Age; roles: UnitRole[]; ttl: number }
  | { kind: 'gameover'; result: Exclude<MatchResult, 'playing'> };

export type Intent =
  | { type: 'spawn'; side: Side; role: UnitRole }
  | { type: 'evolve'; side: Side }
  | { type: 'upgrade'; side: Side; which: 'forge' | 'armor' }
  | { type: 'turret'; side: Side }
  | { type: 'ultimate'; side: Side; x: number }
  | { type: 'chronoSurge'; side: Side }
  | { type: 'warCry'; side: Side }
  | { type: 'reinforce'; side: Side };

// --- Lane geometry -----------------------------------------------------------
// The view is a 6:9 arcade canvas, drawn at exactly 2x one authored pixel:
//   0..286   painted sky band (parallax scenery)
//   286..430 lane terrain, the walkable strip units fight over
//   430..470 foreground set dressing
//   470..540 HUD panel
export const LANE_WIDTH = 960;
export const LANE_HEIGHT = 540;
export const LANE_TOP = 286;   // horizon: where the sky band ends
export const LANE_BOTTOM = 446; // front edge of the walkable lane
export const LANE_CENTER_Y = (LANE_TOP + LANE_BOTTOM) / 2;
export const PLAYER_BASE_X = 66;
export const AI_BASE_X = LANE_WIDTH - 66;
export const SPAWN_BUFFER_PX = 35;  // units spawn this far in front of their base

// --- Economy & balance -------------------------------------------------------
export const BASE_HP = 800;
export const STARTING_GOLD = 40;
export const GOLD_PER_TICK = 0.35;        // passive gold income (~7/sec @ TICK_MS=50)
export const XP_PER_KILL_SHARE = 0.5;     // killer gets 100%, assist/share logic could layer in
export const TICK_MS = 50;                // 20 ticks per second
export const SPAWN_GLOBAL_LOCK = 6;       // ticks between any of your spawns (~0.3s)
export const EVOLVE_COST: Record<Age, number> = { stone: 0, medieval: 40, modern: 90 };
export const EVOLVE_XP_REQ: Record<Age, number> = { stone: 0, medieval: 20, modern: 60 };

/**
 * Unit-definition table. Stone is cheap and slow, medieval is balanced,
 * modern is high-tech and punchy. A strict rock-paper-scissors triangle:
 *   swarm beats ranged, ranged beats tank, tank beats swarm
 */
export const UNIT_DEFS: Record<Age, Record<UnitRole, UnitDef>> = {
  stone: {
    swarm: {
      role: 'swarm', age: 'stone', label: 'Clubber',
      hp: 22, damage: 8, speed: 1.2, range: 14, attackRate: 16,
      cost: 5, xpValue: 3, strongVs: 'ranged',
    },
    tank: {
      role: 'tank', age: 'stone', label: 'Mammoth',
      hp: 95, damage: 18, speed: 0.55, range: 18, attackRate: 26,
      cost: 18, xpValue: 10, strongVs: 'swarm',
    },
    ranged: {
      role: 'ranged', age: 'stone', label: 'Slinger',
      hp: 16, damage: 11, speed: 0.9, range: 95, attackRate: 24,
      cost: 12, xpValue: 7, strongVs: 'tank',
    },
  },
  medieval: {
    swarm: {
      role: 'swarm', age: 'medieval', label: 'Man-at-Arms',
      hp: 40, damage: 13, speed: 1.25, range: 16, attackRate: 14,
      cost: 10, xpValue: 5, strongVs: 'ranged',
    },
    tank: {
      role: 'tank', age: 'medieval', label: 'Knight',
      hp: 160, damage: 28, speed: 0.6, range: 20, attackRate: 24,
      cost: 30, xpValue: 14, strongVs: 'swarm',
    },
    ranged: {
      role: 'ranged', age: 'medieval', label: 'Archer',
      hp: 30, damage: 20, speed: 0.95, range: 150, attackRate: 20,
      cost: 20, xpValue: 10, strongVs: 'tank',
    },
  },
  modern: {
    swarm: {
      role: 'swarm', age: 'modern', label: 'Commando',
      hp: 65, damage: 20, speed: 1.35, range: 18, attackRate: 12,
      cost: 18, xpValue: 8, strongVs: 'ranged',
    },
    tank: {
      role: 'tank', age: 'modern', label: 'Heavy Tank',
      hp: 290, damage: 46, speed: 0.7, range: 26, attackRate: 22,
      cost: 55, xpValue: 22, strongVs: 'swarm',
    },
    ranged: {
      role: 'ranged', age: 'modern', label: 'Sniper',
      hp: 45, damage: 44, speed: 1.0, range: 220, attackRate: 26,
      cost: 38, xpValue: 16, strongVs: 'tank',
    },
  },
};

export const AGE_ORDER: Age[] = ['stone', 'medieval', 'modern'];
export const AGE_LABEL: Record<Age, string> = {
  stone: 'Stone Age',
  medieval: 'Medieval Age',
  modern: 'Modern Age',
};
export const ROLE_LABEL: Record<UnitRole, string> = {
  swarm: 'Swarm',
  tank: 'Tank',
  ranged: 'Ranged',
};
export const ROLE_HOTKEY: Record<UnitRole, string> = {
  swarm: '1',
  tank: '2',
  ranged: '3',
};

/** Counter-triangle multiplier when attacker.strongVs === defender.role. */
export const COUNTER_MULTIPLIER = 1.8;
/** Veterancy thresholds (kills required) and bonuses. */
export const VET_THRESHOLDS = [3, 6];
export const VET_DMG = [1.0, 1.25, 1.55];
export const VET_HP  = [1.0, 1.20, 1.45];
export const VET_SPD = [1.0, 1.05, 1.15];

/** In-age upgrades: forge (DMG) and armor (HP).
 *  Each rank gives a +15% multiplier to all your units (current and future).
 *  Max rank: 3. Costs scale with age and rank. */
export const MAX_UPGRADE_RANK = 3;
export const UPGRADE_BONUS_PER_RANK = 0.15;
export const FORGE_COSTS: Record<Age, number[]> = {
  stone:    [25, 50, 90],
  medieval: [40, 80, 140],
  modern:   [70, 130, 220],
};
export const ARMOR_COSTS: Record<Age, number[]> = {
  stone:    [25, 50, 90],
  medieval: [40, 80, 140],
  modern:   [70, 130, 220],
};
/** Same-age minor disadvantage (mirror match drags on). */
export const SAME_AGE_PENALTY = 1.0;
/** Higher age vs lower age gets a flat bonus. */
export const AGE_BONUS_PER_TIER = 0.22;
/** Friendly unit separation radius (prevents clumping on the same pixel). */
export const FRIENDLY_SEPARATION = 14;

/**
 * Income escalation. Without it two evenly matched pushes can stand nose to
 * nose forever; ramping both economies guarantees the lane eventually resolves.
 */
export const ESCALATION_START_TICK = 2400; // 2 minutes
export const ESCALATION_PER_1000_TICKS = 0.28;
export const ESCALATION_MAX = 2.2;
export function goldEscalation(tick: number): number {
  if (tick <= ESCALATION_START_TICK) return 1;
  const ramped = 1 + ((tick - ESCALATION_START_TICK) / 1000) * ESCALATION_PER_1000_TICKS;
  return Math.min(ESCALATION_MAX, ramped);
}

/**
 * Timeline collapse. Two evenly-fed armies on one lane have a natural
 * equilibrium at the clash point, and an equilibrium is a terrible match: it
 * can run for ten minutes and end in nothing. Once the clock passes
 * `COLLAPSE_START_TICK` the timeline itself starts tearing, draining BOTH bases
 * at the same accelerating rate. The fight still decides the match — collapse
 * only converts a lead into a result, and it means the base HP you finish with
 * is the base HP you defended.
 */
export const COLLAPSE_START_TICK = 4800; // 4 minutes
export const COLLAPSE_BASE_RATE = 0.35; // HP per tick at the moment collapse begins
export const COLLAPSE_ACCEL = 1.0; // rate multiplier gained per 1000 ticks

export function collapseRate(tick: number): number {
  if (tick <= COLLAPSE_START_TICK) return 0;
  const over = (tick - COLLAPSE_START_TICK) / 1000;
  return COLLAPSE_BASE_RATE * (1 + over * COLLAPSE_ACCEL);
}

/**
 * Base-HP differences smaller than this count as a tie for the collapse
 * tiebreak. Collapse drains both bases by exactly the same amount per tick, so
 * an even match arrives here at 0.0 vs 0.0 — the epsilon exists to keep
 * floating-point dust from deciding a match.
 */
export const COLLAPSE_HP_TIE_EPSILON = 0.05;
/** Net base-damage differences smaller than this count as a tie, same reasoning. */
export const COLLAPSE_DAMAGE_TIE_EPSILON = 0.5;

/*
 * THE COLLAPSE TIEBREAK HIERARCHY (documented contract, see `resolveMatchEnd`):
 *
 *   1. Base HP immediately before the collapse tick  -> `collapseBaseHp`
 *   2. Net base damage dealt (siege out minus siege taken) -> `collapseBaseDamage`
 *   3. Kills                                          -> `collapseKills`
 *   4. Nothing separates them                          -> `collapseDraw`
 *
 * A simultaneous zero is NEVER resolved as an automatic loss.
 */

/*
 * ATTRITION RAMP (anti-stalemate combat acceleration).
 *
 * Profiling a self-play match showed the failure mode precisely: only ~7% of
 * the field is ever in the 'fight' state, engagements resolve one body at a
 * time, and no side ever converts a material lead into a push before the
 * clock runs out. Both armies are fed by the same escalating income, so a
 * symmetric trade can hold the mid-lane indefinitely.
 *
 * The ramp is deliberately NOT a global damage inflation: it is zero until the
 * match has gone STALEMATE_GRACE_TICKS without either base taking a single
 * point of siege damage, it resets the moment someone breaks through, and it
 * is capped. Its job is to make a packed engagement resolve — higher lethality
 * amplifies whichever side holds the local majority (they wipe the front and
 * their survivors walk on) instead of both sides trading down to nothing.
 */
export const STALEMATE_GRACE_TICKS = 1500; // 75s of clean lane before it arms
export const STALEMATE_RAMP_PER_1000_TICKS = 0.16;
export const STALEMATE_MAX_RAMP = 0.7; // hard ceiling: +70% unit damage

/**
 * Damage multiplier granted by the attrition ramp. `lastBreakthroughTick` is
 * the last tick either base took siege damage (0 = never yet).
 */
export function stalemateRamp(tick: number, lastBreakthroughTick: number): number {
  const armed = Math.max(STALEMATE_GRACE_TICKS, lastBreakthroughTick);
  if (tick <= armed) return 0;
  const over = (tick - armed) / 1000;
  return Math.min(STALEMATE_MAX_RAMP, over * STALEMATE_RAMP_PER_1000_TICKS);
}

/**
 * Siege zone. A unit that reaches this close to the enemy base stops trading
 * blows with whatever is left on the lane and starts hitting the structure
 * instead. Without it, a base can only ever be damaged once the defender's
 * army is completely wiped, which makes "the line broke" unrepresentable.
 */
export const BASE_SIEGE_RANGE = 84;

/**
 * Tug-of-war pressure. Numbers have to buy ground or a capped front line just
 * grinds forever: whichever side holds more weight inside the clash zone slowly
 * presses the line toward the enemy base. Rate is deliberately far slower than
 * a unit's walk speed so it reads as pressure, not sliding.
 */
export const PUSH_RANGE = 480; // px of lane either side of the clash that counts (widened: a
// column stretched over 400px of lane is still one army and should be weighed as one)
export const PUSH_SPEED = 1.1; // px per tick at full advantage
export const PUSH_DEAD_ZONE = 0.08; // ratios inside this band are a stand-off

// --- Lane stagger & engagement -------------------------------------------------
/**
 * Units are spread across five vertical slots so a push reads as a formation
 * instead of a single-file conga line. Identity-derived (never random) so a
 * replay reproduces the exact same formation.
 */
export const LANE_Y_SLOTS = 5;
export const LANE_Y_STEP = 12;
export const LANE_Y_CORRIDOR = LANE_Y_STEP * (LANE_Y_SLOTS - 1); // 48px combat corridor

export function laneYOffsetFor(unitId: number): number {
  return ((unitId % LANE_Y_SLOTS) - 2) * LANE_Y_STEP;
}

/** How many units per side may actually swing at the clash point. */
export const FRONT_LINE_SLOTS = 3;
/** Reserve units hold this far behind the ally in front of them. */
export const RESERVE_GAP = 20;
export const RESERVE_TOLERANCE = 6;
/**
 * Reach-into-the-clash for units that still hold a front-line slot.
 *
 * Why this exists: `FRIENDLY_SEPARATION` (14) and `RESERVE_GAP` (20) both
 * exceed every melee range in the game (14-26px), so a second attacker queued
 * one body behind the first could never actually touch the enemy. In practice
 * that capped a packed engagement at ONE melee swinger per file no matter how
 * big the army was — measured at ~3.5% of the field in the 'fight' state — and
 * no amount of numbers advantage ever converted into a kill rate. This lets the
 * units that legitimately own a front-line slot swing over the shoulder of the
 * man in front of them, up to FRONT_LINE_SLOTS deep. It is a small, bounded
 * reach bonus applied only to melee units that are NOT reserves: ranged units
 * are untouched (they fight from their own range behind the line) and tanks do
 * not become faster swarms (speed is unchanged).
 */
export const MELEE_REACH_BONUS = 10;
/**
 * Tank cleave: the heavy units swing wide enough to clip neighbours, which is
 * what stops two deathballs from standing nose to nose forever.
 */
export const CLEAVE_RADIUS = 30;
export const CLEAVE_FRACTION = 0.35;
/** Ticks between separations passes is 1; this is the push strength. */
export const SEPARATION_PUSH = 0.5;

// --- Base defence turret ------------------------------------------------------
export const TURRET_RANGE = 250;
export const MAX_TURRET_RANK = 3;
export interface TurretDef {
  /** Damage per shot, before rank bonus. */
  damage: number;
  /** Ticks between volleys. */
  attackRate: number;
  /** Projectiles per volley. */
  shots: number;
  /** Horizontal spacing between shots in a volley (piercing line / flak spread). */
  spread: number;
  label: string;
}
export const TURRET_DEFS: Record<Age, TurretDef> = {
  stone: { damage: 30, attackRate: 34, shots: 1, spread: 0, label: 'Rock Thrower' },
  medieval: { damage: 17, attackRate: 22, shots: 3, spread: 11, label: 'Ballista' },
  modern: { damage: 8, attackRate: 6, shots: 2, spread: 26, label: 'Flak Cannon' },
};
export const TURRET_COSTS: Record<Age, number[]> = {
  stone: [45, 80, 130],
  medieval: [65, 110, 180],
  modern: [95, 160, 250],
};
/** Each rank above the first adds this much damage. */
export const TURRET_RANK_BONUS = 0.3;

// --- Superweapon --------------------------------------------------------------
export const ULT_MAX = 100;
/**
 * Passive charge per tick (~52s from empty at 20 ticks/s).
 *
 * Rebalanced from 0.16: superweapons were measuring at ~67% of ALL damage dealt
 * in a self-play match (13.7k of 20.5k), which meant the lane was decided by
 * alternating airstrike deletes rather than by armies. Slowing the meter turns
 * the ult back into a tempo tool instead of the primary attrition engine.
 */
export const ULT_PASSIVE_PER_TICK = 0.12;
/**
 * Charge granted per kill credited to that side. Rebalanced from 9: with ~180
 * kills per match the kill stream alone bought ~16 superweapons, enough to wipe
 * every push before it reached a base.
 */
export const ULT_PER_KILL = 4.5;
export const ULT_START_CHARGE = 15;
export interface UltDef {
  label: string;
  kind: 'meteor' | 'volley' | 'airstrike';
  /** Radius of each individual impact. */
  radius: number;
  damage: number;
  /** Number of impacts in the pattern. */
  hits: number;
  /** Ticks between impacts. */
  cadence: number;
  /** Horizontal extent of the whole pattern. */
  width: number;
  visual: 'meteor' | 'fire' | 'bomb';
}
export const ULT_DEFS: Record<Age, UltDef> = {
  stone: { label: 'Meteor Strike', kind: 'meteor', radius: 62, damage: 58, hits: 3, cadence: 5, width: 130, visual: 'meteor' },
  medieval: { label: 'Rain of Fire', kind: 'volley', radius: 46, damage: 17, hits: 9, cadence: 7, width: 200, visual: 'fire' },
  modern: { label: 'Airstrike', kind: 'airstrike', radius: 58, damage: 40, hits: 7, cadence: 4, width: 220, visual: 'bomb' },
};

// --- AI tuning ---------------------------------------------------------------
export const AI_THINK_TICKS = 8;       // re-evaluate every ~400ms
export const AI_AGGRESSION = 0.65;    // 0..1, higher = spawns sooner with less gold
export const AI_EVOLVE_TRIGGER_XP = 0.9; // ai evolves when it hits this fraction of required XP (and has gold)

// --- Chrono Surge (Unique Temporal RTS Mechanic) -----------------------------
export const CHRONO_MAX = 100;
export const CHRONO_SURGE_DURATION_TICKS = 40; // 4s at 100ms/tick
export const CHRONO_PASSIVE_PER_TICK = 0.35;
export const CHRONO_PER_KILL = 10;

// --- War Cry Rally (Commander Morale Ability) --------------------------------
export const RALLY_DURATION_TICKS = 80; // 4s of boosted morale (speed + attack rate)
export const RALLY_COOLDOWN_TICKS = 240; // 12s cooldown
export const RALLY_GOLD_COST = 25; // tactical investment

// --- Reinforcement call-up (the late-game gold sink) --------------------------
/**
 * Cooldowns, not the economy, used to be the binding constraint: a real match
 * banked 2778 unspent gold because there was nothing worth buying once the
 * upgrades and the turret were maxed. The call-up is the answer — an expensive,
 * strictly capped purchase that turns a fat treasury into an immediate push.
 *
 * Rules, all enforced in the sim so a replay reproduces them exactly:
 *   - costs escalate with every call-up already bought, at the CURRENT age's price,
 *   - hard cap of REINFORCE_MAX_PURCHASES per match per side,
 *   - shared cooldown of REINFORCE_COOLDOWN_TICKS between purchases,
 *   - the squad bypasses the ordinary spawn lock and spawns staggered behind the
 *     base apron so it never fights the 14px spawn-block rule.
 */
export const REINFORCE_SQUAD_SIZE = 3;
/** A mixed squad keeps the counter triangle intact instead of dumping one role. */
export const REINFORCE_ROLES: readonly UnitRole[] = ['swarm', 'ranged', 'tank'];
/** Purchase index -> cost, per age. Index is clamped to the last entry. */
export const REINFORCE_COSTS: Record<Age, number[]> = {
  stone: [90, 150, 240, 360],
  medieval: [140, 230, 360, 540],
  modern: [220, 350, 540, 800],
};
export const REINFORCE_MAX_PURCHASES = 4;
export const REINFORCE_COOLDOWN_TICKS = 300; // 15s at 20 ticks/s
/** Stagger between squad members, behind the base apron. */
export const REINFORCE_SPACING_PX = 18;

/** Price of the NEXT call-up for `age` given how many have already been bought. */
export function reinforceCost(age: Age, purchasesUsed: number): number {
  const table = REINFORCE_COSTS[age];
  const idx = Math.max(0, Math.min(table.length - 1, Math.floor(purchasesUsed)));
  return table[idx]!;
}

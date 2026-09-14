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
  /** Vertical offset (0 = on the lane center). Tanks/soldiers are center, ranged slightly back, etc. */
  yOffset: number;
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
}

export interface SimState {
  tick: number;
  units: UnitState[];
  projectiles: Projectile[];
  player: PlayerState;
  ai: PlayerState;
  nextId: number;
  result: 'playing' | 'win' | 'loss';
  rngState: number;
  /** Floating combat text events the renderer can consume and then clear. */
  events: SimEvent[];
}

export type SimEvent =
  | { kind: 'hit'; x: number; y: number; damage: number; color: number; ttl: number }
  | { kind: 'death'; x: number; y: number; color: number; ttl: number }
  | { kind: 'gold'; side: Side; amount: number; ttl: number }
  | { kind: 'evolve'; side: Side; to: Age; ttl: number }
  | { kind: 'upgrade'; side: Side; which: 'forge' | 'armor'; rank: number; ttl: number }
  | { kind: 'baseHit'; side: Side; damage: number; ttl: number }
  | { kind: 'gameover'; result: 'win' | 'loss' };

export type Intent =
  | { type: 'spawn'; side: Side; role: UnitRole }
  | { type: 'evolve'; side: Side }
  | { type: 'upgrade'; side: Side; which: 'forge' | 'armor' };

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

// --- AI tuning ---------------------------------------------------------------
export const AI_THINK_TICKS = 8;       // re-evaluate every ~400ms
export const AI_AGGRESSION = 0.65;    // 0..1, higher = spawns sooner with less gold
export const AI_EVOLVE_TRIGGER_XP = 0.9; // ai evolves when it hits this fraction of required XP (and has gold)

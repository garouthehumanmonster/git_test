// --- Sim types: zero Phaser imports ---

export type Age = 'stone' | 'medieval' | 'modern';
export type UnitRole = 'swarm' | 'tank' | 'ranged';
export type Side = 'player' | 'ai';

export interface UnitDef {
  role: UnitRole;
  age: Age;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  attackRate: number;
  cost: number;
  xpValue: number;
  strongVs: UnitRole;
}

export interface UnitState {
  id: number;
  def: UnitDef;
  side: Side;
  x: number;
  hp: number;
  state: 'walk' | 'fight' | 'die';
  cooldown: number;
  target: number | null;
}

export interface PlayerState {
  gold: number;
  xp: number;
  age: Age;
  baseHp: number;
  spawnLockTicks: number;
}

export interface SimState {
  tick: number;
  units: UnitState[];
  player: PlayerState;
  ai: PlayerState;
  nextId: number;
  result: 'playing' | 'win' | 'loss';
  rngState: number;
}

export type Intent =
  | { type: 'spawn'; side: Side; role: UnitRole }
  | { type: 'evolve'; side: Side };

// Constants
export const LANE_WIDTH = 800;
export const LANE_HEIGHT = 200;
export const PLAYER_BASE_X = 40;
export const AI_BASE_X = 760;
export const BASE_HP = 500;
export const STARTING_GOLD = 30;
export const TICK_MS = 50;

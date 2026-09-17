import { type MatchRules, BASE_HP } from './sim/types';

/**
 * Campaign definition and progression.
 *
 * Pure TypeScript on purpose: no Phaser, no DOM. Storage goes through a tiny
 * key/value shim so the whole module is unit-testable in Node while still
 * persisting to `localStorage` in the browser under the agreed key.
 */
export const CAMPAIGN_STORAGE_KEY = 'timeline_war_campaign_v1';

export interface StageDef {
  id: number;
  name: string;
  tagline: string;
  /** Short line shown on the stage card, hinting at the lesson. */
  brief: string;
  rules: MatchRules;
}

export interface StageProgress {
  /** Highest stage index (1-based) the player has unlocked. */
  unlocked: number;
  /** Stars earned per stage id, 1-3. Missing = not cleared. */
  stars: Record<number, number>;
  /** Best clear time in ms per stage. */
  bestMs?: Record<number, number>;
}

export interface MatchSummary {
  stageId: number;
  result: 'win' | 'loss';
  /** Elapsed match time in milliseconds. */
  elapsedMs: number;
  unitsSpawned: number;
  enemiesDestroyed: number;
  unitsLost: number;
  baseHpRatio: number;
}

export interface ResultsPayload extends MatchSummary {
  stars: number;
  isBest: boolean;
  hasNextStage: boolean;
}

/** 1-3 stars: a flawless base is 3, a bloody win is 1. */
export function starRating(result: 'win' | 'loss', baseHpRatio: number): number {
  if (result !== 'win') return 0;
  if (baseHpRatio > 0.8) return 3;
  if (baseHpRatio > 0.4) return 2;
  return 1;
}

export function emptyProgress(): StageProgress {
  return { unlocked: 1, stars: {}, bestMs: {} };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** In-memory fallback so the module works headless (tests, SSR, private mode). */
function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

let injectedStore: KeyValueStore | null = null;

/** Test seam: force a specific store (pass null to fall back to auto-detect). */
export function setProgressStore(store: KeyValueStore | null): void {
  injectedStore = store;
}

function activeStore(): KeyValueStore {
  if (injectedStore) return injectedStore;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    // Access can throw when cookies/storage are blocked.
  }
  return memoryStore();
}

function sanitize(raw: unknown): StageProgress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<StageProgress>;
  const unlocked = typeof obj.unlocked === 'number' && Number.isFinite(obj.unlocked)
    ? Math.max(1, Math.min(STAGES.length, Math.floor(obj.unlocked)))
    : 1;
  const stars: Record<number, number> = {};
  if (obj.stars && typeof obj.stars === 'object') {
    for (const [k, v] of Object.entries(obj.stars)) {
      const id = Number(k);
      const value = Number(v);
      if (!Number.isFinite(id) || !Number.isFinite(value)) continue;
      if (id < 1 || id > STAGES.length) continue;
      stars[id] = Math.max(1, Math.min(3, Math.floor(value)));
    }
  }
  const bestMs: Record<number, number> = {};
  if (obj.bestMs && typeof obj.bestMs === 'object') {
    for (const [k, v] of Object.entries(obj.bestMs)) {
      const id = Number(k);
      const value = Number(v);
      if (!Number.isFinite(id) || !Number.isFinite(value) || value <= 0) continue;
      if (id < 1 || id > STAGES.length) continue;
      bestMs[id] = value;
    }
  }
  return { unlocked, stars, bestMs };
}

export function loadProgress(): StageProgress {
  try {
    const raw = activeStore().getItem(CAMPAIGN_STORAGE_KEY);
    if (!raw) return emptyProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: StageProgress): void {
  try {
    const data = JSON.stringify(sanitize(progress));
    activeStore().setItem(CAMPAIGN_STORAGE_KEY, data);
    if (typeof window !== 'undefined' && window.CrazyGames?.SDK?.data?.setItem) {
      window.CrazyGames.SDK.data.setItem(CAMPAIGN_STORAGE_KEY, data).catch(() => {});
    }
  } catch {
    // Storage full / blocked — the run still counts for this session.
  }
}

export function clearProgress(): void {
  saveProgress(emptyProgress());
}

/** Merges cloud and local progress, taking highest unlocks, stars, and fastest times. */
export function mergeProgress(a: StageProgress, b: StageProgress): StageProgress {
  const sa = sanitize(a);
  const sb = sanitize(b);
  const unlocked = Math.max(sa.unlocked, sb.unlocked);
  const stars: Record<number, number> = { ...sa.stars };
  for (const [k, v] of Object.entries(sb.stars)) {
    const id = Number(k);
    stars[id] = Math.max(stars[id] ?? 0, v);
  }
  const bestMs: Record<number, number> = { ...(sa.bestMs ?? {}) };
  for (const [k, v] of Object.entries(sb.bestMs ?? {})) {
    const id = Number(k);
    bestMs[id] = Math.min(bestMs[id] ?? Infinity, v);
  }
  return { unlocked, stars, bestMs };
}

export function totalStars(progress: StageProgress): number {
  return Object.values(progress.stars).reduce((sum, n) => sum + n, 0);
}

export const MAX_STARS = 3 * 5;

/**
 * Record a finished match. Winning unlocks the next stage; stars only ever go
 * up, and a faster clear replaces the old best.
 */
export function recordResult(summary: MatchSummary): ResultsPayload {
  const progress = loadProgress();
  const stars = starRating(summary.result, summary.baseHpRatio);
  const previousStars = progress.stars[summary.stageId] ?? 0;
  const previousBest = progress.bestMs?.[summary.stageId];
  let isBest = false;

  if (summary.result === 'win' && stars > 0) {
    progress.stars[summary.stageId] = Math.max(previousStars, stars);
    progress.bestMs = progress.bestMs ?? {};
    if (previousBest === undefined || summary.elapsedMs < previousBest) {
      isBest = previousBest !== undefined || previousStars === 0;
      progress.bestMs[summary.stageId] = summary.elapsedMs;
    }
    if (summary.stageId >= progress.unlocked && summary.stageId < STAGES.length) {
      progress.unlocked = summary.stageId + 1;
    }
    saveProgress(progress);
  }

  return {
    ...summary,
    stars,
    isBest,
    hasNextStage: summary.stageId < STAGES.length,
  };
}

export function isUnlocked(progress: StageProgress, stageId: number): boolean {
  return stageId <= progress.unlocked;
}

// ---------------------------------------------------------------------------
// The five stages
// ---------------------------------------------------------------------------

function rules(partial: Partial<MatchRules> & { stageId: number; stageName: string; stageTagline: string }): MatchRules {
  return {
    playerStartAge: 'stone',
    aiStartAge: 'stone',
    playerGoldMul: 1,
    aiGoldMul: 1,
    aiXpMul: 1,
    aiAggression: 0.65,
    aiUsesUltimate: false,
    aiWeights: { swarm: 1, tank: 1, ranged: 1 },
    playerStartGold: 120,
    aiStartGold: 120,
    aiForgeRank: 0,
    aiArmorRank: 0,
    aiTurretRank: 0,
    ...partial,
  };
}

export const STAGES: StageDef[] = [
  {
    id: 1,
    name: 'Dawn of Man',
    tagline: 'Club against club, bone against bone.',
    brief: 'A mirror match. Learn the counter triangle before the timeline moves on.',
    rules: rules({
      stageId: 1,
      stageName: 'Dawn of Man',
      stageTagline: 'Club against club, bone against bone.',
      aiAggression: 0.6,
      aiWeights: { swarm: 1.15, tank: 0.9, ranged: 0.95 },
      aiStartGold: 110,
    }),
  },
  {
    id: 2,
    name: 'Iron Vanguard',
    tagline: 'Shields up, lances down.',
    brief: 'Heavy infantry and ballistas. Break the wall with ranged fire and cleave.',
    rules: rules({
      stageId: 2,
      stageName: 'Iron Vanguard',
      stageTagline: 'Shields up, lances down.',
      aiAggression: 0.7,
      aiWeights: { swarm: 0.7, tank: 1.6, ranged: 1.1 },
      aiGoldMul: 1.1,
      aiStartGold: 150,
      aiForgeRank: 1,
    }),
  },
  {
    id: 3,
    name: 'Technological Divide',
    tagline: 'They have powder. You have rocks.',
    brief: 'The enemy starts in the Medieval Age while you are still in the Stone Age. ' +
      'Survive, evolve, then answer with steel.',
    rules: rules({
      stageId: 3,
      stageName: 'Technological Divide',
      stageTagline: 'They have powder. You have rocks.',
      aiStartAge: 'medieval',
      aiAggression: 0.72,
      aiGoldMul: 1.15,
      aiXpMul: 1.25,
      aiStartGold: 170,
      aiWeights: { swarm: 0.9, tank: 1.3, ranged: 1.3 },
      aiForgeRank: 1,
      aiArmorRank: 1,
    }),
  },
  {
    id: 4,
    name: 'Blitzkrieg',
    tagline: 'They are already in the future.',
    brief: 'A fast modern onslaught. A base turret is not optional — hold the line, ' +
      'then break it with superweapons.',
    rules: rules({
      stageId: 4,
      stageName: 'Blitzkrieg',
      stageTagline: 'They are already in the future.',
      aiStartAge: 'modern',
      aiAggression: 0.85,
      aiGoldMul: 1.2,
      aiXpMul: 1.4,
      aiStartGold: 220,
      aiWeights: { swarm: 1.5, tank: 1.1, ranged: 1.2 },
      aiForgeRank: 2,
      aiArmorRank: 1,
      aiTurretRank: 1,
      aiUsesUltimate: true,
    }),
  },
  {
    id: 5,
    name: 'Total Timeline War',
    tagline: 'Every age at once.',
    brief: 'The boss timeline: faster income, faster research and superweapons aimed ' +
      'straight at your lane. Out-think it or be erased.',
    rules: rules({
      stageId: 5,
      stageName: 'Total Timeline War',
      stageTagline: 'Every age at once.',
      aiStartAge: 'medieval',
      aiAggression: 0.9,
      aiGoldMul: 1.35,
      aiXpMul: 1.6,
      aiStartGold: 260,
      aiWeights: { swarm: 1.2, tank: 1.2, ranged: 1.2 },
      aiForgeRank: 2,
      aiArmorRank: 2,
      aiTurretRank: 2,
      aiUsesUltimate: true,
    }),
  },
];

export function stageById(id: number): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]!;
}

/** Ratio of surviving base HP, clamped for the star calculation. */
export function baseHpRatio(hp: number): number {
  return Math.max(0, Math.min(1, hp / BASE_HP));
}

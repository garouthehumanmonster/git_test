import { describe, it, expect, beforeEach } from 'vitest';
import {
  CAMPAIGN_STORAGE_KEY,
  MAX_STARS,
  STAGES,
  baseHpRatio,
  clearProgress,
  emptyProgress,
  isUnlocked,
  loadProgress,
  recordResult,
  saveProgress,
  setProgressStore,
  stageById,
  starRating,
  totalStars,
} from '../../src/campaign';
import { BASE_HP } from '../../src/sim/types';

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

const win = (stageId: number, baseHp: number, elapsedMs = 120_000) => ({
  stageId,
  result: 'win' as const,
  elapsedMs,
  unitsSpawned: 40,
  enemiesDestroyed: 33,
  unitsLost: 21,
  baseHpRatio: baseHpRatio(baseHp),
});

describe('campaign stages', () => {
  it('defines exactly the five named stages', () => {
    expect(STAGES.map((s) => s.name)).toEqual([
      'Dawn of Man',
      'Iron Vanguard',
      'Technological Divide',
      'Blitzkrieg',
      'Total Timeline War',
    ]);
    expect(STAGES.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives stage 3 a technological head start and stage 4 a modern one', () => {
    expect(stageById(1).rules.aiStartAge).toBe(stageById(1).rules.playerStartAge);
    expect(stageById(3).rules.aiStartAge).toBe('medieval');
    expect(stageById(3).rules.playerStartAge).toBe('stone');
    expect(stageById(4).rules.aiStartAge).toBe('modern');
    expect(stageById(4).rules.aiGoldMul).toBeGreaterThan(1);
  });

  it('gives the boss stage both superweapons and a faster economy', () => {
    const boss = stageById(5).rules;
    expect(boss.aiUsesUltimate).toBe(true);
    expect(boss.aiGoldMul).toBeGreaterThan(stageById(4).rules.aiGoldMul);
    expect(boss.aiXpMul).toBeGreaterThan(1);
  });
});

describe('star rating', () => {
  it('awards three stars above 80% base HP', () => {
    expect(starRating('win', 0.81)).toBe(3);
    expect(starRating('win', 1)).toBe(3);
  });

  it('awards two stars above 40% and one star for any other win', () => {
    expect(starRating('win', 0.8)).toBe(2);
    expect(starRating('win', 0.41)).toBe(2);
    expect(starRating('win', 0.4)).toBe(1);
    expect(starRating('win', 0.05)).toBe(1);
  });

  it('awards nothing for a loss', () => {
    expect(starRating('loss', 1)).toBe(0);
  });
});

describe('campaign progression', () => {
  let store: ReturnType<typeof fakeStore>;

  beforeEach(() => {
    store = fakeStore();
    setProgressStore(store);
  });

  it('starts with only stage 1 unlocked', () => {
    const p = loadProgress();
    expect(p.unlocked).toBe(1);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('persists to the agreed localStorage key', () => {
    recordResult(win(1, BASE_HP));
    expect(store.map.has(CAMPAIGN_STORAGE_KEY)).toBe(true);
    const raw = JSON.parse(store.map.get(CAMPAIGN_STORAGE_KEY)!);
    expect(raw.unlocked).toBe(2);
    expect(raw.stars['1']).toBe(3);
  });

  it('beating stage 1 unlocks stage 2 and keeps the stars', () => {
    const payload = recordResult(win(1, BASE_HP * 0.5));
    expect(payload.stars).toBe(2);
    expect(payload.hasNextStage).toBe(true);
    const p = loadProgress();
    expect(p.unlocked).toBe(2);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(p.stars[1]).toBe(2);
  });

  it('never downgrades stars and keeps the fastest clear', () => {
    recordResult(win(1, BASE_HP, 90_000));
    recordResult(win(1, BASE_HP * 0.2, 150_000));
    let p = loadProgress();
    expect(p.stars[1]).toBe(3);
    expect(p.bestMs?.[1]).toBe(90_000);

    recordResult(win(1, BASE_HP, 80_000));
    p = loadProgress();
    expect(p.stars[1]).toBe(3);
    expect(p.bestMs?.[1]).toBe(80_000);
  });

  it('does not unlock anything on a loss', () => {
    const payload = recordResult({
      stageId: 1,
      result: 'loss',
      elapsedMs: 60_000,
      unitsSpawned: 12,
      enemiesDestroyed: 4,
      unitsLost: 18,
      baseHpRatio: 0,
    });
    expect(payload.stars).toBe(0);
    expect(loadProgress().unlocked).toBe(1);
  });

  it('stops unlocking past the final stage', () => {
    const p = emptyProgress();
    p.unlocked = 5;
    saveProgress(p);
    recordResult(win(5, BASE_HP));
    const after = loadProgress();
    expect(after.unlocked).toBe(5);
    expect(totalStars(after)).toBe(3);
    expect(MAX_STARS).toBe(15);
  });

  it('survives corrupt stored data', () => {
    store.map.set(CAMPAIGN_STORAGE_KEY, '{not json');
    expect(loadProgress().unlocked).toBe(1);
    store.map.set(CAMPAIGN_STORAGE_KEY, JSON.stringify({ unlocked: 99, stars: { 3: 9, 77: 2, x: 1 } }));
    const p = loadProgress();
    expect(p.unlocked).toBe(STAGES.length);
    expect(p.stars[3]).toBe(3);
    expect(p.stars[77]).toBeUndefined();
  });

  it('can be cleared', () => {
    recordResult(win(1, BASE_HP));
    clearProgress();
    expect(loadProgress().unlocked).toBe(1);
    expect(loadProgress().stars[1]).toBeUndefined();
  });
});

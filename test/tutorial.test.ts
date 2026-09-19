import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultTutorialState,
  loadTutorialState,
  saveTutorialState,
  evaluateTutorialStep,
  announceLiveRegion,
  resetLiveRegionForTesting,
  type TutorialState,
  type TutorialCheckContext,
} from '../src/tutorial';
import type { KeyValueStore } from '../src/campaign';

class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

describe('Stage 1 First-Run Coach (tutorial.ts)', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    resetLiveRegionForTesting();
  });

  it('loads default tutorial state when storage is empty', () => {
    const s = loadTutorialState(store);
    expect(s.step).toBe('spawn');
    expect(s.spawnDone).toBe(false);
    expect(s.dismissed).toBe(false);
  });

  it('falls back safely to default state on corrupted or malformed storage', () => {
    store.setItem('timeline_war_tutorial_coach_v1', '{malformed json');
    expect(loadTutorialState(store)).toEqual(defaultTutorialState());

    store.setItem('timeline_war_tutorial_coach_v1', JSON.stringify({ step: 'invalid_step_name' }));
    expect(loadTutorialState(store).step).toBe('spawn');

    store.setItem('timeline_war_tutorial_coach_v1', 'null');
    expect(loadTutorialState(store)).toEqual(defaultTutorialState());
  });

  it('saves and reloads valid tutorial state', () => {
    const state: TutorialState = {
      step: 'evolve',
      spawnDone: true,
      evolveDone: false,
      ultimateDone: false,
      dismissed: false,
    };
    saveTutorialState(state, store);

    const reloaded = loadTutorialState(store);
    expect(reloaded).toEqual(state);
  });

  it('progresses through the three teaching moments', () => {
    const state = defaultTutorialState();

    const ctx1: TutorialCheckContext = {
      stageId: 1,
      playerUnitsSpawned: 0,
      canEvolve: false,
      playerAge: 'stone',
      ultimateReady: false,
      ultimateUsed: false,
    };

    // Moment 1: Spawn prompt
    const res1 = evaluateTutorialStep(state, ctx1);
    expect(res1.nextStep).toBe('spawn');
    expect(res1.promptText).toBe('Deploy a Clubman (Key 1)');
    expect(res1.highlight).toBe('spawn');

    // Player spawns unit -> Moment 1 clears
    const ctx2: TutorialCheckContext = { ...ctx1, playerUnitsSpawned: 1 };
    const res2 = evaluateTutorialStep(state, ctx2);
    expect(state.spawnDone).toBe(true);
    expect(res2.nextStep).toBe('evolve');
    expect(res2.promptText).toBeNull(); // Not eligible to evolve yet

    // Moment 2: Player can evolve -> Evolve prompt (length <= 55 chars)
    const ctx3: TutorialCheckContext = { ...ctx2, canEvolve: true };
    const res3 = evaluateTutorialStep(state, ctx3);
    expect(res3.promptText).toBe('Evolve age: unlocks stronger units and tech');
    expect(res3.promptText!.length).toBeLessThanOrEqual(55);
    expect(res3.highlight).toBe('evolve');

    // Player evolves -> Moment 2 clears
    const ctx4: TutorialCheckContext = { ...ctx3, playerAge: 'medieval' };
    const res4 = evaluateTutorialStep(state, ctx4);
    expect(state.evolveDone).toBe(true);
    expect(res4.nextStep).toBe('ultimate');
    expect(res4.promptText).toBeNull();

    // Moment 3: Ultimate becomes ready
    const ctx5: TutorialCheckContext = { ...ctx4, ultimateReady: true };
    const res5 = evaluateTutorialStep(state, ctx5);
    expect(res5.promptText).toBe('Unleash Meteor (Space)');
    expect(res5.highlight).toBe('ultimate');

    // Player casts ultimate -> Tutorial completed
    const ctx6: TutorialCheckContext = { ...ctx5, ultimateUsed: true };
    const res6 = evaluateTutorialStep(state, ctx6);
    expect(state.ultimateDone).toBe(true);
    expect(res6.nextStep).toBe('completed');
    expect(res6.promptText).toBeNull();
  });

  it('never shows in stages other than Stage 1 or skirmish (Stage 0)', () => {
    const state = defaultTutorialState();
    for (const stageId of [0, 2, 3, 4, 5]) {
      const ctx: TutorialCheckContext = {
        stageId,
        playerUnitsSpawned: 0,
        canEvolve: true,
        playerAge: 'stone',
        ultimateReady: true,
        ultimateUsed: false,
      };
      const res = evaluateTutorialStep(state, ctx);
      expect(res.promptText).toBeNull();
      expect(res.highlight).toBeNull();
    }
  });

  it('stops showing once dismissed by player', () => {
    const state = defaultTutorialState();
    state.dismissed = true;

    const ctx: TutorialCheckContext = {
      stageId: 1,
      playerUnitsSpawned: 0,
      canEvolve: false,
      playerAge: 'stone',
      ultimateReady: false,
      ultimateUsed: false,
    };
    const res = evaluateTutorialStep(state, ctx);
    expect(res.promptText).toBeNull();
    expect(res.highlight).toBeNull();
  });
});

import type { KeyValueStore } from './campaign';

export const TUTORIAL_STORAGE_KEY = 'timeline_war_tutorial_coach_v1';

export type TutorialStep = 'spawn' | 'evolve' | 'ultimate' | 'completed';

export interface TutorialState {
  step: TutorialStep;
  spawnDone: boolean;
  evolveDone: boolean;
  ultimateDone: boolean;
  dismissed: boolean;
}

export function defaultTutorialState(): TutorialState {
  return {
    step: 'spawn',
    spawnDone: false,
    evolveDone: false,
    ultimateDone: false,
    dismissed: false,
  };
}

export function loadTutorialState(store?: KeyValueStore): TutorialState {
  try {
    const raw = store
      ? store.getItem(TUTORIAL_STORAGE_KEY)
      : typeof localStorage !== 'undefined'
        ? localStorage.getItem(TUTORIAL_STORAGE_KEY)
        : null;

    if (!raw) return defaultTutorialState();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaultTutorialState();

    const validSteps: TutorialStep[] = ['spawn', 'evolve', 'ultimate', 'completed'];
    return {
      step: validSteps.includes(parsed.step) ? parsed.step : 'spawn',
      spawnDone: Boolean(parsed.spawnDone),
      evolveDone: Boolean(parsed.evolveDone),
      ultimateDone: Boolean(parsed.ultimateDone),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return defaultTutorialState();
  }
}

export function saveTutorialState(state: TutorialState, store?: KeyValueStore): void {
  try {
    const serialized = JSON.stringify(state);
    if (store) {
      store.setItem(TUTORIAL_STORAGE_KEY, serialized);
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, serialized);
    }
  } catch {
    // Storage quota or permission failsafe
  }
}

export interface TutorialCheckContext {
  stageId: number;
  playerUnitsSpawned: number;
  canEvolve: boolean;
  playerAge: string;
  ultimateReady: boolean;
  ultimateUsed: boolean;
}

export interface TutorialEvaluation {
  nextStep: TutorialStep;
  promptText: string | null;
  highlight: 'spawn' | 'evolve' | 'ultimate' | null;
}

/**
 * Pure evaluation of Stage 1 First-Run Coach (Deliverable B)
 * - Only active in Stage 1
 * - Inactive in skirmish (stageId 0) or stages 2..5
 * - Inactive once dismissed or completed
 */
export function evaluateTutorialStep(
  state: TutorialState,
  ctx: TutorialCheckContext
): TutorialEvaluation {
  // Hard gate: Stage 1 only, must not be dismissed or completed
  if (ctx.stageId !== 1 || state.dismissed || state.step === 'completed') {
    return { nextStep: 'completed', promptText: null, highlight: null };
  }

  // Moment 1: Spawn
  if (!state.spawnDone) {
    if (ctx.playerUnitsSpawned > 0) {
      state.spawnDone = true;
      state.step = 'evolve';
    } else {
      return {
        nextStep: 'spawn',
        promptText: 'Deploy a Clubman (Key 1)',
        highlight: 'spawn',
      };
    }
  }

  // Moment 2: Evolve (benefit <= 55 characters)
  if (!state.evolveDone) {
    if (ctx.playerAge !== 'stone') {
      state.evolveDone = true;
      state.step = 'ultimate';
    } else if (ctx.canEvolve) {
      return {
        nextStep: 'evolve',
        // 43 characters (<= 55 characters requirement)
        promptText: 'Evolve age: unlocks stronger units and tech',
        highlight: 'evolve',
      };
    }
  }

  // Moment 3: Ultimate
  if (!state.ultimateDone) {
    if (ctx.ultimateUsed) {
      state.ultimateDone = true;
      state.step = 'completed';
      return { nextStep: 'completed', promptText: null, highlight: null };
    } else if (ctx.ultimateReady) {
      return {
        nextStep: 'ultimate',
        promptText: 'Unleash Meteor (Space)',
        highlight: 'ultimate',
      };
    }
  }

  return { nextStep: state.step, promptText: null, highlight: null };
}

let lastAnnounced = '';

/**
 * Screen reader announcement via offscreen aria-live region.
 * Deduplicates to prevent announcement spam.
 */
export function announceLiveRegion(message: string): void {
  if (typeof document === 'undefined') return;
  if (!message || message === lastAnnounced) return;
  lastAnnounced = message;
  const el = document.getElementById('sr-announcements');
  if (el) {
    el.textContent = message;
  }
}

export function resetLiveRegionForTesting(): void {
  lastAnnounced = '';
}

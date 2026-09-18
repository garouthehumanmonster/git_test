/**
 * inputActions.ts — the key map, as a pure function.
 *
 * Lifting this out of the `create()` closure means the boot-replay path and the
 * live path go through exactly one implementation, so a press buffered during
 * scene boot cannot drift from a press typed mid-match. It also makes the map
 * testable without a browser.
 */

export interface InputModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface InputActions {
  togglePause(): void;
  toggleFullscreen(): void;
  spawn(kind: 'swarm' | 'tank' | 'ranged'): void;
  evolve(): void;
  upgrade(which: 'forge' | 'armor'): void;
  turret(): void;
  chronoSurge(): void;
  warCry(): void;
  reinforce(): void;
  ultimate(): void;
  cycleSpeed(): void;
  muteKey(mods: InputModifiers): void;
  /** Enter on the results card: next stage when the run was cleared, else retry. */
  resultsAdvance(): void;
  /** Space / R on the results card. */
  resultsRestart(): void;
}

export type KeyPhase = 'playing' | 'results';

/**
 * Apply one key press. Returns the name of the action taken, or null when the
 * key is not bound in this phase — the return value is what the tests assert on.
 */
export function dispatchKey(
  key: string,
  code: string,
  phase: KeyPhase,
  actions: InputActions,
  mods: InputModifiers = { shiftKey: false, ctrlKey: false, metaKey: false },
): string | null {
  // Available in both phases.
  if (key === 'p' || key === 'P' || code === 'Escape') {
    actions.togglePause();
    return 'pause';
  }
  if (key === 'f' || key === 'F') {
    actions.toggleFullscreen();
    return 'fullscreen';
  }

  if (phase === 'results') {
    if (code === 'Enter' || code === 'NumpadEnter') {
      actions.resultsAdvance();
      return 'advance';
    }
    if (code === 'Space' || key === 'r' || key === 'R') {
      actions.resultsRestart();
      return 'restart';
    }
    if (key === 'm' || key === 'M') {
      actions.muteKey(mods);
      return 'mute';
    }
    return null;
  }

  switch (key) {
    case '1': actions.spawn('swarm'); return 'spawn:swarm';
    case '2': actions.spawn('tank'); return 'spawn:tank';
    case '3': actions.spawn('ranged'); return 'spawn:ranged';
    case 'e': case 'E': actions.evolve(); return 'evolve';
    case 'u': case 'U': actions.upgrade('forge'); return 'upgrade:forge';
    case 'y': case 'Y': actions.upgrade('armor'); return 'upgrade:armor';
    case 't': case 'T': actions.turret(); return 'turret';
    case 'q': case 'Q': actions.chronoSurge(); return 'chronoSurge';
    case 'w': case 'W': actions.warCry(); return 'warCry';
    case 'c': case 'C': actions.reinforce(); return 'reinforce';
    case 'm': case 'M': actions.muteKey(mods); return 'mute';
    case 'x': case 'X': actions.cycleSpeed(); return 'cycleSpeed';
    case ' ': actions.ultimate(); return 'ultimate';
    default: return null;
  }
}

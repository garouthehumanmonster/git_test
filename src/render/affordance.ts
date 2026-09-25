/**
 * affordance.ts — the words the HUD shows for things the player can do, kept as
 * pure functions so the copy can be tested and so it cannot drift away from the
 * simulation state it describes.
 *
 * Two of these exist because the shipped HUD advertised half a rule: the evolve
 * banner said "press E to enter the Medieval Age" without mentioning that
 * evolution also costs 40 gold, so a broke player pressed E into silence. And
 * the speed chip read "> 1x", which never said whether the match was currently
 * at 1x or merely offering to leave it.
 */

import { TICK_MS } from '../sim/types';

export type EvolveTarget = 'medieval' | 'modern';

const AGE_LABEL: Record<EvolveTarget, string> = {
  medieval: 'the Medieval Age',
  modern: 'the Modern Age',
};

/**
 * Seconds of sim time in a tick count.
 *
 * Every HUD countdown used to do this arithmetic inline, and one of them was
 * written against a 100ms tick: the Chrono chip announced a 4s warp for a surge
 * the simulation runs for 40 ticks (2s at TICK_MS=50). Deriving it from
 * `TICK_MS` in one place is what stops that class of drift — the sim and the
 * readout can no longer disagree about how long a tick is.
 */
export function secondsFromTicks(ticks: number): number {
  return (ticks * TICK_MS) / 1000;
}

/**
 * Whole seconds to show on a countdown. Rounds up so the last partial tick
 * still reads "1s" instead of a chip that says "0s" while the effect is
 * visibly still running; negative or empty timers read 0.
 */
export function countdownSeconds(ticks: number): number {
  if (!(ticks > 0)) return 0;
  return Math.ceil(secondsFromTicks(ticks));
}

/** Speed cycles 1 -> 2 -> 3 -> 1. */
export function nextSpeed(current: number): number {
  return current === 1 ? 2 : current === 2 ? 3 : 1;
}

/** Names the multiplier actually in effect. */
export function speedLabel(speed: number, paused = false): string {
  return `${paused ? 'PAUSED ' : 'SPEED '}${speed}x`;
}

/** True when XP is ready but the gold gate is what is holding evolution back. */
export function evolveBlockedOnGold(opts: { cost: number; gold: number; xpReady: boolean }): boolean {
  return opts.xpReady && opts.gold < opts.cost;
}

/**
 * The status-line copy for the age-up affordance, or null when there is nothing
 * worth saying. Always names the gold cost — both gates, never one.
 */
export function evolveBannerText(opts: {
  nextAge: EvolveTarget;
  cost: number;
  gold: number;
  xpReady: boolean;
}): string | null {
  const { nextAge, cost, gold, xpReady } = opts;
  if (!xpReady) return null;
  if (gold >= cost) return `XP READY  |  press E (${cost} G) to enter ${AGE_LABEL[nextAge]}`;
  const short = Math.ceil(cost - gold);
  return `${AGE_LABEL[nextAge]} costs ${cost} G  -  short ${short} G`;
}

/** Which flavour of status line the subtitle is carrying. */
export type SubtitleKind =
  | 'help'
  | 'deploying'
  | 'alert'
  | 'push'
  | 'evolve'
  | 'warcry'
  | 'counter'
  | 'win'
  | 'draw'
  | 'lose';

export const SUBTITLE_COLORS: Record<SubtitleKind, string> = {
  // Ambient help is deliberately the dimmest of the entries a player reads;
  // the first cut of this palette had the alert red DARKER than the help text,
  // which is exactly backwards, and the luminance test caught it.
  help: '#9c7a45',
  deploying: '#7d6238',
  alert: '#ff8060',
  push: '#8fb84a',
  evolve: '#ffd166',
  warcry: '#ffb057',
  // The live counter callout has to beat the idle triangle, or the player
  // never notices that the line changed from a lesson into an order.
  counter: '#9fd4ff',
  win: '#8ef0b0',
  draw: '#8fd8f0',
  lose: '#ef5350',
};

/**
 * Colour for a status line. The idle hotkey help is deliberately the dimmest
 * entry so a genuine warning has somewhere to stand out from.
 */
export function subtitleColorHex(kind: SubtitleKind): string {
  return SUBTITLE_COLORS[kind];
}

// --- Counter triangle -------------------------------------------------------
// Swarm beats ranged, ranged beats tank, tank beats swarm. The HUD used to
// spend its only status line on a hotkey encyclopedia and never said this.

export type CounterRole = 'swarm' | 'tank' | 'ranged';

/** The role that beats `threat`. */
export const COUNTER_OF: Record<CounterRole, CounterRole> = {
  ranged: 'swarm',
  swarm: 'tank',
  tank: 'ranged',
};

const COUNTER_VERB: Record<CounterRole, string> = {
  swarm: 'shreds',
  tank: 'crushes',
  ranged: 'melts',
};

const COUNTER_HOTKEY: Record<CounterRole, string> = {
  swarm: '1',
  tank: '2',
  ranged: '3',
};

/** Menu legend. Age-agnostic on purpose: the select screen spans all three ages. */
export const COUNTER_LEGEND = 'SWARM beats RANGED   ·   RANGED beats TANK   ·   TANK beats SWARM';

export interface CounterAdvice {
  /** Button the player should press. */
  role: CounterRole;
  hotkey: string;
  /** Enemy role that is currently the problem. */
  threat: CounterRole;
  /** One line, names the on-screen button, never a synonym. */
  line: string;
}

function pluralUnit(label: string, count: number): string {
  if (count === 1) return label;
  if (label === 'Man-at-Arms') return 'Men-at-Arms';
  if (label.endsWith('s')) return label;
  return `${label}s`;
}

/**
 * What to deploy against the living enemy field.
 *
 * The dominant threat wins. Ties break ranged → tank → swarm: a slinger line
 * deletes tanks quietly, so it is the callout a tied field should not hide.
 * Returns null when the lane is empty — the caller shows the triangle instead.
 */
export function counterAdvice(opts: {
  counts: Record<CounterRole, number>;
  /** Singular button label for a role at the player's current age. */
  answerLabel: (role: CounterRole) => string;
  /** Singular label of the enemy unit in that role. */
  threatLabel: (role: CounterRole) => string;
}): CounterAdvice | null {
  const { counts, answerLabel, threatLabel } = opts;
  const order: CounterRole[] = ['ranged', 'tank', 'swarm'];
  let threat: CounterRole | null = null;
  let best = 0;
  for (const role of order) {
    const n = counts[role] ?? 0;
    if (n > best) {
      best = n;
      threat = role;
    }
  }
  if (!threat || best <= 0) return null;
  const role = COUNTER_OF[threat];
  const threatName = pluralUnit(threatLabel(threat), best);
  const answer = answerLabel(role);
  return {
    role,
    hotkey: COUNTER_HOTKEY[role],
    threat,
    line: `${threatName} incoming — ${answer} (${COUNTER_HOTKEY[role]}) ${COUNTER_VERB[role]} them`,
  };
}

/**
 * Idle line while the lane is empty. Names the three buttons, not "send the
 * swarm", which taught a third of the game and called it the whole thing.
 */
export function laneClearLine(label: (role: CounterRole) => string): string {
  return `Lane clear — ${label('swarm')} (1) beats ranged, ${label('tank')} (2) beats swarm, ${label('ranged')} (3) beats tanks`;
}

/**
 * The results-card footnote. A cleared skirmish and a cleared final stage have
 * no next level; telling the player to press Enter for one was a lie.
 */
export function resultsHint(opts: { cleared: boolean; hasNextStage: boolean; canRevive: boolean }): string {
  if (!opts.cleared) {
    return opts.canRevive ? 'Revive to keep fighting, or RETRY' : 'Press ENTER to retry';
  }
  return opts.hasNextStage ? 'Press ENTER for the next level' : 'Press ENTER to play again';
}

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

export type EvolveTarget = 'medieval' | 'modern';

const AGE_LABEL: Record<EvolveTarget, string> = {
  medieval: 'the Medieval Age',
  modern: 'the Modern Age',
};

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

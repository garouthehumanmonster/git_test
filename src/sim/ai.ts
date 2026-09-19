import {
  type Intent,
  type MatchRules,
  type Side,
  type SimState,
  type UnitRole,
  type UnitState,
  AGE_ORDER,
  AI_AGGRESSION,
  AI_THINK_TICKS,
  BASE_HP,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  LANE_WIDTH,
  MAX_UPGRADE_RANK,
  ULT_MAX,
  UNIT_DEFS,
  skirmishRules,
} from './types';
import { RNG } from './rng';
import {
  canBuildTurret,
  canEvolve,
  canSpawn,
  canUpgrade,
  createInitialState,
  tick,
  type TickOptions,
} from './sim';

/** Average x of a side's living units, or a fallback anchor when the lane is empty. */
export function clusterAnchor(state: SimState, side: Side): number {
  let sum = 0;
  let count = 0;
  for (const u of state.units) {
    if (u.side !== side || u.state === 'die') continue;
    sum += u.x;
    count++;
  }
  if (count === 0) return side === 'player' ? LANE_WIDTH * 0.75 : LANE_WIDTH * 0.25;
  return sum / count;
}

/** Tuning knobs for the shared lane brain. */
export interface BotProfile {
  aggression: number;
  weights: { swarm: number; tank: number; ranged: number };
  usesUltimate: boolean;
}

/**
 * The single lane brain. Both the in-match AI and the headless bot use it, with
 * their own profile, so a self-play balance run is a true mirror match and the
 * only asymmetry left in the game is the one the stage rules ask for.
 */
export function chooseBotIntent(state: SimState, side: Side, rng: RNG, profile: BotProfile): Intent | null {
  const me = side === 'player' ? state.player : state.ai;

  // Superweapons are checked before the think cadence so a charged meter is
  // spent the moment it fills rather than up to a second later.
  if (profile.usesUltimate && me.ultCharge >= ULT_MAX) {
    return { type: 'ultimate', side, x: clusterAnchor(state, side === 'player' ? 'ai' : 'player') };
  }
  if (state.tick % AI_THINK_TICKS !== 0) return null;

  const mineUnits = state.units.filter((u) => u.side === side && u.state !== 'die');
  const enemyUnits = state.units.filter((u) => u.side !== side && u.state !== 'die');
  const countRoles = (arr: UnitState[]) => {
    const c: Record<UnitRole, number> = { swarm: 0, tank: 0, ranged: 0 };
    for (const u of arr) c[u.def.role]++;
    return c;
  };
  const mine = countRoles(mineUnits);
  const theirs = countRoles(enemyUnits);

  // Base turret: a cheap, high-value purchase whenever the lane is contested.
  if (canBuildTurret(state, side) && (enemyUnits.length > 2 || state.tick > 600) && rng.next() < 0.3) {
    return { type: 'turret', side };
  }

  // Evolution check: evolve promptly once eligible!
  if (canEvolve(state, side)) {
    return { type: 'evolve', side };
  }

  // Check if AI has the XP needed for the next age and is saving gold
  const nextAgeIdx = AGE_ORDER.indexOf(me.age) + 1;
  const nextAge = nextAgeIdx < AGE_ORDER.length ? AGE_ORDER[nextAgeIdx] : null;
  const isSavingForAge = nextAge !== null && me.xp >= EVOLVE_XP_REQ[nextAge];
  const evolveCost = nextAge ? EVOLVE_COST[nextAge] : 0;

  // Upgrades — skipped while saving for an age-up so evolution is not starved.
  if (!isSavingForAge && (me.forgeRank < MAX_UPGRADE_RANK || me.armorRank < MAX_UPGRADE_RANK)) {
    const hpRatio = me.baseHp / BASE_HP;
    const wantArmor = hpRatio < 0.75 && me.armorRank <= me.forgeRank;
    const picks: Array<'forge' | 'armor'> = wantArmor ? ['armor', 'forge'] : ['forge', 'armor'];
    for (const pick of picks) {
      if (canUpgrade(state, side, pick) && rng.next() < 0.35) {
        return { type: 'upgrade', side, which: pick };
      }
    }
  }

  // Counter-composition: lean into whatever beats what the enemy is fielding.
  const weights: Array<readonly [UnitRole, number]> = [
    ['swarm', Math.max(0.12, profile.weights.swarm * (1 + theirs.ranged * 1.1 - mine.swarm * 0.5))] as const,
    ['tank', Math.max(0.12, profile.weights.tank * (1 + theirs.swarm * 1.1 - mine.tank * 0.5))] as const,
    ['ranged', Math.max(0.12, profile.weights.ranged * (1 + theirs.tank * 1.1 - mine.ranged * 0.5))] as const,
  ];

  // Protect evolution gold reserve unless base integrity is in critical danger
  const baseDanger = me.baseHp < BASE_HP * 0.35;
  const reserve = isSavingForAge && !baseDanger ? evolveCost : (1 - profile.aggression) * 18;
  for (let tries = 0; tries < 4; tries++) {
    const role = rng.weighted(weights);
    const def = UNIT_DEFS[me.age][role];
    if (me.gold >= def.cost + reserve && canSpawn(state, side, role)) {
      return { type: 'spawn', side, role };
    }
  }
  return null;
}

/** Baseline profile for the headless balance bot and the sim test harness. */
export function baselineProfile(): BotProfile {
  return { aggression: AI_AGGRESSION, weights: { swarm: 1, tank: 1, ranged: 1 }, usesUltimate: true };
}

/**
 * Decide this tick's intent for `side` using the shared lane brain and the
 * baseline profile. Used by the headless balance runner and the test harness.
 *
 * The RNG is a parallel stream (`state.rngState ^ constant`) rather than the
 * match stream, so a bot-driven side can be added to a match without shifting
 * the RNG sequence that the AI and the sim itself draw from.
 */
export function botIntentsFor(state: SimState, side: Side): Intent[] {
  const rng = new RNG(state.rngState ^ (side === 'player' ? 0x9e3779b9 : 0x85ebca6b));
  const intent = chooseBotIntent(state, side, rng, baselineProfile());
  return intent ? [intent] : [];
}

/**
 * Run a headless match where BOTH sides use the same bot logic. Useful for
 * balance tuning, determinism checks, and CI smoke tests.
 */
export function simulateBotMatch(seed = 0xC0FFEE, maxTicks = 8000, rules: MatchRules = skirmishRules()): {
  result: 'win' | 'loss' | 'draw' | 'timeout';
  ticks: number;
  finalState: SimState;
} {
  const s = createInitialState(seed, rules);
  // Both sides are driven by `botIntentsFor` with the built-in AI brain off, so
  // the only difference between them is the RNG stream — a real mirror match.
  const drive: TickOptions = { aiBrain: false };
  while (s.result === 'playing' && s.tick < maxTicks) {
    const intents: Intent[] = s.tick % AI_THINK_TICKS === 0
      ? [...botIntentsFor(s, 'player'), ...botIntentsFor(s, 'ai')]
      : [];
    tick(s, intents, drive);
  }
  return {
    result: s.result === 'playing' ? 'timeout' : s.result,
    ticks: s.tick,
    finalState: s,
  };
}

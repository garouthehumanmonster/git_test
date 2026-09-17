import { describe, it, expect } from 'vitest';
import {
  botIntentsFor,
  canReinforce,
  createInitialState,
  reinforceBlockReason,
  reinforceCostFor,
  tick,
} from '../../src/sim/sim';
import {
  AI_THINK_TICKS,
  BASE_HP,
  GOLD_PER_TICK,
  PLAYER_BASE_X,
  REINFORCE_COOLDOWN_TICKS,
  REINFORCE_COSTS,
  REINFORCE_MAX_PURCHASES,
  REINFORCE_ROLES,
  REINFORCE_SQUAD_SIZE,
  REINFORCE_SPACING_PX,
  SPAWN_BUFFER_PX,
  reinforceCost,
  skirmishRules,
} from '../../src/sim/types';

/**
 * The late-game gold sink. A real match banked 2778 unspent gold because
 * cooldowns, not the economy, limited every decision — so the call-up has to be
 * expensive, capped, cooled down, and impossible to fake.
 */
describe('reinforcement call-up', () => {
  it('prices each purchase from the age table and escalates', () => {
    expect(reinforceCost('stone', 0)).toBe(REINFORCE_COSTS.stone[0]);
    expect(reinforceCost('stone', 1)).toBeGreaterThan(reinforceCost('stone', 0)!);
    expect(reinforceCost('modern', 0)).toBeGreaterThan(reinforceCost('stone', 0)!);
    // Past the table it clamps rather than returning undefined.
    expect(reinforceCost('stone', 99)).toBe(REINFORCE_COSTS.stone[REINFORCE_COSTS.stone.length - 1]);
  });

  it('refuses the purchase when the player cannot afford it', () => {
    const s = createInitialState(5, skirmishRules());
    s.player.gold = reinforceCostFor(s, 'player')! - 1;
    expect(canReinforce(s, 'player')).toBe(false);
    expect(reinforceBlockReason(s, 'player')).toMatch(/more gold/);
    s.player.gold = reinforceCostFor(s, 'player')!;
    expect(canReinforce(s, 'player')).toBe(true);
    expect(reinforceBlockReason(s, 'player')).toBeNull();
  });

  it('deducts exactly the listed cost and deploys a real squad', () => {
    const s = createInitialState(5, skirmishRules());
    const cost = reinforceCostFor(s, 'player')!;
    s.player.gold = cost + 40;
    const spawnedBefore = s.stats.unitsSpawned.player;
    tick(s, [{ type: 'reinforce', side: 'player' }]);
    // Passive income for the same tick is added on top of the deduction.
    expect(s.player.gold).toBeCloseTo(40 + GOLD_PER_TICK, 5);
    expect(s.player.reinforceUsed).toBe(1);
    expect(s.stats.unitsSpawned.player).toBe(spawnedBefore + REINFORCE_SQUAD_SIZE);
    const squad = s.units.filter((u) => u.side === 'player');
    expect(squad).toHaveLength(REINFORCE_SQUAD_SIZE);
    // Mixed squad: the counter triangle stays intact instead of dumping one role.
    expect(squad.map((u) => u.def.role).sort()).toEqual([...REINFORCE_ROLES].slice(0, REINFORCE_SQUAD_SIZE).sort());
    // Staggered behind the apron, so the 14px spawn block never rejects them.
    // (One tick of walking happens in the same step, hence the small slack.)
    const xs = squad.map((u) => u.x);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(PLAYER_BASE_X + 5);
      expect(x).toBeLessThanOrEqual(PLAYER_BASE_X + SPAWN_BUFFER_PX + 4);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(REINFORCE_SPACING_PX);
    expect(s.events.some((e) => e.kind === 'reinforce')).toBe(true);
  });

  it('starts a cooldown that blocks the next purchase until it expires', () => {
    const s = createInitialState(5, skirmishRules());
    s.player.gold = 100000;
    tick(s, [{ type: 'reinforce', side: 'player' }]);
    expect(s.player.reinforceCooldown).toBeGreaterThan(0);
    expect(canReinforce(s, 'player')).toBe(false);
    expect(reinforceBlockReason(s, 'player')).toMatch(/Cooldown/);
    // An intent pushed during the cooldown is a no-op, not a silent failure.
    const goldAfterFirst = s.player.gold;
    tick(s, [{ type: 'reinforce', side: 'player' }]);
    expect(s.player.reinforceUsed).toBe(1);
    expect(s.player.gold).toBeGreaterThan(goldAfterFirst); // only passive income
    for (let i = 0; i < REINFORCE_COOLDOWN_TICKS; i++) tick(s, []);
    expect(s.player.reinforceCooldown).toBe(0);
    expect(canReinforce(s, 'player')).toBe(true);
  });

  it('caps purchases per match and says so', () => {
    const s = createInitialState(5, skirmishRules());
    s.player.gold = 1_000_000;
    for (let i = 0; i < REINFORCE_MAX_PURCHASES + 2; i++) {
      tick(s, [{ type: 'reinforce', side: 'player' }]);
      for (let c = 0; c < REINFORCE_COOLDOWN_TICKS; c++) {
        tick(s, []);
        // Pin the bases so this stays a test about the cap, not about defence.
        s.player.baseHp = BASE_HP;
        s.ai.baseHp = BASE_HP;
      }
    }
    expect(s.player.reinforceUsed).toBe(REINFORCE_MAX_PURCHASES);
    expect(reinforceCostFor(s, 'player')).toBeNull();
    expect(canReinforce(s, 'player')).toBe(false);
    expect(reinforceBlockReason(s, 'player')).toMatch(/Cap reached/);
    expect(s.stats.unitsSpawned.player).toBe(REINFORCE_MAX_PURCHASES * REINFORCE_SQUAD_SIZE);
  });

  it('is unavailable once the match is over', () => {
    const s = createInitialState(5, skirmishRules());
    s.player.gold = 100000;
    s.result = 'loss';
    expect(canReinforce(s, 'player')).toBe(false);
    expect(reinforceBlockReason(s, 'player')).toBe('Match over');
  });

  it('is a genuine sink: four modern call-ups cost more than a banked 2778-gold match needs to spend', () => {
    const total = REINFORCE_COSTS.modern.reduce((a, b) => a + b, 0);
    expect(REINFORCE_MAX_PURCHASES).toBe(REINFORCE_COSTS.modern.length);
    expect(total).toBeGreaterThan(1500);
  });

  it('is fully replay-deterministic', () => {
    const run = () => {
      const s = createInitialState(9001, skirmishRules());
      s.player.gold = 5000;
      for (let t = 0; t < 1400; t++) {
        const intents = t % 5 === 0 ? [{ type: 'reinforce', side: 'player' as const }] : [];
        tick(s, intents);
        s.player.gold += 30; // stand in for a fat late-game treasury
      }
      return {
        used: s.player.reinforceUsed,
        cd: s.player.reinforceCooldown,
        gold: Math.round(s.player.gold * 100) / 100,
        spawned: s.stats.unitsSpawned.player,
        ids: s.units.map((u) => `${u.id}:${u.def.role}:${u.x.toFixed(3)}`),
        rng: s.rngState,
      };
    };
    expect(run()).toEqual(run());
  });

  it('leaves the reserve-queue contract intact: a squad still queues behind the front line', () => {
    // Product contract from the engagement suite: queued units are marked as
    // reserves. The call-up must not be a way around the front-line cap.
    const s = createInitialState(4242, skirmishRules());
    s.player.gold = 600;
    tick(s, [{ type: 'reinforce', side: 'player' }]);
    let sawReserve = false;
    for (let t = 0; t < 2500 && s.result === 'playing'; t++) {
      const intents = t % AI_THINK_TICKS === 0 ? botIntentsFor(s, 'player') : [];
      if (t % 5 === 0) s.player.gold = Math.max(s.player.gold, 600);
      tick(s, intents);
      if (s.units.some((u) => u.reserve)) sawReserve = true;
    }
    expect(sawReserve).toBe(true);
  });
});

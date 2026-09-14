import { describe, it, expect } from 'vitest';
import { canSpawn, canEvolve, canUpgrade, createInitialState, simulateBotMatch, tick } from '../../src/sim/sim';
import { ARMOR_COSTS, EVOLVE_COST, EVOLVE_XP_REQ, BASE_HP } from '../../src/sim/types';

describe('simulation', () => {
  it('starts in a clean playing state', () => {
    const s = createInitialState(1);
    expect(s.result).toBe('playing');
    expect(s.player.baseHp).toBe(BASE_HP);
    expect(s.ai.baseHp).toBe(BASE_HP);
    expect(s.units).toHaveLength(0);
    expect(s.tick).toBe(0);
  });

  it('spawns a player unit and consumes gold + applies lock', () => {
    const s = createInitialState(1);
    expect(canSpawn(s, 'player', 'swarm')).toBe(true);
    // Tick with a player-spawn intent; AI may also spawn on its cadence, so we
    // only assert the player-side guarantees.
    tick(s, [{ type: 'spawn', side: 'player', role: 'swarm' }]);
    const playerUnits = s.units.filter((u) => u.side === 'player');
    expect(playerUnits).toHaveLength(1);
    expect(s.player.gold).toBeLessThan(40);
    expect(s.player.spawnLockTicks).toBeGreaterThan(0);
    expect(playerUnits[0]!.def.role).toBe('swarm');
  });

  it('rejects spawn when locked or too poor', () => {
    const s = createInitialState(1);
    s.player.gold = 0;
    expect(canSpawn(s, 'player', 'tank')).toBe(false);
    s.player.gold = 100;
    s.player.spawnLockTicks = 3;
    expect(canSpawn(s, 'player', 'tank')).toBe(false);
  });

  it('evolves only with enough xp and gold', () => {
    const s = createInitialState(1);
    expect(canEvolve(s, 'player')).toBe(false);
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = EVOLVE_COST.medieval - 1;
    expect(canEvolve(s, 'player')).toBe(false);
    s.player.gold = EVOLVE_COST.medieval;
    expect(canEvolve(s, 'player')).toBe(true);
    tick(s, [{ type: 'evolve', side: 'player' }]);
    expect(s.player.age).toBe('medieval');
  });

  it('applies armor upgrades to existing units and keeps the economy gate', () => {
    const s = createInitialState(1);
    s.player.gold = 100;
    tick(s, [{ type: 'spawn', side: 'player', role: 'swarm' }]);
    const unit = s.units.find((u) => u.side === 'player');
    expect(unit).toBeDefined();
    const oldHp = unit!.hp;
    s.player.gold = ARMOR_COSTS.stone[0]! - 1;
    expect(canUpgrade(s, 'player', 'armor')).toBe(false);
    s.player.gold = ARMOR_COSTS.stone[0]!;
    tick(s, [{ type: 'upgrade', side: 'player', which: 'armor' }]);
    expect(s.player.armorRank).toBe(1);
    expect(unit!.hp).toBeGreaterThan(oldHp);
    expect(unit!.hp).toBeLessThanOrEqual(unit!.def.hp * 1.15);
  });

  it('reaches a terminal state under bot self-play within time limit', () => {
    const m = simulateBotMatch(42, 8000);
    expect(['win', 'loss']).toContain(m.result);
    expect(m.finalState.player.baseHp <= 0 || m.finalState.ai.baseHp <= 0).toBe(true);
  });

  it('is deterministic from same seed', () => {
    const a = simulateBotMatch(7, 8000);
    const b = simulateBotMatch(7, 8000);
    expect(a.result).toBe(b.result);
    expect(a.ticks).toBe(b.ticks);
    expect(a.finalState.player.baseHp).toBeCloseTo(b.finalState.player.baseHp, 2);
    expect(a.finalState.ai.baseHp).toBeCloseTo(b.finalState.ai.baseHp, 2);
  });
});

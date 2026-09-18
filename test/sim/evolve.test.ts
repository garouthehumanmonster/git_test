import { describe, expect, it } from 'vitest';
import {
  canEvolve, createInitialState, evolveBlockReason, tick, type SimState,
} from '../../src/sim/sim';
import { EVOLVE_COST, EVOLVE_XP_REQ, skirmishRules } from '../../src/sim/types';
import { evolveBannerText, evolveBlockedOnGold } from '../../src/render/affordance';

function fresh(): SimState {
  const s = createInitialState(1234, skirmishRules());
  // Keep the match out of the AI's hands for a readable fixture.
  s.ai.gold = 0;
  return s;
}

describe('evolveBlockReason', () => {
  it('reports the XP gate first', () => {
    const s = fresh();
    s.player.xp = 0;
    s.player.gold = 999;
    expect(evolveBlockReason(s, 'player')).toBe(`Need ${EVOLVE_XP_REQ.medieval} more XP`);
  });

  it('reports the gold gate once XP is ready', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = 0;
    expect(evolveBlockReason(s, 'player')).toBe(`Need ${EVOLVE_COST.medieval} more gold (${EVOLVE_COST.medieval} G)`);
  });

  it('states the exact shortfall for a partial purse', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = 15;
    expect(evolveBlockReason(s, 'player')).toBe(`Need 25 more gold (${EVOLVE_COST.medieval} G)`);
  });

  it('returns null exactly when the age-up would go through', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = EVOLVE_COST.medieval;
    expect(evolveBlockReason(s, 'player')).toBeNull();
    expect(canEvolve(s, 'player')).toBe(true);
  });

  it('reports the cooldown', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = 999;
    s.player.evolveLockTicks = 40;
    expect(evolveBlockReason(s, 'player')).toContain('Cooling down');
    expect(canEvolve(s, 'player')).toBe(false);
  });

  it('refuses at the final age', () => {
    const s = fresh();
    s.player.age = 'modern';
    s.player.xp = 999;
    s.player.gold = 999;
    expect(evolveBlockReason(s, 'player')).toBe('Already at the Modern Age');
  });

  it('refuses once the match is over', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = 999;
    s.result = 'win';
    expect(evolveBlockReason(s, 'player')).toBe('Match over');
  });

  it('never disagrees with canEvolve across a sweep of states', () => {
    for (let xp = 0; xp <= 30; xp += 6) {
      for (let gold = 0; gold <= 60; gold += 12) {
        const s = fresh();
        s.player.xp = xp;
        s.player.gold = gold;
        expect(evolveBlockReason(s, 'player') === null, `xp=${xp} gold=${gold}`)
          .toBe(canEvolve(s, 'player'));
      }
    }
  });

  it('survives a real evolve through the public step', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    s.player.gold = EVOLVE_COST.medieval;
    tick(s, [{ type: 'evolve', side: 'player' }]);
    expect(s.player.age).toBe('medieval');
  });
});

/**
 * The HUD dims the E chip on `canEvolve` and writes its banner from
 * `evolveBannerText`. If those two ever disagree the player gets a lit button
 * that refuses, or a dimmed one that would have worked.
 */
describe('banner text and dimmed chip agree', () => {
  it('dims exactly when the banner reports a shortfall', () => {
    const s = fresh();
    s.player.xp = EVOLVE_XP_REQ.medieval;
    const cost = EVOLVE_COST.medieval;
    for (let gold = 0; gold <= cost + 10; gold += 7) {
      s.player.gold = gold;
      const blocked = evolveBlockedOnGold({ nextAge: 'medieval', cost, gold, xpReady: true });
      const banner = evolveBannerText({ nextAge: 'medieval', cost, gold, xpReady: true })!;
      expect(blocked, `gold=${gold}`).toBe(gold < cost);
      expect(canEvolve(s, 'player'), `gold=${gold}`).toBe(!blocked);
      if (blocked) expect(banner, `gold=${gold}`).toMatch(/short \d+ G/);
      else expect(banner, `gold=${gold}`).toMatch(/press E \(\d+ G\)/);
    }
  });
});

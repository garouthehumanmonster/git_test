import { describe, it, expect } from 'vitest';
import { createInitialState, tick, simulateBotMatch } from '../../src/sim/sim';
import type { Intent } from '../../src/sim/types';

describe('golden determinism replay', () => {
  it('guarantees identical state hashes across two identical intent replays', () => {
    const seed = 0xabcdef12;
    const runReplay = () => {
      const s = createInitialState(seed);
      const history: Array<{ tick: number; units: number; pGold: number; aGold: number; pHp: number; aHp: number; rng: number }> = [];

      for (let t = 0; t < 400; t++) {
        const intents: Intent[] = [];
        if (t === 10) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
        if (t === 25) intents.push({ type: 'spawn', side: 'player', role: 'tank' });
        if (t === 50) intents.push({ type: 'spawn', side: 'player', role: 'ranged' });
        if (t === 100) intents.push({ type: 'upgrade', side: 'player', which: 'forge' });
        if (t === 150) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
        if (t === 200) intents.push({ type: 'upgrade', side: 'player', which: 'armor' });

        tick(s, intents);

        if (t % 50 === 0 || t === 399) {
          history.push({
            tick: s.tick,
            units: s.units.length,
            pGold: Math.round(s.player.gold * 100) / 100,
            aGold: Math.round(s.ai.gold * 100) / 100,
            pHp: Math.round(s.player.baseHp * 10) / 10,
            aHp: Math.round(s.ai.baseHp * 10) / 10,
            rng: s.rngState,
          });
        }
      }
      return { finalState: s, history };
    };

    const runA = runReplay();
    const runB = runReplay();

    // Byte-for-byte history match
    expect(runA.history).toEqual(runB.history);

    // Deep unit alignment
    expect(runA.finalState.units.length).toBe(runB.finalState.units.length);
    for (let i = 0; i < runA.finalState.units.length; i++) {
      const uA = runA.finalState.units[i]!;
      const uB = runB.finalState.units[i]!;
      expect(uA.id).toBe(uB.id);
      expect(uA.x).toBe(uB.x);
      expect(uA.hp).toBe(uB.hp);
      expect(uA.kills).toBe(uB.kills);
      expect(uA.vet).toBe(uB.vet);
    }
  });

  it('guarantees golden consistency for seed 42 in headless bot match', () => {
    const match = simulateBotMatch(42, 6000);
    const match2 = simulateBotMatch(42, 6000);
    expect(match.result).toBe(match2.result);
    expect(match.ticks).toBe(match2.ticks);
    expect(match.finalState.player.baseHp).toBe(match2.finalState.player.baseHp);
    expect(match.finalState.ai.baseHp).toBe(match2.finalState.ai.baseHp);
    expect(match.finalState.rngState).toBe(match2.finalState.rngState);
  });
});

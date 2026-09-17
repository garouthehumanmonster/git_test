import { describe, it, expect } from 'vitest';
import { createInitialState, resolveMatchEnd, step, tick } from '../../src/sim/sim';
import {
  COLLAPSE_HP_TIE_EPSILON,
  COLLAPSE_START_TICK,
  BASE_SIEGE_RANGE,
  AI_BASE_X,
  collapseRate,
  skirmishRules,
} from '../../src/sim/types';

/**
 * Regression coverage for the Timeline Collapse resolution bug: a player who
 * out-fought the AI 151-16 was handed a DEFEAT because both bases hit zero on
 * the same tick and the old win/loss check tested the player's base first.
 * A simultaneous zero is now resolved by a documented tiebreak ladder and can
 * legitimately end in a draw.
 */

/** A tick whose collapse drain is 1.0 HP — enough to take both bases at once. */
const COLLAPSE_TICK = COLLAPSE_START_TICK + 1857;

/** Build a state sitting on the collapse tick with an empty lane (no combat noise). */
function collapseState(playerHp: number, aiHp: number) {
  const s = createInitialState(1234, skirmishRules());
  s.units = [];
  s.projectiles = [];
  s.strikes = [];
  s.tick = COLLAPSE_TICK;
  s.player.baseHp = playerHp;
  s.ai.baseHp = aiHp;
  return s;
}

describe('timeline collapse resolution (helper)', () => {
  it('does nothing while both bases are still standing', () => {
    const s = collapseState(400, 400);
    resolveMatchEnd(s, 400, 400);
    expect(s.result).toBe('playing');
    expect(s.endReason).toBeUndefined();
  });

  it('gives the win to the side with more base HP before the collapse tick', () => {
    const s = collapseState(0.9, 0.5);
    s.player.baseHp = -0.1;
    s.ai.baseHp = -0.5;
    resolveMatchEnd(s, 0.9, 0.5);
    expect(s.result).toBe('win');
    expect(s.endReason).toBe('collapseBaseHp');
    expect(s.endHpSnapshot).toEqual({ player: 0.9, ai: 0.5 });
  });

  it('gives the loss to the side with less base HP before the collapse tick', () => {
    const s = collapseState(0.5, 0.9);
    s.player.baseHp = -0.5;
    s.ai.baseHp = -0.1;
    resolveMatchEnd(s, 0.5, 0.9);
    expect(s.result).toBe('loss');
    expect(s.endReason).toBe('collapseBaseHp');
  });

  it('falls back to net base damage when the HP is level', () => {
    const s = collapseState(0.7, 0.7);
    s.player.baseHp = -0.3;
    s.ai.baseHp = -0.3;
    s.stats.baseDamage.player = 480;
    s.stats.baseDamage.ai = 90;
    resolveMatchEnd(s, 0.7, 0.7);
    expect(s.result).toBe('win');
    expect(s.endReason).toBe('collapseBaseDamage');
  });

  it('awards the base-damage tiebreak to the AI when it leaked less', () => {
    const s = collapseState(0.7, 0.7);
    s.player.baseHp = -0.3;
    s.ai.baseHp = -0.3;
    s.stats.baseDamage.player = 40;
    s.stats.baseDamage.ai = 520;
    resolveMatchEnd(s, 0.7, 0.7);
    expect(s.result).toBe('loss');
    expect(s.endReason).toBe('collapseBaseDamage');
  });

  it('falls back to kills when HP and base damage are both level', () => {
    const s = collapseState(0.7, 0.7);
    s.player.baseHp = -0.3;
    s.ai.baseHp = -0.3;
    s.stats.baseDamage.player = 120;
    s.stats.baseDamage.ai = 120;
    s.stats.kills.player = 151;
    s.stats.kills.ai = 16;
    resolveMatchEnd(s, 0.7, 0.7);
    expect(s.result).toBe('win');
    expect(s.endReason).toBe('collapseKills');
  });

  it('returns an explicit DRAW instead of an AI victory when nothing separates them', () => {
    const s = collapseState(0.7, 0.7);
    s.player.baseHp = -0.3;
    s.ai.baseHp = -0.3;
    s.stats.baseDamage.player = 120;
    s.stats.baseDamage.ai = 120;
    s.stats.kills.player = 42;
    s.stats.kills.ai = 42;
    resolveMatchEnd(s, 0.7, 0.7);
    expect(s.result).toBe('draw');
    expect(s.endReason).toBe('collapseDraw');
  });

  it('keeps an ordinary defeat when only the player base falls', () => {
    const s = collapseState(0.5, 500);
    s.player.baseHp = -0.5;
    resolveMatchEnd(s, 0.5, 500);
    expect(s.result).toBe('loss');
    expect(s.endReason).toBe('playerBaseDestroyed');
  });

  it('keeps an ordinary victory when only the enemy base falls', () => {
    const s = collapseState(500, -1);
    s.ai.baseHp = -1;
    resolveMatchEnd(s, 500, 12);
    expect(s.result).toBe('win');
    expect(s.endReason).toBe('enemyBaseDestroyed');
  });

  it('treats sub-epsilon HP differences as a tie rather than a coin flip', () => {
    const s = collapseState(0.7, 0.7);
    s.player.baseHp = -0.3;
    s.ai.baseHp = -0.3;
    expect(COLLAPSE_HP_TIE_EPSILON).toBeGreaterThan(0);
    resolveMatchEnd(s, 0.7, 0.7 - COLLAPSE_HP_TIE_EPSILON / 2);
    expect(s.endReason).not.toBe('collapseBaseHp');
  });
});

describe('timeline collapse resolution (public simulation step)', () => {
  it('drives a simultaneous zero to a DRAW through tick(), not a defeat', () => {
    const s = collapseState(0.7, 0.7);
    const drain = collapseRate(COLLAPSE_TICK);
    expect(drain).toBeGreaterThan(0.7);
    step(s, []);
    expect(s.player.baseHp).toBeLessThanOrEqual(0);
    expect(s.ai.baseHp).toBeLessThanOrEqual(0);
    expect(s.result).toBe('draw');
    expect(s.endReason).toBe('collapseDraw');
    expect(s.events.some((e) => e.kind === 'gameover' && e.result === 'draw')).toBe(true);
  });

  it('lets the player win the collapse tiebreak through tick() after out-sieging the AI', () => {
    // Real siege damage first: a player tank pounds the AI base while the AI has
    // no gold to answer, so baseDamage.player > 0 and baseDamage.ai === 0.
    const s = createInitialState(31, skirmishRules());
    s.ai.gold = 0;
    tick(s, [{ type: 'spawn', side: 'player', role: 'tank' }]);
    const tank = s.units.find((u) => u.side === 'player')!;
    tank.x = AI_BASE_X - BASE_SIEGE_RANGE + 4;
    tank.hp = 5000;
    for (let i = 0; i < 40; i++) {
      tank.x = AI_BASE_X - BASE_SIEGE_RANGE + 4;
      tank.hp = 5000;
      s.ai.gold = 0;
      tick(s, []);
    }
    expect(s.stats.baseDamage.player).toBeGreaterThan(0);
    expect(s.stats.baseDamage.ai).toBe(0);

    // Now put both bases on the brink and let the collapse take them together.
    s.units = [];
    s.projectiles = [];
    s.strikes = [];
    s.tick = COLLAPSE_TICK;
    s.player.baseHp = 0.7;
    s.ai.baseHp = 0.7;
    tick(s, []);
    expect(s.result).toBe('win');
    expect(s.endReason).toBe('collapseBaseDamage');
  });

  it('records siege damage in sim state so the tiebreak survives a replay', () => {
    const run = () => {
      const s = createInitialState(77, skirmishRules());
      s.ai.gold = 0;
      tick(s, [{ type: 'spawn', side: 'player', role: 'tank' }]);
      const tank = s.units.find((u) => u.side === 'player')!;
      for (let i = 0; i < 30; i++) {
        tank.x = AI_BASE_X - BASE_SIEGE_RANGE + 4;
        tank.hp = 5000;
        s.ai.gold = 0;
        tick(s, []);
      }
      return { dmg: s.stats.baseDamage.player, hp: s.ai.baseHp };
    };
    expect(run()).toEqual(run());
    expect(run().dmg).toBeGreaterThan(0);
  });

  it('resolves identically across two identical replays of a collapse match', () => {
    const run = () => {
      const s = collapseState(0.7, 0.7);
      s.stats.kills.player = 7;
      s.stats.kills.ai = 7;
      tick(s, []);
      return { result: s.result, reason: s.endReason, snapshot: s.endHpSnapshot, rng: s.rngState };
    };
    expect(run()).toEqual(run());
  });

  it('never silently converts a simultaneous zero into a loss across a real batch', () => {
    // Every collapse-decided verdict must name a tiebreak, and a draw must be a
    // draw — never a loss wearing a draw's clothes.
    for (const seed of [3, 11, 4242, 7919]) {
      const s = collapseState(0.7, 0.7);
      s.stats.baseDamage.player = seed % 2 === 0 ? 300 : 0;
      s.stats.baseDamage.ai = seed % 2 === 0 ? 0 : 300;
      tick(s, []);
      expect(['win', 'loss', 'draw']).toContain(s.result);
      expect(s.endReason).toBeDefined();
      if (s.endReason === 'collapseDraw') expect(s.result).toBe('draw');
    }
  });
});

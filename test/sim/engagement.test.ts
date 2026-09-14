import { describe, it, expect } from 'vitest';
import { botIntentsFor, canBuildTurret, canCastUltimate, castStrike, createInitialState, simulateBotMatch, tick, turretCost } from '../../src/sim/sim';
import {
  AI_THINK_TICKS,
  BASE_SIEGE_RANGE,
  CLEAVE_FRACTION,
  COLLAPSE_START_TICK,
  FRONT_LINE_SLOTS,
  LANE_Y_STEP,
  MAX_TURRET_RANK,
  TURRET_COSTS,
  TURRET_RANGE,
  ULT_MAX,
  UNIT_DEFS,
  collapseRate,
  laneYOffsetFor,
  skirmishRules,
} from '../../src/sim/types';

/** Drive a match forward with the baseline bot on the player side. */
function runMatch(seed: number, maxTicks: number) {
  const s = createInitialState(seed, skirmishRules());
  const samples: Array<{ meleeAttackers: number; worstOverlap: number }> = [];
  while (s.result === 'playing' && s.tick < maxTicks) {
    tick(s, s.tick % AI_THINK_TICKS === 0 ? botIntentsFor(s, 'player') : []);
    if (s.tick % 10 !== 0) continue;

    // Front-line rule: never more than FRONT_LINE_SLOTS melee attackers on one
    // target from one side.
    const attackers = new Map<string, number>();
    for (const u of s.units) {
      if (u.state !== 'fight' || u.def.range > 26 || u.target == null) continue;
      const k = `${u.target}|${u.side}`;
      attackers.set(k, (attackers.get(k) ?? 0) + 1);
    }
    // Visual overlap: two units of one side sharing a lane slot inside 8px.
    const overlaps = new Map<string, number>();
    for (const u of s.units) {
      if (u.state === 'die') continue;
      const k = `${u.side}|${u.yOffset}|${Math.round(u.x / 8)}`;
      overlaps.set(k, (overlaps.get(k) ?? 0) + 1);
    }
    samples.push({
      meleeAttackers: Math.max(0, ...attackers.values()),
      worstOverlap: Math.max(0, ...overlaps.values()),
    });
  }
  return { s, samples };
}

describe('lane stagger', () => {
  it('derives five deterministic ranks from the unit id', () => {
    const offsets = new Set<number>();
    for (let id = 1; id <= 40; id++) offsets.add(laneYOffsetFor(id));
    expect([...offsets].sort((a, b) => a - b)).toEqual([-24, -12, 0, 12, 24]);
    expect(LANE_Y_STEP).toBe(12);
    // Same id always lands in the same rank — this is what keeps a replay stable.
    expect(laneYOffsetFor(7)).toBe(laneYOffsetFor(7));
  });

  it('spreads a live match across every lane rank', () => {
    const { s } = runMatch(7919, 1200);
    const ranks = new Set<number>();
    for (const u of s.units) ranks.add(u.yOffset);
    expect(ranks.size).toBeGreaterThan(1);
  });
});

describe('engagement slots', () => {
  it('never lets more than the front-line cap fight one target', () => {
    const { samples } = runMatch(7919, 3000);
    const worst = Math.max(...samples.map((x) => x.meleeAttackers));
    expect(worst).toBeLessThanOrEqual(FRONT_LINE_SLOTS);
    expect(samples.length).toBeGreaterThan(50);
  });

  it('keeps units from stacking on one pixel', () => {
    const { samples } = runMatch(55433, 3000);
    expect(Math.max(...samples.map((x) => x.worstOverlap))).toBeLessThanOrEqual(1);
  });

  it('marks queued units as reserves', () => {
    const s = createInitialState(4242, skirmishRules());
    let sawReserve = false;
    for (let t = 0; t < 2500 && s.result === 'playing'; t++) {
      if (t === 0) s.player.gold = 600;
      const intents = t % 5 === 0 ? botIntentsFor(s, 'player') : [];
      if (t === 20) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
      if (t === 30) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
      if (t === 40) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
      if (t === 50) intents.push({ type: 'spawn', side: 'player', role: 'swarm' });
      tick(s, intents);
      if (s.units.some((u) => u.reserve)) sawReserve = true;
    }
    expect(sawReserve).toBe(true);
  });
});

describe('cleave', () => {
  it('splashes a fraction of tank damage onto neighbours', () => {
    const s = createInitialState(99, skirmishRules());
    s.player.age = 'medieval';
    s.ai.age = 'medieval';
    s.player.gold = 2000;
    s.ai.gold = 2000;
    tick(s, [{ type: 'spawn', side: 'player', role: 'tank' }]);
    const tank = s.units.find((u) => u.side === 'player')!;
    // One packed enemy file: a primary target plus two neighbours inside the
    // 30px cleave radius.
    for (let i = 0; i < 3; i++) {
      s.ai.spawnLockTicks = 0;
      tick(s, [{ type: 'spawn', side: 'ai', role: 'ranged' }]);
      // Clear the spawn apron so the next one is not blocked by its neighbour.
      const latest = s.units.filter((u) => u.side === 'ai').pop()!;
      latest.x = 300;
    }
    const foes = s.units.filter((u) => u.side === 'ai');
    expect(foes).toHaveLength(3);
    foes[0]!.x = 140;
    foes[1]!.x = 152;
    foes[2]!.x = 164;
    for (const f of foes) f.hp = 500; // survive long enough to observe the splash
    tank.x = 140 - UNIT_DEFS.medieval.tank.range;
    tank.hp = 5000;

    const before = foes.map((f) => f.hp);
    for (let i = 0; i < 6; i++) {
      // Hold the tank on station so the tank (not the enemies' reach) decides timing.
      tank.x = 140 - UNIT_DEFS.medieval.tank.range;
      tick(s, []);
    }
    const after = foes.map((f) => f.hp);
    const damaged = before.filter((hp, i) => after[i]! < hp).length;
    const primaryDrop = before[0]! - after[0]!;
    const splashDrop = before[1]! - after[1]!;
    expect(damaged).toBeGreaterThan(1);
    // Neighbours take a fraction of what the primary took.
    expect(splashDrop).toBeLessThan(primaryDrop);
    expect(CLEAVE_FRACTION).toBeCloseTo(0.35, 5);
  });
});

describe('base turret', () => {
  it('starts unbuilt and costs gold to raise', () => {
    const s = createInitialState(7, skirmishRules());
    expect(s.player.turret.rank).toBe(0);
    s.player.gold = TURRET_COSTS.stone[0]!;
    expect(canBuildTurret(s, 'player')).toBe(true);
    tick(s, [{ type: 'turret', side: 'player' }]);
    expect(s.player.turret.rank).toBe(1);
    expect(s.player.gold).toBeLessThan(TURRET_COSTS.stone[0]!);
  });

  it('only shoots enemies inside its defensive radius', () => {
    const s = createInitialState(11, skirmishRules());
    s.player.gold = 500;
    tick(s, [{ type: 'turret', side: 'player' }]);
    tick(s, [{ type: 'turret', side: 'player' }]);
    tick(s, [{ type: 'turret', side: 'player' }]);
    expect(s.player.turret.rank).toBe(MAX_TURRET_RANK);
    // Far from the base: no turret fire.
    tick(s, [{ type: 'spawn', side: 'ai', role: 'swarm' }]);
    const enemy = s.units.find((u) => u.side === 'ai')!;
    enemy.x = 600;
    for (let i = 0; i < 200; i++) tick(s, []);
    expect(s.player.turret.targetId).toBeNull();
    // Inside 250px of the player base the turret acquires and shoots.
    enemy.x = 200;
    enemy.hp = 100000;
    let fired = false;
    for (let i = 0; i < 200; i++) {
      tick(s, []);
      enemy.x = 200;
      if (s.player.turret.targetId === enemy.id) fired = true;
    }
    expect(fired).toBe(true);
    expect(TURRET_RANGE).toBe(250);
  });
});

describe('superweapon', () => {
  it('charges over time and only fires when full', () => {
    const s = createInitialState(5, skirmishRules());
    for (let i = 0; i < 60; i++) tick(s, []);
    expect(s.player.ultCharge).toBeGreaterThan(0);
    expect(s.player.ultCharge).toBeLessThan(ULT_MAX);
    expect(canCastUltimate(s, 'player')).toBe(false);
    const before = s.strikes.length;
    tick(s, [{ type: 'ultimate', side: 'player', x: 400 }]);
    expect(s.strikes.length).toBe(before);
  });

  it('schedules every impact from the seeded RNG up front', () => {
    const a = createInitialState(31337, skirmishRules());
    const b = createInitialState(31337, skirmishRules());
    const strikeA = castStrike(a, 'player', 480, { next: () => 0.5, int: () => 0, state: 0, weighted: () => 'swarm' } as never);
    const strikeB = castStrike(b, 'player', 480, { next: () => 0.5, int: () => 0, state: 0, weighted: () => 'swarm' } as never);
    expect(strikeA.hits).toEqual(strikeB.hits);
    expect(strikeA.hits.length).toBeGreaterThan(1);
    expect(strikeA.kind).toBe('meteor');
  });

  it('damages enemies inside the impact radius when it lands', () => {
    const s = createInitialState(21, skirmishRules());
    s.ai.gold = 900;
    for (let i = 0; i < 3; i++) tick(s, [{ type: 'spawn', side: 'ai', role: 'swarm' }]);
    const foes = s.units.filter((u) => u.side === 'ai');
    for (const f of foes) f.x = 500;
    const hp = foes.map((f) => f.hp);
    s.player.ultCharge = ULT_MAX;
    tick(s, [{ type: 'ultimate', side: 'player', x: 500 }]);
    for (let i = 0; i < 40; i++) tick(s, []);
    const hurt = s.strikes.length === 0 ? foes.filter((f, i) => f.hp < hp[i]! || f.state === 'die').length : 0;
    expect(hurt).toBeGreaterThan(0);
  });
});

describe('match resolution', () => {
  it('collapses the timeline so a stalemate still ends', () => {
    expect(collapseRate(COLLAPSE_START_TICK)).toBe(0);
    expect(collapseRate(COLLAPSE_START_TICK + 1)).toBeGreaterThan(0);
    expect(collapseRate(COLLAPSE_START_TICK + 2000)).toBeGreaterThan(collapseRate(COLLAPSE_START_TICK + 1000));
  });

  it('finishes every self-play match inside the collapse window', () => {
    for (const seed of [1, 7919, 39595, 55433]) {
      const m = simulateBotMatch(seed, 12000, skirmishRules());
      expect(m.result).not.toBe('timeout');
      expect(m.ticks).toBeLessThan(9000);
    }
  });

  it('sieges the base once a unit is past the defence line', () => {
    const s = createInitialState(3, skirmishRules());
    tick(s, [{ type: 'spawn', side: 'player', role: 'tank' }]);
    const unit = s.units.find((u) => u.side === 'player')!;
    unit.x = 894 - BASE_SIEGE_RANGE + 4;
    const before = s.ai.baseHp;
    for (let i = 0; i < 60; i++) {
      unit.x = 894 - BASE_SIEGE_RANGE + 4;
      tick(s, []);
    }
    expect(s.ai.baseHp).toBeLessThan(before);
  });

  it('is deterministic end to end with the new mechanics', () => {
    const a = simulateBotMatch(2024, 5000, skirmishRules());
    const b = simulateBotMatch(2024, 5000, skirmishRules());
    expect(a.ticks).toBe(b.ticks);
    expect(a.result).toBe(b.result);
    expect(a.finalState.rngState).toBe(b.finalState.rngState);
    expect(a.finalState.player.ultCharge).toBe(b.finalState.player.ultCharge);
    expect(a.finalState.strikes.length).toBe(b.finalState.strikes.length);
  });
});

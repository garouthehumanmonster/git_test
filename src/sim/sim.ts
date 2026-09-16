import {
  type Age,
  type Intent,
  type MatchRules,
  type MatchStats,
  type PlayerState,
  type Projectile,
  type Side,
  type SimState,
  type StrikeEffect,
  type StrikeHit,
  type UnitRole,
  type UnitState,
  AI_AGGRESSION,
  AI_THINK_TICKS,
  AGE_BONUS_PER_TIER,
  AGE_ORDER,
  ARMOR_COSTS,
  BASE_HP,
  BASE_SIEGE_RANGE,
  COLLAPSE_START_TICK,
  CLEAVE_FRACTION,
  CLEAVE_RADIUS,
  COUNTER_MULTIPLIER,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  FORGE_COSTS,
  FRONT_LINE_SLOTS,
  FRIENDLY_SEPARATION,
  GOLD_PER_TICK,
  collapseRate,
  goldEscalation,
  LANE_CENTER_Y,
  LANE_TOP,
  LANE_WIDTH,
  MAX_TURRET_RANK,
  MAX_UPGRADE_RANK,
  PLAYER_BASE_X,
  PUSH_DEAD_ZONE,
  PUSH_RANGE,
  PUSH_SPEED,
  AI_BASE_X,
  RESERVE_GAP,
  RESERVE_TOLERANCE,
  SAME_AGE_PENALTY,
  SPAWN_BUFFER_PX,
  SPAWN_GLOBAL_LOCK,
  TURRET_COSTS,
  TURRET_DEFS,
  TURRET_RANGE,
  TURRET_RANK_BONUS,
  ULT_DEFS,
  ULT_MAX,
  ULT_PASSIVE_PER_TICK,
  ULT_PER_KILL,
  ULT_START_CHARGE,
  UNIT_DEFS,
  CHRONO_MAX,
  CHRONO_PASSIVE_PER_TICK,
  CHRONO_PER_KILL,
  CHRONO_SURGE_DURATION_TICKS,
  UPGRADE_BONUS_PER_RANK,
  VET_DMG,
  VET_HP,
  VET_SPD,
  VET_THRESHOLDS,
  laneYOffsetFor,
  skirmishRules,
} from './types';
import { RNG } from './rng';

/** Damage attributed to a base turret rather than a unit. */
const TURRET_ATTACKER = 0;
/** Damage attributed to a superweapon strike rather than a unit. */
const STRIKE_ATTACKER = -1;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function makePlayer(age: Age, gold: number, forgeRank: 0 | 1 | 2 | 3, armorRank: 0 | 1 | 2 | 3, turretRank: 0 | 1 | 2 | 3): PlayerState {
  return {
    gold,
    xp: 0,
    age,
    baseHp: BASE_HP,
    spawnLockTicks: 0,
    evolveLockTicks: 0,
    forgeRank,
    armorRank,
    turret: { rank: turretRank, cooldown: 0, targetId: null },
    ultCharge: ULT_START_CHARGE,
    chronoCharge: 0,
  };
}

function emptyStats(): MatchStats {
  return {
    unitsSpawned: { player: 0, ai: 0 },
    unitsLost: { player: 0, ai: 0 },
    kills: { player: 0, ai: 0 },
    turretKills: { player: 0, ai: 0 },
    ultimatesUsed: { player: 0, ai: 0 },
    goldEarned: { player: 0, ai: 0 },
  };
}

/**
 * Create a match. Passing no rules gives a plain endless skirmish, which is
 * what the balance tooling and the golden replay tests use.
 */
export function createInitialState(seed = 0xBADF00D, rules: MatchRules = skirmishRules()): SimState {
  return {
    tick: 0,
    units: [],
    projectiles: [],
    strikes: [],
    player: makePlayer(rules.playerStartAge, rules.playerStartGold, 0, 0, 0),
    ai: makePlayer(rules.aiStartAge, rules.aiStartGold, rules.aiForgeRank, rules.aiArmorRank, rules.aiTurretRank),
    nextId: 1,
    result: 'playing',
    rngState: seed,
    rules,
    stats: emptyStats(),
    chronoSurgeTicks: 0,
    chronoSurgeSide: null,
    events: [],
  };
}

export function canChronoSurge(state: SimState, side: Side): boolean {
  const p = side === 'player' ? state.player : state.ai;
  return (p.chronoCharge ?? 0) >= CHRONO_MAX && (!state.chronoSurgeTicks || state.chronoSurgeTicks <= 0) && state.result === 'playing';
}


// ---------------------------------------------------------------------------
// Intents (validated application)
// ---------------------------------------------------------------------------

export function canSpawn(state: SimState, side: Side, role: UnitRole): boolean {
  if (state.result !== 'playing') return false;
  const p = side === 'player' ? state.player : state.ai;
  if (p.spawnLockTicks > 0) return false;
  const def = UNIT_DEFS[p.age][role];
  if (p.gold < def.cost) return false;
  const spawnX = side === 'player' ? PLAYER_BASE_X + SPAWN_BUFFER_PX : AI_BASE_X - SPAWN_BUFFER_PX;
  const blockingRadius = 14;
  return !state.units.some(
    (u) => u.side === side && u.state !== 'die' && Math.abs(u.x - spawnX) < blockingRadius,
  );
}

export function canEvolve(state: SimState, side: Side): boolean {
  if (state.result !== 'playing') return false;
  const p = side === 'player' ? state.player : state.ai;
  const idx = AGE_ORDER.indexOf(p.age);
  if (idx === -1 || idx >= AGE_ORDER.length - 1) return false;
  const nextAge = AGE_ORDER[idx + 1]!;
  if (p.xp < EVOLVE_XP_REQ[nextAge]) return false;
  if (p.gold < EVOLVE_COST[nextAge]) return false;
  if (p.evolveLockTicks > 0) return false;
  return true;
}

export function canUpgrade(state: SimState, side: Side, which: 'forge' | 'armor'): boolean {
  if (state.result !== 'playing') return false;
  const p = side === 'player' ? state.player : state.ai;
  const rank = which === 'forge' ? p.forgeRank : p.armorRank;
  if (rank >= MAX_UPGRADE_RANK) return false;
  const costs = which === 'forge' ? FORGE_COSTS : ARMOR_COSTS;
  return p.gold >= costs[p.age][rank]!;
}

/** Cost of the next base-turret rank, or null when it is already maxed. */
export function turretCost(state: SimState, side: Side): number | null {
  const p = side === 'player' ? state.player : state.ai;
  if (p.turret.rank >= MAX_TURRET_RANK) return null;
  return TURRET_COSTS[p.age][p.turret.rank]!;
}

export function canBuildTurret(state: SimState, side: Side): boolean {
  if (state.result !== 'playing') return false;
  const cost = turretCost(state, side);
  if (cost === null) return false;
  const p = side === 'player' ? state.player : state.ai;
  return p.gold >= cost;
}

export function canCastUltimate(state: SimState, side: Side): boolean {
  if (state.result !== 'playing') return false;
  const p = side === 'player' ? state.player : state.ai;
  return p.ultCharge >= ULT_MAX;
}

function applyIntent(state: SimState, intent: Intent, rng: RNG): void {
  if (state.result !== 'playing') return;
  const p = intent.side === 'player' ? state.player : state.ai;

  if (intent.type === 'spawn') {
    if (p.spawnLockTicks > 0) return;
    const def = UNIT_DEFS[p.age][intent.role];
    if (p.gold < def.cost) return;
    const spawnX = intent.side === 'player' ? PLAYER_BASE_X + SPAWN_BUFFER_PX : AI_BASE_X - SPAWN_BUFFER_PX;
    const blocked = state.units.some(
      (u) => u.side === intent.side && u.state !== 'die' && Math.abs(u.x - spawnX) < 14,
    );
    if (blocked) return;

    p.gold -= def.cost;
    p.spawnLockTicks = SPAWN_GLOBAL_LOCK;

    const id = state.nextId++;
    const hpMul = VET_HP[0]!;
    const dmgMul = VET_DMG[0]!;
    const startHp = def.hp * hpMul * (1 + p.armorRank * UPGRADE_BONUS_PER_RANK);
    const unit: UnitState = {
      id,
      def,
      side: intent.side,
      x: spawnX,
      // Identity-derived lane slot: five ranks, so a push reads as a formation.
      // Deliberately not RNG-drawn, so a replay reproduces the same formation
      // and the spawn-cost stream stays stable.
      yOffset: laneYOffsetFor(id),
      reserve: false,
      hp: startHp,
      state: 'walk',
      cooldown: 0,
      target: null,
      lastAttackerId: null,
      dir: intent.side === 'player' ? 1 : -1,
      animSeed: rng.int(0, 1_000_000),
      ageTicks: 0,
      kills: 0,
      vet: 0,
      dmgMul,
      hpMul,
      spdMul: VET_SPD[0]!,
    };
    state.units.push(unit);
    state.stats.unitsSpawned[intent.side]++;
    return;
  }

  if (intent.type === 'evolve') {
    const idx = AGE_ORDER.indexOf(p.age);
    if (idx === -1 || idx >= AGE_ORDER.length - 1) return;
    const nextAge = AGE_ORDER[idx + 1]!;
    if (p.xp < EVOLVE_XP_REQ[nextAge] || p.gold < EVOLVE_COST[nextAge]) return;
    if (p.evolveLockTicks > 0) return;
    p.gold -= EVOLVE_COST[nextAge];
    p.age = nextAge;
    p.evolveLockTicks = 60; // 3s of evolve animation / lock
    state.events.push({ kind: 'evolve', side: intent.side, to: nextAge, ttl: 60 });
    return;
  }

  if (intent.type === 'upgrade') {
    const isForge = intent.which === 'forge';
    const rank = isForge ? p.forgeRank : p.armorRank;
    if (rank >= MAX_UPGRADE_RANK) return;
    const costs = isForge ? FORGE_COSTS : ARMOR_COSTS;
    const cost = costs[p.age][rank]!;
    if (p.gold < cost) return;
    p.gold -= cost;
    const newRank = (rank + 1) as 0 | 1 | 2 | 3;

    // Armor upgrades immediately heal existing units by the added max HP (damage
    // is computed from p.forgeRank on every hit, so forge needs no retroactive work).
    if (!isForge) {
      for (const u of state.units) {
        if (u.side !== intent.side) continue;
        const oldMax = u.def.hp * u.hpMul * (1 + rank * UPGRADE_BONUS_PER_RANK);
        const newMax = u.def.hp * u.hpMul * (1 + newRank * UPGRADE_BONUS_PER_RANK);
        u.hp = Math.min(newMax, u.hp + (newMax - oldMax));
      }
    }
    if (isForge) p.forgeRank = newRank;
    else p.armorRank = newRank;
    state.events.push({ kind: 'upgrade', side: intent.side, which: intent.which, rank: newRank, ttl: 40 });
    return;
  }

  if (intent.type === 'turret') {
    const cost = turretCost(state, intent.side);
    if (cost === null || p.gold < cost) return;
    p.gold -= cost;
    p.turret.rank = (p.turret.rank + 1) as 0 | 1 | 2 | 3;
    p.turret.cooldown = 0;
    state.events.push({ kind: 'turretBuilt', side: intent.side, rank: p.turret.rank, ttl: 50 });
    return;
  }

  if (intent.type === 'ultimate') {
    if (p.ultCharge < ULT_MAX) return;
    p.ultCharge = 0;
    state.stats.ultimatesUsed[intent.side]++;
    castStrike(state, intent.side, intent.x, rng);
    return;
  }

  if (intent.type === 'chronoSurge') {
    if ((p.chronoCharge ?? 0) < CHRONO_MAX || (state.chronoSurgeTicks ?? 0) > 0) return;
    p.chronoCharge = 0;
    state.chronoSurgeTicks = CHRONO_SURGE_DURATION_TICKS;
    state.chronoSurgeSide = intent.side;
    state.events.push({ kind: 'chronoSurge', side: intent.side, ttl: CHRONO_SURGE_DURATION_TICKS });
    return;
  }
}

// ---------------------------------------------------------------------------
// Superweapons
// ---------------------------------------------------------------------------

/**
 * Schedule a superweapon strike. Every impact is generated up-front from the
 * seeded RNG, so a replay reproduces identical hits on identical ticks.
 */
export function castStrike(state: SimState, side: Side, x: number, rng: RNG): StrikeEffect {
  const p = side === 'player' ? state.player : state.ai;
  const def = ULT_DEFS[p.age];
  const anchor = Math.max(40, Math.min(LANE_WIDTH - 40, x));
  const half = def.width / 2;
  const hits: StrikeHit[] = [];

  for (let i = 0; i < def.hits; i++) {
    let hx: number;
    if (def.kind === 'meteor') {
      // Three boulders falling in a tight cluster around the aim point.
      const t = def.hits === 1 ? 0.5 : i / (def.hits - 1);
      hx = anchor + (t - 0.5) * def.width + (rng.next() - 0.5) * 16;
    } else if (def.kind === 'airstrike') {
      // A bomber walking its stick along the zone, left to right.
      const t = def.hits === 1 ? 0.5 : i / (def.hits - 1);
      hx = anchor - half + t * def.width + (rng.next() - 0.5) * 20;
    } else {
      // Saturation fire: scattered across the whole zone.
      hx = anchor + (rng.next() - 0.5) * def.width;
    }
    hits.push({
      atTick: state.tick + i * def.cadence,
      x: Math.max(20, Math.min(LANE_WIDTH - 20, hx)),
      radius: def.radius,
      damage: def.damage,
      visual: def.visual,
    });
  }
  // Impact order must be deterministic even if a scatter pattern lands out of order.
  hits.sort((a, b) => a.atTick - b.atTick || a.x - b.x);

  const effect: StrikeEffect = {
    id: state.nextId++,
    side,
    age: p.age,
    kind: def.kind,
    x: anchor,
    hits,
    nextHit: 0,
    reachedTick: state.tick,
  };
  state.strikes.push(effect);
  state.events.push({ kind: 'ultCast', side, age: p.age, strike: def.kind, x: anchor, ttl: 60 });
  return effect;
}

function applyStrikeImpact(state: SimState, effect: StrikeEffect, hit: StrikeHit): void {
  const enemySide: Side = effect.side === 'player' ? 'ai' : 'player';
  for (const u of state.units) {
    if (u.side !== enemySide || u.state === 'die') continue;
    if (Math.abs(u.x - hit.x) > hit.radius) continue;
    damageUnit(state, u, hit.damage, 0xffffff, STRIKE_ATTACKER);
  }
  state.events.push({
    kind: 'strike',
    side: effect.side,
    age: effect.age,
    strike: effect.kind,
    x: hit.x,
    y: LANE_CENTER_Y,
    radius: hit.radius,
    damage: Math.round(hit.damage),
    visual: hit.visual,
    ttl: 26,
  });
}

function updateStrikes(state: SimState): void {
  if (state.strikes.length === 0) return;
  const keep: StrikeEffect[] = [];
  for (const effect of state.strikes) {
    while (effect.nextHit < effect.hits.length && effect.hits[effect.nextHit]!.atTick <= state.tick) {
      applyStrikeImpact(state, effect, effect.hits[effect.nextHit]!);
      effect.nextHit++;
    }
    if (effect.nextHit < effect.hits.length) keep.push(effect);
  }
  state.strikes = keep;
}

// ---------------------------------------------------------------------------
// Base turret
// ---------------------------------------------------------------------------

function turretDamage(p: PlayerState, defRank: number): number {
  const def = TURRET_DEFS[p.age];
  return def.damage * (1 + (defRank - 1) * TURRET_RANK_BONUS);
}

/**
 * Auto-targeting base defence. Picks the nearest enemy inside the defensive
 * perimeter and fires the age's pattern: one heavy rock, a piercing ballista
 * volley, or a rapid flak burst.
 */
function updateTurret(state: SimState, side: Side): void {
  const p = side === 'player' ? state.player : state.ai;
  const turret = p.turret;
  if (turret.rank === 0) return;
  if (turret.cooldown > 0) turret.cooldown--;

  const baseX = side === 'player' ? PLAYER_BASE_X : AI_BASE_X;
  const inRange: UnitState[] = [];
  for (const u of state.units) {
    if (u.side === side || u.state === 'die') continue;
    if (Math.abs(u.x - baseX) > TURRET_RANGE) continue;
    inRange.push(u);
  }
  inRange.sort((a, b) => Math.abs(a.x - baseX) - Math.abs(b.x - baseX) || a.id - b.id);
  turret.targetId = inRange.length > 0 ? inRange[0]!.id : null;
  if (inRange.length === 0 || turret.cooldown > 0) return;

  const def = TURRET_DEFS[p.age];
  turret.cooldown = def.attackRate;
  const damage = turretDamage(p, turret.rank);
  const fromX = baseX + (side === 'player' ? 30 : -30);
  const fromY = LANE_TOP + 42;

  for (let i = 0; i < def.shots; i++) {
    // Piercing volleys walk down the enemy column; flak spreads across it.
    const target = inRange[Math.min(i, inRange.length - 1)]!;
    damageUnit(state, target, damage, 0xffffff, TURRET_ATTACKER);
  }
  const lead = inRange[0]!;
  state.events.push({
    kind: 'turretShot',
    side,
    age: p.age,
    fromX,
    toX: lead.x,
    toY: LANE_CENTER_Y + lead.yOffset,
    ttl: 6,
  });
  // A firing turret is also a loud signal that the lane is being pushed.
  void fromY;
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

function enemyBaseX(side: Side): number {
  return side === 'player' ? AI_BASE_X : PLAYER_BASE_X;
}

function findTarget(state: SimState, u: UnitState): UnitState | null {
  let best: UnitState | null = null;
  let bestDist = Infinity;
  for (const other of state.units) {
    if (other.side === u.side || other.state === 'die') continue;
    const dx = other.x - u.x;
    // Must be in front of the unit (player dir +1, ai dir -1).
    if (u.dir === 1 && dx < -2) continue;
    if (u.dir === -1 && dx > 2) continue;
    const dist = Math.abs(dx);
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  return best;
}

/**
 * How many allies are already engaged *ahead* of this unit on the same target.
 *
 * The first `FRONT_LINE_SLOTS` units in that order get to fight; everyone else
 * becomes a reserve that holds a following distance instead of piling onto the
 * same pixel. Ordering is by distance then unit id, so it is stable and
 * deterministic rather than dependent on array iteration order alone.
 */
function engagedAheadCount(state: SimState, u: UnitState, target: UnitState): number {
  const ownDist = Math.abs(target.x - u.x);
  let ahead = 0;
  for (const other of state.units) {
    if (other.id === u.id || other.side !== u.side || other.state === 'die') continue;
    if (other.target !== target.id) continue;
    if (other.state !== 'fight') continue;
    const dist = Math.abs(target.x - other.x);
    if (dist < ownDist || (dist === ownDist && other.id < u.id)) ahead++;
  }
  return ahead;
}

/**
 * Distance to the nearest ally standing between this unit and the target.
 * Reserve units use it to keep a readable 16-24px spacing behind the front line.
 */
function gapToAllyAhead(state: SimState, u: UnitState): number {
  let best = Infinity;
  for (const other of state.units) {
    if (other.id === u.id || other.side !== u.side || other.state === 'die') continue;
    const dx = (other.x - u.x) * u.dir;
    if (dx <= 0) continue;
    // Ignore units on a very different lane slot: they are not in our file.
    if (Math.abs(other.yOffset - u.yOffset) > 14) continue;
    if (dx < best) best = dx;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

function ageTier(age: Age): number {
  return AGE_ORDER.indexOf(age);
}

function computeDamage(attacker: UnitState, attackerPlayer: PlayerState): number {
  let dmg = attacker.def.damage * attacker.dmgMul;
  dmg *= 1 + attackerPlayer.forgeRank * UPGRADE_BONUS_PER_RANK;
  return dmg;
}

function computeDamageVs(attacker: UnitState, defender: UnitState, attackerPlayer: PlayerState): number {
  let dmg = computeDamage(attacker, attackerPlayer);
  if (attacker.def.strongVs === defender.def.role) dmg *= COUNTER_MULTIPLIER;
  if (attacker.def.age === defender.def.age) dmg *= SAME_AGE_PENALTY;
  const tierDelta = ageTier(attacker.def.age) - ageTier(defender.def.age);
  dmg *= 1 + tierDelta * AGE_BONUS_PER_TIER;
  return dmg;
}

function damageUnit(state: SimState, u: UnitState, amount: number, color: number, attackerId: number): void {
  if (u.state === 'die') return;
  u.lastAttackerId = attackerId;
  u.hp -= amount;
  state.events.push({
    kind: 'hit',
    x: u.x,
    y: LANE_CENTER_Y + u.yOffset - 18,
    damage: Math.round(amount),
    color,
    ttl: 24,
  });
  if (u.hp <= 0) {
    u.hp = 0;
    u.state = 'die';
    u.target = null;
    state.events.push({
      kind: 'death',
      x: u.x,
      y: LANE_CENTER_Y + u.yOffset,
      color: u.side === 'player' ? 0x64b5f6 : 0xef5350,
      ttl: 30,
    });
  }
}

/**
 * Heavy units swing wide: a tank melee attack clips every other enemy standing
 * next to its target for a fraction of the damage. This is the stalemate
 * breaker that lets two stacked front lines actually resolve.
 */
function applyCleave(state: SimState, attacker: UnitState, primary: UnitState, owner: PlayerState, damage: number): void {
  if (attacker.def.role !== 'tank') return;
  const splash = damage * CLEAVE_FRACTION;
  for (const other of state.units) {
    if (other.id === primary.id) continue;
    if (other.side === attacker.side || other.state === 'die') continue;
    if (Math.abs(other.x - primary.x) > CLEAVE_RADIUS) continue;
    damageUnit(state, other, splash, 0xffffff, attacker.id);
  }
  void owner;
}

function rewardKill(state: SimState, victim: UnitState): void {
  const killerSide: Side = victim.side === 'player' ? 'ai' : 'player';
  const p = killerSide === 'player' ? state.player : state.ai;
  const goldGain = Math.ceil(victim.def.cost * 0.4);
  p.gold += goldGain;
  const xpMul = killerSide === 'ai' ? state.rules.aiXpMul : 1;
  p.xp += victim.def.xpValue * xpMul;
  p.ultCharge = Math.min(ULT_MAX, p.ultCharge + ULT_PER_KILL);
  if (p.chronoCharge !== undefined) p.chronoCharge = Math.min(CHRONO_MAX, p.chronoCharge + CHRONO_PER_KILL);
  state.stats.kills[killerSide]++;
  state.stats.unitsLost[victim.side]++;
  state.stats.goldEarned[killerSide] += goldGain;
  state.events.push({ kind: 'gold', side: killerSide, amount: goldGain, ttl: 30 });

  // Credit the unit that actually dealt the final hit. Turret and superweapon
  // kills are tracked separately, and never promote a unit on the field.
  const credited = victim.lastAttackerId;
  if (credited === TURRET_ATTACKER) {
    state.stats.turretKills[killerSide]++;
    return;
  }
  if (credited === null || credited === STRIKE_ATTACKER) return;
  const killer = state.units.find((u) => u.id === credited && u.side === killerSide) ?? null;
  if (!killer) return;
  const killerOwner = killerSide === 'player' ? state.player : state.ai;
  promoteVet(killer, killerOwner);
}

function promoteVet(u: UnitState, owner: PlayerState): void {
  u.kills++;
  const wasVet = u.vet;
  let newVet: 0 | 1 | 2 = u.vet;
  if (u.kills >= VET_THRESHOLDS[1]!) newVet = 2;
  else if (u.kills >= VET_THRESHOLDS[0]!) newVet = 1;
  if (newVet !== wasVet) {
    u.vet = newVet;
    u.dmgMul = VET_DMG[newVet]!;
    const newHpMul = VET_HP[newVet]!;
    const armorMul = 1 + owner.armorRank * UPGRADE_BONUS_PER_RANK;
    const oldMax = u.def.hp * VET_HP[wasVet]! * armorMul;
    const newMax = u.def.hp * newHpMul * armorMul;
    const ratio = Math.min(1, u.hp / oldMax);
    // Preserve the health ratio and top up by the new rank's HP gain, but never
    // let a promotion create HP above the new effective maximum.
    u.hp = Math.min(newMax, newMax * ratio + (newMax - oldMax));
    u.hpMul = newHpMul;
    u.spdMul = VET_SPD[newVet]!;
  }
}

// ---------------------------------------------------------------------------
// Per-tick simulation
// ---------------------------------------------------------------------------

export function tick(state: SimState, intents: Intent[] = []): SimState {
  if (state.result !== 'playing') return state;

  const rng = new RNG(state.rngState);

  // 1. Apply intents (spawn / evolve / upgrade / turret / ultimate)
  for (const intent of intents) applyIntent(state, intent, rng);

  // 2. AI decision-making runs on a cadence.
  maybeAIAct(state, rng);

  // 3. Passive gold, ultimate charge and cooldown decrements. Both economies
  // accelerate over the match so a dead-even lane still reaches a conclusion.
  const escalation = goldEscalation(state.tick);
  state.player.gold += GOLD_PER_TICK * state.rules.playerGoldMul * escalation;
  state.ai.gold += GOLD_PER_TICK * state.rules.aiGoldMul * escalation;
  state.player.ultCharge = Math.min(ULT_MAX, state.player.ultCharge + ULT_PASSIVE_PER_TICK);
  state.ai.ultCharge = Math.min(ULT_MAX, state.ai.ultCharge + ULT_PASSIVE_PER_TICK);
  if (state.player.chronoCharge !== undefined) {
    state.player.chronoCharge = Math.min(CHRONO_MAX, state.player.chronoCharge + CHRONO_PASSIVE_PER_TICK);
  }
  if (state.ai.chronoCharge !== undefined) {
    state.ai.chronoCharge = Math.min(CHRONO_MAX, state.ai.chronoCharge + CHRONO_PASSIVE_PER_TICK);
  }
  if (state.chronoSurgeTicks && state.chronoSurgeTicks > 0) {
    state.chronoSurgeTicks--;
    if (state.chronoSurgeTicks === 0) state.chronoSurgeSide = null;
  }
  if (state.player.spawnLockTicks > 0) state.player.spawnLockTicks--;
  if (state.ai.spawnLockTicks > 0) state.ai.spawnLockTicks--;
  if (state.player.evolveLockTicks > 0) state.player.evolveLockTicks--;
  if (state.ai.evolveLockTicks > 0) state.ai.evolveLockTicks--;

  // 4. Units — targeting, movement, attacks
  const isSurgeActive = (state.chronoSurgeTicks ?? 0) > 0;
  for (const u of state.units) {
    if (u.state === 'die') continue;
    u.ageTicks++;
    const isFriendlySurge = isSurgeActive && u.side === state.chronoSurgeSide;
    const isEnemyStasis = isSurgeActive && u.side !== state.chronoSurgeSide;
    if (u.cooldown > 0) {
      if (isFriendlySurge) u.cooldown = Math.max(0, u.cooldown - 2);
      else if (!isEnemyStasis || state.tick % 2 === 0) u.cooldown--;
    }
    // A previous unit in this tick may have killed us via melee.
    if (u.hp <= 0) {
      u.state = 'die';
      u.target = null;
      continue;
    }

    const owner = u.side === 'player' ? state.player : state.ai;

    // Re-acquire target if current target is dead/gone/out of range.
    let target: UnitState | null = null;
    if (u.target != null) {
      target = state.units.find((o) => o.id === u.target && o.side !== u.side && o.state !== 'die') ?? null;
      // A unit must never turn around to chase a target that it has already
      // passed. Re-acquiring here prevents rare overshoot/backtracking loops.
      if (target) {
        const dx = target.x - u.x;
        if ((u.dir === 1 && dx < -2) || (u.dir === -1 && dx > 2)) target = null;
      }
    }
    if (!target) {
      target = findTarget(state, u);
      u.target = target ? target.id : null;
    }

    const baseX = enemyBaseX(u.side);
    const distToBase = Math.abs(baseX - u.x);

    // Broken through: pound the structure. Defenders still shoot back, so a
    // siege is a trade rather than a free win.
    if (distToBase <= BASE_SIEGE_RANGE) {
      u.reserve = false;
      u.state = 'fight';
      u.target = null;
      if (u.cooldown <= 0) {
        u.cooldown = Math.max(8, u.def.attackRate - 4);
        const defender = u.side === 'player' ? state.ai : state.player;
        // Everything that reaches a base hits it hard: a breached line should
        // convert into a result, not a long tease.
        let dmg = computeDamage(u, owner) * 1.15;
        const tierDelta = ageTier(u.def.age);
        dmg *= 1 + tierDelta * AGE_BONUS_PER_TIER;
        dmg *= 0.95 + rng.next() * 0.1;
        // Heavy siege engines hurt structures far more than infantry do.
        if (u.def.role === 'tank') dmg *= 1.6;
        defender.baseHp -= dmg;
        state.events.push({
          kind: 'baseHit',
          side: u.side === 'player' ? 'ai' : 'player',
          damage: Math.round(dmg),
          ttl: 22,
        });
      }
      continue;
    }

    if (target) {
      const dist = Math.abs(target.x - u.x);
      // Slot arbitration. Only the front MELEE line is capped (three swingers
      // per clash point, as the design calls for); everyone queued behind them
      // holds a readable following distance instead of piling onto one pixel.
      //
      // Ranged units are deliberately exempt: they fight from their own range
      // behind the line, so capping them would throttle an army's damage to a
      // fraction of its strength and turn every push into a stalemate. They are
      // kept legible by lane slots and friendly separation instead.
      const isMelee = u.def.range <= 26;
      const ahead = isMelee ? engagedAheadCount(state, u, target) : 0;
      const holdsSlot = !isMelee || ahead < FRONT_LINE_SLOTS;
      u.reserve = !holdsSlot;

      const temporalMul = isFriendlySurge ? 1.35 : isEnemyStasis ? 0.35 : 1.0;
      const unitSpeed = u.def.speed * u.spdMul * temporalMul;

      if (dist > u.def.range) {
        u.state = 'walk';
        if (!u.reserve) {
          u.x += u.dir * unitSpeed;
        } else {
          const gap = gapToAllyAhead(state, u);
          if (gap > RESERVE_GAP + RESERVE_TOLERANCE) u.x += u.dir * unitSpeed;
          else if (gap < RESERVE_GAP - RESERVE_TOLERANCE) u.x -= u.dir * unitSpeed * 0.5;
        }
      } else if (holdsSlot) {
        u.state = 'fight';
        if (u.cooldown <= 0) {
          u.cooldown = u.def.attackRate;
          fireAttack(state, u, target, owner, rng);
        }
      } else {
        // In range but queued behind the front line: hold at a readable spacing.
        u.state = 'walk';
        const gap = gapToAllyAhead(state, u);
        if (gap > RESERVE_GAP + RESERVE_TOLERANCE) u.x += u.dir * unitSpeed * 0.6;
        else if (gap < RESERVE_GAP - RESERVE_TOLERANCE) u.x -= u.dir * unitSpeed * 0.5;
      }
    } else {
      // No enemy left on the lane — advance on the base.
      const temporalMul = isFriendlySurge ? 1.35 : isEnemyStasis ? 0.35 : 1.0;
      const unitSpeed = u.def.speed * u.spdMul * temporalMul;
      u.reserve = false;
      u.state = 'walk';
      u.x += u.dir * unitSpeed;
    }

    // Clamp x within lane bounds.
    if (u.x < PLAYER_BASE_X + 5) u.x = PLAYER_BASE_X + 5;
    if (u.x > AI_BASE_X - 5) u.x = AI_BASE_X - 5;
  }

  // 4b. Tug-of-war pressure, then soft friendly separation.
  applyTugOfWar(state);
  applyFriendlySeparation(state);

  // 4c. Base defence turrets.
  updateTurret(state, 'player');
  updateTurret(state, 'ai');

  // 5. Projectiles
  updateProjectiles(state, rng);

  // 5b. Superweapon impacts scheduled for this tick.
  updateStrikes(state);

  // 6. Reward kills for any units that died this tick, then remove the dead.
  for (const u of state.units) {
    if (u.state === 'die' && u.hp <= 0) {
      // Only reward once — use a marker on cooldown (negative == rewarded).
      if (u.cooldown >= 0) {
        rewardKill(state, u);
        u.cooldown = -1;
      }
    }
  }
  state.units = state.units.filter((u) => !(u.state === 'die' && u.cooldown < 0));

  // 7. Tick event TTLs; drop expired events. Gameover events are persistent.
  for (const e of state.events) {
    if ('ttl' in e) e.ttl--;
  }
  state.events = state.events.filter((e) => e.kind === 'gameover' || e.ttl > 0);

  // 7b. Timeline collapse — see `collapseRate`. Both bases drain equally, so
  // it never flips a match, it only guarantees one ends.
  const collapse = collapseRate(state.tick);
  if (collapse > 0) {
    state.player.baseHp -= collapse;
    state.ai.baseHp -= collapse;
    if (state.tick === COLLAPSE_START_TICK) {
      state.events.push({ kind: 'collapse', ttl: 120 });
    }
  }

  // 8. Win/Loss
  if (state.player.baseHp <= 0) {
    state.result = 'loss';
    state.events.push({ kind: 'gameover', result: 'loss' });
  } else if (state.ai.baseHp <= 0) {
    state.result = 'win';
    state.events.push({ kind: 'gameover', result: 'win' });
  }

  state.tick++;
  state.rngState = rng.state;
  return state;
}

/**
 * Turn a numerical advantage into ground. Both sides are weighed inside the
 * clash zone; the heavier side presses forward and the lighter side gives
 * ground. This is what stops two evenly fed armies from standing nose to nose
 * for the entire match, and it is the mechanic that makes the lane a real
 * tug-of-war rather than a fixed scrum.
 */
function applyTugOfWar(state: SimState): void {
  // Clash point = midpoint of the closest opposing pair.
  let clash = 0;
  let best = Infinity;
  for (const a of state.units) {
    if (a.state === 'die') continue;
    for (const b of state.units) {
      if (b.side === a.side || b.state === 'die') continue;
      const dist = Math.abs(b.x - a.x);
      if (dist < best) {
        best = dist;
        clash = (a.x + b.x) / 2;
      }
    }
  }
  if (!Number.isFinite(best)) return;

  const weigh = (side: Side): number => {
    let power = 0;
    for (const u of state.units) {
      if (u.side !== side || u.state === 'die') continue;
      if (Math.abs(u.x - clash) > PUSH_RANGE) continue;
      const maxHp = u.def.hp * u.hpMul * (1 + (side === 'player' ? state.player.armorRank : state.ai.armorRank) * UPGRADE_BONUS_PER_RANK);
      const hpFrac = Math.max(0, Math.min(1, u.hp / maxHp));
      const roleWeight = u.def.role === 'tank' ? 1.4 : u.def.role === 'ranged' ? 0.7 : 1;
      // Committed melee count for more than units that are merely loitering.
      const commit = u.state === 'fight' ? 1 : 0.85;
      power += roleWeight * commit * (0.5 + 0.5 * hpFrac);
    }
    return power;
  };

  const playerPower = weigh('player');
  const aiPower = weigh('ai');
  const total = playerPower + aiPower;
  if (total <= 0) return;
  const bias = (playerPower - aiPower) / total;
  if (Math.abs(bias) <= PUSH_DEAD_ZONE) return;

  const strength = Math.min(1, (Math.abs(bias) - PUSH_DEAD_ZONE) / (1 - PUSH_DEAD_ZONE));
  const push = Math.sign(bias) * strength * PUSH_SPEED;

  // The line translates as a whole: the heavier side walks it forward, and the
  // side giving ground yields at half rate so the retreat reads as pressure
  // rather than both armies being dragged in opposite directions.
  const dir = Math.sign(push);
  const magnitude = Math.abs(push);
  for (const u of state.units) {
    if (u.state === 'die') continue;
    if (Math.abs(u.x - clash) > PUSH_RANGE) continue;
    const advancing = (dir > 0) === (u.side === 'player');
    u.x += dir * magnitude * (advancing ? 1 : 0.5);
    if (u.x < PLAYER_BASE_X + 5) u.x = PLAYER_BASE_X + 5;
    if (u.x > AI_BASE_X - 5) u.x = AI_BASE_X - 5;
  }
}

function applyFriendlySeparation(state: SimState): void {
  const alive = state.units.filter((u) => u.state !== 'die');
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]!;
        const b = alive[j]!;
        if (a.side !== b.side) continue;
        // Units on different lane slots already have vertical clearance.
        if (Math.abs(a.yOffset - b.yOffset) > 14) continue;
        const dx = b.x - a.x;
        const dist = Math.abs(dx);
        const min = FRIENDLY_SEPARATION;
        if (dist < min && dist > 0.0001) {
          const push = (min - dist) / 2;
          const sign = Math.sign(dx);
          // Walking units can be pushed; fighting units mostly hold.
          const aPush = a.state === 'walk' ? push : push * 0.15;
          const bPush = b.state === 'walk' ? push : push * 0.15;
          a.x -= sign * aPush;
          b.x += sign * bPush;
        }
      }
    }
  }
  for (const u of alive) {
    if (u.x < PLAYER_BASE_X + 5) u.x = PLAYER_BASE_X + 5;
    if (u.x > AI_BASE_X - 5) u.x = AI_BASE_X - 5;
  }
}

function fireAttack(state: SimState, u: UnitState, target: UnitState, owner: PlayerState, rng: RNG): void {
  const baseDmg = computeDamageVs(u, target, owner) * (0.92 + rng.next() * 0.16);
  const attackerColor = u.side === 'player' ? 0x64b5f6 : 0xef5350;

  if (u.def.range <= 26) {
    // Melee — immediate damage, and tanks cleave through the front line.
    damageUnit(state, target, baseDmg, attackerColor, u.id);
    if (target.hp > 0 || true) applyCleave(state, u, target, owner, baseDmg);
    return;
  }
  // Ranged — spawn a projectile.
  const proj: Projectile = {
    id: state.nextId++,
    side: u.side,
    x: u.x,
    startX: u.x,
    y: LANE_CENTER_Y + u.yOffset,
    targetId: target.id,
    attackerId: u.id,
    targetX: target.x,
    speed: 5 + u.def.range / 40,
    damage: baseDmg,
    age: u.def.age,
  };
  state.projectiles.push(proj);
}

function updateProjectiles(state: SimState, rng: RNG): void {
  const alive: Projectile[] = [];
  for (const p of state.projectiles) {
    const target = state.units.find((u) => u.id === p.targetId && u.state !== 'die');
    if (target) p.targetX = target.x;
    const dx = p.targetX - p.x;
    const dist = Math.abs(dx);
    const step = p.speed;
    if (dist <= step) {
      // Impact.
      if (target) {
        const color = p.side === 'player' ? 0x64b5f6 : 0xef5350;
        const dmg = p.damage * (0.95 + rng.next() * 0.1);
        damageUnit(state, target, dmg, color, p.attackerId);
        // A tank's ranged cousins are melee, so cleave only applies to melee.
      }
      continue;
    }
    p.x += Math.sign(dx) * step;
    // Arc height based on total travel distance.
    const totalDist = Math.abs(p.targetX - p.startX) || 1;
    const traveled = Math.abs(p.x - p.startX);
    const t = Math.min(1, Math.max(0, traveled / totalDist));
    const arcHeight = Math.min(22, totalDist * 0.18);
    p.y = LANE_CENTER_Y - Math.sin(Math.PI * t) * arcHeight;
    alive.push(p);
  }
  state.projectiles = alive;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** Average x of a side's living units, or a fallback anchor when the lane is empty. */
function clusterAnchor(state: SimState, side: Side): number {
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
interface BotProfile {
  aggression: number;
  weights: { swarm: number; tank: number; ranged: number };
  usesUltimate: boolean;
}

/**
 * The single lane brain. Both the in-match AI and the headless bot use it, with
 * their own profile, so a self-play balance run is a true mirror match and the
 * only asymmetry left in the game is the one the stage rules ask for.
 */
function chooseBotIntent(state: SimState, side: Side, rng: RNG, profile: BotProfile): Intent | null {
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

  // Upgrades — skipped while saving for an age-up so evolution is not starved.
  if (!canEvolve(state, side) && (me.forgeRank < MAX_UPGRADE_RANK || me.armorRank < MAX_UPGRADE_RANK)) {
    const hpRatio = me.baseHp / BASE_HP;
    const wantArmor = hpRatio < 0.75 && me.armorRank <= me.forgeRank;
    const picks: Array<'forge' | 'armor'> = wantArmor ? ['armor', 'forge'] : ['forge', 'armor'];
    for (const pick of picks) {
      if (canUpgrade(state, side, pick) && rng.next() < 0.35) {
        return { type: 'upgrade', side, which: pick };
      }
    }
  }

  if (canEvolve(state, side) && rng.next() < 0.4) {
    return { type: 'evolve', side };
  }

  // Counter-composition: lean into whatever beats what the enemy is fielding.
  const weights: Array<readonly [UnitRole, number]> = [
    ['swarm', Math.max(0.12, profile.weights.swarm * (1 + theirs.ranged * 1.1 - mine.swarm * 0.5))] as const,
    ['tank', Math.max(0.12, profile.weights.tank * (1 + theirs.swarm * 1.1 - mine.tank * 0.5))] as const,
    ['ranged', Math.max(0.12, profile.weights.ranged * (1 + theirs.tank * 1.1 - mine.ranged * 0.5))] as const,
  ];

  const reserve = (1 - profile.aggression) * 18;
  for (let tries = 0; tries < 4; tries++) {
    const role = rng.weighted(weights);
    const def = UNIT_DEFS[me.age][role];
    if (me.gold >= def.cost + reserve && canSpawn(state, side, role)) {
      return { type: 'spawn', side, role };
    }
  }
  return null;
}

function maybeAIAct(state: SimState, rng: RNG): void {
  const intent = chooseBotIntent(state, 'ai', rng, {
    aggression: state.rules.aiAggression,
    weights: state.rules.aiWeights,
    usesUltimate: state.rules.aiUsesUltimate,
  });
  if (intent) applyIntent(state, intent, rng);
}

/** Baseline profile for the headless balance bot and the sim test harness. */
function baselineProfile(): BotProfile {
  return { aggression: AI_AGGRESSION, weights: { swarm: 1, tank: 1, ranged: 1 }, usesUltimate: true };
}

// ---------------------------------------------------------------------------
// Helpers exported for rendering/tests
// ---------------------------------------------------------------------------

export function step(state: SimState, intents: Intent[] = []): SimState {
  return tick(state, intents);
}

export function runFor(state: SimState, ticks: number, intentsFn?: (s: SimState) => Intent[]): SimState {
  for (let i = 0; i < ticks && state.result === 'playing'; i++) {
    const intents = intentsFn ? intentsFn(state) : [];
    tick(state, intents);
  }
  return state;
}

/**
 * Run a headless match where BOTH sides use the same bot logic. Useful for
 * balance tuning, determinism checks, and CI smoke tests.
 */
export function simulateBotMatch(seed = 0xC0FFEE, maxTicks = 8000, rules: MatchRules = skirmishRules()): {
  result: 'win' | 'loss' | 'timeout';
  ticks: number;
  finalState: SimState;
} {
  const s = createInitialState(seed, rules);
  while (s.result === 'playing' && s.tick < maxTicks) {
    const intents: Intent[] = s.tick % AI_THINK_TICKS === 0 ? botIntentsFor(s, 'player') : [];
    tick(s, intents);
  }
  return {
    result: s.result === 'playing' ? 'timeout' : s.result,
    ticks: s.tick,
    finalState: s,
  };
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

export { TICK_MS } from './types';

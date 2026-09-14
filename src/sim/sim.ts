import {
  type Age,
  type Intent,
  type PlayerState,
  type Projectile,
  type Side,
  type SimState,
  type UnitRole,
  type UnitState,
  AI_AGGRESSION,
  AI_THINK_TICKS,
  AGE_BONUS_PER_TIER,
  AGE_ORDER,
  ARMOR_COSTS,
  BASE_HP,
  COUNTER_MULTIPLIER,
  EVOLVE_COST,
  EVOLVE_XP_REQ,
  FORGE_COSTS,
  FRIENDLY_SEPARATION,
  GOLD_PER_TICK,
  LANE_BOTTOM,
  LANE_CENTER_Y,
  LANE_TOP,
  MAX_UPGRADE_RANK,
  PLAYER_BASE_X,
  AI_BASE_X,
  SAME_AGE_PENALTY,
  SPAWN_BUFFER_PX,
  SPAWN_GLOBAL_LOCK,
  STARTING_GOLD,
  TICK_MS,
  UNIT_DEFS,
  UPGRADE_BONUS_PER_RANK,
  VET_DMG, VET_HP, VET_SPD, VET_THRESHOLDS,
} from './types';
import { RNG } from './rng';

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createInitialState(seed = 0xBADF00D): SimState {
  const player: PlayerState = {
    gold: STARTING_GOLD,
    xp: 0,
    age: 'stone',
    baseHp: BASE_HP,
    spawnLockTicks: 0,
    evolveLockTicks: 0,
    forgeRank: 0,
    armorRank: 0,
  };
  const ai: PlayerState = {
    gold: STARTING_GOLD,
    xp: 0,
    age: 'stone',
    baseHp: BASE_HP,
    spawnLockTicks: 0,
    evolveLockTicks: 0,
    forgeRank: 0,
    armorRank: 0,
  };
  return {
    tick: 0,
    units: [],
    projectiles: [],
    player,
    ai,
    nextId: 1,
    result: 'playing',
    rngState: seed,
    events: [],
  };
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
  // Spawn position check — don't spawn inside another friendly unit.
  const spawnX = side === 'player' ? PLAYER_BASE_X + SPAWN_BUFFER_PX : AI_BASE_X - SPAWN_BUFFER_PX;
  const blockingRadius = 14;
  const blocked = state.units.some(
    (u) => u.side === side && u.state !== 'die' && Math.abs(u.x - spawnX) < blockingRadius,
  );
  return !blocked;
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

    // Y-offset jitter so stacked units don't perfectly overlap.
    const laneSpan = (LANE_BOTTOM - LANE_TOP) * 0.4;
    const yOffset = rng.float(-laneSpan / 2, laneSpan / 2);

    // Unit's multipliers track vet-only; global forge/armor bonuses apply via the owner PlayerState.
    const hpMul = VET_HP[0]!;
    const dmgMul = VET_DMG[0]!;
    const startHp = def.hp * hpMul * (1 + p.armorRank * UPGRADE_BONUS_PER_RANK);
    const unit: UnitState = {
      id: state.nextId++,
      def,
      side: intent.side,
      x: spawnX,
      yOffset,
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
  }

  if (intent.type === 'upgrade') {
    const isForge = intent.which === 'forge';
    const rank = isForge ? p.forgeRank : p.armorRank;
    if (rank >= MAX_UPGRADE_RANK) return;
    const costs = isForge ? FORGE_COSTS : ARMOR_COSTS;
    const cost = costs[p.age][rank]!;
    if (p.gold < cost) return;
    p.gold -= cost;
    const newRank = (rank + 1) as 0|1|2|3;

    // Armor upgrades immediately heal existing units by the added max HP (damage is
    // computed from p.forgeRank on every hit, so forge needs no retroactive work).
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
  }
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

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

function ageTier(age: Age): number {
  return AGE_ORDER.indexOf(age);
}

function computeDamage(attacker: UnitState, attackerPlayer: PlayerState): number {
  let dmg = attacker.def.damage * attacker.dmgMul;
  // Global forge upgrade bonus (stacks with vet).
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

function rewardKill(state: SimState, victim: UnitState): void {
  const killerSide: Side = victim.side === 'player' ? 'ai' : 'player';
  const p = killerSide === 'player' ? state.player : state.ai;
  const goldGain = Math.ceil(victim.def.cost * 0.4);
  p.gold += goldGain;
  p.xp += victim.def.xpValue;
  state.events.push({ kind: 'gold', side: killerSide, amount: goldGain, ttl: 30 });

  // Credit the unit that actually dealt the final hit. The old proximity-based
  // fallback promoted whichever unit happened to be closest, which made ranged
  // veterancy inconsistent and could reward a unit on the other side of a fight.
  const killer = victim.lastAttackerId === null
    ? null
    : state.units.find((u) => u.id === victim.lastAttackerId && u.side === killerSide) ?? null;
  if (killer) {
    const killerOwner = killerSide === 'player' ? state.player : state.ai;
    promoteVet(killer, killerOwner);
  }
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
    // Effective max HP includes armor upgrades; promote at same HP ratio plus top-up.
    const armorMul = 1 + owner.armorRank * UPGRADE_BONUS_PER_RANK;
    const oldMax = u.def.hp * VET_HP[wasVet]! * armorMul;
    const newMax = u.def.hp * newHpMul * armorMul;
    const ratio = Math.min(1, u.hp / oldMax);
    // Preserve the current health ratio and top up by the new rank's HP gain,
    // but never let a promotion create HP above the new effective maximum.
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

  // 1. Apply intents (spawn / evolve)
  for (const intent of intents) applyIntent(state, intent, rng);

  // 2. AI decision-making runs on a cadence.
  maybeAIAct(state, rng);

  // 3. Passive gold + cooldown decrements
  state.player.gold += GOLD_PER_TICK;
  state.ai.gold += GOLD_PER_TICK;
  if (state.player.spawnLockTicks > 0) state.player.spawnLockTicks--;
  if (state.ai.spawnLockTicks > 0) state.ai.spawnLockTicks--;
  if (state.player.evolveLockTicks > 0) state.player.evolveLockTicks--;
  if (state.ai.evolveLockTicks > 0) state.ai.evolveLockTicks--;

  // 4. Units — targeting, movement, attacks
  for (const u of state.units) {
    if (u.state === 'die') continue;
    u.ageTicks++;
    if (u.cooldown > 0) u.cooldown--;
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

    if (target) {
      const dist = Math.abs(target.x - u.x);
      // If too far from the target, walk toward them.
      if (dist > u.def.range) {
        u.state = 'walk';
        u.x += u.dir * u.def.speed * u.spdMul;
      } else {
        u.state = 'fight';
        if (u.cooldown <= 0) {
          u.cooldown = u.def.attackRate;
          fireAttack(state, u, target, owner, rng);
        }
      }
    } else {
      // No enemy on lane — walk toward base.
      u.state = 'walk';
      if (distToBase > 12) {
        u.x += u.dir * u.def.speed * u.spdMul;
      } else {
        // Attack the enemy base.
        u.state = 'fight';
        if (u.cooldown <= 0) {
          u.cooldown = Math.max(8, u.def.attackRate - 4);
          const defender = u.side === 'player' ? state.ai : state.player;
          let dmg = computeDamage(u, owner) * 0.9;
          const tierDelta = ageTier(u.def.age);
          dmg *= 1 + tierDelta * AGE_BONUS_PER_TIER;
          dmg *= 0.95 + rng.next() * 0.1;
          defender.baseHp -= dmg;
          state.events.push({
            kind: 'baseHit',
            side: u.side === 'player' ? 'ai' : 'player',
            damage: Math.round(dmg),
            ttl: 22,
          });
        }
      }
    }

    // Clamp x within lane bounds.
    if (u.x < PLAYER_BASE_X + 5) u.x = PLAYER_BASE_X + 5;
    if (u.x > AI_BASE_X - 5) u.x = AI_BASE_X - 5;
  }

  // 4b. Soft friendly separation so reinforcements can push past a stalled front.
  applyFriendlySeparation(state);

  // 5. Projectiles
  updateProjectiles(state, rng);

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
  // After a short death "animation" (tracked via ttl, we just keep them out of combat),
  // remove corpses after a few ticks. We don't currently render a death animation, so
  // remove immediately once rewarded.
  state.units = state.units.filter((u) => !(u.state === 'die' && u.cooldown < 0));

  // 7. Tick event TTLs; drop expired events. Gameover events are persistent.
  for (const e of state.events) {
    if ('ttl' in e) e.ttl--;
  }
  state.events = state.events.filter((e) => e.kind === 'gameover' || e.ttl > 0);

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

function applyFriendlySeparation(state: SimState): void {
  const alive = state.units.filter((u) => u.state !== 'die');
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]!;
        const b = alive[j]!;
        if (a.side !== b.side) continue;
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
    // Melee — immediate damage.
    damageUnit(state, target, baseDmg, attackerColor, u.id);
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
        damageUnit(state, target, p.damage * (0.95 + rng.next() * 0.1), color, p.attackerId);
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

function maybeAIAct(state: SimState, rng: RNG): void {
  if (state.tick % AI_THINK_TICKS !== 0) return;
  const ai = state.ai;

  // Count units per role on each side (rough strategic picture).
  const myUnits = state.units.filter((u) => u.side === 'ai' && u.state !== 'die');
  const enemyUnits = state.units.filter((u) => u.side === 'player' && u.state !== 'die');

  // Pick a composition response:
  //   enemy has more tanks? build ranged
  //   enemy has more ranged? build swarm
  //   enemy has more swarm? build tank
  const countRoles = (arr: UnitState[]) => {
    const c: Record<UnitRole, number> = { swarm: 0, tank: 0, ranged: 0 };
    for (const u of arr) c[u.def.role]++;
    return c;
  };
  const mine = countRoles(myUnits);
  const theirs = countRoles(enemyUnits);

  // Upgrade decision — invest in forge/armor periodically if affordable and
  // we're not saving for an age-up.
  if (!canEvolve(state, 'ai') && (ai.forgeRank < MAX_UPGRADE_RANK || ai.armorRank < MAX_UPGRADE_RANK)) {
    const hpRatio = state.ai.baseHp / BASE_HP;
    // Behind HP? armor first; otherwise alternate or pick cheapest available.
    const wantArmor = hpRatio < 0.75 && ai.armorRank <= ai.forgeRank;
    const picks: Array<'forge'|'armor'> = wantArmor ? ['armor', 'forge'] : ['forge', 'armor'];
    for (const pick of picks) {
      if (canUpgrade(state, 'ai', pick) && rng.next() < 0.35) {
        applyIntent(state, { type: 'upgrade', side: 'ai', which: pick }, rng);
        return;
      }
    }
  }

  // Evolution decision — if we can afford it and have been holding at current age, go up.
  if (canEvolve(state, 'ai') && rng.next() < 0.4) {
    applyIntent(state, { type: 'evolve', side: 'ai' }, rng);
    return;
  }

  // Desired role weights — counter whatever the enemy is fielding most of.
  const weights: Array<readonly [UnitRole, number]> = [
    ['swarm' as UnitRole, Math.max(0.2, 1 + theirs.ranged * 1.2 - mine.swarm * 0.5)] as const,
    ['tank'  as UnitRole, Math.max(0.2, 1 + theirs.swarm  * 1.2 - mine.tank  * 0.5)] as const,
    ['ranged'as UnitRole, Math.max(0.2, 1 + theirs.tank   * 1.2 - mine.ranged* 0.5)] as const,
  ];

  // Save threshold — don't spend below a float based on aggression.
  const reserve = (1 - AI_AGGRESSION) * 18;
  // Try a few times to pick a role we can afford; if none, save.
  for (let tries = 0; tries < 3; tries++) {
    const role = rng.weighted(weights);
    const def = UNIT_DEFS[ai.age][role];
    if (ai.gold >= def.cost + reserve && canSpawn(state, 'ai', role)) {
      applyIntent(state, { type: 'spawn', side: 'ai', role }, rng);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers exported for rendering/tests
// ---------------------------------------------------------------------------

export function step(state: SimState, intents: Intent[] = []): SimState {
  // Public alias — keeps the tick function pure-feeling (mutates in place but returns state).
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
export function simulateBotMatch(seed = 0xC0FFEE, maxTicks = 8000): {
  result: 'win' | 'loss' | 'timeout';
  ticks: number;
  finalState: SimState;
} {
  const s = createInitialState(seed);
  // Promote the internal AI to play both sides by feeding player-side intents
  // from a mirrored bot. We do this by ticking once to let ai act, then for
  // the player we run a mirror decision routine.
  while (s.result === 'playing' && s.tick < maxTicks) {
    // Run player-side bot on the same cadence as the internal AI for parity.
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
 * Decide spawn/evolve intents for `side` using the same simple counter-composition
 * logic the internal AI uses. Exported for bots/tests.
 */
export function botIntentsFor(state: SimState, side: Side): Intent[] {
  const rng = new RNG(state.rngState ^ (side === 'player' ? 0x9e3779b9 : 0));
  const intents: Intent[] = [];
  const me = side === 'player' ? state.player : state.ai;
  const mine = state.units.filter((u) => u.side === side && u.state !== 'die');
  const theirs = state.units.filter((u) => u.side !== side && u.state !== 'die');

  // Mirror the in-game AI's upgrade policy. Without this, headless self-play
  // gave the internal AI free Forge/Armor upgrades while the player bot never
  // upgraded, making the advertised balance results meaningless.
  if (!canEvolve(state, side) && (me.forgeRank < MAX_UPGRADE_RANK || me.armorRank < MAX_UPGRADE_RANK)) {
    const hpRatio = me.baseHp / BASE_HP;
    const wantArmor = hpRatio < 0.75 && me.armorRank <= me.forgeRank;
    const picks: Array<'armor' | 'forge'> = wantArmor ? ['armor', 'forge'] : ['forge', 'armor'];
    for (const pick of picks) {
      if (canUpgrade(state, side, pick) && rng.next() < 0.35) {
        intents.push({ type: 'upgrade', side, which: pick });
        return intents;
      }
    }
  }

  if (canEvolve(state, side) && rng.next() < 0.4) {
    intents.push({ type: 'evolve', side });
    return intents;
  }

  const countRoles = (arr: UnitState[]) => {
    const c: Record<UnitRole, number> = { swarm: 0, tank: 0, ranged: 0 };
    for (const u of arr) c[u.def.role]++;
    return c;
  };
  const my = countRoles(mine);
  const th = countRoles(theirs);
  const weights: Array<readonly [UnitRole, number]> = [
    ['swarm' as UnitRole, Math.max(0.2, 1 + th.ranged * 1.2 - my.swarm * 0.5)] as const,
    ['tank'  as UnitRole, Math.max(0.2, 1 + th.swarm  * 1.2 - my.tank  * 0.5)] as const,
    ['ranged'as UnitRole, Math.max(0.2, 1 + th.tank   * 1.2 - my.ranged* 0.5)] as const,
  ];
  const reserve = (1 - AI_AGGRESSION) * 15;
  for (let tries = 0; tries < 4; tries++) {
    const role = rng.weighted(weights);
    const def = UNIT_DEFS[me.age][role];
    if (me.gold >= def.cost + reserve && canSpawn(state, side, role)) {
      intents.push({ type: 'spawn', side, role });
      break;
    }
  }
  return intents;
}

export { TICK_MS };

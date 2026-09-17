/**
 * One-off diagnostic: why does a packed mid-lane engagement never break through?
 * Dumps throughput/occupancy counters over a full deterministic self-play match.
 *
 *   npx tsx scripts/sim-diagnose.ts 42 9000
 */
import { botIntentsFor, createInitialState, tick } from '../src/sim/sim';
import { AI_THINK_TICKS, AI_BASE_X, BASE_SIEGE_RANGE, PLAYER_BASE_X } from '../src/sim/types';

const seed = process.argv[2] ? parseInt(process.argv[2], 10) : 42;
const maxTicks = process.argv[3] ? parseInt(process.argv[3], 10) : 9000;

const s = createInitialState(seed);

let ticksWithPlayerMelee = 0;
let ticksWithAiMelee = 0;
let sumPlayerMelee = 0;
let sumAiMelee = 0;
let maxPlayerMelee = 0;
let bestPlayerX = 0;   // furthest any player unit ever advanced
let bestAiX = 960;
let ticksPlayerInSiege = 0;
let ticksAiInSiege = 0;
const reserveCounts: number[] = [];
const fightCounts: number[] = [];
const aliveCounts: number[] = [];
let clashSamples: number[] = [];

while (s.result === 'playing' && s.tick < maxTicks) {
  tick(s, s.tick % AI_THINK_TICKS === 0 ? botIntentsFor(s, 'player') : []);
  const alive = s.units.filter((u) => u.state !== 'die');
  const pMelee = alive.filter((u) => u.side === 'player' && u.state === 'fight' && u.def.range <= 26).length;
  const aMelee = alive.filter((u) => u.side === 'ai' && u.state === 'fight' && u.def.range <= 26).length;
  if (pMelee > 0) ticksWithPlayerMelee++;
  if (aMelee > 0) ticksWithAiMelee++;
  sumPlayerMelee += pMelee;
  sumAiMelee += aMelee;
  if (pMelee > maxPlayerMelee) maxPlayerMelee = pMelee;
  for (const u of alive) {
    if (u.side === 'player' && u.x > bestPlayerX) bestPlayerX = u.x;
    if (u.side === 'ai' && u.x < bestAiX) bestAiX = u.x;
  }
  const pFrontX = Math.max(0, ...alive.filter((u) => u.side === 'player').map((u) => u.x));
  const aFrontX = Math.min(960, ...alive.filter((u) => u.side === 'ai').map((u) => u.x));
  if (AI_BASE_X - pFrontX <= BASE_SIEGE_RANGE) ticksPlayerInSiege++;
  if (aFrontX - PLAYER_BASE_X <= BASE_SIEGE_RANGE) ticksAiInSiege++;
  if (s.tick % 20 === 0) {
    reserveCounts.push(alive.filter((u) => u.reserve).length);
    fightCounts.push(alive.filter((u) => u.state === 'fight').length);
    aliveCounts.push(alive.length);
    clashSamples.push((pFrontX + aFrontX) / 2);
  }
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
console.log(`seed ${seed} → ${s.result} in ${s.tick} ticks`);
console.log(`ticks with >=1 PLAYER melee attacker : ${ticksWithPlayerMelee}/${s.tick} (${((ticksWithPlayerMelee / s.tick) * 100).toFixed(1)}%)`);
console.log(`ticks with >=1 AI melee attacker     : ${ticksWithAiMelee}/${s.tick} (${((ticksWithAiMelee / s.tick) * 100).toFixed(1)}%)`);
console.log(`mean simultaneous PLAYER melee attackers: ${(sumPlayerMelee / s.tick).toFixed(2)} (peak ${maxPlayerMelee})`);
console.log(`mean simultaneous AI melee attackers    : ${(sumAiMelee / s.tick).toFixed(2)}`);
console.log(`furthest player advance : x=${bestPlayerX.toFixed(0)}  (siege needs x>=${AI_BASE_X - BASE_SIEGE_RANGE})`);
console.log(`deepest AI advance      : x=${bestAiX.toFixed(0)}  (siege needs x<=${PLAYER_BASE_X + BASE_SIEGE_RANGE})`);
console.log(`ticks a player unit inside AI siege zone : ${ticksPlayerInSiege}`);
console.log(`ticks an AI unit inside player siege zone: ${ticksAiInSiege}`);
console.log(`mean alive units : ${avg(aliveCounts).toFixed(1)}`);
console.log(`mean units fighting: ${avg(fightCounts).toFixed(2)}  (${((avg(fightCounts) / Math.max(1, avg(aliveCounts))) * 100).toFixed(1)}% of the field)`);
console.log(`mean reserves      : ${avg(reserveCounts).toFixed(2)}`);
console.log(`mean clash x       : ${avg(clashSamples).toFixed(0)}  min ${Math.min(...clashSamples).toFixed(0)} max ${Math.max(...clashSamples).toFixed(0)}`);
console.log(`ultimates cast     : player ${s.stats.ultimatesUsed.player}  ai ${s.stats.ultimatesUsed.ai}`);
console.log(`kills              : player ${s.stats.kills.player}  ai ${s.stats.kills.ai}`);
console.log(`turret kills       : player ${s.stats.turretKills.player}  ai ${s.stats.turretKills.ai}`);
console.log(`base hp            : player ${Math.max(0, s.player.baseHp).toFixed(0)}  ai ${Math.max(0, s.ai.baseHp).toFixed(0)}`);

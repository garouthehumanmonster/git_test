/**
 * Headless self-play runner — the balance/CI evidence tool.
 *   npx tsx scripts/sim-match.ts           (single random seed)
 *   npx tsx scripts/sim-match.ts 100       (100 matches, summary stats)
 *   npx tsx scripts/sim-match.ts 100 1     (deterministic batch: seeds 1 + i*7919)
 *
 * Aggregate metrics reported: win rate, draw/timeout rate, match length, and
 * the breakthrough evidence (how much of each match was decided by units
 * reaching a base versus by Timeline Collapse).
 */
import { simulateBotMatch } from '../src/sim/sim';
import { TICK_MS } from '../src/sim/types';

const args = process.argv.slice(2);
const count = Math.max(1, parseInt(args[0] ?? '1', 10) || 1);
const seedArg = args[1] ? parseInt(args[1], 10) : null;

let wins = 0;
let losses = 0;
let draws = 0;
let timeouts = 0;
let collapseDecided = 0;
let breakthroughs = 0;
let totalTicks = 0;
let maxTicks = 0;
let minTicks = Infinity;
let totalSiegeDamage = 0;
let totalKills = 0;
let totalBanked = 0;

for (let i = 0; i < count; i++) {
  // A batch run from a fixed base seed must still vary per match, otherwise all
  // N matches are the same match. Step by a large prime so the seeds stay
  // reproducible (`npm run sim 100 1` always replays the same 100 matches).
  const seed = seedArg === null ? Math.floor(Math.random() * 0xffffffff) : seedArg + i * 7919;
  const m = simulateBotMatch(seed, 12000);
  const s = m.finalState;
  totalTicks += m.ticks;
  if (m.ticks > maxTicks) maxTicks = m.ticks;
  if (m.ticks < minTicks) minTicks = m.ticks;
  if (m.result === 'win') wins++;
  else if (m.result === 'loss') losses++;
  else if (m.result === 'draw') draws++;
  else timeouts++;

  // "Decided by collapse" means the verdict came out of the tiebreak ladder,
  // not merely that the clock had passed the collapse mark.
  const decidedByCollapse = m.finalState.endReason === 'collapseBaseHp'
    || m.finalState.endReason === 'collapseBaseDamage'
    || m.finalState.endReason === 'collapseKills'
    || m.finalState.endReason === 'collapseDraw';
  if (decidedByCollapse) collapseDecided++;
  const siege = s.stats.baseDamage.player + s.stats.baseDamage.ai;
  totalSiegeDamage += siege;
  if (siege > 0) breakthroughs++;
  totalKills += s.stats.kills.player + s.stats.kills.ai;
  totalBanked += Math.floor(s.player.gold) + Math.floor(s.ai.gold);

  if (count === 1) {
    console.log(`seed ${seed}`);
    console.log(`result: ${m.result}  ticks: ${m.ticks}`);
    console.log(`player hp: ${Math.max(0, m.finalState.player.baseHp).toFixed(1)}  age: ${m.finalState.player.age}  xp: ${m.finalState.player.xp}`);
    console.log(`ai     hp: ${Math.max(0, m.finalState.ai.baseHp).toFixed(1)}  age: ${m.finalState.ai.age}  xp: ${m.finalState.ai.xp}`);
    console.log(`units alive: ${m.finalState.units.length}`);
    console.log(`end reason: ${m.finalState.endReason ?? 'n/a'}`);
    console.log(`base damage dealt (player/ai): ${s.stats.baseDamage.player.toFixed(0)} / ${s.stats.baseDamage.ai.toFixed(0)}`);
    console.log(`kills (player/ai): ${s.stats.kills.player} / ${s.stats.kills.ai}`);
    console.log(`gold banked (player/ai): ${Math.floor(s.player.gold)} / ${Math.floor(s.ai.gold)}`);
  }
}

if (count > 1) {
  const pct = (n: number) => `${n} (${((n / count) * 100).toFixed(1)}%)`;
  console.log(`matches            : ${count}`);
  console.log(`wins               : ${pct(wins)}`);
  console.log(`losses             : ${pct(losses)}`);
  console.log(`draws              : ${pct(draws)}`);
  console.log(`timeouts           : ${pct(timeouts)}`);
  console.log(`decided by collapse: ${pct(collapseDecided)}`);
  console.log(`breakthrough match : ${pct(breakthroughs)}  (at least one base took siege damage)`);
  console.log(`ticks avg/min/max  : ${(totalTicks / count).toFixed(0)} / ${minTicks} / ${maxTicks}`);
  console.log(`seconds avg/min/max: ${((totalTicks / count) * TICK_MS / 1000).toFixed(1)} / ${(minTicks * TICK_MS / 1000).toFixed(1)} / ${(maxTicks * TICK_MS / 1000).toFixed(1)}`);
  console.log(`base dmg per match : ${(totalSiegeDamage / count).toFixed(0)}  (both bases combined)`);
  console.log(`kills per match    : ${(totalKills / count).toFixed(1)}`);
  console.log(`gold banked / match: ${(totalBanked / count).toFixed(0)}  (both sides, unspent at the whistle)`);
}

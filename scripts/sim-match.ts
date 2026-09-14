/**
 * Headless self-play runner — useful for balance tuning / CI.
 *   npx tsx scripts/sim-match.ts           (single random seed)
 *   npx tsx scripts/sim-match.ts 100       (100 matches, summary stats)
 *   npx tsx scripts/sim-match.ts 1 42      (1 match, seed 42)
 */
import { simulateBotMatch } from '../src/sim/sim';

const args = process.argv.slice(2);
const count = Math.max(1, parseInt(args[0] ?? '1', 10) || 1);
const seedArg = args[1] ? parseInt(args[1], 10) : null;

let wins = 0;
let losses = 0;
let timeouts = 0;
let totalTicks = 0;
let maxTicks = 0;
let minTicks = Infinity;

for (let i = 0; i < count; i++) {
  const seed = seedArg ?? Math.floor(Math.random() * 0xffffffff);
  const m = simulateBotMatch(seed, 12000);
  totalTicks += m.ticks;
  if (m.ticks > maxTicks) maxTicks = m.ticks;
  if (m.ticks < minTicks) minTicks = m.ticks;
  if (m.result === 'win') wins++;
  else if (m.result === 'loss') losses++;
  else timeouts++;

  if (count === 1) {
    console.log(`seed ${seed}`);
    console.log(`result: ${m.result}  ticks: ${m.ticks}`);
    console.log(`player hp: ${Math.max(0, m.finalState.player.baseHp).toFixed(1)}  age: ${m.finalState.player.age}  xp: ${m.finalState.player.xp}`);
    console.log(`ai     hp: ${Math.max(0, m.finalState.ai.baseHp).toFixed(1)}  age: ${m.finalState.ai.age}  xp: ${m.finalState.ai.xp}`);
    console.log(`units alive: ${m.finalState.units.length}`);
  }
}

if (count > 1) {
  console.log(`matches : ${count}`);
  console.log(`wins    : ${wins} (${((wins / count) * 100).toFixed(1)}%)`);
  console.log(`losses  : ${losses} (${((losses / count) * 100).toFixed(1)}%)`);
  console.log(`timeouts: ${timeouts}`);
  console.log(`ticks avg/min/max: ${(totalTicks / count).toFixed(0)} / ${minTicks} / ${maxTicks}`);
}

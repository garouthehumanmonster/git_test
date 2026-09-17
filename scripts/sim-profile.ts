/**
 * Headless combat profiler — dumps the live state of a deterministic self-play
 * match so balance changes are made from evidence rather than guesswork.
 *
 *   npx tsx scripts/sim-profile.ts            (seed 42)
 *   npx tsx scripts/sim-profile.ts 4242 6000  (seed, maxTicks)
 */
import { botIntentsFor, createInitialState, tick } from '../src/sim/sim';
import { AI_THINK_TICKS, BASE_SIEGE_RANGE, AI_BASE_X, PLAYER_BASE_X, collapseRate } from '../src/sim/types';

const seed = process.argv[2] ? parseInt(process.argv[2], 10) : 42;
const maxTicks = process.argv[3] ? parseInt(process.argv[3], 10) : 9000;

const s = createInitialState(seed);
const every = 200;

console.log(
  'tick   | pHp   aHp   | P units (fight/res) A units (fight/res) | clash  | P base dmg/tick  A base dmg/tick | gold P/A   | age P/A',
);
let pBaseHits = 0;
let aBaseHits = 0;
let pBaseDmg = 0;
let aBaseDmg = 0;

while (s.result === 'playing' && s.tick < maxTicks) {
  const beforeP = s.player.baseHp;
  const beforeA = s.ai.baseHp;
  const intents = s.tick % AI_THINK_TICKS === 0 ? botIntentsFor(s, 'player') : [];
  tick(s, intents);
  const dP = beforeP - s.player.baseHp;
  const dA = beforeA - s.ai.baseHp;
  if (dP > 0) pBaseHits++;
  if (dA > 0) aBaseHits++;
  pBaseDmg += dP;
  aBaseDmg += dA;

  if (s.tick % every === 0 || s.result !== 'playing') {
    const pUnits = s.units.filter((u) => u.side === 'player' && u.state !== 'die');
    const aUnits = s.units.filter((u) => u.side === 'ai' && u.state !== 'die');
    const clash = s.units.reduce((best, u) => {
      if (u.state === 'die' || u.side !== 'player') return best;
      for (const o of s.units) {
        if (o.side !== 'ai' || o.state === 'die') continue;
        const d = Math.abs(o.x - u.x);
        if (d < best.d) best = { d, x: (u.x + o.x) / 2 };
      }
      return best;
    }, { d: Infinity, x: NaN });
    const pFront = pUnits.filter((u) => u.state === 'fight').length;
    const pRes = pUnits.filter((u) => u.reserve).length;
    const aFront = aUnits.filter((u) => u.state === 'fight').length;
    const aRes = aUnits.filter((u) => u.reserve).length;
    const pSiege = pUnits.filter((u) => Math.abs(AI_BASE_X - u.x) <= BASE_SIEGE_RANGE).length;
    const aSiege = aUnits.filter((u) => Math.abs(PLAYER_BASE_X - u.x) <= BASE_SIEGE_RANGE).length;
    console.log(
      `${String(s.tick).padStart(5)}  | ${Math.max(0, s.player.baseHp).toFixed(0).padStart(4)} ${Math.max(0, s.ai.baseHp).toFixed(0).padStart(5)}` +
      ` | P ${String(pUnits.length).padStart(3)} (${String(pFront).padStart(3)}/${String(pRes).padStart(3)}) siege ${pSiege}` +
      ` A ${String(aUnits.length).padStart(3)} (${String(aFront).padStart(3)}/${String(aRes).padStart(3)}) siege ${aSiege}` +
      ` | clash ${Number.isFinite(clash.x) ? clash.x.toFixed(0).padStart(4) : '  --'}` +
      ` | P->A ${dA.toFixed(1).padStart(5)}/t  A->P ${dP.toFixed(1).padStart(5)}/t` +
      ` | ${Math.floor(s.player.gold).toString().padStart(4)}/${Math.floor(s.ai.gold).toString().padStart(4)}` +
      ` | ${s.player.age.slice(0, 4)}/${s.ai.age.slice(0, 4)}` +
      ` | col ${collapseRate(s.tick).toFixed(2)}`,
    );
  }
}

console.log('---');
console.log(`result          : ${s.result}`);
console.log(`ticks           : ${s.tick}`);
console.log(`player base hp  : ${Math.max(0, s.player.baseHp).toFixed(1)}`);
console.log(`ai base hp      : ${Math.max(0, s.ai.baseHp).toFixed(1)}`);
console.log(`ticks with damage on PLAYER base: ${pBaseHits}  (total ${pBaseDmg.toFixed(0)})`);
console.log(`ticks with damage on AI base    : ${aBaseHits}  (total ${aBaseDmg.toFixed(0)})`);
console.log(`stats           : kills P/A ${s.stats.kills.player}/${s.stats.kills.ai}  spawned P/A ${s.stats.unitsSpawned.player}/${s.stats.unitsSpawned.ai}`);
console.log(`gold banked     : player ${Math.floor(s.player.gold)}  ai ${Math.floor(s.ai.gold)}`);

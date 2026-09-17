# Fair match resolution, lane throughput and the late-game gold sink

This document records what changed after a production-build playtest that ended
**Defeat at 0–0** despite 151 enemy kills against 16 losses and 2778 unspent
gold. Everything here is enforced in `src/sim/**` and covered by tests.

---

## 1. Timeline Collapse resolution (the unfair defeat)

### The bug

`tick()` ended with:

```ts
if (state.player.baseHp <= 0)      state.result = 'loss';
else if (state.ai.baseHp <= 0)     state.result = 'win';
```

Collapse drains **both** bases by the same amount every tick, so an even match
arrives at `0` / `0` on one tick — and the player branch was tested first. Every
simultaneous zero was therefore a defeat, including for a player who had out-fought
the AI the entire match.

### The contract

`SimState.result` is now `'playing' | 'win' | 'loss' | 'draw'`, and
`resolveMatchEnd(state, playerHpBefore, aiHpBefore)` (in `src/sim/sim.ts`) is the
single place a match ends. `playerHpBefore` / `aiHpBefore` are captured at the very
top of `tick()`, i.e. *immediately before* the collapse drain of that tick.

| # | Test | Result | `endReason` |
|---|------|--------|-------------|
| — | Only the enemy base fell | `win` | `enemyBaseDestroyed` |
| — | Only the player base fell | `loss` | `playerBaseDestroyed` |
| 1 | Both fell; higher base HP before the tick | `win` / `loss` | `collapseBaseHp` |
| 2 | HP level (within `COLLAPSE_HP_TIE_EPSILON`); higher **net base damage** (siege out − siege taken) | `win` / `loss` | `collapseBaseDamage` |
| 3 | Damage level; more **kills** | `win` / `loss` | `collapseKills` |
| 4 | Nothing separates them | **`draw`** | `collapseDraw` |

A simultaneous zero is never an automatic loss, and a draw is a real result — the
campaign awards it `DRAW_STARS = 1` and unlocks the next stage, so nobody can be
locked out of progress by the old behaviour.

### Supporting state

* `MatchStats.baseDamage: Record<Side, number>` — siege damage dealt to the *enemy*
  base, accumulated in the sim (not the renderer), so it is replay-safe.
* `SimState.endReason?: EndReason` and `SimState.endHpSnapshot?: Record<Side, number>`
  — the verdict and its inputs, so the results card can explain itself and a replay
  can be audited.
* `SimState.lastBreakthroughTick: number` — see §2.

---

## 2. Making the lane decisive

### What profiling found

`npx tsx scripts/sim-profile.ts` / `scripts/sim-diagnose.ts` on deterministic
self-play (before any change):

* **Only 3.5 % of the living field was ever in the `fight` state** (0.42 of ~12 units).
* **14 / 100 matches ever landed a single point of siege damage**; median siege
  damage per match was **0**.
* **Superweapons dealt ~67 % of all damage** (13.7k of 20.5k on seed 42) — with
  ~25 casts per side, every push was deleted before it arrived.
* Every melee unit targeted the *nearest* enemy, so a 12-unit army put exactly the
  same three swingers on the front man as a 3-unit army. The front-line cap had
  silently become a hard throughput ceiling.

### What changed (all bounded, all role-preserving)

| Constant | Before | After | Why |
|---|---|---|---|
| `MELEE_REACH_BONUS` | — | `10` | `FRIENDLY_SEPARATION` (14) and `RESERVE_GAP` (20) both exceed every melee range (14–26 px), so a second attacker queued one body behind the first could never touch the enemy. Only melee units that *hold* a front-line slot get the bonus; ranged units keep their own range. |
| `findTarget()` | nearest enemy | melee prefers the nearest enemy **with a free front-line slot** | Numbers now buy damage. The per-target cap is unchanged (`FRONT_LINE_SLOTS`), so the engagement test still holds. |
| `PUSH_RANGE` | `200` | `480` | A column stretched over 400 px of lane is one army and is now weighed as one. |
| `PUSH_SPEED` | `0.85` | `1.1` | Advantage buys visible ground. |
| `ULT_PASSIVE_PER_TICK` | `0.16` | `0.12` | The superweapon goes back to being a tempo tool. |
| `ULT_PER_KILL` | `9` | `4.5` | ~180 kills no longer buys ~16 airstrikes. |
| `STALEMATE_GRACE_TICKS` / `_RAMP_PER_1000_TICKS` / `_MAX_RAMP` | — | `1500` / `0.16` / `0.7` | Attrition ramp: zero until the lane has gone 75 s without either base taking siege damage, resets on any breakthrough, capped at +70 %. Applies to unit combat only — not to superweapons or turrets. |

Untouched on purpose: `FRIENDLY_SEPARATION` (still 14), the reserve queue,
`FRONT_LINE_SLOTS`, tank speed, ranged range.

### Before / after — `npm run sim 100` (100 deterministic matches, seeds `1 + i·7919`, 12 000-tick cap)

| Metric | Before | After |
|---|---|---|
| Self-play win / loss / draw | 12 % / 88 % / — | **64 % / 34 % / 2 %** |
| Timeouts | 0 | **0** |
| Matches decided by the collapse tiebreak | 95 % | **23 %** |
| Matches with a real breakthrough (≥1 siege damage) | 14 % | **77 %** |
| Mean match length | 5965 ticks (298.2 s) | **4518 ticks (225.9 s)** |
| Min / max match length | 1871 / 6162 ticks | 1640 / 6162 ticks |
| Base damage per match (both bases) | 72 | **518** |
| Kills per match | 319.5 | 206.6 |
| Units in `fight` state (sampled) | 3.5 % of the field | ~7 % of the field |

"Decided by collapse" is now measured from `endReason`, not from the clock: a match
that ends after tick 4800 because a base was destroyed counts as a breakthrough.

**Known residual asymmetry.** The mirror split is 64/34 rather than 50/50. It is not
harness wiring: swapping the two bot RNG streams, the unit iteration order, the
intent application order, the turret firing order and the projectile order each move
the number by ≤3 points, and the two sides' decisions and economies are statistically
identical (spawns 4169 vs 4313, evolves 80 vs 80, final age 2.00 vs 2.00). The
residual is positional in the lane (mean player front line x 429 vs AI 605 against a
lane centre of 480) and predates this change — before it, the same harness gave the
player 86 % of the decisive matches. It is flagged as separate follow-up work.

---

## 3. The late-game gold sink: Reinforcement Call-up

A real match banked **2778 gold** because cooldowns, not the economy, limited every
decision. The call-up is the sink.

| Constant | Value |
|---|---|
| `REINFORCE_SQUAD_SIZE` | 3 |
| `REINFORCE_ROLES` | `['swarm', 'ranged', 'tank']` — a mixed squad, so the counter triangle survives the purchase |
| `REINFORCE_COSTS` | stone `[90, 150, 240, 360]`, medieval `[140, 230, 360, 540]`, modern `[220, 350, 540, 800]` |
| `REINFORCE_MAX_PURCHASES` | 4 per match per side |
| `REINFORCE_COOLDOWN_TICKS` | 300 (15 s) |
| `REINFORCE_SPACING_PX` | 18 |

* Cost is looked up at the **current age** and **escalates with every call-up already
  bought**. Four modern call-ups cost 1910 gold — a real answer to a fat treasury.
* The squad bypasses the ordinary spawn lock and is staggered behind the base apron,
  so the 14 px spawn block never rejects it.
* Validation, deduction, cap and cooldown all live in the sim (`canReinforce`,
  `reinforceCostFor`, `reinforceBlockReason`, the `reinforce` intent), so a replay
  reproduces them exactly.
* Every refusal is explained in the HUD: `Need N more gold`, `Cooldown Ns`,
  `Cap reached (4/match)`, `Match over`.
* HUD: a `CALL-UP` button in the action bar with cost, four cap pips and a cooldown
  sweep, plus hotkey **C** (`R` is already the results-card restart), documented in the on-screen help line and the README controls table.

---

## 4. Results and communication

* The results card distinguishes **VICTORY / DRAW / DEFEAT** and leads with an
  `OUTCOME` row carrying the sim's own words — `Collapse tiebreak: base damage`,
  `Collapse tiebreak: base integrity`, `Collapse tiebreak: kills`,
  `Timeline Collapse: draw`, `Enemy base destroyed`, `Your base was destroyed`.
  It never claims a base kill that did not happen.
* A draw unlocks the next stage, awards the minimum 1 star, and deliberately does
  **not** set a best-clear time (it is not a clean clear). No revive is offered,
  because there was no defeat.
* Existing v1 campaign saves load unchanged — no schema change was needed, and
  `sanitize()` still defaults missing `bestMs` safely.
* Announcements now go through a bounded FIFO `ToastQueue` (3 waiting slots), so a
  Chrono Warp, an incoming superweapon and the collapse warning can no longer paint
  over each other. Important alerts jump the queue and evict routine ones.

---

## Reproducing the evidence

```bash
npm run typecheck            # tsc --noEmit
npx vitest run               # 120 tests
npm run build                # tsc && vite build
npm run sim 100 1            # deterministic batch: seeds 1 + i*7919
npx tsx scripts/sim-profile.ts 42 9000    # per-tick combat/lane dump
npx tsx scripts/sim-diagnose.ts 42 9000   # throughput & breakthrough counters
```

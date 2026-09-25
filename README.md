# ⚔️ Timeline War

[![CI](https://github.com/garouthehumanmonster/git_test/actions/workflows/ci.yml/badge.svg)](https://github.com/garouthehumanmonster/git_test/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A single-lane RTS that runs entirely in the browser. March one army down one
lane, evolve **Stone → Medieval → Modern**, and take the enemy base before the
timeline collapses and takes yours.

960×540 canvas · 20 ticks/second fixed-step simulation · deterministic from a
seed · no backend · playable on the CrazyGames portal.

![Timeline War banner](public/banner.jpg)

## Contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Controls](#controls)
- [How a match resolves](#how-a-match-resolves)
- [Units & the counter triangle](#units--the-counter-triangle)
- [Abilities & upgrades](#abilities--upgrades)
- [Campaign](#campaign)
- [Architecture](#architecture)
- [Art pipeline](#art-pipeline)
- [Simulation & determinism](#simulation--determinism)
- [Audio](#audio)
- [Portal integration & monetisation](#portal-integration--monetisation)
- [Telemetry](#telemetry)
- [Testing](#testing)
- [Balance harness](#balance-harness)
- [Docs index](#docs-index)
- [Repository & workflow](#repository--workflow)
- [Known gaps](#known-gaps)

## Highlights

- **Five-stage campaign + Endless Skirmish** — *Dawn of Man → Iron Vanguard →
  Technological Divide → Blitzkrieg → Total Timeline War*, each with its own AI
  script, plus an unranked skirmish that runs the same ruleset the balance
  harness uses. Wins are rated 1–3★ on surviving base HP; unlocks, stars and best
  clear times persist to `localStorage`.
- **Two meters and a rally** — the age **Superweapon** (`Space`) and a **Chrono
  Surge** (`Q`) that hastens your army while the enemy's crawls, plus a
  gold-bought **War Cry** (`W`) charge.
- **Orders of battle that read** — units take a lane rank from their id
  (`(id % 5 - 2) * 12`), only three melee fighters per side may engage one
  target, and everyone queued behind them holds a 20px following distance.
  Armies fight as formations, never as one-pixel mosh pits.
- **A lane that actually resolves** — numbers push the clash line forward, a
  breached front sieges the tower, income escalates after two minutes, and at
  four minutes the timeline collapses and drains both bases. A simultaneous zero
  is settled by a documented tiebreak (base HP → net base damage → kills → an
  honest **draw**), never by an automatic defeat.
- **Illustrated units over a procedural world** — units and towers ship as
  high-resolution raster sprites with 6-frame animation plates (walk ×4, strike,
  fallen), generated offline by a Python pipeline; every prop, projectile,
  particle, flag, turret, HUD crest and icon is still generated in code at boot,
  and the code path is also the fallback if an atlas plate is missing.
- **Pure deterministic simulation** — `src/sim/` has zero Phaser and zero DOM
  imports, runs on a 32-bit Mulberry32 PRNG, and replays byte-for-byte from
  `state.rngState`. Netplay and replay ready.
- **232 tests, 20 files** — sim rules, golden replays, campaign maths, HUD copy,
  input buffering, art palette contract, SDK QA, plus a real-browser E2E job that
  drives the production build with real key events.
- **Built for a portal** — CrazyGames SDK v3 lifecycle and ad hooks with a
  fail-safe offline mode, a contextual rewarded Supply Drop, privacy-safe
  bucketed telemetry, a first-run tutorial coach, and an ARIA live region for
  screen readers.

## Screenshots

`docs/overview.png` and `docs/kit.png` are rendered by `npm run art:preview`
from the same art code the game runs — no browser required.

![Timeline War — all three ages and their unit line-ups](docs/overview.png)

The combat kit — base turrets, attack effects and the turret/superweapon HUD
icons, at the exact scale they appear in play:

![Timeline War — turrets, effects and icons](docs/kit.png)

`docs/live_battle_e2e.png` is a frame captured by the real-browser E2E harness
(`E2E_KEEP_SCREENSHOTS=1 npm run test:e2e`), and `docs/playtest/` holds frames
from a scripted in-browser playthrough, captured at cycles 1, 5, 10, 15, 20
and 25.

## Quick start

Requires **Node 22** (the version CI runs) and npm.

```bash
npm ci                # install
npm run dev           # dev server on http://localhost:5173
npm run preview       # serve the production build on http://localhost:4173

npm test              # Vitest suite — 232 tests / 20 files
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run build         # tsc && vite build -> dist/

npm run sim 25        # 25 headless bot-vs-bot matches
npm run sim:baseline  # 500 matches across all 5 stages -> docs/LAUNCH_BASELINE.md
npm run art:build     # art/source/*.jpg -> public/atlas/bg_<age>.png
npm run art:preview   # software-render docs/*.png (no browser, no GPU)
npm run test:e2e      # real Chromium drives the built bundle (needs Playwright)
```

`npm run test:e2e` needs `pip install playwright && playwright install chromium`.
It is portable by environment variable — `E2E_PORT`, `E2E_BROWSER_CHANNEL`,
`E2E_HEADLESS=0` to watch it run, `E2E_KEEP_SCREENSHOTS=1` to keep frames.

## Controls

| Key | Action | Description |
| :--- | :--- | :--- |
| `1` | **Spawn Swarm** | Clubber / Man-at-Arms / Commando — cheap, fast, shreds ranged |
| `2` | **Spawn Tank** | Mammoth / Knight / Heavy Tank — beefy, slow, crushes swarms, cleaves |
| `3` | **Spawn Ranged** | Slinger / Archer / Sniper — fragile, long range, melts tanks |
| `E` | **Evolve Age** | Stone → Medieval → Modern; needs both XP **and** gold |
| `U` | **Forge** | +15% army damage per rank, 3 ranks per age |
| `Y` | **Armor** | +15% army HP per rank, 3 ranks per age |
| `T` | **Build / Upgrade Turret** | One base-defence turret, three ranks, auto-firing |
| `Q` | **Chrono Surge** | 2s time warp: your army hastens, the enemy's crawls |
| `W` | **War Cry** | 25g rally: +25% speed, +15% damage, every hit crits, for 4s |
| `C` | **Reinforcement Call-up** | Mixed 3-unit squad; cost escalates, 4 per match, 15s cooldown |
| `Space` | **Superweapon** | Fires the age's ultimate once the meter is full |
| `X` | **Cycle Speed** | 1× → 2× → 3× |
| `P` / `Esc` | **Pause** | Pauses the sim and the match clock (works on the results card too) |
| `M` | **Mute** | Master mute — music, SFX and voice together |
| `Shift+M` | **Mute voice** | Announcer only |
| `Ctrl/⌘+M` | **Mute music** | Soundtrack only |
| `F` | **Fullscreen** | Toggles the Phaser scale manager |
| `Enter` | **Next level** | Results card: open the next campaign stage (or retry after a loss) |
| `Space` / `R` | **Restart** | Results card: replay the same stage |

Every action has an on-screen HUD button except **War Cry** (`W`), which is
keyboard-only; the results card has its own buttons for `Enter` and restart.
Key presses typed while the scene is still booting are buffered and replayed in
order rather than dropped (`src/render/inputBuffer.ts`).

## How a match resolves

Both bases start at **800 HP**. The clock is measured in 50ms ticks.

| Phase | When | What happens |
| :--- | :--- | :--- |
| Opening | 0–2 min | 0.35 gold/tick (~7/s) per side. Skirmish starts both sides at 40g; campaign stages start the player at 120g and the AI at 110–260g by stage |
| Escalation | from 2:00 | Income ramps +0.28 per 1000 ticks, capped at 2.2×, so a symmetric trade cannot hold the lane forever |
| Pressure | continuous | Whichever side holds more weight inside 480px of the clash presses the line at up to 1.1px/tick |
| Attrition ramp | after 75s with no siege damage | Unit damage ramps +0.16 per 1000 ticks, capped at +70%; resets the moment a base is hit |
| Siege | unit within 84px of a base | The unit stops trading and hits the structure |
| **Collapse** | from 4:00 | Both bases drain at 0.35 HP/tick, accelerating +1.0× per 1000 ticks |

If collapse zeroes both bases on the same tick, `resolveMatchEnd` walks the
documented tiebreak — **base HP → net base damage → kills → draw** — and records
the reason on the state so the results card can explain it. A draw is a
first-class outcome worth 1★; progress never stalls on it.
See [`docs/COLLAPSE_AND_PACING.md`](docs/COLLAPSE_AND_PACING.md).

## Units & the counter triangle

**Swarm ▶ Ranged ▶ Tank ▶ Swarm.** Hitting your counter target multiplies damage
by **1.8**; being one age ahead adds **+22%** per tier.

| Age | Role | Unit | HP | DMG | Speed¹ | Range | Rate² | Cost |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stone | Swarm | Clubber | 22 | 8 | 1.20 | 14 | 16 | 5 |
| Stone | Tank | Mammoth | 95 | 18 | 0.55 | 18 | 26 | 18 |
| Stone | Ranged | Slinger | 16 | 11 | 0.90 | 95 | 24 | 12 |
| Medieval | Swarm | Man-at-Arms | 40 | 13 | 1.25 | 16 | 14 | 10 |
| Medieval | Tank | Knight | 160 | 28 | 0.60 | 20 | 24 | 30 |
| Medieval | Ranged | Archer | 30 | 20 | 0.95 | 150 | 20 | 20 |
| Modern | Swarm | Commando | 65 | 20 | 1.35 | 18 | 12 | 18 |
| Modern | Tank | Heavy Tank | 290 | 46 | 0.70 | 26 | 22 | 55 |
| Modern | Ranged | Sniper | 45 | 44 | 1.00 | 220 | 26 | 38 |

¹ px per tick at 20 ticks/s · ² ticks between attacks. Source of truth:
`UNIT_DEFS` in [`src/sim/types.ts`](src/sim/types.ts).

**Veterancy.** Units earn kills on the field. At **3** kills they become a
Veteran (+25% damage, +20% HP, +5% speed) and at **6** an Elite (+55%, +45%,
+15%), with rank chevrons drawn on the sprite and an instant HP top-up on
promotion.

## Abilities & upgrades

| Ability | Key | Cost / meter | Effect |
| :--- | :--- | :--- | :--- |
| **Forge** | `U` | 25/50/90 → 40/80/140 → 70/130/220 by age | +15% damage per rank, 3 ranks |
| **Armor** | `Y` | same tables | +15% HP per rank, 3 ranks |
| **Evolve** | `E` | Medieval 40g + 20 XP · Modern 90g + 60 XP | Unlocks the next age's units and kit |
| **Turret** | `T` | 45/80/130 → 65/110/180 → 95/160/250 by age | One tower, 3 ranks, +30% damage per rank above the first, auto-targets inside 250px |
| **Superweapon** | `Space` | 100-point meter: +0.12/tick, +4.5/kill, starts at 15 | Age ultimate (below) |
| **Chrono Surge** | `Q` | 100-point meter: +0.35/tick, +10/kill | 2s warp — allies move at 1.35× and attack twice as fast; enemies drop to 0.35× and their attack cooldowns only tick every other tick |
| **War Cry** | `W` | 25 gold, 12s cooldown | 4s rally — +25% speed, +15% damage, every attack crits, extra attack haste. Keyboard-only |
| **Reinforcement Call-up** | `C` | 90/150/240/360 (Stone) · 140/230/360/540 (Medieval) · 220/350/540/800 (Modern) | Mixed swarm+ranged+tank squad at the base; max 4 per match, 15s between purchases |

Turrets by age: **Rock Thrower** (30 dmg, 1 shot / 1.7s), **Ballista** (17 × 3
piercing / 1.1s), **Flak Cannon** (8 × 2 / 0.3s).

Superweapons by age: **Meteor Strike** (3 × 58, r62), **Rain of Fire** (9 × 17,
r46), **Airstrike** (7 × 40, r58). Impacts are scheduled up-front from the seeded
RNG, so a replay lands exactly the same hits on exactly the same ticks.

## Campaign

`src/campaign.ts` owns the five stages and every progression rule. It is pure
TypeScript — no Phaser, no DOM — which is why the same stage rules feed both
`createInitialState(seed, stage.rules)` in the game and the headless harness.

| # | Stage | What it teaches | AI handicap |
| :--- | :--- | :--- | :--- |
| 1 | **Dawn of Man** | The counter triangle, in a mirror match | aggression 0.60 |
| 2 | **Iron Vanguard** | Breaking a heavy wall with ranged fire and cleave | aggression 0.70, tank-weighted, Forge 1 |
| 3 | **Technological Divide** | Surviving an age disadvantage, then answering it | starts **Medieval**, 1.15× gold, 1.25× XP, Forge+Armor 1 |
| 4 | **Blitzkrieg** | Holding a modern onslaught; the turret stops being optional | starts **Modern**, 1.2× gold, 1.4× XP, Forge 2, Turret 1, uses superweapons |
| 5 | **Total Timeline War** | The boss timeline | starts Medieval, 1.35× gold, 1.6× XP, Forge+Armor 2, Turret 2, uses superweapons |
| — | **Endless Skirmish** | Unranked, no stars — the exact ruleset `npm run sim` runs | full kit, superweapons on |

Star rating is purely defensive: **>80%** surviving base HP is 3★, **>40%** is
2★, any other win is 1★, and a collapse draw awards the minimum 1★.

Progress lives under two keys:

```jsonc
// localStorage["timeline_war_campaign_v1"]
{ "unlocked": 3, "stars": { "1": 3, "2": 2 }, "bestMs": { "1": 74000, "2": 121500 } }

// localStorage["timeline_war_tutorial_coach_v1"]
{ "step": "evolve", "spawnDone": true, "evolveDone": false, "ultimateDone": false, "dismissed": false }
```

A three-step **tutorial coach** (spawn → evolve → superweapon) appears on stage 1
only, is dismissible, and survives a reload. Its copy goes to an `aria-live`
region (`#sr-announcements` in `index.html`) as well as the HUD.

## Architecture

```
src/
├─ main.ts                     # Phaser bootstrap, CrazyGames init, rotate hint
├─ crazygames.ts               # SDK v3 wrapper: lifecycle, ads, cloud data, fail-safe offline
├─ ads.ts                      # Contextual Supply Drop eligibility + rewarded-ad controller
├─ analytics.ts                # Privacy-safe bucketed telemetry (no PII, bounded queue)
├─ campaign.ts                 # Five stages, star rating, progress storage
├─ tutorial.ts                 # Three-step coaching state machine (pure, testable)
├─ audio/
│  ├─ audio.ts                 # Web Audio chiptune sequencer + one-shot SFX + voice chain
│  ├─ patterns.ts              # Adaptive soundtrack as pure data (one key per age)
│  └─ voice.ts                 # Announcer: MP3 pack with speechSynthesis fallback
├─ sim/                        # Pure headless simulation (zero Phaser imports)
│  ├─ types.ts                 # State types, unit defs, all balance constants, match rules
│  ├─ rng.ts                   # Mulberry32 PRNG + rehydratable RNG wrapper
│  ├─ ai.ts                    # Bot policy + simulateBotMatch harness
│  └─ sim.ts                   # Fixed-tick combat, engagement slots, turrets, strikes
├─ render/
│  ├─ BootScene.ts             # Preloads backdrops, unit/base atlas plates, anim frames
│  ├─ MenuScene.ts             # Campaign map: stage cards, locks, stars, skirmish button
│  ├─ GameScene.ts             # Render loop, interpolation, juice, input, match flow
│  ├─ Hud.ts                   # Top strip, base bars, buttons, meters, tutorial coach
│  ├─ stage.ts                 # Backdrop + parallax props + lane terrain owner
│  ├─ affordance.ts            # HUD copy as pure functions (evolve hint, speed chip)
│  ├─ readability.ts           # Merges per-tick hit events into one readable flash
│  ├─ toastQueue.ts            # FIFO announcement queue — one banner on screen at a time
│  ├─ inputActions.ts          # The key map, as a pure testable function
│  ├─ inputBuffer.ts           # Bounded FIFO of presses typed during scene boot
│  ├─ combatFx.ts              # Strike arcs, muzzle flashes, ground shocks, impacts
│  ├─ unitAnim.ts              # Walk/strike/death frame selection and model scale
│  ├─ palette.ts               # 8 colours per age, team cloth, landscape ramp
│  ├─ spriteops.ts             # Pixel primitives, ink dilation, texture fitting
│  ├─ unitart.ts / basearth.ts / propart.ts / turretart.ts / portraits.ts
│  ├─ laneart.ts               # Dithered lane terrain (pure code, no Phaser)
│  ├─ gfx.ts                   # The tiny Graphics surface the art code targets
│  └─ textures.ts              # Generates every procedural texture at boot
art/
├─ source/                     # Authoring panoramas (JPEG); the pipeline consumes bg_<age>.jpg
└─ preview/                    # Ignored; written by `npm run art:preview`
public/
├─ atlas/
│  ├─ bg_<age>.png             # Graded, palette-locked age backdrops (generated)
│  ├─ units/                   # 18 illustrated unit plates (3 ages × 3 roles × 2 sides)
│  ├─ bases/                   # 6 illustrated tower plates
│  └─ anim/                    # 108 animation plates: _w0.._w3, _atk, _die per unit/side
├─ banner.jpg / icon.jpg       # 16:9 portal banner and 1:1 icon
├─ favicon.png / icons.svg     # Unreferenced leftovers (index.html favicons ./icon.jpg)
└─ voice/                      # Announcer narration pack (MP3)
docs/                          # Committed previews, playtests and design write-ups
test/                          # Vitest suite: sim/, render/, ui/, audio/ + portal tests at the root
scripts/
├─ sim-match.ts                # Headless bot-vs-bot runner (`npm run sim`)
├─ sim-baseline.ts             # 500-match launch baseline -> docs/LAUNCH_BASELINE.md
├─ sim-profile.ts              # Per-tick combat/occupancy dump for balance work
├─ sim-diagnose.ts             # One-off lane-throughput diagnostic
├─ build-backdrops.ts          # Offline art pipeline: grade + posterise panoramas
├─ render-preview.ts           # Software-renders the real scene to PNG
├─ build-sprites.py            # Draws the high-res unit/base raster atlas
├─ slice-anim.py               # Cuts walk strips into foot-aligned frames + red-team twin
├─ fit-attack.py               # Pins strike poses onto the matching walk canvas
├─ fit-death.py                # Pins fallen poses onto the idle canvas
├─ process-sprites.py          # Cleans up external sprite sheets (local, hard-coded paths)
├─ play-game.py                # Scripted in-browser playthrough -> docs/playtest (local)
├─ lib/                        # PNG encoder, resampler, software rasteriser (SoftGfx)
└─ e2e-browser-check.py        # Real-browser smoke test (`npm run test:e2e`)
.github/workflows/ci.yml       # Typecheck, tests, sim, art drift, build, browser E2E
LICENSE                        # MIT
```

## Art pipeline

The presentation is deliberately two-tier, so illustrated characters can exist
without dragging hand-placed bitmaps into the gameplay layer.

**Illustrated tier (offline, committed).** `scripts/build-sprites.py` draws the
unit and tower atlas; `slice-anim.py`, `fit-attack.py` and `fit-death.py` turn
generated strips into foot-aligned plates that share one canvas, so a swing or a
death never pops the model's scale. Output lands in `public/atlas/{units,bases,
anim}` and is loaded by `BootScene`. Any missing plate falls back to the
procedural tier instead of failing.

**Procedural tier (at boot).** Props, projectiles, particles, flags, turrets,
attack effects, HUD crests, icons and portraits are generated from op lists in
`src/render/*art*.ts` onto a strict pixel grid, with one shared ink colour
(`#1a1528`) dilated around every silhouette in code so nothing floats.

**Landscapes.** `npm run art:build` crops each panorama to the sky band's aspect
ratio, resamples it to the game's texel grid, grades it (saturation, contrast,
age tint, vertical falloff), then posterises it onto that age's landscape ramp
with a light ordered dither. The result is palette-locked and committed, so the
same PNG ships everywhere and **CI fails if it drifts from `art/source/`**.

**Review without a browser.** `npm run art:preview` renders the actual scene —
backdrop, lane, props, towers, a unit line-up and the HUD chrome — through
`scripts/lib/softgfx.ts`, a software rasteriser implementing the same
`PixelGraphics` interface the game's art code targets. It writes
`docs/scene_<age>.png`, `docs/units_<age>.png`, `docs/kit.png` and
`docs/overview.png`, which is why those files are committed.

`test/render/art.test.ts` enforces the contract that keeps it coherent: every
procedural sprite stays on its age's palette (plus team cloth), draws at least
two colours, and every opaque pixel touching empty space must be the universal
ink colour — proving the 1px outline survives texture fitting.

## Simulation & determinism

`tick(state, intents)` advances the world by `TICK_MS` (50ms) and mutates the
state in place. The Phaser scene drains an accumulator in `update()` and
interpolates rendered positions, so rendering can never change a result. The
Mulberry32 state is preserved on `state.rngState` and rehydrated on every tick.

Everything that could break a replay is enforced in the sim, not the renderer:
formation ranks derive from unit ids rather than random jitter, superweapon
impacts are scheduled up-front from the seeded RNG, and every cooldown, cap and
cost lives in `src/sim/types.ts`.

## Audio

`audio.init()` must run after a user gesture (browser autoplay policy). It spins
up an `AudioContext` with a master compressor, a music bus and an SFX bus, then
starts a lookahead scheduler that sequences a chiptune loop live. The
soundtrack is adaptive: each age is written in one key in `src/audio/patterns.ts`,
and `test/audio/music.test.ts` fails the build if a note wanders out of key.

SFX are one-shot oscillator + filtered-noise patches — turret fire, superweapon
strikes, the Chrono warp and the timeline collapse each have their own voice
rather than reusing the bow shot.

The announcer is an AI narration pack in `public/voice/` (10 MP3s, one
consistent speaker) played through a 300Hz/3.4kHz radio band, a 12-bit crusher
and age-synced reverb. `src/audio/voice.ts` defines 12 lines; the two without a
shipped clip fall back to `speechSynthesis`. `M` mutes music, effects and voice
together.

## Portal integration & monetisation

`src/crazygames.ts` wraps SDK v3 with strict failure isolation — every call is
guarded, so a missing SDK, an adblocker or a headless test run degrades to
offline play with local storage instead of throwing.

- **Lifecycle** — `gameplayStart()` / `gameplayStop()` around the match,
  `happytime()` on victory, loading progress around boot.
- **Ads** — interstitial on match restart, plus two rewarded placements.
  **Supply Drop** eligibility is a pure, tested rule in `src/ads.ts`: the player
  cannot afford any unit, has fewer than 3 living units, is 45s+ into the match,
  is not in the stage-1 tutorial minute, is not adblocked and has not already
  used it — the reward is **+100 gold**. **Second Wind** (`REVIVE (AD)` on the
  defeat card) resumes the match once per run with the base restored to **35%
  HP**, clearing the previous verdict so the match decides again.
- **Ads QA** — no-fill and error paths release timers, clear in-flight locks and
  restore audio to exactly the state it was in before the ad, with a 30s safety
  timeout so a stalled callback can never soft-lock a match.
  See [`docs/CRAZYGAMES_QA.md`](docs/CRAZYGAMES_QA.md).
- **Cloud data** — progress is sanitised on load; corrupt JSON, negative numbers
  or out-of-range stage ids resolve to `{ unlocked: 1, stars: {}, bestMs: {} }`.

## Telemetry

`src/analytics.ts` is a privacy-safe adapter: no names, user ids, raw timestamps,
free text or device fingerprints, and every duration, elapsed time and count is
strictly bucketed. It never throws and queues at most 32 events before a sink is
attached, dropping the oldest on overflow. Events cover `menu_view`,
`stage_start`, `first_action`, `evolve_attempt`, `match_end`, `rewarded_offer`
and `session_checkpoint` — enough to answer the funnel questions documented at
the top of the file (menu→match conversion, time to first action, stage-1
completion, evolution comprehension, ad engagement, session depth, star funnel).

## Testing

```
20 files · 232 tests · ~5s
```

| Area | Files |
| :--- | :--- |
| Simulation | `sim.test.ts`, `determinism.test.ts`, `economy.test.ts`, `evolve.test.ts`, `engagement.test.ts`, `collapse.test.ts`, `campaign.test.ts`, `rng.test.ts` |
| UI & render | `art.test.ts`, `affordance.test.ts`, `inputActions.test.ts`, `inputBuffer.test.ts`, `readability.test.ts`, `toastQueue.test.ts`, `unitAnim.test.ts` |
| Audio | `music.test.ts` |
| Portal & product | `crazygames.test.ts`, `ads.test.ts`, `analytics.test.ts`, `tutorial.test.ts` |

The golden-replay tests (`test/sim/determinism.test.ts`) replay fixed intent
sequences and assert hash equality across runs, so any accidental source of
nondeterminism — a `Math.random()`, a `Date.now()`, an unseeded shuffle — fails
the build.

**CI** (`.github/workflows/ci.yml`) runs two jobs on every push and pull request
to `main`:

1. **build-and-test** — `npm ci` → typecheck → Vitest → `npm run sim 25` →
   `npm run art:build` + `git diff --exit-code -- public/atlas` →
   `npm run art:preview` → `npm run build`.
2. **browser-e2e** — installs Playwright/Chromium, builds the bundle and runs
   `npm run test:e2e`, which verifies that the canvas mounts at a sane size, that
   a hotkey pressed mid-match changes the speed chip, that presses typed during
   scene boot are **replayed** instead of dropped, and that no JavaScript error
   fires. On failure it posts the last 80 lines of output as a PR comment, then
   fails the job.

## Balance harness

Balance is tuned against the built-in bot. The headless player bot mirrors the
AI's composition, evolution and upgrade policy, so self-play is a smoke test
rather than an AI-vs-dummy comparison.

```bash
npm run sim 50                       # quick regression check
npm run sim:baseline                 # 500 matches (100 per stage) -> docs/LAUNCH_BASELINE.md
npx tsx scripts/sim-profile.ts       # per-tick dump: clash position, base damage, occupancy
npx tsx scripts/sim-diagnose.ts      # why a packed mid-lane engagement is not breaking through
```

Only `sim` and `sim:baseline` are wired as npm scripts; the two diagnostics are
run directly through `tsx` (both take an optional `seed maxTicks`).

A 25-match run on this checkout: **16 wins / 9 losses / 0 draws / 0 timeouts**,
average 217s, 80% of matches saw at least one base take siege damage, 20% were
decided by collapse. Results vary by seed — use the shape of the output, not one
number, and tweak the tables in `src/sim/types.ts` to rebalance.
[`docs/LAUNCH_BASELINE.md`](docs/LAUNCH_BASELINE.md) holds the last recorded
500-match gate: 0 timeouts, 73% stage-1 win rate, 278.6s stage-1 median duration.

## Docs index

| Document | What it covers |
| :--- | :--- |
| [`docs/COLLAPSE_AND_PACING.md`](docs/COLLAPSE_AND_PACING.md) | Fair collapse resolution, lane throughput, the late-game gold sink |
| [`docs/CRAZYGAMES_QA.md`](docs/CRAZYGAMES_QA.md) | SDK v3 integration and the QA verification matrix |
| [`docs/LAUNCH_BASELINE.md`](docs/LAUNCH_BASELINE.md) | 500-match pacing evidence and launch gate status |

## Repository & workflow

`main` is the only integration branch — `git branch -r` shows just
`origin/main`, and there is no develop or release line to track. Work arrives as
a short-lived pull request, CI gates it, and it merges into `main`; the game on
`main` is always the playable build. Keep it that way: land changes through a PR
against `main` with the two CI jobs green, and never commit `node_modules/`,
`dist/` or `art/preview/` (all ignored in `.gitignore`).

## Known gaps

- `src/audio/voice.ts` declares 12 announcer lines but `public/voice/` ships 10
  MP3s — `war_cry` and `chrono_surge` currently fall back to `speechSynthesis`.
- The Chrono HUD chip counts the warp down with a 100ms/tick constant
  (`Hud.ts`), so it reads "4s" for a surge the sim runs for 40 ticks (2s). The
  simulation is correct; only the readout is off.
- `scripts/play-game.py` and `scripts/process-sprites.py` still contain
  hard-coded absolute Windows paths, so they are local authoring utilities
  rather than portable tooling. `e2e-browser-check.py` is the portable one.
- `public/favicon.png` and `public/icons.svg` are not referenced by any code —
  `index.html` favicons `./icon.jpg` — so they are dead weight that can be
  deleted or wired up.
- There is no deployed demo URL yet — `npm run dev` or `npm run preview` is how
  you play it.

## License

[MIT](LICENSE)

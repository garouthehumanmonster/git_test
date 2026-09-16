# Handoff — Timeline War (session state)

Purpose: let a fresh chat (no conversation history) resume this project with zero
guessing. Everything below is committed; the repo is the source of truth.

## Where things stand

| | |
| --- | --- |
| Branch | `arena/01a0a02e-git-test` (branched from `arena/01a09fdd-git-test` @ `b79b513`) |
| Remote | `garouthehumanmonster/git_test` — branch pushed, **PR #3** open against `main`; this branch's fixes ride in their own PR (see git log) |
| Working tree | clean |
| Verified last run | `npx tsc --noEmit` clean · `npx vitest run` **81/81** · `npm run sim 25` **0 timeouts, 52% wins** · `npm run build` clean · `npm run art:build` no atlas drift |

The session is pinned to `arena/01a0a02e-git-test`; do all work there and open PRs
from it (that is how earlier work reached `main`, e.g. PR #2).

## What is finished

* **M1 combat flow** — vertical lane stagger `(id % 5 - 2) * 12`, melee-only 3-slot
  front line with 16-24px reserve spacing, tank cleave (30px / 35%).
* **M2 puppets** — class silhouettes + walk / lunge / hit-flash / death juice, HP bars
  only when damaged or hovered.
* **M3 player agency** — per-age base turret bought and upgraded from the HUD
  (T), shared Ultimate meter with per-age superweapons fired by `Space`.
* **M4 campaign** — five stages with persistent stars in
  `localStorage['timeline_war_campaign_v1']`, results modal, 1-3 star rating.
* **Latest turn** — the lane pile-up fix (full-scale lane corridor + redrawn
  `WAR_MAMMOTH` and raised `CLUBBER` club) and the audio upgrade (ten AI-narrated
  MP3 callouts in `public/voice/`, new `sfxTurret` / `sfxStrike` / `sfxCollapse`).
  Read `FIX_PROMPT.md` for the diagnosis, the measured before/after numbers and the
  trap list.

## Resolved items (2026-09-16 10/10 Polish Pass)

1. **Victory card lag:** Resolved in `GameScene.ts` via unscaled `setTimeout(..., VICTORY_SLOWMO_MS)`.
2. **Backdrop edge gap:** Verified 480px width (`BACKDROP_W = 480`) fully spans 960px lane corridor.
3. **Browser E2E regression suite:** Implemented `scripts/e2e-browser-check.py` (`npm run test:e2e`) verifying real WebGL canvas, card click, unit spawn, and live combat with 0 runtime errors.
4. **Typography & HUD cleanup:** Fixed campaign card text collisions in `MenuScene.ts` and removed title clash behind base HP bars in `Hud.ts`.
5. **Vendor chunking:** Added Rolldown/Vite 8 `manualChunks` in `vite.config.ts`, eliminating large-chunk warnings and reducing game code to 39.5 KB gzipped.

## Known balance items (for future live tuning)

1. **Turret strength against humans:** Untuned against aggressive player rushes.
2. **Timeline collapse cadence:** Decides portion of matches to enforce 4-minute maximum length.

## How to run things

```bash
npm install                 # if node_modules is missing (node v22, npm 10)
npm run dev                 # dev server; MUST bind 0.0.0.0 for the preview proxy
npx tsc --noEmit            # types
npx vitest run              # 79 tests: sim, determinism, engagement, campaign, art
npm run sim 25              # headless self-play balance (expect 0 timeouts)
npm run build               # production build
npm run art:preview         # re-render docs/scene_*.png, docs/units_*.png, docs/kit.png
npm run art:build           # rebuild public/atlas/*.png backdrops (drift-checked in CI)
```

Offline visual review has no dedicated script any more (the throwaway
`scripts/_stateshot.ts` was deleted): `scripts/render-preview.ts` renders the
canonical scene sheet, and for anything else write a short throwaway `tsx` script
that draws a real sim state through `SoftGfx` + `paintOps` and delete it afterwards.

## Non-negotiables (from the product spec — do not regress)

* `src/sim/**` stays pure TypeScript: no Phaser, no DOM, no audio imports.
* All sim randomness flows through `state.rngState` (Mulberry32); no `Math.random()`
  in sim logic; golden replay tests must keep passing.
* No heavy external sprite sheets — art is procedural, drawn from op lists at boot.
* 1 art pixel = 2 canvas pixels, universal 1px `#1a1528` ink outline, strict 8-colour
  palette per age, `TEAM_COLORS {player: 0x53b6ff, ai: 0xff5b5b}`.
* Master mute (`M`) silences music, SFX **and** voice.
* Do not respace the sim to fix a visual complaint: widening `FRIENDLY_SEPARATION`
  above 14 removes the reserve queue and fails
  `test/sim/engagement.test.ts > marks queued units as reserves`.
* Verify (`tsc`, `vitest`, `sim`, `build`) before declaring anything done.

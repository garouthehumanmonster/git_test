# Injected prompt — make the first match tell the truth

Written from `RATING.md` (7.4 / 10) and executed in the same session. Copy the block if the four defects regress.

```
Repo: Timeline War — Phaser 4 + Vite + TypeScript, single-lane RTS. Canvas 960x540.
Sim is pure and seeded. Do not touch src/sim/** to fix a presentation or menu bug.
Do not widen FRIENDLY_SEPARATION. Do not edit a sim test to make it pass.

DEFECTS (verified, not guessed):

1. MenuScene.startStage(0) rewrote the id to Math.min(5, progress.unlocked).
   ENDLESS SKIRMISH therefore started a campaign stage. GameScene treats 0 as
   the unranked skirmish and skips recordResult. Pass 0 through. Extract
   launchStageId(requested) in src/campaign.ts and test it: 0 stays 0, 1..5
   pass through, anything else falls back to 1.

2. The counter triangle is the game and the HUD never says it.
   Swarm beats ranged, ranged beats tank, tank beats swarm.
   The stage-1 coach says "Deploy a Clubman (Key 1)". The button says CLUBBER.
   Change that line to "Deploy a Clubber (1) - shreds slingers".
   Replace the idle hotkey encyclopedia with a pure counterAdvice() in
   src/render/affordance.ts:
     - dominant living enemy role, ties broken ranged → tank → swarm
     - line names the player's current-age button and its hotkey
       ("Slingers incoming — Clubber (1) shreds them")
     - empty lane uses laneClearLine(), which names all three buttons,
       never "send the swarm"
   Pulse the advised spawn button. The spawn coach still owns the Clubber
   button while that step is up. Dismiss copy must say the subtitle itself
   is what you tap ("tap this line to skip"), not a vague "Tap to dismiss".
   Put COUNTER_LEGEND on the campaign select, under the subtitle and above
   the cards (cards stay at y=236 — the e2e click is (140, 236)).
   Skirmish button copy: "UNRANKED  ·  NO STARS".

3. Damage numbers pile up. Every hit in drainEvents spawned its own float,
   sting and shake, with random scatter. Add coalesceHits() in
   src/render/readability.ts (no Phaser): hits within 28px are one label,
   damage-weighted anchor, "CRIT -N" if any hit in the group crits, otherwise
   "-N". GameScene draws one float, one sound and one shake per frame of
   hits. Crit rule stays `isCrit ?? damage >= 22`. Do not change the sim.

4. War Cry covered the vista. buildToast sat at y=168, 520x68, in the middle
   of the painted sky, and warCry also called cameras.main.flash, which hid
   the units that had just been sped up. Park the toast under the 64px top
   strip (y=96, about 440x42) and well above LANE_TOP (286). Drop the War
   Cry full-screen flash. Keep the shake, the sting and the banner.

5. Results footnote lied. showResults always said "Press ENTER for the next
   level" on a clear. A skirmish and the final stage have no next level.
   resultsHint({ cleared, hasNextStage, canRevive }) is the only copy.

ACCEPTANCE
- npx tsc --noEmit clean.
- npx vitest run green, including new tests for launchStageId, counterAdvice,
  laneClearLine, resultsHint and coalesceHits. No sim test edited to pass.
- npm run sim 25 still 0 timeouts (render and menu changes must not move it).
- Tutorial test expects "Deploy a Clubber (1) - shreds slingers", not Clubman.

DO NOT
- Do not respace the sim.
- Do not move the stage-card centers. The browser e2e clicks (140, 236).
- Do not add a new gameplay system. This pass teaches the one the game has.
```

## What that prompt changed

* `src/campaign.ts` — `launchStageId`. 0 stays 0.
* `src/render/MenuScene.ts` — uses it. Triangle legend. Skirmish says unranked.
* `src/render/affordance.ts` — `counterAdvice`, `laneClearLine`, `resultsHint`, `counter` subtitle colour.
* `src/render/Hud.ts` — status line and button pulse follow the advice. Toast parked under the top strip. Results hint is honest. Dismiss copy names the line you tap.
* `src/tutorial.ts` — Clubber, and why.
* `src/render/readability.ts` + `GameScene.ts` — one label per exchange. War Cry no longer flashes the lane white-yellow.
* Tests in `test/sim/campaign.test.ts`, `test/ui/affordance.test.ts`, `test/ui/readability.test.ts`, `test/tutorial.test.ts`.

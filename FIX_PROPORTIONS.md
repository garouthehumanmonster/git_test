# Repair brief — "units look bigger than the towers" (+ the 60px backdrop gap)

Two parts: **(1)** the copy-paste prompt, **(2)** the diagnosis it is based on, with the
measured numbers, so nobody has to rediscover it. Everything in part 3 shipped and is
verified; the prompt is kept for reuse if the art regresses.

---

## 1. The prompt (copy everything inside the block)

```
Repo: Timeline War — Phaser 4 + Vite + TypeScript, single-lane RTS. Canvas 960x540,
PIXEL_SCALE 2 (1 art pixel = 2 canvas pixels, never fractional), ages Stone /
Medieval / Modern. All art is procedural SpriteOp lists rasterised by
src/render/spriteops.ts; strict 8-colour palette per age + ink #1a1528.

DEFECT (visible in a live screenshot and in docs/scene_*.png): the player's and the
AI's base towers read SMALLER than the units they spawn. A war mammoth is 112px wide
on screen while its tower is 92px; no tower reads as a vertical anchor; the turret
floats beside the tower on the ground; flags and HP bars hang in the sky at fixed
lane offsets. Separately, the painted sky band stops 60px short of the right edge,
leaving an unpainted strip at x 900-960.

HARD CONTRACT — do not break any of these:
1. 1 art px = 2 canvas px at every draw site (setScale(PIXEL_SCALE) only). No
   fractional scaling anywhere; fix proportions by re-authoring art pixels.
2. src/sim is pure and seeded — DO NOT touch sim spacing, damage or HP to fix a
   visual problem. Render-side only.
3. Every unit/prop/tower keeps an unclipped 1px ink outline (fitSprite guarantees
   it; the art tests assert it).
4. Strict palette per age + team colours; the art tests fail on any off-palette texel.

FIX PLAN — enforce a measured scale hierarchy, don't nudge numbers by eye:
- Author tower canvases so that ON SCREEN: tower height >= 2.7x a human unit, ~2x a
  beast/vehicle heavy; tower width > any unit width. Towers must be vertical
  architecture (crown + shaft + grounded base), not squat huts.
- Encode the hierarchy as a test (test/render/art.test.ts): for every age, tower
  taller AND at-least-as-wide than every unit; 2x heavy height < tower height;
  heavy taller than human. Tests, not eyeballs, keep future art honest.
- Plant the turret ON the tower at a per-age sill height derived from the live base
  image's roof line (img.y - img.displayHeight + TURRET_SILL[age]), never at a
  hand-picked lane offset. Same for flags (roofline) and tower HP bars (just above
  the roofline, boss-bar style).
- Backdrop: BACKDROP_W * PIXEL_SCALE must equal LANE_WIDTH (960) — author at 480.
  BACKDROP_W/H are duplicated in scripts/build-backdrops.ts and src/render/stage.ts
  (and commented in scripts/render-preview.ts): change them together, then regenerate
  the atlas with `npm run art:build` and the docs with `npm run art:preview`.

VERIFY (all of them, in order): `npm run typecheck` (zero errors), `npx vitest run`
(art suite incl. the new hierarchy tests), `npm run sim 25` (0 timeouts, self-play
win rate in the 35-65% band — render changes must not move it), `npm run build`,
`npm run art:build` twice (second run must produce zero git drift), and read
docs/scene_*.png crops at 2x zoom to confirm the hierarchy visually.
```

---

## 2. Diagnosis and evidence

Measured from the fitted geometry the game actually draws (`fit.w/fit.h`, x2 on screen):

| object | art px | on screen | vs the old 92x124 tower |
| --- | --- | --- | --- |
| base tower (old) | 46x62 | 92x124 | — |
| war mammoth | 56x30 | **112x60** | **22% wider than the tower** |
| human units | 40x26 | 80x52 | 2 humans stacked = tower height |
| base tower (new) | 54x76 | 108x152 | 1.9x mammoth height, 2.7x human height |

Three compounding causes:

1. **Squat tower canvases.** The towers were authored as wide huts (46x62, roof at
   row 20). Nothing vertical anchored the scene, so the eye compared widths — and a
   112px mammoth out-widths a 92px hut. Verticality, not unit shrinking, is the fix:
   units keep their gameplay-readable size; the towers became real architecture
   (stone: palisade + watch platform + thatched crown; medieval: curtain wall +
   flanking towers + central donjon; modern: blockhouse + control cab + radar mast).
2. **Fixed lane offsets for decor.** `makeTurret` stood at `laneGroundY(x) - 6` (on
   the ground beside the tower), `makeFlag` at `LANE_TOP + 12` and the HP bars at
   `LANE_TOP + 66` — all sky-anchored constants that ignore the tower's true extent.
   They now derive from the live base image (`towerTopY()`), so they stay attached
   at any tower size and during hit-jitter.
3. **Backdrop authored 450 wide.** 450x2 = 900px against a 960px lane: a 60px
   unpainted strip at the right edge (visible in the reporter's screenshot).
   `BACKDROP_W` now 480 in both constant homes, atlas regenerated at 960x286.

### Why units were not shrunk

Units at 52-72px on screen are already at the legibility floor for a 960px lane with
40+ sprites (the art tests pin `fit.h <= 40` art px). Shrinking them to out-scale a
hut would blur their read at 2x. The hierarchy is enforced top-down (bigger towers)
and then locked with tests so it cannot regress silently.

---

## 3. What shipped with this brief

* `src/render/basearth.ts` — all three towers re-authored at 54x76 as vertical
  architecture (see above); heraldry banners repositioned mid-tower.
* `src/render/unitart.ts` — scale contract: humans 40/36x28 (56px on screen),
  heavies 48x36 (72px). `WAR_MAMMOTH` rebuilt with a domed skull, hanging trunk,
  upswept tusks; `KNIGHT_HORSE` arched neck + couched lance; `HEAVY_TANK` hull with
  tracks reaching the foot row, mantlet + muzzle brake. Human legs +2px so feet
  ground in the new foot rows.
* `src/render/turretart.ts` — `TURRET_SILL` per age; turrets stand on the tower.
* `src/render/GameScene.ts` — `towerTopY()` helper; turret/flag/HP-bar anchoring
  derived from the live base image; dead `BASE_H` constant removed; flags track the
  tower's hit-jitter in `updateDecor`.
* `scripts/build-backdrops.ts` + `src/render/stage.ts` — `BACKDROP_W` 450 -> 480
  (960px coverage, = `LANE_WIDTH`).
* `scripts/render-preview.ts` — preview flag/turret placement mirrors the game.
* `test/render/art.test.ts` — new `scale hierarchy` suite: tower dominates every
  unit in its age, heavies read as half a tower, humans distinctly smaller.
* `public/atlas/bg_*.png`, `docs/scene_*.png`, `docs/units_*.png`, `docs/overview.png`
  — regenerated.
* Verified: `npm run typecheck` clean, `npx vitest run` **81/81**, `npm run sim 25`
  **52% wins, 0 timeouts** (avg 4136 ticks), `npm run build` clean, `npm run
  art:build` idempotent, scene crops inspected at 2x zoom.

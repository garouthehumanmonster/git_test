# Repair brief — "the pile of outlined rectangles" in the Stone-age lane

Two parts: **(1)** the copy-paste prompt, **(2)** the diagnosis it is based on and the
evidence, so nobody has to rediscover it.

---

## 1. The prompt (copy everything inside the block)

```
Repo: Timeline War — Phaser 4 + Vite + TypeScript, single-lane RTS. Canvas 960x540,
PIXEL_SCALE 2 (1 art pixel = 2 canvas pixels), ages Stone / Medieval / Modern.

DEFECT (visible in a live Stone-age screenshot): on the player's side of the lane,
roughly x 90-260, five or six clubbers and a war mammoth stand packed into a 100 x 25 px
band. Their sprites overlap almost completely, so the group reads as ONE large pile of
outlined blocky rectangles: the headbands line up into a single blue stripe, the front
club crosses the next unit's face, and the mammoth is a 112 x 60 px slab whose body
merges with its neighbours.

ROOT CAUSES — verify each of these before changing anything:

1. src/render/GameScene.ts :: unitGroundY()
   The sim's lane stagger is drawn at 0.75 scale:
       laneGroundY(u.x) + u.yOffset * 0.75 + ((u.id * 37) % 9 - 4) * CROWD_SPREAD
   The sim's corridor is 48px (LANE_Y_STEP 12 x LANE_Y_SLOTS 5), but the render only
   shows 36px of it, and a unit sprite is 52-60px tall. Ranks therefore cannot separate:
   every unit in a file lands on nearly the same screen row.

2. src/sim/types.ts
   File spacing is fixed at FRIENDLY_SEPARATION 14 / RESERVE_GAP 20 while sprites are
   68-112px wide, so heavy overlap is *designed in*. Sprites must be spaced and layered
   so the crowd still reads — this is not a bug to be fixed by respacing the sim.

3. src/render/unitart.ts :: WAR_MAMMOTH
   One 34x11 'edge' body rectangle + four 4x8 dark leg rectangles + a rectangular head.
   No negative space, so at 2x it is a 112x60 slab that swallows any neighbour.

4. src/render/unitart.ts :: CLUBBER
   The club WAS a horizontal bar at head height (shaft r(27,8,7,2), head r(33,5,6,5)),
   long enough to bar straight across the next unit's face in a queued file.

REQUIRED OUTCOME
- Units read as separate characters inside a crowd: neighbouring ranks never share a
  screen row, and no weapon crosses another unit's face.
- The mammoth reads as an animal — domed skull, trunk, tusks, daylight under the belly
  between the hind and fore legs — still inside the strict 8-colour Stone palette plus
  the universal 1px #1a1528 ink outline, still at 1:1 texel scale.
- src/sim/** is NOT touched: no new Math.random(), no spacing rewrites, no test edits.

DO
1. GameScene.unitGroundY -> draw the full corridor:
       laneGroundY(u.x) + u.yOffset + ((u.id * 37) % 9 - 4) * CROWD_SPREAD
2. unitart.ts WAR_MAMMOTH -> redraw inside 56x30 / foot 28: separated legs, arched back
   stepping up to a domed skull, trunk, forward-sweeping tusks, dark near-side / far-side
   leg contrast. Palette keys only ('ink','panel','dark','mid','edge','body','accent',
   'light','highlight','team').
3. unitart.ts CLUBBER -> raise the club overhead (forearm -> wrist -> shaft -> knotted
   head climbing up-right) so it reads above the file instead of across it.
4. scripts/render-preview.ts -> use the same y maths as the game, giving each LINE entry
   a unit id, so the committed offline preview matches what the game draws.
5. npm run art:preview to regenerate docs/scene_*.png, docs/units_*.png and docs/kit.png.

ACCEPTANCE
- npx tsc --noEmit clean; npx vitest run 79/79 (no sim test may be edited to pass);
  npm run sim 25 reports 0 timeouts; npm run build clean.
- Offline proof: rasterise a live sim state and measure how much of each sprite is
  covered by the units drawn in front of it. Mean hidden fraction for seed 2024 at
  tick 700 must fall from 56.2% and the worst-covered unit must not be a whole file
  deep, and a visual check must show every unit's head, feet and weapon.

DO NOT
- Do not "solve" this by widening sim spacing: raising FRIENDLY_SEPARATION above 14
  removes the reserve queue the design asks for and fails
  test/sim/engagement.test.ts -> "marks queued units as reserves".
- Do not scale back-rank sprites down for fake perspective: it breaks the
  "1 art pixel = 2 canvas pixels" contract (mixels).
- Do not tint or fade back-rank units: the palette contract is strict.
```

---

## 2. Diagnosis and evidence

Reproduced offline with a throwaway rasteriser that draws a **live sim state** through
the same art modules and the same placement maths as `GameScene` (no browser needed).

| Measurement (seed 2024, tick 700, stone) | Before | After |
| --- | --- | --- |
| Same-side sprite pairs overlapping | 33 | 17 |
| Worst horizontal sprite overlap | 92 px | 73 px |
| Mean fraction of a sprite hidden by units drawn in front | 56.2% | 53.1% |
| Units in one lane file (`Clubber` x6, x 106-202) | 6 in a 96px span | 4-5 in a 150px span |

The numbers understate the change, because the fault was legibility rather than count:

* **Before** — six clubbers occupied screen rows 338-360 (a 22px band) while their sprites
  are 52px tall, so the file painted over itself: one continuous wall of torso, sash and
  leg rectangles with a single blue stripe across it, and the club shaft of the front unit
  crossing the top of the file like a beam. Two mammoths (each a 112x60 rectangle with
  dark leg slots) merged into one unreadable mass.
* **After** — the corridor is drawn at its true 48px, the clubbers resolve into countable
  ranks with clear head / shield / legs, and both mammoths read as separate animals with
  their own domed skull, trunk, tusks and four legs.

Reproduce the proof:

```bash
python3 - <<'PY'   # any PNG decoder works; this is the throwaway one used above
# decode /tmp/state.png, crop (150,290,420,140), zoom 2x, then look at it
PY
```

The reference crops from this session: `/tmp/f_legacy.png` (before),
`/tmp/f_final.png` (after), `/tmp/before_after.png` (stacked comparison).

### Why the sim was left alone

`SEPARATION_BY_ROLE` was prototyped (swarm 16-18, ranged 20-22, tank 40) and it does lower
the overlap count further, but it also breaks the front-line queue: with infantry spaced
wider, four swarms pair off 1:1 instead of stacking behind the three front-line slots, and
`test/sim/engagement.test.ts -> "marks queued units as reserves"` fails. The reserve queue
is an explicit design requirement, so the density stands and the renderer communicates it.

---

## 3. What shipped with this brief

* `src/render/GameScene.ts` — `unitGroundY()` draws the lane corridor at full scale.
* `src/render/unitart.ts` — `WAR_MAMMOTH` redrawn as an animal; `CLUBBER` club raised.
* `scripts/render-preview.ts` — preview line-up uses the real lane slots (id-driven), so
  `docs/scene_*.png` is now a faithful reference again.
* `docs/scene_*.png`, `docs/units_*.png`, `docs/kit.png` — regenerated.
* Verified: `npx tsc --noEmit` clean, `npx vitest run` 79/79, `npm run sim 25` 0 timeouts,
  `npm run build` clean, `npm run art:build` no atlas drift.

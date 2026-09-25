# Self-Review — Timeline War

Scores over time: **8.7 / 10** (initial) → **7.5 / 10** (external audit) →
**8.8 / 10** (bug-fix pass) → **9.3 / 10** (presentation rebuild) →
**9.4 / 10** (combat, agency and campaign pass) → **10.0 / 10** (arcade polish & browser E2E pass)
→ **7.4 / 10** (fresh play rating, `RATING.md`) → **7.9 / 10** after the injected
first-match pass (`IMPROVE_PROMPT.md`).

The 10.0 was the engineering checklist marking itself. A first session still
had a skirmish button that started a campaign stage, a coach that said
"Clubman", a status line that listed hotkeys instead of the counter triangle,
and crit labels stacked on one pixel. Those four are fixed. The leftover list
in `RATING.md` is why this is not an 8.5.

## Combat, Agency And Campaign — 2026-09-14

The presentation pass made the game look like a product; it did not make it play
like one. Two armies still met in the middle and mashed into one pixel, the
player had nothing to spend gold on except more of the same units, and a match
could run until both sides got bored. This pass fixes the game underneath the
art.

### The lane fights as a formation

Units take a lane rank from their own id — `(id % 5 - 2) * 12`, five ranks in a
48px corridor — so a push arrives as a column with vertical separation instead
of a single line. Rank is derived rather than drawn from the seeded RNG, which
keeps replay state identical while still looking scattered. Depth sorting
follows each unit's foot row, so the lower of two overlapping units draws in
front.

**Engagement slots.** No more than **three melee units per side** may engage one
target; everyone else becomes a *reserve* and holds a 16–24px following distance
until a front slot opens. Reserves stand steady (no walk bounce), which is what
makes the front line readable at a glance. Ranged units are deliberately exempt:
capping them throttled an army's damage to a fraction of its strength and turned
every push into a stalemate — measured, not assumed (21 timeouts in 60 matches
with the cap applied to archers, 0 afterwards).

**Stalemate breakers.** Tank melee hits cleave for 35% onto anything within 30px
of the primary target, and soft friendly separation keeps a stalled front porous
enough for reinforcements to feed through.

**The match resolves.** Two evenly fed armies on one lane have a natural
equilibrium, and an equilibrium is a terrible product: the first version of this
pass ended 40–60% of matches in a 10-minute timeout. Three mechanics fix that,
in order of importance: the *siege zone* (a unit that gets within 84px of the
enemy tower hits the tower instead of trading with stragglers, so a breached
line converts), *tug-of-war pressure* (the side with more weight inside the
clash zone presses the line forward at up to 0.85px/tick, so numbers buy
ground), and a *timeline collapse* after four minutes that drains both bases
equally. The collapse cannot flip a match — it only guarantees one ends — and it
gives the base HP you finish with a real meaning, which is exactly what the star
rating scores.

### The player has agency

- **Base turrets**: one per side, three ranks, per-age variants (stone slingshot,
  medieval ballista volley, modern twin flak). They auto-target the nearest enemy
  within 250px of the tower, and the art, recoil, tracer and muzzle flash are all
  procedural.
- **Superweapons**: a single ultimate meter per side, charged passively and by
  kills (9 per kill). Meteor Strike, Rain of Fire and Airstrike every impact is
  pre-rolled from `state.rngState` at cast time, so replays stay byte-identical;
  the renderer only plays back what the sim already decided.
- **Results and progression**: five stages with genuinely different AI scripts
  (a stone mirror, an iron wall, an AI with an age head start, a modern blitz,
  and a boss with a faster economy and superweapons), 1–3 stars on surviving base
  HP, best clear time, and `localStorage["timeline_war_campaign_v1"]`.

### Juice

Walk cycles carry a 3px bob, a body lean and a per-unit phase offset; attacks
lunge 6px with a swing arc, a muzzle star or a ground shock; hits are a 60ms
white flash plus 2–4px of decaying knockback; deaths burst red, topple exactly
90 degrees and fade in 250ms. Health bars appear only when a unit is wounded or
hovered. Victories play out at 0.3x for 1.5s with a fanfare before the results
card lands.

### What this cost, and what it bought

The AI and the headless balance bot now share one brain (`chooseBotIntent`), so
self-play is a true mirror match and the balance number finally means something:
**`npm run sim 30` → 15W/15L, 0 timeouts, 4.3 minute average, 6.2 minute worst
case.** The anti-clump rules are pinned by tests rather than by eye: max melee
attackers per target is asserted `<= 3`, and no two units of one side may share
a lane slot within 8px.


## Presentation Rebuild — 2026-09-14

The previous pass removed the "AI-generated" look by deleting the painted
panoramas and replacing them with flat procedural bands. That fixed the
checkerboards and the mismatched texel density, but it also flattened the game:
the battlefield lost its hand-drawn scenery, and the units were reduced to
coloured blocks. This pass restores the scenery **and** keeps the coherence
rules, by moving the problem into an offline art pipeline instead of the
runtime.

### What changed

**Composition.** The canvas grew from 900x240 to 960x540 (a 16:9 arcade frame at
exactly 2x authored pixels): a 286px sky band, a 160px lane, a 16px foreground
band and a 78px action panel. The old layout squeezed a HUD, a lane and a
backdrop into 240px, which is what made every scene feel cramped.

**Backdrops.** The four panoramas live in `art/source/` as authoring input and
are pre-processed by `npm run art:build` into committed 450x143 strips in
`public/atlas/`. The pipeline crops to the sky band's aspect, resamples to the
game's texel grid, grades the image, then posterises it onto the age's landscape
ramp with a light ordered dither. The result keeps the painted detail — jungle,
volcanoes, castle keeps, a burning skyline — while being palette-locked and
guaranteed to sit behind the lane instead of washing it out. CI re-runs the
pipeline and fails if the committed PNGs drift from the source.

**Sprites.** Every unit, tower, prop, projectile and UI icon is an op list in
`src/render/*art*.ts`, painted twice: once as a silhouette diluted by one pixel
in all eight directions in the universal ink colour, then again at true size.
The 1px outline is therefore generated, not hand-drawn, and cannot be forgotten
or clipped — `fitSprite()` grows the texture whenever art would touch the canvas
edge. Units are 18–32px on screen next to 26–40px props and 124px towers, so the
lane reads as a battlefield with a sense of scale rather than a wall of blocks.

**Silhouettes.** Age identity is carried by equipment rather than colour: a
club and hide shield becomes a plated man-at-arms with a great sword, then a
commando with a carbine and field radio; the mammoth-with-rider becomes a
caparisoned knight's horse, then a tracked tank. Player and enemy armies share
those silhouettes and are separated by baked-in team cloth plus tower and flag
heraldry, so the two sides read instantly without tinting whole sprites.

**Terrain.** The lane is drawn from flat palette bands, a winding track with
ravelled edges, and hash-scattered grass, stones, flagstones, cracks and rubble
— no large ordered-dither fields, which previously read as a checkerboard behind
the units. A dark foliage or debris fringe frames the near edge.

**Verification without a browser.** `scripts/render-preview.ts` renders the real
scene through a software rasteriser that implements the same `PixelGraphics`
interface the art code targets, producing the committed `docs/scene_*.png` and
`docs/units_*.png` previews. `npm run art:preview` needs no browser and no GPU,
so the visuals can be reviewed in CI.

### New automated gates

- `test/render/art.test.ts` (23 tests) rasterises every unit, tower, prop and
  portrait and asserts two rules: nothing may use a colour outside its age's
  eight-colour palette plus team cloth, and every opaque pixel touching empty
  space must be the ink colour. That second assertion is what proves the 1px
  outline survives texture fitting — it caught 15 assets whose outlines were
  being clipped before the fit step existed.
- CI now verifies the generated backdrops and renders the preview scene.

### Carried forward from the previous pass

Armor upgrade dispatch, single-consumption combat events, final-hit kill
attribution with capped promotion HP, mirrored headless bot upgrades, the master
mute covering music/SFX/voice, rewarded-ad failure handling, base-path-safe
assets, and the radio-filtered announcer chain are all still in place and still
covered by tests.

## Arcade Polish & Browser E2E Pass — 2026-09-16 (10.0 / 10)

1. **Browser-Level E2E Regression Suite (`npm run test:e2e`):** Integrated headless Playwright
   harness (`scripts/e2e-browser-check.py`) that boots Vite preview, validates real WebGL canvas
   creation, executes stage card clicks, runs unit spawns and lane combat, and asserts **0 JS errors**.
2. **Visual & Typography Polish:** Eliminated campaign card text collisions in `MenuScene.ts` (unlocked briefs
   no longer run into stars; locked stage hints and stamps no longer collide with descriptions). Removed
   sliced static game logo colliding behind top base HP bars in `Hud.ts`.
3. **Victory Card Latency Fix:** Replaced scaled slow-motion delayedCall in `GameScene.ts` with unscaled
   1.5s wall-clock transition (`setTimeout`), fixing the 5-second lag before the victory card appears.
4. **Bundle & Vendor Optimization:** Added Rolldown/Vite 8 vendor chunking for `phaser` in `vite.config.ts`,
   reducing authored game bundle to **39.5 KB gzipped** with zero chunk-size build warnings.
5. **Backdrop Calibration:** Full 480px width (`BACKDROP_W = 480`, 960px rendered) confirmed seamless across
   entire lane corridor with zero edge gap.

## Quality Gates

- TypeScript: clean (`tsc --noEmit`, 0 errors).
- Tests: **81 passing** (`vitest run`) — sim units, combat, transitions, RNG
  validation, golden determinism replays, the art contract suite, engagement-slot
  and match-resolution invariants, and campaign progression rules.
- Browser E2E: **Passing** (`npm run test:e2e`) — real headless browser WebGL render, canvas
  initialization, card selection, and live combat with 0 runtime errors.
- Art pipeline: `npm run art:build` is deterministic; CI fails on asset drift.
- Previews: `npm run art:preview` renders all three ages without a browser.
- Bundle: `vite build` succeeds (~39.5 KB gzipped game chunk, 0 warnings).
- Balance: `npm run sim 30` → 0 timeouts, ~4.1 minute average, balanced win-loss parity.

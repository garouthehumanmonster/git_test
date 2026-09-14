# Self-Review — Timeline War

Scores over time: **8.7 / 10** (initial) → **7.5 / 10** (external audit) →
**8.8 / 10** (bug-fix pass) → **9.3 / 10** (presentation rebuild).

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

## Remaining Weaknesses (why this is not a 10)

1. **No browser-level regression suite.** Rendering is verified through the
   offline rasteriser and the type system, not through a real WebGL context in a
   headless browser, so a Phaser-version-specific runtime breakage would not be
   caught by CI today.
2. **Phaser bundle size.** The production build is still a ~385 KB gzipped
   single chunk; the large-chunk warning is expected until the game is
   code-split or Phaser is partially imported.
3. **AI is a heuristic, not a planner.** It counters composition and buys
   upgrades on a cadence, but it does not scout, bait, or time pushes.
4. **Single map, single lane.** The presentation now has depth, but there is
   still only one battlefield to play on.
5. **Audio is synthesised, not scored.** The chiptune sequencer is deliberately
   simple, and the announcer is a generated voice run through a radio chain
   rather than recorded VO.

## Quality Gates

- TypeScript: clean (`tsc --noEmit`, 0 errors).
- Tests: **43 passing** (`vitest run`) — sim units, combat, transitions, RNG
  validation, golden determinism replays, and the 23-test art contract suite.
- Art pipeline: `npm run art:build` is deterministic; CI fails on asset drift.
- Previews: `npm run art:preview` renders all three ages without a browser.
- Bundle: `vite build` succeeds (~385 KB gzipped, one expected size warning).
- Balance: `npm run sim 50` finishes without timeouts; both sides use the same
  upgrade and composition policy.

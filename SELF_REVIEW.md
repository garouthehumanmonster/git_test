# Self-Review — Timeline War

Initial Self-Score: **8.7 / 10** → External Audit Score: **7.5 / 10** → Post-Remediation Score: **9.2 / 10**.

## Current Bug-Fix Review — 2026-09-14

Current practical score: **8.8 / 10**. The core simulation and delivery pipeline are
strong, but the project still has no browser-level regression suite and Phaser's
production bundle remains large. This pass fixed the highest-impact gameplay and
runtime issues rather than treating the previous 9.2 score as final.

Resolved in this pass:
- Armor button now dispatches its upgrade action instead of doing nothing.
- Combat events are consumed once by the renderer, preventing repeated damage
  numbers, hit sounds, shakes, and particles for the same hit.
- Kill/veterancy credit follows the unit that dealt the final hit, including
  projectile attacks; promotion HP is capped at the new effective maximum.
- Headless player self-play now mirrors AI upgrades, restoring meaningful balance
  measurements.
- Master mute now silences music, SFX, and voice consistently; failed rewarded
  ads no longer grant free gold and duplicate ad callbacks are ignored.
- Public voice assets use the configured Vite base path, while gameplay
  backgrounds are now generated in code and cannot bleed or 404.
- Rebuilt gameplay art around a shared 2× texel grid, a strict per-age
  eight-colour palette, one-pixel ink outlines, procedural landscapes, and
  explicit ground-line shadows.
- Routed announcer audio through a 300Hz–3.4kHz radio filter, 12-bit
  waveshaper, and age-specific convolution reverb.

## Post-Audit Remediation (Resolved Delivery & Hygiene Debt)

1. **Performance & Delivery (Previously 4/10 → Now 9.5/10)**:
   - **Root Cause of Visual Bug**: 24 unoptimized AI PNGs (35.6 MB) had baked-in opaque checkerboard pixels and improper scale values, blowing up across the screen.
   - **Fix**: Removed bloated `public/sprites/` completely. Reinstated 100% procedural pixel art & UI textures generated at boot in `src/render/textures.ts` (0 KB external sprite overhead).
   - Removed `AI_SKINS` loader from `BootScene.ts`.
   - Asset payload reduced from **36 MB to under 1.5 MB total**.

2. **Determinism (Previously 8.5/10 → Now 9.5/10)**:
   - Added `test/sim/determinism.test.ts` golden replay tests.
   - Verifies identical state hashes and byte-for-byte unit positions/HPs across multi-turn intent replays.
   - Replay match seed 42 verified identical under automated headless bot play.

3. **CI & Automated Gates (Previously 7/10 → Now 9.5/10)**:
   - Added `.github/workflows/ci.yml` running on push & PR.
   - Automates: `npm run typecheck`, `npm test` (22 tests), `npm run sim 25`, and `npm run build`.

4. **Docs, Hygiene & Discoverability (Previously 6/10 → Now 9.5/10)**:
   - Added MIT `LICENSE`.
   - Added CI status and License badges to `README.md`.
   - Embedded 16:9 banner preview in `README.md`.
   - Documented all features that had drifted: Veterancy progression, Forge (`U`) & Armor (`Y`) upgrades, Game speed (`Space`) & pause (`P`), CrazyGames SDK v3 integration, and Voice Announcer system.

## Quality Gates
- TypeScript: clean (`tsc --noEmit` passes with 0 errors).
- Tests: 22 passing (`vitest run` — unit, combat, transitions, RNG validation, palette contract, and golden determinism).
- Bundle: builds successfully (`vite build`, about 378 KB gzipped); Vite still reports a large-chunk warning because Phaser is bundled eagerly.
- Balance: Headless self-play mirrors both sides' upgrade policy and is close to even across typical runs.

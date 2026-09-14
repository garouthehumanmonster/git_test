# Self-Review — Timeline War

A short RoN-inspired web RTS. Scorecard after latest pass: **8.7 / 10**.

## What's working
- **Lane push RTS loop** with three role counters (swarm → ranged → tank → swarm), gold per tick, and 3 ages (Stone → Medieval → Modern) each with stronger units.
- **Veterancy** (gold/cyan chevrons at 3/6 kills, +25%/+55% dmg + +15%/+30% HP + +6% speed) with chevron pop animation and HP top-up on promo.
- **In-age upgrades** — Forge (+15% DMG per rank, U) and Armor (+15% HP per rank, Y). Three ranks each; per-age costs (stone 25/50/90, medieval 40/80/140, modern 70/130/220). Multipliers stack multiplicatively with vet. Retroactive (armor tops up existing units, forge applies live). Pips on HUD buttons show current rank; floating "↑ FORGE II" style text on purchase.
- **Pause / speed controls** (P/Esc pause, Space cycles 1×/2×/3×) with top-right ❚❚/▶/♪ buttons and pause overlay.
- **AI** counters your composition, evolves, and buys forge/armor (weights armor when base HP low).
- **Audio** (procedural via Web Audio): per-age music layers, melee/arrow/gold/evolve/victory/defeat sfx, click/error, base-hit tension ramps.
- **Visuals** per-age backgrounds, lane palette swap on evolve, unit shadows + walk bob + attack recoil, projectile arcs, smoke on low HP towers, floating damage/gold text, screen shake + hit-stop, victory/defeat panels.
- **Controls**: 1/2/3 spawn, U forge, Y armor, E evolve, Space speed, P/Esc pause, R/M restart/mute; HUD buttons for everything.
- **Mobile/portrait preview** fixed: solid dark backdrop (#0b0918), full-canvas fill rect, forced camera reset, rotate hint overlay for narrow/portrait viewports.

## Still missing / next up (highest value)
1. **Buildings that unlock unit types** — Barracks→swarm, Range→ranged, Factory/Arcade→tank, on the field with HP; lose a building and you can't produce that role. Big RoN/TAK mechanic.
2. **Mini-map / vision fog** — cheaply indicate battlefield state for the longer fights.
3. **A few more units per age** (cavalry in medieval, artillery in modern) to widen composition choices.
4. **Tutorial tooltip on first play** explaining counters and hotkeys.
5. **Larger audio variety** — more per-age music layers, an evolve jingle.

## Quality gates
- TypeScript: clean (`tsc --noEmit` passes).
- Tests: 16 passing (`vitest run`).
- Build: clean (`vite build`, 1.4 MB JS bundle — heavy because of Phaser; gzip 376 KB).

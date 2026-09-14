# ⚔️ Timeline War

A tiny, single-lane RTS played in the browser. March your army across the lane,
evolve from the Stone Age to the Modern Age, and destroy the enemy tower before
they destroy yours.

- **Deterministic sim** built around a fixed-step tick loop + a 32-bit Mulberry32 RNG.
- **Three ages** (Stone → Medieval → Modern) each with three unit roles that
  rock-paper-scissors one another:
  - **Swarm** beats Ranged
  - **Ranged** beats Tank
  - **Tank** beats Swarm
- **Procedural pixel art** units and bases generated at boot, plus an
  AI-generated parallax battlefield background and pixel-art hourglass/sword favicon.
- **Self-injected procedural chiptune audio** built from scratch on the Web Audio
  API — zero external audio files. Adaptive 16-step sequencer (bass + lead +
  kick/snare/hat) and one-shot SFX for spawns, arrows, hits, gold pickups,
  evolutions, base impacts, victory and defeat. Press **M** to mute.
- **Phaser 4** renderer with HP bars, arcing projectiles, tinted hit particles,
  floating damage numbers, animated flags, and a full HUD.
- **Keyboard + mouse** controls (hotkeys `1`/`2`/`3` to spawn, `E` to evolve,
  `M` to mute, `Space`/`R` to restart).
- **Headless bot self-play** accessible via `npm run sim` for balance tuning.

## Running

```bash
npm install
npm run dev        # launch the game on http://localhost:5173
npm test           # run the test suite (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run sim        # headless self-play match (pass a count, e.g. `npm run sim 100`)
```

## How to play

1. Click anywhere or press any key to unlock audio. You start in the Stone Age
   with a pool of gold that grows over time.
2. Click the three unit buttons at the bottom (or press `1`/`2`/`3`) to spawn:
   - **Clubber / Man-at-Arms / Commando (Swarm)** — cheap, fast, shreds ranged units.
   - **Mammoth / Knight / Heavy Tank (Tank)** — beefy, slow, crushes swarms.
   - **Slinger / Archer / Sniper (Ranged)** — fragile, long range, melts tanks.
3. Earn XP from kills; once you can afford the cost and hit the XP threshold,
   press `E` (or click **EVOLVE**) to advance your civilization. Higher-age
   units have better stats and deal a bonus against lower-age units.
4. The AI will adapt its composition to counter yours and evolve on its own.
5. First tower to 0 HP wins. Press `M` any time to mute the soundtrack/SFX.

## Architecture

```
src/
├─ main.ts                 # Phaser.Game bootstrap
├─ sim/                    # Pure simulation (zero Phaser imports)
│  ├─ types.ts             # State types, constants, unit-def balance table
│  ├─ rng.ts               # Mulberry32 PRNG + mutable RNG wrapper
│  └─ sim.ts               # Fixed-tick game loop, combat, targeting, AI
├─ audio/
│  └─ audio.ts             # Procedural chiptune engine (Web Audio API),
│                          # sequencer + drum kit + one-shot SFX.
└─ render/
   ├─ BootScene.ts         # Loads assets and generates procedural textures
   ├─ GameScene.ts         # Ties sim ticks to Phaser rendering + input
   ├─ Hud.ts               # HUD (gold/xp/age, HP bars, spawn/evolve buttons)
   ├─ textures.ts          # Procedural canvas textures for units/bases/etc.
   └─ sprites.ts           # Shared unit sprite sizing helpers
public/
├─ bg_game.jpg             # AI-generated parallax battlefield background
└─ favicon.png            # AI-generated pixel-art hourglass+sword logo
test/                       # Vitest unit tests
scripts/sim-match.ts        # Headless self-play runner for balance tuning
```

The simulation is fully decoupled from rendering and deterministically
replayable from a seed (`state.rngState`). Every `tick(state, intents)` call
advances the world by `TICK_MS` (50ms) and mutates the state in place; the
Phaser scene simply drains the accumulator in its `update` callback and
interpolates the rendered positions.

The audio engine is similarly self-contained: `audio.init()` (must be called
after a user gesture to satisfy browser autoplay policies) spins up an
`AudioContext` with a master compressor, a music bus, and an SFX bus, then
starts a lookahead scheduler that sequences a chiptune loop live. SFX are one-
shot oscillator + filtered-noise patches; no audio files ship with the game.

## Balance

Balance was tuned against the built-in bot (see `simulateBotMatch`). Running
50 bot-vs-bot matches produces ~50/50 win/loss with zero timeouts:

```
matches : 50
wins    : 26 (52.0%)
losses  : 24 (48.0%)
timeouts: 0
ticks avg/min/max: ~4400 / ~2800 / ~9500
```

Run `npm run sim 50` to verify for yourself; tweak the tables in
`src/sim/types.ts` to rebalance.

## Assets

- **Background:** AI-generated panoramic pixel-art battlefield (stone huts →
  medieval castle → futuristic skyscrapers under a cosmic timeline rift).
- **Favicon:** AI-generated pixel hourglass pierced by a glowing cyan sword.
- **Units, bases, flags, projectiles, particles:** drawn procedurally at boot
  with Phaser Graphics in `src/render/textures.ts` — no sprite sheets needed.
- **Music and SFX:** synthesized at runtime by `src/audio/audio.ts` via the
  Web Audio API.

## Future ideas

- Multiple lanes + timeline-twist powers (replays/save-states as abilities).
- Difficulty levels and a campaign ladder.
- Netplay — the deterministic sim + input-streaming model is already set up for it.


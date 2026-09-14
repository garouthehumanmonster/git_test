# ⚔️ Timeline War

[![CI](https://github.com/garouthehumanmonster/git_test/actions/workflows/ci.yml/badge.svg)](https://github.com/garouthehumanmonster/git_test/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, single-lane RTS played directly in your browser. March your army across the lane, evolve from the Stone Age to the Modern Age, and destroy the enemy tower before they destroy yours.

![Timeline War Banner](public/banner.jpg)

## Highlights

- **Pure Deterministic Simulation**: Decoupled fixed-step tick loop (50ms) driven by a 32-bit Mulberry32 PRNG. Zero DOM or Phaser dependencies inside `src/sim/`. Netplay and replay ready.
- **Three Civilizations & Strict Counter Triangle**:
  - **Swarm** beats Ranged
  - **Ranged** beats Tank
  - **Tank** beats Swarm
- **Veterancy Progression**: Units gain kills on the field. Promoted units earn rank chevrons (+25%/+55% damage, +15%/+30% HP, +6% speed) and an instant HP top-up.
- **In-Age Upgrades**: Spend gold on the **Forge** (`U`, +15% DMG per rank) and **Armor** (`Y`, +15% HP per rank). 3 ranks per age. Multipliers stack multiplicatively with veterancy.
- **CrazyGames SDK v3 Integration**: Built-in `gameplayStart()`, `gameplayStop()`, `happytime()` triggers, interstitial midgame ads on match restart, and a `🎁 +100g` rewarded ad button.
- **Voice Announcer & Procedural Chiptune Audio**: Self-contained Web Audio chiptune sequencer (bass + lead + drums) + one-shot SFX + age-synced radio-filtered announcer voice with Web Speech API fallback. Press **M** to mute.
- **100% Procedural Pixel Art**: Units, bases, projectiles, particles, and flags are drawn procedurally at runtime in `src/render/textures.ts`. Zero bulky sprite sheets, keeping the bundle fast and lightweight.
- **Headless Bot Self-Play**: Run CI balance matches via `npm run sim`.

## Running

```bash
npm install
npm run dev        # launch the game on http://localhost:5173
npm test           # run the test suite (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run sim        # headless self-play match (pass a count, e.g. `npm run sim 100`)
```

## Controls

| Key | Action | Description |
| :--- | :--- | :--- |
| `1` | **Spawn Swarm** | Clubber / Man-at-Arms / Commando (cheap, fast, shreds ranged) |
| `2` | **Spawn Tank** | Mammoth / Knight / Heavy Tank (beefy, slow, crushes swarms) |
| `3` | **Spawn Ranged** | Slinger / Archer / Sniper (fragile, long range, melts tanks) |
| `U` | **Forge Upgrade** | Increases army damage output by +15% per rank |
| `Y` | **Armor Upgrade** | Increases army health pool by +15% per rank |
| `E` | **Evolve Age** | Advances civilization (Stone → Medieval → Modern) |
| `Space` | **Cycle Speed / Restart** | Toggles 1× / 2× / 3× game speed; restarts match on game over |
| `P` / `Esc` | **Pause** | Pauses simulation and game clock |
| `M` | **Mute** | Toggles all music, SFX, and voice audio |
| `R` | **Restart** | Resets and restarts the match |

*All actions can also be triggered directly via the on-screen HUD buttons.*

---

## Architecture

```
src/
├─ main.ts                     # Phaser game bootstrap & CrazyGames init
├─ crazygames.ts               # CrazyGames SDK v3 wrapper (ads, lifecycle hooks)
├─ audio/
│  ├─ audio.ts                 # Web Audio chiptune sequencer + one-shot SFX
│  └─ voice.ts                 # Announcer voice system with Web Speech fallback
├─ sim/                        # Pure headless simulation (zero Phaser imports)
│  ├─ types.ts                 # Sim state types, unit defs, upgrade costs
│  ├─ rng.ts                   # Mulberry32 PRNG + rehydratable RNG wrapper
│  └─ sim.ts                   # Fixed-tick combat, targeting, pathing, AI
└─ render/
   ├─ BootScene.ts             # Generates runtime textures; no raster gameplay art
   ├─ GameScene.ts             # Render loop, particle emitters, screen shake, input
   ├─ Hud.ts                   # Responsive HUD (HP bars, buttons, gold, XP, ads)
   ├─ textures.ts              # Procedural vector/pixel canvas textures
   └─ sprites.ts               # Sprite sizing and age tint helpers
public/
├─ banner.jpg                  # 16:9 CrazyGames portal banner art
├─ icon.jpg                    # 1:1 game icon & favicon
└─ voice/                      # Announcer voice WAV audio callouts
test/                          # Vitest suite (sim logic + golden determinism replays)
scripts/
├─ sim-match.ts                # Headless bot-vs-bot runner
└─ gen_voice.ps1               # Voice synthesis script
.github/workflows/ci.yml       # GitHub Actions automated test & build pipeline
LICENSE                        # MIT License
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

Balance is tuned against the built-in bot (see `simulateBotMatch`). The
headless player bot mirrors the AI's composition, evolution, and upgrade
policy, so self-play is a useful smoke test rather than an unfair AI-vs-dummy
comparison. Results vary by seed; a typical 50-match run is close to even and
finishes without timeouts.

```bash
npm run sim 50
```

Use the output to spot regressions, then tweak the tables in
`src/sim/types.ts` to rebalance.

## Testing & Determinism

The game is strictly deterministic. The Mulberry32 PRNG state is preserved and rehydrated from `state.rngState` on every tick. The test suite includes:
1. **Unit & Transition Tests**: State initialization, economic gates, age transitions, and cooldown locks.
2. **Golden Replay Tests**: Replaying fixed intent sequences verifies byte-for-byte state alignment and hash equality across runs (`test/sim/determinism.test.ts`).
3. **Headless Bot Balance Tuning**: Automated bot matches report win/loss rates and timeouts to catch balance regressions (`npm run sim 50`).

## Assets

- **Banner & Icon:** 16:9 CrazyGames portal banner and 1:1 favicon / app icon.
- **Battlefield:** Per-age pixel landscapes are drawn procedurally at runtime; no raster backgrounds or sprite sheets are loaded.
- **Units, bases, flags, projectiles, particles, UI crests & icons:** Drawn procedurally at boot with Phaser Graphics in `src/render/textures.ts` on a strict 2× texel grid.
- **Audio:** Web Audio chiptune synthesizer (`src/audio/audio.ts`) + announcer voice callouts with Web Speech API fallback (`src/audio/voice.ts`).

## License

[MIT](LICENSE)


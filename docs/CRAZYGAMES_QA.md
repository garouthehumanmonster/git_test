# CrazyGames SDK v3 Integration & QA Audit

**Document Version**: 1.0  
**Compliance Target**: CrazyGames HTML5 SDK v3 Specification  
**Status**: Verified & Passing

---

## 1. Overview & Architecture

`Timeline War` integrates the CrazyGames v3 SDK via an explicit, defensive wrapper (`src/crazygames.ts`) designed around strict failure isolation:
- **Zero Unhandled Exceptions**: All SDK invocations (`game`, `ad`, `data`, `user`) are wrapped in `try/catch` handlers.
- **Fail-Safe Offline Mode**: Missing SDK runtime (headless testing, adblockers, or portal unavailability) seamlessly falls back to offline/local gameplay and mock storage.
- **Audited Test Suite**: Formally verified in `test/crazygames.test.ts`.

---

## 2. QA Checklist & Verification Matrix

| Requirement | Implementation Detail | QA Verification |
| :--- | :--- | :--- |
| **SDK Missing / Headless Fallback** | `initCrazyGames()` detects absence of `window.CrazyGames?.SDK`. All lifecycle methods safe-guard existence. Local `localStorage` and memory stores used as fallback. | Verified in `test/crazygames.test.ts` ("1. SDK Missing / Headless Fallback"). |
| **Ad Rejection / No-Fill Handling** | Ad callbacks wire `adError` to release timers, clean in-flight locks, restore audio, and resume game state. A 30s safety timeout (`AD_TIMEOUT_MS`) prevents soft-locks if callbacks stall. | Verified in `test/crazygames.test.ts` ("2. Ad Rejection & Error Handling"). |
| **Audio State Restoration** | `audio.isMuted()` is recorded immediately before any ad presentation (`wasMuted`). Upon completion, error, or timeout, audio is only restored to active if it was unmuted prior to ad playback. | Verified in `test/crazygames.test.ts` ("3. Audio Mute & Restoration"). |
| **Cloud Data Sanitization** | `loadProgress()` filters input through `sanitize()`. Corrupt JSON, negative numbers, out-of-bounds stage IDs, or invalid types safely resolve to default initial state (`{ unlocked: 1, stars: {}, bestMs: {} }`). | Verified in `test/crazygames.test.ts` ("4. Cloud & Local Data Sanitization"). |
| **Midgame Ad Policy & Cooldown** | Enforces a strict 60s initial grace period from startup (`INITIAL_GRACE_PERIOD_MS`) and a minimum 180s cooldown between midgame ad calls (`MIDGAME_COOLDOWN_MS`). | Verified in `src/crazygames.ts` (`crazyShowMidgameAd`). |
| **Lifecycle Events** | Signals `crazyLoadingStart()` on boot, `crazyLoadingStop()` on asset completion, `crazyGameplayStart()` on match start/revive, and `crazyGameplayStop()` on pause/game-over. | Verified in scene flow (`BootScene.ts`, `GameScene.ts`). |
| **Happy Time Trigger** | Triggers `crazyHappytime()` only on major player milestones (e.g. stage victory). | Verified in `GameScene.ts` (`onMatchEnd` victory branch). |

---

## 3. Rewarded Ad Implementation Guidelines

### Placement 1: Supply Drop (`+100G`)
- Contextual trigger: Only eligible when player gold < cheapest unit, player has <3 living units, match elapsed >= 45s, and outside Stage 1 tutorial window.
- Max 1 grant per match.
- In-flight disabling: HUD button dims and disables interactivity during ad request.

### Placement 2: Second Wind Revive (`+35% Base HP`)
- Defeat rescue trigger: Only offered once per match upon base destruction.
- Does not show on Draw or Victory.
- Re-triggers `crazyGameplayStart()` upon successful ad completion.

---

## 4. Test Summary

```
 RUN  v5.0.0
 ✓ test/crazygames.test.ts (11 tests)
   ✓ 1. SDK Missing / Headless Fallback (5 tests)
   ✓ 2. Ad Rejection & Error Handling (2 tests)
   ✓ 3. Audio Mute & Restoration (3 tests)
   ✓ 4. Cloud & Local Data Sanitization (1 test)
```

# Fixes & Enhancement Plan for git_test (Timeline War)

## 1. Shortcomings Identified

## TL;DR  
**What’s missing**  

| Area | Core problem | Why it matters (player‑experience / business) | Concrete code‑level fixes |
|------|--------------|----------------------------------------------|---------------------------|
| **Visual polish** | No particle system, no damage numbers, no screen‑shake, no hit‑flash, static background ambience. | Players equate “feedback” with “impact”. Without it the combat feels “dead” and churn drops. | • Add a **ParticleEngine** wrapper around Phaser 4 particles.<br>• Create **DamageNumber** sprite pool.<br>• Add a **ScreenShake** utility.<br>• Hook these into the combat‑resolution code (`src/combat/*.ts`). |
| **Persistence / “Save‑and‑Leave”** | Game state only lives in `localStorage` on page‑close, no explicit “Quit” button, no CrazyGames SDK integration, no pause overlay. | CrazyGames requires an explicit save‑slot API; otherwise the title is rejected from the store and players lose progress on accidental tab close. | • Implement a **SaveManager** that serialises the full campaign state (progress, stars, best times).<br>• Add a **PauseMenu** UI component with *Resume / Save & Quit* buttons.<br>• Wire CrazyGames SDK (`window.CrazyGames`) into the SaveManager (load on init, save on quit). |
| **Distinct temporal mechanics** | Gameplay is “single‑lane RTS” only; evolution is cosmetic. No “time” leverages. | The market for “timeline” games expects a *time‑manipulation* hook that differentiates it from generic lane‑push shooters. | • Introduce **TimeWarp** (rewind a few seconds, cost = super‑weapon meter).<br>• Add **Commander Abilities** (e.g., “Chrono‑Bomb”, “Age‑Overdrive”).<br>• Hook these into the UI and AI scripts. |
| **Architecture / Testability** | All game‑play logic lives in monolithic scene files; hard‑coded constants; no unit‑testable services. | Future expansions (new ages, new abilities) will be painful; bugs will slip into production. | • Refactor into **services** (CombatService, AgeService, TimeService, SaveService).<br>• Expose pure‑function APIs and add Vitest unit tests. |

Below you will find a **step‑by‑step implementation plan** with exact file paths, TypeScript snippets, and integration notes that you can copy‑paste into the repository.

---

## 1️⃣ Visual Polish – Particle & Feedback System

### 1.1 Create a reusable Particle Engine wrapper  
**File:** `src/effects/ParticleEngine.ts`

```ts
import Phaser from "phaser";

export class ParticleEngine {
  private scene: Phaser.Scene;
  private pools: Record<string, Phaser.GameObjects.Particles.ParticleEmitter>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.pools = {};
  }

  /** Load a particle config (json) created in the editor */
  public addEmitter(key: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
    const particles = this.scene.add.particles(key);
    const emitter = particles.createEmitter(config);
    emitter.stop(); // keep idle until we fire
    this.pools[key] = emitter;
    return emitter;
  }

  /** Fire one-shot effect at (x,y) */
  public emit(key: string, x: number, y: number, overrides?: Partial<Phaser.Types.GameObjects.Particles.ParticleEmitterConfig>) {
    const emitter = this.pools[key];
    if (!emitter) {
      console.warn(`[ParticleEngine] No emitter registered for key ${key}`);
      return;
    }
    emitter.setPosition(x, y);
    if (overrides) emitter.setEmitZone(overrides.emitZone ?? null);
    emitter.explode(overrides?.quantity ?? 1, x, y);
  }
}
```

*Why*: Keeps all particle definitions in one place, makes it trivial to add new effects (e.g., `explosion`, `smoke`, `spark`). The wrapper works with the bundler‑mode TS config (`allowArbitraryExtensions`) without needing extra typings.

### 1.2 Damage Numbers (pop‑up text)

**File:** `src/effects/DamageNumberPool.ts`

```ts
import Phaser from "phaser";

export class DamageNumberPool {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene, poolSize = 30) {
    this.scene = scene;
    this.pool = [];

    for (let i = 0; i < poolSize; i++) {
      const txt = this.scene.add.text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#ff4b4b",
        stroke: "#000",
        strokeThickness: 2,
      })
        .setDepth(2000)
        .setVisible(false);
      this.pool.push(txt);
    }
  }

  public show(value: number, x: number, y: number) {
    const txt = this.pool.find(t => !t.visible) ?? this.pool[0];
    txt.setText(`-${value}`);
    txt.setPosition(x, y);
    txt.setAlpha(1);
    txt.setVisible(true);

    this.scene.tweens.add({
      targets: txt,
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: "Cubic.out",
      onComplete: () => txt.setVisible(false),
    });
  }
}
```

*Usage*: In `src/combat/CombatResolver.ts` (or wherever damage is calculated) call:

```ts
this.damageNumberPool.show(damage, target.x, target.y);
```

### 1.3 Screen Shake Utility

**File:** `src/effects/ScreenShake.ts`

```ts
import Phaser from "phaser";

export class ScreenShake {
  private camera: Phaser.Cameras.Scene2D.Camera;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
  }

  /** intensity: 0‑1, duration in ms */
  public shake(intensity = 0.02, duration = 200) {
    this.camera.shake(duration, intensity);
  }
}
```

Add to the main `GameScene` constructor:

```ts
this.shake = new ScreenShake(this.cameras.main);
```

And call `this.shake.shake(0.03, 250)` on a heavy hit (e.g., turret destroyed, super‑weapon).

### 1.4 Ambient Battlefield Effects (wind, dust)

Create a simple particle for “dust” that runs continuously:

```ts
// In GameScene.create()
this.particleEngine.addEmitter('dust', {
  lifespan: 4000,
  speedX: { min: -10, max: 10 },
  speedY: { min: -5, max: 5 },
  scale: { start: 0.3, end: 0 },
  alpha: { start: 0.2, end: 0 },
  frequency: 200,
  quantity: 2,
  blendMode: 'NORMAL',
  follow: this.laneGraphics // an invisible sprite covering the lane
});
```

You can turn it on/off per‑age (e.g., smoke for Industrial Age).

---

## 2️⃣ Persistence & “Save‑and‑Leave” (CrazyGames)

### 2.1 SaveManager – centralised serialization

**File:** `src/persistence/SaveManager.ts`

```ts
import type { CampaignProgress } from "../campaign/types";

export class SaveManager {
  private static readonly KEY = "timeline-war-save";

  /** Called on game boot */
  static load(): CampaignProgress | null {
    const raw = localStorage.getItem(this.KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CampaignProgress;
    } catch (e) {
      console.warn("[SaveManager] corrupted save data", e);
      localStorage.removeItem(this.KEY);
      return null;
    }
  }

  /** Called when the player presses “Save & Quit” */
  static save(state: CampaignProgress) {
    const payload = JSON.stringify(state);
    localStorage.setItem(this.KEY, payload);
    // CrazyGames SDK – optional, fails gracefully if not present
    if (window.CrazyGames?.sdk) {
      window.CrazyGames.sdk.saveGameState(payload);
    }
  }

  /** Called by CrazyGames on resume (if they ever provide a callback) */
  static async loadFromSDK(): Promise<CampaignProgress | null> {
    if (!window.CrazyGames?.sdk) return this.load();
    try {
      const payload = await window.CrazyGames.sdk.loadGameState();
      if (payload) {
        localStorage.setItem(this.KEY, payload);
        return JSON.parse(payload) as CampaignProgress;
      }
    } catch (e) {
      console.warn("[SaveManager] CG SDK load error", e);
    }
    return this.load();
  }
}
```

*Notes*:

* `CampaignProgress` is an interface you already have for stars, best times etc. If it doesn’t exist, create it in `src/campaign/types.ts`:

```ts
export interface CampaignProgress {
  unlockedStages: number[];
  stars: Record<string, number>; // stageId → star count
  bestTimes: Record<string, number>; // stageId → ms
}
```

### 2.2 Hook into the main entry point

In `src/main.ts` (or wherever the `Game` object is instantiated):

```ts
import { SaveManager } from "./persistence/SaveManager";
import { Campaign } from "./campaign/Campaign";

async function bootstrap() {
  const persisted = await SaveManager.loadFromSDK();
  const campaign = new Campaign(persisted);
  const game = new Game(campaign); // existing constructor
  // expose globally for debugging
  (window as any).game = game;
}
bootstrap();
```

### 2.3 Pause/Save‑Quit UI

**File:** `src/ui/PauseMenu.ts`

```ts
import Phaser from "phaser";
import { SaveManager } from "../persistence/SaveManager";

export class PauseMenu extends Phaser.GameObjects.Container {
  private scene: Phaser.Scene;
  private background: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    super(scene, scene.scale.width / 2, scene.scale.height / 2);
    this.scene = scene;

    this.background = scene.add
      .rectangle(0, 0, 300, 200, 0x000000, 0.7)
      .setOrigin(0.5)
      .setInteractive();

    const title = scene.add.text(0, -60, "Paused", { fontSize: "24px", color: "#fff" }).setOrigin(0.5);
    const resumeBtn = this.createButton("Resume", () => this.resume());
    const quitBtn = this.createButton("Save & Quit", () => this.saveAndQuit());

    this.add([this.background, title, resumeBtn, quitBtn]);
    this.setDepth(5000);
    scene.add.existing(this);
    this.setVisible(false);
  }

  private createButton(label: string, onClick: () => void) {
    const btn = this.scene.add.text(0, 0, label, {
      fontSize: "20px",
      backgroundColor: "#222",
      color: "#fff",
      padding: { x: 12, y: 6 },
    })
      .setOrigin(0.5)
      .setInteractive()
      .on("pointerup", onClick);
    btn.y = this.list.length * 40 - 20; // simple vertical stack
    return btn;
  }

  public open() {
    this.setVisible(true);
    this.scene.scene.pause(); // pause the underlying game scene
  }

  private resume() {
    this.setVisible(false);
    this.scene.scene.resume();
  }

  private saveAndQuit() {
    // Assume GameScene stores campaign state in `this.campaign`
    const campaign = (this.scene as any).campaign.getProgress();
    SaveManager.save(campaign);
    // Show a tiny “Thanks for playing!” overlay then redirect
    this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2, "Saved! Returning…", {
        fontSize: "28px",
        color: "#0f0",
      })
      .setOrigin(0.5);
    setTimeout(() => {
      // CrazyGames SDK: request to close the ad or go to menu
      window.CrazyGames?.sdk?.requestGameExit?.();
      // Fallback – reload page
      location.reload();
    }, 1500);
  }
}
```

Add a key binding (Esc) in `GameScene.create()`:

```ts
this.pauseMenu = new PauseMenu(this);
this.input.keyboard.on("keydown-ESC", () => this.pauseMenu.open());
```

### 2.4 CrazyGames SDK stub (for local dev)

Create a tiny shim that mimics the SDK when running locally, preventing `undefined` errors.

**File:** `public/cg-sdk-stub.js`

```js
window.CrazyGames = {
  sdk: {
    async saveGameState(data) {
      console.log("[CG SDK] saveGameState (stub)", data);
    },
    async loadGameState() {
      console.log("[CG SDK] loadGameState (stub)");
      return null;
    },
    requestGameExit() {
      console.log("[CG SDK] requestGameExit (stub) – reloading");
      location.reload();
    },
  },
};
```

Add it to `index.html` before your bundle:

```html
<script src="/cg-sdk-stub.js"></script>
<script type="module" src="/src/main.ts"></script>
```

When the real CrazyGames environment loads, it will overwrite this stub automatically.

---

## 3️⃣ Distinct Temporal Mechanics

Below is a **minimal viable implementation** that can be expanded later. All new code lives under `src/temporal/` to keep the namespace clean.

### 3.1 Time Service (global meter)

**File:** `src/temporal/TimeService.ts`

```ts
import Phaser from "phaser";

export class TimeService extends Phaser.Events.EventEmitter {
  /** Super‑weapon meter – 0‑100 */
  private meter = 0;
  /** How many seconds of rewind are allowed */
  private readonly maxRewind = 4;

  constructor(scene: Phaser.Scene) {
    super();
    // passive fill: 0.5% per second + 0.2% per kill (listen to "kill")
    scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.modify(0.5),
    });
    this.on("kill", () => this.modify(0.2));
  }

  /** Add or subtract a percentage (clamped) */
  modify(delta: number) {
    this.meter = Phaser.Math.Clamp(this.meter + delta, 0, 100);
    this.emit("meterChanged", this.meter);
  }

  /** Returns true if we have enough to spend */
  canSpend(cost: number) {
    return this.meter >= cost;
  }

  /** Spend and fire a "spent" event */
  spend(cost: number) {
    if (!this.canSpend(cost)) return false;
    this.modify(-cost);
    this.emit("spent", cost);
    return true;
  }

  /** Returns the current meter (0‑100) */
  get value() {
    return this.meter;
  }
}
```

*Inject into GameScene*:

```ts
import { TimeService } from "./temporal/TimeService";

this.timeService = new TimeService(this);
this.timeService.on("meterChanged", (val) => this.hud.updateSuperMeter(val));
```

### 3.2 Time‑Warp (rewind) ability

**File:** `src/temporal/TimeWarp.ts`

```ts
import Phaser from "phaser";
import { TimeService } from "./TimeService";

export class TimeWarp {
  private scene: Phaser.Scene;
  private service: TimeService;
  private history: { timestamp: number; snapshot: any }[] = [];
  private readonly historyLength = 4000; // ms

  constructor(scene: Phaser.Scene, service: TimeService) {
    this.scene = scene;
    this.service = service;

    // Record a snapshot each tick (could be optimized to only store units)
    scene.events.on("postupdate", this.recordSnapshot, this);
  }

  private recordSnapshot() {
    const now = this.scene.time.now;
    // Keep only recent history
    while (this.history.length && now - this.history[0].timestamp > this.historyLength) {
      this.history.shift();
    }
    // Deep‑clone the minimal game state we care about:
    const snapshot = {
      units: (this.scene as any).unitManager.getAll().map((u: any) => ({
        id: u.id,
        x: u.x,
        y: u.y,
        hp: u.hp,
        state: u.state, // e.g., "attacking", "moving"
      })),
      laneFront: (this.scene as any).laneFront,
      superMeter: this.service.value,
    };
    this.history.push({ timestamp: now, snapshot });
  }

  /** Activate the warp – rewinds up to `seconds` (max 4) */
  async activate(seconds: number = 4) {
    const cost = Math.round(seconds * 15); // 15% per second
    if (!this.service.spend(cost)) return false;

    // Find

## 2. Generated Fixes & Implementations

This implementation guide addresses all the deficiencies identified in **Timeline War**. We will move the game from a "static RTS" to a "polished, persistent, and mechanically unique" experience.

### 🛠 Phase 1: Architectural Foundation (Services)

First, we decouple logic from the Phaser Scenes.

**File:** `src/services/Registry.ts`
*Purpose: A simple Service Locator to avoid prop-drilling.*

```typescript
export class Registry {
    private static services = new Map<string, any>();

    static register<T>(key: string, service: T): void {
        this.services.set(key, service);
    }

    static get<T>(key: string): T {
        const service = this.services.get(key);
        if (!service) throw new Error(`Service ${key} not found`);
        return service as T;
    }
}
```

---

### 💾 Phase 2: Persistence & CrazyGames Integration

**File:** `src/services/SaveService.ts`

```typescript
export interface GameState {
    unlockedAges: string[];
    currentAge: string;
    gold: number;
    stars: Record<string, number>;
}

export class SaveService {
    private readonly STORAGE_KEY = "timeline_war_save";

    public async save(state: GameState) {
        const data = JSON.stringify(state);
        localStorage.setItem(this.STORAGE_KEY, data);

        // CrazyGames SDK Integration
        if (window.CrazyGames?.sdk?.data) {
            await window.CrazyGames.sdk.data.setItem(this.STORAGE_KEY, data);
        }
    }

    public async load(): Promise<GameState | null> {
        let data: string | null = null;

        if (window.CrazyGames?.sdk?.data) {
            data = await window.CrazyGames.sdk.data.getItem(this.STORAGE_KEY);
        }

        if (!data) {
            data = localStorage.getItem(this.STORAGE_KEY);
        }

        return data ? JSON.parse(data) : null;
    }
}
```

---

### ✨ Phase 3: Visual Polish (The "Juice")

**File:** `src/fx/FXManager.ts`
*Combines Particles, Shake, and Damage Numbers into one injectable service.*

```typescript
import Phaser from 'phaser';

export class FXManager {
    private scene: Phaser.Scene;
    private damagePool: Phaser.GameObjects.Text[];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.damagePool = [];
        this.initPool();
    }

    private initPool() {
        for (let i = 0; i < 20; i++) {
            const txt = this.scene.add.text(0, 0, '', {
                fontSize: '20px',
                color: '#ff0000',
                stroke: '#000',
                strokeThickness: 3,
                fontStyle: 'bold'
            }).setDepth(1000).setVisible(false);
            this.damagePool.push(txt);
        }
    }

    public showDamage(x: number, y: number, amount: number) {
        const txt = this.damagePool.find(t => !t.visible) || this.damagePool[0];
        txt.setPosition(x, y).setText(amount.toString()).setVisible(true).setAlpha(1);
        
        this.scene.tweens.add({
            targets: txt,
            y: y - 50,
            alpha: 0,
            duration: 800,
            onComplete: () => txt.setVisible(false)
        });
    }

    public screenShake(intensity = 0.01, duration = 200) {
        this.scene.cameras.main.shake(duration, intensity);
    }

    public bloodSplat(x: number, y: number) {
        const emitter = this.scene.add.particles(x, y, 'pixel', {
            speed: { min: -100, max: 100 },
            angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 },
            blendMode: 'ADD',
            lifespan: 400,
            gravityY: 400,
            quantity: 5
        });
        this.scene.time.delayedCall(400, () => emitter.destroy());
    }
}
```

---

### ⏳ Phase 4: Temporal Mechanics (Time Rewind)

This is the "Unique Selling Point." We implement a circular buffer to record unit states.

**File:** `src/services/TimeService.ts`

```typescript
interface Snapshot {
    timestamp: number;
    units: { id: string, x: number, y: number, hp: number, type: string, owner: string }[];
}

export class TimeService {
    private history: Snapshot[] = [];
    private readonly MAX_HISTORY = 300; // ~5 seconds at 60fps

    public record(units: any[]) {
        const snap: Snapshot = {
            timestamp: Date.now(),
            units: units.map(u => ({
                id: u.id,
                x: u.x,
                y: u.y,
                hp: u.hp,
                type: u.type,
                owner: u.owner
            }))
        };
        this.history.push(snap);
        if (this.history.length > this.MAX_HISTORY) this.history.shift();
    }

    public getRewindState(secondsBack: number): Snapshot | undefined {
        const index = Math.max(0, this.history.length - (secondsBack * 60));
        return this.history[index];
    }
}
```

---

### 🔗 Integration: Patching the Game Scene

Modify your `MainScene.ts` (or equivalent) to wire these systems together.

```typescript
// In MainScene.ts

import { FXManager } from './fx/FXManager';
import { TimeService } from './services/TimeService';
import { Registry } from './services/Registry';

export class MainScene extends Phaser.Scene {
    private fx: FXManager;
    private timeService: TimeService;

    create() {
        this.fx = new FXManager(this);
        this.timeService = new TimeService();
        
        // Register for global access
        Registry.register('fx', this.fx);
        
        // Listen for combat events (Assume you have an EventBus)
        this.events.on('unit_damaged', (data: any) => {
            this.fx.showDamage(data.x, data.y, data.amount);
            this.fx.bloodSplat(data.x, data.y);
            if (data.isCritical) this.fx.screenShake();
        });

        // Add Rewind Key
        this.input.keyboard.on('keydown-R', () => this.triggerRewind());
    }

    update() {
        // Record state for Rewind
        this.timeService.record(this.unitManager.getAllUnits());
    }

    private triggerRewind() {
        const pastState = this.timeService.getRewindState(3); // 3 seconds ago
        if (!pastState) return;

        // Visual feedback for time warp
        this.cameras.main.flash(500, 0, 150, 255);
        
        // Logic to reset unit positions and HP
        this.unitManager.resetToSnapshot(pastState.units);
    }
}
```

---

### 🧪 Verification & Testing

1.  **Persistence Test:** Run the game, buy a unit, then refresh the page. Use `SaveService.load()` in `init()` to check if data persists in LocalStorage.
2.  **Feedback Test:** Trigger a unit attack. You should see a red number pop up and a slight screen shake on critical hits.
3.  **CrazyGames Test:** Open the browser console and check `window.CrazyGames`. If the SDK is missing, the `SaveService` should still function via LocalStorage without crashing.
4.  **Rewind Test:** Move units across the screen, press 'R'. They should snap back to where they were 3 seconds ago.

### 🚀 Production Readiness Checklist
- [ ] **Assets:** Ensure a 1x1 white pixel exists in your loader named 'pixel' for the blood particles.
- [ ] **UI:** Add a "Super Meter" UI bar linked to the `TimeService` so players know when they can rewind.
- [ ] **SDK:** Add the `<script src="https://sdk.crazygames.com/crazygames-sdk-v2.js"></script>` to your `index.html`.

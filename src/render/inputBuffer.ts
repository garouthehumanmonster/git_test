/**
 * inputBuffer.ts — a bounded FIFO of key presses captured before the match is
 * able to accept input.
 *
 * `GameScene.create()` builds the backdrop, the HUD and the first simulation
 * frame. That is long enough that a player who starts typing the moment the
 * stage card is clicked loses their first presses — a playtest recorded two
 * `x` speed toggles 1.5 s in with the HUD still reading 1x. The keyboard is
 * claimed in `init()` instead, and anything typed before the scene is ready is
 * parked here and replayed in order.
 *
 * Pure: no Phaser, no DOM, no clock. The caller supplies `now`.
 */

/** The subset of a keyboard event we actually read. */
export interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface BufferedKey {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Milliseconds on the caller's clock when the press arrived. */
  at: number;
}

/** Older presses than this are stale by the time the scene can use them. */
export const INPUT_BUFFER_TTL_MS = 1000;

/** Hard ceiling so a stuck key cannot grow the queue without bound. */
export const INPUT_BUFFER_MAX = 12;

export class InputBuffer {
  readonly maxQueued: number;
  readonly ttlMs: number;
  private queue: BufferedKey[] = [];
  private droppedTotal = 0;

  constructor(maxQueued = INPUT_BUFFER_MAX, ttlMs = INPUT_BUFFER_TTL_MS) {
    this.maxQueued = maxQueued;
    this.ttlMs = ttlMs;
  }

  /** Park a press. Returns false if the buffer was full and the oldest was evicted. */
  push(event: KeyLike, nowMs: number): boolean {
    const buffered: BufferedKey = {
      key: event.key,
      code: event.code ?? '',
      shiftKey: event.shiftKey ?? false,
      ctrlKey: event.ctrlKey ?? false,
      metaKey: event.metaKey ?? false,
      at: nowMs,
    };
    let evicted = false;
    if (this.queue.length >= this.maxQueued) {
      this.queue.shift();
      this.droppedTotal++;
      evicted = true;
    }
    this.queue.push(buffered);
    return !evicted;
  }

  /** Take everything still fresh, oldest first, discarding expired presses. */
  drain(nowMs: number): BufferedKey[] {
    const fresh = this.queue.filter((k) => nowMs - k.at <= this.ttlMs);
    this.droppedTotal += this.queue.length - fresh.length;
    this.queue = [];
    return fresh;
  }

  size(): number {
    return this.queue.length;
  }

  /** How many presses have been discarded as stale or overflow. */
  get dropped(): number {
    return this.droppedTotal;
  }

  clear(): void {
    this.queue = [];
  }
}

/** A key press normalised to the fields the game actually reads. */
export interface KeyEvent {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function normalizeKey(event: KeyLike): KeyEvent {
  return {
    key: event.key,
    code: event.code ?? '',
    shiftKey: event.shiftKey ?? false,
    ctrlKey: event.ctrlKey ?? false,
    metaKey: event.metaKey ?? false,
  };
}

/* ------------------------------------------------------------------ *
 * App-wide boot capture.
 *
 * A scene-local listener is not early enough. The game boots into BootScene
 * and MenuScene first, so a player who clicks a stage card and immediately
 * starts typing is pressing keys while no scene that cares is listening —
 * and an event with no listener is gone the instant it fires, which no amount
 * of later buffering can recover. CI proved this: with the listener attached
 * in GameScene.init(), mid-match keys worked but boot keys were still lost.
 *
 * So exactly one listener exists for the whole app. It buffers until a scene
 * claims the keyboard, then forwards directly.
 * ------------------------------------------------------------------ */

const bootKeys = new InputBuffer();
let activeHandler: ((event: KeyEvent) => void) | null = null;
let listenerInstalled = false;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function onWindowKeyDown(event: KeyboardEvent): void {
  const normalized = normalizeKey(event);
  if (activeHandler) activeHandler(normalized);
  else bootKeys.push(normalized, nowMs());
}

/** Install the single app-wide key listener. Idempotent. */
export function installBootKeyListener(): void {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  window.addEventListener('keydown', onWindowKeyDown);
}

/**
 * Take ownership of the keyboard, and hand back every press captured before
 * this moment (oldest first) so the caller can replay it. Pass null to
 * release, e.g. when the scene shuts down.
 */
export function claimBootKeys(handler: ((event: KeyEvent) => void) | null): KeyEvent[] {
  activeHandler = handler;
  return handler === null ? [] : bootKeys.drain(nowMs());
}

/** How many presses are parked waiting for a scene to claim them. */
export function pendingBootKeyCount(): number {
  return bootKeys.size();
}

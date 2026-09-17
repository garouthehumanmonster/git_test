/**
 * A tiny, pure FIFO toast queue for the top-centre battle announcements.
 *
 * The old behaviour created a fresh banner per `announce()` call, so a Chrono
 * Warp, an incoming Airstrike and the Timeline Collapse warning could all be on
 * screen at once, painted over each other at the same coordinates and
 * unreadable. This module owns the ordering rules so the renderer only ever has
 * to draw one banner:
 *
 *   - one toast is visible at a time, the rest wait in FIFO order,
 *   - the queue is bounded (`maxQueued`); when it is full a new IMPORTANT toast
 *     evicts the oldest normal one, and a new normal toast is dropped,
 *   - re-announcing an id that is already up refreshes it instead of stacking a
 *     duplicate behind itself,
 *   - it holds no Phaser, DOM or clock references — the caller passes `now`.
 */
export type ToastPriority = 'normal' | 'important';

export interface ToastRequest {
  /** Dedupe key; re-pushing the same id refreshes rather than stacks. */
  id: string;
  title: string;
  sub?: string;
  /** How long the banner stays up, in milliseconds. */
  ms: number;
  priority?: ToastPriority;
}

export interface ActiveToast {
  id: string;
  title: string;
  sub: string;
  ms: number;
  priority: ToastPriority;
  startedAt: number;
}

export interface ToastEvents {
  /** Set when a new banner should be drawn this frame. */
  show?: ActiveToast;
  /** Set when the current banner should be destroyed this frame. */
  hide?: boolean;
}

export const DEFAULT_MAX_QUEUED = 3;

export class ToastQueue {
  private queue: ToastRequest[] = [];
  private active: ActiveToast | null = null;
  /** How many toasts may wait behind the visible one. */
  readonly maxQueued: number;

  constructor(maxQueued: number = DEFAULT_MAX_QUEUED) {
    if (!Number.isInteger(maxQueued) || maxQueued < 1) {
      throw new RangeError('ToastQueue needs at least one slot');
    }
    this.maxQueued = maxQueued;
  }

  /** Number of toasts waiting (not counting the visible one). */
  get pending(): number {
    return this.queue.length;
  }

  /** The toast currently on screen, if any. */
  get current(): ActiveToast | null {
    return this.active;
  }

  /**
   * Enqueue a toast. Returns true when it was accepted (including the
   * "refreshed an existing one" case) and false when it was dropped.
   */
  push(request: ToastRequest): boolean {
    const priority = request.priority ?? 'normal';

    // Refresh what is already up rather than queueing a clone of it.
    if (this.active && this.active.id === request.id) {
      // Keep the original start so a repeated alert cannot live forever, but
      // let the longer of the two durations win and refresh the sub-line.
      this.active.ms = Math.max(this.active.ms, request.ms);
      this.active.sub = request.sub ?? this.active.sub;
      return true;
    }

    const existing = this.queue.findIndex((t) => t.id === request.id);
    if (existing >= 0) {
      this.queue[existing] = { ...request, priority };
      return true;
    }

    if (this.queue.length >= this.maxQueued) {
      const evictable = this.queue.findIndex((t) => (t.priority ?? 'normal') !== 'important');
      if (evictable < 0) {
        // Queue is full of important alerts: only another important one may
        // bump the oldest of them, and a normal one is simply dropped.
        if (priority !== 'important') return false;
        this.queue.shift();
      } else if (priority === 'important') {
        this.queue.splice(evictable, 1);
      } else {
        return false;
      }
    }

    // Important alerts jump ahead of routine ones (an upgrade banner must not
    // delay the collapse warning) but stay behind any important alert already
    // waiting, so the queue keeps its FIFO promise within a priority band.
    if (priority === 'important') {
      const firstNormal = this.queue.findIndex((t) => (t.priority ?? 'normal') !== 'important');
      if (firstNormal >= 0) {
        this.queue.splice(firstNormal, 0, { ...request, priority });
        return true;
      }
    }
    this.queue.push({ ...request, priority });
    return true;
  }

  /**
   * Advance the queue. Call once per frame with a monotonic clock; it returns
   * at most one show and one hide event so the renderer stays trivial.
   */
  update(now: number): ToastEvents {
    const events: ToastEvents = {};
    if (this.active && now - this.active.startedAt >= this.active.ms) {
      this.active = null;
      events.hide = true;
    }
    if (!this.active) {
      const next = this.queue.shift();
      if (next) {
        this.active = {
          id: next.id,
          title: next.title,
          sub: next.sub ?? '',
          ms: next.ms,
          priority: next.priority ?? 'normal',
          startedAt: now,
        };
        events.show = this.active;
      }
    }
    return events;
  }

  /** Drop everything waiting. The visible banner is left to finish its tween. */
  clearPending(): void {
    this.queue = [];
  }

  /** Drop everything, including the banner on screen. */
  clear(): void {
    this.queue = [];
    this.active = null;
  }
}

import { describe, it, expect } from 'vitest';
import { DEFAULT_MAX_QUEUED, ToastQueue } from '../../src/render/toastQueue';
import type { ToastRequest } from '../../src/render/toastQueue';

const toast = (id: string, ms = 1000, priority: ToastRequest['priority'] = 'normal'): ToastRequest => ({
  id,
  title: id.toUpperCase(),
  sub: `${id} detail`,
  ms,
  priority,
});

describe('toast queue', () => {
  it('shows one toast at a time, in FIFO order', () => {
    const q = new ToastQueue();
    q.push(toast('warp'));
    q.push(toast('ult'));
    q.push(toast('collapse'));
    expect(q.update(0).show?.id).toBe('warp');
    expect(q.update(500).show).toBeUndefined();
    expect(q.pending).toBe(2);
    // The first banner expires and the next one takes its place on the same frame.
    const ev = q.update(1000);
    expect(ev.hide).toBe(true);
    expect(ev.show?.id).toBe('ult');
    expect(q.update(2000).show?.id).toBe('collapse');
  });

  it('never lets a burst of alerts paint over each other', () => {
    const q = new ToastQueue();
    for (const id of ['warp', 'ult', 'collapse', 'upgrade', 'turret']) q.push(toast(id));
    const shown: string[] = [];
    for (let now = 0; now < 10_000; now += 100) {
      const ev = q.update(now);
      if (ev.show) shown.push(ev.show.id);
    }
    // Bounded: the visible one plus at most DEFAULT_MAX_QUEUED waiting.
    expect(shown.length).toBeLessThanOrEqual(1 + DEFAULT_MAX_QUEUED);
    expect(shown[0]).toBe('warp');
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('lets an important alert evict the oldest normal one when full', () => {
    const q = new ToastQueue(2);
    q.update(0); // show 'warp'
    q.push(toast('a'));
    q.push(toast('b'));
    expect(q.push(toast('c'))).toBe(false); // full and normal -> dropped
    expect(q.push(toast('collapse', 3000, 'important'))).toBe(true);
    expect(q.pending).toBe(2);
    expect(q.update(1000).show?.id).toBe('collapse');
    expect(q.update(4000).show?.id).toBe('b');
  });

  it('refreshes a repeated alert instead of stacking a clone', () => {
    const q = new ToastQueue();
    q.push(toast('warp', 1000));
    expect(q.update(0).show?.id).toBe('warp');
    expect(q.push(toast('warp', 2000))).toBe(true);
    expect(q.pending).toBe(0);
    expect(q.update(1500).hide).toBeUndefined();
    expect(q.update(2000).hide).toBe(true);
  });

  it('keeps a queue of nothing but important alerts bounded too', () => {
    const q = new ToastQueue(1);
    q.update(0);
    q.push(toast('a', 1000, 'important'));
    expect(q.push(toast('b', 1000, 'important'))).toBe(true); // evicts 'a'
    expect(q.push(toast('c', 1000))).toBe(false);
    expect(q.pending).toBe(1);
  });

  it('clears pending work without touching the banner on screen', () => {
    const q = new ToastQueue();
    q.push(toast('a'));
    q.push(toast('b'));
    q.update(0);
    q.clearPending();
    expect(q.pending).toBe(0);
    expect(q.current?.id).toBe('a');
    q.clear();
    expect(q.current).toBeNull();
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => new ToastQueue(0)).toThrow(RangeError);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  track,
  attachSink,
  flush,
  getQueue,
  resetAnalyticsForTesting,
  getElapsedBucket,
  getDurationBucket,
  getSessionCheckpointBucket,
  type AnalyticsEvent,
} from '../src/analytics';

describe('Privacy-Safe Product Telemetry (analytics.ts)', () => {
  beforeEach(() => {
    resetAnalyticsForTesting();
  });

  it('operates safely with no sink attached and never throws', () => {
    expect(() => {
      track({ name: 'menu_view' });
      track({ name: 'stage_start', stageId: 1, priorStars: 0 });
      track({ name: 'first_action', action: 'spawn', elapsedBucket: '<5s' });
    }).not.toThrow();

    expect(getQueue().length).toBe(3);
    expect(getQueue()[0].name).toBe('menu_view');
  });

  it('bounds the queue to maximum 32 events and discards oldest on overflow', () => {
    for (let i = 0; i < 40; i++) {
      track({ name: 'stage_start', stageId: i, priorStars: 0 });
    }

    const q = getQueue();
    expect(q.length).toBe(32);
    // Oldest 8 (0-7) dropped; first in queue should be stageId 8
    expect((q[0] as { stageId: number }).stageId).toBe(8);
    expect((q[31] as { stageId: number }).stageId).toBe(39);
  });

  it('sanitizes unbounded or out-of-range fields', () => {
    track({
      name: 'match_end',
      stageId: -5,
      outcome: 'win',
      durationBucket: '120-180s',
      ageReached: 'modern',
      stars: 99 as any,
    });

    const q = getQueue();
    expect(q.length).toBe(1);
    const ev = q[0] as Extract<AnalyticsEvent, { name: 'match_end' }>;
    expect(ev.stageId).toBe(0);
    expect(ev.stars).toBe(3);
  });

  it('flushes buffered events to newly attached sink exactly once in FIFO order', () => {
    track({ name: 'menu_view' });
    track({ name: 'stage_start', stageId: 1, priorStars: 0 });

    const received: AnalyticsEvent[] = [];
    const sink = vi.fn((ev: AnalyticsEvent) => {
      received.push(ev);
    });

    attachSink(sink);

    expect(sink).toHaveBeenCalledTimes(2);
    expect(received.map((e) => e.name)).toEqual(['menu_view', 'stage_start']);
    expect(getQueue().length).toBe(0);

    // Further flush should be a no-op
    flush();
    expect(sink).toHaveBeenCalledTimes(2);

    // Direct calls after attachment route immediately to sink
    track({ name: 'rewarded_offer', placement: 'gold', result: 'shown' });
    expect(sink).toHaveBeenCalledTimes(3);
    expect(getQueue().length).toBe(0);
  });

  it('handles throwing sinks gracefully without crashing caller', () => {
    const errorSink = vi.fn(() => {
      throw new Error('Simulated network/SDK telemetry error');
    });

    attachSink(errorSink);

    expect(() => {
      track({ name: 'menu_view' });
    }).not.toThrow();
  });

  it('correctly maps time intervals to coarse buckets', () => {
    expect(getElapsedBucket(2)).toBe('<5s');
    expect(getElapsedBucket(10)).toBe('5-15s');
    expect(getElapsedBucket(25)).toBe('15-30s');
    expect(getElapsedBucket(45)).toBe('>30s');

    expect(getDurationBucket(30)).toBe('<60s');
    expect(getDurationBucket(90)).toBe('60-120s');
    expect(getDurationBucket(150)).toBe('120-180s');
    expect(getDurationBucket(210)).toBe('180-240s');
    expect(getDurationBucket(300)).toBe('>240s');

    expect(getSessionCheckpointBucket(2)).toBe('1m');
    expect(getSessionCheckpointBucket(4)).toBe('3m');
    expect(getSessionCheckpointBucket(8)).toBe('5m');
    expect(getSessionCheckpointBucket(12)).toBe('10m');
    expect(getSessionCheckpointBucket(20)).toBe('>10m');
  });
});

import type { Age } from './sim/types';

/**
 * Privacy-Safe Product Telemetry Adapter
 *
 * MISSION & CONSTRAINTS:
 * - Zero PII: No names, user IDs, raw timestamps, free text, or device fingerprints.
 * - Coarse enumeration: Time, durations, and counts are strictly bucketed.
 * - Never throws: Safe in all environments (headless, offline, embedded, broken SDK).
 * - Bounded memory: Queues at most 32 events before sink attachment, discarding oldest on overflow.
 *
 * SUPPORTED FUNNEL QUERIES:
 * 1. Menu to First Match Conversion:
 *    SELECT count(stage_start WHERE stageId=1) / count(menu_view)
 *    Purpose: Measure whether onboarding friction or asset loading causes drop-off before play.
 *
 * 2. Time to First Meaningful Action:
 *    SELECT elapsedBucket, count(*) FROM first_action WHERE stageId=1 GROUP BY elapsedBucket
 *    Purpose: Verify if players act within the target <20s window or stall.
 *
 * 3. Stage 1 Completion & Retention Gate:
 *    SELECT outcome, durationBucket, count(*) FROM match_end WHERE stageId=1 GROUP BY outcome, durationBucket
 *    Purpose: Detect whether losses stem from misunderstanding (<60s) or late stalemate (>240s).
 *
 * 4. Evolution Comprehension Rate:
 *    SELECT age, outcome, reasonCode, count(*) FROM evolve_attempt GROUP BY age, outcome, reasonCode
 *    Purpose: Determine if players understand XP/Gold requirements for age evolution.
 *
 * 5. Rewarded Ad Engagement & Value Perception:
 *    SELECT placement, result, count(*) FROM rewarded_offer GROUP BY placement, result
 *    Purpose: Measure offer acceptance, completion rate, and ad error frequency.
 *
 * 6. Session Longevity & Depth:
 *    SELECT activeMinutesBucket, count(DISTINCT session) FROM session_checkpoint GROUP BY activeMinutesBucket
 *    Purpose: Measure session endurance without tracking user identity.
 *
 * 7. Campaign Progression & Star Funnel:
 *    SELECT stageId, stars, count(*) FROM match_end WHERE outcome='win' GROUP BY stageId, stars
 *    Purpose: Measure skill mastery and progression drop between stages 1 to 5.
 */

export type ElapsedBucket = '<5s' | '5-15s' | '15-30s' | '>30s';
export type DurationBucket = '<60s' | '60-120s' | '120-180s' | '180-240s' | '>240s';
export type SessionCheckpointBucket = '1m' | '3m' | '5m' | '10m' | '>10m';

export type AnalyticsEvent =
  | { name: 'menu_view' }
  | { name: 'stage_start'; stageId: number; priorStars: 0 | 1 | 2 | 3 }
  | {
      name: 'first_action';
      action: 'spawn' | 'upgrade' | 'turret' | 'ultimate' | 'chrono' | 'rally' | 'reinforce';
      elapsedBucket: ElapsedBucket;
    }
  | {
      name: 'evolve_attempt';
      age: Age;
      outcome: 'success' | 'blocked';
      reasonCode: 'xp' | 'gold' | 'max_age' | 'none';
    }
  | {
      name: 'match_end';
      stageId: number;
      outcome: 'win' | 'loss' | 'draw' | 'timeout';
      durationBucket: DurationBucket;
      ageReached: Age;
      stars: 0 | 1 | 2 | 3;
    }
  | {
      name: 'rewarded_offer';
      placement: 'gold' | 'revive';
      result: 'shown' | 'accepted' | 'completed' | 'error';
    }
  | {
      name: 'session_checkpoint';
      activeMinutesBucket: SessionCheckpointBucket;
    };

export type AnalyticsSink = (event: AnalyticsEvent) => void;

const MAX_QUEUE_SIZE = 32;
const eventQueue: AnalyticsEvent[] = [];
let activeSink: AnalyticsSink | null = null;

export function getElapsedBucket(seconds: number): ElapsedBucket {
  if (seconds < 5) return '<5s';
  if (seconds < 15) return '5-15s';
  if (seconds < 30) return '15-30s';
  return '>30s';
}

export function getDurationBucket(seconds: number): DurationBucket {
  if (seconds < 60) return '<60s';
  if (seconds < 120) return '60-120s';
  if (seconds < 180) return '120-180s';
  if (seconds < 240) return '180-240s';
  return '>240s';
}

export function getSessionCheckpointBucket(minutes: number): SessionCheckpointBucket {
  if (minutes < 3) return '1m';
  if (minutes < 5) return '3m';
  if (minutes < 10) return '5m';
  if (minutes < 15) return '10m';
  return '>10m';
}

function sanitizeStars(s: number): 0 | 1 | 2 | 3 {
  if (s <= 0) return 0;
  if (s >= 3) return 3;
  return Math.floor(s) as 0 | 1 | 2 | 3;
}

function sanitizeEvent(raw: AnalyticsEvent): AnalyticsEvent {
  switch (raw.name) {
    case 'stage_start':
      return {
        name: 'stage_start',
        stageId: Math.max(0, Math.floor(raw.stageId || 0)),
        priorStars: sanitizeStars(raw.priorStars),
      };
    case 'match_end':
      return {
        name: 'match_end',
        stageId: Math.max(0, Math.floor(raw.stageId || 0)),
        outcome: raw.outcome,
        durationBucket: raw.durationBucket,
        ageReached: raw.ageReached,
        stars: sanitizeStars(raw.stars),
      };
    default:
      return raw;
  }
}

/**
 * Record a telemetry event. Safe to call anywhere; never throws.
 */
export function track(event: AnalyticsEvent): void {
  try {
    const clean = sanitizeEvent(event);
    if (activeSink) {
      try {
        activeSink(clean);
      } catch {
        // Sink failure must not crash gameplay
      }
      return;
    }

    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      eventQueue.shift(); // Drop oldest on overflow
    }
    eventQueue.push(clean);
  } catch {
    // Failsafe: never throw
  }
}

/**
 * Attach an analytics sink (e.g. CrazyGames or custom portal API).
 * Immediately flushes any buffered events in FIFO order.
 */
export function attachSink(sink: AnalyticsSink | null): void {
  activeSink = sink;
  if (activeSink) {
    flush();
  }
}

/**
 * Flush all buffered events to the active sink exactly once.
 */
export function flush(): void {
  if (!activeSink || eventQueue.length === 0) return;
  const events = eventQueue.splice(0, eventQueue.length);
  for (const ev of events) {
    try {
      activeSink(ev);
    } catch {
      // Continue flushing remaining
    }
  }
}

/**
 * Read current queue state (for testing or debugging).
 */
export function getQueue(): readonly AnalyticsEvent[] {
  return eventQueue;
}

/**
 * Reset internal queue and sink (testing only).
 */
export function resetAnalyticsForTesting(): void {
  eventQueue.length = 0;
  activeSink = null;
}

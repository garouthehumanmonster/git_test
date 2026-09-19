import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSupplyDropEligible, RewardedAdController, type SupplyDropContext } from '../src/ads';
import { resetAnalyticsForTesting, getQueue } from '../src/analytics';

describe('Contextual Rewarded Ads (ads.ts)', () => {
  beforeEach(() => {
    resetAnalyticsForTesting();
  });

  const baseContext: SupplyDropContext = {
    gold: 5,
    minUnitCost: 15,
    livingPlayerUnits: 1,
    elapsedSeconds: 50,
    hasAdblock: false,
    tutorialActive: false,
    alreadyOfferedOrUsed: false,
    matchResult: 'playing',
  };

  it('approves eligibility when all contextual distress conditions are met', () => {
    expect(isSupplyDropEligible(baseContext)).toBe(true);
  });

  it('rejects if player has enough gold to afford a unit', () => {
    expect(isSupplyDropEligible({ ...baseContext, gold: 15, minUnitCost: 15 })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, gold: 20, minUnitCost: 15 })).toBe(false);
  });

  it('rejects if player fields 3 or more living units', () => {
    expect(isSupplyDropEligible({ ...baseContext, livingPlayerUnits: 3 })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, livingPlayerUnits: 5 })).toBe(false);
  });

  it('rejects during the first 45 seconds of play', () => {
    expect(isSupplyDropEligible({ ...baseContext, elapsedSeconds: 44 })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, elapsedSeconds: 10 })).toBe(false);
  });

  it('rejects when tutorial is active or during first tutorial minute', () => {
    expect(isSupplyDropEligible({ ...baseContext, tutorialActive: true })).toBe(false);
  });

  it('rejects when adblocked, already offered, or match is not active', () => {
    expect(isSupplyDropEligible({ ...baseContext, hasAdblock: true })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, alreadyOfferedOrUsed: true })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, matchResult: 'win' })).toBe(false);
    expect(isSupplyDropEligible({ ...baseContext, matchResult: 'loss' })).toBe(false);
  });

  it('enforces exactly-once reward grant and prevents duplicate execution', () => {
    let grantCount = 0;
    const controller = new RewardedAdController(
      'gold',
      () => {
        grantCount++;
      }
    );

    let adCallback: (() => void) | null = null;
    const showMock = vi.fn((onFinished: () => void) => {
      adCallback = onFinished;
    });

    const accepted = controller.request(showMock);
    expect(accepted).toBe(true);
    expect(controller.isInFlight()).toBe(true);

    // Second simultaneous request is rejected
    expect(controller.request(showMock)).toBe(false);

    // Trigger ad completion
    expect(adCallback).not.toBeNull();
    adCallback!();
    expect(grantCount).toBe(1);
    expect(controller.isCompleted()).toBe(true);
    expect(controller.isInFlight()).toBe(false);

    // Malformed SDK calling adFinished a second time must NOT grant second reward
    adCallback!();
    expect(grantCount).toBe(1);

    // Telemetry events verified
    const events = getQueue();
    expect(events.map((e) => e.name)).toEqual(['rewarded_offer', 'rewarded_offer']);
    expect((events[0] as any).result).toBe('accepted');
    expect((events[1] as any).result).toBe('completed');
  });

  it('handles error path cleanly and emits telemetry', () => {
    let errorCalled = false;
    const controller = new RewardedAdController(
      'revive',
      () => {},
      () => {
        errorCalled = true;
      }
    );

    controller.request((_onFinished, onError) => {
      onError();
    });

    expect(errorCalled).toBe(true);
    expect(controller.isInFlight()).toBe(false);
    expect(controller.isCompleted()).toBe(false);

    const events = getQueue();
    expect((events[1] as any).result).toBe('error');
  });
});

import { track } from './analytics';

export interface SupplyDropContext {
  gold: number;
  minUnitCost: number;
  livingPlayerUnits: number;
  elapsedSeconds: number;
  hasAdblock: boolean;
  tutorialActive: boolean;
  alreadyOfferedOrUsed: boolean;
  matchResult: 'playing' | 'win' | 'loss' | 'draw';
}

/**
 * Pure eligibility rule for Contextual Supply Drop (Deliverable C):
 * - Offer only when the player cannot afford any unit
 * - Has fewer than 3 living units
 * - After at least 45 seconds of active play
 * - Not in the first tutorial minute (or while tutorial active)
 * - Not adblocked, not already used/offered, and match is playing
 */
export function isSupplyDropEligible(ctx: SupplyDropContext): boolean {
  if (ctx.hasAdblock) return false;
  if (ctx.alreadyOfferedOrUsed) return false;
  if (ctx.matchResult !== 'playing') return false;
  if (ctx.tutorialActive) return false;
  if (ctx.elapsedSeconds < 45) return false;
  if (ctx.livingPlayerUnits >= 3) return false;
  if (ctx.gold >= ctx.minUnitCost) return false;
  return true;
}

/**
 * Ensures exactly-once callback execution and in-flight guarding for rewarded ads.
 */
export class RewardedAdController {
  private inFlight = false;
  private completed = false;
  private readonly placement: 'gold' | 'revive';
  private readonly onRewardGranted: () => void;
  private readonly onErrorOccurred?: () => void;

  constructor(
    placement: 'gold' | 'revive',
    onRewardGranted: () => void,
    onErrorOccurred?: () => void
  ) {
    this.placement = placement;
    this.onRewardGranted = onRewardGranted;
    this.onErrorOccurred = onErrorOccurred;
  }

  public request(showAdFn: (onFinished: () => void, onError: () => void) => void): boolean {
    if (this.inFlight || this.completed) return false;
    this.inFlight = true;
    track({ name: 'rewarded_offer', placement: this.placement, result: 'accepted' });

    let granted = false;
    showAdFn(
      () => {
        if (granted || this.completed) return;
        granted = true;
        this.completed = true;
        this.inFlight = false;
        track({ name: 'rewarded_offer', placement: this.placement, result: 'completed' });
        this.onRewardGranted();
      },
      () => {
        if (granted || this.completed) return;
        this.inFlight = false;
        track({ name: 'rewarded_offer', placement: this.placement, result: 'error' });
        this.onErrorOccurred?.();
      }
    );
    return true;
  }

  public isInFlight(): boolean {
    return this.inFlight;
  }

  public isCompleted(): boolean {
    return this.completed;
  }
}

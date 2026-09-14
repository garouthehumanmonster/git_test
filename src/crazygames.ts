/**
 * CrazyGames SDK v3 Wrapper
 * Gracefully degrades when running offline or outside CrazyGames.
 */

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        init: () => Promise<void>;
        game: {
          gameplayStart: () => void;
          gameplayStop: () => void;
          happytime: () => void;
        };
        ad: {
          requestAd: (
            type: 'midgame' | 'rewarded',
            callbacks?: {
              adStarted?: () => void;
              adFinished?: () => void;
              adError?: (error: unknown) => void;
            }
          ) => void;
        };
      };
    };
  }
}

export async function initCrazyGames(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.CrazyGames?.SDK) {
    try {
      await window.CrazyGames.SDK.init();
      console.log('[CrazyGames] SDK v3 initialized');
    } catch (err) {
      console.warn('[CrazyGames] SDK init skipped (local/dev mode):', err);
    }
  } else {
    console.log('[CrazyGames] Running in standalone / dev mode (Mock SDK active)');
  }
}

export function crazyGameplayStart(): void {
  try {
    if (window.CrazyGames?.SDK?.game?.gameplayStart) {
      window.CrazyGames.SDK.game.gameplayStart();
      console.log('[CrazyGames] gameplayStart fired');
    }
  } catch (e) {
    console.warn(e);
  }
}

export function crazyGameplayStop(): void {
  try {
    if (window.CrazyGames?.SDK?.game?.gameplayStop) {
      window.CrazyGames.SDK.game.gameplayStop();
      console.log('[CrazyGames] gameplayStop fired');
    }
  } catch (e) {
    console.warn(e);
  }
}

export function crazyHappytime(): void {
  try {
    if (window.CrazyGames?.SDK?.game?.happytime) {
      window.CrazyGames.SDK.game.happytime();
      console.log('[CrazyGames] happytime fired!');
    }
  } catch (e) {
    console.warn(e);
  }
}

export function crazyShowMidgameAd(onComplete?: () => void): void {
  try {
    if (window.CrazyGames?.SDK?.ad?.requestAd) {
      window.CrazyGames.SDK.ad.requestAd('midgame', {
        adStarted: () => console.log('[CrazyGames] Midgame ad started'),
        adFinished: () => {
          console.log('[CrazyGames] Midgame ad finished');
          onComplete?.();
        },
        adError: () => onComplete?.(),
      });
      return;
    }
  } catch (e) {
    console.warn(e);
  }
  onComplete?.();
}

export function crazyShowRewardedAd(onReward: () => void, onError?: () => void): void {
  let settled = false;
  const reward = () => {
    if (settled) return;
    settled = true;
    onReward();
  };
  const fail = () => {
    if (settled) return;
    settled = true;
    onError?.();
  };

  try {
    if (window.CrazyGames?.SDK?.ad?.requestAd) {
      window.CrazyGames.SDK.ad.requestAd('rewarded', {
        adStarted: () => console.log('[CrazyGames] Rewarded ad started'),
        adFinished: () => {
          console.log('[CrazyGames] Rewarded ad completed! Granting reward.');
          reward();
        },
        adError: (err) => {
          // A failed or blocked ad is not a completed rewarded view. Granting
          // here allowed repeated free rewards whenever an ad was unavailable.
          console.warn('[CrazyGames] Rewarded ad error / adblocked:', err);
          fail();
        },
      });
      return;
    }
  } catch (e) {
    console.warn('[CrazyGames] Rewarded ad request failed:', e);
    fail();
    return;
  }
  console.log('[CrazyGames Mock] Rewarded ad watched (dev reward granted)');
  reward();
}

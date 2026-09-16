import { audio } from './audio/audio';

/**
 * CrazyGames SDK v3 Wrapper
 * Fully compliant with CrazyGames QA requirements:
 * - loadingStart / loadingStop lifecycle
 * - 180s midgame ad cooldown & 60s initial grace period
 * - Audio mute / unmute during ad display
 * - 30s timeout fallback to avoid soft-locks
 * - Adblock detection
 */

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        init: () => Promise<void>;
        game: {
          loadingStart: () => void;
          loadingStop: () => void;
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
          hasAdblock?: () => Promise<boolean>;
        };
        data?: {
          getItem: (key: string) => Promise<string | null>;
          setItem: (key: string, value: string) => Promise<void>;
        };
        user?: {
          getUser: () => Promise<{ username?: string; id?: string } | null>;
        };
      };
    };
  }
}

const MIDGAME_COOLDOWN_MS = 180_000;
const INITIAL_GRACE_PERIOD_MS = 60_000;
const AD_TIMEOUT_MS = 30_000;

let gameStartTime = Date.now();
let lastMidgameAdTime = 0;
let adblockDetected = false;

export async function initCrazyGames(): Promise<void> {
  if (typeof window === 'undefined') return;
  gameStartTime = Date.now();
  if (window.CrazyGames?.SDK) {
    try {
      await window.CrazyGames.SDK.init();
      console.log('[CrazyGames] SDK v3 initialized');
      if (window.CrazyGames.SDK.ad?.hasAdblock) {
        try {
          adblockDetected = await window.CrazyGames.SDK.ad.hasAdblock();
          console.log('[CrazyGames] Adblock status:', adblockDetected);
        } catch {
          // ignore adblock check error
        }
      }
    } catch (err) {
      console.warn('[CrazyGames] SDK init skipped (local/dev mode):', err);
    }
  } else {
    console.log('[CrazyGames] Running in standalone / dev mode (Mock SDK active)');
  }
}

export function crazyLoadingStart(): void {
  try {
    if (window.CrazyGames?.SDK?.game?.loadingStart) {
      window.CrazyGames.SDK.game.loadingStart();
      console.log('[CrazyGames] loadingStart fired');
    }
  } catch (e) {
    console.warn(e);
  }
}

export function crazyLoadingStop(): void {
  try {
    if (window.CrazyGames?.SDK?.game?.loadingStop) {
      window.CrazyGames.SDK.game.loadingStop();
      console.log('[CrazyGames] loadingStop fired');
    }
  } catch (e) {
    console.warn(e);
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

export function crazyHasAdblock(): boolean {
  return adblockDetected;
}

export function crazyShowMidgameAd(onComplete?: () => void): void {
  const now = Date.now();
  // Comply with CrazyGames QA policy: initial grace period + minimum interval
  if (now - gameStartTime < INITIAL_GRACE_PERIOD_MS) {
    console.log('[CrazyGames] Skipping midgame ad: within initial grace period');
    onComplete?.();
    return;
  }
  if (now - lastMidgameAdTime < MIDGAME_COOLDOWN_MS) {
    console.log('[CrazyGames] Skipping midgame ad: cooldown active');
    onComplete?.();
    return;
  }

  let settled = false;
  let timer: number | undefined;
  let wasMuted = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    lastMidgameAdTime = Date.now();
    if (!wasMuted) audio.setMuted(false);
    onComplete?.();
  };

  try {
    if (window.CrazyGames?.SDK?.ad?.requestAd) {
      wasMuted = audio.isMuted();
      timer = window.setTimeout(() => {
        console.warn('[CrazyGames] Midgame ad timed out after 30s fallback');
        finish();
      }, AD_TIMEOUT_MS);

      window.CrazyGames.SDK.ad.requestAd('midgame', {
        adStarted: () => {
          console.log('[CrazyGames] Midgame ad started');
          audio.setMuted(true);
        },
        adFinished: () => {
          console.log('[CrazyGames] Midgame ad finished');
          finish();
        },
        adError: (err) => {
          console.warn('[CrazyGames] Midgame ad error:', err);
          finish();
        },
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
  let timer: number | undefined;
  let wasMuted = false;

  const reward = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (!wasMuted) audio.setMuted(false);
    onReward();
  };

  const fail = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (!wasMuted) audio.setMuted(false);
    onError?.();
  };

  try {
    if (window.CrazyGames?.SDK?.ad?.requestAd) {
      wasMuted = audio.isMuted();
      timer = window.setTimeout(() => {
        console.warn('[CrazyGames] Rewarded ad timed out after 30s');
        fail();
      }, AD_TIMEOUT_MS);

      window.CrazyGames.SDK.ad.requestAd('rewarded', {
        adStarted: () => {
          console.log('[CrazyGames] Rewarded ad started');
          audio.setMuted(true);
        },
        adFinished: () => {
          console.log('[CrazyGames] Rewarded ad completed! Granting reward.');
          reward();
        },
        adError: (err) => {
          console.warn('[CrazyGames] Rewarded ad error / adblocked:', err);
          adblockDetected = true;
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

export async function crazySaveData(key: string, value: string): Promise<void> {
  try {
    if (window.CrazyGames?.SDK?.data?.setItem) {
      await window.CrazyGames.SDK.data.setItem(key, value);
      console.log('[CrazyGames] Cloud data saved for key:', key);
    }
  } catch (e) {
    console.warn('[CrazyGames] Data save error:', e);
  }
}

export async function crazyLoadData(key: string): Promise<string | null> {
  try {
    if (window.CrazyGames?.SDK?.data?.getItem) {
      const val = await window.CrazyGames.SDK.data.getItem(key);
      console.log('[CrazyGames] Cloud data loaded for key:', key);
      return val;
    }
  } catch (e) {
    console.warn('[CrazyGames] Data load error:', e);
  }
  return null;
}

export async function crazyGetUser(): Promise<{ username?: string; id?: string } | null> {
  try {
    if (window.CrazyGames?.SDK?.user?.getUser) {
      return await window.CrazyGames.SDK.user.getUser();
    }
  } catch (e) {
    console.warn('[CrazyGames] User fetch error:', e);
  }
  return null;
}

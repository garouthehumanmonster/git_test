import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initCrazyGames,
  crazyLoadingStart,
  crazyLoadingStop,
  crazyGameplayStart,
  crazyGameplayStop,
  crazyHappytime,
  crazyShowMidgameAd,
  crazyShowRewardedAd,
  crazySaveData,
  crazyLoadData,
} from '../src/crazygames';
import { audio } from '../src/audio/audio';
import { loadProgress, saveProgress, setProgressStore, CAMPAIGN_STORAGE_KEY } from '../src/campaign';

if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('CrazyGames SDK QA Audit (crazygames.test.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).CrazyGames;
  });

  describe('1. SDK Missing / Headless Fallback', () => {
    it('initializes cleanly without errors when SDK is absent', async () => {
      await expect(initCrazyGames()).resolves.toBeUndefined();
    });

    it('safely handles lifecycle calls when SDK is undefined', () => {
      expect(() => {
        crazyLoadingStart();
        crazyLoadingStop();
        crazyGameplayStart();
        crazyGameplayStop();
        crazyHappytime();
      }).not.toThrow();
    });

    it('resumes immediately on midgame ad request when SDK is absent', () => {
      const onComplete = vi.fn();
      crazyShowMidgameAd(onComplete);
      expect(onComplete).toHaveBeenCalled();
    });

    it('grants reward in dev/standalone mode when SDK is absent', () => {
      const onReward = vi.fn();
      const onError = vi.fn();
      crazyShowRewardedAd(onReward, onError);
      expect(onReward).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('cloud storage safely returns null and does not throw', async () => {
      await expect(crazySaveData('test_key', 'value')).resolves.toBeUndefined();
      const loaded = await crazyLoadData('test_key');
      expect(loaded).toBeNull();
    });
  });

  describe('2. Ad Rejection & Error Handling', () => {
    it('handles ad rejection without soft-locking', () => {
      const onError = vi.fn();
      const onReward = vi.fn();

      (window as any).CrazyGames = {
        SDK: {
          ad: {
            requestAd: vi.fn((type, callbacks) => {
              callbacks?.adStarted?.();
              callbacks?.adError?.(new Error('No fill / rejected'));
            }),
          },
        },
      };

      crazyShowRewardedAd(onReward, onError);

      expect(onReward).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('clears timeout and avoids duplicate callbacks', () => {
      vi.useFakeTimers();
      const onReward = vi.fn();
      const onError = vi.fn();

      let capturedCallbacks: any;
      (window as any).CrazyGames = {
        SDK: {
          ad: {
            requestAd: vi.fn((type, callbacks) => {
              capturedCallbacks = callbacks;
            }),
          },
        },
      };

      crazyShowRewardedAd(onReward, onError);

      capturedCallbacks.adStarted?.();
      capturedCallbacks.adFinished?.();

      // Fast-forward past timeout to ensure timeout does not fire duplicate callback
      vi.advanceTimersByTime(35_000);

      expect(onReward).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('3. Audio Mute & Restoration', () => {
    it('restores audio to unmuted if it was unmuted before ad', () => {
      audio.setMuted(false);
      expect(audio.isMuted()).toBe(false);

      (window as any).CrazyGames = {
        SDK: {
          ad: {
            requestAd: vi.fn((type, callbacks) => {
              callbacks?.adStarted?.();
              expect(audio.isMuted()).toBe(true);
              callbacks?.adFinished?.();
            }),
          },
        },
      };

      crazyShowRewardedAd(() => {}, () => {});
      expect(audio.isMuted()).toBe(false);
    });

    it('keeps audio muted after ad if it was originally muted', () => {
      audio.setMuted(true);
      expect(audio.isMuted()).toBe(true);

      (window as any).CrazyGames = {
        SDK: {
          ad: {
            requestAd: vi.fn((type, callbacks) => {
              callbacks?.adStarted?.();
              expect(audio.isMuted()).toBe(true);
              callbacks?.adFinished?.();
            }),
          },
        },
      };

      crazyShowRewardedAd(() => {}, () => {});
      expect(audio.isMuted()).toBe(true);
    });

    it('restores audio if ad errors during playback', () => {
      audio.setMuted(false);

      (window as any).CrazyGames = {
        SDK: {
          ad: {
            requestAd: vi.fn((type, callbacks) => {
              callbacks?.adStarted?.();
              expect(audio.isMuted()).toBe(true);
              callbacks?.adError?.('playback failure');
            }),
          },
        },
      };

      crazyShowRewardedAd(() => {}, () => {});
      expect(audio.isMuted()).toBe(false);
    });
  });

  describe('4. Cloud & Local Data Sanitization', () => {
    it('sanitizes corrupt or partial cloud JSON safely', () => {
      const mockStorage = new Map<string, string>();
      setProgressStore({
        getItem: (k) => mockStorage.get(k) ?? null,
        setItem: (k, v) => { mockStorage.set(k, v); },
        removeItem: (k) => { mockStorage.delete(k); },
      });

      // Completely broken json
      mockStorage.set(CAMPAIGN_STORAGE_KEY, '{invalid json');
      const corrupted = loadProgress();
      expect(corrupted.unlocked).toBe(1);
      expect(corrupted.stars).toEqual({});

      // Malformed shape
      mockStorage.set(CAMPAIGN_STORAGE_KEY, JSON.stringify({ unlocked: -5, stars: 'invalid' }));
      const badShape = loadProgress();
      expect(badShape.unlocked).toBe(1);
      expect(badShape.stars).toEqual({});

      // Valid shape preserves correctly
      mockStorage.set(
        CAMPAIGN_STORAGE_KEY,
        JSON.stringify({ unlocked: 3, stars: { 1: 3, 2: 2 } })
      );
      const valid = loadProgress();
      expect(valid.unlocked).toBe(3);
      expect(valid.stars[1]).toBe(3);
      expect(valid.stars[2]).toBe(2);

      setProgressStore(null);
    });
  });
});

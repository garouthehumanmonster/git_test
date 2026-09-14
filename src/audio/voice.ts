/**
 * Voice Announcer System
 * Plays generated audio voice files with Web Speech API fallback.
 */
import { audio } from './audio';

export type VoiceLine =
  | 'battle_begins'
  | 'stone_age'
  | 'medieval_age'
  | 'modern_age'
  | 'victory'
  | 'defeat'
  | 'reinforcements'
  | 'base_low';

const VOICE_TEXT: Record<VoiceLine, string> = {
  battle_begins: 'Battle begins!',
  stone_age: 'Stone age!',
  medieval_age: 'Medieval age!',
  modern_age: 'Modern age!',
  victory: 'Victory! Enemy base destroyed!',
  defeat: 'Defeat! Your base has fallen!',
  reinforcements: 'Reinforcements incoming!',
  base_low: 'Warning! Base under attack!',
};

class VoiceAnnouncer {
  private lastSpoken: Map<VoiceLine, number> = new Map();
  private audioCache: Map<VoiceLine, HTMLAudioElement> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      for (const line of Object.keys(VOICE_TEXT) as VoiceLine[]) {
        try {
          const a = new Audio(`${import.meta.env.BASE_URL}voice/${line}.wav`);
          a.volume = 0.95;
          this.audioCache.set(line, a);
        } catch {
          // Ignore
        }
      }
    }
  }

  play(line: VoiceLine, minIntervalMs = 3500): void {
    if (typeof window === 'undefined') return;
    if (audio.isMuted()) return;

    const now = performance.now();
    const last = this.lastSpoken.get(line) ?? 0;
    if (now - last < minIntervalMs) return;
    this.lastSpoken.set(line, now);

    const sound = this.audioCache.get(line);
    if (sound) {
      sound.currentTime = 0;
      audio.playVoice(sound).catch(() => {
        this.speakSynthesis(VOICE_TEXT[line]);
      });
    } else {
      this.speakSynthesis(VOICE_TEXT[line]);
    }
  }

  private speakSynthesis(text: string): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && !audio.isMuted()) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 0.9;
      utter.volume = 0.95;
      window.speechSynthesis.speak(utter);
    }
  }
}

export const voice = new VoiceAnnouncer();

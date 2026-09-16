/**
 * Announcer voice lines.
 *
 * `public/voice/*.mp3` is a studio-quality AI narration pack — one consistent
 * speaker for the whole game, replacing the robotic OS text-to-speech WAVs the
 * project shipped first. Every line still runs through the arcade radio chain in
 * `audio.playVoice` (300Hz HPF / 3.4kHz LPF / 12-bit crush / age-synced reverb),
 * and the bus obeys the master mute, so `M` silences music, effects and voice
 * together.
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
  | 'base_low'
  | 'turret_online'
  | 'collapse';

/** Spoken text, also the script used to regenerate the pack. */
const VOICE_TEXT: Record<VoiceLine, string> = {
  battle_begins: 'Battle begins!',
  stone_age: 'Stone age!',
  medieval_age: 'Medieval age!',
  modern_age: 'Modern age!',
  victory: 'Victory! Enemy base destroyed!',
  defeat: 'Defeat! Your base has fallen!',
  reinforcements: 'Reinforcements incoming!',
  base_low: 'Warning! Base under attack!',
  turret_online: 'Turret online!',
  collapse: 'Timeline collapse! Both bases are decaying. Finish it!',
};

class VoiceAnnouncer {
  private lastSpoken: Map<VoiceLine, number> = new Map();
  private audioCache: Map<VoiceLine, HTMLAudioElement> = new Map();

  constructor() {
    if (typeof window === 'undefined') return;
    for (const line of Object.keys(VOICE_TEXT) as VoiceLine[]) {
      try {
        const a = new Audio(`${import.meta.env.BASE_URL}voice/${line}.mp3`);
        a.preload = 'auto';
        a.volume = 1;
        this.audioCache.set(line, a);
      } catch {
        // Ignore: a missing clip only costs the callout, never the match.
      }
    }
  }

  private voiceMuted = false;

  setVoiceMuted(m: boolean): void { this.voiceMuted = m; }
  toggleVoice(): boolean { this.voiceMuted = !this.voiceMuted; return this.voiceMuted; }
  isMuted(): boolean { return this.voiceMuted || audio.isMuted(); }

  play(line: VoiceLine, minIntervalMs = 3500): void {
    if (typeof window === 'undefined') return;
    if (this.isMuted()) return;

    const now = performance.now();
    const last = this.lastSpoken.get(line) ?? 0;
    if (now - last < minIntervalMs) return;
    this.lastSpoken.set(line, now);

    const sound = this.audioCache.get(line);
    if (sound) {
      sound.currentTime = 0;
      // Only the "asset could not be decoded or fetched at all" case reaches the
      // fallback; the narration pack above is the intended voice.
      audio.playVoice(sound).catch(() => this.speakSynthesis(VOICE_TEXT[line]));
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

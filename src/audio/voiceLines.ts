/**
 * The announcer script, as pure data.
 *
 * Split out of `voice.ts` for the same reason `patterns.ts` exists: the part
 * that can be checked without a browser or an AudioContext lives here, so a
 * test can hold the registry against the files actually on disk.
 *
 * `public/voice/*.mp3` is an AI narration pack with one consistent speaker.
 * Two of the twelve lines were written into the script after the pack was
 * recorded and have no clip yet; they are listed in `SYNTHESISED_VOICE_LINES`
 * so the fallback is a decision on the record rather than a 404 that happens to
 * reject at play time.
 */

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
  | 'collapse'
  | 'war_cry'
  | 'chrono_surge';

/** Spoken text, also the script used to regenerate the pack. */
export const VOICE_TEXT: Record<VoiceLine, string> = {
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
  war_cry: 'War cry! All units charge!',
  chrono_surge: 'Chrono surge! Time accelerates!',
};

/** Every line the announcer knows, in script order. */
export const VOICE_LINES: readonly VoiceLine[] = Object.keys(VOICE_TEXT) as VoiceLine[];

/** Filename a line is recorded to, relative to `public/voice/`. */
export function voiceClipFile(line: VoiceLine): string {
  return `${line}.mp3`;
}

/**
 * Lines with a narrated MP3 in `public/voice/`.
 *
 * `test/audio/voice.test.ts` reads that directory and fails if this list and the
 * files on disk disagree in either direction — so adding a clip without
 * listing it, or shipping a listed clip that is missing, both break the build.
 */
export const NARRATED_VOICE_LINES: readonly VoiceLine[] = [
  'battle_begins',
  'stone_age',
  'medieval_age',
  'modern_age',
  'victory',
  'defeat',
  'reinforcements',
  'base_low',
  'turret_online',
  'collapse',
];

const NARRATED: ReadonlySet<VoiceLine> = new Set(NARRATED_VOICE_LINES);

/** How a line will actually be heard. */
export type VoiceSource = 'clip' | 'synthesis';

export function voiceLineSource(line: VoiceLine): VoiceSource {
  return NARRATED.has(line) ? 'clip' : 'synthesis';
}

/** Lines that currently fall back to browser speech synthesis. */
export function synthesisedVoiceLines(): VoiceLine[] {
  return VOICE_LINES.filter((line) => voiceLineSource(line) === 'synthesis');
}

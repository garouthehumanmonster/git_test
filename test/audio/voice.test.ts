import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  NARRATED_VOICE_LINES,
  VOICE_LINES,
  VOICE_TEXT,
  synthesisedVoiceLines,
  voiceClipFile,
  voiceLineSource,
} from '../../src/audio/voiceLines';

/** The clips that actually ship, read off disk. */
function clipsOnDisk(): string[] {
  const dir = fileURLToPath(new URL('../../public/voice', import.meta.url));
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mp3'))
    .sort();
}

describe('announcer script', () => {
  it('gives every line something to say', () => {
    expect(VOICE_LINES.length).toBe(12);
    for (const line of VOICE_LINES) {
      expect(VOICE_TEXT[line], `${line} has narration text`).toBeTruthy();
    }
  });

  it('names one clip file per line', () => {
    expect(voiceClipFile('war_cry')).toBe('war_cry.mp3');
    const files = VOICE_LINES.map(voiceClipFile);
    expect(new Set(files).size).toBe(VOICE_LINES.length);
  });
});

describe('narration pack on disk', () => {
  it('matches the registry exactly, in both directions', () => {
    const listed = NARRATED_VOICE_LINES.map(voiceClipFile).sort();
    const onDisk = clipsOnDisk();

    // A clip added to public/voice/ without being listed would never play;
    // a listed clip that is missing would 404 at runtime.
    expect(listed).toEqual(onDisk);
  });

  it('routes unrecorded lines to speech synthesis instead of a dead request', () => {
    expect(voiceLineSource('victory')).toBe('clip');
    expect(voiceLineSource('war_cry')).toBe('synthesis');
    expect(voiceLineSource('chrono_surge')).toBe('synthesis');

    const fallbacks = synthesisedVoiceLines();
    expect(fallbacks).toEqual(['war_cry', 'chrono_surge']);
    // Recording them is the fix; this assertion is what makes that visible.
    expect(fallbacks.length).toBe(VOICE_LINES.length - NARRATED_VOICE_LINES.length);
  });

  it('never lists a line twice', () => {
    expect(new Set(NARRATED_VOICE_LINES).size).toBe(NARRATED_VOICE_LINES.length);
    for (const line of NARRATED_VOICE_LINES) {
      expect(VOICE_LINES).toContain(line);
    }
  });
});

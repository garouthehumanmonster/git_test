import { describe, expect, it } from 'vitest';
import {
  MUSIC_PATTERNS, BAR_STEPS, PHRASE_BARS,
  pitchClassOf, triadIntervals, triadPitchClasses, semitonesAbove,
  type AgeKey,
} from '../../src/audio/patterns';

/**
 * The soundtrack is generated, so the failure mode nobody hears until it is
 * already shipping is a melody that wanders out of its own key. The stone lead
 * used to run Bb3 and Eb4 over an A-minor bassline — a flat second and a flat
 * fifth against the root — which reads as simply "wrong" without any single
 * note being unplayable. These tests pin every voice to the scale its age
 * declares.
 */

const AGES: AgeKey[] = ['stone', 'medieval', 'modern'];
const VOICES = ['bass', 'lead', 'arp'] as const;

/** Pitch class of a step, e.g. 'Bb1' -> 'Bb', 'F#2' -> 'F#'. */
function pitchClass(step: string): string | null {
  const m = step.match(/^([A-G])([#b]?)(-?\d+)$/);
  return m ? m[1]! + (m[2] ?? '') : null;
}

describe('music patterns', () => {
  it('keeps every pitched note inside its age scale', () => {
    const offenders: string[] = [];
    for (const age of AGES) {
      const pat = MUSIC_PATTERNS[age];
      for (const voice of VOICES) {
        pat[voice].forEach((row, r) => {
          row.forEach((step, i) => {
            if (step === 'r') return;
            const pc = pitchClass(step);
            if (pc === null) {
              offenders.push(`${age}.${voice}[${r}][${i}] = '${step}' (unparseable)`);
            } else if (!pat.scale.includes(pc)) {
              offenders.push(`${age}.${voice}[${r}][${i}] = '${step}' (${pc} not in ${pat.scale.join(' ')})`);
            }
          });
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('names the specific out-of-key notes that used to ship', () => {
    // Regression guard: A-minor stone must never contain Bb or Eb again.
    const stone = MUSIC_PATTERNS.stone;
    const allStone = [...stone.bass, ...stone.lead, ...stone.arp].flat();
    expect(allStone.some((s) => s.startsWith('Bb'))).toBe(false);
    expect(allStone.some((s) => s.startsWith('Eb'))).toBe(false);
    // D-minor medieval must not mix in F# (major third) against its Bb.
    const medieval = MUSIC_PATTERNS.medieval;
    const allMedieval = [...medieval.bass, ...medieval.lead, ...medieval.arp].flat();
    expect(allMedieval.some((s) => s.startsWith('F#'))).toBe(false);
  });

  it('gives every voice a full four-bar phrase of 16-step bars', () => {
    for (const age of AGES) {
      const pat = MUSIC_PATTERNS[age];
      for (const voice of [...VOICES, 'drums'] as const) {
        expect(pat[voice].length, `${age}.${voice} bar count`).toBe(PHRASE_BARS);
        pat[voice].forEach((row, r) => {
          expect(row.length, `${age}.${voice}[${r}] length`).toBe(BAR_STEPS);
        });
      }
    }
  });

  it('only uses playable drum glyphs', () => {
    const allowed = new Set(['K', 'S', 'H', 'r']);
    for (const age of AGES) {
      for (const row of MUSIC_PATTERNS[age].drums) {
        for (const step of row) expect(allowed.has(step)).toBe(true);
      }
    }
  });

  it('keeps the stone age without an arpeggio, and the others with one', () => {
    expect(MUSIC_PATTERNS.stone.arp.flat().every((s) => s === 'r')).toBe(true);
    for (const age of ['medieval', 'modern'] as const) {
      expect(MUSIC_PATTERNS[age].arp.flat().some((s) => s !== 'r')).toBe(true);
    }
  });

  it('keeps the phrase distinct bar to bar, so it does not audibly loop', () => {
    for (const age of AGES) {
      const pat = MUSIC_PATTERNS[age];
      const bassRows = pat.bass.map((r) => r.join(','));
      expect(new Set(bassRows).size, `${age} bass rows are not all identical`).toBeGreaterThan(1);
      const leadRows = pat.lead.map((r) => r.join(','));
      expect(new Set(leadRows).size, `${age} lead rows are not all identical`).toBeGreaterThan(1);
    }
  });

  it('stays in a playable tempo range per age', () => {
    for (const age of AGES) {
      const bpm = MUSIC_PATTERNS[age].bpm;
      expect(bpm).toBeGreaterThan(80);
      expect(bpm).toBeLessThan(180);
    }
  });
});

describe('pad triad', () => {
  it('builds a three-note chord, not a bare root and fifth', () => {
    for (const age of AGES) {
      const pat = MUSIC_PATTERNS[age];
      for (const row of pat.bass) {
        for (const step of row) {
          if (step === 'r') continue;
          const pc = pitchClassOf(step);
          expect(pc, step).not.toBeNull();
          const chord = triadIntervals(pc!, pat.scale);
          expect(chord.length, `${age} pad on ${step}`).toBe(3);
          expect(chord[0]).toBe(1);
        }
      }
    }
  });

  it('takes the third and fifth from the age scale, so the pad cannot leave the key', () => {
    const offenders: string[] = [];
    for (const age of AGES) {
      const pat = MUSIC_PATTERNS[age];
      for (const row of pat.bass) {
        for (const step of row) {
          if (step === 'r') continue;
          const pc = pitchClassOf(step)!;
          for (const member of triadPitchClasses(pc, pat.scale)) {
            if (!pat.scale.includes(member)) {
              offenders.push(`${age}: pad on ${step} contains ${member}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives A minor a real minor third, and D minor the same', () => {
    // A -> C is three semitones; the old hard-coded 1.5 was a perfect fifth
    // standing in for a third, which is what made the pad sound hollow.
    const aMinor = triadPitchClasses('A', MUSIC_PATTERNS.stone.scale);
    expect(aMinor).toEqual(['A', 'C', 'E']);
    expect(semitonesAbove('A', 'C')).toBe(3);
    const dMinor = triadPitchClasses('D', MUSIC_PATTERNS.medieval.scale);
    expect(dMinor).toEqual(['D', 'F', 'A']);
    const eMinor = triadPitchClasses('E', MUSIC_PATTERNS.modern.scale);
    expect(eMinor).toEqual(['E', 'G', 'B']);
  });

  it('still produces a usable chord for a root outside the scale', () => {
    const fallback = triadIntervals('C#', MUSIC_PATTERNS.stone.scale);
    expect(fallback).toEqual([1, 1.5, 2]);
  });
});

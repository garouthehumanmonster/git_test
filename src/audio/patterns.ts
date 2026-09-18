/**
 * patterns.ts — the musical content of the adaptive soundtrack, kept as pure
 * data so it can be checked without a browser or an AudioContext.
 *
 * Each age is written in ONE key and every note in every row must belong to
 * that key's scale. `test/audio/music.test.ts` enforces that, because a
 * melody that wanders out of key against its own bassline is the single most
 * reliable way to make a generated soundtrack sound wrong.
 *
 * Rows are 16-step bars (four sixteenth notes per beat) and there are four of
 * them per voice, so a phrase is four bars rather than two.
 */

export type AgeKey = 'stone' | 'medieval' | 'modern';

/** `'r'` is a rest; anything else is parsed by `noteToFreq`. */
export type Step = string;

export interface AgePattern {
  bpm: number;
  /** Pitch classes (no octave) permitted in this age. */
  scale: string[];
  bass: Step[][];
  lead: Step[][];
  arp: Step[][];
  drums: Step[][];
  waveBass: OscillatorType;
  waveLead: OscillatorType;
  wavePad: OscillatorType;
}

/** Steps in one bar. */
export const BAR_STEPS = 16;

/**
 * Bars per phrase. Every voice carries this many rows, which is what stops the
 * arrangement from audibly looping every couple of seconds.
 */
export const PHRASE_BARS = 4;

export const MUSIC_PATTERNS: Record<AgeKey, AgePattern> = {
  // A natural minor: A B C D E F G. Sparse and primal — no arpeggio at all.
  stone: {
    bpm: 108,
    scale: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    waveBass: 'triangle',
    waveLead: 'square',
    wavePad: 'sawtooth',
    bass: [
      ['A1', 'r', 'r', 'A1', 'E2', 'r', 'A1', 'r', 'G1', 'r', 'r', 'G1', 'D2', 'r', 'G1', 'r'],
      ['A1', 'r', 'E2', 'r', 'A1', 'r', 'E2', 'A1', 'G1', 'r', 'D2', 'r', 'G1', 'r', 'D2', 'G1'],
      ['F1', 'r', 'r', 'F1', 'C2', 'r', 'F1', 'r', 'G1', 'r', 'r', 'G1', 'D2', 'r', 'G1', 'r'],
      ['A1', 'r', 'A1', 'r', 'E2', 'r', 'A1', 'r', 'G1', 'r', 'G1', 'r', 'E2', 'r', 'A1', 'r'],
    ],
    lead: [
      ['r', 'A3', 'C4', 'r', 'E4', 'r', 'C4', 'A3', 'r', 'G3', 'A3', 'r', 'C4', 'E4', 'r', 'r'],
      ['r', 'D4', 'E4', 'G4', 'r', 'E4', 'D4', 'C4', 'A3', 'r', 'C4', 'D4', 'r', 'E4', 'G4', 'A4'],
      ['r', 'C4', 'D4', 'r', 'E4', 'G4', 'r', 'E4', 'D4', 'C4', 'r', 'A3', 'C4', 'r', 'D4', 'r'],
      ['E4', 'r', 'G4', 'E4', 'r', 'D4', 'C4', 'r', 'A3', 'r', 'C4', 'D4', 'E4', 'r', 'C4', 'r'],
    ],
    // Deliberately silent: the stone age earns its space from bass and drums.
    arp: [
      ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
      ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
      ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
      ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    ],
    drums: [
      ['K', 'r', 'r', 'r', 'K', 'r', 'H', 'r', 'K', 'r', 'r', 'K', 'r', 'H', 'K', 'H'],
      ['K', 'r', 'H', 'r', 'K', 'H', 'K', 'H', 'K', 'r', 'H', 'K', 'S', 'H', 'K', 'H'],
      ['K', 'r', 'r', 'K', 'H', 'r', 'K', 'r', 'K', 'H', 'r', 'K', 'r', 'H', 'S', 'H'],
      ['K', 'r', 'H', 'r', 'K', 'H', 'K', 'H', 'K', 'r', 'K', 'H', 'S', 'H', 'K', 'K'],
    ],
  },

  // D natural minor: D E F G A Bb C.
  medieval: {
    bpm: 126,
    scale: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C'],
    waveBass: 'triangle',
    waveLead: 'square',
    wavePad: 'triangle',
    bass: [
      ['D2', 'r', 'A2', 'r', 'D2', 'r', 'A2', 'r', 'G2', 'r', 'D2', 'r', 'G2', 'r', 'A2', 'r'],
      ['D2', 'r', 'A2', 'F2', 'G2', 'r', 'D2', 'r', 'Bb1', 'r', 'F2', 'r', 'A2', 'r', 'D2', 'A2'],
      ['C2', 'r', 'G2', 'r', 'C2', 'r', 'G2', 'r', 'Bb1', 'r', 'F2', 'r', 'Bb1', 'r', 'C2', 'r'],
      ['D2', 'r', 'A2', 'r', 'D2', 'r', 'F2', 'r', 'G2', 'r', 'A2', 'r', 'D2', 'r', 'D2', 'r'],
    ],
    lead: [
      ['r', 'D4', 'F4', 'A4', 'r', 'A4', 'F4', 'D4', 'r', 'C4', 'F4', 'A4', 'r', 'Bb4', 'A4', 'F4'],
      ['F4', 'r', 'A4', 'D5', 'r', 'A4', 'F4', 'D4', 'G4', 'r', 'Bb4', 'D5', 'r', 'A4', 'F4', 'D4'],
      ['r', 'C4', 'F4', 'r', 'A4', 'C5', 'r', 'A4', 'G4', 'F4', 'r', 'D4', 'F4', 'r', 'G4', 'r'],
      ['A4', 'r', 'F4', 'A4', 'r', 'D5', 'C5', 'r', 'Bb4', 'r', 'A4', 'G4', 'F4', 'r', 'D4', 'r'],
    ],
    arp: [
      ['D3', 'r', 'A3', 'r', 'F3', 'r', 'A3', 'r', 'G3', 'r', 'D3', 'r', 'Bb3', 'r', 'A3', 'r'],
      ['D3', 'F3', 'A3', 'D4', 'r', 'A3', 'F3', 'D3', 'C3', 'r', 'G3', 'C4', 'r', 'Bb3', 'A3', 'r'],
      ['C3', 'r', 'G3', 'r', 'Bb3', 'r', 'D4', 'r', 'F3', 'r', 'C4', 'r', 'A3', 'r', 'G3', 'r'],
      ['D3', 'A3', 'D4', 'F4', 'r', 'D4', 'A3', 'F3', 'G3', 'r', 'Bb3', 'D4', 'r', 'A3', 'r', 'D3'],
    ],
    drums: [
      ['K', 'r', 'H', 'r', 'K', 'H', 'K', 'H', 'K', 'r', 'H', 'r', 'S', 'H', 'K', 'H'],
      ['K', 'H', 'r', 'H', 'K', 'H', 'K', 'H', 'K', 'H', 'r', 'K', 'S', 'H', 'K', 'H'],
      ['K', 'r', 'H', 'r', 'K', 'r', 'H', 'H', 'K', 'H', 'K', 'r', 'S', 'H', 'K', 'H'],
      ['K', 'H', 'S', 'H', 'K', 'H', 'K', 'S', 'K', 'H', 'S', 'K', 'S', 'H', 'K', 'K'],
    ],
  },

  // E natural minor: E F# G A B C D.
  modern: {
    bpm: 148,
    scale: ['E', 'F#', 'G', 'A', 'B', 'C', 'D'],
    waveBass: 'sawtooth',
    waveLead: 'square',
    wavePad: 'sawtooth',
    bass: [
      ['E1', 'r', 'G1', 'r', 'B1', 'r', 'E2', 'r', 'A1', 'r', 'C2', 'r', 'E2', 'r', 'B1', 'r'],
      ['E1', 'B1', 'r', 'G1', 'B1', 'r', 'E2', 'B1', 'A1', 'E2', 'r', 'C2', 'E2', 'B1', 'r', 'G1'],
      ['C2', 'r', 'E2', 'r', 'G1', 'r', 'B1', 'r', 'A1', 'r', 'C2', 'r', 'E2', 'r', 'B1', 'r'],
      ['E1', 'r', 'B1', 'r', 'E2', 'r', 'G1', 'r', 'A1', 'r', 'E2', 'r', 'B1', 'r', 'E1', 'r'],
    ],
    lead: [
      ['r', 'E5', 'r', 'G5', 'r', 'B5', 'r', 'E6', 'r', 'G5', 'r', 'E5', 'r', 'B5', 'G5', 'E5'],
      ['B4', 'r', 'E5', 'G5', 'r', 'B5', 'E6', 'r', 'A5', 'r', 'G5', 'E5', 'r', 'B5', 'r', 'E5'],
      ['r', 'B4', 'E5', 'r', 'G5', 'B5', 'r', 'E6', 'D5', 'B4', 'r', 'G5', 'E5', 'r', 'B5', 'r'],
      ['E5', 'r', 'B5', 'G5', 'r', 'E5', 'D5', 'r', 'B4', 'r', 'E5', 'G5', 'B5', 'r', 'E6', 'r'],
    ],
    arp: [
      ['E3', 'G3', 'B3', 'E4', 'G3', 'B3', 'E4', 'G4', 'A3', 'C4', 'E4', 'A4', 'C4', 'E4', 'G4', 'B4'],
      ['E3', 'B3', 'G3', 'E4', 'B3', 'G3', 'E4', 'B4', 'A3', 'E4', 'C4', 'A4', 'E4', 'C4', 'B4', 'G4'],
      ['C3', 'E3', 'G3', 'C4', 'E3', 'G3', 'C4', 'E4', 'B3', 'D4', 'G4', 'B4', 'D4', 'G4', 'B4', 'G4'],
      ['A3', 'C4', 'E4', 'A4', 'C4', 'E4', 'A4', 'C5', 'E3', 'G3', 'B3', 'E4', 'G3', 'B3', 'E4', 'G4'],
    ],
    drums: [
      ['K', 'r', 'H', 'H', 'K', 'H', 'K', 'H', 'K', 'H', 'H', 'K', 'S', 'H', 'K', 'H'],
      ['K', 'H', 'S', 'H', 'K', 'H', 'K', 'S', 'K', 'H', 'S', 'K', 'S', 'H', 'K', 'H'],
      ['K', 'r', 'H', 'H', 'K', 'H', 'K', 'H', 'K', 'H', 'S', 'K', 'S', 'H', 'K', 'H'],
      ['K', 'H', 'S', 'H', 'K', 'H', 'K', 'S', 'K', 'H', 'S', 'K', 'S', 'H', 'K', 'K'],
    ],
  },
};

const PC_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Pitch class of a written note: 'Bb1' -> 'Bb'. */
export function pitchClassOf(note: string): string | null {
  const m = note.match(/^([A-G])([#b]?)/);
  return m ? m[1]! + (m[2] ?? '') : null;
}

/** Semitones from one pitch class up to another, always in 0..11. */
export function semitonesAbove(from: string, to: string): number {
  const a = PC_SEMITONES[from];
  const b = PC_SEMITONES[to];
  if (a === undefined || b === undefined) return 7;
  return ((b - a) % 12 + 12) % 12;
}

export function intervalRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/**
 * Frequency ratios of the diatonic triad above `rootPc`.
 *
 * The pad used to play a hard-coded [1, 1.5, 2] — root, perfect fifth, octave.
 * That has no third, so it reads as a hollow power chord sitting under a melody
 * that does have one. Taking the third and fifth from the age's own scale gives
 * a real chord (A minor becomes A-C-E, F becomes F-A-C) that cannot leave the
 * key, and makes the harmony follow the bassline instead of ignoring it.
 */
export function triadIntervals(rootPc: string, scale: string[]): number[] {
  const i = scale.indexOf(rootPc);
  if (i === -1) return [1, 1.5, 2];
  const third = scale[(i + 2) % scale.length]!;
  const fifth = scale[(i + 4) % scale.length]!;
  return [
    1,
    intervalRatio(semitonesAbove(rootPc, third)),
    intervalRatio(semitonesAbove(rootPc, fifth)),
  ];
}

/** Pitch classes of the triad above `rootPc`, for assertions. */
export function triadPitchClasses(rootPc: string, scale: string[]): string[] {
  const i = scale.indexOf(rootPc);
  if (i === -1) return [rootPc];
  return [rootPc, scale[(i + 2) % scale.length]!, scale[(i + 4) % scale.length]!];
}

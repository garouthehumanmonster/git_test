import { describe, it, expect } from 'vitest';
import { mulberry32, rngInt } from '../../src/sim/rng';

describe('mulberry32', () => {
  it('produces deterministic sequence from same seed', () => {
    const seed = 42;
    const a1 = mulberry32(seed);
    const a2 = mulberry32(a1.next);

    const b1 = mulberry32(seed);
    const b2 = mulberry32(b1.next);

    expect(a1.value).toBe(b1.value);
    expect(a2.value).toBe(b2.value);
  });

  it('returns values in [0, 1)', () => {
    let state = 12345;
    for (let i = 0; i < 100; i++) {
      const r = mulberry32(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      state = r.next;
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a.value).not.toBe(b.value);
  });
});

describe('rngInt', () => {
  it('returns integers in [min, max] inclusive', () => {
    let state = 99;
    for (let i = 0; i < 50; i++) {
      const r = rngInt(state, 1, 6);
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(6);
      expect(Number.isInteger(r.value)).toBe(true);
      state = r.next;
    }
  });
});

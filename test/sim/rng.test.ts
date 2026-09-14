import { describe, it, expect } from 'vitest';
import { mulberry32, rngInt, rngFloat, rngPick, rngWeighted, RNG } from '../../src/sim/rng';

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

describe('rngFloat', () => {
  it('returns floats in [min, max)', () => {
    let state = 5;
    for (let i = 0; i < 100; i++) {
      const r = rngFloat(state, -2, 3);
      expect(r.value).toBeGreaterThanOrEqual(-2);
      expect(r.value).toBeLessThan(3);
      state = r.next;
    }
  });
});

describe('rngPick', () => {
  it('returns an element from the array', () => {
    const arr = ['a', 'b', 'c'];
    let state = 42;
    for (let i = 0; i < 50; i++) {
      const r = rngPick(state, arr);
      expect(arr).toContain(r.value);
      state = r.next;
    }
  });
});

describe('rngWeighted', () => {
  it('always returns one of the entries', () => {
    const entries: ReadonlyArray<readonly [string, number]> = [
      ['a', 1], ['b', 2], ['c', 5],
    ];
    let state = 7;
    for (let i = 0; i < 200; i++) {
      const r = rngWeighted(state, entries);
      expect(['a', 'b', 'c']).toContain(r.value);
      state = r.next;
    }
  });

  it('with a zero-weight entry returns only non-zero entries', () => {
    const entries: ReadonlyArray<readonly [string, number]> = [
      ['a', 0], ['b', 0], ['c', 1],
    ];
    let state = 99;
    for (let i = 0; i < 50; i++) {
      const r = rngWeighted(state, entries);
      expect(r.value).toBe('c');
      state = r.next;
    }
  });
});

describe('RNG class', () => {
  it('advances on each next()', () => {
    const r = new RNG(42);
    const a = r.next();
    const b = r.next();
    expect(a).not.toBe(b);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });

  it('fork produces an independent child', () => {
    const r = new RNG(1);
    r.next(); r.next();
    const child = r.fork();
    expect(child.next()).toBeGreaterThanOrEqual(0);
  });
});

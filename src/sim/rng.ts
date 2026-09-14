// Mulberry32 — a tiny, deterministic, fast 32-bit PRNG.
// State is a single 32-bit integer which makes snapshots/replay trivial.
// Reference (public domain):
//   https://gist.github.com/tommyettinger/46a874533244883189143505d203312c

/**
 * Pure step: advance `state` by one and return a float in [0,1) together with
 * the new state. No mutation.
 */
export function mulberry32(state: number): { value: number; next: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** Integer in [min, max] inclusive (pure). */
export function rngInt(state: number, min: number, max: number): { value: number; next: number } {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`Invalid integer range: [${min}, ${max}]`);
  }
  const r = mulberry32(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), next: r.next };
}

/** Float in [min, max) (pure). */
export function rngFloat(state: number, min: number, max: number): { value: number; next: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new RangeError(`Invalid float range: [${min}, ${max})`);
  }
  const r = mulberry32(state);
  return { value: min + r.value * (max - min), next: r.next };
}

/** Pick a random element from a readonly array (pure). */
export function rngPick<T>(state: number, arr: readonly T[]): { value: T; next: number } {
  if (arr.length === 0) throw new RangeError('Cannot pick from an empty array');
  const r = rngInt(state, 0, arr.length - 1);
  return { value: arr[r.value]!, next: r.next };
}

/** Weighted pick from [item, weight] entries. Weights must be non-negative and sum > 0 (pure). */
export function rngWeighted<T>(
  state: number,
  entries: ReadonlyArray<readonly [T, number]>,
): { value: T; next: number } {
  if (entries.length === 0) throw new RangeError('Cannot pick from empty weighted entries');
  let total = 0;
  for (const [, w] of entries) {
    if (!Number.isFinite(w) || w < 0) throw new RangeError('Weights must be finite and non-negative');
    total += w;
  }
  if (total <= 0) throw new RangeError('Weighted entries must have a positive total weight');
  const rf = rngFloat(state, 0, total);
  let acc = 0;
  for (const [v, w] of entries) {
    acc += w;
    if (rf.value < acc) return { value: v, next: rf.next };
  }
  return { value: entries[entries.length - 1]![0], next: rf.next };
}

/**
 * Mutable convenience wrapper for the simulation loop.
 * Snapshot `rng.state` at any point to deterministically replay from there.
 */
export class RNG {
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Float in [0, 1). */
  next(): number {
    const r = mulberry32(this.state);
    this.state = r.next;
    return r.value;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    const r = rngInt(this.state, min, max);
    this.state = r.next;
    return r.value;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    const r = rngFloat(this.state, min, max);
    this.state = r.next;
    return r.value;
  }

  pick<T>(arr: readonly T[]): T {
    const r = rngPick(this.state, arr);
    this.state = r.next;
    return r.value;
  }

  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const r = rngWeighted(this.state, entries);
    this.state = r.next;
    return r.value;
  }

  /** Deterministically spawn a child RNG (decorrelated). */
  fork(): RNG {
    this.next();
    this.next();
    return new RNG(this.state);
  }
}

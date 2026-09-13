// Mulberry32 seeded PRNG — deterministic, fast, good distribution
// Returns next state + value in [0, 1)

export function mulberry32(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next: (state + 0x6d2b79f5) | 0 };
}

/** Advance state and return integer in [min, max] inclusive */
export function rngInt(
  state: number,
  min: number,
  max: number,
): { value: number; next: number } {
  const r = mulberry32(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), next: r.next };
}

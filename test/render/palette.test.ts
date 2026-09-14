import { describe, expect, it } from 'vitest';
import { AGE_PALETTES, OUTLINE, PIXEL_SCALE } from '../../src/render/palette';

describe('render palette contract', () => {
  it('keeps the authored texel scale and universal ink outline', () => {
    expect(PIXEL_SCALE).toBe(2);
    expect(OUTLINE).toBe(0x1a1528);
  });

  it('contains exactly the requested eight fill colours per age', () => {
    const expected = {
      stone: [0x171009, 0x2b1e12, 0x4d3720, 0x8a5a2c, 0xb08354, 0xd9a25e, 0xffe0b0, 0xf4c85b],
      medieval: [0x0a0f1f, 0x161d33, 0x2a3660, 0x425aa8, 0x7a8fcf, 0xffd166, 0xffe9b0, 0xd64a4a],
      modern: [0x050d12, 0x0a1a20, 0x123340, 0x16c0b3, 0x38fff0, 0xc8fff8, 0xffb648, 0xef5350],
    } as const;

    for (const age of Object.keys(expected) as Array<keyof typeof expected>) {
      expect(Object.values(AGE_PALETTES[age])).toEqual(expected[age]);
    }
  });
});

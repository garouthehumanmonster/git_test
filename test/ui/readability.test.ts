import { describe, expect, it } from 'vitest';
import { coalesceHits, HIT_MERGE_RADIUS } from '../../src/render/readability';

describe('combat float coalescing', () => {
  it('turns a melee clump into one number', () => {
    const groups = coalesceHits([
      { x: 400, y: 360, damage: 8, isCrit: false },
      { x: 408, y: 364, damage: 11, isCrit: false },
      { x: 412, y: 358, damage: 31, isCrit: true },
      { x: 406, y: 370, damage: 6, isCrit: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.hits).toBe(4);
    expect(groups[0]!.crits).toBe(1);
    expect(groups[0]!.text).toBe('CRIT -56');
    expect(groups[0]!.pop).toBe(true);
    // The 31-damage crit anchors the label, not the chip hits beside it.
    expect(groups[0]!.x).toBeGreaterThan(406);
    expect(groups[0]!.x).toBeLessThan(412);
  });

  it('keeps two exchanges on opposite sides of the lane apart', () => {
    const groups = coalesceHits([
      { x: 200, y: 360, damage: 10, isCrit: false },
      { x: 200 + HIT_MERGE_RADIUS + 8, y: 360, damage: 14, isCrit: false },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.text)).toEqual(['-10', '-14']);
  });

  it('merges a hit that lands exactly on the radius', () => {
    const groups = coalesceHits([
      { x: 0, y: 0, damage: 4, isCrit: false },
      { x: HIT_MERGE_RADIUS, y: 0, damage: 5, isCrit: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.text).toBe('-9');
  });

  it('pops a three-hit clump even when none of them crit', () => {
    const groups = coalesceHits([
      { x: 10, y: 10, damage: 2, isCrit: false },
      { x: 12, y: 11, damage: 2, isCrit: false },
      { x: 11, y: 12, damage: 2, isCrit: false },
    ]);
    expect(groups[0]!.pop).toBe(true);
    expect(groups[0]!.text).toBe('-6');
  });

  it('drops non-finite hits instead of poisoning the label', () => {
    const groups = coalesceHits([
      { x: Number.NaN, y: 10, damage: 9, isCrit: true },
      { x: 20, y: 20, damage: 7, isCrit: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.text).toBe('-7');
  });

  it('returns nothing for an empty frame', () => {
    expect(coalesceHits([])).toEqual([]);
  });
});

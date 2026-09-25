import { describe, expect, it } from 'vitest';
import {
  WALK_FRAME_COUNT,
  animFrameKey,
  attackFrameKey,
  attackProgress,
  combatFrameIndex,
  deathFrameKey,
  inStrikeWindow,
  isIllustratedPose,
  modelScreenHeight,
  walkFrameIndex,
} from '../../src/render/unitAnim';

describe('illustrated unit animation', () => {
  it('cycles four walk frames and stays in range', () => {
    const seen = new Set<number>();
    for (let tick = 0; tick < 80; tick++) {
      const frame = walkFrameIndex(tick, 0);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(WALK_FRAME_COUNT);
      seen.add(frame);
    }
    expect(seen.size).toBe(WALK_FRAME_COUNT);
  });

  it('is stable for the same tick and seed', () => {
    expect(walkFrameIndex(40, 17)).toBe(walkFrameIndex(40, 17));
  });

  it('maps a swing across the strip without running off the end', () => {
    expect(combatFrameIndex(0)).toBe(0);
    expect(combatFrameIndex(0.99)).toBe(3);
    expect(combatFrameIndex(1)).toBe(3);
    expect(combatFrameIndex(-1)).toBe(0);
  });

  it('names frames the boot scene can preload', () => {
    expect(animFrameKey('unit_stone_swarm_player', 2)).toBe('unit_stone_swarm_player_w2');
    expect(attackFrameKey('unit_stone_swarm_player')).toBe('unit_stone_swarm_player_atk');
  });

  it('treats the strike plate as illustrated, not a sticker', () => {
    expect(isIllustratedPose('unit_modern_tank_player_w0')).toBe(true);
    expect(isIllustratedPose('unit_modern_tank_player_atk')).toBe(true);
    expect(isIllustratedPose('unit_modern_tank_player_die')).toBe(true);
    expect(isIllustratedPose('unit_modern_tank_player')).toBe(false);
  });

  it('names the fallen plate from whichever pose was showing', () => {
    expect(deathFrameKey('unit_stone_swarm_player_w2')).toBe('unit_stone_swarm_player_die');
    expect(deathFrameKey('unit_medieval_tank_ai_atk')).toBe('unit_medieval_tank_ai_die');
    expect(deathFrameKey('unit_modern_ranged_player')).toBe('unit_modern_ranged_player_die');
  });

  it('holds the strike pose only across the hit window', () => {
    expect(attackProgress(75, 100)).toBeCloseTo(0.25);
    expect(inStrikeWindow(0.25)).toBe(false);
    expect(inStrikeWindow(0.26)).toBe(true);
    expect(inStrikeWindow(0.54)).toBe(true);
    expect(inStrikeWindow(0.55)).toBe(false);
    expect(inStrikeWindow(attackProgress(0, 40))).toBe(false);
  });

  it('keeps a person readable and a wide tank from filling the lane', () => {
    expect(modelScreenHeight('swarm', 199, 206)).toBe(104);
    expect(modelScreenHeight('tank', 229, 216)).toBe(112);
    expect(modelScreenHeight('tank', 511, 216)).toBe(78);
    expect(modelScreenHeight('ranged', 154, 196)).toBe(98);
  });
});

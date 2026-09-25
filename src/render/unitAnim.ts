import type { UnitRole } from '../sim/types';

/** Walk strips are four frames, foot-aligned, facing right. */
export const WALK_FRAME_COUNT = 4;

/**
 * Which walk frame to show. The phase matches the old procedural stride
 * (`ageTicks * 0.48`) so the dust puff and the drawing stay in step.
 */
export function walkFrameIndex(ageTicks: number, animSeed: number, frameCount = WALK_FRAME_COUNT): number {
  const cycle = Math.PI * 2;
  const phase = (ageTicks + animSeed * 0.001) * 0.48;
  const t = ((phase % cycle) + cycle) % cycle;
  const count = Math.max(1, frameCount);
  return Math.floor((t / cycle) * count) % count;
}

/**
 * Attack progress 0..1 mapped across the same four drawings, so a swing
 * moves through the raised weapon, the step, and the follow-through
 * instead of squash-stretching one sticker.
 */
export function combatFrameIndex(attackProgress: number, frameCount = WALK_FRAME_COUNT): number {
  const count = Math.max(1, frameCount);
  const p = Math.max(0, Math.min(0.999, attackProgress));
  return Math.floor(p * count) % count;
}

export function animFrameKey(baseKey: string, frame: number): string {
  return `${baseKey}_w${frame}`;
}

/**
 * The hit itself. Walk frames play on either side of this window; the
 * dedicated strike plate replaces them only while the swing connects.
 * Kept in step with the lunge and the attack FX in GameScene.
 */
export const STRIKE_START = 0.25;
export const STRIKE_END = 0.55;

export function attackProgress(cooldown: number, attackRate: number): number {
  return 1 - cooldown / Math.max(1, attackRate);
}

export function inStrikeWindow(progress: number): boolean {
  return progress > STRIKE_START && progress < STRIKE_END;
}

export function attackFrameKey(baseKey: string): string {
  return `${baseKey}_atk`;
}

/** Strip a walk, strike, or death suffix so the atlas key can be rebuilt. */
export function poseBaseKey(key: string): string {
  return key.replace(/_(?:w\d+|atk|die)$/, '');
}

export function deathFrameKey(fromKey: string): string {
  return `${poseBaseKey(fromKey)}_die`;
}

/**
 * Walk plates, the strike plate, and the fallen plate are illustrated
 * drawings. A bare atlas key is the procedural fallback. `_atk` and `_die`
 * must count: treating either as a sticker turns squash-and-stretch back on.
 */
export function isIllustratedPose(key: string): boolean {
  return /_w\d+$/.test(key) || key.endsWith('_atk') || key.endsWith('_die');
}

/**
 * How tall an illustrated model is on the 960x540 canvas.
 *
 * The procedural fallback is 56px because that is all a 28px pixel sprite
 * can be. These drawings have a face, a weapon and a gait, so they are
 * shown large enough to read, and still shorter than a 152px tower.
 * A wide vehicle (the modern tank) is capped by aspect so it doesn't
 * become a wall across the lane.
 */
export function modelScreenHeight(role: UnitRole, srcW: number, srcH: number): number {
  const aspect = srcW / Math.max(1, srcH);
  if (aspect > 1.75) return 78;
  if (role === 'tank') return 112;
  if (role === 'ranged') return 98;
  return 104;
}

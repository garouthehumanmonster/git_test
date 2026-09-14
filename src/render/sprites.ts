import type { Age, UnitRole } from '../sim/types';
import { paletteFor } from './palette';

// Logical texture dimensions. Renderer scales every one by PIXEL_SCALE (2),
// so a source texel always occupies exactly 2×2 canvas pixels.
export const ROLE_SIZES: Record<UnitRole, { w: number; h: number }> = {
  swarm: { w: 10, h: 14 },
  tank: { w: 16, h: 18 },
  ranged: { w: 12, h: 15 },
};

export function unitKey(age: Age | string, role: UnitRole | string): string {
  return `unit_${age}_${role}`;
}

export function ageTint(age: Age): number {
  return paletteFor(age).body;
}

import type { UnitRole } from '../sim/types';

export const ROLE_SIZES: Record<UnitRole, { w: number; h: number }> = {
  swarm: { w: 18, h: 20 },
  tank: { w: 32, h: 32 },
  ranged: { w: 22, h: 24 },
};

export function unitKey(age: string, role: string): string {
  return `unit_${age}_${role}`;
}

export function ageTint(age: string): number {
  switch (age) {
    case 'medieval': return 0xffffff;
    case 'modern':   return 0xc8fff8;
    default:         return 0xffeacc;
  }
}

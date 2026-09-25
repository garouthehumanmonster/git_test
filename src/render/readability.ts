/**
 * Render-only combat readability.
 *
 * A melee clump used to spawn one floating number, one hit sound and one
 * camera kick per damage event. Six clubbers swinging on the same tick painted
 * six "CRIT!" labels on top of each other and the fight became a yellow smear.
 * The simulation is not involved: this only decides how a frame of hit events
 * is shown.
 */

export interface HitFlash {
  x: number;
  y: number;
  damage: number;
  isCrit: boolean;
}

export interface CoalescedHit {
  x: number;
  y: number;
  damage: number;
  hits: number;
  crits: number;
  text: string;
  /** A crit, or a clump of three or more, pops instead of drifting quietly. */
  pop: boolean;
}

/** Hits closer than this (lane px) are one exchange, not six labels. */
export const HIT_MERGE_RADIUS = 28;

/**
 * Merge a frame of hit flashes into the numbers a player can actually read.
 *
 * Groups are damage-weighted so a heavy hit anchors the label, not the
 * chip-damage that landed beside it. Order is stable: the first hit of a
 * group decides which group later hits join, and groups stay in first-seen
 * order.
 */
export function coalesceHits(hits: readonly HitFlash[], radius = HIT_MERGE_RADIUS): CoalescedHit[] {
  const groups: CoalescedHit[] = [];
  const r2 = radius * radius;
  for (const hit of hits) {
    if (!Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.damage)) continue;
    const damage = Math.max(0, hit.damage);
    let group: CoalescedHit | undefined;
    for (const candidate of groups) {
      const dx = candidate.x - hit.x;
      const dy = candidate.y - hit.y;
      if (dx * dx + dy * dy <= r2) {
        group = candidate;
        break;
      }
    }
    if (!group) {
      groups.push({
        x: hit.x,
        y: hit.y,
        damage,
        hits: 1,
        crits: hit.isCrit ? 1 : 0,
        text: '',
        pop: false,
      });
      continue;
    }
    const next = group.damage + damage;
    // Keep the anchor put when both hits were 0, so a 0-damage clump doesn't NaN.
    if (next > 0) {
      group.x = (group.x * group.damage + hit.x * damage) / next;
      group.y = (group.y * group.damage + hit.y * damage) / next;
    }
    group.damage = next;
    group.hits += 1;
    if (hit.isCrit) group.crits += 1;
  }
  for (const group of groups) {
    const shown = Math.round(group.damage);
    group.pop = group.crits > 0 || group.hits >= 3;
    group.text = group.crits > 0 ? `CRIT -${shown}` : `-${shown}`;
  }
  return groups;
}

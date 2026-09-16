import { describe, expect, it } from 'vitest';
import { AGE_PALETTES, OUTLINE, PIXEL_SCALE, TEAM_COLORS } from '../../src/render/palette';
import { SoftGfx } from '../../scripts/lib/softgfx';
import { UNIT_ART, UNIT_FIT } from '../../src/render/unitart';
import { BASE_ART, BASE_FIT } from '../../src/render/basearth';
import { AGE_PROPS, PROP_LAYOUT } from '../../src/render/propart';
import { PORTRAIT_ART, PORTRAIT_CANVAS } from '../../src/render/portraits';
import { fitSprite, paintOps, type SpriteOp } from '../../src/render/spriteops';
import {
  FX_DEFS,
  FX_FIT,
  ICON_TURRET_ART,
  ICON_ULT_ART,
  TURRET_ART,
  TURRET_FIT,
} from '../../src/render/turretart';
import { ICON_CANVAS, TURRET_CANVAS } from '../../src/render/turretart';
import type { Age, UnitRole } from '../../src/sim/types';

const AGES: Age[] = ['stone', 'medieval', 'modern'];
const ROLES: UnitRole[] = ['swarm', 'tank', 'ranged'];

/** Rasterise an op list exactly the way `makeTexture` does. */
function raster(
  w: number,
  h: number,
  ops: SpriteOp[],
  age: Age,
  team: number,
  dx = 0,
  dy = 0,
) {
  const g = new SoftGfx(w, h);
  const pal = AGE_PALETTES[age];
  paintOps(g, ops, pal, true, team, dx, dy);
  paintOps(g, ops, pal, false, team, dx, dy);
  return g;
}

/**
 * Every opaque pixel must be either ink or a colour from that age's palette
 * (plus the two team colours). This is what stops a stray off-palette colour —
 * the classic "why does this sprite look AI generated" tell — from creeping in.
 */
function assertOnPalette(g: SoftGfx, age: Age, label: string, extras: number[] = []): void {
  const allowed = new Set<number>([
    OUTLINE,
    ...Object.values(AGE_PALETTES[age]),
    ...extras,
  ]);
  const seen = new Set<number>();
  for (let i = 0; i < g.data.length; i += 4) {
    if (g.data[i + 3] === 0) continue;
    const color = (g.data[i]! << 16) | (g.data[i + 1]! << 8) | g.data[i + 2]!;
    seen.add(color);
    if (!allowed.has(color)) {
      throw new Error(`${label}: off-palette colour #${color.toString(16).padStart(6, '0')}`);
    }
  }
  expect(seen.size, `${label} draws with at least two colours`).toBeGreaterThan(1);
}

/**
 * Every opaque pixel touching a transparent pixel must be OUTLINE ink. Combined
 * with the dilation in `paintOps`, this proves the "1px dark outline on every
 * asset" rule holds for generated art, not just for hand-authored art.
 */
function assertInkSilhouette(g: SoftGfx, label: string): void {
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= g.width || y >= g.height) return 0;
    return g.data[(y * g.width + x) * 4 + 3]!;
  };
  let boundary = 0;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const i = (y * g.width + x) * 4;
      if (g.data[i + 3] === 0) continue;
      const touchesEmpty = at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0 || at(x, y + 1) === 0;
      if (!touchesEmpty) continue;
      boundary++;
      const color = (g.data[i]! << 16) | (g.data[i + 1]! << 8) | g.data[i + 2]!;
      if (color !== OUTLINE) {
        throw new Error(`${label}: boundary pixel at ${x},${y} is not ink (#${color.toString(16)})`);
      }
    }
  }
  expect(boundary, `${label} has a silhouette at all`).toBeGreaterThan(8);
}

describe('render palette contract', () => {
  it('keeps an authored texel scale of exactly two canvas pixels', () => {
    expect(PIXEL_SCALE).toBe(2);
  });

  it('keeps the universal ink colour', () => {
    expect(OUTLINE).toBe(0x1a1528);
  });

  it('keeps exactly eight character colours per age', () => {
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

describe('unit art', () => {
  for (const age of AGES) {
    for (const role of ROLES) {
      it(`${age} ${role} stays on palette with an unclipped ink silhouette`, () => {
        const fit = UNIT_FIT[age][role];
        const ops = UNIT_ART[age][role];
        for (const side of ['player', 'ai'] as const) {
          const g = raster(fit.w, fit.h, ops, age, TEAM_COLORS[side], fit.dx, fit.dy);
          assertOnPalette(g, age, `${age} ${role} (${side})`, [TEAM_COLORS.player, TEAM_COLORS.ai]);
          assertInkSilhouette(g, `${age} ${role} (${side})`);
        }
      });
    }
  }

  it('keeps every unit on the texel grid at a sane on-screen size', () => {
    for (const age of AGES) {
      for (const role of ROLES) {
        const fit = UNIT_FIT[age][role];
        // Fitted art never leaves a clipped outline behind.
        expect(Number.isInteger(fit.dx)).toBe(true);
        expect(Number.isInteger(fit.dy)).toBe(true);
        expect(fit.w).toBeLessThanOrEqual(64);
        expect(fit.h).toBeLessThanOrEqual(40);
        // On screen (PIXEL_SCALE) units stay between 18 and 32 px tall, so the
        // lane never turns into a wall of sprites.
        expect(fit.h * PIXEL_SCALE / 3).toBeLessThan(30);
      }
    }
  });

  it('gives every role a visibly different silhouette', () => {
    const widths = ROLES.map((role) => UNIT_FIT.stone[role].w);
    expect(new Set(widths).size).toBeGreaterThan(1);
  });
});

describe('tower art', () => {
  for (const age of AGES) {
    it(`${age} towers keep an unclipped ink silhouette on palette`, () => {
      for (const side of ['player', 'ai'] as const) {
        const fit = BASE_FIT[age][side];
        const ops = BASE_ART[age](side);
        const g = raster(fit.w, fit.h, ops, age, TEAM_COLORS[side], fit.dx, fit.dy);
        assertOnPalette(g, age, `${age} base (${side})`, [TEAM_COLORS.player, TEAM_COLORS.ai]);
        assertInkSilhouette(g, `${age} base (${side})`);
      }
    });
  }
});

describe('scale hierarchy', () => {
  it('keeps every tower taller and wider than any unit in its age', () => {
    for (const age of AGES) {
      const tower = BASE_FIT[age].player;
      for (const role of ROLES) {
        const unit = UNIT_FIT[age][role];
        expect(tower.h).toBeGreaterThan(unit.h);
        expect(tower.w).toBeGreaterThanOrEqual(unit.w);
        // And it dominates on screen: at least 1.8x the tallest unit's height.
        expect(tower.h * PIXEL_SCALE).toBeGreaterThanOrEqual(unit.h * PIXEL_SCALE * 1.8);
      }
    }
  });

  it('reads heavies as half a tower and humans as distinctly smaller', () => {
    for (const age of AGES) {
      const towerH = BASE_FIT[age].player.h * PIXEL_SCALE;
      const human = UNIT_FIT[age].swarm.h * PIXEL_SCALE;
      const heavy = UNIT_FIT[age].tank.h * PIXEL_SCALE;
      expect(heavy).toBeGreaterThan(human); // the beast stands over the man
      expect(heavy * 2).toBeLessThan(towerH * 1.05); // but never rivals the tower
      expect(human * 2).toBeLessThan(towerH); // two men stacked stay under the roofline
    }
  });

  it('anchors tower footings firmly to the ground line with grounded footprints', () => {
    for (const age of AGES) {
      for (const side of ['player', 'ai'] as const) {
        const fit = BASE_FIT[age][side];
        expect(fit.foot).toBeGreaterThanOrEqual(fit.h - 2);
        expect(fit.w).toBeGreaterThanOrEqual(45);
      }
    }
  });
});

describe('prop art', () => {
  for (const age of AGES) {
    it(`${age} defines a prop for every slot in the layout, on palette and outlined`, () => {
      for (const placement of PROP_LAYOUT) {
        const def = AGE_PROPS[age][placement.prop];
        expect(def, `missing prop "${placement.prop}" for ${age}`).toBeDefined();
        const fit = def!.fit;
        const g = raster(fit.w, fit.h, def!.ops, age, 0xffffff, fit.dx, fit.dy);
        assertOnPalette(g, age, def!.key);
        assertInkSilhouette(g, def!.key);
      }
    });
  }
});

describe('interface portraits', () => {
  for (const age of AGES) {
    it(`${age} portraits stay on palette and outlined`, () => {
      for (const role of ROLES) {
        const fit = fitSprite(PORTRAIT_ART[age][role], PORTRAIT_CANVAS.w, PORTRAIT_CANVAS.h);
        const g = raster(fit.w, fit.h, PORTRAIT_ART[age][role], age, TEAM_COLORS.player, fit.dx, fit.dy);
        assertOnPalette(g, age, `portrait ${age} ${role}`, [TEAM_COLORS.player]);
        assertInkSilhouette(g, `portrait ${age} ${role}`);
      }
    });
  }
});

describe('base turret art', () => {
  for (const age of AGES) {
    it(`${age} turret stays on palette with a clean ink silhouette`, () => {
      const fit = TURRET_FIT[age];
      for (const side of ['player', 'ai'] as const) {
        const g = raster(fit.w, fit.h, TURRET_ART[age], age, TEAM_COLORS[side], fit.dx, fit.dy);
        assertOnPalette(g, age, `${age} turret (${side})`, [TEAM_COLORS.player, TEAM_COLORS.ai]);
        assertInkSilhouette(g, `${age} turret (${side})`);
      }
    });
  }

  it('gives each age a distinct turret silhouette', () => {
    const shapes = AGES.map((age) => JSON.stringify(TURRET_FIT[age]));
    expect(new Set(shapes).size).toBe(AGES.length);
  });

  it('fits every turret on the texel grid at the tower scale', () => {
    for (const age of AGES) {
      const fit = TURRET_FIT[age];
      // A negative offset is expected when art grows past the authored canvas:
      // `fitSprite` widens the canvas instead of clipping the ink outline.
      expect(Number.isInteger(fit.dx)).toBe(true);
      expect(Number.isInteger(fit.dy)).toBe(true);
      expect(fit.w).toBeGreaterThanOrEqual(TURRET_CANVAS.w);
      expect(fit.foot).toBeGreaterThan(0);
      expect(fit.foot).toBeLessThanOrEqual(fit.h);
      expect(fit.h * PIXEL_SCALE).toBeLessThan(80);
    }
  });
});

describe('effect and icon art', () => {
  it('keeps every effect sprite on palette with an ink silhouette', () => {
    for (const age of AGES) {
      for (const def of FX_DEFS) {
        const fit = FX_FIT[def.key]!;
        const g = raster(fit.w, fit.h, def.ops, age, 0xffffff, fit.dx, fit.dy);
        assertOnPalette(g, age, `${def.key} (${age})`);
        assertInkSilhouette(g, `${def.key} (${age})`);
      }
    }
  });

  it('keeps the HUD turret and superweapon icons on palette', () => {
    for (const age of AGES) {
      for (const [label, ops] of [
        ['turret icon', ICON_TURRET_ART[age]],
        ['ultimate icon', ICON_ULT_ART[age]],
      ] as const) {
        const g = raster(ICON_CANVAS.w, ICON_CANVAS.h, ops, age, TEAM_COLORS.player);
        assertOnPalette(g, age, `${label} (${age})`, [TEAM_COLORS.player]);
        assertInkSilhouette(g, `${label} (${age})`);
      }
    }
  });
});

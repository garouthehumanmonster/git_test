/**
 * Offline scene renderer — `npm run art:preview`.
 *
 * Renders the real game scene (graded backdrop, dithered lane terrain, the
 * parallax prop layout, base towers, a unit line-up and the HUD frame) to PNG
 * using the same art modules the game runs, but through a software rasteriser
 * instead of Phaser. This is how the project reviews its visuals in CI or in a
 * pull request without a browser, and it is the reference for scene layout.
 *
 * Outputs: docs/scene_<age>.png and docs/units_<age>.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png';
import { SoftGfx, blit } from './lib/softgfx';
import { buildBackdrop } from './build-backdrops';
import { PIXEL_SCALE, TEAM_COLORS, paletteFor } from '../src/render/palette';
import {
  AI_BASE_X, BASE_HP, LANE_HEIGHT, LANE_WIDTH, PLAYER_BASE_X, UNIT_DEFS,
} from '../src/sim/types';
import type { Age, UnitRole } from '../src/sim/types';
import { UNIT_ART, UNIT_FIT } from '../src/render/unitart';
import { BASE_ART, BASE_FIT } from '../src/render/basearth';
import { AGE_PROPS, PROP_LAYOUT } from '../src/render/propart';
import { PORTRAIT_ART, PORTRAIT_CANVAS } from '../src/render/portraits';
import { paintOps, type SpriteOp } from '../src/render/spriteops';
import { FORE_BOTTOM, SKY_HEIGHT, laneGroundY, paintLane } from '../src/render/laneart';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGES: Age[] = ['stone', 'medieval', 'modern'];
const ROLES: UnitRole[] = ['swarm', 'tank', 'ranged'];

/** Rasterise an op list at 1:1 using the same two-pass ink + colour painter. */
function rasterize(
  w: number,
  h: number,
  ops: SpriteOp[],
  age: Age,
  team = 0xffffff,
  dx = 0,
  dy = 0,
): SoftGfx {
  const g = new SoftGfx(w, h);
  const pal = paletteFor(age);
  paintOps(g, ops, pal, true, team, dx, dy);
  paintOps(g, ops, pal, false, team, dx, dy);
  return g;
}

function fill(g: SoftGfx, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

function ellipse(g: SoftGfx, cx: number, cy: number, w: number, h: number, color: number, alpha: number): void {
  const rx = w / 2, ry = h / 2;
  g.fillStyle(color, alpha);
  for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
    for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
      const dx = (px + 0.5 - cx) / rx;
      const dy = (py + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g.fillRect(px, py, 1, 1);
    }
  }
}

/** Representative battlefield layout used for the preview render. */
const LINE: Array<[UnitRole, 'player' | 'ai', number, number]> = [
  ['tank', 'player', 206, 0],
  ['swarm', 'player', 262, 1],
  ['swarm', 'player', 296, -1],
  ['ranged', 'player', 336, 1],
  ['swarm', 'player', 380, -1],
  ['ranged', 'ai', 452, -1],
  ['swarm', 'ai', 508, 0],
  ['ranged', 'ai', 556, 1],
  ['swarm', 'ai', 596, -1],
  ['swarm', 'ai', 630, 1],
  ['tank', 'ai', 700, 0],
];

function renderScene(age: Age): SoftGfx {
  const g = new SoftGfx(LANE_WIDTH, LANE_HEIGHT);
  const pal = paletteFor(age);
  fill(g, 0, 0, LANE_WIDTH, LANE_HEIGHT, pal.panel);

  // 1. Painted sky band (authored 450x143, drawn at PIXEL_SCALE).
  blit(g, buildBackdrop(age), 0, 0, PIXEL_SCALE);

  // 2. Horizon silhouettes, sitting inside the painted band.
  const props = AGE_PROPS[age];
  for (const placement of PROP_LAYOUT) {
    if (placement.slot !== 'skyline') continue;
    const def = props[placement.prop];
    if (!def) continue;
    const baseX = Math.round(placement.at * LANE_WIDTH);
    const groundY = SKY_HEIGHT + 2 + placement.offset;
    blit(g, rasterize(def.fit.w, def.fit.h, def.ops, age, 0xffffff, def.fit.dx, def.fit.dy), baseX, groundY, PIXEL_SCALE, 0xffffff, 0.94, 0.5, 1);
  }

  // 3. Lane terrain on its own layer (the lane graphics object clears itself,
  // exactly as the game's `Stage.drawLane` does), then composited in.
  const lane = new SoftGfx(LANE_WIDTH, LANE_HEIGHT);
  paintLane(lane, age);
  blit(g, lane, 0, 0, 1);

  // 4. Props standing in and in front of the lane.
  for (const placement of PROP_LAYOUT) {
    if (placement.slot === 'skyline') continue;
    const def = props[placement.prop];
    if (!def) continue;
    const baseX = Math.round(placement.at * LANE_WIDTH);
    const groundY = placement.slot === 'ground'
      ? Math.round(laneGroundY(baseX)) + 16 + placement.offset
      : FORE_BOTTOM + placement.offset - 6;
    blit(g, rasterize(def.fit.w, def.fit.h, def.ops, age, 0xffffff, def.fit.dx, def.fit.dy), baseX, groundY, PIXEL_SCALE, 0xffffff, 1, 0.5, 1);
  }

  // 5. Base towers.
  for (const side of ['player', 'ai'] as const) {
    const x = side === 'player' ? PLAYER_BASE_X : AI_BASE_X;
    const fit = BASE_FIT[age][side];
    const raster = rasterize(fit.w, fit.h, BASE_ART[age](side), age, TEAM_COLORS[side], fit.dx, fit.dy);
    const groundY = Math.round(laneGroundY(x) + 12);
    blit(g, raster, x, groundY, PIXEL_SCALE, 0xffffff, 1, 0.5, fit.foot / fit.h);
    const flag: SpriteOp[] = [
      { k: 'r', x: 0, y: 0, w: 2, h: 18, c: 'mid' },
      { k: 'r', x: 2, y: 1, w: 14, h: 10, c: 'team' },
      { k: 'r', x: 3, y: 2, w: 12, h: 3, c: 'light' },
    ];
    const flagRaster = rasterize(18, 20, flag, age, TEAM_COLORS[side]);
    blit(g, flagRaster, x + (side === 'player' ? 26 : -26), groundY - 150, PIXEL_SCALE, 0xffffff, 1, 0, 0.5);
  }

  // 6. Units with foot-line shadows and health pips.
  for (const [role, side, x, spread] of LINE) {
    const groundY = Math.round(laneGroundY(x) + spread * 8 + 2);
    const fit = UNIT_FIT[age][role];
    ellipse(g, x, groundY - 1, fit.w * 0.9, 7, 0x000000, 0.35);
    const raster = rasterize(fit.w, fit.h, UNIT_ART[age][role], age, TEAM_COLORS[side], fit.dx, fit.dy);
    blit(g, raster, x, groundY, PIXEL_SCALE, 0xffffff, 1, 0.5, fit.foot / fit.h);
    const barW = Math.round(fit.w * 0.8);
    const barY = groundY - fit.h * PIXEL_SCALE + 8;
    fill(g, x - barW / 2, barY, barW, 5, pal.dark, 0.9);
    const ratio = 0.35 + ((x * 7) % 6) / 10;
    fill(g, x - barW / 2, barY, Math.round(barW * Math.min(1, ratio)), 5, side === 'player' ? pal.body : pal.highlight);
  }

  // 7. A projectile in flight.
  const projectile: SpriteOp[] =
    age === 'stone'
      ? [{ k: 'r', x: 2, y: 2, w: 5, h: 5, c: 'edge' }, { k: 'r', x: 3, y: 3, w: 2, h: 2, c: 'light' }]
      : age === 'medieval'
        ? [
          { k: 'r', x: 2, y: 3, w: 14, h: 2, c: 'mid' },
          { k: 't', x1: 16, y1: 1, x2: 19, y2: 4, x3: 16, y3: 7, c: 'light' },
        ]
        : [{ k: 'r', x: 0, y: 2, w: 14, h: 2, c: 'edge' }, { k: 'r', x: 4, y: 1, w: 10, h: 4, c: 'body' }];
  blit(g, rasterize(20, 8, projectile, age), 430, 322, PIXEL_SCALE, 0xffffff, 1, 0.5, 0.5);

  // 8. HUD chrome (panels, bars and button frames — text is live Phaser text).
  const top = new SoftGfx(LANE_WIDTH, 64);
  fill(top, 0, 0, LANE_WIDTH, 64, pal.panel, 0.72);
  fill(top, 0, 61, LANE_WIDTH, 3, pal.edge, 0.9);
  blit(g, top, 0, 0, 1);
  const crest: SpriteOp[] = [
    { k: 'r', x: 3, y: 1, w: 10, h: 10, c: 'edge' },
    { k: 't', x1: 3, y1: 10, x2: 13, y2: 10, x3: 8, y3: 15, c: 'edge' },
    { k: 'r', x: 4, y: 2, w: 8, h: 8, c: 'panel' },
    { k: 'r', x: 6, y: 4, w: 4, h: 8, c: 'accent' },
  ];
  blit(g, rasterize(16, 16, crest, age), 30, 32, PIXEL_SCALE, 0xffffff, 1, 0.5, 0.5);
  fill(g, LANE_WIDTH / 2 - 191, 25, 183, 20, pal.dark);
  fill(g, LANE_WIDTH / 2 - 188, 28, 177, 14, pal.body);
  fill(g, LANE_WIDTH / 2 + 8, 25, 183, 20, pal.dark);
  fill(g, LANE_WIDTH / 2 + 11, 28, 140, 14, pal.highlight);
  void BASE_HP;

  const panelY = LANE_HEIGHT - 78;
  const bottom = new SoftGfx(LANE_WIDTH, LANE_HEIGHT - panelY);
  fill(bottom, 0, 0, LANE_WIDTH, LANE_HEIGHT - panelY, pal.panel, 0.92);
  fill(bottom, 0, 0, LANE_WIDTH, 3, pal.edge, 0.9);
  blit(g, bottom, 0, panelY, 1);

  const btnW = 148, btnH = 66, upgW = 104, evolveW = 132, gap = 8;
  const totalW = btnW * 3 + upgW * 2 + evolveW + gap * 5;
  let bx = Math.round((LANE_WIDTH - totalW) / 2);
  const by = panelY + Math.round((LANE_HEIGHT - panelY) / 2) - Math.round(btnH / 2);
  for (const role of ROLES) {
    drawButtonFrame(g, bx, by, btnW, btnH, pal);
    const portrait = rasterize(PORTRAIT_CANVAS.w, PORTRAIT_CANVAS.h, PORTRAIT_ART[age][role], age, TEAM_COLORS.player);
    blit(g, portrait, bx + 26, by + Math.round(btnH / 2), PIXEL_SCALE, 0xffffff, 1, 0.5, 0.5);
    fill(g, bx + 48, by + 10, 78, 3, pal.body);
    fill(g, bx + 48, by + 26, 52, 3, pal.highlight);
    fill(g, bx + 8, by + btnH - 20, 120, 3, pal.mid);
    bx += btnW + gap;
  }
  for (const which of ['forge', 'armor'] as const) {
    drawButtonFrame(g, bx, by, upgW, btnH, pal);
    fill(g, bx + Math.round(upgW / 2) - 16, by + 6, 32, 32, which === 'forge' ? pal.edge : pal.body);
    fill(g, bx + Math.round(upgW / 2) - 24, by + 44, 48, 3, pal.body);
    for (let i = 0; i < 3; i++) fill(g, bx + Math.round(upgW / 2) - 18 + i * 14, by + 62, 10, 4, pal.panelLight);
    bx += upgW + gap;
  }
  drawButtonFrame(g, bx, by, evolveW, btnH, pal);
  fill(g, bx + Math.round(evolveW / 2) - 16, by + 6, 32, 32, pal.highlight);
  fill(g, bx + Math.round(evolveW / 2) - 40, by + 44, 80, 3, pal.body);

  return g;
}

function drawButtonFrame(
  g: SoftGfx, x: number, y: number, w: number, h: number,
  pal: { panel: number; panelDark: number; panelLight: number; edge: number },
): void {
  fill(g, x - 2, y - 2, w + 4, h + 4, pal.panelDark);
  fill(g, x, y, w, h, pal.panel);
  fill(g, x, y, w, 2, pal.panelLight, 0.6);
  g.lineStyle(2, pal.edge, 1);
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

/** Unit line-up: every role, both team colours, on the age backdrop tone. */
function renderUnitSheet(age: Age): SoftGfx {
  const pal = paletteFor(age);
  const cellW = 200;
  const rowH = 116;
  const g = new SoftGfx(cellW * ROLES.length, rowH * 2);
  fill(g, 0, 0, g.width, g.height, pal.dark);
  ROLES.forEach((role, ri) => {
    const x = ri * cellW + cellW / 2;
    const fit = UNIT_FIT[age][role];
    for (const [row, side] of (['player', 'ai'] as const).entries()) {
      const y = row * rowH + 88;
      ellipse(g, x, y - 2, fit.w * 0.9, 12, 0x000000, 0.35);
      const raster = rasterize(fit.w, fit.h, UNIT_ART[age][role], age, TEAM_COLORS[side], fit.dx, fit.dy);
      blit(g, raster, x, y, PIXEL_SCALE, 0xffffff, 1, 0.5, fit.foot / fit.h);
      const def = UNIT_DEFS[age][role];
      void def;
    }
  });
  return g;
}

function main(): void {
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  mkdirSync(join(ROOT, 'art', 'preview'), { recursive: true });
  for (const age of AGES) {
    const scene = renderScene(age);
    const png = encodePng(scene.width, scene.height, scene.data);
    writeFileSync(join(ROOT, 'docs', `scene_${age}.png`), png);
    writeFileSync(join(ROOT, 'art', 'preview', `scene_${age}.png`), png);
    const sheet = renderUnitSheet(age);
    const sheetPng = encodePng(sheet.width, sheet.height, sheet.data);
    writeFileSync(join(ROOT, 'docs', `units_${age}.png`), sheetPng);
    console.log(`scene_${age}.png  ${(png.length / 1024).toFixed(1)} KB   units_${age}.png ${(sheetPng.length / 1024).toFixed(1)} KB`);
  }
}

main();

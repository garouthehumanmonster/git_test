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
  AI_BASE_X, BASE_HP, LANE_HEIGHT, LANE_WIDTH, PLAYER_BASE_X, UNIT_DEFS, laneYOffsetFor,
} from '../src/sim/types';
import type { Age, UnitRole } from '../src/sim/types';
import { UNIT_ART, UNIT_FIT } from '../src/render/unitart';
import {
  FX_DEFS,
  FX_FIT,
  ICON_CANVAS,
  ICON_TURRET_ART,
  ICON_ULT_ART,
  TURRET_ART,
  TURRET_FIT,
} from '../src/render/turretart';
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

/**
 * Representative battlefield layout used for the preview render. Each unit
 * carries the id it would have in a live match, because the id drives its lane
 * slot — the preview then staggers units exactly the way `GameScene` does.
 */
const LINE: Array<[UnitRole, 'player' | 'ai', number, number]> = [
  ['tank', 'player', 206, 2],
  ['swarm', 'player', 262, 4],
  ['swarm', 'player', 296, 1],
  ['ranged', 'player', 336, 3],
  ['swarm', 'player', 380, 5],
  ['ranged', 'ai', 452, 7],
  ['swarm', 'ai', 508, 9],
  ['ranged', 'ai', 556, 6],
  ['swarm', 'ai', 596, 8],
  ['swarm', 'ai', 630, 10],
  ['tank', 'ai', 700, 12],
];

/** Matches `GameScene.unitGroundY`: lane slope + full lane slot + id jitter. */
const CROWD_SPREAD = 2.4;
function unitGroundY(x: number, id: number): number {
  return laneGroundY(x) + laneYOffsetFor(id) + ((id * 37) % 9 - 4) * CROWD_SPREAD;
}

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

  // 5b. Base-defence turret, standing beside each tower.
  for (const side of ['player', 'ai'] as const) {
    const turretFit = TURRET_FIT[age];
    const tx = (side === 'player' ? PLAYER_BASE_X : AI_BASE_X) + (side === 'player' ? 26 : -26);
    const turretGround = Math.round(laneGroundY(tx) - 4);
    const turretRaster = rasterize(turretFit.w, turretFit.h, TURRET_ART[age], age, TEAM_COLORS[side], turretFit.dx, turretFit.dy);
    blit(g, turretRaster, tx, turretGround, PIXEL_SCALE, 0xffffff, 1, 0.5, 0.92);
  }

  // 6. Units with foot-line shadows and health pips, drawn back to front the
  // way Phaser's y-based depth sort lays them out.
  const line: Array<[UnitRole, 'player' | 'ai', number, number, number]> = LINE
    .map(([role, side, x, id]) => [role, side, x, id, unitGroundY(x, id)])
    .sort((a, b) => a[4] - b[4]);
  for (const [role, side, x, _id, groundYRaw] of line) {
    const groundY = Math.round(groundYRaw + 2);
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

  // 6b. Attack and superweapon effects, drawn where they appear in play.
  const fxSlots: Array<[string, number, number]> = [
    ['fx_slash', 0.34, -30],
    ['fx_muzzle', 0.5, -30],
    ['fx_shock', 0.62, -10],
    ['fx_meteor', 0.78, -150],
  ];
  for (const [key, at, lift] of fxSlots) {
    const def = FX_DEFS.find((d) => d.key === key);
    if (!def) continue;
    const fit = FX_FIT[key]!;
    const raster = rasterize(fit.w, fit.h, def.ops, age, 0xffffff);
    blit(g, raster, Math.round(at * LANE_WIDTH), Math.round(laneGroundY(at * LANE_WIDTH) + lift), PIXEL_SCALE, 0xffffff, 1, 0.5, def.origin?.y ?? 0.5);
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

/**
 * Contact sheet for the art added by the combat pass: turrets, attack effects
 * and HUD icons, each at the exact scale it appears in play. Rows are ages;
 * columns are turret / effect / icon.
 */
function renderKitSheet(): SoftGfx {
  const cellW = 172;
  const cellH = 150;
  const pad = 10;
  const g = new SoftGfx(cellW * 3, cellH * 3);
  fill(g, 0, 0, g.width, g.height, 0x0b0918);

  interface Item {
    age: Age;
    ops: SpriteOp[];
    fit: { w: number; h: number; foot: number; dx: number; dy: number };
    team: number;
  }

  AGES.forEach((age, row) => {
    const items: Item[] = [
      {
        age,
        ops: TURRET_ART[age],
        fit: TURRET_FIT[age],
        team: TEAM_COLORS.player,
      },
      {
        age,
        ops: FX_DEFS[row === 0 ? 0 : row === 1 ? 1 : 2]!.ops,
        fit: FX_FIT[FX_DEFS[row === 0 ? 0 : row === 1 ? 1 : 2]!.key]!,
        team: 0xffffff,
      },
      {
        age,
        ops: row === 0 ? ICON_TURRET_ART[age] : row === 1 ? ICON_ULT_ART[age] : ICON_ULT_ART[age],
        fit: { w: ICON_CANVAS.w, h: ICON_CANVAS.h, foot: ICON_CANVAS.h, dx: 0, dy: 0 },
        team: TEAM_COLORS.player,
      },
    ];

    items.forEach((item, col) => {
      const x0 = col * cellW;
      const y0 = row * cellH;
      const pal = paletteFor(age);
      fill(g, x0 + pad, y0 + pad, cellW - pad * 2, cellH - pad * 2, pal.panel, 1);
      // Frame in the age's accent so the rows read apart at a glance.
      fill(g, x0 + pad, y0 + pad, cellW - pad * 2, 2, pal.edge, 1);
      fill(g, x0 + pad, y0 + cellH - pad - 2, cellW - pad * 2, 2, pal.edge, 1);
      fill(g, x0 + pad, y0 + pad, 2, cellH - pad * 2, pal.edge, 1);
      fill(g, x0 + cellW - pad - 2, y0 + pad, 2, cellH - pad * 2, pal.edge, 1);

      const raster = rasterize(item.fit.w, item.fit.h, item.ops, item.age, item.team, item.fit.dx, item.fit.dy);
      const cx = x0 + cellW / 2;
      const groundY = y0 + cellH - pad - 22;
      ellipse(g, cx, groundY - 1, item.fit.w * 0.9, 8, 0x000000, 0.35);
      blit(g, raster, cx, groundY, PIXEL_SCALE, 0xffffff, 1, 0.5, item.fit.foot / item.fit.h);
    });
  });
  return g;
}

/**
 * Integer-scaled crop, written to the (gitignored) preview folder so new art
 * can be inspected at pixel level without shipping the zoom.
 */
function zoomCrop(src: SoftGfx, x0: number, y0: number, w: number, h: number, k: number): SoftGfx {
  const out = new SoftGfx(w * k, h * k);
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const sx = x0 + Math.floor(x / k);
      const sy = y0 + Math.floor(y / k);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = src.data[si + 3]!;
    }
  }
  return out;
}

/** Half-size nearest-neighbour downscale, for the combined overview sheet. */
function halve(src: SoftGfx): SoftGfx {
  const out = new SoftGfx(Math.floor(src.width / 2), Math.floor(src.height / 2));
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = ((y * 2) * src.width + x * 2) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

/**
 * One sheet showing all three ages and their unit line-ups, committed as
 * `docs/overview.png` so the whole presentation can be reviewed at a glance.
 */
function composeOverview(scenes: Record<string, SoftGfx>, sheets: Record<string, SoftGfx>): SoftGfx {
  const halves = AGES.map((age) => halve(scenes[age]!));
  const cellW = halves[0]!.width;
  const gap = 6;
  const sheetH = halve(sheets[AGES[0]!]!).height;
  const totalH = gap + AGES.length * (halves[0]!.height + gap + sheetH + gap);
  const out = new SoftGfx(cellW + gap * 2, totalH);
  fill(out, 0, 0, out.width, out.height, 0x0b0918);
  let y = gap;
  for (let i = 0; i < AGES.length; i++) {
    blit(out, halves[i]!, gap, y, 1);
    y += halves[i]!.height + gap;
    blit(out, halve(sheets[AGES[i]!]!), gap, y, 1);
    y += sheetH + gap;
  }
  return out;
}

function main(): void {
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  mkdirSync(join(ROOT, 'art', 'preview'), { recursive: true });
  const scenes: Record<string, SoftGfx> = {};
  const sheets: Record<string, SoftGfx> = {};
  for (const age of AGES) {
    const scene = renderScene(age);
    scenes[age] = scene;
    const detail = zoomCrop(scene, 20, 260, 460, 240, 3);
    writeFileSync(join(ROOT, 'art', 'preview', `detail_${age}.png`), encodePng(detail.width, detail.height, detail.data));
    const png = encodePng(scene.width, scene.height, scene.data);
    writeFileSync(join(ROOT, 'docs', `scene_${age}.png`), png);
    writeFileSync(join(ROOT, 'art', 'preview', `scene_${age}.png`), png);
    const sheet = renderUnitSheet(age);
    sheets[age] = sheet;
    const sheetPng = encodePng(sheet.width, sheet.height, sheet.data);
    writeFileSync(join(ROOT, 'docs', `units_${age}.png`), sheetPng);
    console.log(`scene_${age}.png  ${(png.length / 1024).toFixed(1)} KB   units_${age}.png ${(sheetPng.length / 1024).toFixed(1)} KB`);
  }
  const overview = composeOverview(scenes, sheets);
  const overviewPng = encodePng(overview.width, overview.height, overview.data);
  const kit = renderKitSheet();
  const kitPng = encodePng(kit.width, kit.height, kit.data);
  writeFileSync(join(ROOT, 'docs', 'kit.png'), kitPng);
  console.log(`kit.png  ${kit.width}x${kit.height}  ${(kitPng.length / 1024).toFixed(1)} KB`);

  writeFileSync(join(ROOT, 'docs', 'overview.png'), overviewPng);
  console.log(`overview.png  ${overview.width}x${overview.height}  ${(overviewPng.length / 1024).toFixed(1)} KB`);
}

main();

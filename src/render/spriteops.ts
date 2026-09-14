import type Phaser from 'phaser';
import type { PixelGraphics } from './gfx';
import { OUTLINE, type AgePalette } from './palette';

/**
 * A deliberately tiny "sprite script" format.
 *
 * Every asset in the game is described as a list of pixel primitives. The
 * renderer executes each list twice:
 *
 *   1. once as a 1px-inflated silhouette painted entirely in OUTLINE ink
 *   2. once at true size using the age palette
 *
 * The result is a guaranteed uniform one-texel dark outline around every
 * silhouette, at the same texel density, without hand-drawing outlines. Ages
 * differ only by palette and op list, so all art stays visually related.
 */
export type ColorKey = keyof AgePalette | 'ink' | 'team';

export type SpriteOp =
  | { k: 'r'; x: number; y: number; w: number; h: number; c: ColorKey }
  | { k: 't'; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; c: ColorKey };

/** Rect primitive. */
export const r = (x: number, y: number, w: number, h: number, c: ColorKey): SpriteOp => ({ k: 'r', x, y, w, h, c });
/** Triangle primitive. */
export const tri = (
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: ColorKey,
): SpriteOp => ({ k: 't', x1, y1, x2, y2, x3, y3, c });

function resolve(color: ColorKey, pal: AgePalette, inkOnly: boolean, team: number): number {
  if (inkOnly || color === 'ink') return OUTLINE;
  if (color === 'team') return team;
  return pal[color];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box of an op list, including the 1px outline. */
export function spriteBounds(ops: SpriteOp[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const op of ops) {
    if (op.k === 'r') {
      minX = Math.min(minX, op.x - 1);
      minY = Math.min(minY, op.y - 1);
      maxX = Math.max(maxX, op.x + op.w + 1);
      maxY = Math.max(maxY, op.y + op.h + 1);
    } else {
      for (const [x, y] of [[op.x1, op.y1], [op.x2, op.y2], [op.x3, op.y3]] as const) {
        minX = Math.min(minX, x - 1.5);
        minY = Math.min(minY, y - 1.5);
        maxX = Math.max(maxX, x + 1.5);
        maxY = Math.max(maxY, y + 1.5);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Offsets used to dilate a primitive by exactly one pixel in every direction. */
const DILATE_OFFSETS: Array<[number, number]> = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Paint an op list into an existing Graphics object.
 *
 * @param inkOnly when true every primitive is drawn as pure OUTLINE ink and
 *   dilated by exactly one pixel in all eight directions. Painting the fills on
 *   top of that silhouette afterwards guarantees every asset in the game has a
 *   uniform 1px dark outline with no hand-drawn borders and no stray pixels.
 */
export function paintOps(
  g: PixelGraphics,
  ops: SpriteOp[],
  pal: AgePalette,
  inkOnly: boolean,
  team = 0xffffff,
  offsetX = 0,
  offsetY = 0,
): void {
  for (const op of ops) {
    g.fillStyle(resolve(op.c, pal, inkOnly, team), 1);
    if (!inkOnly) {
      drawOp(g, op, offsetX, offsetY);
      continue;
    }
    for (const [dx, dy] of DILATE_OFFSETS) drawOp(g, op, offsetX + dx, offsetY + dy);
  }
}

function drawOp(g: PixelGraphics, op: SpriteOp, dx: number, dy: number): void {
  if (op.k === 'r') {
    g.fillRect(op.x + dx, op.y + dy, op.w, op.h);
  } else {
    g.fillTriangle(op.x1 + dx, op.y1 + dy, op.x2 + dx, op.y2 + dy, op.x3 + dx, op.y3 + dy);
  }
}

/**
 * Geometry of an op list once it has been fitted into a texture: the final
 * canvas size, the translation needed, and where the original `footRow` ends up.
 */
export interface FittedSprite {
  w: number;
  h: number;
  dx: number;
  dy: number;
  /** Row inside the fitted canvas that matches the requested foot row. */
  foot: number;
}

/**
 * Fit authored art into a texture so the 1px ink silhouette is never clipped by
 * the canvas edge. The canvas grows only if it has to, and every asset is
 * translated by whole texels, so the pixel grid is never broken.
 */
export function fitSprite(
  ops: SpriteOp[],
  canvasW: number,
  canvasH: number,
  footRow = canvasH,
): FittedSprite {
  const b = spriteBounds(ops);
  const dx = Math.round(-b.minX);
  const dy = Math.round(-b.minY);
  const w = Math.max(canvasW, Math.ceil(b.maxX - b.minX));
  const h = Math.max(canvasH, Math.ceil(b.maxY - b.minY));
  return { w, h, dx, dy, foot: footRow + dy };
}

/**
 * Render an op list into a new texture, fitted so the ink outline is intact.
 * Assets are authored at these small sizes and displayed at PIXEL_SCALE.
 */
export function makeTexture(
  scene: Phaser.Scene,
  key: string,
  ops: SpriteOp[],
  pal: AgePalette,
  team = 0xffffff,
  canvasW = 0,
  canvasH = 0,
  footRow?: number,
): FittedSprite {
  const fit = fitSprite(ops, canvasW, canvasH, footRow);
  if (scene.textures.exists(key)) return fit;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  paintOps(g, ops, pal, true, team, fit.dx, fit.dy);
  paintOps(g, ops, pal, false, team, fit.dx, fit.dy);
  g.generateTexture(key, fit.w, fit.h);
  g.destroy();
  return fit;
}

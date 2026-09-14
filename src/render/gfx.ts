/**
 * The small subset of the Phaser Graphics API that the game's art code uses.
 *
 * Depending on this interface instead of Phaser directly means every sprite,
 * prop and lane texture can also be rendered by the offline software
 * rasteriser in `scripts/render-preview.ts` — which is how the project verifies
 * its visuals without a browser.
 *
 * `Phaser.GameObjects.Graphics` satisfies this interface structurally.
 */
export interface PixelGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
  clear(): unknown;
}

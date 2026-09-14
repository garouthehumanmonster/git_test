/**
 * A tiny software rasteriser implementing the same `PixelGraphics` surface the
 * game's art code targets. It lets `npm run art:preview` render the real scene
 * (backdrop, lane terrain, props, units, towers) to a PNG in plain Node — no
 * browser, no headless GL, and no duplicate drawing code.
 */
import type { PixelGraphics } from '../../src/render/gfx';

export class SoftGfx implements PixelGraphics {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  /** Multiply colour applied to every fill (mirrors Phaser's setTint). */
  tint = 0xffffff;
  /** Translation applied to every primitive. */
  offsetX = 0;
  offsetY = 0;
  /** Extra alpha multiplier for the whole object. */
  objectAlpha = 1;

  private fillColor = 0xffffff;
  private fillAlpha = 1;
  private lineWidth = 1;
  private lineColor = 0xffffff;
  private lineAlpha = 1;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  fillStyle(color: number, alpha = 1): this {
    this.fillColor = color;
    this.fillAlpha = alpha;
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lineWidth = width;
    this.lineColor = color;
    this.lineAlpha = alpha;
    return this;
  }

  clear(): this {
    this.data.fill(0);
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    const x0 = Math.round(x + this.offsetX);
    const y0 = Math.round(y + this.offsetY);
    const x1 = Math.round(x + w + this.offsetX);
    const y1 = Math.round(y + h + this.offsetY);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.px(px, py, this.fillColor, this.fillAlpha);
    }
    return this;
  }

  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    const ax = x1 + this.offsetX, ay = y1 + this.offsetY;
    const bx = x2 + this.offsetX, by = y2 + this.offsetY;
    const cx = x3 + this.offsetX, cy = y3 + this.offsetY;
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-6) return this;
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sx = px + 0.5, sy = py + 0.5;
        const w0 = ((bx - ax) * (sy - ay) - (sx - ax) * (by - ay)) / area;
        const w1 = ((sx - ax) * (cy - ay) - (cx - ax) * (sy - ay)) / area;
        if (w0 >= -0.001 && w1 >= -0.001 && w0 + w1 <= 1.001) this.px(px, py, this.fillColor, this.fillAlpha);
      }
    }
    return this;
  }

  fillCircle(x: number, y: number, radius: number): this {
    const cx = x + this.offsetX;
    const cy = y + this.offsetY;
    const r2 = radius * radius;
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py++) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.px(px, py, this.fillColor, this.fillAlpha);
      }
    }
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number): this {
    const lw = Math.max(1, Math.round(this.lineWidth));
    const saved = this.fillColor;
    const savedAlpha = this.fillAlpha;
    this.fillColor = this.lineColor;
    this.fillAlpha = this.lineAlpha;
    this.fillRect(x, y, w, lw);
    this.fillRect(x, y + h - lw, w, lw);
    this.fillRect(x, y + lw, lw, h - lw * 2);
    this.fillRect(x + w - lw, y + lw, lw, h - lw * 2);
    this.fillColor = saved;
    this.fillAlpha = savedAlpha;
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    const lw = Math.max(1, Math.round(this.lineWidth));
    const ax = Math.round(x1 + this.offsetX);
    const ay = Math.round(y1 + this.offsetY);
    const bx = Math.round(x2 + this.offsetX);
    const by = Math.round(y2 + this.offsetY);
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const px = Math.round(ax + (bx - ax) * t);
      const py = Math.round(ay + (by - ay) * t);
      this.fillRect(px - (lw >> 1), py - (lw >> 1), lw, lw);
    }
    return this;
  }

  /** Multiply `color` by the current tint, honouring per-channel shading. */
  private applyTint(color: number): number {
    if (this.tint === 0xffffff) return color;
    const r = ((color >> 16) & 0xff) * ((this.tint >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) * ((this.tint >> 8) & 0xff) / 255;
    const b = (color & 0xff) * (this.tint & 0xff) / 255;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  private px(x: number, y: number, color: number, alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = Math.max(0, Math.min(1, alpha * this.objectAlpha));
    if (a <= 0) return;
    const shaded = this.applyTint(color);
    const i = (y * this.width + x) * 4;
    if (a >= 1) {
      this.data[i] = (shaded >> 16) & 0xff;
      this.data[i + 1] = (shaded >> 8) & 0xff;
      this.data[i + 2] = shaded & 0xff;
      this.data[i + 3] = 255;
      return;
    }
    const da = this.data[i + 3] / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    const mix = (src: number, dst: number): number => (src * a + dst * (1 - a)) / outA;
    this.data[i] = mix((shaded >> 16) & 0xff, this.data[i]!);
    this.data[i + 1] = mix((shaded >> 8) & 0xff, this.data[i + 1]!);
    this.data[i + 2] = mix(shaded & 0xff, this.data[i + 2]!);
    this.data[i + 3] = Math.round(outA * 255);
  }
}

/** Copy a source raster into a target at integer coordinates, scaling by an integer factor. */
export function blit(
  target: SoftGfx,
  src: { width: number; height: number; data: Uint8Array },
  x: number,
  y: number,
  scale: number,
  tint = 0xffffff,
  alpha = 1,
  originX = 0,
  originY = 0,
): void {
  const ox = -originX * src.width * scale;
  const oy = -originY * src.height * scale;
  const tr = (tint >> 16) & 0xff, tg = (tint >> 8) & 0xff, tb = tint & 0xff;
  for (let sy = 0; sy < src.height; sy++) {
    for (let sx = 0; sx < src.width; sx++) {
      const si = (sy * src.width + sx) * 4;
      const sa = (src.data[si + 3]! / 255) * alpha;
      if (sa <= 0) continue;
      const r = Math.round((src.data[si]! * tr) / 255);
      const g = Math.round((src.data[si + 1]! * tg) / 255);
      const b = Math.round((src.data[si + 2]! * tb) / 255);
      const color = (r << 16) | (g << 8) | b;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const tx = x + ox + sx * scale + px;
          const ty = y + oy + sy * scale + py;
          if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
          const di = (ty * target.width + tx) * 4;
          if (sa >= 1) {
            target.data[di] = r; target.data[di + 1] = g; target.data[di + 2] = b; target.data[di + 3] = 255;
          } else {
            const da = target.data[di + 3]! / 255;
            const outA = sa + da * (1 - sa);
            if (outA <= 0) continue;
            const mix = (sv: number, dv: number): number => (sv * sa + dv * (1 - sa)) / outA;
            target.data[di] = mix(r, target.data[di]!);
            target.data[di + 1] = mix(g, target.data[di + 1]!);
            target.data[di + 2] = mix(b, target.data[di + 2]!);
            target.data[di + 3] = Math.round(outA * 255);
          }
        }
      }
    }
  }
}

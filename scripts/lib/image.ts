/** Small image helpers shared by the offline art pipeline. */

export interface Raster {
  width: number;
  height: number;
  /** RGBA bytes, length = width * height * 4 */
  data: Uint8Array;
}

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: number): Rgb {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** Area-average resample. Works for any (including fractional) scale factor. */
export function resizeArea(src: Raster, dstW: number, dstH: number): Raster {
  const out = new Uint8Array(dstW * dstH * 4);
  const sx = src.width / dstW;
  const sy = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    const y0 = y * sy;
    const y1 = (y + 1) * sy;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(src.height, Math.ceil(y1));
    for (let x = 0; x < dstW; x++) {
      const x0 = x * sx;
      const x1 = (x + 1) * sx;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(src.width, Math.ceil(x1));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy2 = iy0; sy2 < iy1; sy2++) {
        const wy = Math.min(y1, sy2 + 1) - Math.max(y0, sy2);
        if (wy <= 0) continue;
        for (let sx2 = ix0; sx2 < ix1; sx2++) {
          const wx = Math.min(x1, sx2 + 1) - Math.max(x0, sx2);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy2 * src.width + sx2) * 4;
          r += src.data[i]! * w;
          g += src.data[i + 1]! * w;
          b += src.data[i + 2]! * w;
          a += src.data[i + 3]! * w;
          wsum += w;
        }
      }
      const o = (y * dstW + x) * 4;
      out[o] = Math.round(r / wsum);
      out[o + 1] = Math.round(g / wsum);
      out[o + 2] = Math.round(b / wsum);
      out[o + 3] = Math.round(a / wsum);
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** Crop a rectangle (clamped to the source bounds). */
export function crop(src: Raster, x0: number, y0: number, w: number, h: number): Raster {
  const cx = Math.max(0, Math.min(src.width - 1, Math.round(x0)));
  const cy = Math.max(0, Math.min(src.height - 1, Math.round(y0)));
  const cw = Math.max(1, Math.min(src.width - cx, Math.round(w)));
  const ch = Math.max(1, Math.min(src.height - cy, Math.round(h)));
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((cy + y) * src.width + cx) * 4;
    out.set(src.data.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
  }
  return { width: cw, height: ch, data: out };
}

/** Nearest-colour match against a fixed palette, in a luma-weighted RGB space. */
export function nearestColor(r: number, g: number, b: number, palette: Rgb[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i]!;
    const dr = (r - pr) * 0.9;
    const dg = (g - pg) * 1.25;
    const db = (b - pb) * 0.85;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

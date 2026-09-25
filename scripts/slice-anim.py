#!/usr/bin/env python3
"""Cut the generated walk strips into foot-aligned frames and a red-team twin.

The image model paints four (sometimes eight) views of one character on a flat
magenta field. This slices that field into a walk cycle, pins every frame's
feet to the same canvas, and shifts blue team cloth to red for the AI side.
"""

from __future__ import annotations

import subprocess
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "generated"
OUT = ROOT / "public" / "atlas" / "anim"

UNITS = [
    "stone_swarm",
    "stone_tank",
    "stone_ranged",
    "medieval_swarm",
    "medieval_tank",
    "medieval_ranged",
    "modern_swarm",
    "modern_tank",
    "modern_ranged",
]

# On-canvas height after the slice. The game scales from here; keeping every
# frame of a unit the same height is what stops the body popping as it walks.
TARGET_H = {
    "swarm": 200,
    "ranged": 190,
    "tank": 210,
}


def load_rgba(path: Path) -> tuple[int, int, bytearray]:
    w, h = map(int, subprocess.check_output(["identify", "-format", "%w %h", str(path)]).split())
    raw = subprocess.check_output(["convert", str(path), "-alpha", "set", "rgba:-"])
    expected = w * h * 4
    if len(raw) != expected:
        raise SystemExit(f"{path.name}: expected {expected} bytes, got {len(raw)}")
    return w, h, bytearray(raw)


def save_png(path: Path, w: int, h: int, rgba: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["convert", "-size", f"{w}x{h}", "-depth", "8", "rgba:-", f"PNG32:{path}"],
        input=rgba,
        check=True,
    )


def pix(buf: bytearray, w: int, x: int, y: int) -> tuple[int, int, int, int]:
    i = (y * w + x) * 4
    return buf[i], buf[i + 1], buf[i + 2], buf[i + 3]


def set_pix(buf: bytearray, w: int, x: int, y: int, r: int, g: int, b: int, a: int) -> None:
    i = (y * w + x) * 4
    buf[i : i + 4] = bytes((r, g, b, a))


def is_magenta(r: int, g: int, b: int) -> bool:
    # The sheets are painted on ~(252, 0, 246). Fringe pixels are pink, not ink.
    if g < 90 and r > 170 and b > 160 and abs(r - b) < 80:
        return True
    if g < 40 and r > 140 and b > 140:
        return True
    return False


def key_magenta(buf: bytearray, w: int, h: int) -> None:
    for i in range(0, len(buf), 4):
        r, g, b, a = buf[i], buf[i + 1], buf[i + 2], buf[i + 3]
        if a == 0 or is_magenta(r, g, b):
            buf[i : i + 4] = b"\x00\x00\x00\x00"
            continue
        # Magenta fringe, including the dark pink line the key leaves under tracks.
        if r > 45 and b > 35 and g < 55 and r > g + 18 and b > g + 12 and abs(r - b) < 110:
            buf[i + 3] = 0


def drop_ground_lines(buf: bytearray, w: int, h: int) -> None:
    """A full-width ink rule under the feet would glue every frame together."""
    for y in range(h):
        dark = 0
        opaque = 0
        for x in range(w):
            r, g, b, a = pix(buf, w, x, y)
            if a < 16:
                continue
            opaque += 1
            if r + g + b < 90:
                dark += 1
        if opaque > w * 0.45 and dark > opaque * 0.8:
            for x in range(w):
                set_pix(buf, w, x, y, 0, 0, 0, 0)


def column_counts(buf: bytearray, w: int, h: int, y0: int, y1: int) -> list[int]:
    counts = [0] * w
    for y in range(y0, y1):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                counts[x] += 1
    return counts


def row_counts(buf: bytearray, w: int, h: int) -> list[int]:
    counts = [0] * h
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                counts[y] += 1
    return counts


def bands(counts: list[int], min_gap: int, min_run: int) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = None
    gap = 0
    for i, n in enumerate(counts + [0]):
        if n > 2:
            if start is None:
                start = i
            gap = 0
        else:
            gap += 1
            if start is not None and gap >= min_gap:
                end = i - gap + 1
                if end - start >= min_run:
                    spans.append((start, end))
                start = None
    return spans


def content_band(buf: bytearray, w: int, h: int) -> tuple[int, int]:
    rows = row_counts(buf, w, h)
    spans = bands(rows, min_gap=8, min_run=24)
    if not spans:
        return 0, h
    # Two-row sheets (the tank) keep the top row, which still has the turret.
    if len(spans) >= 2 and spans[0][1] < h * 0.62:
        return spans[0]
    return spans[0][0], spans[-1][1]


def split_frames(buf: bytearray, w: int, h: int, y0: int, y1: int) -> list[tuple[int, int]]:
    cols = column_counts(buf, w, h, y0, y1)
    spans = bands(cols, min_gap=6, min_run=20)
    if len(spans) == 4:
        return spans
    if len(spans) > 4:
        # Merge the narrowest gap until four characters remain.
        spans = spans[:]
        while len(spans) > 4:
            gaps = [(spans[i + 1][0] - spans[i][1], i) for i in range(len(spans) - 1)]
            _, i = min(gaps)
            spans[i] = (spans[i][0], spans[i + 1][1])
            del spans[i + 1]
        return spans
    # No reliable gaps: cut the ink bounds into four equal cells.
    ink = [i for i, n in enumerate(cols) if n > 2]
    if not ink:
        raise SystemExit("sheet has no ink")
    x0, x1 = ink[0], ink[-1] + 1
    step = (x1 - x0) / 4
    return [(int(x0 + step * i), int(x0 + step * (i + 1))) for i in range(4)]


def crop(buf: bytearray, w: int, x0: int, y0: int, x1: int, y1: int) -> tuple[int, int, bytearray]:
    cw, ch = x1 - x0, y1 - y0
    out = bytearray(cw * ch * 4)
    for y in range(ch):
        src = ((y0 + y) * w + x0) * 4
        dst = y * cw * 4
        out[dst : dst + cw * 4] = buf[src : src + cw * 4]
    return cw, ch, out


def opaque_bounds(buf: bytearray, w: int, h: int) -> tuple[int, int, int, int] | None:
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                found = True
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x + 1 > maxx:
                    maxx = x + 1
                if y + 1 > maxy:
                    maxy = y + 1
    if not found:
        return None
    return minx, miny, maxx, maxy


def scale_nearest(buf: bytearray, w: int, h: int, tw: int, th: int) -> bytearray:
    out = bytearray(tw * th * 4)
    for y in range(th):
        sy = min(h - 1, int(y * h / th))
        for x in range(tw):
            sx = min(w - 1, int(x * w / tw))
            si = (sy * w + sx) * 4
            di = (y * tw + x) * 4
            out[di : di + 4] = buf[si : si + 4]
    return out


def foot_center(buf: bytearray, w: int, h: int) -> float:
    y0 = int(h * 0.72)
    sx = n = 0
    for y in range(y0, h):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                sx += x
                n += 1
    return (sx / n) if n else w / 2


def hsv_of(r: int, g: int, b: int) -> tuple[float, float, float]:
    rf, gf, bf = r / 255, g / 255, b / 255
    mx, mn = max(rf, gf, bf), min(rf, gf, bf)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == rf:
        h = (60 * ((gf - bf) / d) + 360) % 360
    elif mx == gf:
        h = (60 * ((bf - rf) / d) + 120) % 360
    else:
        h = (60 * ((rf - gf) / d) + 240) % 360
    s = 0 if mx == 0 else d / mx
    return h, s, mx


def rgb_of(h: float, s: float, v: float) -> tuple[int, int, int]:
    c = v * s
    hp = (h % 360) / 60
    x = c * (1 - abs(hp % 2 - 1))
    m = v - c
    if hp < 1:
        rf, gf, bf = c, x, 0
    elif hp < 2:
        rf, gf, bf = x, c, 0
    elif hp < 3:
        rf, gf, bf = 0, c, x
    elif hp < 4:
        rf, gf, bf = 0, x, c
    elif hp < 5:
        rf, gf, bf = x, 0, c
    else:
        rf, gf, bf = c, 0, x
    return (
        max(0, min(255, int((rf + m) * 255))),
        max(0, min(255, int((gf + m) * 255))),
        max(0, min(255, int((bf + m) * 255))),
    )


def to_enemy(buf: bytearray) -> bytearray:
    """Blue/cyan team cloth becomes the enemy red. Skin, fur, camo stay put."""
    out = bytearray(buf)
    for i in range(0, len(out), 4):
        r, g, b, a = out[i], out[i + 1], out[i + 2], out[i + 3]
        if a < 16:
            continue
        h, s, v = hsv_of(r, g, b)
        if s < 0.28 or v < 0.22:
            continue
        if 165 <= h <= 230:
            # Keep a little of the original value so a highlight stays a highlight.
            nr, ng, nb = rgb_of(4 + (h - 190) * 0.08, min(0.85, s + 0.05), v)
            out[i], out[i + 1], out[i + 2] = nr, ng, nb
    return out


def normalize(frames: list[tuple[int, int, bytearray]], target_h: int) -> list[tuple[int, int, bytes]]:
    cropped: list[tuple[int, int, bytearray, float]] = []
    max_h = 1
    for w, h, buf in frames:
        bounds = opaque_bounds(buf, w, h)
        if bounds is None:
            raise SystemExit("empty frame")
        x0, y0, x1, y1 = bounds
        cw, ch, cb = crop(buf, w, x0, y0, x1, y1)
        max_h = max(max_h, ch)
        cropped.append((cw, ch, cb, 0.0))
    scale = target_h / max_h
    scaled: list[tuple[int, int, bytearray, float]] = []
    max_w = 1
    for w, h, buf, _ in cropped:
        tw, th = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        sb = scale_nearest(buf, w, h, tw, th)
        max_w = max(max_w, tw)
        scaled.append((tw, th, sb, foot_center(sb, tw, th)))
    canvas_w = max_w + 8
    canvas_h = target_h + 6
    placed: list[tuple[int, int, bytes]] = []
    for w, h, buf, fx in scaled:
        canvas = bytearray(canvas_w * canvas_h * 4)
        ox = int(round(canvas_w / 2 - fx))
        oy = canvas_h - 3 - h
        for y in range(h):
            for x in range(w):
                dx, dy = ox + x, oy + y
                if 0 <= dx < canvas_w and 0 <= dy < canvas_h:
                    si = (y * w + x) * 4
                    if buf[si + 3] == 0:
                        continue
                    di = (dy * canvas_w + dx) * 4
                    canvas[di : di + 4] = buf[si : si + 4]
        placed.append((canvas_w, canvas_h, bytes(canvas)))
    return placed


def slice_unit(name: str) -> None:
    src = SRC / f"{name}_walk.png"
    w, h, buf = load_rgba(src)
    key_magenta(buf, w, h)
    drop_ground_lines(buf, w, h)
    y0, y1 = content_band(buf, w, h)
    spans = split_frames(buf, w, h, y0, y1)
    frames = []
    for x0, x1 in spans:
        frames.append(crop(buf, w, x0, y0, x1, y1))
    role = name.split("_", 1)[1]
    placed = normalize(frames, TARGET_H[role])
    age_role = name
    for i, (fw, fh, rgba) in enumerate(placed):
        player = OUT / f"unit_{age_role}_player_w{i}.png"
        enemy = OUT / f"unit_{age_role}_ai_w{i}.png"
        save_png(player, fw, fh, rgba)
        save_png(enemy, fw, fh, to_enemy(bytearray(rgba)))
    print(f"{name}: sheet {w}x{h} band {y0}-{y1} spans {spans} -> {placed[0][0]}x{placed[0][1]}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in UNITS:
        slice_unit(name)


if __name__ == "__main__":
    main()

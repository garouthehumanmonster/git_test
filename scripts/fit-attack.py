#!/usr/bin/env python3
"""Pin each strike pose onto the matching walk frame's canvas.

The game scales a unit from the idle frame and never resizes mid-swing.
A strike that arrives on a different canvas pops. This keys the magenta
field, scales the figure so the torso matches the walk drawing, plants
the feet on the same pixel, and clips whatever the weapon does past the
edge. Blue team cloth is shifted to red for the AI twin.
"""

from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("slice_anim", ROOT / "scripts" / "slice-anim.py")
sa = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(sa)

# Tuned after looking at the contact sheet. 1.0 is "torso width matches walk".
SCALE_BIAS = {
    "stone_swarm": 1.0,
    "stone_tank": 1.0,
    "stone_ranged": 1.0,
    "medieval_swarm": 1.0,
    "medieval_tank": 1.0,
    "medieval_ranged": 1.0,
    "modern_swarm": 1.0,
    "modern_tank": 1.0,
    "modern_ranged": 1.0,
}


def torso_width(buf: bytearray, w: int, h: int) -> float:
    """Median width through the trunk, so a raised club or a muzzle flash
    doesn't shrink the body when it sticks out of the pose."""
    rows = sa.row_counts(buf, w, h)
    ys = [y for y, n in enumerate(rows) if n > 4]
    if not ys:
        return float(max(1, w))
    y0, y1 = ys[0], ys[-1] + 1
    span = max(1, y1 - y0)
    a = y0 + int(span * 0.32)
    b = max(a + 1, y0 + int(span * 0.68))
    widths = [rows[y] for y in range(a, b) if rows[y] > 4]
    if not widths:
        return float(max(rows) or 1)
    widths.sort()
    return float(widths[len(widths) // 2])


def body_top(buf: bytearray, w: int, h: int) -> int:
    """Highest row of the figure itself. A spear shaft or bow limb is thinner
    than the trunk, so it does not pull the head off the top of the canvas."""
    rows = sa.row_counts(buf, w, h)
    peak = max(rows) or 1
    thresh = max(8.0, peak * 0.14)
    for y, n in enumerate(rows):
        if n >= thresh:
            return y
    ys = [y for y, n in enumerate(rows) if n > 2]
    return ys[0] if ys else 0


def slide_into_frame(buf: bytearray, w: int, h: int, ox: int, canvas_w: int) -> int:
    """Feet stay put. A lance that sticks past the right edge slides left
    into the empty margin instead of losing its point."""
    minx, maxx = w, 0
    found = False
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                found = True
                if x < minx:
                    minx = x
                if x + 1 > maxx:
                    maxx = x + 1
    if not found:
        return ox
    left = ox + minx
    right = ox + maxx
    if right > canvas_w and left > 0:
        ox -= min(left, right - canvas_w)
    elif left < 0 and right < canvas_w:
        ox += min(-left, canvas_w - right)
    return ox


def defringe(buf: bytearray) -> None:
    for i in range(0, len(buf), 4):
        r, g, b, a = buf[i], buf[i + 1], buf[i + 2], buf[i + 3]
        if a < 28:
            buf[i : i + 4] = b"\x00\x00\x00\x00"
            continue
        if a < 210 and g < 80 and r > 140 and b > 120 and abs(r - b) < 80:
            buf[i : i + 4] = b"\x00\x00\x00\x00"


def foot_bottom(buf: bytearray, w: int, h: int) -> int:
    for y in range(h - 1, -1, -1):
        row = y * w * 4
        for x in range(w):
            if buf[row + x * 4 + 3] > 16:
                return y
    return h - 1


def scale_lanczos(buf: bytearray, w: int, h: int, tw: int, th: int) -> bytearray:
    """Area-ish downscale. Nearest-neighbour from a 1000px painting looks
    like a mosaic next to the walk frames, which were only mildly reduced."""
    proc = subprocess.run(
        [
            "convert",
            "-size",
            f"{w}x{h}",
            "-depth",
            "8",
            "rgba:-",
            "-filter",
            "Lanczos",
            "-resize",
            f"{tw}x{th}!",
            "rgba:-",
        ],
        input=bytes(buf),
        capture_output=True,
        check=True,
    )
    expected = tw * th * 4
    if len(proc.stdout) != expected:
        raise SystemExit(f"resize produced {len(proc.stdout)} bytes, expected {expected}")
    return bytearray(proc.stdout)


def fit_unit(name: str) -> tuple[int, int, bytes]:
    walk_path = sa.OUT / f"unit_{name}_player_w0.png"
    atk_path = sa.SRC / f"{name}_atk.png"
    cw, ch, walk = sa.load_rgba(walk_path)
    aw, ah, atk = sa.load_rgba(atk_path)
    sa.key_magenta(atk, aw, ah)
    sa.drop_ground_lines(atk, aw, ah)
    bounds = sa.opaque_bounds(atk, aw, ah)
    if bounds is None:
        raise SystemExit(f"{name}: empty attack")
    x0, y0, x1, y1 = bounds
    bw, bh, body = sa.crop(atk, aw, x0, y0, x1, y1)

    # Torso width keeps a lunging body the same size as the idle. Head room
    # stops that from cropping the helmet when the idle pose is wider (shield
    # out). A raised bow is kept too, unless fitting it would shrink the body
    # by more than a step.
    walk_foot = foot_bottom(walk, cw, ch)
    room = max(1, walk_foot - 2)
    atk_torso = torso_width(body, bw, bh)
    scale_w = torso_width(walk, cw, ch) / max(1.0, atk_torso)
    head = body_top(body, bw, bh)
    scale_h = room / max(1, foot_bottom(body, bw, bh) - head + 1)
    scale_body = min(scale_w, scale_h)
    scale_full = room / max(1, bh)
    # Only shrink toward the full silhouette. A larger full-frame scale would
    # grow the body past the idle drawing, which is the pop this pass avoids.
    scale = scale_full if scale_full < scale_body and scale_full >= scale_body * 0.88 else scale_body
    scale *= SCALE_BIAS[name]
    tw = max(1, int(round(bw * scale)))
    th = max(1, int(round(bh * scale)))
    scaled = scale_lanczos(body, bw, bh, tw, th)

    ox = int(round(sa.foot_center(walk, cw, ch) - sa.foot_center(scaled, tw, th)))
    oy = int(round(walk_foot - foot_bottom(scaled, tw, th)))
    ox = slide_into_frame(scaled, tw, th, ox, cw)

    # Lanczos leaves a faint magenta mist on the silhouette. Anything that
    # thin is fringe, not ink; the walk plates are hard-edged and the hit
    # swaps straight onto them.
    defringe(scaled)
    canvas = bytearray(cw * ch * 4)
    clipped = 0
    kept = 0
    for y in range(th):
        dy = oy + y
        if dy < 0 or dy >= ch:
            clipped += tw
            continue
        for x in range(tw):
            dx = ox + x
            si = (y * tw + x) * 4
            if scaled[si + 3] < 16:
                continue
            if dx < 0 or dx >= cw:
                clipped += 1
                continue
            di = (dy * cw + dx) * 4
            canvas[di : di + 4] = scaled[si : si + 4]
            kept += 1

    player = sa.OUT / f"unit_{name}_player_atk.png"
    enemy = sa.OUT / f"unit_{name}_ai_atk.png"
    sa.save_png(player, cw, ch, bytes(canvas))
    sa.save_png(enemy, cw, ch, sa.to_enemy(bytearray(canvas)))
    print(
        f"{name}: canvas {cw}x{ch} scale {scale:.3f} placed {tw}x{th} "
        f"offset {ox},{oy} kept {kept} clipped {clipped}"
    )
    return cw, ch, bytes(canvas)


def main() -> None:
    for name in sa.UNITS:
        fit_unit(name)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Pin a fallen pose onto the idle canvas so a death does not pop the scale.

Only plates that actually read as downed are emitted. A standing redraw
would flash a new costume and then vanish, which is worse than fading
the last walk frame in place.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


sa = load("slice-anim")
fa = load("fit-attack")

# Height of the main mass, as a fraction of the idle figure. People drop.
# A mount only sinks onto its knees.
FALLEN = {
    "stone_swarm": 0.40,
    "stone_tank": 0.72,
    "stone_ranged": 0.42,
    "medieval_swarm": 0.58,
    "medieval_tank": 0.64,
    "medieval_ranged": 0.56,
    "modern_swarm": 0.40,
    "modern_tank": 0.86,
    "modern_ranged": 0.38,
}
# A prone body is longer than the idle canvas is wide. The game keeps the
# idle scale, so the plate may grow sideways. It must not grow taller.
EXPAND = {"stone_ranged", "modern_swarm"}


def main_span(buf: bytearray, w: int, h: int) -> int:
    """Tallest run of trunk-width rows. A dropped club below a gap does not
    count, or the body would be scaled to the empty air around it."""
    rows = sa.row_counts(buf, w, h)
    peak = max(rows) or 1
    thresh = max(8, peak * 0.28)
    best = 0
    run = 0
    for n in rows:
        if n >= thresh:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return max(1, best)


def fit_unit(name: str) -> None:
    walk_path = sa.OUT / f"unit_{name}_player_w0.png"
    src_path = sa.SRC / f"{name}_die.png"
    cw, ch, walk = sa.load_rgba(walk_path)
    aw, ah, die = sa.load_rgba(src_path)
    sa.key_magenta(die, aw, ah)
    sa.drop_ground_lines(die, aw, ah)
    bounds = sa.opaque_bounds(die, aw, ah)
    if bounds is None:
        raise SystemExit(f"{name}: empty death plate")
    x0, y0, x1, y1 = bounds
    bw, bh, body = sa.crop(die, aw, x0, y0, x1, y1)

    walk_bounds = sa.opaque_bounds(walk, cw, ch)
    if walk_bounds is None:
        raise SystemExit(f"{name}: empty walk frame")
    walk_h = walk_bounds[3] - walk_bounds[1]
    walk_foot = fa.foot_bottom(walk, cw, ch)
    span = main_span(body, bw, bh)
    scale_h = (walk_h * FALLEN[name]) / span
    room = max(1, walk_foot - 2)
    scale_fit_h = room / max(1, bh)
    if name in EXPAND:
        scale = min(scale_h, scale_fit_h)
        out_w = max(cw, int(round(bw * scale)) + 8)
    else:
        scale_w = (cw - 6) / max(1, bw)
        scale = min(scale_h, scale_w, scale_fit_h)
        out_w = cw
    tw = max(1, int(round(bw * scale)))
    th = max(1, int(round(bh * scale)))
    scaled = fa.scale_lanczos(body, bw, bh, tw, th)
    fa.defringe(scaled)

    ox = int(round(out_w / 2 - sa.foot_center(scaled, tw, th)))
    oy = int(round(walk_foot - fa.foot_bottom(scaled, tw, th)))
    ox = fa.slide_into_frame(scaled, tw, th, ox, out_w)

    canvas = bytearray(out_w * ch * 4)
    cw = out_w
    clipped = 0
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

    player = sa.OUT / f"unit_{name}_player_die.png"
    enemy = sa.OUT / f"unit_{name}_ai_die.png"
    sa.save_png(player, cw, ch, bytes(canvas))
    sa.save_png(enemy, cw, ch, sa.to_enemy(bytearray(canvas)))
    print(f"{name}: canvas {cw}x{ch} scale {scale:.3f} placed {tw}x{th} offset {ox},{oy} clipped {clipped}")


def main() -> None:
    for name in FALLEN:
        fit_unit(name)


if __name__ == "__main__":
    main()

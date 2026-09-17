"""
Process generated 2D character and building assets into clean, transparent,
game-ready PNG sprites with player (cyan) and AI (crimson) heraldry.
"""
import os
from collections import deque
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAIN_DIR = r"C:\Users\Divyansh\.gemini\antigravity\brain\c751ae30-81a5-4c05-8d99-29c58e8c16e4"
UNITS_DIR = os.path.join(ROOT, "public", "atlas", "units")
BASES_DIR = os.path.join(ROOT, "public", "atlas", "bases")
os.makedirs(UNITS_DIR, exist_ok=True)
os.makedirs(BASES_DIR, exist_ok=True)

SOURCES = {
    ("unit", "stone", "swarm"): "stone_clubber_sprite_1789625101827.jpg",
    ("unit", "stone", "tank"): "stone_mammoth_sprite_1789625147522.jpg",
    ("unit", "stone", "ranged"): "stone_slinger_sprite_1789625164599.jpg",
    ("unit", "medieval", "swarm"): "medieval_infantry_sprite_1789625187248.jpg",
    ("unit", "medieval", "tank"): "medieval_knight_sprite_1789625210134.jpg",
    ("unit", "medieval", "ranged"): "medieval_archer_sprite_1789625227957.jpg",
    ("unit", "modern", "swarm"): "modern_commando_sprite_1789625251816.jpg",
    ("unit", "modern", "tank"): "modern_tank_sprite_1789625270662.jpg",
    ("unit", "modern", "ranged"): "modern_sniper_sprite_1789625294204.jpg",
    ("base", "stone", ""): "stone_tower_sprite_1789625316998.jpg",
    ("base", "medieval", ""): "medieval_tower_sprite_1789625333724.jpg",
    ("base", "modern", ""): "modern_tower_sprite_1789625352816.jpg",
}

def remove_background_floodfill(img: Image.Image, threshold=238) -> Image.Image:
    """Removes outer background using flood-fill from border pixels, preserving internal whites."""
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    h, w = arr.shape[:2]

    # White mask
    is_white = (arr[:, :, 0] >= threshold) & (arr[:, :, 1] >= threshold) & (arr[:, :, 2] >= threshold)

    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    # Seed with borders
    for x in range(w):
        if is_white[0, x]:
            queue.append((0, x))
            visited[0, x] = True
        if is_white[h - 1, x]:
            queue.append((h - 1, x))
            visited[h - 1, x] = True
    for y in range(h):
        if is_white[y, 0]:
            queue.append((y, 0))
            visited[y, 0] = True
        if is_white[y, w - 1]:
            queue.append((y, w - 1))
            visited[y, w - 1] = True

    # 4-connected BFS
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    # Set outer background alpha to 0
    arr[visited, 3] = 0

    out = Image.fromarray(arr)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    return out

def recolor_to_crimson(arr: np.ndarray) -> np.ndarray:
    """Recolors cyan/blue heraldic pixels to crimson for the AI side."""
    ai_arr = arr.copy()
    # Cyan/blue detection: high green & blue, low red
    cyan_mask = (
        (ai_arr[:, :, 2] > 140) &   # high blue
        (ai_arr[:, :, 1] > 120) &   # high green
        (ai_arr[:, :, 0] < 130) &   # low red
        (ai_arr[:, :, 3] > 180)     # opaque
    )
    # Bright cyan highlight detection (cyan with some red)
    bright_cyan = (
        (ai_arr[:, :, 2] > 190) &
        (ai_arr[:, :, 1] > 180) &
        (ai_arr[:, :, 2] > ai_arr[:, :, 0] + 50) &
        (ai_arr[:, :, 3] > 180)
    )
    mask = cyan_mask | bright_cyan

    # Swap to crimson
    ai_arr[mask, 0] = np.clip(ai_arr[mask, 2].astype(int) + 30, 0, 255).astype(np.uint8)
    ai_arr[mask, 1] = (ai_arr[mask, 1] * 0.28).astype(np.uint8)
    ai_arr[mask, 2] = (ai_arr[mask, 2] * 0.28).astype(np.uint8)
    return ai_arr

def process_all():
    print("Processing assets into transparent PNGs...")
    for (category, age, role), fn in SOURCES.items():
        src_path = os.path.join(BRAIN_DIR, fn)
        if not os.path.exists(src_path):
            print(f"Warning: {src_path} not found!")
            continue

        raw = Image.open(src_path)
        cutout = remove_background_floodfill(raw)

        # Scale to clean standard game sizes (maintaining aspect ratio)
        if category == "unit":
            if role == "tank":
                target_h = 160
            else:
                target_h = 130
        else:
            target_h = 280

        ratio = target_h / cutout.height
        target_w = int(cutout.width * ratio)
        player_img = cutout.resize((target_w, target_h), Image.Resampling.LANCZOS)

        # Save player sprite
        arr = np.array(player_img)
        if category == "unit":
            out_player = os.path.join(UNITS_DIR, f"unit_{age}_{role}_player.png")
            out_ai = os.path.join(UNITS_DIR, f"unit_{age}_{role}_ai.png")
        else:
            out_player = os.path.join(BASES_DIR, f"base_{age}_player.png")
            out_ai = os.path.join(BASES_DIR, f"base_{age}_ai.png")

        player_img.save(out_player, "PNG")

        # Create and save AI crimson sprite
        ai_arr = recolor_to_crimson(arr)
        ai_img = Image.fromarray(ai_arr)
        ai_img.save(out_ai, "PNG")

        print(f"  {category} {age} {role}: {target_w}x{target_h} saved for player & ai")

    print("All sprites successfully processed!")

if __name__ == "__main__":
    process_all()

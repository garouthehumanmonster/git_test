#!/usr/bin/env python3
"""
Browser smoke test: boots the production build in a real headless browser and
drives it with real key events.

The previous version of this file hard-coded a Windows ROOT (c:\\Users\\...),
pinned Playwright to channel="msedge" and cleaned up with `taskkill`, so the
`npm run test:e2e` script could only ever run on one machine and never in CI.
Everything machine-specific is now an environment variable with a portable
default.

Environment:
  E2E_PORT              preview server port                  (default 4173)
  E2E_BROWSER_CHANNEL   Playwright channel, e.g. "msedge"    (default: bundled chromium)
  E2E_HEADLESS          "0" to watch it run                  (default "1")
  E2E_KEEP_SCREENSHOTS  "1" to write frames into docs/       (default: off)

Checks, in order:
  1. the canvas mounts at a sane size
  2. a hotkey pressed mid-match changes the speed chip
  3. a hotkey pressed during scene boot is REPLAYED, not dropped  (the reported
     bug: two `x` presses 1.5 s after the stage card never engaged)
  4. no JavaScript errors during any of it
"""

import hashlib
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# The repo is wherever this script lives — never a hard-coded absolute path.
ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("E2E_PORT", "4173"))
URL = f"http://127.0.0.1:{PORT}/"
CHANNEL = os.environ.get("E2E_BROWSER_CHANNEL") or None  # None -> bundled chromium
HEADLESS = os.environ.get("E2E_HEADLESS", "1") != "0"
KEEP = os.environ.get("E2E_KEEP_SCREENSHOTS", "0") == "1"

# Logical canvas size; the game is authored at 960x540 and letterboxed to fit.
LOGICAL_W = 960
# The speed chip is right-anchored at w-78 in canvas coordinates.
CHIP_RIGHT = LOGICAL_W - 78
CHIP_W = 96
CHIP_H = 26


def terminate_tree(proc):
    """Stop the preview server and everything it spawned.

    `npx vite preview` is npx -> node -> vite, so proc.terminate() alone reaps
    the wrapper and orphans the server — an earlier version of this script
    leaked a listening port on every run.
    """
    if hasattr(os, "killpg"):
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            proc.terminate()
    else:
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        if hasattr(os, "killpg"):
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                proc.kill()
        else:
            proc.kill()


def wait_for_server(timeout=45.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(URL, timeout=2) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.5)
    return False


def chip_clip(box):
    """Page-space rectangle covering the speed chip, from the canvas bbox."""
    scale = box["width"] / LOGICAL_W
    right = box["x"] + CHIP_RIGHT * scale
    return {
        "x": max(0, right - CHIP_W * scale),
        "y": max(0, box["y"] + 4 * scale),
        "width": CHIP_W * scale,
        "height": CHIP_H * scale,
    }


def chip_hash(page, box):
    shot = page.screenshot(clip=chip_clip(box))
    return hashlib.sha256(shot).hexdigest()[:16]


def start_match(page):
    page.goto(URL, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(1800)
    page.mouse.click(140, 236)  # stage 1 card
    page.wait_for_timeout(2500)


def main():
    print(f"[E2E] repo root: {ROOT}")
    print(f"[E2E] port: {PORT}  channel: {CHANNEL or 'bundled chromium'}  headless: {HEADLESS}")

    proc = subprocess.Popen(
        ["npx", "vite", "preview", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        # Own process group so terminate_tree() can reap the whole tree.
        start_new_session=hasattr(os, "killpg"),
    )
    failures = []
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        proc.terminate()
        print("[E2E] playwright is not installed (pip install playwright && playwright install chromium)")
        return 2

    try:
        if not wait_for_server():
            print("[E2E] FAIL: preview server never answered on port", PORT)
            return 1

        with sync_playwright() as p:
            browser = p.chromium.launch(channel=CHANNEL, headless=HEADLESS)
            page = browser.new_page(viewport={"width": 960, "height": 540})

            js_errors = []
            page.on("pageerror", lambda err: js_errors.append(str(err)))
            page.on("console", lambda m: js_errors.append(m.text) if m.type == "error" else None)

            # --- 1. canvas -------------------------------------------------
            start_match(page)
            canvas = page.wait_for_selector("canvas", timeout=5000)
            assert canvas is not None, "Phaser canvas element not found"
            box = canvas.bounding_box()
            assert box and box["width"] > 400 and box["height"] > 200, f"canvas size abnormal: {box}"
            print(f"[E2E] [OK] canvas {box['width']:.0f}x{box['height']:.0f}")

            # --- 2. a mid-match hotkey is handled --------------------------
            before = chip_hash(page, box)
            page.keyboard.press("x")
            page.wait_for_timeout(400)
            after = chip_hash(page, box)
            if before == after:
                failures.append("speed chip did not change when 'x' was pressed mid-match")
            else:
                print(f"[E2E] [OK] mid-match hotkey engaged the speed chip ({before} -> {after})")

            # --- 3. a boot-time hotkey is replayed -------------------------
            # Reload, click the stage card, and mash 'x' immediately, before
            # create() could possibly have finished building the scene.
            page.goto(URL, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(1800)
            page.mouse.click(140, 236)
            for _ in range(2):
                page.keyboard.press("x")
                page.wait_for_timeout(40)
            page.wait_for_timeout(2500)
            canvas = page.wait_for_selector("canvas", timeout=5000)
            box = canvas.bounding_box()
            booted = chip_hash(page, box)
            if booted == before:
                failures.append("presses typed during scene boot were dropped (chip still at 1x)")
            else:
                print(f"[E2E] [OK] boot-time presses were replayed ({before} -> {booted})")

            if KEEP:
                out = ROOT / "docs" / "live_battle_e2e.png"
                page.screenshot(path=str(out))
                print(f"[E2E] [OK] battle frame written to {out}")

            # --- 4. no JS errors ------------------------------------------
            critical = [e for e in js_errors if "AudioContext" not in e]
            if critical:
                failures.append(f"{len(critical)} JS error(s): {critical[:3]}")
            else:
                print("[E2E] [OK] 0 JavaScript runtime errors")

            browser.close()
    finally:
        terminate_tree(proc)

    if failures:
        print("[E2E FAILED]")
        for f in failures:
            print("  -", f)
        return 1
    print("[E2E PASSED] real browser render + input cycle confirmed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

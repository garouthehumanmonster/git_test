#!/usr/bin/env python3
"""Scripted playthrough: drives a real match in a browser and captures frames.

Unlike `e2e-browser-check.py` this is not a pass/fail gate — it plays a
deliberate 25-cycle match (turret, upgrades, War Cry, Chrono Surge,
superweapon, evolves) and screenshots it, so the frames in `docs/playtest/`
can be eyeballed for presentation regressions. Console errors are reported;
set `PLAYTEST_FAIL_ON_ERROR=1` to turn them into a non-zero exit.

Everything machine-specific is an environment variable with a portable
default. This file used to hard-code a Windows project path, pin Playwright to
channel="msedge" and clean up with `taskkill`, so it could only ever run on one
machine.

Environment:
  PLAYTEST_PORT            preview server port          (default 4173)
  PLAYTEST_BROWSER_CHANNEL Playwright channel, e.g. "msedge"
                                                     (default: bundled chromium)
  PLAYTEST_HEADLESS        "0" to watch it play         (default "1")
  PLAYTEST_SHOTS_DIR       where to write frames  (default docs/playtest)
  PLAYTEST_FAIL_ON_ERROR   "1" to exit non-zero on console/page errors
"""

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

# The repo is wherever this script lives — never a hard-coded absolute path.
ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PLAYTEST_PORT", "4173"))
URL = f"http://127.0.0.1:{PORT}/"
CHANNEL = os.environ.get("PLAYTEST_BROWSER_CHANNEL") or None  # None -> bundled chromium
if CHANNEL is None and sys.platform == "win32" and os.path.exists(
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
):
    CHANNEL = "msedge"
HEADLESS = os.environ.get("PLAYTEST_HEADLESS", "1") != "0"
SHOTS_DIR = Path(os.environ.get("PLAYTEST_SHOTS_DIR", str(ROOT / "docs" / "playtest")))
FAIL_ON_ERROR = os.environ.get("PLAYTEST_FAIL_ON_ERROR", "0") == "1"

# Logical canvas size; the game is authored at 960x540 and letterboxed to fit.
VIEWPORT = {"width": 960, "height": 540}
# Stage 1 card, in logical canvas coordinates.
STAGE_CARD = (140, 236)
# Frames worth keeping, keyed by play cycle.
SHOT_CYCLES = (1, 5, 10, 15, 20, 25)


def terminate_tree(proc: subprocess.Popen) -> None:
    """Stop the preview server and anything it spawned, on any platform."""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.call(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            # The shell that launched vite is not vite; kill the whole group.
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def server_ready(timeout_s: float = 20.0) -> bool:
    """Poll the preview server with the stdlib — no `requests` dependency."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(URL, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
            time.sleep(0.4)
    return False


def main() -> int:
    print("[PLAY-TEST] Building the production bundle...")
    subprocess.run("npm run build", cwd=ROOT, shell=True, check=True)

    print(f"[PLAY-TEST] Starting Vite preview on port {PORT}...")
    popen_kwargs = {}
    if os.name != "nt":
        popen_kwargs["start_new_session"] = True  # own process group, so we can kill it
    proc = subprocess.Popen(
        f"npx vite preview --port {PORT} --strictPort",
        cwd=ROOT,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        **popen_kwargs,
    )

    try:
        if not server_ready():
            print("[ERROR] Vite preview server failed to start.")
            return 1

        print(f"[PLAY-TEST] Server ready at {URL} Launching browser...")
        errors: list[str] = []
        with sync_playwright() as p:
            launch_kwargs = {"headless": HEADLESS}
            if CHANNEL:
                launch_kwargs["channel"] = CHANNEL
            browser = p.chromium.launch(**launch_kwargs)
            page = browser.new_page(viewport=VIEWPORT)

            console_logs: list[str] = []
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
            page.on("pageerror", lambda err: console_logs.append(f"[PAGEERROR] {err}"))

            print("[PLAY-TEST] Loading game...")
            page.goto(URL, wait_until="domcontentloaded", timeout=15000)
            page.wait_for_timeout(2000)

            print("[PLAY-TEST] Clicking Stage 1 card...")
            page.mouse.click(*STAGE_CARD)
            page.wait_for_timeout(1000)

            # 2x so the playthrough covers real match time in reasonable wall time.
            page.keyboard.press("x")
            page.wait_for_timeout(500)

            SHOTS_DIR.mkdir(parents=True, exist_ok=True)

            print("[PLAY-TEST] Playing 25 cycles...")
            for cycle in range(1, 26):
                if cycle == 2:
                    print("  -> 't' build Turret")
                    page.keyboard.press("t")

                # Mixed composition rather than one role spammed.
                if cycle % 2 == 0:
                    page.keyboard.press("1")  # swarm
                elif cycle % 3 == 0:
                    page.keyboard.press("2")  # tank
                else:
                    page.keyboard.press("3")  # ranged

                if cycle == 6:
                    print("  -> 'u' Forge upgrade")
                    page.keyboard.press("u")
                if cycle == 8:
                    print("  -> 'y' Armor upgrade")
                    page.keyboard.press("y")
                if cycle in (5, 15):
                    print("  -> 'w' War Cry rally")
                    page.keyboard.press("w")
                if cycle in (10, 20):
                    print("  -> 'q' Chrono Surge warp")
                    page.keyboard.press("q")
                if cycle in (12, 22):
                    print("  -> Space superweapon")
                    page.keyboard.press(" ")
                if cycle % 4 == 0:
                    page.keyboard.press("e")  # evolve

                page.wait_for_timeout(1500)

                if cycle in SHOT_CYCLES:
                    shot = SHOTS_DIR / f"playtest_cycle_{cycle}.png"
                    page.screenshot(path=str(shot))
                    print(f"  [SCREENSHOT] {shot.relative_to(ROOT)}")

            print("[PLAY-TEST] Playthrough complete.")

            errors.extend(line for line in console_logs if "[error]" in line or "[PAGEERROR]" in line)
            print(f"[PLAY-TEST] Console: {len(console_logs)} logs, {len(errors)} errors")
            for err in errors[:10]:
                print(f"  {err}")

            browser.close()

        return 1 if (errors and FAIL_ON_ERROR) else 0
    finally:
        terminate_tree(proc)


if __name__ == "__main__":
    sys.exit(main())

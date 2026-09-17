import subprocess
import time
import sys
import os
import requests
from playwright.sync_api import sync_playwright

ROOT = r"c:\Users\Divyansh\Desktop\Projects\timeline-war"
PORT = 4173
URL = f"http://127.0.0.1:{PORT}"

print("[PLAY-TEST] Building and starting Vite preview server...")
subprocess.run("npm run build", cwd=ROOT, shell=True, check=True)

proc = subprocess.Popen(
    f"npx vite preview --port {PORT} --strictPort",
    cwd=ROOT,
    shell=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

try:
    ready = False
    for _ in range(25):
        time.sleep(0.4)
        try:
            r = requests.get(URL, timeout=1)
            if r.status_code == 200:
                ready = True
                break
        except Exception:
            pass

    if not ready:
        print("[ERROR] Vite preview server failed to start.")
        sys.exit(1)

    print(f"[PLAY-TEST] Server ready at {URL}. Launching browser...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 960, "height": 540})
        
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGEERROR] {err}"))

        print("[PLAY-TEST] Loading game...")
        page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(2000)

        # 1. Click Stage 1 Card
        print("[PLAY-TEST] Clicking Stage 1 Card...")
        page.mouse.click(140, 236)
        page.wait_for_timeout(1000)

        # Set game speed to 2x for efficient playtesting
        page.keyboard.press("x")
        page.wait_for_timeout(500)

        shots_dir = os.path.join(ROOT, "docs", "playtest")
        os.makedirs(shots_dir, exist_ok=True)

        print("[PLAY-TEST] Playing match for 40 simulated seconds...")
        # Simulate active player playing smart RTS strategy
        for cycle in range(1, 26):
            # Try to build turret early
            if cycle == 2:
                print("  -> Pressing 't' to build Turret...")
                page.keyboard.press("t")
            
            # Spawn swarm or tank
            if cycle % 2 == 0:
                page.keyboard.press("1") # Swarm
            elif cycle % 3 == 0:
                page.keyboard.press("2") # Tank
            else:
                page.keyboard.press("3") # Ranged

            # Upgrades
            if cycle == 6:
                print("  -> Pressing 'u' for Forge upgrade...")
                page.keyboard.press("u")
            if cycle == 8:
                print("  -> Pressing 'y' for Armor upgrade...")
                page.keyboard.press("y")
            
            # War Cry
            if cycle == 5 or cycle == 15:
                print("  -> Pressing 'w' for War Cry Rally...")
                page.keyboard.press("w")

            # Chrono Surge
            if cycle == 10 or cycle == 20:
                print("  -> Pressing 'q' for Chrono Surge Warp...")
                page.keyboard.press("q")

            # Superweapon
            if cycle == 12 or cycle == 22:
                print("  -> Pressing 'Space' for Ultimate...")
                page.keyboard.press(" ")

            # Evolve
            if cycle % 4 == 0:
                page.keyboard.press("e")

            page.wait_for_timeout(1500)

            if cycle in [1, 5, 10, 15, 20, 25]:
                shot_path = os.path.join(shots_dir, f"playtest_cycle_{cycle}.png")
                page.screenshot(path=shot_path)
                print(f"  [SCREENSHOT] Captured {shot_path}")

        print("[PLAY-TEST] Playtest match simulation completed.")
        
        # Check logs
        errors = [l for l in console_logs if "[error]" in l or "[PAGEERROR]" in l]
        print(f"[PLAY-TEST] Console summary: {len(console_logs)} total logs, {len(errors)} errors.")
        for err in errors[:10]:
            print(f"  {err}")

        browser.close()

finally:
    subprocess.call(f"taskkill /F /T /PID {proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

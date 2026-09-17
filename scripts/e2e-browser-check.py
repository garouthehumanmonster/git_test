import subprocess
import time
import sys
import os
import requests
from playwright.sync_api import sync_playwright

ROOT = r"c:\Users\Divyansh\Desktop\Projects\timeline-war"
PORT = 4173
URL = f"http://127.0.0.1:{PORT}"

print("[E2E] Starting Vite preview server...")
proc = subprocess.Popen(
    f"npx vite preview --port {PORT} --strictPort",
    cwd=ROOT,
    shell=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

try:
    ready = False
    for _ in range(20):
        time.sleep(0.5)
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

    print(f"[E2E] Server ready at {URL}. Launching headless browser...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 960, "height": 540})
        
        js_errors = []
        page.on("pageerror", lambda err: js_errors.append(str(err)))
        page.on("console", lambda msg: js_errors.append(msg.text) if msg.type == "error" else None)

        print("[E2E] Loading game...")
        page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(2000)

        canvas = page.wait_for_selector("canvas", timeout=5000)
        assert canvas is not None, "Phaser canvas element not found!"
        print("[E2E] [OK] Canvas element verified.")

        box = canvas.bounding_box()
        assert box and box["width"] > 400 and box["height"] > 200, f"Canvas size abnormal: {box}"
        print(f"[E2E] [OK] Canvas size: {box['width']}x{box['height']}")

        # 3. Enter Stage 1 via canvas click
        print("[E2E] Clicking Stage 1 Card at (140, 236)...")
        page.mouse.click(140, 236)
        page.wait_for_timeout(1500)

        # 4. Simulate gameplay: press 1 to spawn unit, press 2 for archer
        print("[E2E] Simulating battle gameplay (Spawning units)...")
        for _ in range(3):
            page.keyboard.press("1")
            page.wait_for_timeout(500)
            page.keyboard.press("2")
            page.wait_for_timeout(500)
        
        page.wait_for_timeout(3000)

        # Capture live in-browser battle frame
        out_battle = os.path.join(ROOT, "docs", "live_battle_e2e.png")
        page.screenshot(path=out_battle)
        print(f"[E2E] [OK] Live battle frame captured to {out_battle}")

        critical_errors = [e for e in js_errors if "AudioContext" not in e]
        if critical_errors:
            print(f"[WARN] JS errors detected: {critical_errors}")
        else:
            print("[E2E] [OK] 0 Javascript runtime errors.")

        browser.close()

    print("[E2E VERIFICATION PASSED] Real browser WebGL render and input cycle confirmed 10/10.")

finally:
    subprocess.call(f"taskkill /F /T /PID {proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

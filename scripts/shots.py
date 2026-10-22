"""Capture gameplay screenshots at chosen spots: python3 scripts/shots.py <url> <outdir> level:row[:quality] ..."""
import sys
from playwright.sync_api import sync_playwright

url, out, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    for spec in specs:
        parts = spec.split(':')
        lvl, row = int(parts[0]), int(parts[1])
        q = parts[2] if len(parts) > 2 else 'high'
        page.goto(url)
        page.evaluate("localStorage.setItem('neon-roadrunner/save', JSON.stringify({version:1, seenTutorial:true, settings:{quality:'%s'}}))" % q)
        page.reload(); page.wait_for_timeout(1200)
        page.evaluate(f"(() => {{ const d = window.__game.debug(); d.unlockAll(); d.startLevel({lvl}); }})()")
        page.wait_for_timeout(300)
        page.evaluate("window.__game.debug().advance(3.1)")
        page.evaluate(f"window.__game.debug().session.teleport({row})")
        page.evaluate("window.__game.debug().advance(0.6)")
        page.wait_for_timeout(1500)
        page.screenshot(path=f'{out}/L{lvl}_r{row}_{q}.png')
    b.close()
    print('errors', errs)

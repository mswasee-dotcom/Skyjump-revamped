"""Capture the same scenes in each visual style: python3 scripts/looks.py <url> <outdir>"""
import sys
from playwright.sync_api import sync_playwright

url, out = sys.argv[1], sys.argv[2]
LOOKS = ['arcade']
SCENES = [(1, 40), (3, 2), (6, 1)]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    errs = []
    for look in LOOKS:
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1'); localStorage.setItem('neon-roadrunner/save', JSON.stringify({version:1, seenTutorial:true, settings:{quality:'high', look:'%s'}})); }" % look)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(url); page.wait_for_timeout(1500)
        page.keyboard.press('Enter'); page.wait_for_timeout(3500)
        page.screenshot(path=f'{out}/{look}_menu.png')
        for lvl, row in SCENES:
            page.evaluate(f"(() => {{ const d = window.__game.debug(); d.unlockAll(); d.startLevel({lvl}); }})()")
            page.wait_for_timeout(300)
            page.evaluate("window.__game.debug().advance(3.1, 0, 0)")
            page.evaluate(f"window.__game.debug().session.teleport({row})")
            page.evaluate("window.__game.debug().advance(0.5, 0, 0)")
            page.wait_for_timeout(1800)
            page.screenshot(path=f'{out}/{look}_L{lvl}.png')
        ctx.close()
    b.close()
    print('errors', errs)

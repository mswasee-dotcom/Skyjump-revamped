"""Browser smoke test: drives the built game in headless Chromium and captures screenshots + console errors.
Usage: python3 scripts/smoke.py <url> <outdir>
"""
import sys, json, time
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
out = sys.argv[2] if len(sys.argv) > 2 else '.'
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(url)
    page.wait_for_timeout(2500)
    page.screenshot(path=f'{out}/01_title.png')
    page.keyboard.press('Enter')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{out}/02_menu.png')
    print('mode after start:', page.evaluate('window.__game.debug().mode'))
    # Level select
    page.click('text=Level select')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{out}/03_levels.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('text=Garage')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{out}/04_garage.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    page.click('text=How to play')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{out}/05_howto.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    page.click('text=Settings')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{out}/06_settings.png')
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    # Start level 1
    page.click('text=Start campaign')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{out}/07_countdown.png')
    page.wait_for_timeout(2500)
    st = page.evaluate('(() => { const s = window.__game.debug().session; return {phase: s.phase, d: s.state.d, speed: s.state.speed, x: s.state.x}; })()')
    print('after countdown:', st)
    page.keyboard.down('d'); page.wait_for_timeout(250); page.keyboard.up('d')
    page.wait_for_timeout(600)
    page.screenshot(path=f'{out}/08_racing.png')
    st2 = page.evaluate('(() => { const s = window.__game.debug().session; return {phase: s.phase, d: s.state.d, x: s.state.x, hud: s.hud()}; })()')
    print('racing:', json.dumps(st2))
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{out}/09_pause.png')
    print('mode paused:', page.evaluate('window.__game.debug().mode'))
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    print('mode resumed:', page.evaluate('window.__game.debug().mode'))
    # Fly off the road to test failure
    page.keyboard.down('a'); page.wait_for_timeout(1500); page.keyboard.up('a')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{out}/10_fall.png')
    st3 = page.evaluate('(() => { const s = window.__game.debug().session; return {phase: s.phase, lives: s.lives}; })()')
    print('after fall:', st3)
    page.wait_for_timeout(2500)
    print('after respawn:', page.evaluate('(() => { const s = window.__game.debug().session; return {phase: s.phase, lives: s.lives, d: s.state.d}; })()'))
    b.close()

print('ERRORS:', len(errors))
for e in errors[:30]:
    print('  ', e)

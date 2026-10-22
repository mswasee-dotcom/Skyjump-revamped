"""Browser gameplay test. Uses the game's debug stepper so slow software-GL browsers still cover
real game time. Checks: race start, steering, throttle, jump, pause/resume, fall + respawn,
finish + results + save, restart, quit, persistence after reload, endless mode, game over.
Usage: python3 scripts/smoke_play.py <url> <screenshot dir>
"""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
out = sys.argv[2] if len(sys.argv) > 2 else '.'
errors = []
results = []
LOW = "localStorage.setItem('neon-roadrunner/save', JSON.stringify({version:1, seenTutorial:true, settings:{quality:'low', musicVolume:0.6, sfxVolume:0.8}}));"

def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  {info}' if info != '' else ''))

def S(page, expr):
    return page.evaluate(f'(() => {{ const g = window.__game.debug(); const s = g.session; return {expr}; }})()')

def adv(page, sec, steer=0, thr=0, jump=0):
    page.evaluate(f'window.__game.debug().advance({sec},{steer},{thr},{jump})')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 960, 'height': 540})
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(url)
    page.evaluate(LOW)
    page.reload()
    page.wait_for_timeout(1500)
    check('title screen shown', page.locator('.press-start').count() == 1)
    page.keyboard.press('Enter')
    page.wait_for_timeout(800)
    check('main menu after key press', S(page, 'g.mode') == 'menu')
    check('endless locked before clearing sector 1', page.locator('button[data-act=endless]').is_disabled())
    page.click('text=Start campaign')
    page.wait_for_timeout(300)
    check('level 1 session starts in countdown', S(page, 's && s.phase') == 'countdown')
    adv(page, 3.2)
    check('countdown ends -> racing', S(page, 's.phase') == 'racing')
    d0 = S(page, 's.state.d'); adv(page, 1.0); d1 = S(page, 's.state.d')
    check('vehicle moves forward automatically', d1 - d0 > 12, f'{d1 - d0:.1f} units/s')
    x0 = S(page, 's.state.x'); adv(page, 0.25, steer=1); x1 = S(page, 's.state.x')
    check('steering right moves right', x1 - x0 > 0.3, f'dx={x1 - x0:.2f}')
    adv(page, 0.25, steer=-1)
    v0 = S(page, 's.state.speed'); adv(page, 0.8, thr=1); v1 = S(page, 's.state.speed')
    check('accelerate increases speed', v1 > v0 + 5, f'{v0:.1f} -> {v1:.1f}')
    adv(page, 0.6, thr=-1); v2 = S(page, 's.state.speed')
    check('brake reduces speed', v2 < v1 - 5, f'{v1:.1f} -> {v2:.1f}')
    page.evaluate('window.__game.debug().session.queueJump()')
    adv(page, 0.1)
    check('jump leaves the ground', not S(page, 's.state.grounded') and S(page, 's.state.y') > 0.3)
    adv(page, 0.8)
    page.screenshot(path=f'{out}/20_race.png')
    check('HUD time running', S(page, 's.raceTime') > 2)
    page.keyboard.press('Escape'); page.wait_for_timeout(500)
    check('Escape pauses', S(page, 'g.mode') == 'paused')
    page.screenshot(path=f'{out}/21_pause.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(500)
    check('Escape resumes', S(page, 'g.mode') == 'playing')
    lives = S(page, 's.lives')
    adv(page, 2.0, steer=-1)
    check('steering off the road drops into the void', S(page, 's.phase') in ('dead', 'respawn'))
    adv(page, 2.0)
    check('crash costs a life and respawns', S(page, 's.lives') == lives - 1 and S(page, 's.phase') in ('respawn', 'racing'), S(page, '{lives: s.lives, phase: s.phase}'))
    adv(page, 1.5)
    check('racing again after respawn', S(page, 's.phase') == 'racing' and S(page, 's.state.alive'))
    page.evaluate('(() => { const s = window.__game.debug().session; const fr = s.track.finishRow; s.state.d = (fr - 4) * 2; s.state.x = 0; s.state.y = s.track.rowY(fr-4); s.state.vy = 0; s.state.grounded = true; })()')
    adv(page, 3.0)
    page.wait_for_timeout(500)
    check('crossing the finish shows results', S(page, 'g.mode') == 'results' and page.locator('.results').count() == 1)
    page.screenshot(path=f'{out}/23_results.png')
    rec = S(page, 'g.save.levels["1"]')
    check('completion recorded', rec['completed'] and rec['bestTime'] > 0 and rec['medal'] >= 1, rec)
    page.keyboard.press('KeyR'); page.wait_for_timeout(500)
    check('R restarts from results', S(page, 'g.mode') == 'playing' and S(page, 's.phase') == 'countdown')
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    page.click('text=Quit to menu'); page.wait_for_timeout(800)
    check('quit returns to menu', S(page, 'g.mode') == 'menu')
    page.reload(); page.wait_for_timeout(1500)
    saved = page.evaluate("JSON.parse(localStorage.getItem('neon-roadrunner/save'))")
    check('progress persists after reload', saved['levels']['1']['completed'] and saved['stats']['attempts'] >= 2, saved['stats'])
    page.keyboard.press('Enter'); page.wait_for_timeout(800)
    check('endless unlocked after sector 1', not page.locator('button[data-act=endless]').is_disabled())
    page.click('button[data-act=endless]'); page.wait_for_timeout(300)
    adv(page, 3.2); adv(page, 6, jump=0)
    st = S(page, '{phase: s.phase, d: s.state.d, len: s.track.length, lives: s.lives}')
    check('endless mode runs and generates track ahead', st['len'] > st['d'] / 2 + 100, st)
    page.screenshot(path=f'{out}/25_endless.png')
    # Lose all lives -> game over
    for _ in range(4):
        adv(page, 3.0, steer=-1)
        adv(page, 2.5)
    check('losing all lives ends the run', S(page, 'g.mode') == 'gameover', S(page, '{mode: g.mode, lives: s.lives}'))
    page.wait_for_timeout(400)
    page.screenshot(path=f'{out}/26_gameover.png')
    sv = page.evaluate("JSON.parse(localStorage.getItem('neon-roadrunner/save'))")
    check('endless best distance saved', sv['endless']['bestDistance'] > 0, sv['endless'])
    page.click('text=Menu'); page.wait_for_timeout(600)
    # Settings change behaviour: steering sensitivity
    page.click('text=Settings'); page.wait_for_timeout(500)
    page.evaluate("(() => { const el = document.querySelector('#s-steerSensitivity'); el.value = '1.4'; el.dispatchEvent(new Event('input', {bubbles:true})); })()")
    check('settings slider updates save', S(page, 'g.save.settings.steerSensitivity') == 1.4)
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    page.click('text=Continue'); page.wait_for_timeout(300)
    adv(page, 3.3)
    x0 = S(page, 's.state.x'); adv(page, 0.5, steer=1); x1 = S(page, 's.state.x')
    check('higher steering sensitivity steers faster', x1 - x0 > 2.6, f'dx={x1 - x0:.2f}')
    b.close()

print('ERRORS:', len(errors))
for e in errors[:20]:
    print('  ', e)
failed = [n for n, ok in results if not ok]
print(f'{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed or errors else 0)

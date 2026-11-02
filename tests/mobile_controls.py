"""Local Chromium checks for touch ownership, zoom, comfort, and responsive HUD.
Run with app served on 127.0.0.1:8017; requires Python Playwright.
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    page = context.new_page()
    # Render the initial scene once; gesture assertions do not benchmark GPU animation.
    page.add_init_script('window.requestAnimationFrame = () => 0')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    page.goto('http://127.0.0.1:8017', wait_until='networkidle')
    page.wait_for_function('typeof cameraDistance !== "undefined"')
    print('Mobile scene initialized', flush=True)
    assert page.evaluate('comfortMode') is True
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    original = page.evaluate('cameraDistance')
    page.locator('#zoomInBtn').tap()
    assert page.evaluate('cameraDistance') < original
    page.locator('#zoomOutBtn').tap()
    assert abs(page.evaluate('cameraDistance') - original) < 0.001
    page.locator('#moreActionsBtn').tap()
    assert page.locator('#extraActions').is_visible()
    for button in page.locator('#extraActions button').all():
        rect = button.bounding_box()
        assert rect['width'] >= 44 and rect['height'] >= 44
    page.locator('#moreActionsBtn').tap()
    assert not page.locator('#extraActions').is_visible()
    cdp = context.new_cdp_session(page)
    def touch(kind, points):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [dict(id=i, x=x, y=y) for i,x,y in points]})
    yaw = page.evaluate('cameraYaw')
    touch('touchStart', [(1, 190, 350)])
    touch('touchMove', [(1, 230, 350)])
    assert abs(page.evaluate('cameraYaw') - yaw + 0.12) < 0.01
    assert not page.evaluate('joystickState.active')
    touch('touchEnd', [])
    yaw = page.evaluate('cameraYaw')
    distance = page.evaluate('cameraDistance')
    touch('touchStart', [(1, 150, 350), (2, 250, 350)])
    touch('touchMove', [(1, 120, 350), (2, 280, 350)])
    assert page.evaluate('cameraDistance') < distance
    assert abs(page.evaluate('cameraYaw') - yaw) < 0.001
    touch('touchEnd', [])
    box = page.locator('#joystickBase').bounding_box()
    x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
    touch('touchStart', [(1, x, y)])
    assert page.evaluate('joystickState.active')
    assert page.evaluate('joystickState.x === 0 && joystickState.y === 0')
    distance = page.evaluate('cameraDistance')
    touch('touchStart', [(1, x, y), (2, 200, 350)])
    touch('touchMove', [(1, x+25, y), (2, 220, 350)])
    assert page.evaluate('joystickState.x') > 0
    assert abs(page.evaluate('cameraDistance') - distance) < 0.001
    touch('touchCancel', [])
    assert not page.evaluate('joystickState.active')
    assert page.evaluate('cameraPointers.size') == 0
    page.locator('#resetCameraBtn').tap()
    assert abs(page.evaluate('cameraYaw')) < 0.001
    page.evaluate("updateDrunkVisuals(80, 'dang_nhau')")
    assert page.evaluate("getComputedStyle(document.body).animationName") == 'none'
    assert page.evaluate("getComputedStyle(document.body).filter") == 'none'
    page.evaluate("document.body.classList.remove('drunk-wobble-3')")
    for width, height in [(320, 568), (390, 844), (844, 390), (1440, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, height)
        for selector in ['#zoomInBtn', '#zoomOutBtn', '#resetCameraBtn', '#comfortBtn']:
            rect = page.locator(selector).bounding_box()
            assert rect['x'] >= 0 and rect['y'] >= 0 and rect['x'] + rect['width'] <= width + 1
        if width in (320, 390, 844):
            for selector in ['#cheerBtn', '#sitStandBtn', '#shoutToggleBtn', '#joystickZone']:
                rect = page.locator(selector).bounding_box()
                assert rect['x'] >= 0 and rect['x'] + rect['width'] <= width + 1, (selector, rect)
        if width == 390:
            page.evaluate('renderer.render(scene, camera)')
            page.screenshot(path='tests/mobile-preview.png', timeout=60000)
    assert not errors, errors
    print('PASS: zoom buttons, real multi-touch pinch/rotation, joystick isolation/cancellation, comfort CSS, drawer and 4 viewports; no JS errors')
    context.close()
    desktop = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = desktop.new_page()
    page.add_init_script('window.requestAnimationFrame = () => 0')
    page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8017', wait_until='networkidle')
    assert page.evaluate('comfortMode') is False
    assert page.locator('#billBtn').is_visible()
    assert not page.locator('#moreActionsBtn').is_visible()
    distance = page.evaluate('cameraDistance')
    page.mouse.move(700, 400)
    page.mouse.wheel(0, 100)
    page.wait_for_function(f'cameraDistance > {distance}')
    page.mouse.down()
    page.mouse.move(740, 400)
    page.mouse.up()
    assert page.evaluate('cameraYaw') < 0
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function('comfortMode === true')
    page.evaluate('animate()')
    assert not errors, errors
    print('PASS: desktop wheel/drag, secondary actions, reduced-motion preference and animation frame')
    desktop.close()
    browser.close()

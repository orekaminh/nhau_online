"""Integration checks for the mobile action rail, WC room and pub animals.
Start `python -m uvicorn app:app --host 127.0.0.1 --port 8017` first.
Uses a local multiplayer server; scene stepping is deterministic, not an FPS test.
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.add_init_script('window.requestAnimationFrame = () => 0')
    page.route('https://cdnjs.cloudflare.com/**', lambda route: route.abort())
    page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8017', wait_until='networkidle')
    page.wait_for_function('localCharacter && selfMember && ws.readyState === WebSocket.OPEN')
    page.evaluate('window.drawScene = renderer.render.bind(renderer); renderer.render = () => {}; clock.getDelta = () => 1/60')
    print('Scene and multiplayer connected', flush=True)
    for width, height in [(320, 568), (390, 844), (844, 390)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.locator('#moreActionsBtn').tap()
        rail = page.locator('#extraActions')
        rect = rail.bounding_box()
        assert (rect['y'] + rect['height'] < height / 2 if height > width else rect['y'] > height * 0.7), (width, rect)
        assert rect['x'] >= 0 and rect['x'] + rect['width'] <= width
        assert rail.evaluate('(e) => e.scrollWidth > e.clientWidth')
        # Swipe the rail; this must not rotate the camera or move the player.
        original_yaw = page.evaluate('cameraYaw')
        session = context.new_cdp_session(page)
        x, y = rect['x'] + rect['width'] - 20, rect['y'] + 30
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x':x,'y':y,'id':1}]})
        for offset in [25, 60, 100, 140]:
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x':x-offset,'y':y,'id':1}]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        page.wait_for_function('document.getElementById("extraActions").scrollLeft > 0')
        assert page.evaluate('cameraYaw') == original_yaw
        assert not page.evaluate('joystickState.active')
        page.locator('#moreActionsBtn').tap()
    page.set_viewport_size({'width': 390, 'height': 844})
    # Menu closes after an action; pets react without blocking movement.
    page.locator('#moreActionsBtn').tap()
    page.locator('#extraActions').evaluate('(e) => e.scrollLeft = 0')
    page.locator('#eatSnackBtn').tap()
    assert not page.locator('#extraActions').is_visible()
    assert page.evaluate('pubDetails.animals.every(a => a.reactionUntil > clock.elapsedTime)')
    # Door opening permits entry; solid segments and furniture reject walking through them.
    assert page.evaluate('pubDetails.move(-16.4,-2.7,-3,0).x < -18.5')
    assert page.evaluate('pubDetails.move(-16.4,-0.5,-3,0).x > -17.2')
    assert page.evaluate('pubDetails.move(-20.2,-2.7,-10,0).x > -22.6')
    # Enter through the visible contextual action, then use the actual multiplayer WC flow.
    page.evaluate('localPlayerState.x=-16.4; localPlayerState.z=-2.7; updateWCControls()')
    assert page.locator('#wcUseBtn').inner_text() == '🚪 Vào WC [P]'
    page.locator('#wcUseBtn').tap()
    page.wait_for_function('pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    assert page.evaluate('pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    assert page.locator('#wcExitBtn').is_visible()
    page.evaluate('toggleScenicView()')
    assert page.evaluate('isScenicView') is False
    page.evaluate('sendAction({action:"cheer"})')
    page.wait_for_function('selfMember.bladder_level > 0')
    page.locator('#wcUseBtn').tap()
    page.wait_for_function('selfMember.bladder_level === 0')
    assert page.evaluate('peeParticles.length') == 0
    page.evaluate('for(let i=0;i<45;i++) animate(); drawScene(scene,camera)')
    assert page.evaluate('camera.position.y > 4 && camera.position.x < -18')
    page.screenshot(path='tests/wc-preview.png', timeout=60000)
    # Mirror/toilet/floor are actual geometry and illumination is inside the room.
    assert page.evaluate('pubDetails.room.children.some(o=>o.isPointLight && o.intensity>0)')
    assert page.evaluate('pubDetails.room.children.length') > 35
    assert 'Rửa tay' in page.locator('#wcUseBtn').inner_text()
    page.locator('#wcUseBtn').tap()
    assert page.locator('#wcUseBtn').is_disabled()
    assert page.evaluate('wcHygiene') == 'clean'
    page.locator('#wcExitBtn').tap()
    page.wait_for_function('!pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    assert not page.evaluate('pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    assert page.evaluate('wcHygiene') == 'ready'
    # Walking through the door while sightseeing returns to the indoor camera.
    page.evaluate('animate(); isScenicView=true; localPlayerState.x=-19.2; localPlayerState.z=-2.7; sendPlayerPosition(); animate()')
    page.wait_for_function('wcOccupant === clientId')
    assert page.evaluate('isScenicView') is False
    page.locator('#wcExitBtn').tap()
    page.wait_for_function('!pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    # Walking, resting and reaction animations stay within safe margins outside the seats.
    page.evaluate('pubDetails.update(2)')
    before = page.evaluate('pubDetails.animals.map(a=>a.root.position.x)')
    page.evaluate('pubDetails.update(5)')
    after = page.evaluate('pubDetails.animals.map(a=>a.root.position.x)')
    assert before != after
    page.evaluate('pubDetails.react("cheer",100); pubDetails.update(101)')
    assert page.evaluate('pubDetails.animals.every(a=>a.bubble.visible)')
    page.evaluate('pubDetails.update(104)')
    assert page.evaluate('pubDetails.animals.every(a=>!a.bubble.visible)')
    page.evaluate('localPlayerState.x=-7; localPlayerState.z=2; cameraTargetReady=false; cameraDistance=7; for(let i=0;i<30;i++) animate(); drawScene(scene,camera)')
    page.locator('#moreActionsBtn').tap()
    page.screenshot(path='tests/pub-pets-preview.png', timeout=60000)
    assert not errors, errors
    print('PASS: action rail scroll at 3 mobile viewports, action auto-close, WC doorway/collisions, enter/use/exit over WebSocket, lit geometry, pet movement/reactions; no JS errors')
    browser.close()

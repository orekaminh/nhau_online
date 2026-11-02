"""Two separate browser players: free text, typing isolation and private WC."""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader'])
    room = 'qa_social_' + str(int(time.time()))
    contexts, pages, errors = [], [], []
    for mobile in (True, False):
        ctx = browser.new_context(viewport={'width': 390 if mobile else 960, 'height': 844 if mobile else 640}, is_mobile=mobile, has_touch=mobile)
        ctx.add_init_script('window.requestAnimationFrame = () => 0')
        ctx.route('https://cdnjs.cloudflare.com/**', lambda route: route.abort())
        ctx.route('https://fonts.googleapis.com/**', lambda route: route.abort())
        page = ctx.new_page()
        page.on('pageerror', lambda e: (errors.append(str(e)), print('JS:', e, flush=True)))
        page.goto('http://127.0.0.1:8017/?room=' + room, wait_until='networkidle')
        page.wait_for_function('localCharacter && selfMember && ws.readyState === WebSocket.OPEN', timeout=60000)
        page.evaluate('window.drawScene=renderer.render.bind(renderer);renderer.render=()=>{};clock.getDelta=()=>1/60')
        contexts.append(ctx); pages.append(page)
    a,b = pages
    aid,bid = a.evaluate('clientId'), b.evaluate('clientId')
    print('Two independent players connected', flush=True)
    a.locator('#shoutToggleBtn').tap()
    a.locator('#chatInput').fill('wasd P E V')
    a.locator('#chatInput').press('Space')
    assert a.evaluate('Object.values(keys).every(v=>!v)')
    assert a.evaluate('isScenicView') is False
    assert a.locator('#totalCheersDisplay').inner_text() == '0'
    message = 'Chào anh em! <img src=x onerror=alert(1)>'
    a.locator('#chatInput').fill(message)
    a.locator('#chatInput').press('Enter')
    b.wait_for_function('(text)=>document.getElementById("chatStatus").textContent.includes(text)', arg=message)
    a.wait_for_function('document.getElementById("chatInput").value === ""')
    assert b.evaluate('(id)=>playerHUDTags.get(id).bubbleElem.textContent', aid) == message
    assert b.locator('.tag-bubble img').count() == 0
    a.locator('#closeShoutBtn').tap()
    b.keyboard.press('Enter')
    assert b.locator('#chatInput').evaluate('(e) => document.activeElement === e')
    reply = 'Chào cả bàn, ngồi xuống làm ly nước lọc nào!'
    b.locator('#chatInput').fill(reply)
    b.locator('#chatInput').press('Enter')
    a.wait_for_function('(text)=>document.getElementById("chatStatus").textContent.includes(text)', arg=reply)
    a.evaluate('''(id) => {
      const hud = playerHUDTags.get(id);
      hud.elem.style.display = 'flex';
      hud.elem.style.transform = 'translate(-50%, -100%) translate(10px, 350px)';
      fitChatBubble(hud, 10);
    }''', bid)
    bounds = a.evaluate('(id)=>playerHUDTags.get(id).bubbleElem.getBoundingClientRect().toJSON()', bid)
    assert bounds['x'] >= 0 and bounds['right'] <= 390, bounds
    b.locator('#chatInput').press('Escape')
    assert not b.locator('#hudShoutsBar').is_visible()
    a.evaluate('for(let i=0;i<30;i++)animate();drawScene(scene,camera)')
    a.screenshot(path='tests/chat-preview.png', timeout=60000)
    # Both clients approach the same physical door.
    for page in pages:
        page.evaluate('localPlayerState.x=-16.4;localPlayerState.z=-2.7;sendPlayerPosition();updateWCControls()')
    a.locator('#wcUseBtn').tap()
    a.wait_for_function('pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    b.wait_for_function('(id)=>wcOccupant===id', arg=aid)
    assert b.locator('#wcUseBtn').is_disabled()
    b.evaluate('sendAction({action:"wc_enter"})')
    b.wait_for_function('!pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    b.evaluate('for(let i=0;i<30;i++)animate()')
    assert b.evaluate('(id)=>remotePlayers.get(id).mesh.visible', aid) is False
    assert b.evaluate('(id)=>playerHUDTags.get(id).elem.style.display', aid) == 'none'
    contexts[0].close()
    b.wait_for_function('wcOccupant===null')
    b.locator('#wcUseBtn').click()
    b.wait_for_function('pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    b.locator('#wcExitBtn').click()
    b.wait_for_function('!pubDetails.inside(localPlayerState.x,localPlayerState.z)')
    # Disconnected chat preserves a draft and reports that it has not been sent.
    b.evaluate('ws.close()')
    b.wait_for_function('ws.readyState===WebSocket.CLOSED')
    b.keyboard.press('Enter')
    b.locator('#chatInput').fill('Bản nháp chưa gửi')
    b.locator('#chatForm').evaluate('(e)=>e.requestSubmit()')
    assert b.locator('#chatInput').input_value() == 'Bản nháp chưa gửi'
    assert b.locator('#chatSendBtn').is_disabled()
    assert not errors, errors
    print('PASS: two-way head bubbles, plain text/XSS rendering, typing isolation, Enter/Escape, WC exclusion/privacy, disconnect unlock and unsent draft')
    browser.close()

"""Landmark lighting QA from both river banks and a portrait scenic camera."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader'])
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    ctx.add_init_script('window.requestAnimationFrame=()=>0')
    ctx.route('https://cdnjs.cloudflare.com/**',lambda r:r.abort())
    ctx.route('https://fonts.googleapis.com/**',lambda r:r.abort())
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8017',wait_until='networkidle')
    page.wait_for_function('localCharacter && selfMember',timeout=60000)
    page.evaluate('window.drawScene=renderer.render.bind(renderer);renderer.render=()=>{};clock.getDelta=()=>1/60;toggleScenicView();for(let i=0;i<100;i++)animate()')
    assert page.locator('#hudOverlay').evaluate('(e)=>getComputedStyle(e).visibility') == 'hidden'
    assert page.evaluate('landmarkLEDs.length') == 16
    assert page.evaluate('landmarkLEDs.every(s=>!s.material.fog && s.material.isMeshBasicMaterial)')
    assert page.evaluate('landmarkLEDs.some(s=>s.position.z < 0) && landmarkLEDs.some(s=>s.position.z > 0)')
    assert page.evaluate('landmarkReflections.count') == 140
    assert page.evaluate('landmarkReflections.material.opacity') > 0.2
    page.evaluate('drawScene(scene,camera)')
    page.screenshot(path='tests/landmark-mobile-preview.png',timeout=60000)
    page.set_viewport_size({'width':1280,'height':800})
    page.evaluate('for(let i=0;i<45;i++)animate();drawScene(scene,camera)')
    page.screenshot(path='tests/landmark-desktop-preview.png',timeout=60000)
    # Back-bank view also sees lit surfaces, rather than a dark back wall.
    page.evaluate('camera.position.set(6,20,160);camera.lookAt(6,25,105);drawScene(scene,camera)')
    page.screenshot(path='tests/landmark-rear-preview.png',timeout=60000)
    page.evaluate('toggleScenicView();for(let i=0;i<45;i++)animate()')
    assert not page.evaluate('isScenicView')
    assert page.locator('#hudOverlay').evaluate('(e)=>getComputedStyle(e).visibility') == 'visible'
    assert not errors,errors
    print('PASS: 16 perimeter LED strips on both sides, instanced water streaks, mobile/desktop scenic and rear-bank rendering, return to gameplay; no JS errors')
    browser.close()

// Mở rộng bản đồ quanh quán nhậu (nạp SAU app.js, dùng chung scene/pubDetails/PubLoader của app.js):
//  - Phía Đông (x 55→118): phố đi bộ kiểu Bùi Viện, quán bar hai bên, show múa lửa, hàng rong, xích lô, khách Tây.
//  - Phía Tây (x -122→-48): công viên có quảng trường đài phun nước, hồ + cầu gỗ, cây xanh, ghế đá.
//  - Hai đầu sông Sài Gòn được kéo dài cho khớp bản đồ mới.
// Bố cục công viên tham khảo ý tưởng "quảng trường ở giữa – hồ có cầu – rừng cây" nhưng tự dựng hoàn toàn.
(function () {
  'use strict';

  const lite = PERF.lite;
  const animators = [];
  const tmpCol = new THREE.Color(); // (delta, t) => void, chạy mỗi khung hình qua Features.addTick

  // ---------- Tiện ích dựng hình ----------
  const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.7 }, extra));
  const glow = (color) => new THREE.MeshBasicMaterial({ color });
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    (parent || scene).add(m);
    return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
    m.position.set(x, y, z);
    (parent || scene).add(m);
    return m;
  }
  function obstacle(x, z, w, d) { pubDetails.obstacles.push({ x, z, w, d }); }
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function signTexture(lines, w, h, fg, bg) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg || '#0b1020';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.shadowColor = fg; g.shadowBlur = 16;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [text, size, y] of lines) {
      g.font = `900 ${size}px "Be Vietnam Pro", Arial, sans-serif`;
      g.fillText(text, w / 2, y, w - 60);
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }
  function signPlane(lines, w, h, pw, ph, fg, bg) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(lines, pw, ph, fg, bg) });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }
  function storefrontTexture(hue) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, `hsl(${hue},70%,22%)`);
    grad.addColorStop(1, `hsl(${(hue + 40) % 360},80%,34%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
    const r = makeRng(hue * 7 + 3);
    for (let row = 0; row < 3; row++) {                      // kệ rượu / chai
      g.fillStyle = '#1b1022'; g.fillRect(14, 24 + row * 26, 228, 3);
      for (let i = 0; i < 17; i++) {
        g.fillStyle = `hsl(${Math.floor(r() * 360)},85%,62%)`;
        g.fillRect(18 + i * 13, 8 + row * 26, 6, 16);
      }
    }
    g.fillStyle = '#2a1330'; g.fillRect(0, 100, 256, 28);    // quầy bar
    g.fillStyle = `hsl(${(hue + 180) % 360},100%,65%)`; g.fillRect(0, 98, 256, 3);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  // Dây đèn nháy: gom toàn bộ bóng vào MỘT đối tượng Points cho nhẹ.
  const bulbPos = [], bulbCol = [];
  const bulbPalette = [0xff3b6b, 0xffd23f, 0x3bf5c8, 0x6ea8ff, 0xff8f3b, 0xd96bff].map(c => new THREE.Color(c));
  function addBulb(x, y, z, i) {
    bulbPos.push(x, y, z);
    const c = bulbPalette[i % bulbPalette.length];
    bulbCol.push(c.r, c.g, c.b);
  }
  function flushBulbs() {
    if (!bulbPos.length) return;
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d');
    const rg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    rg.addColorStop(0, '#fff'); rg.addColorStop(0.35, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bulbCol, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    bulbPos.length = bulbCol.length = 0;
  }
  function stringLights(x0, z0, x1, z1, y, sag, count, startIdx) {
    const wirePts = [];
    for (let i = 0; i <= count; i++) {
      const k = i / count;
      const px = x0 + (x1 - x0) * k, pz = z0 + (z1 - z0) * k, py = y - Math.sin(k * Math.PI) * sag;
      wirePts.push(new THREE.Vector3(px, py, pz));
      addBulb(px, py - 0.12, pz, (startIdx || 0) + i);
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x0b1220 })));
  }

  // Người đứng/đi bộ dùng lại mô hình chibi của app.js, thêm balo cho khách Tây.
  function makePerson(color, x, z, ry, backpack) {
    const ch = createCharacter3D(color);
    ch.mesh.position.set(x, 0.3, z);
    ch.mesh.rotation.y = ry || 0;
    if (backpack) {
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.26), std(backpack));
      bp.position.set(0, 0.86, -0.42);
      ch.mesh.add(bp);
    }
    scene.add(ch.mesh);
    return ch;
  }

  // ========================================================
  // A. PHỐ ĐI BỘ KIỂU BÙI VIỆN (phía Đông)
  // ========================================================
  const BV = { x0: 55, x1: 118, zN: -1.5, zS: 16.5, gateX: 57 };
  const BV_MID = (BV.zN + BV.zS) / 2; // 7.5

  function buildBuiVien() {
    const tileTex = new THREE.TextureLoader().load('textures/sidewalk/diff_1k.jpg');
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(28, 8);
    // Nền tối phía sau + mặt phố lát gạch
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(84, 44), std(0x141b29, { roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(90, 0.01, 7);
    ground.receiveShadow = true;
    scene.add(ground);
    const street = box(BV.x1 - BV.x0, 0.3, BV.zS - BV.zN, std(0x8593a8, { map: tileTex, roughness: 0.6 }),
      (BV.x0 + BV.x1) / 2, 0.15, BV_MID);
    street.receiveShadow = true;

    buildGate();
    const barNames = [
      ['NEON ROOMS', '#ff3b8b', 'Cocktail • Nhạc sống'], ['HELLO BEER', '#ffd23f', 'Bia hơi 15K • Happy hour'],
      ['LUCKY HOUSE', '#3bf5c8', 'DJ • Shisha • Chill'], ['BACKPACKER', '#6ea8ff', 'Hostel Bar • Pool'],
      ['SÀI GÒN NIGHT', '#ff8f3b', 'Nướng • Hải sản • Bia']
    ];
    const northNames = barNames, southNames = barNames.slice().reverse();
    const palette = [0x3b2a4a, 0x2a3b4a, 0x4a2a35, 0x2a4a3f, 0x4a3f2a, 0x33284a];
    for (let i = 0; i < 5; i++) {
      const cx = 65.6 + i * 11.2;
      // Ba quán có nội thất để vào chơi: NEON ROOMS (club), LUCKY HOUSE (lounge), BACKPACKER (bi-a)
      const northKind = { 0: 'club', 3: 'pool' }[i], southKind = { 2: 'lounge' }[i];
      buildBar(cx, -1, northNames[i], palette[i % palette.length], 11 + (i % 3) * 1.5, 100 + i * 31, northKind);
      buildBar(cx, +1, southNames[i], palette[(i + 2) % palette.length], 12 + ((i + 1) % 3) * 1.4, 220 + i * 37, southKind);
    }
    // Tường cuối phố
    box(1, 9, BV.zS - BV.zN, std(0x20283a), BV.x1 + 0.5, 4.5, BV_MID);
    obstacle(BV.x1 + 0.5, BV_MID, 1.2, BV.zS - BV.zN);
    const endSign = signPlane([['BÙI VIỆN', 130, 90], ['Hẹn gặp lại, bạn hiền!', 56, 190]], 12, 4.6, 1024, 360, '#ffd23f', '#1a1030');
    endSign.position.set(BV.x1 - 0.02, 5.4, BV_MID);
    endSign.rotation.y = -Math.PI / 2;
    scene.add(endSign);
    // Rào sông phía sau dãy quán phía nam + lan can
    box(BV.x1 - 48, 0.9, 0.2, std(0xb45309), (48 + BV.x1) / 2, 0.75, 28.3);
    obstacle((48 + BV.x1) / 2, 28.3, BV.x1 - 48, 0.4);
    // Lối nối từ đường nhựa cũ (x≤55) sang phố đi bộ
    box(8, 0.3, 12, std(0x8593a8, { map: tileTex }), 51, 0.15, 7.5).receiveShadow = true;

    // Dây đèn nháy giăng ngang phố
    let idx = 0;
    for (const x of [63, 71, 79, 97, 105, 111]) {
      stringLights(x, 6.5, x, 16.5, 7.4, 1.0, 16, idx);
      stringLights(x, -1.5, x, 6.5, 7.4, 1.0, 16, idx + 3);
      idx += 2;
    }
    flushBulbs();

    buildFireShow(88, BV_MID);
    buildBalloonVendor(72.5, 12.2);
    buildCart(104, 2.3, 0, 'BẮP NƯỚNG', 0xf59e0b, 0xff6a00);
    buildCart(63.5, 13.0, Math.PI, 'TRÁI CÂY LẮC', 0x22c55e, 0xffd23f);
    buildCart(112, 13.2, Math.PI, 'NƯỚC MÍA', 0x84cc16, 0x9ae6b4);
    buildCyclo(97.5, 13.0, 0.35);
    buildWalkers();
  }

  function buildGate() {
    const mat = std(0x1d2540, { roughness: 0.5 });
    for (const z of [-0.6, 15.6]) {
      box(1.2, 8, 1.2, mat, BV.gateX, 4, z);
      obstacle(BV.gateX, z, 1.5, 1.5);
      cyl(0.5, 0.5, 0.3, std(0xffd23f), BV.gateX, 8.1, z);
    }
    box(0.5, 3.2, 17.4, mat, BV.gateX, 9.2, BV_MID);
    for (const side of [-1, 1]) {
      const sign = signPlane([['PHỐ TÂY', 100, 85], ['BÙI VIỆN', 130, 190], ['WALKING STREET • 24/7', 46, 240]], 17, 3.0, 1400, 256, '#ff4fa3', '#120a24');
      sign.position.set(BV.gateX + side * 0.27, 9.2, BV_MID);
      sign.rotation.y = side * Math.PI / 2;
      scene.add(sign);
    }
    for (let i = 0; i < 18; i++) addBulb(BV.gateX, 7.5, -0.4 + i * 0.95, i);
  }

  const BAR_STYLE = { 'NEON ROOMS': 'edm', 'HELLO BEER': 'vinahouse', 'LUCKY HOUSE': 'lounge', 'BACKPACKER': 'reggae', 'SÀI GÒN NIGHT': 'bolero' };
  let barCount = 0;

  function buildBar(cx, side, info, bodyColor, height, seed, interiorKind) {
    const [name, neon, tagline] = info;
    const barId = 'bar' + barCount++;
    const out = side < 0 ? -1 : 1;                       // hướng "ra sau" của toà nhà
    const fz = side < 0 ? BV.zN : BV.zS;                 // mặt tiền
    const toStreet = -out;
    const rot = side < 0 ? 0 : Math.PI;
    const r = makeRng(seed);
    const hue = Math.floor(r() * 360);

    // Thân nhà: mờ dần khi che camera (xem updateWallOcclusion trong app.js)
    const bodyMat = std(bodyColor, { roughness: 0.85 });
    const decor = [];
    let body;
    const shell = [];   // các mảng tường: mờ cùng nhau khi che camera
    if (!interiorKind) {
      body = box(11, height, 10, bodyMat, cx, height / 2, fz + out * 5);
      body.receiveShadow = true;
      obstacle(cx, fz + out * 5, 11.2, 10);
      // Mặt tiền mở sáng đèn
      const storeMat = new THREE.MeshBasicMaterial({ map: storefrontTexture(hue) });
      const store = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 3.4), storeMat);
      store.position.set(cx, 1.95, fz + toStreet * 0.03);
      store.rotation.y = rot;
      scene.add(store);
      decor.push(storeMat);
    } else {
      // Quán có nội thất: tầng trệt rỗng cao 4.6m, từ tầng 2 trở lên đặc
      const H = 4.6, T = 0.4, zc = fz + out * 5;
      body = box(11, height - H, 10, bodyMat, cx, H + (height - H) / 2, zc);     // tầng trên (đồng thời là trần)
      shell.push(body,
        box(11, H, T, bodyMat, cx, H / 2, fz + out * (10 - T / 2)),              // tường sau
        box(T, H, 10, bodyMat, cx - 5.5 + T / 2, H / 2, zc),                     // tường trái
        box(T, H, 10, bodyMat, cx + 5.5 - T / 2, H / 2, zc),                     // tường phải
        box(2.3, H, T, bodyMat, cx - 4.35, H / 2, fz + out * (T / 2)),           // mặt tiền hai bên cửa
        box(2.3, H, T, bodyMat, cx + 4.35, H / 2, fz + out * (T / 2)),
        box(6.4, H - 3.6, T, bodyMat, cx, 3.6 + (H - 3.6) / 2, fz + out * (T / 2))); // lanh tô trên cửa
      obstacle(cx, fz + out * (10 - T / 2), 11, T);
      obstacle(cx - 5.3, zc, T, 10);
      obstacle(cx + 5.3, zc, T, 10);
      obstacle(cx - 4.35, fz + out * (T / 2), 2.3, T);
      obstacle(cx + 4.35, fz + out * (T / 2), 2.3, T);
      for (const m of shell) m.receiveShadow = true;
    }

    // Biển neon lớn
    const sign = signPlane([[name, 78, 54], [tagline, 34, 102]], 8.4, 1.8, 768, 160, neon, '#0b0a18');
    sign.position.set(cx, 4.9, fz + toStreet * 0.05);
    sign.rotation.y = rot;
    scene.add(sign);
    decor.push(sign.material);
    // Biển treo vuông góc với mặt phố
    const blade = signPlane([[name.split(' ')[0], 70, 64]], 1.8, 1.1, 384, 128, neon, '#0b0a18');
    blade.position.set(cx - 5.3, 5.8, fz + toStreet * 0.95);
    blade.rotation.y = Math.PI / 2;
    scene.add(blade);
    decor.push(blade.material);

    // Ban công tầng 2 + dây đèn
    const balMat = std(0x222b40);
    const balcony = box(10.6, 0.18, 1.4, balMat, cx, 6.3, fz + toStreet * 0.7);
    box(10.6, 0.7, 0.08, balMat, cx, 6.75, fz + toStreet * 1.38);
    decor.push(balMat);
    for (let i = 0; i < 12; i++) addBulb(cx - 5.2 + i * 0.945, 6.6, fz + toStreet * 1.42, i + seed);

    // Cửa sổ các tầng trên (một InstancedMesh cho mỗi quán)
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const floors = [8.0, 10.3].filter(y => y + 0.9 < height);
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 1.5), winMat, floors.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    let wi = 0;
    for (const y of floors) {
      for (const dx of [-3.4, 0, 3.4]) {
        m4.compose(new THREE.Vector3(cx + dx, y, fz + toStreet * 0.03), q, new THREE.Vector3(1, 1, 1));
        wins.setMatrixAt(wi, m4);
        wins.setColorAt(wi, new THREE.Color().setHSL(r() < 0.5 ? 0.12 : r(), 0.9, r() < 0.2 ? 0.2 : 0.62));
        wi++;
      }
    }
    scene.add(wins);
    decor.push(winMat);
    const interiorDecor = interiorKind ? buildInterior(cx, fz, out, interiorKind, name, neon, hue, barId) : [];
    if (!shell.length) registerOccluder(body, decor);
    for (const m of shell) registerOccluder(m, m === body ? decor.concat(interiorDecor) : null);

    // Nhạc riêng của quán (bar-music.js) + loa thùng nhún theo beat
    const musicStyle = BAR_STYLE[name] || 'edm';
    if (window.BarMusic) BarMusic.register({ id: barId, name, style: musicStyle, x: cx, z: interiorKind ? fz + out * 1.5 : fz + toStreet * 2 });
    for (const dx of [-4.9, 4.9]) {
      box(0.8, 1.3, 0.7, std(0x0b0b0f), cx + dx, 0.95, fz + toStreet * 0.5);
      const woofer = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), glow(0x22d3ee));
      woofer.position.set(cx + dx, 0.75, fz + toStreet * 0.86);
      woofer.rotation.y = rot;
      scene.add(woofer);
      animators.push((d, t) => woofer.scale.setScalar(1 + (window.BarMusic ? BarMusic.pulse(barId, t) : 0) * 0.35));
    }

    // Bàn ghế nhựa ngoài vỉa hè (nét đặc trưng quán bia hơi)
    const stoolColors = [0xdc2626, 0x2563eb, 0xeab308];
    for (let ti = 0; ti < 3; ti++) {
      if (interiorKind && ti === 1) continue;   // chừa lối vào quán
      const tx = cx - 3.2 + ti * 3.2, tz = fz + toStreet * 2.5;
      const tableMat = std(ti % 2 ? 0xf8fafc : 0xfde68a, { roughness: 0.5 });
      cyl(0.5, 0.5, 0.06, tableMat, tx, 0.88, tz, null, 16);
      cyl(0.06, 0.06, 0.58, std(0x94a3b8), tx, 0.6, tz);
      const mug = cyl(0.09, 0.08, 0.2, std(0xfbbf24, { transparent: true, opacity: 0.85 }), tx + 0.12, 1.02, tz - 0.05);
      const stoolMat = std(stoolColors[(ti + Math.floor(r() * 3)) % 3], { roughness: 0.55 });
      const tableId = 100 + (barCount - 1) * 10 + ti;   // id riêng, không đụng bàn trong quán (0..9) và ghế đá (>=10)
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const sx = tx + Math.cos(a) * 1.0, sz = tz + Math.sin(a) * 1.0;
        cyl(0.2, 0.23, 0.42, stoolMat, sx, 0.51, sz);
        // Ghế ngồi thật [E]: dùng chung hệ thống chairSlots với bàn trong quán
        chairSlots.push({ tableId, seatId: k, x: sx, z: sz, ry: Math.atan2(tx - sx, tz - sz), mesh: null, prompt: `Ngồi ghế nhựa nhậu bia hơi ở ${name}`, seatY: 0.74 });
      }
      obstacle(tx, tz, 0.9, 0.9);   // chỉ chặn mặt bàn để người ngồi/đứng dậy ở ghế không bị kẹt
    }
  }


  // ---------- Nội thất quán bar (đi vào được) ----------
  let seatTableCounter = 300;
  function addSeat(tableId, seatId, x, z, faceX, faceZ, prompt, seatY) {
    chairSlots.push({ tableId, seatId, x, z, ry: Math.atan2(faceX - x, faceZ - z), mesh: null, prompt, seatY });
  }

  // Trả về danh sách vật liệu của đồ trang trí gắn tường để mờ cùng tường khi che camera.
  function buildInterior(cx, fz, out, kind, name, neon, hue, barId) {
    const follow = [];
    const P = (u, v) => [cx + u, fz + out * v];
    const put = (w, h, d, mat, u, y, v) => { const [x, z] = P(u, v); return box(w, h, d, mat, x, y, z); };
    const faceEntrance = out < 0 ? 0 : Math.PI;              // quay mặt ra phía cửa
    const stool = (x, z, color, h) => {
      cyl(0.04, 0.04, h, std(0x9ca3af), x, 0.3 + h / 2, z);
      cyl(0.22, 0.2, 0.08, std(color, { roughness: 0.5 }), x, 0.3 + h, z, null, 14);
    };

    // Sàn + dải neon quanh tường
    put(10.6, 0.04, 9.6, std(0x1c1426, { roughness: 0.35, metalness: 0.2 }), 0, 0.32, 5);
    const stripMat = glow(neon);
    follow.push(stripMat);
    put(10.2, 0.08, 0.06, stripMat, 0, 3.5, 9.76);
    put(0.06, 0.08, 9.6, stripMat, -5.1, 3.5, 5);
    put(0.06, 0.08, 9.6, stripMat, 5.1, 3.5, 5);
    for (const v of [2.5, 5, 7.5]) for (let i = 0; i < 8; i++) { const [x, z] = P(-4.4 + i * 1.25, v); addBulb(x, 4.35, z, Math.floor(i + v)); }

    // Quầy bar sát tường phải + kệ rượu + ghế quầy ngồi được
    const woodMat = std(0x3a2417, { roughness: 0.55 });
    put(0.8, 1.1, 5.6, woodMat, 3.6, 0.85, 4.9);
    put(0.9, 0.06, 5.7, glow(neon), 3.6, 1.42, 4.9);
    obstacle(...P(3.6, 4.9), 0.9, 5.6);
    const shelfMat = new THREE.MeshBasicMaterial({ map: storefrontTexture(hue) });
    follow.push(shelfMat);
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.8), shelfMat);
    [shelf.position.x, shelf.position.z] = P(5.08, 4.9);
    shelf.position.y = 2.2; shelf.rotation.y = -Math.PI / 2;
    scene.add(shelf);
    const barTable = seatTableCounter++;
    [3.0, 4.4, 5.8, 7.2].forEach((v, k) => {
      const [x, z] = P(2.6, v);
      stool(x, z, k % 2 ? 0xdc2626 : 0x2563eb, 0.62);
      addSeat(barTable, k, x, z, x + 1, z, `Ngồi quầy bar ${name}`, 0.96);
    });
    const bartender = makePerson(0xe11d48, ...P(4.5, 4.9), -Math.PI / 2);
    animators.push((d, t) => { bartender.mesh.position.y = 0.3 + Math.abs(Math.sin(t * 2.4)) * 0.03; bartender.mesh.rotation.y = -Math.PI / 2 + Math.sin(t * 0.8) * 0.5; });

    // Sofa dọc tường trái (ngồi được; không đặt vật cản để đứng dậy không bị kẹt)
    const sofaMat = std(new THREE.Color(neon).multiplyScalar(0.45).getHex(), { roughness: 0.8 });
    const sofaTable = seatTableCounter++;
    [2.4, 6.0].forEach((v, k) => {
      put(0.9, 0.45, 1.9, sofaMat, -4.55, 0.55, v);
      put(0.18, 0.9, 1.9, sofaMat, -5.0, 0.95, v);
      for (const dv of [-0.45, 0.45]) {
        const [x, z] = P(-4.5, v + dv);
        addSeat(sofaTable, k * 2 + (dv > 0 ? 1 : 0), x, z, x + 1, z, `Ngồi sofa ở ${name}`, 0.8);
      }
    });

    // Màn hình tên quán trên tường sau
    const screen = signPlane([[name, 86, 80], ['Mời bạn vào chơi!', 36, 150]], 5, 1.6, 768, 200, neon, '#0b0a18');
    [screen.position.x, screen.position.z] = P(0, 9.74);
    screen.position.y = 2.7; screen.rotation.y = faceEntrance;
    scene.add(screen);
    follow.push(screen.material);

    if (kind === 'club') {
      // Sàn nhảy 4x4 đổi màu theo nhạc + quả cầu disco + DJ + người nhảy
      const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.05, 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff }), 16);
      const m4 = new THREE.Matrix4(), tint = new THREE.Color();
      for (let i = 0; i < 16; i++) {
        const [x, z] = P(-3.0 + (i % 4) * 1.0, 2.5 + Math.floor(i / 4) * 1.0);
        m4.makeTranslation(x, 0.36, z);
        tiles.setMatrixAt(i, m4);
        tiles.setColorAt(i, tint.setHSL(i / 16, 1, 0.5));
      }
      scene.add(tiles);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), std(0xe5e7eb, { metalness: 1, roughness: 0.12, flatShading: true }));
      const [bx, bz] = P(-1.5, 4.0);
      ball.position.set(bx, 3.7, bz);
      scene.add(ball);
      cyl(0.01, 0.01, 0.9, std(0x9ca3af), bx, 4.2, bz);
      animators.push((d, t) => {
        const pulse = window.BarMusic ? BarMusic.pulse(barId, t) : 0.5;
        for (let i = 0; i < 16; i++) tiles.setColorAt(i, tint.setHSL((t * 0.25 + i * 0.06 + (i % 4) * 0.05) % 1, 1, 0.25 + pulse * 0.35));
        tiles.instanceColor.needsUpdate = true;
        ball.rotation.y = t * 1.2;
      });
      // DJ booth
      put(3.2, 1.1, 0.9, std(0x14121c), -1.5, 0.85, 8.5);
      put(3.0, 0.04, 0.7, glow(0x22d3ee), -1.5, 1.42, 8.5);
      for (const du of [-0.8, 0.8]) { const [x, z] = P(-1.5 + du, 8.5); cyl(0.3, 0.3, 0.05, std(0x0b0b0f), x, 1.46, z, null, 20); }
      obstacle(...P(-1.5, 8.5), 3.4, 1.0);
      const dj = makePerson(0x7c3aed, ...P(-1.5, 9.2), faceEntrance);
      animators.push((d, t) => { dj.mesh.position.y = 0.3 + Math.abs(Math.sin(t * 4)) * 0.04; dj.mesh.rotation.z = Math.sin(t * 4) * 0.06; });
      // Khách nhảy
      const dancers = [];
      const cols = [0xfb7185, 0x38bdf8, 0xfacc15, 0x34d399];
      for (let i = 0; i < (lite ? 2 : 4); i++) {
        dancers.push({ p: makePerson(cols[i], ...P(-2.5 + (i % 2) * 2, 3.2 + Math.floor(i / 2) * 1.8), i * 1.7), ph: i * 1.1 });
      }
      animators.push((d, t) => {
        for (const { p, ph } of dancers) {
          p.mesh.position.y = 0.3 + Math.max(0, Math.sin(t * 8 + ph)) * 0.14;
          p.mesh.rotation.y += d * (1.2 + ph * 0.1);
          p.mesh.rotation.z = Math.sin(t * 4 + ph) * 0.12;
        }
      });
    } else if (kind === 'lounge') {
      // Bàn thấp + ghế đệm (ngồi được) + bình shisha + đèn lồng
      const base = seatTableCounter;
      [[-2.2, 3.2], [-2.2, 6.9], [0.6, 5.0]].forEach(([u, v], ti) => {
        const [x, z] = P(u, v);
        cyl(0.55, 0.55, 0.06, std(0x3b2a1a), x, 0.74, z, null, 18);
        cyl(0.08, 0.1, 0.4, std(0x3b2a1a), x, 0.52, z);
        cyl(0.07, 0.1, 0.34, std(0x14b8a6, { metalness: 0.5, roughness: 0.2 }), x + 0.12, 0.94, z);
        cyl(0.03, 0.05, 0.2, std(0xfbbf24, { metalness: 0.8 }), x + 0.12, 1.2, z);
        obstacle(x, z, 0.9, 0.9);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(0xff9a3d));
        lamp.position.set(x, 3.3, z);
        scene.add(lamp);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4, sx = x + Math.cos(a) * 1.05, sz = z + Math.sin(a) * 1.05;
          cyl(0.32, 0.34, 0.36, std([0xdc2626, 0x0ea5e9, 0xeab308, 0xa855f7][(k + ti) % 4], { roughness: 0.9 }), sx, 0.5, sz, null, 14);
          addSeat(base + ti, k, sx, sz, x, z, `Ngồi ghế đệm shisha ở ${name}`, 0.7);
        }
      });
      seatTableCounter += 3;
    } else if (kind === 'pool') {
      // Bàn bi-a + bi + cơ + bia phi tiêu
      put(3.0, 0.8, 1.6, std(0x5b3a1e, { roughness: 0.5 }), -1.8, 0.7, 5);
      put(2.6, 0.04, 1.2, std(0x15803d, { roughness: 0.95 }), -1.8, 1.12, 5);
      obstacle(...P(-1.8, 5), 3.0, 1.6);
      const ballCols = [0xfef08a, 0x2563eb, 0xdc2626, 0x7c3aed, 0xf97316, 0x16a34a, 0x7f1d1d, 0x111827, 0xffffff];
      ballCols.forEach((c, i) => {
        const [x, z] = P(-1.1 + (i % 3) * 0.16 + Math.floor(i / 3) * 0.08, 4.75 + Math.floor(i / 3) * 0.2);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std(c, { roughness: 0.2 }));
        b.position.set(x, 1.2, z);
        scene.add(b);
      });
      const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 6), std(0xd6b27a));
      const [qx, qz] = P(-4.9, 8.4);
      cue.position.set(qx, 1.05, qz); cue.rotation.z = 0.12;
      scene.add(cue);
      const poolTable = seatTableCounter++;
      [[-4.2, 0], [0.7, 1]].forEach(([u, k]) => {
        const [x, z] = P(u, 5);
        stool(x, z, 0xdc2626, 0.6);
        addSeat(poolTable, k, x, z, ...P(-1.8, 5), `Ngồi nghỉ bên bàn bi-a ${name}`, 0.94);
      });
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      ['#111', '#fff', '#dc2626', '#16a34a', '#dc2626'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 62 - i * 12, 0, Math.PI * 2); g.fill(); });
      const dart = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
      [dart.position.x, dart.position.z] = P(3.0, 9.72);
      dart.position.y = 2.0; dart.rotation.y = faceEntrance;
      scene.add(dart);
      follow.push(dart.material);
      const sign = signPlane([['POOL • DARTS', 60, 60]], 2.6, 0.7, 512, 128, '#9ae6b4', '#10261a');
      [sign.position.x, sign.position.z] = P(-4.0, 9.72);
      sign.position.y = 2.7; sign.rotation.y = faceEntrance;
      scene.add(sign);
      follow.push(sign.material);
    }
    return follow;
  }

  // Show múa lửa: người biểu diễn, gậy lửa xoay, hơi lửa định kỳ, khán giả vây quanh
  function buildFireShow(cx, cz) {
    const mat = std(0x2a2a33, { roughness: 0.9 });
    cyl(2.2, 2.2, 0.06, mat, cx, 0.33, cz, null, 32);                          // sàn diễn
    const performer = makePerson(0x7f1d1d, cx, cz, 0);
    obstacle(cx, cz, 1.3, 1.3);

    const staff = new THREE.Group();
    staff.position.set(cx + 0.55, 1.15, cz + 0.45);
    cyl(0.03, 0.03, 2.0, std(0x3f2a14), 0, 0, 0, staff);
    const flames = [];
    for (const s of [-1, 1]) {
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 8), new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.9 }));
      outer.position.y = s * 1.15;
      outer.rotation.z = s > 0 ? 0 : Math.PI;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 8), glow(0xffe066));
      inner.position.y = s * 1.1;
      inner.rotation.z = outer.rotation.z;
      staff.add(outer, inner);
      flames.push(outer, inner);
    }
    scene.add(staff);

    const breath = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 12, 1, true), new THREE.MeshBasicMaterial({
      color: 0xff8a1f, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    breath.position.set(cx, 1.55, cz + 1.8);
    breath.rotation.x = Math.PI / 2;     // đầu nhọn hướng ra sau, miệng rộng hướng về khán giả
    scene.add(breath);

    let fireLight = null;
    if (!lite) {
      fireLight = new THREE.PointLight(0xff7a18, 1.6, 14);
      fireLight.position.set(cx, 2.4, cz);
      scene.add(fireLight);
    }
    const board = signPlane([['SHOW MÚA LỬA', 74, 64], ['Mỗi tối • Miễn phí', 34, 112]], 2.6, 1.3, 512, 160, '#ffb347', '#1a0f08');
    board.position.set(cx, 1.15, cz + 2.4);
    board.rotation.x = -0.2;
    scene.add(board);
    box(0.08, 0.8, 0.08, std(0x3f2a14), cx, 0.7, cz + 2.38);

    animators.push((d, t) => {
      staff.rotation.z = t * 9;
      staff.rotation.x = Math.sin(t * 1.7) * 0.4;
      flames.forEach((f, i) => f.scale.set(1 + Math.sin(t * 22 + i) * 0.14, 1 + Math.sin(t * 27 + i * 2) * 0.22, 1));
      const cycle = t % 11;                     // mỗi 11 giây phun lửa một lần
      const burst = cycle > 8.5 && cycle < 10 ? Math.sin((cycle - 8.5) / 1.5 * Math.PI) : 0;
      breath.material.opacity = 0.85 * burst;
      breath.scale.setScalar(0.3 + burst * 0.9);
      performer.mesh.position.y = 0.3 + Math.abs(Math.sin(t * 3)) * 0.04;
      performer.mesh.rotation.y = Math.sin(t * 0.9) * 0.4;
      performer.leftLeg.rotation.x = Math.sin(t * 6) * 0.25;
      performer.rightLeg.rotation.x = -Math.sin(t * 6) * 0.25;
      if (fireLight) fireLight.intensity = (1.3 + Math.sin(t * 17) * 0.35 + Math.sin(t * 29) * 0.2) * (1 + burst * 1.4);
    });

    // Khán giả vây quanh xem
    const crowd = lite ? 5 : 9;
    const shirts = [0x0ea5e9, 0xf97316, 0x22c55e, 0xe11d48, 0xa855f7, 0xfacc15, 0x14b8a6, 0xf472b6, 0x64748b];
    const packs = [0x7c2d12, 0x1e3a8a, 0x365314, 0x4c1d95, null];
    const people = [];
    for (let i = 0; i < crowd; i++) {
      const a = (i / crowd) * Math.PI * 2 + 0.3;
      const px = cx + Math.cos(a) * 3.5, pz = cz + Math.sin(a) * 3.2;
      const p = makePerson(shirts[i % shirts.length], px, pz, Math.atan2(cx - px, cz - pz), packs[i % packs.length]);
      people.push({ p, ph: i * 1.3 });
    }
    animators.push((d, t) => {
      for (const { p, ph } of people) {
        p.mesh.position.y = 0.3 + Math.max(0, Math.sin(t * 2.2 + ph)) * 0.05;
        p.mesh.rotation.z = Math.sin(t * 1.1 + ph) * 0.04;
      }
    });
  }

  function buildBalloonVendor(x, z) {
    const cart = new THREE.Group();
    cart.position.set(x, 0.3, z);
    cart.rotation.y = Math.PI;
    box(1.5, 0.7, 0.8, std(0xfef3c7), 0, 0.65, 0, cart);
    for (const dx of [-0.6, 0.6]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), std(0x111827));
      wheel.position.set(dx, 0.3, 0.46);
      cart.add(wheel);
    }
    cyl(0.03, 0.03, 1.3, std(0x6b7280), 0, 1.65, 0, cart);
    const balloons = new THREE.Group();
    balloons.position.set(0, 2.4, 0);
    const colors = [0xff3b6b, 0xffd23f, 0x3bf5c8, 0x6ea8ff, 0xff8f3b, 0xd96bff];
    const r = makeRng(77);
    const strings = [];
    for (let i = 0; i < (lite ? 8 : 16); i++) {
      const bx = (r() - 0.5) * 1.8, by = r() * 1.1 + 0.2, bz = (r() - 0.5) * 1.2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), std(colors[i % colors.length], { roughness: 0.25, emissive: colors[i % colors.length], emissiveIntensity: 0.25 }));
      b.scale.y = 1.2;
      b.position.set(bx, by, bz);
      balloons.add(b);
      strings.push(new THREE.Vector3(bx, by - 0.34, bz), new THREE.Vector3(0, -0.2, 0));
    }
    balloons.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strings), new THREE.LineBasicMaterial({ color: 0xe5e7eb })));
    cart.add(balloons);
    scene.add(cart);
    obstacle(x, z, 1.7, 1.2);
    makePerson(0x16a34a, x - 0.1, z - 1.0, 0);
    animators.push((d, t) => { balloons.rotation.z = Math.sin(t * 1.3) * 0.05; balloons.rotation.x = Math.sin(t * 0.9) * 0.04; });
  }

  function buildCart(x, z, ry, label, canopyColor, lampColor) {
    const g = new THREE.Group();
    g.position.set(x, 0.3, z);
    g.rotation.y = ry;
    box(1.6, 0.8, 0.9, std(0xcbd5e1, { roughness: 0.5 }), 0, 0.7, 0, g);
    const top = box(1.5, 0.05, 0.8, glow(lampColor), 0, 1.12, 0, g);
    top.material.transparent = true; top.material.opacity = 0.85;
    for (const dx of [-0.6, 0.6]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16), std(0x111827));
      wheel.position.set(dx, 0.3, 0.5);
      g.add(wheel);
    }
    cyl(0.03, 0.03, 1.8, std(0x6b7280), 0.6, 1.9, -0.3, g);
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), std(canopyColor, { side: THREE.DoubleSide }));
    umbrella.position.set(0.3, 2.9, -0.2);
    g.add(umbrella);
    const board = signPlane([[label, 64, 64]], 1.5, 0.5, 512, 128, '#fff4c2', '#7a2e12');
    board.position.set(0, 0.75, -0.47);
    board.rotation.y = Math.PI;
    g.add(board);
    scene.add(g);
    obstacle(x, z, 1.8, 1.2);
    makePerson(0xf59e0b, x + Math.cos(ry) * 0.2, z - Math.cos(ry) * 1.1, ry);
  }

  function buildCyclo(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0.3, z);
    g.rotation.y = ry;
    const red = std(0xb91c1c, { roughness: 0.5 }), dark = std(0x111827);
    for (const dz of [-0.55, 0.55]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 20), dark);
      w.rotation.y = Math.PI / 2;
      w.position.set(dz, 0.42, 0.0);
      g.add(w);
    }
    box(1.3, 0.12, 0.9, red, 0, 0.55, 0.7, g);                      // ghế khách phía trước
    box(1.3, 0.5, 0.1, red, 0, 0.85, 1.12, g);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 10, 1, true, 0, Math.PI), red);
    hood.rotation.z = Math.PI / 2; hood.rotation.y = Math.PI / 2;
    hood.position.set(0, 1.0, 0.75);
    g.add(hood);
    const fw = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 20), dark);
    fw.position.set(0, 0.4, -1.1);
    g.add(fw);
    box(0.1, 0.1, 1.9, dark, 0, 0.75, -0.2, g);
    box(0.5, 0.1, 0.25, dark, 0, 0.95, -0.55, g);
    scene.add(g);
    obstacle(x, z, 1.6, 2.4);
  }

  // Khách Tây đeo balo đi dạo qua lại, tay cầm bia
  function buildWalkers() {
    const specs = [
      [60.5, 79, 4.6, 0xfb7185, 0x7c2d12], [62, 78, 9.4, 0x38bdf8, 0x1e3a8a], [64, 80, 11.4, 0xfacc15, 0x4c1d95],
      [95, 114, 4.4, 0x34d399, 0x365314], [96, 113, 9.8, 0xe879f9, 0x1e3a8a], [94, 114, 11.2, 0xf97316, 0x4c1d95]
    ];
    const walkers = specs.slice(0, lite ? 3 : 6).map(([xa, xb, z, color, pack], i) => {
      const p = makePerson(color, xa + (xb - xa) * (i % 3) / 3, z, Math.PI / 2, pack);
      return { p, xa, xb, z, dir: i % 2 ? -1 : 1, x: xa + (xb - xa) * (i % 3) / 3, speed: 0.7 + (i % 3) * 0.18, pause: 0, wt: i * 2 };
    });
    animators.push((d) => {
      for (const w of walkers) {
        if (w.pause > 0) {
          w.pause -= d;
          w.p.leftLeg.rotation.x *= 0.8; w.p.rightLeg.rotation.x *= 0.8;
          continue;
        }
        w.x += w.dir * w.speed * d;
        if (w.x > w.xb || w.x < w.xa) { w.x = Math.max(w.xa, Math.min(w.xb, w.x)); w.dir *= -1; w.pause = 2 + Math.random() * 3; }
        w.wt += d * 7;
        w.p.mesh.position.set(w.x, 0.3 + Math.abs(Math.sin(w.wt)) * 0.02, w.z);
        const target = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        let diff = target - w.p.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        w.p.mesh.rotation.y += diff * Math.min(1, d * 6);
        w.p.leftLeg.rotation.x = Math.sin(w.wt) * 0.5;
        w.p.rightLeg.rotation.x = -Math.sin(w.wt) * 0.5;
      }
    });
  }

  // ========================================================
  // B. CÔNG VIÊN PHÍA TÂY: quảng trường đài phun nước + hồ cầu gỗ
  // ========================================================
  const PLAZA = { x: -82, z: 7.5, r: 9.5 };
  const POND = { x: -104, z: 18.2, rx: 10, rz: 5.8 };

  function buildWestPark() {
    const lawn = box(74, 0.3, 33.9, Veg.lawnMaterial(18, 8), -85, 0.15, 11.45);
    lawn.receiveShadow = true;
    // Lối đi lát đá
    const pathMat = std(0xb8b0a1, { roughness: 0.8 });
    box(22.5, 0.34, 3.6, pathMat, -61.25, 0.16, 7.5).receiveShadow = true;
    box(12.5, 0.34, 3.6, pathMat, -97.75, 0.16, 7.5).receiveShadow = true;
    box(3.6, 0.34, 4.4, pathMat, -104, 0.16, 9.5).receiveShadow = true;
    box(74, 0.32, 3.6, std(0x334155, { roughness: 0.65 }), -85, 0.16, 26.6).receiveShadow = true;
    box(74, 0.9, 0.2, std(0xb45309), -85, 0.75, 28.3);
    obstacle(-85, 28.3, 74, 0.4);

    buildPlaza();
    buildPond();
    buildTrees();
    buildParkGate();

    // Đèn đường dọc lối đi
    const poleMat = std(0x1f2937), lampMat = glow(0xfde68a);
    for (const [lx, lz] of [[-56, 5.3], [-56, 9.7], [-66, 5.3], [-66, 9.7], [-96, 5.3], [-96, 9.7]]) {
      cyl(0.07, 0.09, 3.6, poleMat, lx, 2.1, lz);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lampMat);
      bulb.position.set(lx, 4.0, lz);
      scene.add(bulb);
      obstacle(lx, lz, 0.4, 0.4);
    }
  }

  function buildPlaza() {
    const { x, z, r } = PLAZA;
    const stone = std(0xcfc8ba, { roughness: 0.6 });
    cyl(r, r, 0.34, stone, x, 0.17, z, null, 48).receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.07, 6, 64), std(0x8b8473));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.36, z);
    scene.add(ring);
    // Đài phun nước
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.1, 0.8, 40, 1, true), std(0xe5dfd0, { side: THREE.DoubleSide, roughness: 0.5 }));
    basin.position.set(x, 0.7, z);
    scene.add(basin);
    cyl(3.95, 3.95, 0.05, std(0x38bdf8, { roughness: 0.1, metalness: 0.4, emissive: 0x0c4a6e, emissiveIntensity: 0.6 }), x, 0.82, z, null, 40);
    cyl(0.9, 1.2, 1.5, stone, x, 1.1, z, null, 20);
    cyl(1.5, 1.5, 0.2, stone, x, 1.9, z, null, 24);
    // Tượng ly bia vàng
    const gold = std(0xf2c14e, { metalness: 0.9, roughness: 0.28 });
    cyl(0.62, 0.55, 1.2, gold, x, 2.75, z, null, 20);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 8, 16), gold);
    handle.position.set(x + 0.66, 2.75, z);
    scene.add(handle);
    const foam = std(0xfffbeb, { roughness: 0.6 });
    for (const [dx, dy, dz, s] of [[0, 3.45, 0, 0.5], [0.3, 3.35, 0.2, 0.34], [-0.3, 3.38, -0.18, 0.36]]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), foam);
      f.position.set(x + dx, dy, z + dz);
      scene.add(f);
    }
    obstacle(x, z, 7.4, 7.4);

    // Tia nước: một đối tượng Points, tính quỹ đạo parabol mỗi khung hình
    const N = lite ? 40 : 110;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    drops.frustumCulled = false;
    scene.add(drops);
    animators.push((d, t) => {
      for (let i = 0; i < N; i++) {
        const arm = i % 8, life = ((t * 0.9 + i * 0.137) % 1);
        const a = (arm / 8) * Math.PI * 2 + 0.4;
        const rad = arm < 4 ? 0.2 + life * 2.6 : 0.1 + life * 1.1;
        const peak = arm < 4 ? 2.4 : 3.3;
        pos[i * 3] = x + Math.cos(a) * rad;
        pos[i * 3 + 1] = 2.0 + 4 * peak * life * (1 - life) * 0.55 - life * 0.9 * (arm < 4 ? 1 : 0.2);
        pos[i * 3 + 2] = z + Math.sin(a) * rad;
      }
      geo.attributes.position.needsUpdate = true;
    });

    // Vòng hoa quanh đài phun: nền đất mùn + thảm hoa nhiều màu
    const soilRing = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.85, 48), std(0x2b1d14, { roughness: 1, side: THREE.DoubleSide }));
    soilRing.rotation.x = -Math.PI / 2; soilRing.position.set(x, 0.36, z);
    scene.add(soilRing);
    const ringFlowers = Veg.makeFlowerPatch(5.8, [0xff5c8a, 0xffd23f, 0xffffff, 0xff7a45, 0xc084fc, 0xfb7185], 1.0, 21, 4.5);
    ringFlowers.position.set(x, 0.34, z);
    scene.add(ringFlowers);

    // Ghế đá quanh quảng trường
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const bx = x + Math.cos(a) * 7.7, bz = z + Math.sin(a) * 7.7;
      buildBench(bx, bz, -a - Math.PI / 2);
    }
    // Biển tên
    const plaque = signPlane([['QUẢNG TRƯỜNG LY VÀNG', 62, 70], ['Check-in 1-2-3 DÔ!', 36, 120]], 3.2, 1.0, 640, 160, '#ffd23f', '#14202c');
    plaque.position.set(x, 0.7, z + 4.35);
    plaque.rotation.x = -0.35;
    scene.add(plaque);
  }

  function buildBench(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0.34, z);
    g.rotation.y = ry;
    const seat = std(0xd9d4c7, { roughness: 0.4 }), leg = std(0x475569);
    box(2.2, 0.12, 0.6, seat, 0, 0.5, 0, g);
    box(2.2, 0.5, 0.1, seat, 0, 0.85, -0.3, g);
    box(0.14, 0.5, 0.55, leg, -0.9, 0.25, 0, g);
    box(0.14, 0.5, 0.55, leg, 0.9, 0.25, 0, g);
    scene.add(g);
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    obstacle(x, z, 2.2 * c + 0.6 * s, 2.2 * s + 0.6 * c);
  }

  function buildPond() {
    const { x, z, rx, rz } = POND;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), std(0x0e7490, { roughness: 0.1, metalness: 0.35, emissive: 0x083344, emissiveIntensity: 0.5 }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(rx, rz, 1);
    water.position.set(x, 0.36, z);
    scene.add(water);
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.045, 48), std(0x9ca3af, { side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(rx, rz, 1);
    rim.position.set(x, 0.4, z);
    scene.add(rim);
    // Sen & cá koi
    const lily = std(0x4d9a3c, { roughness: 0.7, side: THREE.DoubleSide });
    const lr = makeRng(11);
    for (let i = 0; i < 10; i++) {
      const a = lr() * Math.PI * 2, rr = Math.sqrt(lr()) * 0.8;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4 + lr() * 0.25, 10), lily);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x + Math.cos(a) * rx * rr, 0.39, z + Math.sin(a) * rz * rr);
      scene.add(pad);
    }
    const koi = [];
    for (let i = 0; i < 4; i++) {
      const fish = new THREE.Group();
      box(0.5, 0.08, 0.2, glow(i % 2 ? 0xff7a1a : 0xfff2d6), 0, 0, 0, fish);
      box(0.18, 0.06, 0.22, glow(0xff7a1a), -0.3, 0, 0, fish);
      fish.position.y = 0.4;
      scene.add(fish);
      koi.push({ fish, ph: i * 1.7, sp: 0.18 + i * 0.05, k: 0.45 + i * 0.12 });
    }
    animators.push((d, t) => {
      for (const f of koi) {
        const a = t * f.sp + f.ph;
        f.fish.position.set(x + Math.cos(a) * rx * f.k, 0.4, z + Math.sin(a) * rz * f.k);
        f.fish.rotation.y = -a - Math.PI / 2 + Math.PI;
      }
    });

    // Cầu gỗ bắc qua hồ (dọc trục z) + lan can đèn lồng
    const z0 = z - rz - 0.6, z1 = z + rz + 0.6, len = z1 - z0, zc = (z0 + z1) / 2;
    const wood = std(0x92400e, { roughness: 0.75 }), rail = std(0x7c2d12);
    box(2.6, 0.14, len, wood, x, 0.45, zc).receiveShadow = true;
    for (const side of [-1, 1]) {
      box(0.1, 0.1, len, rail, x + side * 1.3, 1.2, zc);
      for (let i = 0; i <= 6; i++) {
        const pz = z0 + (len * i) / 6;
        box(0.12, 0.8, 0.12, rail, x + side * 1.3, 0.85, pz);
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), glow(0xef4444));
        lantern.position.set(x + side * 1.3, 1.45, pz);
        scene.add(lantern);
      }
      obstacle(x + side * 1.45, zc, 0.25, len);
    }
    // Chặn đi xuống nước: lưới ô vuông phủ hình elip (chừa hành lang cầu)
    for (let cx = Math.floor(x - rx); cx <= x + rx; cx += 2) {
      for (let cz = Math.floor(z - rz); cz <= z + rz; cz += 2) {
        const ox = cx + 1, oz = cz + 1;
        const inside = ((ox - x) / (rx + 0.6)) ** 2 + ((oz - z) / (rz + 0.6)) ** 2 < 1;
        if (inside && Math.abs(ox - x) > 1.7) obstacle(ox, oz, 2.0, 2.0);
      }
    }
    // Ghế đá ven hồ
    buildBench(x - 12.2, z - 1.5, Math.PI / 2);
    buildBench(x + 12.2, z + 1.5, -Math.PI / 2);
  }

  function buildTrees() {
    const rng = makeRng(2026);
    const max = lite ? 18 : 34;
    const spots = [];
    let tries = 0;
    while (spots.length < max && tries++ < 800) {
      const x = -120 + rng() * 68, z = -3.8 + rng() * 27.0;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2.5) continue;
      if (((x - POND.x) / (POND.rx + 3)) ** 2 + ((z - POND.z) / (POND.rz + 3)) ** 2 < 1) continue;
      if (Math.abs(z - 7.5) < 3.4 && x > -106) continue;           // lối đi chính
      if (Math.abs(x - POND.x) < 3.6 && z > 5 && z < 26) continue;  // lối ra cầu
      if (x > -60 && z > 3 && z < 12) continue;                    // cửa vào công viên
      if (Math.hypot(x + 68, z - 20.2) < 4.2) continue;            // chỗ cặp đôi picnic
      if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 3.6)) continue;
      spots.push({ x, z, s: 0.72 + rng() * 0.4 });
    }
    const kinds = ['broadleaf', 'tall', 'broadleaf', 'flame', 'tall', 'broadleaf', 'frangipani', 'palm'];
    spots.forEach((p, i) => {
      const tree = Veg.makeTree(kinds[i % kinds.length], 40 + i, p.s * 1.1);
      tree.position.set(p.x, 0.3, p.z);
      tree.rotation.y = i * 1.7;
      scene.add(tree);
      obstacle(p.x, p.z, 0.9, 0.9);
      if (i % 4 === 0) peeSpots.push({ type: 'tree', name: 'Cây Xanh Công Viên', x: p.x, z: p.z, radius: 2.2 });
    });
    // Bụi cây + hoa dọc lối đi và quanh hồ
    const shrubCols = [0xff5c8a, 0xffd23f, 0xffffff, 0xc084fc];
    const spots2 = [];
    for (let sx = -56; sx >= -100; sx -= 4.4) { spots2.push([sx, 5.0], [sx - 2.2, 10.1]); }
    for (const a of [0.6, 1.5, 2.4, 3.6, 4.6, 5.6]) spots2.push([POND.x + Math.cos(a) * (POND.rx + 1.6), POND.z + Math.sin(a) * (POND.rz + 1.6)]);
    spots2.forEach(([sx, sz], i) => {
      if (Math.abs(sx - POND.x) < 3 && sz > 8) return;                // chừa lối ra cầu
      if (Math.hypot(sx - PLAZA.x, sz - PLAZA.z) < PLAZA.r + 1) return;
      const sh = Veg.makeShrub(0.75 + (i % 3) * 0.12, 200 + i, i % 2 ? shrubCols : null);
      sh.position.set(sx, 0.3, sz);
      scene.add(sh);
    });
  }

  function buildParkGate() {
    const x = -51, z = 4.0;
    const wood = std(0x5b3a1e);
    box(0.3, 2.6, 0.3, wood, x, 1.6, z - 0.9);
    box(0.3, 2.6, 0.3, wood, x, 1.6, z + 0.9);
    const board = signPlane([['CÔNG VIÊN TRUNG TÂM', 56, 66], ['Đài phun nước • Hồ cầu gỗ', 34, 120]], 3.6, 1.1, 640, 160, '#9ae6b4', '#10261a');
    board.position.set(x + 0.18, 3.0, z);
    board.rotation.y = Math.PI / 2;
    scene.add(board);
    obstacle(x, z - 0.9, 0.5, 0.5);
    obstacle(x, z + 0.9, 0.5, 0.5);
  }


  // ========================================================
  // ========================================================
  // D. Ô TÔ & PHỐ PHƯỜNG SÀI GÒN CHÂN THẬT: VINFAST VF3, TAXI XANH SM, TAXI VINASUN & CẢNH VẬT ĐÔ THỊ
  // ========================================================
  const CAR_CACHE = {};

  // 1. Tấm bóng mờ tiếp xúc mặt đường (Ambient Contact Shadow) giúp xe cộ chạm đất tự nhiên
  function getContactShadowTexture() {
    if (CAR_CACHE.contactShadow) return CAR_CACHE.contactShadow;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const rad = ctx.createRadialGradient(128, 128, 28, 128, 128, 122);
    rad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
    rad.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
    rad.addColorStop(0.8, 'rgba(0, 0, 0, 0.18)');
    rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.contactShadow = tex;
    return tex;
  }

  // 2. Mặt ca-lăng VinFast VF3: Đen bóng vân micro-chevron chữ V, Logo cánh chim Chrome V & Dải crom nối đèn
  function getVF3GrilleTexture() {
    if (CAR_CACHE.vf3Grille) return CAR_CACHE.vf3Grille;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    // Nền đen bóng ca-lăng xe điện
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 128);
    // Họa tiết vân nổi chữ V đặc trưng VinFast
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    for (let x = 20; x < 500; x += 18) {
      for (let y = 16; y < 112; y += 14) {
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 4);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x + 5, y - 4);
        ctx.stroke();
      }
    }
    // Thanh crom chạy dài ôm viền dưới nối sang hai cụm đèn pha
    const chromeGrad = ctx.createLinearGradient(0, 58, 0, 72);
    chromeGrad.addColorStop(0, '#ffffff');
    chromeGrad.addColorStop(0.35, '#cbd5e1');
    chromeGrad.addColorStop(0.7, '#64748b');
    chromeGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = chromeGrad;
    ctx.fillRect(36, 62, 440, 7);

    // Biểu tượng chữ V mạ Chrome dập nổi chính giữa
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = '#cbd5e1';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(256, 94);
    ctx.lineTo(238, 34);
    ctx.lineTo(248, 34);
    ctx.lineTo(256, 70);
    ctx.lineTo(264, 34);
    ctx.lineTo(274, 34);
    ctx.closePath();
    ctx.fill();

    // Hai cánh chim vuốt nhọn từ logo chữ V tỏa ra hai bên
    ctx.beginPath();
    ctx.moveTo(236, 46);
    ctx.quadraticCurveTo(180, 56, 100, 64);
    ctx.lineTo(100, 70);
    ctx.quadraticCurveTo(180, 64, 236, 54);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(276, 46);
    ctx.quadraticCurveTo(332, 56, 412, 64);
    ctx.lineTo(412, 70);
    ctx.quadraticCurveTo(332, 64, 276, 54);
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    CAR_CACHE.vf3Grille = tex;
    return tex;
  }

  // 3. Logo cánh chim Chrome đuôi xe VF3
  function getVF3RearTrimTexture() {
    if (CAR_CACHE.vf3Rear) return CAR_CACHE.vf3Rear;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 512, 128);
    // Logo chữ V chrome đuôi xe
    ctx.fillStyle = '#f8fafc';
    ctx.shadowColor = '#94a3b8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(256, 90);
    ctx.lineTo(240, 38);
    ctx.lineTo(248, 38);
    ctx.lineTo(256, 70);
    ctx.lineTo(264, 38);
    ctx.lineTo(272, 38);
    ctx.closePath();
    ctx.fill();
    // Cánh nẹp crom sau
    ctx.fillRect(80, 64, 152, 4);
    ctx.fillRect(280, 64, 152, 4);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.vf3Rear = tex;
    return tex;
  }

  // 4. Mâm xe thép dập việt dã 16 inch chuẩn VF3 (có ốp nắp chụp tròn + vòng crom + ốc tắc kê như ảnh thật)
  function getVF3WheelCapTexture() {
    if (CAR_CACHE.vf3WheelCap) return CAR_CACHE.vf3WheelCap;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    // Mặt mâm đen mờ
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 256, 256);
    // Các lỗ tản nhiệt tròn xung quanh vành mâm
    ctx.fillStyle = '#09090b';
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const x = 128 + Math.cos(a) * 90;
      const y = 128 + Math.sin(a) * 90;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    // Vòng mạ crom sáng bóng nổi bật (đặc trưng mâm VF3 thực tế)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 128, 56, 0, Math.PI * 2);
    ctx.stroke();
    // Nắp chụp tâm mâm
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.arc(128, 128, 52, 0, Math.PI * 2);
    ctx.fill();
    // 5 Ốc tắc kê bánh xe mạ crom
    ctx.fillStyle = '#cbd5e1';
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const bx = 128 + Math.cos(a) * 32;
      const by = 128 + Math.sin(a) * 32;
      ctx.beginPath();
      ctx.arc(bx, by, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Logo VinFast trung tâm nắp chụp
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(128, 142);
    ctx.lineTo(119, 118);
    ctx.lineTo(124, 118);
    ctx.lineTo(128, 131);
    ctx.lineTo(132, 118);
    ctx.lineTo(137, 118);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.vf3WheelCap = tex;
    return tex;
  }

  // 5. Tem cửa xe Taxi Xanh SM (GSM) - Màu xanh ngọc Cyan, logo Xanh SM, lá mầm, Hotline 1900 2088
  function getTaxiXanhDoorTexture() {
    if (CAR_CACHE.taxiXanhDoor) return CAR_CACHE.taxiXanhDoor;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#00a7b5'; // Màu xanh ngọc đặc trưng Xanh SM
    ctx.fillRect(0, 0, 512, 256);
    // Dải lượn sóng xanh lá cây sinh thái
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, 185);
    ctx.quadraticCurveTo(256, 230, 512, 175);
    ctx.lineTo(512, 215);
    ctx.quadraticCurveTo(256, 260, 0, 225);
    ctx.fill();

    // Chữ XANH SM đậm chất nhận diện
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 68px "Be Vietnam Pro", sans-serif';
    ctx.fillText('XANH SM', 44, 92);
    ctx.fillStyle = '#bbf7d0';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('🌱 TAXI THUẦN ĐIỆN', 46, 142);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('HOTLINE: 1900 2088', 46, 184);

    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.taxiXanhDoor = tex;
    return tex;
  }

  // 6. Hộp đèn nóc Taxi Xanh SM
  function getTaxiXanhRoofTexture() {
    if (CAR_CACHE.taxiXanhRoof) return CAR_CACHE.taxiXanhRoof;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#00a7b5';
    ctx.fillRect(8, 8, 240, 112);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 40px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('XANH SM', 128, 58);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#4ade80';
    ctx.fillText('⚡ TAXI', 128, 96);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.taxiXanhRoof = tex;
    return tex;
  }

  // 7. Tem xe Taxi Vinasun (Sọc kép đỏ - xanh lá, số điện thoại 028 38 27 27 27)
  function getTaxiVinasunDoorTexture() {
    if (CAR_CACHE.vinasunDoor) return CAR_CACHE.vinasunDoor;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 256);
    // Sọc đỏ và sọc xanh lá chạy dài thân xe
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 134, 512, 20);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, 160, 512, 26);
    // Chữ Vinasun Taxi
    ctx.fillStyle = '#15803d';
    ctx.font = '900 56px "Be Vietnam Pro", sans-serif';
    ctx.fillText('VINASUN TAXI', 44, 88);
    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('(028) 38.27.27.27', 48, 126);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.vinasunDoor = tex;
    return tex;
  }

  // 8. Hộp đèn nóc Taxi Vinasun
  function getTaxiVinasunRoofTexture() {
    if (CAR_CACHE.vinasunRoof) return CAR_CACHE.vinasunRoof;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(6, 6, 118, 116);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(132, 6, 118, 116);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 38px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 65, 76);
    ctx.font = '900 24px "Be Vietnam Pro", sans-serif';
    ctx.fillText('38 27', 191, 56);
    ctx.fillText('27 27', 191, 88);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.vinasunRoof = tex;
    return tex;
  }

  // 9. Biển số xe Việt Nam: Biển trắng xe cá nhân (VF3) & Biển vàng xe kinh doanh dịch vụ (Taxi)
  function getVNPlateTexture(text, isCommercial = false) {
    const key = 'plate_' + text + '_' + (isCommercial ? 'y' : 'w');
    if (CAR_CACHE[key]) return CAR_CACHE[key];
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = isCommercial ? '#facc15' : '#f8fafc'; // Vàng taxi hoặc Trắng xe gia đình
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 116);
    // Dấu mộc quốc huy đỏ
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(128, 38, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = '900 50px "Be Vietnam Pro", Arial, sans-serif';
    ctx.fillText(text, 128, 92);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE[key] = tex;
    return tex;
  }

  // 10. Nắp cống thoát nước mưa kim loại vỉa hè
  function getDrainGrateTexture() {
    if (CAR_CACHE.drainGrate) return CAR_CACHE.drainGrate;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#090d16';
    for (let x = 14; x < 244; x += 18) {
      ctx.fillRect(x, 14, 10, 100);
    }
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.drainGrate = tex;
    return tex;
  }

  // 11. Nắp hố ga tròn gang chống trượt giữa lòng đường
  function getManholeTexture() {
    if (CAR_CACHE.manhole) return CAR_CACHE.manhole;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#334155';
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(128, 128, 116, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    for (let r = 24; r <= 96; r += 24) {
      ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 24, 128 + Math.sin(a) * 24);
      ctx.lineTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104);
      ctx.stroke();
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THOÁT NƯỚC', 128, 135);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.manhole = tex;
    return tex;
  }

  // 12. Lưới gang bảo vệ gốc cây đô thị (Tree Grate)
  function getTreeGrateTexture() {
    if (CAR_CACHE.treeGrate) return CAR_CACHE.treeGrate;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#27272a';
    ctx.fillRect(0, 0, 256, 256);
    // Vòng hở chính giữa cho thân cây xuyên qua
    ctx.fillStyle = '#451a03'; // Đất mùn nâu
    ctx.beginPath(); ctx.arc(128, 128, 48, 0, Math.PI * 2); ctx.fill();
    // Các nan hoa gang tỏa tròn
    ctx.strokeStyle = '#52525b';
    ctx.lineWidth = 4;
    for (let r = 56; r <= 116; r += 20) {
      ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
    }
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 48, 128 + Math.sin(a) * 48);
      ctx.lineTo(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.treeGrate = tex;
    return tex;
  }

  // 13. Gạch xúc giác màu vàng dẫn hướng cho người khiếm thị vỉa hè Sài Gòn
  function getTactilePavingTexture() {
    if (CAR_CACHE.tactilePaving) return CAR_CACHE.tactilePaving;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eab308'; // Vàng gạch xúc giác đô thị
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 124);
    // 4 đường gờ nổi định hướng song song
    for (let x = 16; x < 128; x += 32) {
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(x, 4, 14, 120);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(x + 2, 4, 4, 120);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80, 1);
    CAR_CACHE.tactilePaving = tex;
    return tex;
  }

  // 14. Tủ điện hạ thế đô thị EVN HCMC (Vỏ kim loại, khe tản nhiệt, biển tam giác cảnh báo nguy hiểm điện cao thế)
  function getElectricBoxTexture() {
    if (CAR_CACHE.electricBox) return CAR_CACHE.electricBox;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#64748b'; // Kim loại sơn tĩnh điện xám ghi
    ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 240, 368);
    // Khe tản nhiệt trên đầu tủ
    ctx.fillStyle = '#1e293b';
    for (let y = 30; y < 85; y += 12) {
      ctx.fillRect(36, y, 184, 5);
    }
    // Biển tam giác cảnh báo sấm sét nguy hiểm điện cao thế
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(128, 115);
    ctx.lineTo(210, 235);
    ctx.lineTo(46, 235);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.stroke();
    // Biểu tượng tia sét đen
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(132, 138);
    ctx.lineTo(110, 180);
    ctx.lineTo(128, 180);
    ctx.lineTo(120, 222);
    ctx.lineTo(150, 172);
    ctx.lineTo(132, 172);
    ctx.closePath();
    ctx.fill();
    // Chữ cảnh báo an toàn
    ctx.fillStyle = '#ef4444';
    ctx.font = '900 20px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ĐIỆN CAO THẾ', 128, 272);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('CẤM LẠI GẦN', 128, 302);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('EVN HCMC • TB-2026', 128, 338);
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.electricBox = tex;
    return tex;
  }

  // 15. Mũi tên chỉ hướng sơn trắng trên mặt đường nhựa
  function getRoadArrowTexture() {
    if (CAR_CACHE.roadArrow) return CAR_CACHE.roadArrow;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 512);
    ctx.fillStyle = '#f8fafc';
    // Thân và đầu mũi tên đi thẳng
    ctx.beginPath();
    ctx.moveTo(128, 40);
    ctx.lineTo(76, 130);
    ctx.lineTo(112, 130);
    ctx.lineTo(112, 430);
    ctx.lineTo(144, 430);
    ctx.lineTo(144, 130);
    ctx.lineTo(180, 130);
    ctx.closePath();
    ctx.fill();
    // Nhánh rẽ phải uốn lượn
    ctx.beginPath();
    ctx.moveTo(144, 260);
    ctx.quadraticCurveTo(195, 260, 215, 205);
    ctx.lineTo(215, 230);
    ctx.lineTo(248, 185);
    ctx.lineTo(202, 170);
    ctx.lineTo(202, 195);
    ctx.quadraticCurveTo(180, 232, 144, 232);
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    CAR_CACHE.roadArrow = tex;
    return tex;
  }

  // ========================================================
  // ========================================================
  // HỆ THỐNG XE DẠO PHỐ SÀI GÒN (VINFAST VF3 & TAXI XANH SM / VINASUN)
  // - Cho phép nhân vật leo lên xe bằng phím [F] hoặc nút tương tác
  // - Xe nổ máy, bấm còi bíp bíp, bật đèn pha chiếu sáng mặt đường
  // - Xe tự động lái chở người chơi chạy dạo 1 vòng quanh đường phố ven sông Sài Gòn
  // - Ngắm toàn cảnh Landmark 81, bờ sông, quán bar, phố đi bộ lung linh
  // - Có thể bấm [F] để xuống xe bất kỳ lúc nào, hoàn thành chuyến đi nhận XP
  // ========================================================
  let vehicleSeq = 0;
  const VEHICLE_SCALE_VF3 = 1.38;
  const VEHICLE_SCALE_TAXI = 1.35;

  function playCarHorn() {
    try {
      const c = typeof getAudioContext === 'function' ? getAudioContext() : null;
      if (!c) return;
      const now = c.currentTime;
      [0, 0.20].forEach(delay => {
        [440, 554].forEach(f => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sawtooth';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.04, now + delay);
          g.gain.linearRampToValueAtTime(0.04, now + delay + 0.11);
          g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
          o.connect(g);
          g.connect(c.destination);
          o.start(now + delay);
          o.stop(now + delay + 0.16);
        });
      });
    } catch (_) {}
  }

  // Quỹ đạo đường phố khép kín (làn Nam z=8.65, vòng chữ U ở x=45, làn Bắc z=6.35, vòng chữ U ở x=-45)
  const LOOP_STRAIGHT = 90.0;
  const LOOP_RADIUS = 1.15;
  const LOOP_TURN = Math.PI * LOOP_RADIUS;
  const LOOP_TOTAL = 2 * LOOP_STRAIGHT + 2 * LOOP_TURN;

  function getLoopPoint(s) {
    const d = ((s % LOOP_TOTAL) + LOOP_TOTAL) % LOOP_TOTAL;
    if (d < LOOP_STRAIGHT) {
      const t = d / LOOP_STRAIGHT;
      return { x: -45.0 + t * 90.0, z: 8.65, ry: Math.PI / 2 };
    } else if (d < LOOP_STRAIGHT + LOOP_TURN) {
      const arc = (d - LOOP_STRAIGHT) / LOOP_RADIUS;
      const theta = Math.PI / 2 - arc;
      return { x: 45.0 + Math.cos(theta) * LOOP_RADIUS, z: 7.50 + Math.sin(theta) * LOOP_RADIUS, ry: Math.PI / 2 - arc };
    } else if (d < 2 * LOOP_STRAIGHT + LOOP_TURN) {
      const t = (d - (LOOP_STRAIGHT + LOOP_TURN)) / LOOP_STRAIGHT;
      return { x: 45.0 - t * 90.0, z: 6.35, ry: -Math.PI / 2 };
    } else {
      const arc = (d - (2 * LOOP_STRAIGHT + LOOP_TURN)) / LOOP_RADIUS;
      const theta = -Math.PI / 2 - arc;
      return { x: -45.0 + Math.cos(theta) * LOOP_RADIUS, z: 7.50 + Math.sin(theta) * LOOP_RADIUS, ry: -Math.PI / 2 - arc };
    }
  }

  function findClosestS(x, z, ry) {
    if (Math.abs(ry - Math.PI / 2) < 0.6) {
      const clampedX = Math.max(-45, Math.min(45, x));
      return clampedX + 45.0;
    } else {
      const clampedX = Math.max(-45, Math.min(45, x));
      return LOOP_STRAIGHT + LOOP_TURN + (45.0 - clampedX);
    }
  }

  window.VehicleSystem = {
    cars: [],
    activeRide: null,

    register(car) {
      this.cars.push(car);
    },

    findNearest(px, pz, maxDist = 3.8) {
      if (this.activeRide) return null;
      let best = null, bestD = maxDist;
      for (const car of this.cars) {
        const d = Math.hypot(px - car.position.x, pz - car.position.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) {
        const isVF3 = best.userData.model === 'vf3';
        return {
          car: best,
          prompt: isVF3
            ? 'Lên xe VinFast VF3 vi vu dạo phố ngắm Landmark 81'
            : ('Lên ' + best.userData.name + ' dạo 1 vòng Sài Gòn'),
          dist: bestD
        };
      }
      return null;
    },

    isRiding() {
      return !!this.activeRide;
    },

    handleInteract() {
      if (this.activeRide) {
        this.exitRide();
      } else {
        const near = this.findNearest(localPlayerState.x, localPlayerState.z);
        if (near) this.startRide(near.car);
      }
    },

    startRide(car) {
      if (this.activeRide) return;
      playCarHorn();

      if (!car.userData.headlightBeam) {
        const beamGroup = new THREE.Group();
        for (const sx of [-0.65, 0.65]) {
          const spot = new THREE.SpotLight(0xfff7ed, 4.0, 32, Math.PI / 5, 0.45, 1.2);
          spot.position.set(sx * car.scale.x, 0.65 * car.scale.y, 1.8 * car.scale.z);
          const tgt = new THREE.Object3D();
          tgt.position.set(sx * car.scale.x, 0.1, 15 * car.scale.z);
          beamGroup.add(spot, tgt);
          spot.target = tgt;
        }
        car.add(beamGroup);
        car.userData.headlightBeam = beamGroup;
      }
      car.userData.headlightBeam.visible = true;

      const startS = findClosestS(car.position.x, car.position.z, car.rotation.y);
      const targetPoint = getLoopPoint(startS);

      this.activeRide = {
        car,
        state: 'pullout',
        tPull: 0,
        pullDuration: 1.6,
        startX: car.position.x,
        startZ: car.position.z,
        startRy: car.rotation.y,
        targetX: targetPoint.x + Math.sin(targetPoint.ry) * 4.0,
        targetZ: targetPoint.z,
        targetRy: targetPoint.ry,
        s: startS + 4.0,
        speed: 0,
        maxSpeed: 11.5,
        lapDistance: 0,
      };

      localPlayerState.is_riding_car = true;
      if (typeof clearClickTarget === 'function') clearClickTarget();

      if (typeof setTicker === 'function') {
        setTicker('🚗 Bạn đã lên ' + car.userData.name + '! Xe đang chở bạn dạo một vòng ngắm cảnh Landmark 81...');
      }
      if (window.Features && Features.toast) {
        Features.toast('🚗 Đang vi vu ' + car.userData.name + '! Nhấn [F] hoặc [Xuống xe] bất kỳ lúc nào để dừng.', 'success', 5000);
      }
    },

    exitRide() {
      if (!this.activeRide) return;
      const { car } = this.activeRide;

      if (car.userData.headlightBeam) car.userData.headlightBeam.visible = false;

      const curbZ = car.position.z > 7.5 ? 11.4 : 3.6;
      localPlayerState.x = car.position.x;
      localPlayerState.z = curbZ;
      localPlayerState.is_riding_car = false;
      localPlayerState.groundY = WORLD_BOUNDS.groundY(localPlayerState.x, localPlayerState.z);

      if (localCharacter) {
        localCharacter.mesh.position.set(localPlayerState.x, localPlayerState.groundY, localPlayerState.z);
        localCharacter.mesh.rotation.y = car.position.z > 7.5 ? Math.PI : 0;
        localCharacter.mesh.scale.set(1, 1, 1);
        if (localCharacter.leftLeg) localCharacter.leftLeg.rotation.x = 0;
        if (localCharacter.rightLeg) localCharacter.rightLeg.rotation.x = 0;
      }

      car.position.set(car.userData.originalX, 0, car.userData.originalZ);
      car.rotation.y = car.userData.originalRy;

      this.activeRide = null;

      if (typeof sendAction === 'function') {
        sendAction({ action: 'award', xp: 20, reason: 'Dạo phố Sài Gòn' });
      }
      if (typeof setTicker === 'function') {
        setTicker('🎉 Đã xuống xe an toàn. Chúc bạn một ngày dạo phố vui vẻ!');
      }
      if (window.Features && Features.toast) {
        Features.toast('🎉 Chuyến dạo phố hoàn tất! +20 XP ngắm cảnh thành phố.', 'info', 4000);
      }
    },

    update(delta) {
      if (!this.activeRide) return;
      const ride = this.activeRide;
      const car = ride.car;

      if (ride.state === 'pullout') {
        ride.tPull += delta;
        const progress = Math.min(1.0, ride.tPull / ride.pullDuration);
        const smooth = progress * progress * (3 - 2 * progress);

        car.position.x = ride.startX + (ride.targetX - ride.startX) * smooth;
        car.position.z = ride.startZ + (ride.targetZ - ride.startZ) * smooth;

        let dRy = ride.targetRy - ride.startRy;
        while (dRy > Math.PI) dRy -= Math.PI * 2;
        while (dRy < -Math.PI) dRy += Math.PI * 2;
        car.rotation.y = ride.startRy + dRy * smooth;

        ride.speed = Math.min(ride.maxSpeed, ride.speed + delta * 6.0);

        if (progress >= 1.0) {
          ride.state = 'cruising';
        }
      } else if (ride.state === 'cruising') {
        ride.speed = Math.min(ride.maxSpeed, ride.speed + delta * 4.0);
        ride.s += ride.speed * delta;
        ride.lapDistance += ride.speed * delta;

        const pt = getLoopPoint(ride.s);
        car.position.x = pt.x;
        car.position.z = pt.z;
        car.rotation.y = pt.ry;

        if (ride.lapDistance >= LOOP_TOTAL) {
          ride.lapDistance = 0;
          if (window.Features && Features.toast) {
            Features.toast('🚕 Đã đi được 1 vòng ngắm phố Sài Gòn! Nhấn [F] để xuống xe hoặc tiếp tục ngắm cảnh.', 'info', 4000);
          }
        }
      }

      if (car.userData.wheels) {
        const rollSpeed = (ride.speed * delta) / (0.31 * car.scale.x);
        for (const w of car.userData.wheels) {
          w.rotation.x += rollSpeed;
        }
      }

      const driverOffsetX = -0.32 * car.scale.x;
      const driverOffsetY = 0.04 * car.scale.y;
      const driverOffsetZ = 0.05 * car.scale.z;

      const cos = Math.cos(car.rotation.y), sin = Math.sin(car.rotation.y);
      const px = car.position.x + driverOffsetX * cos + driverOffsetZ * sin;
      const pz = car.position.z - driverOffsetX * sin + driverOffsetZ * cos;
      const py = car.position.y + driverOffsetY;

      localPlayerState.x = car.position.x;
      localPlayerState.z = car.position.z;
      localPlayerState.ry = car.rotation.y;

      if (localCharacter) {
        localCharacter.mesh.position.set(px, py, pz);
        localCharacter.mesh.rotation.y = car.rotation.y;
        localCharacter.mesh.scale.set(0.85, 0.85, 0.85);
        if (localCharacter.leftLeg) localCharacter.leftLeg.rotation.x = -1.35;
        if (localCharacter.rightLeg) localCharacter.rightLeg.rotation.x = -1.35;
      }
    }
  };

  // VINFAST VF3 TẢ THỰC CHI TIẾT CAO (TỶ LỆ CHUẨN SUV MINI ĐIỆN 2 CỬA)
  // Tham khảo trực tiếp hình ảnh thực tế của người dùng:
  // - Ngoại thất 2 tông màu nổi bật (Thân Vàng Solar / Mui Trắng, vát rãnh gia cường)
  // - Cản trước việt dã vát góc (chamfered), hốc hút gió, cảm biến radar, ốp chống trượt gầm màu bạc satin
  // - Mặt ca-lăng đen bóng với logo cánh chim mạ crom và dải crom viền nối đèn
  // - Đèn pha projector thấu kính bi cầu đơn LED mạ crom + phản quang cam thể thao + dải LED định vị ban ngày (DRL)
  // - Ốp cua lốp (vè chắn bùn) vuông vắn hầm hố dập nổi quanh 4 bánh xe
  // - Mâm thép dập việt dã 16 inch với nắp chụp tâm tròn viền crom + 5 ốc tắc kê chuẩn ảnh thật
  // - Cánh gió sau tích hợp đèn phanh thứ 3 trên cao & ăng-ten vây cá mập
  // ========================================================
  function buildVF3(color, x, z, ry, options = {}) {
    const g = new THREE.Group();

    // Vật liệu PBR xe cao cấp
    const bodyPaint = std(color, { roughness: 0.22, metalness: 0.42 });
    const blackPlastic = std(0x181a20, { roughness: 0.88 }); // Nhựa sần ốp cản & cua lốp
    const satinSilver = std(0xcbd5e1, { metalness: 0.82, roughness: 0.28 }); // Crom mờ ốp bệ bước & cản
    const chromeMat = std(0xf8fafc, { metalness: 0.96, roughness: 0.1 });
    const darkGlass = std(0x060b14, { roughness: 0.06, metalness: 0.88 });
    const tireRubber = std(0x0f141d, { roughness: 0.94 });

    // 1. Tấm bóng mờ tiếp xúc mặt đường (Contact Shadow)
    const shadowGeo = new THREE.PlaneGeometry(2.1, 3.4);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    g.add(shadow);

    // 2. Gầm xe & Khung chịu lực
    box(1.5, 0.22, 2.9, std(0x11161f, { roughness: 0.95 }), 0, 0.28, 0, g);
    // Hốc bánh xe lót nhựa đen chống nhìn xuyên gầm
    box(1.52, 0.36, 0.76, std(0x0a0c10), 0, 0.45, 0.98, g);
    box(1.52, 0.36, 0.76, std(0x0a0c10), 0, 0.45, -0.98, g);

    // 3. Cản trước dập nổi hầm hố có vát góc (Front Bumper Cladding với Chamfered Corners)
    // Khối cản trung tâm
    box(1.24, 0.38, 0.52, blackPlastic, 0, 0.45, 1.48, g);
    // Hai góc cản vát chéo ôm theo hốc bánh xe khí động học
    const bLeft = box(0.38, 0.38, 0.44, blackPlastic, -0.68, 0.45, 1.35, g);
    bLeft.rotation.y = 0.30;
    const bRight = box(0.38, 0.38, 0.44, blackPlastic, 0.68, 0.45, 1.35, g);
    bRight.rotation.y = -0.30;

    // Hốc hút gió & tản nhiệt pin dưới màu đen sâu
    box(0.92, 0.12, 0.08, std(0x09090b), 0, 0.36, 1.75, g);
    // Tấm ốp gầm bảo vệ việt dã màu bạc satin với 2 gân dập nổi thể thao
    box(0.78, 0.08, 0.22, satinSilver, 0, 0.24, 1.58, g);
    box(0.04, 0.05, 0.20, satinSilver, -0.22, 0.26, 1.58, g);
    box(0.04, 0.05, 0.20, satinSilver, 0.22, 0.26, 1.58, g);

    // Đèn sương mù tròn LED gầm hai bên cản trước & Khe gió khí động học
    for (const sx of [-1, 1]) {
      cyl(0.045, 0.045, 0.04, glow(0xfffbeb), sx * 0.62, 0.36, 1.58, g, 12);
      box(0.02, 0.16, 0.06, std(0x09090b), sx * 0.78, 0.46, 1.42, g);
      // Cảm biến radar trước
      cyl(0.025, 0.025, 0.02, std(0x09090b), sx * 0.42, 0.46, 1.75, g);
    }
    // Nắp móc kéo xe phía trước
    box(0.05, 0.05, 0.01, std(0x0a0a0c), 0.36, 0.45, 1.745, g);

    // Biển số trước VF3
    const fPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.2),
      new THREE.MeshBasicMaterial({ map: getVNPlateTexture('VF 3', false) })
    );
    fPlate.position.set(0, 0.44, 1.76);
    g.add(fPlate);

    // 4. Cản sau việt dã (Rear Bumper Cladding)
    box(1.24, 0.40, 0.45, blackPlastic, 0, 0.48, -1.48, g);
    const rbLeft = box(0.38, 0.40, 0.40, blackPlastic, -0.68, 0.48, -1.35, g);
    rbLeft.rotation.y = -0.30;
    const rbRight = box(0.38, 0.40, 0.40, blackPlastic, 0.68, 0.48, -1.35, g);
    rbRight.rotation.y = 0.30;
    // Tấm ốp gầm sau màu bạc satin
    box(0.78, 0.08, 0.20, satinSilver, 0, 0.26, -1.58, g);
    // Đèn phản quang đỏ an toàn hai bên cản sau
    for (const sx of [-1, 1]) {
      box(0.24, 0.06, 0.02, glow(0xef4444), sx * 0.58, 0.45, -1.71, g);
    }
    // Biển số sau
    const rPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.2),
      new THREE.MeshBasicMaterial({ map: getVNPlateTexture('VF 3', false) })
    );
    rPlate.position.set(0, 0.52, -1.71);
    rPlate.rotation.y = Math.PI;
    g.add(rPlate);

    // 5. Cua lốp vuông vức hầm hố (Squared Off-Road Wheel Arches) & Ốp sườn
    for (const sx of [-1, 1]) {
      // Vè cua lốp trước
      box(0.12, 0.38, 0.72, blackPlastic, sx * 0.84, 0.55, 0.98, g);
      // Vè cua lốp sau
      box(0.12, 0.38, 0.72, blackPlastic, sx * 0.84, 0.55, -0.98, g);
      // Bệ bước chân sườn xe nối 2 vè lốp
      box(0.08, 0.22, 1.35, blackPlastic, sx * 0.83, 0.38, 0, g);
      // Nẹp crom satin viền bệ bước
      box(0.03, 0.05, 1.35, satinSilver, sx * 0.86, 0.30, 0, g);
      // Tay nắm cửa đen chắc chắn
      box(0.04, 0.06, 0.18, std(0x18181b), sx * 0.84, 0.92, 0.12, g);
    }

    // 6. Thân xe chính (Lower Body Tub)
    box(1.64, 0.52, 2.95, bodyPaint, 0, 0.78, 0, g);
    // Nắp ca-pô vuốt dốc nhẹ phía trước có 2 gân dập cơ bắp thể thao
    box(1.54, 0.12, 0.92, bodyPaint, 0, 0.96, 0.98, g);
    for (const sx of [-1, 1]) {
      box(0.04, 0.025, 0.82, bodyPaint, sx * 0.52, 1.025, 0.96, g);
    }
    // Mép mũi ca-pô hơi vát nhẹ ôm lấy cụm đèn
    const hoodNose = box(1.50, 0.04, 0.14, bodyPaint, 0, 0.96, 1.44, g);
    hoodNose.rotation.x = 0.16;

    // 7. Mặt ca-lăng đặc trưng VinFast (Front Fascia with Chrome Winglets & "V" Logo)
    const grilleMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.24),
      new THREE.MeshBasicMaterial({ map: getVF3GrilleTexture() })
    );
    grilleMesh.position.set(0, 0.84, 1.54);
    g.add(grilleMesh);

    // Cụm đèn pha Projector bi cầu LED mạ crom + Phản quang cam góc chuẩn ảnh thật VF3
    for (const sx of [-1, 1]) {
      // Vỏ hộp đèn pha màu đen
      box(0.36, 0.20, 0.06, std(0x18181b), sx * 0.54, 0.84, 1.52, g);
      // Chóa phản xạ mạ crom bên trong
      box(0.34, 0.18, 0.04, chromeMat, sx * 0.54, 0.84, 1.53, g);
      // Thấu kính bi cầu LED Projector đơn tròn sáng rực rỡ chuẩn VF3
      cyl(0.065, 0.065, 0.045, glow(0xffffff), sx * 0.52, 0.84, 1.55, g, 16);
      // Vòng tròn halo viền crom bọc quanh thấu kính projector
      cyl(0.078, 0.078, 0.035, chromeMat, sx * 0.52, 0.84, 1.545, g, 16);
      // Miếng phản quang màu cam thể thao ở góc đèn ngoài cùng (như ảnh thật)
      box(0.05, 0.14, 0.035, glow(0xf59e0b), sx * 0.67, 0.84, 1.545, g);
      // Mặt kính đèn pha trong suốt bảo vệ
      box(0.35, 0.19, 0.02, std(0xf1f5f9, { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.9 }), sx * 0.54, 0.84, 1.57, g);
    }

    // 8. Đuôi xe: Logo V crom & Cụm đèn hậu LED
    const rearTrim = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.2),
      new THREE.MeshBasicMaterial({ map: getVF3RearTrimTexture() })
    );
    rearTrim.position.set(0, 0.88, -1.50);
    rearTrim.rotation.y = Math.PI;
    g.add(rearTrim);

    for (const sx of [-1, 1]) {
      // Đèn phanh LED đỏ + Đèn xi-nhan vàng + Đèn lùi trắng
      box(0.32, 0.12, 0.04, glow(0xef4444), sx * 0.54, 0.88, -1.51, g);
      box(0.10, 0.05, 0.045, glow(0xf59e0b), sx * 0.54 + sx * 0.09, 0.88, -1.51, g);
    }

    // 9. Khoang cabin & Kính xe (Greenhouse Glass & Floating Roof)
    // Kính chắn gió trước nghiêng khí động học
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.58), darkGlass);
    windshield.position.set(0, 1.28, 0.86);
    windshield.rotation.x = -Math.PI / 6.2;
    g.add(windshield);
    // Gương chiếu hậu trung tâm bên trong xe
    box(0.18, 0.06, 0.04, std(0x0f172a), 0, 1.45, 0.72, g);
    // Cần gạt nước kính lái
    box(0.55, 0.02, 0.02, std(0x0f172a), -0.25, 1.06, 1.10, g);
    box(0.55, 0.02, 0.02, std(0x0f172a), 0.32, 1.06, 1.10, g);

    // Kính hông hai bên & Kính sau
    for (const sx of [-1, 1]) {
      box(0.04, 0.44, 1.78, darkGlass, sx * 0.77, 1.28, -0.15, g);
      // Cột A, B, C màu đen mờ tạo hiệu ứng mui xe nổi (Floating Roof)
      box(0.05, 0.45, 0.12, blackPlastic, sx * 0.775, 1.28, 0.05, g);
    }
    box(1.38, 0.44, 0.04, darkGlass, 0, 1.28, -1.35, g);
    // Cần gạt nước kính sau
    box(0.32, 0.02, 0.02, std(0x0f172a), 0, 1.12, -1.38, g);

    // 10. Mui xe 2 tông màu nổi bật (Floating Roof với 4 rãnh gân gia cường như ảnh thật)
    const roofColor = (color === 0xf8fafc) ? 0x111827 : 0xffffff;
    const roofMat = std(roofColor, { roughness: 0.28, metalness: 0.2 });
    box(1.52, 0.08, 2.18, roofMat, 0, 1.56, -0.22, g);
    // 4 rãnh gân dập gia cường trên nóc xe
    for (const rx of [-0.48, -0.16, 0.16, 0.48]) {
      box(0.04, 0.03, 1.95, roofMat, rx, 1.61, -0.22, g);
    }
    // Cánh gió đuôi thể thao (Rear Spoiler) & Đèn phanh thứ ba
    box(1.52, 0.06, 0.34, roofMat, 0, 1.57, -1.36, g);
    box(0.42, 0.03, 0.02, glow(0xef4444), 0, 1.57, -1.535, g);
    // Ăng-ten vây cá mập
    box(0.04, 0.08, 0.18, roofMat, 0, 1.64, -0.92, g);

    // 11. Gương chiếu hậu SUV góc cạnh
    for (const sx of [-1, 1]) {
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(sx * 0.92, 1.16, 0.55);
      // Chân gương đen
      cyl(0.02, 0.02, 0.14, blackPlastic, 0, 0, 0, mirrorGroup);
      // Ốp gương
      box(0.12, 0.15, 0.22, blackPlastic, sx * 0.06, 0.05, 0, mirrorGroup);
      box(0.12, 0.06, 0.22, bodyPaint, sx * 0.06, 0.10, 0, mirrorGroup);
      // Dải đèn xi-nhan LED vàng trên gương
      box(0.02, 0.03, 0.2, glow(0xf59e0b), sx * 0.12, 0.05, 0, mirrorGroup);
      // Mặt kính gương phản chiếu
      box(0.01, 0.12, 0.18, chromeMat, -sx * 0.01, 0.05, -0.01, mirrorGroup);
      g.add(mirrorGroup);
    }

    // 12. Bốn bánh xe dã ngoại 16 inch (Mâm thép dập + Ốp nắp chụp tròn crom chuẩn VF3)
    const wheelR = 0.31, halfW = 0.84;
    const zs = [-0.98, 0.98];
    const wheelCapMat = new THREE.MeshBasicMaterial({ map: getVF3WheelCapTexture() });
    const vf3Wheels = [];

    for (const sx of [-1, 1]) {
      for (const zpos of zs) {
        // Lốp cao su gai dã ngoại
        const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 22), tireRubber);
        tireMesh.rotation.z = Math.PI / 2;
        tireMesh.position.set(sx * halfW, wheelR, zpos);

        // Đĩa phanh bên trong
        const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 16), chromeMat);
        brakeDisc.rotation.z = Math.PI / 2;
        brakeDisc.position.set(sx * (halfW - sx * 0.04), wheelR, zpos);

        // Mặt mâm xe với nắp chụp tâm tròn crom và ốc tắc kê
        const capMesh = new THREE.Mesh(new THREE.CircleGeometry(wheelR * 0.88, 22), wheelCapMat);
        capMesh.rotation.y = sx * Math.PI / 2;
        capMesh.position.set(sx * (halfW + sx * 0.112), wheelR, zpos);

        g.add(tireMesh, brakeDisc, capMesh);
        vf3Wheels.push(tireMesh);
      }
    }

    // Tỉ lệ SUV chuẩn cân đối với nhân vật Chibi (Xe to lớn vững chãi hơn nhân vật)
    g.scale.set(VEHICLE_SCALE_VF3, VEHICLE_SCALE_VF3, VEHICLE_SCALE_VF3);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);

    g.userData = {
      id: 'vf3_' + (++vehicleSeq),
      type: 'car',
      model: 'vf3',
      name: 'VinFast VF3',
      color: color,
      wheels: vf3Wheels,
      originalX: x,
      originalZ: z,
      originalRy: ry
    };
    if (window.VehicleSystem) window.VehicleSystem.register(g);

    // Vật cản chống người chơi đi xuyên xe
    const along = Math.abs(Math.sin(ry)) > 0.7;
    obstacle(x, z, along ? 3.3 * VEHICLE_SCALE_VF3 : 1.8 * VEHICLE_SCALE_VF3, along ? 1.8 * VEHICLE_SCALE_VF3 : 3.3 * VEHICLE_SCALE_VF3);
    return g;
  }

  // ========================================================
  // TAXI SÀI GÒN TẢ THỰC (ĐỒNG THỜI HỖ TRỢ TAXI XANH SM VÀ TAXI VINASUN)
  // - TAXI XANH SM: Kiểu dáng xe điện VinFast, màu xanh ngọc Cyan, dải LED cánh chim VinFast, logo Xanh SM, hotline 1900 2088, biển vàng dịch vụ.
  // - TAXI VINASUN: Kiểu dáng sedan trắng thanh lịch, calang crom Toyota, sọc kép đỏ - xanh lá, số tổng đài 028 38 27 27 27.
  // - Cả hai đều có hộp đèn nóc phát sáng ban đêm, đồng hồ tính tiền taximeter hiển thị bên trong kính lái!
  // ========================================================
  function buildTaxi(x, z, ry, brand = 'xanh') {
    const isXanh = brand === 'xanh';
    const g = new THREE.Group();

    const bodyColor = isXanh ? 0x00a7b5 : 0xf8fafc;
    const bodyMat = std(bodyColor, { roughness: 0.25, metalness: 0.38 });
    const chromeMat = std(0xf1f5f9, { metalness: 0.95, roughness: 0.12 });
    const darkGlass = std(0x070c14, { roughness: 0.06, metalness: 0.85 });
    const tireMat = std(0x0f141d, { roughness: 0.94 });
    const blackTrim = std(0x181a20, { roughness: 0.85 });

    // 1. Tấm bóng mờ tiếp xúc mặt đường (Contact Shadow)
    const shadowGeo = new THREE.PlaneGeometry(2.3, 4.6);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    g.add(shadow);

    // 2. Thân xe sedan / crossover hiện đại
    // Phần thân dưới
    box(1.78, 0.48, 4.35, bodyMat, 0, 0.54, 0, g);
    // Nắp ca-pô vuốt dốc khí động học
    box(1.70, 0.16, 1.25, bodyMat, 0, 0.82, 1.35, g);
    // Cốp sau sedan
    box(1.70, 0.18, 0.95, bodyMat, 0, 0.84, -1.55, g);
    // Cản trước & Hốc hút gió
    box(1.76, 0.32, 0.35, blackTrim, 0, 0.36, 2.15, g);
    box(1.10, 0.14, 0.08, std(0x09090b), 0, 0.32, 2.32, g);
    // Cản sau & Bộ khuếch tán khí
    box(1.76, 0.36, 0.35, blackTrim, 0, 0.40, -2.15, g);

    if (isXanh) {
      // Dải đèn LED cánh chim VinFast đặc trưng trên đầu xe Taxi Xanh SM
      box(0.12, 0.04, 0.03, chromeMat, 0, 0.84, 2.08, g);
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.025, 0.03), glow(0x67e8f9));
        wing.position.set(sx * 0.42, 0.83, 2.06);
        wing.rotation.z = -sx * 0.08;
        g.add(wing);
      }
    } else {
      // Lưới tản nhiệt mạ crom Toyota Vios / Innova của Taxi Vinasun
      box(0.85, 0.12, 0.04, chromeMat, 0, 0.72, 2.16, g);
      box(0.92, 0.02, 0.045, chromeMat, 0, 0.76, 2.16, g);
      // Ống xả mạ crom phía sau
      cyl(0.04, 0.04, 0.18, chromeMat, 0.65, 0.26, -2.25, g, 10).rotation.x = Math.PI / 2;
    }

    // 3. Biển số xe dịch vụ vận tải màu vàng (51H-889.98 / 51F-765.43)
    const plateNo = isXanh ? '51H • 889.98' : '51F • 765.43';
    const fPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: getVNPlateTexture(plateNo, true) }));
    fPlate.position.set(0, 0.38, 2.33); g.add(fPlate);

    const rPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: getVNPlateTexture(plateNo, true) }));
    rPlate.position.set(0, 0.48, -2.33); rPlate.rotation.y = Math.PI; g.add(rPlate);

    // 4. Kính chắn gió vát nghiêng thanh lịch & Khoang cabin
    // Kính trước vát 32 độ
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.72), darkGlass);
    windshield.position.set(0, 1.18, 0.82);
    windshield.rotation.x = -Math.PI / 5.2;
    g.add(windshield);
    // Đồng hồ tính tiền taxi meter phát sáng màu xanh lá bên trong kính lái
    box(0.24, 0.09, 0.05, glow(0x22c55e), 0.28, 0.98, 0.68, g);
    // Đèn báo "CÓ KHÁCH / FOR HIRE" màu đỏ/xanh
    box(0.14, 0.06, 0.03, glow(0xef4444), -0.38, 1.28, 0.75, g);

    // Kính sau vát nhẹ
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.62), darkGlass);
    rearGlass.position.set(0, 1.18, -1.22);
    rearGlass.rotation.x = Math.PI / 5.8;
    g.add(rearGlass);

    // Đèn phanh thứ ba trên cao ở kính sau
    box(0.28, 0.025, 0.02, glow(0xef4444), 0, 1.44, -1.25, g);

    // Mui xe phẳng
    box(1.52, 0.06, 2.05, bodyMat, 0, 1.48, -0.20, g);

    // 5. Tem hông xe Taxi (Xanh SM hoặc Vinasun) & Cửa sổ hai bên
    const doorTex = isXanh ? getTaxiXanhDoorTexture() : getTaxiVinasunDoorTexture();
    const doorMat = new THREE.MeshBasicMaterial({ map: doorTex });
    for (const sx of [-1, 1]) {
      // Kính hông
      box(0.04, 0.42, 2.02, darkGlass, sx * 0.80, 1.18, -0.20, g);
      // Tem dán cửa hông taxi
      const doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.42), doorMat);
      doorMesh.position.set(sx * 0.90, 0.68, -0.05);
      doorMesh.rotation.y = sx * Math.PI / 2;
      g.add(doorMesh);
      // Tay nắm cửa mạ crom
      box(0.04, 0.05, 0.16, chromeMat, sx * 0.91, 0.76, 0.42, g);
      box(0.04, 0.05, 0.16, chromeMat, sx * 0.91, 0.76, -0.52, g);
      // Gương chiếu hậu
      box(0.10, 0.12, 0.18, bodyMat, sx * 0.95, 1.05, 0.72, g);
      box(0.01, 0.09, 0.14, chromeMat, sx * 0.89, 1.05, 0.70, g);
    }

    // 6. Hộp đèn mui taxi phát sáng (Light Box on Roof)
    const roofTex = isXanh ? getTaxiXanhRoofTexture() : getTaxiVinasunRoofTexture();
    const roofLightMat = new THREE.MeshBasicMaterial({ map: roofTex });
    box(0.68, 0.22, 0.32, roofLightMat, 0, 1.62, -0.20, g);
    // Chân đế cao su đen gắn đèn nóc
    box(0.72, 0.03, 0.36, blackTrim, 0, 1.50, -0.20, g);

    // 7. Cụm đèn pha & Đèn hậu LED
    for (const sx of [-1, 1]) {
      // Đèn pha trước
      box(0.38, 0.14, 0.06, glow(0xfff8db), sx * 0.62, 0.74, 2.16, g);
      // Đèn sương mù gầm
      cyl(0.045, 0.045, 0.03, glow(0xfef08a), sx * 0.64, 0.36, 2.22, g, 12);
      // Đèn hậu đỏ đa khoang
      box(0.38, 0.12, 0.06, glow(0xef4444), sx * 0.62, 0.78, -2.16, g);
      box(0.12, 0.06, 0.065, glow(0xf59e0b), sx * 0.74, 0.78, -2.16, g); // Xi-nhan
    }

    // 8. Bánh xe mâm đúc hợp kim thể thao
    const wheelR = 0.31, halfW = 0.88;
    const zs = [-1.35, 1.35];
    const taxiWheels = [];
    for (const sx of [-1, 1]) {
      for (const zpos of zs) {
        // Lốp cao su
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 20), tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(sx * halfW, wheelR, zpos);
        // Vành mâm nhôm phay xước thể thao
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, 0.23, 14), chromeMat);
        rim.rotation.z = Math.PI / 2;
        rim.position.copy(tire.position);
        // Đĩa phanh
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.48, wheelR * 0.48, 0.02, 12), chromeMat);
        brake.rotation.z = Math.PI / 2;
        brake.position.set(sx * (halfW - sx * 0.03), wheelR, zpos);
        g.add(tire, rim, brake);
        taxiWheels.push(tire);
      }
    }

    // Tỉ lệ Taxi chuẩn cân đối với nhân vật Chibi
    g.scale.set(VEHICLE_SCALE_TAXI, VEHICLE_SCALE_TAXI, VEHICLE_SCALE_TAXI);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);

    g.userData = {
      id: 'taxi_' + (++vehicleSeq),
      type: 'car',
      model: isXanh ? 'taxi_xanh' : 'taxi_vinasun',
      name: isXanh ? 'Taxi Xanh SM' : 'Taxi Vinasun',
      brand: brand,
      wheels: taxiWheels,
      originalX: x,
      originalZ: z,
      originalRy: ry
    };
    if (window.VehicleSystem) window.VehicleSystem.register(g);

    const along = Math.abs(Math.sin(ry)) > 0.7;
    obstacle(x, z, along ? 4.5 * VEHICLE_SCALE_TAXI : 1.9 * VEHICLE_SCALE_TAXI, along ? 1.9 * VEHICLE_SCALE_TAXI : 4.5 * VEHICLE_SCALE_TAXI);
    return g;
  }

  // ========================================================
  // XE MÁY SÀI GÒN DỰNG CHÂN CHỐNG NGHIÊNG VEN ĐƯỜNG (HONDA SH & XE SỐ WAVE)
  // ========================================================
  function buildMotorbike(px, pz, ry = 0, color = 0xf8fafc, isScooter = true) {
    const bike = new THREE.Group();
    bike.position.set(px, 0.31, pz);
    bike.rotation.y = ry;
    bike.rotation.z = -0.12; // Nghiêng 7 độ tự nhiên trên chân chống nghiêng!

    const paintMat = std(color, { roughness: 0.25, metalness: 0.35 });
    const blackMat = std(0x18181b, { roughness: 0.9 });
    const chromeMat = std(0xe2e8f0, { metalness: 0.9, roughness: 0.15 });
    const tireMat = std(0x0f141d, { roughness: 0.95 });

    const wheelR = 0.22;
    // Bánh trước
    const fTire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.08, 16), tireMat);
    fTire.rotation.z = Math.PI / 2;
    fTire.position.set(0, wheelR, 0.62);
    // Bánh sau
    const rTire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.09, 16), tireMat);
    rTire.rotation.z = Math.PI / 2;
    rTire.position.set(0, wheelR, -0.62);
    bike.add(fTire, rTire);

    // Thân xe & Yếm xe
    if (isScooter) {
      // Kiểu xe tay ga cao cấp (Honda SH)
      box(0.38, 0.06, 0.55, blackMat, 0, 0.22, 0, bike); // Sàn để chân
      box(0.42, 0.52, 0.18, paintMat, 0, 0.52, 0.38, bike); // Yếm trước
      box(0.38, 0.36, 0.72, paintMat, 0, 0.44, -0.32, bike); // Thân sau
      box(0.32, 0.10, 0.68, std(0x27272a, { roughness: 0.9 }), 0, 0.64, -0.30, bike); // Yên đôi
    } else {
      // Kiểu xe số thanh lịch (Honda Wave)
      box(0.24, 0.28, 0.42, chromeMat, 0, 0.30, 0, bike); // Khung sườn & lốc máy
      box(0.36, 0.46, 0.28, paintMat, 0, 0.48, 0.28, bike); // Yếm gió
      box(0.26, 0.09, 0.72, std(0x27272a), 0, 0.62, -0.26, bike); // Yên dài
    }

    // Ghi đông tay lái
    cyl(0.02, 0.02, 0.58, chromeMat, 0, 0.88, 0.46, bike).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) {
      // Tay nắm cao su & Gương chiếu hậu
      cyl(0.028, 0.028, 0.12, blackMat, sx * 0.25, 0.88, 0.46, bike).rotation.z = Math.PI / 2;
      cyl(0.008, 0.008, 0.16, chromeMat, sx * 0.22, 0.98, 0.46, bike);
      box(0.08, 0.05, 0.02, blackMat, sx * 0.22, 1.06, 0.46, bike);
    }
    // Đèn pha trước & Đèn hậu sau
    box(0.18, 0.12, 0.06, glow(0xfffbeb), 0, 0.82, 0.52, bike);
    box(0.18, 0.08, 0.04, glow(0xef4444), 0, 0.60, -0.68, bike);
    // Ống pô xả mạ crom
    cyl(0.045, 0.045, 0.58, chromeMat, 0.20, 0.22, -0.38, bike).rotation.x = Math.PI / 2.1;

    // Chân chống nghiêng
    const kick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6), blackMat);
    kick.position.set(-0.16, 0.15, -0.05);
    kick.rotation.z = 0.45;
    bike.add(kick);

    scene.add(bike);
    obstacle(px, pz, 0.6, 1.5);
    return bike;
  }

  // ========================================================
  // CẢNH VẬT ĐÔ THỊ TỰ NHIÊN: Ô ĐỖ XE, GẠCH XÚC GIÁC, MŨI TÊN ĐƯỜNG, TỦ ĐIỆN EVN,
  // NẮP CỐNG, HỐ GA, GỜ GIẢM TỐC, BỒN CÂY CÓ LƯỚI GANG, HOA GIẤY VỈA HÈ, XE MÁY, CỨU HỎA
  // ========================================================
  function buildStreetAtmosphere() {
    // 1. Vạch sơn trắng kẻ ô đỗ xe ô tô tiêu chuẩn dọc theo 2 bên lề đường
    const whitePaint = std(0xf8fafc, { roughness: 0.4 });
    const yellowCurb = std(0xfacc15, { roughness: 0.45 });

    function drawParkingBay(px, pz, length = 6.2, width = 2.6) {
      // Vạch ngang đầu và cuối ô đỗ
      box(0.12, 0.015, width, whitePaint, px - length / 2, 0.02, pz);
      box(0.12, 0.015, width, whitePaint, px + length / 2, 0.02, pz);
      // Vạch dọc phía lòng đường
      box(length, 0.015, 0.12, whitePaint, px, 0.02, pz > 7.5 ? pz - width / 2 : pz + width / 2);
    }

    // Các vị trí ô đỗ xe tương ứng với hàng xe đậu
    [-46, -33, -10, 12, 31, 39, 46].forEach(px => drawParkingBay(px, 10.2));
    [-30, 30, 38, 46].forEach(px => drawParkingBay(px, 4.9));

    // Vạch vàng viền mép vỉa hè cấm đỗ sai quy định
    box(108, 0.015, 0.14, yellowCurb, 0, 0.02, 3.82);
    box(108, 0.015, 0.14, yellowCurb, 0, 0.02, 11.35);

    // 2. Dải gạch xúc giác màu vàng dẫn hướng cho người khiếm thị dọc 2 bên vỉa hè
    const tactileMat = new THREE.MeshBasicMaterial({ map: getTactilePavingTexture() });
    const tNorth = new THREE.Mesh(new THREE.PlaneGeometry(108, 0.36), tactileMat);
    tNorth.rotation.x = -Math.PI / 2;
    tNorth.position.set(0, 0.315, 2.75);
    scene.add(tNorth);

    const tSouth = new THREE.Mesh(new THREE.PlaneGeometry(108, 0.36), tactileMat);
    tSouth.rotation.x = -Math.PI / 2;
    tSouth.position.set(0, 0.315, 11.95);
    scene.add(tSouth);

    // 3. Mũi tên chỉ hướng sơn trắng trên mặt đường nhựa
    const arrowMat = new THREE.MeshBasicMaterial({ map: getRoadArrowTexture(), transparent: true, opacity: 0.9 });
    [-20, 16].forEach(ax => {
      // Mũi tên làn xuôi (quay về phía Đông +X)
      const arEast = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), arrowMat);
      arEast.rotation.x = -Math.PI / 2;
      arEast.rotation.z = -Math.PI / 2;
      arEast.position.set(ax, 0.018, 8.8);
      scene.add(arEast);

      // Mũi tên làn ngược (quay về phía Tây -X)
      const arWest = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), arrowMat);
      arWest.rotation.x = -Math.PI / 2;
      arWest.rotation.z = Math.PI / 2;
      arWest.position.set(ax + 8, 0.018, 6.2);
      scene.add(arWest);
    });

    // 4. Miệng cống thoát nước mưa kim loại (Storm Drain Grates) đặt sát mép bó vỉa hè
    const grateMat = new THREE.MeshBasicMaterial({ map: getDrainGrateTexture() });
    [-42, -18, 8, 28, 48].forEach(gx => {
      const gNorth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), grateMat);
      gNorth.rotation.x = -Math.PI / 2;
      gNorth.position.set(gx, 0.018, 3.9);
      scene.add(gNorth);

      const gSouth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), grateMat);
      gSouth.rotation.x = -Math.PI / 2;
      gSouth.position.set(gx + 6, 0.018, 11.25);
      scene.add(gSouth);
    });

    // 5. Nắp hố ga tròn gang chống trượt giữa lòng đường
    const manholeMat = new THREE.MeshBasicMaterial({ map: getManholeTexture() });
    [-36, -6, 20, 44].forEach(mx => {
      const mh = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24), manholeMat);
      mh.rotation.x = -Math.PI / 2;
      mh.position.set(mx, 0.018, 6.4);
      scene.add(mh);
    });

    // 6. Gờ giảm tốc cao su vàng-đen đúc nổi trước các vạch qua đường người đi bộ (Zebra Crossings)
    [-24, 0, 24].forEach(zx => {
      for (const offset of [-2.4, 2.4]) {
        const bx = zx + offset;
        for (let s = 0; s < 6; s++) {
          const segZ = 4.2 + s * 1.25;
          const isYellow = s % 2 === 0;
          const bumpMat = std(isYellow ? 0xfacc15 : 0x18181b, { roughness: 0.6 });
          box(0.38, 0.035, 1.2, bumpMat, bx, 0.02, segZ);
        }
      }
    });

    // 7. Bồn cây vỉa hè có viền bê tông & Lưới gang bảo vệ gốc cây (Tree Pits & Grates)
    const treeGrateMat = new THREE.MeshBasicMaterial({ map: getTreeGrateTexture() });
    const concreteMat = std(0x94a3b8, { roughness: 0.8 });
    [-18, 2, 22].forEach(tx => {
      // Viền bê tông vuông nhô cao 6cm
      box(1.4, 0.08, 0.12, concreteMat, tx, 0.34, 1.2);
      box(1.4, 0.08, 0.12, concreteMat, tx, 0.34, 2.6);
      box(0.12, 0.08, 1.4, concreteMat, tx - 0.65, 0.34, 1.9);
      box(0.12, 0.08, 1.4, concreteMat, tx + 0.65, 0.34, 1.9);
      // Tấm lưới gang bảo vệ gốc cây
      const tg = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.22), treeGrateMat);
      tg.rotation.x = -Math.PI / 2;
      tg.position.set(tx, 0.31, 1.9);
      scene.add(tg);
    });

    // 8. Chậu hoa giấy rực rỡ (Bougainvillea) & Chậu kiểng gốm sứ Lái Thiêu trên vỉa hè
    function buildBougainvilleaPot(px, pz, flowerCol = 0xf43f5e) {
      const potGroup = new THREE.Group();
      potGroup.position.set(px, 0.3, pz);
      // Chậu gốm men xanh trắng
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.25, 0.55, 12),
        std(0x0284c7, { roughness: 0.35, metalness: 0.15 })
      );
      pot.position.y = 0.28;
      potGroup.add(pot);
      // Đất trong chậu
      const soil = new THREE.Mesh(new THREE.CircleGeometry(0.34, 12), std(0x3e2723, { roughness: 0.95 }));
      soil.rotation.x = -Math.PI / 2;
      soil.position.y = 0.55;
      potGroup.add(soil);

      // Thân cây hoa giấy uốn khúc tự nhiên
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.75, 8), std(0x5c4033, { roughness: 0.9 }));
      trunk.position.set(0, 0.85, 0);
      trunk.rotation.z = 0.12;
      potGroup.add(trunk);

      // Tán lá xanh tươi & Chùm hoa giấy nở bung rực rỡ
      if (window.Veg && Veg.makeShrub) {
        const shrub = Veg.makeShrub(0.75, Math.floor(px * 13 + pz * 7), [flowerCol, 0xff70a6, 0xffffff]);
        shrub.position.set(0, 1.15, 0);
        potGroup.add(shrub);
      } else {
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), std(0x15803d, { roughness: 0.8 }));
        foliage.position.set(0, 1.25, 0);
        potGroup.add(foliage);
      }
      scene.add(potGroup);
      obstacle(px, pz, 0.7, 0.7);
    }

    // Đặt chậu hoa giấy tạo điểm nhấn tươi xanh trước sảnh và các góc phố
    buildBougainvilleaPot(-14.2, 1.8, 0xf43f5e); // Hồng Fuchsia rực rỡ
    buildBougainvilleaPot(15.2, 1.8, 0xe11d48);  // Đỏ hoa giấy Sài Gòn
    buildBougainvilleaPot(37.5, 8.6, 0xf43f5e);  // Gần bến Taxi
    buildBougainvilleaPot(-49.5, 8.6, 0xfb7185); // Lối vào công viên

    // 9. Tủ điện hạ thế đô thị EVN HCMC trên vỉa hè
    function buildElectricCabinet(px, pz, ry = 0) {
      const g = new THREE.Group();
      g.position.set(px, 0.3, pz);
      g.rotation.y = ry;
      // Bệ móng bê tông nâng cao chống ngập nước
      box(0.95, 0.20, 0.55, concreteMat, 0, 0.10, 0, g);
      // Thân tủ kim loại
      box(0.85, 1.25, 0.45, std(0x64748b, { metalness: 0.7, roughness: 0.4 }), 0, 0.825, 0, g);
      // Mặt trước có dán tem cảnh báo sấm sét nguy hiểm điện cao thế
      const doorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.84, 1.24),
        new THREE.MeshBasicMaterial({ map: getElectricBoxTexture() })
      );
      doorMesh.position.set(0, 0.825, 0.23);
      g.add(doorMesh);
      scene.add(g);
      obstacle(px, pz, 1.0, 0.6);
    }
    buildElectricCabinet(-4.5, 2.2, 0);

    // 10. Khu vực đỗ xe máy vỉa hè Sài Gòn & Xe máy dựng chân chống
    function buildMotorbikeZone() {
      // Vạch sơn trắng kẻ ô đỗ xe máy
      box(4.6, 0.015, 1.6, whitePaint, 5.0, 0.315, 2.2);
      // Xe 1: Honda SH màu trắng ngọc trai sang trọng
      buildMotorbike(4.0, 2.2, 0, 0xf8fafc, true);
      // Xe 2: Honda Wave màu đỏ cá tính
      buildMotorbike(5.8, 2.2, 0, 0xdc2626, false);
    }
    buildMotorbikeZone();

    // 11. Trụ cứu hỏa màu đỏ Sài Gòn (Red Fire Hydrant)
    function buildFireHydrant(px, pz) {
      const hGroup = new THREE.Group();
      hGroup.position.set(px, 0.3, pz);
      const redPaint = std(0xdc2626, { roughness: 0.35, metalness: 0.25 });
      const brassMat = std(0xd97706, { metalness: 0.85, roughness: 0.3 });
      // Thân trụ gang
      cyl(0.14, 0.16, 0.65, redPaint, 0, 0.32, 0, hGroup);
      // Nắp đỉnh vòm & Đai ốc đỉnh
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), redPaint);
      dome.position.y = 0.65;
      hGroup.add(dome);
      box(0.05, 0.05, 0.05, brassMat, 0, 0.80, 0, hGroup);
      // 2 họng xả ren bên hông có nắp vặn kim loại
      for (const sx of [-1, 1]) {
        cyl(0.06, 0.06, 0.14, redPaint, sx * 0.14, 0.46, 0, hGroup, 10);
        cyl(0.05, 0.05, 0.04, brassMat, sx * 0.21, 0.46, 0, hGroup, 10);
      }
      scene.add(hGroup);
      obstacle(px, pz, 0.5, 0.5);
    }
    buildFireHydrant(-11.5, 3.2);
    buildFireHydrant(43.5, 8.6);

    // 12. Thùng rác công cộng đô thị 2 ngăn (Xanh lá - Rác hữu cơ & Cam - Rác vô cơ tái chế)
    function buildPublicTrashBin(px, pz, ry = 0) {
      const binGroup = new THREE.Group();
      binGroup.position.set(px, 0.3, pz);
      binGroup.rotation.y = ry;
      // Chân đế kim loại đen
      box(0.92, 0.06, 0.46, std(0x18181b), 0, 0.03, 0, binGroup);
      box(0.06, 0.72, 0.06, std(0x334155), -0.42, 0.40, 0, binGroup);
      box(0.06, 0.72, 0.06, std(0x334155), 0.42, 0.40, 0, binGroup);
      // Thùng xanh lá (Rác sinh hoạt)
      box(0.38, 0.68, 0.38, std(0x16a34a, { roughness: 0.5 }), -0.21, 0.40, 0, binGroup);
      // Nắp lật bập bênh xanh
      box(0.40, 0.08, 0.40, std(0x15803d), -0.21, 0.76, 0, binGroup);
      // Thùng cam (Rác tái chế)
      box(0.38, 0.68, 0.38, std(0xea580c, { roughness: 0.5 }), 0.21, 0.40, 0, binGroup);
      // Nắp lật bập bênh cam
      box(0.40, 0.08, 0.40, std(0xc2410c), 0.21, 0.76, 0, binGroup);
      scene.add(binGroup);
      obstacle(px, pz, 0.95, 0.5);
    }
    buildPublicTrashBin(12.6, 3.2, 0);
    buildPublicTrashBin(-28.0, 3.2, 0);

    // 13. Biển báo giao thông đô thị Việt Nam (Biển P Bãi Đỗ Xe & Biển Cấm Đỗ)
    function buildTrafficSign(px, pz, type = 'parking') {
      const pole = new THREE.Group();
      pole.position.set(px, 0.3, pz);
      // Cột thép tròn mạ kẽm
      cyl(0.04, 0.04, 2.6, std(0x94a3b8, { metalness: 0.7, roughness: 0.3 }), 0, 1.3, 0, pole);

      const signCanvas = document.createElement('canvas');
      signCanvas.width = signCanvas.height = 256;
      const sctx = signCanvas.getContext('2d');

      if (type === 'parking') {
        // Biển hình vuông xanh chữ P trắng
        sctx.fillStyle = '#0284c7';
        sctx.fillRect(0, 0, 256, 256);
        sctx.strokeStyle = '#ffffff';
        sctx.lineWidth = 14;
        sctx.strokeRect(10, 10, 236, 236);
        sctx.fillStyle = '#ffffff';
        sctx.font = '900 160px "Be Vietnam Pro", Arial, sans-serif';
        sctx.textAlign = 'center';
        sctx.fillText('P', 128, 185);
      } else {
        // Biển tròn viền đỏ nền xanh cấm đỗ
        sctx.fillStyle = '#ef4444';
        sctx.beginPath(); sctx.arc(128, 128, 124, 0, Math.PI * 2); sctx.fill();
        sctx.fillStyle = '#0284c7';
        sctx.beginPath(); sctx.arc(128, 128, 98, 0, Math.PI * 2); sctx.fill();
        sctx.strokeStyle = '#ef4444';
        sctx.lineWidth = 26;
        sctx.beginPath(); sctx.moveTo(48, 48); sctx.lineTo(208, 208); sctx.stroke();
      }

      const signBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) })
      );
      signBoard.position.set(0, 2.3, 0.05);
      pole.add(signBoard);
      scene.add(pole);
      obstacle(px, pz, 0.3, 0.3);
    }
    buildTrafficSign(48.5, 8.4, 'parking');
    buildTrafficSign(-48.5, 8.4, 'noparking');

    // 14. Cột đèn đường đô thị vươn cong (Curved Cobra-Head Street Lamp) rọi sáng mặt đường
    function buildCobraStreetLamp(px, pz, ry = 0) {
      const lamp = new THREE.Group();
      lamp.position.set(px, 0.3, pz);
      lamp.rotation.y = ry;
      const poleMat = std(0x64748b, { metalness: 0.6, roughness: 0.35 });
      // Thân cột vát thon dần lên cao
      cyl(0.08, 0.12, 6.2, poleMat, 0, 3.1, 0, lamp, 12);
      // Cần đèn vươn cong hình chữ L vuốt mềm ra lòng đường
      cyl(0.06, 0.08, 2.2, poleMat, 0.85, 6.1, 0, lamp, 8);
      lamp.children[lamp.children.length - 1].rotation.z = -Math.PI / 3.5;
      // Chóa đèn LED hình thoi
      box(0.55, 0.12, 0.28, std(0x1e293b), 1.65, 6.6, 0, lamp);
      // Mặt bóng đèn LED phát sáng vàng ấm
      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.22), glow(0xfef08a));
      bulb.rotation.x = Math.PI / 2;
      bulb.position.set(1.65, 6.53, 0);
      lamp.add(bulb);
      // Vệt sáng tròn dịu trên mặt đường (Light pool on asphalt)
      const lightPool = new THREE.Mesh(
        new THREE.CircleGeometry(3.2, 16),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.18, depthWrite: false })
      );
      lightPool.rotation.x = -Math.PI / 2;
      lightPool.position.set(1.65, -0.28, 0);
      lamp.add(lightPool);

      // Ánh sáng điểm rọi xuống mặt đường
      if (!lite) {
        const spot = new THREE.PointLight(0xffedd5, 1.2, 14, 1.2);
        spot.position.set(1.65, 6.2, 0);
        lamp.add(spot);
      }
      scene.add(lamp);
      obstacle(px, pz, 0.5, 0.5);
    }
    buildCobraStreetLamp(-22, 3.4, Math.PI / 2);
    buildCobraStreetLamp(20, 3.4, Math.PI / 2);
    buildCobraStreetLamp(35, 11.6, -Math.PI / 2);
    buildCobraStreetLamp(-15, 11.6, -Math.PI / 2);
  }

  function buildParkedCars() {
    const E = Math.PI / 2, W = -Math.PI / 2;

    // Dựng hệ thống cảnh vật đường phố Sài Gòn chân thực trước
    buildStreetAtmosphere();

    // Hàng xe đậu làn Nam (z = 10.2) quay đầu về phía Đông (E)
    buildTaxi(-46, 10.2, E, 'xanh');                 // Taxi Xanh SM (VinFast GSM xanh ngọc)
    buildVF3(0xf472b6, -33, 10.2, E);                // VF3 Hồng cá tính mui trắng
    buildVF3(0xf8fafc, -10, 10.2, E);                // VF3 Trắng ngọc trai mui đen
    buildVF3(0xfacc15, 12, 10.2, E);                 // VF3 VÀNG SOLAR (ĐÚNG MÀU ẢNH THẬT NGƯỜI DÙNG TẢI LÊN)
    buildTaxi(31, 10.2, E, 'vinasun');               // Taxi Vinasun truyền thống trắng sọc đỏ xanh
    buildVF3(0xdc2626, 39, 10.2, E);                 // VF3 Đỏ Crimson mui trắng
    buildTaxi(46, 10.2, E, 'xanh');                  // Taxi Xanh SM đón khách

    // Hàng xe đậu làn Bắc (z = 4.9) quay đầu về phía Tây (W)
    buildVF3(0x38bdf8, -30, 4.9, W);                 // VF3 Xanh Electric mui trắng
    buildVF3(0x34d399, 30, 4.9, W);                  // VF3 Xanh Mint tươi mát mui trắng
    buildTaxi(38, 4.9, W, 'vinasun');                // Taxi Vinasun bến xe
    buildVF3(0xfb923c, 46, 4.9, W);                  // VF3 Cam Năng Động mui trắng

    // Biển hiệu Bến Đón Taxi & Gọi Xe 24/7 phản quang
    const sign = signPlane([['BẾN TAXI SÀI GÒN', 66, 55], ['XANH SM • VINASUN • 24/7', 32, 105]], 2.0, 0.85, 512, 160, '#fde047', '#10261a');
    sign.position.set(41, 1.9, 8.2);
    scene.add(sign);
    box(0.08, 1.6, 0.08, std(0x6b7280), 41, 1.1, 8.2);
    obstacle(41, 8.2, 0.5, 0.5);
  }

  // ========================================================
  // E. CÁC CẶP TÌNH NHÂN TRONG CÔNG VIÊN
  // ========================================================
  function heartTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 34, 10, 8, 32, 20);
    g.bezierCurveTo(54, 8, 60, 34, 32, 54);
    g.fill();
    return new THREE.CanvasTexture(c);
  }

  function buildCouples() {
    const emitters = [];                    // mỗi cặp phát tim: () => [x, y, z]
    const sitters = [];                     // người ngồi: giữ tư thế ngồi
    const pose = (p, sitY) => sitters.push({ p, sitY });

    // 1) Ba ghế đá quanh quảng trường: mỗi ghế một cặp ngồi sát nhau
    const benchRy = (i) => -((i / 6) * Math.PI * 2 + Math.PI / 6) - Math.PI / 2;
    [0, 2, 4].forEach((i, k) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6, ry = benchRy(i);
      const bx = PLAZA.x + Math.cos(a) * 7.7, bz = PLAZA.z + Math.sin(a) * 7.7;
      const tx = Math.cos(ry), tz = -Math.sin(ry);       // trục ngang của ghế
      const cols = [[0x38bdf8, 0xf472b6], [0x34d399, 0xfb7185], [0xfacc15, 0xc084fc]][k];
      [-0.34, 0.34].forEach((d, n) => {
        const p = makePerson(cols[n], bx + tx * d + Math.sin(ry) * 0.05, bz + tz * d + Math.cos(ry) * 0.05, ry);
        p.mesh.position.y = 0.34 + 0.9 - 0.44 + 0.04 - 0.34;   // hông ngang mặt ghế đá
        pose(p, p.mesh.position.y);
      });
      emitters.push(() => [bx, 1.9, bz]);
    });

    // 2) Cặp đứng ngắm hồ trên cầu gỗ
    [[-104.8, 16.4, 0xfb923c], [-104.8, 17.4, 0xf9a8d4]].forEach(([x, z, c]) => {
      const p = makePerson(c, x, z, -Math.PI / 2);
      animators.push((d, t) => { p.mesh.rotation.z = Math.sin(t * 0.8 + z) * 0.03; p.mesh.position.y = 0.46; });
    });
    emitters.push(() => [-104.8, 1.9, 16.9]);

    // 3) Cặp ngồi picnic trên thảm caro
    const bc = document.createElement('canvas'); bc.width = bc.height = 64;
    const bg = bc.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { bg.fillStyle = (x + y) % 2 ? '#dc2626' : '#fff1f2'; bg.fillRect(x * 8, y * 8, 8, 8); }
    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(bc), roughness: 0.95 }));
    blanket.rotation.x = -Math.PI / 2; blanket.position.set(-68, 0.33, 20.2);
    scene.add(blanket);
    box(0.5, 0.3, 0.4, std(0xb45309), -67.1, 0.5, 19.7);                      // giỏ picnic
    cyl(0.07, 0.07, 0.34, std(0x7f1d1d), -67.3, 0.5, 20.6);                   // chai vang
    [[-68.55, 20.2, 0x60a5fa], [-67.65, 20.4, 0xf472b6]].forEach(([x, z, c]) => {
      const p = makePerson(c, x, z, Math.PI);
      p.mesh.position.y = -0.04;
      pose(p, -0.04);
    });
    emitters.push(() => [-68.1, 1.7, 20.3]);
    obstacle(-68, 20.2, 2.4, 1.8);

    // 4) Hai cặp tay trong tay đi dạo dọc lối chính
    const walkers = [];
    [[-54, -96, 7.5, 0x38bdf8, 0xf472b6, 0.55], [-96, -56, 7.5, 0xa3e635, 0xfb7185, 0.45]].forEach(([xa, xb, z, c1, c2, sp], i) => {
      const a = makePerson(c1, xa, z - 0.38, 0), b = makePerson(c2, xa, z + 0.38, 0);
      const w = { a, b, xa: Math.min(xa, xb), xb: Math.max(xa, xb), x: xa, z, dir: xb > xa ? 1 : -1, speed: sp, wt: i * 3, pause: 0 };
      walkers.push(w);
      emitters.push(() => [w.x, 2.2, w.z]);
    });
    animators.push((d) => {
      for (const w of walkers) {
        if (w.pause > 0) { w.pause -= d; for (const p of [w.a, w.b]) { p.leftLeg.rotation.x *= 0.8; p.rightLeg.rotation.x *= 0.8; } continue; }
        w.x += w.dir * w.speed * d;
        if (w.x > w.xb || w.x < w.xa) { w.x = Math.max(w.xa, Math.min(w.xb, w.x)); w.dir *= -1; w.pause = 4; }
        w.wt += d * 5;
        const target = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        [[w.a, -0.38, 0], [w.b, 0.38, Math.PI]].forEach(([p, dz, ph]) => {
          p.mesh.position.set(w.x, 0.3 + Math.abs(Math.sin(w.wt + ph * 0)) * 0.015, w.z + dz);
          let diff = target - p.mesh.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.mesh.rotation.y += diff * Math.min(1, d * 5);
          p.leftLeg.rotation.x = Math.sin(w.wt) * 0.4;
          p.rightLeg.rotation.x = -Math.sin(w.wt) * 0.4;
        });
      }
    });

    // Người ngồi: ép tư thế ngồi mỗi khung hình
    animators.push((d) => { for (const { p, sitY } of sitters) applySitPose(p, p.mesh, sitY, d); });

    // Ổ khoá tình yêu trên lan can cầu
    const lock = std(0xf2c14e, { metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      box(0.1, 0.12, 0.05, lock, POND.x + side * 1.32, 1.05 - (i % 3) * 0.1, POND.z - 4.5 + i * 0.75);
    }

    // Tim bay lên từ các cặp (một Points dùng chung, màu tắt dần theo vòng đời)
    const N = lite ? 18 : 40;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const hearts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, map: heartTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    hearts.frustumCulled = false;
    scene.add(hearts);
    animators.push((d, t) => {
      for (let i = 0; i < N; i++) {
        const e = emitters[i % emitters.length](), life = (t * 0.28 + i * 0.173) % 1;
        pos[i * 3] = e[0] + Math.sin(t * 1.3 + i) * 0.25;
        pos[i * 3 + 1] = e[1] + life * 1.6;
        pos[i * 3 + 2] = e[2] + Math.cos(t * 1.1 + i) * 0.25;
        const f = Math.sin(life * Math.PI);
        col[i * 3] = 1.0 * f; col[i * 3 + 1] = 0.25 * f; col[i * 3 + 2] = 0.45 * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }


  // ========================================================
  // F. CẦU ĐI BỘ VÒM VÀNG QUA SÔNG SÀI GÒN (từ cầu tàu Bạch Đằng sang bờ đối diện)
  // ========================================================
  const BR = {
    A: new THREE.Vector3(-4, 0, 33.3),          // đầu cầu ở cầu tàu
    B: new THREE.Vector3(-50, 0, 96.5),         // chân cầu bên kia sông
    half: 2.7, rise: 5.0, arch: 11.5,
    landing: { x0: -63, x1: -41, z0: 96.5, z1: 105 },
  };
  BR.dir = BR.B.clone().sub(BR.A).setY(0);
  BR.len = BR.dir.length();
  BR.dir.divideScalar(BR.len);
  BR.nrm = new THREE.Vector3(-BR.dir.z, 0, BR.dir.x);
  const deckH = (t) => 0.33 + BR.rise * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, t)))), 1.1);
  const bridgeCoords = (x, z) => {
    const dx = x - BR.A.x, dz = z - BR.A.z;
    return { t: (dx * BR.dir.x + dz * BR.dir.z) / BR.len, lat: dx * BR.nrm.x + dz * BR.nrm.z };
  };

  // Giới hạn đi lại + độ cao mặt cầu (app.js đọc qua WORLD_BOUNDS.bridge)
  window.WORLD_BOUNDS.bridge = {
    constrain(x, z) {
      const { t, lat } = bridgeCoords(x, z);
      const lim = BR.half - 0.45;
      if (t >= -0.03 && t <= 1.0) {
        const l = Math.max(-lim, Math.min(lim, lat));
        const tt = Math.max(0, t);
        return { x: BR.A.x + BR.dir.x * tt * BR.len + BR.nrm.x * l, z: BR.A.z + BR.dir.z * tt * BR.len + BR.nrm.z * l };
      }
      if (z > 60) {
        const L = BR.landing;
        return { x: Math.max(L.x0 + 0.5, Math.min(L.x1 - 0.5, x)), z: Math.max(L.z0, Math.min(L.z1 - 0.6, z)) };
      }
      return null;
    },
    groundY(x, z) {
      if (z < 33) return 0.3;
      const { t, lat } = bridgeCoords(x, z);
      if (t > 0 && t < 1 && Math.abs(lat) < BR.half + 0.5) return deckH(t);
      return 0.3;
    }
  };

  function ribbon(samples, half, thick, mat) {
    // samples: [{c: Vector3 (tâm, y = mặt cầu)}]; dựng mặt trên + hai thành bên + mặt dưới
    const pos = [], uv = [], idx = [];
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const c = samples[i];
      const l = new THREE.Vector3().copy(c).addScaledVector(BR.nrm, half), r = new THREE.Vector3().copy(c).addScaledVector(BR.nrm, -half);
      pos.push(l.x, l.y, l.z, r.x, r.y, r.z, l.x, l.y - thick, l.z, r.x, r.y - thick, r.z);
      const v = i * 0.5;
      uv.push(0, v, 1, v, 0, v, 1, v);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 4, b = (i + 1) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1);              // mặt trên
      idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);  // mặt dưới
      idx.push(a, a + 2, b, a + 2, b + 2, b);              // thành trái
      idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);  // thành phải
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }
  const tube = (pts, radius, mat, seg) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg || 80, radius, 8, false), mat);

  function buildBridge() {
    // 1) Mở lối ở lan can đầu cầu tàu (x -6.8..-1.2). Công viên bờ sông có thể được dựng sau cây cầu
    //    (các việc dựng cảnh chạy không theo thứ tự cố định) nên thử lại tới khi thấy lan can.
    let opened = false, tries = 0;
    const openPierRail = () => {
      if (opened) return;
      const oi = pubDetails.obstacles.findIndex(o => o.z === 33.2 && o.w > 16);
      let railMesh = null;
      scene.traverse((o) => {
        if (!railMesh && o.isMesh && o.visible && o.geometry && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width === 16 && o.geometry.parameters.depth === 0.14 && Math.abs(o.position.z - 33.15) < 0.05) railMesh = o;
      });
      if (oi < 0 || !railMesh) { if (++tries < 60) setTimeout(openPierRail, 500); return; }
      opened = true;
      railMesh.visible = false;
      const left = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 0.14), railMesh.material); left.position.set(-7.4, 0.75, 33.15);
      const right = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.95, 0.14), railMesh.material); right.position.set(3.4, 0.75, 33.15);
      scene.add(left, right);
      pubDetails.obstacles.splice(oi, 1);
      obstacle(-7.4, 33.2, 1.2, 0.3); obstacle(3.4, 33.2, 9.2, 0.3);
    };
    openPierRail();

    // 2) Mặt cầu
    const N = 90, samples = [], P = (t) => new THREE.Vector3().copy(BR.A).addScaledVector(BR.dir, t * BR.len);
    for (let i = 0; i <= N; i++) { const t = i / N, p = P(t); p.y = deckH(t); samples.push(p); }
    const tileTex = new THREE.TextureLoader().load('textures/sidewalk/diff_1k.jpg');
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(2, 10);
    const deck = ribbon(samples, BR.half, 0.45, std(0xb9b2a4, { map: tileTex, roughness: 0.7 }));
    deck.receiveShadow = true;
    scene.add(deck);

    // 3) Hai vòm thép vàng + dây treo
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc21a, emissiveIntensity: 1.0, roughness: 0.4, metalness: 0.3 });
    const hangMat = new THREE.LineBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.75 });
    const hang = [];
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, base = P(t);
        const lat = side * (BR.half + 0.2) * (1 - 0.45 * Math.sin(Math.PI * t));       // vòm nghiêng vào giữa
        pts.push(new THREE.Vector3(base.x + BR.nrm.x * lat, deckH(t) + BR.arch * Math.pow(Math.sin(Math.PI * t), 1.15), base.z + BR.nrm.z * lat));
      }
      scene.add(tube(pts, 0.27, yellow, 100));
      for (let i = 2; i <= 38; i++) {
        const t = i / 40, q = pts[i], base = P(t);
        hang.push(q.x, q.y, q.z, base.x + BR.nrm.x * side * BR.half, deckH(t) + 0.9, base.z + BR.nrm.z * side * BR.half);
      }
      // Lan can + dải đèn mép cầu
      const rail = [], edge = [];
      for (let i = 0; i <= N; i += 2) {
        const t = i / N, base = P(t);
        rail.push(new THREE.Vector3(base.x + BR.nrm.x * side * BR.half, deckH(t) + 1.05, base.z + BR.nrm.z * side * BR.half));
        edge.push(new THREE.Vector3(base.x + BR.nrm.x * side * (BR.half - 0.15), deckH(t) + 0.04, base.z + BR.nrm.z * side * (BR.half - 0.15)));
      }
      scene.add(tube(rail, 0.05, std(0xe5e7eb, { metalness: 0.8, roughness: 0.3 }), 90));
      scene.add(tube(edge, 0.055, glow(0xffe08a), 90));
    }
    const hangGeo = new THREE.BufferGeometry();
    hangGeo.setAttribute('position', new THREE.Float32BufferAttribute(hang, 3));
    const hangs = new THREE.LineSegments(hangGeo, hangMat);
    hangs.frustumCulled = false;
    scene.add(hangs);

    // 4) Đèn ấm dọc cầu (Points) + phản chiếu vàng xuống sông
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'), rg = dg.createRadialGradient(16, 16, 1, 16, 16, 15);
    rg.addColorStop(0, '#fff'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
    const bp = [];
    for (let i = 0; i <= N; i += 2) for (const side of [-1, 1]) {
      const t = i / N, base = P(t);
      bp.push(base.x + BR.nrm.x * side * (BR.half - 0.15), deckH(t) + 0.3, base.z + BR.nrm.z * side * (BR.half - 0.15));
    }
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    const bulbs = new THREE.Points(bgeo, new THREE.PointsMaterial({ color: 0xffd98a, size: 0.9, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false }));
    bulbs.frustumCulled = false;
    scene.add(bulbs);
    const reflPivot = new THREE.Group();
    reflPivot.position.set((BR.A.x + BR.B.x) / 2, -0.15, (BR.A.z + BR.B.z) / 2);
    reflPivot.rotation.y = Math.atan2(BR.dir.x, BR.dir.z);
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(5, BR.len), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.12, depthWrite: false }));
    refl.rotation.x = -Math.PI / 2;
    reflPivot.add(refl);
    scene.add(reflPivot);

    buildBridgeLife();
    buildFarBank();
  }


  // Đèn lung linh + khách tham quan nhộn nhịp trên cầu đi bộ
  function buildBridgeLife() {
    const P = (t) => new THREE.Vector3().copy(BR.A).addScaledVector(BR.dir, t * BR.len);
    const archPoint = (t, side) => {
      const base = P(t), lat = side * (BR.half + 0.2) * (1 - 0.45 * Math.sin(Math.PI * t));
      return new THREE.Vector3(base.x + BR.nrm.x * lat, deckH(t) + BR.arch * Math.pow(Math.sin(Math.PI * t), 1.15), base.z + BR.nrm.z * lat);
    };
    const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), rg = g.createRadialGradient(16, 16, 1, 16, 16, 15); rg.addColorStop(0, '#fff'); rg.addColorStop(0.4, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();

    // 1) Chuỗi đèn nhấp nháy dọc hai vòm thép
    const NB = lite ? 36 : 70, pts = [], phases = [];
    for (const side of [-1, 1]) for (let i = 1; i < NB; i++) { const q = archPoint(i / NB, side); pts.push(q.x, q.y + 0.18, q.z); phases.push(Math.random() * 6.28); }
    const nTw = phases.length, twCol = new Float32Array(nTw * 3);
    const twGeo = new THREE.BufferGeometry();
    twGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    twGeo.setAttribute('color', new THREE.BufferAttribute(twCol, 3));
    const twinkle = new THREE.Points(twGeo, new THREE.PointsMaterial({ size: 0.75, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    twinkle.frustumCulled = false;
    scene.add(twinkle);

    // 2) Đèn nền sàn đổi màu chạy theo sóng dọc hai mép cầu
    const floorN = lite ? 24 : 46;
    const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.05, 0.34), new THREE.MeshBasicMaterial({ color: 0xffffff }), floorN * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < floorN; i++) for (const [k, side] of [[0, -1], [1, 1]]) {
      const t = (i + 0.5) / floorN, base = P(t);
      m4.makeTranslation(base.x + BR.nrm.x * side * (BR.half - 0.45), deckH(t) + 0.02, base.z + BR.nrm.z * side * (BR.half - 0.45));
      floor.setMatrixAt(i * 2 + k, m4);
      floor.setColorAt(i * 2 + k, new THREE.Color(0xffffff));
    }
    floor.frustumCulled = false;
    scene.add(floor);

    // 3) Cột đèn đường dọc cầu (quả cầu sáng)
    const poleMat = std(0x1f2937), globeMat = glow(0xfff0c0);
    for (let i = 1; i < 12; i++) {
      const t = i / 12, side = i % 2 ? 1 : -1, base = P(t);
      const x = base.x + BR.nrm.x * side * (BR.half - 0.25), z = base.z + BR.nrm.z * side * (BR.half - 0.25), y = deckH(t);
      cyl(0.05, 0.07, 2.6, poleMat, x, y + 1.3, z);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), globeMat); g.position.set(x, y + 2.7, z); scene.add(g);
    }

    // 4) Khách tham quan: người đi dạo hai chiều, người chụp ảnh (có đèn flash), cặp đôi, nhóm đứng ngắm sông
    const shirts = [0xf472b6, 0x38bdf8, 0xfacc15, 0x34d399, 0xfb923c, 0xa78bfa, 0xef4444, 0x22d3ee, 0xf9a8d4, 0xa3e635];
    const packs = [null, 0x7c2d12, 0x1e3a8a, null, 0x4c1d95, null];
    function visitor(color, pack) {
      const p = makePerson(color, 0, 0, 0, pack);
      p.beerMug.visible = false;
      p.armSwing.rotation.x = 0;
      return p;
    }
    const place = (p, t, lat, extraY) => {
      const base = P(t);
      p.mesh.position.set(base.x + BR.nrm.x * lat, deckH(t) + (extraY || 0), base.z + BR.nrm.z * lat);
    };
    const walkers = [], posers = [];
    const nW = lite ? 8 : 18;
    for (let i = 0; i < nW; i++) {
      const dir = i % 2 ? -1 : 1, lat = (i % 4 - 1.5) * 0.9 + (Math.random() - 0.5) * 0.3;
      const w = { p: visitor(shirts[i % shirts.length], packs[i % packs.length]), t: 0.05 + Math.random() * 0.9, lat, dir, speed: (0.45 + Math.random() * 0.35) / BR.len * 3.2, wt: Math.random() * 6, pause: 0 };
      walkers.push(w);
    }
    // Cặp đôi tay trong tay
    for (let c = 0; c < (lite ? 1 : 3); c++) {
      const dir = c % 2 ? -1 : 1, t0 = 0.12 + c * 0.28, speed = 0.38 / BR.len * 3.2;
      for (const [n, col] of [[-0.35, shirts[(c * 2) % 10]], [0.35, shirts[(c * 2 + 1) % 10]]]) {
        walkers.push({ p: visitor(col, null), t: t0, lat: (c % 2 ? 0.7 : -0.7) + n, dir, speed, wt: 0, pause: 0, lock: c });
      }
    }
    // Người chụp ảnh / ngắm sông: đứng sát lan can, giơ điện thoại
    const phoneMat = new THREE.MeshBasicMaterial({ color: 0x0b1220 }), screenMat = new THREE.MeshBasicMaterial({ color: 0x9be7ff });
    const flashes = [];
    const spots = [[0.3, 1], [0.38, -1], [0.5, 1], [0.5, -1], [0.62, 1], [0.7, -1], [0.82, 1]].slice(0, lite ? 3 : 7);
    spots.forEach(([t, side], i) => {
      const p = visitor(shirts[(i + 3) % shirts.length], i % 2 ? 0x1e3a8a : null);
      place(p, t, side * (BR.half - 0.8));
      p.mesh.rotation.y = Math.atan2(BR.nrm.x * side, BR.nrm.z * side);      // quay mặt ra sông
      const phone = new THREE.Group();
      phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.02), phoneMat));
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.11), screenMat); sc.position.z = 0.012; phone.add(sc);
      phone.position.set(-0.04, -0.02, 0.44);
      p.armSwing.add(phone);
      p.armSwing.rotation.x = -1.15;
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      flash.position.set(0, 0.2, 0.5); p.mesh.add(flash);
      flashes.push({ flash, next: 1 + Math.random() * 6 });
      posers.push({ p, ph: i * 1.7 });
    });
    // Nhóm bạn đứng chụp chung ở đỉnh cầu
    if (!lite) for (let k = 0; k < 4; k++) {
      const p = visitor(shirts[(k + 5) % shirts.length], null);
      place(p, 0.5, -0.9 + k * 0.6 - 0.2);
      p.mesh.rotation.y = Math.atan2(BR.dir.x, BR.dir.z);
      posers.push({ p, ph: k * 0.9 + 9 });
    }

    animators.push((d, t) => {
      // đèn nhấp nháy + đổi màu
      for (let i = 0; i < nTw; i++) {
        const w = 0.55 + 0.45 * Math.sin(t * 3.2 + phases[i]), hue = ((t * 0.05 + i * 0.013) % 1);
        const warm = i % 3 !== 0;
        tmpCol.setHSL(warm ? 0.12 : hue, warm ? 0.95 : 0.9, 0.55 * w + 0.12);
        twCol[i * 3] = tmpCol.r; twCol[i * 3 + 1] = tmpCol.g; twCol[i * 3 + 2] = tmpCol.b;
      }
      twGeo.attributes.color.needsUpdate = true;
      for (let i = 0; i < floorN * 2; i++) {
        const wave = (t * 0.18 + (i >> 1) / floorN) % 1;
        floor.setColorAt(i, tmpCol.setHSL(wave, 1, 0.5 + 0.12 * Math.sin(t * 4 + i)));
      }
      floor.instanceColor.needsUpdate = true;
      // khách đi dạo
      for (const w of walkers) {
        if (w.pause > 0) { w.pause -= d; w.p.leftLeg.rotation.x *= 0.85; w.p.rightLeg.rotation.x *= 0.85; continue; }
        w.t += w.dir * w.speed * d;
        if (w.t > 0.96 || w.t < 0.04) { w.t = Math.max(0.04, Math.min(0.96, w.t)); w.dir *= -1; w.pause = 1 + Math.random() * 3; }
        w.wt += d * 6;
        place(w.p, w.t, w.lat, Math.abs(Math.sin(w.wt)) * 0.02);
        const face = Math.atan2(BR.dir.x * w.dir, BR.dir.z * w.dir);
        let diff = face - w.p.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        w.p.mesh.rotation.y += diff * Math.min(1, d * 6);
        w.p.leftLeg.rotation.x = Math.sin(w.wt) * 0.45;
        w.p.rightLeg.rotation.x = -Math.sin(w.wt) * 0.45;
        w.p.leftArm.rotation.x = -Math.sin(w.wt) * 0.5;
      }
      // người đứng ngắm / chụp
      for (const { p, ph } of posers) {
        p.mesh.position.y += Math.sin(t * 1.6 + ph) * 0.0006;
        p.mesh.rotation.z = Math.sin(t * 0.9 + ph) * 0.02;
      }
      for (const f of flashes) {
        f.next -= d;
        if (f.next < 0) { f.next = 3 + Math.random() * 7; f.on = 0.18; }
        if (f.on > 0) { f.on -= d; f.flash.material.opacity = Math.max(0, f.on / 0.18); } else f.flash.material.opacity = 0;
      }
    });
  }

  // Bờ đối diện: quảng trường lát đá + mái vòm xoắn kiểu nhà đón cầu + cây
  function buildFarBank() {
    const L = BR.landing, cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(46, 0.3, 14), std(0x2a3326, { roughness: 1 }));
    ground.position.set(cx, 0.15, 100.8); ground.receiveShadow = true; scene.add(ground);
    const tileTex = new THREE.TextureLoader().load('textures/sidewalk/diff_1k.jpg');
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.repeat.set(9, 4);
    const plaza = box(L.x1 - L.x0, 0.32, L.z1 - L.z0, std(0xaaa395, { map: tileTex }), cx, 0.16, cz);
    plaza.receiveShadow = true;
    // Mái vòm xoắn: hai đĩa elip chồng lệch nhau trên cột
    const roofMat = std(0xe3ddd0, { roughness: 0.55 });
    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.35, 40), roofMat);
    r1.scale.set(1.25, 1, 0.85); r1.position.set(cx + 1.5, 4.2, cz + 0.8); r1.rotation.y = 0.4;
    const r2 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.35, 40), roofMat);
    r2.scale.set(1.3, 1, 0.8); r2.position.set(cx - 3.2, 3.5, cz + 0.2); r2.rotation.y = -0.5;
    scene.add(r1, r2);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 40), glow(0xffd98a));
    inner.rotation.x = Math.PI / 2; inner.scale.set(1.3, 0.9, 1); inner.position.set(cx + 1.5, 4.0, cz + 0.8); scene.add(inner);
    for (const [px, pz, h] of [[cx + 5.2, cz - 1.5, 4.1], [cx + 5.0, cz + 3.0, 4.1], [cx - 1.0, cz + 3.4, 4.1], [cx - 5.8, cz - 0.4, 3.4], [cx - 2.0, cz - 2.0, 3.4]]) {
      cyl(0.22, 0.26, h, roofMat, px, h / 2 + 0.3, pz);
      obstacle(px, pz, 0.6, 0.6);
    }
    // Cây xanh + đèn bờ đối diện
    const tr = [[L.x0 + 1.5, L.z1 - 1.2], [L.x0 + 5, L.z1 - 0.8], [L.x1 - 1.5, L.z1 - 1.2], [L.x1 - 5, L.z1 - 0.8], [cx + 8, cz + 3.5], [cx - 8.5, cz + 3.2]];
    tr.forEach(([x, z], i) => {
      const t = Veg.makeTree(i % 3 === 2 ? 'palm' : (i % 2 ? 'broadleaf' : 'flame'), 300 + i, 0.9);
      t.position.set(x, 0.32, z);
      scene.add(t);
      obstacle(x, z, 0.9, 0.9);
    });
    for (let i = 0; i < 5; i++) {
      const lx = L.x0 + 3 + i * 4.4, lz = L.z0 + 0.9;
      cyl(0.07, 0.09, 3.2, std(0x1f2937), lx, 1.9, lz);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), glow(0xffe9a8)); bulb.position.set(lx, 3.6, lz); scene.add(bulb);
    }
    const sign = signPlane([['CẦU ĐI BỘ BẠCH ĐẰNG', 52, 62], ['Qua sông Sài Gòn • đi bộ ngắm Landmark 81', 28, 118]], 4.6, 1.2, 800, 170, '#ffe27a', '#14202c');
    sign.position.set(L.x1 - 2.4, 1.6, L.z0 + 1.5); sign.rotation.y = Math.PI;
    scene.add(sign);
  }


  // ========================================================
  // G. DU THUYỀN ĂN TỐI TRÊN SÔNG SÀI GÒN (nhiều tầng, cửa sổ sáng đèn, lan can, sóng đuôi, bóng đèn dưới nước)
  // ========================================================
  function hullPoints(L, W, bowPow, round) {
    const hl = L / 2, hw = W / 2, right = [[-hl, hw * 0.82], [-hl + 0.5, hw]];
    right.push([hl * 0.3, hw]);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, x = hl * 0.3 + (hl - hl * 0.3) * t;
      right.push([x, round ? hw * Math.sqrt(Math.max(0, 1 - t * t)) : hw * (1 - Math.pow(t, bowPow))]);
    }
    const left = right.slice(0, -1).reverse().map(([x, y]) => [x, -y]);
    return right.concat(left);
  }
  function outlineShape(pts, sx, sz) {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x * sx, y * sz) : s.moveTo(x * sx, y * sz)));
    s.closePath();
    return s;
  }
  function extrudeY(pts, sx, sz, depth, mats) {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(outlineShape(pts, sx, sz), { depth, bevelEnabled: false, curveSegments: 4 }), mats);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  function windowTexture(cellW, cellH, tintCool) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1b1a22'; g.fillRect(0, 0, 128, 64);                                 // khung
    const grad = g.createLinearGradient(0, 8, 0, 56);
    grad.addColorStop(0, tintCool ? '#e8f4ff' : '#fff0c2'); grad.addColorStop(1, tintCool ? '#b9d9ff' : '#ffc46b');
    g.fillStyle = grad; g.fillRect(8, 9, 112, 44);
    g.fillStyle = 'rgba(60,30,10,0.35)';                                                 // bóng người ngồi ăn
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(24 + i * 27, 40, 6, 0, Math.PI * 2); g.fill(); g.fillRect(19 + i * 27, 40, 10, 13); }
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(8, 9, 112, 5);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / cellW, 1 / cellH);
    t.anisotropy = 4;
    return t;
  }
  function streakTexture(color) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    const col = new THREE.Color(color), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    for (let i = 0; i < 18; i++) {
      const x = 8 + i * 6.5 + (i % 3) * 2, a = 0.25 + (i % 4) * 0.12;
      const grad = g.createLinearGradient(x, 0, x, 128);
      grad.addColorStop(0, `rgba(${rgb},0)`); grad.addColorStop(0.5, `rgba(${rgb},${a})`); grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(x, 4 + (i * 17) % 30, 2.5, 90 - (i * 11) % 30);
    }
    return new THREE.CanvasTexture(c);
  }
  function wakeTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    for (const s of [-1, 1]) {
      const grad = g.createLinearGradient(256, 64, 0, 64 + s * 62);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad; g.lineWidth = 7;
      g.beginPath(); g.moveTo(256, 64); g.lineTo(0, 64 + s * 62); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(256, 64); g.lineTo(0, 64 + s * 36); g.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  // cfg: {L, W, decks: [{h, scale}], hull, trim, tint, cool, round, bowPow, glowColor, funnel}
  function makeCruise(cfg) {
    const g = new THREE.Group();
    const pts = hullPoints(cfg.L, cfg.W, cfg.bowPow || 1.7, cfg.round);
    const hullMat = std(cfg.hull, { roughness: 0.45, metalness: 0.2 });
    const trimMat = std(cfg.trim, { roughness: 0.5 });
    // Thân tàu: phần chìm + mạn thấp, viền trắng trên
    const hull = extrudeY(pts, 1, 1, 1.15, hullMat); hull.position.y = -0.45; g.add(hull);
    const rim = extrudeY(pts, 1.0, 1.0, 0.09, trimMat); rim.position.y = 0.7; g.add(rim);
    let y = 0.76;
    const lightPts = [];
    cfg.decks.forEach((d, k) => {
      const sx = d.scale, sz = d.scale * 0.88;
      const cellW = 1.15, cellH = d.h;
      const winMat = new THREE.MeshBasicMaterial({ map: windowTexture(cellW, cellH, cfg.cool), color: cfg.tint });
      // Phòng ăn kính sáng đèn (sườn dùng texture cửa sổ lặp, mặt trên/dưới màu thân)
      const cabin = extrudeY(pts, (cfg.L - 1.4 - k * 1.4) / cfg.L * sx, sz * 0.9, d.h, [trimMat, winMat]);
      cabin.position.y = y; g.add(cabin);
      // Sàn + mái hiên nhô ra hơn phòng ăn, có lan can quanh mép
      const roof = extrudeY(pts, (cfg.L - 0.6 - k * 1.2) / cfg.L * sx, sz, 0.11, trimMat);
      roof.position.y = y + d.h; g.add(roof);
      const rail = [], rail2 = [];
      for (const [px, pz] of pts) {
        const rx = px * (cfg.L - 0.6 - k * 1.2) / cfg.L * sx, rz = -pz * sz;
        rail.push(new THREE.Vector3(rx, y + d.h + 0.55, rz)); rail2.push(new THREE.Vector3(rx, y + d.h + 0.28, rz));
        lightPts.push(rx, y + d.h + 0.08, rz);
      }
      for (const rp of [rail, rail2]) {
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rp), new THREE.LineBasicMaterial({ color: 0xf3f4f6 }));
        g.add(line);
      }
      y += d.h + 0.11;
    });
    // Dây đèn quanh mái từng tầng
    const dot = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), rg = x.createRadialGradient(16, 16, 1, 16, 16, 15); rg.addColorStop(0, '#fff'); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, 32, 32); return c; })());
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPts, 3));
    g.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: cfg.glowColor, size: 0.55, map: dot, transparent: true, depthWrite: false })));
    // Ống khói / cột đèn + đèn hàng hải đỏ xanh
    if (cfg.funnel) {
      const f = cyl(0.55, 0.65, 1.3, std(cfg.hull), -cfg.L * 0.12, y + 0.65, 0, g, 14);
      cyl(0.57, 0.57, 0.22, std(cfg.glowColor === 0xffffff ? 0xdc2626 : 0xdc2626), -cfg.L * 0.12, y + 1.3, 0, g, 14);
    }
    const mast = cyl(0.04, 0.05, 2.2, std(0xe5e7eb), cfg.L * 0.28, y + 1.0, 0, g, 6);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xffffff)); top.position.set(cfg.L * 0.28, y + 2.15, 0); g.add(top);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xff2020)); red.position.set(cfg.L * 0.3, 1.0, cfg.W / 2 * 0.95); g.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0x20ff60)); green.position.set(cfg.L * 0.3, 1.0, -cfg.W / 2 * 0.95); g.add(green);

    // Bóng đèn phản chiếu xuống nước + sóng đuôi (nằm ngang, không theo bập bềnh)
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(cfg.L * 1.05, cfg.W * 1.9), new THREE.MeshBasicMaterial({
      map: streakTexture(cfg.glowColor), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    refl.rotation.x = -Math.PI / 2; refl.position.y = -0.19; refl.rotation.z = Math.PI / 2; g.add(refl);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(cfg.L * 1.6, cfg.W * 2.4), new THREE.MeshBasicMaterial({
      map: wakeTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    wake.rotation.x = -Math.PI / 2; wake.position.set(-cfg.L * 0.5 - cfg.L * 0.8 + 1, -0.185, 0); g.add(wake);
    return g;
  }

  function buildCruiseBoats() {
    if (typeof cruiseBoat !== 'undefined' && cruiseBoat) cruiseBoat.visible = false;     // thay du thuyền hộp cũ
    const STYLES = {
      princess: { L: 15, W: 4.2, decks: [{ h: 0.8, scale: 1 }, { h: 0.8, scale: 0.97 }, { h: 0.75, scale: 0.92 }], hull: 0x141c33, trim: 0xf1ede4, tint: 0xffbb55, glowColor: 0xffa63d, round: true, funnel: true },
      elite: { L: 17, W: 3.2, decks: [{ h: 0.75, scale: 1 }, { h: 0.72, scale: 0.9 }], hull: 0xe9edf2, trim: 0xf8fafc, tint: 0xdbeeff, cool: true, glowColor: 0x8cc8ff, bowPow: 1.3 },
      icon: { L: 13, W: 4.0, decks: [{ h: 0.8, scale: 1 }, { h: 0.7, scale: 0.9 }], hull: 0x271538, trim: 0xe7ddf0, tint: 0xffa24a, glowColor: 0xf059ff, bowPow: 1.9 },
    };
    const plan = [
      ['princess', 52, 1.5, 1, -60], ['elite', 66, 1.1, -1, 30], ['icon', 80, 1.0, 1, 40],
      ['princess', 58, 0.9, -1, -20], ['elite', 74, 1.3, 1, -85],
    ];
    const movers = plan.slice(0, lite ? 3 : 5).map(([style, z, speed, dir, x0], i) => {
      const g = makeCruise(STYLES[style]);
      g.position.set(x0, 0, z);
      scene.add(g);
      return { g, z, speed, dir, x: x0, ph: i * 1.9 };
    });
    window.cruiseMovers = movers;   // để kiểm thử/gỡ lỗi
    animators.push((d, t) => {
      for (const m of movers) {
        m.x += m.dir * m.speed * d;
        if (m.x > 115) m.x = -115; else if (m.x < -115) m.x = 115;
        m.g.position.set(m.x, -0.12 + Math.sin(t * 0.8 + m.ph) * 0.05, m.z);
        m.g.rotation.set(Math.sin(t * 0.55 + m.ph) * 0.012, m.dir > 0 ? 0 : Math.PI, Math.sin(t * 0.7 + m.ph) * 0.01);
      }
    });
  }

  // ========================================================
  // C. Nước sông kéo dài hai đầu
  // ========================================================
  function buildGrass() {
    const nearObstacle = (x, z) => pubDetails.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + 0.5 && Math.abs(z - o.z) < o.d / 2 + 0.5);
    const westAvoid = (x, z) => nearObstacle(x, z)
      || (Math.abs(z - 7.5) < 2.1 && x > -106) || (Math.abs(x - POND.x) < 2.3 && z > 6 && z < 26)
      || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.3
      || ((x - POND.x) / (POND.rx + 0.5)) ** 2 + ((z - POND.z) / (POND.rz + 0.5)) ** 2 < 1
      || (x > -52 && z > 5.5 && z < 9.5) || (x > -60 && z > 24);
    scene.add(Veg.scatterGrass({ x0: -121, x1: -49, z0: -4.5, z1: 24, y: 0.3, seed: 3 }, 1300, westAvoid));
    const eastAvoid = (x, z) => nearObstacle(x, z) || Math.hypot(x, z - 19.5) < 4.4;
    scene.add(Veg.scatterGrass({ x0: -47, x1: 47, z0: 12.3, z1: 23.8, y: 0.3, seed: 8 }, 1100, eastAvoid));
  }

  function buildRiverExtension() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c2547, roughness: 0.15, metalness: 0.75 });
    for (const cx of [-120, 120]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(80, 90), mat);
      w.rotation.x = -Math.PI / 2;
      w.position.set(cx, -0.2, 72);
      scene.add(w);
    }
  }

  PubLoader.defer(buildBuiVien, 'buildBuiVien');
  PubLoader.defer(buildWestPark, 'buildWestPark');
  PubLoader.defer(buildRiverExtension, 'buildRiverExtension');
  PubLoader.defer(buildParkedCars, 'buildParkedCars');
  PubLoader.defer(buildCouples, 'buildCouples');
  PubLoader.defer(buildGrass, 'buildGrass');
  PubLoader.defer(buildBridge, 'buildBridge');
  PubLoader.defer(buildCruiseBoats, 'buildCruiseBoats');
  Features.addTick((delta, t) => {
    for (const a of animators) a(delta, t);
    if (window.VehicleSystem) window.VehicleSystem.update(delta);
  });
})();

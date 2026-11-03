// Mở rộng bản đồ quanh quán nhậu (nạp SAU app.js, dùng chung scene/pubDetails/PubLoader của app.js):
//  - Phía Đông (x 55→118): phố đi bộ kiểu Bùi Viện, quán bar hai bên, show múa lửa, hàng rong, xích lô, khách Tây.
//  - Phía Tây (x -122→-48): công viên có quảng trường đài phun nước, hồ + cầu gỗ, cây xanh, ghế đá.
//  - Hai đầu sông Sài Gòn được kéo dài cho khớp bản đồ mới.
// Bố cục công viên tham khảo ý tưởng "quảng trường ở giữa – hồ có cầu – rừng cây" nhưng tự dựng hoàn toàn.
(function () {
  'use strict';

  const lite = PERF.lite;
  const animators = []; // (delta, t) => void, chạy mỗi khung hình qua Features.addTick

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
    const lawn = box(74, 0.3, 33.9, std(0x15803d, { roughness: 0.85 }), -85, 0.15, 11.45);
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

    // Vòng hoa quanh đài phun
    const fr = makeRng(5);
    const flowerCount = lite ? 30 : 80;
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 5), std(0xffffff, { roughness: 0.6 }), flowerCount);
    const fm = new THREE.Matrix4();
    const fcols = [0xff5c8a, 0xffd23f, 0xffffff, 0xff7a45, 0xc084fc];
    for (let i = 0; i < flowerCount; i++) {
      const a = (i / flowerCount) * Math.PI * 2, rr = 4.75 + (i % 2) * 0.5 + fr() * 0.15;
      fm.makeTranslation(x + Math.cos(a) * rr, 0.45, z + Math.sin(a) * rr);
      flowers.setMatrixAt(i, fm);
      flowers.setColorAt(i, new THREE.Color(fcols[Math.floor(fr() * fcols.length)]));
    }
    scene.add(flowers);

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
    const n = spots.length;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 3.4, 6), std(0x573a24, { roughness: 0.9 }), n);
    const crowns = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.7, 0), std(0xffffff, { roughness: 0.8 }), n);
    const tops = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.15, 0), std(0xffffff, { roughness: 0.8 }), n);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach((p, i) => {
      m.makeScale(p.s, p.s, p.s).setPosition(p.x, 0.3 + 1.7 * p.s, p.z); trunks.setMatrixAt(i, m);
      m.makeScale(p.s, p.s * 0.9, p.s).setPosition(p.x, 0.3 + 4.0 * p.s, p.z); crowns.setMatrixAt(i, m);
      m.makeScale(p.s, p.s, p.s).setPosition(p.x + 0.2 * p.s, 0.3 + 5.5 * p.s, p.z - 0.1 * p.s); tops.setMatrixAt(i, m);
      col.setHSL(0.30 + rng() * 0.08, 0.55, 0.20 + rng() * 0.10);
      crowns.setColorAt(i, col); tops.setColorAt(i, col.clone().offsetHSL(0, 0, 0.05));
      obstacle(p.x, p.z, 0.9, 0.9);
      if (i % 4 === 0) peeSpots.push({ type: 'tree', name: 'Cây Xanh Công Viên', x: p.x, z: p.z, radius: 2.2 });
    });
    scene.add(trunks, crowns, tops);
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
  // D. Ô TÔ ĐẬU DỌC ĐƯỜNG: taxi + VinFast VF3
  // ========================================================
  function addWheels(g, halfW, zs, r) {
    const tire = std(0x0b0f19, { roughness: 0.9 }), rim = std(0xcbd5e1, { metalness: 0.7, roughness: 0.3 });
    for (const sx of [-1, 1]) for (const z of zs) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 14), tire);
      w.rotation.z = Math.PI / 2; w.position.set(sx * halfW, r, z);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.26, 10), rim);
      hub.rotation.z = Math.PI / 2; hub.position.copy(w.position);
      g.add(w, hub);
    }
  }

  // VinFast VF3: xe điện mini dáng hộp vuông, đèn tròn, cao ~1.6m
  function buildVF3(color, x, z, ry) {
    const g = new THREE.Group();
    const body = std(color, { roughness: 0.3, metalness: 0.35 });
    const glass = std(0x0b1220, { roughness: 0.08, metalness: 0.7 });
    box(1.62, 0.62, 3.1, body, 0, 0.6, 0, g);
    box(1.5, 0.62, 2.2, body, 0, 1.22, -0.15, g);
    box(1.52, 0.05, 2.22, std(0x1f2937), 0, 1.55, -0.15, g);              // mui đen
    box(1.4, 0.46, 0.05, glass, 0, 1.23, 0.97, g);                        // kính trước
    box(1.4, 0.42, 0.05, glass, 0, 1.23, -1.27, g);                       // kính sau
    for (const sx of [-1, 1]) box(0.04, 0.42, 1.8, glass, sx * 0.76, 1.23, -0.15, g);
    box(1.05, 0.2, 0.04, std(0x0f172a), 0, 0.62, 1.56, g);                // lưới tản nhiệt
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 14), glow(0xfff4cf));
      hl.rotation.x = Math.PI / 2; hl.position.set(sx * 0.56, 0.78, 1.57); g.add(hl);
      box(0.3, 0.07, 0.04, glow(0xff2d2d), sx * 0.5, 0.78, -1.57, g);     // đèn hậu
    }
    const plate = signPlane([['VF 3', 110, 70]], 0.5, 0.18, 256, 128, '#e5e7eb', '#1e3a8a');
    plate.position.set(0, 0.5, -1.575); plate.rotation.y = Math.PI; g.add(plate);
    addWheels(g, 0.8, [-0.95, 0.95], 0.28);
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    const along = Math.abs(Math.sin(ry)) > 0.7;
    obstacle(x, z, along ? 3.3 : 1.8, along ? 1.8 : 3.3);
    return g;
  }

  // Taxi sedan trắng viền xanh, đèn nóc "TAXI"
  function buildTaxi(x, z, ry) {
    const g = new THREE.Group();
    const white = std(0xf8fafc, { roughness: 0.3, metalness: 0.3 });
    const glass = std(0x0b1220, { roughness: 0.08, metalness: 0.7 });
    box(1.75, 0.6, 4.3, white, 0, 0.58, 0, g);
    box(1.55, 0.55, 2.1, white, 0, 1.16, -0.25, g);
    box(1.45, 0.4, 0.05, glass, 0, 1.17, 0.83, g);
    box(1.45, 0.4, 0.05, glass, 0, 1.17, -1.33, g);
    for (const sx of [-1, 1]) {
      box(0.04, 0.4, 1.9, glass, sx * 0.78, 1.17, -0.25, g);
      box(0.03, 0.14, 3.2, std(0x16a34a), sx * 0.88, 0.62, 0.0, g);       // viền xanh bên hông
      const door = signPlane([['TAXI', 96, 70]], 1.0, 0.3, 256, 96, '#065f2f', '#f8fafc');
      door.position.set(sx * 0.89, 0.86, 0.0); door.rotation.y = sx * Math.PI / 2; g.add(door);
    }
    const roofMat = new THREE.MeshBasicMaterial({ map: signTexture([['TAXI', 78, 60]], 256, 96, '#1f2937', '#fde047') });
    box(0.7, 0.2, 0.3, roofMat, 0, 1.55, -0.25, g);
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), glow(0xfff4cf));
      hl.position.set(sx * 0.6, 0.72, 2.16); g.add(hl);
      box(0.34, 0.1, 0.05, glow(0xff2d2d), sx * 0.6, 0.78, -2.16, g);
    }
    addWheels(g, 0.82, [-1.3, 1.3], 0.3);
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    const along = Math.abs(Math.sin(ry)) > 0.7;
    obstacle(x, z, along ? 4.5 : 1.9, along ? 1.9 : 4.5);
    return g;
  }

  function buildParkedCars() {
    const E = Math.PI / 2, W = -Math.PI / 2;
    // Làn nam (z=10.2) quay đầu về phía đông, làn bắc (z=4.9) ngược lại
    buildTaxi(-46, 10.2, E);
    buildVF3(0xf472b6, -33, 10.2, E);
    buildVF3(0xf8fafc, -10, 10.2, E);
    buildVF3(0xfacc15, 12, 10.2, E);
    buildTaxi(31, 10.2, E);
    buildVF3(0xdc2626, 39, 10.2, E);
    buildTaxi(46, 10.2, E);
    buildVF3(0x38bdf8, -30, 4.9, W);
    buildVF3(0x34d399, 24 + 6, 4.9, W);
    buildTaxi(38, 4.9, W);
    buildVF3(0xfb923c, 46, 4.9, W);
    const sign = signPlane([['BẾN TAXI', 70, 60], ['Gọi xe • 24/7', 30, 108]], 1.8, 0.8, 512, 160, '#fde047', '#10261a');
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
  // C. Nước sông kéo dài hai đầu
  // ========================================================
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
  Features.addTick((delta, t) => { for (const a of animators) a(delta, t); });
})();

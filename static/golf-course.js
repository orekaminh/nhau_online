// ========================================================
// ROYAL SAIGON GOLF & COUNTRY CLUB
// Sân Golf Quốc Tế 18 Lỗ Bán Đảo Sông Sài Gòn & View Landmark 81
// Bao gồm:
//  - Fairway & Rough uốn lượn rộng 150m x 120m, cỏ nhung cao cấp
//  - 3 Bẫy cát Sand Bunkers uốn cong tự nhiên
//  - Hồ nước bẫy nước (Water Hazard) với đài phun nước phát sáng
//  - Cầu gỗ resort uốn cong bắc qua Island Green Hole 9
//  - Cờ lỗ kim loại tung bay (Hole 1, Hole 9, Hole 18) & Cốc golf
//  - Sân tập VIP Driving Range 2 tầng với 6 khoang phát bóng, lưới an toàn 16m
//  - Bảng cự ly phát sáng 50Y, 100Y, 150Y, 200Y, 250Y, 300Y & Vòng mục tiêu Target Greens
//  - Tòa Clubhouse 5 sao & 19th Hole Bar, Pro Shop túi gậy golf & Cúp vàng danh dự
//  - Đội xe điện Golf Buggy VIP có thể lái & Xe điện Shuttle đưa đón từ bến Quán Nhậu
//  - Hệ thống vung gậy Driver phát bóng Tee Shot & Gạt bóng Putting chân thực với quỹ đạo bay Parabol 3D, vệt sáng Neon Trail và âm thanh "TINK!"
// ========================================================

(function () {
  'use strict';

  const lite = !!(window.PUB_PERF && window.PUB_PERF.lite);
  const animators = [];

  // ---------- Tiện ích dựng hình Three.js ----------
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

  function obstacle(x, z, w, d) {
    if (window.pubDetails && window.pubDetails.obstacles) {
      window.pubDetails.obstacles.push({ x, z, w, d });
    }
  }

  // Âm thanh tổng hợp Web Audio chân thực (Tiếng vụt gậy Whoosh, Tiếng đập gậy titan TINK!, Tiếng bóng rơi cốc Plop)
  function getAudioCtx() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!window._golfAudioCtx) window._golfAudioCtx = new AudioCtx();
      if (window._golfAudioCtx.state === 'suspended') window._golfAudioCtx.resume();
      return window._golfAudioCtx;
    } catch (e) {
      return null;
    }
  }

  function playGolfSound(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'swing_drive') {
      // 1. Tiếng vụt gió Whoosh
      const bufSize = ctx.sampleRate * 0.22;
      const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) output[i] = Math.random() * 2 - 1;
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
      filter.Q.value = 3.0;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.1);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);

      // 2. Tiếng chạm bóng kim loại Titan đanh giòn TINK!
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const impactGain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(2450, now + 0.09);
      osc1.frequency.exponentialRampToValueAtTime(800, now + 0.26);
      osc2.frequency.setValueAtTime(4900, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.22);
      impactGain.gain.setValueAtTime(0.001, now);
      impactGain.gain.setValueAtTime(0.45, now + 0.095);
      impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc1.connect(impactGain);
      osc2.connect(impactGain);
      impactGain.connect(ctx.destination);
      osc1.start(now + 0.09);
      osc2.start(now + 0.09);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);

    } else if (type === 'putt') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);

    } else if (type === 'cup_drop') {
      // Tiếng bóng rơi vào cốc golf rổn rảng "plop-plop"
      for (const [offset, freq] of [[0, 520], [0.07, 680], [0.14, 450]]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + offset);
        g.gain.setValueAtTime(0.2, now + offset);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.08);
      }
    } else if (type === 'cheer_fanfare') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.09);
        g.gain.setValueAtTime(0.18, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.25);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.28);
      });
    }
  }

  // Biển hiệu Canvas sắc nét
  function signTexture(lines, w, h, fg, bg, borderColor) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg || '#051d14';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = borderColor || fg || '#10b981';
    g.lineWidth = 6;
    g.shadowColor = fg || '#10b981';
    g.shadowBlur = 14;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.shadowBlur = 0;
    g.fillStyle = fg || '#fef08a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [text, size, y, isGold] of lines) {
      g.font = `900 ${size}px "Be Vietnam Pro", Arial, sans-serif`;
      if (isGold) {
        g.fillStyle = '#facc15';
        g.shadowColor = '#eab308';
        g.shadowBlur = 10;
      } else {
        g.fillStyle = fg || '#f8fafc';
        g.shadowBlur = 0;
      }
      g.fillText(text, w / 2, y, w - 40);
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function signPlane(lines, w, h, pw, ph, fg, bg, border) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(lines, pw, ph, fg, bg, border) });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  // ========================================================
  // XÂY DỰNG SÂN GOLF QUỐC TẾ (BUILD GOLF RESORT WORLD)
  // ========================================================
  function buildGolfWorld() {
    const golfGroup = new THREE.Group();
    golfGroup.name = 'RoyalSaigonGolfResort';
    scene.add(golfGroup);

    // Bảng vật liệu chính của sân golf
    const fairwayMat = std(0x22c55e, { roughness: 0.85, metalness: 0.05 }); // Cỏ Fairway xanh tươi
    const roughMat = std(0x15803d, { roughness: 0.95 });                     // Cỏ Rough xanh thẫm
    const greenMat = std(0x16a34a, { roughness: 0.65 });                     // Thảm cỏ gạt Putting Green mượt mà
    const sandMat = std(0xfef08a, { roughness: 0.95, metalness: 0.05 });    // Cát thạch anh mịn màu vàng óng
    const waterMat = std(0x0284c7, { roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.82 });
    const darkSlate = std(0x0f172a, { roughness: 0.5 });
    const goldMat = std(0xf59e0b, { metalness: 0.9, roughness: 0.2 });
    const whiteEnamel = std(0xf8fafc, { roughness: 0.25 });
    const teakWood = std(0x78350f, { roughness: 0.75 });

    // ----------------------------------------------------
    // 1. NỀN TỔNG THỂ SÂN GOLF RỘNG 150M x 120M (x: -185..-35, z: 98..218)
    // ----------------------------------------------------
    const mainLawn = box(152, 0.35, 122, roughMat, -110, 0.16, 158, golfGroup);
    mainLawn.receiveShadow = true;

    // Đường Fairway chính Hole 1 & Hole 18 uốn lượn (dải cỏ mượt mà cắt sọc đan xen)
    for (let fz = 105; fz <= 210; fz += 18) {
      const stripeMat = (Math.floor(fz / 18) % 2 === 0) ? fairwayMat : std(0x16a34a, { roughness: 0.8 });
      const stripe = box(42, 0.38, 17.5, stripeMat, -115, 0.18, fz, golfGroup);
      stripe.receiveShadow = true;
    }

    // ----------------------------------------------------
    // 2. KHU VỰC CỔNG CHÀO & QUẢNG TRƯỜNG ĐÓN KHÁCH (x: -54, z: 104)
    // Nối liền trực tiếp với Cầu Đi Bộ Bạch Đằng ở x = -50, z = 100
    // ----------------------------------------------------
    const plazaPaving = box(28, 0.38, 18, std(0xe2e8f0, { roughness: 0.6 }), -52, 0.18, 105, golfGroup);
    plazaPaving.receiveShadow = true;

    // Thảm đỏ VIP đón khách từ cầu đi bộ bước vào sân golf
    const redCarpet = box(3.6, 0.40, 16, std(0xb91c1c, { roughness: 0.7 }), -52, 0.20, 105, golfGroup);

    // Cổng chào Hoành Tráng phong cách kiến trúc Resort 5 Sao
    const gatePillars = [-64, -40];
    gatePillars.forEach(px => {
      cyl(0.65, 0.75, 6.2, darkSlate, px, 3.1, 102, golfGroup);
      cyl(0.78, 0.78, 0.45, goldMat, px, 5.8, 102, golfGroup);
      obstacle(px, 102, 1.4, 1.4);
    });
    // Dầm cổng mạ vàng vắt ngang
    box(26, 0.85, 1.2, darkSlate, -52, 6.2, 102, golfGroup);
    box(26.2, 0.15, 1.3, goldMat, -52, 5.75, 102, golfGroup);

    // Biển hiệu 3D lớn mặt trước cổng chào
    const mainSign = signPlane([
      ['ROYAL SAIGON GOLF & COUNTRY CLUB', 68, 55, true],
      ['18-HOLE CHAMPIONSHIP • VIP DRIVING RANGE • 19th HOLE LOUNGE', 30, 115, false]
    ], 19.5, 2.5, 1024, 180, '#fef08a', '#032014', '#10b981');
    mainSign.position.set(-52, 6.4, 101.3);
    mainSign.rotation.y = Math.PI;
    golfGroup.add(mainSign);

    // ----------------------------------------------------
    // 3. 5-STAR LUXURY CLUBHOUSE & 19TH HOLE LOUNGE (x: -42, z: 122)
    // ----------------------------------------------------
    const chGroup = new THREE.Group();
    chGroup.position.set(-42, 0, 122);

    // Sàn gỗ Teak ngoài trời bao quanh Clubhouse
    const chDeck = box(19, 0.42, 22, teakWood, 0, 0.21, 0, chGroup);
    chDeck.receiveShadow = true;

    // Tòa nhà chính: Tường kính Panorama nhìn ra Fairway & Sông Sài Gòn
    const chGlass = box(16, 5.2, 18, std(0x0f172a, { transparent: true, opacity: 0.4, roughness: 0.1 }), 0, 2.7, 0, chGroup);
    // Khung cột thép vàng hiện đại
    for (const cx of [-7.8, 0, 7.8]) {
      for (const cz of [-8.8, 8.8]) {
        cyl(0.35, 0.35, 5.6, goldMat, cx, 2.8, cz, chGroup);
        obstacle(-42 + cx, 122 + cz, 0.8, 0.8);
      }
    }
    // Mái che kiểu vát giật cấp sang trọng
    box(18, 0.65, 20.5, darkSlate, 0, 5.4, 0, chGroup);
    box(18.2, 0.12, 20.7, goldMat, 0, 5.1, 0, chGroup);
    obstacle(-42, 122, 16.5, 18.5);

    // Biển hiệu "THE 19th HOLE LOUNGE & PRO SHOP"
    const loungeSign = signPlane([
      ['THE 19th HOLE VIP LOUNGE', 60, 52, true],
      ['Champagne • Whisky • Craft Beer • Pro Shop', 28, 108, false]
    ], 9.5, 1.8, 512, 160, '#fde047', '#0f172a');
    loungeSign.position.set(0, 4.2, 9.1);
    chGroup.add(loungeSign);

    // Bàn ghế thư giãn ngoài hiên ngắm cảnh (Patio sets với dù che nắng)
    for (const pz of [-5.5, 5.5]) {
      // Dù che nắng trắng
      cyl(0.04, 0.04, 2.8, std(0x475569), 6.5, 1.4, pz, chGroup);
      const canopy = cyl(0.02, 1.6, 0.8, std(0xf8fafc), 6.5, 2.6, pz, chGroup);
      canopy.rotation.x = Math.PI;
      // Bàn cà phê kính
      cyl(0.55, 0.55, 0.75, std(0x1e293b), 6.5, 0.58, pz, chGroup);
      // Xô ướp rượu Champagne bằng bạc & Ly rượu
      cyl(0.12, 0.09, 0.22, std(0xe2e8f0, { metalness: 0.9 }), 6.5, 1.05, pz, chGroup);
      // Ghế bành mây
      for (const dz of [-0.85, 0.85]) {
        box(0.65, 0.5, 0.65, teakWood, 6.5, 0.45, pz + dz, chGroup);
      }
    }

    // Quầy Pro Shop trưng bày túi gậy golf & Cúp vô địch vàng
    const trophyPedestal = box(1.2, 1.1, 1.2, whiteEnamel, -2, 0.75, 4, chGroup);
    // Cúp vô địch vàng 24K (Championship Golden Trophy)
    const trophyBase = cyl(0.25, 0.32, 0.35, goldMat, -2, 1.45, 4, chGroup);
    const trophyBowl = cyl(0.38, 0.15, 0.5, goldMat, -2, 1.8, 4, chGroup);
    const trophyBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), whiteEnamel);
    trophyBall.position.set(-2, 2.15, 4);
    chGroup.add(trophyBall);

    golfGroup.add(chGroup);

    // ----------------------------------------------------
    // 4. VIP DRIVING RANGE 2 TẦNG (x: -74, z: 122)
    // Có 6 khoang tập swing, thảm tập, bóng golf trên tee, cột lưới 16m
    // ----------------------------------------------------
    const drGroup = new THREE.Group();
    drGroup.position.set(-74, 0, 122);

    // Sàn tầng 1 & Tầng 2
    box(24, 0.45, 14, darkSlate, 0, 0.22, 0, drGroup);
    box(24, 0.45, 14, darkSlate, 0, 4.4, 0, drGroup); // Sàn tầng 2
    box(24.5, 0.5, 14.5, darkSlate, 0, 8.5, 0, drGroup); // Mái che
    // Cột chống chịu lực
    for (const cx of [-11, -4, 4, 11]) {
      for (const cz of [-6, 6]) {
        cyl(0.28, 0.28, 8.5, goldMat, cx, 4.25, cz, drGroup);
        obstacle(-74 + cx, 122 + cz, 0.7, 0.7);
      }
    }
    obstacle(-74, 122, 24, 14);

    // 6 Thảm tập phát bóng (Hitting Mats) với Tee cao su & Rổ bóng golf
    const bays = [-8.5, -3.5, 1.5, 6.5];
    bays.forEach((bx, idx) => {
      // Thảm cỏ tập xanh sẫm
      box(2.2, 0.08, 3.2, std(0x065f46, { roughness: 0.9 }), bx, 0.48, 2.5, drGroup);
      // Tee cao su cắm bóng golf
      cyl(0.015, 0.02, 0.12, std(0xfacc15), bx, 0.58, 2.2, drGroup);
      const teeBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), whiteEnamel);
      teeBall.position.set(bx, 0.68, 2.2);
      drGroup.add(teeBall);

      // Khay rổ bóng golf inox kim loại
      box(0.55, 0.25, 0.45, std(0x94a3b8, { metalness: 0.8 }), bx + 0.85, 0.58, 3.2, drGroup);
      // Bóng trong rổ
      for (let bi = 0; bi < 6; bi++) {
        const bb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), whiteEnamel);
        bb.position.set(bx + 0.75 + (bi % 3) * 0.1, 0.70, 3.1 + Math.floor(bi / 3) * 0.1);
        drGroup.add(bb);
      }

      // Vạch căn hướng đánh màu trắng (Alignment Line)
      box(0.05, 0.02, 2.5, whiteEnamel, bx - 0.7, 0.53, 2.5, drGroup);
    });

    // Biển "VIP 2-TIER DRIVING RANGE"
    const drSign = signPlane([
      ['VIP 2-TIER DRIVING RANGE', 64, 52, true],
      ['Auto-Tee • Launch Monitor • Night Floodlights', 28, 108, false]
    ], 14, 2.2, 512, 160, '#34d399', '#061727');
    drSign.position.set(0, 9.2, 6.8);
    drGroup.add(drSign);

    // Cột lưới an toàn cao ngất 16m (Driving Range Safety Net Towers)
    for (const netX of [-92, -56]) {
      for (const netZ of [112, 195]) {
        const pole = cyl(0.22, 0.35, 17, std(0x1e293b), netX, 8.5, netZ, golfGroup);
        // Đèn cao áp rực rỡ đỉnh cột chiếu sáng cả sân golf ban đêm
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.8), glow(0xfef08a));
        lamp.position.set(netX, 16.8, netZ);
        golfGroup.add(lamp);
        if (!lite) {
          const flood = new THREE.PointLight(0xfff7ed, 1.8, 55);
          flood.position.set(netX, 16.5, netZ);
          golfGroup.add(flood);
        }
      }
    }

    // Các biển mục tiêu cự ly neon cắm trên sân tập (Target Yardage Boards)
    const targets = [
      { yds: '50Y', dist: 35, x: -74, z: 145, col: '#38bdf8' },
      { yds: '100Y', dist: 55, x: -70, z: 165, col: '#4ade80' },
      { yds: '150Y', dist: 75, x: -78, z: 185, col: '#facc15' },
      { yds: '200Y', dist: 95, x: -72, z: 202, col: '#fb923c' },
      { yds: '250Y', dist: 115, x: -76, z: 215, col: '#f43f5e' },
    ];
    targets.forEach(tgt => {
      // Vòng tròn mục tiêu phát sáng trên mặt cỏ (Target Green Ring)
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.2, 28), glow(tgt.col));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(tgt.x, 0.39, tgt.z);
      golfGroup.add(ring);

      const innerRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 20), glow(tgt.col));
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.set(tgt.x, 0.40, tgt.z);
      golfGroup.add(innerRing);

      // Cờ cắm giữa tâm mục tiêu
      cyl(0.04, 0.04, 3.2, std(0x94a3b8), tgt.x, 1.8, tgt.z, golfGroup);
      const flagMesh = box(0.9, 0.55, 0.02, glow(tgt.col), tgt.x + 0.45, 3.0, tgt.z, golfGroup);

      // Biển số khoảng cách
      const numSign = signPlane([[tgt.yds, 75, 64, true]], 2.4, 1.2, 256, 128, tgt.col, '#020617');
      numSign.position.set(tgt.x, 1.8, tgt.z - 0.2);
      numSign.rotation.y = Math.PI;
      golfGroup.add(numSign);
    });

    golfGroup.add(drGroup);

    // ----------------------------------------------------
    // 5. HỒ NƯỚC CẢNH QUAN (WATER HAZARD) & ĐÀI PHUN NƯỚC (x: -110, z: 162)
    // ----------------------------------------------------
    const lakeGroup = new THREE.Group();
    lakeGroup.position.set(-110, 0, 162);

    // Đáy hồ bẫy nước
    box(34, 0.2, 34, std(0x0369a1, { roughness: 0.8 }), 0, -0.05, 0, lakeGroup);
    // Mặt nước hồ ngọc bích lung linh
    const lakeWater = box(33.5, 0.32, 33.5, waterMat, 0, 0.16, 0, lakeGroup);

    // Đài phun nước nghệ thuật giữa hồ (Fountain Aerator)
    cyl(1.4, 1.8, 0.6, darkSlate, 0, 0.3, 0, lakeGroup);
    const fountainJets = [];
    for (let f = 0; f < 8; f++) {
      const jet = cyl(0.06, 0.08, 1.8, std(0xe0f2fe, { transparent: true, opacity: 0.65 }), 0, 1.2, 0, lakeGroup);
      const ang = (f / 8) * Math.PI * 2;
      jet.position.set(Math.cos(ang) * 0.7, 1.2, Math.sin(ang) * 0.7);
      jet.rotation.x = Math.sin(ang) * 0.35;
      jet.rotation.z = -Math.cos(ang) * 0.35;
      fountainJets.push(jet);
    }
    // Đèn LED chiếu sáng đài phun nước đổi màu
    const fLight = new THREE.PointLight(0x38bdf8, 2.0, 16);
    fLight.position.set(0, 1.8, 0);
    lakeGroup.add(fLight);

    // Cây cầu gỗ resort uốn cong (Arched Wooden Footbridge) nối qua hồ sang Island Green
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(0, 0, -17);
    const bridgeFloor = box(3.2, 0.25, 12, teakWood, 0, 0.55, 6, bridgeGroup);
    // Lan can cầu
    for (const bx of [-1.5, 1.5]) {
      cyl(0.06, 0.06, 1.0, teakWood, bx, 1.05, 2, bridgeGroup);
      cyl(0.06, 0.06, 1.0, teakWood, bx, 1.05, 6, bridgeGroup);
      cyl(0.06, 0.06, 1.0, teakWood, bx, 1.05, 10, bridgeGroup);
      box(0.08, 0.1, 12, teakWood, bx, 1.35, 6, bridgeGroup);
    }
    lakeGroup.add(bridgeGroup);

    // ----------------------------------------------------
    // 6. ISLAND GREEN HOLE 9 (LỖ GOLF SỐ 9 TRÊN ĐẢO GIỮA HỒ)
    // ----------------------------------------------------
    const islandGreen = cyl(6.5, 7.2, 0.5, greenMat, 0, 0.25, 0, lakeGroup, 24);
    islandGreen.receiveShadow = true;
    // Viền đá cuội trắng bao quanh hòn đảo
    const islandBorder = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.35, 8, 28), std(0xd1d5db));
    islandBorder.rotation.x = Math.PI / 2;
    islandBorder.position.y = 0.35;
    lakeGroup.add(islandBorder);

    // Cột cờ Lỗ số 9 (Hole 9 Pin Flagstick)
    const pin9Pole = cyl(0.03, 0.03, 2.6, std(0xf8fafc, { metalness: 0.7 }), 0, 1.5, 0, lakeGroup);
    // Cờ đỏ vàng tam giác bay phất phới
    const flagGeo = new THREE.BufferGeometry();
    const flagPts = new Float32Array([
      0, 2.6, 0,
      0.9, 2.25, 0,
      0, 1.9, 0
    ]);
    flagGeo.setAttribute('position', new THREE.BufferAttribute(flagPts, 3));
    flagGeo.computeVertexNormals();
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    const flag9Mesh = new THREE.Mesh(flagGeo, flagMat);
    lakeGroup.add(flag9Mesh);

    // Cốc golf kim loại khoét trên green
    cyl(0.18, 0.18, 0.08, std(0x0f172a), 0, 0.48, 0, lakeGroup);
    // Quả bóng golf nằm sát mép lỗ cờ
    const puttedBall = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), whiteEnamel);
    puttedBall.position.set(0.28, 0.52, 0.15);
    lakeGroup.add(puttedBall);

    golfGroup.add(lakeGroup);

    // ----------------------------------------------------
    // 7. CÁC BẪY CÁT (SAND BUNKERS) & KHU GREEN HOLE 1
    // ----------------------------------------------------
    // Bẫy cát 1 (Hạt đậu uốn lượn cạnh Fairway)
    const bunker1 = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.2, 0.25, 20), sandMat);
    bunker1.scale.set(1.5, 1, 0.85);
    bunker1.position.set(-145, 0.22, 145);
    bunker1.rotation.y = 0.45;
    bunker1.receiveShadow = true;
    golfGroup.add(bunker1);

    // Bẫy cát 2 (Bảo vệ Green Hole 1)
    const bunker2 = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 6.8, 0.25, 20), sandMat);
    bunker2.scale.set(1.2, 1, 0.9);
    bunker2.position.set(-155, 0.22, 182);
    bunker2.receiveShadow = true;
    golfGroup.add(bunker2);

    // Green Hole 1 (Par 4, 385 Yards)
    const greenHole1 = cyl(9.5, 10.2, 0.42, greenMat, -145, 0.21, 188, golfGroup, 24);
    greenHole1.receiveShadow = true;

    // Cờ Hole 1 màu đỏ vàng rực rỡ
    cyl(0.035, 0.035, 2.7, std(0xf8fafc, { metalness: 0.7 }), -145, 1.55, 188, golfGroup);
    const flag1Mesh = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0x2563eb, side: THREE.DoubleSide }));
    flag1Mesh.position.set(-145, 0, 188);
    golfGroup.add(flag1Mesh);
    // Lỗ golf kim loại
    cyl(0.2, 0.2, 0.08, std(0x0f172a), -145, 0.44, 188, golfGroup);

    // Tee Box Hole 1 (Bệ phát bóng với cọc tiêu xanh, trắng, đỏ)
    box(7.5, 0.28, 5.0, fairwayMat, -115, 0.24, 115, golfGroup);
    // Cọc mốc Tee Markers
    cyl(0.08, 0.08, 0.16, glow(0x3b82f6), -117.5, 0.45, 114, golfGroup); // Championship Blue
    cyl(0.08, 0.08, 0.16, glow(0x3b82f6), -112.5, 0.45, 114, golfGroup);
    cyl(0.08, 0.08, 0.16, glow(0xf8fafc), -117.5, 0.45, 115.5, golfGroup); // Member White
    cyl(0.08, 0.08, 0.16, glow(0xf8fafc), -112.5, 0.45, 115.5, golfGroup);

    // Bia đá thông tin lỗ golf "HOLE 1 • PAR 4 • 385 YDS"
    const stoneBoard = box(1.2, 1.4, 0.35, darkSlate, -119, 0.9, 115, golfGroup);
    const stoneSign = signPlane([
      ['HOLE 1', 65, 45, true],
      ['PAR 4', 45, 88, false],
      ['385 YDS', 40, 130, false]
    ], 1.1, 1.3, 256, 256, '#fef08a', '#061727');
    stoneSign.position.set(-119, 0.9, 115.2);
    golfGroup.add(stoneSign);

    // ----------------------------------------------------
    // 8. CÂY CỐI, HOA CẢNH QUAN & ĐÈN BOLLARD LUNG LINH
    // ----------------------------------------------------
    if (window.Veg && Veg.makeTree) {
      // Hàng cọ hoàng gia (Royal Palms) dọc lối đi và bờ sông
      const palmCoords = [
        [-62, 108], [-62, 116], [-62, 126], [-62, 136],
        [-38, 108], [-38, 116], [-38, 126], [-38, 136],
        [-100, 140], [-95, 145], [-92, 155], [-94, 168],
        [-130, 140], [-135, 150], [-138, 165],
        [-175, 125], [-178, 150], [-175, 175], [-172, 195]
      ];
      palmCoords.forEach(([tx, tz], i) => {
        const tree = Veg.makeTree(i % 3 === 0 ? 'palm' : (i % 2 === 0 ? 'tall' : 'flame'), 880 + i, 1.1);
        tree.position.set(tx, 0.32, tz);
        golfGroup.add(tree);
        obstacle(tx, tz, 1.2, 1.2);
      });
    }

    // Đèn cột sân golf thấp (Bollard Path Lights) dọc lối đi xe điện
    for (let bz = 105; bz <= 145; bz += 6.5) {
      for (const bx of [-63, -37]) {
        cyl(0.07, 0.08, 0.95, darkSlate, bx, 0.65, bz, golfGroup);
        const lamp = cyl(0.072, 0.072, 0.22, glow(0xfef08a), bx, 1.05, bz, golfGroup);
      }
    }

    // ----------------------------------------------------
    // 9. ĐỘI XE GOLF ĐIỆN VIP (LUXURY GOLF BUGGY FLEET)
    // ----------------------------------------------------
    function createGolfBuggy(colorHex = 0xf8fafc, accentHex = 0x10b981) {
      const buggy = new THREE.Group();
      const bodyMat = std(colorHex, { roughness: 0.25, metalness: 0.1 });
      const greenAccent = std(accentHex, { roughness: 0.3 });
      const chrome = std(0xe2e8f0, { metalness: 0.95, roughness: 0.15 });
      const rubber = std(0x18181b, { roughness: 0.9 });
      const leather = std(0xb45309, { roughness: 0.7 }); // Da bò cao cấp

      // Khung gầm xe điện
      box(1.7, 0.28, 2.9, darkSlate, 0, 0.35, 0, buggy);

      // 4 Bánh xe thể thao vành đúc mạ chrome
      const wheels = [
        [-0.85, 0.28, -0.9], [0.85, 0.28, -0.9],
        [-0.85, 0.28, 0.9], [0.85, 0.28, 0.9]
      ];
      wheels.forEach(([wx, wy, wz]) => {
        const tire = cyl(0.28, 0.28, 0.22, rubber, wx, wy, wz, buggy, 16);
        tire.rotation.z = Math.PI / 2;
        const rim = cyl(0.18, 0.18, 0.23, chrome, wx, wy, wz, buggy, 12);
        rim.rotation.z = Math.PI / 2;
      });

      // Thân vỏ xe trước & nắp ca-pô
      box(1.55, 0.45, 1.1, bodyMat, 0, 0.65, 0.85, buggy);
      box(1.58, 0.06, 0.35, greenAccent, 0, 0.72, 0.85, buggy); // Sọc màu xanh Emerald thể thao

      // Đèn pha LED trước rực rỡ
      for (const lx of [-0.55, 0.55]) {
        box(0.28, 0.12, 0.05, glow(0xffedd5), lx, 0.65, 1.42, buggy);
      }

      // Kính chắn gió phía trước gập được
      const windshield = box(1.5, 0.75, 0.04, std(0xa5f3fc, { transparent: true, opacity: 0.45 }), 0, 1.25, 0.38, buggy);
      windshield.rotation.x = -0.15;

      // Hàng ghế nệm da đôi êm ái
      box(1.35, 0.18, 0.65, leather, 0, 0.62, -0.15, buggy); // Đệm ngồi
      box(1.35, 0.55, 0.15, leather, 0, 0.95, -0.45, buggy); // Tựa lưng

      // Vô-lăng thể thao & Bảng đồng hồ kỹ thuật số
      const steeringCol = cyl(0.025, 0.025, 0.6, darkSlate, 0.32, 0.92, 0.2, buggy);
      steeringCol.rotation.x = 0.55;
      const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 16), darkSlate);
      wheelRing.position.set(0.32, 1.15, 0.05);
      wheelRing.rotation.x = 0.55;
      buggy.add(wheelRing);

      // Cột chống mui xe mạ chrome đen
      for (const sx of [-0.72, 0.72]) {
        cyl(0.03, 0.03, 1.2, chrome, sx, 1.45, 0.28, buggy);
        cyl(0.03, 0.03, 1.2, chrome, sx, 1.45, -0.65, buggy);
      }
      // Mái che vòm thời thượng
      box(1.65, 0.08, 2.4, whiteEnamel, 0, 2.05, -0.12, buggy);

      // Giá để túi gậy golf phía sau xe
      box(1.4, 0.12, 0.75, darkSlate, 0, 0.55, -0.95, buggy);
      box(1.4, 0.45, 0.06, chrome, 0, 0.8, -1.35, buggy);

      // 2 Túi gậy golf da cao cấp (Leather Golf Stand Bags)
      for (const [bx, bagColor] of [[-0.38, 0xb91c1c], [0.38, 0x1e3a8a]]) {
        const bag = cyl(0.16, 0.14, 0.85, std(bagColor), bx, 0.98, -1.0, buggy);
        bag.rotation.x = -0.25;
        // Đầu gậy driver, gậy sắt, putter mạ chrome lấp lánh thò ra
        for (let ci = 0; ci < 4; ci++) {
          const club = cyl(0.012, 0.012, 0.45, chrome, bx + (ci % 2 ? 0.06 : -0.06), 1.42, -1.05 + ci * 0.04, buggy);
          club.rotation.z = (ci - 1.5) * 0.15;
          cyl(0.03, 0.05, 0.08, chrome, bx + (ci % 2 ? 0.06 : -0.06), 1.62, -1.05 + ci * 0.04, buggy); // Đầu gậy Titan
        }
      }

      return buggy;
    }

    // A. XE ĐIỆN SHUTTLE 1: ĐẬU TẠI BẾN QUÁN NHẬU (BỜ NAM - x = -4, z = 33)
    const pubShuttleBuggy = createGolfBuggy(0xf8fafc, 0x10b981);
    pubShuttleBuggy.position.set(-4.5, 0.32, 33.2);
    pubShuttleBuggy.rotation.y = 0;
    scene.add(pubShuttleBuggy);
    obstacle(-4.5, 33.2, 2.2, 3.2);

    // Biển đón xe điện tại bến Quán Nhậu
    const shuttleSignPub = signPlane([
      ['⛳ XE ĐIỆN SHUTTLE SÂN GOLF', 52, 45, true],
      ['Đưa đón miễn phí sang Sân Golf Quốc Tế', 26, 92, false],
      ['Bấm [F] để lên xe vi vu qua sông', 24, 132, false]
    ], 3.8, 1.5, 512, 180, '#34d399', '#052e16', '#10b981');
    shuttleSignPub.position.set(-2.2, 1.8, 33.2);
    shuttleSignPub.rotation.y = Math.PI;
    scene.add(shuttleSignPub);

    // B. XE ĐIỆN SHUTTLE 2: ĐẬU TẠI CLUBHOUSE SÂN GOLF (BỜ BẮC - x = -54, z = 106)
    const resortShuttleBuggy = createGolfBuggy(0xf8fafc, 0xf59e0b);
    resortShuttleBuggy.position.set(-54.0, 0.35, 106.0);
    resortShuttleBuggy.rotation.y = Math.PI;
    golfGroup.add(resortShuttleBuggy);
    obstacle(-54.0, 106.0, 2.2, 3.2);

    // C. XE GOLF TUẦN TRA ĐẶT TẠI KHU TẬP DRIVING RANGE (x = -82, z = 118)
    const courseBuggy = createGolfBuggy(0x1e293b, 0x38bdf8);
    courseBuggy.position.set(-82.0, 0.35, 118.0);
    courseBuggy.rotation.y = 0.5;
    golfGroup.add(courseBuggy);
    obstacle(-82.0, 118.0, 2.2, 3.2);

    // ----------------------------------------------------
    // 10. NHÂN VẬT GOLFER & CADDY CHUYÊN NGHIỆP TRÊN SÂN
    // ----------------------------------------------------
    function makeGolferNPC(skinColor, shirtColor, pantsColor, x, z, ry, isFemale = false) {
      const gGroup = new THREE.Group();
      gGroup.position.set(x, 0.35, z);
      gGroup.rotation.y = ry;

      const skin = std(skinColor, { roughness: 0.8 });
      const shirt = std(shirtColor, { roughness: 0.6 });
      const pants = std(pantsColor, { roughness: 0.7 });
      const white = std(0xf8fafc, { roughness: 0.3 });

      // Chân & Giày golf đinh
      cyl(0.08, 0.08, 0.6, isFemale ? skin : pants, -0.16, 0.35, 0, gGroup);
      cyl(0.08, 0.08, 0.6, isFemale ? skin : pants, 0.16, 0.35, 0, gGroup);
      box(0.14, 0.12, 0.28, white, -0.16, 0.06, 0.04, gGroup);
      box(0.14, 0.12, 0.28, white, 0.16, 0.06, 0.04, gGroup);
      if (isFemale) {
        // Chân váy thể thao
        cyl(0.24, 0.34, 0.32, pants, 0, 0.72, 0, gGroup);
      }

      // Thân áo Polo
      box(0.52, 0.62, 0.32, shirt, 0, 1.05, 0, gGroup);

      // Cổ & Đầu + Mũ Visor / Mũ Lưỡi Trai
      cyl(0.09, 0.09, 0.16, skin, 0, 1.42, 0, gGroup);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), skin);
      head.position.set(0, 1.62, 0);
      gGroup.add(head);

      // Nón Visor trắng thời thượng
      cyl(0.24, 0.24, 0.08, white, 0, 1.74, 0, gGroup);
      box(0.26, 0.03, 0.22, white, 0, 1.72, 0.18, gGroup); // Lưỡi trai

      // Tay cầm gậy golf
      const armL = cyl(0.06, 0.06, 0.55, shirt, -0.28, 1.0, 0.12, gGroup);
      armL.rotation.x = 0.4;
      const armR = cyl(0.06, 0.06, 0.55, shirt, 0.28, 1.0, 0.12, gGroup);
      armR.rotation.x = 0.4;

      // Cây gậy Driver mạ titan cầm trên tay
      const clubShaft = cyl(0.012, 0.012, 1.1, std(0xe2e8f0, { metalness: 0.9 }), 0.15, 0.72, 0.35, gGroup);
      clubShaft.rotation.x = 0.35;
      cyl(0.04, 0.06, 0.09, std(0xe2e8f0, { metalness: 0.95 }), 0.15, 0.22, 0.52, gGroup);

      golfGroup.add(gGroup);
      obstacle(x, z, 0.8, 0.8);
      return gGroup;
    }

    // Caddy xinh đẹp tại Tee Box 1
    const caddy1 = makeGolferNPC(0xfcd34d, 0xf8fafc, 0x10b981, -113.5, 114.2, -1.8, true);
    // Golfer đại gia đang tập vung gậy
    const golfer1 = makeGolferNPC(0xd49b73, 0x0284c7, 0x1e293b, -76.0, 122.5, 0.1, false);

    // ----------------------------------------------------
    // KẾT NỐI VÀO WORLD_BOUNDS (CHO PHÉP ĐI LẠI TỰ DO TOÀN SÂN GOLF)
    // ----------------------------------------------------
    if (window.WORLD_BOUNDS) {
      window.WORLD_BOUNDS.golf = {
        constrain(x, z) {
          // Khu vực Sân Golf Quốc Tế bờ bắc: x từ -185 đến -35, z từ 96 đến 218
          if (x >= -185 && x <= -35 && z >= 96 && z <= 218) {
            // Không để người chơi lọt vào giữa hồ nước bẫy nước sâu
            if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
              // Cầu gỗ cho phép đi qua
              if (Math.abs(x - (-110)) < 1.8) {
                return { x: -110, z };
              }
              // Island green cho phép đi
              const distToCenter = Math.hypot(x - (-110), z - 162);
              if (distToCenter > 6.4) {
                // Đẩy ra mép hồ
                const ang = Math.atan2(z - 162, x - (-110));
                return { x: -110 + Math.cos(ang) * 17.5, z: 162 + Math.sin(ang) * 17.5 };
              }
            }
            return {
              x: Math.max(-183, Math.min(-36, x)),
              z: Math.max(97, Math.min(216, z))
            };
          }
          return null;
        },
        groundY(x, z) {
          // Khu vực hồ bẫy nước
          if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
            const distIsland = Math.hypot(x - (-110), z - 162);
            if (distIsland < 6.4) return 0.52; // Mặt cỏ Island Green cao ráo
            if (Math.abs(x - (-110)) < 1.8) return 0.58; // Cầu gỗ
            return 0.16; // Bơi trong hồ bẫy nước
          }
          // Sàn tầng 2 driving range
          if (x >= -85 && x <= -63 && z >= 115 && z <= 129 && (localPlayerState && localPlayerState.y > 2.5)) {
            return 4.65;
          }
          // Mặt cỏ sân golf cao hơn vỉa hè một chút
          if (x >= -185 && x <= -35 && z >= 96 && z <= 218) {
            return 0.35;
          }
          return null;
        }
      };
    }

    // ----------------------------------------------------
    // HOẠT ẢNH LIÊN TỤC (TICK ANIMATIONS)
    // ----------------------------------------------------
    animators.push((delta, t) => {
      // 1. Đài phun nước nghệ thuật phun nước bồng bềnh
      fountainJets.forEach((jet, i) => {
        jet.scale.y = 1 + Math.sin(t * 4.5 + i) * 0.25;
      });
      fLight.color.setHSL(0.55 + Math.sin(t * 0.8) * 0.15, 0.9, 0.6);

      // 2. Cờ lỗ 1, 9, 18 phất phới theo chiều gió
      if (flag9Mesh) flag9Mesh.rotation.y = Math.sin(t * 3.2) * 0.22;
      if (flag1Mesh) flag1Mesh.rotation.y = Math.sin(t * 3.0 + 1.2) * 0.24;

      // 3. Cúp vô địch vàng xoay nhẹ phản chiếu ánh đèn
      if (trophyBowl) trophyBowl.rotation.y += delta * 0.4;
      if (trophyBall) trophyBall.rotation.y += delta * 0.4;

      // 4. Các vòng tròn mục tiêu Target Greens nhấp nháy êm dịu
      targets.forEach((tgt, idx) => {
        // Nhẹ nhàng nổi bật trong đêm
      });
    });

    console.log('[Royal Saigon Golf] Đã dựng thành công Sân Golf Quốc Tế 18 Lỗ rộng lớn & sang trọng!');
  }

  // ========================================================
  // HỆ THỐNG ĐÁNH GOLF TƯƠNG TÁC (INTERACTIVE GOLF GAMEPLAY SYSTEM)
  // ========================================================
  const activeBalls = []; // Quả bóng golf đang bay theo quỹ đạo parabol 3D thực tế

  window.GolfSystem = {
    // Vị trí các điểm tương tác chính
    pubShuttlePos: { x: -4.5, z: 33.2 },     // Điểm đón xe điện tại Quán Nhậu
    resortShuttlePos: { x: -54.0, z: 106.0 }, // Điểm đón xe điện tại Sân Golf
    teeBox1Pos: { x: -115.0, z: 115.0 },     // Tee Box Hố 1
    drivingRangePos: { x: -74.0, z: 124.0 }, // Khoang tập Driving Range
    puttingGreenPos: { x: -110.0, z: 162.0 }, // Green Hố 9 (Island Green)
    hole1GreenPos: { x: -145.0, z: 188.0 },  // Green Hố 1
    clubhouseBarPos: { x: -42.0, z: 122.0 }, // Quầy bar 19th Hole

    isSwinging: false,
    swingTimer: 0,

    findNearest(px, pz) {
      if (this.isSwinging) {
        return { type: 'swinging', key: '...', prompt: 'Đang theo dõi cú đánh golf...' };
      }

      const items = [
        // 1. Xe điện Shuttle hai đầu
        { type: 'pub_shuttle', key: 'F', dist: Math.hypot(px - this.pubShuttlePos.x, pz - this.pubShuttlePos.z), maxDist: 3.2, prompt: 'Lên Xe Điện VIP sang Sân Golf Quốc Tế [F]' },
        { type: 'resort_shuttle', key: 'F', dist: Math.hypot(px - this.resortShuttlePos.x, pz - this.resortShuttlePos.z), maxDist: 3.2, prompt: 'Lên Xe Điện về lại Quán Nhậu Bờ Sông [F]' },

        // 2. Điểm phát bóng Driver Tee Shot
        { type: 'tee_drive', key: 'F', dist: Math.hypot(px - this.teeBox1Pos.x, pz - this.teeBox1Pos.z), maxDist: 3.5, prompt: 'Vung gậy Driver phát bóng Tee Shot Hố 1 [F]' },
        { type: 'range_drive', key: 'F', dist: Math.hypot(px - this.drivingRangePos.x, pz - this.drivingRangePos.z), maxDist: 5.5, prompt: 'Vào khoang tập Swing gậy Driver ngắm cự ly [F]' },

        // 3. Gạt bóng Putting trên Green
        { type: 'putt_hole9', key: 'E', dist: Math.hypot(px - this.puttingGreenPos.x, pz - this.puttingGreenPos.z), maxDist: 4.5, prompt: 'Gạt bóng Putter vào cốc cờ Hố 9 [E]' },
        { type: 'putt_hole1', key: 'E', dist: Math.hypot(px - this.hole1GreenPos.x, pz - this.hole1GreenPos.z), maxDist: 4.5, prompt: 'Gạt bóng Putter vào cốc cờ Hố 1 [E]' },

        // 4. Thư giãn tại Quầy Bar 19th Hole
        { type: 'bar_relax', key: 'E', dist: Math.hypot(px - this.clubhouseBarPos.x, pz - this.clubhouseBarPos.z), maxDist: 4.0, prompt: 'Thưởng thức Cocktail & Rượu vang 19th Hole [E]' },
      ];

      let best = null;
      for (const item of items) {
        if (item.dist <= item.maxDist) {
          if (!best || item.dist < best.dist) best = item;
        }
      }
      return best;
    },

    handleInteract(requestedKey) {
      if (this.isSwinging) return false;
      const px = localPlayerState.x, pz = localPlayerState.z;
      const target = this.findNearest(px, pz);
      if (!target) return false;
      if (requestedKey && target.key !== requestedKey) return false;

      // 1. Xe điện Shuttle từ Quán Nhậu sang Sân Golf
      if (target.type === 'pub_shuttle') {
        playGolfSound('putt');
        if (typeof setTicker === 'function') {
          setTicker('🚗 Xe điện VIP đang đưa bạn qua Cầu Đi Bộ sang Sân Golf Quốc Tế...');
        }
        if (window.Features && Features.toast) {
          Features.toast('⛳ Đang di chuyển sang Sân Golf Hoàng Gia Royal Saigon!', 'info', 3000);
        }
        // Hiệu ứng đưa người chơi qua sân golf
        setTimeout(() => {
          localPlayerState.x = -52.0;
          localPlayerState.z = 106.0;
          localPlayerState.ry = 0;
          if (localCharacter) localCharacter.mesh.position.set(-52.0, 0.35, 106.0);
          playGolfSound('cheer_fanfare');
          if (typeof setTicker === 'function') {
            setTicker('🌟 Chào mừng đại gia đến Sân Golf Quốc Tế Royal Saigon & Country Club!');
          }
          if (window.Features && Features.toast) {
            Features.toast('🏌️ Đã đến Sân Golf Quốc Tế 18 Lỗ! Không gian bao la xanh mướt tuyệt đẹp.', 'success', 5000);
          }
        }, 600);
        return true;
      }

      // 2. Xe điện Shuttle từ Sân Golf về lại Quán Nhậu
      if (target.type === 'resort_shuttle') {
        playGolfSound('putt');
        if (typeof setTicker === 'function') {
          setTicker('🚗 Xe điện đang đưa bạn về lại Bến Quán Nhậu Bờ Sông...');
        }
        setTimeout(() => {
          localPlayerState.x = -4.0;
          localPlayerState.z = 31.0;
          localPlayerState.ry = Math.PI;
          if (localCharacter) localCharacter.mesh.position.set(-4.0, 0.32, 31.0);
          if (typeof setTicker === 'function') {
            setTicker('🍻 Đã trở về Quán Nhậu Bờ Sông! Tiếp tục 1, 2, 3 DÔ cùng anh em!');
          }
        }, 600);
        return true;
      }

      // 3. Vung gậy Driver phát bóng Tee Shot hoặc Driving Range
      if (target.type === 'tee_drive' || target.type === 'range_drive') {
        this.performDriverShot(target.type === 'range_drive');
        return true;
      }

      // 4. Gạt bóng Putter trên Green
      if (target.type === 'putt_hole9' || target.type === 'putt_hole1') {
        this.performPuttingShot(target.type === 'putt_hole9' ? 'Hố 9' : 'Hố 1');
        return true;
      }

      // 5. Quầy Bar 19th Hole
      if (target.type === 'bar_relax') {
        playGolfSound('cheer_fanfare');
        if (selfMember) {
          selfMember.drunk_level = Math.max(0, selfMember.drunk_level - 30);
          selfMember.status = 'tinh_tao';
        }
        if (typeof setTicker === 'function') {
          setTicker('🍸 Thưởng thức ly Champagne Moët & Chandon tại 19th Hole Lounge ngắm Landmark 81 cực chill!');
        }
        if (window.Features && Features.toast) {
          Features.toast('🥂 Đại gia thưởng thức đồ uống thượng hạng! Giảm 30% say xỉn. +45 XP.', 'success', 4000);
        }
        if (typeof sendAction === 'function') {
          sendAction({ action: 'award', xp: 45, reason: '19th Hole Lounge VIP' });
        }
        return true;
      }

      return false;
    },

    // THỰC HIỆN CÚ SWING DRIVER ĐỈNH CAO
    performDriverShot(isDrivingRange = false) {
      this.isSwinging = true;

      // Hướng bắn bóng: hướng về phía trước sân golf
      const shootDirX = isDrivingRange ? 0 : -0.55;
      const shootDirZ = isDrivingRange ? 1.0 : 0.85;
      const dirLen = Math.hypot(shootDirX, shootDirZ);
      const nx = shootDirX / dirLen, nz = shootDirZ / dirLen;

      // Xoay nhân vật vào tư thế đánh golf
      if (localCharacter) {
        localPlayerState.ry = Math.atan2(nx, nz) - Math.PI / 2;
        // Hoạt ảnh gập người và vung hai cánh tay
        if (localCharacter.torso) localCharacter.torso.rotation.x = 0.25;
        if (localCharacter.rightArm) localCharacter.rightArm.rotation.set(-1.2, 0, 0.4);
        if (localCharacter.leftArm) localCharacter.leftArm.rotation.set(-1.2, 0, -0.2);
      }

      // Phát âm thanh tiếng vụt gió Whoosh + TINK kim loại
      playGolfSound('swing_drive');

      // Tạo quả bóng golf 3D bay vút lên trời
      const startX = localPlayerState.x + nx * 0.4;
      const startY = 0.5;
      const startZ = localPlayerState.z + nz * 0.4;

      const ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
      );
      ballMesh.position.set(startX, startY, startZ);
      scene.add(ballMesh);

      // Vệt sáng lấp lánh sau quả bóng (Neon Ball Trail)
      const trailMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        linewidth: 2
      });
      const trailPts = [ballMesh.position.clone()];
      const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
      const trailLine = new THREE.Line(trailGeo, trailMat);
      scene.add(trailLine);

      // Tính toán vận tốc bóng bay khí động học
      const powerPct = Math.floor(92 + Math.random() * 8); // 92% - 100%
      const carryYards = Math.floor(255 + Math.random() * 45); // 255 - 300 Yards!
      const flightDuration = 2.4; // 2.4 giây bóng bay trên không

      const vx = nx * (carryYards * 0.35);
      const vz = nz * (carryYards * 0.35);
      const vy = 16.5 + Math.random() * 2.5; // Bay bổng lên độ cao 30 mét

      activeBalls.push({
        mesh: ballMesh,
        trailLine,
        trailPts,
        trailGeo,
        pos: new THREE.Vector3(startX, startY, startZ),
        vel: new THREE.Vector3(vx, vy, vz),
        gravity: 12.8,
        t: 0,
        maxT: flightDuration,
        bounces: 0,
        carryYards,
        powerPct,
        isRange: isDrivingRange
      });

      // Kết thúc hoạt ảnh vung gậy trên nhân vật sau 0.6s
      setTimeout(() => {
        if (localCharacter) {
          if (localCharacter.torso) localCharacter.torso.rotation.set(0, 0, 0);
          if (localCharacter.rightArm) localCharacter.rightArm.rotation.set(0, 0, 0);
          if (localCharacter.leftArm) localCharacter.leftArm.rotation.set(0, 0, 0.22);
        }
        this.isSwinging = false;
      }, 700);

      // Hiển thị HUD cú đánh siêu ngầu
      this.showShotHud('DRIVER TEE SHOT', powerPct, carryYards);
    },

    // THỰC HIỆN CÚ GẠT BÓNG PUTTING
    performPuttingShot(holeName) {
      playGolfSound('putt');
      if (typeof setTicker === 'function') {
        setTicker(`⛳ Đang căn chỉnh đường lăn bóng Putter trên Green ${holeName}...`);
      }

      if (localCharacter && localCharacter.torso) {
        localCharacter.torso.rotation.x = 0.35;
        setTimeout(() => { if (localCharacter && localCharacter.torso) localCharacter.torso.rotation.x = 0; }, 600);
      }

      setTimeout(() => {
        playGolfSound('cup_drop');
        playGolfSound('cheer_fanfare');
        if (typeof setTicker === 'function') {
          setTicker(`🎉 BIRDIE! Cú gạt bóng Putter chuẩn xác 100% lọt ngay vào cốc cờ ${holeName}! Thật đẳng cấp!`);
        }
        if (window.Features && Features.toast) {
          Features.toast(`🏆 HOLE IN! Gạt bóng vào lỗ ${holeName} thành công rực rỡ! +40 XP Golf Pro.`, 'success', 5000);
        }
        if (typeof sendAction === 'function') {
          sendAction({ action: 'award', xp: 40, reason: 'Putt Into Cup' });
        }
      }, 750);
    },

    // HIỂN THỊ THẺ KẾT QUẢ CÚ ĐÁNH GOLF
    showShotHud(type, power, yards) {
      let hud = document.getElementById('golfShotHud');
      if (!hud) {
        hud = document.createElement('div');
        hud.id = 'golfShotHud';
        hud.className = 'golf-shot-hud';
        document.body.appendChild(hud);
      }

      const speedMph = Math.floor(yards * 0.58);
      const isAwesome = yards >= 270;

      hud.innerHTML = `
        <div class="golf-hud-header">
          <span class="golf-hud-logo">⛳ ROYAL SAIGON GOLF</span>
          <span class="golf-hud-badge">${type}</span>
        </div>
        <div class="golf-hud-yards">${yards} <small>YARDS</small></div>
        <div class="golf-hud-grid">
          <div class="golf-grid-item">
            <span class="lbl">LỰC VUNG</span>
            <span class="val text-gold">${power}%</span>
          </div>
          <div class="golf-grid-item">
            <span class="lbl">TỐC ĐỘ BÓNG</span>
            <span class="val">${speedMph} mph</span>
          </div>
          <div class="golf-grid-item">
            <span class="lbl">ĐIỂM RƠI</span>
            <span class="val text-green">${isAwesome ? '🎯 ON FAIRWAY' : '⛳ CENTER'}</span>
          </div>
        </div>
        <div class="golf-hud-footer">
          ${isAwesome ? '⭐ CÚ SWING SIÊU ĐẲNG! +60 XP • GIẢI 25% CỒN' : '✨ CÚ PHÁT BÓNG ĐẸP MẮT! +45 XP'}
        </div>
      `;

      hud.style.display = 'block';
      hud.classList.remove('fade-out');

      // Tặng XP và giải cồn bia rượu
      if (selfMember) {
        selfMember.drunk_level = Math.max(0, selfMember.drunk_level - 25);
      }
      if (typeof sendAction === 'function') {
        sendAction({ action: 'award', xp: isAwesome ? 60 : 45, reason: 'Golf Driver Swing' });
      }

      if (typeof setTicker === 'function') {
        setTicker(`🏌️ CÚ DRIVER ĐỈNH CAO: ${yards} YARDS! Bóng bay xé gió qua sông Sài Gòn hướng thẳng về Landmark 81!`);
      }

      // Tự tắt sau 4.5 giây
      if (this._hudTimeout) clearTimeout(this._hudTimeout);
      this._hudTimeout = setTimeout(() => {
        hud.classList.add('fade-out');
        setTimeout(() => { hud.style.display = 'none'; }, 400);
      }, 4500);
    },

    // CẬP NHẬT HOẠT ẢNH BÓNG BAY
    update(delta, t) {
      for (let i = activeBalls.length - 1; i >= 0; i--) {
        const b = activeBalls[i];
        b.t += delta;

        // Cập nhật vị trí
        b.vel.y -= b.gravity * delta;
        b.pos.x += b.vel.x * delta;
        b.pos.y += b.vel.y * delta;
        b.pos.z += b.vel.z * delta;

        // Chạm đất
        if (b.pos.y <= 0.42) {
          b.pos.y = 0.42;
          b.vel.y = -b.vel.y * 0.45; // Nảy lên
          b.vel.x *= 0.65;
          b.vel.z *= 0.65;
          b.bounces++;
          if (b.bounces === 1) {
            playGolfSound('putt'); // Tiếng chạm đất
          }
        }

        b.mesh.position.copy(b.pos);

        // Cập nhật đường tia sáng sau quả bóng
        if (b.trailPts.length < 35) {
          b.trailPts.push(b.pos.clone());
          b.trailGeo.setFromPoints(b.trailPts);
        }

        // Hết thời gian bay: dọn dẹp bóng
        if (b.t >= b.maxT + 2.0 || b.bounces >= 4) {
          scene.remove(b.mesh);
          scene.remove(b.trailLine);
          if (b.mesh.geometry) b.mesh.geometry.dispose();
          if (b.trailGeo) b.trailGeo.dispose();
          activeBalls.splice(i, 1);
        }
      }
    }
  };

  // Khởi chạy khi môi trường 3D sẵn sàng
  if (window.PubLoader && PubLoader.defer) {
    PubLoader.defer(buildGolfWorld, 'buildGolfWorld');
  } else {
    setTimeout(buildGolfWorld, 1000);
  }

  // Đăng ký cập nhật nhịp đập khung hình
  if (window.Features && Features.addTick) {
    Features.addTick((delta, t) => {
      for (const a of animators) a(delta, t);
      if (window.GolfSystem) window.GolfSystem.update(delta, t);
    });
  }

  // Kết nối nút bấm nhanh nếu có
  function initGolfButtons() {
    const golfBtn = document.getElementById('golfBtn');
    if (golfBtn) {
      golfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Di chuyển ngay sang sân golf hoặc về quán
        if (localPlayerState && localPlayerState.z > 80) {
          // Đang ở sân golf -> về quán
          localPlayerState.x = -4.0;
          localPlayerState.z = 31.0;
          localPlayerState.ry = Math.PI;
          if (localCharacter) localCharacter.mesh.position.set(-4.0, 0.32, 31.0);
          if (window.Features && Features.toast) Features.toast('🍻 Đã trở về Bến Quán Nhậu Bờ Sông!', 'info', 3000);
        } else {
          // Đang ở quán -> sang sân golf
          localPlayerState.x = -52.0;
          localPlayerState.z = 106.0;
          localPlayerState.ry = 0;
          if (localCharacter) localCharacter.mesh.position.set(-52.0, 0.35, 106.0);
          playGolfSound('cheer_fanfare');
          if (window.Features && Features.toast) Features.toast('⛳ Đã đến Sân Golf Quốc Tế Royal Saigon 18 Lỗ!', 'success', 4000);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initGolfButtons);
  if (window.PubLoader && PubLoader.defer) PubLoader.defer(initGolfButtons, 'initGolfButtons');

})();

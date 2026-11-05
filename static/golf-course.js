// ========================================================
// ROYAL SAIGON GOLF & COUNTRY CLUB
// Sân Golf Quốc Tế 18 Lỗ Bán Đảo Sông Sài Gòn & View Landmark 81
// Bao gồm:
//  - Fairway & Rough uốn lượn rộng 165m x 130m, cỏ nhung phát sáng cao cấp ban đêm
//  - Hệ thống đèn pha cao áp sân golf ban đêm chuyên nghiệp (Championship Stadium Floodlights)
//  - Cổng chào Hoàng Gia 24K rực rỡ đón khách ngay chân Cầu Đi Bộ
//  - 3 Bẫy cát Sand Bunkers uốn cong tự nhiên
//  - Hồ nước bẫy nước (Water Hazard) với đài phun nước phát sáng đổi màu
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

  function getScene() {
    if (window.scene) return window.scene;
    if (typeof scene !== 'undefined' && scene) return scene;
    return null;
  }

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    const target = parent || getScene();
    if (target) target.add(m);
    return m;
  }

  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
    m.position.set(x, y, z);
    const target = parent || getScene();
    if (target) target.add(m);
    return m;
  }

  function obstacle(x, z, w, d) {
    if (window.pubDetails && window.pubDetails.obstacles) {
      window.pubDetails.obstacles.push({ x, z, w, d });
    }
  }

  // Khai báo ngay WORLD_BOUNDS.golf để chống kẹp z khi người chơi bấm dịch chuyển
  const golfBounds = {
    constrain(x, z) {
      if (x >= -63 && x <= -40 && z < 96.5) {
        return null;
      }
      if (x >= -195 && x <= -30 && z >= 96.0 && z <= 225) {
        if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
          if (Math.abs(x - (-110)) < 2.0) {
            return { x: -110, z };
          }
          const distToCenter = Math.hypot(x - (-110), z - 162);
          if (distToCenter > 6.4) {
            const ang = Math.atan2(z - 162, x - (-110));
            return { x: -110 + Math.cos(ang) * 17.5, z: 162 + Math.sin(ang) * 17.5 };
          }
        }
        return {
          x: Math.max(-193, Math.min(-32, x)),
          z: Math.max(96.0, Math.min(223, z))
        };
      }
      return null;
    },
    groundY(x, z) {
      if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
        const distIsland = Math.hypot(x - (-110), z - 162);
        if (distIsland < 6.4) return 0.52;
        if (Math.abs(x - (-110)) < 2.0) return 0.58;
        return 0.16;
      }
      const ps = window.localPlayerState || (typeof localPlayerState !== 'undefined' ? localPlayerState : null);
      if (x >= -85 && x <= -63 && z >= 115 && z <= 129 && (ps && ps.y > 2.5)) {
        return 4.65;
      }
      if (x >= -195 && x <= -30 && z >= 96.0 && z <= 225) {
        return 0.35;
      }
      return null;
    }
  };
  if (window.WORLD_BOUNDS) {
    window.WORLD_BOUNDS.golf = golfBounds;
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
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.12);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.22);
      filter.Q.value = 3.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.23);

      // 2. Tiếng chạm mặt gậy kim loại đanh chắc TINK! (High-pitch Titan Impact)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const impactGain = ctx.createGain();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(2600, now + 0.09);
      osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
      osc2.frequency.setValueAtTime(4200, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(800, now + 0.3);
      impactGain.gain.setValueAtTime(0.65, now + 0.09);
      impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
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
    if (window._golfWorldBuilt) return;
    const targetScene = getScene();
    if (!targetScene) {
      setTimeout(buildGolfWorld, 150);
      return;
    }
    window._golfWorldBuilt = true;

    const golfGroup = new THREE.Group();
    golfGroup.name = 'RoyalSaigonGolfResort';
    targetScene.add(golfGroup);

    // Bảng vật liệu chính của sân golf (Có emissive tự phát sáng nhẹ để rực rỡ lung linh trong đêm)
    const fairwayMat = std(0x22c55e, { roughness: 0.80, metalness: 0.05, emissive: 0x05482e, emissiveIntensity: 0.38 }); // Cỏ Fairway xanh tươi
    const roughMat = std(0x166534, { roughness: 0.90, emissive: 0x064e3b, emissiveIntensity: 0.30 });                     // Cỏ Rough xanh thẫm
    const greenMat = std(0x10b981, { roughness: 0.60, emissive: 0x047857, emissiveIntensity: 0.45 });                     // Thảm cỏ gạt Putting Green mượt mà
    const sandMat = std(0xfef08a, { roughness: 0.95, metalness: 0.05, emissive: 0x854d0e, emissiveIntensity: 0.26 });    // Cát thạch anh mịn màu vàng óng
    const waterMat = std(0x0284c7, { roughness: 0.08, metalness: 0.35, emissive: 0x0369a1, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
    const darkSlate = std(0x0f172a, { roughness: 0.5 });
    const goldMat = std(0xf59e0b, { metalness: 0.9, roughness: 0.2, emissive: 0xd97706, emissiveIntensity: 0.25 });
    const whiteEnamel = std(0xf8fafc, { roughness: 0.25, emissive: 0x94a3b8, emissiveIntensity: 0.1 });
    const teakWood = std(0x78350f, { roughness: 0.75 });

    // ----------------------------------------------------
    // HỆ THỐNG CHIẾU SÁNG BAN ĐÊM ĐỈNH CAO (CHAMPIONSHIP NIGHT LIGHTING)
    // ----------------------------------------------------
    // Nguồn sáng định hướng bao phủ toàn bộ sân golf
    const golfSun = new THREE.DirectionalLight(0xf0fdf4, 1.4);
    golfSun.position.set(-80, 50, 130);
    golfSun.target.position.set(-110, 0, 160);
    golfGroup.add(golfSun);
    golfGroup.add(golfSun.target);

    // Ánh sáng bán cầu làm sáng bừng thảm cỏ xanh
    const golfHemi = new THREE.HemisphereLight(0xdcfce7, 0x064e3b, 1.6);
    golfGroup.add(golfHemi);

    // Cột đèn pha cao áp sân golf ban đêm 16m chuyên dụng
    function createStadiumFloodlight(x, z, rotY = 0) {
      const flGroup = new THREE.Group();
      flGroup.position.set(x, 0, z);

      // Cột thép cao áp 16m
      cyl(0.35, 0.5, 16, darkSlate, 0, 8, 0, flGroup);
      obstacle(x, z, 1.2, 1.2);

      // Giàn đỡ đèn ngang 4.5m
      const crossbar = box(4.5, 0.35, 0.6, darkSlate, 0, 15.6, 0, flGroup);
      crossbar.rotation.y = rotY;

      // 4 Chóa đèn LED siêu sáng trắng tuyết
      for (let bi = -1.8; bi <= 1.8; bi += 1.2) {
        box(0.9, 0.65, 0.45, darkSlate, bi * Math.cos(rotY), 15.6, bi * Math.sin(rotY), flGroup);
        const face = box(0.82, 0.55, 0.05, new THREE.MeshBasicMaterial({ color: 0xffffff }), bi * Math.cos(rotY), 15.6, bi * Math.sin(rotY) + 0.24, flGroup);
      }

      // Đèn PointLight tỏa sáng mạnh mẽ xuống mặt cỏ
      const floodLight = new THREE.PointLight(0xfffbeb, 3.2, 55, 1.1);
      floodLight.position.set(0, 15.2, 0.5);
      flGroup.add(floodLight);

      golfGroup.add(flGroup);
    }

    // 8 Cụm đèn pha cao áp bố trí vòng quanh sân golf
    const floodlightSpots = [
      [-52, 103, 0],         // Ngay Cổng chào & Bến đón xe điện
      [-86, 122, 0],         // Driving Range cánh trái
      [-62, 122, 0],         // Driving Range cánh phải
      [-115, 116, 0.4],      // Bệ phát bóng Tee Box Hố 1
      [-115, 158, 0],        // Giữa Fairway chính
      [-110, 168, -0.3],     // Island Green Hố 9 & Hồ nước
      [-145, 188, 0.2],      // Green Hố 1
      [-38, 122, -0.5]       // Clubhouse & 19th Hole Lounge
    ];
    floodlightSpots.forEach(([fx, fz, fry]) => createStadiumFloodlight(fx, fz, fry));

    // ----------------------------------------------------
    // 1. NỀN TỔNG THỂ SÂN GOLF RỘNG 165M x 130M (x: -195..-30, z: 96..225)
    // ----------------------------------------------------
    const mainLawn = box(165, 0.35, 129, roughMat, -112, 0.16, 160, golfGroup);
    mainLawn.receiveShadow = true;

    // Đường Fairway chính Hole 1 & Hole 18 uốn lượn (dải cỏ mượt mà cắt sọc đan xen)
    for (let fz = 105; fz <= 218; fz += 18) {
      const stripeMat = (Math.floor(fz / 18) % 2 === 0) ? fairwayMat : std(0x16a34a, { roughness: 0.8, emissive: 0x05482e, emissiveIntensity: 0.35 });
      const stripe = box(44, 0.38, 17.5, stripeMat, -115, 0.18, fz, golfGroup);
      stripe.receiveShadow = true;
    }

    // ----------------------------------------------------
    // 2. KHU VỰC CỔNG CHÀO HOÀNG GIA & ĐẠI LỘ ĐÓN KHÁCH (x: -52, z: 96.5..118)
    // NỐI LIỀN TRỰC TIẾP CHÂN CẦU ĐI BỘ BẠCH ĐẰNG (x = -50, z = 96.5)
    // ----------------------------------------------------
    // Đại lộ lát đá cẩm thạch trắng đón khách bước ra từ cầu đi bộ
    const grandBoulevard = box(16, 0.38, 22, std(0xe2e8f0, { roughness: 0.55, emissive: 0x334155, emissiveIntensity: 0.15 }), -52, 0.19, 107.5, golfGroup);
    grandBoulevard.receiveShadow = true;

    // Thảm đỏ hoàng gia trải dài đón khách từ chân cầu vào sân golf
    const redCarpet = box(4.5, 0.41, 22, std(0xb91c1c, { roughness: 0.6, emissive: 0x881337, emissiveIntensity: 0.35 }), -52, 0.21, 107.5, golfGroup);

    // Cổng chào Hoành Tráng mạ vàng 24K phong cách Resort 5 Sao ngay trước mặt cầu đi bộ
    const gatePillars = [-60, -44];
    gatePillars.forEach(px => {
      // Cột chính đen cẩm thạch
      cyl(0.65, 0.75, 5.2, darkSlate, px, 2.6, 101.5, golfGroup);
      // Đai vàng hoàng gia
      cyl(0.78, 0.78, 0.45, goldMat, px, 4.8, 101.5, golfGroup);
      // Đèn lồng vàng đỉnh cột
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), glow(0xfef08a));
      lantern.position.set(px, 5.4, 101.5);
      golfGroup.add(lantern);
      const lLight = new THREE.PointLight(0xfef08a, 1.8, 12);
      lLight.position.set(px, 5.4, 101.5);
      golfGroup.add(lLight);
      obstacle(px, 101.5, 1.4, 1.4);
    });

    // Dầm cổng ngang mạ vàng vắt ngang
    box(18, 0.75, 1.2, darkSlate, -52, 5.2, 101.5, golfGroup);
    box(18.2, 0.15, 1.3, goldMat, -52, 4.8, 101.5, golfGroup);
    box(4.5, 0.6, 0.3, goldMat, -52, 5.8, 101.5, golfGroup); // Vương miện vàng đỉnh cổng

    // Biển hiệu 3D lớn phát sáng rực rỡ mặt trước cổng chào hướng thẳng về Cầu Đi Bộ
    const mainSign = signPlane([
      ['⛳ ROYAL SAIGON GOLF & COUNTRY CLUB ⛳', 58, 52, true],
      ['SÂN GOLF QUỐC TẾ 18 LỖ • VIP DRIVING RANGE • 19th HOLE LOUNGE', 28, 114, false]
    ], 16.5, 2.2, 1024, 180, '#fef08a', '#032014', '#10b981');
    mainSign.position.set(-52, 3.8, 100.8);
    mainSign.rotation.y = Math.PI; // Quay mặt thẳng về hướng người đi qua cầu
    golfGroup.add(mainSign);

    // Biển chỉ dẫn hướng đi phát sáng neon
    const guideSign = signPlane([
      ['⬅️ SÂN TẬP DRIVING RANGE', 36, 45, true],
      ['⬆️ FAIRWAY HOLE 1 (PAR 4)', 36, 85, true],
      ['➡️ 19th HOLE LOUNGE & PRO SHOP', 34, 125, true]
    ], 3.8, 2.2, 512, 256, '#fef08a', '#064e3b', '#f59e0b');
    guideSign.position.set(-47.5, 2.0, 103.5);
    guideSign.rotation.y = Math.PI;
    golfGroup.add(guideSign);

    // ----------------------------------------------------
    // 3. 5-STAR LUXURY CLUBHOUSE & 19TH HOLE LOUNGE (x: -42, z: 122)
    // ----------------------------------------------------
    const chGroup = new THREE.Group();
    chGroup.position.set(-42, 0, 122);

    // Sàn gỗ Teak ngoài trời bao quanh Clubhouse
    const chDeck = box(19, 0.42, 22, teakWood, 0, 0.21, 0, chGroup);
    chDeck.receiveShadow = true;

    // Tòa nhà chính: Tường kính Panorama nhìn ra Fairway & Sông Sài Gòn
    const chGlass = box(14, 5.2, 14, std(0x0f172a, { transparent: true, opacity: 0.4, roughness: 0.1 }), 0, 2.7, 0, chGroup);
    // Khung cột thép vàng hiện đại
    for (const cx of [-6.8, 0, 6.8]) {
      for (const cz of [-6.8, 6.8]) {
        cyl(0.35, 0.35, 5.6, goldMat, cx, 2.8, cz, chGroup);
        obstacle(-42 + cx, 122 + cz, 0.8, 0.8);
      }
    }
    // Mái che kiểu vát giật cấp sang trọng
    box(16, 0.65, 16.5, darkSlate, 0, 5.4, 0, chGroup);
    box(16.2, 0.12, 16.7, goldMat, 0, 5.1, 0, chGroup);
    obstacle(-42, 122, 11, 12); // Chỉ cản lõi nhà chính, chừa hiên gỗ đi lại thoải mái

    // Biển hiệu "THE 19th HOLE LOUNGE & PRO SHOP"
    const loungeSign = signPlane([
      ['THE 19th HOLE VIP LOUNGE', 60, 52, true],
      ['Champagne • Whisky • Craft Beer • Pro Shop', 28, 108, false]
    ], 9.5, 1.8, 512, 160, '#fde047', '#0f172a');
    loungeSign.position.set(0, 4.2, 7.1);
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
    // Chỉ chặn tường sau và 2 vách bên hông, chừa mặt tiền mở hoàn toàn để bước vào thảm tập
    obstacle(-74, 115.8, 24, 1.2);   // Tường sau
    obstacle(-85.5, 122, 1.2, 12);   // Vách trái
    obstacle(-62.5, 122, 1.2, 12);   // Vách phải

    // 6 Thảm tập phát bóng (Hitting Mats) với Tee cao su & Rổ bóng golf
    const bays = [-8.5, -3.5, 1.5, 6.5];
    bays.forEach((bx, idx) => {
      // Thảm cỏ tập xanh sẫm
      box(2.2, 0.08, 3.2, std(0x065f46, { roughness: 0.9, emissive: 0x064e3b, emissiveIntensity: 0.35 }), bx, 0.48, 2.5, drGroup);
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
          const flood = new THREE.PointLight(0xfff7ed, 2.2, 55);
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
    const fLight = new THREE.PointLight(0x38bdf8, 2.5, 18);
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
    if (window.Veg && window.Veg.makeTree) {
      // Hàng cọ hoàng gia (Royal Palms) dọc lối đi và bờ sông
      const palmCoords = [
        [-62, 112], [-62, 122], [-62, 132],
        [-42, 112], [-42, 122], [-42, 132],
        [-100, 140], [-95, 145], [-92, 155], [-94, 168],
        [-130, 140], [-135, 150], [-138, 165],
        [-175, 125], [-178, 150], [-175, 175], [-172, 195]
      ];
      palmCoords.forEach(([tx, tz], i) => {
        const tree = window.Veg.makeTree(i % 3 === 0 ? 'palm' : (i % 2 === 0 ? 'tall' : 'flame'), 880 + i, 1.1);
        tree.position.set(tx, 0.32, tz);
        golfGroup.add(tree);
        obstacle(tx, tz, 1.2, 1.2);
      });
    }

    // Đèn cột sân golf thấp (Bollard Path Lights) dọc lối đi xe điện
    for (let bz = 104; bz <= 145; bz += 6.5) {
      for (const bx of [-61, -43]) {
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
      const bHeadlight = new THREE.PointLight(0xfffbeb, 1.5, 14);
      bHeadlight.position.set(0, 0.75, 1.8);
      buggy.add(bHeadlight);

      // Kính chắn gió phía trước gập được
      const windshield = box(1.5, 0.75, 0.04, std(0xa5f3fc, { transparent: true, opacity: 0.45 }), 0, 1.25, 0.38, buggy);
      windshield.rotation.x = -0.15;

      // Ghế ngồi bọc da cao cấp hàng trước & sau
      box(1.4, 0.2, 0.55, leather, 0, 0.68, 0.05, buggy); // Đệm ngồi
      box(1.4, 0.45, 0.15, leather, 0, 0.98, -0.22, buggy); // Tựa lưng

      // Vô lăng thể thao & bảng táp-lô hiển thị GPS sân golf
      box(0.9, 0.25, 0.4, darkSlate, 0, 0.92, 0.42, buggy);
      const steer = cyl(0.18, 0.18, 0.04, darkSlate, 0.32, 1.05, 0.32, buggy, 12);
      steer.rotation.x = 0.5;

      // Mái che nắng che mưa & Cột chống thép mạ chrome
      for (const px of [-0.72, 0.72]) {
        cyl(0.025, 0.025, 1.4, chrome, px, 1.3, -0.9, buggy);
        cyl(0.025, 0.025, 1.4, chrome, px, 1.3, 0.45, buggy);
      }
      box(1.65, 0.12, 2.7, whiteEnamel, 0, 2.05, -0.2, buggy);

      // Giá để túi gậy golf phía sau xe (Golf Bag Carrier)
      box(1.4, 0.3, 0.65, darkSlate, 0, 0.6, -1.05, buggy);
      // 2 Túi gậy golf da cao cấp kèm bộ gậy Driver, Iron, Putter
      const bagColors = [0x1e3a8a, 0xb91c1c];
      [-0.4, 0.4].forEach((gx, idx) => {
        // Thân túi golf
        cyl(0.18, 0.18, 0.9, std(bagColors[idx], { roughness: 0.5 }), gx, 1.05, -1.05, buggy);
        // Đầu bọc gậy Driver titan mạ vàng nhô ra
        for (let k = 0; k < 3; k++) {
          const club = cyl(0.015, 0.015, 0.45, chrome, gx + (k - 1) * 0.08, 1.55, -1.05, buggy);
          club.rotation.z = (k - 1) * 0.25;
          const head = box(0.08, 0.05, 0.12, goldMat, gx + (k - 1) * 0.15, 1.75, -1.05, buggy);
        }
      });

      return buggy;
    }

    // 1. Xe điện đưa đón VIP đón khách ngay tại cổng chào sân golf
    const welcomeBuggy = createGolfBuggy(0x064e3b, 0xfacc15); // Màu xanh lục bảo viền vàng hoàng gia
    welcomeBuggy.position.set(-49.0, 0.16, 104.5);
    welcomeBuggy.rotation.y = Math.PI; // Đầu xe quay về hướng đón khách từ cầu đi bộ
    golfGroup.add(welcomeBuggy);
    obstacle(-49.0, 104.5, 2.0, 3.2);

    // 2. Xe điện đưa đón tại Bến Quán Nhậu (Bờ Nam sông Sài Gòn)
    const pubShuttleBuggy = createGolfBuggy(0xf8fafc, 0x10b981);
    pubShuttleBuggy.position.set(-9.5, 0.16, 28.5);
    pubShuttleBuggy.rotation.y = -Math.PI / 2;
    const scShut = getScene();
    if (scShut) scShut.add(pubShuttleBuggy);
    obstacle(-9.5, 28.5, 2.0, 3.2);

    // Biển đón xe điện Quán Nhậu Bờ Sông
    const pubShuttleSign = signPlane([
      ['VIP SHUTTLE BUGGY', 52, 45, true],
      ['Đón sang Sân Golf Hoàng Gia [F]', 28, 108, false]
    ], 3.8, 1.6, 512, 180, '#fef08a', '#064e3b');
    pubShuttleSign.position.set(-9.5, 2.3, 27.2);
    if (scShut) scShut.add(pubShuttleSign);

    // 3. Đội xe Golf Buggy đậu tại Bãi xe Clubhouse
    for (let i = 0; i < 3; i++) {
      const bColor = i === 0 ? 0xf8fafc : (i === 1 ? 0x0284c7 : 0xe11d48);
      const b = createGolfBuggy(bColor, 0xfacc15);
      b.position.set(-58, 0.16, 114 + i * 4.2);
      b.rotation.y = Math.PI / 2;
      golfGroup.add(b);
      obstacle(-58, 114 + i * 4.2, 3.2, 2.0);
    }

    // ----------------------------------------------------
    // 10. NHÂN VẬT GOLFER & CADDY CHIBI HOẠT BÁT
    // ----------------------------------------------------
    function makeGolferNPC(skinHex, shirtHex, pantsHex, x, z, ry, isCaddy = false) {
      const gGroup = new THREE.Group();
      gGroup.position.set(x, 0.32, z);
      gGroup.rotation.y = ry;

      const skin = std(skinHex, { roughness: 0.7 });
      const shirt = std(shirtHex, { roughness: 0.6 });
      const pants = std(pantsHex, { roughness: 0.7 });
      const shoe = std(0x18181b, { roughness: 0.8 });

      // Chân & Giày thể thao
      for (const lx of [-0.14, 0.14]) {
        cyl(0.08, 0.08, 0.45, pants, lx, 0.22, 0, gGroup);
        box(0.14, 0.1, 0.26, shoe, lx, 0.05, 0.05, gGroup);
      }
      // Thân áo Polo thể thao
      box(0.48, 0.55, 0.28, shirt, 0, 0.65, 0, gGroup);
      // Đầu & Mũ lưỡi trai golf
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), skin);
      head.position.set(0, 1.1, 0);
      gGroup.add(head);
      // Mũ lưỡi trai (Golf Cap)
      const cap = cyl(0.26, 0.26, 0.12, std(shirtHex), 0, 1.25, 0, gGroup);
      const visor = box(0.3, 0.03, 0.2, std(shirtHex), 0, 1.22, 0.24, gGroup);

      // Caddy đeo túi gậy golf
      if (isCaddy) {
        const bag = cyl(0.14, 0.14, 0.75, std(0x15803d), -0.28, 0.72, -0.15, gGroup);
        bag.rotation.z = -0.3;
      }

      golfGroup.add(gGroup);
      obstacle(x, z, 0.8, 0.8);
      return gGroup;
    }

    // Caddy xinh đẹp chào đón khách ngay tại thảm đỏ Cổng chào
    const welcomeCaddy = makeGolferNPC(0xfcd34d, 0xf8fafc, 0x10b981, -46.5, 104.5, Math.PI, true);

    // Caddy tại Tee Box 1
    const caddy1 = makeGolferNPC(0xfcd34d, 0xf8fafc, 0x10b981, -113.5, 114.2, -1.8, true);
    // Golfer đại gia đang tập vung gậy
    const golfer1 = makeGolferNPC(0xd49b73, 0x0284c7, 0x1e293b, -76.0, 122.5, 0.1, false);

    // ----------------------------------------------------
    // KẾT NỐI VÀO WORLD_BOUNDS (CHO PHÉP ĐI LẠI TỰ DO TOÀN SÂN GOLF)
    // ----------------------------------------------------
    if (window.WORLD_BOUNDS) {
      window.WORLD_BOUNDS.golf = golfBounds;
    }
    if (false) {
      window.WORLD_BOUNDS.golf = {
        constrain(x, z) {
          // Nếu đang đi trên hành lang kết nối Cầu Đi Bộ (-63..-40, z < 96.5) thì nhường quyền cho bridge.constrain
          if (x >= -63 && x <= -40 && z < 96.5) {
            return null;
          }
          // Khu vực Sân Golf Quốc Tế bờ bắc: x từ -195 đến -30, z từ 96.0 đến 225
          if (x >= -195 && x <= -30 && z >= 96.0 && z <= 225) {
            // Không để người chơi lọt vào giữa hồ nước bẫy nước sâu
            if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
              // Cầu gỗ cho phép đi qua
              if (Math.abs(x - (-110)) < 2.0) {
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
              x: Math.max(-193, Math.min(-32, x)),
              z: Math.max(96.0, Math.min(223, z))
            };
          }
          return null;
        },
        groundY(x, z) {
          // Khu vực hồ bẫy nước
          if (x >= -126 && x <= -94 && z >= 146 && z <= 178) {
            const distIsland = Math.hypot(x - (-110), z - 162);
            if (distIsland < 6.4) return 0.52; // Mặt cỏ Island Green cao ráo
            if (Math.abs(x - (-110)) < 2.0) return 0.58; // Cầu gỗ
            return 0.16; // Bơi trong hồ bẫy nước
          }
          // Sàn tầng 2 driving range
          if (x >= -85 && x <= -63 && z >= 115 && z <= 129 && (localPlayerState && localPlayerState.y > 2.5)) {
            return 4.65;
          }
          // Mặt cỏ sân golf cao hơn vỉa hè một chút
          if (x >= -195 && x <= -30 && z >= 96.0 && z <= 225) {
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
      // 1. Cờ lỗ bay phất phới trong gió sông Sài Gòn
      const flagWave = Math.sin(t * 5.2) * 0.18;
      flag9Mesh.rotation.y = flagWave;
      flag1Mesh.rotation.y = flagWave;

      // 2. Đài phun nước nghệ thuật giữa hồ bẫy nước dao động nhịp nhàng
      fountainJets.forEach((jet, i) => {
        const pulse = 1.0 + Math.sin(t * 3.5 + i * 0.8) * 0.35;
        jet.scale.set(1, pulse, 1);
      });

      // 3. Đèn đổi màu nghệ thuật dưới hồ
      fLight.color.setHSL((t * 0.08) % 1, 0.9, 0.55);

      // 4. Cập nhật nhãn nút di chuyển nhanh
      updateGolfButtonState();
    });

    console.log('[Royal Saigon Golf] Đã dựng thành công Sân Golf Quốc Tế 18 Lỗ rực rỡ, lung linh ban đêm!');
  }

  // ========================================================
  // HỆ THỐNG ĐÁNH GOLF TƯƠNG TÁC (INTERACTIVE GOLF GAMEPLAY SYSTEM)
  // ========================================================
  const activeBalls = []; // Quả bóng golf đang bay theo quỹ đạo parabol 3D thực tế

  window.GolfSystem = {
    // Vị trí các điểm tương tác chính
    pubShuttlePos: { x: -9.5, z: 28.5 },      // Điểm đón xe điện tại Quán Nhậu
    resortShuttlePos: { x: -49.0, z: 104.5 }, // Điểm đón xe điện tại Cổng Sân Golf
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
        if (window.Features && window.Features.toast) {
          window.Features.toast('⛳ Đang di chuyển sang Sân Golf Hoàng Gia Royal Saigon!', 'info', 2500);
        }
        setTimeout(() => {
          teleportToGolf();
        }, 400);
        return true;
      }

      // 2. Xe điện Shuttle từ Sân Golf về lại Quán Nhậu
      if (target.type === 'resort_shuttle') {
        playGolfSound('putt');
        if (typeof setTicker === 'function') {
          setTicker('🚗 Xe điện đang đưa bạn về lại Bến Quán Nhậu Bờ Sông...');
        }
        setTimeout(() => {
          teleportToPub();
        }, 400);
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
        if (window.Features && window.Features.toast) {
          window.Features.toast('🥂 Đại gia thưởng thức đồ uống thượng hạng! Giảm 30% say xỉn. +45 XP.', 'success', 4000);
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
      if (localPlayerState) {
        localPlayerState.ry = Math.atan2(nx, nz) - Math.PI / 2;
        if (localCharacter) localCharacter.mesh.rotation.y = localPlayerState.ry;
      }

      // Âm thanh vung gậy & chạm bóng TINK!
      playGolfSound('swing_drive');

      // Tạo quả bóng golf 3D bay xé gió
      const startX = isDrivingRange ? localPlayerState.x : -115.0;
      const startY = 0.55;
      const startZ = isDrivingRange ? localPlayerState.z + 1.2 : 115.0;

      const ballGeo = new THREE.SphereGeometry(0.12, 14, 14);
      const ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const ballMesh = new THREE.Mesh(ballGeo, ballMat);
      ballMesh.position.set(startX, startY, startZ);
      const scBall = getScene(); if (scBall) scBall.add(ballMesh);

      // Vệt sáng Neon rực rỡ bám theo quả bóng (Trail Line)
      const trailGeo = new THREE.BufferGeometry();
      const trailMat = new THREE.LineBasicMaterial({
        color: isDrivingRange ? 0x38bdf8 : 0xfacc15,
        linewidth: 3,
        transparent: true,
        opacity: 0.85
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      if (scBall) scBall.add(trailLine);

      // Tính toán lực vung ngẫu nhiên 220 - 325 Yards
      const powerPct = Math.floor(82 + Math.random() * 18);
      const yards = Math.floor(220 + (powerPct / 100) * 105);
      const forwardSpeed = (yards / 300) * 48; // m/s
      const upVelocity = 18 + (powerPct / 100) * 6;

      const ballData = {
        mesh: ballMesh,
        trailLine: trailLine,
        trailGeo: trailGeo,
        trailPts: [new THREE.Vector3(startX, startY, startZ)],
        pos: new THREE.Vector3(startX, startY, startZ),
        vel: new THREE.Vector3(nx * forwardSpeed, upVelocity, nz * forwardSpeed),
        gravity: 19.6,
        t: 0,
        maxT: 4.0,
        bounces: 0
      };
      activeBalls.push(ballData);

      // Hiển thị thẻ HUD thông số cú đánh
      setTimeout(() => {
        this.showShotHud('DRIVER TEE SHOT', powerPct, yards);
        this.isSwinging = false;
      }, 900);
    },

    // THỰC HIỆN CÚ GẠT BÓNG PUTTING
    performPuttingShot(holeName) {
      this.isSwinging = true;
      playGolfSound('putt');

      if (typeof setTicker === 'function') {
        setTicker(`⛳ Đang căn lực gạt bóng Putter vào cờ ${holeName}...`);
      }

      setTimeout(() => {
        playGolfSound('cup_drop');
        playGolfSound('cheer_fanfare');
        if (typeof setTicker === 'function') {
          setTicker(`🎉 BIRDIE! Gạt bóng vào cốc cờ ${holeName} cực kỳ chuẩn xác! +50 XP.`);
        }
        if (window.Features && window.Features.toast) {
          window.Features.toast(`🏌️ CÚ PUTT TUYỆT HẢO! Bóng lăn êm ái vào lỗ cờ ${holeName}. +50 XP!`, 'success', 4500);
        }
        if (typeof sendAction === 'function') {
          sendAction({ action: 'award', xp: 50, reason: `Putting Hole In ${holeName}` });
        }
        this.isSwinging = false;
      }, 1200);
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
          const scRem = getScene();
          if (scRem) {
            scRem.remove(b.mesh);
            scRem.remove(b.trailLine);
          }
          if (b.mesh.geometry) b.mesh.geometry.dispose();
          if (b.trailGeo) b.trailGeo.dispose();
          activeBalls.splice(i, 1);
        }
      }
    }
  };

  // DỊCH CHUYỂN TỨC THỜI SANG SÂN GOLF QUỐC TẾ
  function teleportToGolf() {
    const ps = window.localPlayerState || (typeof localPlayerState !== 'undefined' ? localPlayerState : null);

    // 1. Tự động đứng dậy nếu đang ngồi ghế
    if (ps && ps.is_sitting) {
      ps.is_sitting = false;
      ps.table_id = -1;
      ps.seat_id = -1;
      const sitStandText = document.getElementById('sitStandText');
      const sitStandBtn = document.getElementById('sitStandBtn');
      if (sitStandText) sitStandText.textContent = 'Ngồi Ghế';
      if (sitStandBtn) sitStandBtn.classList.remove('is-sitting');
      if (typeof sendAction === 'function') sendAction({ action: 'stand' });
    }

    // Hủy lệnh click chuột đi dở ở bờ Nam để nhân vật không tự chạy ngược về
    if (typeof clickTarget !== 'undefined') clickTarget = null;
    if (window.clickTarget !== undefined) window.clickTarget = null;

    // 2. Tắt góc nhìn Landmark 81 nếu đang mở
    if (typeof leaveScenicView === 'function') leaveScenicView();

    // 3. Đưa nhân vật tới Sân Tập VIP Driving Range (ngắm thẳng Fairway & Landmark 81)
    if (ps) {
      ps.x = -74.0;
      ps.z = 124.0;
      ps.ry = Math.PI; // Quay mặt về hướng Bắc nhìn Fairway & các bảng cự ly
      ps.groundY = 0.35;
    }
    const lc = window.localCharacter || (typeof localCharacter !== 'undefined' ? localCharacter : null);
    if (lc && lc.mesh) {
      lc.mesh.position.set(-74.0, 0.35, 124.0);
      lc.mesh.rotation.set(0, Math.PI, 0);
    }

    // 4. Snap Camera tức thì bao quát toàn bộ thảm cỏ sân golf (nhìn từ sau lưng về hướng Bắc)
    const isMobile = matchMedia('(pointer: coarse), (max-width: 768px)').matches;
    const camDist = isMobile ? 10.5 : 9.5;
    const camPitchVal = 0.65;
    const camYawVal = Math.PI; // Camera hướng về phía Bắc (+Z) ngắm thẳng Fairway và Landmark 81

    if (window.setCameraView) {
      window.setCameraView(camYawVal, camPitchVal, camDist, true);
    } else {
      if (typeof cameraYaw !== 'undefined') cameraYaw = camYawVal;
      if (typeof cameraPitch !== 'undefined') cameraPitch = camPitchVal;
      if (typeof cameraDistance !== 'undefined') cameraDistance = camDist;
      if (typeof cameraTargetReady !== 'undefined') cameraTargetReady = false;
    }

    const cam = window.camera || (typeof camera !== 'undefined' ? camera : null);
    const lookTarget = window.cameraLookTarget || (typeof cameraLookTarget !== 'undefined' ? cameraLookTarget : null);
    if (cam && lookTarget) {
      lookTarget.set(-74.0, 1.2, 124.0);
      const horiz = camDist * Math.cos(camPitchVal);
      // camYaw = Math.PI => Camera lùi về z = 124 - horiz, nhìn về phía trước +Z
      cam.position.set(-74.0, 1.2 + camDist * Math.sin(camPitchVal), 124.0 - horiz);
      cam.lookAt(lookTarget);
    }

    // 5. Đồng bộ vị trí với máy chủ
    if (typeof sendAction === 'function') {
      sendAction({
        action: 'move',
        x: -74.0,
        z: 124.0,
        y: 0.05,
        ry: Math.PI,
        is_walking: false
      });
    }

    // 6. Âm thanh rộn ràng & thông báo
    playGolfSound('cheer_fanfare');
    if (typeof setTicker === 'function') {
      setTicker('🌟 Đã đến Sân Golf Quốc Tế Royal Saigon! Bấm [F] trên thảm tập để vung gậy Driver!');
    }
    if (window.Features && window.Features.toast) {
      window.Features.toast('⛳ Đã đến Sân Golf Quốc Tế! Bước lên thảm cỏ bấm [F] phát bóng Driver.', 'success', 5000);
    }
    updateGolfButtonState();
  }

  // DỊCH CHUYỂN TỨC THỜI VỀ BẾN QUÁN NHẬU
  function teleportToPub() {
    const ps = window.localPlayerState || (typeof localPlayerState !== 'undefined' ? localPlayerState : null);

    if (ps && ps.is_sitting) {
      ps.is_sitting = false;
      ps.table_id = -1;
      ps.seat_id = -1;
      const sitStandText = document.getElementById('sitStandText');
      const sitStandBtn = document.getElementById('sitStandBtn');
      if (sitStandText) sitStandText.textContent = 'Ngồi Ghế';
      if (sitStandBtn) sitStandBtn.classList.remove('is-sitting');
      if (typeof sendAction === 'function') sendAction({ action: 'stand' });
    }

    if (typeof clickTarget !== 'undefined') clickTarget = null;
    if (window.clickTarget !== undefined) window.clickTarget = null;

    if (ps) {
      ps.x = -4.0;
      ps.z = 28.0;
      ps.ry = Math.PI;
      ps.groundY = 0.32;
    }
    const lc = window.localCharacter || (typeof localCharacter !== 'undefined' ? localCharacter : null);
    if (lc && lc.mesh) {
      lc.mesh.position.set(-4.0, 0.32, 28.0);
      lc.mesh.rotation.set(0, Math.PI, 0);
    }

    const isMobile = matchMedia('(pointer: coarse), (max-width: 768px)').matches;
    const camDist = isMobile ? 10.5 : 9.5;
    const camPitchVal = 0.72;
    const camYawVal = 0;

    if (window.setCameraView) {
      window.setCameraView(camYawVal, camPitchVal, camDist, true);
    } else {
      if (typeof cameraYaw !== 'undefined') cameraYaw = camYawVal;
      if (typeof cameraPitch !== 'undefined') cameraPitch = camPitchVal;
      if (typeof cameraDistance !== 'undefined') cameraDistance = camDist;
      if (typeof cameraTargetReady !== 'undefined') cameraTargetReady = false;
    }

    const cam = window.camera || (typeof camera !== 'undefined' ? camera : null);
    const lookTarget = window.cameraLookTarget || (typeof cameraLookTarget !== 'undefined' ? cameraLookTarget : null);
    if (cam && lookTarget) {
      lookTarget.set(-4.0, 1.2, 28.0);
      const horiz = camDist * Math.cos(camPitchVal);
      cam.position.set(-4.0, 1.2 + camDist * Math.sin(camPitchVal), 28.0 + horiz);
      cam.lookAt(lookTarget);
    }

    if (typeof sendAction === 'function') {
      sendAction({
        action: 'move',
        x: -4.0,
        z: 28.0,
        y: 0.02,
        ry: Math.PI,
        is_walking: false
      });
    }

    playGolfSound('putt');
    if (typeof setTicker === 'function') {
      setTicker('🍻 Đã trở về Bến Quán Nhậu Bờ Sông! Tiếp tục 1, 2, 3 DÔ cùng anh em!');
    }
    if (window.Features && window.Features.toast) {
      window.Features.toast('🍻 Đã trở về Bến Quán Nhậu Bờ Sông!', 'info', 3000);
    }
    updateGolfButtonState();
  }

  // ĐIỀU HƯỚNG VỊ TRÍ THÔNG MINH (CHỐNG TOGGLE KÉP BẰNG DEBOUNCE 800MS)
  let lastToggleTime = 0;
  function toggleGolfLocation() {
    const now = Date.now();
    if (now - lastToggleTime < 800) return;
    lastToggleTime = now;

    const ps = window.localPlayerState || (typeof localPlayerState !== 'undefined' ? localPlayerState : null);
    if (!ps || ps.z < 110) {
      teleportToGolf();
    } else {
      teleportToPub();
    }
  }

  window.teleportToGolf = teleportToGolf;
  window.teleportToPub = teleportToPub;
  window.toggleGolfLocation = toggleGolfLocation;
  if (window.GolfSystem) {
    window.GolfSystem.teleportToGolf = teleportToGolf;
    window.GolfSystem.teleportToPub = teleportToPub;
    window.GolfSystem.toggleGolfLocation = toggleGolfLocation;
  }

  // Cập nhật nhãn nút bấm nhẹ nhàng, không hủy diệt DOM của nút
  let lastGolfState = null;
  function updateGolfButtonState() {
    const ps = window.localPlayerState || (typeof localPlayerState !== 'undefined' ? localPlayerState : null);
    const inGolf = (ps && ps.z >= 110);
    if (inGolf === lastGolfState) return;
    lastGolfState = inGolf;
    const golfBtnText = document.getElementById('golfBtnText');
    const golfBtn = document.getElementById('golfBtn');
    if (inGolf) {
      if (golfBtnText) golfBtnText.textContent = 'Về Quán';
      if (golfBtn) {
        golfBtn.classList.add('in-golf-mode');
        golfBtn.title = 'Trở về Quán Nhậu Bờ Sông';
      }
    } else {
      if (golfBtnText) golfBtnText.textContent = 'Sân Golf';
      if (golfBtn) {
        golfBtn.classList.remove('in-golf-mode');
        golfBtn.title = 'Sang Sân Golf Quốc Tế Royal Saigon 18 Lỗ';
      }
    }
  }

  function handleGolfButtonClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    toggleGolfLocation();
  }

  function initGolfButtons() {
    const golfBtn = document.getElementById('golfBtn');
    if (golfBtn && !golfBtn._golfBound) {
      golfBtn._golfBound = true;
      golfBtn.addEventListener('click', handleGolfButtonClick);
    }
    updateGolfButtonState();
  }

  // Đăng ký cập nhật nhịp đập khung hình
  if (window.Features && window.Features.addTick) {
    window.Features.addTick((delta, t) => {
      for (const a of animators) a(delta, t);
      if (window.GolfSystem) window.GolfSystem.update(delta, t);
    });
  }

  // Khởi chạy khi môi trường 3D sẵn sàng
  if (window.PubLoader && window.PubLoader.defer) {
    window.PubLoader.defer(buildGolfWorld, 'buildGolfWorld');
  } else {
    setTimeout(buildGolfWorld, 300);
  }

  document.addEventListener('DOMContentLoaded', initGolfButtons);
  if (window.PubLoader && window.PubLoader.defer) {
    window.PubLoader.defer(initGolfButtons, 'initGolfButtons');
  } else {
    setTimeout(initGolfButtons, 400);
  }

})();

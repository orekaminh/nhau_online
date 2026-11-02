// ========================================================
// DAYNIGHT - sáng / trưa / chiều / tối theo GIỜ VIỆT NAM (UTC+7) hiện tại
// Mọi người chơi thấy cùng một buổi (giờ lấy theo server). Thêm ?time=15.5 vào link để xem thử giờ bất kỳ.
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;

  // Mốc theo giờ: bg = màu trời & sương mù, fog = mật độ sương mù, amb/sun = [màu, cường độ],
  // moon = cường độ ánh trăng, neon = hệ số đèn neon/đèn quán (ban ngày gần như tắt), exp = độ phơi sáng.
  const KEYS = [
    { h: 0,    bg: 0x070b14, fog: 0.013, amb: [0x334155, 0.45], sun: [0xffb366, 0.55], moon: 0.45, neon: 1,    exp: 0.90 },
    { h: 4.5,  bg: 0x0a0f1e, fog: 0.013, amb: [0x334155, 0.45], sun: [0xffb366, 0.55], moon: 0.40, neon: 1,    exp: 0.90 },
    { h: 5.7,  bg: 0xf2a07b, fog: 0.012, amb: [0x7a7f9e, 0.55], sun: [0xffa860, 0.80], moon: 0.10, neon: 0.7,  exp: 0.95 },
    { h: 7,    bg: 0xa9d4f5, fog: 0.007, amb: [0xcfe0f0, 0.85], sun: [0xffe2b0, 1.50], moon: 0,    neon: 0.15, exp: 1.00 },
    { h: 10,   bg: 0x8ccbff, fog: 0.005, amb: [0xe4eef9, 0.95], sun: [0xfff4dc, 1.90], moon: 0,    neon: 0.05, exp: 1.05 },
    { h: 12.5, bg: 0x74c0ff, fog: 0.004, amb: [0xf2f6fb, 1.00], sun: [0xffffff, 2.15], moon: 0,    neon: 0,    exp: 1.10 },
    { h: 15,   bg: 0x9cc8ec, fog: 0.005, amb: [0xeadfce, 0.95], sun: [0xffe0a8, 1.85], moon: 0,    neon: 0.08, exp: 1.05 },
    { h: 17,   bg: 0xf0b57a, fog: 0.008, amb: [0xd9b79a, 0.80], sun: [0xff9a4d, 1.35], moon: 0,    neon: 0.30, exp: 1.00 },
    { h: 18.2, bg: 0xc4627a, fog: 0.011, amb: [0x8a6a8e, 0.60], sun: [0xff7a4a, 0.90], moon: 0.20, neon: 0.75, exp: 0.95 },
    { h: 19.2, bg: 0x261a3d, fog: 0.013, amb: [0x3c4468, 0.48], sun: [0xffb366, 0.65], moon: 0.38, neon: 1,    exp: 0.90 },
    { h: 24,   bg: 0x070b14, fog: 0.013, amb: [0x334155, 0.45], sun: [0xffb366, 0.55], moon: 0.45, neon: 1,    exp: 0.90 },
  ];
  const LABELS = [[5, '🌙 Khuya'], [10, '🌅 Sáng'], [14, '☀️ Trưa'], [18, '🌇 Chiều'], [24, '🌃 Tối']];

  const forced = parseFloat(new URLSearchParams(location.search).get('time'));
  let pill = null, sun = null, moon = null;
  const base = {};            // cường độ gốc của các đèn neon
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  let acc = 1, lastLabel = '';

  // Giờ Việt Nam (0–24) tính từ giờ server, không phụ thuộc múi giờ máy người chơi.
  function vnHour() {
    if (Number.isFinite(forced)) return ((forced % 24) + 24) % 24;
    const ms = F.serverNow() + 7 * 3600e3;
    return (ms % 86400e3) / 3600e3;
  }
  function labelFor(hour) { return (LABELS.find(([end]) => hour < end) || LABELS[LABELS.length - 1])[1]; }

  function sample(hour) {
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
    const smooth = t * t * (3 - 2 * t);
    const num = (x, y) => x + (y - x) * smooth;
    const col = (x, y) => new THREE.Color(x).lerp(c2.set(y), smooth);
    return {
      bg: col(a.bg, b.bg), fog: num(a.fog, b.fog), exp: num(a.exp, b.exp), moon: num(a.moon, b.moon), neon: num(a.neon, b.neon),
      amb: { color: col(a.amb[0], b.amb[0]), i: num(a.amb[1], b.amb[1]) },
      sun: { color: col(a.sun[0], b.sun[0]), i: num(a.sun[1], b.sun[1]) },
    };
  }

  function makeBody(color, radius, glow) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20),
      new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.9, 20, 20),
      new THREE.MeshBasicMaterial({ color: glow, fog: false, toneMapped: false, transparent: true, opacity: 0.22, depthWrite: false }));
    m.add(halo);
    m.renderOrder = -1;
    scene.add(m);
    return m;
  }

  function apply(hour) {
    const k = sample(hour);
    scene.background.copy(k.bg);
    if (scene.fog) { scene.fog.color.copy(k.bg); scene.fog.density = k.fog; }
    ambientLight.color.copy(k.amb.color); ambientLight.intensity = k.amb.i;
    streetLight.color.copy(k.sun.color); streetLight.intensity = k.sun.i;
    moonLight.intensity = k.moon;
    renderer.toneMappingExposure = k.exp;
    neonCyan.intensity = base.cyan * k.neon; neonMagenta.intensity = base.magenta * k.neon; neonAmber.intensity = base.amber * k.neon;

    // Mặt trời mọc 6h lặn 18h; trăng mọc 18h lặn 6h. Cả hai lướt qua bầu trời phía sông & Landmark 81.
    const sunT = (hour - 6) / 12;
    const moonT = (((hour - 18) % 24 + 24) % 24) / 12;
    placeBody(sun, sunT);
    placeBody(moon, moonT);
    // Ánh sáng đổ bóng đi theo mặt trời ban ngày, theo hướng đèn đường ban đêm.
    if (sunT >= 0 && sunT <= 1) {
      streetLight.position.set(-14 + 28 * sunT, 6 + 20 * Math.sin(Math.PI * sunT), 9);
    } else {
      streetLight.position.set(6, 16, 9);
    }
  }
  function placeBody(mesh, t) {
    const up = t >= 0 && t <= 1;
    mesh.visible = up;
    if (up) mesh.position.set(-110 + 220 * t, 8 + 100 * Math.sin(Math.PI * t), 130);
  }

  function buildPill() {
    const group = document.querySelector('.hud-stats-group');
    if (!group) return;
    pill = h('div', { class: 'hud-stat-pill desktop-only fx-time-pill', title: 'Giờ Việt Nam hiện tại — cảnh quán đổi theo buổi sáng/trưa/chiều/tối' }, h('span', { text: '' }));
    group.prepend(pill);
  }
  function updatePill(hour) {
    if (!pill) return;
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    const text = `${labelFor(hour)} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (text !== lastLabel) { lastLabel = text; pill.firstChild.textContent = text; }
  }

  F.onStart(() => {
    base.cyan = neonCyan.intensity; base.magenta = neonMagenta.intensity; base.amber = neonAmber.intensity;
    sun = makeBody(0xfff2c2, 7, 0xffd27a);
    moon = makeBody(0xe8eefc, 4.5, 0x9db4ff);
    buildPill();
    apply(vnHour());
    updatePill(vnHour());
    F.daynight = { hour: vnHour, apply: (hr) => apply(hr) };
    F.addTick((delta) => {
      acc += delta;
      if (acc < 1) return;       // 1 giây cập nhật một lần là đủ mượt vì ánh sáng đổi rất chậm
      acc = 0;
      const hour = vnHour();
      updatePill(hour);
      // Sự kiện mất điện / Happy Hour tự điều khiển đèn: không tranh giành với chúng.
      const active = F.events ? F.events.active() : [];
      if (active.includes('blackout') || active.includes('happy_hour')) return;
      apply(hour);
    });
  });
})();

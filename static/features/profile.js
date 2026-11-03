// ========================================================
// PROFILE - cấp bậc/XP, nhiệm vụ ngày, tủ đồ (đổi áo/nón...), bảng xếp hạng
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;

  const SLOT_LABELS = { hat: '🎩 Mũ nón', glasses: '😎 Kính', neck: '🧣 Cổ', shoes: '👟 Giày', shirt: '👕 Màu áo' };
  const DEFAULT_OUTFIT = { hat: 'cap', glasses: 'none', neck: 'none', shoes: 'sneaker', shirt: null };
  const levels = new Map(); // id -> { level, title }
  let catalog = null;
  let pill = null;

  F.apiUrl = function (path) {
    const server = new URLSearchParams(location.search).get('server');
    if (!server) return path;
    const clean = server.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return (server.startsWith('http:') ? 'http://' : 'https://') + clean + path;
  };

  // ------------------------------------------------------------ vẽ đồ lên nhân vật 3D
  const matCache = new Map();
  function mat(color, extra) {
    const key = color + JSON.stringify(extra || {});
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, extra)));
    return matCache.get(key);
  }
  const geoCache = new Map();
  function geo(key, make) {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  }
  function starShape(outer, inner) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? inner : outer;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
    }
    shape.closePath();
    return shape;
  }
  let checkerTex = null;
  function scarfTexture() {
    if (checkerTex) return checkerTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#f5f5f4'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#166534';
    for (let i = 0; i < 64; i += 16) for (let j = 0; j < 64; j += 16) if (((i + j) / 16) % 2 === 0) x.fillRect(i, j, 16, 16);
    checkerTex = new THREE.CanvasTexture(c);
    checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
    checkerTex.repeat.set(5, 1);
    return checkerTex;
  }
  function part(geometry, material, x, y, z) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    return m;
  }

  const HATS = {
    beanie() {
      const g = new THREE.Group();
      const dome = part(geo('beanie', () => new THREE.SphereGeometry(0.345, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xdc2626), 0, 1.6, 0);
      dome.scale.set(1, 0.78, 1.05);
      g.add(dome, part(geo('beanieFold', () => new THREE.TorusGeometry(0.335, 0.05, 8, 24)), mat(0x991b1b), 0, 1.62, 0.0),
        part(geo('pom', () => new THREE.SphereGeometry(0.065, 10, 10)), mat(0xfafafa), 0, 1.9, 0));
      g.children[1].rotation.x = Math.PI / 2;
      return g;
    },
    nonla() {
      const g = new THREE.Group();
      const cone = part(geo('nonla', () => new THREE.ConeGeometry(0.62, 0.32, 32, 1, true)), mat(0xe7d7a3, { side: THREE.DoubleSide, roughness: 0.9 }), 0, 1.86, 0);
      const band = part(geo('nonlaBand', () => new THREE.TorusGeometry(0.2, 0.014, 6, 24)), mat(0xec4899), 0, 1.74, 0);
      band.rotation.x = Math.PI / 2;
      g.add(cone, band);
      return g;
    },
    nonco() {
      const g = new THREE.Group();
      const dome = part(geo('nonco', () => new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x4d5d2f), 0, 1.6, 0);
      dome.scale.set(1, 0.85, 1.05);
      const brim = part(geo('noncoBrim', () => new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24)), mat(0x3f4c26), 0, 1.6, 0.02);
      const star = part(geo('noncoStar', () => new THREE.ShapeGeometry(starShape(0.075, 0.03))), new THREE.MeshBasicMaterial({ color: 0xfacc15 }), 0, 1.74, 0.372);
      g.add(dome, brim, star);
      return g;
    },
    tophat() {
      const g = new THREE.Group();
      g.add(part(geo('topCyl', () => new THREE.CylinderGeometry(0.23, 0.23, 0.34, 20)), mat(0x111111, { roughness: 0.35 }), 0, 1.98, 0),
        part(geo('topBrim', () => new THREE.CylinderGeometry(0.38, 0.38, 0.03, 24)), mat(0x111111, { roughness: 0.35 }), 0, 1.81, 0),
        part(geo('topBand', () => new THREE.CylinderGeometry(0.235, 0.235, 0.06, 20)), mat(0xb91c1c), 0, 1.87, 0));
      return g;
    },
    crown() {
      const g = new THREE.Group();
      const gold = mat(0xfacc15, { metalness: 0.85, roughness: 0.25 });
      g.add(part(geo('crownBase', () => new THREE.CylinderGeometry(0.28, 0.3, 0.14, 18, 1, true)), mat(0xfacc15, { metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide }), 0, 1.87, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(part(geo('crownSpike', () => new THREE.ConeGeometry(0.05, 0.15, 6)), gold, Math.sin(a) * 0.28, 1.99, Math.cos(a) * 0.28));
      }
      g.add(part(geo('crownGem', () => new THREE.SphereGeometry(0.035, 8, 8)), mat(0xef4444, { emissive: 0x7f1d1d }), 0, 1.88, 0.3));
      return g;
    },
  };

  const GLASSES = {
    sun() {
      const g = new THREE.Group();
      const lens = mat(0x0b0b0f, { roughness: 0.15, metalness: 0.4 });
      for (const s of [-1, 1]) {
        const l = part(geo('sunLens', () => new THREE.CylinderGeometry(0.095, 0.095, 0.02, 18)), lens, s * 0.13, 1.52, 0.305);
        l.rotation.set(Math.PI / 2, 0, 0);
        l.rotation.z = s * 0.3;
        g.add(l);
      }
      g.add(part(geo('bridge', () => new THREE.BoxGeometry(0.1, 0.02, 0.02)), lens, 0, 1.54, 0.318));
      return g;
    },
    round() {
      const g = new THREE.Group();
      const gold = mat(0xd4a017, { metalness: 0.8, roughness: 0.25 });
      const glass = mat(0xbfe9ff, { transparent: true, opacity: 0.35, roughness: 0.05 });
      for (const s of [-1, 1]) {
        const ring = part(geo('roundRing', () => new THREE.TorusGeometry(0.09, 0.011, 6, 20)), gold, s * 0.13, 1.52, 0.31);
        ring.rotation.y = s * -0.3;
        const lens = part(geo('roundLens', () => new THREE.CircleGeometry(0.09, 18)), glass, s * 0.13, 1.52, 0.31);
        lens.rotation.y = s * -0.3;
        g.add(ring, lens);
      }
      g.add(part(geo('bridge2', () => new THREE.BoxGeometry(0.08, 0.012, 0.012)), gold, 0, 1.54, 0.322));
      return g;
    },
    star() {
      const g = new THREE.Group();
      const pink = new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0x9d174d, emissiveIntensity: 0.6, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const l = part(geo('starLens', () => new THREE.ShapeGeometry(starShape(0.12, 0.05))), pink, s * 0.13, 1.52, 0.312);
        l.rotation.y = s * -0.3;
        g.add(l);
      }
      g.add(part(geo('bridge3', () => new THREE.BoxGeometry(0.08, 0.015, 0.015)), mat(0xf472b6), 0, 1.54, 0.322));
      return g;
    },
  };

  const NECK = {
    scarf() {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ map: scarfTexture(), roughness: 0.9 });
      const ring = part(geo('scarf', () => new THREE.TorusGeometry(0.2, 0.065, 10, 24)), m, 0, 1.11, 0);
      ring.rotation.x = Math.PI / 2;
      g.add(ring, part(geo('scarfTail', () => new THREE.BoxGeometry(0.09, 0.22, 0.035)), m, 0.1, 0.98, 0.24));
      return g;
    },
    lei() {
      const g = new THREE.Group();
      const colors = [0xf472b6, 0xfacc15, 0xfb923c, 0xffffff];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.add(part(geo('leiBead', () => new THREE.SphereGeometry(0.038, 8, 8)), mat(colors[i % colors.length]), Math.sin(a) * 0.355, 1.06 - Math.max(0, Math.cos(a)) * 0.07, Math.cos(a) * 0.355));
      }
      return g;
    },
    gold() {
      const g = new THREE.Group();
      const gold = mat(0xfacc15, { metalness: 0.9, roughness: 0.2 });
      const chain = part(geo('chain', () => new THREE.TorusGeometry(0.348, 0.014, 6, 32)), gold, 0, 1.03, 0);
      chain.rotation.x = Math.PI / 2;
      g.add(chain, part(geo('pendant', () => new THREE.SphereGeometry(0.045, 10, 10)), gold, 0, 0.94, 0.35));
      return g;
    },
  };

  const SHOES = { // [màu, scaleY, y, scaleXZ]
    sneaker: [0xf8fafc, 1, -0.42, 1], flip: [0xf59e0b, 0.35, -0.465, 1], boots: [0x3b2a1a, 1.9, -0.37, 1.1],
  };

  function dress(char, outfit, fallbackColor) {
    if (!char || !char.mesh) return;
    const o = Object.assign({}, DEFAULT_OUTFIT, outfit || {});
    if (char._fx) char.mesh.remove(char._fx);
    const fx = new THREE.Group();
    char._fx = fx;
    char.mesh.add(fx);
    char.outfit = o;

    if (char.shirtMat) char.shirtMat.color.set(o.shirt || fallbackColor || '#f97316');
    const showCap = o.hat === 'cap';
    (char.capParts || []).forEach(p => { p.visible = showCap; });
    if (char.hairTop) char.hairTop.visible = o.hat === 'none' || o.hat === 'cap' || o.hat === 'crown';
    if (HATS[o.hat]) fx.add(HATS[o.hat]());
    if (GLASSES[o.glasses]) fx.add(GLASSES[o.glasses]());
    if (NECK[o.neck]) fx.add(NECK[o.neck]());

    const shoe = SHOES[o.shoes] || SHOES.sneaker;
    if (char.shoeMat) char.shoeMat.color.set(shoe[0]);
    (char.shoes || []).forEach(s => { s.scale.set(shoe[3], shoe[1], shoe[3]); s.position.y = shoe[2]; });
  }
  F.dress = dress;

  // ------------------------------------------------------------ thanh cấp bậc trên HUD
  function buildPill() {
    const group = document.querySelector('.hud-stats-group');
    if (!group || pill) return;
    pill = h('button', { class: 'hud-stat-pill fx-xp-pill', type: 'button', title: 'Hồ sơ, nhiệm vụ & tủ đồ', onclick: () => F.openProfile() },
      h('span', { class: 'fx-xp-lv', text: 'Lv 1' }),
      h('span', { class: 'fx-xp-track' }, h('i', { class: 'fx-xp-fill' })),
      h('span', { class: 'fx-xp-num', text: '' }));
    group.prepend(pill);
  }
  function updatePill() {
    const me = F.me;
    if (!pill || !me) return;
    pill.querySelector('.fx-xp-lv').textContent = 'Lv ' + me.level;
    pill.querySelector('.fx-xp-fill').style.width = Math.min(100, (me.xp_in_level / me.xp_for_next) * 100) + '%';
    pill.querySelector('.fx-xp-num').textContent = `${me.xp_in_level}/${me.xp_for_next}`;
    pill.setAttribute('aria-label', `Cấp ${me.level}, ${me.title}, ${me.xp_in_level} trên ${me.xp_for_next} kinh nghiệm`);
  }

  let floatXp = 0, floatTimer = null;
  function showXpGain(amount, reason) {
    if (!pill || amount <= 0) return;
    floatXp += amount;
    clearTimeout(floatTimer);
    floatTimer = setTimeout(() => {
      const el = h('div', { class: 'fx-xp-float', text: `+${floatXp} XP${reason ? ' · ' + reason : ''}` });
      floatXp = 0;
      document.body.append(el);
      const r = pill.getBoundingClientRect();
      el.style.left = Math.max(8, Math.min(innerWidth - 160, r.left)) + 'px';
      el.style.top = r.bottom + 6 + 'px';
      setTimeout(() => el.remove(), 1700);
    }, 450);
  }

  // ------------------------------------------------------------ tin nhắn từ server
  function rememberMember(m) { if (m && m.id) levels.set(m.id, { level: m.level || 1, title: m.title || '' }); }

  F.on('init', (d) => {
    F.skew = d.server_time - Date.now();
    F.me = d.profile;
    catalog = d.catalog;
    levels.clear();
    (d.world_state.members || []).forEach(rememberMember);
    updatePill();
    if (d.limits) F.limits = d.limits;
    setTimeout(() => window.dispatchEvent(new Event('pub:ready')), 250);
    // Lần đầu vào quán (chưa tự đặt tên): mời đặt tên nhân vật một lần cho mỗi phiên.
    if (!d.profile.named) {
      let asked = false;
      try { asked = sessionStorage.getItem('pub_name_asked') === '1'; } catch (_) { /* bỏ qua */ }
      if (!asked) setTimeout(() => {
        try { sessionStorage.setItem('pub_name_asked', '1'); } catch (_) { /* bỏ qua */ }
        F.askName();
      }, 2500);
    }
  });
  F.askName = function () {
    const btn = document.getElementById('editNameBtn');
    if (btn) btn.click();
  };
  F.on('member_joined', (d) => rememberMember(d.member));
  F.on('member_left', (d) => levels.delete(d.member_id));
  F.on('room_full', (d) => {
    window.dispatchEvent(new Event('pub:ready'));
    F.toast(d.message, 'warn', 8000);
    if (F.openRooms) F.openRooms(d.message);
    return true;
  });

  F.on('progress', (d) => {
    const prev = F.me;
    F.me = Object.assign({}, prev, d);
    updatePill();
    if (F.selfId) levels.set(F.selfId, { level: d.level, title: d.title });
    if (d.gained > 0) showXpGain(d.gained, d.reason);
    if (d.level_up) {
      const unlocked = [];
      if (catalog) {
        for (const [slot, items] of Object.entries(catalog)) {
          items.forEach((it) => { if (it.level > (prev ? prev.level : 1) && it.level <= d.level) unlocked.push(it.name); });
        }
      }
      F.toast(`🎉 LÊN CẤP ${d.level}: ${d.title}!` + (unlocked.length ? ` Mở khóa: ${unlocked.slice(0, 3).join(', ')}` : ''), 'level', 7000);
      if (typeof playBillChime === 'function' && soundEnabled) playBillChime();
    }
    if (F.isPanelOpen('profile')) renderProfile(F.panelBody('profile'));
    return true;
  });
  F.on('quest_done', (d) => {
    F.toast(`✅ ${d.text} (+${d.xp} XP)`, 'quest', 5000);
    return true;
  });
  F.on('member_update', (d) => {
    levels.set(d.id, { level: d.level, title: d.title });
    if (d.message && d.id !== F.selfId) F.ticker(d.message);
    return true;
  });

  F.on('outfit_changed', (d) => {
    if (d.member_id === F.selfId) {
      if (F.me) F.me.outfit = d.outfit;
      if (typeof selfMember !== 'undefined' && selfMember) { selfMember.outfit = d.outfit; selfMember.color = d.color; }
      if (typeof localCharacter !== 'undefined') dress(localCharacter, d.outfit, d.color);
      for (const id of ['selfColorBadge', 'mobAvatarBadge']) {
        const el = document.getElementById(id);
        if (el) el.style.backgroundColor = d.color;
      }
      if (F.isPanelOpen('profile')) renderProfile(F.panelBody('profile'));
    } else if (typeof remotePlayers !== 'undefined') {
      const rp = remotePlayers.get(d.member_id);
      if (rp) { rp.data.outfit = d.outfit; rp.data.color = d.color; dress(rp.charParts, d.outfit, d.color); }
    }
    return true;
  });

  // Độ say thay đổi do mini-game (uống phạt): cập nhật thanh say + hiệu ứng.
  F.on('drunk_update', (d) => {
    if (d.member_id === F.selfId && typeof selfMember !== 'undefined' && selfMember) {
      selfMember.drunk_level = d.drunk_level;
      selfMember.bladder_level = d.bladder_level;
      selfMember.status = d.status;
      updateDrunkVisuals(d.drunk_level, d.status);
      updateBladderVisuals(d.bladder_level);
    }
    if (typeof animateCheerMug === 'function') animateCheerMug(d.member_id);
    if (typeof playClinkSound === 'function' && soundEnabled) playClinkSound();
    return true;
  });

  // Thêm danh hiệu "Lv • Tước hiệu" dưới tên trên đầu mỗi người chơi.
  let tagTimer = 0;
  F.addTick((delta) => {
    tagTimer += delta;
    if (tagTimer < 0.5 || typeof playerHUDTags === 'undefined') return;
    tagTimer = 0;
    for (const [id, hud] of playerHUDTags) {
      const info = levels.get(id) || (id === F.selfId && F.me ? { level: F.me.level, title: F.me.title } : null);
      if (!info) continue;
      // Không hiển thị danh hiệu dưới tên nữa (đã gỡ theo yêu cầu): màn hình thoáng hơn.
    }
  });

  // ------------------------------------------------------------ panel Hồ sơ
  function setOutfit(slot, value) {
    if (!F.me) return;
    const next = Object.assign({}, DEFAULT_OUTFIT, F.me.outfit, { [slot]: value });
    F.me.outfit = next;
    if (typeof localCharacter !== 'undefined' && localCharacter) {
      dress(localCharacter, next, (typeof selfMember !== 'undefined' && selfMember && selfMember.color) || '#f97316');
    }
    F.send({ action: 'set_outfit', outfit: next });
    renderProfile(F.panelBody('profile'));
  }

  function renderProfile(body) {
    if (!body) return;
    body.replaceChildren();
    const me = F.me;
    if (!me) {
      body.append(h('p', { class: 'fx-empty', text: 'Chưa kết nối phòng chơi nên chưa có hồ sơ. Hãy mở bản có server để lưu cấp bậc nhé!' }));
      return;
    }
    const pct = Math.min(100, (me.xp_in_level / me.xp_for_next) * 100);
    body.append(
      h('div', { class: 'fx-card fx-level-card' },
        h('div', { class: 'fx-lv-big', text: me.level }),
        h('div', { class: 'fx-lv-info' },
          h('strong', { text: (typeof selfMember !== 'undefined' && selfMember && selfMember.name) || me.name || 'Bợm nhậu' }),
          h('span', { class: 'fx-title', text: me.title }),
          h('div', { class: 'fx-bar' }, h('i', { style: { width: pct + '%' } })),
          h('small', { text: `${me.xp_in_level}/${me.xp_for_next} XP để lên cấp ${me.level + 1} · Tổng ${me.xp} XP` + (me.streak > 1 ? ` · 🔥 ${me.streak} ngày liên tiếp` : '') })),
        h('button', { type: 'button', class: 'fx-btn fx-small', text: '✏️ Đổi tên', onclick: () => { F.closePanel('profile'); document.getElementById('editNameBtn').click(); } })),

      h('h4', { text: '📜 Nhiệm vụ hôm nay' }),
      h('div', { class: 'fx-quests' }, me.quests.items.map((q) =>
        h('div', { class: 'fx-quest' + (q.done ? ' is-done' : '') },
          h('div', { class: 'fx-quest-top' }, h('span', { text: (q.done ? '✅ ' : '▫️ ') + q.text }), h('b', { text: `+${q.xp} XP` })),
          h('div', { class: 'fx-bar fx-thin' }, h('i', { style: { width: Math.min(100, (q.progress / q.goal) * 100) + '%' } })),
          h('small', { text: `${q.progress}/${q.goal}` })))),
      h('p', { class: 'fx-note', text: me.quests.bonus_done ? '🏆 Đã nhận thưởng hoàn thành tất cả nhiệm vụ hôm nay!' : `Hoàn thành cả 3 nhiệm vụ để nhận thêm +${me.quests.bonus} XP. Nhiệm vụ đổi mới mỗi ngày.` }),

      h('h4', { text: '👗 Tủ đồ' }),
      h('div', { class: 'fx-wardrobe' }, Object.keys(SLOT_LABELS).map((slot) => {
        const items = (catalog && catalog[slot]) || [];
        const current = me.outfit ? me.outfit[slot] : null;
        return h('div', { class: 'fx-slot' },
          h('span', { class: 'fx-slot-name', text: SLOT_LABELS[slot] }),
          h('div', { class: 'fx-chips' }, items.map((it) => {
            const locked = it.level > me.level;
            const active = slot === 'shirt' ? (current || '').toUpperCase() === it.id : current === it.id;
            const chip = h('button', {
              type: 'button', class: 'fx-chip' + (active ? ' is-active' : '') + (locked ? ' is-locked' : '') + (slot === 'shirt' ? ' fx-swatch' : ''),
              disabled: locked, title: locked ? `${it.name} · mở khóa ở cấp ${it.level}` : it.name,
              'aria-pressed': String(active), onclick: () => setOutfit(slot, it.id),
            }, slot === 'shirt' ? h('i', { style: { background: it.id } }) : it.name, locked ? h('small', { text: '🔒' + it.level }) : null);
            if (slot === 'shirt') chip.setAttribute('aria-label', it.name + (locked ? ' (khóa)' : ''));
            return chip;
          })));
      })),

      h('h4', { text: '📊 Thành tích' }),
      h('div', { class: 'fx-stats' }, [
        ['🍻 Cụng ly', me.stats.cheer], ['🥢 Gắp mồi', me.stats.snack], ['🎲 Thắng mini-game', me.stats.game_win],
        ['🎤 Bài đã hát', me.stats.sing], ['🚽 Đi WC', me.stats.pee_wc], ['📸 Ảnh đã chụp', me.stats.photo],
      ].map(([label, value]) => h('div', { class: 'fx-stat' }, h('b', { text: value || 0 }), h('small', { text: label })))));
  }

  F.openProfile = function () {
    if (F.online) F.send({ action: 'profile_request' });
    F.openPanel('profile', { title: 'Hồ sơ bợm nhậu', icon: '👤', wide: true, render: renderProfile });
  };

  // ------------------------------------------------------------ bảng xếp hạng
  const BOARDS = [['xp', '⭐ Tổng XP'], ['week_cheers', '🍻 Cụng ly tuần'], ['week_wins', '🎲 Thắng tuần'], ['week_songs', '🎤 Ca sĩ tuần']];
  function renderBoard(body, kind) {
    body.replaceChildren();
    const list = h('div', { class: 'fx-board' }, h('p', { class: 'fx-empty', text: 'Đang tải bảng xếp hạng…' }));
    body.append(
      h('div', { class: 'fx-tabs', role: 'tablist' }, BOARDS.map(([k, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'fx-tab' + (k === kind ? ' is-active' : ''), 'aria-selected': String(k === kind), text: label, onclick: () => renderBoard(body, k) }))),
      list);
    const url = F.apiUrl('/api/leaderboard?kind=' + kind + '&pid=' + encodeURIComponent(typeof profileId !== 'undefined' && profileId ? profileId : ''));
    fetch(url).then((r) => r.json()).then((data) => {
      if (!body.isConnected) return;
      list.replaceChildren();
      if (!data.rows || !data.rows.length) {
        list.append(h('p', { class: 'fx-empty', text: kind === 'xp' ? 'Chưa có ai trên bảng. Hãy là người đầu tiên!' : 'Tuần này chưa ai ghi điểm. Vào cụng ly thôi!' }));
        return;
      }
      const unit = { xp: 'XP', week_cheers: 'ly', week_wins: 'ván thắng', week_songs: 'bài' }[kind];
      data.rows.forEach((row) => {
        const medal = ['🥇', '🥈', '🥉'][row.rank - 1] || row.rank;
        list.append(h('div', { class: 'fx-row' + (row.me ? ' is-me' : '') },
          h('span', { class: 'fx-rank', text: medal }),
          h('span', { class: 'fx-who' }, h('b', { text: row.name }), h('small', { text: `Lv ${row.level} · ${row.title}` })),
          h('span', { class: 'fx-score', text: `${row.score} ${unit}` })));
      });
      if (data.mine && data.mine.rank > data.rows.length) {
        list.append(h('p', { class: 'fx-note', text: `Hạng của bạn: #${data.mine.rank} (${data.mine.score} ${unit})` }));
      }
    }).catch(() => {
      if (body.isConnected) { list.replaceChildren(h('p', { class: 'fx-empty', text: 'Không tải được bảng xếp hạng (cần kết nối server).' })); }
    });
  }
  F.openLeaderboard = function () {
    F.openPanel('leaderboard', { title: 'Bảng xếp hạng', icon: '🏆', render: (body) => renderBoard(body, 'xp') });
  };

  F.onStart(() => {
    buildPill();
    F.addMenuItem({ id: 'profile', icon: '👤', label: 'Hồ sơ & nhiệm vụ', order: 10, onClick: () => F.openProfile(),
      badge: () => (F.me && F.me.quests ? (F.me.quests.items.filter((q) => !q.done).length || null) : null) });
    F.addMenuItem({ id: 'rename', icon: '✏️', label: 'Đổi tên', hint: 'Tên hiện trên đầu bạn', order: 11, onClick: () => F.askName() });
    F.addMenuItem({ id: 'wardrobe', icon: '👗', label: 'Tủ đồ', hint: 'Đổi nón, kính, áo', order: 12, onClick: () => F.openProfile() });
    F.addMenuItem({ id: 'board', icon: '🏆', label: 'Xếp hạng', order: 30, onClick: () => F.openLeaderboard() });
    F.addKey('l', () => F.openLeaderboard());
    F.addKey('i', () => F.openProfile());
  });
})();

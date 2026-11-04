// ========================================================
// SỰ KIỆN NGẪU NHIÊN TRONG QUÁN (phía client)
// Server: world_event {id, kind, title, text, ends_ms, x?, z?} / world_event_end {id, kind, ...}
// kind: happy_hour | patrol | blackout | rain | lucky_crate
// ========================================================
(function () {
  'use strict';

  const F = window.Features;
  const h = F.h;
  const KIND_INFO = {
    happy_hour: { icon: '🍻', title: 'Happy Hour!', text: 'Mọi hành động nhận x2 XP. Dô nào anh em!' },
    patrol: { icon: '🚨', title: 'Dân phòng đi kiểm tra!', text: 'Ngồi xuống ghế hoặc trốn vào WC để không bị phạt!' },
    blackout: { icon: '⚡', title: 'Mất điện!', text: 'Cả phố tối om. Cứ nhậu bằng ánh trăng thôi.', dayTitle: '⚡ Cúp điện khu vực!', dayText: 'Quán cúp điện: quạt tắt, nhạc tắt! Ra ngoài đường đón gió sông và tắm nắng nào!' },
    rain: { icon: '🌧️', title: 'Mưa bất chợt!', text: 'Mưa Sài Gòn nói đến là đến. Vào mái hiên nhậu tiếp!' },
    lucky_crate: { icon: '🎁', title: 'Thùng bia may mắn!', text: 'Ai chạm vào đầu tiên được thưởng XP.' },
  };
  const LOCAL_MS = 12000;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const active = new Map();   // id -> ev
  let banner = null;
  let bannerTimer = 0;

  const isLite = () => !!(window.PUB_PERF && window.PUB_PERF.lite) || matchMedia('(pointer: coarse)').matches;
  const isDaytime = () => {
    if (F.daynight && typeof F.daynight.isDay === 'function') return F.daynight.isDay();
    const forced = parseFloat(new URLSearchParams(location.search).get('time'));
    const h = Number.isFinite(forced) ? (((forced % 24) + 24) % 24) : (((F.serverNow() + 7 * 3600e3) % 86400e3) / 3600e3);
    return h >= 5.8 && h <= 18.2;
  };
  // Đèn của app.js là const cấp script: đọc trực tiếp (không qua window) sau khi Features.start().
  const worldLights = () => ({
    ambientLight: typeof ambientLight !== 'undefined' ? ambientLight : null,
    streetLight: typeof streetLight !== 'undefined' ? streetLight : null,
    neonCyan: typeof neonCyan !== 'undefined' ? neonCyan : null,
    neonMagenta: typeof neonMagenta !== 'undefined' ? neonMagenta : null,
    neonAmber: typeof neonAmber !== 'undefined' ? neonAmber : null,
    moonLight: typeof moonLight !== 'undefined' ? moonLight : null,
  });
  const remainingMs = (ev) => Math.max(0, ev.ends - F.serverNow());

  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    if (obj.parent) obj.parent.remove(obj);
  }

  // ---------------------------------------------------------- điều khiển đèn dùng chung (mất điện / happy hour / sét)
  const lights = { orig: null, fog: 0, black: { cur: 1, target: 1 }, happy: { cur: 0, target: 0 }, flash: 0 };
  const LIGHT_NAMES = ['ambientLight', 'streetLight', 'neonCyan', 'neonMagenta', 'neonAmber', 'moonLight'];

  function lightsAcquire() {
    if (lights.orig) return;
    lights.orig = [];
    const found = worldLights();
    for (const name of LIGHT_NAMES) {
      const l = found[name];
      if (l) lights.orig.push({ name, light: l, value: l.intensity });
    }
    lights.fog = scene.fog && scene.fog.density !== undefined ? scene.fog.density : 0;
  }
  function lightsRestore() {
    if (!lights.orig) return;
    for (const o of lights.orig) o.light.intensity = o.value;
    if (scene.fog && lights.fog) scene.fog.density = lights.fog;
    lights.orig = null; lights.flash = 0;
    lights.black.cur = 1; lights.happy.cur = 0;
    if (F.daynight && typeof F.daynight.applyCurrent === 'function') F.daynight.applyCurrent();
  }
  function lightsRetarget() {
    const kinds = [...active.values()].map((e) => e.kind);
    lights.black.target = kinds.includes('blackout') ? (isDaytime() ? 0 : 0.15) : 1;
    lights.happy.target = kinds.includes('happy_hour') ? 1 : 0;
    if (lights.black.target !== 1 || lights.happy.target !== 0) lightsAcquire();
  }
  function lightsTick(dt) {
    if (!lights.orig) return;
    const k = Math.min(1, dt * 1.6);
    lights.black.cur += (lights.black.target - lights.black.cur) * k;
    lights.happy.cur += (lights.happy.target - lights.happy.cur) * k;
    lights.flash = Math.max(0, lights.flash - dt * 2.4);
    const neutral = Math.abs(lights.black.cur - 1) < 0.01 && lights.happy.cur < 0.01 && lights.flash <= 0.001;
    if (neutral && lights.black.target === 1 && lights.happy.target === 0) { lightsRestore(); return; }
    const isDay = isDaytime();
    for (const o of lights.orig) {
      const warm = o.name === 'neonAmber' || o.name === 'streetLight' ? 1 + 0.4 * lights.happy.cur : 1;
      if (isDay) {
        if (o.name === 'streetLight' || o.name === 'ambientLight') {
          o.light.intensity = o.value * warm + (o.name === 'ambientLight' ? lights.flash * 1.4 : 0);
        } else if (o.name === 'moonLight') {
          o.light.intensity = 0;
        } else {
          o.light.intensity = o.value * lights.black.cur * warm;
        }
      } else {
        if (o.name === 'moonLight') {
          o.light.intensity = o.value;
        } else {
          o.light.intensity = o.value * lights.black.cur * warm + (o.name === 'ambientLight' ? lights.flash * 1.4 : 0);
        }
      }
    }
    if (scene.fog && lights.fog) {
      const fogMul = isDay ? 1 : (1 + (1 - lights.black.cur) * 0.7);
      scene.fog.density = lights.fog * fogMul;
    }
  }

  // ---------------------------------------------------------- âm thanh
  let noiseBuffer = null;
  function noise(c) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
      noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }
  function audioCtx() { return typeof getAudioContext === 'function' ? getAudioContext() : null; }
  const soundOn = () => typeof soundEnabled === 'undefined' || soundEnabled;

  function startRainSound() {
    const c = audioCtx();
    if (!c) return null;
    const src = c.createBufferSource();
    src.buffer = noise(c); src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(c.destination);
    src.start();
    gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 1.5);
    return { c, src, gain, nodes: [hp, lp] };
  }
  function stopRainSound(a) {
    if (!a) return;
    try {
      a.gain.gain.cancelScheduledValues(a.c.currentTime);
      a.gain.gain.setValueAtTime(a.gain.gain.value, a.c.currentTime);
      a.gain.gain.linearRampToValueAtTime(0, a.c.currentTime + 0.8);
    } catch (_) { /* context đã đóng */ }
    setTimeout(() => { try { a.src.stop(); a.src.disconnect(); a.nodes.forEach((n) => n.disconnect()); a.gain.disconnect(); } catch (_) { /* ok */ } }, 900);
  }
  function thunder() {
    const c = audioCtx();
    if (c && soundOn()) {
      const src = c.createBufferSource(); src.buffer = noise(c);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = c.createGain(), now = c.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.4, now + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      src.connect(lp); lp.connect(g); g.connect(c.destination);
      src.start(now); src.stop(now + 2.3);
      src.onended = () => { src.disconnect(); lp.disconnect(); g.disconnect(); };
    }
    if (!reducedMotion.matches) { lightsAcquire(); lights.flash = 1; }
  }

  // ---------------------------------------------------------- hiệu ứng theo loại sự kiện
  const FX = {};

  FX.happy_hour = {
    start(ev) {
      const n = isLite() ? 60 : 140;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n);
      const palette = [new THREE.Color(0xffd54a), new THREE.Color(0xffb300), new THREE.Color(0xfff2a8), new THREE.Color(0xff8a3d)];
      for (let i = 0; i < n; i++) {
        pos.set([(Math.random() - 0.5) * 18, Math.random() * 6, (Math.random() - 0.3) * 10], i * 3);
        const c = palette[i % palette.length]; col.set([c.r, c.g, c.b], i * 3);
        vel[i] = 0.35 + Math.random() * 0.7;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pts.frustumCulled = false;
      scene.add(pts);
      ev.fx = { pts, pos, vel, n };
    },
    tick(ev, dt, t) {
      const { pts, pos, vel, n } = ev.fx;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        pos[j + 1] -= vel[i] * dt;
        pos[j] += Math.sin(t * 1.3 + i) * dt * 0.25;
        if (pos[j + 1] < 0.3) pos[j + 1] = 6;
      }
      pts.geometry.attributes.position.needsUpdate = true;
    },
    end(ev) { dispose(ev.fx.pts); },
  };

  FX.patrol = {
    start(ev) {
      const el = h('div', { id: 'fx-patrol', 'aria-hidden': 'true' });
      document.body.append(el);
      ev.fx = { el, nextSiren: 0 };
    },
    tick(ev, dt, t) {
      if (t >= ev.fx.nextSiren) { ev.fx.nextSiren = t + 2.6; if (typeof playSirenSound === 'function') playSirenSound(); }
    },
    end(ev) { ev.fx.el.remove(); },
  };

  FX.blackout = {
    start(ev) {
      const el = h('div', { id: 'fx-blackout', 'aria-hidden': 'true' });
      const isDay = isDaytime();
      if (isDay) el.classList.add('is-daytime');
      document.body.append(el);
      if (!isDay) requestAnimationFrame(() => el.classList.add('is-on'));
      ev.fx = { el, isDay };
    },
    tick() { /* ánh sáng do lightsTick xử lý */ },
    end(ev) {
      if (ev.fx && ev.fx.el) {
        ev.fx.el.classList.remove('is-on');
        const el = ev.fx.el;
        setTimeout(() => el.remove(), 900);
      }
    },
  };

  FX.rain = {
    start(ev) {
      const n = isLite() ? 350 : 900;
      const pos = new Float32Array(n * 6), vel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 26, y = Math.random() * 14, z = (Math.random() - 0.5) * 26;
        pos.set([x, y, z, x - 0.04, y + 0.55, z - 0.02], i * 6);
        vel[i] = 13 + Math.random() * 6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0.42, depthWrite: false, fog: false });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      scene.add(lines);
      ev.fx = { lines, pos, vel, n, sound: startRainSound(), nextThunder: performance.now() / 1000 + 6 + Math.random() * 6 };
    },
    tick(ev, dt, t) {
      const f = ev.fx;
      f.lines.position.set(camera.position.x, 0, camera.position.z);
      for (let i = 0; i < f.n; i++) {
        const j = i * 6, fall = f.vel[i] * dt;
        f.pos[j + 1] -= fall; f.pos[j + 4] -= fall;
        if (f.pos[j + 1] < 0) { f.pos[j + 1] += 14; f.pos[j + 4] += 14; }
      }
      f.lines.geometry.attributes.position.needsUpdate = true;
      if (f.sound) f.sound.gain.gain.value = soundOn() ? Math.min(0.05, f.sound.gain.gain.value + dt * 0.05) : 0;
      const now = performance.now() / 1000;
      if (now >= f.nextThunder) { f.nextThunder = now + 8 + Math.random() * 7; thunder(); }
    },
    end(ev) { stopRainSound(ev.fx.sound); dispose(ev.fx.lines); },
  };

  FX.lucky_crate = {
    start(ev) {
      const p = ev.params, g = new THREE.Group();
      const amber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xff9a00, emissiveIntensity: 0.9, roughness: 0.4 });
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.5, 0.72), amber);
      crate.position.y = 0.45;
      g.add(crate);
      for (let i = 0; i < 6; i++) {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 8),
          new THREE.MeshStandardMaterial({ color: 0x15803d, emissive: 0x0a4d24, roughness: 0.2 }));
        bottle.position.set(-0.3 + (i % 3) * 0.3, 0.86, -0.15 + Math.floor(i / 3) * 0.3);
        g.add(bottle);
      }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.55, 7, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 3.6;
      g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.33;
      g.add(ring);
      g.position.set(p.x, 0, p.z);
      scene.add(g);
      ev.fx = { g, crate, ring, claimed: false, hint: null };
    },
    tick(ev, dt, t) {
      const f = ev.fx, me = F.playerPos(F.selfId);
      f.crate.position.y = 0.55 + Math.sin(t * 2.4) * 0.12;
      f.crate.rotation.y += dt * 0.9;
      f.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.1);
      if (!me) return;
      const dx = ev.params.x - me.x, dz = ev.params.z - me.z, dist = Math.hypot(dx, dz);
      f.hint = { dist, arrow: arrowFor(dx, dz) };
      if (dist < 1.6 && !f.claimed && !ev.local) {
        f.claimed = true;
        F.send({ action: 'event_claim', id: ev.id });
      }
    },
    end(ev) { dispose(ev.fx.g); },
    note(ev) {
      const hint = ev.fx && ev.fx.hint;
      return hint ? hint.arrow + ' cách ' + Math.round(hint.dist) + ' m' : '';
    },
  };

  // Mũi tên 8 hướng, tính theo hướng nhìn của camera.
  function arrowFor(dx, dz) {
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz) || 1;
    const dot = (dx * fx + dz * fz) / fl, cross = (fx * dz - fz * dx) / fl;
    const ang = Math.atan2(cross, dot);                       // + = bên phải màn hình
    const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
    return arrows[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
  }

  // ---------------------------------------------------------- banner
  function ensureBanner() {
    if (banner) return banner;
    banner = h('div', { id: 'fx-event-banner', 'aria-live': 'polite' });
    document.body.append(banner);
    return banner;
  }
  function renderBanner() {
    const evs = [...active.values()].slice(-2);
    ensureBanner();
    banner.replaceChildren();
    banner.hidden = !evs.length;
    for (const ev of evs) {
      const left = h('b', { class: 'fx-ev-time' });
      const bar = h('i', { class: 'fx-ev-bar' });
      ev.ui = { left, bar, note: h('em', { class: 'fx-ev-note' }) };
      banner.append(h('div', { class: 'fx-ev fx-ev-' + ev.kind },
        h('span', { class: 'fx-ev-ico', text: ev.icon }),
        h('div', { class: 'fx-ev-main' }, h('strong', { text: ev.title }), h('span', { text: ev.text }), ev.ui.note),
        left, h('div', { class: 'fx-ev-track' }, bar)));
    }
    updateBanner();
  }
  function updateBanner() {
    for (const ev of active.values()) {
      if (!ev.ui || !ev.ui.left.isConnected) continue;
      const ms = remainingMs(ev);
      ev.ui.left.textContent = Math.ceil(ms / 1000) + 's';
      ev.ui.bar.style.width = Math.max(0, Math.min(100, ms / ev.total * 100)) + '%';
      const fx = FX[ev.kind];
      ev.ui.note.textContent = fx && fx.note ? fx.note(ev) : '';
    }
  }

  // ---------------------------------------------------------- vòng đời sự kiện
  function startEvent(data, local) {
    if (active.has(data.id)) return;
    const info = KIND_INFO[data.kind] || { icon: '✨', title: 'Sự kiện bất ngờ', text: '' };
    const ends = local ? F.serverNow() + LOCAL_MS : Number(data.ends_ms) || F.serverNow() + 15000;
    let title = data.title;
    let text = data.text;
    if (data.kind === 'blackout' && isDaytime()) {
      if (!title || title === KIND_INFO.blackout.title) title = KIND_INFO.blackout.dayTitle;
      if (!text || text === KIND_INFO.blackout.text) text = KIND_INFO.blackout.dayText;
    }
    const ev = {
      id: data.id, kind: data.kind, local: !!local, ends, total: Math.max(1000, ends - F.serverNow()),
      icon: info.icon, title: String(title || info.title), text: String(text || info.text),
      params: { x: Number(data.x), z: Number(data.z) }, fx: null, ui: null,
    };
    if (ev.kind === 'lucky_crate' && !(isFinite(ev.params.x) && isFinite(ev.params.z))) {
      const me = F.playerPos(F.selfId) || { x: 0, z: 4 };
      ev.params = { x: me.x + 4, z: me.z + 2 };
    }
    active.set(ev.id, ev);
    const fx = FX[ev.kind];
    if (fx) { try { fx.start(ev); } catch (err) { console.error('[events] start', ev.kind, err); ev.fx = null; } }
    lightsRetarget();
    renderBanner();
  }
  function endEvent(id, data) {
    const ev = active.get(id);
    if (!ev) return;
    active.delete(id);
    const fx = FX[ev.kind];
    if (fx && ev.fx) { try { fx.end(ev); } catch (err) { console.error('[events] end', ev.kind, err); } }
    lightsRetarget();
    renderBanner();
    const msg = resultText(ev, data || {});
    if (msg) F.toast(msg, 'info', 5200);
  }
  function resultText(ev, d) {
    const list = (a) => (Array.isArray(a) ? a.slice(0, 4).map(String).join(', ') + (a.length > 4 ? '…' : '') : '');
    if (d.text) return String(d.text);
    if (ev.kind === 'lucky_crate') return d.winner_name ? '🏆 ' + d.winner_name + ' nhặt được thùng bia may mắn!' : '🎁 Thùng bia may mắn đã biến mất.';
    if (ev.kind === 'patrol') {
      const caught = list(d.caught), safe = list(d.safe);
      return (caught ? '🚨 Bị phạt: ' + caught + '. ' : '') + (safe ? '😎 Né trót lọt: ' + safe : (caught ? '' : '🚨 Dân phòng đã đi qua.'));
    }
    if (ev.kind === 'blackout') return isDaytime() ? '💡 Có điện lại rồi! Quạt quay vù vù, nhạc lại xập xình!' : '💡 Có điện lại rồi! Phố sáng rực rỡ trở lại.';
    if (ev.kind === 'rain') return '☀️ Tạnh mưa rồi.';
    if (ev.kind === 'happy_hour') return '⏰ Hết giờ Happy Hour.';
    return '';
  }

  F.on('world_event', (d) => { if (d && d.id && d.kind) startEvent(d, false); });
  F.on('world_event_end', (d) => { if (d && d.id) endEvent(d.id, d); });

  F.addTick((dt, t) => {
    lightsTick(dt);
    if (!active.size) return;
    for (const ev of [...active.values()]) {
      const fx = FX[ev.kind];
      if (fx && ev.fx) { try { fx.tick(ev, dt, t); } catch (err) { console.error('[events] tick', ev.kind, err); } }
      // Chốt an toàn: server quên gửi world_event_end thì tự dọn sau 6s; sự kiện giả lập thì dọn đúng giờ.
      if (remainingMs(ev) <= 0 && (ev.local || F.serverNow() > ev.ends + 6000)) endEvent(ev.id);
    }
    bannerTimer += dt;
    if (bannerTimer > 0.25) { bannerTimer = 0; updateBanner(); }
  });

  F.events = {
    active() { return [...active.values()].map((e) => e.kind); },
    forceLocal(kind) {
      if (!KIND_INFO[kind]) { console.warn('Sự kiện không có:', kind, Object.keys(KIND_INFO)); return; }
      startEvent({ id: 'local-' + kind, kind }, true);
    },
  };
})();

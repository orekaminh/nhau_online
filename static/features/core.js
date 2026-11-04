// ========================================================
// FEATURES CORE - khung chung cho các tính năng mở rộng
// (hồ sơ, mini-game, voice, karaoke, sự kiện, chụp ảnh...)
// Nạp TRƯỚC app.js. Mọi module chỉ chạm tới biến của app.js bên trong
// các hàm được gọi sau Features.start() (khi scene đã dựng xong).
// ========================================================
(function () {
  'use strict';

  const handlers = new Map();     // type -> [fn]
  const startFns = [];
  const tickFns = [];
  const keyFns = new Map();       // phím thường -> fn
  const menuItems = [];
  const panels = new Map();       // id -> { el, opts }
  let started = false;

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const F = window.Features = {
    h,
    skew: 0,                      // serverNow - Date.now()
    serverNow() { return Date.now() + this.skew; },
    get online() { return typeof ws !== 'undefined' && ws && ws.readyState === 1; },
    get selfId() { return typeof clientId !== 'undefined' ? clientId : null; },
    get roomId() { return typeof roomId !== 'undefined' ? roomId : 'ban_1'; },
    me: null,                     // bản sao profile của mình (cập nhật bởi profile.js)

    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    // Gọi từ app.js cho MỌI tin nhắn từ server. Trả true nếu có handler "tiêu thụ" tin.
    onMessage(data) {
      const list = handlers.get(data && data.type);
      if (!list) return false;
      let consumed = false;
      for (const fn of list) {
        try { if (fn(data) === true) consumed = true; } catch (err) { console.error('[Features]', data.type, err); }
      }
      return consumed;
    },
    onStart(fn) { if (started) fn(); else startFns.push(fn); },
    start() {
      if (started) return;
      started = true;
      ensureShell();
      for (const fn of startFns) { try { fn(); } catch (err) { console.error('[Features] start', err); } }
    },
    addTick(fn) { tickFns.push(fn); },
    tick(delta, t) {
      for (const fn of tickFns) { try { fn(delta, t); } catch (err) { console.error('[Features] tick', err); } }
    },
    addKey(key, fn) { keyFns.set(key.toLowerCase(), fn); },

    send(payload) { if (typeof sendAction === 'function') sendAction(payload); },

    // Vị trí/tên của người chơi (mình hoặc người khác) trong thế giới 3D.
    playerPos(id) {
      if (id === this.selfId) return typeof localPlayerState !== 'undefined' ? { x: localPlayerState.x, z: localPlayerState.z } : null;
      const rp = typeof remotePlayers !== 'undefined' ? remotePlayers.get(id) : null;
      return rp ? { x: rp.mesh.position.x, z: rp.mesh.position.z } : null;
    },
    playerName(id) {
      if (id === this.selfId) return (typeof selfMember !== 'undefined' && selfMember && selfMember.name) || 'Bạn';
      const rp = typeof remotePlayers !== 'undefined' ? remotePlayers.get(id) : null;
      return rp ? rp.data.name : 'Người lạ';
    },
    otherPlayers() {
      if (typeof remotePlayers === 'undefined') return [];
      return [...remotePlayers.entries()].map(([id, rp]) => ({ id, name: rp.data.name }));
    },
    ticker(msg) { if (typeof setTicker === 'function') setTicker(msg); },

    toast(text, kind = 'info', ms = 3800) {
      const box = document.getElementById('fx-toasts');
      if (!box) return;
      const el = h('div', { class: 'fx-toast fx-' + kind, role: 'status', text });
      box.append(el);
      while (box.children.length > 4) box.firstChild.remove();
      setTimeout(() => { el.classList.add('fx-out'); setTimeout(() => el.remove(), 350); }, ms);
    },

    // ---- panel dạng modal (bottom-sheet trên mobile) ----
    openPanel(id, opts) {
      this.closePanel(id);
      const body = h('div', { class: 'fx-panel-body' });
      const closeBtn = h('button', { class: 'fx-x', 'aria-label': 'Đóng', text: '✕', onclick: () => F.closePanel(id) });
      const el = h('section', { class: 'fx-panel' + (opts.wide ? ' fx-wide' : ''), role: 'dialog', 'aria-label': opts.title },
        h('header', {}, h('h3', { text: (opts.icon ? opts.icon + ' ' : '') + opts.title }), closeBtn), body);
      const back = h('div', { class: 'fx-backdrop', 'data-panel': id }, el);
      back.addEventListener('pointerdown', (e) => { if (e.target === back) F.closePanel(id); });
      document.getElementById('fx-panels').append(back);
      panels.set(id, { el: back, opts, body });
      document.body.classList.add('fx-panel-open');
      if (typeof clearControls === 'function') clearControls();
      opts.render(body, { close: () => F.closePanel(id) });
      closeBtn.focus({ preventScroll: true });
      return body;
    },
    closePanel(id) {
      const p = panels.get(id);
      if (!p) return;
      panels.delete(id);
      p.el.remove();
      if (p.opts.onClose) try { p.opts.onClose(); } catch (err) { console.error(err); }
      if (!panels.size) document.body.classList.remove('fx-panel-open');
    },
    panelBody(id) { const p = panels.get(id); return p ? p.body : null; },
    isPanelOpen(id) { return id ? panels.has(id) : panels.size > 0; },

    // ---- menu chính ----
    addMenuItem(item) { menuItems.push(item); menuItems.sort((a, b) => (a.order || 50) - (b.order || 50)); },
    openMenu() {
      this.openPanel('menu', {
        title: 'Menu quán nhậu', icon: '🍻', wide: true,
        render: (body, api) => {
          const grid = h('div', { class: 'fx-tiles' });
          for (const item of menuItems) {
            const badge = item.badge ? item.badge() : null;
            const btn = h('button', { class: 'fx-tile', type: 'button', onclick: () => { api.close(); item.onClick(); } },
              h('span', { class: 'fx-tile-ico', text: item.icon }),
              h('span', { class: 'fx-tile-label', text: typeof item.label === 'function' ? item.label() : item.label }),
              item.hint ? h('small', { text: typeof item.hint === 'function' ? item.hint() : item.hint }) : null,
              badge ? h('em', { class: 'fx-badge', text: badge }) : null);
            grid.append(btn);
          }
          body.append(grid);
        },
      });
    },
  };

  function ensureShell() {
    if (document.getElementById('fx-panels')) return;
    document.body.append(
      h('div', { id: 'fx-panels' }),
      h('div', { id: 'fx-toasts', 'aria-live': 'polite' }),
      h('div', { id: 'fx-dock' }),
    );
    // Không chèn #fxMenuBtn vào .camera-tools ở góc phải trên. Menu đặt gọn tại thanh dock hành động chính (#mobMenuBtn).
  }

  const inField = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
  // Pha capture: khi panel đang mở, phím không được lọt xuống app.js (WASD/Space/E...).
  window.addEventListener('keydown', (e) => {
    if (inField(e) || !panels.size) return;
    if (e.key === 'Escape') F.closePanel([...panels.keys()].pop());
    e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (inField(e) || e.ctrlKey || e.metaKey || e.altKey || panels.size) return;
    const fn = keyFns.get(e.key.toLowerCase());
    if (fn) { e.preventDefault(); fn(e); }
  });
})();

// ========================================================
// PHOTO - chế độ chụp ảnh kỷ niệm: ẩn HUD, selfie, khung có tên/cấp bậc, tải về hoặc chia sẻ
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;

  let bar = null;
  let saved = null;       // góc camera trước khi vào chế độ chụp
  let urlToRevoke = null;

  function enter() {
    if (bar) return;
    saved = { yaw: cameraYaw, pitch: cameraPitch, dist: cameraDistance };
    document.body.classList.add('fx-photo');
    if (typeof setChatOpen === 'function') setChatOpen(false);
    if (typeof closeExtraActions === 'function') closeExtraActions();
    bar = h('div', { class: 'fx-photo-bar', role: 'toolbar', 'aria-label': 'Chế độ chụp ảnh' },
      h('button', { type: 'button', class: 'fx-shutter', 'aria-label': 'Chụp', title: 'Chụp (Space)', text: '📷', onclick: capture }),
      h('button', { type: 'button', text: '🤳 Selfie', onclick: selfie }),
      h('button', { type: 'button', text: '🥂 Giơ ly', onclick: () => typeof animateCheerMug === 'function' && animateCheerMug(F.selfId) }),
      h('button', { type: 'button', text: '🌆 Landmark', onclick: () => typeof toggleScenicView === 'function' && toggleScenicView() }),
      h('button', { type: 'button', class: 'fx-ghost', text: '✕ Thoát', onclick: leave }));
    document.body.append(bar);
    F.toast('Kéo để xoay góc nhìn, rồi bấm 📷. Esc để thoát.', 'info', 3500);
  }

  function leave() {
    if (!bar) return;
    bar.remove();
    bar = null;
    document.body.classList.remove('fx-photo');
    if (typeof isScenicView !== 'undefined' && isScenicView) toggleScenicView();
    if (saved) { cameraYaw = saved.yaw; cameraPitch = saved.pitch; cameraDistance = saved.dist; saved = null; }
  }

  function selfie() {
    if (typeof isScenicView !== 'undefined' && isScenicView) toggleScenicView();
    // Camera đứng trước mặt nhân vật (mặt quay về hướng ry) và nhìn thẳng vào mặt.
    cameraYaw = localPlayerState.ry;
    cameraPitch = 0.1;
    cameraDistance = 3.2;
  }

  const head = new THREE.Vector3();
  function drawLabel(ctx, text, x, y, size, isSelf) {
    ctx.font = `700 ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
    const padX = size * 0.7;
    const w = ctx.measureText(text).width + padX * 2, hgt = size * 1.8;
    ctx.fillStyle = isSelf ? 'rgba(245, 158, 11, 0.92)' : 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2) : ctx.rect(x - w / 2, y - hgt / 2, w, hgt);
    ctx.fill();
    ctx.fillStyle = isSelf ? '#111827' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + size * 0.05);
  }

  function capture() {
    // Vẽ một khung hình mới rồi sao chép ngay trong cùng tác vụ (WebGL chưa xóa bộ đệm).
    if (typeof composer !== 'undefined' && composer) composer.render(); else renderer.render(scene, camera);
    const src = renderer.domElement;
    const scale = Math.min(1, 1920 / src.width);
    const w = Math.round(src.width * scale), hh = Math.round(src.height * scale);
    const band = Math.max(64, Math.round(hh * 0.085));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = hh + band;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0, w, hh);

    // Tên + cấp bậc của mọi người trong khung hình.
    const labelSize = Math.max(14, Math.round(w / 55));
    const people = [{ id: F.selfId, x: localPlayerState.x, y: 2.2, z: localPlayerState.z, self: true }];
    remotePlayers.forEach((rp, id) => { if (rp.mesh.visible) people.push({ id, x: rp.mesh.position.x, y: 2.2, z: rp.mesh.position.z }); });
    for (const p of people) {
      head.set(p.x, p.y, p.z).project(camera);
      if (head.z > 1 || Math.abs(head.x) > 1.05 || Math.abs(head.y) > 1.05) continue;
      const lv = playerHUDTags.get(p.id) && playerHUDTags.get(p.id).titleElem
        ? playerHUDTags.get(p.id).titleElem.textContent.split(' · ')[0] : '';
      drawLabel(ctx, F.playerName(p.id) + (lv ? '  ' + lv : ''), (head.x * 0.5 + 0.5) * w, (-head.y * 0.5 + 0.5) * hh, labelSize, p.self);
    }

    // Dải chú thích phía dưới.
    const grad = ctx.createLinearGradient(0, hh, w, hh + band);
    grad.addColorStop(0, '#1b1030');
    grad.addColorStop(1, '#3b1236');
    ctx.fillStyle = grad;
    ctx.fillRect(0, hh, w, band);
    const fs = Math.round(band * 0.34);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd000';
    ctx.font = `800 ${fs}px "Bungee", "Be Vietnam Pro", sans-serif`;
    ctx.fillText('🍻 QUÁN NHẬU ẢO 3D', band * 0.4, hh + band * 0.36);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = `600 ${Math.round(fs * 0.72)}px "Be Vietnam Pro", sans-serif`;
    const me = F.me;
    const who = F.playerName(F.selfId) + (me ? ` · Lv ${me.level} ${me.title}` : '');
    ctx.fillText(who, band * 0.4, hh + band * 0.74);
    ctx.textAlign = 'right';
    ctx.fillText(`Phòng ${F.roomId.toUpperCase()} · ${new Date().toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`, w - band * 0.4, hh + band * 0.5);

    flash();
    out.toBlob((blob) => { if (blob) showResult(blob); }, 'image/jpeg', 0.9);
    F.send({ action: 'quest_event', kind: 'photo' });
  }

  function flash() {
    const el = h('div', { class: 'fx-flash' });
    document.body.append(el);
    setTimeout(() => el.remove(), 400);
  }

  function showResult(blob) {
    if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    const url = urlToRevoke = URL.createObjectURL(blob);
    const file = new File([blob], 'quan-nhau-ao.jpg', { type: 'image/jpeg' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    F.openPanel('photo-result', {
      title: 'Ảnh kỷ niệm', icon: '📸',
      onClose: () => { if (urlToRevoke === url) { URL.revokeObjectURL(url); urlToRevoke = null; } },
      render: (body, api) => body.append(
        h('img', { class: 'fx-photo-img', src: url, alt: 'Ảnh vừa chụp trong quán nhậu' }),
        h('div', { class: 'fx-game-actions' },
          h('a', { class: 'fx-btn fx-primary', href: url, download: 'quan-nhau-ao.jpg', text: '⬇ Tải ảnh' }),
          canShare ? h('button', { type: 'button', class: 'fx-btn', text: '📤 Chia sẻ', onclick: () => navigator.share({ files: [file], title: 'Quán Nhậu Ảo 3D', text: 'Nhậu ảo vui lắm, vào chơi cùng nhé!' }).catch(() => {}) }) : null,
          h('button', { type: 'button', class: 'fx-btn', text: '↩ Chụp tiếp', onclick: () => api.close() }))),
    });
  }

  window.addEventListener('keydown', (e) => {
    if (!bar || e.target.closest('input, textarea')) return;
    if (e.key === 'Escape' && !F.isPanelOpen()) leave();
    if (e.code === 'Space' && !F.isPanelOpen()) { e.preventDefault(); e.stopImmediatePropagation(); capture(); }
  }, true);

  F.photo = { enter, leave, capture };
  F.onStart(() => {
    F.addMenuItem({ id: 'photo', icon: '📸', label: 'Chụp ảnh', hint: 'Selfie có khung & tên', order: 45, onClick: enter });
    F.addKey('c', enter);
  });
})();

// ========================================================
// PERF - màn hình chờ, nạp lười và "chế độ nhẹ" cho điện thoại yếu.
// Nạp ĐẦU TIÊN (trước app.js) vì app.js đọc window.PUB_PERF và PubLoader.
// ========================================================
(function () {
  'use strict';

  const coarse = matchMedia('(pointer: coarse)').matches;
  let pref = null;
  try { pref = localStorage.getItem('pub_lite'); } catch (_) { /* storage bị chặn: dùng tự động */ }

  // Đoán máy yếu: ít RAM/ít nhân CPU trên thiết bị cảm ứng, hoặc đang bật tiết kiệm dữ liệu / mạng 2G.
  const memory = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const conn = navigator.connection;
  const slowNet = Boolean(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  const auto = (coarse && (memory <= 4 || cores <= 4)) || memory <= 2 || slowNet;
  const lite = pref === null ? auto : pref === '1';

  window.PUB_PERF = {
    lite, auto, coarse,
    setLite(value) {
      try { localStorage.setItem('pub_lite', value ? '1' : '0'); } catch (_) { /* bỏ qua */ }
      location.reload();
    },
  };
  document.documentElement.classList.toggle('lite', lite);

  // ---- Màn hình chờ + hàng đợi dựng cảnh phụ ----
  const overlay = document.getElementById('loadingScreen');
  const bar = document.getElementById('loadingBar');
  const label = document.getElementById('loadingText');
  const tip = document.getElementById('loadingTip');
  const TIPS = [
    'Mẹo: bấm [E] gần bàn để ngồi nhậu, [Space] để cụng ly.',
    'Mẹo: mở Menu ☰ để chơi xúc xắc "thua thì uống" cùng anh em.',
    'Mẹo: làm nhiệm vụ ngày để lên cấp và mở khóa nón lá, kính râm...',
    'Mẹo: bật Mic 🎙️ để nói chuyện trực tiếp với cả quán.',
    'Mẹo: ra cửa Karaoke 69 bấm [K] để đặt bài hát.',
    'Mẹo: máy yếu? Bật "Chế độ nhẹ" trong Menu để chơi mượt hơn.',
  ];
  if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

  let progress = 0;
  let hidden = false;
  const afterFrame = [];
  const deferred = [];
  let frameDone = false;

  const Loader = window.PubLoader = {
    step(pct, text) {
      if (hidden) return;
      progress = Math.max(progress, pct);
      if (bar) bar.style.width = progress + '%';
      if (label && text) label.textContent = text;
    },
    // Ẩn màn hình chờ (mượt), có thể gọi nhiều lần.
    done() {
      if (hidden) return;
      hidden = true;
      if (bar) bar.style.width = '100%';
      if (!overlay) return;
      overlay.classList.add('is-done');
      setTimeout(() => overlay.remove(), 600);
    },
    // Dựng phần cảnh nặng (sông, Landmark 81, công viên...) SAU khung hình đầu để người chơi vào quán sớm.
    defer(fn, name) {
      if (frameDone) schedule(() => run(fn, name)); else deferred.push([fn, name]);
    },
    afterFirstFrame(fn) { if (frameDone) schedule(fn); else afterFrame.push(fn); },
    firstFrame() {
      if (frameDone) return;
      frameDone = true;
      Loader.step(90, 'Gần xong rồi...');
      const jobs = [...afterFrame.map(fn => [fn, 'afterFrame']), ...deferred];
      afterFrame.length = deferred.length = 0;
      // Mỗi việc một lượt rảnh rỗi để không làm giật khung hình.
      jobs.forEach(([fn, name], i) => setTimeout(() => schedule(() => run(fn, name)), 60 * i));
    },
  };

  function run(fn, name) {
    try { fn(); } catch (err) { console.error('[PubLoader] lỗi khi dựng ' + name, err); }
  }
  function schedule(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 500 }); else setTimeout(fn, 30);
  }

  // Ẩn màn hình chờ khi đã vào phòng (nhận `init`) hoặc sau tối đa 9 giây (chế độ tham quan/offline).
  const failSafe = setTimeout(() => Loader.done(), 9000);
  window.addEventListener('pub:ready', () => { clearTimeout(failSafe); Loader.done(); });
  Loader.step(15, 'Đang tải thư viện 3D...');
  window.addEventListener('load', () => Loader.step(45, 'Đang dựng quán nhậu...'));

  // ---- Gợi ý bật chế độ nhẹ khi máy chạy chậm ----
  function watchFps() {
    if (lite) return;
    let frames = 0, start = 0, offered = false;
    try { if (sessionStorage.getItem('pub_lite_dismissed')) return; } catch (_) { /* bỏ qua */ }
    // Tab bị ẩn thì trình duyệt tự giảm FPS: bỏ phép đo đó, không coi là máy yếu.
    document.addEventListener('visibilitychange', () => { start = 0; frames = 0; });
    Features.addTick(() => {
      if (offered || document.hidden) return;
      const now = performance.now();
      if (!start) start = now;
      frames++;
      if (now - start < 7000) return;
      const fps = frames / ((now - start) / 1000);
      if (fps < 26) {
        offered = true;
        offerLite(Math.round(fps));
      } else {
        offered = true; // máy ổn, thôi không đo nữa
      }
    });
  }
  function offerLite(fps) {
    const h = Features.h;
    const chip = h('div', { class: 'fx-lite-offer', role: 'alert' },
      h('span', { text: `🐢 Máy đang chạy ~${fps} FPS. Bật chế độ nhẹ cho mượt hơn?` }),
      h('button', { type: 'button', text: 'Bật chế độ nhẹ', onclick: () => PUB_PERF.setLite(true) }),
      h('button', { type: 'button', class: 'fx-ghost', 'aria-label': 'Để sau', text: '✕', onclick: () => {
        try { sessionStorage.setItem('pub_lite_dismissed', '1'); } catch (_) { /* bỏ qua */ }
        chip.remove();
      } }));
    document.getElementById('fx-dock').append(chip);
  }

  window.Features && Features.onStart(() => {
    watchFps();
    Features.addMenuItem({
      id: 'lite', icon: lite ? '🚀' : '🐢', order: 90,
      label: () => (lite ? 'Chế độ nhẹ: BẬT' : 'Chế độ nhẹ: TẮT'),
      hint: () => (lite ? 'Bấm để về đồ họa đầy đủ' : 'Mượt hơn cho máy yếu'),
      onClick: () => PUB_PERF.setLite(!lite),
    });
  });
})();

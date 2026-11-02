// ========================================================
// GAMES - mini-game bàn nhậu: Xúc xắc "thua thì uống" & Thi tửu lượng
// Server quyết định kết quả; client chỉ gửi ý định và vẽ `game_state`.
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;
  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  let game = null;           // trạng thái mới nhất từ server
  let card = null;           // phần tử trong #fx-dock
  const taps = {};           // số lần gõ (lạc quan phía client) cho trận đang chạy
  let lastTapSound = 0;
  let lastKey = '';          // khóa render gần nhất, chỉ vẽ lại khi cấu trúc đổi
  let lastPhase = null;

  const secondsLeft = (ms) => Math.max(0, Math.ceil((ms - F.serverNow()) / 1000));
  const isMe = (id) => id === F.selfId;

  function renderKey(g) {
    return JSON.stringify([g.id, g.phase, g.players && g.players.map((p) => [p.id, p.roll]), g.result, g.target]);
  }

  function diceRow(roll) {
    return h('span', { class: 'fx-dice' + (roll ? ' is-rolled' : ''), text: roll ? FACES[roll[0] - 1] + ' ' + FACES[roll[1] - 1] : '🎲 ?' });
  }

  function build(g) {
    const kids = [];
    const name = (id) => g.names[id] || F.playerName(id);
    if (g.type === 'dice') {
      const me = g.players.find((p) => isMe(p.id));
      const title = h('div', { class: 'fx-game-title' }, '🎲 Xúc xắc — thua thì uống', h('span', { class: 'fx-timer', 'data-deadline': g.deadline_ms }));
      kids.push(title, h('ul', { class: 'fx-players' }, g.players.map((p) => {
        const res = g.result;
        const badge = res ? (res.winners.includes(p.id) ? ' 🏆' : res.losers.includes(p.id) ? ' 🍺' : '') : '';
        return h('li', { class: isMe(p.id) ? 'is-me' : '' }, h('span', { text: name(p.id) + (p.id === g.host ? ' ★' : '') + badge }),
          p.total ? h('span', { class: 'fx-dice is-rolled', text: `${FACES[p.roll[0] - 1]} ${FACES[p.roll[1] - 1]} = ${p.total}` })
            : h('span', { class: 'fx-dice', text: g.phase === 'roll' ? '⏳ chờ lắc' : '…' }));
      })));
      if (g.phase === 'join') {
        kids.push(h('div', { class: 'fx-game-actions' },
          me ? null : h('button', { type: 'button', class: 'fx-btn fx-primary', text: '🙋 Tham gia', onclick: () => F.send({ action: 'game_join' }) }),
          me && !isMe(g.host) ? h('button', { type: 'button', class: 'fx-btn', text: 'Rời bàn', onclick: () => F.send({ action: 'game_leave' }) }) : null,
          isMe(g.host) ? h('button', { type: 'button', class: 'fx-btn fx-primary', disabled: g.players.length < 2, text: g.players.length < 2 ? 'Chờ thêm người…' : '▶ Bắt đầu', onclick: () => F.send({ action: 'game_start' }) }) : null,
          isMe(g.host) ? h('button', { type: 'button', class: 'fx-btn fx-ghost', text: 'Hủy', onclick: () => F.send({ action: 'game_cancel' }) }) : null));
      } else if (g.phase === 'roll') {
        kids.push(h('div', { class: 'fx-game-actions' }, me && !me.roll
          ? h('button', { type: 'button', class: 'fx-btn fx-primary fx-big', text: '🎲 LẮC!', onclick: () => F.send({ action: 'game_roll' }) })
          : h('span', { class: 'fx-note', text: me ? 'Đã lắc, chờ mọi người…' : 'Đang xem người khác lắc' })));
      } else if (g.result) {
        const r = g.result;
        kids.push(h('p', { class: 'fx-result', text: r.draw ? '🤝 Hòa nhau! Không ai phải uống.' : `🍺 ${r.losers.map(name).join(', ')} uống ${r.drink} ly! · 🏆 ${r.winners.map(name).join(', ')} thắng` }));
      }
    } else {
      const a = g.host, b = g.target;
      kids.push(h('div', { class: 'fx-game-title' }, `🥊 Thi tửu lượng: ${name(a)} vs ${name(b)}`, h('span', { class: 'fx-timer', 'data-deadline': g.deadline_ms })));
      if (g.phase === 'invite') {
        kids.push(isMe(b)
          ? h('div', { class: 'fx-game-actions' }, h('span', { class: 'fx-note', text: `${name(a)} thách bạn! Dám không?` }),
            h('button', { type: 'button', class: 'fx-btn fx-primary', text: '💪 Chiến!', onclick: () => F.send({ action: 'game_accept' }) }),
            h('button', { type: 'button', class: 'fx-btn', text: 'Hèn', onclick: () => F.send({ action: 'game_decline' }) }))
          : h('div', { class: 'fx-game-actions' }, h('span', { class: 'fx-note', text: `Chờ ${name(b)} nhận lời…` }),
            isMe(a) ? h('button', { type: 'button', class: 'fx-btn fx-ghost', text: 'Hủy', onclick: () => F.send({ action: 'game_cancel' }) }) : null));
      } else {
        const bars = [a, b].map((id) => h('div', { class: 'fx-vs' + (isMe(id) ? ' is-me' : '') },
          h('span', { text: name(id) }), h('div', { class: 'fx-bar fx-thick' }, h('i', { 'data-tap-bar': id })), h('b', { 'data-tap-num': id, text: '0' })));
        kids.push(...bars);
        if (g.phase === 'count') kids.push(h('div', { class: 'fx-countdown', 'data-count': g.starts_ms }));
        if (g.phase === 'fight' || g.phase === 'count') {
          if (isMe(a) || isMe(b)) {
            kids.push(h('button', { type: 'button', class: 'fx-btn fx-primary fx-tapbtn', disabled: g.phase === 'count', 'data-tap-btn': '1', text: '🍺 DÔ DÔ DÔ! (gõ nhanh / Space)' }));
          } else kids.push(h('span', { class: 'fx-note', text: 'Cổ vũ hai chiến thần nào!' }));
        } else if (g.result) {
          const r = g.result;
          kids.push(h('p', { class: 'fx-result', text: r.draw ? '🤝 Hòa nhau!' : `🏆 ${r.winners.map(name).join('')} thắng! ${r.losers.map(name).join('')} uống phạt ${r.drink} ly.` }));
        }
      }
    }
    return kids;
  }

  function setBars(counts) {
    if (!card) return;
    const values = Object.values(counts);
    const top = Math.max(10, ...values);
    for (const [id, n] of Object.entries(counts)) {
      const bar = card.querySelector(`[data-tap-bar="${CSS.escape(id)}"]`);
      const num = card.querySelector(`[data-tap-num="${CSS.escape(id)}"]`);
      if (bar) bar.style.width = Math.min(100, (n / top) * 100) + '%';
      if (num) num.textContent = n;
    }
  }

  function render() {
    if (!game) { if (card) { card.remove(); card = null; } lastKey = ''; lastPhase = null; return; }
    if (!card) {
      card = h('div', { class: 'fx-game-card', role: 'region', 'aria-label': 'Mini-game đang chơi' });
      document.getElementById('fx-dock').prepend(card);
    }
    const key = renderKey(game);
    if (key !== lastKey) {
      lastKey = key;
      card.replaceChildren(...build(game));
      const btn = card.querySelector('[data-tap-btn]');
      if (btn) btn.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
      setBars(game.taps || {});
    }
    if (game.phase === 'done' && lastPhase !== 'done') {
      if (typeof playBillChime === 'function' && soundEnabled) playBillChime();
    }
    lastPhase = game.phase;
  }

  function tap() {
    if (!game || game.type !== 'duel' || game.phase !== 'fight') return;
    if (!isMe(game.host) && !isMe(game.target)) return;
    taps[F.selfId] = (taps[F.selfId] || 0) + 1;
    F.send({ action: 'game_tap' });
    setBars(Object.assign({}, game.taps, taps));
    const now = performance.now();
    if (now - lastTapSound > 90 && typeof playClinkSound === 'function' && soundEnabled) { lastTapSound = now; playClinkSound(); }
  }

  F.on('game_state', (d) => {
    const fresh = !game || !d.game || game.id !== d.game.id;
    game = d.game;
    if (fresh) for (const k of Object.keys(taps)) delete taps[k];
    render();
    return true;
  });
  F.on('game_progress', (d) => {
    if (!game || game.id !== d.id) return true;
    game.taps = d.taps;
    // Số của mình lấy theo số liệu server (chính xác), của đối thủ cũng vậy.
    taps[F.selfId] = Math.max(taps[F.selfId] || 0, d.taps[F.selfId] || 0);
    setBars(Object.assign({}, d.taps, d.taps[F.selfId] !== undefined ? { [F.selfId]: taps[F.selfId] } : {}));
    return true;
  });
  F.on('game_notice', (d) => { F.toast(d.message, 'info', 4500); F.ticker(d.message); return true; });
  F.on('init', (d) => { if (d.game) { game = d.game; render(); } });
  F.on('karaoke_notice', (d) => { F.toast(d.message, 'info', 3500); return true; });  // báo lỗi/đặt bài từ hàng chờ karaoke

  // Đồng hồ đếm ngược + nhấn Space để gõ khi đang thi tửu lượng (chặn Space mặc định cụng ly).
  F.addTick(() => {
    if (!card || !game) return;
    const timer = card.querySelector('.fx-timer');
    if (timer) timer.textContent = secondsLeft(+timer.dataset.deadline) + 's';
    const count = card.querySelector('[data-count]');
    if (count) {
      const s = Math.ceil((+count.dataset.count - F.serverNow()) / 1000);
      count.textContent = s > 0 ? s : 'DÔ!';
      const btn = card.querySelector('[data-tap-btn]');
      if (btn && s <= 0) btn.disabled = false;
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!game || game.type !== 'duel' || game.phase !== 'fight' || e.target.closest('input, textarea')) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) tap();
    }
  }, true);

  // ------------------------------------------------------------ panel chọn trò
  function openGames() {
    F.openPanel('games', {
      title: 'Mini-game bàn nhậu', icon: '🎲',
      render: (body, api) => {
        if (!F.online) { body.append(h('p', { class: 'fx-empty', text: 'Cần kết nối phòng chơi để chơi cùng bạn bè.' })); return; }
        const others = F.otherPlayers();
        body.append(
          h('p', { class: 'fx-note', text: 'Thắng nhận XP, thua thì… uống! Mỗi lần chỉ có một ván trong quán.' }),
          h('div', { class: 'fx-card' },
            h('h4', { text: '🎲 Xúc xắc "thua thì uống"' }),
            h('p', { text: 'Mọi người cùng lắc 2 viên xúc xắc, tổng thấp nhất uống phạt. 2–8 người.' }),
            h('button', { type: 'button', class: 'fx-btn fx-primary', text: 'Mở ván xúc xắc', disabled: Boolean(game), onclick: () => { F.send({ action: 'game_open', game: 'dice' }); api.close(); } })),
          h('div', { class: 'fx-card' },
            h('h4', { text: '🥊 Thi tửu lượng 1-1' }),
            h('p', { text: 'Thách một người: 8 giây gõ nút "Dô" thật nhanh, ai gõ nhiều hơn thắng, người thua uống phạt.' }),
            others.length
              ? h('div', { class: 'fx-chips' }, others.map((o) => h('button', { type: 'button', class: 'fx-chip', disabled: Boolean(game), text: '⚔ ' + o.name, onclick: () => { F.send({ action: 'game_open', game: 'duel', target: o.id }); api.close(); } })))
              : h('p', { class: 'fx-empty', text: 'Chưa có ai khác trong phòng. Rủ bạn bè vào đã!' })),
          game ? h('p', { class: 'fx-banner-warn', text: 'Đang có một ván chạy, đợi xong rồi mở ván mới nhé.' }) : null);
      },
    });
  }

  F.onStart(() => {
    F.addMenuItem({ id: 'games', icon: '🎲', label: 'Mini-game', hint: 'Xúc xắc · Thi tửu lượng', order: 20, onClick: openGames });
    F.addKey('g', openGames);
  });
  F.games = { current: () => game };
})();

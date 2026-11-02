// ========================================================
// ROOMS - phòng có mã (4 ký tự), phòng riêng tư và danh sách phòng đang mở
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // bỏ các ký tự dễ nhầm: I L O 0 1

  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  }
  function cleanCode(value) { return value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24); }

  function goTo(code, isPrivate) {
    const params = new URLSearchParams(location.search);
    params.set('room', code);
    if (isPrivate) params.set('private', '1'); else params.delete('private');
    location.search = params.toString();
  }
  function inviteLink() {
    const params = new URLSearchParams(location.search);
    params.set('room', F.roomId);
    params.delete('private'); // người được mời không cần cờ tạo phòng
    return location.origin + location.pathname + '?' + params.toString();
  }

  function render(body, notice) {
    body.replaceChildren();
    const codeInput = h('input', { class: 'fx-input', maxlength: 24, placeholder: 'VD: K7QM', autocomplete: 'off', 'aria-label': 'Mã phòng', inputmode: 'text', autocapitalize: 'characters' });
    const privateBox = h('input', { type: 'checkbox', id: 'fxPrivate' });
    const list = h('div', { class: 'fx-roomlist' }, h('p', { class: 'fx-empty', text: 'Đang tìm phòng đang mở…' }));
    const room = F.roomId;
    const players = typeof remotePlayers !== 'undefined' ? remotePlayers.size + 1 : 1;
    const max = (F.limits && F.limits.max_players) || 12;

    body.append(
      notice ? h('p', { class: 'fx-banner-warn', text: notice }) : null,
      h('div', { class: 'fx-card fx-room-now' },
        h('div', {}, h('small', { text: 'Bạn đang ở phòng' }), h('strong', { class: 'fx-code', text: room.toUpperCase() }),
          h('small', { text: `${players}/${max} người${F.limits && F.limits.public === false ? ' · 🔒 riêng tư' : ''}` })),
        h('button', { type: 'button', class: 'fx-btn', text: '🔗 Sao chép link mời', onclick: () => {
          const link = inviteLink();
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(
            () => F.toast('Đã chép link mời. Gửi cho bạn bè nhé!', 'quest'),
            () => window.prompt('Sao chép link mời bạn bè:', link));
        } })),

      h('h4', { text: '➕ Tạo phòng mới' }),
      h('div', { class: 'fx-form' },
        h('label', { class: 'fx-check', for: 'fxPrivate' }, privateBox, ' Phòng riêng tư (không hiện trong danh sách)'),
        h('button', { type: 'button', class: 'fx-btn fx-primary', text: '🎲 Tạo phòng mã ngẫu nhiên', onclick: () => goTo(newCode(), privateBox.checked) })),

      h('h4', { text: '🔑 Vào bằng mã' }),
      h('form', { class: 'fx-form fx-inline', onsubmit: (e) => { e.preventDefault(); const code = cleanCode(codeInput.value); if (code) goTo(code, false); } },
        codeInput, h('button', { type: 'submit', class: 'fx-btn', text: 'Vào phòng' })),

      h('h4', { text: '🍻 Phòng đang mở' }), list);

    fetch(F.apiUrl('/api/rooms')).then((r) => r.json()).then((data) => {
      if (!body.isConnected) return;
      list.replaceChildren();
      const rooms = (data.rooms || []).filter((r) => r.id.toUpperCase() !== room.toUpperCase());
      if (!rooms.length) list.append(h('p', { class: 'fx-empty', text: 'Chưa có phòng nào khác đang mở. Tạo một phòng và rủ bạn bè!' }));
      rooms.forEach((r) => {
        const full = r.players >= r.max;
        list.append(h('div', { class: 'fx-row' },
          h('span', { class: 'fx-who' }, h('b', { text: r.id.toUpperCase() }), h('small', { text: `${r.players}/${r.max} người` })),
          h('button', { type: 'button', class: 'fx-btn fx-small', disabled: full, text: full ? 'Đầy' : 'Vào', onclick: () => goTo(r.id, false) })));
      });
    }).catch(() => {
      if (body.isConnected) list.replaceChildren(h('p', { class: 'fx-empty', text: 'Không tải được danh sách phòng (cần kết nối server).' }));
    });
  }

  F.openRooms = function (notice) {
    F.openPanel('rooms', { title: 'Phòng chơi', icon: '🚪', render: (body) => render(body, notice) });
  };

  // ---- Nhật ký chat: tin nhắn của mọi người trong quán hiện thành danh sách ở góc trái, tự mờ dần ----
  let feed = null;
  function pushFeed(name, text, isSelf) {
    if (!feed) return;
    const line = h('div', { class: 'fx-chat-line' + (isSelf ? ' is-self' : '') },
      h('b', { text: name + ': ' }), h('span', { text }));
    feed.append(line);
    while (feed.children.length > 7) feed.firstChild.remove();
    setTimeout(() => line.classList.add('is-old'), 14000);
    setTimeout(() => line.remove(), 20000);
  }
  F.on('chat_event', (d) => { pushFeed(d.member_name, d.text, d.member_id === F.selfId); });
  F.on('shout_event', (d) => { pushFeed(d.member_name, d.text, d.member_id === F.selfId); });

  F.onStart(() => {
    feed = h('div', { id: 'fx-chatlog', 'aria-live': 'polite', 'aria-label': 'Tin nhắn trong quán' });
    document.body.append(feed);
    F.addMenuItem({ id: 'rooms', icon: '🚪', label: 'Phòng chơi', hint: () => 'Mã: ' + F.roomId.toUpperCase(), order: 35, onClick: () => F.openRooms() });
  });
})();

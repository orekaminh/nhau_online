// ========================================================
// VOICE CHAT - WebRTC mesh, tín hiệu đi qua WebSocket sẵn có
// Server: voice_join / voice_leave / voice_signal  <->  voice_peers / voice_joined / voice_left / voice_signal
// ========================================================
(function () {
  'use strict';

  const F = window.Features;
  const h = F.h;
  const MAX_PEERS = 6;
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  const SPEAK_ON = 0.035, SPEAK_HOLD_MS = 280;
  const supported = typeof RTCPeerConnection !== 'undefined';
  const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  let wantActive = false;     // người dùng muốn ở trong voice (để tự vào lại khi mất kết nối)
  let joined = false;         // server đã biết mình ở trong voice
  let micOn = false;          // đang giữ stream micro
  let muted = false;
  let pttMode = false, pttDown = false;
  let muteOthers = false;
  let boostId = null;
  let localStream = null;
  let audioCtx = null;
  let lastAnalyse = 0;
  const peers = new Map();    // id -> { pc, audio, initiator, pendingIce, remoteSet, volume, state, analyser, lastLoud }
  const inVoice = new Set();  // các id (không gồm mình) đang ở trong voice
  const speaking = new Set();
  const selfAnalyser = { node: null, buf: null, lastLoud: 0 };
  let micBtn = null;

  // ---------------------------------------------------------- tiện ích
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function makeAnalyser(stream) {
    const c = ctx();
    if (!c) return null;
    try {
      const node = c.createAnalyser();
      node.fftSize = 256;
      c.createMediaStreamSource(stream).connect(node);
      return { node, buf: new Uint8Array(node.fftSize), lastLoud: 0 };
    } catch (_) { return null; }
  }
  function loudness(an) {
    an.node.getByteTimeDomainData(an.buf);
    let sum = 0;
    for (let i = 0; i < an.buf.length; i++) { const v = (an.buf[i] - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / an.buf.length);
  }
  function refreshUI() {
    if (micBtn) {
      micBtn.classList.toggle('is-on', wantActive);
      micBtn.classList.toggle('is-muted', micOn && effectiveMuted());
      micBtn.textContent = !wantActive ? '🎧' : (micOn ? (effectiveMuted() ? '🔇' : '🎙️') : '🎧');
      micBtn.title = !wantActive ? 'Bật voice chat (M)' : (micOn ? 'Bật/tắt tiếng mic (M)' : 'Đang nghe. Bấm để bật mic (M)');
    }
    const body = F.panelBody('voice');
    const dragging = document.activeElement && document.activeElement.type === 'range' && body && body.contains(document.activeElement);
    if (body && !dragging) renderPanel(body);
  }
  function effectiveMuted() { return muted || (pttMode && !pttDown); }
  function applyTrackState() {
    if (!localStream) return;
    const enabled = !effectiveMuted();
    localStream.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  }
  function applyVolumes() {
    const audible = typeof soundEnabled === 'undefined' || soundEnabled;
    peers.forEach((p, id) => {
      const base = muteOthers || !audible ? 0 : p.volume;
      const rel = boostId ? (id === boostId ? 1 : 0.7) : 1;
      p.audio.volume = Math.max(0, Math.min(1, base * rel));
    });
  }
  function setSpeaking(id, on) {
    if (on === speaking.has(id)) return;
    if (on) speaking.add(id); else speaking.delete(id);
    if (id === F.selfId && micBtn) micBtn.classList.toggle('is-speaking', on);
    if (typeof playerHUDTags !== 'undefined') {
      const tag = playerHUDTags.get(id);
      if (tag && tag.nameElem) tag.nameElem.classList.toggle('fx-speaking', on);
    }
  }

  // ---------------------------------------------------------- kết nối ngang hàng
  function closePeer(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    try { p.pc.close(); } catch (_) { /* đã đóng */ }
    p.audio.srcObject = null;
    p.audio.remove();
    setSpeaking(id, false);
  }
  function closeAllPeers() { [...peers.keys()].forEach(closePeer); }

  function createPeer(id, initiator) {
    const pc = new RTCPeerConnection(ICE);
    const audio = h('audio', { autoplay: true, playsinline: true });
    audio.style.display = 'none';
    const dock = document.getElementById('fx-dock');
    (dock || document.body).append(audio);
    const p = { pc, audio, initiator, pendingIce: [], remoteSet: false, volume: 1, state: 'connecting', analyser: null };
    peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) F.send({ action: 'voice_signal', to: id, data: { candidate: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      audio.srcObject = stream;
      audio.play().catch(() => {});
      p.analyser = makeAnalyser(stream);
      applyVolumes();
    };
    pc.onconnectionstatechange = () => {
      p.state = pc.connectionState;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (peers.get(id) === p) { closePeer(id); refreshUI(); }
      } else refreshUI();
    };
    if (localStream) localStream.getAudioTracks().forEach((t) => pc.addTrack(t, localStream));
    else if (initiator) pc.addTransceiver('audio', { direction: 'recvonly' });
    applyVolumes();
    return p;
  }

  async function sendOffer(id) {
    const p = createPeer(id, true);
    try {
      await p.pc.setLocalDescription(await p.pc.createOffer());
      F.send({ action: 'voice_signal', to: id, data: { sdp: { type: p.pc.localDescription.type, sdp: p.pc.localDescription.sdp } } });
    } catch (err) { console.warn('[voice] offer', err); closePeer(id); }
  }

  async function onSignal(from, data) {
    if (!joined || !data || typeof data !== 'object') return;
    let p = peers.get(from);
    try {
      if (data.sdp && data.sdp.type === 'offer') {
        if (p && p.initiator && p.pc.signalingState === 'have-local-offer') {
          if (F.selfId < from) return;           // glare: id nhỏ hơn làm bên đề nghị, bỏ offer của đối phương
          closePeer(from); p = null;
        }
        if (!p) {
          if (peers.size >= MAX_PEERS) return;
          p = createPeer(from, false);
        }
        await p.pc.setRemoteDescription(data.sdp);
        p.remoteSet = true;
        // Có mic mà peer được tạo từ offer: thêm track trước khi trả lời.
        if (localStream && !p.pc.getSenders().some((s) => s.track)) {
          localStream.getAudioTracks().forEach((t) => p.pc.addTrack(t, localStream));
        }
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        F.send({ action: 'voice_signal', to: from, data: { sdp: { type: p.pc.localDescription.type, sdp: p.pc.localDescription.sdp } } });
        await flushIce(p);
      } else if (data.sdp && data.sdp.type === 'answer' && p) {
        if (p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription(data.sdp);
        p.remoteSet = true;
        await flushIce(p);
      } else if (data.candidate && p) {
        if (p.remoteSet) await p.pc.addIceCandidate(data.candidate).catch(() => {});
        else if (p.pendingIce.length < 64) p.pendingIce.push(data.candidate);
      }
    } catch (err) { console.warn('[voice] signal', err); }
  }
  async function flushIce(p) {
    const queued = p.pendingIce.splice(0);
    for (const c of queued) await p.pc.addIceCandidate(c).catch(() => {});
  }

  // ---------------------------------------------------------- vào / rời
  async function acquireMic() {
    if (!hasMic) { F.toast('Trình duyệt này không hỗ trợ micro. Bạn vẫn nghe được mọi người.', 'info'); return false; }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micOn = true;
      selfAnalyser.node = null;
      const an = makeAnalyser(localStream);
      if (an) Object.assign(selfAnalyser, an);
      applyTrackState();
      return true;
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      F.toast(denied ? 'Chưa được cấp quyền micro (cần HTTPS hoặc localhost). Chuyển sang chế độ chỉ nghe 🎧.'
        : 'Không mở được micro. Chuyển sang chế độ chỉ nghe 🎧.', 'info', 5000);
      return false;
    }
  }
  function releaseMic() {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null; micOn = false; selfAnalyser.node = null;
    setSpeaking(F.selfId, false);
  }

  async function join(withMic) {
    if (!supported) { F.toast('Trình duyệt chưa hỗ trợ voice chat (WebRTC).', 'info'); return; }
    if (!F.online) { F.toast('Chưa kết nối phòng chơi nên chưa vào voice được.', 'info'); return; }
    ctx();
    if (withMic && !micOn) await acquireMic();
    wantActive = true;
    if (!joined) { joined = true; F.send({ action: 'voice_join' }); }
    refreshUI();
  }
  function leave(sendLeave = true) {
    wantActive = false;
    if (joined && sendLeave && F.online) F.send({ action: 'voice_leave' });
    joined = false;
    closeAllPeers();
    inVoice.clear();
    releaseMic();
    refreshUI();
  }
  // Nâng cấp từ "nghe" lên "mic": đóng peer cũ rồi vào lại để thương lượng track mới.
  async function upgradeToMic() {
    if (micOn) { muted = !muted; applyTrackState(); refreshUI(); return; }
    if (!await acquireMic()) { refreshUI(); return; }
    if (joined) { F.send({ action: 'voice_leave' }); closeAllPeers(); joined = false; }
    joined = true;
    wantActive = true;
    F.send({ action: 'voice_join' });
    refreshUI();
  }
  function toggleQuick() {
    if (!wantActive) join(true);
    else if (!micOn) upgradeToMic();
    else { muted = !muted; applyTrackState(); F.toast(muted ? '🔇 Đã tắt tiếng mic' : '🎙️ Mic đang bật', 'info', 1800); refreshUI(); }
  }

  // ---------------------------------------------------------- tin nhắn từ server
  F.on('voice_peers', (d) => {
    const ids = (Array.isArray(d.peers) ? d.peers : []).filter((id) => id !== F.selfId);
    ids.forEach((id) => inVoice.add(id));
    if (ids.length > MAX_PEERS) {
      F.toast('Phòng voice đã đủ ' + MAX_PEERS + ' người, mình chưa thể vào.', 'info');
      leave(true);
      return;
    }
    ids.forEach(sendOffer);
    refreshUI();
  });
  F.on('voice_joined', (d) => { inVoice.add(d.id); refreshUI(); });
  F.on('voice_left', (d) => { inVoice.delete(d.id); closePeer(d.id); refreshUI(); });
  F.on('voice_signal', (d) => { onSignal(d.from, d.data); return true; });

  // ---------------------------------------------------------- giao diện
  function renderPanel(body) {
    body.replaceChildren();
    const status = !supported ? 'Trình duyệt chưa hỗ trợ WebRTC.'
      : !wantActive ? 'Bạn chưa vào voice.'
        : micOn ? (effectiveMuted() ? '🔇 Mic đang tắt tiếng' : '🎙️ Mic đang bật') : '🎧 Đang ở chế độ chỉ nghe';
    body.append(h('p', { class: 'fx-voice-status', text: status }));
    const row = h('div', { class: 'fx-voice-actions' });
    if (!wantActive) {
      row.append(h('button', { class: 'fx-btn', type: 'button', text: '🎧 Nghe', onclick: () => join(false) }),
        h('button', { class: 'fx-btn fx-primary', type: 'button', text: '🎙️ Bật mic', onclick: () => join(true) }));
    } else {
      row.append(micOn
        ? h('button', { class: 'fx-btn', type: 'button', text: muted ? '🔈 Bỏ tắt tiếng' : '🔇 Tắt tiếng mic', onclick: () => { muted = !muted; applyTrackState(); refreshUI(); } })
        : h('button', { class: 'fx-btn fx-primary', type: 'button', text: '🎙️ Bật mic', onclick: upgradeToMic }),
        h('button', { class: 'fx-btn', type: 'button', text: '🚪 Rời voice', onclick: () => leave(true) }));
    }
    body.append(row);
    body.append(h('label', { class: 'fx-voice-check' },
      h('input', { type: 'checkbox', checked: pttMode, onchange: (e) => { pttMode = e.target.checked; applyTrackState(); refreshUI(); } }),
      ' Nhấn giữ phím T để nói'));
    body.append(h('label', { class: 'fx-voice-check' },
      h('input', { type: 'checkbox', checked: muteOthers, onchange: (e) => { muteOthers = e.target.checked; applyVolumes(); } }),
      ' Tắt tiếng mọi người'));
    const list = h('ul', { class: 'fx-voice-list' });
    const ids = [...inVoice];
    if (!ids.length) list.append(h('li', { class: 'fx-voice-empty', text: wantActive ? 'Chưa có ai khác trong voice.' : 'Vào voice để nói chuyện với anh em.' }));
    for (const id of ids) {
      const p = peers.get(id);
      const li = h('li', { class: speaking.has(id) ? 'is-speaking' : '' },
        h('span', { class: 'fx-voice-name', text: (speaking.has(id) ? '🗣️ ' : '🔊 ') + F.playerName(id) }),
        h('small', { text: p ? (p.state === 'connected' ? 'đã kết nối' : 'đang nối…') : 'chờ nối' }));
      if (p) {
        li.append(h('input', {
          type: 'range', min: 0, max: 100, value: Math.round(p.volume * 100), 'aria-label': 'Âm lượng ' + F.playerName(id),
          oninput: (e) => { p.volume = e.target.value / 100; applyVolumes(); },
        }));
      }
      list.append(li);
    }
    body.append(list);
    body.append(h('p', { class: 'fx-voice-note', text: 'Micro chỉ hoạt động trên HTTPS hoặc localhost và cần bạn cấp quyền. Mạng quá chặt (4G doanh nghiệp, NAT đối xứng) có thể không nối được. Tối đa ' + MAX_PEERS + ' người nói cùng lúc.' }));
  }

  F.addMenuItem({
    id: 'voice', icon: '🎙️', order: 40, label: 'Voice chat',
    hint: () => (wantActive ? (micOn ? 'Đang bật mic' : 'Đang nghe') : 'Nói chuyện trực tiếp'),
    onClick: () => F.openPanel('voice', { title: 'Voice chat', icon: '🎙️', render: renderPanel }),
  });
  F.addKey('m', toggleQuick);

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 't' || e.repeat || !pttMode || pttDown) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    pttDown = true; applyTrackState(); refreshUI();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() !== 't' || !pttDown) return;
    pttDown = false; applyTrackState(); refreshUI();
  });
  window.addEventListener('beforeunload', () => {
    if (joined && F.online) F.send({ action: 'voice_leave' });
    releaseMic();
  });

  F.onStart(() => {
    if (!supported) return;
    micBtn = h('button', { id: 'fx-mic', type: 'button', 'aria-label': 'Voice chat', text: '🎧', onclick: toggleQuick });
    const dock = document.getElementById('fx-dock');
    (dock || document.body).append(micBtn);
    refreshUI();
  });

  F.addTick((dt, t) => {
    if (!wantActive && !peers.size) return;
    // Mất kết nối WebSocket: dọn peer, tự vào lại khi có mạng.
    if (!F.online) {
      if (joined) { joined = false; closeAllPeers(); inVoice.clear(); refreshUI(); }
      return;
    }
    if (wantActive && !joined) { joined = true; F.send({ action: 'voice_join' }); }
    if (t - lastAnalyse < 0.1) return;
    lastAnalyse = t;
    applyVolumes();
    const now = performance.now();
    let changed = false;
    if (selfAnalyser.node && micOn) {
      if (!effectiveMuted() && loudness(selfAnalyser) > SPEAK_ON) selfAnalyser.lastLoud = now;
      const on = now - selfAnalyser.lastLoud < SPEAK_HOLD_MS;
      if (on !== speaking.has(F.selfId)) { setSpeaking(F.selfId, on); changed = true; }
    }
    peers.forEach((p, id) => {
      if (!p.analyser) return;
      if (loudness(p.analyser) > SPEAK_ON) p.analyser.lastLoud = now;
      const on = now - p.analyser.lastLoud < SPEAK_HOLD_MS && p.audio.volume > 0;
      if (on !== speaking.has(id)) { setSpeaking(id, on); changed = true; }
    });
    if (changed && F.isPanelOpen('voice')) refreshUI();
  });

  F.voice = {
    get active() { return wantActive; },
    get micOn() { return micOn && !effectiveMuted(); },
    peers() {
      return [...peers.entries()].map(([id, p]) => ({ id, name: F.playerName(id), state: p.state, volume: p.volume, speaking: speaking.has(id) }));
    },
    speaking,
    setSingerBoost(id) { boostId = id || null; applyVolumes(); },
    join, leave,
  };
})();

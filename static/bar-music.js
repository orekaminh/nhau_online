// Nhạc riêng cho từng quán bar ở phố Bùi Viện: tổng hợp bằng Web Audio (không cần file âm thanh).
// Mỗi quán một thể loại; chỉ 3 quán gần người chơi nhất được phát, âm lượng/độ "trong" giảm theo khoảng cách.
// Nhịp dùng lưới thời gian chung của AudioContext nên các quán cùng nhịp và loa nhún đúng beat.
(function () {
  'use strict';

  const MAX_ACTIVE = 3;
  const RANGE = 26;          // mét: xa hơn thì im
  const LOOKAHEAD = 0.3;     // giây lên lịch trước
  const bars = [];
  let ctx = null, master = null, noiseBuf = null, unlocked = false, timer = 0, lastAnnounced = null;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const lite = () => typeof PERF !== 'undefined' && PERF.lite;

  // ---------- Âm thanh cơ bản ----------
  function ensureCtx() {
    if (ctx) return ctx;
    if (!unlocked || typeof getAudioContext !== 'function') return null;
    ctx = getAudioContext();
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    for (const bar of bars) buildChain(bar);
    return ctx;
  }
  function buildChain(bar) {
    if (bar.input || !ctx) return;
    bar.input = ctx.createGain();
    bar.filter = ctx.createBiquadFilter();
    bar.filter.type = 'lowpass';
    bar.filter.frequency.value = 800;
    bar.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    bar.vol = ctx.createGain();
    bar.vol.gain.value = 0;
    bar.input.connect(bar.filter);
    let node = bar.filter;
    if (bar.pan) { node.connect(bar.pan); node = bar.pan; }
    node.connect(bar.vol);
    bar.vol.connect(master);
  }

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(bar, t, freq, dur, type, vol, opts) {
    const o = opts || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.detune) osc.detune.value = o.detune;
    env(g, t, vol, o.attack || 0.005, dur);
    let node = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.cutoff;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(bar.input);
    osc.start(t); osc.stop(t + (o.attack || 0.005) + dur + 0.05);
  }
  function kick(bar, t, vol) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, vol, 0.002, 0.34);
    osc.connect(g); g.connect(bar.input);
    osc.start(t); osc.stop(t + 0.42);
  }
  function noise(bar, t, vol, dur, filterType, freq) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = filterType; f.frequency.value = freq;
    env(g, t, vol, 0.002, dur);
    src.connect(f); f.connect(g); g.connect(bar.input);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  const hat = (bar, t, vol, open) => noise(bar, t, vol, open ? 0.22 : 0.05, 'highpass', 7500);
  const clap = (bar, t, vol) => { noise(bar, t, vol, 0.16, 'bandpass', 1700); noise(bar, t + 0.012, vol * 0.7, 0.12, 'bandpass', 1500); };
  function conga(bar, t, vol, high) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 330 : 210, t);
    osc.frequency.exponentialRampToValueAtTime(high ? 240 : 150, t + 0.1);
    env(g, t, vol, 0.002, 0.18);
    osc.connect(g); g.connect(bar.input);
    osc.start(t); osc.stop(t + 0.25);
  }

  // ---------- Các thể loại (mỗi hàm = một bước 1/16) ----------
  const STYLES = {
    edm: {
      label: 'EDM / House', bpm: 124,
      prog: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
      step(bar, i, t) {
        const ch = this.prog[(i >> 4) & 3], s = i % 16;
        if (s % 4 === 0) kick(bar, t, 0.95);
        if (s % 4 === 2) { hat(bar, t, 0.22, true); tone(bar, t, mtof(ch[0] - 24), 0.2, 'sawtooth', 0.28, { cutoff: 520 }); }
        if (s % 8 === 4) clap(bar, t, 0.3);
        if (!lite() || s % 2 === 0) tone(bar, t, mtof(ch[[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0)), 0.12, 'sawtooth', 0.09, { cutoff: 2600, detune: s % 2 ? 7 : -7 });
      }
    },
    vinahouse: {
      label: 'Nhạc sàn Vinahouse', bpm: 142,
      lead: [0, -1, 2, -1, 3, 2, -1, 1, 0, -1, 2, 3, 4, 3, 2, -1], scale: [69, 72, 74, 76, 79],
      step(bar, i, t) {
        const s = i % 16;
        if (s % 4 === 0 || s === 14) kick(bar, t, 1.0);
        if (s % 8 === 4) clap(bar, t, 0.34);
        if (s % 2 === 0) hat(bar, t, 0.16, false);
        if (s % 4 === 2) tone(bar, t, mtof(45), 0.18, 'sine', 0.5);
        const n = this.lead[s];
        if (n >= 0) tone(bar, t, mtof(this.scale[n] + ((i >> 4) % 4 === 3 ? 12 : 0)), 0.13, 'square', 0.1, { cutoff: 3200 });
      }
    },
    lounge: {
      label: 'Chill Lounge / Shisha', bpm: 92,
      prog: [[52, 55, 59, 62], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
      step(bar, i, t) {
        const ch = this.prog[(i >> 4) & 3], s = i % 16, d = 60 / this.bpm / 4;
        if (s === 0 || s === 10) kick(bar, t, 0.7);
        if (s % 8 === 4) noise(bar, t, 0.2, 0.05, 'highpass', 3000);
        if (s % 2 === 0) hat(bar, t, 0.07, false);
        if (s === 0) for (const n of ch) tone(bar, t, mtof(n), d * 15, 'triangle', 0.16, { attack: 0.5, cutoff: 1800 });
        if (s === 0 || s === 6 || s === 10) tone(bar, t, mtof(ch[0] - 12), d * 3, 'sine', 0.45);
        if (!lite() && (s === 3 || s === 11)) tone(bar, t, mtof(ch[(s >> 2) % 4] + 12), 0.5, 'sine', 0.08);
      }
    },
    reggae: {
      label: 'Reggae / Acoustic', bpm: 98,
      roots: [48, 53, 55, 48],
      step(bar, i, t) {
        const root = this.roots[(i >> 4) & 3], s = i % 16;
        if (s === 8) { kick(bar, t, 0.8); noise(bar, t, 0.25, 0.14, 'bandpass', 1900); }
        if (s % 2 === 0) hat(bar, t, 0.1, false);
        if (s % 4 === 2) for (const n of [0, 4, 7]) tone(bar, t, mtof(root + 12 + n), 0.11, 'square', 0.07, { cutoff: 1900 });
        if ([0, 3, 6, 8, 11, 14].includes(s)) tone(bar, t, mtof(root - 12 + (s === 6 || s === 14 ? 7 : 0)), 0.22, 'triangle', 0.5);
      }
    },
    bolero: {
      label: 'Nhạc vàng / Bolero', bpm: 76,
      prog: [[57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]],
      step(bar, i, t) {
        const ch = this.prog[(i >> 4) & 3], s = i % 16;
        if ([4, 10, 12].includes(s)) conga(bar, t, 0.5, false);
        if ([6, 14].includes(s)) conga(bar, t, 0.38, true);
        if (s % 2 === 1) noise(bar, t, 0.05, 0.04, 'highpass', 6500);
        if (s % 2 === 0) tone(bar, t, mtof(ch[[0, 1, 2, 1, 0, 1, 2, 1][s >> 1]] + 12), 0.55, 'triangle', 0.2, { cutoff: 2800 });
        if (s % 8 === 0) tone(bar, t, mtof(ch[0] - 24), 0.6, 'triangle', 0.5);
      }
    }
  };

  // ---------- Điều phối ----------
  function stepDur(bar) { return 60 / STYLES[bar.style].bpm / 4; }
  function schedule() {
    if (!ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const bar of bars) {
      if (!bar.active) continue;
      const sd = stepDur(bar);
      while (bar.nextTime < horizon) {
        try { STYLES[bar.style].step(bar, bar.stepIdx, bar.nextTime); } catch (e) { /* bỏ qua một bước lỗi */ }
        bar.stepIdx++;
        bar.nextTime = bar.stepIdx * sd;
      }
    }
  }
  function updateMix() {
    if (!ensureCtx() || typeof localPlayerState === 'undefined') return;
    const quiet = document.hidden || (typeof soundEnabled !== 'undefined' && !soundEnabled);
    const near = bars.map(b => ({ b, d: Math.hypot(localPlayerState.x - b.x, localPlayerState.z - b.z) }))
      .filter(e => e.d < RANGE).sort((a, c) => a.d - c.d).slice(0, MAX_ACTIVE);
    const chosen = new Set(quiet ? [] : near.map(e => e.b));
    const now = ctx.currentTime;
    for (const bar of bars) {
      buildChain(bar);
      const e = near.find(n => n.b === bar);
      if (chosen.has(bar)) {
        if (!bar.active) {
          bar.active = true;
          bar.stepIdx = Math.ceil(now / stepDur(bar)) + 1;
          bar.nextTime = bar.stepIdx * stepDur(bar);
        }
        const k = Math.pow(1 - e.d / RANGE, 1.6);
        bar.vol.gain.setTargetAtTime(k * 0.9, now, 0.25);
        bar.filter.frequency.setTargetAtTime(500 + k * 7000, now, 0.25);
        if (bar.pan) bar.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (bar.x - localPlayerState.x) / 14)), now, 0.2);
      } else if (bar.active) {
        bar.vol.gain.setTargetAtTime(0, now, 0.15);
        bar.active = false;   // đã lên lịch lố vài nốt: tắt dần theo gain
      }
    }
    // Báo tên quán khi người chơi lại gần
    const top = near[0];
    if (top && top.d < 9 && !quiet) {
      if (lastAnnounced !== top.b.id) {
        lastAnnounced = top.b.id;
        if (typeof setTicker === 'function') setTicker(`🎵 ${top.b.name} đang bật ${STYLES[top.b.style].label}`);
      }
    } else if (!top || top.d > 14) lastAnnounced = null;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureCtx();
    clearInterval(timer);
    timer = setInterval(schedule, 60);
    setInterval(updateMix, 200);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { once: false, passive: true }));

  window.BarMusic = {
    styles: STYLES,
    register(info) {
      bars.push({ id: info.id, name: info.name, style: info.style, x: info.x, z: info.z, active: false, stepIdx: 0, nextTime: 0 });
      if (ctx) buildChain(bars[bars.length - 1]);
    },
    // 0..1: xung theo nhịp kick (cho loa nhún); chưa có âm thanh thì giả lập theo đồng hồ.
    pulse(id, t) {
      const bar = bars.find(b => b.id === id);
      const bpm = bar ? STYLES[bar.style].bpm : 120;
      const clock = ctx && ctx.state === 'running' ? ctx.currentTime : t;
      const beat = (clock * bpm / 60) % 1;
      return Math.exp(-beat * 5);
    }
  };
})();

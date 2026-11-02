// ========================================================
// KARAOKE 69 VIP - nhạc nền tổng hợp (Web Audio), lời chạy theo từ,
// màn hình LED 3D trên mặt tiền, hàng đợi đồng bộ cả phòng.
// Không cần file âm thanh: nhịp là hàm thuần của chỉ số bước (step),
// nên người vào muộn vẫn hát được từ giữa bài.
// ========================================================
(function () {
  'use strict';
  const F = window.Features;
  const h = F.h;

  // ---------------------------------------------------------------- hằng số
  const DOOR = { x: 23.5, z: 2.5 };      // tiếng nhạc phát ra từ cửa quán
  const SCREEN = { x: 24, y: 3.0, z: 4.06, w: 8, h: 2.6 };
  const STEPS_PER_BEAT = 4;
  const LOOKAHEAD = 0.45;
  const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] };
  const PENTA = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10] };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lite = () => Boolean(window.PUB_PERF && window.PUB_PERF.lite);

  // ---------------------------------------------------------------- phong cách nhạc
  // k/s/h: 16 ô (mỗi ô = 1/16 nhịp ô), 'x' mạnh, 'o' nhẹ.
  const STYLES = {
    ska: {
      k: 'x...x...x...x...', s: '....x.......x...', h: 'o.x.o.x.o.x.o.x.',
      ch: [{ steps: [2, 6, 10, 14], len: 2, type: 'pluck', vol: 0.5 }],
      bass: [[0, 'r', 3], [4, '5', 3], [8, 'r', 3], [12, '5', 3]], bassWave: 'triangle',
      lead: [0, 4, 6, 8, 12, 14], leadVol: 0.06, mix: 1,
    },
    ballad: {
      k: 'x.........x.....', s: '........x.......', h: '..o...o...o...o.',
      ch: [{ steps: [0], len: 16, type: 'pad', vol: 0.6 }, { steps: [0, 4, 8, 12], len: 3, type: 'pluck', vol: 0.22 }],
      bass: [[0, 'r', 8], [8, '5', 8]], bassWave: 'triangle',
      lead: [0, 6, 8, 12], leadVol: 0.07, mix: 0.9,
    },
    bolero: {
      k: 'x.......x.......', s: '......x.....x...', h: 'x.o.x.o.x.o.x.o.',
      ch: [{ steps: [4, 6, 12, 14], len: 2, type: 'pluck', vol: 0.45 }, { steps: [0], len: 16, type: 'pad', vol: 0.3 }],
      bass: [[0, 'r', 6], [8, '5', 6], [12, 'r', 3]], bassWave: 'triangle',
      lead: [0, 3, 6, 8, 11, 14], leadVol: 0.065, mix: 0.95,
    },
    edm: {
      k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.',
      ch: [{ steps: [0], len: 16, type: 'pad', vol: 0.5 }, { steps: [0, 3, 6, 10, 12], len: 2, type: 'pluck', vol: 0.32 }],
      bass: [[2, 'r', 1], [6, 'r', 1], [10, 'r', 1], [14, 'r', 1]], bassWave: 'sawtooth',
      lead: [0, 2, 4, 6, 8, 10, 12, 14], leadVol: 0.05, mix: 1,
    },
    lounge: {
      k: 'x.......x.o.....', s: '................', h: '..o...o...o...o.',
      ch: [{ steps: [0], len: 16, type: 'pad', vol: 0.7 }],
      bass: [[0, 'r', 4], [4, '5', 4], [8, 'r', 4], [12, 'o', 4]], bassWave: 'triangle',
      lead: [0, 6, 10], leadVol: 0.035, mix: 0.55,
    },
  };

  // ---------------------------------------------------------------- bài hát gốc (lời do mình viết)
  const DO_V1 = ['Tối nay anh em mình tụ họp vỉa hè', 'Ly bia mát lạnh sủi bọt tràn đầy', 'Mồi khô đậu phộng bày đầy một bàn', 'Tiếng cười vang lên rộn ràng cả phố'];
  const DO_C = ['Dô dô dô dô cạn ly cho đã', 'Một hai ba dô đừng có nhấp môi', 'Dô dô dô dô say thì ngủ đỡ', 'Mai lo chuyện mai tối nay cứ vui'];
  const DO_V2 = ['Chú ơi cho thêm một dĩa bò né', 'Anh em chung tay rót đầy ly này', 'Ai say thì tựa vai bạn thân nhé', 'Ai còn tỉnh thì kêu thêm ly nữa'];
  const DO_B = ['Trà đá chanh ơi cứu anh một chút', 'Rồi mình tiếp tục dô thêm vòng nữa'];

  const SG_V1 = ['Đèn đường vàng loang trên mặt phố ướt', 'Xe máy chạy qua nghe lòng bồi hồi', 'Ly bia lạnh ngắt anh ngồi một mình', 'Nhớ về những ngày thơ ngây xa xôi'];
  const SG_C = ['Ôi Sài Gòn đêm nay anh còn thức', 'Vỉa hè quen thuộc có bạn bên đời', 'Nâng ly lên nào cho mình đỡ nhớ', 'Đêm dài mấy cũng có anh em cùng'];
  const SG_V2 = ['Mưa rơi bất chợt anh em chạy vội', 'Mái hiên quán nhỏ nụ cười lại tươi', 'Chuyện đời bao nhiêu kể hoài chưa hết', 'Ly cạn lại đầy như là tình mình'];

  const CS_V1 = ['Quán nhỏ bên đường đèn vàng hiu hắt', 'Chén rượu nồng cay anh uống một mình', 'Hỏi ai thương nhớ ai nơi xa ấy', 'Để lòng anh say giữa đêm vắng tanh'];
  const CS_C = ['Say say say chén này anh say', 'Say cho quên hết những ngày buồn đau', 'Mai tỉnh dậy anh lại cười như thường', 'Cạn chén tình quê anh em bên nhau'];
  const CS_V2 = ['Bạn cũ ghé qua vỗ vai hỏi nhỏ', 'Dạo này ra sao còn nhớ quê nhà', 'Gắp miếng khô mực nướng thơm mùi biển', 'Chuyện xưa kể lại mắt cay cay rồi'];

  const NL_V1 = ['Alo alo anh em ơi tới chưa', 'Bàn ghế nhựa đây bia đá đủ đầy', 'Mồi ngon nướng sẵn khói bay thơm phức', 'Tối nay quẩy lên không say không về'];
  const NL_C = ['Nhậu là dzui dzui dzui dzui', 'Cụng ly là phải thật to', 'Nhậu là dzui dzui dzui dzui', 'Một hai ba dô dô dô dô'];
  const NL_V2 = ['Em PG cười tươi rót bia thật đầy', 'Karaoke bên cạnh hát vang cả đường', 'Ai chạy vô WC nhớ chốt cửa nhé', 'Về nhà đừng quên nhắn tin cho vợ'];

  const TRACKS = [
    {
      id: 'do-do-do', title: 'Dô Dô Dô Cạn Ly', artist: 'Ban nhạc Vỉa Hè', bpm: 120, tonic: 48, scale: 'maj', style: 'ska', seed: 11,
      prog: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
      lyrics: [...DO_V1, ...DO_C, ...DO_V2, ...DO_C, ...DO_B, ...DO_C],
    },
    {
      id: 'dem-sai-gon', title: 'Đêm Sài Gòn Vỉa Hè', artist: 'Tâm Sự Quán Khuya', bpm: 78, tonic: 45, scale: 'min', style: 'ballad', seed: 23,
      prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
      lyrics: [...SG_V1, ...SG_C, ...SG_V2, ...SG_C, 'Sài Gòn ơi đêm nay xin ở lại'],
    },
    {
      id: 'chen-say', title: 'Chén Say Quán Nhỏ', artist: 'Bolero Ghế Nhựa', bpm: 92, tonic: 50, scale: 'min', style: 'bolero', seed: 37,
      prog: [[0, 'min'], [5, 'min'], [7, 'dom7'], [0, 'min']],
      lyrics: [...CS_V1, ...CS_C, ...CS_V2, ...CS_C, 'Chén cuối xin dành cho tình bạn mình'],
    },
    {
      id: 'nhau-la-dzui', title: 'Nhậu Là Dzui', artist: 'DJ Bia Hơi', bpm: 130, tonic: 45, scale: 'min', style: 'edm', seed: 41,
      prog: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
      lyrics: [...NL_V1, ...NL_C, ...NL_V2, ...NL_C, ...NL_C],
    },
  ];
  const LOUNGE = {
    id: 'lounge', title: 'Nhạc nền quán', bpm: 72, tonic: 50, scale: 'maj', style: 'lounge', seed: 5, loop: true,
    prog: [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']], introBeats: 0, outroBeats: 0, lineBeats: 8, lyrics: [],
  };

  // ---------------------------------------------------------------- bộ tạo nhịp thuần (không dùng Web Audio)
  function hash01(n) {
    let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function totalBeats(t) {
    const intro = t.introBeats === undefined ? 8 : t.introBeats;
    const outro = t.outroBeats === undefined ? 8 : t.outroBeats;
    return intro + t.lyrics.length * (t.lineBeats || 8) + outro;
  }

  // Các sự kiện âm thanh tại bước `step` (1 bước = 1/4 phách).
  function stepEvents(track, step) {
    const ev = [];
    if (step < 0) return ev;
    const style = STYLES[track.style];
    if (!track.loop && step >= totalBeats(track) * STEPS_PER_BEAT) return ev;
    const bar = Math.floor(step / 16), si = step % 16;
    const lastBar = !track.loop && step >= (totalBeats(track) - 4) * STEPS_PER_BEAT;
    const chord = track.prog[bar % track.prog.length];
    const root = track.tonic + chord[0];
    const tones = QUAL[chord[1]];
    const drums = bar > 0 || track.loop;     // ô nhịp đầu chỉ có hợp âm cho dễ vào bài

    if (drums && (!lastBar || si === 0)) {
      const k = style.k[si], s = style.s[si];
      if (k !== '.') ev.push({ inst: 'kick', vel: k === 'x' ? 1 : 0.5 });
      if (s !== '.') ev.push({ inst: track.style === 'edm' ? 'clap' : 'snare', vel: s === 'x' ? 1 : 0.5 });
    }
    if (drums && !lastBar) {
      const hv = style.h[si];
      if (hv !== '.') ev.push({ inst: 'hat', vel: hv === 'x' ? 1 : 0.5, open: track.style === 'edm' });
    }
    for (const b of style.bass) {
      if (b[0] !== si) continue;
      const n = b[1] === 'r' ? root : b[1] === '5' ? root + 7 : root + 12;
      ev.push({ inst: 'bass', note: n, beats: b[2] / STEPS_PER_BEAT * (track.style === 'ballad' ? 2 : 1) });
    }
    for (const layer of style.ch) {
      if (!layer.steps.includes(si)) continue;
      ev.push({ inst: layer.type, notes: tones.map((i) => root + 12 + i), beats: layer.len / STEPS_PER_BEAT, vol: layer.vol });
    }
    if (bar > 0 && !lastBar && style.lead.includes(si)) {
      const scale = PENTA[track.scale];
      const idx = 5 + Math.floor(hash01(track.seed * 977 + step) * 5) - 2;
      const note = track.tonic + 24 + scale[idx % 5] + 12 * Math.floor(idx / 5) - 12;
      ev.push({ inst: 'lead', note, beats: 0.5, vol: style.leadVol });
    }
    return ev;
  }

  // ---------------------------------------------------------------- lời bài hát -> thời gian (giây)
  const toWords = (text) => String(text).split(/\s+/).filter(Boolean);

  function songFromTrack(t) {
    const spb = 60 / t.bpm;
    const intro = t.introBeats === undefined ? 8 : t.introBeats;
    const lineBeats = t.lineBeats || 8;
    const lines = t.lyrics.map((text, i) => ({
      t0: (intro + i * lineBeats) * spb, t1: (intro + (i + 1) * lineBeats) * spb, text, words: toWords(text),
    }));
    return { id: t.id, title: t.title, artist: t.artist, kind: 'synth', bpm: t.bpm, track: t, lines, duration: Math.ceil(totalBeats(t) * spb) };
  }

  function parseLrc(text) {
    const rows = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!tags.length) continue;
      const lyric = raw.replace(/\[[^\]]*\]/g, '').trim();
      for (const m of tags) rows.push({ t: Number(m[1]) * 60 + Number(m[2]), text: lyric });
    }
    rows.sort((a, b) => a.t - b.t);
    const lines = [];
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      const end = next ? next.t : r.t + 4;
      if (!r.text) { if (lines.length) lines[lines.length - 1].t1 = Math.min(lines[lines.length - 1].t1, r.t); return; }
      lines.push({ t0: r.t, t1: end, text: r.text, words: toWords(r.text) });
    });
    return lines;
  }

  // Vị trí lời tại thời điểm t: dòng hiện tại, từ hiện tại và phần đã hát của từ đó.
  function lyricAt(song, t) {
    const lines = song ? song.lines : [];
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].t0 <= t) idx = i; else break; }
    if (idx < 0) return { idx: -1, wordIdx: 0, frac: 0, countdown: lines.length ? Math.max(0, lines[0].t0 - t) : 0 };
    const line = lines[idx];
    if (t >= line.t1) return { idx, wordIdx: line.words.length, frac: 0, countdown: 0 };
    const sung = Math.min(1, (t - line.t0) / ((line.t1 - line.t0) * 0.92));
    const weights = line.words.map((w) => w.length + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let pos = sung * total, w = 0;
    while (w < weights.length - 1 && pos >= weights[w]) { pos -= weights[w]; w++; }
    return { idx, wordIdx: w, frac: Math.min(1, pos / weights[w]), countdown: 0 };
  }

  // ---------------------------------------------------------------- âm thanh
  let ctx = null, graph = null;
  const prefs = { vol: 0.8, lounge: false };
  try {
    const v = parseFloat(localStorage.getItem('pub_kvol'));
    if (v >= 0 && v <= 1) prefs.vol = v;
    prefs.lounge = localStorage.getItem('pub_lounge') === '1';
  } catch (_) { /* localStorage có thể bị chặn */ }
  const savePrefs = () => { try { localStorage.setItem('pub_kvol', String(prefs.vol)); localStorage.setItem('pub_lounge', prefs.lounge ? '1' : '0'); } catch (_) { /* bỏ qua */ } };

  function audio() {
    if (!ctx && typeof getAudioContext === 'function') ctx = getAudioContext();
    if (ctx && !graph) {
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      const out = ctx.createGain(), amb = ctx.createGain();
      out.gain.value = 0; amb.gain.value = 0;
      out.connect(comp); amb.connect(comp);
      const len = ctx.sampleRate;
      const noise = ctx.createBuffer(1, len, ctx.sampleRate), d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      graph = { out, amb, noise };
    }
    return ctx;
  }
  const soundOn = () => (typeof soundEnabled === 'undefined' ? true : soundEnabled);

  function envGain(g, when, peak, len, attack) {
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(len, 0.03));
  }
  function osc(type, freq, when, len, peak, dest, attack) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    envGain(g, when, peak, len, attack);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + len + 0.05);
    return o;
  }
  function noiseHit(when, len, peak, filterType, freq, dest) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = graph.noise; f.type = filterType; f.frequency.value = freq;
    envGain(g, when, peak, len, 0.002);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(when, Math.random() * 0.5, len + 0.05);
  }

  function playEvent(ev, when, spb, bus, fade, style) {
    const mix = style.mix * fade;
    switch (ev.inst) {
      case 'kick': {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
        envGain(g, when, 0.9 * ev.vel * mix, 0.32, 0.003);
        o.connect(g); g.connect(bus); o.start(when); o.stop(when + 0.4);
        break;
      }
      case 'snare':
        noiseHit(when, 0.17, 0.42 * ev.vel * mix, 'bandpass', 1900, bus);
        osc('triangle', 190, when, 0.09, 0.22 * ev.vel * mix, bus);
        break;
      case 'clap':
        noiseHit(when, 0.05, 0.3 * mix, 'bandpass', 1300, bus);
        noiseHit(when + 0.018, 0.14, 0.34 * mix, 'bandpass', 1300, bus);
        break;
      case 'hat':
        noiseHit(when, ev.open ? 0.16 : 0.045, 0.16 * ev.vel * mix, 'highpass', 7500, bus);
        break;
      case 'bass': {
        const len = ev.beats * spb * 0.95;
        const style2 = style.bassWave;
        if (style2 === 'sawtooth') {
          const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = midiHz(ev.note); f.type = 'lowpass'; f.frequency.value = 420;
          envGain(g, when, 0.34 * mix, len, 0.008);
          o.connect(f); f.connect(g); g.connect(bus); o.start(when); o.stop(when + len + 0.05);
        } else {
          osc('triangle', midiHz(ev.note), when, len, 0.5 * mix, bus, 0.012);
        }
        break;
      }
      case 'pluck':
        for (const n of ev.notes) {
          const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          const len = Math.max(0.12, ev.beats * spb);
          o.type = 'sawtooth'; o.frequency.value = midiHz(n);
          f.type = 'lowpass'; f.frequency.setValueAtTime(2200, when); f.frequency.exponentialRampToValueAtTime(420, when + len);
          envGain(g, when, (ev.vol * 0.16 / Math.sqrt(ev.notes.length)) * mix, len, 0.004);
          o.connect(f); f.connect(g); g.connect(bus); o.start(when); o.stop(when + len + 0.05);
        }
        break;
      case 'pad':
        for (const n of ev.notes) {
          const len = ev.beats * spb;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = midiHz(n);
          g.gain.setValueAtTime(0.0001, when);
          g.gain.linearRampToValueAtTime((ev.vol * 0.1 / Math.sqrt(ev.notes.length)) * mix, when + Math.min(0.35, len * 0.3));
          g.gain.linearRampToValueAtTime(0.0001, when + len);
          o.connect(g); g.connect(bus); o.start(when); o.stop(when + len + 0.05);
        }
        break;
      case 'lead':
        osc('triangle', midiHz(ev.note), when, Math.max(0.15, ev.beats * spb * 0.9), ev.vol * mix, bus, 0.02);
        break;
      default:
    }
  }

  // Một lần phát: nhạc tổng hợp (lên lịch trước 0.45s) hoặc file mp3 thật.
  function Player(song, dest, opts) {
    this.song = song; this.opts = opts || {};
    this.bus = ctx.createGain(); this.bus.gain.value = 1; this.bus.connect(dest);
    this.timer = null; this.audioEl = null; this.srcNode = null; this.delayTimer = null; this.running = true;
  }
  Player.prototype.start = function (elapsed) {
    if (this.song.kind === 'file') return this.startFile(elapsed);
    const track = this.song.track, spb = 60 / track.bpm, stepSec = spb / STEPS_PER_BEAT;
    const style = STYLES[track.style], dur = this.song.duration;
    const t0 = ctx.currentTime - elapsed;
    let next = Math.max(0, Math.ceil(elapsed / stepSec));
    const total = track.loop ? Infinity : totalBeats(track) * STEPS_PER_BEAT;
    const pump = () => {
      while (next < total) {
        const when = t0 + next * stepSec;
        if (when > ctx.currentTime + LOOKAHEAD) return;
        if (when >= ctx.currentTime - 0.03) {
          const fade = track.loop ? 1 : Math.max(0, Math.min(1, (dur - (when - t0)) / 2.5));
          for (const ev of stepEvents(track, next)) playEvent(ev, when, spb, this.bus, fade, style);
        }
        next++;
      }
      this.stopTimer();
    };
    pump();
    if (next < total || track.loop) this.timer = setInterval(pump, 100);
  };
  Player.prototype.startFile = function (elapsed) {
    const el = new Audio(this.song.src);
    el.crossOrigin = 'anonymous'; el.preload = 'auto';
    this.audioEl = el;
    try { this.srcNode = ctx.createMediaElementSource(el); this.srcNode.connect(this.bus); } catch (_) { /* nguồn đã được gắn */ }
    const go = (offset) => {
      const begin = () => { try { el.currentTime = Math.max(0, offset); } catch (_) { /* chưa tải metadata */ } el.play().catch(() => {}); };
      if (el.readyState >= 1) begin(); else el.addEventListener('loadedmetadata', begin, { once: true });
    };
    if (elapsed < 0) this.delayTimer = setTimeout(() => go(0), -elapsed * 1000); else go(elapsed);
    this.timer = setInterval(() => {   // chỉnh lệch pha với giờ server
      if (!this.running || !this.opts.clock || el.paused) return;
      const want = this.opts.clock();
      if (want >= 0 && Math.abs(el.currentTime - want) > 0.7) { try { el.currentTime = want; } catch (_) { /* bỏ qua */ } }
    }, 2000);
  };
  Player.prototype.stopTimer = function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } };
  Player.prototype.stop = function () {
    this.running = false; this.stopTimer();
    clearTimeout(this.delayTimer);
    const bus = this.bus, now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0, now, 0.05);
    if (this.audioEl) { this.audioEl.pause(); this.audioEl.removeAttribute('src'); this.audioEl.load(); }
    setTimeout(() => { try { if (this.srcNode) this.srcNode.disconnect(); bus.disconnect(); } catch (_) { /* đã ngắt */ } }, 300);
  };

  // ---------------------------------------------------------------- danh mục bài hát
  const catalog = new Map();
  for (const t of TRACKS) catalog.set(t.id, songFromTrack(t));
  const songById = (id) => catalog.get(id) || null;
  const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function loadRealTracks() {
    fetch('music/playlist.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => {
      if (!Array.isArray(list)) return;
      for (const item of list.slice(0, 30)) {
        if (!item || typeof item.src !== 'string' || typeof item.title !== 'string') continue;
        const id = 'file:' + String(item.id || item.title).slice(0, 40);
        const song = { id, title: item.title.slice(0, 60), artist: String(item.artist || '').slice(0, 40), kind: 'file', src: item.src, lines: [], duration: 0 };
        catalog.set(id, song);
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => { song.duration = Math.ceil(probe.duration) || 180; refreshPanel(true); };
        probe.onerror = () => { catalog.delete(id); refreshPanel(true); };
        probe.src = item.src;
        if (typeof item.lrc === 'string') {
          fetch(item.lrc).then((r) => (r.ok ? r.text() : '')).then((txt) => { song.lines = parseLrc(txt); }).catch(() => {});
        }
      }
      refreshPanel(true);
    });
  }

  // ---------------------------------------------------------------- phiên hát đồng bộ
  const S = { current: null, queue: [], local: false, lastScore: null };
  let sess = null;                 // { id, song, player }
  let localSeq = 0;
  let lounge = null;               // Player nhạc nền
  let lastPoll = 0;

  const elapsedOf = (cur) => (F.serverNow() - cur.started_ms) / 1000;
  const selfId = () => F.selfId;
  const singerPresent = (id) => id === selfId() || F.otherPlayers().some((p) => p.id === id);
  const canSkip = () => Boolean(S.current && (S.local || S.current.singer_id === selfId() || !singerPresent(S.current.singer_id)));

  function stopSession() {
    if (sess && sess.player) sess.player.stop();
    sess = null;
  }
  function tryStart() {
    if (!sess || sess.player || !sess.song) return;
    const c = audio();
    if (!c) return;
    if (c.state !== 'running') { c.resume().catch(() => {}); return; }
    const cur = S.current, el = elapsedOf(cur);
    if (el >= sess.song.duration) return;
    sess.player = new Player(sess.song, graph.out, { clock: () => elapsedOf(S.current || cur) });
    sess.player.start(el);
  }
  function syncSession() {
    const cur = S.current;
    if (!cur) { stopSession(); return; }
    if (sess && sess.id === cur.id) return;
    stopSession();
    sess = { id: cur.id, song: songById(cur.song_id), player: null };
    tryStart();
  }

  function applyState(st, local) {
    S.local = Boolean(local);
    S.current = st.current || null;
    S.queue = Array.isArray(st.queue) ? st.queue : [];
    if (Number.isFinite(st.server_time)) F.skew = st.server_time - Date.now();
    syncSession();
    updateChip(); refreshPanel(true);
  }

  function addSong(song) {
    if (!song.duration) return;
    if (F.online) {
      F.send({ action: 'karaoke_add', song_id: song.id, title: song.title, duration: song.duration });
      F.toast('🎤 Đã gửi yêu cầu bài "' + song.title + '"');
      return;
    }
    const entry = { id: 'l' + (++localSeq), song_id: song.id, title: song.title, singer_id: selfId() || 'local', singer_name: 'Bạn', duration: song.duration };
    if (S.queue.length >= 8) { F.toast('Hàng đợi đã đầy', 'warn'); return; }
    const st = { current: S.current, queue: [...S.queue, entry] };
    if (!st.current) localNext(st);
    applyState(st, true);
    F.toast('🎤 Đã thêm "' + song.title + '" (chế độ một mình)');
  }
  function localNext(st) {
    const next = st.queue.shift();
    st.current = next ? Object.assign({}, next, { started_ms: F.serverNow() + 1500 }) : null;
  }
  function skip() {
    if (!S.current || !canSkip()) return;
    if (F.online) { F.send({ action: 'karaoke_skip' }); return; }
    localFinish(false);
  }
  function localFinish(scored) {
    if (!S.current) return;
    if (scored) showScore({ singer_id: selfId(), singer_name: 'Bạn', title: S.current.title, score: 70 + Math.floor(Math.random() * 30) });
    const st = { current: null, queue: [...S.queue] };
    localNext(st);
    applyState(st, true);
  }

  F.on('karaoke_state', (d) => { applyState(d, false); });
  F.on('karaoke_score', (d) => { showScore(d); });

  function showScore(d) {
    S.lastScore = { ...d, at: Date.now() };
    const mine = d.singer_id === selfId();
    F.toast('🎤 ' + (mine ? 'Bạn' : d.singer_name) + ' hát "' + d.title + '": ' + d.score + ' điểm!', 'good', 5200);
    if (mine && !F.isPanelOpen()) openScoreCard(d);
    refreshPanel(true);
  }
  function openScoreCard(d) {
    F.openPanel('karaoke-score', {
      title: 'Kết quả karaoke', icon: '🏆',
      render: (body, api) => {
        const stars = '★'.repeat(Math.round(d.score / 20)) + '☆'.repeat(5 - Math.round(d.score / 20));
        body.append(h('div', { class: 'kj-score' },
          h('div', { class: 'kj-score-num', text: String(d.score) }),
          h('div', { class: 'kj-stars', text: stars }),
          h('p', { text: '"' + d.title + '"' }),
          h('p', { class: 'kj-muted', text: d.score >= 90 ? 'Giọng ca vàng của quán nhậu!' : d.score >= 80 ? 'Hay phết, anh em vỗ tay!' : 'Dô thêm vài ly nữa là lên giọng ngay.' }),
          h('button', { class: 'kj-btn kj-primary', type: 'button', text: 'Hát tiếp', onclick: () => { api.close(); openPanel(); } })));
      },
    });
  }

  // ---------------------------------------------------------------- nhạc nền quán (local)
  function setLounge(on) {
    prefs.lounge = on; savePrefs();
    if (!on) { if (lounge) { lounge.stop(); lounge = null; } return; }
    const c = audio();
    if (!c || lounge) return;
    if (c.state !== 'running') { c.resume().catch(() => {}); }
    lounge = new Player({ kind: 'synth', track: LOUNGE, duration: 1e9 }, graph.amb);
    lounge.start(0);
  }

  // ---------------------------------------------------------------- âm lượng theo khoảng cách
  function spatialTarget() {
    if (!soundOn()) return 0;
    const p = F.playerPos(selfId());
    if (!p) return prefs.vol;
    const d = Math.hypot(p.x - DOOR.x, p.z - DOOR.z);
    const att = d <= 4 ? 1 : 1 - 0.88 * Math.min(1, (d - 4) / 16);
    return prefs.vol * att;
  }
  function updateGains() {
    if (!graph) return;
    const now = ctx.currentTime;
    graph.out.gain.setTargetAtTime(spatialTarget(), now, 0.15);
    const duck = S.current && sess && sess.player ? 0.25 : 1;
    graph.amb.gain.setTargetAtTime(soundOn() ? prefs.vol * 0.35 * duck : 0, now, 0.4);
  }

  // ---------------------------------------------------------------- màn hình LED 3D
  let screen = null;
  function buildScreen() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 340;
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    mesh.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
    mesh.name = 'Karaoke 69 • màn hình LED';
    scene.add(mesh);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w + 0.5, SCREEN.h + 0.5), new THREE.MeshBasicMaterial({ color: 0x05020a, fog: false }));
    frame.position.set(SCREEN.x, SCREEN.y, SCREEN.z - 0.012);
    scene.add(frame);
    const bars = [];
    for (const dx of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, SCREEN.h + 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xd946ef, toneMapped: false, fog: false }));
      bar.position.set(SCREEN.x + dx * (SCREEN.w / 2 + 0.32), SCREEN.y, SCREEN.z);
      scene.add(bar); bars.push(bar);
    }
    for (const dy of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(SCREEN.w + 0.75, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false, fog: false }));
      bar.position.set(SCREEN.x, SCREEN.y + dy * (SCREEN.h / 2 + 0.3), SCREEN.z);
      scene.add(bar); bars.push(bar);
    }
    const light = new THREE.PointLight(0xd946ef, 0, 14);
    light.position.set(SCREEN.x - 0.5, SCREEN.y + 0.4, SCREEN.z + 1.6);
    scene.add(light);
    screen = { canvas, g: canvas.getContext('2d'), tex, bars, light, key: '', last: 0 };
    drawScreen(true);
  }

  function fitFont(g, text, max, px, weight) {
    let size = px;
    g.font = weight + ' ' + size + 'px "Be Vietnam Pro", sans-serif';
    while (g.measureText(text).width > max && size > 22) { size -= 3; g.font = weight + ' ' + size + 'px "Be Vietnam Pro", sans-serif'; }
    return size;
  }
  // Vẽ một dòng lời, tô vàng phần đã hát.
  function drawLyricLine(g, line, wordIdx, frac, y, px, dim) {
    const full = line.words.join(' ');
    const size = fitFont(g, full, 940, px, '800');
    const space = g.measureText(' ').width;
    const widths = line.words.map((w) => g.measureText(w).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (widths.length - 1);
    let x = 512 - total / 2;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    line.words.forEach((w, i) => {
      g.fillStyle = dim ? 'rgba(255,255,255,0.55)' : (i < wordIdx ? '#ffd000' : '#ffffff');
      g.fillText(w, x, y);
      if (!dim && i === wordIdx && frac > 0) {
        g.save(); g.beginPath(); g.rect(x, y - size, widths[i] * frac, size * 2); g.clip();
        g.fillStyle = '#ffd000'; g.fillText(w, x, y); g.restore();
      }
      x += widths[i] + space;
    });
    return size;
  }

  function drawScreen(force) {
    if (!screen) return;
    const now = performance.now();
    const minGap = lite() ? 125 : 66;
    if (!force && now - screen.last < minGap) return;
    const cur = S.current, song = cur ? songById(cur.song_id) : null;
    const t = cur ? elapsedOf(cur) : 0;
    const pos = lyricAt(song, t);
    const key = cur ? [cur.id, pos.idx, pos.wordIdx, Math.round(pos.frac * 8), Math.round(pos.countdown)].join('|') : 'idle';
    if (!force && key === screen.key) return;
    screen.key = key; screen.last = now;
    const g = screen.g;
    const grad = g.createLinearGradient(0, 0, 0, 340);
    grad.addColorStop(0, '#12041d'); grad.addColorStop(1, '#2a0a3a');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 340);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!cur) {
      g.font = '800 60px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#f9a8d4';
      g.shadowColor = '#d946ef'; g.shadowBlur = 24;
      g.fillText('🎤 ĐẶT BÀI HÁT', 512, 120); g.shadowBlur = 0;
      g.font = '600 38px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#fde68a';
      g.fillText('Bấm K để chọn bài — cả quán cùng nghe', 512, 214);
      g.font = '500 28px "Be Vietnam Pro", sans-serif'; g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillText('KARAOKE 69 VIP', 512, 280);
    } else {
      g.font = '700 30px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#22d3ee';
      g.fillText('♪ ' + cur.title + '  •  🎤 ' + cur.singer_name, 512, 36);
      if (!song || !song.lines.length) {
        g.font = '800 48px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#fff';
        g.fillText(song ? '♪ ♪ ♪  Hát theo giai điệu  ♪ ♪ ♪' : '♪ Đang phát ♪', 512, 180);
      } else if (pos.idx < 0) {
        g.font = '800 54px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#fff';
        g.fillText(pos.countdown > 0.5 ? 'Chuẩn bị... ' + Math.ceil(pos.countdown) : 'Bắt đầu!', 512, 150);
        g.font = '600 34px "Be Vietnam Pro", sans-serif'; g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText(song.lines[0].text, 512, 250);
      } else {
        drawLyricLine(g, song.lines[pos.idx], pos.wordIdx, pos.frac, 150, 62, false);
        const nxt = song.lines[pos.idx + 1];
        if (nxt) drawLyricLine(g, nxt, 0, 0, 250, 40, true);
      }
    }
    screen.tex.needsUpdate = true;
  }

  function tickScreen(t) {
    if (!screen) return;
    const playing = Boolean(S.current && sess && elapsedOf(S.current) >= 0);
    drawScreen(false);
    const hue = reduced ? 0.82 : (t * 0.05) % 1;
    screen.bars.forEach((b, i) => b.material.color.setHSL((hue + i * 0.12) % 1, 0.9, playing ? 0.6 : 0.35));
    if (lite() || reduced) {
      screen.light.intensity = playing ? 1.0 : 0;
    } else {
      const bpm = sess && sess.song && sess.song.bpm ? sess.song.bpm : 110;
      const beat = playing ? 0.6 + 0.6 * Math.pow(Math.max(0, Math.cos(t * Math.PI * bpm / 60)), 4) : 0;
      screen.light.intensity += (beat * 1.4 - screen.light.intensity) * 0.3;
    }
  }

  // ---------------------------------------------------------------- UI: chip + panel
  let chip = null;
  function updateChip() {
    if (!chip) return;
    const cur = S.current;
    chip.hidden = !cur;
    if (cur) chip.textContent = '🎤 ' + cur.title + ' — ' + cur.singer_name;
  }

  let ui = null;
  function openPanel() {
    F.openPanel('karaoke', {
      title: 'Karaoke 69 VIP', icon: '🎤', wide: true,
      onClose: () => { ui = null; },
      render: (body) => {
        ui = {};
        ui.now = h('div', { class: 'kj-now' });
        ui.title = h('div', { class: 'kj-now-title' });
        ui.sub = h('div', { class: 'kj-muted' });
        ui.bar = h('div', { class: 'kj-bar-fill' });
        ui.time = h('span', { class: 'kj-time' });
        ui.lyrics = h('div', { class: 'kj-lyrics', 'aria-live': 'off' });
        ui.skip = h('button', { class: 'kj-btn', type: 'button', text: '⏭ Bỏ qua bài', onclick: skip });
        ui.score = h('div', { class: 'kj-lastscore' });
        ui.now.append(ui.title, ui.sub, h('div', { class: 'kj-bar' }, ui.bar), h('div', { class: 'kj-row' }, ui.time, ui.skip), ui.lyrics, ui.score);
        ui.list = h('div', { class: 'kj-list' });
        ui.queue = h('ol', { class: 'kj-queue' });
        const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(prefs.vol), 'aria-label': 'Âm lượng karaoke' });
        vol.addEventListener('input', () => { prefs.vol = Number(vol.value); savePrefs(); updateGains(); });
        const lg = h('input', { type: 'checkbox', id: 'kjLounge' });
        lg.checked = prefs.lounge;
        lg.addEventListener('change', () => { setLounge(lg.checked); });
        body.append(
          ui.now,
          h('h4', { text: '🎶 Chọn bài' }), ui.list,
          h('h4', { text: '📋 Hàng đợi' }), ui.queue,
          h('div', { class: 'kj-ctrl' }, h('label', {}, '🔊 Âm lượng ', vol), h('label', { class: 'kj-check', for: 'kjLounge' }, lg, ' 🎶 Nhạc nền quán')),
          h('p', { class: 'kj-hint', text: '🎙️ Bật mic (voice chat) khi đến lượt bạn để cả quán nghe bạn hát. Đứng gần cửa Karaoke thì nghe rõ nhất.' }),
        );
        ui.lineKey = ''; ui.wordKey = '';
        refreshPanel(true);
      },
    });
  }

  function refreshPanel(full) {
    if (!ui) return;
    const cur = S.current;
    if (full) {
      ui.now.classList.toggle('kj-idle', !cur);
      ui.title.textContent = cur ? '♪ ' + cur.title : 'Chưa có ai hát';
      ui.sub.textContent = cur ? '🎤 ' + cur.singer_name + (S.local ? ' • chế độ một mình' : '') : 'Chọn một bài bên dưới để mở màn hình LED của quán.';
      ui.skip.hidden = !cur || !canSkip();
      ui.lineKey = '';
      ui.score.textContent = S.lastScore && Date.now() - S.lastScore.at < 60000
        ? '🏆 ' + S.lastScore.singer_name + ' vừa đạt ' + S.lastScore.score + ' điểm với "' + S.lastScore.title + '"' : '';
      ui.list.replaceChildren(...[...catalog.values()].map((song) => h('div', { class: 'kj-card' },
        h('div', { class: 'kj-card-info' },
          h('strong', { text: song.title }),
          h('small', { text: (song.artist || '') + (song.kind === 'synth' ? ' • ' + song.bpm + ' BPM' : ' • file nhạc') + (song.duration ? ' • ' + fmtTime(song.duration) : ' • đang tải...') })),
        h('button', { class: 'kj-btn kj-primary', type: 'button', disabled: !song.duration, 'aria-label': 'Đặt bài ' + song.title, text: '➕ Đặt bài', onclick: () => addSong(song) }))));
      ui.queue.replaceChildren(...(S.queue.length ? S.queue.map((q) => h('li', {}, h('span', { text: q.title }), h('small', { text: ' — ' + q.singer_name }))) : [h('li', { class: 'kj-muted', text: 'Trống — đặt bài để lên sóng.' })]));
    }
    if (!cur) { ui.bar.style.width = '0%'; ui.time.textContent = ''; ui.lyrics.replaceChildren(); return; }
    const t = elapsedOf(cur);
    const dur = cur.duration || (sess && sess.song ? sess.song.duration : 1);
    ui.bar.style.width = Math.max(0, Math.min(100, t / dur * 100)) + '%';
    ui.time.textContent = t < 0 ? 'Sắp bắt đầu...' : fmtTime(t) + ' / ' + fmtTime(dur);
    renderLyrics(cur, t);
  }

  function renderLyrics(cur, t) {
    const song = songById(cur.song_id);
    if (!song || !song.lines.length) {
      if (ui.lineKey !== 'none') { ui.lineKey = 'none'; ui.lyrics.replaceChildren(h('p', { class: 'kj-line kj-cur', text: song ? '♪ Hát theo giai điệu ♪' : '♪ Bài này chưa có trên máy bạn ♪' })); }
      return;
    }
    const pos = lyricAt(song, t);
    if (ui.lineKey !== String(pos.idx)) {
      ui.lineKey = String(pos.idx); ui.wordKey = '';
      const first = Math.max(0, pos.idx - 1);
      const rows = [];
      for (let i = first; i < Math.min(song.lines.length, first + 4); i++) {
        const cls = i === pos.idx ? 'kj-line kj-cur' : i < pos.idx ? 'kj-line kj-past' : 'kj-line';
        rows.push(h('p', { class: cls, 'data-i': String(i) }, ...song.lines[i].words.map((w) => h('span', { class: 'kj-w', text: w + ' ' }))));
      }
      ui.lyrics.replaceChildren(...rows);
    }
    const key = pos.wordIdx + ':' + Math.round(pos.frac * 10);
    if (ui.wordKey === key) return;
    ui.wordKey = key;
    const curLine = ui.lyrics.querySelector('.kj-cur');
    if (!curLine) return;
    [...curLine.children].forEach((sp, i) => {
      sp.classList.toggle('kj-done', i < pos.wordIdx);
      sp.classList.toggle('kj-now', i === pos.wordIdx);
      if (i === pos.wordIdx) sp.style.setProperty('--p', Math.round(pos.frac * 100) + '%');
      else sp.style.removeProperty('--p');
    });
  }

  // ---------------------------------------------------------------- khởi động
  F.onStart(() => {
    buildScreen();
    chip = h('button', { class: 'kj-chip', type: 'button', hidden: true, title: 'Mở Karaoke', onclick: openPanel });
    document.getElementById('fx-dock').append(chip);
    F.addMenuItem({
      id: 'karaoke', icon: '🎤', label: 'Karaoke 69', order: 40, hint: 'Hát cùng cả quán',
      badge: () => (S.current ? '♪' : null), onClick: openPanel,
    });
    F.addKey('k', openPanel);
    loadRealTracks();
    const unlock = () => { audio(); if (prefs.lounge && !lounge) setLounge(true); tryStart(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    if (prefs.lounge) setLounge(true);
    F.addTick((delta, t) => {
      tickScreen(t);
      updateGains();
      const now = performance.now();
      if (now - lastPoll > 400) {
        lastPoll = now;
        if (sess && !sess.player) tryStart();
        if (prefs.lounge && !lounge && ctx && ctx.state === 'running') setLounge(true);
        // Bài kết thúc ở chế độ một mình: tự chuyển bài.
        if (S.local && S.current && elapsedOf(S.current) > S.current.duration + 1) localFinish(true);
      }
      if (ui && now - (ui.last || 0) > 100) { ui.last = now; refreshPanel(false); }
    });
  });

  F.karaoke = {
    engine: { stepEvents, lyricAt, parseLrc, songFromTrack, totalBeats, TRACKS, LOUNGE, STYLES },
    open: openPanel,
    songs: () => [...catalog.values()],
    state: () => S,
    setLounge,
  };
})();

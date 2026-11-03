// ========================================================
// QUÁN NHẬU ẢO 3D - THREE.JS GAMEPLAY & MULTIPLAYER CLIENT
// ========================================================

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'ban_1';
let clientId = sessionStorage.getItem('pub_client_id');
if (!clientId) {
  clientId = 'user_' + Math.random().toString(36).substring(2, 9);
  sessionStorage.setItem('pub_client_id', clientId);
}

// Mã hồ sơ bền vững (khác clientId theo từng tab): giữ tên, cấp bậc, tủ đồ giữa các lần vào quán.
let profileId = null;
try {
  profileId = localStorage.getItem('pub_pid');
  if (!profileId) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    profileId = 'p' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('pub_pid', profileId);
  }
} catch (_) { profileId = null; /* Không có localStorage: vào như khách, không lưu tiến trình. */ }
const PERF = window.PUB_PERF || { lite: false, coarse: false };

let ws = null;
let selfMember = null;
let remotePlayers = new Map(); // id -> { mesh, data, targetPos, targetRot, walkCycle }
let soundEnabled = true;

// DOM Elements
const canvasContainer = document.getElementById('canvas3d-container');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const totalCheersDisplay = document.getElementById('totalCheersDisplay');
const topMoiTacDisplay = document.getElementById('topMoiTacDisplay');
const tickerMsg = document.getElementById('tickerMsg');
const interactPrompt = document.getElementById('interactPrompt');
const hudOverlay = document.getElementById('hudOverlay');

const selfNameDisplay = document.getElementById('selfNameDisplay');
const selfColorBadge = document.getElementById('selfColorBadge');
const selfDrunkBar = document.getElementById('selfDrunkBar');
const selfDrunkText = document.getElementById('selfDrunkText');
const selfBladderBar = document.getElementById('selfBladderBar');
const selfBladderText = document.getElementById('selfBladderText');

const cheerBtn = document.getElementById('cheerBtn');
const sitStandBtn = document.getElementById('sitStandBtn');
const sitStandText = document.getElementById('sitStandText');
const eatSnackBtn = document.getElementById('eatSnackBtn');
const soberBtn = document.getElementById('soberBtn');
const peeBtn = document.getElementById('peeBtn');
const peeBtnText = document.getElementById('peeBtnText');
const vomitBtn = document.getElementById('vomitBtn');
const vomitBtnText = document.getElementById('vomitBtnText');
const billBtn = document.getElementById('billBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const audioToggleBtn = document.getElementById('audioToggleBtn');
const viewRiverBtn = document.getElementById('viewRiverBtn');
const viewRiverText = document.getElementById('viewRiverText');

// Danh sách các điểm đái bậy / WC (Khai báo sớm để dùng ở mọi hàm)
const peeSpots = [];
let wcOccupant = null;
let wcPending = false;
let wcRequestTimer = null;

let isScenicView = false;
function toggleScenicView() {
  if (!isScenicView && localCharacter && pubDetails.inside(localPlayerState.x, localPlayerState.z)) {
    setTicker('🚽 Ra khỏi WC rồi ngắm cảnh nhé!');
    return;
  }
  isScenicView = !isScenicView;
  hudOverlay.style.visibility = isScenicView ? 'hidden' : 'visible';
  if (viewRiverBtn) {
    if (isScenicView) {
      viewRiverBtn.classList.add('is-viewing');
      if (viewRiverText) viewRiverText.textContent = "Thoát Ngắm Cảnh";
      setTicker("🌆 Đang ngắm Sông Sài Gòn và Tòa Nhà Landmark 81 rực rỡ...");
      if (window.Features) Features.send({ action: 'quest_event', kind: 'scenic' });
    } else {
      viewRiverBtn.classList.remove('is-viewing');
      if (viewRiverText) viewRiverText.textContent = "Ngắm Landmark 81";
      setTicker("Đã quay về góc nhìn nhân vật.");
    }
  }
}

const passoutModal = document.getElementById('passoutModal');
const modalWakeBtn = document.getElementById('modalWakeBtn');
const nameModal = document.getElementById('nameModal');
const editNameBtn = document.getElementById('editNameBtn');
const nameInput = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');

roomIdDisplay.textContent = roomId.toUpperCase();

// ========================================================
// 1. Web Audio Synthesizer (Zero External Dependencies)
// ========================================================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playClinkSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  [2200, 2800, 3400].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq + (Math.random() * 60 - 30), now);
    gain.gain.setValueAtTime(0.22 / (idx + 1), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 + idx * 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  });
}

function playCrunchSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1500, now);
  filter.Q.setValueAtTime(3.0, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

function playSoberSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(350, now);
  osc.frequency.exponentialRampToValueAtTime(750, now + 0.22);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

function playSnoreSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.linearRampToValueAtTime(70, now + 0.8);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.0);
}

function playBillChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
    const now = ctx.currentTime + i * 0.1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  });
}

// Tiếng Xả Lũ / Đái Bậy Nước Chảy Róc Rách
function playPeeSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 3.3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.linearRampToValueAtTime(600, now + 3.2);   // dòng yếu dần
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.24, now + 0.15);
  gain.gain.setValueAtTime(0.22, now + 2.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 3.25);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

// Còi Hú Tuýt Phạt Đái Bậy (Công an / Bảo vệ)
function playSirenSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.linearRampToValueAtTime(580, now + 0.18);
  osc.frequency.linearRampToValueAtTime(880, now + 0.36);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.6);
}

// Âm Thanh Ói Mửa / Nôn Thốc Nôn Tháo (Huệ ơi là Huệ)
function playVomitSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);

  // Tiếng ọe/hộc từ cổ họng: sóng răng cưa trầm qua các formant của miệng, rung thô như dây thanh bị nghẹn.
  const retch = (at, len, f0, f1, level) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + len);
    const rough = ctx.createGain();          // rung ~28Hz tạo tiếng "gừ gừ" thô ráp
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 28;
    lfoDepth.gain.value = 0.45;
    rough.gain.value = 0.55;
    lfo.connect(lfoDepth); lfoDepth.connect(rough.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level, at + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(rough);
    for (const [freq, q, gainValue] of [[480, 4, 1], [1050, 5, 0.7], [2300, 6, 0.3]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gainValue;
      rough.connect(bp); bp.connect(g); g.connect(env);
    }
    env.connect(out);
    osc.start(at); lfo.start(at); osc.stop(at + len + 0.05); lfo.stop(at + len + 0.05);
  };
  retch(t0, 0.34, 70, 110, 0.9);        // "hộc"
  retch(t0 + 0.5, 0.4, 62, 125, 1.0);   // "hộc... ọe"
  retch(t0 + 1.05, 0.55, 150, 95, 0.8); // "ọoeee"

  // Dòng nôn tuôn ra: nhiễu lọc thấp, độ vang lên xuống từng đợt phun, âm sắc ướt sệt.
  const dur = 1.7, splashAt = t0 + 1.2;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < data.length; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.18; data[i] = lp * 2.2; }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass'; band.Q.value = 1.1;
  band.frequency.setValueAtTime(900, splashAt);
  band.frequency.exponentialRampToValueAtTime(260, splashAt + dur);
  const gush = ctx.createGain();
  gush.gain.setValueAtTime(0.0001, splashAt);
  let pos = 0.04;
  gush.gain.exponentialRampToValueAtTime(0.9, splashAt + pos);
  for (let k = 0; k < 7; k++) {            // các đợt phun ngắt quãng
    pos += 0.1 + Math.random() * 0.12;
    gush.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.55, splashAt + Math.min(pos, dur - 0.3));
  }
  gush.gain.exponentialRampToValueAtTime(0.0001, splashAt + dur);
  noise.connect(band); band.connect(gush); gush.connect(out);
  noise.start(splashAt); noise.stop(splashAt + dur);

  // Bọt lục bục và những giọt nhỏ xuống sàn.
  for (let i = 0; i < 16; i++) {
    const at = splashAt + 0.1 + Math.random() * (dur - 0.2);
    const bubble = ctx.createOscillator();
    const g = ctx.createGain();
    const base = 220 + Math.random() * 520;
    bubble.type = 'sine';
    bubble.frequency.setValueAtTime(base, at);
    bubble.frequency.exponentialRampToValueAtTime(base * 1.8, at + 0.05);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.28, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    bubble.connect(g); g.connect(out);
    bubble.start(at); bubble.stop(at + 0.09);
  }
  for (let i = 0; i < 3; i++) {            // nhổ nốt vài giọt cuối
    const at = splashAt + dur + 0.05 + i * (0.12 + Math.random() * 0.1);
    const drip = ctx.createOscillator();
    const g = ctx.createGain();
    drip.type = 'sine';
    drip.frequency.setValueAtTime(900, at);
    drip.frequency.exponentialRampToValueAtTime(350, at + 0.08);
    g.gain.setValueAtTime(0.25, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    drip.connect(g); g.connect(out);
    drip.start(at); drip.stop(at + 0.12);
  }
}

// Âm thanh Em PG rót bia sủi bọt mát lạnh
function playPourBeerSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.9;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.45));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1700, now);
  filter.Q.setValueAtTime(3.5, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

// ========================================================
// 2. Three.js 3D Scene Initialization (Cinematic PBR Edition)
// ========================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.FogExp2(0x070b14, 0.013);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: !PERF.lite, powerPreference: PERF.lite ? "default" : "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(PERF.lite ? 1 : Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.shadowMap.enabled = !PERF.lite && !matchMedia('(pointer: coarse)').matches;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.90;
if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
canvasContainer.appendChild(renderer.domElement);

// ========================================================
// 2.1. Realistic Post-Processing: UnrealBloomPass
// ========================================================
// Tắt hoàn toàn hiệu ứng lóa sáng (Bloom) để hình ảnh sắc nét, rõ ràng, êm dịu cho mắt
let composer = null;

// ========================================================
// 2.2. Image-Based Lighting (IBL) via Saigon Night HDRI
// ========================================================
// HDRI (1.6MB) và RGBELoader chỉ nạp SAU khung hình đầu tiên, và bỏ hẳn ở chế độ nhẹ.
function loadHDREnvironment() {
  if (PERF.lite) return;
  const apply = () => {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    new THREE.RGBELoader().load('environment/night_city_1k.hdr', function (texture) {
      scene.environment = pmremGenerator.fromEquirectangular(texture).texture;
      texture.dispose();
      pmremGenerator.dispose();
    }, undefined, function (err) {
      console.warn('[PBR] HDR environment load notice:', err);
    });
  };
  if (typeof THREE.RGBELoader !== 'undefined') return apply();
  const tag = document.createElement('script');
  tag.src = 'vendor/RGBELoader.js';
  tag.onload = () => typeof THREE.RGBELoader !== 'undefined' && apply();
  document.head.appendChild(tag);
}

// Lighting: Dịu mắt, ấm áp đêm phố Sài Gòn (Không bị chói lóa)
const ambientLight = new THREE.AmbientLight(0x334155, 0.45);
scene.add(ambientLight);

// Đèn đường vàng ấm dịu nhẹ
const streetLight = new THREE.DirectionalLight(0xffb366, 0.75);
streetLight.position.set(6, 16, 9);
streetLight.castShadow = true;
streetLight.shadow.mapSize.width = 1024;
streetLight.shadow.mapSize.height = 1024;
streetLight.shadow.camera.near = 0.5;
streetLight.shadow.camera.far = 50;
streetLight.shadow.camera.left = -22;
streetLight.shadow.camera.right = 22;
streetLight.shadow.camera.top = 22;
streetLight.shadow.camera.bottom = -22;
scene.add(streetLight);

// Đèn neon dịu dàng, tạo màu sắc ấm cúng
const neonCyan = new THREE.PointLight(0x06b6d4, 0.9, 14);
neonCyan.position.set(-6, 4.5, -4.5);
scene.add(neonCyan);

const neonMagenta = new THREE.PointLight(0xf43f5e, 0.95, 14);
neonMagenta.position.set(6, 4.5, -4.5);
scene.add(neonMagenta);

const neonAmber = new THREE.PointLight(0xf59e0b, 0.8, 12);
neonAmber.position.set(0, 3.8, 0);
scene.add(neonAmber);

// Ánh trăng sông Sài Gòn êm đềm
const moonLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
moonLight.position.set(25, 32, 65);
scene.add(moonLight);

// ========================================================
// 2.5. Procedural PBR Texture Generators (Zero External Lag)
// ========================================================

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141820';
  ctx.fillRect(0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 36;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise + 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // Wet glossy puddle areas
  const grad1 = ctx.createRadialGradient(180, 220, 20, 180, 220, 130);
  grad1.addColorStop(0, 'rgba(8, 11, 16, 0.75)');
  grad1.addColorStop(1, 'rgba(20, 24, 32, 0)');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, 512, 512);

  const grad2 = ctx.createRadialGradient(370, 310, 15, 370, 310, 110);
  grad2.addColorStop(0, 'rgba(8, 11, 16, 0.7)');
  grad2.addColorStop(1, 'rgba(20, 24, 32, 0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 2);
  return tex;
}

function createSidewalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 0, 512, 512);

  const tileSize = 64;
  for (let y = 0; y < 512; y += tileSize) {
    for (let x = 0; x < 512; x += tileSize) {
      const isRed = ((x / tileSize) + (y / tileSize)) % 2 === 0;
      ctx.fillStyle = isRed ? '#883b32' : '#475569';
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

      ctx.fillStyle = isRed ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(x + tileSize / 2, y + 8);
      ctx.lineTo(x + tileSize - 8, y + tileSize / 2);
      ctx.lineTo(x + tileSize / 2, y + tileSize - 8);
      ctx.lineTo(x + 8, y + tileSize / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  return tex;
}

function createInoxBrushedTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 512, 512);

  ctx.lineWidth = 1;
  for (let r = 5; r < 256; r += 2) {
    const alpha = 0.05 + Math.random() * 0.12;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(100,116,139,${alpha})`;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  return new THREE.CanvasTexture(canvas);
}

function createFaceTexture(isFemale, skinTone = '#ffdfc4', eyeColor = '#1e293b') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, 512, 512);

  if (isFemale) {
    // Feminine Chibi face (Khuôn mặt PG xinh xắn, mắt to tròn long lanh, má hồng)
    // Left eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(190, 235, 34, 28, -0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor || '#2563eb';
    ctx.beginPath();
    ctx.arc(190, 235, 20, 0, Math.PI * 2);
    ctx.fill();

    // Dark pupil
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(190, 235, 12, 0, Math.PI * 2);
    ctx.fill();

    // Specular shine highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(182, 225, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(198, 243, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Upper lash & eyeliner
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(190, 235, 34, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Right eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(322, 235, 34, 28, 0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor || '#2563eb';
    ctx.beginPath();
    ctx.arc(322, 235, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(322, 235, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(314, 225, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(330, 243, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(322, 235, 34, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Eyebrows
    ctx.strokeStyle = '#382215';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(190, 208, 36, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(322, 208, 36, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();

    // Rosy Blush (Má hồng phúng phính Chibi)
    const blushL = ctx.createRadialGradient(165, 280, 4, 165, 280, 46);
    blushL.addColorStop(0, 'rgba(244, 63, 94, 0.55)');
    blushL.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = blushL;
    ctx.fillRect(115, 230, 100, 100);

    const blushR = ctx.createRadialGradient(347, 280, 4, 347, 280, 46);
    blushR.addColorStop(0, 'rgba(244, 63, 94, 0.55)');
    blushR.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = blushR;
    ctx.fillRect(297, 230, 100, 100);

    // Sweet feminine smile
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(256, 305, 18, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    // Chibi Bợm Nhậu (Phong cách Nhà Tù Online: Mắt hạt tiêu tròn to đen láy, má hồng ửng say, miệng cười thân thiện)
    // Left eye (Mắt to tròn ngộ nghĩnh)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(196, 232, 28, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(196, 232, 19, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big anime sparkle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(189, 223, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(203, 240, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(316, 232, 28, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(316, 232, 19, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(309, 223, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(323, 240, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Expressive arched eyebrows (Lông mày tinh nghịch)
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(196, 204, 32, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(316, 204, 32, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();

    // Rosy cheeks (Má hồng bợm nhậu tròn xoe như Nhà Tù Online)
    const blushL = ctx.createRadialGradient(162, 275, 4, 162, 275, 42);
    blushL.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
    blushL.addColorStop(0.6, 'rgba(248, 113, 113, 0.3)');
    blushL.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = blushL;
    ctx.fillRect(115, 230, 95, 90);

    const blushR = ctx.createRadialGradient(350, 275, 4, 350, 275, 42);
    blushR.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
    blushR.addColorStop(0.6, 'rgba(248, 113, 113, 0.3)');
    blushR.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = blushR;
    ctx.fillRect(302, 230, 95, 90);

    // Big happy grin / smile (Nụ cười tươi rói)
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(256, 280, 28, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Cheek dimples
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(224, 286, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(288, 286, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createBeerCanTexture(brand) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (brand === 'tiger') {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, 70);
    ctx.lineTo(256, 140);
    ctx.lineTo(256, 190);
    ctx.lineTo(0, 120);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 36px "Impact", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('TIGER', 128, 120);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CRYSTAL', 128, 150);
  } else if (brand === 'saigon_chill') {
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(128, 128, 64, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 28px "Arial Black", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('SÀI GÒN', 128, 118);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#0284c7';
    ctx.fillText('CHILL', 128, 150);
  } else {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 100, 256, 55);

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 128, 92);

    ctx.font = 'bold 26px "Arial Black", sans-serif';
    ctx.fillStyle = '#15803d';
    ctx.fillText('Heineken', 128, 138);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let i = 0; i < 40; i++) {
    const dx = Math.random() * 256;
    const dy = Math.random() * 256;
    ctx.beginPath();
    ctx.arc(dx, dy, 1.8 + Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

// Texture Ghế Đá Mài Hoa Cương Công Viên Đặc Trưng Việt Nam (Đỏ Đô / Xanh Ngọc mài bóng, chữ vàng tương phản cao)
function createStoneBenchTexture(colorType = 'red', sponsorText = 'QUÁN NHẬU 3D • KÍNH TẶNG') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  const isRed = colorType === 'red';
  ctx.fillStyle = isRed ? '#881337' : '#064e3b';
  ctx.fillRect(0, 0, 512, 128);

  // Hạt đá cẩm thạch li ti mài bóng (Terrazzo marble speckles)
  const speckColors = isRed
    ? ['#fecdd3', '#ffe4e6', '#ffffff', '#4c0519', '#fda4af', '#fb7185']
    : ['#a7f3d0', '#ecfdf5', '#ffffff', '#022c22', '#6ee7b7', '#34d399'];

  for (let i = 0; i < 750; i++) {
    const sx = Math.random() * 512;
    const sy = Math.random() * 128;
    const sr = 1 + Math.random() * 2.5;
    ctx.fillStyle = speckColors[Math.floor(Math.random() * speckColors.length)];
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Đường viền bo mạ bóng
  ctx.strokeStyle = isRed ? '#fda4af' : '#a7f3d0';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 116);

  // Dòng chữ mạ vàng lưu niệm sắc nét
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 22px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText(sponsorText, 256, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Bàn Cờ Tướng Công Viên (Chinese Chess Board Canvas Texture)
function createChessBoardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fef3c7'; // Nền gỗ sáng
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.strokeRect(32, 32, 448, 448);

  const cellX = 448 / 8;
  const cellY = 448 / 9;

  for (let c = 0; c <= 8; c++) {
    const x = 32 + c * cellX;
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x, 32 + 4 * cellY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, 32 + 5 * cellY);
    ctx.lineTo(x, 480);
    ctx.stroke();
  }

  for (let r = 0; r <= 9; r++) {
    const y = 32 + r * cellY;
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(480, y);
    ctx.stroke();
  }

  // Sông Sở Hà - Hán Giới
  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 24px serif';
  ctx.textAlign = 'center';
  ctx.fillText('楚 河         漢 界', 256, 32 + 4.65 * cellY);

  return new THREE.CanvasTexture(canvas);
}

// ========================================================
// 3. Procedural 3D Environment (Quán Nhậu Vỉa Hè & Bờ Sông Sài Gòn)
// ========================================================

const pbrLoader = new THREE.TextureLoader();

// 1. Mặt đường nhựa PBR (Realistic Wet Asphalt Pavement Sài Gòn Đêm)
const asphaltDiff = pbrLoader.load('textures/asphalt/diff_1k.jpg');
asphaltDiff.wrapS = asphaltDiff.wrapT = THREE.RepeatWrapping;
asphaltDiff.repeat.set(12, 3);

const streetGeo = new THREE.PlaneGeometry(110, 12);
streetGeo.setAttribute('uv2', streetGeo.attributes.uv);

const streetMat = new THREE.MeshStandardMaterial({
  map: asphaltDiff,
  normalScale: new THREE.Vector2(0.85, 0.85),
  aoMapIntensity: 1.2,
  color: 0x1e2430,
  roughness: 0.55,
  metalness: 0.05
});
const street = new THREE.Mesh(streetGeo, streetMat);
street.rotation.x = -Math.PI / 2;
street.position.set(0, 0, 7.5);
street.receiveShadow = true;
scene.add(street);

// Road White Stripes (Vạch kẻ tim đường phản quang trải dài dọc phố)
for (let x = -50; x <= 50; x += 6) {
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.35 })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(x, 0.015, 7.5);
  scene.add(stripe);
}

// Zebra Crosswalks (3 vạch qua đường sang công viên bờ sông: Giữa, Đông, Tây)
[-24, 0, 24].forEach(crossX => {
  for (let cz = 4.0; cz <= 11.0; cz += 1.1) {
    const zebra = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.set(crossX, 0.018, cz);
    scene.add(zebra);
  }
});

// 2. Vỉa hè quán nhậu lát gạch bông PBR (Checkered Pavement Tiles Sài Gòn)
const sidewalkDiff = pbrLoader.load('textures/sidewalk/diff_1k.jpg');
sidewalkDiff.wrapS = sidewalkDiff.wrapT = THREE.RepeatWrapping;
sidewalkDiff.repeat.set(16, 4);

const sidewalkGeo = new THREE.BoxGeometry(36, 0.3, 8.8);
sidewalkGeo.setAttribute('uv2', sidewalkGeo.attributes.uv);

const sidewalkMat = new THREE.MeshStandardMaterial({
  map: sidewalkDiff,
  normalScale: new THREE.Vector2(0.9, 0.9),
  aoMapIntensity: 1.2,
  color: 0x8898aa,
  roughness: 0.65,
  metalness: 0.04
});
const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
sidewalk.position.set(0, 0.15, -0.75);
sidewalk.receiveShadow = true;
scene.add(sidewalk);

// Normal / roughness / AO map (~3.3MB) là chi tiết phụ: nạp sau khung hình đầu, bỏ ở chế độ nhẹ.
function loadPBRDetailMaps() {
  if (PERF.lite) return;
  [[streetMat, 'asphalt', 12, 3], [sidewalkMat, 'sidewalk', 16, 4]].forEach(([mat, dir, rx, ry]) => {
    for (const [prop, file] of [['normalMap', 'nor_gl'], ['roughnessMap', 'rough'], ['aoMap', 'ao']]) {
      pbrLoader.load(`textures/${dir}/${file}_1k.jpg`, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
        mat[prop] = tex;
        mat.needsUpdate = true;
      });
    }
  });
}

// Curb stone (Gờ đá bó vỉa hè quán dài suốt con phố)
const curb = new THREE.Mesh(
  new THREE.BoxGeometry(100, 0.35, 0.45),
  new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 })
);
curb.position.set(0, 0.175, 3.65);
scene.add(curb);

// ========================================================
// 3.1. XE MÁY SÀI GÒN TẢ THỰC (WAVE ALPHA & DREAM THÁI CHI TIẾT CAO)
// ========================================================
function buildSaigonMotorbike(x, z, ry, bodyColor = 0xdc2626, modelName = "Wave Alpha", plateNumber = "59-S2 888.88") {
  const root = new THREE.Group();
  root.position.set(x, 0.3, z);
  root.rotation.y = ry;

  // Nghiêng chân chống tự nhiên (8.5 độ)
  const bike = new THREE.Group();
  bike.rotation.z = -0.14;
  root.add(bike);

  const frameMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.28, metalness: 0.45 });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.12 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.92 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });

  // 1. Bánh xe căm nhôm mạ chrome & đĩa phanh
  function createWheel(isFront) {
    const wGroup = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 12, 28), rubberMat);
    wGroup.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.016, 8, 28), chromeMat);
    wGroup.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 12), chromeMat);
    hub.rotation.x = Math.PI / 2;
    wGroup.add(hub);
    for (let sp = 0; sp < 8; sp++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.44, 4), chromeMat);
      spoke.rotation.z = (sp * Math.PI) / 4;
      wGroup.add(spoke);
    }
    if (isFront) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 16), chromeMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = 0.04;
      wGroup.add(disc);
    }
    return wGroup;
  }

  const frontWheel = createWheel(true);
  frontWheel.position.set(0, 0.3, 0.62);
  bike.add(frontWheel);

  const rearWheel = createWheel(false);
  rearWheel.position.set(0, 0.3, -0.62);
  bike.add(rearWheel);

  // 2. Phuộc trước ống lồng mạ chrome
  for (let fx of [-0.07, 0.07]) {
    const forkLower = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), darkMetal);
    forkLower.position.set(fx, 0.42, 0.6);
    forkLower.rotation.x = -0.22;
    bike.add(forkLower);

    const forkUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8), chromeMat);
    forkUpper.position.set(fx, 0.68, 0.54);
    forkUpper.rotation.x = -0.22;
    bike.add(forkUpper);
  }

  // Chắn bùn trước
  const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.09, 14, 1, false, 0, Math.PI), frameMat);
  fender.rotation.x = Math.PI / 2 + 0.3;
  fender.position.set(0, 0.45, 0.58);
  fender.scale.set(0.4, 0.4, 0.4);
  bike.add(fender);

  // 3. Thân xe, Lốc máy & Yếm xe khí động học
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.32), darkMetal);
  engine.position.set(0, 0.35, -0.05);
  bike.add(engine);

  const kickStarter = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 6), chromeMat);
  kickStarter.rotation.z = Math.PI / 3;
  kickStarter.position.set(0.14, 0.32, -0.15);
  bike.add(kickStarter);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.48), frameMat);
  apron.position.set(0, 0.62, 0.25);
  apron.rotation.x = -0.32;
  bike.add(apron);

  const rearFairing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.55), frameMat);
  rearFairing.position.set(0, 0.6, -0.32);
  rearFairing.rotation.x = 0.12;
  bike.add(rearFairing);

  // 4. Yên xe đôi & Tay dắt sau mạ chrome
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.68), leatherMat);
  seat.position.set(0, 0.76, -0.18);
  seat.rotation.x = 0.05;
  bike.add(seat);

  const grabBar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 6, 14, Math.PI), chromeMat);
  grabBar.position.set(0, 0.81, -0.56);
  bike.add(grabBar);

  // 5. Ghi đông, đèn pha Halogen, xi-nhan & 2 gương chiếu hậu
  const headCowl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.18), frameMat);
  headCowl.position.set(0, 0.88, 0.46);
  bike.add(headCowl);

  const headlight = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.09, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 0.5, roughness: 0.1 })
  );
  headlight.position.set(0, 0.88, 0.55);
  bike.add(headlight);

  for (let sx of [-0.15, 0.15]) {
    const blinker = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 0.8 })
    );
    blinker.position.set(sx, 0.88, 0.54);
    bike.add(blinker);
  }

  for (let mx of [-0.22, 0.22]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 6), chromeMat);
    stem.position.set(mx, 1.02, 0.42);
    stem.rotation.z = mx > 0 ? -0.25 : 0.25;
    bike.add(stem);

    const mirror = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.98, roughness: 0.05 })
    );
    mirror.position.set(mx > 0 ? mx + 0.05 : mx - 0.05, 1.13, 0.41);
    mirror.rotation.y = mx > 0 ? -0.3 : 0.3;
    bike.add(mirror);
  }

  // 6. Ống bô xả có ốp pô inox chống nóng
  const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 0.72, 10), darkMetal);
  exhaustPipe.rotation.x = Math.PI / 2 - 0.12;
  exhaustPipe.position.set(0.17, 0.28, -0.28);
  bike.add(exhaustPipe);

  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.42, 8, 1, true, 0, Math.PI), chromeMat);
  heatShield.rotation.x = Math.PI / 2 - 0.12;
  heatShield.rotation.y = Math.PI / 2;
  heatShield.position.set(0.19, 0.29, -0.32);
  bike.add(heatShield);

  // 7. Biển số xe Sài Gòn
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256; plateCanvas.height = 128;
  const plctx = plateCanvas.getContext('2d');
  plctx.fillStyle = '#f8fafc';
  plctx.fillRect(0, 0, 256, 128);
  plctx.strokeStyle = '#0f172a';
  plctx.lineWidth = 6;
  plctx.strokeRect(4, 4, 248, 120);
  plctx.fillStyle = '#0f172a';
  plctx.font = 'bold 36px sans-serif';
  plctx.textAlign = 'center';
  const parts = plateNumber.split(' ');
  plctx.fillText(parts[0] || '59-S2', 128, 48);
  plctx.font = 'bold 44px sans-serif';
  plctx.fillText(parts[1] || '888.88', 128, 100);

  const plateTex = new THREE.CanvasTexture(plateCanvas);
  const plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.12),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.35 })
  );
  plateMesh.position.set(0, 0.42, -0.68);
  plateMesh.rotation.y = Math.PI;
  bike.add(plateMesh);

  // Đèn hậu đỏ
  const tailLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xdc2626, emissiveIntensity: 0.75 })
  );
  tailLight.position.set(0, 0.54, -0.66);
  bike.add(tailLight);

  // 8. Chân chống nghiêng
  const kickstand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.38, 6), darkMetal);
  kickstand.position.set(-0.16, 0.16, -0.05);
  kickstand.rotation.z = 0.48;
  kickstand.rotation.y = 0.2;
  root.add(kickstand);

  scene.add(root);
  return root;
}
buildSaigonMotorbike(-13.8, 3.0, Math.PI / 3, 0xdc2626, "Wave Alpha", "59-S2 999.99");
buildSaigonMotorbike(14.2, 3.1, -Math.PI / 3.5, 0x2563eb, "Wave RSX", "59-K1 888.88");

// 3. Tường gạch rêu phong phía sau
const wallGeo = new THREE.BoxGeometry(36, 8.0, 0.6);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.88 });
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.set(0, 4.0, -5.2);
wall.receiveShadow = true;
scene.add(wall);

// Tường bên trái (Left Wall) có biển Neon Ly Bia
const leftWall = new THREE.Group();
const leftWallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.88 });
// Real doorway: 2.4m wide at z=-2.7, with a 3m lintel.
for (const [height, depth, y, z] of [[8, 1.75, 4, -4.775], [8, 5.65, 4, 1.325], [5, 2.4, 5.5, -2.7]]) {
  const section = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, depth), leftWallMaterial);
  section.position.set(-17.7, y, z); section.receiveShadow = true; leftWall.add(section);
}
scene.add(leftWall);

// Fade walls/buildings out when they sit between the camera and the player (e.g. back to the wall, camera orbited outside).
const occluderWalls = [wall, ...leftWall.children];
const occluderFades = new Map();
const occluderRay = new THREE.Raycaster();
const occluderDir = new THREE.Vector3();
const occluderOrigin = new THREE.Vector3();
const occluderFollowers = new Map(); // material -> decor materials that fade together with it
const occluderBoxes = []; // buildings: also fade when the camera hovers above/inside their footprint
function registerOccluder(mesh, followers) {
  occluderWalls.push(mesh);
  occluderBoxes.push({ box: new THREE.Box3().setFromObject(mesh), mat: mesh.material });
  if (!occluderFades.has(mesh.material)) occluderFades.set(mesh.material, 1);
  if (followers) occluderFollowers.set(mesh.material, followers);
}
occluderFades.set(wallMat, 1);
occluderFades.set(leftWallMaterial, 1);
function updateWallOcclusion(delta) {
  occluderOrigin.set(localPlayerState.x, 1.2, localPlayerState.z);
  occluderDir.copy(camera.position).sub(occluderOrigin);
  const dist = occluderDir.length();
  occluderRay.set(occluderOrigin, occluderDir.normalize());
  occluderRay.far = dist;
  const blocked = new Set();
  if (!isScenicView) for (const hit of occluderRay.intersectObjects(occluderWalls, false)) blocked.add(hit.object.material);
  if (!isScenicView) {
    const cp = camera.position;
    for (const { box, mat } of occluderBoxes) {
      if (cp.x > box.min.x - 0.5 && cp.x < box.max.x + 0.5 && cp.z > box.min.z - 0.5 && cp.z < box.max.z + 0.5) blocked.add(mat);
    }
  }
  const k = 1 - Math.exp(-10 * delta);
  occluderFades.forEach((fade, m) => {
    fade += ((blocked.has(m) ? 0.12 : 1) - fade) * k;
    occluderFades.set(m, fade);
    const solid = fade > 0.98;
    for (const mm of [m, ...(occluderFollowers.get(m) || [])]) {
      mm.transparent = !solid;
      mm.opacity = solid ? 1 : fade;
      mm.depthWrite = solid;
    }
  });
}

// Biển Neon Ly Bia phát sáng ở tường trái (Giống hình chụp)
function createNeonBeerSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#ffd000';
  ctx.lineWidth = 18;
  ctx.shadowColor = '#ffd000';
  ctx.shadowBlur = 30;

  // Vẽ hình ly bia neon
  ctx.strokeRect(140, 160, 180, 260);
  // Quai ly
  ctx.beginPath();
  ctx.arc(350, 290, 70, -Math.PI / 2, Math.PI / 2, false);
  ctx.stroke();

  // Bọt bia trắng
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.arc(170, 140, 45, 0, Math.PI * 2);
  ctx.arc(230, 125, 55, 0, Math.PI * 2);
  ctx.arc(290, 140, 45, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 3.5),
    new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.15
    })
  );
  mesh.position.set(-16.35, 3.8, 0);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);

  const neonLight = new THREE.PointLight(0xffd000, 1.8, 10);
  neonLight.position.set(-15.5, 3.8, 0);
  scene.add(neonLight);
}
createNeonBeerSign();

// 4. Bảng hiệu Neon 3D: "KHÔNG SAY KHÔNG VỀ - BIA HƠI & ĐỒ NƯỚNG"
const signCanvas = document.createElement('canvas');
signCanvas.width = 1024;
signCanvas.height = 256;
const sctx = signCanvas.getContext('2d');
sctx.fillStyle = '#0b1120';
sctx.fillRect(0, 0, 1024, 256);
sctx.font = 'bold 72px sans-serif';
sctx.fillStyle = '#ffd000';
sctx.textAlign = 'center';
sctx.shadowColor = '#ff3344';
sctx.shadowBlur = 25;
sctx.fillText('🍻 QUÁN NHẬU 1 2 3 DÔ 🍺', 512, 105);
sctx.font = '38px sans-serif';
sctx.fillStyle = '#00d2ff';
sctx.shadowColor = '#00d2ff';
sctx.shadowBlur = 18;
sctx.fillText('KHÔNG SAY KHÔNG VỀ - BIA HƠI & ĐỒ NƯỚNG', 512, 185);

const signTex = new THREE.CanvasTexture(signCanvas);
const signFront = new THREE.Mesh(
  new THREE.PlaneGeometry(10.5, 2.2),
  new THREE.MeshStandardMaterial({
    map: signTex,
    emissiveMap: signTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.45,
    roughness: 0.2
  })
);
signFront.position.set(0, 5.5, -4.85);
scene.add(signFront);

// 5. Hai Biển Gỗ Treo Nghiêng: "Hết Phục Vụ!" & "Chưa Ai Đâu!" (Theo đúng hình chụp)
function createHangingWoodenSign(text, posX, posY, posZ, rotZ) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Nền giấy gỗ vàng nhạt
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.font = 'bold 64px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#1e1b4b';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 145);

  const tex = new THREE.CanvasTexture(canvas);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
  );
  board.position.set(posX, posY, posZ);
  board.rotation.z = rotZ;
  scene.add(board);

  // 2 dây thừng treo lên tường
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x92400e });
  const rope1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), ropeMat);
  rope1.position.set(posX - 0.7, posY + 0.8, posZ - 0.02);
  scene.add(rope1);

  const rope2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), ropeMat);
  rope2.position.set(posX + 0.7, posY + 0.8, posZ - 0.02);
  scene.add(rope2);
}
createHangingWoodenSign("Hết Phục Vụ!", -1.6, 4.2, -4.85, -0.07);
createHangingWoodenSign("Chưa Ai Đâu!", 5.2, 4.3, -4.85, 0.05);

// 6. Dây Đèn Bistro Vàng Ấm Cúng & Dây Điện Chằng Chịt Sài Gòn
function createBistroStringLights() {
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.35,
    roughness: 0.2
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x18181b });

  // 3 Hàng dây đèn giăng chéo quán
  [-2.2, 0.4, 2.6].forEach((zLine, rowIdx) => {
    // Sợi dây đen
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-16, 5.2, zLine),
      new THREE.Vector3(0, 4.4, zLine + 0.2),
      new THREE.Vector3(16, 5.2, zLine)
    ]);
    const wireGeo = new THREE.TubeGeometry(curve, 32, 0.015, 6, false);
    const wire = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wire);

    // Bóng đèn Edison vàng ấm áp
    for (let i = -14; i <= 14; i += 2.2) {
      const sagY = 4.4 + 0.8 * Math.pow(i / 15, 2);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), bulbMat);
      bulb.position.set(i, sagY - 0.12, zLine + (Math.random() - 0.5) * 0.1);
      scene.add(bulb);

      // Thêm đui đèn đen
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), wireMat);
      socket.position.set(i, sagY - 0.04, zLine);
      scene.add(socket);

      // Cứ 3 bóng thì có 1 ánh sáng hắt nhẹ xuống bàn nhậu
      if (Math.abs(Math.round(i)) % 4 === 0 && rowIdx === 1) {
        const warmGlow = new THREE.PointLight(0xf59e0b, 0.45, 5.5);
        warmGlow.position.set(i, sagY - 0.2, zLine);
        scene.add(warmGlow);
      }
    }
  });

  // Dây điện chằng chịt treo cao qua đường
  [-5, 5].forEach(xOffset => {
    const electricWireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-18 + xOffset, 6.8, -4.8),
      new THREE.Vector3(-6 + xOffset, 5.8, 4.0),
      new THREE.Vector3(10 + xOffset, 6.2, 12.0),
      new THREE.Vector3(22 + xOffset, 7.0, 18.0)
    ]);
    const eWire = new THREE.Mesh(
      new THREE.TubeGeometry(electricWireCurve, 40, 0.02, 4, false),
      wireMat
    );
    scene.add(eWire);
  });
}
createBistroStringLights();

// 7. Két bia nhựa mở nắp xếp tầng với chai bia thật (Saigon Special & Tiger)
function createBeerCrate(x, y, z, colorHex, brand = "SAIGON") {
  const crateGroup = new THREE.Group();
  crateGroup.position.set(x, y, z);

  const crateMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.38, metalness: 0.08 });
  const bottleGreen = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.88 });
  const goldCap = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });

  // Đáy két
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.72), crateMat);
  crateGroup.add(base);

  // 4 vách thành két dập gân
  const wallFront = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.48, 0.06), crateMat);
  wallFront.position.set(0, 0.24, 0.33);
  crateGroup.add(wallFront);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.48, 0.06), crateMat);
  wallBack.position.set(0, 0.24, -0.33);
  crateGroup.add(wallBack);

  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.66), crateMat);
  wallLeft.position.set(-0.45, 0.24, 0);
  crateGroup.add(wallLeft);

  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.66), crateMat);
  wallRight.position.set(0.45, 0.24, 0);
  crateGroup.add(wallRight);

  // Nhãn thương hiệu in ngang thành két
  const lCanvas = document.createElement('canvas');
  lCanvas.width = 256; lCanvas.height = 64;
  const lctx = lCanvas.getContext('2d');
  lctx.fillStyle = '#ffffff';
  lctx.font = 'bold 30px sans-serif';
  lctx.textAlign = 'center';
  lctx.fillText(brand, 128, 44);

  const logoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.18),
    new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(lCanvas), transparent: true })
  );
  logoMesh.position.set(0, 0.24, 0.365);
  crateGroup.add(logoMesh);

  // 12 Cổ chai bia thủy tinh nhô lên có nắp keng vàng
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const bx = -0.32 + c * 0.21;
      const bz = -0.2 + r * 0.2;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 0.24, 8), bottleGreen);
      neck.position.set(bx, 0.38, bz);
      crateGroup.add(neck);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 8), goldCap);
      cap.position.set(bx, 0.50, bz);
      crateGroup.add(cap);
    }
  }

  scene.add(crateGroup);
  return crateGroup;
}
createBeerCrate(-14.5, 0.35, -3.8, 0xb91c1c, "BIA SAIGON");
createBeerCrate(-14.5, 0.95, -3.8, 0xb91c1c, "BIA SAIGON");
createBeerCrate(-13.4, 0.35, -3.8, 0x1d4ed8, "TIGER BEER");

// 8. Rác Vỉa Hè Chi Tiết (Lon bia lăn lóc, Tàn thuốc, Vé số, Chiếc tất - Y hệt hình)
function spawnSidewalkLitter() {
  // Tờ vé số kiến thiết rơi trên đất
  const lotteryCanvas = document.createElement('canvas');
  lotteryCanvas.width = 256;
  lotteryCanvas.height = 128;
  const lctx = lotteryCanvas.getContext('2d');
  lctx.fillStyle = '#fef08a';
  lctx.fillRect(0, 0, 256, 128);
  lctx.font = 'bold 28px sans-serif';
  lctx.fillStyle = '#dc2626';
  lctx.textAlign = 'center';
  lctx.fillText('LOTTERY', 128, 42);
  lctx.font = '20px sans-serif';
  lctx.fillStyle = '#1e293b';
  lctx.fillText('VÉ SỐ KIẾN THIẾT', 128, 76);
  lctx.fillText('9 8 7 6 5 4', 128, 108);

  const lotteryMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lotteryCanvas) })
  );
  lotteryMesh.rotation.x = -Math.PI / 2;
  lotteryMesh.rotation.z = 0.25;
  lotteryMesh.position.set(-2.8, 0.31, 1.8);
  scene.add(lotteryMesh);

  // Chiếc tất (vớ) trắng rơi trên sàn
  const sock = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.05, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 })
  );
  sock.rotation.y = 0.6;
  sock.position.set(-7.2, 0.32, 1.5);
  scene.add(sock);

  // Lon bia rỗng nằm lăn lóc
  const canMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.2 });
  const canPositions = [
    [-0.5, 0.35, 1.6, 0.8],
    [2.8, 0.35, 1.2, -0.4],
    [-5.6, 0.35, 0.8, 1.2],
    [6.8, 0.35, 2.1, -1.0],
    [1.5, 0.35, -1.8, 0.3]
  ];
  canPositions.forEach(([cx, cy, cz, crot]) => {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.24, 8), canMat);
    can.rotation.z = Math.PI / 2;
    can.rotation.y = crot;
    can.position.set(cx, cy, cz);
    scene.add(can);
  });

  // Tàn thuốc lá (Cigarette butts)
  const buttMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9 });
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const buttPositions = [
    [4.6, 0.31, 1.8, 0.3],
    [2.2, 0.31, 2.5, -0.7],
    [-3.5, 0.31, 0.9, 1.1]
  ];
  buttPositions.forEach(([bx, by, bz, brot]) => {
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), buttMat);
    butt.rotation.z = Math.PI / 2;
    butt.rotation.y = brot;
    butt.position.set(bx, by, bz);
    scene.add(butt);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 4), tipMat);
    tip.position.set(bx + 0.08 * Math.cos(brot), by, bz + 0.08 * Math.sin(brot));
    scene.add(tip);
  });

  // Đôi đũa tre rơi trên sàn
  const chopstickMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 });
  const cs1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.6, 4), chopstickMat);
  cs1.rotation.z = Math.PI / 2;
  cs1.rotation.y = 0.4;
  cs1.position.set(7.5, 0.31, 1.6);
  scene.add(cs1);

  const cs2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.6, 4), chopstickMat);
  cs2.rotation.z = Math.PI / 2;
  cs2.rotation.y = 0.44;
  cs2.position.set(7.6, 0.31, 1.7);
  scene.add(cs2);
}
spawnSidewalkLitter();

// ========================================================
// 4. Bàn Nhậu 3D & Món Ăn (Gà Nướng Xương Khủng & Heo Quay Ngậm Táo)
// ========================================================
const pubTables = [];
const chairSlots = [];

function buildPubTable(tableId, posX, posZ) {
  const tableGroup = new THREE.Group();
  tableGroup.position.set(posX, 0.3, posZ);

  // Inox folding legs (Chân gấp chữ X ống inox sáng bóng)
  const inoxLegMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
  const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.88, 12), inoxLegMat);
  leg1.rotation.z = 0.32;
  leg1.position.set(-0.25, 0.42, 0);
  tableGroup.add(leg1);

  const leg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.88, 12), inoxLegMat);
  leg2.rotation.z = -0.32;
  leg2.position.set(0.25, 0.42, 0);
  tableGroup.add(leg2);

  // Mặt bàn Inox tròn bóng loáng chuẩn quán nhậu Sài Gòn (Brushed Stainless Steel Top)
  const inoxTopTex = createInoxBrushedTexture();
  const topMat = new THREE.MeshStandardMaterial({
    map: inoxTopTex,
    color: 0xf8fafc,
    metalness: 0.92,
    roughness: 0.18
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.05, 36), topMat);
  top.position.y = 0.82;
  top.receiveShadow = true;
  tableGroup.add(top);

  // Viền gờ inox bo tròn mép bàn
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.035, 8, 36), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.82;
  tableGroup.add(rim);

  // Xô đá đỏ ướp bia có cục đá trong suốt (Red Ice Bucket with Translucent Ice Cubes)
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 16), bucketMat);
  bucket.position.set(0.85, 1.03, 0.35);
  tableGroup.add(bucket);

  // Đá lạnh trong suốt trong xô
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.75,
    roughness: 0.1,
    metalness: 0.1
  });
  for (let ic = 0; ic < 6; ic++) {
    const ice = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), iceMat);
    ice.position.set(0.85 + (Math.random() - 0.5) * 0.22, 1.18 + Math.random() * 0.08, 0.35 + (Math.random() - 0.5) * 0.22);
    ice.rotation.set(Math.random(), Math.random(), Math.random());
    tableGroup.add(ice);
  }

  // Chai bia thủy tinh ướp lạnh cắm trong xô đá
  const bottleGreenMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    transparent: true,
    opacity: 0.85,
    roughness: 0.15,
    metalness: 0.2
  });
  const bottleAmberMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    transparent: true,
    opacity: 0.85,
    roughness: 0.15,
    metalness: 0.2
  });

  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.38, 12), bottleGreenMat);
  b1.rotation.z = 0.22;
  b1.position.set(0.8, 1.3, 0.3);
  tableGroup.add(b1);

  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.38, 12), bottleAmberMat);
  b2.rotation.z = -0.22;
  b2.position.set(0.9, 1.3, 0.4);
  tableGroup.add(b2);

  // MÓN ĂN QUÁN NHẬU ĐẬM CHẤT SÀI GÒN THEO TỪNG BÀN
  if (tableId === 0) {
    // BÀN 1: ĐĨA ỐC HƯƠNG XÀO BƠ TỎI & ĐĨA ĐẬU PHỘNG RANG TỎI ỚT
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 0.82, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    plate.position.set(-0.1, 0.86, 0.1);
    tableGroup.add(plate);

    // Nước sốt bơ tỏi vàng ươm
    const butterSauce = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.02, 20),
      new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.2 })
    );
    butterSauce.position.set(-0.1, 0.88, 0.1);
    tableGroup.add(butterSauce);

    // Những con ốc hương thơm lừng
    const snailMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 });
    for (let sn = 0; sn < 12; sn++) {
      const angle = (sn * Math.PI * 2) / 12;
      const r = 0.15 + (sn % 3) * 0.16;
      const snail = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), snailMat);
      snail.scale.set(1.4, 0.8, 0.9);
      snail.position.set(-0.1 + Math.cos(angle) * r, 0.92, 0.1 + Math.sin(angle) * r);
      snail.rotation.y = angle;
      tableGroup.add(snail);
    }

    // Ớt sừng đỏ & lát sả xắt xéo
    const chiliMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    for (let ch = 0; ch < 5; ch++) {
      const chili = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), chiliMat);
      chili.position.set(-0.1 + (Math.random() - 0.5) * 0.5, 0.94, 0.1 + (Math.random() - 0.5) * 0.5);
      chili.rotation.y = Math.random() * Math.PI;
      tableGroup.add(chili);
    }

    // Đĩa Đậu Phộng Nem Chua
    const plate2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.5, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })
    );
    plate2.position.set(-0.65, 0.86, -0.6);
    tableGroup.add(plate2);

    const peanutMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 });
    for (let pn = 0; pn < 15; pn++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), peanutMat);
      p.scale.set(1.5, 1, 1);
      p.position.set(-0.65 + (Math.random() - 0.5) * 0.35, 0.89, -0.6 + (Math.random() - 0.5) * 0.35);
      tableGroup.add(p);
    }
  } else {
    // BÀN 2: ĐĨA MỰC NƯỚNG MUỐI ỚT & CHÉN MUỐI TIÊU CHANH
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 0.86, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    plate.position.set(0.1, 0.86, 0.05);
    tableGroup.add(plate);

    // Mực nướng vàng xém sa tế thơm lừng
    const squidMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.55 });
    const squidBody = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.4), squidMat);
    squidBody.position.set(0.1, 0.9, 0.05);
    tableGroup.add(squidBody);

    // Khía vảy mực nướng
    const charMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8 });
    for (let k = -2; k <= 2; k++) {
      const cut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.36), charMat);
      cut.position.set(0.1 + k * 0.1, 0.91, 0.05);
      tableGroup.add(cut);
    }

    // Râu mực nướng
    for (let r = 0; r < 4; r++) {
      const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.28, 6), squidMat);
      tentacle.rotation.z = Math.PI / 2.5 + (r - 1.5) * 0.15;
      tentacle.position.set(0.5, 0.9, 0.05 + (r - 1.5) * 0.09);
      tableGroup.add(tentacle);
    }

    // Chén muối tiêu chanh & ớt hiểm
    const sauceBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.12, 0.08, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    sauceBowl.position.set(-0.6, 0.88, -0.5);
    tableGroup.add(sauceBowl);

    const pepperMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const pepper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12), pepperMat);
    pepper.position.set(-0.6, 0.91, -0.5);
    tableGroup.add(pepper);

    // Lát chanh xanh
    const limeMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.4 });
    const lime = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 10), limeMat);
    lime.position.set(-0.54, 0.93, -0.46);
    tableGroup.add(lime);
  }

  // Ly bia thủy tinh có bọt đặt trên bàn
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.85,
    roughness: 0.1,
    metalness: 0.15
  });
  const mugPositions = [
    [-0.8, 0.84, 0.45],
    [0.1, 0.84, -0.85],
    [-0.7, 0.84, -0.3]
  ];
  mugPositions.forEach(([mx, my, mz]) => {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.22, 12), glassMat);
    mug.position.set(mx, my + 0.11, mz);
    tableGroup.add(mug);

    const foam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.095, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
    );
    foam.position.set(mx, my + 0.23, mz);
    tableGroup.add(foam);
  });

  scene.add(tableGroup);
  pubTables.push({ id: tableId, x: posX, z: posZ, group: tableGroup });

  // 6 Ghế nhựa Duy Tân vỉa hè chân chữ A choãi góc chuẩn quán nhậu
  const totalSeats = 6;
  const radius = 2.15;

  for (let s = 0; s < totalSeats; s++) {
    const angle = (s * Math.PI * 2) / totalSeats;
    const chairX = posX + Math.cos(angle) * radius;
    const chairZ = posZ + Math.sin(angle) * radius;

    const chairColor = s % 2 === 0 ? 0xdc2626 : 0x2563eb;
    const chairGroup = new THREE.Group();
    chairGroup.position.set(chairX, 0.3, chairZ);
    chairGroup.lookAt(posX, 0.3, posZ);

    const plasticMat = new THREE.MeshStandardMaterial({ color: chairColor, roughness: 0.32, metalness: 0.04 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });

    // Mặt ghế nhựa bo góc mềm mại
    const seatRim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.05, 18), plasticMat);
    seatRim.position.y = 0.48;
    chairGroup.add(seatRim);

    // Lòng ghế lõm nhẹ công thái học
    const seatPan = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.03, 18), plasticMat);
    seatPan.position.y = 0.49;
    chairGroup.add(seatPan);

    // Lỗ xỏ tay tròn Duy Tân có gờ viền nổi
    const holeRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 16), plasticMat);
    holeRing.rotation.x = Math.PI / 2;
    holeRing.position.y = 0.505;
    chairGroup.add(holeRing);

    const holeVoid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), new THREE.MeshBasicMaterial({ color: 0x09090b }));
    holeVoid.position.y = 0.49;
    chairGroup.add(holeVoid);

    // Vành gờ chống biến dạng dưới đáy mặt ghế
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.33, 0.08, 16, 1, true), plasticMat);
    skirt.position.y = 0.43;
    chairGroup.add(skirt);

    // 4 Chân ghế choãi góc chữ A nghiêng 11 độ chịu lực + 4 đế cao su đen
    const legAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    legAngles.forEach((ang) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.48, 8), plasticMat);
      const rad = 0.24;
      leg.position.set(Math.cos(ang) * rad, 0.24, Math.sin(ang) * rad);
      leg.rotation.x = -Math.sin(ang) * 0.18;
      leg.rotation.z = Math.cos(ang) * 0.18;
      chairGroup.add(leg);

      const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 8), rubberMat);
      footPad.position.set(Math.cos(ang) * (rad + 0.04), 0.015, Math.sin(ang) * (rad + 0.04));
      chairGroup.add(footPad);
    });

    scene.add(chairGroup);
    chairSlots.push({
      tableId: tableId,
      seatId: s,
      x: chairX,
      z: chairZ,
      ry: chairGroup.rotation.y,
      mesh: chairGroup
    });
  }
}

// Dựng 2 bàn nhậu: Bàn 1 (Trái) & Bàn 2 (Phải)
buildPubTable(0, -4.2, 0.0);
buildPubTable(1, 4.2, 0.0);

// ========================================================
// 5. CÔNG VIÊN BỜ SÔNG, CẦU TÀU & VƯỜN HOA RỰC RỠ (EXPANDED RIVERSIDE PARK & PROMENADE)
// ========================================================
let parkFireflies = null;

function buildRiversidePark() {
  // Gờ vỉa hè phía công viên (Đón người qua đường từ quán nhậu sang công viên)
  const parkCurb = new THREE.Mesh(
    new THREE.BoxGeometry(96, 0.35, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8896ab, roughness: 0.7 })
  );
  parkCurb.position.set(0, 0.175, 11.5);
  scene.add(parkCurb);

  // 1. Thảm cỏ xanh mướt trải rộng của công viên (Expanded Lush Grass Lawn)
  const lawnGeo = new THREE.BoxGeometry(96, 0.3, 16.5);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85 });
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.position.set(0, 0.15, 20.0);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // 2. Lối đi dạo ven sông lát đá hoa cương chống trơn (Granite Promenade Path)
  const pathGeo = new THREE.BoxGeometry(96, 0.32, 4.4);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.position.set(0, 0.16, 26.2);
  path.receiveShadow = true;
  scene.add(path);

  // 3. CẦU TÀU GỖ BẾN BẠCH ĐẰNG NGẮM CẢNH (Scenic Waterfront Observation Pier)
  // Nhô hẳn ra mặt nước sông Sài Gòn (Z từ 26.0 đến 33.2, rộng 16m)
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.32, 7.2),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.75 })
  );
  pierDeck.position.set(0, 0.16, 29.6);
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);

  // Cột cừ tràm / trụ gỗ cắm sâu xuống đáy sông đỡ cầu tàu
  const pierPilingMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
  const pilingPositions = [
    [-7.2, 27.2], [7.2, 27.2],
    [-7.2, 30.0], [7.2, 30.0],
    [-7.2, 32.8], [7.2, 32.8],
    [-2.5, 32.8], [2.5, 32.8]
  ];
  pilingPositions.forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.8, 8), pierPilingMat);
    post.position.set(px, -0.6, pz);
    scene.add(post);
  });

  // Lan can gỗ & dây thừng quanh 3 cạnh cầu tàu
  const pierRailMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
  const pierRailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 7.2), pierRailMat);
  pierRailLeft.position.set(-7.95, 0.75, 29.6);
  scene.add(pierRailLeft);
  pubDetails.obstacles.push({ x: -8.0, z: 29.6, w: 0.3, d: 7.2 });

  const pierRailRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 7.2), pierRailMat);
  pierRailRight.position.set(7.95, 0.75, 29.6);
  scene.add(pierRailRight);
  pubDetails.obstacles.push({ x: 8.0, z: 29.6, w: 0.3, d: 7.2 });

  const pierRailFront = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.95, 0.14), pierRailMat);
  pierRailFront.position.set(0, 0.75, 33.15);
  scene.add(pierRailFront);
  pubDetails.obstacles.push({ x: 0, z: 33.2, w: 16.4, d: 0.3 });

  // Phao cứu sinh đỏ trắng treo trên lan can cầu tàu
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
  [-5.5, 5.5].forEach(bx => {
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 10, 20), buoyMat);
    buoy.position.set(bx, 0.8, 33.1);
    scene.add(buoy);
  });

  // Kính ngắm viễn vọng du lịch ngắm Landmark 81 & Du thuyền
  const scopeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.25 });
  [-2.2, 2.2].forEach(sx => {
    const scopeGroup = new THREE.Group();
    scopeGroup.position.set(sx, 0.32, 32.6);
    const sStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.1, 8), scopeMat);
    sStand.position.y = 0.55;
    scopeGroup.add(sStand);
    const sBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.6, 12), scopeMat);
    sBarrel.rotation.x = Math.PI / 2.3;
    sBarrel.position.set(0, 1.12, 0.1);
    scopeGroup.add(sBarrel);
    scene.add(scopeGroup);
  });

  // Đèn lồng hàng hải ấm áp trên 4 góc cầu tàu
  [[-7.8, 26.5], [7.8, 26.5], [-7.8, 32.8], [7.8, 32.8]].forEach(([lx, lz]) => {
    const plamp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    plamp.position.set(lx, 1.35, lz);
    scene.add(plamp);
    const plight = new THREE.PointLight(0xfef08a, 1.2, 9);
    plight.position.set(lx, 1.35, lz);
    scene.add(plight);
  });

  // 4. GHẾ ĐÁ MÀI HOA CƯƠNG ĐỎ ĐÔ & XANH NGỌC CÔNG VIÊN (High-Contrast Terrazzo Benches)
  // Không còn bị chìm màu vào nền đường; mài bóng sắc nét có dòng chữ mạ vàng lưu niệm
  function buildStoneBench(bx, bz, ry, colorType, sponsorText, tableId) {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(bx, 0.32, bz);
    benchGroup.rotation.y = ry;

    const benchTex = createStoneBenchTexture(colorType, sponsorText);
    const stoneSurfaceMat = new THREE.MeshStandardMaterial({
      map: benchTex,
      roughness: 0.25,
      metalness: 0.15
    });
    // Chân ghế đá hoa cương mài xám đen tạo độ tương phản cực kỳ sắc nét với mặt đường
    const legStoneMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    // Mặt ngồi ghế đá
    const bSeat = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.09, 0.62), stoneSurfaceMat);
    bSeat.position.y = 0.42;
    benchGroup.add(bSeat);

    // Tựa lưng ghế đá hơi ngả về sau
    const bBack = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.46, 0.09), stoneSurfaceMat);
    bBack.position.set(0, 0.68, -0.27);
    bBack.rotation.x = -0.10;
    benchGroup.add(bBack);

    // 2 chân ghế đá đúc khối vững chãi
    const bLeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.52), legStoneMat);
    bLeg1.position.set(-0.62, 0.21, 0);
    benchGroup.add(bLeg1);

    const bLeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.52), legStoneMat);
    bLeg2.position.set(0.62, 0.21, 0);
    benchGroup.add(bLeg2);

    scene.add(benchGroup);

    // Đăng ký ghế ngồi tương tác [E]
    chairSlots.push({
      tableId,
      seatId: 0,
      x: bx,
      z: bz,
      ry,
      mesh: benchGroup
    });
  }

  // Bố trí ghế đá dọc lối dạo ven sông (Promenade Benches)
  buildStoneBench(-28, 25.2, 0, 'red', 'QUÁN NHẬU 3D • KÍNH TẶNG', 10);
  buildStoneBench(-18, 25.2, 0, 'green', 'BIA SÀI GÒN - VỊ BIA CỦA RỒNG', 11);
  buildStoneBench(-10, 25.2, 0, 'red', 'CÔNG VIÊN BẠCH ĐẰNG • CHILL', 12);
  buildStoneBench(10, 25.2, 0, 'green', 'BIA TIGER CRYSTAL • MÁT LẠNH', 13);
  buildStoneBench(18, 25.2, 0, 'red', 'QUÁN NHẬU 3D • KÍNH TẶNG', 14);
  buildStoneBench(28, 25.2, 0, 'green', 'BIA HEINEKEN • TUYỆT HẢO', 15);

  // 2 ghế đá vip trên đầu cầu tàu ngắm Landmark 81
  buildStoneBench(-4.5, 31.8, 0, 'red', 'CẦU TÀU BẠCH ĐẰNG • KÍNH TẶNG', 16);
  buildStoneBench(4.5, 31.8, 0, 'green', 'NGẮM SÔNG SÀI GÒN & LANDMARK 81', 17);

  // Ghế đá thư giãn trong thảm cỏ công viên
  buildStoneBench(-16, 16.5, Math.PI, 'green', 'QUÁN NHẬU 3D • KÍNH TẶNG', 18);
  buildStoneBench(16, 16.5, Math.PI, 'red', 'BIA SÀI GÒN CHILL • SẢNG KHOÁI', 19);

  // 5. BỒN HOA TRÒN TRUNG TÂM CÔNG VIÊN (Grand Multi-Tiered Circular Flowerbed)
  const flowerBedGroup = new THREE.Group();
  flowerBedGroup.position.set(0, 0.32, 19.5);

  // Bệ đá bó bồn hoa tròn
  const bedCurb = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.8, 0.45, 28),
    new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.8 })
  );
  bedCurb.position.y = 0.22;
  flowerBedGroup.add(bedCurb);

  // Đất mùn màu mỡ
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(3.45, 3.45, 0.46, 28),
    new THREE.MeshStandardMaterial({ color: 0x271914, roughness: 0.9 })
  );
  soil.position.y = 0.23;
  flowerBedGroup.add(soil);

  // Các vòng hoa nhiệt đới rực rỡ (Cúc vạn thọ vàng, Hoa hồng đỏ, Mẫu đơn tím)
  const flowerColors = [0xfacc15, 0xef4444, 0xa855f7, 0xf97316, 0xf43f5e];
  for (let ring = 0; ring < 3; ring++) {
    const rad = 2.8 - ring * 0.9;
    const count = 18 - ring * 5;
    for (let fi = 0; fi < count; fi++) {
      const fAngle = (fi / count) * Math.PI * 2;
      const fx = Math.cos(fAngle) * rad;
      const fz = Math.sin(fAngle) * rad;
      const fColor = flowerColors[(fi + ring * 2) % flowerColors.length];
      const flower = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + (fi % 3) * 0.04),
        new THREE.MeshStandardMaterial({ color: fColor, roughness: 0.6 })
      );
      flower.position.set(fx, 0.48 + ring * 0.08, fz);
      flowerBedGroup.add(flower);

      // Cuống lá xanh
      const leafStem = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 })
      );
      leafStem.position.set(fx, 0.38 + ring * 0.08, fz);
      flowerBedGroup.add(leafStem);
    }
  }

  // Cây sứ đại ra hoa giữa bồn hoa tròn (Frangipani Flowering Tree)
  const fTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 2.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x573a24, roughness: 0.9 })
  );
  fTrunk.position.y = 1.6;
  flowerBedGroup.add(fTrunk);

  for (let tb = 0; tb < 4; tb++) {
    const bAngle = (tb / 4) * Math.PI * 2;
    const fCanopy = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.9),
      new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 })
    );
    fCanopy.position.set(Math.cos(bAngle) * 0.7, 2.9 + (tb % 2) * 0.3, Math.sin(bAngle) * 0.7);
    flowerBedGroup.add(fCanopy);

    const fBloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffedd5 })
    );
    fBloom.position.set(Math.cos(bAngle) * 0.95, 3.1 + (tb % 2) * 0.3, Math.sin(bAngle) * 0.95);
    flowerBedGroup.add(fBloom);
  }

  scene.add(flowerBedGroup);
  pubDetails.obstacles.push({ x: 0, z: 19.5, w: 7.2, d: 7.2 });

  // 6. GIÀN HOA GIẤY RỰC RỠ BỜ SÔNG (Saigon Bougainvillea Pergola)
  function buildBougainvilleaPergola(startX, startZ) {
    const pergolaGroup = new THREE.Group();
    pergolaGroup.position.set(startX, 0.32, startZ);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3f2e1e, roughness: 0.8 });
    const flowerMat1 = new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.65 }); // Hồng tím rực rỡ
    const flowerMat2 = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.65 }); // Đỏ hồng thắm
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });

    // 4 Cột gỗ giàn hoa
    [[-2.8, -1.0], [2.8, -1.0], [-2.8, 1.0], [2.8, 1.0]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), woodMat);
      post.position.set(px, 1.6, pz);
      pergolaGroup.add(post);
    });

    // Xà gồ ngang
    const beam1 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 0.18), woodMat);
    beam1.position.set(0, 3.1, -1.0);
    pergolaGroup.add(beam1);
    const beam2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 0.18), woodMat);
    beam2.position.set(0, 3.1, 1.0);
    pergolaGroup.add(beam2);

    for (let bx = -2.8; bx <= 2.8; bx += 0.9) {
      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.4), woodMat);
      crossBeam.position.set(bx, 3.2, 0);
      pergolaGroup.add(crossBeam);

      // Chùm hoa giấy rủ bóng
      for (let fi = 0; fi < 3; fi++) {
        const cluster = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.35 + Math.random() * 0.15),
          fi % 2 === 0 ? flowerMat1 : flowerMat2
        );
        cluster.position.set(bx + (Math.random() - 0.5) * 0.3, 3.0 - Math.random() * 0.5, (fi - 1) * 0.8);
        pergolaGroup.add(cluster);
      }
    }

    // Đèn lồng treo giữa giàn hoa
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    lantern.position.set(0, 2.9, 0);
    pergolaGroup.add(lantern);
    const pLight = new THREE.PointLight(0xfef08a, 1.1, 8);
    pLight.position.set(0, 2.85, 0);
    pergolaGroup.add(pLight);

    scene.add(pergolaGroup);
  }

  // Dựng giàn hoa giấy bắc qua lối vào cầu tàu và bờ kè
  buildBougainvilleaPergola(0, 26.2);
  buildBougainvilleaPergola(20, 26.2);

  // 7. HÀNG CÂY DỪA BỜ SÔNG & CÂY BÀNG VUÔNG (Saigon Coconut Palms & Shade Trees)
  const palmPositions = [-38, -26, -14, 14, 26, 38];
  palmPositions.forEach((px) => {
    const palmGroup = new THREE.Group();
    palmGroup.position.set(px, 0.32, 27.2);

    // Thân dừa uốn lượn cong cong tự nhiên về phía sông
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 5.2, 10), trunkMat);
    trunk.position.set(0, 2.5, 0.35);
    trunk.rotation.x = 0.14; // Hơi nghiêng ra phía sông
    palmGroup.add(trunk);

    // Trái dừa xanh múp míp
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.6 });
    for (let c = 0; c < 4; c++) {
      const cnut = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), coconutMat);
      cnut.position.set(Math.cos(c * 1.5) * 0.28, 4.9, 0.5 + Math.sin(c * 1.5) * 0.28);
      palmGroup.add(cnut);
    }

    // Tán lá dừa xoè rộng 8 hướng
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });
    for (let f = 0; f < 8; f++) {
      const fAngle = (f / 8) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 2.4), frondMat);
      frond.rotation.y = fAngle;
      frond.rotation.x = 0.45;
      frond.position.set(Math.cos(fAngle) * 1.1, 5.0, 0.5 + Math.sin(fAngle) * 1.1);
      palmGroup.add(frond);
    }

    scene.add(palmGroup);
    pubDetails.obstacles.push({ x: px, z: 27.2, w: 1.0, d: 1.0 });

    peeSpots.push({
      type: "tree",
      name: `Cây Dừa Bờ Sông (${px < 0 ? 'Tây' : 'Đông'})`,
      x: px,
      z: 27.2,
      radius: 2.2
    });
  });

  // Hàng Cây Bàng & Bồn Xi Măng Trên Bãi Cỏ
  const shadeTrees = [-30, -18, -6, 6, 18, 30];
  shadeTrees.forEach((tx, i) => {
    const tz = 15.5 + (i % 2) * 2.5;
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx, 0.32, tz);
    pubDetails.obstacles.push({ x: tx, z: tz, w: 1.4, d: 1.4 });

    const planter = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.38, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 })
    );
    planter.position.y = 0.16;
    treeGroup.add(planter);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.28, 3.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x573a24, roughness: 0.9 })
    );
    trunk.position.y = 1.9;
    treeGroup.add(trunk);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });
    for (let l = 0; l < 3; l++) {
      const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35 - l * 0.28), leafMat);
      leaves.position.y = 3.4 + l * 0.95;
      treeGroup.add(leaves);
    }

    // Dây đèn LED quấn quanh gốc cây lung linh
    const fairyLight = new THREE.PointLight(0xfef08a, 0.7, 6);
    fairyLight.position.set(0, 1.8, 0);
    treeGroup.add(fairyLight);

    scene.add(treeGroup);
    peeSpots.push({
      type: "tree",
      name: "Gốc Cây Bàng Công Viên",
      x: tx,
      z: tz,
      radius: 2.3
    });
  });

  // 8. BỤI HOA & THẢM CỎ CẮT TỈA RẢI RÁC (Lively Shrub Clusters & Flower Tufts)
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
  const flowerTuftColors = [0xfacc15, 0xef4444, 0xa855f7, 0xf97316];
  for (let bx = -40; bx <= 40; bx += 7) {
    if (Math.abs(bx) < 5) continue; // tránh bồn hoa trung tâm
    const bz = 18.0 + (Math.sin(bx * 2) * 3);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), bushMat);
    shrub.scale.set(1.2, 0.8, 1.1);
    shrub.position.set(bx, 0.45, bz);
    scene.add(shrub);

    // Chùm hoa li ti trên bụi cỏ
    for (let fl = 0; fl < 4; fl++) {
      const ft = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 6, 6),
        new THREE.MeshBasicMaterial({ color: flowerTuftColors[(fl + Math.abs(bx)) % flowerTuftColors.length] })
      );
      ft.position.set(bx + Math.cos(fl * 1.5) * 0.35, 0.65, bz + Math.sin(fl * 1.5) * 0.35);
      scene.add(ft);
    }
  }

  // 9. VƯỜN CỜ TƯỚNG SÀI GÒN & CHÒI NGHỈ MÁT (West Zone: x: -33, z: 20)
  const chessGroup = new THREE.Group();
  chessGroup.position.set(-33, 0.32, 20.0);

  // Mái chòi lục giác ngói đất nung cổ kính
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.6, 1.5, 6),
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
  );
  roof.position.y = 3.6;
  chessGroup.add(roof);

  // 6 Cột chòi gỗ
  for (let pi = 0; pi < 6; pi++) {
    const pAngle = (pi / 6) * Math.PI * 2;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 })
    );
    pillar.position.set(Math.cos(pAngle) * 2.8, 1.4, Math.sin(pAngle) * 2.8);
    chessGroup.add(pillar);
  }

  // Đèn lồng đỏ treo đỉnh chòi
  const cLantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
  cLantern.position.y = 2.8;
  chessGroup.add(cLantern);
  const cLight = new THREE.PointLight(0xf87171, 1.2, 8);
  cLight.position.y = 2.7;
  chessGroup.add(cLight);

  // Bàn cờ tướng tròn bằng đá
  const chessBoardTex = createChessBoardTexture();
  const cTableMat = new THREE.MeshStandardMaterial({ map: chessBoardTex, roughness: 0.4 });
  const cTable = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.85, 0.6, 20), cTableMat);
  cTable.position.y = 0.35;
  chessGroup.add(cTable);

  // 4 Đôn đá ngồi đánh cờ
  for (let si = 0; si < 4; si++) {
    const sAngle = (si / 4) * Math.PI * 2;
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.38, 12),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 })
    );
    stool.position.set(Math.cos(sAngle) * 1.4, 0.2, Math.sin(sAngle) * 1.4);
    chessGroup.add(stool);
  }

  scene.add(chessGroup);
  pubDetails.obstacles.push({ x: -33, z: 20.0, w: 4.8, d: 4.8 });

  // 10. QUẢNG TRƯỜNG LANDMARK 81 & QUẦY ĐỒ ĂN VẶT BỜ SÔNG (East Zone: x: 33, z: 20)
  const plazaGroup = new THREE.Group();
  plazaGroup.position.set(33, 0.32, 20.0);

  // Nền gạch đá quảng trường hoa văn tròn
  const plazaPavement = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.2, 0.08, 28),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 })
  );
  plazaPavement.position.y = 0.04;
  plazaGroup.add(plazaPavement);

  // Quầy cá viên chiên & trà chanh vỉa hè lưu động
  const kioskGroup = new THREE.Group();
  kioskGroup.position.set(0, 0, -2.5);

  const kBox = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 1.4, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 })
  );
  kBox.position.y = 0.7;
  kioskGroup.add(kBox);

  // Mái bạt che sọc đỏ trắng đặc trưng
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })
  );
  canopy.position.set(0, 2.2, 0);
  canopy.rotation.x = 0.08;
  kioskGroup.add(canopy);

  // Biển hiệu quầy ăn vặt
  const fSignCanvas = document.createElement('canvas');
  fSignCanvas.width = 512; fSignCanvas.height = 128;
  const fsctx = fSignCanvas.getContext('2d');
  fsctx.fillStyle = '#fef08a'; fsctx.fillRect(0, 0, 512, 128);
  fsctx.font = 'bold 32px sans-serif'; fsctx.fillStyle = '#dc2626'; fsctx.textAlign = 'center';
  fsctx.fillText('🍢 CÁ VIÊN CHIÊN • TRÀ CHANH 🍹', 256, 55);
  fsctx.font = '22px sans-serif'; fsctx.fillStyle = '#0f172a';
  fsctx.fillText('ĐỒ NHẮM SẢNG KHOÁI VEN SÔNG', 256, 95);
  const fSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fSignCanvas) }));
  fSign.position.set(0, 2.55, 0.95);
  kioskGroup.add(fSign);

  plazaGroup.add(kioskGroup);

  // 2 Dù che nắng bãi biển (Tiger & Heineken Parasols) kèm bàn ghế ăn vặt
  [[-2.4, 1.5], [2.4, 1.5]].forEach(([ux, uz], uIdx) => {
    const parasol = new THREE.Group();
    parasol.position.set(ux, 0, uz);
    const pPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    pPole.position.y = 1.2;
    parasol.add(pPole);
    const pCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: uIdx === 0 ? 0x1d4ed8 : 0x15803d, roughness: 0.5 })
    );
    pCone.position.y = 2.4;
    parasol.add(pCone);

    const miniTable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
    );
    miniTable.position.y = 0.35;
    parasol.add(miniTable);

    plazaGroup.add(parasol);
  });

  scene.add(plazaGroup);
  pubDetails.obstacles.push({ x: 33, z: 20.0, w: 6.0, d: 5.5 });

  // 11. ĐOM ĐÓM ĐÊM CÔNG VIÊN (Night Fireflies Particle System)
  const fireflyCount = 65;
  const fireflyGeo = new THREE.BufferGeometry();
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  for (let fi = 0; fi < fireflyCount; fi++) {
    fireflyPositions[fi * 3] = (Math.random() - 0.5) * 80;
    fireflyPositions[fi * 3 + 1] = 0.5 + Math.random() * 1.8;
    fireflyPositions[fi * 3 + 2] = 13.0 + Math.random() * 14.0;
  }
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  const fireflyMat = new THREE.PointsMaterial({
    color: 0xfacc15,
    size: 0.16,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });
  parkFireflies = new THREE.Points(fireflyGeo, fireflyMat);
  scene.add(parkFireflies);

  // 12. CỘT ĐÈN CÔNG VIÊN CỔ ĐIỂN DỌC BỜ SÔNG (Lampposts with Hanging Flower Baskets)
  const lampPositions = [-40, -28, -16, -6, 6, 16, 28, 40];
  lampPositions.forEach((lx) => {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(lx, 0.32, 27.5);
    pubDetails.obstacles.push({ x: lx, z: 27.5, w: 0.4, d: 0.4 });

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.25 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 8), ironMat);
    pole.position.y = 1.9;
    lampGroup.add(pole);

    // Giỏ hoa treo xinh xắn trên thân cột đèn
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x78350f }));
    basket.position.set(0.35, 2.6, 0);
    lampGroup.add(basket);

    const bFlower = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
    bFlower.position.set(0.35, 2.75, 0);
    lampGroup.add(bFlower);

    // Lồng đèn phát ánh sáng vàng ấm áp
    const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    lantern.position.y = 3.9;
    lampGroup.add(lantern);

    const pLight = new THREE.PointLight(0xfef08a, 1.25, 11);
    pLight.position.set(0, 3.9, 0);
    lampGroup.add(pLight);

    scene.add(lampGroup);
  });

  // 13. LAN CAN BỜ SÔNG (Chừa khoảng trống ở giữa [x: -8 đến 8] dẫn lên cầu tàu)
  const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
  function buildRailingSection(fromX, toX) {
    const rLen = toX - fromX;
    const midX = (fromX + toX) / 2;
    const rGroup = new THREE.Group();
    rGroup.position.set(midX, 0.32, 28.3);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.08, 0.12), railMat);
    topBar.position.y = 1.0;
    rGroup.add(topBar);

    const midBar = new THREE.Mesh(new THREE.BoxGeometry(rLen, 0.06, 0.08), railMat);
    midBar.position.y = 0.55;
    rGroup.add(midBar);

    for (let rx = -rLen / 2; rx <= rLen / 2; rx += 1.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), railMat);
      post.position.set(rx, 0.5, 0);
      rGroup.add(post);
    }

    scene.add(rGroup);
    pubDetails.obstacles.push({ x: midX, z: 28.3, w: rLen, d: 0.3 });
  }

  // Hai bên cánh lan can (đoạn giữa để trống dẫn ra cầu tàu)
  buildRailingSection(-46, -8);
  buildRailingSection(8, 46);
}
PubLoader.defer(buildRiversidePark, 'buildRiversidePark');

// Đăng ký các điểm đái bậy cố định
peeSpots.push(
  { type: "wc", name: "WC Quán Nhậu", x: -20.5, z: -2.8, radius: 3.0 },
  { type: "wall", name: "Bờ Tường Hẻm (Biển Cấm Đái)", x: -15.8, z: 1.5, radius: 2.2 }
);

// ========================================================
// 5.5. CẢNH VẬT ĐƯỜNG PHỐ SÀI GÒN (KARAOKE, MASSAGE, WC, CỘT ĐIỆN)
// ========================================================
const pubDetails = createPubDetails(scene);

// Vật cản cứng để không đi xuyên: tòa nhà Karaoke/Massage, cột điện, xe nước mía, xe máy đậu vỉa hè.
// (Tường WC đã có sẵn trong pubDetails.obstacles; cây và cột đèn công viên thêm khi dựng công viên.)
[
  { x: 24, z: -1, w: 14, d: 10 },     // Karaoke 69
  { x: -31, z: -1, w: 14, d: 10 },    // Massage Ánh Sao
  { x: 16.5, z: 3.2, w: 0.6, d: 0.6 },// cột điện
  { x: 13.8, z: 1.4, w: 1.7, d: 0.9 },// xe nước mía
  { x: -13.8, z: 3.0, w: 1.3, d: 1.3 }, { x: 14.2, z: 3.1, w: 1.3, d: 1.3 },
  { x: -10.2, z: 2.6, w: 1.3, d: 1.3 }, { x: 10.5, z: 2.6, w: 1.3, d: 1.3 },
].forEach(o => pubDetails.obstacles.push(o));

function buildSaigonStreetScenery() {
  // 2. Bờ Tường Sơn Xịt "CẤM ĐÁI BẬY - CAMERA PHẠT 500K"
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512;
  wallCanvas.height = 256;
  const gmctx = wallCanvas.getContext('2d');
  gmctx.fillStyle = '#1e293b';
  gmctx.fillRect(0, 0, 512, 256);
  gmctx.font = 'bold 36px sans-serif';
  gmctx.fillStyle = '#ef4444';
  gmctx.textAlign = 'center';
  gmctx.fillText('🚫 CẤM ĐÁI BẬY 🚫', 256, 75);
  gmctx.font = 'bold 28px sans-serif';
  gmctx.fillStyle = '#f59e0b';
  gmctx.fillText('CAMERA PHẠT 500.000đ', 256, 135);
  gmctx.font = '22px sans-serif';
  gmctx.fillStyle = '#94a3b8';
  gmctx.fillText('KHU VỰC CÓ DÂN PHÒNG TUẦN TRA', 256, 190);

  const wallSign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wallCanvas) })
  );
  wallSign.position.set(-16.3, 2.1, 1.5);
  wallSign.rotation.y = Math.PI / 2;
  scene.add(wallSign);

  // 3. TÒA NHÀ KARAOKE 69 VIP (Bên phải quán nhậu)
  const kBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(14, 11, 10),
    new THREE.MeshStandardMaterial({ color: 0x181024, roughness: 0.6 })
  );
  kBuilding.position.set(24, 5.5, -1.0);
  scene.add(kBuilding);

  // Biển hiệu Karaoke Neon nhấp nháy tím hồng
  const kCanvas = document.createElement('canvas');
  kCanvas.width = 1024;
  kCanvas.height = 300;
  const kctx = kCanvas.getContext('2d');
  kctx.fillStyle = '#12041d';
  kctx.fillRect(0, 0, 1024, 300);
  kctx.font = 'bold 76px sans-serif';
  kctx.fillStyle = '#f43f5e';
  kctx.textAlign = 'center';
  kctx.shadowColor = '#d946ef';
  kctx.shadowBlur = 35;
  kctx.fillText('🎤 KARAOKE 69 VIP 🌟', 512, 120);
  kctx.font = '38px sans-serif';
  kctx.fillStyle = '#ffd000';
  kctx.shadowColor = '#ffd000';
  kctx.shadowBlur = 20;
  kctx.fillText('ÂM THANH ĐỈNH CAO - PHÒNG VIP SÀI GÒN', 512, 210);

  const kSignTex = new THREE.CanvasTexture(kCanvas);
  const kSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.8),
    new THREE.MeshStandardMaterial({
      map: kSignTex,
      emissiveMap: kSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.2
    })
  );
  kSign.position.set(24, 6.8, 4.05);
  scene.add(kSign);

  const kLight = new THREE.PointLight(0xd946ef, 2.2, 16);
  kLight.position.set(24, 5.0, 4.5);
  scene.add(kLight);

  // Thảm đỏ lối vào Karaoke
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 3.5),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.8 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(24, 0.31, 2.0);
  scene.add(carpet);

  // 4. TÒA NHÀ MASSAGE THƯ GIÃN ÁNH SAO (Bên trái quán nhậu)
  const mBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(14, 11, 10),
    new THREE.MeshStandardMaterial({ color: 0x0f1c1a, roughness: 0.6 })
  );
  // Leave the side annex clear for the WC; the neighboring facade starts farther west.
  mBuilding.position.set(-31, 5.5, -1.0);
  scene.add(mBuilding);

  const mCanvas = document.createElement('canvas');
  mCanvas.width = 1024;
  mCanvas.height = 300;
  const mctx = mCanvas.getContext('2d');
  mctx.fillStyle = '#061a15';
  mctx.fillRect(0, 0, 1024, 300);
  mctx.font = 'bold 66px sans-serif';
  mctx.fillStyle = '#10b981';
  mctx.textAlign = 'center';
  mctx.shadowColor = '#34d399';
  mctx.shadowBlur = 30;
  mctx.fillText('💆 MASSAGE THƯ GIÃN ÁNH SAO 🌸', 512, 120);
  mctx.font = '36px sans-serif';
  mctx.fillStyle = '#f59e0b';
  mctx.shadowColor = '#f59e0b';
  mctx.shadowBlur = 18;
  mctx.fillText('XÔNG HƠI - BẤM HUYỆT - PHỤC HỒI SỨC KHỎE', 512, 205);

  const mSignTex = new THREE.CanvasTexture(mCanvas);
  const mSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.8),
    new THREE.MeshStandardMaterial({
      map: mSignTex,
      emissiveMap: mSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      roughness: 0.2
    })
  );
  mSign.position.set(-31, 6.8, 4.05);
  scene.add(mSign);

  const mLight = new THREE.PointLight(0x10b981, 1.8, 15);
  mLight.position.set(-31, 5.0, 4.5);
  scene.add(mLight);

  // 5. CỘT ĐIỆN BÊ TÔNG BÚI DÂY ĐẶC SẢN SÀI GÒN
  const poleGroup = new THREE.Group();
  poleGroup.position.set(16.5, 0.3, 3.2);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
  const cPole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.5, 0.35), poleMat);
  cPole.position.y = 3.75;
  poleGroup.add(cPole);

  // Biến áp hình trụ
  const trans = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.85, 10),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.4 })
  );
  trans.position.set(0.42, 5.8, 0);
  poleGroup.add(trans);

  // Biển dán tường "Khoan Cắt Bê Tông"
  const kcbtCanvas = document.createElement('canvas');
  kcbtCanvas.width = 128;
  kcbtCanvas.height = 256;
  const kcbctx = kcbtCanvas.getContext('2d');
  kcbctx.fillStyle = '#f8fafc';
  kcbctx.fillRect(0, 0, 128, 256);
  kcbctx.font = 'bold 22px sans-serif';
  kcbctx.fillStyle = '#dc2626';
  kcbctx.textAlign = 'center';
  kcbctx.fillText('KHOAN', 64, 40);
  kcbctx.fillText('CẮT', 64, 75);
  kcbctx.fillText('BÊ TÔNG', 64, 110);
  kcbctx.font = 'bold 18px sans-serif';
  kcbctx.fillStyle = '#1e293b';
  kcbctx.fillText('0903.888', 64, 160);
  kcbctx.fillText('.XXX', 64, 190);

  const kcbtMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(kcbtCanvas) })
  );
  kcbtMesh.position.set(0, 2.0, 0.18);
  poleGroup.add(kcbtMesh);

  scene.add(poleGroup);

  // Dây điện chằng chịt treo qua đường (Messy Wires)
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
  const wireTargets = [
    [0, 5.8, -4.8],
    [-16.0, 5.5, 0],
    [24.0, 6.5, 3.8]
  ];
  wireTargets.forEach(([tx, ty, tz]) => {
    const points = [];
    for (let t = 0; t <= 10; t++) {
      const f = t / 10;
      const wx = 16.5 + (tx - 16.5) * f;
      const wz = 3.2 + (tz - 3.2) * f;
      const wy = 7.0 + (ty - 7.0) * f - Math.sin(f * Math.PI) * 0.6;
      points.push(new THREE.Vector3(wx, wy, wz));
    }
    const wireGeo = new THREE.BufferGeometry().setFromPoints(points);
    scene.add(new THREE.Line(wireGeo, wireMat));
  });

  // 6. XE MÁY DỰNG TRÊN VỈA HÈ SÀI GÒN (Honda Dream / Wave)
  function createMotorbike(posX, posZ, rotY, bodyColor) {
    const bike = new THREE.Group();
    bike.position.set(posX, 0.3, posZ);
    bike.rotation.y = rotY;
    bike.rotation.z = -0.15; // Dựng chân chống nghiêng

    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const wheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), tireMat);
    wheel1.rotation.z = Math.PI / 2;
    wheel1.position.set(0, 0.28, -0.65);
    bike.add(wheel1);

    const wheel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), tireMat);
    wheel2.rotation.z = Math.PI / 2;
    wheel2.position.set(0, 0.28, 0.65);
    bike.add(wheel2);

    const bBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.45, 0.95),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4 })
    );
    bBody.position.set(0, 0.5, 0);
    bike.add(bBody);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    seat.position.set(0, 0.75, -0.1);
    bike.add(seat);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9 })
    );
    handle.position.set(0, 0.95, 0.45);
    bike.add(handle);

    scene.add(bike);
  }
  buildSaigonMotorbike(-10.2, 2.6, 0.35, 0x7f1d1d, "Dream Thái", "51-F1 678.90"); // Honda Dream mận chín
  buildSaigonMotorbike(10.5, 2.6, -0.25, 0x0284c7, "Future Neo", "59-P1 555.55"); // Honda Future xanh dương

  // 7. XE ĐẨY NƯỚC MÍA SIÊU SẠCH VỈA HÈ
  const caneCart = new THREE.Group();
  caneCart.position.set(13.8, 0.3, 1.4);

  const cartBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.9, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
  );
  cartBody.position.y = 0.55;
  caneCart.add(cartBody);

  const glassCase = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.6, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 })
  );
  glassCase.position.set(0, 1.3, 0);
  caneCart.add(glassCase);

  for (let m = 0; m < 5; m++) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.7 })
    );
    stalk.position.set(-0.75 + m * 0.06, 0.9, 0.45);
    stalk.rotation.z = 0.15;
    caneCart.add(stalk);
  }

  scene.add(caneCart);
}
buildSaigonStreetScenery();

// ========================================================
// 5.5. CÁC EM GÁI TIẾP THỊ BIA (PG BIA 3D CHIBI DI ĐỘNG TUẦN TRA)
// ========================================================
const pgGirls = []; // { id, name, brand, mesh, tray, leftLeg, rightLeg, tagElem, tagBubble, x, z, waypoints, ... }

function createPGBiaCharacter(id, name, brand, x, z, ry, waypoints) {
  const root = new THREE.Group();
  const isTiger = brand === 'tiger';
  const isChill = brand === 'saigon_chill';

  let dressColor = 0x15803d; // Heineken Green
  let sashColor = 0xffffff;
  let badgeBg = '#15803d';
  let badgeGlow = 'rgba(21,128,61,0.7)';

  if (isTiger) {
    dressColor = 0x1d4ed8;
    sashColor = 0xf1f5f9;
    badgeBg = '#1e40af';
    badgeGlow = 'rgba(30,64,175,0.7)';
  } else if (isChill) {
    dressColor = 0x0284c7; // Chilly Azure
    sashColor = 0x38bdf8;
    badgeBg = '#0284c7';
    badgeGlow = 'rgba(2,132,199,0.75)';
  }

  const skinTone = '#ffe4d0';
  const skinMat = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.5 });
  const dressMat = new THREE.MeshStandardMaterial({
    color: dressColor,
    roughness: 0.35,
    metalness: 0.15
  });

  // Body: Feminine curves with fitted branded dress (Váy bodycon ôm sát)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.68, 16), dressMat);
  torso.position.y = 0.62;
  torso.castShadow = true;
  root.add(torso);

  // Branded diagonal sash (Dải ruy băng thương hiệu vắt chéo)
  const sashMat = new THREE.MeshStandardMaterial({ color: sashColor, metalness: 0.3, roughness: 0.3 });
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.215, 0.14, 16), sashMat);
  sash.position.set(0, 0.72, 0);
  sash.rotation.z = -0.22;
  root.add(sash);

  // Smooth neck (Cổ cao thanh mảnh)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.16, 12), skinMat);
  neck.position.y = 1.0;
  root.add(neck);

  // Beautiful feminine head with realistic face texture (Khuôn mặt xinh xắn)
  const eyeColor = isTiger ? '#2563eb' : (isChill ? '#0284c7' : '#15803d');
  const faceTex = createFaceTexture(true, skinTone, eyeColor);
  const headMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), headMat);
  head.scale.set(0.9, 1.1, 0.95);
  head.position.y = 1.25;
  head.rotation.y = -Math.PI / 2;
  head.castShadow = true;
  root.add(head);

  // Styled Hair (Thảo My: Ponytail cá tính; Ngọc Trinh: Tóc uốn sóng dài; Linh Đan: Bob cá tính kẹp nơ xanh)
  let hairColor = 0x18181b;
  if (isTiger) hairColor = 0x271914;
  else if (isChill) hairColor = 0x3b1d11;

  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
  const hairVolume = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), hairMat);
  hairVolume.scale.set(0.95, 0.9, 1.05);
  hairVolume.position.set(0, 1.34, -0.04);
  root.add(hairVolume);

  if (isTiger) {
    const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.55, 10), hairMat);
    ponytail.rotation.x = 0.42;
    ponytail.position.set(0, 1.15, -0.32);
    root.add(ponytail);

    const bow = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.4, roughness: 0.3 })
    );
    bow.position.set(0, 1.38, -0.26);
    root.add(bow);
  } else if (isChill) {
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.45, 12), hairMat);
    bob.position.set(0, 1.12, -0.06);
    root.add(bob);

    const clip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.05, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.8, roughness: 0.2 })
    );
    clip.position.set(0.24, 1.35, 0.1);
    root.add(clip);
  } else {
    const hairFlow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.6, 10), hairMat);
    hairFlow.position.set(0, 0.95, -0.16);
    hairFlow.rotation.x = 0.12;
    root.add(hairFlow);
  }

  // Slim articulated legs & Stylish Boots with Hip Pivots (Khớp háng xoay bước đi sống động)
  const bootMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });

  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.1, 0.52, 0); // Khớp háng trái
  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.52, 10), skinMat);
  leftLeg.position.y = -0.26;
  leftLegGroup.add(leftLeg);
  const leftBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.068, 0.32, 10), bootMat);
  leftBoot.position.set(0, -0.36, 0.02);
  leftLegGroup.add(leftBoot);
  root.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.1, 0.52, 0); // Khớp háng phải
  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.52, 10), skinMat);
  rightLeg.position.y = -0.26;
  rightLegGroup.add(rightLeg);
  const rightBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.068, 0.32, 10), bootMat);
  rightBoot.position.set(0, -0.36, 0.02);
  rightLegGroup.add(rightBoot);
  root.add(rightLegGroup);

  // Inox Beer Tray (Khay bia inox sáng bóng)
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.18 });
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.025, 24), trayMat);
  tray.position.set(0, 0.76, 0.36);
  root.add(tray);

  // 3 Cans of cold beer with realistic brand label texture
  const canTex = createBeerCanTexture(brand);
  const canMat = new THREE.MeshStandardMaterial({ map: canTex, metalness: 0.75, roughness: 0.25 });
  for (let c = 0; c < 3; c++) {
    const angle = (c * Math.PI * 2) / 3;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.18, 14), canMat);
    can.position.set(Math.cos(angle) * 0.16, 0.1, Math.sin(angle) * 0.16);
    tray.add(can);
  }

  // Arms holding the tray
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.36, 10), skinMat);
  leftArm.rotation.x = -Math.PI / 3.5;
  leftArm.position.set(-0.24, 0.72, 0.18);
  root.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.36, 10), skinMat);
  rightArm.rotation.x = -Math.PI / 3.5;
  rightArm.position.set(0.24, 0.72, 0.18);
  root.add(rightArm);

  root.position.set(x, 0.3, z);
  root.rotation.y = ry;
  scene.add(root);

  // Tạo thẻ tên 3D trên đầu PG
  const pgTag = document.createElement('div');
  pgTag.className = 'tag-3d';
  pgTag.innerHTML = `
    <div class="tag-bubble" id="bubble_${id}" style="display: none;"></div>
    <div class="tag-name tag-pg" style="background: ${badgeBg};">💃 ${name.split(" (")[0]}</div>
  `;
  hudOverlay.appendChild(pgTag);

  pgGirls.push({
    id,
    name,
    brand,
    mesh: root,
    tray,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup,
    tagElem: pgTag,
    tagBubble: pgTag.querySelector('.tag-bubble'),
    x,
    z,
    ry,
    waypoints: waypoints || [{ x, z, pause: 4.0, quote: '' }],
    wpIndex: (waypoints && waypoints.length > 1) ? 1 : 0,
    pauseTimer: 0,
    quoteTimer: 6 + Math.random() * 8,
    walkTime: Math.random() * 10
  });
}

function buildPGBiaGirls() {
  // 1. Em Thảo My (PG Tiger) - Tuần tra phục vụ các bàn trong quán nhậu & vỉa hè
  createPGBiaCharacter(
    'pg_tiger',
    'Thảo My (PG Tiger)',
    'tiger',
    3.4, 2.0, -Math.PI / 3,
    [
      { x: 3.4, z: 2.0, pause: 4.5, quote: "Bàn anh zai hết Tiger chưa ạ? Em khui thêm nhé! 🍺" },
      { x: 0.0, z: 1.5, pause: 3.5, quote: "Tiger Bạc ướp tuyết siêu lạnh đây ạ! 🧊" },
      { x: -3.4, z: 2.0, pause: 4.5, quote: "Một hai ba dô! Trăm phần trăm nha các anh! 🍻" },
      { x: -8.0, z: 1.8, pause: 3.5, quote: "Hôm nay quán đông vui quá nè các anh ơi~ ✨" },
      { x: -1.0, z: 2.8, pause: 3.0, quote: "Uống say là em gọi xe ôm đưa về tận ngõ nha! 🛵" }
    ]
  );

  // 2. Em Ngọc Trinh (PG Heineken) - Đón khách cổng quán, xe nước mía & vạch qua đường
  createPGBiaCharacter(
    'pg_ken',
    'Ngọc Trinh (PG Heineken)',
    'heineken',
    -3.6, 3.2, Math.PI / 4,
    [
      { x: -3.6, z: 3.2, pause: 4.0, quote: "Heineken Silver chuẩn êm mượt chào mừng anh đến quán! 🌟" },
      { x: 2.0, z: 3.2, pause: 3.5, quote: "Ken ướp lạnh tuyệt hảo cho anh đây ạ! 🍺" },
      { x: 13.8, z: 2.2, pause: 4.0, quote: "Uống bia xong tráng miệng ly nước mía là chuẩn bài anh ha! 🥤" },
      { x: 8.0, z: 6.5, pause: 3.5, quote: "Đèn đường Sài Gòn lung linh chưa kìa anh zai! ✨" },
      { x: -2.0, z: 9.0, pause: 4.0, quote: "Sang công viên bờ sông hóng gió mát rượi nè anh ơi! 🍃" }
    ]
  );

  // 3. Em Linh Đan (PG Bia Sài Gòn Chill) - Tuần tra bờ sông, Cầu tàu Bến Bạch Đằng & bồn hoa
  createPGBiaCharacter(
    'pg_chill',
    'Linh Đan (PG Sài Gòn Chill)',
    'saigon_chill',
    0.0, 14.0, 0,
    [
      { x: 0.0, z: 14.0, pause: 4.0, quote: "Ghé bồn hoa hồng check-in lon Sài Gòn Chill nha anh! 🌸" },
      { x: 0.0, z: 21.0, pause: 3.5, quote: "Gió sông Sài Gòn mát rượi luôn nè anh zai ơi! 🌊" },
      { x: 0.0, z: 30.2, pause: 5.0, quote: "Cầu tàu Bạch Đằng ngắm Landmark 81 cực chill luôn á! 🏙️" },
      { x: 18.0, z: 25.5, pause: 4.0, quote: "Sài Gòn Chill - Bật mood sảng khoái ven sông! 🍻" },
      { x: 30.0, z: 20.0, pause: 4.0, quote: "Làm xiên cá viên chiên nhắm lon Sài Gòn Chill hết sẩy anh ơi! 🍢" },
      { x: -25.0, z: 24.0, pause: 4.0, quote: "Ghế đá hoa cương đỏ bóng loáng, ngồi ngắm cảnh chill lắm anh! 🪑" }
    ]
  );
}
buildPGBiaGirls();

// Hệ thống tuần tra & AI tương tác sinh động cho PG Bia
function updatePGBiaGirls(delta) {
  const elapsed = clock.getElapsedTime();
  const playerX = localPlayerState.x;
  const playerZ = localPlayerState.z;

  pgGirls.forEach(pg => {
    const distToPlayer = Math.hypot(playerX - pg.x, playerZ - pg.z);

    // Chu kỳ hiển thị lời thoại duyên dáng ngẫu nhiên
    pg.quoteTimer -= delta;
    if (pg.quoteTimer <= 0) {
      pg.quoteTimer = 20 + Math.random() * 12;
      const wp = pg.waypoints[pg.wpIndex];
      if (wp && wp.quote && Math.random() < 0.8) {
        showPGBubble(pg.brand, wp.quote);
      }
    }

    // Nếu người chơi lại gần (< 2.2m), em PG dừng lại, quay sang mỉm cười nhìn người chơi
    if (distToPlayer < 2.2) {
      const lookAngle = Math.atan2(playerX - pg.x, playerZ - pg.z);
      let diff = (lookAngle - pg.mesh.rotation.y) % (Math.PI * 2);
      if (diff < -Math.PI) diff += Math.PI * 2;
      if (diff > Math.PI) diff -= Math.PI * 2;
      pg.mesh.rotation.y += diff * Math.min(1, delta * 5.0);

      // Nhịp thở đứng duyên dáng
      pg.mesh.position.y = 0.3 + Math.sin(elapsed * 2.5) * 0.012;
      if (pg.leftLeg) pg.leftLeg.rotation.x = THREE.MathUtils.lerp(pg.leftLeg.rotation.x, 0, delta * 8);
      if (pg.rightLeg) pg.rightLeg.rotation.x = THREE.MathUtils.lerp(pg.rightLeg.rotation.x, 0, delta * 8);
      pg.mesh.rotation.z = THREE.MathUtils.lerp(pg.mesh.rotation.z, 0, delta * 8);

      if (pg.tray) {
        pg.tray.position.y = 0.76 + Math.sin(elapsed * 2.0) * 0.015;
        pg.tray.rotation.y = Math.sin(elapsed * 1.2) * 0.08;
      }
      return;
    }

    // Tuần tra theo danh sách điểm waypoint
    const targetWp = pg.waypoints[pg.wpIndex];
    if (!targetWp) return;

    const dx = targetWp.x - pg.x;
    const dz = targetWp.z - pg.z;
    const distToWp = Math.hypot(dx, dz);

    if (distToWp < 0.35) {
      // Đã tới điểm đến: Tạm dừng nghỉ chân, mời mọc khách
      pg.pauseTimer += delta;
      pg.mesh.position.y = 0.3 + Math.sin(elapsed * 2.2) * 0.01;
      if (pg.leftLeg) pg.leftLeg.rotation.x = THREE.MathUtils.lerp(pg.leftLeg.rotation.x, 0, delta * 8);
      if (pg.rightLeg) pg.rightLeg.rotation.x = THREE.MathUtils.lerp(pg.rightLeg.rotation.x, 0, delta * 8);
      pg.mesh.rotation.z = THREE.MathUtils.lerp(pg.mesh.rotation.z, 0, delta * 8);

      if (pg.tray) {
        pg.tray.position.y = 0.76 + Math.sin(elapsed * 1.8) * 0.01;
        pg.tray.rotation.y = Math.sin(elapsed * 1.0) * 0.06;
      }

      if (pg.pauseTimer >= (targetWp.pause || 3.5)) {
        pg.pauseTimer = 0;
        pg.wpIndex = (pg.wpIndex + 1) % pg.waypoints.length;
      }
    } else {
      // Đang rảo bước duyên dáng tới điểm đến kế tiếp
      const walkSpeed = 0.95; // Tốc độ bước đi nhẹ nhàng
      const dirX = dx / distToWp;
      const dirZ = dz / distToWp;

      pg.x += dirX * walkSpeed * delta;
      pg.z += dirZ * walkSpeed * delta;
      pg.mesh.position.set(pg.x, 0.3 + Math.abs(Math.sin(pg.walkTime * 8)) * 0.02, pg.z);

      // Quay mặt êm dịu theo hướng đi
      const targetAngle = Math.atan2(dirX, dirZ);
      let diff = (targetAngle - pg.mesh.rotation.y) % (Math.PI * 2);
      if (diff < -Math.PI) diff += Math.PI * 2;
      if (diff > Math.PI) diff -= Math.PI * 2;
      pg.mesh.rotation.y += diff * Math.min(1, delta * 6.0);

      // Đánh chân & lắc hông nhịp nhàng
      pg.walkTime += delta;
      const swing = Math.sin(pg.walkTime * 7.5);
      if (pg.leftLeg) pg.leftLeg.rotation.x = swing * 0.48;
      if (pg.rightLeg) pg.rightLeg.rotation.x = -swing * 0.48;
      pg.mesh.rotation.z = Math.sin(pg.walkTime * 3.75) * 0.04;

      if (pg.tray) {
        pg.tray.position.y = 0.76 + Math.abs(swing) * 0.02;
        pg.tray.rotation.y = Math.sin(pg.walkTime * 3.5) * 0.08;
      }
    }
  });
}

// ========================================================
// 6. SÔNG SÀI GÒN & DU THUYỀN (SAIGON RIVER & CRUISE BOAT)
// ========================================================
let riverWater = null;
let cruiseBoat = null;

function buildSaigonRiver() {
  // Mặt nước Sông Sài Gòn
  const waterGeo = new THREE.PlaneGeometry(160, 90, 40, 30);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0c2547,
    roughness: 0.15,
    metalness: 0.75
  });
  riverWater = new THREE.Mesh(waterGeo, waterMat);
  riverWater.rotation.x = -Math.PI / 2;
  riverWater.position.set(0, -0.2, 72);
  scene.add(riverWater);

  // Du Thuyền Sông Sài Gòn chạy từ từ với đèn LED lung linh
  cruiseBoat = new THREE.Group();
  cruiseBoat.position.set(-30, 0.1, 56);

  // Thân tàu trắng
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(7.0, 1.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
  );
  cruiseBoat.add(hull);

  // Cabin tầng 2
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.0, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 })
  );
  cabin.position.set(-0.2, 1.1, 0);
  cruiseBoat.add(cabin);

  // Cửa kính cabin sáng rực ánh vàng
  const windowGlow = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.45, 1.84),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  windowGlow.position.set(-0.2, 1.1, 0);
  cruiseBoat.add(windowGlow);

  // Dãy đèn LED tiệc tùng trên nóc tàu
  const boatBulbColors = [0xffd000, 0xff3344, 0x00ff88, 0x00d2ff, 0xff9900];
  for (let bi = -2; bi <= 2; bi += 0.8) {
    const bLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: boatBulbColors[Math.abs(Math.round(bi * 3)) % boatBulbColors.length] })
    );
    bLight.position.set(bi, 1.75, 0);
    cruiseBoat.add(bLight);
  }

  // Ánh sáng phản chiếu mặt nước
  const boatLight = new THREE.PointLight(0x38bdf8, 1.5, 12);
  boatLight.position.set(0, 1.0, 0);
  cruiseBoat.add(boatLight);

  scene.add(cruiseBoat);
}
PubLoader.defer(buildSaigonRiver, 'buildSaigonRiver');

// ========================================================
// 7. TÒA THÁP LANDMARK 81 & SKYLINE SÀI GÒN VỀ ĐÊM
// ========================================================
let landmarkSpireLight = null;
let landmarkLEDs = [];
let landmarkReflections = null;
let landmarkBeaconHalo = null;

function buildLandmark81AndSkyline() {
  // Cụm Skyline Thành Phố bên kia bờ sông Sài Gòn
  const skylineGroup = new THREE.Group();
  skylineGroup.position.set(0, 0, 105);

  // Các tòa cao ốc xung quanh (Silhouette cao tầng phát sáng cửa sổ)
  const buildingConfigs = [
    { x: -35, w: 9, h: 22, d: 8, color: 0x0f172a },
    { x: -24, w: 7, h: 28, d: 7, color: 0x1e293b },
    { x: -14, w: 10, h: 19, d: 8, color: 0x0f172a },
    { x: 30, w: 8, h: 26, d: 7, color: 0x1e293b },
    { x: 42, w: 11, h: 20, d: 9, color: 0x0f172a }
  ];

  buildingConfigs.forEach((cfg) => {
    const bldg = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d),
      new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.7 })
    );
    bldg.position.set(cfg.x, cfg.h / 2, 0);
    skylineGroup.add(bldg);

    // Các ô cửa sổ phát sáng lấp lánh ban đêm
    const winGeo = new THREE.PlaneGeometry(cfg.w - 1, cfg.h - 3);
    const winCanvas = document.createElement('canvas');
    winCanvas.width = 128;
    winCanvas.height = 256;
    const wctx = winCanvas.getContext('2d');
    wctx.fillStyle = '#060913';
    wctx.fillRect(0, 0, 128, 256);
    wctx.fillStyle = '#fef08a';
    for (let r = 10; r < 240; r += 16) {
      for (let c = 8; c < 120; c += 14) {
        if (Math.random() > 0.4) {
          wctx.fillRect(c, r, 6, 8);
        }
      }
    }
    const winMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(winCanvas),
      transparent: true,
      opacity: 0.85, fog: false, toneMapped: false, side: THREE.DoubleSide
    });
    const winFront = new THREE.Mesh(winGeo, winMat);
    winFront.position.set(cfg.x, cfg.h / 2, -cfg.d / 2 - 0.05);
    winFront.rotation.y = Math.PI;
    skylineGroup.add(winFront);
  });

  // TÒA THÁP BIỂU TƯỢNG: LANDMARK 81 (Vươn cao sừng sững 52 units)
  const landmarkGroup = new THREE.Group();
  landmarkGroup.position.set(6, 0, 0);

  // Kiến trúc bó tre giật cấp đặc trưng của Landmark 81 (Stepped Bamboo Bundle)
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x1e3652, emissive: 0x0d243d, emissiveIntensity: 0.7,
    metalness: 0.55, roughness: 0.3, fog: false
  });

  // Cấp 1 (Chân tháp đồ sộ)
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(11, 16, 9), towerMat);
  t1.position.y = 8;
  landmarkGroup.add(t1);

  // Cấp 2 (Thu hẹp)
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(8.5, 14, 7), towerMat);
  t2.position.y = 23;
  landmarkGroup.add(t2);

  // Cấp 3 (Vươn cao)
  const t3 = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 5.2), towerMat);
  t3.position.y = 36;
  landmarkGroup.add(t3);

  // Cấp 4 (Đỉnh tháp)
  const t4 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 8, 3.4), towerMat);
  t4.position.y = 46;
  landmarkGroup.add(t4);

  // Đỉnh kim tự tháp / Cột ăng-ten Spire chọc trời
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.5, 8.5, 8),
    new THREE.MeshBasicMaterial({ color: 0xb9eaff, fog: false, toneMapped: false })
  );
  spire.position.y = 54.25;
  landmarkGroup.add(spire);

  // Đèn tín hiệu đỉnh tháp đỏ rực xuyên màn đêm
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff7490, fog: false, toneMapped: false })
  );
  beacon.position.y = 58.5;
  landmarkGroup.add(beacon);

  landmarkSpireLight = new THREE.PointLight(0xff0044, 2.5, 25);
  landmarkSpireLight.position.set(0, 58.5, 0);
  landmarkGroup.add(landmarkSpireLight);

  // Visible from both banks: lit windows and LEDs follow every stepped tier.
  // Emissive-looking basic surfaces remain readable through the distant night haze.
  const tiers = [
    { w: 11, h: 16, d: 9, y: 8 }, { w: 8.5, h: 14, d: 7, y: 23 },
    { w: 6, h: 12, d: 5.2, y: 36 }, { w: 3.6, h: 8, d: 3.4, y: 46 }
  ];
  const ledColors = [0x4de3ff, 0x78a6ff, 0xb7a1ff, 0xffbf82];
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64; glowCanvas.height = 16;
  const glowCtx = glowCanvas.getContext('2d');
  const gradient = glowCtx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  glowCtx.fillStyle = gradient; glowCtx.fillRect(0, 0, 64, 16);
  const edgeGlow = new THREE.CanvasTexture(glowCanvas);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xa5d9ff, fog: false, toneMapped: false });
  // Seeded window pattern avoids random flashing or constantly changing office lights.
  let windowSeed = 81;
  const litRandom = () => { windowSeed = (windowSeed * 16807) % 2147483647; return windowSeed / 2147483647; };
  tiers.forEach((tier, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const rows = Math.round(tier.h / 0.65), cols = Math.max(5, Math.round(tier.w / 0.55));
    const cw = 256 / cols, ch = 512 / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (litRandom() < 0.23) continue;
      ctx.fillStyle = litRandom() < 0.25 ? '#ffe4a0' : litRandom() < 0.5 ? '#8cd8ff' : '#c2ecff';
      ctx.globalAlpha = 0.5 + litRandom() * 0.45;
      ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.24, cw * 0.64, ch * 0.52);
    }
    const windows = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas),
      transparent: true, fog: false, toneMapped: false, depthWrite: false });
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(tier.w - 0.3, tier.h - 0.3), windows);
      front.position.set(0, tier.y, side * (tier.d / 2 + 0.035));
      front.rotation.y = side < 0 ? Math.PI : 0; landmarkGroup.add(front);
      const flank = new THREE.Mesh(new THREE.PlaneGeometry(tier.d - 0.3, tier.h - 0.3), windows);
      flank.position.set(side * (tier.w / 2 + 0.035), tier.y, 0);
      flank.rotation.y = side * Math.PI / 2; landmarkGroup.add(flank);
    }
    // Four corner columns, on the actual perimeter rather than floating in front of the upper tiers.
    for (const x of [-tier.w / 2, tier.w / 2]) for (const z of [-tier.d / 2, tier.d / 2]) {
      const material = new THREE.MeshBasicMaterial({ color: ledColors[index], fog: false, toneMapped: false });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, tier.h, 0.15), material);
      strip.position.set(x, tier.y, z); landmarkGroup.add(strip); landmarkLEDs.push(strip);
      const haloMaterial = new THREE.MeshBasicMaterial({ map: edgeGlow, transparent: true,
        opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false, toneMapped: false });
      haloMaterial.color = material.color;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.75, tier.h), haloMaterial);
      halo.position.set(x, tier.y, z + Math.sign(z) * 0.09); landmarkGroup.add(halo);
    }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(tier.w + 0.15, 0.13, tier.d + 0.15), rimMaterial);
    rim.position.y = tier.y + tier.h / 2; landmarkGroup.add(rim);
  });
  // A tiny soft beacon halo needs no bloom pass or additional dynamic lights.
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 64;
  const hctx = haloCanvas.getContext('2d');
  const radial = hctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  radial.addColorStop(0, 'rgba(255,255,255,1)'); radial.addColorStop(0.18, 'rgba(255,150,185,0.6)');
  radial.addColorStop(1, 'rgba(255,100,150,0)');
  hctx.fillStyle = radial; hctx.fillRect(0, 0, 64, 64);
  landmarkBeaconHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas),
    color: 0xffa1b8, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false }));
  landmarkBeaconHalo.position.set(0, 58.5, 0); landmarkBeaconHalo.scale.set(3.6, 3.6, 1);
  landmarkGroup.add(landmarkBeaconHalo);

  // Stylized broken reflection streaks, rendered together in a single instanced draw.
  const reflectionMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  landmarkReflections = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), reflectionMaterial, 140);
  landmarkReflections.name = 'Landmark 81 • vệt đèn trên sông';
  const reflectionPose = new THREE.Object3D();
  for (let i = 0; i < 140; i++) {
    const z = 38 + litRandom() * 62;
    const distanceFade = (z - 38) / 62;
    reflectionPose.position.set(6 + (litRandom() - 0.5) * (2 + (1 - distanceFade) * 13), -0.17, z);
    reflectionPose.rotation.set(-Math.PI / 2, 0, 0);
    reflectionPose.scale.set(0.25 + litRandom() * 1.6, 0.06 + litRandom() * 0.2, 1);
    reflectionPose.updateMatrix(); landmarkReflections.setMatrixAt(i, reflectionPose.matrix);
    const color = new THREE.Color(ledColors[i % ledColors.length]).multiplyScalar(0.3 + distanceFade * 0.7);
    landmarkReflections.setColorAt(i, color);
  }
  scene.add(landmarkReflections);

  // Bảng tên tòa nhà: "LANDMARK 81"
  const l81Canvas = document.createElement('canvas');
  l81Canvas.width = 512;
  l81Canvas.height = 128;
  const lctx = l81Canvas.getContext('2d');
  lctx.fillStyle = '#ffd000';
  lctx.font = 'bold 58px sans-serif';
  lctx.textAlign = 'center';
  lctx.shadowColor = '#00d2ff';
  lctx.shadowBlur = 20;
  lctx.fillText('LANDMARK 81', 256, 85);

  const l81Sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 1.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(l81Canvas), transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false })
  );
  l81Sign.position.set(0, 16.5, -4.65);
  l81Sign.rotation.y = Math.PI;
  landmarkGroup.add(l81Sign);

  skylineGroup.add(landmarkGroup);
  scene.add(skylineGroup);
}
PubLoader.defer(buildLandmark81AndSkyline, 'buildLandmark81AndSkyline');

// ========================================================
// 8. 3D Character Avatar Factory (Chibi Bợm Nhậu Má Hồng Phong Cách Nhà Tù Online)
// ========================================================
function createCharacter3D(colorHex) {
  const root = new THREE.Group();
  const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, extra));
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Thân tròn múp hạt đậu, đầu to (tỉ lệ chibi ~2 đầu)
  const shirtMat = std(colorHex || 0xf97316, { roughness: 0.55 });
  const skinTone = '#ffc9a3';
  const skinMat = std(skinTone, { roughness: 0.5, emissive: 0x5a2c14, emissiveIntensity: 0.45 });   // hơi tự phát sáng để da ấm dưới ánh đèn đêm
  const torso = add(root, new THREE.CylinderGeometry(0.33, 0.39, 0.54, 24), shirtMat, 0, 0.74, 0);
  torso.castShadow = true;
  add(root, new THREE.SphereGeometry(0.33, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shirtMat, 0, 1.01, 0);
  add(root, new THREE.SphereGeometry(0.39, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shirtMat, 0, 0.47, 0);
  const beltMat = std(0x3b2a1a, { roughness: 0.7 });
  const belt = add(root, new THREE.TorusGeometry(0.385, 0.025, 8, 28), beltMat, 0, 0.5, 0);
  belt.rotation.x = Math.PI / 2;
  add(root, new THREE.BoxGeometry(0.1, 0.07, 0.02), std(0xfacc15, { metalness: 0.8, roughness: 0.3 }), 0, 0.5, 0.39);
  const collar = add(root, new THREE.TorusGeometry(0.2, 0.04, 8, 20), std(0xffffff, { roughness: 0.5 }), 0, 1.06, 0);
  collar.rotation.x = Math.PI / 2;

  // Đầu tròn bầu bĩnh + mặt dựng bằng hình khối 3D (mắt to long lanh, má hồng, miệng cười)
  const head = add(root, new THREE.SphereGeometry(0.38, 28, 28), skinMat, 0, 1.46, 0);
  head.scale.set(1.10, 0.98, 1.04);
  head.castShadow = true;
  const eyeMat = std(0x120d0b, { roughness: 0.12, metalness: 0.2 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const eye = add(root, new THREE.SphereGeometry(0.085, 16, 14), eyeMat, s * 0.145, 1.5, 0.345);
    eye.scale.set(0.85, 1.2, 0.55);
    add(root, new THREE.SphereGeometry(0.028, 10, 8), white, s * 0.145 - s * 0.012 + 0.012, 1.545, 0.385);   // ánh sáng lớn
    add(root, new THREE.SphereGeometry(0.014, 8, 6), white, s * 0.145 + 0.025, 1.47, 0.39);                // ánh sáng nhỏ
    const brow = add(root, new THREE.BoxGeometry(0.085, 0.017, 0.02), std(0x2b1a12), s * 0.15, 1.625, 0.33);
    brow.rotation.z = s * -0.18;
    const blush = add(root, new THREE.CircleGeometry(0.065, 16), new THREE.MeshBasicMaterial({ color: 0xff6b8a, transparent: true, opacity: 0.5, depthWrite: false }), s * 0.255, 1.4, 0.3);
    blush.rotation.y = s * 0.82;
    add(root, new THREE.SphereGeometry(0.058, 10, 8), skinMat, s * 0.41, 1.44, 0.0);                       // tai
  }
  add(root, new THREE.SphereGeometry(0.02, 8, 8), std(0xf3b79a), 0, 1.43, 0.392);                          // mũi
  const smile = add(root, new THREE.TorusGeometry(0.055, 0.01, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0x9f1239 }), 0, 1.385, 0.382);
  smile.rotation.z = Math.PI;
  smile.rotation.x = -0.08;

  // Tóc: chỏm tóc ôm đầu + mái ngố + hai lọn bên
  const hairMat = std(0x2a1d17, { roughness: 0.75 });
  const hairTop = add(root, new THREE.SphereGeometry(0.39, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat, 0, 1.5, -0.05);
  hairTop.scale.set(1.1, 0.98, 1.0);
  for (const [bx, by, bz, sx, sy] of [[-0.19, 0.17, 0.33, 1.3, 0.75], [0, 0.2, 0.37, 1.5, 0.8], [0.19, 0.17, 0.33, 1.3, 0.75]]) {
    const bang = add(hairTop, new THREE.SphereGeometry(0.095, 10, 8), hairMat, bx, by, bz);
    bang.scale.set(sx, sy, 0.7);
  }
  for (const s of [-1, 1]) add(hairTop, new THREE.SphereGeometry(0.1, 10, 8), hairMat, s * 0.37, -0.02, 0.0).scale.set(0.7, 1.4, 1.0);

  // Mũ snapback (tuỳ chọn trong tủ đồ)
  const capMat = std(0x0f172a, { roughness: 0.75 });
  const cap = add(root, new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), capMat, 0, 1.57, -0.03);
  cap.scale.set(1.1, 0.98, 1.0);
  const visor = add(root, new THREE.BoxGeometry(0.34, 0.035, 0.22), capMat, 0, 1.66, 0.34);
  visor.rotation.x = 0.12;

  // Tay: ống tay áo + cẳng tay + bàn tay tròn, gắn ở vai
  const handMat = skinMat;
  function buildArm(x) {
    const g = new THREE.Group();
    g.position.set(x, 0.93, 0.02);
    add(g, new THREE.CylinderGeometry(0.1, 0.095, 0.2, 14), shirtMat, 0, -0.1, 0);
    add(g, new THREE.CylinderGeometry(0.072, 0.066, 0.17, 12), handMat, 0, -0.27, 0);
    add(g, new THREE.SphereGeometry(0.085, 12, 12), handMat, 0, -0.385, 0);
    return g;
  }

  // Tay trái buông thả tự nhiên, hơi xoè ra ngoài
  const leftArm = buildArm(-0.4);
  leftArm.rotation.z = 0.22;
  root.add(leftArm);

  // Tay phải co lại, ôm ly bia trước bụng. `armSwing` xoay quanh vai để nâng ly khi cụng.
  const armSwing = new THREE.Group();
  armSwing.position.set(0.4, 0.93, 0.02);
  root.add(armSwing);
  const rightArm = buildArm(0);
  rightArm.position.set(0, 0, 0);
  const handTarget = new THREE.Vector3(0.34 - 0.4, 0.9 - 0.93, 0.4 - 0.02);
  rightArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), handTarget.clone().normalize());
  armSwing.add(rightArm);

  // Ly bia thủy tinh quai dày, bọt trắng; bàn tay nắm vào quai
  const beerMug = new THREE.Group();
  beerMug.position.set(0.2 - 0.4, 0.9 - 0.93, 0.4 - 0.02);
  const glassMat = std(0xfef08a, { transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.15 });
  add(beerMug, new THREE.CylinderGeometry(0.11, 0.095, 0.26, 16), glassMat, 0, 0, 0);
  add(beerMug, new THREE.CylinderGeometry(0.092, 0.08, 0.2, 14), std(0xe08a0b, { roughness: 0.2 }), 0, -0.02, 0);
  add(beerMug, new THREE.CylinderGeometry(0.115, 0.1, 0.07, 16), std(0xffffff, { roughness: 0.7 }), 0, 0.125, 0);
  const handle = add(beerMug, new THREE.TorusGeometry(0.07, 0.022, 8, 14), std(0xffffff, { transparent: true, opacity: 0.75, roughness: 0.1 }), 0.125, 0, 0);
  handle.rotation.y = Math.PI / 2;
  armSwing.add(beerMug);

  // Chân quần jean bo tròn + giày sneaker
  const denimMat = std(0x1e3a5f, { roughness: 0.85 });
  const shoeMat = std(0xf8fafc, { roughness: 0.4 });
  function buildLeg(x) {
    const g = new THREE.Group();
    g.position.set(x, 0.44, 0);
    const pants = add(g, new THREE.CylinderGeometry(0.13, 0.12, 0.36, 14), denimMat, 0, -0.14, 0);
    pants.castShadow = true;
    const shoe = add(g, new THREE.BoxGeometry(0.17, 0.12, 0.28), shoeMat, 0, -0.30, 0.05);
    root.add(g);
    return { g, shoe };
  }
  const left = buildLeg(-0.18), right = buildLeg(0.18);

  return {
    mesh: root,
    torso,
    head,
    beerMug,
    armSwing,
    leftArm,
    leftLeg: left.g,
    rightLeg: right.g,
    // Các bộ phận để Features.dress() thay đồ (mũ, áo, giày...).
    shirtMat, hairTop, capParts: [cap, visor], shoeMat, shoes: [left.shoe, right.shoe]
  };
}

// Local Player State
let localCharacter = null;
const localPlayerState = {
  x: 0,
  y: 0.3,
  z: 4,
  ry: 0,
  is_walking: false,
  is_sitting: false,
  table_id: -1,
  seat_id: -1,
  walkTime: 0,
  speed: 4.8
};

// ========================================================
// 6. Keyboard, Touch Controls & 360° Orbital Camera
// ========================================================
const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

// Keep camera gestures separate from HUD and joystick pointers.
const mobileControls = matchMedia('(pointer: coarse), (max-width: 768px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let comfortMode = mobileControls || reducedMotion.matches;
try {
  const saved = localStorage.getItem('pub_comfort');
  if (saved !== null && !reducedMotion.matches) comfortMode = saved === 'true';
} catch (_) { /* Storage may be unavailable in private browsing. */ }
let cameraYaw = 0;
let cameraPitch = 0.72; // Góc nhìn Isometric 3/4 từ trên xuống thoáng đãng như Nhà Tù Online
let cameraDistance = mobileControls ? 10.5 : 9.8;
const cameraPointers = new Map();
const cameraLookTarget = new THREE.Vector3();
let cameraTargetReady = false;
let wasInWC = false;
let pinchDistance = 0;
let joystickState = { active: false, touchId: null, x: 0, y: 0 };
const joystickZone = document.getElementById('joystickZone');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

function leaveScenicView() {
  if (isScenicView) toggleScenicView();
}
function zoomCamera(distance) {
  leaveScenicView();
  cameraDistance = Math.max(4.0, Math.min(42.0, distance));
}
function pointerSpan() {
  const [a, b] = [...cameraPointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
// ---- Click chuột để di chuyển (PC): nhấp nhanh, không kéo, lên mặt đất là nhân vật tự đi tới ----
let clickTarget = null;       // { x, z }
let clickStuckTime = 0;
let clickDown = null;         // { x, y, t } của lần nhấn chuột trái đang theo dõi
const clickRaycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
const clickHit = new THREE.Vector3();
const clickMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.28, 0.4, 32),
  new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
);
clickMarker.rotation.x = -Math.PI / 2;
clickMarker.visible = false;
clickMarker.renderOrder = 5;
scene.add(clickMarker);
function clearClickTarget() { clickTarget = null; clickMarker.visible = false; clickStuckTime = 0; localPlayerState._lastClickDist = undefined; }
function setClickTarget(clientX, clientY) {
  if (isScenicView || !localCharacter || localPlayerState.is_sitting || (selfMember && selfMember.status === 'guc_nga')) return;
  const rect = renderer.domElement.getBoundingClientRect();
  clickRaycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
  if (!clickRaycaster.ray.intersectPlane(groundPlane, clickHit) || clickHit.distanceTo(camera.position) > 60) return;
  clickTarget = { x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, clickHit.x)), z: Math.max(WORLD_BOUNDS.minZAt(clickHit.x), Math.min(WORLD_BOUNDS.maxZ - 0.7, clickHit.z)) };
  clickStuckTime = 0;
  clickMarker.position.set(clickTarget.x, 0.33, clickTarget.z);
  clickMarker.visible = true;
}
canvasContainer.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  clickDown = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  if (cameraPointers.size >= 2) return;
  canvasContainer.setPointerCapture(e.pointerId);
  cameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pinchDistance = pointerSpan();
});
canvasContainer.addEventListener('pointermove', (e) => {
  const previous = cameraPointers.get(e.pointerId);
  if (!previous) return;
  const dx = e.clientX - previous.x;
  const dy = e.clientY - previous.y;
  cameraPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (cameraPointers.size === 2) {
    const span = pointerSpan();
    if (pinchDistance > 0 && span > 0) zoomCamera(cameraDistance * pinchDistance / span);
    pinchDistance = span;
    return;
  }
  // A pinch never rotates the camera; the remaining finger starts at its latest position.
  if (!dx && !dy) return;
  leaveScenicView();
  cameraYaw -= dx * (e.pointerType === 'mouse' ? 0.0035 : 0.003);
  cameraPitch = Math.max(0.18, Math.min(1.05, cameraPitch + dy * 0.0025));
});
function endCameraPointer(e) {
  if (e.type === 'pointerup' && clickDown && e.pointerType === 'mouse' && e.button === 0 &&
      Math.hypot(e.clientX - clickDown.x, e.clientY - clickDown.y) < 6 && performance.now() - clickDown.t < 400) {
    setClickTarget(e.clientX, e.clientY);
  }
  clickDown = null;
  cameraPointers.delete(e.pointerId);
  pinchDistance = pointerSpan();
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvasContainer.addEventListener(event, endCameraPointer);
}
canvasContainer.addEventListener('wheel', (e) => {
  if (e.ctrlKey) return; // Preserve browser accessibility zoom.
  e.preventDefault();
  const amount = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  zoomCamera(cameraDistance + Math.max(-180, Math.min(180, amount)) * 0.006);
}, { passive: false });

function resetJoystick() {
  joystickState = { active: false, touchId: null, x: 0, y: 0 };
  joystickBase.classList.remove('is-active');
  joystickKnob.style.transform = 'translate(0px, 0px)';
}
function moveJoystick(e) {
  const rect = joystickBase.getBoundingClientRect();
  const dx = e.clientX - rect.left - rect.width / 2;
  const dy = e.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy);
  const radius = rect.width * 0.35;
  const strength = Math.min(1, Math.max(0, (length / radius - 0.14) / 0.86));
  joystickState.x = length ? dx / length * strength : 0;
  joystickState.y = length ? -dy / length * strength : 0;
  const knobScale = length ? Math.min(length, radius) / length : 0;
  joystickKnob.style.transform = `translate(${dx * knobScale}px, ${dy * knobScale}px)`;
}
joystickZone.addEventListener('pointerdown', (e) => {
  if (joystickState.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
  joystickZone.setPointerCapture(e.pointerId);
  joystickState.active = true;
  joystickState.touchId = e.pointerId;
  joystickBase.classList.add('is-active');
  moveJoystick(e);
});
joystickZone.addEventListener('pointermove', (e) => {
  if (joystickState.active && e.pointerId === joystickState.touchId) moveJoystick(e);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystickZone.addEventListener(event, (e) => {
    if (e.pointerId === joystickState.touchId) resetJoystick();
  });
}
function clearControls() {
  cameraPointers.clear();
  pinchDistance = 0;
  resetJoystick();
  Object.keys(keys).forEach(key => keys[key] = false);
}
window.addEventListener('blur', clearControls);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearControls(); });
window.addEventListener('resize', clearControls);

const comfortBtn = document.getElementById('comfortBtn');
// "Một, hai, ba, dô!" bằng file giọng tiếng Việt thật (sounds/cheer_123do.mp3), phát qua Web Audio.
// Càng xỉn càng chậm, trầm và chập chờn như giọng người say.
let cheerBuffer = null;
let cheerLoading = false;
let cheerSource = null;
let lastSpeak = 0;
function loadCheerVoice() {
  if (cheerBuffer || cheerLoading) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  cheerLoading = true;
  fetch('sounds/cheer_123do.mp3').then(r => r.arrayBuffer())
    .then(buf => new Promise((ok, fail) => ctx.decodeAudioData(buf, ok, fail)))
    .then(decoded => { cheerBuffer = decoded; })
    .catch(err => { console.warn('Không tải được giọng 1 2 3 dô', err); })
    .finally(() => { cheerLoading = false; });
}
function speakCheer(isSelf, drunk = 0) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (!cheerBuffer) { loadCheerVoice(); return; }
  const now = performance.now();
  if (now - lastSpeak < (isSelf ? 500 : 2600)) return; // người khác cụng dồn dập thì không đọc chồng chéo
  lastSpeak = now;
  const src = ctx.createBufferSource();
  src.buffer = cheerBuffer;
  const level = drunk >= 65 ? 1 : drunk >= 30 ? 0.5 : 0;
  src.playbackRate.value = 1 - level * (drunk >= 65 ? 0.4 : 0.15);   // chậm và trầm hơn khi say
  if (level > 0) {                                                   // cao độ chao đảo
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = 0.09 * level;
    lfo.connect(depth); depth.connect(src.playbackRate);
    lfo.start(); lfo.stop(ctx.currentTime + cheerBuffer.duration / src.playbackRate.value + 0.2);
  }
  const gain = ctx.createGain();
  gain.gain.value = isSelf ? 1 : 0.45;
  src.connect(gain); gain.connect(ctx.destination);
  if (isSelf && cheerSource) { try { cheerSource.stop(); } catch (_) {} }
  cheerSource = src;
  src.start();
}

function updateComfort() {
  document.body.classList.toggle('comfort-mode', comfortMode);
  comfortBtn.setAttribute('aria-pressed', String(comfortMode));
  comfortBtn.textContent = comfortMode ? 'Êm mắt: Bật' : 'Êm mắt: Tắt';
}
comfortBtn.addEventListener('click', () => {
  comfortMode = !comfortMode;
  try { localStorage.setItem('pub_comfort', String(comfortMode)); } catch (_) {}
  updateComfort();
});
reducedMotion.addEventListener('change', (e) => {
  if (e.matches) { comfortMode = true; updateComfort(); }
});
updateComfort();
document.getElementById('zoomInBtn').addEventListener('click', () => zoomCamera(cameraDistance - 0.8));
document.getElementById('zoomOutBtn').addEventListener('click', () => zoomCamera(cameraDistance + 0.8));
document.getElementById('resetCameraBtn').addEventListener('click', () => {
  leaveScenicView();
  cameraYaw = 0;
  cameraPitch = 0.72;
  cameraDistance = mobileControls ? 10.5 : 9.8;
});
// Secondary actions remain available in a compact mobile drawer.
const extraActions = document.createElement('div');
extraActions.id = 'extraActions';
extraActions.className = 'extra-actions';
const actionsGroup = document.querySelector('.hud-actions-group');
actionsGroup.appendChild(extraActions);
for (const button of [eatSnackBtn, peeBtn, vomitBtn, viewRiverBtn, soberBtn, billBtn]) extraActions.appendChild(button);
const moreActionsBtn = document.getElementById('moreActionsBtn');
// Keep the toggle next to the cheer button so the hidden skills are easy to find.
actionsGroup.appendChild(moreActionsBtn);
function closeExtraActions() {
  moreActionsBtn.setAttribute('aria-expanded', 'false');
  moreActionsBtn.textContent = 'Thêm';
  actionsGroup.classList.remove('actions-expanded');
  document.body.classList.remove('actions-open');
}
moreActionsBtn.addEventListener('click', () => {
  const open = moreActionsBtn.getAttribute('aria-expanded') !== 'true';
  closeExtraActions();
  if (open) {
    moreActionsBtn.setAttribute('aria-expanded', 'true');
    moreActionsBtn.textContent = 'Đóng';
    actionsGroup.classList.add('actions-expanded');
    document.body.classList.add('actions-open');
  }
});
extraActions.setAttribute('aria-label', 'Hành động phụ, vuốt ngang để xem thêm');
extraActions.addEventListener('click', (e) => { if (e.target.closest('button')) closeExtraActions(); });
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#extraActions, #moreActionsBtn')) closeExtraActions();
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExtraActions(); });
window.addEventListener('resize', closeExtraActions);

window.addEventListener('keydown', (e) => {
  if (nameModal.style.display === 'flex' || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (e.key === 'Enter') { e.preventDefault(); setChatOpen(true); return; }

  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = true;
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = true;
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.a = true;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.d = true;

  if ((e.key === 'e' || e.key === 'E') && !e.repeat) {
    handleToggleSit();
  }

  if (e.key === 'v' || e.key === 'V') {
    toggleScenicView();
  }

  if (e.key === 'p' || e.key === 'P') {
    handlePeeAction();
  }

  if (e.key === 'o' || e.key === 'O') {
    handleVomitAction();
  }

  if (e.key === 'f' || e.key === 'F') {
    const nearPG = checkNearbyPG();
    if (nearPG) {
      handleTalkPG(nearPG.brand);
    }
  }

  if (e.code === 'Space') {
    e.preventDefault();
    cheerBtn.click();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = false;
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = false;
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.a = false;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.d = false;
});

// ========================================================
// 7. Interactive Sit/Stand Logic
// ========================================================
function findNearestChair() {
  let nearest = null;
  let minDist = 1.6; // Bán kính tương tác ghế

  for (let slot of chairSlots) {
    const dist = Math.hypot(localPlayerState.x - slot.x, localPlayerState.z - slot.z);
    if (dist < minDist) {
      minDist = dist;
      nearest = slot;
    }
  }
  return nearest;
}

// Chiều cao hông của nhân vật chibi so với gốc (khớp createCharacter3D) và mặt ghế mặc định.
const SIT_HIP_Y = 0.44, DEFAULT_SEAT_Y = 0.74;
const seatRootY = (chair) => (chair && chair.seatY ? chair.seatY : DEFAULT_SEAT_Y) - SIT_HIP_Y + 0.04;
// Tư thế ngồi: đùi gập ngang về phía trước, cơ thể hạ xuống ngang mặt ghế.
function applySitPose(parts, mesh, rootY, delta) {
  const k = 1 - Math.exp(-14 * delta);
  mesh.position.y += (rootY - mesh.position.y) * k;
  for (const leg of [parts.leftLeg, parts.rightLeg]) leg.rotation.x += (-1.5 - leg.rotation.x) * k;
  mesh.rotation.z += (0 - mesh.rotation.z) * k;
  if (parts.torso) parts.torso.rotation.x += (0.06 - parts.torso.rotation.x) * k;
}
let lastSitToggleAt = 0;
function handleToggleSit() {
  // Bỏ qua lần gọi thứ hai trong 350ms (phím E tự lặp, hoặc touchstart + click cùng lúc).
  const nowMs = performance.now();
  if (nowMs - lastSitToggleAt < 350) return;
  lastSitToggleAt = nowMs;
  clearClickTarget();
  if (localPlayerState.is_sitting) {
    // Đứng dậy
    localPlayerState.is_sitting = false;
    localPlayerState.table_id = -1;
    localPlayerState.seat_id = -1;
    sitStandText.textContent = "Ngồi Ghế";
    sitStandBtn.classList.remove('is-sitting');
    sendAction({ action: "stand" });
  } else {
    // Ngồi vào ghế gần nhất
    const chair = findNearestChair();
    if (chair) {
      localPlayerState.is_sitting = true;
      localPlayerState.table_id = chair.tableId;
      localPlayerState.seat_id = chair.seatId;
      localPlayerState.x = chair.x;
      localPlayerState.z = chair.z;
      localPlayerState.ry = chair.ry;
      localPlayerState.seatRef = chair;
      sitStandText.textContent = "Đứng Dậy";
      sitStandBtn.classList.add('is-sitting');
      sendAction({ action: "sit", table_id: chair.tableId, seat_id: chair.seatId });
    }
  }
}

// ========================================================
// 7.5. Interactive Pee / WC Logic & Particles
// ========================================================
let peeParticles = [];

function findNearestPeeSpot() {
  for (let spot of peeSpots) {
    if (spot.type === 'wc' && !pubDetails.inside(localPlayerState.x, localPlayerState.z)) continue;
    const dist = Math.hypot(localPlayerState.x - spot.x, localPlayerState.z - spot.z);
    if (dist < spot.radius) return spot;
  }
  return null;
}

// Tia nước chảy liên tục ~3.2 giây, yếu dần về cuối; nguồn phát bám theo người đang đái (kể cả người chơi khác).
const PEE_DURATION = 3.2;
const peeStreams = [];
const peeGeo = new THREE.SphereGeometry(0.035, 4, 4);
const peeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
function spawnPeeStream(startX, startY, startZ, rotY, follow) {
  peeStreams.push({ x: startX, y: startY, z: startZ, ry: rotY, follow: follow || null, t: 0, acc: 0 });
}

function updatePeeParticles(delta) {
  for (let s = peeStreams.length - 1; s >= 0; s--) {
    const st = peeStreams[s];
    st.t += delta;
    if (st.follow) { const f = st.follow(); if (f) { st.x = f.x; st.z = f.z; st.ry = f.ry; } }
    if (st.t >= PEE_DURATION) { peeStreams.splice(s, 1); continue; }
    const strength = 1 - 0.45 * (st.t / PEE_DURATION);       // áp lực giảm dần
    st.acc += delta * 70;                                     // ~70 hạt/giây
    const dirX = Math.sin(st.ry), dirZ = Math.cos(st.ry);
    while (st.acc >= 1 && peeParticles.length < 450) {
      st.acc -= 1;
      const pMesh = new THREE.Mesh(peeGeo, peeMat);
      const px = st.x + dirX * 0.35, py = st.y + 0.62, pz = st.z + dirZ * 0.35;
      pMesh.position.set(px, py, pz);
      scene.add(pMesh);
      const speed = (2.0 + Math.random() * 0.6) * strength;
      peeParticles.push({
        x: px, y: py, z: pz,
        vx: dirX * speed + (Math.random() - 0.5) * 0.2,
        vy: (0.5 + Math.random() * 0.2) * strength,
        vz: dirZ * speed + (Math.random() - 0.5) * 0.2,
        mesh: pMesh, age: 0
      });
    }
    if (st.acc > 3) st.acc = 0;
  }
  for (let i = peeParticles.length - 1; i >= 0; i--) {
    const p = peeParticles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.z += p.vz * delta;
    p.vy -= 9.8 * delta; // Trọng lực
    p.age += delta;

    if (p.y <= 0.32 || p.age > 1.5) {
      scene.remove(p.mesh);
      peeParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.set(p.x, p.y, p.z);
  }
}

function updateBladderVisuals(level) {
  if (selfBladderBar) selfBladderBar.style.width = `${level}%`;
  let desc = "Êm ái";
  if (level >= 90) desc = "Căng tức bọng đái! 💥";
  else if (level >= 60) desc = "Buồn tiểu rồi 💧";
  else if (level >= 30) desc = "Hơi buồn buồn";
  if (selfBladderText) selfBladderText.textContent = `${level}% (${desc})`;

  // Mobile MOBA mini bar
  const mobBladderBar = document.getElementById('mobBladderBar');
  const mobBladderText = document.getElementById('mobBladderText');
  if (mobBladderBar) mobBladderBar.style.width = `${level}%`;
  if (mobBladderText) mobBladderText.textContent = `💧 ${level}%`;

  if (peeBtnText) {
    const near = findNearestPeeSpot();
    if (near) {
      if (near.type === "wc") peeBtnText.textContent = "Vào WC 🚹🚺";
      else if (near.type === "wall") peeBtnText.textContent = "Tè Bờ Tường [P]";
      else peeBtnText.textContent = "Đái Bậy Gốc Cây [P]";
    } else {
      peeBtnText.textContent = level >= 80 ? "Xả Lũ Ngay [P]!" : "Xả Lũ (WC/Tè)";
    }
  }
}

function sendPlayerPosition() {
  sendAction({ action: 'move', x: localPlayerState.x, y: 0, z: localPlayerState.z,
    ry: localPlayerState.ry, is_walking: false });
}
function moveThroughWCDoor(entering) {
  if (!localCharacter || wcPending || localPlayerState.is_sitting || (selfMember && selfMember.drunk_level >= 100)) return;
  if (entering && wcOccupant && wcOccupant !== clientId) {
    setTicker('🚪 WC đang có người, chờ một chút nhé!');
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    clearControls();
    sendPlayerPosition();
    wcPending = true;
    wcRequestTimer = setTimeout(() => { wcPending = false; updateWCControls(); }, 4000);
    sendAction({ action: entering ? 'wc_enter' : 'wc_exit' });
    updateWCControls();
    return;
  }
  wcOccupant = entering ? clientId : null;
  pubDetails.setOccupied(entering);
  applyWCDoorTransition(entering);
}
function applyWCDoorTransition(entering) {
  if (!localCharacter || localPlayerState.is_sitting || (selfMember && selfMember.drunk_level >= 100)) return;
  clearControls();
  leaveScenicView();
  localPlayerState.x = entering ? -19.2 : -16.4;
  localPlayerState.z = -2.7;
  localPlayerState.ry = entering ? -Math.PI / 2 : Math.PI / 2;
  localPlayerState.is_walking = false;
  wcHygiene = 'ready';
  localCharacter.mesh.position.set(localPlayerState.x, 0.3, localPlayerState.z);
  sendPlayerPosition();
  updateWCControls();
  setTicker(entering ? '🚽 WC sáng đèn rồi! Xả lũ xong nhớ rửa tay nhé.' : '🍻 Đã trở lại quán. Nhớ uống thêm nước lọc!');
}
const wcControls = document.getElementById('wcControls');
const wcUseBtn = document.getElementById('wcUseBtn');
const wcExitBtn = document.getElementById('wcExitBtn');
let wcHygiene = 'ready';
function updateWCControls() {
  const inside = pubDetails.inside(localPlayerState.x, localPlayerState.z);
  const nearby = pubDetails.nearEntrance(localPlayerState.x, localPlayerState.z);
  wcControls.hidden = isScenicView || !localCharacter || localPlayerState.is_sitting || (!inside && !nearby);
  wcExitBtn.hidden = !inside;
  wcUseBtn.textContent = !inside ? '🚪 Vào WC [P]' : wcHygiene === 'wash' ? '🧼 Rửa tay [P]' : wcHygiene === 'clean' ? '✓ Đã rửa tay' : '🚽 Dùng WC [P]';
  const busy = !inside && wcOccupant && wcOccupant !== clientId;
  if (busy) wcUseBtn.textContent = '🚪 WC đang có người';
  wcUseBtn.disabled = wcPending || busy || (inside && wcHygiene === 'clean');
  wcExitBtn.disabled = wcPending;
  peeBtnText.textContent = inside ? 'Dùng WC' : nearby ? 'Vào WC' : 'Xả lũ';
  if (inside || nearby || isScenicView) interactPrompt.style.display = 'none';
}
wcUseBtn.addEventListener('click', handlePeeAction);
wcExitBtn.addEventListener('click', () => moveThroughWCDoor(false));
function handlePeeAction() {
  if (!localCharacter || (selfMember && selfMember.drunk_level >= 100)) return;
  const inside = pubDetails.inside(localPlayerState.x, localPlayerState.z);
  if (!inside && !localPlayerState.is_sitting && pubDetails.nearEntrance(localPlayerState.x, localPlayerState.z)) {
    moveThroughWCDoor(true);
    return;
  }
  const spot = findNearestPeeSpot();
  const spotType = inside ? 'wc' : spot ? spot.type : (localPlayerState.z > 12 ? 'tree' : 'wall');
  if (inside) {
    if (wcHygiene === 'clean') return;
    if (wcHygiene === 'wash') {
      clearControls();
      localPlayerState.x = -19.25; localPlayerState.z = -3.15; localPlayerState.ry = Math.PI;
      localCharacter.mesh.position.set(localPlayerState.x, 0.3, localPlayerState.z);
      sendPlayerPosition();
      wcHygiene = 'clean';
      updateWCControls();
      show3DShoutBubble(clientId, '🧼 Tay sạch rồi, ra quán thôi!');
      setTicker('🧼 Đã rửa tay tại lavabo. Bấm Ra quán để về bàn nhậu.');
      return;
    }
    // Stand in front of the bowl; no outdoor particle stream inside the WC.
    clearControls();
    localPlayerState.x = -21.55; localPlayerState.z = -2.65; localPlayerState.ry = Math.PI;
    localCharacter.mesh.position.set(localPlayerState.x, 0.3, localPlayerState.z);
    sendPlayerPosition();
    wcHygiene = 'wash';
    updateWCControls();
  } else {
    spawnPeeStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry,
      () => ({ x: localPlayerState.x, z: localPlayerState.z, ry: localPlayerState.ry }));
  }
  playPeeSound();
  sendAction({ action: 'pee', spot_type: spotType });
}

// ========================================================
// 7.6. Tính Năng Ói Mửa / Cho Chó Ăn Chè / Huệ Ơi Huệ
// ========================================================
let vomitParticles = [];
let vomitPuddles = [];

function spawnVomitStream(startX, startY, startZ, rotY) {
  const dirX = Math.sin(rotY);
  const dirZ = Math.cos(rotY);
  const colors = [0x84cc16, 0x65a30d, 0xeab308, 0xd97706, 0xea580c];

  for (let i = 0; i < 40; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const pMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 4, 4),
      new THREE.MeshBasicMaterial({ color })
    );
    pMesh.position.set(startX + dirX * 0.3, startY + 0.85, startZ + dirZ * 0.3);
    scene.add(pMesh);

    vomitParticles.push({
      mesh: pMesh,
      x: startX + dirX * 0.3,
      y: startY + 0.85,
      z: startZ + dirZ * 0.3,
      vx: dirX * (1.8 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.5,
      vy: 0.6 + Math.random() * 0.7,
      vz: dirZ * (1.8 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.5,
      life: 55
    });
  }

  createVomitPuddle(startX + dirX * 1.1, startZ + dirZ * 1.1);
}

function createVomitPuddle(x, z) {
  const puddleMat = new THREE.MeshBasicMaterial({
    color: 0x84cc16,
    transparent: true,
    opacity: 0.82
  });
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.32 + Math.random() * 0.15, 12), puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(x, 0.306, z);
  scene.add(puddle);
  vomitPuddles.push({ mesh: puddle, time: 0 });
}

function updateVomitParticles(delta) {
  for (let i = vomitParticles.length - 1; i >= 0; i--) {
    const p = vomitParticles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.z += p.vz * delta;
    p.vy -= 9.8 * delta;
    p.life--;

    if (p.y <= 0.31 || p.life <= 0) {
      scene.remove(p.mesh);
      vomitParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.set(p.x, p.y, p.z);
  }

  // Làm mờ dần các bãi nôn sau 15 giây
  for (let j = vomitPuddles.length - 1; j >= 0; j--) {
    const pud = vomitPuddles[j];
    pud.time += delta;
    if (pud.time > 12) {
      pud.mesh.material.opacity = Math.max(0, 0.82 - (pud.time - 12) * 0.27);
    }
    if (pud.time > 15) {
      scene.remove(pud.mesh);
      vomitPuddles.splice(j, 1);
    }
  }
}

function handleVomitAction() {
  playVomitSound();
  spawnVomitStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry);

  // Nhân vật cúi người ôm bụng nôn
  if (localCharacter) {
    localCharacter.torso.rotation.x = 0.55;
    localCharacter.head.rotation.x = 0.45;
    setTimeout(() => {
      if (localCharacter) {
        localCharacter.torso.rotation.x = 0;
        localCharacter.head.rotation.x = 0;
      }
    }, 1500);
  }

  sendAction({ action: "vomit" });
}

// ========================================================
// 7.7. Tương Tác Với Các Em Gái Tiếp Thị Bia (PG Bia)
// ========================================================
function checkNearbyPG() {
  let nearestPG = null;
  let minDist = 2.4;
  for (const pg of pgGirls) {
    const dist = Math.hypot(localPlayerState.x - pg.x, localPlayerState.z - pg.z);
    if (dist < minDist) {
      minDist = dist;
      nearestPG = pg;
    }
  }
  return nearestPG;
}

function showPGBubble(pgId, text) {
  const pg = pgGirls.find(g => g.brand === pgId || g.id === pgId);
  if (!pg || !pg.tagBubble) return;
  pg.tagBubble.textContent = text;
  pg.tagBubble.style.display = 'block';
  setTimeout(() => {
    if (pg.tagBubble) pg.tagBubble.style.display = 'none';
  }, 4500);
}

function handleTalkPG(brand) {
  playPourBeerSound();
  sendAction({ action: "talk_pg", pg_id: brand });

  let cuteQuotes;
  if (brand === 'tiger') {
    cuteQuotes = [
      "Uống Tiger Bạc mát rượi nha anh! 🍺",
      "Em châm đầy ly đá cho anh nè~ 🧊",
      "Một hai ba dô cạn ly nha anh trai! 🍻",
      "Tiger Bạc đánh thức bản lĩnh phái mạnh nha anh! 🐅"
    ];
  } else if (brand === 'saigon_chill') {
    cuteQuotes = [
      "Sài Gòn Chill ướp lạnh mát lạnh sảng khoái cho anh nè! ❄️🍺",
      "Ra cầu tàu ngắm Landmark 81 nhâm nhi Sài Gòn Chill với em nha anh! 🌊",
      "Bia Sài Gòn vị của rồng, nâng ly chúc anh vạn sự như ý! 🐉✨",
      "Bật mood sảng khoái, chill hết nấc cùng em nha! 💃"
    ];
  } else {
    cuteQuotes = [
      "Ken ướp lạnh tuyệt hảo cho anh đây ạ! 🍺",
      "Anh đẹp trai phong độ quá, dô hết mình nha! ✨",
      "Uống không say không về cùng em nha anh! 💃",
      "Heineken Silver chuẩn êm mượt tặng anh trai nè! 🌟"
    ];
  }
  const quote = cuteQuotes[Math.floor(Math.random() * cuteQuotes.length)];
  showPGBubble(brand, quote);
}

// ========================================================
// 8. 3D Floating Name Tags & Chat Bubbles
// ========================================================
const playerHUDTags = new Map(); // id -> { elem, nameElem, bubbleElem }

function getOrCreatePlayerHUD(id, name, isSelf) {
  if (!playerHUDTags.has(id)) {
    const tag = document.createElement('div');
    tag.className = 'tag-3d' + (isSelf ? ' is-self' : '');

    const bubble = document.createElement('div');
    bubble.className = 'tag-bubble';
    bubble.style.display = 'none';
    tag.appendChild(bubble);

    const nameBadge = document.createElement('div');
    nameBadge.className = 'tag-name';
    nameBadge.textContent = (isSelf ? '⭐ ' : '') + name;
    tag.appendChild(nameBadge);

    hudOverlay.appendChild(tag);
    playerHUDTags.set(id, { elem: tag, nameElem: nameBadge, bubbleElem: bubble, bubbleTimer: null });
  }
  return playerHUDTags.get(id);
}

function show3DShoutBubble(id, text, duration = 3500) {
  const hud = playerHUDTags.get(id);
  if (!hud) return;
  hud.bubbleElem.textContent = text;
  hud.bubbleElem.style.display = 'block';
  hud.bubbleElem.style.animation = 'none';
  void hud.bubbleElem.offsetWidth;
  hud.bubbleWidth = hud.bubbleElem.offsetWidth;
  hud.bubbleElem.style.animation = '';
  hud.bubbleElem.style.animationDuration = `${duration}ms`;

  if (hud.bubbleTimer) clearTimeout(hud.bubbleTimer);
  hud.bubbleTimer = setTimeout(() => {
    hud.bubbleElem.style.display = 'none';
  }, duration);
}

const tempVec = new THREE.Vector3();
function fitChatBubble(hud, headX) {
  const half = (hud.bubbleWidth || 0) / 2;
  const shift = Math.max(8 + half - headX, Math.min(innerWidth - 8 - half - headX, 0));
  hud.bubbleElem.style.left = `${shift}px`;
  hud.bubbleElem.style.setProperty('--bubble-arrow-x', `${Math.max(10, Math.min(half * 2 - 10, half - shift))}px`);
}
function updatePlayerHUDPositions() {
  // Update Local Player Tag
  if (localCharacter) {
    tempVec.set(localPlayerState.x, 2.1, localPlayerState.z);
    tempVec.project(camera);
    if (tempVec.z < 1) {
      const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
      const hud = getOrCreatePlayerHUD(clientId, selfMember ? selfMember.name : "Tôi", true);
      hud.elem.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      hud.elem.style.display = 'flex';
      fitChatBubble(hud, x);
    }
  }

  // Update Remote Players Tags
  remotePlayers.forEach((rp, id) => {
    tempVec.set(rp.mesh.position.x, rp.mesh.position.y + 2.1, rp.mesh.position.z);
    tempVec.project(camera);
    const hud = getOrCreatePlayerHUD(id, rp.data.name, false);
    const privateWC = pubDetails.inside(rp.targetPos.x, rp.targetPos.z) && !pubDetails.inside(localPlayerState.x, localPlayerState.z);
    rp.mesh.visible = !privateWC;
    if (tempVec.z < 1 && !privateWC) {
      const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
      hud.elem.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      hud.elem.style.display = 'flex';
      fitChatBubble(hud, x);
    } else {
      hud.elem.style.display = 'none';
    }
  });

  // Update Các Em Gái Tiếp Thị Bia (PG Bia) Tags & Chat Bubbles
  pgGirls.forEach((pg) => {
    tempVec.set(pg.x, 1.95, pg.z);
    tempVec.project(camera);
    if (tempVec.z < 1) {
      const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
      pg.tagElem.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      pg.tagElem.style.display = 'flex';
    } else {
      pg.tagElem.style.display = 'none';
    }
  });
}

// ========================================================
// 9. WebSocket Networking & State Sync (Ho tro ca Cloudflare Pages Offline Demo)
// ========================================================
let isOfflineMode = false;
let offlineFallbackTimer = null;

function enableOfflineDemo() {
  if (localCharacter) return;
  isOfflineMode = true;
  console.log('🌟 Kích hoạt Chế độ Tham quan (Cloudflare Pages Static Mode)');
  selfMember = {
    id: clientId,
    name: "Bạn (Tham Quan)",
    color: "#f97316",
    x: 0,
    z: 2.5,
    ry: 0,
    drunk_level: 0,
    bladder_level: 0,
    status: "Tỉnh Táo"
  };
  selfNameDisplay.textContent = selfMember.name;
  selfColorBadge.style.backgroundColor = selfMember.color;
  const mobName = document.getElementById('mobNameDisplay');
  const mobAvatar = document.getElementById('mobAvatarBadge');
  if (mobName) mobName.textContent = selfMember.name;
  if (mobAvatar) mobAvatar.style.backgroundColor = selfMember.color;
  localPlayerState.x = selfMember.x;
  localPlayerState.z = selfMember.z;
  localPlayerState.ry = selfMember.ry;
  localCharacter = createCharacter3D(selfMember.color);
  scene.add(localCharacter.mesh);
  updateDrunkVisuals(0, "Tỉnh Táo");
  updateBladderVisuals(0);
  setTicker("🌟 Chế độ xem trước Cloudflare Pages! Dùng W/A/S/D đi lại, chuột xoay 360°, [P] đái bậy/WC, [V] ngắm Landmark 81.");
  window.dispatchEvent(new Event('pub:ready'));
}

function connectWebSocket() {
  const urlParams = new URLSearchParams(window.location.search);
  const customServer = urlParams.get('server');
  let wsUrl = '';
  if (customServer) {
    const clean = customServer.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const proto = customServer.startsWith('http:') ? 'ws:' : 'wss:';
    wsUrl = `${proto}//${clean}/ws/${roomId}/${clientId}`;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${protocol}//${window.location.host}/ws/${roomId}/${clientId}`;
  }
  const wsQuery = new URLSearchParams();
  if (profileId) wsQuery.set('pid', profileId);
  if (urlParams.get('private') === '1') wsQuery.set('private', '1');
  if ([...wsQuery].length) wsUrl += '?' + wsQuery.toString();

  // Tự động kích hoạt Offline Demo nếu sau 2.5s không nhận được WebSocket (VD khi host trên Cloudflare Pages tĩnh)
  if (!offlineFallbackTimer) {
    offlineFallbackTimer = setTimeout(() => {
      if (!localCharacter) {
        enableOfflineDemo();
      }
    }, 2500);
  }

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn("Lỗi kết nối WebSocket:", err);
  }

  if (!ws) return;

  ws.onopen = () => {
    console.log('Đã kết nối Thế Giới 3D Quán Nhậu!');
    if (offlineFallbackTimer) clearTimeout(offlineFallbackTimer);
    isOfflineMode = false;
    updateChatConnection();
  };

  ws.onmessage = (event) => {
    if (offlineFallbackTimer) clearTimeout(offlineFallbackTimer);
    const data = JSON.parse(event.data);
    if (window.Features && Features.onMessage(data)) return;

    switch (data.type) {
      case 'wc_state':
        wcOccupant = data.occupant_id;
        pubDetails.setOccupied(Boolean(wcOccupant));
        updateWCControls();
        break;
      case 'wc_result':
        clearTimeout(wcRequestTimer); wcPending = false;
        wcOccupant = data.entered ? clientId : null;
        pubDetails.setOccupied(data.entered);
        applyWCDoorTransition(data.entered);
        break;
      case 'wc_notice':
        clearTimeout(wcRequestTimer); wcPending = false;
        updateWCControls(); setTicker(data.message);
        break;
      case 'position_correction':
        clearControls();
        localPlayerState.x = data.x; localPlayerState.z = data.z;
        localCharacter.mesh.position.set(data.x, 0.3, data.z);
        setTicker(data.message);
        break;
      case 'chat_event':
        receiveChat(data);
        break;
      case 'chat_error':
        finishChatSend();
        chatStatus.textContent = data.message;
        break;
      case 'init':
        const world = data.world_state;
        wcOccupant = world.wc_occupant || null;
        pubDetails.setOccupied(Boolean(wcOccupant));
        totalCheersDisplay.textContent = world.total_cheers;

        // Tìm thông tin của mình
        selfMember = world.members.find(m => m.id === clientId);
        if (selfMember) {
          selfNameDisplay.textContent = selfMember.name;
          selfColorBadge.style.backgroundColor = selfMember.color;
          const mobNameInit = document.getElementById('mobNameDisplay');
          const mobAvatarInit = document.getElementById('mobAvatarBadge');
          if (mobNameInit) mobNameInit.textContent = selfMember.name;
          if (mobAvatarInit) mobAvatarInit.style.backgroundColor = selfMember.color;
          localPlayerState.x = selfMember.x;
          localPlayerState.z = selfMember.z;
          localPlayerState.ry = selfMember.ry;

          // Tạo nhân vật 3D của mình
          if (!localCharacter) {
            localCharacter = createCharacter3D(selfMember.color);
            scene.add(localCharacter.mesh);
            if (window.Features) Features.dress(localCharacter, selfMember.outfit, selfMember.color);
          }
          updateDrunkVisuals(selfMember.drunk_level, selfMember.status);
          updateBladderVisuals(selfMember.bladder_level || 0);
        }

        // Tạo các người chơi khác đã có trong phòng
        world.members.forEach(m => {
          if (m.id !== clientId) spawnRemotePlayer(m);
        });
        break;

      case 'member_joined':
        spawnRemotePlayer(data.member);
        setTicker(data.message);
        break;

      case 'member_left':
        removeRemotePlayer(data.member_id);
        setTicker(data.message);
        break;

      case 'player_moved':
        const rp = remotePlayers.get(data.id);
        if (rp) {
          rp.targetPos.set(data.x, data.y + 0.3, data.z);
          rp.targetRot = data.ry;
          rp.is_walking = data.is_walking;
        }
        break;

      case 'player_sat':
        const satPlayer = remotePlayers.get(data.id);
        if (satPlayer) {
          satPlayer.data.is_sitting = true;
          const chair = chairSlots.find(c => c.tableId === data.table_id && c.seatId === data.seat_id);
          satPlayer.sitting = true;
          satPlayer.seatRef = chair || null;
          if (chair) {
            satPlayer.targetPos.set(chair.x, 0.3, chair.z);
            satPlayer.targetRot = chair.ry;
            satPlayer.mesh.position.set(chair.x, 0.3, chair.z);
            satPlayer.mesh.rotation.y = chair.ry;
          }
        }
        setTicker(data.message);
        break;

      case 'player_stood':
        const stoodPlayer = remotePlayers.get(data.id);
        if (stoodPlayer) {
          stoodPlayer.data.is_sitting = false;
          stoodPlayer.sitting = false;
          stoodPlayer.seatRef = null;
          if (stoodPlayer.charParts.torso) stoodPlayer.charParts.torso.rotation.x = 0;
        }
        setTicker(data.message);
        break;

      case 'cheer_event':
        totalCheersDisplay.textContent = data.total_cheers;
        playClinkSound();
        speakCheer(data.member_id === clientId, data.drunk_level || 0);
        show3DShoutBubble(data.member_id, "🍻 1, 2, 3 DÔÔÔ!");
        setTicker(data.message);

        // Hiệu ứng nâng ly cụng bia
        animateCheerMug(data.member_id);

        if (data.member_id === clientId && selfMember) {
          selfMember.drunk_level = data.drunk_level;
          selfMember.bladder_level = data.bladder_level || 0;
          selfMember.status = data.status;
          updateDrunkVisuals(data.drunk_level, data.status);
          updateBladderVisuals(selfMember.bladder_level);
        }
        break;

      case 'pee_event':
        if (data.is_fined) playSirenSound();
        else playPeeSound();

        if (data.spot_type !== 'wc' && data.member_id !== clientId && remotePlayers.has(data.member_id)) {
          const rpee = remotePlayers.get(data.member_id);
          spawnPeeStream(rpee.mesh.position.x, 0.3, rpee.mesh.position.z, rpee.mesh.rotation.y,
            () => ({ x: rpee.mesh.position.x, z: rpee.mesh.position.z, ry: rpee.mesh.rotation.y }));
        }
        const pBubble = data.spot_type === 'wc' ? "🚽 Nhẹ hết cả người!" : "🌳 Róc rách róc rách...";
        show3DShoutBubble(data.member_id, pBubble);
        setTicker(data.message);

        if (data.member_id === clientId && selfMember) {
          selfMember.bladder_level = 0;
          selfMember.drunk_level = data.drunk_level;
          updateDrunkVisuals(data.drunk_level, selfMember.status);
          updateBladderVisuals(0);
        }
        break;

      case 'vomit_event':
        playVomitSound();
        if (data.member_id === clientId) {
          spawnVomitStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry);
        } else {
          const rp = remotePlayers.get(data.member_id);
          if (rp) spawnVomitStream(rp.mesh.position.x, 0.3, rp.mesh.position.z, rp.mesh.rotation.y);
        }
        show3DShoutBubble(data.member_id, "🤮 Huệ ơi là Huệ!");
        setTicker(data.message);

        if (data.member_id === clientId && selfMember) {
          selfMember.drunk_level = data.drunk_level;
          selfMember.bladder_level = data.bladder_level || 0;
          selfMember.status = data.status;
          updateDrunkVisuals(data.drunk_level, data.status);
          updateBladderVisuals(selfMember.bladder_level);
        }
        break;

      case 'pg_event':
        playPourBeerSound();
        showPGBubble(data.pg_id, data.message);
        setTicker(data.message);

        if (data.member_id === clientId && selfMember) {
          selfMember.drunk_level = data.drunk_level;
          selfMember.status = data.status;
          updateDrunkVisuals(data.drunk_level, data.status);
        }
        break;

      case 'snack_event':
        topMoiTacDisplay.textContent = data.top_moitac_name;
        playCrunchSound();
        show3DShoutBubble(data.member_id, "🥢 Măm măm!");
        setTicker(data.message);
        break;

      case 'sober_event':
        if (data.member_id === clientId && selfMember) {
          selfMember.drunk_level = data.drunk_level;
          selfMember.status = data.status;
          updateDrunkVisuals(data.drunk_level, data.status);
          playSoberSound();
        }
        setTicker(data.message);
        break;

      case 'shout_event':
        show3DShoutBubble(data.member_id, data.text);
        setTicker(`🗣️ ${data.member_name}: "${data.text}"`);
        break;

      case 'bill_event':
        playBillChime();
        setTicker(data.message);
        alert(`🧾 BÁO CÁO TÍNH TIỀN!\n\n${data.message}`);
        break;

      case 'name_changed':
        if (data.member_id === clientId) {
          selfNameDisplay.textContent = data.new_name;
          const mobName = document.getElementById('mobNameDisplay');
          if (mobName) mobName.textContent = data.new_name;
          const hud = playerHUDTags.get(clientId);
          if (hud) hud.nameElem.textContent = '⭐ ' + data.new_name;
        } else {
          const rp = remotePlayers.get(data.member_id);
          if (rp) {
            rp.data.name = data.new_name;
            const hud = playerHUDTags.get(data.member_id);
            if (hud) hud.nameElem.textContent = data.new_name;
          }
        }
        setTicker(data.message);
        break;
    }
  };

  ws.onclose = () => {
    updateChatConnection();
    if (!isOfflineMode) {
      setTimeout(connectWebSocket, 3000);
    }
  };
}

function sendAction(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return;
  }

  // Xu ly Offline/Demo Mode khi host tren Cloudflare Pages chua co server
  if (payload.action === 'cheer') {
    totalCheersDisplay.textContent = parseInt(totalCheersDisplay.textContent || "0") + 1;
    playClinkSound();
    playGulpSound();
    show3DShoutBubble(clientId, "🍻 1, 2, 3 DÔÔÔ!");
    if (selfMember) {
      selfMember.drunk_level = Math.min(100, (selfMember.drunk_level || 0) + 15);
      selfMember.bladder_level = Math.min(100, (selfMember.bladder_level || 0) + 20);
      const status = selfMember.drunk_level >= 80 ? "Sấp Mặt" : (selfMember.drunk_level >= 50 ? "Lảo Đảo" : (selfMember.drunk_level >= 20 ? "Ngà Ngà" : "Tỉnh Táo"));
      selfMember.status = status;
      updateDrunkVisuals(selfMember.drunk_level, status);
      updateBladderVisuals(selfMember.bladder_level);
    }
    setTicker("🍻 1, 2, 3 DÔÔÔ! (Cụng ly)");
  } else if (payload.action === 'eat_snack') {
    playCrunchSound();
    show3DShoutBubble(clientId, "🥢 Món bén quá!");
    if (selfMember) {
      selfMember.drunk_level = Math.max(0, (selfMember.drunk_level || 0) - 10);
      updateDrunkVisuals(selfMember.drunk_level, selfMember.status);
    }
    setTicker("🥜 Ăn đậu phộng nem chua giòn rụm!");
  } else if (payload.action === 'sober_up') {
    playSoberSound();
    if (selfMember) {
      selfMember.drunk_level = 0;
      selfMember.status = "Tỉnh Táo";
      updateDrunkVisuals(0, "Tỉnh Táo");
    }
    setTicker("💧 Uống trà đá giải rượu, tỉnh rụi!");
  } else if (payload.action === 'pee') {
    playPeeSound();
    show3DShoutBubble(clientId, payload.spot_type === 'wc' ? "🚽 Nhẹ người!" : "🌳 Róc rách róc rách...");
    if (selfMember) {
      selfMember.bladder_level = 0;
      selfMember.drunk_level = Math.max(0, (selfMember.drunk_level || 0) - 10);
      updateDrunkVisuals(selfMember.drunk_level, selfMember.status);
      updateBladderVisuals(0);
    }
    setTicker("🚽 Xả lũ thành công! Cảm giác thật sảng khoái.");
  } else if (payload.action === 'vomit') {
    playVomitSound();
    spawnVomitStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry);
    if (selfMember) {
      selfMember.drunk_level = Math.max(0, (selfMember.drunk_level || 0) - 40);
      selfMember.bladder_level = Math.max(0, (selfMember.bladder_level || 0) - 40);
      selfMember.status = selfMember.drunk_level < 30 ? "Tỉnh Táo" : (selfMember.drunk_level < 65 ? "Lâng Lâng" : "Say Mèm");
      updateDrunkVisuals(selfMember.drunk_level, selfMember.status);
      updateBladderVisuals(selfMember.bladder_level);
    }
    show3DShoutBubble(clientId, "🤮 Móc họng gọi Huệ ơi!");
    setTicker("🤮 Bạn đã nôn thốc nôn tháo cho chó ăn chè, giảm 40% độ say!");
  } else if (payload.action === 'talk_pg') {
    playPourBeerSound();
    const pgId = payload.pg_id || 'tiger';
    if (selfMember) {
      selfMember.drunk_level = Math.max(0, (selfMember.drunk_level || 0) - 15);
      selfMember.status = selfMember.drunk_level < 30 ? "Tỉnh Táo" : (selfMember.drunk_level < 65 ? "Lâng Lâng" : "Say Mèm");
      updateDrunkVisuals(selfMember.drunk_level, selfMember.status);
    }
    const pgQuotes = pgId === 'tiger'
      ? ["💃 Em Thảo My (PG Tiger): Uống Tiger Bạc mát rượi nha anh! 🍺", "💃 Em Thảo My: Em châm đầy ly đá cho anh nè~ 🧊", "💃 Em Thảo My: Một hai ba dô cạn ly nha anh trai! 🍻"]
      : ["💃 Em Ngọc Trinh (PG Heineken): Ken ướp lạnh tuyệt hảo cho anh đây ạ! 🍺", "💃 Em Ngọc Trinh: Anh đẹp trai phong độ quá, dô hết mình nha! ✨", "💃 Em Ngọc Trinh: Uống không say không về cùng em nha anh! 💃"];
    const q = pgQuotes[Math.floor(Math.random() * pgQuotes.length)];
    showPGBubble(pgId, q);
    setTicker(q);
  } else if (payload.action === 'quick_shout') {
    show3DShoutBubble(clientId, payload.text);
    setTicker(`🗣️ Bạn: "${payload.text}"`);
  } else if (payload.action === 'change_name') {
    if (selfMember) selfMember.name = payload.name;
    selfNameDisplay.textContent = payload.name;
    const hud = playerHUDTags.get(clientId);
    if (hud) hud.nameElem.textContent = '⭐ ' + payload.name;
    setTicker(`🏷️ Đổi tên thành: ${payload.name}`);
  }
}

function spawnRemotePlayer(memberData) {
  if (remotePlayers.has(memberData.id)) return;

  const char3D = createCharacter3D(memberData.color);
  if (window.Features) Features.dress(char3D, memberData.outfit, memberData.color);
  char3D.mesh.position.set(memberData.x, 0.3, memberData.z);
  char3D.mesh.rotation.y = memberData.ry;
  scene.add(char3D.mesh);

  remotePlayers.set(memberData.id, {
    mesh: char3D.mesh,
    charParts: char3D,
    data: memberData,
    targetPos: new THREE.Vector3(memberData.x, 0.3, memberData.z),
    targetRot: memberData.ry,
    walkTime: 0,
    is_walking: false,
    sitting: false,
    seatRef: null
  });
  if (memberData.is_sitting) {
    const seat = chairSlots.find(c => c.tableId === memberData.table_id && c.seatId === memberData.seat_id);
    const rpNew = remotePlayers.get(memberData.id);
    if (seat && rpNew) {
      rpNew.sitting = true; rpNew.seatRef = seat;
      rpNew.targetPos.set(seat.x, 0.3, seat.z); rpNew.targetRot = seat.ry;
      rpNew.mesh.position.set(seat.x, seatRootY(seat), seat.z);
    }
  }
}

function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (rp) {
    scene.remove(rp.mesh);
    remotePlayers.delete(id);
  }
  const hud = playerHUDTags.get(id);
  if (hud) {
    hud.elem.remove();
    playerHUDTags.delete(id);
  }
}

function animateCheerMug(id) {
  pubDetails.react('cheer', clock.elapsedTime);
  let mug = null;
  if (id === clientId && localCharacter) {
    mug = localCharacter.beerMug;
  } else if (remotePlayers.has(id)) {
    mug = remotePlayers.get(id).charParts.beerMug;
  }
  if (!mug) return;
  const parts = id === clientId && localCharacter ? localCharacter : remotePlayers.get(id).charParts;
  const swing = parts && parts.armSwing;

  const initialY = mug.position.y;
  let t = 0;
  const cheerInterval = setInterval(() => {
    t += 0.1;
    if (swing) {
      swing.rotation.x = -Math.sin(Math.min(t, 1) * Math.PI) * 1.0;   // giơ tay lên
      mug.rotation.x = -swing.rotation.x * 0.6;                        // giữ ly gần thẳng đứng
    } else {
      mug.position.y = initialY + Math.sin(t * Math.PI) * 0.25;
      mug.rotation.z = Math.sin(t * Math.PI) * 0.4;
    }
    if (t >= 1) {
      clearInterval(cheerInterval);
      if (swing) { swing.rotation.x = 0; mug.rotation.x = 0; }
      mug.position.y = initialY;
      mug.rotation.z = 0;
    }
  }, 40);
}

// ========================================================
// 10. Drunk State & UI Visuals
// ========================================================
function updateDrunkVisuals(level, status) {
  selfDrunkBar.style.width = `${level}%`;
  let label = 'Tỉnh táo';
  if (level >= 100) label = 'Gục tại chỗ 😵';
  else if (level >= 65) label = 'Say mèm 🥴';
  else if (level >= 30) label = 'Lâng lâng 🍺';

  selfDrunkText.textContent = `${level}% (${label})`;

  // Mobile MOBA mini bar
  const mobDrunkBar = document.getElementById('mobDrunkBar');
  const mobDrunkText = document.getElementById('mobDrunkText');
  if (mobDrunkBar) mobDrunkBar.style.width = `${level}%`;
  if (mobDrunkText) mobDrunkText.textContent = `🍺 ${level}%`;

  document.body.classList.remove('drunk-wobble-1', 'drunk-wobble-2', 'drunk-wobble-3');

  if (level >= 100) {
    document.body.classList.add('drunk-wobble-3');
    passoutModal.style.display = 'flex';
    playSnoreSound();
    if (localCharacter) {
      localCharacter.mesh.rotation.z = Math.PI / 2; // Ngã lăn quay ra sàn
      localCharacter.mesh.position.y = 0.2;
    }
  } else {
    passoutModal.style.display = 'none';
    if (localCharacter) {
      localCharacter.mesh.rotation.z = 0;
      localCharacter.mesh.position.y = 0.3;
    }
    if (level >= 65) document.body.classList.add('drunk-wobble-2');
    else if (level >= 30) document.body.classList.add('drunk-wobble-1');
  }
}

function setTicker(msg) {
  tickerMsg.style.opacity = '0';
  setTimeout(() => {
    tickerMsg.textContent = msg;
    tickerMsg.style.opacity = '1';
  }, 200);
}

// ========================================================
// 11. Main 3D Animation & Physics Loop
// ========================================================
const clock = new THREE.Clock();
let networkTimer = 0;
let firstFrameDone = false;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  // Local Character Movement & Physics (Theo hướng nhìn của Camera)
  if (localCharacter && !localPlayerState.is_sitting && (!selfMember || selfMember.status !== 'guc_nga')) {
    // Vector hướng tới & sang phải dựa theo góc xoay cameraYaw
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let inputForward = 0;
    let inputRight = 0;

    if (keys.w) inputForward += 1;
    if (keys.s) inputForward -= 1;
    if (keys.a) inputRight -= 1;
    if (keys.d) inputRight += 1;

    // Hỗ trợ Analog Joystick Liên Quân Mobile 360 độ
    if (joystickState.active && (Math.abs(joystickState.x) > 0.05 || Math.abs(joystickState.y) > 0.05)) {
      inputForward = joystickState.y;
      inputRight = joystickState.x;
    }

    let moveX = 0;
    let moveZ = 0;
    let inputMag = Math.min(1.0, Math.hypot(inputForward, inputRight));

    if (inputMag > 0.05) {
      clearClickTarget(); // bàn phím/cần gạt luôn ưu tiên hơn click-to-move
      moveX = forwardX * inputForward + rightX * inputRight;
      moveZ = forwardZ * inputForward + rightZ * inputRight;
    } else if (clickTarget) {
      const toX = clickTarget.x - localPlayerState.x, toZ = clickTarget.z - localPlayerState.z;
      const dist = Math.hypot(toX, toZ);
      if (dist < 0.2) {
        clearClickTarget();
      } else {
        moveX = toX / dist; moveZ = toZ / dist;
        inputMag = 1;
        clickMarker.material.opacity = 0.55 + Math.sin(clock.elapsedTime * 8) * 0.3;
        // Kẹt vật cản (bàn, tường...) quá lâu thì bỏ điểm đến.
        clickStuckTime = (clickStuckTime || 0) + delta;
        if (localPlayerState._lastClickDist !== undefined && localPlayerState._lastClickDist - dist > 0.02) clickStuckTime = 0;
        localPlayerState._lastClickDist = dist;
        if (clickStuckTime > 0.7) clearClickTarget();
      }
    }

    // Drunk Drift / Loạng choạng xiêu vẹo khi say xỉn
    if (!comfortMode && selfMember && selfMember.drunk_level > 35) {
      const drunkFactor = (selfMember.drunk_level - 35) / 65;
      moveX += Math.sin(clock.getElapsedTime() * 3) * 0.45 * drunkFactor;
      moveZ += Math.cos(clock.getElapsedTime() * 2) * 0.3 * drunkFactor;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      moveX /= len;
      moveZ /= len;

      const currentSpeed = localPlayerState.speed * Math.max(0.4, inputMag);
      const next = pubDetails.move(localPlayerState.x, localPlayerState.z,
        moveX * currentSpeed * delta, moveZ * currentSpeed * delta, Boolean(wcOccupant && wcOccupant !== clientId));
      localPlayerState.x = next.x;
      localPlayerState.z = next.z;

      // Giới hạn trong khuôn viên mở rộng: từ quán vỉa hè, công viên, đến tận Cầu Tàu Bến Bạch Đằng & 2 đầu cánh
      localPlayerState.x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, localPlayerState.x));
      localPlayerState.z = Math.max(WORLD_BOUNDS.minZAt(localPlayerState.x), Math.min(WORLD_BOUNDS.maxZ - 0.7, localPlayerState.z));

      // Nhân vật xoay mặt theo hướng đang di chuyển
      localPlayerState.ry = Math.atan2(moveX, moveZ);
      localPlayerState.is_walking = true;
      localPlayerState.walkTime += delta * 12;

      // Leg Swing & Chibi Waddle Animation (Bước đi lắc lư Chibi đáng yêu)
      localCharacter.leftLeg.rotation.x = Math.sin(localPlayerState.walkTime) * 0.55;
      localCharacter.rightLeg.rotation.x = -Math.sin(localPlayerState.walkTime) * 0.55;
      if (localCharacter.leftArm) localCharacter.leftArm.rotation.x = -Math.sin(localPlayerState.walkTime) * 0.6;
      localCharacter.mesh.rotation.z = Math.sin(localPlayerState.walkTime * 0.5) * 0.05;
    } else {
      localPlayerState.is_walking = false;
      localCharacter.leftLeg.rotation.x = 0;
      localCharacter.rightLeg.rotation.x = 0;
      localCharacter.mesh.rotation.z = 0;
      if (localCharacter.leftArm) localCharacter.leftArm.rotation.x *= 0.8;
    }

    localCharacter.mesh.position.set(localPlayerState.x, 0.3, localPlayerState.z);
    localCharacter.mesh.rotation.y = localPlayerState.ry;
    if (localCharacter.torso) localCharacter.torso.rotation.x = 0;

    // Gửi vị trí lên server (khoảng 20Hz để mượt mạng)
    networkTimer += delta;
    if (networkTimer > 0.05) {
      networkTimer = 0;
      sendAction({
        action: "move",
        x: localPlayerState.x,
        z: localPlayerState.z,
        ry: localPlayerState.ry,
        is_walking: localPlayerState.is_walking
      });
    }

    // Hiển thị nút tương tác [E] ghế ngồi, [P] xả lũ / đái bậy, hoặc [F] Em Gái Tiếp Thị Bia (PG)
    const nearChair = findNearestChair();
    const nearPee = findNearestPeeSpot();
    const nearPG = checkNearbyPG();

    if (nearChair) {
      interactPrompt.style.display = 'flex';
      interactPrompt.querySelector('.prompt-key').textContent = "E";
      const isBench = nearChair.tableId >= 10;
      interactPrompt.querySelector('.prompt-text').textContent = nearChair.prompt || (isBench ? "Ngồi ghế đá ngắm sông Sài Gòn" : "Kéo ghế ngồi vào bàn nhậu");
    } else if (nearPee) {
      interactPrompt.style.display = 'flex';
      interactPrompt.querySelector('.prompt-key').textContent = "P";
      if (nearPee.type === 'wc') {
        interactPrompt.querySelector('.prompt-text').textContent = "Vào WC quán nhậu xả lũ";
      } else if (nearPee.type === 'wall') {
        interactPrompt.querySelector('.prompt-text').textContent = "Tè bậy lên bờ tường (Coi chừng phạt!)";
      } else {
        interactPrompt.querySelector('.prompt-text').textContent = "Đái bậy vào gốc cây công viên";
      }
    } else if (nearPG) {
      interactPrompt.style.display = 'flex';
      interactPrompt.querySelector('.prompt-key').textContent = "F";
      interactPrompt.querySelector('.prompt-text').textContent = `Tâm sự / Nhận bia từ ${nearPG.name} 💃`;
    } else {
      interactPrompt.style.display = 'none';
    }
  } else if (localPlayerState.is_sitting) {
    interactPrompt.style.display = 'none';
  }

  updateWCControls();
  pubDetails.update(clock.elapsedTime);

  // Animation Hạt tia nước đái bậy & Hạt ói mửa nôn thốc nôn tháo
  updatePeeParticles(delta);
  updateVomitParticles(delta);

  // Animation Các Em Gái Tiếp Thị Bia (PG Bia bước đi, đánh chân, đung đưa khay & chào hỏi)
  updatePGBiaGirls(delta);

  // Animation Đom Đóm Đêm Công Viên (Fireflies lượn bập bềnh & phát sáng)
  if (parkFireflies && parkFireflies.geometry) {
    const fPos = parkFireflies.geometry.attributes.position.array;
    const fCount = fPos.length / 3;
    const fTime = clock.elapsedTime;
    for (let pi = 0; pi < fCount; pi++) {
      fPos[pi * 3 + 1] += Math.sin(fTime * 2.2 + pi * 0.5) * 0.003;
      fPos[pi * 3] += Math.cos(fTime * 1.4 + pi) * 0.002;
    }
    parkFireflies.geometry.attributes.position.needsUpdate = true;
    parkFireflies.material.opacity = 0.65 + Math.sin(fTime * 3.0) * 0.25;
  }

  // Animation Sông Sài Gòn & Du Thuyền Du Lịch
  if (cruiseBoat) {
    cruiseBoat.position.x += delta * 1.8;
    if (cruiseBoat.position.x > 50) cruiseBoat.position.x = -50;
    cruiseBoat.position.y = 0.1 + Math.sin(clock.getElapsedTime() * 1.8) * 0.05;
  }

  // Animation Đèn LED Landmark 81 & Ngọn Hải Đăng Đỉnh Tháp
  if (landmarkSpireLight) {
    landmarkSpireLight.intensity = 1.8 + Math.sin(clock.elapsedTime * 0.7) * 0.25;
  }
  if (landmarkLEDs.length > 0) {
    const hue = (clock.elapsedTime * (comfortMode ? 0.004 : 0.012) + 0.5) % 1;
    landmarkLEDs.forEach((strip, sIdx) => {
      const sHue = (hue + Math.floor(sIdx / 4) * 0.11) % 1;
      strip.material.color.setHSL(sHue, 0.65, 0.7);
    });
  }

  if (landmarkReflections) landmarkReflections.material.opacity = 0.3 + Math.sin(clock.elapsedTime * 0.65) * 0.035;
  if (landmarkBeaconHalo) landmarkBeaconHalo.material.opacity = 0.8 + Math.sin(clock.elapsedTime * 0.7) * 0.1;

  // Camera Management: Chế độ Cinematic Ngắm Landmark 81 VS Góc nhìn 360°
  const inWC = pubDetails.inside(localPlayerState.x, localPlayerState.z);
  if (inWC && isScenicView) toggleScenicView();
  if (inWC !== wasInWC) {
    cameraTargetReady = false;
    if (!inWC) wcHygiene = 'ready';
    wasInWC = inWC;
  }
  if (isScenicView && !inWC) {
    // Góc nhìn điện ảnh hướng thẳng ra Landmark 81 và dòng sông lấp lánh
    const scenicCamPos = new THREE.Vector3(localPlayerState.x * 0.5, 6.2, 19.5);
    const scenicLookY = camera.aspect < 0.8 ? 24 : 22;
    camera.position.lerp(scenicCamPos, 1 - Math.exp(-7 * delta));
    if (!cameraTargetReady) { cameraLookTarget.set(8, scenicLookY, 95); cameraTargetReady = true; }
    cameraLookTarget.lerp(new THREE.Vector3(8, scenicLookY, 95), 1 - Math.exp(-9 * delta));
    camera.lookAt(cameraLookTarget);
  } else {
    // Camera Xoay 360° Orbit bám theo nhân vật
    const lookTargetX = inWC ? -20.2 : localPlayerState.x;
    const lookTargetY = inWC ? 0.9 : 0.92; // Góc nhìn cao vừa phải, nhìn bao quát toàn bộ sân quán
    const lookTargetZ = inWC ? -2.3 : localPlayerState.z;

    let drunkYawOffset = 0;
    let drunkPitchOffset = 0;
    if (!comfortMode && selfMember && selfMember.drunk_level > 40) {
      const drunkFactor = (selfMember.drunk_level - 40) / 60;
      drunkYawOffset = Math.sin(clock.getElapsedTime() * 1.6) * 0.12 * drunkFactor;
      drunkPitchOffset = Math.cos(clock.getElapsedTime() * 1.9) * 0.08 * drunkFactor;
    }

    const curYaw = inWC ? Math.sin(cameraYaw) * 0.35 : cameraYaw + drunkYawOffset;
    const curPitch = inWC ? Math.max(0.85, cameraPitch) : cameraPitch + drunkPitchOffset;
    const viewDistance = inWC ? Math.max(7, Math.min(13.5, cameraDistance * 1.35)) : cameraDistance;

    const horizontalDist = viewDistance * Math.cos(curPitch);
    let targetCamX = lookTargetX + horizontalDist * Math.sin(curYaw);
    if (inWC) targetCamX = Math.max(-22.3, Math.min(-18.4, targetCamX));
    const targetCamY = lookTargetY + viewDistance * Math.sin(curPitch);
    const targetCamZ = lookTargetZ + horizontalDist * Math.cos(curYaw);

    if (!cameraTargetReady) {
      camera.position.set(targetCamX, targetCamY, targetCamZ);
      cameraLookTarget.set(lookTargetX, lookTargetY, lookTargetZ);
      cameraTargetReady = true;
    }
    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 1 - Math.exp(-12 * delta));
    cameraLookTarget.lerp(new THREE.Vector3(lookTargetX, lookTargetY, lookTargetZ), 1 - Math.exp(-12 * delta));
    camera.lookAt(cameraLookTarget);
  }
  updateWallOcclusion(delta);

  // Nhân vật của mình đang ngồi: trượt vào đúng vị trí ghế rồi ngồi
  if (localCharacter && localPlayerState.is_sitting && (!selfMember || selfMember.status !== 'guc_nga')) {
    const kPos = 1 - Math.exp(-12 * delta);
    const m = localCharacter.mesh;
    m.position.x += (localPlayerState.x - m.position.x) * kPos;
    m.position.z += (localPlayerState.z - m.position.z) * kPos;
    let dy = localPlayerState.ry - m.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    m.rotation.y += dy * kPos;
    applySitPose(localCharacter, m, seatRootY(localPlayerState.seatRef), delta);
  }

  // Interpolate Remote Players
  remotePlayers.forEach((rp) => {
    const sitY = rp.sitting ? seatRootY(rp.seatRef) : null;
    const keepY = rp.mesh.position.y;
    rp.mesh.position.lerp(rp.targetPos, 0.2);
    if (rp.sitting) rp.mesh.position.y = keepY;
    let diff = rp.targetRot - rp.mesh.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    rp.mesh.rotation.y += diff * 0.2;

    if (rp.sitting) {
      applySitPose(rp.charParts, rp.mesh, sitY, delta);
    } else if (rp.is_walking) {
      rp.walkTime += delta * 12;
      rp.charParts.leftLeg.rotation.x = Math.sin(rp.walkTime) * 0.55;
      rp.charParts.rightLeg.rotation.x = -Math.sin(rp.walkTime) * 0.55;
      if (rp.charParts.leftArm) rp.charParts.leftArm.rotation.x = -Math.sin(rp.walkTime) * 0.6;
      rp.mesh.rotation.z = Math.sin(rp.walkTime * 0.5) * 0.05;
    } else {
      rp.charParts.leftLeg.rotation.x = 0;
      rp.charParts.rightLeg.rotation.x = 0;
      rp.mesh.rotation.z = 0;
      if (rp.charParts.leftArm) rp.charParts.leftArm.rotation.x *= 0.8;
    }
  });

  // Update Projected 2D HUD Tags
  updatePlayerHUDPositions();

  if (window.Features) Features.tick(delta, clock.elapsedTime);

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  if (!firstFrameDone) { firstFrameDone = true; PubLoader.firstFrame(); }
}
animate();

// Resize Window Event
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }
});

// ========================================================
// 12. User Action Buttons Event Listeners
// ========================================================
if (viewRiverBtn) {
  viewRiverBtn.addEventListener('click', toggleScenicView);
}

// 1 2 3 DÔÔÔ!
cheerBtn.addEventListener('click', () => {
  getAudioContext();
  // Nếu đã quá say xỉn (nồng độ cồn >= 85%) thì có 35% khả năng nôn ói tự phát khi cố ép dô
  if (selfMember && selfMember.drunk_level >= 85 && Math.random() < 0.35) {
    handleVomitAction();
    setTicker("🤮 Uống quá chén rồi, bạn nôn thốc nôn tháo cho chó ăn chè!");
    return;
  }
  sendAction({ action: 'cheer' });
});

// Ngồi / Đứng
sitStandBtn.addEventListener('click', () => {
  handleToggleSit();
});

// Gắp Mồi
eatSnackBtn.addEventListener('click', () => {
  pubDetails.react('snack', clock.elapsedTime);
  getAudioContext();
  sendAction({ action: 'eat_snack' });
});

// Xả Lũ / Đái Bậy (WC / Gốc Cây / Bờ Tường)
if (peeBtn) {
  peeBtn.addEventListener('click', () => {
    getAudioContext();
    handlePeeAction();
  });
}

// Nôn Ói / Cho Chó Ăn Chè / Huệ Ơi Huệ
if (vomitBtn) {
  vomitBtn.addEventListener('click', () => {
    getAudioContext();
    handleVomitAction();
  });
}

// Trà Đá Chanh Giải Rượu
soberBtn.addEventListener('click', () => {
  getAudioContext();
  sendAction({ action: 'sober_up' });
});

modalWakeBtn.addEventListener('click', () => {
  getAudioContext();
  sendAction({ action: 'sober_up' });
});

// Tính Tiền
billBtn.addEventListener('click', () => {
  getAudioContext();
  sendAction({ action: 'bill_roulette' });
});

// Quick Shouts Soundboard
const hudShoutsBarElem = document.getElementById('hudShoutsBar');
document.querySelectorAll('.shout-chip').forEach(chip => {
  chip.addEventListener('click', (e) => {
    getAudioContext();
    const text = e.target.getAttribute('data-shout');
    sendAction({ action: 'quick_shout', text });
    setChatOpen(false);
  });
});

// Mobile Cửa Miệng Toggle Drawer
const shoutToggleBtn = document.getElementById('shoutToggleBtn');
const closeShoutBtn = document.getElementById('closeShoutBtn');
if (shoutToggleBtn && hudShoutsBarElem) {
  shoutToggleBtn.addEventListener('click', () => {
    setChatOpen(!hudShoutsBarElem.classList.contains('is-open'));
  });
}
if (closeShoutBtn && hudShoutsBarElem) {
  closeShoutBtn.addEventListener('click', () => {
    setChatOpen(false);
  });
}

// Free text uses the existing multiplayer WebSocket and safe text nodes.
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatStatus = document.getElementById('chatStatus');
const chatSendBtn = document.getElementById('chatSendBtn');
let pendingChatText = null;
let chatSendTimer = null;
function setChatOpen(open) {
  hudShoutsBarElem.classList.toggle('is-open', open);
  document.body.classList.toggle('chat-open', open);
  shoutToggleBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    clearControls(); closeExtraActions();
    chatInput.focus(); updateChatConnection();
  } else {
    chatInput.blur();
  }
}
function updateChatConnection() {
  const online = ws && ws.readyState === WebSocket.OPEN;
  chatSendBtn.disabled = !online || pendingChatText !== null;
  chatStatus.textContent = online ? 'Cùng bàn cùng chuyện • tối đa 160 ký tự' : 'Chưa kết nối phòng chơi. Tin nhắn chưa được gửi.';
}
function finishChatSend() {
  clearTimeout(chatSendTimer);
  pendingChatText = null;
  chatSendBtn.disabled = !(ws && ws.readyState === WebSocket.OPEN);
}
function addLiveChatMessage(author, text, isSelf) {
  const stream = document.getElementById('liveChatStream');
  if (!stream) return;
  const pill = document.createElement('div');
  pill.className = 'live-chat-pill' + (isSelf ? ' is-self' : '');
  const authorSpan = document.createElement('strong');
  authorSpan.className = 'chat-author';
  authorSpan.textContent = author + ': ';
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-body';
  textSpan.textContent = text;
  pill.appendChild(authorSpan);
  pill.appendChild(textSpan);
  stream.appendChild(pill);
  while (stream.children.length > 5) {
    stream.removeChild(stream.firstChild);
  }
  setTimeout(() => {
    pill.classList.add('is-fade');
    setTimeout(() => { if (pill.parentNode) pill.remove(); }, 600);
  }, 12000);
}

function receiveChat(data) {
  getOrCreatePlayerHUD(data.member_id, data.member_name, data.member_id === clientId);
  show3DShoutBubble(data.member_id, data.text, Math.min(10000, 5000 + data.text.length * 40));
  chatStatus.textContent = `${data.member_name}: ${data.text}`;
  addLiveChatMessage(data.member_name, data.text, data.member_id === clientId);
  if (data.member_id === clientId && pendingChatText !== null) {
    if (chatInput.value.trim() === pendingChatText) chatInput.value = '';
    finishChatSend();
  }
}
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || pendingChatText !== null) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) { updateChatConnection(); return; }
  pendingChatText = text;
  chatSendBtn.disabled = true;
  chatStatus.textContent = 'Đang gửi…';
  chatSendTimer = setTimeout(() => { finishChatSend(); chatStatus.textContent = 'Chưa nhận được xác nhận. Bạn có thể gửi lại.'; }, 5000);
  sendAction({ action: 'chat', text });
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); setChatOpen(false); }
});
function placeChatAboveKeyboard() {
  const viewport = window.visualViewport;
  const offset = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
  document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', placeChatAboveKeyboard);
  visualViewport.addEventListener('scroll', placeChatAboveKeyboard);
}
updateChatConnection();

// Bấm trực tiếp vào thông báo tương tác trên màn hình cảm ứng
if (interactPrompt) {
  function handlePromptAction() {
    getAudioContext();
    const keyElem = interactPrompt.querySelector('.prompt-key');
    const key = keyElem ? keyElem.textContent.trim().toUpperCase() : 'E';
    if (key === 'E') {
      handleToggleSit();
    } else if (key === 'P') {
      handlePeeAction();
    } else if (key === 'F') {
      const nearPG = checkNearbyPG();
      if (nearPG) handleTalkPG(nearPG.brand);
    }
  }
  interactPrompt.addEventListener('click', handlePromptAction);
  interactPrompt.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePromptAction();
  });
}

// Mobile Đổi Tên
const mobEditNameBtn = document.getElementById('mobEditNameBtn');
if (mobEditNameBtn) {
  mobEditNameBtn.addEventListener('click', () => {
    nameInput.value = selfMember ? selfMember.name : '';
    nameModal.style.display = 'flex';
    nameInput.focus();
  });
}

// Rủ bạn nhậu (Copy link)
copyLinkBtn.addEventListener('click', () => {
  const inviteUrl = window.location.href;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    alert(`Đã sao chép link bàn nhậu!\n\nGửi link này cho bạn bè mở trình duyệt để cùng vào quán 3D:\n${inviteUrl}`);
  }).catch(() => {
    prompt('Sao chép link rủ bạn bè vào quán nhậu 3D:', inviteUrl);
  });
});

// Đổi Tên
editNameBtn.addEventListener('click', () => {
  nameInput.value = selfMember ? selfMember.name : '';
  nameModal.style.display = 'flex';
  nameInput.focus();
});

cancelNameBtn.addEventListener('click', () => {
  nameModal.style.display = 'none';
});

saveNameBtn.addEventListener('click', () => {
  const newName = nameInput.value.trim();
  if (newName) {
    sendAction({ action: 'change_name', name: newName });
  }
  nameModal.style.display = 'none';
});

nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveNameBtn.click();
});

// Audio Toggle
audioToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  audioToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
});

// Hướng dẫn điều khiển (Help Modal)
const helpBtn = document.getElementById('helpBtn');
const controlHintsModal = document.getElementById('controlHintsModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');
if (helpBtn && controlHintsModal) {
  helpBtn.addEventListener('click', () => {
    const isHidden = controlHintsModal.hasAttribute('hidden');
    if (isHidden) {
      controlHintsModal.removeAttribute('hidden');
      helpBtn.classList.add('is-active');
    } else {
      controlHintsModal.setAttribute('hidden', '');
      helpBtn.classList.remove('is-active');
    }
  });
}
if (closeHelpBtn && controlHintsModal) {
  closeHelpBtn.addEventListener('click', () => {
    controlHintsModal.setAttribute('hidden', '');
    if (helpBtn) helpBtn.classList.remove('is-active');
  });
}
window.addEventListener('keydown', (e) => {
  if (['input', 'textarea'].includes((e.target.tagName || '').toLowerCase())) return;
  if (e.key === 'h' || e.key === 'H' || e.key === '?') {
    if (controlHintsModal) {
      if (controlHintsModal.hasAttribute('hidden')) {
        controlHintsModal.removeAttribute('hidden');
        if (helpBtn) helpBtn.classList.add('is-active');
      } else {
        controlHintsModal.setAttribute('hidden', '');
        if (helpBtn) helpBtn.classList.remove('is-active');
      }
    }
  }
});

// Thu gọn / mở rộng Dock hành động
const dockToggleBtn = document.getElementById('dockToggleBtn');
const hudBottom = document.querySelector('.hud-bottom');
if (dockToggleBtn && hudBottom) {
  dockToggleBtn.addEventListener('click', () => {
    const isCollapsed = hudBottom.classList.toggle('is-collapsed');
    dockToggleBtn.textContent = isCollapsed ? '▲' : '▼';
    dockToggleBtn.title = isCollapsed ? 'Mở rộng bảng phím' : 'Thu gọn bảng phím';
  });
}

// Chào mừng người chơi vào quán (Live Chat banner)
setTimeout(() => {
  addLiveChatMessage('🍻 Quán Nhậu 3D', 'Chào mừng bạn đến quán! Dùng [W][A][S][D] đi lại, [Space] cụng ly, [E] ngồi ghế!', false);
}, 1200);

// Kết nối WebSocket ngay khi tải xong
PubLoader.step(70, 'Đang vào quán...');
if (window.Features) Features.start();
connectWebSocket();
// Chi tiết phụ chạy sau khung hình đầu tiên để vào quán nhanh nhất có thể.
PubLoader.afterFirstFrame(() => { loadHDREnvironment(); loadPBRDetailMaps(); });
document.addEventListener('pointerdown', loadCheerVoice, { once: true });

// Toàn màn hình (Android/desktop): ẩn thanh địa chỉ. iOS Safari không hỗ trợ API này nên nút tự ẩn;
// ở iOS dùng "Thêm vào Màn hình chính" (đã có manifest + meta) để chạy toàn màn hình.
(function setupFullscreenButton() {
  const btn = document.getElementById('fullscreenBtn');
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!btn || !request) return;
  document.body.classList.add('can-fullscreen');
  const isFull = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  btn.addEventListener('click', () => {
    if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else Promise.resolve(request.call(root, { navigationUI: 'hide' })).catch(() => {});
  });
  const sync = () => { btn.textContent = isFull() ? '🗗' : '⛶'; };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
})();

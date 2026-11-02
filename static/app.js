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
  const bufferSize = ctx.sampleRate * 1.6;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(850, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
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
  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(160, now);
  osc1.frequency.exponentialRampToValueAtTime(55, now + 0.35);
  gain1.gain.setValueAtTime(0.35, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.4);

  setTimeout(() => {
    if (!soundEnabled) return;
    const ctxNow = ctx.currentTime;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(220, ctxNow);
    osc2.frequency.linearRampToValueAtTime(45, ctxNow + 0.65);
    gain2.gain.setValueAtTime(0.4, ctxNow);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctxNow + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctxNow);
    osc2.stop(ctxNow + 0.7);
  }, 350);
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
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.shadowMap.enabled = !matchMedia('(pointer: coarse)').matches;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
canvasContainer.appendChild(renderer.domElement);

// Lighting: Cinematic Saigon Nightlife
const ambientLight = new THREE.AmbientLight(0x1e293b, 1.3);
scene.add(ambientLight);

// Warm Sodium Street Light (Vàng hổ phách đường phố Sài Gòn)
const streetLight = new THREE.DirectionalLight(0xffb366, 1.4);
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

// Neon Sign Point Lights (Tạo độ tương phản màu sắc Cyberpunk / Đêm Sài Gòn)
const neonCyan = new THREE.PointLight(0x06b6d4, 2.5, 18);
neonCyan.position.set(-6, 4.5, -4.5);
scene.add(neonCyan);

const neonMagenta = new THREE.PointLight(0xf43f5e, 2.8, 18);
neonMagenta.position.set(6, 4.5, -4.5);
scene.add(neonMagenta);

const neonAmber = new THREE.PointLight(0xf59e0b, 2.2, 15);
neonAmber.position.set(0, 3.8, 0);
scene.add(neonAmber);

// Moonlight over Saigon River
const moonLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
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
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = skinTone;
  ctx.fillRect(0, 0, 256, 256);

  if (isFemale) {
    // Feminine eyes with delicate eyeliner & lashes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(80, 115, 20, 14, -0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(80, 115, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(77, 111, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(80, 115, 20, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(176, 115, 20, 14, 0.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(176, 115, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(173, 111, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(176, 115, 20, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Eyebrows
    ctx.strokeStyle = '#332211';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(80, 100, 22, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(176, 100, 22, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();

    // Rosy Blush
    const blushL = ctx.createRadialGradient(65, 140, 2, 65, 140, 26);
    blushL.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
    blushL.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = blushL;
    ctx.fillRect(35, 115, 60, 50);

    const blushR = ctx.createRadialGradient(191, 140, 2, 191, 140, 26);
    blushR.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
    blushR.addColorStop(1, 'rgba(244, 63, 94, 0)');
    ctx.fillStyle = blushR;
    ctx.fillRect(161, 115, 60, 50);

    // Lips
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.ellipse(128, 172, 18, 7, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Male character: bold eyes, eyebrows, friendly pub smile
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(82, 115, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(82, 115, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(79, 112, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(174, 115, 18, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(174, 115, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(171, 112, 3, 0, Math.PI * 2);
    ctx.fill();

    // Bold eyebrows
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(60, 96);
    ctx.lineTo(104, 98);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(152, 98);
    ctx.lineTo(196, 96);
    ctx.stroke();

    // Cheek blush (drunk bợm nhậu)
    const blushL = ctx.createRadialGradient(70, 138, 2, 70, 138, 24);
    blushL.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    blushL.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = blushL;
    ctx.fillRect(45, 115, 50, 45);

    const blushR = ctx.createRadialGradient(186, 138, 2, 186, 138, 24);
    blushR.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    blushR.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = blushR;
    ctx.fillRect(161, 115, 50, 45);

    // Confident grin
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(128, 160, 22, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
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

// ========================================================
// 3. Procedural 3D Environment (Quán Nhậu Vỉa Hè & Bờ Sông Sài Gòn)
// ========================================================

// 1. Mặt đường nhựa ướt sũng phản chiếu neon (Wet Asphalt Pavement)
const streetGeo = new THREE.PlaneGeometry(70, 12);
const streetTex = createAsphaltTexture();
const streetMat = new THREE.MeshStandardMaterial({
  map: streetTex,
  color: 0x222733,
  roughness: 0.22,
  metalness: 0.28
});
const street = new THREE.Mesh(streetGeo, streetMat);
street.rotation.x = -Math.PI / 2;
street.position.set(0, 0, 7.5);
street.receiveShadow = true;
scene.add(street);

// Road White Stripes (Vạch kẻ tim đường phản quang)
for (let x = -28; x <= 28; x += 6) {
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.35 })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(x, 0.015, 7.5);
  scene.add(stripe);
}

// Zebra Crosswalk (Vạch qua đường sang công viên bờ sông)
for (let cz = 4.0; cz <= 11.0; cz += 1.1) {
  const zebra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  zebra.rotation.x = -Math.PI / 2;
  zebra.position.set(0, 0.018, cz);
  scene.add(zebra);
}

// 2. Vỉa hè quán nhậu lát gạch hoa đỏ xám Việt Nam (Tiled Sidewalk)
const sidewalkGeo = new THREE.BoxGeometry(36, 0.3, 8.8);
const sidewalkTex = createSidewalkTexture();
const sidewalkMat = new THREE.MeshStandardMaterial({
  map: sidewalkTex,
  roughness: 0.68,
  metalness: 0.08
});
const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
sidewalk.position.set(0, 0.15, -0.75);
sidewalk.receiveShadow = true;
scene.add(sidewalk);

// Curb stone (Gờ đá bó vỉa hè quán)
const curb = new THREE.Mesh(
  new THREE.BoxGeometry(36, 0.35, 0.45),
  new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 })
);
curb.position.set(0, 0.175, 3.65);
scene.add(curb);

// Xe máy dựng vỉa hè (Honda Wave chuẩn phong cách Sài Gòn)
function createParkedMotorbike(x, z, ry, bodyColor = 0xdc2626) {
  const bike = new THREE.Group();
  bike.position.set(x, 0.3, z);
  bike.rotation.y = ry;

  const frameMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.3 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });

  // 2 Bánh xe
  const wheel1 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 20), rubberMat);
  wheel1.position.set(0, 0.3, -0.55);
  bike.add(wheel1);

  const wheel2 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 20), rubberMat);
  wheel2.position.set(0, 0.3, 0.55);
  bike.add(wheel2);

  // Thân xe & Yếm xe
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.7), frameMat);
  body.position.set(0, 0.46, 0);
  bike.add(body);

  // Yên xe đen
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.55), seatMat);
  seat.position.set(0, 0.65, -0.08);
  bike.add(seat);

  // Ghi đông & Đèn pha trước
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.52, 8), chromeMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 0.8, 0.42);
  bike.add(handle);

  const headlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfef08a, emissiveIntensity: 0.6 })
  );
  headlight.position.set(0, 0.72, 0.58);
  bike.add(headlight);

  // Ống bô xả mạ chrome
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8), chromeMat);
  exhaust.rotation.x = Math.PI / 2 - 0.1;
  exhaust.position.set(0.18, 0.25, -0.22);
  bike.add(exhaust);

  scene.add(bike);
}
createParkedMotorbike(-13.8, 3.0, Math.PI / 3, 0xdc2626); // Xe Wave đỏ
createParkedMotorbike(14.2, 3.1, -Math.PI / 3.5, 0x2563eb); // Xe Wave xanh

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
    new THREE.MeshBasicMaterial({ map: tex })
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
  new THREE.MeshBasicMaterial({ map: signTex })
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
    emissiveIntensity: 0.9,
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
        const warmGlow = new THREE.PointLight(0xf59e0b, 1.1, 7.5);
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

// 7. Két bia xếp ở góc quán
function createBeerCrate(x, y, z, color) {
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.7, 0.8),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 })
  );
  crate.position.set(x, y, z);
  crate.castShadow = true;
  crate.receiveShadow = true;
  scene.add(crate);
}
createBeerCrate(-14.5, 0.65, -3.8, 0xe11d48);
createBeerCrate(-14.5, 1.35, -3.8, 0xe11d48);
createBeerCrate(-13.4, 0.65, -3.8, 0xf59e0b);

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

  // 6 Ghế nhựa Song Long chuẩn quán nhậu Việt Nam (Ghế đỏ & xanh xếp quanh bàn)
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

    const plasticMat = new THREE.MeshStandardMaterial({
      color: chairColor,
      roughness: 0.45,
      metalness: 0.05
    });

    // Mặt ghế nhựa bo góc có khe thoát nước
    const seatTop = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.68), plasticMat);
    seatTop.position.y = 0.48;
    chairGroup.add(seatTop);

    // Lỗ rỗng tròn đặc trưng ở giữa ghế nhựa Song Long
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16),
      new THREE.MeshBasicMaterial({ color: 0x0f172a })
    );
    hole.position.y = 0.485;
    chairGroup.add(hole);

    // 4 chân ghế nhựa vát nghiêng chịu lực
    for (let lx of [-0.25, 0.25]) {
      for (let lz of [-0.25, 0.25]) {
        const chairLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.48, 8), plasticMat);
        chairLeg.position.set(lx, 0.24, lz);
        chairGroup.add(chairLeg);
      }
    }

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
// 5. CÔNG VIÊN BỜ SÔNG & LAN CAN NGẮM CẢNH (RIVERSIDE PARK)
// ========================================================
function buildRiversidePark() {
  // Gờ vỉa hè phía công viên (Đón người qua đường)
  const parkCurb = new THREE.Mesh(
    new THREE.BoxGeometry(50, 0.35, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8896ab })
  );
  parkCurb.position.set(0, 0.175, 11.5);
  scene.add(parkCurb);

  // Thảm cỏ xanh mướt của công viên (Grass Lawn)
  const lawnGeo = new THREE.BoxGeometry(50, 0.3, 16.5);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x1e3a29, roughness: 0.9 });
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.position.set(0, 0.15, 20.0);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // Lối đi dạo ven sông lát đá hoa cương (Promenade Path)
  const pathGeo = new THREE.BoxGeometry(50, 0.32, 4.0);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.position.set(0, 0.16, 26.2);
  path.receiveShadow = true;
  scene.add(path);

  // Dãy Ghế Đá Công Viên Ngắm Sông Sài Gòn (Stone Park Benches)
  const benchPositions = [-12, -4, 4, 12];
  benchPositions.forEach((bx, idx) => {
    const benchGroup = new THREE.Group();
    benchGroup.position.set(bx, 0.32, 25.0);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.8 });
    // Mặt ghế đá
    const bSeat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.6), stoneMat);
    bSeat.position.y = 0.4;
    benchGroup.add(bSeat);

    // Tựa lưng ghế
    const bBack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.08), stoneMat);
    bBack.position.set(0, 0.65, -0.26);
    benchGroup.add(bBack);

    // 2 chân ghế đá
    const bLeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.5), stoneMat);
    bLeg1.position.set(-0.6, 0.2, 0);
    benchGroup.add(bLeg1);

    const bLeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.5), stoneMat);
    bLeg2.position.set(0.6, 0.2, 0);
    benchGroup.add(bLeg2);

    scene.add(benchGroup);

    // Ghế đá công viên cũng có thể ngồi chill được!
    chairSlots.push({
      tableId: 10 + idx, // Đánh số riêng cho ghế công viên
      seatId: 0,
      x: bx,
      z: 25.0,
      ry: 0, // Hướng mặt ra sông
      mesh: benchGroup
    });
  });

  // Cột Đèn Công Viên Cổ Điển (Vintage Park Lampposts)
  const lampPositions = [-18, -8, 2, 12, 20];
  lampPositions.forEach((lx) => {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(lx, 0.32, 27.5);

    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 8), ironMat);
    pole.position.y = 1.9;
    lampGroup.add(pole);

    // Lồng đèn phát ánh sáng vàng ấm
    const lantern = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.28),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    lantern.position.y = 3.9;
    lampGroup.add(lantern);

    const pLight = new THREE.PointLight(0xfef08a, 1.2, 10);
    pLight.position.set(0, 3.9, 0);
    lampGroup.add(pLight);

    scene.add(lampGroup);
  });

  // Hàng Cây Xanh & Cây Dừa Ven Sông (Palm & Shade Trees + Bồn Cây Xi Măng Đái Bậy)
  const treePositions = [-16, -10, -2, 8, 16, 22];
  treePositions.forEach((tx, i) => {
    const tz = 15.0 + (i % 2) * 3;
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx, 0.32, tz);

    // Bồn xi măng vuông quanh gốc cây đặc trưng vỉa hè
    const planter = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.35, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 })
    );
    planter.position.y = 0.15;
    treeGroup.add(planter);

    // Thân cây
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 3.5, 7), trunkMat);
    trunk.position.y = 1.75;
    treeGroup.add(trunk);

    // Tán lá
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    for (let l = 0; l < 3; l++) {
      const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 - l * 0.25), leafMat);
      leaves.position.y = 3.2 + l * 0.9;
      treeGroup.add(leaves);
    }
    scene.add(treeGroup);

    // Đăng ký vị trí đái bậy gốc cây
    peeSpots.push({
      type: "tree",
      name: "Gốc Cây Công Viên",
      x: tx,
      z: tz,
      radius: 2.3
    });
  });

  // Lan Can Bờ Sông (Riverside Railing at Z: 28.3)
  const railingGroup = new THREE.Group();
  railingGroup.position.set(0, 0.32, 28.3);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
  // Thanh tay vịn chạy dài
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(50, 0.08, 0.12), railMat);
  topBar.position.y = 1.0;
  railingGroup.add(topBar);

  const midBar = new THREE.Mesh(new THREE.BoxGeometry(50, 0.06, 0.08), railMat);
  midBar.position.y = 0.55;
  railingGroup.add(midBar);

  // Các cọc lan can
  for (let rx = -24; rx <= 24; rx += 1.5) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), railMat);
    post.position.set(rx, 0.5, 0);
    railingGroup.add(post);
  }
  scene.add(railingGroup);
}
buildRiversidePark();

// Đăng ký các điểm đái bậy cố định
peeSpots.push(
  { type: "wc", name: "WC Quán Nhậu", x: -20.5, z: -2.8, radius: 3.0 },
  { type: "wall", name: "Bờ Tường Hẻm (Biển Cấm Đái)", x: -15.8, z: 1.5, radius: 2.2 }
);

// ========================================================
// 5.5. CẢNH VẬT ĐƯỜNG PHỐ SÀI GÒN (KARAOKE, MASSAGE, WC, CỘT ĐIỆN)
// ========================================================
const pubDetails = createPubDetails(scene);

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

  const kSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(kCanvas) })
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

  const mSign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mCanvas) })
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
  createMotorbike(-10.2, 2.6, 0.35, 0x991b1b); // Honda Dream mận chín
  createMotorbike(10.5, 2.6, -0.25, 0x1d4ed8); // Honda Wave xanh dương

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
// 5.5. CÁC EM GÁI TIẾP THỊ BIA (PG BIA 3D CHIBI)
// ========================================================
const pgGirls = []; // { id, name, brand, mesh, tray, tagElem, tagBubble, x, z }

function createPGBiaCharacter(id, name, brand, x, z, ry) {
  const root = new THREE.Group();
  const isTiger = brand === 'tiger';

  const dressColor = isTiger ? 0x1d4ed8 : 0x15803d;
  const sashColor = isTiger ? 0xf1f5f9 : 0xffffff;

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
  const faceTex = createFaceTexture(true, skinTone, isTiger ? '#2563eb' : '#15803d');
  const headMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), headMat);
  head.scale.set(0.9, 1.1, 0.95);
  head.position.y = 1.25;
  head.castShadow = true;
  root.add(head);

  // Styled Hair (Thảo My: Ponytail cá tính; Ngọc Trinh: Tóc uốn sóng dài)
  const hairColor = isTiger ? 0x271914 : 0x18181b;
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
  } else {
    const hairFlow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.6, 10), hairMat);
    hairFlow.position.set(0, 0.95, -0.16);
    hairFlow.rotation.x = 0.12;
    root.add(hairFlow);
  }

  // Slim legs & Stylish Boots (Đôi chân thon thả & Bốt cao cổ)
  const bootMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });

  const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 10), skinMat);
  leftLeg.position.set(-0.1, 0.26, 0);
  root.add(leftLeg);

  const leftBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.32, 10), bootMat);
  leftBoot.position.set(-0.1, 0.16, 0.02);
  root.add(leftBoot);

  const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 10), skinMat);
  rightLeg.position.set(0.1, 0.26, 0);
  root.add(rightLeg);

  const rightBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.32, 10), bootMat);
  rightBoot.position.set(0.1, 0.16, 0.02);
  root.add(rightBoot);

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
    <div class="tag-name" style="background: ${isTiger ? '#1e40af' : '#15803d'}; border-color: #fde047; color: #fff; font-weight: 800; box-shadow: 0 0 12px ${isTiger ? 'rgba(30,64,175,0.7)' : 'rgba(21,128,61,0.7)'};">💃 ${name}</div>
  `;
  hudOverlay.appendChild(pgTag);

  pgGirls.push({
    id,
    name,
    brand,
    mesh: root,
    tray,
    tagElem: pgTag,
    tagBubble: pgTag.querySelector('.tag-bubble'),
    x, z
  });
}

function buildPGBiaGirls() {
  // 1. Em Thảo My (PG Tiger) - Đứng cạnh bàn 1
  createPGBiaCharacter('pg_tiger', 'Thảo My (PG Tiger)', 'tiger', 3.4, 2.0, -Math.PI / 3);

  // 2. Em Ngọc Trinh (PG Heineken) - Đứng cạnh lối vào quán gần xe nước mía
  createPGBiaCharacter('pg_ken', 'Ngọc Trinh (PG Heineken)', 'heineken', -3.6, 3.2, Math.PI / 4);
}
buildPGBiaGirls();

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
buildSaigonRiver();

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
buildLandmark81AndSkyline();

// ========================================================
// 8. 3D Character Avatar Factory (Chibi Bợm Nhậu Má Hồng Y Hệt Hình)
// ========================================================
function createCharacter3D(colorHex) {
  const root = new THREE.Group();

  // Torso: Stylized human torso with fashionable graphic tee or polo
  const shirtColor = colorHex || 0xf97316;
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.65 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.72, 16), shirtMat);
  torso.position.y = 0.78;
  torso.castShadow = true;
  root.add(torso);

  // Collar / Neck trim
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.12, 0);
  root.add(collar);

  // Smooth neck
  const skinTone = '#ffdfc4';
  const skinMat = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.55 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 12), skinMat);
  neck.position.y = 1.18;
  root.add(neck);

  // Head: Scaled smooth sphere with realistic face texture
  const faceTex = createFaceTexture(false, skinTone);
  const headMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.55 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 20), headMat);
  head.scale.set(0.92, 1.1, 0.98);
  head.position.y = 1.48;
  head.castShadow = true;
  root.add(head);

  // Styled 3D Hair (Modern textured fade with layered volume)
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.85 });
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), hairMat);
  hairTop.scale.set(0.96, 0.6, 1.05);
  hairTop.position.set(0, 1.66, -0.04);
  root.add(hairTop);

  // Backward Cap / Snapback
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 16), capMat);
  cap.position.set(0, 1.66, 0);
  root.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.28), capMat);
  visor.position.set(0, 1.62, -0.34);
  visor.rotation.x = -0.15;
  root.add(visor);

  // Shoulders & Arms
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.36, 1.02, 0);
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 10), skinMat);
  leftArm.position.y = -0.22;
  leftArmGroup.add(leftArm);
  root.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.36, 1.02, 0);
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.5, 10), skinMat);
  rightArm.position.y = -0.22;
  rightArmGroup.add(rightArm);
  root.add(rightArmGroup);

  // Realistic Beer Mug (Ly bia thủy tinh quai dày sủi bọt)
  const beerMug = new THREE.Group();
  beerMug.position.set(0.36, 0.85, 0.32);

  // Thick glass mug body
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.82,
    roughness: 0.1,
    metalness: 0.15
  });
  const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.28, 14), glassMat);
  beerMug.add(mugBody);

  // Golden beer liquid inside
  const beerLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.085, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2 })
  );
  beerLiquid.position.y = -0.02;
  beerMug.add(beerLiquid);

  // Frothy white beer head
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.11, 0.09, 14), foamMat);
  foam.position.y = 0.12;
  beerMug.add(foam);

  // Mug handle
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 0.1 });
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 12), handleMat);
  handle.position.set(0.12, 0, 0);
  handle.rotation.y = Math.PI / 2;
  beerMug.add(handle);

  root.add(beerMug);

  // Denim Jeans (Quần jean xanh wash)
  const denimMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.85 });
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.16, 0.48, 0);

  const leftLegPants = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.48, 12), denimMat);
  leftLegPants.position.y = -0.2;
  leftLegPants.castShadow = true;
  leftLegGroup.add(leftLegPants);

  // Sneaker (Giày sneaker hiện đại đế trắng)
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.28), shoeMat);
  leftShoe.position.set(0, -0.42, 0.06);
  leftLegGroup.add(leftShoe);
  root.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.16, 0.48, 0);

  const rightLegPants = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.48, 12), denimMat);
  rightLegPants.position.y = -0.2;
  rightLegPants.castShadow = true;
  rightLegGroup.add(rightLegPants);

  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.28), shoeMat);
  rightShoe.position.set(0, -0.42, 0.06);
  rightLegGroup.add(rightShoe);
  root.add(rightLegGroup);

  return {
    mesh: root,
    torso,
    head,
    beerMug,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup
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
let cameraPitch = 0.48;
let cameraDistance = mobileControls ? 8.2 : 6.8;
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
  cameraDistance = Math.max(3.8, Math.min(13.5, distance));
}
function pointerSpan() {
  const [a, b] = [...cameraPointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
canvasContainer.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
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
  cameraPitch = 0.48;
  cameraDistance = mobileControls ? 8.2 : 6.8;
});
// Secondary actions remain available in a compact mobile drawer.
const extraActions = document.createElement('div');
extraActions.id = 'extraActions';
extraActions.className = 'extra-actions';
const actionsGroup = document.querySelector('.hud-actions-group');
actionsGroup.appendChild(extraActions);
for (const button of [eatSnackBtn, peeBtn, vomitBtn, viewRiverBtn, soberBtn, billBtn]) extraActions.appendChild(button);
const moreActionsBtn = document.getElementById('moreActionsBtn');
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

  if (e.key === 'e' || e.key === 'E') {
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

function handleToggleSit() {
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

function spawnPeeStream(startX, startY, startZ, rotY) {
  const dirX = Math.sin(rotY);
  const dirZ = Math.cos(rotY);

  for (let i = 0; i < 35; i++) {
    const pMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    pMesh.position.set(startX + dirX * 0.35, startY + 0.65, startZ + dirZ * 0.35);
    scene.add(pMesh);

    peeParticles.push({
      x: startX + dirX * 0.35,
      y: startY + 0.65,
      z: startZ + dirZ * 0.35,
      vx: dirX * (2.0 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.25,
      vy: 0.35 + Math.random() * 0.25,
      vz: dirZ * (2.0 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.25,
      mesh: pMesh,
      life: 28
    });
  }
}

function updatePeeParticles(delta) {
  for (let i = peeParticles.length - 1; i >= 0; i--) {
    const p = peeParticles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.z += p.vz * delta;
    p.vy -= 9.8 * delta; // Trọng lực
    p.life--;

    if (p.y <= 0.32 || p.life <= 0) {
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
    spawnPeeStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry);
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

  const cuteQuotes = brand === 'tiger'
    ? ["Uống Tiger Bạc mát rượi nha anh! 🍺", "Em châm đầy ly đá cho anh nè~ 🧊", "Một hai ba dô cạn ly nha anh trai! 🍻"]
    : ["Ken ướp lạnh tuyệt hảo cho anh đây ạ! 🍺", "Anh đẹp trai phong độ quá, dô hết mình nha! ✨", "Uống không say không về cùng em nha anh! 💃"];
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
          if (chair) {
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
        }
        setTicker(data.message);
        break;

      case 'cheer_event':
        totalCheersDisplay.textContent = data.total_cheers;
        playClinkSound();
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
    is_walking: false
  });
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

  const initialY = mug.position.y;
  let t = 0;
  const cheerInterval = setInterval(() => {
    t += 0.2;
    mug.position.y = initialY + Math.sin(t * Math.PI) * 0.25;
    mug.rotation.z = Math.sin(t * Math.PI) * 0.4;
    if (t >= 1) {
      clearInterval(cheerInterval);
      mug.position.y = initialY;
      mug.rotation.z = 0;
    }
  }, 30);
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
    const inputMag = Math.min(1.0, Math.hypot(inputForward, inputRight));

    if (inputMag > 0.05) {
      moveX = forwardX * inputForward + rightX * inputRight;
      moveZ = forwardZ * inputForward + rightZ * inputRight;
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

      // Giới hạn trong khuôn viên: từ quán vỉa hè, qua đường, đến tận bờ sông Sài Gòn
      localPlayerState.x = Math.max(-23, Math.min(23, localPlayerState.x));
      localPlayerState.z = Math.max(-4.5, Math.min(27.6, localPlayerState.z));

      // Nhân vật xoay mặt theo hướng đang di chuyển
      localPlayerState.ry = Math.atan2(moveX, moveZ);
      localPlayerState.is_walking = true;
      localPlayerState.walkTime += delta * 12;

      // Leg Swing Animation
      localCharacter.leftLeg.rotation.x = Math.sin(localPlayerState.walkTime) * 0.6;
      localCharacter.rightLeg.rotation.x = -Math.sin(localPlayerState.walkTime) * 0.6;
    } else {
      localPlayerState.is_walking = false;
      localCharacter.leftLeg.rotation.x = 0;
      localCharacter.rightLeg.rotation.x = 0;
    }

    localCharacter.mesh.position.set(localPlayerState.x, 0.3, localPlayerState.z);
    localCharacter.mesh.rotation.y = localPlayerState.ry;

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
      interactPrompt.querySelector('.prompt-text').textContent = isBench ? "Ngồi ghế đá ngắm sông Sài Gòn" : "Kéo ghế ngồi vào bàn nhậu";
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

  // Animation Các Em Gái Tiếp Thị Bia (PG Bia thở, đung đưa duyên dáng)
  const elapsedPG = clock.getElapsedTime();
  pgGirls.forEach(pg => {
    pg.mesh.position.y = 0.3 + Math.sin(elapsedPG * 2.5 + (pg.brand === 'tiger' ? 0 : 1.5)) * 0.015;
    if (pg.tray) {
      pg.tray.rotation.y = Math.sin(elapsedPG * 1.5) * 0.05;
    }
  });

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
    const lookTargetY = inWC ? 0.9 : 1.35;
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

  // Interpolate Remote Players
  remotePlayers.forEach((rp) => {
    rp.mesh.position.lerp(rp.targetPos, 0.2);
    let diff = rp.targetRot - rp.mesh.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    rp.mesh.rotation.y += diff * 0.2;

    if (rp.is_walking) {
      rp.walkTime += delta * 12;
      rp.charParts.leftLeg.rotation.x = Math.sin(rp.walkTime) * 0.6;
      rp.charParts.rightLeg.rotation.x = -Math.sin(rp.walkTime) * 0.6;
    } else {
      rp.charParts.leftLeg.rotation.x = 0;
      rp.charParts.rightLeg.rotation.x = 0;
    }
  });

  // Update Projected 2D HUD Tags
  updatePlayerHUDPositions();

  renderer.render(scene, camera);
}
animate();

// Resize Window Event
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
function receiveChat(data) {
  getOrCreatePlayerHUD(data.member_id, data.member_name, data.member_id === clientId);
  show3DShoutBubble(data.member_id, data.text, Math.min(10000, 5000 + data.text.length * 40));
  chatStatus.textContent = `${data.member_name}: ${data.text}`;
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

// Kết nối WebSocket ngay khi tải xong
connectWebSocket();

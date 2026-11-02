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
const billBtn = document.getElementById('billBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const audioToggleBtn = document.getElementById('audioToggleBtn');
const viewRiverBtn = document.getElementById('viewRiverBtn');
const viewRiverText = document.getElementById('viewRiverText');

// Danh sách các điểm đái bậy / WC (Khai báo sớm để dùng ở mọi hàm)
const peeSpots = [];

let isScenicView = false;
function toggleScenicView() {
  isScenicView = !isScenicView;
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

// ========================================================
// 2. Three.js 3D Scene Initialization
// ========================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060911);
scene.fog = new THREE.FogExp2(0x060911, 0.015);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 350);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasContainer.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x26334d, 1.4);
scene.add(ambientLight);

// Warm Streetlight
const streetLight = new THREE.DirectionalLight(0xffe29a, 1.3);
streetLight.position.set(5, 14, 8);
streetLight.castShadow = true;
streetLight.shadow.mapSize.width = 1024;
streetLight.shadow.mapSize.height = 1024;
streetLight.shadow.camera.near = 0.5;
streetLight.shadow.camera.far = 45;
streetLight.shadow.camera.left = -20;
streetLight.shadow.camera.right = 20;
streetLight.shadow.camera.top = 20;
streetLight.shadow.camera.bottom = -20;
scene.add(streetLight);

// Neon Sign Point Lights
const neonLightRed = new THREE.PointLight(0xff2244, 2.2, 16);
neonLightRed.position.set(0, 5, -5);
scene.add(neonLightRed);

const neonLightYellow = new THREE.PointLight(0xffb700, 1.8, 14);
neonLightYellow.position.set(0, 4, 0);
scene.add(neonLightYellow);

// Moonlight over Saigon River
const moonLight = new THREE.DirectionalLight(0x60a5fa, 0.8);
moonLight.position.set(20, 30, 60);
scene.add(moonLight);

// ========================================================
// 3. Procedural 3D Environment (Quán Nhậu Vỉa Hè & Bờ Sông Sài Gòn)
// ========================================================

// 1. Mặt đường nhựa (Street Asphalt with Crosswalk)
const streetGeo = new THREE.PlaneGeometry(60, 10);
const streetMat = new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.85 });
const street = new THREE.Mesh(streetGeo, streetMat);
street.rotation.x = -Math.PI / 2;
street.position.set(0, 0, 7.5);
street.receiveShadow = true;
scene.add(street);

// Road White Stripes (Vạch kẻ tim đường)
for (let x = -24; x <= 24; x += 6) {
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(x, 0.015, 7.5);
  scene.add(stripe);
}

// Zebra Crosswalk (Vạch qua đường sang công viên bờ sông)
for (let cz = 4.2; cz <= 10.8; cz += 1.1) {
  const zebra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  zebra.rotation.x = -Math.PI / 2;
  zebra.position.set(0, 0.018, cz);
  scene.add(zebra);
}

// 2. Vỉa hè quán nhậu (Elevated Sidewalk)
const sidewalkGeo = new THREE.BoxGeometry(34, 0.3, 8.5);
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x5a6578, roughness: 0.8 });
const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
sidewalk.position.set(0, 0.15, -0.75);
sidewalk.receiveShadow = true;
scene.add(sidewalk);

// Curb stone (Gờ vỉa hè quán)
const curb = new THREE.Mesh(
  new THREE.BoxGeometry(34, 0.35, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x8896ab })
);
curb.position.set(0, 0.175, 3.5);
scene.add(curb);

// 3. Tường gạch rêu phong phía sau
const wallGeo = new THREE.BoxGeometry(34, 7.5, 0.6);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.9 });
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.set(0, 3.75, -5.2);
wall.receiveShadow = true;
scene.add(wall);

// Tường bên trái (Left Wall) có biển Neon Ly Bia
const leftWall = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 7.5, 9.5),
  new THREE.MeshStandardMaterial({ color: 0x242d3d, roughness: 0.9 })
);
leftWall.position.set(-16.7, 3.75, -0.75);
leftWall.receiveShadow = true;
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

// 6. Dây Đèn Tròn Nhiều Màu Giăng Quanh Quán (Hạt lựu vàng, đỏ, xanh)
const bulbColors = [0xffd000, 0xff3344, 0x00ff88, 0x00d2ff, 0xff9900];
for (let i = -14; i <= 14; i += 1.8) {
  const wirePoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: bulbColors[Math.abs(Math.round(i)) % bulbColors.length] })
  );
  const sagY = 5.0 - 0.35 * Math.sin((i + 14) / 28 * Math.PI);
  wirePoint.position.set(i, sagY, -1.8);
  scene.add(wirePoint);
}

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

  // Chân bàn đen/inox
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
  );
  leg.position.y = 0.4;
  tableGroup.add(leg);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 })
  );
  base.position.y = 0.025;
  tableGroup.add(base);

  // Mặt bàn đen bóng (Như trong hình chụp)
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.8, 0.06, 32),
    new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6, roughness: 0.2 })
  );
  top.position.y = 0.82;
  top.receiveShadow = true;
  tableGroup.add(top);

  // MÓN ĂN TRÊN BÀN THEO TỪNG BÀN (RẤT THỊNH SOẠN)
  if (tableId === 0) {
    // BÀN 1 (BÊN TRÁI): GÀ NƯỚNG NGUYÊN CON VỚI ĐÙI GÀ & XƯƠNG TRẮNG TO TƯỚNG
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.8, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    plate.position.set(0, 0.86, 0);
    tableGroup.add(plate);

    // Thân gà nướng màu vàng ruộm
    const chickenBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 })
    );
    chickenBody.position.set(0, 1.08, 0);
    tableGroup.add(chickenBody);

    // 2 đùi gà vàng nâu
    const leg1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
    );
    leg1.rotation.z = 0.7;
    leg1.position.set(-0.35, 1.05, 0.2);
    tableGroup.add(leg1);

    const leg2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 })
    );
    leg2.rotation.z = -0.7;
    leg2.position.set(0.35, 1.05, 0.2);
    tableGroup.add(leg2);

    // Xương gà màu trắng lòi ra
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), boneMat);
    bone.rotation.z = 1.1;
    bone.position.set(0.5, 1.15, -0.15);
    tableGroup.add(bone);

    // Xúc xích & nem chua trên bàn
    const sausageMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const sausage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), sausageMat);
      sausage.rotation.y = i * 0.8;
      sausage.position.set(-0.5 + i * 0.2, 0.88, -0.4);
      tableGroup.add(sausage);
    }
  } else {
    // BÀN 2 (BÊN PHẢI): HEO QUAY NGUYÊN CON NGẬM QUẢ TÁO ĐỎ (Y HỆT HÌNH CHỤP)
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 0.95, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    plate.position.set(0, 0.86, 0);
    tableGroup.add(plate);

    // Thân heo quay màu hồng cam nướng vàng
    const pigMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.6 }); // Màu hồng da heo quay
    const pigBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), pigMat);
    pigBody.position.set(0.1, 1.12, 0);
    tableGroup.add(pigBody);

    // Đầu heo
    const pigHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), pigMat);
    pigHead.position.set(-0.45, 1.15, 0);
    tableGroup.add(pigHead);

    // Mõm heo
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.24), pigMat);
    snout.position.set(-0.7, 1.08, 0);
    tableGroup.add(snout);

    // Quả táo đỏ ngậm trong miệng
    const apple = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    apple.position.set(-0.82, 1.05, 0);
    tableGroup.add(apple);

    // 2 Tai heo
    const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), pigMat);
    ear1.position.set(-0.42, 1.4, 0.18);
    tableGroup.add(ear1);
    const ear2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), pigMat);
    ear2.position.set(-0.42, 1.4, -0.18);
    tableGroup.add(ear2);

    // 4 chân heo
    for (let px of [-0.2, 0.4]) {
      for (let pz of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.25, 0.14), pigMat);
        leg.position.set(px, 0.95, pz);
        tableGroup.add(leg);
      }
    }
  }

  // Xô đá & lon bia trên bàn
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.38, 12),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 })
  );
  bucket.position.set(0.8, 1.02, 0.4);
  tableGroup.add(bucket);

  scene.add(tableGroup);
  pubTables.push({ id: tableId, x: posX, z: posZ, group: tableGroup });

  // 6 Ghế nhựa xếp vòng tròn quanh bàn có lỗ vuông ở giữa (Ghế nhựa đỏ & xanh)
  const totalSeats = 6;
  const radius = 2.1;

  for (let s = 0; s < totalSeats; s++) {
    const angle = (s * Math.PI * 2) / totalSeats;
    const chairX = posX + Math.cos(angle) * radius;
    const chairZ = posZ + Math.sin(angle) * radius;

    const chairColor = s % 2 === 0 ? 0xef4444 : 0x2563eb;
    const chairGroup = new THREE.Group();
    chairGroup.position.set(chairX, 0.3, chairZ);
    chairGroup.lookAt(posX, 0.3, posZ);

    // Mặt ghế nhựa có lỗ rỗng
    const seatTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.06, 0.65),
      new THREE.MeshStandardMaterial({ color: chairColor, roughness: 0.5 })
    );
    seatTop.position.y = 0.48;
    chairGroup.add(seatTop);

    // Lỗ vuông đen ở giữa ghế
    const hole = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.07, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x0f172a })
    );
    hole.position.y = 0.485;
    chairGroup.add(hole);

    // 4 chân ghế nhựa
    for (let lx of [-0.24, 0.24]) {
      for (let lz of [-0.24, 0.24]) {
        const chairLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.48, 8),
          new THREE.MeshStandardMaterial({ color: chairColor, roughness: 0.5 })
        );
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
  { type: "wc", name: "WC Quán Nhậu", x: -15.8, z: -3.2, radius: 2.2 },
  { type: "wall", name: "Bờ Tường Hẻm (Biển Cấm Đái)", x: -15.8, z: 1.5, radius: 2.2 }
);

// ========================================================
// 5.5. CẢNH VẬT ĐƯỜNG PHỐ SÀI GÒN (KARAOKE, MASSAGE, WC, CỘT ĐIỆN)
// ========================================================
function buildSaigonStreetScenery() {
  // 1. Cửa WC Quán Nhậu
  const wcDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 2.3, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 })
  );
  wcDoor.position.set(-16.35, 1.45, -3.2);
  scene.add(wcDoor);

  // Biển hiệu WC phát sáng
  const wcCanvas = document.createElement('canvas');
  wcCanvas.width = 256;
  wcCanvas.height = 128;
  const wctx = wcCanvas.getContext('2d');
  wctx.fillStyle = '#0369a1';
  wctx.fillRect(0, 0, 256, 128);
  wctx.strokeStyle = '#ffffff';
  wctx.lineWidth = 8;
  wctx.strokeRect(6, 6, 244, 116);
  wctx.font = 'bold 50px sans-serif';
  wctx.fillStyle = '#ffffff';
  wctx.textAlign = 'center';
  wctx.fillText('WC 🚹🚺', 128, 80);

  const wcSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wcCanvas) })
  );
  wcSign.position.set(-16.3, 2.9, -3.2);
  wcSign.rotation.y = Math.PI / 2;
  scene.add(wcSign);

  const wcLight = new THREE.PointLight(0x38bdf8, 1.3, 8);
  wcLight.position.set(-15.8, 2.8, -3.2);
  scene.add(wcLight);

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
  mBuilding.position.set(-24, 5.5, -1.0);
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
  mSign.position.set(-24, 6.8, 4.05);
  scene.add(mSign);

  const mLight = new THREE.PointLight(0x10b981, 1.8, 15);
  mLight.position.set(-24, 5.0, 4.5);
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
  for (let bi = -2; bi <= 2; bi += 0.8) {
    const bLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: bulbColors[Math.abs(Math.round(bi * 3)) % bulbColors.length] })
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
      opacity: 0.85
    });
    const winFront = new THREE.Mesh(winGeo, winMat);
    winFront.position.set(cfg.x, cfg.h / 2, cfg.d / 2 + 0.05);
    skylineGroup.add(winFront);
  });

  // TÒA THÁP BIỂU TƯỢNG: LANDMARK 81 (Vươn cao sừng sững 52 units)
  const landmarkGroup = new THREE.Group();
  landmarkGroup.position.set(6, 0, 0);

  // Kiến trúc bó tre giật cấp đặc trưng của Landmark 81 (Stepped Bamboo Bundle)
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.85,
    roughness: 0.2
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
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 })
  );
  spire.position.y = 54.25;
  landmarkGroup.add(spire);

  // Đèn tín hiệu đỉnh tháp đỏ rực xuyên màn đêm
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff0044 })
  );
  beacon.position.y = 58.5;
  landmarkGroup.add(beacon);

  landmarkSpireLight = new THREE.PointLight(0xff0044, 2.5, 25);
  landmarkSpireLight.position.set(0, 58.5, 0);
  landmarkGroup.add(landmarkSpireLight);

  // Dải đèn LED mặt ngoài Landmark 81 (Đổi màu lung linh về đêm)
  const ledColors = [0x00d2ff, 0x3b82f6, 0xa855f7, 0xf43f5e];
  for (let lx of [-5.5, -2.8, 0, 2.8, 5.5]) {
    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 45, 0.12),
      new THREE.MeshBasicMaterial({ color: ledColors[Math.abs(Math.round(lx)) % ledColors.length] })
    );
    ledStrip.position.set(lx, 23, 4.6);
    landmarkGroup.add(ledStrip);
    landmarkLEDs.push(ledStrip);
  }

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
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(l81Canvas), transparent: true })
  );
  l81Sign.position.set(0, 16.5, 4.6);
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

  // Áo thun / Polo cam (như hình chụp)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.72, 0.42), bodyMat);
  torso.position.y = 0.75;
  torso.castShadow = true;
  root.add(torso);

  // Đầu Chibi hình hộp
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.52), skinMat);
  head.position.y = 1.37;
  head.castShadow = true;
  root.add(head);

  // MÁ HỒNG SAY RƯỢU [>_<] (Đặc điểm nhận dạng cực bựa trong hình chụp)
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
  const leftBlush = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), blushMat);
  leftBlush.position.set(-0.16, 1.3, 0.27);
  root.add(leftBlush);

  const rightBlush = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), blushMat);
  rightBlush.position.set(0.16, 1.3, 0.27);
  root.add(rightBlush);

  // Mũ lưỡi trai đen có vành phẳng phía trước
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.58), hatMat);
  hat.position.y = 1.63;
  root.add(hat);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.32), hatMat);
  visor.position.set(0, 1.58, 0.38);
  root.add(visor);

  // Mắt nhắm tít cười híp mắt vì say rượu
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.02), eyeMat);
  leftEye.position.set(-0.15, 1.4, 0.27);
  root.add(leftEye);

  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.02), eyeMat);
  rightEye.position.set(0.15, 1.4, 0.27);
  root.add(rightEye);

  // Ly bia cầm trên tay phải có bọt trắng trào ra và rơi giọt vàng xuống đất
  const beerMug = new THREE.Group();
  beerMug.position.set(0.44, 0.8, 0.28);
  const mugGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.1, 0.26, 10),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 })
  );
  beerMug.add(mugGlass);

  const beerFoam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.12, 0.08, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  beerFoam.position.y = 0.14;
  beerMug.add(beerFoam);

  // Giọt bia vàng chảy tràn (droplets)
  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b })
  );
  drop.position.set(0.1, -0.05, 0);
  beerMug.add(drop);

  root.add(beerMug);

  // Quần jeans xanh đậm
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.22), pantsMat);
  leftLeg.position.set(-0.17, 0.225, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.22), pantsMat);
  rightLeg.position.set(0.17, 0.225, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  return {
    mesh: root,
    torso,
    head,
    beerMug,
    leftLeg,
    rightLeg
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

// Orbital Camera State (Xoay 360 độ quanh nhân vật)
let cameraYaw = 0;         // Xoay ngang (radians)
let cameraPitch = 0.38;    // Góc ngẩng nhìn xuống (radians)
let cameraDistance = 6.8;  // Khoảng cách camera tới nhân vật
let isDraggingCamera = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Chuột kéo xoay camera
canvasContainer.addEventListener('mousedown', (e) => {
  isDraggingCamera = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDraggingCamera) return;
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  cameraYaw -= deltaX * 0.0055;
  cameraPitch += deltaY * 0.0045;

  // Giới hạn góc ngẩng để không lộn nhào hoặc nhìn xuyên lòng đất
  cameraPitch = Math.max(0.08, Math.min(Math.PI / 2.25, cameraPitch));
});

window.addEventListener('mouseup', () => {
  isDraggingCamera = false;
});

// Cuộn chuột phóng to / thu nhỏ
window.addEventListener('wheel', (e) => {
  cameraDistance = Math.max(3.2, Math.min(13.5, cameraDistance + e.deltaY * 0.006));
}, { passive: true });

// ========================================================
// Touch Drag để xoay camera trên điện thoại / tablet
// ========================================================
let lastTouchX = 0;
let lastTouchY = 0;
let isTouchDragging = false;
let cameraTouchId = null;

canvasContainer.addEventListener('touchstart', (e) => {
  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    // Không xoay camera nếu chạm vào khu vực Joystick bên trái (45% chiều rộng và 60% chiều cao phía dưới)
    if (touch.clientX < window.innerWidth * 0.45 && touch.clientY > window.innerHeight * 0.38) continue;
    // Không xoay camera nếu chạm vào các nút điều khiển kỹ năng
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target && (target.closest('.hud-actions-group') || target.closest('.hud-top') || target.closest('.hud-shouts-bar') || target.closest('.mob-shout-toggle') || target.closest('.modal-card') || target.closest('.interact-prompt'))) continue;

    if (!isTouchDragging) {
      isTouchDragging = true;
      cameraTouchId = touch.identifier;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      break;
    }
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!isTouchDragging) return;
  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    if (touch.identifier === cameraTouchId) {
      const deltaX = touch.clientX - lastTouchX;
      const deltaY = touch.clientY - lastTouchY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;

      cameraYaw -= deltaX * 0.0065;
      cameraPitch += deltaY * 0.005;
      cameraPitch = Math.max(0.08, Math.min(Math.PI / 2.25, cameraPitch));
      break;
    }
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (!isTouchDragging) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === cameraTouchId) {
      isTouchDragging = false;
      cameraTouchId = null;
      break;
    }
  }
});

// ========================================================
// Virtual Analog Joystick (Phong cách Liên Quân Mobile 360°)
// ========================================================
let joystickState = { active: false, touchId: null, x: 0, y: 0 };

function setupVirtualJoystick() {
  const joystickZone = document.getElementById('joystickZone');
  const joystickBase = document.getElementById('joystickBase');
  const joystickKnob = document.getElementById('joystickKnob');
  if (!joystickZone || !joystickBase || !joystickKnob) return;

  const maxRadius = 45; // Bán kính kéo tối đa của núm

  function getBaseCenter() {
    const rect = joystickBase.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function handleTouchStart(e) {
    if (joystickState.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Nhận diện chạm ở nửa dưới bên trái màn hình
      if (touch.clientX < window.innerWidth * 0.45 && touch.clientY > window.innerHeight * 0.38) {
        joystickState.active = true;
        joystickState.touchId = touch.identifier;
        joystickBase.classList.add('is-active');

        updateKnobPosition(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  function handleTouchMove(e) {
    if (!joystickState.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickState.touchId) {
        updateKnobPosition(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  function updateKnobPosition(touchX, touchY) {
    const center = getBaseCenter();
    const dx = touchX - center.x;
    const dy = touchY - center.y;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // Vector chuẩn hóa (-1 đến 1)
    joystickState.x = knobX / maxRadius;
    joystickState.y = -knobY / maxRadius; // Màn hình hướng Y xuống, hướng tới là âm Y
  }

  function handleTouchEnd(e) {
    if (!joystickState.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickState.touchId) {
        joystickState.active = false;
        joystickState.touchId = null;
        joystickState.x = 0;
        joystickState.y = 0;
        joystickBase.classList.remove('is-active');
        joystickKnob.style.transform = 'translate(0px, 0px)';
        break;
      }
    }
  }

  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: true });
  window.addEventListener('touchend', handleTouchEnd, { passive: true });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}
setupVirtualJoystick();

window.addEventListener('keydown', (e) => {
  if (nameModal.style.display === 'flex') return;

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

function handlePeeAction() {
  const spot = findNearestPeeSpot();
  const spotType = spot ? spot.type : (localPlayerState.z > 12 ? "tree" : "wall");

  playPeeSound();
  spawnPeeStream(localPlayerState.x, 0.3, localPlayerState.z, localPlayerState.ry);

  sendAction({
    action: "pee",
    spot_type: spotType
  });
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

function show3DShoutBubble(id, text) {
  const hud = playerHUDTags.get(id);
  if (!hud) return;
  hud.bubbleElem.textContent = text;
  hud.bubbleElem.style.display = 'block';

  if (hud.bubbleTimer) clearTimeout(hud.bubbleTimer);
  hud.bubbleTimer = setTimeout(() => {
    hud.bubbleElem.style.display = 'none';
  }, 3500);
}

const tempVec = new THREE.Vector3();
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
    }
  }

  // Update Remote Players Tags
  remotePlayers.forEach((rp, id) => {
    tempVec.set(rp.mesh.position.x, rp.mesh.position.y + 2.1, rp.mesh.position.z);
    tempVec.project(camera);
    const hud = getOrCreatePlayerHUD(id, rp.data.name, false);
    if (tempVec.z < 1) {
      const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
      hud.elem.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      hud.elem.style.display = 'flex';
    } else {
      hud.elem.style.display = 'none';
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
  };

  ws.onmessage = (event) => {
    if (offlineFallbackTimer) clearTimeout(offlineFallbackTimer);
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'init':
        const world = data.world_state;
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
  const delta = clock.getDelta();

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
    if (selfMember && selfMember.drunk_level > 35) {
      const drunkFactor = (selfMember.drunk_level - 35) / 65;
      moveX += Math.sin(clock.getElapsedTime() * 3) * 0.45 * drunkFactor;
      moveZ += Math.cos(clock.getElapsedTime() * 2) * 0.3 * drunkFactor;
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      moveX /= len;
      moveZ /= len;

      const currentSpeed = localPlayerState.speed * Math.max(0.4, inputMag);
      localPlayerState.x += moveX * currentSpeed * delta;
      localPlayerState.z += moveZ * currentSpeed * delta;

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

    // Hiển thị nút tương tác [E] ghế ngồi hoặc [P] xả lũ / đái bậy
    const nearChair = findNearestChair();
    const nearPee = findNearestPeeSpot();
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
    } else {
      interactPrompt.style.display = 'none';
    }
  } else if (localPlayerState.is_sitting) {
    interactPrompt.style.display = 'none';
  }

  // Animation Hạt tia nước đái bậy
  updatePeeParticles(delta);

  // Animation Sông Sài Gòn & Du Thuyền Du Lịch
  if (cruiseBoat) {
    cruiseBoat.position.x += delta * 1.8;
    if (cruiseBoat.position.x > 50) cruiseBoat.position.x = -50;
    cruiseBoat.position.y = 0.1 + Math.sin(clock.getElapsedTime() * 1.8) * 0.05;
  }

  // Animation Đèn LED Landmark 81 & Ngọn Hải Đăng Đỉnh Tháp
  if (landmarkSpireLight) {
    landmarkSpireLight.intensity = 1.8 + Math.sin(clock.getElapsedTime() * 4) * 0.8;
  }
  if (landmarkLEDs.length > 0) {
    const hue = (clock.getElapsedTime() * 0.08) % 1;
    landmarkLEDs.forEach((strip, sIdx) => {
      const sHue = (hue + sIdx * 0.15) % 1;
      strip.material.color.setHSL(sHue, 1.0, 0.55);
    });
  }

  // Camera Management: Chế độ Cinematic Ngắm Landmark 81 VS Góc nhìn 360°
  if (isScenicView) {
    // Góc nhìn điện ảnh hướng thẳng ra Landmark 81 và dòng sông lấp lánh
    const scenicCamPos = new THREE.Vector3(localPlayerState.x * 0.5, 6.2, 19.5);
    camera.position.lerp(scenicCamPos, 0.08);
    camera.lookAt(8, 20, 95);
  } else {
    // Camera Xoay 360° Orbit bám theo nhân vật
    const lookTargetX = localPlayerState.x;
    const lookTargetY = 1.35;
    const lookTargetZ = localPlayerState.z;

    let drunkYawOffset = 0;
    let drunkPitchOffset = 0;
    if (selfMember && selfMember.drunk_level > 40) {
      const drunkFactor = (selfMember.drunk_level - 40) / 60;
      drunkYawOffset = Math.sin(clock.getElapsedTime() * 1.6) * 0.12 * drunkFactor;
      drunkPitchOffset = Math.cos(clock.getElapsedTime() * 1.9) * 0.08 * drunkFactor;
    }

    const curYaw = cameraYaw + drunkYawOffset;
    const curPitch = cameraPitch + drunkPitchOffset;

    const horizontalDist = cameraDistance * Math.cos(curPitch);
    const targetCamX = lookTargetX + horizontalDist * Math.sin(curYaw);
    const targetCamY = lookTargetY + cameraDistance * Math.sin(curPitch);
    const targetCamZ = lookTargetZ + horizontalDist * Math.cos(curYaw);

    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.15);
    camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
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
  sendAction({ action: 'cheer' });
});

// Ngồi / Đứng
sitStandBtn.addEventListener('click', () => {
  handleToggleSit();
});

// Gắp Mồi
eatSnackBtn.addEventListener('click', () => {
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
    if (hudShoutsBarElem) hudShoutsBarElem.classList.remove('is-open');
  });
});

// Mobile Cửa Miệng Toggle Drawer
const shoutToggleBtn = document.getElementById('shoutToggleBtn');
const closeShoutBtn = document.getElementById('closeShoutBtn');
if (shoutToggleBtn && hudShoutsBarElem) {
  shoutToggleBtn.addEventListener('click', () => {
    hudShoutsBarElem.classList.toggle('is-open');
  });
}
if (closeShoutBtn && hudShoutsBarElem) {
  closeShoutBtn.addEventListener('click', () => {
    hudShoutsBarElem.classList.remove('is-open');
  });
}

// Bấm trực tiếp vào thông báo kéo ghế ngồi trên màn hình cảm ứng
if (interactPrompt) {
  interactPrompt.addEventListener('click', () => {
    handleToggleSit();
  });
  interactPrompt.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleToggleSit();
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

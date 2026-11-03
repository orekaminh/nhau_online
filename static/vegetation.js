// Cây cối, hoa lá, cỏ trông thật hơn: lá vẽ bằng texture trong suốt (alphaTest) dán lên nhiều tấm phẳng,
// thân cây có vân vỏ + chỗ phình gốc + cành, dừa có tàu lá cong rủ, hoa nhiều cánh, cỏ búi, gió lay nhẹ.
// Không dùng file ảnh: mọi texture sinh bằng canvas. Dùng: Veg.makeTree('broadleaf'|'tall'|'flame'|'frangipani'|'palm', seed, scale),
// Veg.makeShrub, Veg.makeFlowerPatch, Veg.makeBlossomMass, Veg.scatterGrass, Veg.lawnMaterial.
(function () {
  'use strict';

  const lite = !!(window.PUB_PERF && window.PUB_PERF.lite);
  const wind = { value: 0 };
  const cache = {};

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  // ---------- Texture ----------
  function leafPath(g, L, W) {
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(W, -L * 0.45, 0, -L);
    g.quadraticCurveTo(-W, -L * 0.45, 0, 0);
    g.closePath();
  }
  // Cụm lá: lớp tối bên dưới (tạo chiều sâu) rồi lớp sáng bên trên, có gân lá
  function leafClusterTexture(key, hue, count, leafLen, leafWid, hueJitter) {
    if (cache[key]) return cache[key];
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(hue * 31 + count);
    const place = (shade) => {
      for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 108;
        g.save();
        g.translate(128 + Math.cos(a) * d, 138 + Math.sin(a) * d * 0.9 + (shade ? 5 : 0));
        g.rotate(a + Math.PI / 2 + (r() - 0.5) * 1.2);
        const L = leafLen * (0.75 + r() * 0.5), W = leafWid * (0.8 + r() * 0.4);
        const h = hue + (r() - 0.5) * hueJitter, l = shade ? 14 + r() * 6 : 26 + r() * 20;
        const grad = g.createLinearGradient(0, 0, 0, -L);
        grad.addColorStop(0, `hsl(${h},55%,${l - 6}%)`);
        grad.addColorStop(1, `hsl(${h + 6},62%,${l + 8}%)`);
        g.fillStyle = grad;
        leafPath(g, L, W); g.fill();
        if (!shade) {
          g.strokeStyle = `hsla(${h + 10},50%,${l + 18}%,0.55)`; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -L * 0.9); g.stroke();
        }
        g.restore();
      }
    };
    place(true); place(false);
    return (cache[key] = texOf(c));
  }
  function barkTexture(rings) {
    const key = 'bark' + rings;
    if (cache[key]) return cache[key];
    const c = canvas(128, 256), g = c.getContext('2d'), r = rng(7 + rings);
    g.fillStyle = rings ? '#8a7a66' : '#5b4430'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 160; i++) {
      const x = r() * 128, w = 1 + r() * 4, l = 30 + r() * 130, y = r() * 256;
      g.fillStyle = `rgba(${20 + r() * 25},${12 + r() * 14},8,${0.18 + r() * 0.3})`;
      g.fillRect(x, y, w, l);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(210,190,160,${0.05 + r() * 0.1})`;
      g.fillRect(r() * 128, r() * 256, 1 + r() * 2, 8 + r() * 30);
    }
    if (rings) for (let y = 0; y < 256; y += 16) {                 // vòng đốt thân dừa
      g.fillStyle = 'rgba(40,30,20,0.55)'; g.fillRect(0, y, 128, 2.5);
      g.fillStyle = 'rgba(230,215,190,0.18)'; g.fillRect(0, y + 3, 128, 2);
    }
    return (cache[key] = texOf(c, [2, rings ? 3 : 2]));
  }
  function frondTexture() {
    if (cache.frond) return cache.frond;
    const c = canvas(128, 512), g = c.getContext('2d');
    g.strokeStyle = '#4d7c1b'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 6); g.stroke();
    const r = rng(11);
    for (let y = 30; y < 505; y += 9) {
      const t = 1 - y / 512, len = 12 + Math.sin(t * Math.PI) * 50 + 8;
      for (const s of [-1, 1]) {
        const grad = g.createLinearGradient(64, y, 64 + s * len, y + 34);
        grad.addColorStop(0, '#3f7d1a'); grad.addColorStop(1, `hsl(${92 + r() * 14},58%,${28 + r() * 10}%)`);
        g.strokeStyle = grad; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.6, y + 6, 64 + s * len, y + 26 + r() * 6); g.stroke();
      }
    }
    return (cache.frond = texOf(c));
  }
  // Hoa 5 cánh xám trắng + nhuỵ vàng: nhân màu theo từng bông qua instanceColor
  function flowerTexture(petals) {
    const key = 'flower' + petals;
    if (cache[key]) return cache[key];
    const c = canvas(64, 64), g = c.getContext('2d');
    g.translate(32, 32);
    for (let i = 0; i < petals; i++) {
      g.save(); g.rotate((i / petals) * Math.PI * 2);
      const grad = g.createRadialGradient(0, -13, 2, 0, -13, 15);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#c9c9c9');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, -14, 8.5, 15, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    const cg = g.createRadialGradient(0, 0, 1, 0, 0, 7);
    cg.addColorStop(0, '#fff2a8'); cg.addColorStop(1, '#d99a1e');
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    return (cache[key] = texOf(c));
  }
  function grassTexture() {
    if (cache.grass) return cache.grass;
    const c = canvas(128, 128), g = c.getContext('2d'), r = rng(23);
    for (let i = 0; i < 46; i++) {
      const x = 8 + r() * 112, h = 50 + r() * 74, bend = (r() - 0.5) * 34, w = 2 + r() * 3.5;
      const grad = g.createLinearGradient(0, 128, 0, 128 - h);
      grad.addColorStop(0, `hsl(${96 + r() * 20},55%,18%)`); grad.addColorStop(1, `hsl(${84 + r() * 24},62%,${36 + r() * 14}%)`);
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x - w, 128); g.quadraticCurveTo(x - w * 0.4 + bend * 0.3, 128 - h * 0.6, x + bend, 128 - h);
      g.quadraticCurveTo(x + w * 0.4 + bend * 0.3, 128 - h * 0.6, x + w, 128); g.closePath(); g.fill();
    }
    return (cache.grass = texOf(c));
  }
  function lawnTexture() {
    if (cache.lawn) return cache.lawn;
    const c = canvas(256, 256), g = c.getContext('2d'), r = rng(5);
    g.fillStyle = '#3d7a2c'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {                               // mảng cỏ đậm nhạt
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, 30 + r() * 40);
      const l = 22 + r() * 22;
      grad.addColorStop(0, `hsla(${90 + r() * 25},48%,${l}%,0.55)`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(r() * 256, r() * 256); g.fillStyle = grad; g.fillRect(-80, -80, 160, 160); g.restore();
    }
    for (let i = 0; i < 2600; i++) {                              // ngọn cỏ li ti
      g.strokeStyle = `hsla(${80 + r() * 35},55%,${22 + r() * 34}%,0.5)`;
      g.lineWidth = 1;
      const x = r() * 256, y = r() * 256;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5); g.stroke();
    }
    return (cache.lawn = c);
  }

  // ---------- Vật liệu (có gió lay) ----------
  function foliageMaterial(tex, opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }, opts));
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #endif
        vec3 wp = (modelMatrix * vec4(ip, 1.0)).xyz;
        float pin = clamp(position.y + 0.5, 0.0, 1.0) * 0.6 + 0.4 * clamp(ip.y * 0.15, 0.0, 1.0);
        float sw = sin(uWind * 1.5 + wp.x * 0.45 + wp.z * 0.6) * 0.04 + sin(uWind * 2.9 + position.x * 4.0 + wp.x) * 0.012;
        transformed.x += sw * pin;
        transformed.z += sw * 0.7 * pin;`);
    };
    return m;
  }
  const mats = {};
  function matFor(key, tex, opts) { return mats[key] || (mats[key] = foliageMaterial(tex, opts)); }
  const barkMat = (rings) => mats['bark' + rings] || (mats['bark' + rings] = new THREE.MeshStandardMaterial({ map: barkTexture(rings), roughness: 0.95, color: rings ? 0xffffff : 0xc9b8a4 }));

  // ---------- Khối cơ bản ----------
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const grassGeo = new THREE.PlaneGeometry(1, 1);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

  function cards(mat, list, jitterColor) {
    const mesh = new THREE.InstancedMesh(cardGeo, mat, list.length);
    list.forEach((c, i) => {
      tmpE.set(c.rx || 0, c.ry || 0, c.rz || 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(c.x, c.y, c.z), tmpQ, tmpS.set(c.s, c.s, c.s));
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, c.color ? tmpC.set(c.color) : tmpC.setScalar(jitterColor ? 0.8 + (c.j || 0) * 0.4 : 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  // Thân cây: ống hơi cong, phình ở gốc, gắn vân vỏ
  function trunkMesh(r0, r1, h, bend, seed, rings) {
    const rr = rng(seed);
    const geo = new THREE.CylinderGeometry(r1, r0, h, 10, 8);
    const pos = geo.attributes.position;
    const dir = rr() * Math.PI * 2;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = (y + h / 2) / h;
      const flare = rings ? 1 + Math.max(0, 0.35 - t) * 1.4 : 1 + Math.max(0, 0.22 - t) * 2.6;
      pos.setX(i, pos.getX(i) * flare + Math.sin(t * Math.PI * 0.8) * bend * Math.cos(dir));
      pos.setZ(i, pos.getZ(i) * flare + Math.sin(t * Math.PI * 0.8) * bend * Math.sin(dir));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, barkMat(rings));
    m.position.y = h / 2;
    m.castShadow = true;
    return { mesh: m, top: new THREE.Vector3(Math.sin(Math.PI * 0.8) * bend * Math.cos(dir) * 0.6, h, Math.sin(Math.PI * 0.8) * bend * Math.sin(dir) * 0.6) };
  }
  function branch(from, to, r, parent) {
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, len, 6), barkMat(0));
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    parent.add(m);
  }

  // ---------- Cây ----------
  const KINDS = {
    broadleaf: { trunkH: 3.0, r0: 0.3, r1: 0.17, canopy: [2.3, 1.7, 2.3], center: 4.3, n: 52, size: [1.5, 2.1], hue: 108, leaf: 'a' },
    tall: { trunkH: 4.6, r0: 0.34, r1: 0.18, canopy: [1.9, 2.8, 1.9], center: 6.6, n: 56, size: [1.5, 2.0], hue: 118, leaf: 'b' },
    flame: { trunkH: 2.8, r0: 0.3, r1: 0.16, canopy: [3.2, 1.2, 3.2], center: 4.4, n: 60, size: [1.5, 2.0], hue: 100, leaf: 'c', blossoms: 0xe8431f },
    frangipani: { trunkH: 1.7, r0: 0.26, r1: 0.18, canopy: [1.5, 0.9, 1.5], center: 2.9, n: 30, size: [1.0, 1.4], hue: 112, leaf: 'd', blossoms: 0xfff4e0, big: true },
  };

  function makeTree(kind, seed, scale) {
    const g = new THREE.Group();
    const s = scale || 1;
    if (kind === 'palm') { makePalm(g, seed || 1); g.scale.setScalar(s); return g; }
    const K = KINDS[kind] || KINDS.broadleaf;
    const r = rng((seed || 1) * 977 + 13);
    const n = lite ? Math.round(K.n * 0.6) : K.n;
    const tr = trunkMesh(K.r0, K.r1, K.trunkH, 0.25 + r() * 0.3, (seed || 1) * 31, 0);
    g.add(tr.mesh);

    // Cành vươn tới các cụm lá
    const nb = K.big ? 5 : 4;
    const leafPts = [];
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + r() * 0.9;
      const spread = K.canopy[0] * (0.4 + r() * 0.35);
      const end = new THREE.Vector3(Math.cos(a) * spread, K.center - K.canopy[1] * 0.2 + r() * 0.6, Math.sin(a) * spread);
      branch(tr.top.clone().setY(K.trunkH * (0.82 + r() * 0.15)), end, K.r1 * 0.9, g);
      leafPts.push(end);
    }

    // Tán lá: các tấm lá phân bố trong elip, đậm ở rìa, hướng ra ngoài
    const list = [];
    for (let i = 0; i < n; i++) {
      let px, py, pz;
      if (K.big) {                                        // sứ: lá mọc thành cụm ở đầu cành
        const e = leafPts[i % leafPts.length];
        px = e.x + (r() - 0.5) * 1.1; py = e.y + (r() - 0.2) * 0.8; pz = e.z + (r() - 0.5) * 1.1;
      } else {
        const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1), rad = 0.55 + 0.45 * Math.cbrt(r());
        px = Math.sin(v) * Math.cos(u) * K.canopy[0] * rad; py = K.center + Math.cos(v) * K.canopy[1] * rad * 0.9; pz = Math.sin(v) * Math.sin(u) * K.canopy[2] * rad;
        if (py < K.center - K.canopy[1] * 0.6) py = K.center - K.canopy[1] * 0.6 + r() * 0.3;
      }
      list.push({
        x: px, y: py, z: pz, s: K.size[0] + r() * (K.size[1] - K.size[0]),
        ry: Math.atan2(px, pz) + (r() - 0.5) * 1.6, rx: -0.5 + r() * 1.0, rz: (r() - 0.5) * 0.6, j: r()
      });
    }
    const tex = leafClusterTexture('leaf' + K.leaf, K.hue, K.big ? 22 : 62, K.big ? 62 : 38, K.big ? 22 : 12, 24);
    g.add(cards(matFor('leaf' + K.leaf, tex), list, true));

    // Hoa trên tán (phượng đỏ, sứ trắng)
    if (K.blossoms) {
      const fl = [], fc = new THREE.Color(K.blossoms);
      const nf = lite ? 14 : (K.big ? 26 : 46);
      for (let i = 0; i < nf; i++) {
        const u = r() * Math.PI * 2, v = Math.acos(r() * 0.9 + 0.1), rad = 0.75 + 0.3 * r();
        const e = K.big ? leafPts[i % leafPts.length] : null;
        fl.push({
          x: e ? e.x + (r() - 0.5) * 0.9 : Math.sin(v) * Math.cos(u) * K.canopy[0] * rad,
          y: e ? e.y + 0.35 + r() * 0.5 : K.center + Math.cos(v) * K.canopy[1] * rad,
          z: e ? e.z + (r() - 0.5) * 0.9 : Math.sin(v) * Math.sin(u) * K.canopy[2] * rad,
          s: K.big ? 0.36 : 0.42, rx: -1.2 + r() * 0.5, ry: r() * Math.PI * 2, color: fc.clone().offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.12)
        });
      }
      g.add(cards(matFor('flower5', flowerTexture(5), { roughness: 0.7 }), fl, false));
    }
    g.scale.setScalar(s);
    return g;
  }

  // Cây dừa: thân cong có vòng đốt, tàu lá cong rủ, buồng dừa
  function bentFrondGeometry() {
    if (cache.frondGeo) return cache.frondGeo;
    const geo = new THREE.PlaneGeometry(1, 1, 1, 10);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5;                 // 0 (gốc) -> 1 (ngọn)
      const w = p.getX(i) * (1.0 - t * 0.55) * 1.3;
      p.setX(i, w);
      p.setZ(i, t * 3.1);                        // dài ra phía trước
      p.setY(i, t * 1.1 - t * t * 1.9);          // vồng lên rồi rủ xuống
    }
    geo.computeVertexNormals();
    return (cache.frondGeo = geo);
  }
  function makePalm(g, seed) {
    const r = rng(seed * 313 + 5);
    const H = 5.4 + r() * 0.8;
    const tr = trunkMesh(0.3, 0.17, H, 0.55 + r() * 0.4, seed * 17, 1);
    g.add(tr.mesh);
    const top = tr.top.clone();
    const nf = lite ? 8 : 12;
    const mesh = new THREE.InstancedMesh(bentFrondGeometry(), matFor('frond', frondTexture(), { roughness: 0.7 }), nf);
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * Math.PI * 2 + r() * 0.3;
      tmpE.set(0, a, 0);
      tmpQ.setFromEuler(tmpE);
      const sc = 0.95 + r() * 0.4;
      tmpM.compose(tmpV.set(top.x, top.y - 0.05 + r() * 0.2, top.z), tmpQ, tmpS.set(sc * 1.3, sc, sc));
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, tmpC.setScalar(0.8 + r() * 0.35));
    }
    mesh.frustumCulled = false;
    g.add(mesh);
    const nut = new THREE.MeshStandardMaterial({ color: 0x6f8f2a, roughness: 0.55 });
    for (let c = 0; c < 6; c++) {
      const cn = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), nut);
      cn.scale.set(1, 1.2, 1);
      cn.position.set(top.x + Math.cos(c * 1.1) * 0.26, top.y - 0.28 - (c % 2) * 0.08, top.z + Math.sin(c * 1.1) * 0.26);
      g.add(cn);
    }
  }

  // ---------- Bụi cây, hoa, cỏ ----------
  function makeShrub(radius, seed, flowerColors) {
    const g = new THREE.Group();
    const r = rng((seed || 1) * 71 + 3), R = radius || 0.7;
    const n = lite ? 10 : 20;
    const list = [];
    for (let i = 0; i < n; i++) {
      const u = r() * Math.PI * 2, v = r() * Math.PI * 0.5, rad = 0.5 + 0.5 * r();
      list.push({ x: Math.sin(v) * Math.cos(u) * R * rad, y: 0.12 + Math.cos(v) * R * 0.75 * rad, z: Math.sin(v) * Math.sin(u) * R * rad,
        s: R * (0.85 + r() * 0.6), ry: u + (r() - 0.5), rx: -0.4 + r() * 0.8, rz: (r() - 0.5) * 0.5, j: r() });
    }
    g.add(cards(matFor('shrub', leafClusterTexture('leafShrub', 112, 44, 30, 11, 22)), list, true));
    if (flowerColors && flowerColors.length) {
      const fl = [];
      for (let i = 0; i < (lite ? 5 : 11); i++) {
        const u = r() * Math.PI * 2, v = r() * Math.PI * 0.45;
        fl.push({ x: Math.sin(v) * Math.cos(u) * R * 0.95, y: 0.3 + Math.cos(v) * R * 0.85, z: Math.sin(v) * Math.sin(u) * R * 0.95,
          s: 0.22, rx: -1.2 + r() * 0.6, ry: r() * 6.28, color: flowerColors[Math.floor(r() * flowerColors.length)] });
      }
      g.add(cards(matFor('flower5', flowerTexture(5), { roughness: 0.7 }), fl, false));
    }
    return g;
  }

  // Thảm hoa tròn: lớp lá thấp phủ kín + nhiều bông hoa nhiều màu
  function makeFlowerPatch(radius, colors, density, seed, ring) {
    const g = new THREE.Group();
    const r = rng((seed || 1) * 53 + 9);
    const area = ring ? Math.PI * (radius * radius - ring * ring) : Math.PI * radius * radius;
    const nl = Math.round(area * 9 * (density || 1) * (lite ? 0.5 : 1));
    const pt = () => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius; const dd = ring ? Math.sqrt(ring * ring + r() * (radius * radius - ring * ring)) : d; return [Math.cos(a) * dd, Math.sin(a) * dd]; };
    const leaves = [], flowers = [];
    for (let i = 0; i < nl; i++) {
      const [x, z] = pt();
      leaves.push({ x, y: 0.15 + r() * 0.12, z, s: 0.5 + r() * 0.3, ry: r() * 6.28, rx: -0.9 + r() * 0.7, j: r() });
    }
    for (let i = 0; i < Math.round(nl * 1.5); i++) {
      const [x, z] = pt();
      flowers.push({ x, y: 0.3 + r() * 0.18, z, s: 0.2 + r() * 0.12, rx: -1.25 + r() * 0.5, ry: r() * 6.28, rz: 0, color: colors[Math.floor(r() * colors.length)] });
    }
    g.add(cards(matFor('shrub', leafClusterTexture('leafShrub', 112, 44, 30, 11, 22)), leaves, true));
    g.add(cards(matFor('flower5', flowerTexture(5), { roughness: 0.7 }), flowers, false));
    return g;
  }

  // Giàn hoa giấy: khối lá + hoa rủ phủ trên mái giàn
  function makeBlossomMass(w, d, h, colors, seed) {
    const g = new THREE.Group();
    const r = rng((seed || 1) * 19 + 1);
    const nl = lite ? 40 : 90, nf = lite ? 60 : 160;
    const leaves = [], flowers = [];
    for (let i = 0; i < nl; i++) leaves.push({ x: (r() - 0.5) * w, y: r() * h * 0.6, z: (r() - 0.5) * d, s: 0.6 + r() * 0.5, ry: r() * 6.28, rx: -0.4 + r() * 0.8, j: r() });
    for (let i = 0; i < nf; i++) {
      const hang = r();
      flowers.push({ x: (r() - 0.5) * w, y: 0.15 + (1 - hang) * h * 0.7, z: (r() - 0.5) * d, s: 0.2 + r() * 0.12,
        rx: -1.3 + r() * 0.9, ry: r() * 6.28, color: colors[Math.floor(r() * colors.length)] });
    }
    g.add(cards(matFor('shrub', leafClusterTexture('leafShrub', 112, 44, 30, 11, 22)), leaves, true));
    g.add(cards(matFor('bract', flowerTexture(4), { roughness: 0.6 }), flowers, false));
    return g;
  }

  // Búi cỏ: hai tấm cắt chéo nhau, rải ngẫu nhiên trong hình chữ nhật, tránh vật cản
  function scatterGrass(rect, count, avoid) {
    const r = rng(rect.seed || 99);
    const total = lite ? Math.round(count * 0.4) : count;
    const mesh = new THREE.InstancedMesh(grassGeo, matFor('grass', grassTexture(), { alphaTest: 0.45, roughness: 1 }), total * 2);
    let k = 0;
    for (let i = 0; i < total * 3 && k < total * 2; i++) {
      const x = rect.x0 + r() * (rect.x1 - rect.x0), z = rect.z0 + r() * (rect.z1 - rect.z0);
      if (avoid && avoid(x, z)) continue;
      const s = 0.45 + r() * 0.5, ry = r() * Math.PI;
      for (const extra of [0, Math.PI / 2]) {
        tmpE.set(0, ry + extra, 0);
        tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpV.set(x, (rect.y || 0.3) + s * 0.5, z), tmpQ, tmpS.set(s * 0.9, s, s));
        mesh.setMatrixAt(k, tmpM);
        mesh.setColorAt(k, tmpC.setScalar(0.7 + r() * 0.5));
        k++;
      }
    }
    mesh.count = k;
    mesh.frustumCulled = false;
    return mesh;
  }

  function lawnMaterial(repeatX, repeatZ, extra) {
    const tex = new THREE.CanvasTexture(lawnTexture());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatZ);
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.95 }, extra));
  }

  window.Veg = { makeTree, makeShrub, makeFlowerPatch, makeBlossomMass, scatterGrass, lawnMaterial, rng, wind };
  if (window.Features && Features.addTick) Features.addTick((delta, t) => { wind.value = t; });
})();

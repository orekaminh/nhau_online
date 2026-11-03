// Small, reusable geometry: a roofless WC for a clear mobile camera, plus pub pets.
function createPubDetails(scene) {
  const room = new THREE.Group();
  room.name = 'WC • Quán nhậu';
  scene.add(room);
  const obstacles = [
    // The original pub wall now has a real doorway at z = -2.7.
    { x: -17.7, z: -4.775, w: 0.6, d: 1.75 },
    { x: -17.7, z: 1.325, w: 0.6, d: 5.65 },
    { x: 0, z: -5.2, w: 36, d: 0.6 }
  ];
  const tile = new THREE.MeshStandardMaterial({ color: 0x94aaa4, roughness: 0.7 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x42777d, roughness: 0.8 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xd3e1dc, roughness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8d2d9, metalness: 0.65, roughness: 0.3 });
  function box(parent, w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function label(text, width, height, color = '#e5fbf3') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#133c44'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#a3e7cc'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = color; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(text, 256, 77, 490);
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }));
  }
  function wall(w, h, d, x, y, z) {
    const mesh = box(room, w, h, d, x, y, z, tile);
    obstacles.push({ x, z, w, d });
    return mesh;
  }
  box(room, 5.6, 0.12, 5, -20.2, 0.3, -2.3, blue);
  // Subtle floor grid, shared material and low polygon count.
  for (let x = -22.7; x < -17.5; x += 0.6) box(room, 0.018, 0.012, 4.8, x, 0.367, -2.3, tile);
  for (let z = -4.6; z < 0.1; z += 0.6) box(room, 5.4, 0.012, 0.018, -20.2, 0.367, z, tile);
  wall(0.2, 3.2, 5, -22.9, 1.9, -2.3);
  wall(5.6, 3.2, 0.2, -20.2, 1.9, -4.8);
  // Low foreground wall keeps the inside visible, like a dollhouse cutaway.
  wall(5.6, 0.75, 0.2, -20.2, 0.7, 0.2);
  box(room, 5.4, 0.1, 0.12, -20.2, 1.25, -4.65, blue);
  box(room, 0.12, 0.1, 4.8, -22.75, 1.25, -2.3, blue);

  // Open door leaf, threshold, and a bright sign facing the pub.
  box(room, 0.12, 2.8, 0.12, -17.7, 1.7, -3.9, blue);
  box(room, 0.12, 2.8, 0.12, -17.7, 1.7, -1.5, blue);
  box(room, 0.12, 0.15, 2.5, -17.7, 3.1, -2.7, blue);
  const doorLeaf = box(room, 2.25, 2.45, 0.09, -16.55, 1.55, -1.5, blue);
  const doorHandle = box(room, 0.1, 0.12, 0.1, -16.05, 1.5, -1.4, metal);
  box(room, 1.0, 0.03, 1.9, -17.4, 0.39, -2.7, blue);
  const sign = label('WC • MỜI VÀO', 2.2, 0.55);
  sign.position.set(-17.32, 3.5, -2.7); sign.rotation.y = Math.PI / 2; room.add(sign);
  const etiquette = label('XẢ XONG NHỚ RỬA TAY', 2.7, 0.5);
  etiquette.position.set(-20.3, 2.65, -4.67); room.add(etiquette);
  const exitSign = label('RA QUÁN →', 1.4, 0.4);
  exitSign.position.set(-18.12, 2.5, -2.7); exitSign.rotation.y = -Math.PI / 2; room.add(exitSign);

  // Toilet: pedestal, water bowl, ceramic seat and cistern.
  box(room, 0.54, 0.42, 0.65, -21.55, 0.59, -3.65, porcelain);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), porcelain);
  bowl.scale.set(1, 0.55, 1.25); bowl.position.set(-21.55, 0.82, -3.55); room.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
  water.rotation.x = -Math.PI / 2; water.scale.y = 1.22; water.position.set(-21.55, 1.02, -3.55); room.add(water);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.075, 8, 20), porcelain);
  seat.rotation.x = Math.PI / 2; seat.scale.y = 1.2; seat.position.set(-21.55, 1.04, -3.55); room.add(seat);
  box(room, 0.78, 0.72, 0.28, -21.55, 1.16, -4.25, porcelain);
  box(room, 0.12, 0.05, 0.09, -21.55, 1.55, -4.25, metal);
  obstacles.push({ x: -21.55, z: -3.85, w: 0.9, d: 1.25 });
  // Roll of paper beside the toilet.
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12), porcelain);
  roll.rotation.z = Math.PI / 2; roll.position.set(-22.55, 1.25, -3.45); room.add(roll);
  box(room, 0.25, 0.35, 0.02, -22.55, 1.05, -3.31, porcelain);
  // Sink, mirror, tap, soap. Mirror uses a bright surface instead of a costly reflection pass.
  box(room, 1.05, 0.22, 0.65, -19.25, 1.2, -4.23, porcelain);
  box(room, 0.72, 0.018, 0.4, -19.25, 1.32, -4.18, blue);
  box(room, 0.16, 0.8, 0.16, -19.25, 0.77, -4.23, porcelain);
  box(room, 0.07, 0.35, 0.07, -19.25, 1.46, -4.42, metal);
  box(room, 0.07, 0.07, 0.27, -19.25, 1.6, -4.31, metal);
  box(room, 1.0, 0.9, 0.06, -19.25, 2.1, -4.65,
    new THREE.MeshStandardMaterial({ color: 0xbce9ef, emissive: 0x26484d, roughness: 0.15 }));
  box(room, 0.15, 0.23, 0.14, -18.88, 1.42, -4.23,
    new THREE.MeshStandardMaterial({ color: 0x65d7b0 }));
  obstacles.push({ x: -19.25, z: -4.23, w: 1.05, d: 0.65 });
  const lightPanel = new THREE.MeshStandardMaterial({ color: 0xfff5d6, emissive: 0xffefc7, emissiveIntensity: 0.8 });
  box(room, 2.1, 0.08, 0.2, -20.2, 3.55, -4.6, lightPanel);
  const light = new THREE.PointLight(0xffefd6, 0.85, 9, 1.5);
  light.position.set(-20.2, 3.1, -2.3); room.add(light);

  const animals = [];
  const animalMaterials = {};
  function fur(color) {
    if (!animalMaterials[color]) animalMaterials[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    return animalMaterials[color];
  }
  function animal(kind, x, z, color) {
    const cat = kind === 'cat';
    const root = new THREE.Group(); root.position.set(x, 0.36, z); scene.add(root);
    const coat = fur(color), cream = fur(0xffe6bd), dark = fur(0x1f2937);
    const body = box(root, cat ? 0.38 : 0.5, 0.4, cat ? 0.7 : 0.95, 0, 0.48, 0, coat);
    const head = new THREE.Group(); head.position.set(0, 0.8, 0.38); root.add(head);
    box(head, 0.43, 0.4, 0.4, 0, 0, 0, coat);
    box(head, 0.25, 0.17, cat ? 0.12 : 0.3, 0, -0.1, 0.25, cream);
    box(head, 0.1, 0.07, 0.07, 0, -0.06, cat ? 0.32 : 0.43, dark);
    for (const side of [-1, 1]) {
      box(head, 0.065, 0.075, 0.04, side * 0.13, 0.04, 0.215, dark);
      if (cat) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.25, 3), coat);
        ear.position.set(side * 0.17, 0.28, 0); head.add(ear);
        for (let j = 0; j < 2; j++) {
          const whisker = box(head, 0.22, 0.012, 0.015, side * 0.25, -0.08 + j * 0.07, 0.29, cream);
          whisker.rotation.z = side * (j ? 0.2 : -0.2);
        }
      } else {
        const ear = box(head, 0.15, 0.33, 0.22, side * 0.25, -0.04, -0.03, coat);
        ear.rotation.z = side * 0.25;
      }
    }
    const legs = [];
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.17, 0.4, front * (cat ? 0.24 : 0.34)); root.add(pivot);
      box(pivot, 0.12, 0.42, 0.14, 0, -0.19, 0, coat); legs.push(pivot);
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.57, cat ? -0.34 : -0.48); root.add(tail);
    const tailMesh = box(tail, 0.09, cat ? 0.6 : 0.4, 0.1, 0, 0.18, -0.08, coat);
    tailMesh.rotation.x = -0.45;
    box(root, cat ? 0.4 : 0.52, 0.08, 0.12, 0, 0.68, 0.27, fur(cat ? 0xf472b6 : 0x38bdf8));
    if (cat) for (let i = 0; i < 3; i++) box(root, 0.4, 0.025, 0.06, 0, 0.69, -0.2 + i * 0.18, fur(0x805533));
    const bubbleCanvas = document.createElement('canvas'); bubbleCanvas.width = 512; bubbleCanvas.height = 128;
    const bubbleTexture = new THREE.CanvasTexture(bubbleCanvas);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture, depthTest: false }));
    bubble.scale.set(2.4, 0.6, 1); bubble.position.y = 1.65; bubble.visible = false; root.add(bubble);
    animals.push({ kind, root, body, head, legs, tail, x, z, bubble, bubbleCanvas, bubbleTexture, reactionUntil: 0 });
  }
  animal('dog', -8.6, 1.2, 0xc99552);
  animal('cat', 8.1, -0.5, 0xd5aa77);
  // Water bowls stay off the path, away from food served on tables.
  for (const x of [-9.0, 8.6]) {
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.12, 12), metal);
    dish.position.set(x, 0.4, 2.7); scene.add(dish);
    const drink = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
    drink.rotation.x = -Math.PI / 2; drink.position.set(x, 0.465, 2.7); scene.add(drink);
  }
  function react(action, elapsed) {
    for (const pet of animals) {
      pet.reactionUntil = elapsed + 2.6;
      const ctx = pet.bubbleCanvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 128); ctx.fillStyle = '#17313a'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(pet.kind === 'dog' ? (action === 'cheer' ? 'Gâu! Dô bằng… nước lọc!' : 'Cho xin miếng mồi!') :
        (action === 'cheer' ? 'Meo… nhỏ thôi, đang ngủ!' : 'Cá đâu? Mướp kiểm tra!'), 256, 76, 490);
      pet.bubbleTexture.needsUpdate = true;
    }
  }
  function update(elapsed) {
    for (const pet of animals) {
      const t = elapsed + (pet.kind === 'cat' ? 7 : 0);
      const phase = t % 22;
      const walking = phase < 12;
      const angle = Math.min(phase, 12) / 12 * Math.PI * 2;
      pet.root.position.x = pet.x + Math.sin(angle) * 0.65;
      pet.root.position.z = pet.z + Math.cos(angle) * 0.8;
      pet.root.rotation.y = Math.atan2(Math.cos(angle) * 0.65, -Math.sin(angle) * 0.8);
      pet.root.position.y = 0.36 + (walking ? Math.abs(Math.sin(t * 5)) * 0.025 : 0);
      pet.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(t * 6 + (i % 3 ? Math.PI : 0)) * 0.35 : 0; });
      const excited = elapsed < pet.reactionUntil;
      pet.tail.rotation.z = Math.sin(t * (excited ? 13 : 3)) * (excited ? 0.65 : 0.18);
      pet.head.rotation.x = !walking && !excited ? 0.25 + Math.sin(t * 2) * 0.1 : -0.08;
      // Cat grooms a paw while resting; the dog does a gentle head tilt.
      if (!walking && pet.kind === 'cat') pet.legs[1].rotation.x = -1.1 + Math.sin(t * 3) * 0.15;
      pet.head.rotation.z = !walking && pet.kind === 'dog' ? Math.sin(t) * 0.16 : 0;
      pet.bubble.visible = excited;
    }
  }
  function inside(x, z) { return x < -18.05 && x > -22.65 && z > -4.55 && z < -0.05; }
  function nearEntrance(x, z) { return Math.hypot(x + 17.0, z + 2.7) < 2.0; }
  function move(x, z, dx, dz, locked = false) {
    const radius = 0.24;
    const blocked = (px, pz) => (locked && Math.abs(px + 17.7) < 0.35 && Math.abs(pz + 2.7) < 1.35) || obstacles.some(o =>
      Math.abs(px - o.x) < o.w / 2 + radius && Math.abs(pz - o.z) < o.d / 2 + radius);
    // Small substeps prevent crossing thin walls even at a low frame rate.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
    for (let i = 0; i < steps; i++) {
      if (!blocked(x + dx / steps, z)) x += dx / steps;
      if (!blocked(x, z + dz / steps)) z += dz / steps;
    }
    return { x: Math.max(-42.0, Math.min(42.0, x)), z: Math.max(-4.5, Math.min(33.5, z)) };
  }
  let occupied = null;
  function setOccupied(value) {
    if (occupied === value) return;
    occupied = value;
    doorLeaf.rotation.y = value ? Math.PI / 2 : 0;
    doorLeaf.position.set(value ? -17.7 : -16.55, 1.55, value ? -2.7 : -1.5);
    doorHandle.position.set(value ? -17.6 : -16.05, 1.5, value ? -1.9 : -1.4);
    const canvas = sign.material.map.image, ctx = canvas.getContext('2d');
    ctx.fillStyle = value ? '#713d18' : '#133c44'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = value ? '#ffe4a3' : '#e5fbf3'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(value ? 'WC • ĐANG CÓ NGƯỜI' : 'WC • MỜI VÀO', 256, 77, 490);
    sign.material.map.needsUpdate = true;
  }
  setOccupied(false);
  return { room, animals, obstacles, inside, nearEntrance, move, update, react, setOccupied };
}

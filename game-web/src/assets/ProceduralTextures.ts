import * as THREE from 'three';

export interface ProceduralTextureSet {
  feltGreen: THREE.CanvasTexture;
  feltBlue: THREE.CanvasTexture;
  feltBump: THREE.CanvasTexture;
  woodDeck: THREE.CanvasTexture;
  woodCrate: THREE.CanvasTexture;
  patchworkQuilt: THREE.CanvasTexture;
  knitPatchworkRug: THREE.CanvasTexture;
  knitPatchworkNormal: THREE.CanvasTexture;
  radialWalnutPlanks: THREE.CanvasTexture;
  pastelSlidePink: THREE.CanvasTexture;
  pastelSlideMint: THREE.CanvasTexture;
  rainbowBridge: THREE.CanvasTexture;
  brassGear: THREE.CanvasTexture;
  checkerFinish: THREE.CanvasTexture;
  coinCrown: THREE.CanvasTexture;
  blockLetters: Map<string, THREE.CanvasTexture>;
  blockWoodSide: THREE.CanvasTexture;
}

let currentAniso = 8;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = currentAniso;
  tex.needsUpdate = true;
  return tex;
}

function makeFeltTexture(baseHex: string, lightHex: string, darkHex: string, stitchHex: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle woven felt fibers
  for (let i = 0; i < 9000; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137 + Math.floor(i / 7) * 19) % 512;
    ctx.fillStyle = i % 3 === 0 ? lightHex : darkHex;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(x, y, 2 + (i % 3), 2);
  }
  ctx.globalAlpha = 1;

  // Soft sunlit patch accents
  const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
  grad.addColorStop(0, 'rgba(255,255,235,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.04)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle quilting grid stitches
  ctx.strokeStyle = stitchHex;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.globalAlpha = 0.25;
  ctx.strokeRect(12, 12, 488, 488);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  return toTexture(c, 8, 8, true);
}

function makeFeltBump(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97 + Math.floor(i / 5) * 11) % 256;
    const v = 96 + ((i * 29) % 72);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }
  return toTexture(c, 12, 12, false);
}

function makeWoodTexture(base: string, grain: string, plankLines: boolean): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 2) {
    const wave = Math.sin(y * 0.09) * 0.5 + 0.5;
    ctx.fillStyle = grain;
    ctx.globalAlpha = 0.05 + wave * 0.09;
    ctx.fillRect(0, y, 512, 2);
  }
  ctx.globalAlpha = 1;

  if (plankLines) {
    ctx.strokeStyle = 'rgba(78, 44, 18, 0.35)';
    ctx.lineWidth = 4;
    for (let y = 64; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    for (let row = 0; row < 8; row++) {
      const offset = (row % 2) * 128;
      for (let x = offset; x < 512; x += 256) {
        ctx.beginPath();
        ctx.moveTo(x, row * 64);
        ctx.lineTo(x, (row + 1) * 64);
        ctx.stroke();
      }
    }
  }
  return toTexture(c, 2, 2, true);
}

function makeCrateTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#c88c4b';
  ctx.fillRect(0, 0, 256, 256);

  // Horizontal planks
  ctx.fillStyle = '#b07437';
  for (let y = 0; y < 256; y += 42) {
    ctx.fillRect(0, y, 256, 3);
  }

  // Diagonal brace
  ctx.strokeStyle = '#dfaa68';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(20, 236);
  ctx.lineTo(236, 20);
  ctx.stroke();

  // Outer wooden frame
  ctx.strokeStyle = '#e5b372';
  ctx.lineWidth = 28;
  ctx.strokeRect(14, 14, 228, 228);

  // Inner bevel shadow
  ctx.strokeStyle = 'rgba(65,36,12,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, 200, 200);

  // Corner nails
  ctx.fillStyle = '#5a4636';
  for (const [nx, ny] of [
    [16, 16],
    [240, 16],
    [16, 240],
    [240, 240],
  ]) {
    ctx.beginPath();
    ctx.arc(nx, ny, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1, 1, true);
}

function makeAlphabetBlockTexture(letter: string, colorHex: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  // Warm natural wood body
  ctx.fillStyle = '#f2deb6';
  ctx.fillRect(0, 0, 256, 256);

  // Wood grain streaks
  ctx.fillStyle = '#e2c795';
  for (let y = 0; y < 256; y += 6) {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, y, 256, 2);
  }
  ctx.globalAlpha = 1;

  // Painted colored border frame
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 26;
  ctx.strokeRect(15, 15, 226, 226);

  // Subtle carved bevel line
  ctx.strokeStyle = 'rgba(110, 74, 34, 0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 196, 196);

  // Embossed letter
  ctx.font = '900 132px Fredoka, "M PLUS Rounded 1c", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(letter, 130, 134);
  ctx.fillStyle = colorHex;
  ctx.fillText(letter, 128, 130);

  const tex = toTexture(c, 1, 1, true);
  // Match glTF top-left UV origin exported from Blender so upright letters never flip upside-down
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function makePatchworkTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  const colors = ['#f47488', '#68bae8', '#f7d15c', '#74c88c'];
  const half = 256;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = colors[(row * 2 + col) % colors.length];
      ctx.fillRect(col * half, row * half, half, half);
    }
  }
  // Fabric weave dots
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let y = 4; y < 512; y += 8) {
    for (let x = 4; x < 512; x += 8) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // White cross stitches
  ctx.strokeStyle = '#fff9ee';
  ctx.lineWidth = 5;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, 512);
  ctx.moveTo(0, half);
  ctx.lineTo(512, half);
  ctx.stroke();
  ctx.strokeRect(10, 10, 492, 492);
  ctx.setLineDash([]);
  return toTexture(c, 1, 1, true);
}

function makePastelPlasticTexture(mainHex: string, highlightHex: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, mainHex);
  grad.addColorStop(0.5, highlightHex);
  grad.addColorStop(1, mainHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return toTexture(c, 1, 2, true);
}

function makeRainbowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  const bands = ['#ff5f7e', '#ff9b42', '#ffe052', '#64de80', '#54c5ff', '#9c78ff'];
  const bw = 512 / bands.length;
  bands.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * bw, 0, bw + 2, 256);
  });
  // Sparkle stars along the bridge
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 36; i++) {
    const x = (i * 83) % 512;
    const y = (i * 59) % 256;
    ctx.beginPath();
    ctx.arc(x, y, 2.5 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1, 3, true);
}

function makeBrassGearTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#e6b84c';
  ctx.fillRect(0, 0, 256, 256);
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, '#fff1a8');
  grad.addColorStop(0.7, '#ebb842');
  grad.addColorStop(1, '#b8821c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,248,210,0.34)';
  ctx.lineWidth = 3;
  for (let r = 24; r < 120; r += 20) {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return toTexture(c, 1, 1, true);
}

function makeCheckerFinish(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#fff6e0' : '#f2728b';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  return toTexture(c, 2, 2, true);
}

function makeCoinCrownTexture(): THREE.CanvasTexture {
  // Golden embossed crown relief matching art-bible 02 bottom-right!
  const [c, ctx] = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(108, 108, 16, 128, 128, 128);
  grad.addColorStop(0, '#fff29c');
  grad.addColorStop(0.65, '#ffd038');
  grad.addColorStop(1, '#e09d18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Outer raised rim ring
  ctx.strokeStyle = '#ffec84';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#c48310';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 101, 0, Math.PI * 2);
  ctx.stroke();

  // Embossed 3-point crown in center
  ctx.fillStyle = '#c6820e';
  ctx.beginPath();
  ctx.moveTo(76, 162);
  ctx.lineTo(66, 98);
  ctx.lineTo(100, 122);
  ctx.lineTo(128, 82);
  ctx.lineTo(156, 122);
  ctx.lineTo(190, 98);
  ctx.lineTo(180, 162);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff098';
  ctx.beginPath();
  ctx.moveTo(78, 158);
  ctx.lineTo(70, 102);
  ctx.lineTo(100, 124);
  ctx.lineTo(128, 86);
  ctx.lineTo(156, 124);
  ctx.lineTo(186, 102);
  ctx.lineTo(178, 158);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffec82';
  ctx.fillRect(78, 166, 100, 14);

  return toTexture(c, 1, 1, true);
}

function makeKnitPatchworkRugPair(size = 1024): { albedo: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const cell = size / 4;
  const scaleTo1024 = 1024 / size;
  const [c, ctx] = makeCanvas(size, size);
  const [nc, nctx] = makeCanvas(size, size);

  // Warm chunky knitted patchwork squares inspired by Art Bible 08!
  const palette: Array<[number, number, number]> = [
    [224, 134, 146], [234, 198, 114], [130, 168, 198], [132, 184, 154],
    [208, 162, 142], [134, 168, 194], [222, 138, 148], [228, 192, 108],
    [138, 182, 150], [220, 146, 134], [142, 174, 200], [232, 204, 124],
    [138, 158, 190], [134, 180, 150], [222, 136, 148], [206, 170, 132],
  ];

  const height = new Float32Array(size * size);
  const imgData = ctx.createImageData(size, size);
  const px = imgData.data;

  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / cell);
    const ly = (y % cell) * scaleTo1024;
    const vy = y * scaleTo1024;
    const seamY = Math.min(ly, 256 - ly);
    for (let x = 0; x < size; x++) {
      const col = Math.floor(x / cell);
      const lx = (x % cell) * scaleTo1024;
      const vx = x * scaleTo1024;
      const seamX = Math.min(lx, 256 - lx);

      // Chunky V-knit / cable ribs (alternating directions/widths across squares)
      const isCable = (row + col) % 2 === 0;
      const ribPeriod = isCable ? 28 : 22;
      const localCol = (lx % ribPeriod) / ribPeriod; // 0..1 across vertical rib
      const distMid = Math.abs(localCol - 0.5) * 2.0; // 0 at center of V, 1 at edge
      const ribProfile = Math.cos(distMid * Math.PI * 0.5);

      const vShift = isCable ? distMid * 16.0 : distMid * 11.0;
      const stitchPhase = ((ly + vShift) % 24) / 24;
      const loopWave = Math.sin(stitchPhase * Math.PI);
      const twistHighlight = isCable ? 0.14 * Math.sin((ly / 48) * Math.PI * 2 + localCol * Math.PI) : 0.0;

      // Fiber micro-texture
      const micro = 0.04 * Math.sin(vx * 1.15 + vy * 0.7) * Math.cos(vy * 1.3 - vx * 0.5);
      let h = Math.max(0.05, Math.min(1.0, 0.25 + 0.55 * Math.pow(ribProfile, 0.65) * (0.45 + 0.55 * loopWave) + twistHighlight + micro));

      // Seam recess at square borders
      const seamDist = Math.min(seamX, seamY);
      if (seamDist < 7) {
        h *= 0.25 + 0.75 * (seamDist / 7);
      }

      // Raised blanket cross-stitches along internal quilt seams
      const onVertSeam = seamX <= 5 && ((ly % 26) < 14);
      const onHorizSeam = seamY <= 5 && ((lx % 26) < 14);
      const isStitch = onVertSeam || onHorizSeam;
      if (isStitch) {
        const sDist = onVertSeam ? seamX / 5 : seamY / 5;
        h = 0.85 + 0.30 * Math.cos(sDist * Math.PI * 0.5);
      }

      height[y * size + x] = h;

      const idx = (y * size + x) * 4;
      if (isStitch) {
        const shade = 0.92 + 0.08 * h;
        px[idx] = Math.min(255, 246 * shade);
        px[idx + 1] = Math.min(255, 235 * shade);
        px[idx + 2] = Math.min(255, 210 * shade);
      } else {
        const [pr, pg, pb] = palette[(row * 4 + col) % palette.length];
        const shade = 0.74 + 0.34 * h;
        px[idx] = Math.min(255, pr * shade);
        px[idx + 1] = Math.min(255, pg * shade);
        px[idx + 2] = Math.min(255, pb * shade);
      }
      px[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Convert heightfield into crisp OpenGL-space normal map (+Y up -> +G)
  const normData = nctx.createImageData(size, size);
  const npx = normData.data;
  const strength = 4.2;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[ym * size + x] - height[yp * size + x]) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const idx = (y * size + x) * 4;
      npx[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      npx[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      npx[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      npx[idx + 3] = 255;
    }
  }
  nctx.putImageData(normData, 0, 0);

  return {
    albedo: toTexture(c, 1, 1, true),
    normal: toTexture(nc, 1, 1, false),
  };
}

function makeRadialWalnutPlanks(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  // Deep rich walnut wood grain (zero blow-out under dusk & lantern lighting!)
  ctx.fillStyle = '#4e2e19';
  ctx.fillRect(0, 0, 512, 512);

  for (let row = 0; row < 8; row++) {
    const shade = row % 2 === 0 ? '#57341d' : '#462814';
    ctx.fillStyle = shade;
    ctx.fillRect(0, row * 64, 512, 64);
    for (let y = row * 64; y < (row + 1) * 64; y += 2) {
      const wave = Math.sin(y * 0.14 + row * 1.7) * 0.5 + 0.5;
      ctx.fillStyle = wave > 0.55 ? '#663f24' : '#381e0d';
      ctx.globalAlpha = 0.16;
      ctx.fillRect(0, y, 512, 2);
    }
    ctx.globalAlpha = 1;
    // Deep plank bevel seam
    ctx.fillStyle = '#241207';
    ctx.fillRect(0, row * 64, 512, 3);
    const offset = (row % 2) * 128;
    for (let x = offset; x < 512; x += 256) {
      ctx.fillRect(x, row * 64, 3, 64);
    }
  }
  return toTexture(c, 3, 3, true);
}

let cachedSet: ProceduralTextureSet | null = null;

export function setProceduralAnisotropy(val: number): void {
  currentAniso = val;
  if (!cachedSet) return;
  const list: THREE.CanvasTexture[] = [
    cachedSet.feltGreen,
    cachedSet.feltBlue,
    cachedSet.feltBump,
    cachedSet.woodDeck,
    cachedSet.woodCrate,
    cachedSet.patchworkQuilt,
    cachedSet.knitPatchworkRug,
    cachedSet.knitPatchworkNormal,
    cachedSet.radialWalnutPlanks,
    cachedSet.pastelSlidePink,
    cachedSet.pastelSlideMint,
    cachedSet.rainbowBridge,
    cachedSet.brassGear,
    cachedSet.checkerFinish,
    cachedSet.coinCrown,
    cachedSet.blockWoodSide,
    ...cachedSet.blockLetters.values(),
  ];
  for (const tex of list) {
    if (tex.anisotropy !== val) {
      tex.anisotropy = val;
      tex.needsUpdate = true;
    }
  }
}

export function getProceduralTextures(lowInit = false): ProceduralTextureSet {
  if (cachedSet) return cachedSet;
  if (lowInit) currentAniso = 1;

  const letterSpecs: Array<[string, string]> = [
    ['A', '#e85258'],
    ['B', '#48b868'],
    ['C', '#4692e5'],
    ['D', '#f0a630'],
    ['F', '#9b64dc'],
    ['K', '#ef6c48'],
    ['N', '#3bb3a9'],
    ['U', '#f06292'],
    ['X', '#5e7ce2'],
  ];

  const blockLetters = new Map<string, THREE.CanvasTexture>();
  for (const [ch, hex] of letterSpecs) {
    blockLetters.set(ch, makeAlphabetBlockTexture(ch, hex));
  }

  const rugPair = makeKnitPatchworkRugPair(lowInit ? 512 : 1024);
  cachedSet = {
    feltGreen: makeFeltTexture('#66b946', '#83d459', '#4a9830', '#a6eb7b'),
    feltBlue: makeFeltTexture('#4a8fd9', '#6ab0f2', '#3572b8', '#a9d7ff'),
    feltBump: makeFeltBump(),
    woodDeck: makeWoodTexture('#e8c38e', '#b9894d', true),
    woodCrate: makeCrateTexture(),
    patchworkQuilt: makePatchworkTexture(),
    knitPatchworkRug: rugPair.albedo,
    knitPatchworkNormal: rugPair.normal,
    radialWalnutPlanks: makeRadialWalnutPlanks(),
    pastelSlidePink: makePastelPlasticTexture('#f79ac0', '#ffc2dc'),
    pastelSlideMint: makePastelPlasticTexture('#78deb0', '#a9f3d2'),
    rainbowBridge: makeRainbowTexture(),
    brassGear: makeBrassGearTexture(),
    checkerFinish: makeCheckerFinish(),
    coinCrown: makeCoinCrownTexture(),
    blockLetters,
    blockWoodSide: makeWoodTexture('#f0d8a8', '#d5b378', false),
  };
  return cachedSet;
}

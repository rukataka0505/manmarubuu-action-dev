import * as THREE from 'three';
import { getProceduralTextures } from '../assets/ProceduralTextures';
import type { PbrAssets } from '../assets/PbrAssets';
import type { ResolvedQuality } from '../types';
import type { PhysicsWorld } from '../core/PhysicsWorld';
import type { ToyBlocksManager } from './ToyBlocksManager';
import type { CollectiblesManager } from './Collectibles';
import type { GimmicksManager } from './Gimmicks';
import type { WorldPropsManager } from './WorldPropsManager';
import type { CraftTerrainBuilder } from './CraftTerrainBuilder';
import type { StylizedGrassField } from './StylizedGrassField';
import type { JellySlime } from '../entities/JellySlime';
import type { WindupTank } from '../entities/WindupTank';
import type { PropellerBalloon } from '../entities/PropellerBalloon';
import type { CushionVisualSpec, WorldBuildResult } from './World1Builder';

interface TrainAnim {
  group: THREE.Group;
  chimneyLocal: THREE.Vector3;
}

interface SteamPuff {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  vel: THREE.Vector3;
}

interface PlayroomTextureCache {
  floorPlanks: THREE.CanvasTexture;
  floorBump: THREE.CanvasTexture;
  patchworkRug: THREE.CanvasTexture;
  rugBump: THREE.CanvasTexture;
  upperWallPlaster: THREE.CanvasTexture;
  bossFeltMat: THREE.CanvasTexture;
  sketchbookDraw: THREE.CanvasTexture;
  wainscot: THREE.CanvasTexture;
  wainscotBump: THREE.CanvasTexture;
  windowOutside: THREE.CanvasTexture;
  sunbeamAlpha: THREE.CanvasTexture;
  windowLightPool: THREE.CanvasTexture;
  woodRail: THREE.CanvasTexture;
  toyBlockFace: THREE.CanvasTexture;
  cushionPlaid: THREE.CanvasTexture;
  cushionStripe: THREE.CanvasTexture;
  wallArtRainbow: THREE.CanvasTexture;
  wallArtStars: THREE.CanvasTexture;
  wallArtBalloons: THREE.CanvasTexture;
  bookRocket: THREE.CanvasTexture;
  bookBear: THREE.CanvasTexture;
  bookCastle: THREE.CanvasTexture;
  bookPages: THREE.CanvasTexture;
}

let cachedPlayroomTextures: PlayroomTextureCache | null = null;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function makeCanvasTex(
  c: HTMLCanvasElement,
  repX = 1,
  repY = 1,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function getPlayroomTextures(): PlayroomTextureCache {
  if (cachedPlayroomTextures) return cachedPlayroomTextures;

  // 1. Rich honey-oak hardwood planks + matching bevel bump map (1024x1024)
  const [fc, fctx] = makeCanvas(1024, 1024);
  const [fbc, fbctx] = makeCanvas(1024, 1024);
  fbctx.fillStyle = '#dcdcdc';
  fbctx.fillRect(0, 0, 1024, 1024);
  const plankH = 128;
  const plankTones = ['#d89f62', '#cc9052', '#dfb176', '#c58749', '#d49a5d', '#ce9b64', '#dba66b'];
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 256 + ((row * 73) % 128);
    for (let col = -1; col < 3; col++) {
      const x = col * 512 + offset;
      const baseHex = plankTones[(row * 3 + col + 14) % plankTones.length];
      fctx.fillStyle = baseHex;
      fctx.fillRect(x, row * plankH, 512, plankH);

      // Subtle warm length-wise plank variation gradient
      const pg = fctx.createLinearGradient(x, row * plankH, x + 512, row * plankH);
      pg.addColorStop(0, 'rgba(255, 238, 205, 0.09)');
      pg.addColorStop(0.5, 'rgba(130, 74, 28, 0.04)');
      pg.addColorStop(1, 'rgba(95, 52, 18, 0.09)');
      fctx.fillStyle = pg;
      fctx.fillRect(x, row * plankH, 512, plankH);

      // Organic wavy wood grain fibers
      for (let gy = 5; gy < plankH - 4; gy += 6) {
        const dark = (gy + row * 7) % 12 === 0;
        fctx.strokeStyle = dark ? 'rgba(96, 52, 18, 0.14)' : 'rgba(128, 74, 28, 0.07)';
        fctx.lineWidth = dark ? 2.2 : 1.4;
        fctx.beginPath();
        for (let gx = 0; gx <= 512; gx += 32) {
          const wy = row * plankH + gy + Math.sin(gx * 0.018 + row * 1.9 + gy * 0.11) * 2.4;
          if (gx === 0) fctx.moveTo(x + gx, wy);
          else fctx.lineTo(x + gx, wy);
        }
        fctx.stroke();

        fbctx.strokeStyle = dark ? 'rgba(175, 175, 175, 0.25)' : 'rgba(200, 200, 200, 0.15)';
        fbctx.lineWidth = 1.5;
        fbctx.beginPath();
        fbctx.moveTo(x, row * plankH + gy);
        fbctx.lineTo(x + 512, row * plankH + gy);
        fbctx.stroke();
      }

      // Occasional warm oak knot
      if ((row + col + 5) % 3 === 0) {
        const kx = x + 130 + ((row * 97) % 240);
        const ky = row * plankH + 38 + ((row * 31) % 52);
        fctx.fillStyle = 'rgba(104, 58, 22, 0.22)';
        fctx.beginPath();
        fctx.ellipse(kx, ky, 18, 7, 0.08, 0, Math.PI * 2);
        fctx.fill();
        fctx.strokeStyle = 'rgba(104, 58, 22, 0.14)';
        fctx.lineWidth = 2;
        fctx.beginPath();
        fctx.ellipse(kx, ky, 30, 12, 0.08, 0, Math.PI * 2);
        fctx.stroke();
      }

      // Vertical plank end V-groove seam
      fctx.fillStyle = 'rgba(72, 38, 12, 0.56)';
      fctx.fillRect(x, row * plankH, 4, plankH);
      fctx.fillStyle = 'rgba(255, 236, 200, 0.20)';
      fctx.fillRect(x + 4, row * plankH, 3, plankH);
      fbctx.fillStyle = '#2a2a2a';
      fbctx.fillRect(x, row * plankH, 5, plankH);
    }

    // Horizontal plank V-groove bevel seam
    fctx.fillStyle = 'rgba(68, 36, 12, 0.52)';
    fctx.fillRect(0, row * plankH, 1024, 5);
    fctx.fillStyle = 'rgba(255, 236, 204, 0.22)';
    fctx.fillRect(0, row * plankH + 5, 1024, 3);
    fbctx.fillStyle = '#242424';
    fbctx.fillRect(0, row * plankH, 1024, 6);
    fbctx.fillStyle = '#f2f2f2';
    fbctx.fillRect(0, row * plankH + 6, 1024, 4);
  }
  const floorPlanks = makeCanvasTex(fc, 10, 14, true);
  const floorBump = makeCanvasTex(fbc, 10, 14, false);

  // 2. Vibrant Sunlit Playroom Patchwork Rug + Plush Felt Fiber & Quilted Puff Bump Map (01_kids_room.jpg palette!)
  const [rc, rctx] = makeCanvas(1024, 1024);
  const [rbc, rbctx] = makeCanvas(1024, 1024);
  rbctx.fillStyle = '#c8c8c8';
  rbctx.fillRect(0, 0, 1024, 1024);
  const grid = 6;
  const cell = 1024 / grid;
  const rugPalette = [
    '#3598a8', // rich felt teal
    '#ecc044', // warm sunny yellow
    '#e5869b', // cozy blush rose
    '#5cb268', // plush leaf green
    '#e89866', // warm apricot peach
    '#9e84c8', // soft lavender
    '#46a2bc', // sky turquoise
    '#eba848', // warm honey gold
  ];
  const hash01 = (n: number): number => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453123;
    return s - Math.floor(s);
  };

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const ci = (row * 3 + col * 2 + (row % 2)) % rugPalette.length;
      const x = col * cell;
      const y = row * cell;
      rctx.fillStyle = rugPalette[ci];
      rctx.fillRect(x, y, cell, cell);

      // Soft quilted puff height in bump map first so fine felt wool fibers layer cleanly on top
      const bg = rbctx.createRadialGradient(
        x + cell * 0.5,
        y + cell * 0.5,
        cell * 0.08,
        x + cell * 0.5,
        y + cell * 0.5,
        cell * 0.72
      );
      bg.addColorStop(0, '#f2f2f2');
      bg.addColorStop(0.76, '#d0d0d0');
      bg.addColorStop(1, '#525252');
      rbctx.fillStyle = bg;
      rbctx.fillRect(x, y, cell, cell);

      // Organic non-periodic wool-felt micro-fibers & soft heathered speckles (zero repeating diagonal bands!)
      const cellBase = (row * grid + col + 1) * 1317;
      for (let f = 0; f < 860; f++) {
        const s0 = cellBase + f * 3.17;
        const fx = x + 3 + hash01(s0 + 1.1) * (cell - 6);
        const fy = y + 3 + hash01(s0 + 2.7) * (cell - 6);
        const ang = hash01(s0 + 4.3) * Math.PI * 2;
        const len = 1.8 + hash01(s0 + 6.9) * 3.2;
        const dx = Math.cos(ang) * len;
        const dy = Math.sin(ang) * len;
        const tone = hash01(s0 + 9.5);
        rctx.strokeStyle =
          tone < 0.36
            ? 'rgba(255, 250, 236, 0.13)'
            : tone < 0.72
              ? 'rgba(64, 38, 18, 0.085)'
              : 'rgba(255, 242, 212, 0.08)';
        rctx.lineWidth = tone > 0.8 ? 1.35 : 0.95;
        rctx.beginPath();
        rctx.moveTo(fx, fy);
        rctx.lineTo(fx + dx, fy + dy);
        rctx.stroke();

        if ((f & 1) === 0) {
          rbctx.strokeStyle = tone < 0.5 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(86, 86, 86, 0.13)';
          rbctx.lineWidth = 1.0;
          rbctx.beginPath();
          rbctx.moveTo(fx, fy);
          rbctx.lineTo(fx + dx, fy + dy);
          rbctx.stroke();
        }
      }

      // Soft quilted puff lighting (warm glowing center, gently tucked shaded seams)
      const g = rctx.createRadialGradient(
        x + cell * 0.48,
        y + cell * 0.46,
        cell * 0.05,
        x + cell * 0.5,
        y + cell * 0.5,
        cell * 0.72
      );
      g.addColorStop(0, 'rgba(255, 250, 232, 0.13)');
      g.addColorStop(0.72, 'rgba(255, 250, 232, 0.0)');
      g.addColorStop(1, 'rgba(58, 34, 16, 0.22)');
      rctx.fillStyle = g;
      rctx.fillRect(x, y, cell, cell);
    }
  }
  // Subtle recessed seam grooves + cream dashed hand-quilted stitches
  rctx.strokeStyle = 'rgba(60, 36, 18, 0.30)';
  rctx.lineWidth = 7.5;
  rbctx.strokeStyle = '#303030';
  rbctx.lineWidth = 8.5;
  for (let i = 1; i < grid; i++) {
    rctx.beginPath();
    rctx.moveTo(i * cell, 0);
    rctx.lineTo(i * cell, 1024);
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(0, i * cell);
    rctx.lineTo(1024, i * cell);
    rctx.stroke();

    rbctx.beginPath();
    rbctx.moveTo(i * cell, 0);
    rbctx.lineTo(i * cell, 1024);
    rbctx.stroke();
    rbctx.beginPath();
    rbctx.moveTo(0, i * cell);
    rbctx.lineTo(1024, i * cell);
    rbctx.stroke();
  }

  rctx.strokeStyle = 'rgba(255, 248, 228, 0.88)';
  rctx.lineWidth = 4.5;
  rctx.setLineDash([12, 9]);
  rbctx.strokeStyle = '#ffffff';
  rbctx.lineWidth = 4;
  rbctx.setLineDash([12, 9]);
  for (let i = 1; i < grid; i++) {
    rctx.beginPath();
    rctx.moveTo(i * cell, 0);
    rctx.lineTo(i * cell, 1024);
    rctx.stroke();
    rctx.beginPath();
    rctx.moveTo(0, i * cell);
    rctx.lineTo(1024, i * cell);
    rctx.stroke();

    rbctx.beginPath();
    rbctx.moveTo(i * cell, 0);
    rbctx.lineTo(i * cell, 1024);
    rbctx.stroke();
    rbctx.beginPath();
    rbctx.moveTo(0, i * cell);
    rbctx.lineTo(1024, i * cell);
    rbctx.stroke();
  }
  rctx.setLineDash([]);
  rbctx.setLineDash([]);
  // Outer stitched woven trim border
  rctx.strokeStyle = '#e9d8b8';
  rctx.lineWidth = 22;
  rctx.strokeRect(11, 11, 1002, 1002);
  rctx.strokeStyle = 'rgba(255, 250, 236, 0.9)';
  rctx.lineWidth = 4;
  rctx.setLineDash([10, 8]);
  rctx.strokeRect(22, 22, 980, 980);
  rctx.setLineDash([]);
  const patchworkRug = makeCanvasTex(rc, 1, 1, true);
  const rugBump = makeCanvasTex(rbc, 1, 1, false);

  // 3. White Wainscoting Wall Panels + Bump Map
  const [wc, wctx] = makeCanvas(512, 256);
  const [wbc, wbctx] = makeCanvas(512, 256);
  wctx.fillStyle = '#f8f0e2';
  wctx.fillRect(0, 0, 512, 256);
  wbctx.fillStyle = '#d8d8d8';
  wbctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 4; i++) {
    const px = i * 128 + 14;
    wctx.fillStyle = '#e7dcc8';
    wctx.fillRect(px, 24, 100, 204);
    wctx.strokeStyle = '#d4c3aa';
    wctx.lineWidth = 4;
    wctx.strokeRect(px, 24, 100, 204);
    wctx.fillStyle = '#fcf7ee';
    wctx.fillRect(px + 9, 33, 82, 186);

    wbctx.fillStyle = '#707070';
    wbctx.fillRect(px, 24, 100, 204);
    wbctx.fillStyle = '#ececec';
    wbctx.fillRect(px + 9, 33, 82, 186);
  }
  const wainscot = makeCanvasTex(wc, 10, 1, true);
  const wainscotBump = makeCanvasTex(wbc, 10, 1, false);

  // 4. Sunlit Window Outside Daylight View (soft glowing garden & morning sky)
  const [vc, vctx] = makeCanvas(512, 512);
  const skyG = vctx.createLinearGradient(0, 0, 0, 512);
  skyG.addColorStop(0.0, '#fffff4');
  skyG.addColorStop(0.32, '#fff9dc');
  skyG.addColorStop(0.64, '#e6f6e4');
  skyG.addColorStop(1.0, '#cde8a8');
  vctx.fillStyle = skyG;
  vctx.fillRect(0, 0, 512, 512);
  const sunG = vctx.createRadialGradient(290, 140, 20, 290, 140, 250);
  sunG.addColorStop(0, 'rgba(255, 255, 248, 1.0)');
  sunG.addColorStop(0.45, 'rgba(255, 247, 205, 0.85)');
  sunG.addColorStop(1, 'rgba(255, 242, 185, 0.0)');
  vctx.fillStyle = sunG;
  vctx.fillRect(0, 0, 512, 512);
  // Soft sunlit garden foliage layers
  vctx.fillStyle = 'rgba(186, 222, 134, 0.65)';
  for (let i = 0; i < 8; i++) {
    vctx.beginPath();
    vctx.arc(32 + i * 68, 415 + (i % 2) * 26, 95, 0, Math.PI * 2);
    vctx.fill();
  }
  vctx.fillStyle = 'rgba(154, 204, 112, 0.72)';
  for (let i = 0; i < 7; i++) {
    vctx.beginPath();
    vctx.arc(46 + i * 74, 468 + (i % 2) * 16, 84, 0, Math.PI * 2);
    vctx.fill();
  }
  const windowOutside = makeCanvasTex(vc, 1, 1, true);

  // 4b. Soft feathered sunbeam alpha mask (eliminates hard polygon edges!)
  const [sbc, sbctx] = makeCanvas(256, 256);
  const sbHoriz = sbctx.createLinearGradient(0, 0, 256, 0);
  sbHoriz.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  sbHoriz.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
  sbHoriz.addColorStop(0.50, 'rgba(255, 255, 255, 1.0)');
  sbHoriz.addColorStop(0.75, 'rgba(255, 255, 255, 0.85)');
  sbHoriz.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  sbctx.fillStyle = sbHoriz;
  sbctx.fillRect(0, 0, 256, 256);
  sbctx.globalCompositeOperation = 'destination-in';
  const sbVert = sbctx.createLinearGradient(0, 0, 0, 256);
  sbVert.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  sbVert.addColorStop(0.14, 'rgba(255, 255, 255, 0.95)');
  sbVert.addColorStop(0.55, 'rgba(255, 255, 255, 0.45)');
  sbVert.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  sbctx.fillStyle = sbVert;
  sbctx.fillRect(0, 0, 256, 256);
  sbctx.globalCompositeOperation = 'source-over';
  const sunbeamAlpha = makeCanvasTex(sbc, 1, 1, false);
  sunbeamAlpha.wrapS = THREE.ClampToEdgeWrapping;
  sunbeamAlpha.wrapT = THREE.ClampToEdgeWrapping;

  // 4c. Soft dappled window light pool cast onto floor & patchwork rug
  const [lpc, lpctx] = makeCanvas(512, 512);
  lpctx.fillStyle = '#000000';
  lpctx.fillRect(0, 0, 512, 512);
  lpctx.filter = 'blur(16px)';
  lpctx.fillStyle = '#ffe9b2';
  const cols = 4;
  const rows = 3;
  const padX = 56;
  const padY = 58;
  const paneW = (512 - padX * 2 - (cols - 1) * 20) / cols;
  const paneH = (512 - padY * 2 - (rows - 1) * 24) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = padX + c * (paneW + 20);
      const py = padY + r * (paneH + 24);
      lpctx.fillRect(px, py, paneW, paneH);
    }
  }
  lpctx.filter = 'none';
  const windowLightPool = makeCanvasTex(lpc, 1, 1, true);
  windowLightPool.wrapS = THREE.ClampToEdgeWrapping;
  windowLightPool.wrapT = THREE.ClampToEdgeWrapping;

  // 4d. Brio-style wooden rail texture with carved puzzle joints & shaded wheel grooves
  const [trc, trctx] = makeCanvas(512, 512);
  trctx.fillStyle = '#e0b378';
  trctx.fillRect(0, 0, 512, 512);
  // Natural birch/beech grain along track length (V axis)
  for (let gx = 4; gx < 512; gx += 7) {
    trctx.fillStyle = gx % 14 === 0 ? 'rgba(128, 76, 30, 0.11)' : 'rgba(255, 240, 210, 0.08)';
    trctx.fillRect(gx, 0, 3, 512);
  }
  // Darker recessed wheel track grooves matching cross-section U positions
  trctx.fillStyle = 'rgba(116, 68, 26, 0.28)';
  trctx.fillRect(102, 0, 62, 512);
  trctx.fillRect(348, 0, 62, 512);
  // Brio wooden peg-and-socket track segment seams (2 joints per tile)
  for (const jy of [128, 384]) {
    trctx.strokeStyle = 'rgba(84, 46, 16, 0.52)';
    trctx.lineWidth = 4;
    trctx.beginPath();
    trctx.moveTo(0, jy);
    trctx.lineTo(222, jy);
    trctx.arc(256, jy + 18, 26, Math.PI * 1.15, Math.PI * -0.15, true);
    trctx.lineTo(512, jy);
    trctx.stroke();

    trctx.strokeStyle = 'rgba(255, 238, 206, 0.34)';
    trctx.lineWidth = 2;
    trctx.beginPath();
    trctx.moveTo(0, jy + 3);
    trctx.lineTo(220, jy + 3);
    trctx.stroke();
  }
  const woodRail = makeCanvasTex(trc, 1, 10, true);

  // 4e. Painted wooden toy block bevel-framed face texture (removes raw box look on castle blocks!)
  const [tbc, tbctx] = makeCanvas(256, 256);
  tbctx.fillStyle = '#ffffff';
  tbctx.fillRect(0, 0, 256, 256);
  // Subtle wood grain
  tbctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
  for (let y = 4; y < 256; y += 8) {
    tbctx.fillRect(0, y, 256, 2);
  }
  // 2x2 stacked toy-block seam lines & soft beveled highlights
  const half = 128;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const bx = c * half;
      const by = r * half;
      tbctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
      tbctx.lineWidth = 6;
      tbctx.strokeRect(bx + 3, by + 3, half - 6, half - 6);
      tbctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      tbctx.lineWidth = 4;
      tbctx.strokeRect(bx + 9, by + 9, half - 18, half - 18);
    }
  }
  const toyBlockFace = makeCanvasTex(tbc, 1, 1, true);

  // 4f. Woven Plaid & Stripe Cushion Fabrics (01_kids_room.jpg cushion mountain variety!)
  const [cpc, cpctx] = makeCanvas(256, 256);
  cpctx.fillStyle = '#fff9ee';
  cpctx.fillRect(0, 0, 256, 256);
  cpctx.fillStyle = 'rgba(220, 120, 96, 0.45)';
  cpctx.fillRect(0, 0, 128, 128);
  cpctx.fillRect(128, 128, 128, 128);
  cpctx.fillStyle = 'rgba(244, 198, 90, 0.42)';
  cpctx.fillRect(128, 0, 128, 128);
  cpctx.fillRect(0, 128, 128, 128);
  cpctx.strokeStyle = 'rgba(255, 252, 240, 0.85)';
  cpctx.lineWidth = 4;
  cpctx.setLineDash([8, 6]);
  cpctx.beginPath();
  cpctx.moveTo(128, 0);
  cpctx.lineTo(128, 256);
  cpctx.moveTo(0, 128);
  cpctx.lineTo(256, 128);
  cpctx.stroke();
  cpctx.setLineDash([]);
  const cushionPlaid = makeCanvasTex(cpc, 2, 2, true);

  const [csc, csctx] = makeCanvas(256, 256);
  csctx.fillStyle = '#fdf8ec';
  csctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      csctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    } else {
      csctx.fillStyle = 'rgba(120, 120, 120, 0.14)';
    }
    csctx.fillRect(0, i * 32, 256, 32);
  }
  const cushionStripe = makeCanvasTex(csc, 1, 1, true);

  // 4g. Framed Wall Art Posters (Rainbow, Starry Moon, Hot-Air Balloons!)
  const makeWallArt = (kind: 'rainbow' | 'stars' | 'balloons'): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(256, 320);
    ctx.fillStyle = '#fdf6e7';
    ctx.fillRect(0, 0, 256, 320);
    if (kind === 'rainbow') {
      ctx.fillStyle = '#e2f4ff';
      ctx.fillRect(16, 16, 224, 288);
      const bands = ['#f27b82', '#f7be64', '#f7e078', '#8ad294', '#72b8ea'];
      bands.forEach((col, idx) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(128, 224, 92 - idx * 14, Math.PI, 0);
        ctx.stroke();
      });
      ctx.fillStyle = '#ffffff';
      for (const [cx, cy, r] of [
        [52, 226, 24],
        [78, 228, 20],
        [178, 228, 20],
        [204, 226, 24],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'stars') {
      ctx.fillStyle = '#4e6c9e';
      ctx.fillRect(16, 16, 224, 288);
      // Crescent moon
      ctx.fillStyle = '#ffe580';
      ctx.beginPath();
      ctx.arc(124, 148, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4e6c9e';
      ctx.beginPath();
      ctx.arc(146, 134, 44, 0, Math.PI * 2);
      ctx.fill();
      // Twinkling stars
      ctx.fillStyle = '#fff3b8';
      for (const [sx, sy, sr] of [
        [62, 74, 9],
        [192, 82, 11],
        [184, 214, 8],
        [68, 232, 10],
        [136, 254, 7],
      ]) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#eaf6ec';
      ctx.fillRect(16, 16, 224, 288);
      // Two cute hot air balloons
      const drawBalloon = (bx: number, by: number, r: number, col1: string, col2: string) => {
        ctx.fillStyle = col1;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col2;
        ctx.fillRect(bx - r * 0.9, by - 7, r * 1.8, 14);
        ctx.strokeStyle = '#9c7244';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx - 10, by + r);
        ctx.lineTo(bx - 7, by + r + 18);
        ctx.moveTo(bx + 10, by + r);
        ctx.lineTo(bx + 7, by + r + 18);
        ctx.stroke();
        ctx.fillStyle = '#c88c4e';
        ctx.fillRect(bx - 12, by + r + 16, 24, 16);
      };
      drawBalloon(98, 126, 40, '#f08294', '#ffe588');
      drawBalloon(172, 194, 30, '#68b4e2', '#fff4dc');
    }
    return makeCanvasTex(c, 1, 1, true);
  };

  // 5. Picture Book Covers (Rocket, Bear Meadow, Castle!)
  const makeRocketBook = (): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(256, 320);
    ctx.fillStyle = '#4876b8';
    ctx.fillRect(0, 0, 256, 320);
    ctx.strokeStyle = '#9ec5f2';
    ctx.lineWidth = 14;
    ctx.strokeRect(14, 14, 228, 292);
    // Stars
    ctx.fillStyle = '#ffe566';
    for (const [sx, sy, sr] of [
      [56, 72, 10],
      [204, 88, 8],
      [68, 238, 7],
      [196, 224, 11],
      [176, 56, 6],
    ]) {
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cute Rocket
    ctx.save();
    ctx.translate(128, 162);
    ctx.rotate(0.42);
    ctx.fillStyle = '#ff9838';
    ctx.beginPath();
    ctx.moveTo(-16, 46);
    ctx.lineTo(0, 88);
    ctx.lineTo(16, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e84c52';
    ctx.beginPath();
    ctx.moveTo(-26, 24);
    ctx.lineTo(-48, 56);
    ctx.lineTo(-18, 46);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 24);
    ctx.lineTo(48, 56);
    ctx.lineTo(18, 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff5e4';
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e84c52';
    ctx.beginPath();
    ctx.moveTo(-22, -32);
    ctx.lineTo(0, -72);
    ctx.lineTo(22, -32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6ec8ff';
    ctx.beginPath();
    ctx.arc(0, -6, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return makeCanvasTex(c, 1, 1, true);
  };

  const makeBearBook = (): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(256, 320);
    ctx.fillStyle = '#7ec468';
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = '#bce6ff';
    ctx.fillRect(16, 16, 224, 130);
    ctx.fillStyle = '#76bf58';
    ctx.beginPath();
    ctx.ellipse(128, 180, 140, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    // Friendly bear silhouette
    ctx.fillStyle = '#9c6336';
    ctx.beginPath();
    ctx.ellipse(128, 200, 48, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(158, 162, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(146, 140, 9, 0, Math.PI * 2);
    ctx.arc(172, 142, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#eaf7d4';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, 232, 296);
    return makeCanvasTex(c, 1, 1, true);
  };

  const makeCastleBook = (): THREE.CanvasTexture => {
    const [c, ctx] = makeCanvas(256, 320);
    ctx.fillStyle = '#f5ebd6';
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = '#c8e9ff';
    ctx.fillRect(18, 18, 220, 185);
    ctx.fillStyle = '#89cb74';
    ctx.fillRect(18, 195, 220, 107);
    // Fairytale castle
    ctx.fillStyle = '#f4d9a6';
    ctx.fillRect(74, 130, 108, 72);
    ctx.fillRect(62, 98, 30, 104);
    ctx.fillRect(164, 98, 30, 104);
    ctx.fillRect(112, 82, 32, 120);
    ctx.fillStyle = '#ee6c7c';
    for (const [tx, ty, tw] of [
      [77, 98, 20],
      [128, 82, 22],
      [179, 98, 20],
    ]) {
      ctx.beginPath();
      ctx.moveTo(tx - tw, ty);
      ctx.lineTo(tx, ty - 34);
      ctx.lineTo(tx + tw, ty);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#d49e5c';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, 232, 296);
    return makeCanvasTex(c, 1, 1, true);
  };

  const [pc, pctx] = makeCanvas(128, 128);
  pctx.fillStyle = '#fff8ea';
  pctx.fillRect(0, 0, 128, 128);
  pctx.fillStyle = 'rgba(180, 155, 115, 0.35)';
  for (let y = 0; y < 128; y += 6) {
    pctx.fillRect(0, y, 128, 2);
  }
  const bookPages = makeCanvasTex(pc, 2, 2, true);

  // 6. Warm Sunlit Buttercream Plaster Wall Texture (01_kids_room.jpg warm cream glow!)
  const [uwc, uwctx] = makeCanvas(512, 512);
  const wallGrad = uwctx.createLinearGradient(0, 0, 0, 512);
  wallGrad.addColorStop(0.0, '#fce9c2');
  wallGrad.addColorStop(0.45, '#fdecc9');
  wallGrad.addColorStop(1.0, '#f8e0b2');
  uwctx.fillStyle = wallGrad;
  uwctx.fillRect(0, 0, 512, 512);
  // Subtle warm plaster/wallpaper grain
  for (let i = 0; i < 600; i++) {
    const px = (i * 73) % 512;
    const py = (i * 131) % 512;
    uwctx.fillStyle = i % 2 === 0 ? 'rgba(255, 252, 238, 0.12)' : 'rgba(210, 170, 112, 0.06)';
    uwctx.fillRect(px, py, 6, 4);
  }
  const upperWallPlaster = makeCanvasTex(uwc, 4, 1, true);
  upperWallPlaster.wrapT = THREE.ClampToEdgeWrapping;

  // 7. Kids-Room Round Felt Playmat for the North Toybox Boss Stage!
  const [bfc, bfctx] = makeCanvas(1024, 1024);
  bfctx.fillStyle = '#fbf0d8';
  bfctx.fillRect(0, 0, 1024, 1024);
  // Concentric pastel felt play rings
  const ringSpecs: Array<[number, string]> = [
    [492, '#f4c76e'],
    [464, '#88cf9b'],
    [412, '#fcf3df'],
    [354, '#f5a6b4'],
    [318, '#fdf6e6'],
    [210, '#8ecae6'],
    [176, '#fff8e8'],
  ];
  for (const [rad, hex] of ringSpecs) {
    bfctx.fillStyle = hex;
    bfctx.beginPath();
    bfctx.arc(512, 512, rad, 0, Math.PI * 2);
    bfctx.fill();
  }
  // Dashed hand-stitched craft lines around felt rings
  bfctx.strokeStyle = 'rgba(255, 252, 242, 0.92)';
  bfctx.lineWidth = 6;
  bfctx.setLineDash([16, 12]);
  for (const rad of [476, 424, 336, 194]) {
    bfctx.beginPath();
    bfctx.arc(512, 512, rad, 0, Math.PI * 2);
    bfctx.stroke();
  }
  bfctx.setLineDash([]);
  // Central cute stitched golden star applique
  bfctx.fillStyle = '#ffd65c';
  bfctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 118 : 54;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const sx = 512 + Math.cos(a) * r;
    const sy = 512 + Math.sin(a) * r;
    if (i === 0) bfctx.moveTo(sx, sy);
    else bfctx.lineTo(sx, sy);
  }
  bfctx.closePath();
  bfctx.fill();
  bfctx.strokeStyle = '#e89e3c';
  bfctx.lineWidth = 7;
  bfctx.stroke();
  // Small decorative pastel stars around the outer felt ring
  const miniCols = ['#ef6c78', '#f5c242', '#64c284', '#5caae8', '#b88ae6'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = 512 + Math.cos(a) * 265;
    const cy = 512 + Math.sin(a) * 265;
    bfctx.fillStyle = miniCols[i % miniCols.length];
    bfctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 28 : 13;
      const ka = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(ka) * r;
      const py = cy + Math.sin(ka) * r;
      if (k === 0) bfctx.moveTo(px, py);
      else bfctx.lineTo(px, py);
    }
    bfctx.closePath();
    bfctx.fill();
  }
  // Subtle felt wool texture speckle
  for (let i = 0; i < 1400; i++) {
    const fx = (i * 197) % 1024;
    const fy = (i * 313) % 1024;
    bfctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.14)' : 'rgba(110, 75, 42, 0.06)';
    bfctx.fillRect(fx, fy, 4, 3);
  }
  const bossFeltMat = makeCanvasTex(bfc, 1, 1, true);
  bossFeltMat.wrapS = THREE.ClampToEdgeWrapping;
  bossFeltMat.wrapT = THREE.ClampToEdgeWrapping;

  // 8. Cute Crayon Drawing Sketchbook Page for foreground floor detail!
  const [skc, skctx] = makeCanvas(256, 192);
  skctx.fillStyle = '#fffdf6';
  skctx.fillRect(0, 0, 256, 192);
  skctx.strokeStyle = '#d8ccb6';
  skctx.lineWidth = 4;
  skctx.beginPath();
  skctx.moveTo(128, 0);
  skctx.lineTo(128, 192);
  skctx.stroke();
  // Crayon rainbow on right page
  const skCols = ['#ef5b62', '#f7a440', '#f7d84a', '#6cc878', '#56a6e8'];
  skCols.forEach((hex, i) => {
    skctx.strokeStyle = hex;
    skctx.lineWidth = 8;
    skctx.beginPath();
    skctx.arc(192, 134, 48 - i * 8, Math.PI, 0);
    skctx.stroke();
  });
  // Crayon sun & smiling pig doodle on left page
  skctx.fillStyle = '#ffd54a';
  skctx.beginPath();
  skctx.arc(46, 46, 18, 0, Math.PI * 2);
  skctx.fill();
  skctx.fillStyle = '#ffb8c8';
  skctx.beginPath();
  skctx.arc(72, 122, 26, 0, Math.PI * 2);
  skctx.fill();
  skctx.fillStyle = '#ff8fa8';
  skctx.beginPath();
  skctx.ellipse(72, 126, 11, 8, 0, 0, Math.PI * 2);
  skctx.fill();
  const sketchbookDraw = makeCanvasTex(skc, 1, 1, true);

  cachedPlayroomTextures = {
    floorPlanks,
    floorBump,
    patchworkRug,
    rugBump,
    upperWallPlaster,
    bossFeltMat,
    sketchbookDraw,
    wainscot,
    wainscotBump,
    windowOutside,
    sunbeamAlpha,
    windowLightPool,
    woodRail,
    toyBlockFace,
    cushionPlaid,
    cushionStripe,
    wallArtRainbow: makeWallArt('rainbow'),
    wallArtStars: makeWallArt('stars'),
    wallArtBalloons: makeWallArt('balloons'),
    bookRocket: makeRocketBook(),
    bookBear: makeBearBook(),
    bookCastle: makeCastleBook(),
    bookPages,
  };
  return cachedPlayroomTextures;
}

export class World1PlayroomBuilder {
  private textures = getProceduralTextures();
  private roomTex = getPlayroomTextures();
  private group = new THREE.Group();
  private pbr?: PbrAssets;
  private worldProps?: WorldPropsManager;
  public readonly cushionSpecs: CushionVisualSpec[] = [];
  private slabBodyMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private trainCurve: THREE.CatmullRomCurve3 | null = null;
  private trainAnim: TrainAnim | null = null;
  private trainProgress = 0;
  private trainWobbleTime = 0;
  private trainSteamPuffs: SteamPuff[] = [];
  private steamSpawnTimer = 0;
  private sunbeamMeshes: THREE.Mesh[] = [];
  private pitCenterLight: THREE.PointLight | null = null;
  private primaryLanternLight: THREE.PointLight | null = null;
  private extraBossPointLights: THREE.PointLight[] = [];
  private bossDetailObjects: THREE.Object3D[] = [];
  private quality: ResolvedQuality = 'medium';

  constructor(scene: THREE.Scene, pbr?: PbrAssets) {
    scene.add(this.group);
    this.pbr = pbr;
  }

  private getWoodMaterial(colorHex = 0xdba565, repeatX = 2, repeatY = 2): THREE.MeshStandardMaterial {
    const key = `wood_${colorHex}_${repeatX}_${repeatY}`;
    const cached = this.slabBodyMatCache.get(key);
    if (cached) return cached;
    const oak = this.pbr?.cloneMaps('oakVeneer', repeatX, repeatY);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      map: oak?.diff ?? this.textures.blockWoodSide,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: oak?.rough ?? null,
      roughness: 0.52,
      envMapIntensity: 0.52,
    });
    this.slabBodyMatCache.set(key, mat);
    return mat;
  }

  private getPaintedMat(colorHex: number, roughness = 0.44): THREE.MeshStandardMaterial {
    const key = `paint_${colorHex}_${roughness.toFixed(2)}`;
    const cached = this.slabBodyMatCache.get(key);
    if (cached) return cached;
    const oak = this.pbr?.cloneMaps('oakVeneer', 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness,
      metalness: 0.02,
      envMapIntensity: 0.52,
    });
    this.slabBodyMatCache.set(key, mat);
    return mat;
  }

  private getToyBlockMat(colorHex: number, repeatX = 1, repeatY = 1): THREE.MeshStandardMaterial {
    const key = `toyblk_${colorHex}_${repeatX}_${repeatY}`;
    const cached = this.slabBodyMatCache.get(key);
    if (cached) return cached;
    const tex = this.roomTex.toyBlockFace.clone();
    tex.repeat.set(repeatX, repeatY);
    tex.needsUpdate = true;
    const oak = this.pbr?.cloneMaps('oakVeneer', repeatX, repeatY);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      map: tex,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.46,
      metalness: 0.02,
      envMapIntensity: 0.52,
    });
    this.slabBodyMatCache.set(key, mat);
    return mat;
  }

  private addCraftSlabPlatform(
    physics: PhysicsWorld,
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    colorHex: number
  ): void {
    const slab = this.worldProps?.createModelInstance('toyPlatformSlab');
    if (slab) {
      slab.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(slab);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      if (sz.x > 0.001 && sz.y > 0.001 && sz.z > 0.001) {
        slab.scale.set(w / sz.x, h / sz.y, d / sz.z);
        slab.position.set(cx, topY - h, cz);
        slab.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.name === 'SlabBody' && obj.material instanceof THREE.MeshStandardMaterial) {
            const c = obj.material.clone();
            c.color.setHex(colorHex);
            obj.material = c;
          }
        });
        this.group.add(slab);
        physics.addStaticBox(cx, topY - h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5, { friction: 0.65 });
        return;
      }
    }
    this.addSolidBlock(physics, cx, topY, cz, w, h, d, this.getToyBlockMat(colorHex, 2, 1));
  }

  private addSolidBlock(
    physics: PhysicsWorld,
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    rotY = 0,
    castShadow = true
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, topY - h * 0.5, cz);
    mesh.rotation.y = rotY;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    physics.addStaticBox(cx, topY - h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5, {
      rotEuler: rotY !== 0 ? new THREE.Euler(0, rotY, 0) : undefined,
      friction: 0.65,
    });
    return mesh;
  }

  private addAlphabetStaticBlock(
    physics: PhysicsWorld,
    cx: number,
    bottomY: number,
    cz: number,
    size: number,
    letterIndex: number,
    withCollider = true
  ): void {
    const letters = Array.from(this.textures.blockLetters.values());
    const tex = letters[letterIndex % letters.length];
    const key = `alpha_${letterIndex % letters.length}`;
    let mat = this.slabBodyMatCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.48,
        metalness: 0.02,
        envMapIntensity: 0.5,
      });
      this.slabBodyMatCache.set(key, mat);
    }
    const custom = this.worldProps?.createRawModelInstance('alphabetBlockBevel', mat);
    if (custom) {
      const sc = size / 1.15;
      custom.scale.setScalar(sc);
      custom.position.set(cx, bottomY + size * 0.5, cz);
      this.group.add(custom);
    } else {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
      mesh.position.set(cx, bottomY + size * 0.5, cz);
      mesh.rotation.z = Math.PI;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (withCollider) {
      physics.addStaticBox(cx, bottomY + size * 0.5, cz, size * 0.5, size * 0.5, size * 0.5);
    }
  }

  private addWoodRamp(
    physics: PhysicsWorld,
    from: THREE.Vector3,
    to: THREE.Vector3,
    width: number,
    thickness = 0.45,
    colorHex = 0xdba565,
    withSideRails = true
  ): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y -= thickness * 0.5;
    const yaw = Math.atan2(dir.x, dir.z);
    const horiz = Math.hypot(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, horiz);
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');

    const mat = this.getWoodMaterial(colorHex, 1, Math.max(1, Math.round(len / 3)));
    const rampGroup = new THREE.Group();
    rampGroup.position.copy(mid);
    rampGroup.rotation.copy(euler);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, len), mat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    rampGroup.add(deck);

    if (withSideRails) {
      const railMat = this.getWoodMaterial(0xc48a4c, 1, 2);
      for (const sx of [-(width * 0.5 - 0.12), width * 0.5 - 0.12]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, len), railMat);
        rail.position.set(sx, thickness * 0.5 + 0.10, 0);
        rail.castShadow = true;
        rampGroup.add(rail);
      }
    }
    this.group.add(rampGroup);

    physics.addStaticBox(mid.x, mid.y, mid.z, width * 0.5, thickness * 0.5, len * 0.5, {
      rotEuler: euler,
      friction: 0.65,
    });
  }

  private addCushion(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY = 0,
    tintHex?: number,
    onBounceExternal?: () => void,
    pattern?: 'plaid' | 'stripe'
  ): void {
    const model = worldProps.createModelInstance('cushion');
    const spec: CushionVisualSpec = {
      cx,
      topY,
      cz,
      w,
      h,
      d,
      model: model ?? undefined,
      squashPos: 0,
      squashVel: 0,
      baseScaleY: 1,
      basePosY: topY - h,
    };

    if (model) {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      if (sz.x > 0.001 && sz.y > 0.001 && sz.z > 0.001) {
        const sx = (w * 1.08) / sz.x;
        const sy = (h * 1.18) / sz.y;
        const szScale = (d * 1.08) / sz.z;
        model.scale.set(sx, sy, szScale);
        model.rotation.y = rotY;
        model.updateMatrixWorld(true);

        const newBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        newBox.getCenter(center);
        model.position.set(cx - center.x, topY - newBox.max.y, cz - center.z);
        const fleece = this.pbr?.cloneMaps('polarFleece', 2, 2);
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if ((tintHex !== undefined || pattern) && obj.material instanceof THREE.MeshStandardMaterial) {
              const cloned = obj.material.clone();
              if (pattern === 'plaid') {
                cloned.map = this.roomTex.cushionPlaid;
                cloned.color.setHex(tintHex ?? 0xffffff);
              } else if (pattern === 'stripe') {
                cloned.map = this.roomTex.cushionStripe;
                cloned.color.setHex(tintHex ?? 0xffffff);
              } else if (tintHex !== undefined) {
                cloned.color.setHex(tintHex);
              }
              if (fleece?.nor && !cloned.normalMap) {
                cloned.normalMap = fleece.nor;
                cloned.normalScale = new THREE.Vector2(0.45, 0.45);
              }
              cloned.roughness = 0.88;
              cloned.envMapIntensity = 0.42;
              cloned.needsUpdate = true;
              obj.material = cloned;
            }
          }
        });
        spec.baseScaleY = sy;
        spec.basePosY = model.position.y;
        this.group.add(model);
      }
    } else {
      const pillow = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        this.getPaintedMat(tintHex ?? 0xf48da6, 0.78)
      );
      pillow.position.set(cx, topY - h * 0.5, cz);
      pillow.rotation.y = rotY;
      pillow.castShadow = true;
      pillow.receiveShadow = true;
      spec.model = pillow;
      spec.baseScaleY = 1;
      spec.basePosY = pillow.position.y;
      this.group.add(pillow);
    }

    this.cushionSpecs.push(spec);

    physics.addStaticBox(cx, topY - h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5, {
      rotEuler: rotY !== 0 ? new THREE.Euler(0, rotY, 0) : undefined,
      cushionTopY: topY,
      onCushion: () => {
        spec.squashVel = -8.5;
        onBounceExternal?.();
      },
      friction: 0.8,
    });
  }

  private buildRoomShell(physics: PhysicsWorld, gimmicks: GimmicksManager): void {
    // 1. Solid continuous honey-oak hardwood floor covering the ENTIRE kids room (ZERO void falls!)
    // X: -34..+34 (68m), Z: -64..+34 (98m)
    const oakNormal = this.pbr?.cloneMaps('oakVeneer', 14, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roomTex.floorPlanks,
      normalMap: oakNormal?.nor ?? null,
      normalScale: new THREE.Vector2(0.38, 0.38),
      bumpMap: this.roomTex.floorBump,
      bumpScale: 0.045,
      roughnessMap: oakNormal?.rough ?? null,
      roughness: 0.46,
      metalness: 0.02,
      envMapIntensity: 0.54,
    });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(72, 102), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, -15);
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Rock-solid continuous floor physics box
    physics.addStaticBox(0, -1.0, -15, 36, 1.0, 51, { friction: 0.65 });

    // 2. Giant colorful matte-felt patchwork rug in the main playroom (X: -25..+25, Z: -15.5..+27.5)
    const rugNormal = this.pbr?.cloneMaps('polarFleece', 12, 10)?.nor ?? this.textures.knitPatchworkNormal.clone();
    rugNormal.wrapS = THREE.RepeatWrapping;
    rugNormal.wrapT = THREE.RepeatWrapping;
    if (!this.pbr) rugNormal.repeat.set(5, 5);
    rugNormal.needsUpdate = true;
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roomTex.patchworkRug,
      normalMap: rugNormal,
      normalScale: new THREE.Vector2(0.18, 0.18),
      bumpMap: this.roomTex.rugBump,
      bumpScale: 0.022,
      roughness: 0.97,
      metalness: 0.0,
      envMapIntensity: 0.14,
    });
    const rugMesh = new THREE.Mesh(new THREE.BoxGeometry(50.0, 0.06, 43.0), rugMat);
    rugMesh.position.set(0, 0.015, 6.0);
    rugMesh.receiveShadow = true;
    this.group.add(rugMesh);

    // Soft rounded felt piping border framing all 4 edges of the patchwork rug
    const rugEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xe8d7b6,
      normalMap: rugNormal,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.96,
      envMapIntensity: 0.14,
    });
    const edgeSpecs: Array<[number, number, number, number]> = [
      [0, 6.0 - 21.5, 50.0, 0],
      [0, 6.0 + 21.5, 50.0, 0],
      [-25.0, 6.0, 43.0, Math.PI / 2],
      [25.0, 6.0, 43.0, Math.PI / 2],
    ];
    for (const [ex, ez, len, ry] of edgeSpecs) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, len, 8), rugEdgeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = ry;
      pipe.position.set(ex, 0.042, ez);
      pipe.receiveShadow = true;
      this.group.add(pipe);
    }

    // Warm sunlit window-mullion light pools cast across the rug & oak floor (01_kids_room.jpg glow!)
    const poolMat = new THREE.MeshBasicMaterial({
      map: this.roomTex.windowLightPool,
      color: 0xffd982,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const poolSpecs: Array<[number, number, number, number, number]> = [
      [8.5, 3.5, 22.0, 16.5, 0.22],
      [14.0, 18.0, 16.5, 13.0, 0.18],
      [-5.5, 14.5, 18.0, 14.0, 0.24],
    ];
    for (const [px, pz, pw, pd, rz] of poolSpecs) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.rotation.z = rz;
      pool.position.set(px, 0.052, pz);
      pool.renderOrder = 1;
      this.group.add(pool);
      this.sunbeamMeshes.push(pool);
    }

    // 3. 4 Kids-Room Perimeter Walls (Warm Sunlit Buttercream plaster + Ivory White Wainscoting + Honey-Oak Baseboard!)
    const upperWallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roomTex.upperWallPlaster,
      emissive: 0x5c4220,
      emissiveIntensity: 0.15,
      roughness: 0.92,
      envMapIntensity: 0.30,
    });
    const wainscotMat = new THREE.MeshStandardMaterial({
      color: 0xfffaf0,
      map: this.roomTex.wainscot,
      bumpMap: this.roomTex.wainscotBump,
      bumpScale: 0.038,
      emissive: 0x3b3124,
      emissiveIntensity: 0.10,
      roughness: 0.64,
      envMapIntensity: 0.34,
    });
    const trimWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xfff6e8,
      emissive: 0x2c2419,
      emissiveIntensity: 0.08,
      roughness: 0.50,
      envMapIntensity: 0.36,
    });
    const baseboardMat = this.getWoodMaterial(0xcf9458, 8, 1);

    const addRoomWall = (
      x: number,
      z: number,
      length: number,
      rotY: number,
      physX: number,
      physZ: number,
      physHx: number,
      physHz: number
    ) => {
      const wg = new THREE.Group();
      wg.position.set(x, 0, z);
      wg.rotation.y = rotY;

      // Upper buttercream plaster wall (Y = 6.4 .. 30.5)
      const upper = new THREE.Mesh(new THREE.BoxGeometry(length, 24.2, 0.6), upperWallMat);
      upper.position.set(0, 18.5, 0);
      upper.receiveShadow = true;
      wg.add(upper);

      // Crown molding trim at ceiling edge (Y = 30.2)
      const crown = new THREE.Mesh(new THREE.BoxGeometry(length, 0.65, 1.05), trimWhiteMat);
      crown.position.set(0, 30.2, 0.16);
      wg.add(crown);

      // Lower white wainscoting (Y = 0.7 .. 6.4)
      const lower = new THREE.Mesh(new THREE.BoxGeometry(length, 5.7, 0.72), wainscotMat);
      lower.position.set(0, 3.55, 0.06);
      lower.receiveShadow = true;
      wg.add(lower);

      // Chair rail molding at Y = 6.45
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.38, 0.94), trimWhiteMat);
      rail.position.set(0, 6.45, 0.12);
      rail.castShadow = true;
      rail.receiveShadow = true;
      wg.add(rail);

      // Honey-oak baseboard (巾木) at Y = 0 .. 0.78
      const base = new THREE.Mesh(new THREE.BoxGeometry(length, 0.78, 0.96), baseboardMat);
      base.position.set(0, 0.39, 0.14);
      base.receiveShadow = true;
      wg.add(base);

      this.group.add(wg);

      // Solid physical wall keeping player & camera inside the kids room
      physics.addStaticBox(physX, 13.0, physZ, physHx, 13.0, physHz, { friction: 0.1 });
    };

    // North Wall (Z = -64)
    addRoomWall(0, -64.0, 69.0, 0, 0, -64.8, 35.5, 1.0);
    // South Wall (Z = +34)
    addRoomWall(0, 34.0, 69.0, Math.PI, 0, 34.8, 35.5, 1.0);
    // West Wall (X = -34)
    addRoomWall(-34.0, -15.0, 99.0, Math.PI / 2, -34.8, -15.0, 1.0, 50.5);
    // East Wall (X = +34)
    addRoomWall(34.0, -15.0, 99.0, -Math.PI / 2, 34.8, -15.0, 1.0, 50.5);

    // 4. Giant Sunlit Mullioned Windows (Custom Blender playroom_window_frame.glb!) + Soft Morning Light Shafts!
    const addSunlitWindow = (
      x: number,
      y: number,
      z: number,
      rotY: number,
      w: number,
      h: number,
      withSunbeams: boolean
    ) => {
      const winGroup = new THREE.Group();
      winGroup.position.set(x, y, z);
      winGroup.rotation.y = rotY;

      // Glowing daylight glass backdrop recessed cleanly behind the window mullions
      const glassMat = new THREE.MeshBasicMaterial({
        map: this.roomTex.windowOutside,
        color: 0xfffef4,
      });
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.90, h * 0.88), glassMat);
      glass.position.set(0, 0.04 * h, 0.34);
      winGroup.add(glass);

      // Custom Blender mullioned window frame + brass latch + sill (bottom centre Y=0, +Z indoor)
      const frameModel = this.worldProps?.createModelInstance('playroomWindowFrame');
      if (frameModel) {
        frameModel.scale.set(w / 3.34, h / 2.72, 2.45);
        frameModel.position.set(0, -h * 0.5, 0.54);
        frameModel.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        winGroup.add(frameModel);
      } else {
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0xfffcf5,
          roughness: 0.42,
          envMapIntensity: 0.55,
        });
        const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.55, 1.05), frameMat);
        sill.position.set(0, -h * 0.5, 0.72);
        winGroup.add(sill);
      }

      if (withSunbeams) {
        // View-angle & edge-feathered volumetric shaft shader: fades smoothly to zero at glancing angles and along all 4 edges (ZERO hard rectangular borders!)
        const beamMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uColor: { value: new THREE.Color(0xffe7a8) },
            uOpacity: { value: 0.095 },
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              vUv = uv;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;
            void main() {
              // Soft feathered horizontal & vertical falloff
              float horiz = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 2.4);
              float topFade = smoothstep(1.0, 0.72, vUv.y);
              float bottomFade = pow(smoothstep(0.0, 0.85, vUv.y), 1.5);
              // Grazing-angle fade prevents flat card silhouettes when viewed from the side
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float ndotv = abs(dot(normalize(vWorldNormal), viewDir));
              float angleFade = smoothstep(0.18, 0.72, ndotv);
              float alpha = horiz * topFade * bottomFade * angleFade * uOpacity;
              if (alpha < 0.002) discard;
              gl_FragColor = vec4(uColor, alpha);
            }
          `,
        });
        const softBeam = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.10, 26), beamMat);
        softBeam.position.set(0, -5.8, 10.2);
        softBeam.rotation.x = -0.82;
        softBeam.renderOrder = 2;
        winGroup.add(softBeam);
        this.sunbeamMeshes.push(softBeam);
      }

      this.group.add(winGroup);
    };

    // East Playroom Sunlit Windows (stream soft golden diagonal sunbeams onto the castle, rug, & train!)
    addSunlitWindow(33.5, 13.8, -3.0, -Math.PI / 2, 16.5, 11.8, true);
    addSunlitWindow(33.5, 13.6, 17.8, -Math.PI / 2, 11.2, 9.8, true);
    // North Wall Giant Sunlit Windows (bright daylight backdrop behind the castle & boss stage; no floating beam cards)
    addSunlitWindow(14.5, 14.5, -63.5, 0, 17.0, 12.2, false);
    addSunlitWindow(-14.5, 14.5, -63.5, 0, 13.5, 11.0, false);

    // 4b. Warm Framed Kids-Room Poster Art along the West & North Walls (removes blank wall feel!)
    const addFramedWallArt = (
      x: number,
      y: number,
      z: number,
      rotY: number,
      w: number,
      h: number,
      artTex: THREE.CanvasTexture
    ) => {
      const fg = new THREE.Group();
      fg.position.set(x, y, z);
      fg.rotation.y = rotY;
      const frameWood = this.getWoodMaterial(0xdba262, 1, 1);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.52, h + 0.52, 0.22), frameWood);
      back.castShadow = true;
      back.receiveShadow = true;
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.56, envMapIntensity: 0.42 })
      );
      art.position.z = 0.125;
      fg.add(back, art);
      this.group.add(fg);
    };
    addFramedWallArt(-33.55, 12.4, -3.8, Math.PI / 2, 4.4, 5.4, this.roomTex.wallArtRainbow);
    addFramedWallArt(-33.55, 12.2, 12.8, Math.PI / 2, 3.8, 4.6, this.roomTex.wallArtStars);
    addFramedWallArt(-33.55, 12.2, 20.5, Math.PI / 2, 3.8, 4.6, this.roomTex.wallArtBalloons);

    // 5. North Playroom Divider Partition at Z = -17.5 framing the 3-Star Gate
    // Left & right low decorative wooden wainscot walls (open overhead so sunlight streams through!)
    const divWainscotMat = new THREE.MeshStandardMaterial({
      color: 0xf7ebd6,
      map: this.roomTex.wainscot,
      bumpMap: this.roomTex.wainscotBump,
      bumpScale: 0.04,
      roughness: 0.58,
      envMapIntensity: 0.44,
    });
    const capMat = this.getWoodMaterial(0xdca260, 6, 1);
    for (const [cx, w] of [
      [-19.8, 28.4],
      [19.8, 28.4],
    ] as Array<[number, number]>) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 4.4, 1.4), divWainscotMat);
      wall.position.set(cx, 2.2, -17.5);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.40, 1.85), capMat);
      cap.position.set(cx, 4.55, -17.5);
      cap.castShadow = true;
      cap.receiveShadow = true;
      this.group.add(wall, cap);

      // Decorative wooden block posts crowning the partition ends
      for (const px of [cx - w * 0.5 + 1.0, cx + w * 0.5 - 1.0]) {
        this.worldProps?.queue('bevelCubeWood', { x: px, y: 4.74, z: -17.5, ry: 0, sx: 1.05 });
      }

      // Permanent low wall collider (tall enough to guide players through the 3-Star Gate)
      physics.addStaticBox(cx, 2.3, -17.5, w * 0.5, 2.3, 0.78);
      // Temporary upper boss-lock collider preventing jumping over before 3 stars
      const lockCol = physics.addStaticBox(cx, 13.5, -17.5, w * 0.5, 9.5, 0.8, {
        friction: 0.0,
        ignoreRays: true,
      });
      gimmicks.registerBossLockCollider(lockCol);
    }
  }

  private buildAlphabetCastle(
    physics: PhysicsWorld,
    blocks: ToyBlocksManager,
    collectibles: CollectiblesManager,
    worldProps: WorldPropsManager
  ): number {
    // Center Alphabet Block Castle (X: -9..+9, Z: -9..+5), faithful to 01_kids_room.jpg!
    const colRed = this.getToyBlockMat(0xea5e64, 2, 2);
    const colBlue = this.getToyBlockMat(0x569ee8, 2, 2);
    const colYellow = this.getToyBlockMat(0xf4c848, 3, 1);
    const colMint = this.getToyBlockMat(0x66cc8a, 2, 1);
    const colLav = this.getToyBlockMat(0xb28ce2, 2, 1);
    const colPeach = this.getToyBlockMat(0xf49868, 2, 2);

    const placeCastleRoof = (
      x: number,
      bottomY: number,
      z: number,
      scale: number,
      ry: number,
      roofTintHex?: number
    ) => {
      const roof = worldProps.createCustomizedModelInstance(
        'playroomCastleRoof',
        roofTintHex !== undefined
          ? {
              Playroom_rose: (m) => {
                m.color.setHex(roofTintHex);
              },
            }
          : undefined
      );
      if (roof) {
        roof.position.set(x, bottomY, z);
        roof.rotation.y = ry;
        roof.scale.setScalar(scale);
        this.group.add(roof);
      }
    };

    // Front Archway Pillars flanking courtyard entrance (Z = +3.6)
    this.addAlphabetStaticBlock(physics, -4.0, 0.0, 3.6, 2.2, 0);
    this.addAlphabetStaticBlock(physics, -4.0, 2.2, 3.6, 2.2, 1);
    this.addAlphabetStaticBlock(physics, 4.0, 0.0, 3.6, 2.2, 2);
    this.addAlphabetStaticBlock(physics, 4.0, 2.2, 3.6, 2.2, 3);
    // Arch Lintel & decorative colored blocks above entrance
    this.addSolidBlock(physics, 0, 5.4, 3.6, 10.6, 1.0, 2.0, colYellow);
    this.addSolidBlock(physics, -4.0, 6.6, 3.6, 2.4, 1.2, 2.4, colBlue);
    this.addSolidBlock(physics, 4.0, 6.6, 3.6, 2.4, 1.2, 2.4, colRed);
    // Twin Blender playroom_castle_roof.glb turrets crowning the front archway (cleanly spaced from all other roofs!)
    placeCastleRoof(-4.0, 6.6, 3.6, 1.48, 0, 0x529be8);
    placeCastleRoof(4.0, 6.6, 3.6, 1.48, 0);
    // Colorful painted crenelation mini-blocks along the arch lintel (matches 01_kids_room.jpg)
    const archTrimColors = [colRed, colBlue, colMint];
    [-1.5, 0.0, 1.5].forEach((tx, idx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.84, 0.84), archTrimColors[idx]);
      m.position.set(tx, 5.82, 3.6);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    });

    // Tier 1 East Bastion (top Y = 2.6, X: 3.9..8.5, Z: -4.1..0.5) + Smooth Front-Right Ramp from Rug
    this.addWoodRamp(
      physics,
      new THREE.Vector3(6.2, 0.0, 6.8),
      new THREE.Vector3(6.2, 2.6, 0.5),
      3.4,
      0.42,
      0xe4b574
    );
    collectibles.addLineCoins(new THREE.Vector3(6.2, 1.1, 6.0), new THREE.Vector3(6.2, 3.4, 1.0), 4);
    this.addSolidBlock(physics, 6.2, 2.6, -1.8, 4.6, 2.6, 4.6, colMint);
    this.addAlphabetStaticBlock(physics, 7.6, 0.0, -3.2, 1.8, 4, false);
    this.addAlphabetStaticBlock(physics, 4.8, 0.0, -3.2, 1.8, 5, false);

    // Tier 2 North-East Deck (top Y = 5.4, X: 3.0..7.4, Z: -10.2..-6.2) + Flush Ramp from East Bastion
    this.addWoodRamp(
      physics,
      new THREE.Vector3(5.6, 2.6, -4.1),
      new THREE.Vector3(5.4, 5.4, -6.2),
      3.0,
      0.40,
      0xe4b574
    );
    this.addSolidBlock(physics, 5.2, 5.4, -8.2, 4.4, 5.4, 4.0, colBlue);
    collectibles.addLineCoins(new THREE.Vector3(5.6, 3.9, -4.6), new THREE.Vector3(5.4, 6.3, -6.8), 3);

    // Mid-Tier Wooden Plank Bridge spanning Back of Castle flush between East (X=3.0) & West (X=-3.8)
    this.addWoodRamp(
      physics,
      new THREE.Vector3(3.0, 5.4, -8.2),
      new THREE.Vector3(-3.8, 5.4, -8.2),
      3.0,
      0.38,
      0xdfb070
    );
    collectibles.addLineCoins(new THREE.Vector3(2.2, 6.3, -8.2), new THREE.Vector3(-2.8, 6.3, -8.2), 4);

    // Tier 2 West Turret (top Y = 5.4, X: -8.2..-3.8, Z: -10.2..-6.2)
    this.addSolidBlock(physics, -6.0, 5.4, -8.2, 4.4, 5.4, 4.0, colRed);
    this.addAlphabetStaticBlock(physics, -7.2, 0.0, -5.2, 2.0, 6, false);

    // West Wing Decorative Yellow Mini-Slide (cleanly outside the West Spire)
    this.addSolidBlock(physics, -8.4, 2.6, -1.6, 3.0, 2.6, 3.4, colLav);
    this.addWoodRamp(
      physics,
      new THREE.Vector3(-8.4, 2.6, 0.1),
      new THREE.Vector3(-8.6, 0.0, 5.8),
      2.4,
      0.36,
      0xf4c848
    );

    // Tier 3 Upper West Spire Platform (top Y = 8.0, X: -7.8..-4.6, Z: -3.4..-0.2) + Flush Ramp from West Turret
    this.addWoodRamp(
      physics,
      new THREE.Vector3(-6.2, 5.4, -6.2),
      new THREE.Vector3(-6.2, 8.0, -3.4),
      2.8,
      0.40,
      0xe4b574
    );
    this.addSolidBlock(physics, -6.2, 8.0, -1.8, 3.2, 8.0, 3.2, colPeach);
    // Dedicated South-West decorative corner pillar (clear of Front Arch left turret by >4.2m!)
    this.addSolidBlock(physics, -6.8, 8.0, 0.6, 2.2, 8.0, 2.2, colYellow);

    // Upper Wooden Bridge from West Spire East face (X=-4.6) -> Center Keep West face (X=-2.4): ZERO clipping!
    this.addWoodRamp(
      physics,
      new THREE.Vector3(-4.6, 8.0, -1.8),
      new THREE.Vector3(-2.4, 10.2, -1.8),
      2.4,
      0.36,
      0xe6b97a
    );
    collectibles.addLineCoins(new THREE.Vector3(-4.2, 9.0, -1.8), new THREE.Vector3(-2.6, 11.0, -1.8), 3);

    // Center Hero Alphabet Block Keep Tower (base Y=0..10.2 at (0, -1.8), footprint 4.8x4.8)
    // NO giant brown box: built exclusively from colorful stacked beveled ABC blocks + pastel trim slabs matching 01_kids_room.jpg!
    physics.addStaticBox(0, 5.1, -1.8, 2.4, 5.1, 2.4, { friction: 0.68 });
    const creamWoodMat = this.getPaintedMat(0xf5dfba, 0.44);
    const keepCore = new THREE.Mesh(new THREE.BoxGeometry(3.5, 9.9, 3.5), creamWoodMat);
    keepCore.position.set(0, 4.95, -1.8);
    keepCore.castShadow = true;
    keepCore.receiveShadow = true;
    this.group.add(keepCore);

    // 4 tiers of large 2x2 beveled ABC Alphabet Blocks forming the full hero tower facade up to Y=10.1!
    const keepTierSpecs: Array<{ y: number; size: number; off: number }> = [
      { y: 0.0, size: 2.35, off: 1.22 },
      { y: 2.75, size: 2.22, off: 1.18 },
      { y: 5.38, size: 2.15, off: 1.15 },
      { y: 7.98, size: 2.10, off: 1.14 },
    ];
    let li = 0;
    for (const tier of keepTierSpecs) {
      for (const [ox, oz] of [
        [-tier.off, tier.off],
        [tier.off, tier.off],
        [-tier.off, -tier.off],
        [tier.off, -tier.off],
      ]) {
        this.addAlphabetStaticBlock(physics, ox, tier.y, -1.8 + oz, tier.size, li++, false);
      }
    }
    // Colorful pastel trim divider slabs sandwiching the ABC tiers (mint, sunny yellow, sky blue, warm maple top deck)
    const trimSlabs: Array<{ y: number; h: number; w: number; mat: THREE.Material }> = [
      { y: 2.55, h: 0.42, w: 4.95, mat: colMint },
      { y: 5.18, h: 0.42, w: 4.90, mat: colYellow },
      { y: 7.76, h: 0.44, w: 4.90, mat: colBlue },
      { y: 10.14, h: 0.16, w: 4.86, mat: creamWoodMat },
    ];
    for (const sl of trimSlabs) {
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(sl.w, sl.h, sl.w), sl.mat);
      slabMesh.position.set(0, sl.y, -1.8);
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      this.group.add(slabMesh);
    }

    // Colorful pastel toy-block corner battlements + mini pyramid caps crowning the Keep Summit around Star 1!
    const summitCorners: Array<[number, number, THREE.Material, number]> = [
      [-2.02, -3.82, colRed, 0xea5e64],
      [2.02, -3.82, colBlue, 0x569ee8],
      [-2.02, 0.22, colYellow, 0xf4c848],
      [2.02, 0.22, colMint, 0x5ec984],
    ];
    const capGeo = new THREE.ConeGeometry(0.56, 0.72, 4);
    capGeo.rotateY(Math.PI / 4);
    for (const [bx, bz, blkMat, capHex] of summitCorners) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.72, 0.76), blkMat);
      cube.position.set(bx, 10.56, bz);
      cube.castShadow = true;
      cube.receiveShadow = true;
      const cap = new THREE.Mesh(capGeo, this.getPaintedMat(capHex, 0.40));
      cap.position.set(bx, 11.28, bz);
      cap.castShadow = true;
      this.group.add(cube, cap);
    }

    // Signature playroom_castle_roof.glb crown turrets on all 4 castle corners (mathematically verified ZERO overlap/flag clipping!)
    placeCastleRoof(-6.8, 8.0, 0.6, 1.38, 0); // Rose coral on West Spire corner pillar
    placeCastleRoof(7.6, 2.6, -0.4, 1.38, -Math.PI / 2, 0x56a4ec); // Sky blue on East Bastion outer corner
    placeCastleRoof(6.4, 5.4, -9.2, 1.40, Math.PI, 0x54be84); // Spring mint on North-East Deck
    placeCastleRoof(-7.1, 5.4, -9.2, 1.40, Math.PI / 2, 0xf2bc3c); // Sunny gold on North-West Turret

    // Playful wooden cylinder & cube toy block clusters around the castle courtyard perimeter (clear of West mini-slide!)
    worldProps.queue('bevelCylWood', { x: -11.0, y: 0.0, z: 3.6, ry: 0.2, sx: 1.0 });
    worldProps.queue('bevelCylWood', { x: 8.8, y: 0.0, z: 2.8, ry: -0.3, sx: 1.0 });
    worldProps.queue('bevelCubeWood', { x: -11.4, y: 0.0, z: -0.4, ry: 0.35, sx: 1.1 });
    worldProps.queue('bevelCubeWood', { x: 8.9, y: 0.0, z: -5.4, ry: -0.25, sx: 1.1 });

    // Festive mini garland between castle turrets!
    worldProps.addGarlandSpan(
      new THREE.Vector3(-4.0, 6.8, 3.6),
      new THREE.Vector3(4.0, 6.8, 3.6),
      9,
      0.55
    );

    // Smashable front courtyard alphabet blocks!
    for (let i = 0; i < 4; i++) {
      blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-1.9 + i * 1.28, 0.6, 5.8), i);
    }
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-0.62, 1.8, 5.8), 4);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(0.66, 1.8, 5.8), 5);

    // ★ MAIN STAR 1 on Alphabet Block Castle Summit!
    collectibles.addPowerStar(
      1,
      '積み木キャッスルのてっぺん',
      '中央つみき城',
      new THREE.Vector3(0, 11.75, -1.8),
      true
    );

    // 💎 SECRET STAR 5 hidden inside glowing crate behind the castle!
    const secretCrate = blocks.spawnCrate(physics, new THREE.Vector3(0, 0.65, -7.8), true);
    collectibles.addPowerStar(
      5,
      'キャッスル裏のひみつ木箱',
      '中央つみき城',
      new THREE.Vector3(0, 1.55, -7.8),
      false,
      'secret',
      true
    );

    return secretCrate.id;
  }

  private addPictureBook(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    cx: number,
    bottomY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY: number,
    coverTex: THREE.CanvasTexture | null,
    spineColor: number,
    tiltX = 0
  ): void {
    const patches: Record<string, (m: THREE.MeshStandardMaterial) => void> = {
      Playroom_blue: (m) => {
        m.color.setHex(spineColor);
      },
    };
    if (coverTex) {
      patches.Playroom_print = (m) => {
        const origFlipY = m.map ? m.map.flipY : false;
        const clonedTex = coverTex.clone();
        clonedTex.flipY = origFlipY;
        clonedTex.colorSpace = THREE.SRGBColorSpace;
        clonedTex.needsUpdate = true;
        m.map = clonedTex;
        m.color.setHex(0xffffff);
      };
    }

    const bookModel = worldProps.createCustomizedModelInstance('playroomPictureBook', patches);
    if (bookModel) {
      // playroom_picture_book.glb manifest bounds: X=1.7015, Y=0.370, Z=2.120, bottom centre Y=0
      const pivot = new THREE.Group();
      pivot.position.set(cx, bottomY + h * 0.5, cz);
      pivot.rotation.set(tiltX, rotY, 0, 'YXZ');
      bookModel.scale.set(w / 1.7015, h / 0.37, d / 2.12);
      bookModel.position.set(0, -h * 0.5, 0);
      pivot.add(bookModel);
      this.group.add(pivot);
    } else {
      const coverMat = new THREE.MeshStandardMaterial({
        map: coverTex ?? this.roomTex.bookRocket,
        roughness: 0.42,
        envMapIntensity: 0.48,
      });
      const spineMat = this.getPaintedMat(spineColor, 0.48);
      const pageMat = new THREE.MeshStandardMaterial({
        map: this.roomTex.bookPages,
        roughness: 0.72,
      });
      const mats = [pageMat, spineMat, coverMat, spineMat, pageMat, pageMat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      mesh.position.set(cx, bottomY + h * 0.5, cz);
      mesh.rotation.set(tiltX, rotY, 0, 'YXZ');
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    physics.addStaticBox(cx, bottomY + h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5, {
      rotEuler: new THREE.Euler(tiltX, rotY, 0, 'YXZ'),
      friction: 0.68,
    });
  }

  private buildWestBooksBedAndCushions(
    physics: PhysicsWorld,
    blocks: ToyBlocksManager,
    collectibles: CollectiblesManager,
    gimmicks: GimmicksManager,
    worldProps: WorldPropsManager,
    balloons: PropellerBalloon[],
    balloonsFactory: (pos: THREE.Vector3) => PropellerBalloon,
    onCushionBounce: () => void
  ): void {
    // 1. Front-Left Rainbow Domino Arc curving cleanly outside the Rocket Picture Book ramp (01_kids_room.jpg!)
    const domCount = 14;
    for (let i = 0; i < domCount; i++) {
      const t = i / (domCount - 1);
      const ang = THREE.MathUtils.lerp(Math.PI * 0.92, Math.PI * 0.26, t);
      const dx = -22.5 + Math.cos(ang) * 6.2;
      const dz = 18.8 + Math.sin(ang) * 5.6;
      const ry = -ang;
      blocks.spawnDomino(physics, new THREE.Vector3(dx, 0.96, dz), ry, i);
    }

    // 2. Giant Picture Book Ramps & Stacked Storybooks (Blender playroom_picture_book.glb!)
    // Tilted Rocket Ship Book forming a playful ramp up onto the stacked storybooks!
    const rampFrom = new THREE.Vector3(-12.5, 0.0, 20.8);
    const rampTo = new THREE.Vector3(-15.8, 2.35, 15.2);
    const rampDir = new THREE.Vector3().subVectors(rampTo, rampFrom);
    const rampLen = rampDir.length();
    const rampMid = new THREE.Vector3().addVectors(rampFrom, rampTo).multiplyScalar(0.5);
    const rampYaw = Math.atan2(rampDir.x, rampDir.z);
    const rampPitch = -Math.atan2(rampDir.y, Math.hypot(rampDir.x, rampDir.z));
    const rampW = 4.1;
    const rampH = 0.62;

    const rocketModel = worldProps.createModelInstance('playroomPictureBook');
    if (rocketModel) {
      const pivot = new THREE.Group();
      pivot.position.set(rampMid.x, rampMid.y - rampH * 0.5, rampMid.z);
      pivot.rotation.set(rampPitch, rampYaw, 0, 'YXZ');
      rocketModel.scale.set(rampW / 1.7015, rampH / 0.37, rampLen / 2.12);
      rocketModel.position.set(0, -rampH * 0.5, 0);
      // Rotate PI inside pivot so the rocket points upward along the climb!
      rocketModel.rotation.y = Math.PI;
      pivot.add(rocketModel);
      this.group.add(pivot);
    } else {
      const rocketMat = new THREE.MeshStandardMaterial({
        map: this.roomTex.bookRocket,
        roughness: 0.42,
        envMapIntensity: 0.5,
      });
      const pageMat = new THREE.MeshStandardMaterial({ map: this.roomTex.bookPages, roughness: 0.72 });
      const blueSpine = this.getPaintedMat(0x3a64a2);
      const rocketBook = new THREE.Mesh(
        new THREE.BoxGeometry(rampW, rampH, rampLen),
        [pageMat, blueSpine, rocketMat, blueSpine, pageMat, pageMat]
      );
      rocketBook.position.set(rampMid.x, rampMid.y - rampH * 0.5, rampMid.z);
      rocketBook.rotation.set(rampPitch, rampYaw, 0, 'YXZ');
      rocketBook.castShadow = true;
      rocketBook.receiveShadow = true;
      this.group.add(rocketBook);
    }
    physics.addStaticBox(
      rampMid.x,
      rampMid.y - rampH * 0.5,
      rampMid.z,
      rampW * 0.5,
      rampH * 0.5,
      rampLen * 0.5,
      {
        rotEuler: new THREE.Euler(rampPitch, rampYaw, 0, 'YXZ'),
        friction: 0.68,
      }
    );
    collectibles.addLineCoins(
      new THREE.Vector3(-13.0, 1.1, 19.8),
      new THREE.Vector3(-15.5, 3.2, 15.5),
      4
    );

    // Stacked Giant Storybooks Platform (top Y = 2.40, all using playroom_picture_book.glb!)
    this.addPictureBook(physics, worldProps, -16.6, 0.0, 13.4, 5.4, 0.78, 5.2, 0.14, this.roomTex.bookCastle, 0x5c82b8);
    this.addPictureBook(physics, worldProps, -16.8, 0.78, 13.2, 5.0, 0.80, 4.9, -0.08, null, 0xd4525c);
    this.addPictureBook(physics, worldProps, -16.5, 1.58, 13.0, 4.8, 0.82, 4.7, 0.06, this.roomTex.bookBear, 0x56a452);

    gimmicks.addCheckpoint(new THREE.Vector3(-11.4, 0.0, 21.2));
    collectibles.addHeart(new THREE.Vector3(-16.5, 3.3, 13.0));

    // 3. Fluffy Bouncy Patchwork Cushion Mountain right in front of the Bed! (01_kids_room.jpg!)
    // Bottom foundation pillows sit flush on Y=0, with plaid/stripe & pastel pillows nestled tightly on top
    this.addCushion(physics, worldProps, -18.5, 1.35, 8.8, 4.4, 1.35, 4.4, 0.22, 0xf7d256, onCushionBounce);
    this.addCushion(physics, worldProps, -21.8, 1.45, 7.6, 5.0, 1.45, 5.0, -0.10, 0x56ad7c, onCushionBounce);
    this.addCushion(physics, worldProps, -20.2, 1.60, 4.4, 5.6, 1.60, 5.4, 0.12, 0xf6c4a4, onCushionBounce, 'plaid');
    this.addCushion(physics, worldProps, -25.4, 1.35, 7.2, 4.2, 1.35, 4.2, 0.34, 0x4ca272, onCushionBounce);
    this.addCushion(physics, worldProps, -21.8, 2.55, 7.2, 4.3, 1.35, 4.3, -0.18, 0x76c4dc, onCushionBounce, 'stripe');
    this.addCushion(physics, worldProps, -19.2, 2.95, 4.8, 4.4, 1.45, 4.4, 0.30, 0xf28c9c, onCushionBounce);
    this.addCushion(physics, worldProps, -21.8, 4.05, 3.6, 4.4, 1.40, 4.4, -0.14, 0x86d496, onCushionBounce);
    this.addCushion(physics, worldProps, -23.0, 4.70, 5.8, 3.8, 1.35, 3.8, 0.12, 0xf7a4bc, onCushionBounce, 'plaid');

    // 4. Giant Cozy Kids Bed along the West Wall (Blender playroom_bed.glb!)
    // Manifest bounds: X=2.056, Y=1.520 (quilt top ~1.015, pillow top ~1.131), Z=3.050, +Z footboard, -Z headboard
    const bedModel = worldProps.createCustomizedModelInstance('playroomBed', {
      Playroom_mint: (m) => {
        m.roughness = 0.86;
        m.envMapIntensity = 0.38;
      },
      Playroom_paper: (m) => {
        m.roughness = 0.84;
        m.envMapIntensity = 0.40;
      },
      Playroom_milk: (m) => {
        m.roughness = 0.82;
        m.envMapIntensity = 0.42;
      },
    });
    const bedX = -27.2;
    const bedZ = -3.8;
    if (bedModel) {
      bedModel.position.set(bedX, 0.0, bedZ);
      bedModel.scale.set(4.35, 4.65, 4.72);
      this.group.add(bedModel);
    } else {
      this.addSolidBlock(physics, bedX, 4.65, bedZ, 8.8, 4.65, 14.4, this.getWoodMaterial(0xe2b87e));
    }

    // Exact colliders aligned with playroom_bed.glb geometry (quilt deck, headboard, footboard, bouncy pillow!)
    physics.addStaticBox(bedX, 4.68 * 0.5, bedZ + 0.4, 4.25, 4.68 * 0.5, 6.6, { friction: 0.72 });
    physics.addStaticBox(bedX, 7.05 * 0.5, -10.55, 4.45, 7.05 * 0.5, 0.48, { friction: 0.55 });
    physics.addStaticBox(bedX, 5.25 * 0.5, 3.05, 4.45, 5.25 * 0.5, 0.42, { friction: 0.55 });
    // Model's built-in plump cream pillow acts as a real bouncy cushion surface!
    physics.addStaticBox(bedX, 5.26 - 0.6, -8.55, 3.4, 0.6, 1.3, {
      cushionTopY: 5.26,
      onCushion: onCushionBounce,
      friction: 0.8,
    });

    // Red Coil Spring resting flush on the quilted blanket to launch up to Star 2!
    gimmicks.addRedSpring(physics, new THREE.Vector3(-26.8, 4.68, -3.4), 19.6, 'pastel');
    collectibles.addLineCoins(
      new THREE.Vector3(-26.5, 6.8, -5.2),
      new THREE.Vector3(-25.8, 9.8, -8.6),
      4
    );

    // Elevated Canopy Sky Shelf above Bed Headboard -> ★ MAIN STAR 2! (Craft slab + wood brackets!)
    this.addCraftSlabPlatform(physics, -25.8, 9.0, -9.8, 5.6, 0.85, 4.8, 0xe2b274);
    const supportMat = this.getWoodMaterial(0xc88d4e, 1, 2);
    for (const sx of [-28.0, -23.6]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 10), supportMat);
      strut.position.set(sx, 7.5, -10.55);
      strut.castShadow = true;
      this.group.add(strut);
    }
    collectibles.addPowerStar(
      2,
      'ふわふわベッドの雲の上',
      '西の巨大ベッド',
      new THREE.Vector3(-25.8, 10.6, -9.8),
      true
    );

    // 5. Mint & Peach Wooden Toy Chests flanking the Bed (Blender playroom_toy_chest.glb!)
    // Manifest bounds: X=2.270, Y=1.2865, Z=1.280, +Z front latch -> ry = +PI/2 faces room center (+X)!
    const addToyChest = (
      cx: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      tintHex?: number
    ) => {
      const chestW = 1.28 * sz; // world X depth after PI/2 rotation
      const chestH = 1.2865 * sy;
      const chestD = 2.27 * sx; // world Z width after PI/2 rotation
      const chest = worldProps.createCustomizedModelInstance(
        'playroomToyChest',
        tintHex !== undefined
          ? {
              Playroom_mint: (m) => {
                m.color.setHex(tintHex);
              },
            }
          : undefined
      );
      if (chest) {
        chest.position.set(cx, 0.0, cz);
        chest.rotation.y = Math.PI / 2;
        chest.scale.set(sx, sy, sz);
        this.group.add(chest);
        physics.addStaticBox(cx, chestH * 0.5, cz, chestW * 0.5, chestH * 0.5, chestD * 0.5, {
          friction: 0.65,
        });
      } else {
        this.addSolidBlock(physics, cx, chestH, cz, chestW, chestH, chestD, this.getPaintedMat(tintHex ?? 0x8cc97e, 0.5));
      }
    };
    addToyChest(-31.2, 14.5, 2.82, 2.75, 3.15); // Mint green toy chest front-left (GLB native mint!)
    addToyChest(-31.3, -14.2, 2.68, 2.65, 3.05, 0xe68474); // Peach coral toy chest back-left (01_kids_room.jpg!)

    // 6. West Wall Shelves (Blender playroom_wall_shelf.glb with books & wooden stacking ring!)
    // Manifest bounds: X=2.630, Y=1.4642 (shelf plank top at local Y=0.775), Z=0.830, +Z front
    const addWallShelf = (
      cx: number,
      plankTopY: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      withCollider = true
    ) => {
      const shelfD = 2.63 * sx; // world Z width after PI/2 rotation
      const shelfW = 0.83 * sz; // world X depth
      const plankTopLocalY = 0.775 * sy;
      const model = worldProps.createModelInstance('playroomWallShelf');
      if (model) {
        model.position.set(cx, plankTopY - plankTopLocalY, cz);
        model.rotation.y = Math.PI / 2;
        model.scale.set(sx, sy, sz);
        this.group.add(model);
      } else {
        this.addSolidBlock(physics, cx, plankTopY, cz, shelfW, 0.6, shelfD, this.getWoodMaterial(0xdba262));
        return;
      }
      if (withCollider) {
        const colW = Math.max(shelfW, 3.6);
        physics.addStaticBox(cx + (colW - shelfW) * 0.35, plankTopY - 0.38, cz, colW * 0.5, 0.38, shelfD * 0.5, {
          friction: 0.7,
        });
      }
    };

    // Primary West Wall Shelf -> 💎 SECRET STAR 4!
    addWallShelf(-32.0, 8.4, 1.5, 3.2, 3.0, 3.8, true);
    // Secondary decorative West Wall Shelf directly above the Peach Toy Chest (01_kids_room.jpg back-left shelf!)
    addWallShelf(-32.2, 9.4, -14.2, 2.3, 2.5, 3.0, true);

    // Propeller Balloon floating cleanly between bed & wall shelf to assist reaching Secret Star 4!
    balloons.push(balloonsFactory(new THREE.Vector3(-24.2, 6.8, 1.5)));
    collectibles.addPowerStar(
      4,
      '壁の本だなヒミツ基地',
      '西の壁の本だな',
      new THREE.Vector3(-31.0, 10.0, 2.2),
      true,
      'secret'
    );
  }

  private buildCurvedTwinSlide(
    physics: PhysicsWorld,
    collectibles: CollectiblesManager,
    xOffset: number,
    isPink: boolean
  ): void {
    // Bookshelf deck top is Y = 8.204, north edge is Z = 2.198.
    // Start with a clean horizontal entry lip seated flush atop the bookshelf deck,
    // clear the north edge cleanly, then sweep smoothly down into the Bowling Plaza!
    const points = [
      new THREE.Vector3(xOffset, 8.25, 2.98),
      new THREE.Vector3(xOffset, 8.25, 2.24),
      new THREE.Vector3(xOffset, 8.02, 1.48),
      new THREE.Vector3(xOffset - 0.12, 5.55, -1.25),
      new THREE.Vector3(xOffset - 0.28, 2.45, -4.25),
      new THREE.Vector3(xOffset - 0.38, 0.48, -6.75),
      new THREE.Vector3(xOffset - 0.42, 0.22, -8.50),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const segs = 80;

    // Paired top (inner chute + side rails) and bottom (outer shell) U-ribbon profiles (13 matched pairs).
    // Matching top/bottom indices let both end caps be triangulated as a clean quad strip with ZERO web-spanning or inverted faces!
    const topProfile: Array<[number, number]> = [
      [-1.36, 0.42],
      [-1.31, 0.62],
      [-1.18, 0.68],
      [-1.05, 0.58],
      [-0.98, 0.26],
      [-0.66, 0.05],
      [0.0, 0.0],
      [0.66, 0.05],
      [0.98, 0.26],
      [1.05, 0.58],
      [1.18, 0.68],
      [1.31, 0.62],
      [1.36, 0.42],
    ];
    const botProfile: Array<[number, number]> = [
      [-1.36, 0.34],
      [-1.34, 0.22],
      [-1.26, 0.06],
      [-1.16, -0.05],
      [-1.0, -0.13],
      [-0.66, -0.18],
      [0.0, -0.20],
      [0.66, -0.18],
      [1.0, -0.13],
      [1.16, -0.05],
      [1.26, 0.06],
      [1.34, 0.22],
      [1.36, 0.34],
    ];
    const pairCount = topProfile.length; // 13
    const crossCount = pairCount * 2; // 26: 0..12 top L->R, 13..25 bottom R->L
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const physPos: number[] = [];
    const physIdx: number[] = [];
    const worldUp = new THREE.Vector3(0, 1, 0);
    const deckTopMinY = 8.208;
    const shelfNorthEdgeZ = 2.15;

    // Keep start & end ring positions so we can add crisp, separated-vertex end caps
    const startTopVerts: THREE.Vector3[] = [];
    const startBotVerts: THREE.Vector3[] = [];
    const endTopVerts: THREE.Vector3[] = [];
    const endBotVerts: THREE.Vector3[] = [];

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const tang = curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tang, worldUp).normalize();
      const upVec = new THREE.Vector3().crossVectors(right, tang).normalize();

      // Gentle rounded taper on side rails at entry & exit so top lip looks like a molded playroom slide
      const entryRailScale = THREE.MathUtils.lerp(0.58, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.09));
      const exitRailScale = THREE.MathUtils.lerp(1.0, 0.68, THREE.MathUtils.smoothstep(t, 0.88, 1.0));
      const railScale = entryRailScale * exitRailScale;
      // Slim underside thickness while seated on top of the bookshelf deck, expanding smoothly once past the edge
      const bottomDepthScale = THREE.MathUtils.lerp(0.20, 1.0, THREE.MathUtils.smoothstep(t, 0.05, 0.14));

      const ringTop: THREE.Vector3[] = [];
      const ringBot: THREE.Vector3[] = [];

      for (let j = 0; j < pairCount; j++) {
        const [tx, tyRaw] = topProfile[j];
        const [bx, byRaw] = botProfile[j];
        const ty = tyRaw * railScale;
        const by = byRaw < 0 ? byRaw * bottomDepthScale : byRaw * railScale;

        const tv = p.clone().addScaledVector(right, tx).addScaledVector(upVec, ty);
        const bv = p.clone().addScaledVector(right, bx).addScaledVector(upVec, by);

        // Guarantee zero clipping into the bookshelf top deck or playroom hardwood floor
        if (bv.z > shelfNorthEdgeZ) {
          bv.y = Math.max(bv.y, deckTopMinY);
          tv.y = Math.max(tv.y, bv.y + 0.038);
        }
        if (p.y < 0.9) {
          bv.y = Math.max(bv.y, 0.045);
          tv.y = Math.max(tv.y, bv.y + 0.045);
        }

        ringTop.push(tv);
        ringBot.push(bv);
      }

      // Emit closed ring: 0..12 top L->R, 13..25 bottom R->L
      for (let j = 0; j < pairCount; j++) {
        const v = ringTop[j];
        positions.push(v.x, v.y, v.z);
        uvs.push(j / (pairCount - 1), t * 3.5);
        physPos.push(v.x, v.y, v.z);
      }
      for (let j = pairCount - 1; j >= 0; j--) {
        const v = ringBot[j];
        positions.push(v.x, v.y, v.z);
        uvs.push(j / (pairCount - 1), t * 3.5);
      }

      if (i === 0) {
        startTopVerts.push(...ringTop);
        startBotVerts.push(...ringBot);
      } else if (i === segs) {
        endTopVerts.push(...ringTop);
        endBotVerts.push(...ringBot);
      }

      if (i < segs) {
        const b = i * crossCount;
        const n = (i + 1) * crossCount;
        for (let q = 0; q < crossCount; q++) {
          const nq = (q + 1) % crossCount;
          indices.push(b + q, b + nq, n + q);
          indices.push(b + nq, n + nq, n + q);
        }
        const pb = i * pairCount;
        const pn = (i + 1) * pairCount;
        for (let q = 0; q < pairCount - 1; q++) {
          physIdx.push(pb + q, pb + q + 1, pn + q);
          physIdx.push(pb + q + 1, pn + q + 1, pn + q);
        }
      }
    }

    // Add dedicated-vertex U-ribbon end caps (clean quad strips following exact concave U thickness -> ZERO twisted bands or grey backfaces!)
    const appendRibbonCap = (
      topVerts: THREE.Vector3[],
      botVerts: THREE.Vector3[],
      uEndV: number,
      flipWinding: boolean
    ) => {
      const topBase = positions.length / 3;
      for (let j = 0; j < pairCount; j++) {
        const v = topVerts[j];
        positions.push(v.x, v.y, v.z);
        uvs.push(j / (pairCount - 1), uEndV);
      }
      const botBase = positions.length / 3;
      for (let j = 0; j < pairCount; j++) {
        const v = botVerts[j];
        positions.push(v.x, v.y, v.z);
        uvs.push(j / (pairCount - 1), uEndV);
      }
      for (let j = 0; j < pairCount - 1; j++) {
        const t0 = topBase + j;
        const t1 = topBase + j + 1;
        const b0 = botBase + j;
        const b1 = botBase + j + 1;
        if (!flipWinding) {
          // Start cap facing +Z (outward toward bookshelf deck)
          indices.push(t0, b0, b1);
          indices.push(t0, b1, t1);
        } else {
          // End cap facing -Z (outward toward Bowling Plaza)
          indices.push(t0, b1, b0);
          indices.push(t0, t1, b1);
        }
      }
    };
    appendRibbonCap(startTopVerts, startBotVerts, 0.0, false);
    appendRibbonCap(endTopVerts, endBotVerts, 3.5, true);

    const visGeo = new THREE.BufferGeometry();
    visGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    visGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    visGeo.setIndex(indices);
    visGeo.computeVertexNormals();

    const slideMat = new THREE.MeshPhysicalMaterial({
      color: isPink ? 0xff86b6 : 0x70dc64,
      map: isPink ? this.textures.pastelSlidePink : this.textures.pastelSlideMint,
      roughness: 0.14,
      clearcoat: 0.92,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.72,
    });
    const slideMesh = new THREE.Mesh(visGeo, slideMat);
    slideMesh.castShadow = true;
    slideMesh.receiveShadow = true;
    this.group.add(slideMesh);

    // Honey-oak support piers cradling the twin slide chutes cleanly to the floor
    const pierMat = this.getWoodMaterial(0xd49c5c, 1, 2);
    for (const st of [0.34, 0.62]) {
      const sp = curve.getPointAt(st);
      const colH = Math.max(0.5, sp.y - 0.16);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.40, colH, 12), pierMat);
      pier.position.set(sp.x, colH * 0.5, sp.z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      this.group.add(pier);
    }

    const physGeo = new THREE.BufferGeometry();
    physGeo.setAttribute('position', new THREE.Float32BufferAttribute(physPos, 3));
    physGeo.setIndex(physIdx);
    physics.addStaticTrimesh(physGeo, new THREE.Vector3(0, 0, 0), undefined, {
      isSlide: true,
      slideDir: { x: -0.04, z: -0.999 },
      friction: 0.05,
    });

    // Coins & Star-bits gliding cleanly down the chute (well clear of the bookshelf edge & side rails!)
    const coinTs = [0.22, 0.39, 0.56, 0.73, 0.90];
    for (const ct of coinTs) {
      const cp = curve.getPointAt(ct);
      collectibles.addCoin(new THREE.Vector3(cp.x, cp.y + 0.86, cp.z), !isPink);
    }
  }

  private buildWoodenTrainTrackAndTrain(worldProps: WorldPropsManager): void {
    // Smooth closed Brio-style wooden curved rail loop in Front-Right (01_kids_room.jpg!)
    const pts = [
      new THREE.Vector3(12.2, 0.09, 10.5),
      new THREE.Vector3(11.6, 0.09, 16.5),
      new THREE.Vector3(15.2, 0.09, 21.2),
      new THREE.Vector3(21.4, 0.09, 21.0),
      new THREE.Vector3(25.2, 0.09, 16.6),
      new THREE.Vector3(24.0, 0.09, 10.8),
      new THREE.Vector3(19.6, 0.09, 8.6),
      new THREE.Vector3(15.0, 0.09, 8.2),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.trainCurve = curve;

    // Extrude carved Brio-style beveled wooden track bed with grooves matching playroom_toy_train.glb wheels (±0.66m)
    const segs = 144;
    const prof: Array<[number, number]> = [
      [-1.24, 0.0],
      [-1.24, 0.17],
      [-1.18, 0.21],
      [-0.84, 0.21],
      [-0.80, 0.10],
      [-0.50, 0.10],
      [-0.46, 0.21],
      [0.46, 0.21],
      [0.50, 0.10],
      [0.80, 0.10],
      [0.84, 0.21],
      [1.18, 0.21],
      [1.24, 0.17],
      [1.24, 0.0],
    ];
    const pCount = prof.length;
    const posArr: number[] = [];
    const uvArr: number[] = [];
    const idxArr: number[] = [];
    const worldUp = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segs; i++) {
      const t = (i % segs) / segs;
      const p = curve.getPointAt(t);
      const tang = curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tang, worldUp).normalize();
      for (let k = 0; k < pCount; k++) {
        const [rx, ry] = prof[k];
        const v = p.clone().addScaledVector(right, rx);
        v.y += ry;
        posArr.push(v.x, v.y, v.z);
        // Map U linearly by cross-section X so grooves line up with woodRail texture channels
        const u = (rx + 1.24) / 2.48;
        uvArr.push(u, (i / segs) * 9);
      }
      if (i < segs) {
        const b = i * pCount;
        const n = (i + 1) * pCount;
        for (let q = 0; q < pCount - 1; q++) {
          idxArr.push(b + q, b + q + 1, n + q);
          idxArr.push(b + q + 1, n + q + 1, n + q);
        }
      }
    }
    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    trackGeo.setIndex(idxArr);
    trackGeo.computeVertexNormals();

    const oak = this.pbr?.cloneMaps('oakVeneer', 1, 10);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roomTex.woodRail,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughnessMap: oak?.rough ?? null,
      roughness: 0.48,
      envMapIntensity: 0.50,
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.castShadow = true;
    trackMesh.receiveShadow = true;
    this.group.add(trackMesh);

    // Animated Blender playroom_toy_train.glb (Locomotive + Coupled Cargo Wagon, +Z front, bottom centre Y=0)
    const trainModel = worldProps.createModelInstance('playroomToyTrain');
    if (trainModel) {
      trainModel.scale.setScalar(1.58);
      this.group.add(trainModel);
      this.trainProgress = 0.28; // Start right on the scenic front curve facing the room!
      const p0 = curve.getPointAt(this.trainProgress);
      const t0 = curve.getTangentAt(this.trainProgress);
      trainModel.position.set(p0.x, p0.y + 0.10, p0.z);
      trainModel.rotation.y = Math.atan2(t0.x, t0.z);
      this.trainAnim = {
        group: trainModel,
        chimneyLocal: new THREE.Vector3(0, 1.24, 1.50),
      };
    }
  }

  private buildEastTrainBookshelfAndBowling(
    physics: PhysicsWorld,
    blocks: ToyBlocksManager,
    collectibles: CollectiblesManager,
    gimmicks: GimmicksManager,
    worldProps: WorldPropsManager,
    tanks: WindupTank[],
    balloons: PropellerBalloon[],
    tanksFactory: (pos: THREE.Vector3, isGuard?: boolean) => WindupTank,
    balloonsFactory: (pos: THREE.Vector3) => PropellerBalloon
  ): void {
    // 1. Wooden Rail Track & Animated Blender Toy Train
    this.buildWoodenTrainTrackAndTrain(worldProps);

    // 2. Twin Red Coil Springs nestled right inside the Track Loop (01_kids_room.jpg!)
    gimmicks.addRedSpring(physics, new THREE.Vector3(16.6, 0.0, 14.2), 20.0, 'red');
    gimmicks.addRedSpring(physics, new THREE.Vector3(20.8, 0.0, 15.2), 21.8, 'red');
    collectibles.addLineCoins(
      new THREE.Vector3(21.6, 4.5, 12.2),
      new THREE.Vector3(24.2, 9.0, 7.2),
      4
    );

    // Checkpoint 3 & Heart 3 near the Train Track
    gimmicks.addCheckpoint(new THREE.Vector3(11.0, 0.0, 18.2));
    collectibles.addHeart(new THREE.Vector3(12.2, 0.9, 9.2));

    // 3. Giant Wooden Bookshelf (Blender playroom_bookshelf.glb!) + Climbable Steps + Twin Slides!
    // Manifest bounds: X=2.50, Y=2.26, Z=0.89, +Z open books front, bottom centre Y=0.
    // Two uniform-scale (3.60, 3.63, 3.60) bookshelves placed back-to-back match X=9.0m, Y=8.20m, Z=6.40m with ZERO distortion!
    const shelfSouth = worldProps.createModelInstance('playroomBookshelf');
    const shelfNorth = worldProps.createModelInstance('playroomBookshelf');
    const shelfWest = worldProps.createModelInstance('playroomBookshelf');
    if (shelfSouth && shelfNorth) {
      shelfSouth.position.set(24.7, 0.0, 7.0);
      shelfSouth.scale.set(3.6, 3.63, 3.6);
      shelfSouth.rotation.y = 0; // Books face south (+Z) toward playroom & train!
      this.group.add(shelfSouth);

      shelfNorth.position.set(24.7, 0.0, 3.8);
      shelfNorth.scale.set(3.6, 3.63, 3.6);
      shelfNorth.rotation.y = Math.PI; // Books face north (-Z) toward bowling plaza & slides!
      this.group.add(shelfNorth);

      if (shelfWest) {
        // West-facing bookshelf facade covering the flat side panel so title/playroom views see colorful books!
        shelfWest.position.set(20.95, 0.0, 5.4);
        shelfWest.scale.set(2.48, 3.63, 2.0);
        shelfWest.rotation.y = -Math.PI / 2; // Books face west (-X) toward room center!
        this.group.add(shelfWest);
      }

      physics.addStaticBox(24.7, 8.2 * 0.5, 5.4, 9.0 * 0.5, 8.2 * 0.5, 6.4 * 0.5, { friction: 0.65 });
    } else {
      const shelfWood = this.getWoodMaterial(0xdba262, 2, 2);
      this.addSolidBlock(physics, 24.7, 8.2, 5.4, 9.0, 8.2, 6.4, shelfWood);
    }

    // Playful wooden cube accents resting on the bookshelf deck beside the slide tops (01_kids_room.jpg!)
    worldProps.queue('bevelCubeWood', { x: 20.9, y: 8.2, z: 7.4, ry: 0.18, sx: 0.85 });
    worldProps.queue('bevelCylWood', { x: 28.4, y: 8.2, z: 3.3, ry: -0.2, sx: 0.78 });

    // Additional East Wall Perimeter Bookshelves (playroom_bookshelf.glb) framing South-East & North-East walls!
    const addWallBookshelf = (cx: number, cz: number, sc: number) => {
      const bw = 0.89 * sc; // world X depth after -PI/2 rotation
      const bh = 2.26 * sc;
      const bd = 2.5 * sc; // world Z width
      const inst = worldProps.createModelInstance('playroomBookshelf');
      if (inst) {
        inst.position.set(cx, 0.0, cz);
        inst.rotation.y = -Math.PI / 2; // Books face inward (-X) toward the room!
        inst.scale.setScalar(sc);
        this.group.add(inst);
        physics.addStaticBox(cx, bh * 0.5, cz, bw * 0.5, bh * 0.5, bd * 0.5, { friction: 0.65 });
      }
    };
    addWallBookshelf(32.15, 23.2, 2.7);
    addWallBookshelf(32.25, -13.0, 2.3);

    // Alternative climbable staircase along the south side of the bookshelf (Y = 0 -> 4.2 -> 8.2)
    this.addWoodRamp(
      physics,
      new THREE.Vector3(29.8, 0.0, 17.5),
      new THREE.Vector3(29.8, 4.2, 11.8),
      3.4,
      0.42,
      0xdca462
    );
    this.addSolidBlock(physics, 29.8, 4.2, 10.2, 4.2, 4.2, 3.6, this.getToyBlockMat(0x529be8, 2, 2));
    this.addWoodRamp(
      physics,
      new THREE.Vector3(29.8, 4.2, 9.2),
      new THREE.Vector3(29.8, 8.18, 4.8),
      2.2,
      0.38,
      0xdca462,
      false
    );

    // TWIN GLOSSY CURVED SLIDES (Pink + Green!) side by side from Bookshelf Top -> Bowling Plaza!
    this.buildCurvedTwinSlide(physics, collectibles, 22.0, true);
    this.buildCurvedTwinSlide(physics, collectibles, 25.6, false);

    // High Secret Perch above Bookshelf South-East Corner -> 💎 SECRET STAR 6! (Craft slab platform!)
    this.addCraftSlabPlatform(physics, 30.2, 10.2, 7.6, 3.8, 0.7, 3.8, 0xf4c848);
    balloons.push(balloonsFactory(new THREE.Vector3(29.6, 7.8, 10.8)));
    collectibles.addPowerStar(
      6,
      '本だなのてっぺん秘密基地',
      '東の本だな',
      new THREE.Vector3(30.2, 11.75, 7.6),
      true,
      'secret'
    );

    // 4. Back-Right Domino & Bowling Plaza (directly in front of Twin Slide exit!)
    // 16 Curving Rainbow Dominos (tag='east' for domino stats!)
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const dx = 10.8 + t * 6.8 + Math.sin(t * Math.PI) * 1.4;
      const dz = -4.2 - t * 6.8;
      const ry = Math.atan2(6.8, -6.8);
      blocks.spawnDomino(physics, new THREE.Vector3(dx, 0.96, dz), ry, i, 'east');
    }

    // 15 Smooth Bowling Pins centered right at the Twin Slide exit!
    const pinStartZ = -9.6;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const px = 23.6 + (col - row * 0.5) * 1.05;
        const pz = pinStartZ - row * 1.02;
        blocks.spawnBowlingPin(physics, new THREE.Vector3(px, 0.80, pz));
      }
    }

    // 3 Wind-up Tank guards patrolling the Bowling Plaza perimeter!
    tanks.push(tanksFactory(new THREE.Vector3(16.2, 0.0, -13.2), true));
    tanks.push(tanksFactory(new THREE.Vector3(29.5, 0.0, -11.5), true));
    tanks.push(tanksFactory(new THREE.Vector3(23.6, 0.0, -14.8), true));

    // ★ MAIN STAR 3 (locked until pins + tanks >= 5!)
    collectibles.addPowerStar(
      3,
      'ツインすべり台ボーリング',
      '東のボーリング広場',
      new THREE.Vector3(23.6, 1.55, -15.4),
      false
    );
  }

  /**
   * Playroom-themed 3-Star Toybox Arch Gate replacing the dark clockwork gear gate in World 1.
   * Aligns pillars at X = ±4.6 and star-lamp crossbar at Y = 9.85, Z = +1.15 to match GimmicksManager.
   */
  private createPlayroomStarGate(worldProps: WorldPropsManager): THREE.Group {
    const g = new THREE.Group();
    const mapleMat = this.getWoodMaterial(0xe5b87c, 2, 2);
    const creamMat = this.getPaintedMat(0xfdf3df, 0.46);
    const pillarMats = [
      this.getToyBlockMat(0x56a4ec, 1, 1), // sky blue
      this.getToyBlockMat(0xf4c848, 1, 1), // sunny yellow
      this.getToyBlockMat(0xf2788c, 1, 1), // coral pink
      this.getToyBlockMat(0x64ca8c, 1, 1), // spring mint
    ];

    for (const side of [-1, 1]) {
      const px = side * 4.6;
      // Maple plinth base
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.72, 2.35), mapleMat);
      plinth.position.set(px, 0.36, 0);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      g.add(plinth);

      // 4 stacked pastel toy blocks forming each gate pillar up to Y = 8.72
      for (let tier = 0; tier < 4; tier++) {
        const idx = (tier + (side > 0 ? 2 : 0)) % pillarMats.length;
        const blk = new THREE.Mesh(new THREE.BoxGeometry(1.92, 2.0, 1.92), pillarMats[idx]);
        blk.position.set(px, 0.72 + tier * 2.0 + 1.0, 0);
        blk.castShadow = true;
        blk.receiveShadow = true;
        g.add(blk);
      }

      // Cute Blender playroom castle roof crowning each pillar!
      const roof = worldProps.createCustomizedModelInstance('playroomCastleRoof', {
        Playroom_rose: (m) => {
          m.color.setHex(side < 0 ? 0xf2748a : 0x54a2eb);
        },
      });
      if (roof) {
        roof.position.set(px, 8.72, 0);
        roof.scale.setScalar(1.52);
        g.add(roof);
      }
    }

    // Warm cream & honey-oak toybox arch lintel holding the 3 star lamps (lamp sockets at Y=9.85, Z=+1.15)
    const beamMain = new THREE.Mesh(new THREE.BoxGeometry(11.4, 2.1, 2.0), creamMat);
    beamMain.position.set(0, 9.75, 0);
    beamMain.castShadow = true;
    beamMain.receiveShadow = true;
    g.add(beamMain);

    const beamTrimTop = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.34, 2.25), mapleMat);
    beamTrimTop.position.set(0, 10.92, 0);
    beamTrimTop.castShadow = true;
    g.add(beamTrimTop);

    const beamTrimBot = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.30, 2.22), mapleMat);
    beamTrimBot.position.set(0, 8.62, 0);
    beamTrimBot.castShadow = true;
    g.add(beamTrimBot);

    // 3 pastel felt-style star lamp backing medallions on the front lintel
    const medCols = [0xf4c848, 0xf2788c, 0x56a4ec];
    [-2.5, 0, 2.5].forEach((lx, i) => {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 0.22, 20),
        this.getPaintedMat(medCols[i], 0.42)
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(lx, 9.85, 0.98);
      g.add(ring);
    });

    // Playful rainbow wooden blocks + smiling golden toy star crowning the top center (no clockwork gear!)
    const crownCols = [0xf26874, 0xf6c848, 0x62c988, 0x56a4ec, 0xb88ce4];
    crownCols.forEach((hex, idx) => {
      const bx = (idx - 2) * 1.45;
      const h = idx === 2 ? 1.55 : idx === 1 || idx === 3 ? 1.15 : 0.85;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.22, h, 1.12), this.getToyBlockMat(hex, 1, 1));
      b.position.set(bx, 11.09 + h * 0.5, 0);
      b.castShadow = true;
      g.add(b);
    });

    // Cute extruded golden wood star emblem atop the central crown block
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1.05 : 0.48;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r;
      if (i === 0) starShape.moveTo(sx, sy);
      else starShape.lineTo(sx, sy);
    }
    starShape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(starShape, {
      depth: 0.36,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    starGeo.center();
    const starEmblem = new THREE.Mesh(
      starGeo,
      new THREE.MeshStandardMaterial({
        color: 0xffe04e,
        emissive: 0xffb824,
        emissiveIntensity: 0.28,
        roughness: 0.32,
        metalness: 0.15,
      })
    );
    starEmblem.position.set(0, 13.65, 0);
    starEmblem.castShadow = true;
    g.add(starEmblem);

    return g;
  }

  private buildNorthBossStage(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    gimmicks: GimmicksManager,
    _clockworkGears: THREE.Object3D[]
  ): void {
    const cx = 0;
    const cy = 2.2;
    const cz = -43.5;

    // World 1 Kids-Room Toybox Stage: warm maple toybox platform + stitched round felt playmat + pastel block fence + garlands!
    const mapleMat = this.getWoodMaterial(0xe4b472, 6, 1);
    const creamPanelMat = this.getPaintedMat(0xfbf1dd, 0.54);
    const mintTrimMat = this.getPaintedMat(0x78cf9c, 0.48);

    // 1. Toybox Stage Cylindrical Base (Y = 0 .. 2.2, R = 18.5)
    const baseCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(18.4, 18.7, cy, 48),
      creamPanelMat
    );
    baseCylinder.position.set(cx, cy * 0.5, cz);
    baseCylinder.castShadow = true;
    baseCylinder.receiveShadow = true;
    this.group.add(baseCylinder);

    // Warm honey-oak top & bottom stage rim rings + pastel mint accent stripe
    const topRim = new THREE.Mesh(new THREE.CylinderGeometry(18.75, 18.65, 0.34, 48), mapleMat);
    topRim.position.set(cx, cy - 0.15, cz);
    topRim.castShadow = true;
    topRim.receiveShadow = true;
    const botRim = new THREE.Mesh(new THREE.CylinderGeometry(18.9, 18.95, 0.38, 48), mapleMat);
    botRim.position.set(cx, 0.19, cz);
    botRim.receiveShadow = true;
    const midStripe = new THREE.Mesh(new THREE.CylinderGeometry(18.54, 18.54, 0.42, 48), mintTrimMat);
    midStripe.position.set(cx, cy * 0.5, cz);
    midStripe.receiveShadow = true;
    this.group.add(topRim, botRim, midStripe);

    // 2. Round Stitched Pastel Felt Playmat covering the entire Boss Arena floor!
    const fleeceNor = this.pbr?.cloneMaps('polarFleece', 8, 8)?.nor ?? null;
    const feltFloorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roomTex.bossFeltMat,
      normalMap: fleeceNor,
      normalScale: new THREE.Vector2(0.10, 0.10),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.22,
    });
    const feltDisc = new THREE.Mesh(new THREE.CylinderGeometry(17.95, 17.95, 0.06, 48), feltFloorMat);
    feltDisc.position.set(cx, cy + 0.015, cz);
    feltDisc.receiveShadow = true;
    this.group.add(feltDisc);

    // Solid elevated stage base collider (identical to original geometry for exact gameplay parity)
    physics.addStaticCylinder(cx, cy * 0.5, cz, cy * 0.5, 18.5, { friction: 0.65 });

    // Soft warm center overhead glow
    const pitCenterLight = new THREE.PointLight(0xffe0a0, 14, 24, 1.5);
    pitCenterLight.position.set(cx, cy + 5.5, cz);
    this.group.add(pitCenterLight);
    this.pitCenterLight = pitCenterLight;

    // 3. Colorful Toy-Block & Maple Perimeter Fence (16 bays; bay 12 at South +Z open for Rainbow Bridge!)
    const fencePostColors = [0xf26e78, 0xf6ca48, 0x62ca8c, 0x56a4ec, 0xb88ce4, 0xf49868];
    const fenceRailMat = this.getWoodMaterial(0xe5b776, 2, 1);
    const postBoxGeo = new THREE.BoxGeometry(0.68, 1.55, 0.68);
    const railBarGeo = new THREE.BoxGeometry(0.24, 0.24, 6.95);
    const knobGeo = new THREE.SphereGeometry(0.32, 12, 10);

    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      const px = cx + Math.cos(theta) * 17.75;
      const pz = cz - Math.sin(theta) * 17.75;
      if (i !== 12) {
        // Horizontal maple rails spanning each bay
        const bayGroup = new THREE.Group();
        bayGroup.position.set(px, cy, pz);
        bayGroup.rotation.y = theta;

        for (const ry of [0.62, 1.28]) {
          const bar = new THREE.Mesh(railBarGeo, fenceRailMat);
          bar.position.set(0, ry, 0);
          bar.castShadow = true;
          bar.receiveShadow = true;
          bayGroup.add(bar);
        }
        // Colorful pastel toy-block balusters along each bay
        for (let b = -2; b <= 2; b++) {
          const colMat = this.getPaintedMat(fencePostColors[(i + b + 12) % fencePostColors.length], 0.44);
          const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.22, 10), colMat);
          picket.position.set(0, 0.66, b * 1.28);
          picket.castShadow = true;
          bayGroup.add(picket);
        }
        this.group.add(bayGroup);

        // Corner toy-block post at the bay boundary
        const postAngle = theta + Math.PI / 16;
        const postX = cx + Math.cos(postAngle) * 17.75;
        const postZ = cz - Math.sin(postAngle) * 17.75;
        const postCol = fencePostColors[i % fencePostColors.length];
        const postMesh = new THREE.Mesh(postBoxGeo, this.getToyBlockMat(postCol, 1, 1));
        postMesh.position.set(postX, cy + 0.78, postZ);
        postMesh.rotation.y = postAngle;
        postMesh.castShadow = true;
        postMesh.receiveShadow = true;
        const knob = new THREE.Mesh(knobGeo, fenceRailMat);
        knob.position.set(postX, cy + 1.72, postZ);
        knob.castShadow = true;
        this.group.add(postMesh, knob);

        physics.addStaticBox(px, cy + 0.85, pz, 0.35, 0.9, 3.6, {
          rotEuler: new THREE.Euler(0, theta, 0),
        });
      }
      const lockPx = cx + Math.cos(theta) * 18.0;
      const lockPz = cz - Math.sin(theta) * 18.0;
      const lockCol = physics.addStaticBox(lockPx, cy + 12.0, lockPz, 0.40, 12.5, 3.70, {
        rotEuler: new THREE.Euler(0, theta, 0),
        friction: 0.0,
        ignoreRays: true,
      });
      gimmicks.registerBossLockCollider(lockCol);
    }

    // 4. 8 Symmetric Kids-Room Maple Posts with Warm Paper Globe Night-Lamps & Festive Pastel Garlands!
    const degList = [11.25, 56.25, 123.75, 168.75, 213.75, 258.75, 281.25, 326.25];
    const lanternTops: THREE.Vector3[] = [];
    const globeMat = new THREE.MeshStandardMaterial({
      color: 0xfff5d6,
      emissive: 0xffc668,
      emissiveIntensity: 1.65,
      roughness: 0.32,
    });
    const poleMat = this.getWoodMaterial(0xe5b776, 1, 3);

    for (let idx = 0; idx < degList.length; idx++) {
      const rad = THREE.MathUtils.degToRad(degList[idx]);
      const lx = cx + Math.cos(rad) * 17.80;
      const lz = cz - Math.sin(rad) * 17.80;

      const poleGroup = new THREE.Group();
      poleGroup.position.set(lx, cy, lz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 12), poleMat);
      pole.position.y = 1.6;
      pole.castShadow = true;
      const pastelBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.82, 0.86),
        this.getToyBlockMat(fencePostColors[idx % fencePostColors.length], 1, 1)
      );
      pastelBase.position.y = 0.41;
      pastelBase.castShadow = true;
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), globeMat);
      globe.position.y = 3.45;
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.48, 8),
        this.getPaintedMat(fencePostColors[(idx + 2) % fencePostColors.length], 0.42)
      );
      cap.position.y = 4.02;
      poleGroup.add(pole, pastelBase, globe, cap);
      this.group.add(poleGroup);

      lanternTops.push(new THREE.Vector3(lx, cy + 3.12, lz));

      if (idx % 2 === 1) {
        const pt = new THREE.PointLight(0xffcb78, 12, 20, 1.6);
        pt.position.set(lx + Math.cos(rad) * -0.9, cy + 3.1, lz - Math.sin(rad) * -0.9);
        this.group.add(pt);
        if (idx === 1) {
          this.primaryLanternLight = pt;
        } else {
          this.extraBossPointLights.push(pt);
        }
      }
    }

    const arcOrder = [6, 7, 0, 1, 2, 3, 4, 5];
    for (let k = 0; k < arcOrder.length - 1; k++) {
      const a = arcOrder[k];
      const b = arcOrder[k + 1];
      if (a === 5 && b === 6) continue;
      worldProps.addGarlandSpan(
        lanternTops[a],
        lanternTops[b],
        9,
        0.55,
        [0xf2768c, 0xf8d452, 0x68cc8e, 0x5eb2f0, 0xc292ea]
      );
    }

    // 5. Open Toybox Lid & Pastel Toy Decor flanking the North Playroom Wall behind the Boss Stage!
    const addNorthToyChest = (tx: number, tz: number, tintHex?: number) => {
      const ch = worldProps.createCustomizedModelInstance(
        'playroomToyChest',
        tintHex !== undefined
          ? {
              Playroom_mint: (m) => {
                m.color.setHex(tintHex);
              },
            }
          : undefined
      );
      if (ch) {
        ch.position.set(tx, 0, tz);
        ch.scale.set(2.9, 2.8, 2.8);
        this.group.add(ch);
      }
    };
    addNorthToyChest(-25.5, -61.2, 0xf49888); // Peach toy chest back-left
    addNorthToyChest(25.5, -61.2); // Mint toy chest back-right
    worldProps.queue('giftBox', { x: -24.0, y: 0, z: -26.5, ry: 0.3, sx: 1.45 });
    worldProps.queue('giftBox', { x: 24.0, y: 0, z: -26.5, ry: -0.4, sx: 1.45 });
    worldProps.queue('toyHouseRed', { x: -27.2, y: 0, z: -38.0, ry: 0.7, sx: 1.25 });
    worldProps.queue('toyHouseBlue', { x: 27.2, y: 0, z: -38.0, ry: -0.7, sx: 1.25 });
    // Colorful decorative ABC block stacks framing the boss stage corners
    this.addAlphabetStaticBlock(physics, -24.2, 0.0, -53.5, 2.2, 0, false);
    this.addAlphabetStaticBlock(physics, -24.2, 2.2, -53.5, 2.0, 2, false);
    this.addAlphabetStaticBlock(physics, 24.2, 0.0, -53.5, 2.2, 4, false);
    this.addAlphabetStaticBlock(physics, 24.2, 2.2, -53.5, 2.0, 6, false);
  }

  /**
   * P2 Foreground Density: scattered colorful crayons, miniature pastel wooden blocks,
   * and an open crayon-doodle sketchbook on the front honey-oak hardwood floor!
   */
  private buildForegroundFloorToys(): void {
    const crayonColors = [
      0xee4c58, // red
      0xf79438, // orange
      0xf8d642, // yellow
      0x68c86c, // green
      0x4ca8f0, // blue
      0xaa6ee2, // purple
      0xf474a8, // pink
    ];
    const bodyGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.35, 10);
    bodyGeo.rotateZ(Math.PI / 2);
    const tipGeo = new THREE.ConeGeometry(0.11, 0.34, 10);
    tipGeo.rotateZ(-Math.PI / 2);
    const paperGeo = new THREE.CylinderGeometry(0.116, 0.116, 0.72, 10);
    paperGeo.rotateZ(Math.PI / 2);
    const stripeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 10);
    stripeGeo.rotateZ(Math.PI / 2);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.75 });
    const inkMat = new THREE.MeshStandardMaterial({ color: 0x383230, roughness: 0.65 });

    const crayonPlacements: Array<[number, number, number, number]> = [
      // Center-front hardwood strip accents framing the starting view!
      [-2.8, 28.4, 0.34, 0],
      [-2.1, 28.9, -0.48, 2],
      [-3.5, 29.3, 0.92, 4],
      [2.2, 28.5, -0.42, 6],
      [3.0, 29.0, 0.28, 3],
      [2.6, 29.6, 1.05, 1],
      // Left front floor cluster (beside sketchbook)
      [-6.8, 29.2, 0.42, 0],
      [-5.6, 29.7, -0.28, 2],
      [-7.4, 30.3, 1.15, 4],
      [-4.9, 28.8, 0.85, 6],
      [-8.5, 29.0, -0.65, 3],
      // Right front floor cluster
      [5.2, 29.1, -0.36, 1],
      [6.4, 29.8, 0.55, 3],
      [7.3, 28.9, 1.28, 5],
      [5.9, 30.6, -0.92, 0],
      [8.2, 29.9, 0.18, 4],
      // Mid-outer front accents
      [-16.2, 29.4, 0.72, 2],
      [-15.1, 29.8, -0.44, 6],
      [15.4, 29.3, -0.58, 1],
      [16.5, 29.9, 0.35, 5],
    ];
    for (const [cx, cz, ry, ci] of crayonPlacements) {
      const col = crayonColors[ci % crayonColors.length];
      const waxMat = this.getPaintedMat(col, 0.38);
      const cg = new THREE.Group();
      cg.position.set(cx, 0.11, cz);
      cg.rotation.y = ry;

      const body = new THREE.Mesh(bodyGeo, waxMat);
      body.castShadow = true;
      const tip = new THREE.Mesh(tipGeo, waxMat);
      tip.position.x = 0.84;
      tip.castShadow = true;
      const paper = new THREE.Mesh(paperGeo, paperMat);
      paper.position.x = -0.04;
      const s1 = new THREE.Mesh(stripeGeo, inkMat);
      s1.position.x = 0.24;
      const s2 = new THREE.Mesh(stripeGeo, inkMat);
      s2.position.x = -0.32;
      cg.add(body, tip, paper, s1, s2);
      this.group.add(cg);
    }

    // Open crayon sketchbook on the front-left hardwood floor
    const sbGroup = new THREE.Group();
    sbGroup.position.set(-9.6, 0.05, 29.6);
    sbGroup.rotation.y = 0.24;
    const sbCover = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.08, 1.95),
      this.getPaintedMat(0x56a4ec, 0.52)
    );
    sbCover.receiveShadow = true;
    const sbPage = new THREE.Mesh(
      new THREE.PlaneGeometry(2.42, 1.80),
      new THREE.MeshStandardMaterial({ map: this.roomTex.sketchbookDraw, roughness: 0.78 })
    );
    sbPage.rotation.x = -Math.PI / 2;
    sbPage.position.y = 0.045;
    sbPage.receiveShadow = true;
    sbGroup.add(sbCover, sbPage);
    this.group.add(sbGroup);

    // Cute miniature colorful wooden toy blocks (cubes, prisms, cylinders) scattered on front floor corners
    const miniColors = [0xf26874, 0xf8ce46, 0x62ca8c, 0x56a4ec, 0xf49868, 0xb88ce4];
    const miniPrismGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.62, 3);
    miniPrismGeo.rotateX(Math.PI / 2);
    const miniSpecs: Array<['cube' | 'prism' | 'cyl', number, number, number, number, number]> = [
      ['cube', -11.8, 0.34, 29.8, 0.32, 0],
      ['prism', -11.0, 0.34, 30.1, -0.45, 1],
      ['cyl', -11.4, 0.36, 29.1, 0.15, 2],
      ['cube', 10.6, 0.34, 29.5, -0.25, 3],
      ['cube', 11.4, 0.34, 29.7, 0.40, 4],
      ['prism', 11.0, 0.96, 29.6, 0.12, 0],
      ['cyl', 12.1, 0.36, 29.2, -0.20, 5],
      ['cube', -3.6, 0.28, 30.2, 0.52, 1],
      ['prism', 3.8, 0.28, 30.0, -0.38, 2],
      ['cube', -4.2, 0.34, 28.7, 0.24, 0],
      ['prism', -4.2, 0.96, 28.7, -0.15, 3],
      ['cyl', 4.1, 0.36, 28.6, 0.18, 4],
    ];
    for (const [shape, x, y, z, ry, ci] of miniSpecs) {
      const mat = this.getPaintedMat(miniColors[ci % miniColors.length], 0.42);
      const geo =
        shape === 'cube'
          ? new THREE.BoxGeometry(0.68, 0.68, 0.68)
          : shape === 'prism'
            ? miniPrismGeo
            : new THREE.CylinderGeometry(0.32, 0.32, 0.72, 12);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  build(
    physics: PhysicsWorld,
    blocks: ToyBlocksManager,
    collectibles: CollectiblesManager,
    gimmicks: GimmicksManager,
    _terrain: CraftTerrainBuilder,
    _grassField: StylizedGrassField,
    worldProps: WorldPropsManager,
    slimesFactory: (pos: THREE.Vector3, variant: 'mint' | 'pink', isTut?: boolean) => JellySlime,
    tanksFactory: (pos: THREE.Vector3, isGuard?: boolean) => WindupTank,
    balloonsFactory: (pos: THREE.Vector3) => PropellerBalloon,
    onCushionBounce: () => void
  ): WorldBuildResult {
    this.worldProps = worldProps;
    const slimes: JellySlime[] = [];
    const tanks: WindupTank[] = [];
    const balloons: PropellerBalloon[] = [];
    const clockworkGears: THREE.Object3D[] = [];

    // Connect Blender-crafted custom toy & gimmick visuals (World 1 uses vibrant rainbow painted dominos + playroom toybox gate!)
    blocks.setRainbowDominoMode(true);
    blocks.setVisuals({
      createBlockMesh: (mat) => worldProps.createRawModelInstance('alphabetBlockBevel', mat),
      createCrateMesh: (mat) => worldProps.createRawModelInstance('woodCrateBevel', mat),
      createDominoMesh: () => worldProps.createRawModelInstance('woodDominoBevel'),
      createBowlingPinMesh: () => worldProps.createRawModelInstance('bowlingPinSmooth'),
      getDominoParts: () => worldProps.getTemplateParts('woodDominoBevel'),
      getBowlingPinParts: () => worldProps.getTemplateParts('bowlingPinSmooth'),
    });
    gimmicks.setCustomFactories({
      createTrampolineRed: () => worldProps.createModelInstance('trampolineRedCoil'),
      createTrampolineWood: () => worldProps.createModelInstance('trampolineWoodCoil'),
      createTrampolinePastel: () => worldProps.createModelInstance('trampolineMiniPastel'),
      createStarGate: () => this.createPlayroomStarGate(worldProps),
      createCheckpointFlag: () => worldProps.createModelInstance('checkpointFlagFelt'),
    });

    // 1. Enclosed Sunlit Kids Room Shell (Hardwood Floor + Patchwork Rug + 4 Walls + Sunlit Windows)
    this.buildRoomShell(physics, gimmicks);

    // 2. South Front-Center Tutorial & Spawn Zone (Z = +10..+27)
    collectibles.addLineCoins(
      new THREE.Vector3(0, 1.15, 24.0),
      new THREE.Vector3(0, 1.15, 17.2),
      5,
      true
    );
    slimes.push(slimesFactory(new THREE.Vector3(0, 0, 14.5), 'mint', true));

    const c1 = blocks.spawnCrate(physics, new THREE.Vector3(-0.7, 0.65, 11.0), true);
    const c2 = blocks.spawnCrate(physics, new THREE.Vector3(0.7, 0.65, 11.0), true);
    const c3 = blocks.spawnCrate(physics, new THREE.Vector3(0.0, 1.95, 11.0), true);
    blocks.tutorialCrateIds.add(c1.id);
    blocks.tutorialCrateIds.add(c2.id);
    blocks.tutorialCrateIds.add(c3.id);

    // Ambient playful block clusters placed clear of West/East camera sightlines & walking lanes
    slimes.push(slimesFactory(new THREE.Vector3(-8.5, 0, 13.5), 'pink'));
    slimes.push(slimesFactory(new THREE.Vector3(8.5, 0, 13.5), 'mint'));
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(10.8, 0.6, 25.8), 0);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(12.0, 0.6, 25.8), 1);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(11.4, 1.8, 25.8), 2);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-10.8, 0.6, 25.8), 6);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-12.0, 0.6, 25.8), 7);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-11.4, 1.8, 25.8), 8);

    gimmicks.addCheckpoint(new THREE.Vector3(-5.2, 0.0, 7.8));
    collectibles.addHeart(new THREE.Vector3(5.2, 0.9, 7.8));

    // 3. Center Landmark: Alphabet Block Castle (STAR 1 + SECRET STAR 5)
    const secretCrateId = this.buildAlphabetCastle(physics, blocks, collectibles, worldProps);
    tanks.push(tanksFactory(new THREE.Vector3(0, 0, 1.6)));
    slimes.push(slimesFactory(new THREE.Vector3(5.2, 5.4, -7.8), 'pink'));

    // 4. West Landmark: Picture Books, Cushion Mountain, Giant Kids Bed & Wall Shelf (STAR 2 + SECRET STAR 4)
    this.buildWestBooksBedAndCushions(
      physics,
      blocks,
      collectibles,
      gimmicks,
      worldProps,
      balloons,
      balloonsFactory,
      onCushionBounce
    );

    // 5. East Landmark: Wooden Train Track & Moving Train, Red Springs, Bookshelf Twin Slides & Bowling Plaza (STAR 3 + SECRET STAR 6)
    this.buildEastTrainBookshelfAndBowling(
      physics,
      blocks,
      collectibles,
      gimmicks,
      worldProps,
      tanks,
      balloons,
      tanksFactory,
      balloonsFactory
    );

    // 6. North Landmark: 3-Star Gate, Rainbow Bridge & Clockwork Boss Stage
    gimmicks.buildStarGateAndRainbowBridge(physics, {
      gatePos: new THREE.Vector3(0, 0.0, -17.5),
      bridgeFromZ: -18.0,
      bridgeFromY: 0.08,
      bridgeToZ: -26.2,
      bridgeToY: 2.24,
      bridgeWidth: 5.2,
    });
    this.buildNorthBossStage(physics, worldProps, gimmicks, clockworkGears);

    gimmicks.addCheckpoint(new THREE.Vector3(-4.2, 0.0, -14.8));
    collectibles.addHeart(new THREE.Vector3(4.2, 0.9, -14.8));
    collectibles.addHeart(new THREE.Vector3(0, 3.1, -30.5), true);
    gimmicks.initBossPopupSpring(22.2);

    // Decorative gift boxes, cute wooden toy houses, & scattered craft wooden blocks for AAA diorama density!
    worldProps.queue('giftBox', { x: -29.0, y: 0.0, z: 24.5, ry: 0.4, sx: 1.35 });
    worldProps.queue('giftBox', { x: 28.4, y: 0.0, z: 27.6, ry: -0.5, sx: 1.30 });
    worldProps.queue('giftBox', { x: -29.4, y: 0.0, z: 19.6, ry: 0.18, sx: 1.05 });
    worldProps.queue('toyHouseRed', { x: -26.5, y: 0.0, z: 27.5, ry: 0.65, sx: 1.15 });
    worldProps.queue('toyHouseBlue', { x: 25.2, y: 0.0, z: 28.5, ry: -0.72, sx: 1.15 });

    // Scattered playful wooden block clusters around playroom corners & edges (clear of player paths & dominos!)
    const scatteredBlocks: Array<['bevelCubeWood' | 'bevelCylWood', number, number, number, number, number]> = [
      ['bevelCubeWood', -14.8, 0.0, 26.8, 0.28, 1.05],
      ['bevelCubeWood', -13.4, 0.0, 26.2, -0.22, 0.92],
      ['bevelCylWood', -14.1, 1.05, 26.5, 0.15, 0.85],
      ['bevelCubeWood', 12.6, 0.0, 26.5, -0.35, 1.02],
      ['bevelCylWood', 14.0, 0.0, 26.0, 0.25, 0.95],
      ['bevelCubeWood', -18.2, 0.0, -12.8, 0.42, 1.10],
      ['bevelCubeWood', -16.8, 0.0, -13.4, -0.18, 0.90],
      ['bevelCylWood', -17.5, 1.10, -13.1, 0.10, 0.85],
      ['bevelCubeWood', -27.2, 0.0, -13.5, 0.30, 0.95],
      ['bevelCylWood', 11.2, 0.0, -14.2, -0.4, 0.92],
    ];
    for (const [key, x, y, z, ry, sc] of scatteredBlocks) {
      worldProps.queue(key, { x, y, z, ry, sx: sc });
    }

    // Overhead & wall-side festive garlands spanning the sunlit playroom!
    worldProps.addGarlandSpan(
      new THREE.Vector3(-24, 14.5, -17.5),
      new THREE.Vector3(-5.5, 13.0, -17.5),
      10,
      1.2
    );
    worldProps.addGarlandSpan(
      new THREE.Vector3(5.5, 13.0, -17.5),
      new THREE.Vector3(24, 14.5, -17.5),
      10,
      1.2
    );
    worldProps.addGarlandSpan(
      new THREE.Vector3(-33.1, 16.2, -14.5),
      new THREE.Vector3(-33.1, 16.2, 6.5),
      11,
      1.35
    );
    worldProps.addGarlandSpan(
      new THREE.Vector3(-33.1, 16.2, 7.5),
      new THREE.Vector3(-33.1, 16.2, 26.5),
      10,
      1.25
    );

    // Foreground floor crayons, miniature pastel blocks & doodle sketchbook (P2 polish!)
    this.buildForegroundFloorToys();

    worldProps.flushBatches();
    blocks.finalizeDynamicInstances();
    gimmicks.buildVictoryChest(new THREE.Vector3(0, 2.2, -43.5));
    this.setQuality(this.quality);

    return {
      slimes,
      tanks,
      balloons,
      clockworkGears,
      secretCrateId,
      tutorialCoinPos: new THREE.Vector3(0, 0.2, 22.0),
      tutorialCratePos: new THREE.Vector3(0, 0.5, 11.0),
    };
  }

  setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    const isLow = resolved === 'low';
    for (const pt of this.extraBossPointLights) {
      pt.visible = !isLow;
    }
    if (this.pitCenterLight) {
      this.pitCenterLight.intensity = isLow ? 30 : 24;
      if (!isLow) this.pitCenterLight.visible = true;
    }
    if (this.primaryLanternLight) {
      this.primaryLanternLight.intensity = isLow ? 22 : 16;
      this.primaryLanternLight.distance = isLow ? 26 : 18;
      if (!isLow) this.primaryLanternLight.visible = true;
    }
    for (const b of this.sunbeamMeshes) {
      b.visible = !isLow;
    }
    if (!isLow) {
      for (const obj of this.bossDetailObjects) obj.visible = true;
      for (const c of this.cushionSpecs) {
        if (c.model) c.model.visible = true;
      }
    }
  }

  updateDistanceCulling(resolved: ResolvedQuality, camPos: THREE.Vector3): void {
    if (resolved !== 'low') {
      for (const obj of this.bossDetailObjects) obj.visible = true;
      for (const c of this.cushionSpecs) {
        if (c.model) c.model.visible = true;
      }
      if (this.pitCenterLight) this.pitCenterLight.visible = true;
      if (this.primaryLanternLight) this.primaryLanternLight.visible = true;
      return;
    }
    const bossDist = Math.hypot(camPos.x, camPos.z + 43.5);
    const showDetails = bossDist <= 56;
    for (const obj of this.bossDetailObjects) {
      obj.visible = showDetails;
    }
    const showBossLights = bossDist <= 58;
    if (this.pitCenterLight) this.pitCenterLight.visible = showBossLights;
    if (this.primaryLanternLight) this.primaryLanternLight.visible = showBossLights;
  }

  update(dt: number): void {
    // 1. Damped spring physics for bouncy patchwork cushions
    for (const c of this.cushionSpecs) {
      if (!c.model) continue;
      if (Math.abs(c.squashPos) > 0.0005 || Math.abs(c.squashVel) > 0.0005) {
        const accel = -140 * c.squashPos - 11 * c.squashVel;
        c.squashVel += accel * dt;
        c.squashPos += c.squashVel * dt;
        c.squashPos = THREE.MathUtils.clamp(c.squashPos, -0.42, 0.25);

        const factorY = THREE.MathUtils.clamp(1 + c.squashPos, 0.56, 1.25);
        c.model.scale.y = c.baseScaleY * factorY;
        c.model.position.y = c.basePosY;
      }
    }

    // 2. Animated Blender wooden toy train chugging smoothly around the carved rail loop!
    if (this.trainCurve && this.trainAnim) {
      this.trainProgress = (this.trainProgress + dt * 0.085) % 1;
      this.trainWobbleTime += dt;
      const p = this.trainCurve.getPointAt(this.trainProgress);
      const tang = this.trainCurve.getTangentAt(this.trainProgress);
      const chugBob = Math.abs(Math.sin(this.trainWobbleTime * 10.5)) * 0.025;
      const chugRoll = Math.sin(this.trainWobbleTime * 5.25) * 0.026;
      this.trainAnim.group.position.set(p.x, p.y + 0.10 + chugBob, p.z);
      this.trainAnim.group.rotation.set(0, Math.atan2(tang.x, tang.z), chugRoll, 'YXZ');

      // Cute cotton steam puffs rising straight from the brass locomotive chimney!
      this.steamSpawnTimer -= dt;
      if (this.steamSpawnTimer <= 0 && this.trainSteamPuffs.length < 10) {
        this.steamSpawnTimer = 0.28;
        this.trainAnim.group.updateMatrixWorld();
        const chimneyWorld = this.trainAnim.chimneyLocal.clone();
        this.trainAnim.group.localToWorld(chimneyWorld);
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 8, 6),
          new THREE.MeshBasicMaterial({
            color: 0xfffdf8,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
          })
        );
        puff.position.copy(chimneyWorld);
        this.group.add(puff);
        this.trainSteamPuffs.push({
          mesh: puff,
          age: 0,
          maxAge: 0.95,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.85, (Math.random() - 0.5) * 0.4),
        });
      }
    }

    for (let i = this.trainSteamPuffs.length - 1; i >= 0; i--) {
      const sp = this.trainSteamPuffs[i];
      sp.age += dt;
      if (sp.age >= sp.maxAge) {
        this.group.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        (sp.mesh.material as THREE.Material).dispose();
        this.trainSteamPuffs.splice(i, 1);
        continue;
      }
      const k = sp.age / sp.maxAge;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      sp.mesh.scale.setScalar(1 + k * 1.6);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - k);
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.cushionSpecs.length = 0;
    this.trainAnim = null;
    this.trainSteamPuffs.length = 0;
    this.sunbeamMeshes.length = 0;
    this.extraBossPointLights.length = 0;
    this.bossDetailObjects.length = 0;
    this.trainCurve = null;
    void this.worldProps;
  }
}

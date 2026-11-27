import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(GAME_ROOT, 'public');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5187;
const URL = `http://127.0.0.1:${PORT}/`;

const WIDTH = 1200;
const HEIGHT = 630;

function starPath(cx, cy, r, inner = 0.48) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)} `;
  }
  return `${d}Z`;
}

function sparklePath(cx, cy, r) {
  const k = r * 0.22;
  return (
    `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} ` +
    `Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} ` +
    `Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
  );
}

function goldStar(cx, cy, r) {
  return `
    <g>
      <path d="${starPath(cx, cy + r * 0.12, r)}" fill="#c9861c"/>
      <path d="${starPath(cx, cy, r)}" fill="url(#mmbStarGrad)" stroke="#e8a41f" stroke-width="${(r * 0.12).toFixed(1)}" stroke-linejoin="round"/>
      <ellipse cx="${cx - r * 0.22}" cy="${cy - r * 0.2}" rx="${r * 0.2}" ry="${r * 0.12}" fill="#fffbe0" opacity="0.88" transform="rotate(-30 ${cx - r * 0.22} ${cy - r * 0.2})"/>
    </g>`;
}

function buildLogoSvg() {
  const rise = [0, 7.1, 12.4, 16, 17.8, 17.8, 16, 12.4, 7.1, 0];
  const dy = rise.map((r, i) => (i === 0 ? 0 : -(r - rise[i - 1])).toFixed(1)).join(' ');
  const rot = [-9, -5, -4, -1, -2, 2, 1, 5, 3, 9].join(' ');
  const text = (id) =>
    `<text id="${id}" x="450" y="218" text-anchor="middle" dy="${dy}" rotate="${rot}" textLength="780" lengthAdjust="spacingAndGlyphs" font-family="Fredoka, 'M PLUS Rounded 1c', sans-serif" font-weight="700" font-size="132" letter-spacing="2">MANMARUBUU</text>`;

  const sparkles = [
    [96, 128, 10], [250, 58, 8], [330, 26, 6], [560, 34, 7], [600, 280, 8],
    [300, 270, 7], [866, 230, 9], [36, 244, 7], [830, 136, 6], [470, 290, 6],
  ]
    .map(([x, y, r]) => `<path d="${sparklePath(x, y, r)}" fill="#fffbe6"/>`)
    .join('');

  return `
  <svg class="mmb-logo" viewBox="0 0 900 300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${text('mmbLogoText')}
      <clipPath id="mmbLogoClip"><use href="#mmbLogoText"/></clipPath>
      <linearGradient id="mmbPinkGrad" x1="0" y1="90" x2="0" y2="225" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffb8cd"/>
        <stop offset="55%" stop-color="#f6799b"/>
        <stop offset="100%" stop-color="#e04e78"/>
      </linearGradient>
      <linearGradient id="mmbStarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff07a"/>
        <stop offset="100%" stop-color="#ffbe1f"/>
      </linearGradient>
      <filter id="logoShadow" x="-10%" y="-15%" width="120%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#4d2410" flood-opacity="0.34"/>
      </filter>
    </defs>

    <g filter="url(#logoShadow)">
      <use href="#mmbLogoText" transform="translate(0 9)" fill="#6e3a22" stroke="#6e3a22" stroke-width="38" stroke-linejoin="round"/>
      <use href="#mmbLogoText" fill="#a8643c" stroke="#a8643c" stroke-width="38" stroke-linejoin="round"/>
      <use href="#mmbLogoText" fill="#fde9cc" stroke="#fde9cc" stroke-width="32" stroke-linejoin="round"/>
      <use href="#mmbLogoText" fill="none" stroke="#c78755" stroke-width="22" stroke-linejoin="round" stroke-dasharray="6 5"/>
      <use href="#mmbLogoText" fill="#fde9cc" stroke="#fff4e2" stroke-width="17" stroke-linejoin="round"/>
      <use href="#mmbLogoText" fill="#c8456b" stroke="#c8456b" stroke-width="7" stroke-linejoin="round" transform="translate(0 4)"/>
      <use href="#mmbLogoText" fill="url(#mmbPinkGrad)" stroke="#d94f77" stroke-width="5" stroke-linejoin="round"/>
      <g clip-path="url(#mmbLogoClip)">
        <use href="#mmbLogoText" fill="none" stroke="#fff6fa" stroke-width="12" stroke-dasharray="5 4.5" stroke-linejoin="round" opacity="0.95"/>
        <use href="#mmbLogoText" fill="none" stroke="url(#mmbPinkGrad)" stroke-width="7" stroke-linejoin="round"/>
        <ellipse cx="450" cy="128" rx="440" ry="30" fill="#fff" opacity="0.3"/>
      </g>
    </g>

    ${goldStar(112, 62, 31)}
    ${goldStar(192, 32, 19)}
    ${goldStar(846, 84, 25)}
    ${goldStar(44, 176, 15)}
    ${goldStar(868, 254, 16)}
    ${goldStar(612, 32, 13)}
    ${sparkles}
  </svg>`;
}

function buildOgpOverlayHtml(bgDataUrl, buuDataUrl) {
  const decoStars = `
  <svg class="deco-svg" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="decoStarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff48f"/>
        <stop offset="100%" stop-color="#ffb71c"/>
      </linearGradient>
    </defs>
    <!-- Stars & sparkles around Buu -->
    <g>
      <path d="${starPath(1098, 128, 24)}" fill="#c9861c" transform="translate(0, 3)"/>
      <path d="${starPath(1098, 128, 24)}" fill="url(#decoStarGrad)" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>

      <path d="${starPath(804, 488, 19)}" fill="#c9861c" transform="translate(0, 2.5)"/>
      <path d="${starPath(804, 488, 19)}" fill="url(#decoStarGrad)" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>

      <path d="${starPath(1128, 456, 15)}" fill="#c9861c" transform="translate(0, 2)"/>
      <path d="${starPath(1128, 456, 15)}" fill="url(#decoStarGrad)" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>

      <path d="${sparklePath(834, 130, 14)}" fill="#fffef2"/>
      <path d="${sparklePath(1134, 250, 11)}" fill="#fffef2"/>
      <path d="${sparklePath(768, 360, 10)}" fill="#ffe89e"/>
      <path d="${sparklePath(88, 490, 12)}" fill="#fffef2"/>
      <path d="${sparklePath(650, 88, 10)}" fill="#fffef2"/>
    </g>
  </svg>`;

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=M+PLUS+Rounded+1c:wght@700;800;900&display=swap"
      rel="stylesheet"
    />
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        font-family: 'M PLUS Rounded 1c', 'Fredoka', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', sans-serif;
      }
      .canvas {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        background: #87d6ff;
      }
      .bg-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scale(1.03);
        filter: saturate(1.12) contrast(1.03) brightness(1.02);
      }
      /* Warm airy glow + readable contrast wash */
      .bg-wash {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 68% 72% at 34% 48%, rgba(255, 249, 232, 0.34) 0%, rgba(255, 249, 232, 0) 70%),
          radial-gradient(circle at 80% 52%, rgba(255, 248, 220, 0.45) 0%, rgba(255, 232, 185, 0.12) 45%, rgba(255, 232, 185, 0) 72%),
          linear-gradient(180deg, rgba(60, 145, 220, 0.08) 0%, rgba(255, 248, 235, 0) 35%, rgba(45, 26, 12, 0.24) 100%);
      }
      /* Subtle toybox stitch inner border */
      .frame-stitch {
        position: absolute;
        inset: 14px;
        border-radius: 26px;
        border: 3px dashed rgba(255, 252, 240, 0.72);
        box-shadow: inset 0 0 0 2px rgba(96, 52, 22, 0.12);
        pointer-events: none;
        z-index: 6;
      }
      .deco-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
      }
      .layout {
        position: relative;
        z-index: 4;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 32px 50px 38px 44px;
      }
      .left-col {
        width: 728px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0;
        transform: translateY(-6px);
      }
      .logo-box {
        position: relative;
        width: 726px;
        margin-bottom: -14px;
      }
      .mmb-logo {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .logo-sub {
        position: relative;
        z-index: 3;
        padding: 10px 42px 11px;
        background: linear-gradient(180deg, #ffed85 0%, #ffcc3d 55%, #f2a925 100%);
        color: #552811;
        font-size: 32px;
        font-weight: 900;
        letter-spacing: 0.03em;
        border: 4px solid #fff9eb;
        border-radius: 15px;
        box-shadow: 0 6px 0 #8a5022, 0 14px 24px rgba(68, 32, 10, 0.34);
        outline: 2.5px dashed rgba(138, 80, 34, 0.55);
        outline-offset: -9px;
        text-shadow: 0 2px 0 rgba(255, 255, 255, 0.65);
        white-space: nowrap;
      }
      .logo-sub::before,
      .logo-sub::after {
        content: '';
        position: absolute;
        top: 13px;
        width: 44px;
        height: 100%;
        background: linear-gradient(180deg, #f5b52c 0%, #d68a17 100%);
        z-index: -1;
        clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 30% 50%);
      }
      .logo-sub::before { left: -34px; }
      .logo-sub::after { right: -34px; transform: scaleX(-1); }

      .tagline-pill {
        margin-top: 26px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 12px 30px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(255, 253, 246, 0.98) 0%, rgba(255, 240, 212, 0.97) 100%);
        border: 4px solid #ffffff;
        box-shadow:
          0 0 0 3.5px #f6799b,
          0 7px 0 #b94469,
          0 16px 28px rgba(65, 24, 38, 0.32);
        color: #5b2b16;
        font-size: 23px;
        font-weight: 900;
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      .tagline-pill .accent {
        color: #d94170;
      }
      .pill-star {
        width: 24px;
        height: 24px;
        flex: 0 0 auto;
      }
      .feature-chips {
        margin-top: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: nowrap;
        gap: 12px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border-radius: 999px;
        font-size: 17px;
        font-weight: 900;
        color: #ffffff;
        border: 3px solid #fffdf5;
        box-shadow: 0 4px 0 rgba(56, 26, 12, 0.32), 0 8px 14px rgba(45, 22, 10, 0.22);
        text-shadow: 0 1.5px 0 rgba(0, 0, 0, 0.22);
        letter-spacing: 0.02em;
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .chip-pink { background: linear-gradient(180deg, #ff8ab0 0%, #e54e7c 100%); }
      .chip-blue { background: linear-gradient(180deg, #5cc7ff 0%, #2f8fe3 100%); }
      .chip-green { background: linear-gradient(180deg, #59db7b 0%, #2bb355 100%); }

      .right-col {
        position: relative;
        width: 392px;
        height: 430px;
        display: grid;
        place-items: center;
        margin-right: -4px;
      }
      .buu-medallion {
        position: absolute;
        width: 372px;
        height: 372px;
        border-radius: 50%;
        background: radial-gradient(circle at 46% 36%, rgba(255, 253, 242, 0.96) 0%, rgba(255, 239, 191, 0.9) 62%, rgba(255, 212, 226, 0.86) 100%);
        border: 7px solid #ffffff;
        box-shadow:
          0 0 0 6px #f3c17a,
          0 12px 0 #b87332,
          0 24px 42px rgba(72, 34, 12, 0.38);
      }
      .buu-medallion::after {
        content: '';
        position: absolute;
        inset: 12px;
        border-radius: 50%;
        border: 4px dashed rgba(219, 149, 76, 0.72);
      }
      .buu-img {
        position: relative;
        z-index: 2;
        width: 396px;
        height: 396px;
        object-fit: contain;
        transform: translateY(-6px) rotate(3deg);
        filter: drop-shadow(0 14px 16px rgba(84, 40, 14, 0.28));
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <img class="bg-img" src="${bgDataUrl}" alt="" />
      <div class="bg-wash"></div>
      <div class="frame-stitch"></div>
      <div class="layout">
        <div class="left-col">
          <div class="logo-box">${buildLogoSvg()}</div>
          <div class="logo-sub"><span>まんまるぶう：おもちゃばこ大暴走！</span></div>
          <div class="tagline-pill">
            <svg class="pill-star" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
              <path d="${starPath(14, 14.8, 12)}" fill="#c9861c"/>
              <path d="${starPath(14, 13.6, 12)}" fill="#ffd83a" stroke="#e59a16" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            <span><span class="accent">3Dおもちゃ箱アクション</span>・ブラウザですぐ遊べる！</span>
          </div>
          <div class="feature-chips">
            <span class="chip chip-pink">★ ジャンプ＆ヒップドロップ</span>
            <span class="chip chip-blue">★ FEVER x8 大暴走</span>
            <span class="chip chip-green">★ PC・スマホ対応</span>
          </div>
        </div>
        <div class="right-col">
          <div class="buu-medallion"></div>
          <img class="buu-img" src="${buuDataUrl}" alt="まんまるぶう" />
        </div>
      </div>
      ${decoStars}
    </div>
  </body>
</html>`;
}

async function waitForServer(url, timeoutMs = 25000, getLogs = () => '') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite dev server did not start in time. Logs:\n${getLogs()}`);
}

async function main() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  let serverLog = '';
  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: GAME_ROOT, stdio: 'pipe', shell: true }
  );
  server.stdout?.on('data', (d) => (serverLog += d.toString()));
  server.stderr?.on('data', (d) => (serverLog += d.toString()));

  let browser;
  try {
    await waitForServer(URL, 25000, () => serverLog);

    browser = await chromium.launch({
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      headless: true,
      args: [
        '--headless=new',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    // 1. Capture clean 1200x630 3D world background & high-res 512x512 Buu sprite
    const gameCtx = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    const gamePage = await gameCtx.newPage();
    await gamePage.goto(URL, { waitUntil: 'domcontentloaded' });
    await gamePage.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
    await gamePage.waitForTimeout(1200);

    // Ensure high quality and hide all HUD/title overlay so we capture the pure 3D toybox world
    await gamePage.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.setSettingsForTest({ quality: 'high' });
      const hud = document.getElementById('hud-root');
      if (hud) hud.style.display = 'none';
      const loader = document.getElementById('boot-loader');
      if (loader) loader.style.display = 'none';
    });
    await gamePage.waitForTimeout(600);

    const bgBuf = await gamePage.screenshot({ type: 'png' });
    const bgDataUrl = `data:image/png;base64,${bgBuf.toString('base64')}`;

    const buuDataUrl = await gamePage.evaluate(() =>
      window.__MANMARUBUU_DEBUG__.captureFaceWipePng('Happy', 512)
    );
    if (!buuDataUrl) {
      throw new Error('Failed to capture high-res Happy Buu sprite');
    }
    await gameCtx.close();

    // 2. Compose final 1200x630 OGP image with official fonts & vector logo
    const ogpCtx = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    const ogpPage = await ogpCtx.newPage();
    await ogpPage.setContent(buildOgpOverlayHtml(bgDataUrl, buuDataUrl), { waitUntil: 'networkidle' });
    await ogpPage.evaluate(() => document.fonts.ready);
    await ogpPage.waitForTimeout(300);

    const jpgPath = path.join(PUBLIC_DIR, 'ogp.jpg');
    await ogpPage.screenshot({ path: jpgPath, type: 'jpeg', quality: 92 });

    const jpgSize = fs.statSync(jpgPath).size;
    console.log(`Generated ${jpgPath} (${WIDTH}x${HEIGHT}, ${(jpgSize / 1024).toFixed(1)} KB)`);

    await ogpCtx.close();
  } finally {
    if (browser) await browser.close();
    if (server.pid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
        } else {
          server.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error('OGP generation failed:', err);
  process.exit(1);
});

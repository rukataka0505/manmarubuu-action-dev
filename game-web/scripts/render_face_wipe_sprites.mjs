import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(GAME_ROOT, 'public', 'images', 'face-wipe');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(QA_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5185;
const URL = `http://127.0.0.1:${PORT}/`;

const EXPRS = [
  { name: 'Sleep', file: 'sleep.png', bg: '#ffe8cc' },
  { name: 'Happy', file: 'happy.png', bg: '#fff3a8' },
  { name: 'Damage', file: 'damage.png', bg: '#ffb3c1' },
  { name: 'Pien', file: 'pien.png', bg: '#bde4ff' },
  { name: 'Ganbaru', file: 'ganbaru.png', bg: '#ffd6a5' },
  { name: 'Panic', file: 'panic.png', bg: '#d0e8ff' },
  { name: 'Pout', file: 'pout.png', bg: '#ffcce0' },
  { name: 'Fever', file: 'fever.png', bg: '#ffa6eb' },
];

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

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
    await page.waitForTimeout(800);

    const env = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    console.log('Capture environment:', JSON.stringify({ resolvedQuality: env.resolvedQuality }));
    if (env.resolvedQuality === 'low') {
      await page.evaluate(() => window.__MANMARUBUU_DEBUG__.setSettingsForTest({ quality: 'medium' }));
      await page.waitForTimeout(300);
    }

    const captured = [];
    for (const item of EXPRS) {
      const res = await page.evaluate(async (exprName) => {
        const dataUrl = window.__MANMARUBUU_DEBUG__.captureFaceWipePng(exprName, 256);
        if (!dataUrl) throw new Error(`captureFaceWipePng returned null for ${exprName}`);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = dataUrl;
        });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        return {
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          tl: px(2, 2),
          tr: px(253, 2),
          bl: px(2, 253),
          br: px(253, 253),
          center: px(128, 128),
        };
      }, item.name);

      if (res.width !== 256 || res.height !== 256) {
        throw new Error(`Expected 256x256 for ${item.name}, got ${res.width}x${res.height}`);
      }
      if (res.tl[3] !== 0 || res.tr[3] !== 0 || res.bl[3] !== 0 || res.br[3] !== 0) {
        throw new Error(
          `Expected transparent corners (alpha=0) for ${item.name}, got alphas tl=${res.tl[3]}, tr=${res.tr[3]}, bl=${res.bl[3]}, br=${res.br[3]}`
        );
      }
      if (res.center[3] < 200) {
        throw new Error(`Expected opaque center pixel for ${item.name}, got alpha=${res.center[3]}`);
      }

      const b64 = res.dataUrl.replace(/^data:image\/png;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      if (buf.length <= 3000) {
        throw new Error(`PNG too small (${buf.length} bytes) for ${item.name}`);
      }
      const outPath = path.join(OUT_DIR, item.file);
      fs.writeFileSync(outPath, buf);
      console.log(`Saved ${item.file}: ${buf.length} bytes (${res.width}x${res.height})`);
      captured.push({ ...item, dataUrl: res.dataUrl });
    }

    // Compose 4x2 QA contact sheet
    const sheetDataUrl = await page.evaluate(async (items) => {
      const cell = 256;
      const canvas = document.createElement('canvas');
      canvas.width = cell * 4;
      canvas.height = cell * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff8eb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = col * cell;
        const y = row * cell;

        // Draw subtle checkerboard + pastel circle badge to verify alpha & framing
        for (let cy = 0; cy < cell; cy += 16) {
          for (let cx = 0; cx < cell; cx += 16) {
            ctx.fillStyle = ((cx / 16 + cy / 16) % 2 === 0) ? '#f3ede3' : '#e7dfd3';
            ctx.fillRect(x + cx, y + cy, 16, 16);
          }
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = it.bg;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = it.dataUrl;
        });
        ctx.drawImage(img, x, y, cell, cell);

        ctx.fillStyle = 'rgba(55, 32, 22, 0.85)';
        ctx.fillRect(x + 8, y + 8, 108, 26);
        ctx.fillStyle = '#fff5d7';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(it.name, x + 16, y + 26);
      }

      return canvas.toDataURL('image/png');
    }, captured);

    const sheetBuf = Buffer.from(sheetDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const sheetPath = path.join(QA_DIR, 'face_wipe_sprites_8pack.png');
    fs.writeFileSync(sheetPath, sheetBuf);
    console.log(`Saved contact sheet: ${sheetPath}`);
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    if (process.platform === 'win32' && server.pid) {
      try {
        execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // ignore
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('RENDER SPRITES FAILED:', err);
    process.exit(1);
  });

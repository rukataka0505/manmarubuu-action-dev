import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const ICONS_DIR = path.join(GAME_ROOT, 'public', 'icons');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function starPath(cx, cy, r, inner = 0.48) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)} `;
  }
  return `${d}Z`;
}

function sparklePath(cx, cy, r) {
  const k = r * 0.24;
  return (
    `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} ` +
    `Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} ` +
    `Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
  );
}

function buildIconSvg() {
  // 512x512 canvas; maskable safe zone is circle r <= 184 around (256, 256)
  const dots = [];
  const step = 48;
  for (let y = 24; y < 512; y += step) {
    for (let x = 24; x < 512; x += step) {
      const offsetX = ((y / step) % 2) * (step * 0.5);
      dots.push(
        `<circle cx="${(x + offsetX) % 512}" cy="${y}" r="5.5" fill="#ffffff" opacity="0.28"/>`
      );
    }
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#fff8eb"/>
      <stop offset="56%" stop-color="#ffe7c7"/>
      <stop offset="100%" stop-color="#ffc9d8"/>
    </radialGradient>
    <radialGradient id="medallionGrad" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#fffdf7"/>
      <stop offset="100%" stop-color="#fff0cc"/>
    </radialGradient>
    <radialGradient id="buuSkin" cx="40%" cy="32%" r="75%">
      <stop offset="0%" stop-color="#fffaf0"/>
      <stop offset="60%" stop-color="#fbe6c9"/>
      <stop offset="100%" stop-color="#efc9a0"/>
    </radialGradient>
    <linearGradient id="starGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff07a"/>
      <stop offset="100%" stop-color="#ffbe1f"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#7a4128" flood-opacity="0.22"/>
    </filter>
    <filter id="buuShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#8a5022" flood-opacity="0.2"/>
    </filter>
  </defs>

  <!-- Full-bleed warm background for any & maskable icons -->
  <rect width="512" height="512" fill="url(#bgGrad)"/>
  ${dots.join('')}

  <!-- Soft outer warm halo -->
  <circle cx="256" cy="256" r="218" fill="#ffffff" opacity="0.24"/>

  <!-- Stitched toybox medallion safely inside 72% maskable safe zone (r=174 <= 184) -->
  <g filter="url(#softShadow)">
    <circle cx="256" cy="256" r="174" fill="#e3b27a"/>
    <circle cx="256" cy="256" r="167" fill="#ffffff"/>
    <circle cx="256" cy="256" r="158" fill="url(#medallionGrad)"/>
    <circle cx="256" cy="256" r="147" fill="none" stroke="#e3b27a" stroke-width="4.5" stroke-dasharray="9 8" stroke-linecap="round"/>
  </g>

  <!-- Decorative stars & sparkles inside safe zone -->
  <g transform="translate(0, 0)">
    <path d="${starPath(142, 166, 22)}" fill="#c9861c" transform="translate(0, 3)"/>
    <path d="${starPath(142, 166, 22)}" fill="url(#starGrad)" stroke="#e8a41f" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="137" cy="161" rx="4.5" ry="2.6" fill="#fffbe0" opacity="0.85" transform="rotate(-30 137 161)"/>

    <path d="${starPath(372, 174, 18)}" fill="#c9861c" transform="translate(0, 2.5)"/>
    <path d="${starPath(372, 174, 18)}" fill="url(#starGrad)" stroke="#e8a41f" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="368" cy="170" rx="3.6" ry="2.1" fill="#fffbe0" opacity="0.85" transform="rotate(-30 368 170)"/>

    <path d="${sparklePath(154, 344, 12)}" fill="#ffffff" stroke="#ffcf5c" stroke-width="1.5"/>
    <path d="${sparklePath(360, 336, 13)}" fill="#ffffff" stroke="#ff9fbb" stroke-width="1.5"/>
  </g>

  <!-- Manmarubuu plush head centered at (256, 272) -->
  <g transform="translate(256, 272) scale(1.62)" filter="url(#buuShadow)">
    <!-- Ears -->
    <g>
      <path d="M-46 -30 Q-62 -74 -26 -60 Q-14 -50 -20 -38 Z" fill="url(#buuSkin)" stroke="#c18b62" stroke-width="3" stroke-linejoin="round"/>
      <path d="M-42 -38 Q-50 -62 -30 -55 Q-24 -48 -27 -41 Z" fill="#f7b3c2"/>
    </g>
    <g>
      <path d="M46 -30 Q62 -74 26 -60 Q14 -50 20 -38 Z" fill="url(#buuSkin)" stroke="#c18b62" stroke-width="3" stroke-linejoin="round"/>
      <path d="M42 -38 Q50 -62 30 -55 Q24 -48 27 -41 Z" fill="#f7b3c2"/>
    </g>

    <!-- Round cream plush head & inner stitch -->
    <ellipse cx="0" cy="0" rx="58" ry="50" fill="url(#buuSkin)" stroke="#c18b62" stroke-width="3.2"/>
    <ellipse cx="0" cy="0" rx="51" ry="43" fill="none" stroke="#e2b48e" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.8"/>

    <!-- Forehead plush seam & cross stitches -->
    <path d="M0 -50 L0 -28" stroke="#c99a74" stroke-width="2" stroke-dasharray="3 3" stroke-linecap="round"/>
    <path d="M-5 -46 L5 -44 M-5 -38 L5 -36 M-5 -30 L5 -28" stroke="#c99a74" stroke-width="1.6" stroke-linecap="round"/>

    <!-- Embroidered brown eyes with glossy highlights -->
    <g>
      <ellipse cx="-22" cy="-6" rx="6.2" ry="8.2" fill="#5a3320"/>
      <path d="M-25 -11 L-19 -1 M-19 -11 L-25 -1" stroke="#7a4a30" stroke-width="1.2" opacity="0.7"/>
      <circle cx="-24" cy="-9.5" r="2.3" fill="#fff6ea"/>
    </g>
    <g>
      <ellipse cx="22" cy="-6" rx="6.2" ry="8.2" fill="#5a3320"/>
      <path d="M19 -11 L25 -1 M25 -11 L19 -1" stroke="#7a4a30" stroke-width="1.2" opacity="0.7"/>
      <circle cx="20" cy="-9.5" r="2.3" fill="#fff6ea"/>
    </g>

    <!-- Rosy cheeks -->
    <ellipse cx="-38" cy="14" rx="11.5" ry="6.8" fill="#ff8fa8" opacity="0.62"/>
    <ellipse cx="38" cy="14" rx="11.5" ry="6.8" fill="#ff8fa8" opacity="0.62"/>

    <!-- Pink pig snout -->
    <ellipse cx="0" cy="17" rx="19.5" ry="13.8" fill="#f7a9ba" stroke="#d97a92" stroke-width="2.4"/>
    <ellipse cx="-4" cy="12" rx="9" ry="3.2" fill="#ffd6df" opacity="0.82"/>
    <ellipse cx="-6.5" cy="18" rx="3.2" ry="4.6" fill="#a24a5e"/>
    <ellipse cx="6.5" cy="18" rx="3.2" ry="4.6" fill="#a24a5e"/>

    <!-- Happy smile -->
    <path d="M-7.5 36 Q0 42 7.5 36" fill="none" stroke="#7a4128" stroke-width="2.8" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const svg = buildIconSvg();
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      svg {
        display: block;
        width: 100vw;
        height: 100vh;
      }
    </style>
  </head>
  <body>${svg}</body>
</html>`;

  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
    args: ['--headless=new', '--no-sandbox'],
  });

  try {
    for (const size of [512, 192]) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(html, { waitUntil: 'load' });
      const outPath = path.join(ICONS_DIR, `icon-${size}.png`);
      await page.screenshot({ path: outPath, type: 'png' });
      await page.close();
      const stat = fs.statSync(outPath);
      console.log(`Generated ${outPath} (${stat.size} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});

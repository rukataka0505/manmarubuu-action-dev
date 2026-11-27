import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots', 'pwa');
fs.mkdirSync(QA_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5183;
const URL = `http://127.0.0.1:${PORT}/`;

const UA_IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
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
  throw new Error(`Vite preview server did not start in time. Logs:\n${getLogs()}`);
}

async function waitReady(page) {
  await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
  await page.waitForTimeout(550);
}

async function verifyAndDismissMobileBootTap(
  page,
  vp,
  label,
  { tapX = 24, tapY = 40, screenshotPath = null } = {}
) {
  await page.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getBootState()?.awaitingTap === true,
    undefined,
    { timeout: 10000 }
  );
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    const loader = document.getElementById('boot-loader');
    const card = document.querySelector('.boot-loader-card');
    const tapPrompt = document.querySelector('[data-role="boot-tap-prompt"]');
    const portraitOverlay = document.querySelector('[data-role="portrait-lock-overlay"]');
    const titleScreen = document.querySelector('.title-screen');
    const cardRect = card ? card.getBoundingClientRect() : null;
    const tapStyle = tapPrompt ? window.getComputedStyle(tapPrompt) : null;
    return {
      bootState: window.__MANMARUBUU_DEBUG__.getBootState(),
      bgmState: window.__MANMARUBUU_DEBUG__.getBgmState(),
      pwaState: window.__MANMARUBUU_DEBUG__.getPwaState(),
      loaderReady: Boolean(loader?.classList.contains('is-ready')),
      loaderDone: Boolean(loader?.classList.contains('is-done')),
      tapVisible: Boolean(tapPrompt && tapStyle && tapStyle.display !== 'none'),
      tapText: tapPrompt?.textContent ?? '',
      cardRect: cardRect
        ? {
            left: cardRect.left,
            top: cardRect.top,
            right: cardRect.right,
            bottom: cardRect.bottom,
            width: cardRect.width,
            height: cardRect.height,
          }
        : null,
      cardScrollW: card ? card.scrollWidth : 0,
      cardClientW: card ? card.clientWidth : 0,
      portraitHidden: portraitOverlay?.classList.contains('hidden') ?? false,
      titleHidden: titleScreen?.classList.contains('hidden') ?? false,
    };
  });

  assert(before.bootState.isMobile === true, `${label}: expected isMobile=true`);
  assert(
    before.bootState.awaitingTap === true && before.bootState.done === false,
    `${label}: expected awaitingTap=true, done=false: ${JSON.stringify(before.bootState)}`
  );
  assert(before.loaderReady && !before.loaderDone, `${label}: expected #boot-loader.is-ready`);
  assert(
    before.tapVisible && before.tapText.includes('画面をタップしてスタート！'),
    `${label}: missing boot tap prompt text, got "${before.tapText}"`
  );
  assert(before.cardRect, `${label}: missing .boot-loader-card`);
  assert(
    before.cardRect.left >= -1 &&
      before.cardRect.right <= vp.width + 1 &&
      before.cardRect.top >= -1 &&
      before.cardRect.bottom <= vp.height + 1,
    `${label}: boot card overflows viewport (${JSON.stringify(before.cardRect)}) in ${vp.width}x${vp.height}`
  );
  assert(
    before.cardScrollW <= before.cardClientW + 2,
    `${label}: boot card horizontal overflow (${before.cardScrollW} > ${before.cardClientW})`
  );
  assert(
    before.bgmState.desiredBgm === 'none' && before.bgmState.activeBgm === null,
    `${label}: BGM must NOT play before tap, got ${JSON.stringify(before.bgmState)}`
  );
  assert(before.pwaState.isOpen === false, `${label}: PWA modal must NOT open before boot tap`);
  assert(before.portraitHidden === true, `${label}: portrait overlay must NOT show before boot tap`);
  assert(before.titleHidden === true, `${label}: title screen must stay hidden before boot tap`);

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath });
  }

  await page.touchscreen.tap(tapX, tapY);

  await page.waitForFunction(
    () => {
      const dbg = window.__MANMARUBUU_DEBUG__;
      if (!dbg) return false;
      const b = dbg.getBootState();
      const a = dbg.getBgmState();
      return (
        b.done === true &&
        b.awaitingTap === false &&
        a.contextState === 'running' &&
        a.desiredBgm === 'title' &&
        a.activeBgm === 'title'
      );
    },
    undefined,
    { timeout: 5000 }
  );
  await page.waitForTimeout(550);

  const after = await page.evaluate(() => {
    const titleScreen = document.querySelector('.title-screen');
    return {
      phase: window.__MANMARUBUU_DEBUG__.getState().snapshot.phase,
      bootState: window.__MANMARUBUU_DEBUG__.getBootState(),
      bgmState: window.__MANMARUBUU_DEBUG__.getBgmState(),
      titleHidden: titleScreen?.classList.contains('hidden') ?? true,
      loaderPresent: Boolean(document.getElementById('boot-loader')),
    };
  });

  assert(
    after.phase === 'title',
    `${label}: expected phase=title after boot tap (no ghost click-through), got ${after.phase}`
  );
  assert(!after.titleHidden, `${label}: title screen should be visible after boot tap`);
  assert(!after.loaderPresent, `${label}: #boot-loader should be removed after fadeout`);
  assert(
    after.bgmState.desiredBgm === 'title' && after.bgmState.activeBgm === 'title',
    `${label}: expected title BGM running after tap, got ${JSON.stringify(after.bgmState)}`
  );
}

async function verifyModalFitsViewport(page, label, vp) {
  const layout = await page.evaluate(() => {
    const modal = document.querySelector('[data-role="pwa-install-modal"]');
    const card = document.querySelector('.pwa-install-card');
    const title = document.querySelector('#pwa-install-title');
    const dismiss = document.querySelector('[data-role="pwa-dismiss-btn"]');
    const pick = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    return {
      hidden: modal?.classList.contains('hidden') ?? true,
      card: pick(card),
      title: pick(title),
      dismiss: pick(dismiss),
      cardScrollHeight: card ? card.scrollHeight : 0,
      cardClientHeight: card ? card.clientHeight : 0,
      cardScrollWidth: card ? card.scrollWidth : 0,
      cardClientWidth: card ? card.clientWidth : 0,
    };
  });

  assert(!layout.hidden, `${label}: modal should be visible`);
  assert(layout.card, `${label}: missing card element`);
  assert(
    layout.card.left >= -1 && layout.card.right <= vp.width + 1,
    `${label}: card overflows horizontally (${JSON.stringify(layout.card)}) in ${vp.width}x${vp.height}`
  );
  assert(
    layout.card.top >= -1 && layout.card.bottom <= vp.height + 1,
    `${label}: card overflows vertically (${JSON.stringify(layout.card)}) in ${vp.width}x${vp.height}`
  );
  assert(
    layout.cardScrollWidth <= layout.cardClientWidth + 2,
    `${label}: card has horizontal scroll (${layout.cardScrollWidth} > ${layout.cardClientWidth})`
  );
  assert(
    layout.title && layout.title.top >= 0 && layout.title.left >= 0 && layout.title.right <= vp.width,
    `${label}: title ribbon clipped (${JSON.stringify(layout.title)})`
  );
  assert(
    layout.dismiss && layout.dismiss.bottom <= vp.height + 1 && layout.dismiss.top >= 0,
    `${label}: dismiss button outside viewport (${JSON.stringify(layout.dismiss)})`
  );
}

async function verifyStaticAssets() {
  const htmlRes = await fetch(URL);
  assert(htmlRes.status === 200, `index.html status ${htmlRes.status}`);
  const html = await htmlRes.text();
  assert(html.includes('viewport-fit=cover'), 'index.html missing viewport-fit=cover');
  assert(html.includes('manifest.webmanifest'), 'index.html missing manifest link');
  assert(html.includes('apple-mobile-web-app-capable'), 'index.html missing apple-mobile-web-app-capable');
  assert(html.includes('apple-touch-icon'), 'index.html missing apple-touch-icon');
  assert(html.includes('name="theme-color"'), 'index.html missing theme-color');

  const manifestRes = await fetch(`${URL}manifest.webmanifest`);
  assert(manifestRes.status === 200, `manifest.webmanifest status ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  assert(manifest.name === 'まんまるぶう：おもちゃばこ大暴走！', `Unexpected manifest.name: ${manifest.name}`);
  assert(manifest.short_name === 'まんまるぶう', `Unexpected manifest.short_name: ${manifest.short_name}`);
  assert(manifest.display === 'standalone', `Unexpected manifest.display: ${manifest.display}`);
  assert(manifest.start_url === './' && manifest.scope === './', 'Unexpected start_url or scope');
  assert(
    Array.isArray(manifest.icons) &&
      manifest.icons.some((i) => i.sizes === '192x192' && String(i.purpose).includes('maskable')) &&
      manifest.icons.some((i) => i.sizes === '512x512' && String(i.purpose).includes('maskable')),
    'Manifest missing 192x192 / 512x512 maskable icons'
  );

  for (const iconPath of ['icons/icon-192.png', 'icons/icon-512.png']) {
    const res = await fetch(`${URL}${iconPath}`);
    assert(res.status === 200, `${iconPath} status ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    assert(
      buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
      `${iconPath} is not a valid PNG`
    );
  }

  const swRes = await fetch(`${URL}sw.js`);
  assert(swRes.status === 200, `sw.js status ${swRes.status}`);
  const swText = await swRes.text();
  assert(swText.includes('CACHE_NAME') && swText.includes("addEventListener('fetch'"), 'sw.js invalid content');
  console.log('Static PWA assets verified (200 OK).');
}

async function main() {
  let serverLog = '';
  const server = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: GAME_ROOT, stdio: 'pipe', shell: true }
  );
  server.stdout?.on('data', (d) => (serverLog += d.toString()));
  server.stderr?.on('data', (d) => (serverLog += d.toString()));

  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const failedUrls = [];

  const attachListeners = (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedUrls.push(`${res.status()} ${res.url()}`);
      }
    });
  };

  try {
    await waitForServer(URL, 25000, () => serverLog);
    await verifyStaticAssets();

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

    // 1. Desktop PC browser: must NOT auto-open and must NOT show title button; SW must register
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);

      const swRegistered = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((r) => setTimeout(() => r(null), 5000)),
        ]);
        return Boolean(reg && reg.active);
      });
      assert(swRegistered, 'Expected Service Worker to register and activate on vite preview');

      const pcBoot = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBootState());
      assert(
        pcBoot.isMobile === false && pcBoot.done === true && pcBoot.awaitingTap === false,
        `PC should skip tap-to-start: ${JSON.stringify(pcBoot)}`
      );
      await page.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getBgmState()?.activeBgm === 'title',
        undefined,
        { timeout: 5000 }
      );
      const pcBgm = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBgmState());
      assert(
        pcBgm.desiredBgm === 'title' && pcBgm.activeBgm === 'title',
        `PC should start title BGM automatically: ${JSON.stringify(pcBgm)}`
      );
      const pcTitleHidden = await page
        .locator('.title-screen')
        .evaluate((el) => el.classList.contains('hidden'));
      assert(!pcTitleHidden, 'PC title screen should be visible automatically');

      const pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isMobile === false, `PC should not be mobile: ${JSON.stringify(pwaState)}`);
      assert(pwaState.isOpen === false, `PC should not auto-open modal: ${JSON.stringify(pwaState)}`);
      assert(pwaState.canShowTitleButton === false, 'PC should not show title PWA button');
      const titleBtnHidden = await page
        .locator('[data-role="title-pwa-install-btn"]')
        .evaluate((el) => el.classList.contains('hidden'));
      assert(titleBtnHidden, 'Title PWA button should have hidden class on PC');
      await ctx.close();
      console.log('Desktop PC check passed.');
    }

    // 2. iOS Safari UA (non-standalone): Portrait (auto-open, 3 steps, dismiss, session skip, manual reopen)
    {
      const vp = { width: 390, height: 844 };
      const ctx = await browser.newContext({
        viewport: vp,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_IOS_SAFARI,
      });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'iOS Safari Portrait BootTap', {
        tapX: 24,
        tapY: 40,
        screenshotPath: path.join(QA_DIR, 'boot_tap_ios_portrait.png'),
      });

      let pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isMobile === true, 'iOS Safari should be mobile');
      assert(pwaState.isStandalone === false, 'iOS Safari should not be standalone');
      assert(pwaState.platform === 'ios-safari', `Expected ios-safari, got ${pwaState.platform}`);
      assert(pwaState.isOpen === true, 'iOS Safari should auto-open modal after boot tap');
      const portraitHiddenDuringPwa = await page
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => el.classList.contains('hidden'));
      assert(portraitHiddenDuringPwa, 'Portrait overlay must stay hidden while PWA modal is open');

      const modalText = await page.locator('.pwa-install-card').innerText();
      assert(
        modalText.includes('フルスクリーン') &&
          modalText.includes('共有ボタン') &&
          modalText.includes('ホーム画面に追加') &&
          modalText.includes('追加'),
        `iOS Safari modal text incomplete: ${modalText}`
      );
      await verifyModalFitsViewport(page, 'iOS Safari Portrait', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'ios_safari_portrait.png') });

      // Dismiss with "このままブラウザで遊ぶ" -> Portrait overlay should appear next!
      await page.click('[data-role="pwa-dismiss-btn"]');
      await page.waitForTimeout(250);
      pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isOpen === false && pwaState.dismissedInSession === true, 'Dismiss failed');
      const portraitVisibleAfterDismiss = await page
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => !el.classList.contains('hidden'));
      assert(portraitVisibleAfterDismiss, 'Portrait overlay should appear after dismissing PWA modal');

      // Reload within same session -> tap wait again -> tap -> should NOT auto-open PWA modal, portrait overlay shows
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'iOS Safari Portrait Reload BootTap', {
        tapX: 24,
        tapY: 40,
      });
      pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isOpen === false, 'Modal should stay closed on same-session reload');
      assert(pwaState.canShowTitleButton === true, 'Title PWA button should remain available');
      const portraitVisibleOnReload = await page
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => !el.classList.contains('hidden'));
      assert(portraitVisibleOnReload, 'Portrait overlay should show on portrait reload when PWA dismissed');

      // Rotate to landscape -> portrait overlay hides and Title screen + PWA button become clickable
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      const portraitHiddenOnLandscape = await page
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => el.classList.contains('hidden'));
      assert(portraitHiddenOnLandscape, 'Portrait overlay should hide after rotating to landscape');
      await page.screenshot({ path: path.join(QA_DIR, 'ios_safari_title_btn.png') });

      // Manual open from Title button -> then rotate back to portrait -> portrait overlay must stay hidden while PWA modal is open
      await page.click('[data-role="title-pwa-install-btn"]');
      await page.waitForTimeout(250);
      pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isOpen === true, 'Manual title button should open PWA modal');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      const portraitHiddenOnManualPwa = await page
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => el.classList.contains('hidden'));
      assert(portraitHiddenOnManualPwa, 'Portrait overlay should stay hidden when PWA modal is open in portrait');
      await ctx.close();
      console.log('iOS Safari portrait check passed.');
    }

    // 3. iOS Safari UA: Landscape 844x390 layout check
    {
      const vp = { width: 844, height: 390 };
      const ctx = await browser.newContext({
        viewport: vp,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_IOS_SAFARI,
      });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'iOS Safari Landscape BootTap', {
        tapX: 24,
        tapY: 40,
        screenshotPath: path.join(QA_DIR, 'boot_tap_ios_landscape.png'),
      });
      await verifyModalFitsViewport(page, 'iOS Safari Landscape', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'ios_safari_landscape.png') });
      await ctx.close();
      console.log('iOS Safari landscape check passed.');
    }

    // 4. iOS non-Safari UA (CriOS / LINE): friendly Safari redirect guidance
    {
      const vp = { width: 390, height: 844 };
      const ctx = await browser.newContext({
        viewport: vp,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_IOS_CHROME,
      });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'iOS CriOS BootTap', {
        tapX: 24,
        tapY: 40,
      });

      const pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.platform === 'ios-other' && pwaState.isOpen === true, `Expected ios-other open, got ${JSON.stringify(pwaState)}`);
      const text = await page.locator('.pwa-install-card').innerText();
      assert(text.includes('Safari') && text.includes('ホーム画面に追加'), `Missing Safari guidance: ${text}`);
      await verifyModalFitsViewport(page, 'iOS Other Portrait', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'ios_other_portrait.png') });
      await ctx.close();
      console.log('iOS non-Safari check passed.');
    }

    // 5. Android Chrome UA: fallback steps + beforeinstallprompt native CTA + suppress persistence
    {
      const vp = { width: 390, height: 844 };
      const ctx = await browser.newContext({
        viewport: vp,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_ANDROID_CHROME,
      });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'Android Chrome Portrait BootTap', {
        tapX: 24,
        tapY: 40,
      });

      let pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.platform === 'android-chrome' && pwaState.isOpen === true, `Expected android-chrome open, got ${JSON.stringify(pwaState)}`);
      await verifyModalFitsViewport(page, 'Android Chrome Portrait (Steps)', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'android_chrome_portrait.png') });

      // Simulate beforeinstallprompt event
      await page.evaluate(() => {
        window.__bipPromptCalled = false;
        const ev = new Event('beforeinstallprompt', { cancelable: true });
        ev.prompt = async () => {
          window.__bipPromptCalled = true;
        };
        ev.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
        window.dispatchEvent(ev);
      });
      await page.waitForTimeout(150);

      const nativeBtnVisible = await page
        .locator('[data-role="pwa-native-cta-wrap"]')
        .evaluate((el) => !el.classList.contains('hidden'));
      assert(nativeBtnVisible, 'Expected native install CTA wrap to be visible after beforeinstallprompt');
      const cardText = await page.locator('.pwa-install-card').innerText();
      assert(cardText.includes('アプリをインストール'), `Missing fallback note: ${cardText}`);
      await verifyModalFitsViewport(page, 'Android Chrome Portrait (Native CTA)', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'android_chrome_native_cta.png') });

      await page.click('[data-role="pwa-native-install-btn"]', { force: true });
      await page.waitForTimeout(150);
      const called = await page.evaluate(() => window.__bipPromptCalled === true);
      assert(called, 'Clicking native install CTA did not invoke deferredPrompt.prompt()');

      // Test "次回から自動で表示しない" persistence across new session
      await page.check('[data-role="pwa-suppress-checkbox"]');
      await page.click('[data-role="pwa-dismiss-btn"]');
      await page.waitForTimeout(150);
      await page.evaluate(() => sessionStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'Android Chrome Suppress Reload BootTap', {
        tapX: 24,
        tapY: 40,
      });

      pwaState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(pwaState.isOpen === false && pwaState.suppressedForever === true, 'Permanent suppress did not persist');
      assert(pwaState.canShowTitleButton === true, 'Title button should still allow manual open when suppressed');

      await ctx.close();
      console.log('Android Chrome portrait + native CTA + suppress check passed.');
    }

    // 6. Android Chrome UA: Landscape 844x390
    {
      const vp = { width: 844, height: 390 };
      const ctx = await browser.newContext({
        viewport: vp,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_ANDROID_CHROME,
      });
      const page = await ctx.newPage();
      attachListeners(page);
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      await verifyAndDismissMobileBootTap(page, vp, 'Android Chrome Landscape BootTap', {
        tapX: 24,
        tapY: 40,
      });
      await verifyModalFitsViewport(page, 'Android Chrome Landscape', vp);
      await page.screenshot({ path: path.join(QA_DIR, 'android_chrome_landscape.png') });
      await ctx.close();
      console.log('Android Chrome landscape check passed.');
    }

    // 7. Standalone mode checks (iOS navigator.standalone & Android display-mode: standalone)
    {
      const vpPortrait = { width: 390, height: 844 };
      const ctxIos = await browser.newContext({
        viewport: vpPortrait,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_IOS_SAFARI,
      });
      const pIos = await ctxIos.newPage();
      attachListeners(pIos);
      await pIos.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { get: () => true });
      });
      await pIos.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(pIos);
      await verifyAndDismissMobileBootTap(pIos, vpPortrait, 'iOS Standalone Portrait BootTap', {
        tapX: 24,
        tapY: 40,
      });
      const stIos = await pIos.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(stIos.isStandalone === true && stIos.isOpen === false && stIos.canShowTitleButton === false, `iOS standalone check failed: ${JSON.stringify(stIos)}`);
      const iosPortraitShown = await pIos
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => !el.classList.contains('hidden'));
      assert(iosPortraitShown, 'iOS standalone portrait should show portrait overlay after boot tap');
      await ctxIos.close();

      const ctxAnd = await browser.newContext({
        viewport: vpPortrait,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_ANDROID_CHROME,
      });
      const pAnd = await ctxAnd.newPage();
      attachListeners(pAnd);
      await pAnd.addInitScript(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
          if (String(q).includes('display-mode: standalone')) {
            return {
              matches: true,
              media: q,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent: () => false,
            };
          }
          return orig(q);
        };
      });
      await pAnd.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(pAnd);
      await verifyAndDismissMobileBootTap(pAnd, vpPortrait, 'Android Standalone Portrait BootTap', {
        tapX: 24,
        tapY: 40,
      });
      const stAnd = await pAnd.evaluate(() => window.__MANMARUBUU_DEBUG__.getPwaState());
      assert(stAnd.isStandalone === true && stAnd.isOpen === false && stAnd.canShowTitleButton === false, `Android standalone check failed: ${JSON.stringify(stAnd)}`);
      const andPortraitShown = await pAnd
        .locator('[data-role="portrait-lock-overlay"]')
        .evaluate((el) => !el.classList.contains('hidden'));
      assert(andPortraitShown, 'Android standalone portrait should show portrait overlay after boot tap');
      await ctxAnd.close();

      // 8. Standalone Landscape: tap directly over center PLAY button coordinates -> verify NO ghost click-through, title + BGM active!
      const vpLand = { width: 844, height: 390 };
      const ctxLand = await browser.newContext({
        viewport: vpLand,
        hasTouch: true,
        isMobile: true,
        userAgent: UA_IOS_SAFARI,
      });
      const pLand = await ctxLand.newPage();
      attachListeners(pLand);
      await pLand.addInitScript(() => {
        Object.defineProperty(navigator, 'standalone', { get: () => true });
      });
      await pLand.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(pLand);
      await verifyAndDismissMobileBootTap(pLand, vpLand, 'iOS Standalone Landscape CenterTap', {
        tapX: 422,
        tapY: 260,
      });
      const stLand = await pLand.evaluate(() => ({
        pwa: window.__MANMARUBUU_DEBUG__.getPwaState(),
        portraitHidden: document.querySelector('[data-role="portrait-lock-overlay"]')?.classList.contains('hidden') ?? false,
      }));
      assert(
        stLand.pwa.isStandalone === true && stLand.pwa.isOpen === false && stLand.portraitHidden === true,
        `Standalone landscape title state mismatch: ${JSON.stringify(stLand)}`
      );
      await pLand.screenshot({ path: path.join(QA_DIR, 'standalone_landscape_title.png') });
      await ctxLand.close();

      console.log('Standalone checks passed.');
    }

    console.log('Failed URLs:', failedUrls);
    console.log('Console errors:', consoleErrors.length, consoleErrors);
    console.log('Page errors:', pageErrors.length, pageErrors);
    assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join('; ')}`);
    assert(failedUrls.length === 0, `Failed URLs: ${failedUrls.join('; ')}`);

    console.log('PWA_QA_OK');
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
    console.error('PWA QA FAILED:', err);
    process.exit(1);
  });

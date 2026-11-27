import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots', 'phase-a');
const MOBILE_AUDIT_DIR = path.join(GAME_ROOT, 'qa-shots', 'mobile-audit');
fs.mkdirSync(QA_DIR, { recursive: true });
fs.mkdirSync(MOBILE_AUDIT_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5181;
const URL = `http://127.0.0.1:${PORT}/`;

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function rectsOverlap(a, b, pad = 2) {
  return !(
    a.right - pad <= b.left ||
    b.right - pad <= a.left ||
    a.bottom - pad <= b.top ||
    b.bottom - pad <= a.top
  );
}

async function pickRect(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  }, sel);
}

function assertInViewport(rect, label, vp) {
  assert(rect, `Missing element: ${label} on ${vp.name}`);
  assert(
    rect.left >= -1 && rect.right <= vp.width + 1 && rect.top >= -1 && rect.bottom <= vp.height + 1,
    `${label} out of viewport (${JSON.stringify(rect)}) on ${vp.name} (${vp.width}x${vp.height})`
  );
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

async function waitReady(page) {
  await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
  await page.waitForTimeout(700);
}

async function passMobileBootTap(page, label, tapX = 24, tapY = 40) {
  await page.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getBootState()?.awaitingTap === true,
    undefined,
    { timeout: 10000 }
  );
  await page.waitForTimeout(150);
  const beforeBgm = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBgmState());
  assert(
    beforeBgm.desiredBgm === 'none' && beforeBgm.activeBgm === null,
    `${label}: BGM must not play before boot tap: ${JSON.stringify(beforeBgm)}`
  );
  await page.touchscreen.tap(tapX, tapY);
  await page.waitForFunction(
    () => {
      const dbg = window.__MANMARUBUU_DEBUG__;
      if (!dbg) return false;
      const b = dbg.getBootState();
      const a = dbg.getBgmState();
      return b.done === true && !b.awaitingTap && a.activeBgm === 'title';
    },
    undefined,
    { timeout: 5000 }
  );
  await page.waitForTimeout(560);
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

    // =========================================================================
    // PART 1: Desktop Flow (Settings, World Select, Tutorial, HP/GameOver, Secrets, Stamps)
    // =========================================================================
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    attachListeners(page);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(page);

    const pcBoot = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBootState());
    assert(
      pcBoot.isMobile === false && pcBoot.done === true && pcBoot.awaitingTap === false,
      `PC should skip boot tap wait: ${JSON.stringify(pcBoot)}`
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getBgmState()?.activeBgm === 'title',
      undefined,
      { timeout: 5000 }
    );

    // 1. Check default settings: cameraAutoFollow === false, faceWipe3d === 'auto', showFps === false
    const initSettings = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSettings());
    const initEnv = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    assert(initSettings.cameraAutoFollow === false, `Expected default cameraAutoFollow false, got ${initSettings.cameraAutoFollow}`);
    assert(initSettings.faceWipe3d === 'auto', `Expected default faceWipe3d 'auto', got ${initSettings.faceWipe3d}`);
    assert(initSettings.showFps === false, `Expected default showFps false, got ${initSettings.showFps}`);
    assert(initEnv.cameraAutoFollow === false, `Expected CameraController autoFollow false`);
    assert(await page.locator('.fps-badge.hidden').count() === 1, 'Expected FPS badge hidden by default');
    await page.screenshot({ path: path.join(QA_DIR, '01_title_updated.png') });

    // 2. Open World Select & verify World 1 + Coming Soon
    await page.click('[data-role="world-select-btn"]', { force: true });
    await page.waitForTimeout(350);
    const wsText = await page.locator('.world-select-screen').innerText();
    assert(wsText.includes('World 1') && wsText.includes('Coming Soon'), 'World select missing expected worlds');
    await page.screenshot({ path: path.join(QA_DIR, '02_world_select.png') });

    await page.click('[data-role="ws-back-btn"]', { force: true });
    await page.waitForTimeout(250);

    // 3. Open Settings modal, change quality -> 'low', showFps -> ON & sensitivity -> 1.4, verify persistence
    await page.click('[data-role="title-settings-btn"]', { force: true });
    await page.waitForTimeout(250);
    await page.click('[data-setting="quality"][data-value="low"]');
    await page.click('[data-setting="show-fps"][data-value="on"]');
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.setSettingsForTest({ cameraSensitivity: 1.4 });
    });
    await page.waitForTimeout(250);
    const lowEnv = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    assert(lowEnv.n8aoEnabled === false, `Expected n8aoEnabled false in low quality, got ${lowEnv.n8aoEnabled}`);
    assert(lowEnv.shadowsEnabled === false, `Expected shadowsEnabled false in low quality, got ${lowEnv.shadowsEnabled}`);
    assert(lowEnv.faceWipe3dActive === false, `Expected faceWipe3dActive false in low quality, got ${lowEnv.faceWipe3dActive}`);
    assert(
      lowEnv.grassClusters < initEnv.grassClusters,
      `Expected low grassClusters (${lowEnv.grassClusters}) < medium (${initEnv.grassClusters})`
    );
    await page.screenshot({ path: path.join(QA_DIR, '03_settings_modal.png') });

    // Reload directly in 'low' quality and verify lazy composer/faceWipe clone & localStorage persistence
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(page);
    const reloadedSettings = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSettings());
    assert(reloadedSettings.quality === 'low', `Quality not persisted: ${reloadedSettings.quality}`);
    assert(reloadedSettings.showFps === true, `showFps not persisted: ${reloadedSettings.showFps}`);
    assert(Math.abs(reloadedSettings.cameraSensitivity - 1.4) < 0.01, `Sensitivity not persisted: ${reloadedSettings.cameraSensitivity}`);

    const coldLowEnv = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    assert(coldLowEnv.composerInitialized === false, `Expected EffectComposer lazy-skipped on low startup`);
    assert(coldLowEnv.faceWipeCloneCreated === false, `Expected 3D FaceWipe clone lazy-skipped on low startup`);
    assert(coldLowEnv.shadowsEnabled === false, `Expected shadowsEnabled false on low startup`);

    // Enter World 1 while still in 'low' -> Welcome Movie -> Step 1 Intro Card -> Step 1
    await page.click('[data-role="world-select-btn"]', { force: true });
    await page.waitForTimeout(250);
    await page.click('[data-role="select-world-1-btn"]', { force: true });
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
      undefined,
      { timeout: 6000 }
    );
    const deskWelcomeSub = await page.locator('.welcome-sub').innerText();
    assert(
      deskWelcomeSub.includes('まんまるぶうといっしょに'),
      `Expected updated desktop welcome subcopy, got "${deskWelcomeSub}"`
    );
    const deskWelcomeCardRect = await pickRect(page, '.welcome-title-card');
    const deskWelcomeSkipRect = await pickRect(page, '[data-role="welcome-skip-btn"]');
    assert(
      deskWelcomeSkipRect.top >= deskWelcomeCardRect.bottom + 8,
      `Desktop welcome skip button too close/overlapping card: cardBottom=${deskWelcomeCardRect.bottom}, skipTop=${deskWelcomeSkipRect.top}`
    );
    await page.screenshot({ path: path.join(QA_DIR, '03a_welcome_movie_desktop.png') });
    await page.click('[data-role="welcome-skip-btn"]', { force: true });
    await page.waitForFunction(
      () => {
        const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
        return Boolean(s?.tutorialAwaitingConfirm && s?.tutorialConfirmStep === 0 && s?.tutorialConfirmReady);
      },
      undefined,
      { timeout: 6000 }
    );
    await page.screenshot({ path: path.join(QA_DIR, '03b_step1_intro_desktop.png') });
    await page.click('[data-role="tut-confirm-next-btn"]', { force: true });
    await page.waitForTimeout(300);

    const playingLowEnv = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    assert(playingLowEnv.composerInitialized === false, 'Expected composer still uninitialized during low gameplay');
    assert(playingLowEnv.faceWipeCloneCreated === false, 'Expected 3D faceWipe clone still uncreated during low gameplay');
    assert(playingLowEnv.shadowsEnabled === false, 'Expected shadows OFF during low gameplay');
    assert(
      (await page.locator('.face-wipe-hole.mode-2d .face-wipe-2d-svg').count()) === 0,
      'Legacy 2D SVG face wipe must be removed in low mode'
    );
    assert(
      (await page.locator('.face-wipe-hole.mode-2d .face-wipe-sprite-img').count()) === 1,
      'Expected 2D 3D-rendered sprite img face wipe in low mode'
    );
    const deskWipeImgOk = await page
      .locator('.face-wipe-hole.mode-2d .face-wipe-sprite-img')
      .evaluate((el) => el.complete && el.naturalWidth === 256 && el.naturalHeight === 256);
    assert(deskWipeImgOk, 'Expected desktop low-mode sprite img to finish loading at 256x256');
    const fpsBadgeHidden = await page.locator('.fps-badge').evaluate((el) => el.classList.contains('hidden'));
    const fpsBadgeText = await page.locator('.fps-badge').innerText();
    assert(!fpsBadgeHidden && /\d+\s*FPS/.test(fpsBadgeText), `Expected visible FPS badge, got "${fpsBadgeText}"`);

    // Switch back to medium & turn FPS badge OFF for main desktop visual walkthrough, then compare render stats
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.setSettingsForTest({ quality: 'medium', showFps: false }));
    await page.waitForFunction(
      () => {
        const env = window.__MANMARUBUU_DEBUG__?.getEnvironmentStats();
        return Boolean(env?.hdriLoaded && env?.pbrTexturesLoaded >= 30);
      },
      undefined,
      { timeout: 10000 }
    );
    await page.waitForTimeout(250);
    const playingMedEnv = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    console.log(
      `RENDER_PERF_COMPARE low={drawCalls:${playingLowEnv.drawCalls}, triangles:${playingLowEnv.triangles}, grass:${playingLowEnv.grassClusters}, shadows:${playingLowEnv.shadowsEnabled}, composer:${playingLowEnv.composerInitialized}, wipe3d:${playingLowEnv.faceWipe3dActive}} vs medium={drawCalls:${playingMedEnv.drawCalls}, triangles:${playingMedEnv.triangles}, grass:${playingMedEnv.grassClusters}, shadows:${playingMedEnv.shadowsEnabled}, composer:${playingMedEnv.composerInitialized}, wipe3d:${playingMedEnv.faceWipe3dActive}}`
    );
    assert(
      playingLowEnv.drawCalls < playingMedEnv.drawCalls,
      `Expected low drawCalls (${playingLowEnv.drawCalls}) < medium (${playingMedEnv.drawCalls})`
    );
    assert(
      playingLowEnv.triangles < playingMedEnv.triangles,
      `Expected low triangles (${playingLowEnv.triangles}) < medium (${playingMedEnv.triangles})`
    );
    assert(
      playingLowEnv.grassClusters < playingMedEnv.grassClusters,
      `Expected low grassClusters (${playingLowEnv.grassClusters}) < medium (${playingMedEnv.grassClusters})`
    );
    assert(
      playingLowEnv.drawCalls <= 350,
      `Expected low drawCalls <= 350, got ${playingLowEnv.drawCalls}`
    );
    assert(
      playingLowEnv.triangles <= 600000,
      `Expected low triangles <= 600000, got ${playingLowEnv.triangles}`
    );
    assert(playingMedEnv.shadowsEnabled === true, 'Expected shadows re-enabled when switching back to medium');
    assert(playingMedEnv.composerInitialized === true, 'Expected composer initialized in medium');
    assert(playingMedEnv.faceWipe3dActive === true, 'Expected 3D face wipe active in medium');
    assert(playingMedEnv.faceWipeCloneCreated === true, 'Expected 3D face wipe clone created in medium');
    assert(
      (await page.locator('.face-wipe-hole.mode-2d').count()) === 0,
      'Expected 2D face wipe cleared when switched back to medium'
    );
    assert((await page.locator('.fps-badge.hidden').count()) === 1, 'Expected FPS badge hidden when toggled OFF');

    // 4. New 6-step Tutorial Verification (Afterglow Delay + Manual Confirm Cards + Input Guard + 3-Page Manual Tour)
    let st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.tutorialStep === 1, `Expected tutorialStep 1, got ${st.snapshot.tutorialStep}`);
    await page.screenshot({ path: path.join(QA_DIR, '04_tutorial_step1.png') });

    // Step 1: Walk forward along coins -> enter afterglow (pendingConfirm, NOT frozen immediately) -> after 0.8s confirm card opens
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 6000 }
    );
    await page.keyboard.up('KeyW');
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialPendingConfirm === true && st.snapshot.tutorialAwaitingConfirm === false,
      `Step 1 should enter afterglow delay before freezing! pending=${st.snapshot.tutorialPendingConfirm} awaiting=${st.snapshot.tutorialAwaitingConfirm}`
    );
    assert((await page.locator('.tutorial-card.cleared').count()) === 1, 'Expected .tutorial-card.cleared highlight during afterglow');
    assert((await page.locator('.tut-clear-badge:not(.hidden)').count()) === 1, 'Expected visible .tut-clear-badge during afterglow');

    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialAwaitingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 7000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 1 && st.snapshot.tutorialAwaitingConfirm === true,
      `Expected Step 1 awaiting confirm after delay, got step=${st.snapshot.tutorialStep} awaiting=${st.snapshot.tutorialAwaitingConfirm}`
    );

    // Anti-accidental skip checks: Space must NEVER skip, and Enter within 0.30s guard must NOT skip
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialAwaitingConfirm === true && st.snapshot.tutorialStep === 1,
      'Confirm card should NOT advance during 0.30s guard or on Space!'
    );

    // Wait past 0.30s guard, verify Space STILL does not skip, then Enter advances to Step 2
    await page.waitForTimeout(360);
    await page.keyboard.press('Space');
    await page.waitForTimeout(60);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialAwaitingConfirm === true && st.snapshot.tutorialStep === 1,
      'Space key must NEVER dismiss confirm card even after guard expires!'
    );
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 2 && st.snapshot.tutorialAwaitingConfirm === false,
      `Expected Step 2 after Enter, got step=${st.snapshot.tutorialStep} awaiting=${st.snapshot.tutorialAwaitingConfirm}`
    );

    // Step 2: Rotate camera with ArrowRight -> afterglow -> confirm card -> click "つぎへ ▶"
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 6000 }
    );
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialAwaitingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 7000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 2 && st.snapshot.tutorialAwaitingConfirm === true,
      `Expected Step 2 awaiting confirm, got step=${st.snapshot.tutorialStep}`
    );
    await page.waitForTimeout(360);
    await page.click('[data-role="tut-confirm-next-btn"]', { force: true });
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.tutorialStep === 3, `Expected Step 3, got ${st.snapshot.tutorialStep}`);

    // Step 3: Double jump -> MUST NOT freeze mid-air! Wait for landing + 0.4s -> confirm card -> Enter
    await page.keyboard.press('Space');
    await page.waitForTimeout(240);
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 6000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialPendingConfirm === true && st.snapshot.tutorialAwaitingConfirm === false,
      `Step 3 must NOT freeze in mid-air immediately on double jump! pending=${st.snapshot.tutorialPendingConfirm} awaiting=${st.snapshot.tutorialAwaitingConfirm}`
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialAwaitingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 8000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 3 &&
        st.snapshot.tutorialAwaitingConfirm === true &&
        st.snapshot.playerAirborne === false,
      `Expected Step 3 awaiting confirm after landing, got step=${st.snapshot.tutorialStep} airborne=${st.snapshot.playerAirborne}`
    );
    await page.waitForTimeout(360);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.tutorialStep === 4, `Expected Step 4, got ${st.snapshot.tutorialStep}`);

    // Step 4: Stomp tutorial slime -> afterglow until landed + 0.4s -> confirm card -> Enter
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 2.2, 31.0, Math.PI));
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 6000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialPendingConfirm === true && st.snapshot.tutorialAwaitingConfirm === false,
      'Step 4 should enter afterglow delay before opening confirm card!'
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialAwaitingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 8000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 4 &&
        st.snapshot.tutorialAwaitingConfirm === true &&
        st.snapshot.playerAirborne === false,
      `Expected Step 4 awaiting confirm after landing, got step=${st.snapshot.tutorialStep} airborne=${st.snapshot.playerAirborne}`
    );
    await page.waitForTimeout(360);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.tutorialStep === 5, `Expected Step 5, got ${st.snapshot.tutorialStep}`);

    // Step 5: Airborne urgency highlight check + Hip Drop crates -> 2.0s afterglow -> confirm card ("いよいよワールドの案内ツアーへ！") -> Enter enters Step 6
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 3.6, 25.5, Math.PI));
    await page.waitForTimeout(140);
    const isUrgent = await page.locator('.tutorial-card.urgent').count();
    assert(isUrgent === 1, 'Expected .tutorial-card.urgent while airborne on Step 5');
    await page.keyboard.press('ControlLeft');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 6000 }
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialAwaitingConfirm === true,
      undefined,
      { polling: 'raf', timeout: 8000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 5 && st.snapshot.tutorialAwaitingConfirm === true,
      `Expected Step 5 awaiting confirm after hip drop afterglow, got step=${st.snapshot.tutorialStep}`
    );
    const confirmPreview5 = await page.locator('[data-role="tut-confirm-preview"]').innerText();
    assert(confirmPreview5.includes('FEVER x8'), `Unexpected Step 5 preview: ${confirmPreview5}`);
    await page.waitForTimeout(360);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);

    // Step 6: FEVER x8 action step (right-top gauge 100% READY + highlighted)
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 6 && st.snapshot.fever >= 100 && st.snapshot.tutorialFeverHighlight === true,
      `Expected Step 6 with FEVER ready & highlighted, got step=${st.snapshot.tutorialStep} fever=${st.snapshot.fever} hl=${st.snapshot.tutorialFeverHighlight}`
    );
    assert(
      (await page.locator('[data-role="fever-box"].tutorial-highlight').count()) === 1,
      'Expected .fever-box.tutorial-highlight on Step 6'
    );
    await page.screenshot({ path: path.join(QA_DIR, '04e_step6_fever_highlight.png') });
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(
      () => {
        const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
        return Boolean(s?.tutorialPendingConfirm === true && s?.feverActive === true);
      },
      undefined,
      { polling: 'raf', timeout: 6000 }
    );

    // Wait past old 2.0s afterglow delay: confirm modal must NOT interrupt while FEVER is active!
    await page.waitForTimeout(2600);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.feverActive === true &&
        st.snapshot.tutorialStep === 6 &&
        st.snapshot.tutorialPendingConfirm === true &&
        st.snapshot.tutorialAwaitingConfirm === false &&
        st.snapshot.tutorialFeverHighlight === false,
      `Step 6 confirm modal must NOT interrupt during active FEVER! got ${JSON.stringify({
        feverActive: st.snapshot.feverActive,
        step: st.snapshot.tutorialStep,
        pending: st.snapshot.tutorialPendingConfirm,
        awaiting: st.snapshot.tutorialAwaitingConfirm,
        hl: st.snapshot.tutorialFeverHighlight,
      })}`
    );
    const step6PendingBadge = await page.locator('[data-role="tut-clear-badge"]').innerText();
    const step6PendingGuide = await page.locator('[data-role="tut-guide"]').innerText();
    assert(
      step6PendingBadge.includes('FEVER 発動中') && step6PendingGuide.includes('フィーバー終了まで'),
      `Expected active-FEVER tutorial card copy, got badge="${step6PendingBadge}" guide="${step6PendingGuide}"`
    );

    // Let FEVER end naturally via fever.update(dt, onEnded) and verify confirm modal opens afterward
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.setFeverRemainingForTest(0.35));
    await page.waitForFunction(
      () => {
        const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
        return Boolean(s?.tutorialAwaitingConfirm === true && s?.feverActive === false);
      },
      undefined,
      { polling: 'raf', timeout: 8000 }
    );
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 6 &&
        st.snapshot.tutorialConfirmStep === 6 &&
        st.snapshot.feverActive === false &&
        st.snapshot.tutorialFeverHighlight === false,
      `Expected Step 6 FEVER confirm card after FEVER ends, got step=${st.snapshot.tutorialStep} cStep=${st.snapshot.tutorialConfirmStep} feverActive=${st.snapshot.feverActive} hl=${st.snapshot.tutorialFeverHighlight}`
    );
    const confirmBadge6 = await page.locator('[data-role="tut-confirm-badge"]').innerText();
    const confirmMsg6 = await page.locator('[data-role="tut-confirm-msg"]').innerText();
    assert(
      confirmBadge6.includes('FEVER マスター') && confirmMsg6.includes('アクションを全部マスター'),
      `Unexpected Step 6 confirm modal text: badge="${confirmBadge6}" msg="${confirmMsg6}"`
    );
    await page.waitForTimeout(360);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Step 7: Manual 3-page Adventure Tour (purely world objectives)
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 7 && st.snapshot.tutorialTourPage === 0,
      `Expected Step 7 tourPage 0, got step=${st.snapshot.tutorialStep} page=${st.snapshot.tutorialTourPage}`
    );
    // Verify it does NOT auto-advance after 1500ms or on Space
    await page.waitForTimeout(1500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 7 && st.snapshot.tutorialTourPage === 0,
      'Step 7 tour must NOT auto-advance over time or skip on Space!'
    );
    const tourText0 = await page.locator('[data-role="tour-sub"]').innerText();
    assert(tourText0.includes('パワースター') && tourText0.includes('つぎへ'), `Unexpected Tour 1/3 text: ${tourText0}`);
    const cam0 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose());

    // Advance Page 0 -> Page 1, and verify double-click within guard does NOT skip to Page 2
    await page.click('[data-role="tour-next-btn"]', { force: true });
    await page.click('[data-role="tour-next-btn"]', { force: true });
    await page.waitForTimeout(700);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 7 && st.snapshot.tutorialTourPage === 1,
      `Expected tourPage 1 (guard prevents double jump), got page=${st.snapshot.tutorialTourPage}`
    );
    const tourText1 = await page.locator('[data-role="tour-sub"]').innerText();
    assert(tourText1.includes('3スターゲート') && tourText1.includes('つぎへ'), `Unexpected Tour 2/3 text: ${tourText1}`);
    const cam1 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose());
    const dist01 = Math.hypot(cam1.pos[0] - cam0.pos[0], cam1.pos[1] - cam0.pos[1], cam1.pos[2] - cam0.pos[2]);
    assert(dist01 > 5, `Camera did not pan from tour page 0 to 1 (dist=${dist01})`);

    // Advance Page 1 -> Page 2 (boss castle & chest ONLY, no FEVER)
    await page.click('[data-role="tour-next-btn"]', { force: true });
    await page.waitForTimeout(700);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      st.snapshot.tutorialStep === 7 && st.snapshot.tutorialTourPage === 2,
      `Expected tourPage 2, got page=${st.snapshot.tutorialTourPage}`
    );
    const tourText2 = await page.locator('[data-role="tour-sub"]').innerText();
    assert(
      tourText2.includes('ボス城') &&
        tourText2.includes('宝箱') &&
        !tourText2.includes('FEVER') &&
        tourText2.includes('冒険スタート'),
      `Unexpected Tour 3/3 text: ${tourText2}`
    );
    const cam2 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose());
    const dist12 = Math.hypot(cam2.pos[0] - cam1.pos[0], cam2.pos[1] - cam1.pos[1], cam2.pos[2] - cam1.pos[2]);
    assert(dist12 > 5, `Camera did not pan from tour page 1 to 2 (dist=${dist12})`);

    // Advance Page 2 -> done ("冒険スタート！ ▶")
    await page.click('[data-role="tour-next-btn"]', { force: true });
    await page.waitForTimeout(300);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.tutorialStep === 'done', `Expected tutorialStep done after tour finish, got ${st.snapshot.tutorialStep}`);
    const objText = await page.locator('[data-role="objective-pill"]').innerText();
    assert(objText.includes('メインスターを集めよう'), `Unexpected objective pill text: ${objText}`);
    const deskVp = { name: 'desktop', width: 1280, height: 720 };
    const deskTopLeft = await pickRect(page, '.hud-top-left');
    const deskTopRight = await pickRect(page, '.hud-top-right');
    const deskObjRect = await pickRect(page, '[data-role="objective-pill"]');
    const deskWipeRect = await pickRect(page, '.face-wipe-anchor');
    const deskNavRect = await pickRect(page, '[data-role="nav-compass"]');
    assertInViewport(deskNavRect, 'Desktop Nav Compass', deskVp);
    assert(!rectsOverlap(deskNavRect, deskTopLeft), 'Desktop Nav Compass overlaps topLeft');
    assert(!rectsOverlap(deskNavRect, deskTopRight), 'Desktop Nav Compass overlaps topRight');
    assert(!rectsOverlap(deskNavRect, deskObjRect), 'Desktop Nav Compass overlaps objective pill');
    assert(!rectsOverlap(deskNavRect, deskWipeRect), 'Desktop Nav Compass overlaps face wipe');
    await page.screenshot({ path: path.join(QA_DIR, '05_objective_pill.png') });

    // FEVER activation UX check (Desktop): NO camera lock, cut-in banner + rainbow border + first-time hint
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.clearFeverForTest());
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.triggerFever());
    await page.waitForTimeout(350);
    const desktopFeverCinematic = await page.evaluate(() =>
      window.__MANMARUBUU_DEBUG__.isCameraCinematicActive()
    );
    assert(
      desktopFeverCinematic === false,
      'FEVER must NOT lock controls or trigger forced front camera cinematic!'
    );
    assert(
      (await page.locator('[data-role="fever-frame"].active').count()) === 1,
      'Expected .fever-screen-frame.active during FEVER'
    );
    assert(
      (await page.locator('[data-role="fever-cutin"]:not(.hidden)').count()) === 1,
      'Expected visible FEVER cut-in banner during FEVER start'
    );
    const deskCtxHint = await page.locator('[data-role="ctx-banner"]').innerText();
    assert(deskCtxHint.includes('フィーバー発動'), `Expected first-time FEVER hint, got: ${deskCtxHint}`);
    await page.screenshot({ path: path.join(QA_DIR, '09_fever_desktop.png') });

    await page.waitForTimeout(2100);
    assert(
      (await page.locator('[data-role="fever-cutin"].hidden').count()) === 1,
      'Expected FEVER cut-in banner to fade out after ~2.2s'
    );
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.clearFeverForTest());
    await page.waitForTimeout(100);

    // Pause -> Controls & Rules Guide -> Tabs (verify no Roll mentions & new Punicon guide) -> Resume
    await page.click('[data-role="pause-btn"]', { force: true });
    await page.waitForTimeout(250);
    await page.click('[data-role="pause-controls-btn"]', { force: true });
    await page.waitForTimeout(250);
    for (const dev of ['kbm', 'gamepad', 'touch']) {
      await page.click(`[data-device-tab="${dev}"]`, { force: true });
      await page.waitForTimeout(120);
      const tabTxt = await page.locator('[data-role="controls-body"]').innerText();
      assert(
        !tabTxt.includes('転がり') && !tabTxt.includes('ころがる'),
        `Controls guide tab "${dev}" must not mention rolling! Got: ${tabTxt}`
      );
      if (dev === 'touch') {
        assert(
          tabTxt.includes('ぷにコン') && tabTxt.includes('3回目タップ') && tabTxt.includes('ヒップドロップ'),
          `Touch controls guide missing Punicon / 3-tap guidance: ${tabTxt}`
        );
      }
    }
    await page.screenshot({ path: path.join(QA_DIR, '06_controls_guide.png') });
    await page.click('[data-role="controls-close-btn"]', { force: true });
    await page.waitForTimeout(150);
    await page.click('[data-role="resume-btn"]', { force: true });
    await page.waitForTimeout(250);

    // 5. HP, Fall Behavior (NO full heal bug!), Game Over & Penalty, Boss Fight Reset
    // Give player coins/score via debug or coins pickup (walk through tutorial coins or collect star 1)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 44.0, Math.PI));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');

    // Fall once from HP 3 -> must become HP 2 (not 3!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.fallOutForTest());
    await page.waitForTimeout(350);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.hp === 2, `Expected HP 2 after fall from HP 3, got ${st.snapshot.hp}`);
    assert(st.snapshot.phase === 'playing', `Expected phase playing after non-fatal fall, got ${st.snapshot.phase}`);

    // Test recovery heart at Castle entrance (4.2, 2.0, 11.8) -> HP 2 -> 3
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(4.2, 2.0, 11.8, Math.PI));
    await page.waitForTimeout(350);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.hp === 3, `Expected HP 3 after collecting heart, got ${st.snapshot.hp}`);

    // Verify full-HP does NOT consume another heart (East heart at 23.2, 1.3, 12.8)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(23.2, 1.3, 12.8, Math.PI));
    await page.waitForTimeout(300);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.hearts.filter((h) => !h.collected).length >= 4, 'Heart should not be consumed at full HP');

    // Reduce HP to 1 via enemy/damage test, then fall -> must trigger Game Over!
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.teleport(0, 0.4, 30.0, Math.PI);
      window.__MANMARUBUU_DEBUG__.damagePlayerForTest(2);
    });
    await page.waitForTimeout(200);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.hp === 1, `Expected HP 1 after 2 damage, got ${st.snapshot.hp}`);
    const coinsBeforeGo = st.snapshot.coins;

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.fallOutForTest());
    await page.waitForTimeout(350);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.hp === 0, `Expected HP 0 after fatal fall, got ${st.snapshot.hp}`);
    assert(st.snapshot.phase === 'gameover', `Expected gameover phase after fatal fall, got ${st.snapshot.phase}`);
    assert(st.snapshot.coins === coinsBeforeGo - Math.floor(coinsBeforeGo / 2), 'Expected half coins penalty');
    await page.screenshot({ path: path.join(QA_DIR, '07_gameover.png') });

    // Retry from checkpoint
    await page.click('[data-role="gameover-retry-btn"]', { force: true });
    await page.waitForTimeout(400);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.phase === 'playing' && st.snapshot.hp === 3, 'Expected playing & HP 3 after retry');

    // Bowling Plaza: verify dashing (without roll) knocks down pins & unlocks Star 3!
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-21.0, 0.8, -23.0, Math.PI));
    await page.waitForTimeout(200);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1100);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(450);
    const bowlStats = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBowlingStats());
    console.log('Bowling dash stats (no roll):', JSON.stringify(bowlStats));
    assert(
      bowlStats.knockedPins >= 5 && bowlStats.star3Unlocked === true,
      `Expected dashing without roll to knock >= 5 bowling pins and unlock Star 3, got ${JSON.stringify(bowlStats)}`
    );

    // Boss Fight Reset test: enter arena, damage boss once (HP 2, Phase 2), then die -> retry -> Boss resets!
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(2);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.triggerBossStunForTest();
      window.__MANMARUBUU_DEBUG__.hitBossWeakForTest();
    });
    await page.waitForTimeout(300);
    let bossInfo = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBossDetails());
    assert(bossInfo.hp === 2 && bossInfo.phase === 2, `Expected boss hp 2 phase 2, got ${JSON.stringify(bossInfo)}`);

    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.damagePlayerForTest(3);
    });
    await page.waitForTimeout(350);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(st.snapshot.phase === 'gameover' && st.snapshot.wasInBossFight === true, 'Expected gameover with wasInBossFight');
    await page.click('[data-role="gameover-retry-btn"]', { force: true });
    await page.waitForTimeout(350);
    bossInfo = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBossDetails());
    assert(
      bossInfo.engaged === false && bossInfo.hp === 3 && bossInfo.phase === 1 && bossInfo.state === 'dormant',
      `Boss failed to reset after checkpoint retry: ${JSON.stringify(bossInfo)}`
    );

    // 6. Secret Stars (4, 5 via crate smash, 6) & Boss Clear -> Result without Time + Stamps
    // Smash secret crate at (0, 1.85, -4.5) with hip-drop!
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.6, -4.5, Math.PI));
    await page.waitForTimeout(120);
    await page.keyboard.press('ControlLeft');
    await page.waitForTimeout(850);
    st = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    const star5 = st.stars.find((s) => s.id === 5);
    assert(star5 && star5.unlocked, 'Expected Secret Star 5 to unlock after smashing secret crate');

    // Collect Star 4, 5, 6
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(4));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(5));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(6));
    await page.waitForTimeout(250);

    // Re-enter boss, defeat all 3 phases without taking boss damage, open victory chest!
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI);
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.triggerBossStunForTest());
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(2700);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.openChestForTest());

    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.phase === 'victory',
      { timeout: 10000 }
    );
    await page.waitForTimeout(900);

    const resultText = await page.locator('.victory-card').innerText();
    assert(!resultText.includes('クリアタイム'), `Result card must NOT include clear time: ${resultText}`);
    const stampCount = await page.locator('.stamp-card.earned').count();
    assert(stampCount >= 4, `Expected >= 4 earned stamps (clear_w1, all_main_stars, all_secret_stars, no_damage_boss), got ${stampCount}`);
    await page.screenshot({ path: path.join(QA_DIR, '08_victory_stamps_no_time.png') });

    const saveAfterClear = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
    assert(
      saveAfterClear.version === 2 &&
        saveAfterClear.worlds.world1.cleared === true &&
        saveAfterClear.worlds.world1.collectedStarIds.length === 6,
      `SaveData v2 did not record clear + all 6 stars: ${JSON.stringify(saveAfterClear)}`
    );

    await context.close();

    // Verify Skip during afterglow delay cancels pending confirm cleanly
    {
      const skipCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const skipPage = await skipCtx.newPage();
      attachListeners(skipPage);
      await skipPage.goto(URL, { waitUntil: 'domcontentloaded' });
      await waitReady(skipPage);
      await skipPage.click('[data-role="play-btn"]', { force: true });
      await skipPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
        undefined,
        { timeout: 6000 }
      );
      await skipPage.click('[data-role="welcome-skip-btn"]', { force: true });
      await skipPage.waitForFunction(
        () => {
          const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
          return Boolean(s?.tutorialAwaitingConfirm && s?.tutorialConfirmStep === 0 && s?.tutorialConfirmReady);
        },
        undefined,
        { timeout: 6000 }
      );
      await skipPage.click('[data-role="tut-confirm-next-btn"]', { force: true });
      await skipPage.waitForTimeout(200);

      await skipPage.keyboard.down('KeyW');
      await skipPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.tutorialPendingConfirm === true,
        undefined,
        { polling: 'raf', timeout: 6000 }
      );
      await skipPage.keyboard.up('KeyW');

      await skipPage.click('[data-role="tut-skip-btn"]', { force: true });
      await skipPage.waitForTimeout(120);
      let skipSt = await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        skipSt.snapshot.tutorialStep === 'done' &&
          skipSt.snapshot.tutorialPendingConfirm === false &&
          skipSt.snapshot.tutorialAwaitingConfirm === false,
        `Skip during afterglow failed: ${JSON.stringify({ step: skipSt.snapshot.tutorialStep, pending: skipSt.snapshot.tutorialPendingConfirm, awaiting: skipSt.snapshot.tutorialAwaitingConfirm })}`
      );
      await skipPage.waitForTimeout(1900);
      skipSt = await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        skipSt.snapshot.tutorialStep === 'done' && skipSt.snapshot.tutorialAwaitingConfirm === false,
        'Skipped afterglow must NOT open confirm card later!'
      );

      // Also verify Skip during Step 6 active FEVER ends tutorial cleanly and does NOT open confirm modal after FEVER expires
      await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.enterTutorialFeverStepForTest());
      await skipPage.waitForTimeout(150);
      await skipPage.keyboard.press('KeyQ');
      await skipPage.waitForFunction(
        () => {
          const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
          return Boolean(s?.tutorialPendingConfirm === true && s?.feverActive === true);
        },
        undefined,
        { polling: 'raf', timeout: 6000 }
      );
      await skipPage.click('[data-role="tut-skip-btn"]', { force: true });
      await skipPage.waitForTimeout(120);
      skipSt = await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        skipSt.snapshot.tutorialStep === 'done' &&
          skipSt.snapshot.tutorialPendingConfirm === false &&
          skipSt.snapshot.tutorialAwaitingConfirm === false &&
          skipSt.snapshot.feverActive === true,
        `Skip during Step 6 active FEVER failed: ${JSON.stringify({
          step: skipSt.snapshot.tutorialStep,
          pending: skipSt.snapshot.tutorialPendingConfirm,
          awaiting: skipSt.snapshot.tutorialAwaitingConfirm,
          feverActive: skipSt.snapshot.feverActive,
        })}`
      );
      await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.setFeverRemainingForTest(0.2));
      await skipPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.feverActive === false,
        undefined,
        { polling: 'raf', timeout: 5000 }
      );
      await skipPage.waitForTimeout(800);
      skipSt = await skipPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        skipSt.snapshot.feverActive === false &&
          skipSt.snapshot.tutorialStep === 'done' &&
          skipSt.snapshot.tutorialAwaitingConfirm === false,
        `Skipped Step 6 FEVER must NOT open confirm card after FEVER expires! ${JSON.stringify({
          feverActive: skipSt.snapshot.feverActive,
          step: skipSt.snapshot.tutorialStep,
          awaiting: skipSt.snapshot.tutorialAwaitingConfirm,
        })}`
      );
      await skipCtx.close();
    }

    // =========================================================================
    // PART 2: Mobile UI Complete Audit (Landscape 844x390 & Portrait 390x844)
    // =========================================================================
    const assertCardFits = async (page, cardSel, titleSel, vp, label) => {
      const info = await page.evaluate(
        ({ cSel, tSel }) => {
          const c = document.querySelector(cSel);
          const t = tSel ? document.querySelector(tSel) : null;
          const pick = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };
          return {
            card: pick(c),
            title: pick(t),
            scrollW: c ? c.scrollWidth : 0,
            clientW: c ? c.clientWidth : 0,
          };
        },
        { cSel: cardSel, tSel: titleSel }
      );
      assertInViewport(info.card, `${label} card`, vp);
      assert(
        info.scrollW <= info.clientW + 2,
        `${label}: horizontal overflow (${info.scrollW} > ${info.clientW}) on ${vp.name}`
      );
      if (info.title) {
        assertInViewport(info.title, `${label} title`, vp);
      }
    };

    // Mobile Portrait (390x844): boot tap -> title BGM -> portrait lock overlay
    {
      const vp = { name: 'portrait', width: 390, height: 844 };
      const pCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: true,
        isMobile: true,
      });
      const pPage = await pCtx.newPage();
      attachListeners(pPage);
      await pPage.goto(URL, { waitUntil: 'domcontentloaded' });
      await pPage.evaluate(() => {
        localStorage.clear();
      });
      await pPage.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(pPage);
      await passMobileBootTap(pPage, 'mobile portrait');

      const portraitLocked = await pPage.evaluate(() => ({
        portraitBlocked: window.__MANMARUBUU_DEBUG__.getState().snapshot.portraitBlocked,
        hidden: document.querySelector('[data-role="portrait-lock-overlay"]')?.classList.contains('hidden'),
      }));
      assert(
        portraitLocked.portraitBlocked === true && portraitLocked.hidden === false,
        `Expected portrait lock overlay on mobile 390x844: ${JSON.stringify(portraitLocked)}`
      );
      await assertCardFits(pPage, '.portrait-lock-card', '.portrait-lock-title', vp, 'PortraitLock');
      await pPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, '00_portrait_lock.png') });
      await pCtx.close();
    }

    for (const vp of [{ name: 'landscape', width: 844, height: 390 }]) {
      const mCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: true,
        isMobile: true,
      });
      const mPage = await mCtx.newPage();
      attachListeners(mPage);
      await mPage.goto(URL, { waitUntil: 'domcontentloaded' });
      await mPage.evaluate(() => {
        localStorage.clear();
      });
      await mPage.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(mPage);
      await passMobileBootTap(mPage, `mobile ${vp.name} init`);

      // 0. Verify mobile default cameraAutoFollow === false, and manual ON persistence
      const mobileInitSettings = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getSettings());
      assert(
        mobileInitSettings.cameraAutoFollow === false,
        `Expected mobile default cameraAutoFollow === false on ${vp.name}, got ${mobileInitSettings.cameraAutoFollow}`
      );
      await mPage.click('[data-role="title-settings-btn"]', { force: true });
      await mPage.waitForTimeout(200);
      await mPage.click('[data-setting="auto-follow"][data-value="on"]', { force: true });
      await mPage.waitForTimeout(150);
      await mPage.reload({ waitUntil: 'domcontentloaded' });
      await waitReady(mPage);
      await passMobileBootTap(mPage, `mobile ${vp.name} reload`);
      const mobileOnSettings = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getSettings());
      assert(
        mobileOnSettings.cameraAutoFollow === true,
        `Expected manual cameraAutoFollow=true to persist on mobile ${vp.name}`
      );
      await mPage.waitForTimeout(150);

      // 1. Title screen audit (wait for ribbonIn intro animation to settle)
      await mPage.waitForTimeout(700);
      const titlePlayRect = await pickRect(mPage, '[data-role="play-btn"]');
      assertInViewport(titlePlayRect, 'Title Play button', vp);
      assert(titlePlayRect.height >= 44, `Title Play button too small on ${vp.name}: ${titlePlayRect.height}`);
      const logoRect = await pickRect(mPage, '.title-logo-wrap');
      assertInViewport(logoRect, 'Title Logo wrap', vp);
      const logoSubRect = await pickRect(mPage, '.logo-sub');
      assertInViewport(logoSubRect, 'Title Logo ribbon', vp);
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `01_title_${vp.name}.png`) });

      // 2. World Select screen audit
      await mPage.click('[data-role="world-select-btn"]', { force: true });
      await mPage.waitForTimeout(450);
      await assertCardFits(mPage, '.world-select-card', '.world-select-card .result-title', vp, 'WorldSelect');
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `02_world_select_${vp.name}.png`) });

      // Enter game from World Select -> Welcome Movie -> Step 1 Intro Card -> Step 1
      await mPage.click('[data-role="select-world-1-btn"]', { force: true });
      await mPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
        undefined,
        { timeout: 6000 }
      );
      const welcomeSubText = await mPage.locator('.welcome-sub').innerText();
      assert(
        welcomeSubText.includes('まんまるぶうといっしょに'),
        `Expected updated welcome subcopy on ${vp.name}, got "${welcomeSubText}"`
      );
      const welcomeCardRect = await pickRect(mPage, '.welcome-title-card');
      const welcomeSkipRect = await pickRect(mPage, '[data-role="welcome-skip-btn"]');
      assertInViewport(welcomeCardRect, 'Mobile Welcome Title Card', vp);
      assertInViewport(welcomeSkipRect, 'Mobile Welcome Skip Button', vp);
      assert(welcomeSkipRect.height >= 44, `Welcome Skip Button height < 44 on ${vp.name}`);
      assert(
        welcomeSkipRect.top >= welcomeCardRect.bottom + 8,
        `Welcome Skip Button overlaps or lacks gap on ${vp.name}: cardBottom=${welcomeCardRect.bottom}, skipTop=${welcomeSkipRect.top}`
      );
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `02b_welcome_movie_${vp.name}.png`) });
      await mPage.touchscreen.tap(
        (welcomeSkipRect.left + welcomeSkipRect.right) / 2,
        (welcomeSkipRect.top + welcomeSkipRect.bottom) / 2
      );

      await mPage.waitForFunction(
        () => {
          const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
          return Boolean(s?.tutorialAwaitingConfirm && s?.tutorialConfirmStep === 0 && s?.tutorialConfirmReady);
        },
        undefined,
        { timeout: 6000 }
      );
      const introCardRect = await pickRect(mPage, '[data-role="tut-confirm-card"]');
      const introNextRect = await pickRect(mPage, '[data-role="tut-confirm-next-btn"]');
      assertInViewport(introCardRect, 'Mobile Step 1 Intro Card', vp);
      assertInViewport(introNextRect, 'Mobile Step 1 Intro Next Button', vp);
      assert(
        (await mPage.locator('[data-role="tut-confirm-card"].is-intro').count()) === 1,
        `Expected .tut-confirm-card.is-intro on ${vp.name}`
      );
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `02c_step1_intro_${vp.name}.png`) });
      await mPage.touchscreen.tap(
        (introNextRect.left + introNextRect.right) / 2,
        (introNextRect.top + introNextRect.bottom) / 2
      );
      await mPage.waitForTimeout(300);

      const mState = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(mState.snapshot.touchActive === true, `Expected touchActive true on mobile ${vp.name}`);
      assert(
        mState.snapshot.tutorialStep === 1 && !mState.snapshot.tutorialAwaitingConfirm,
        `Expected active Step 1 after intro card on ${vp.name}`
      );
      const mEnv = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
      console.log(`MOBILE_RENDER_${vp.name.toUpperCase()} drawCalls=${mEnv.drawCalls} triangles=${mEnv.triangles} grass=${mEnv.grassClusters}`);
      assert(
        mEnv.resolvedQuality === 'medium' || mEnv.resolvedQuality === 'low',
        `Expected auto resolvedQuality 'medium' or 'low' on mobile ${vp.name}, got ${mEnv.resolvedQuality}`
      );
      assert(mEnv.shadowsEnabled === false, `Expected shadowsEnabled false on mobile ${vp.name}`);
      assert(mEnv.composerInitialized === false, `Expected composerInitialized false on mobile ${vp.name}`);
      assert(mEnv.faceWipe3dActive === false, `Expected faceWipe3dActive false on mobile ${vp.name}`);
      assert(mEnv.faceWipeCloneCreated === false, `Expected faceWipeCloneCreated false on mobile ${vp.name}`);
      assert(
        (await mPage.locator('.face-wipe-hole.mode-2d .face-wipe-2d-svg').count()) === 0,
        `Legacy 2D SVG face wipe must be absent on mobile ${vp.name}`
      );
      assert(
        (await mPage.locator('.face-wipe-hole.mode-2d .face-wipe-sprite-img').count()) === 1,
        `Expected 3D-rendered sprite img face wipe on mobile ${vp.name}`
      );
      const mWipeImgOk = await mPage
        .locator('.face-wipe-hole.mode-2d .face-wipe-sprite-img')
        .evaluate((el) => el.complete && el.naturalWidth === 256 && el.naturalHeight === 256);
      assert(mWipeImgOk, `Expected mobile sprite img loaded at 256x256 on ${vp.name}`);

      // 3. Normal Play (Tutorial active + Punicon surface, zero legacy buttons)
      const legacyCount = await mPage
        .locator('.touch-joystick-zone, .touch-actions, [data-role="touch-jump"], [data-role="touch-hipdrop"], [data-role="touch-roll"], [data-role="touch-fever"]')
        .count();
      assert(legacyCount === 0, `Legacy fixed joystick / action buttons must be removed on ${vp.name}, found ${legacyCount}`);
      assert((await mPage.locator('[data-role="touch-surface"]').count()) === 1, `Missing touch-surface on ${vp.name}`);

      const boxes = {
        wipe: await pickRect(mPage, '.face-wipe-anchor'),
        topLeft: await pickRect(mPage, '.hud-top-left'),
        topRight: await pickRect(mPage, '.hud-top-right'),
        tut: await pickRect(mPage, '.tutorial-card'),
      };

      assert(!rectsOverlap(boxes.wipe, boxes.topLeft), `Face wipe overlaps topLeft HUD on ${vp.name}`);
      assert(!rectsOverlap(boxes.topLeft, boxes.topRight), `topLeft HUD overlaps topRight HUD on ${vp.name}`);
      assert(boxes.tut, `Missing tutorial card on ${vp.name}`);
      assert(!rectsOverlap(boxes.tut, boxes.topLeft), `Tutorial overlaps topLeft HUD on ${vp.name}`);
      assert(!rectsOverlap(boxes.tut, boxes.topRight), `Tutorial overlaps topRight HUD on ${vp.name}`);
      assert(!rectsOverlap(boxes.tut, boxes.wipe), `Tutorial overlaps face wipe on ${vp.name}`);
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `03_play_tutorial_${vp.name}.png`) });

      // 3b. Punicon drag test on left-hand zone of screen -> verifies punicon UI & player movement
      const puniStart = { x: Math.round(vp.width * 0.24), y: Math.round(vp.height * 0.72) };
      const puniEnd = { x: puniStart.x + 12, y: puniStart.y - 48 };
      const posBeforeDrag = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState())).playerPos;
      await mPage.evaluate(
        ({ sx, sy, ex, ey }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          const mk = (type, x, y) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 101,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
            });
          el.dispatchEvent(mk('pointerdown', sx, sy));
          el.dispatchEvent(mk('pointermove', (sx + ex) / 2, (sy + ey) / 2));
          el.dispatchEvent(mk('pointermove', ex, ey));
        },
        { sx: puniStart.x, sy: puniStart.y, ex: puniEnd.x, ey: puniEnd.y }
      );
      await mPage.waitForTimeout(420);
      assert(
        (await mPage.locator('[data-role="punicon"].active').count()) === 1,
        `Expected active punicon ring while dragging bottom 65% on ${vp.name}`
      );
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `03b_punicon_drag_${vp.name}.png`) });
      await mPage.evaluate(
        ({ ex, ey }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          el.dispatchEvent(
            new PointerEvent('pointerup', {
              bubbles: true,
              cancelable: true,
              pointerId: 101,
              pointerType: 'touch',
              clientX: ex,
              clientY: ey,
            })
          );
        },
        { ex: puniEnd.x, ey: puniEnd.y }
      );
      await mPage.waitForTimeout(120);
      assert(
        (await mPage.locator('[data-role="punicon"].active').count()) === 0,
        `Expected punicon to hide after pointerup on ${vp.name}`
      );
      const posAfterDrag = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState())).playerPos;
      const dragDist = Math.hypot(posAfterDrag[0] - posBeforeDrag[0], posAfterDrag[2] - posBeforeDrag[2]);
      assert(dragDist > 0.6, `Punicon drag did not move player enough on ${vp.name}: dist=${dragDist}`);

      // 3c. Simultaneous two-handed touch test: hold left-hand Punicon drag while tapping with right hand -> MUST jump (NOT hijack 2-finger cam!)
      await mPage.evaluate(
        ({ w, h }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          const mk = (id, type, x, y) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: id,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
            });
          const lx = Math.round(w * 0.24);
          const ly = Math.round(h * 0.76);
          // Left thumb drags Punicon and stays down
          el.dispatchEvent(mk(201, 'pointerdown', lx, ly));
          el.dispatchEvent(mk(201, 'pointermove', lx + 6, ly - 38));
        },
        { w: vp.width, h: vp.height }
      );
      await mPage.waitForTimeout(160);
      await mPage.evaluate(
        ({ w, h }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          const mk = (id, type, x, y) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: id,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
            });
          const rx = Math.round(w * 0.78);
          const ry = Math.round(h * 0.68);
          // Right hand taps screen while left thumb stays active
          el.dispatchEvent(mk(202, 'pointerdown', rx, ry));
          el.dispatchEvent(mk(202, 'pointerup', rx, ry));
        },
        { w: vp.width, h: vp.height }
      );
      await mPage.waitForTimeout(160);
      const twoHandState = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        twoHandState.snapshot.playerAirborne || twoHandState.snapshot.playerJumpCount >= 1,
        `Two-handed simultaneous left-drag + right-tap failed to trigger jump on ${vp.name}!`
      );
      await mPage.evaluate(
        ({ w, h }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          el.dispatchEvent(
            new PointerEvent('pointerup', {
              bubbles: true,
              cancelable: true,
              pointerId: 201,
              pointerType: 'touch',
              clientX: Math.round(w * 0.24),
              clientY: Math.round(h * 0.76),
            })
          );
        },
        { w: vp.width, h: vp.height }
      );
      await mPage.waitForTimeout(380);

      // 4. Trigger Step 1 -> Afterglow -> Bottom-Anchored Completion Confirm Card audit
      await mPage.keyboard.down('KeyW');
      await mPage.waitForFunction(
        () => {
          const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
          return Boolean(s?.tutorialPendingConfirm || s?.tutorialAwaitingConfirm);
        },
        undefined,
        { polling: 'raf', timeout: 6000 }
      );
      await mPage.keyboard.up('KeyW');
      await mPage.waitForFunction(
        () => {
          const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
          return Boolean(s?.tutorialAwaitingConfirm && s?.tutorialConfirmReady);
        },
        undefined,
        { polling: 'raf', timeout: 9000 }
      );

      const confirmState = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(confirmState.snapshot.tutorialAwaitingConfirm === true, `Expected confirm card on ${vp.name}`);
      const touchDisabledInConfirm = await mPage.locator('.touch-controls.disabled').count();
      assert(touchDisabledInConfirm === 1, `Touch controls must be disabled during confirm card on ${vp.name}`);

      const confirmRect = await pickRect(mPage, '[data-role="tut-confirm-card"]');
      const confirmNextRect = await pickRect(mPage, '[data-role="tut-confirm-next-btn"]');
      const wipeInConfirm = await pickRect(mPage, '.face-wipe-anchor');
      assertInViewport(confirmRect, 'Confirm Card', vp);
      assertInViewport(confirmNextRect, 'Confirm Next Button', vp);
      assert(confirmNextRect.height >= 44, `Confirm Next Button height < 44 on ${vp.name}: ${confirmNextRect.height}`);
      assert(
        confirmRect.top >= vp.height * 0.42,
        `Confirm card must sit in bottom half on ${vp.name}, got top=${confirmRect.top} / ${vp.height}`
      );
      assert(!rectsOverlap(confirmRect, boxes.topLeft), `Confirm card overlaps topLeft on ${vp.name}`);
      assert(!rectsOverlap(confirmRect, boxes.topRight), `Confirm card overlaps topRight on ${vp.name}`);
      assert(!rectsOverlap(confirmRect, wipeInConfirm), `Confirm card overlaps face wipe on ${vp.name}`);
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `04_tut_confirm_${vp.name}.png`) });

      // Tap "つぎへ ▶" on confirm card
      await mPage.touchscreen.tap(
        (confirmNextRect.left + confirmNextRect.right) / 2,
        (confirmNextRect.top + confirmNextRect.bottom) / 2
      );
      await mPage.waitForTimeout(200);
      const afterConfirmTap = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(afterConfirmTap.snapshot.tutorialStep === 2 && !afterConfirmTap.snapshot.tutorialAwaitingConfirm, `Confirm Next tap failed on ${vp.name}`);

      // 4b. Top 35% camera drag test on Step 2
      const yawBeforeTopDrag = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      await mPage.evaluate(
        ({ sx, sy, ex }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          const mk = (type, x, y) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 102,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
            });
          el.dispatchEvent(mk('pointerdown', sx, sy));
          el.dispatchEvent(mk('pointermove', (sx + ex) / 2, sy));
          el.dispatchEvent(mk('pointermove', ex, sy));
          el.dispatchEvent(mk('pointerup', ex, sy));
        },
        { sx: Math.round(vp.width * 0.35), sy: Math.round(vp.height * 0.22), ex: Math.round(vp.width * 0.65) }
      );
      await mPage.waitForTimeout(160);
      const yawAfterTopDrag = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      assert(
        Math.abs(yawAfterTopDrag - yawBeforeTopDrag) > 0.12,
        `Top 35% drag did not rotate camera on ${vp.name}: delta=${yawAfterTopDrag - yawBeforeTopDrag}`
      );

      // 4c. Step 6 FEVER tutorial highlight & gauge tap verification on mobile
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.enterTutorialFeverStepForTest());
      await mPage.waitForTimeout(200);
      assert(
        (await mPage.locator('[data-role="fever-box"].tutorial-highlight').count()) === 1,
        `Expected highlighted FEVER gauge on mobile Step 6 (${vp.name})`
      );
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `04c_step6_fever_${vp.name}.png`) });
      const mobFeverBtn = await pickRect(mPage, '[data-role="fever-btn"]');
      await mPage.touchscreen.tap(
        (mobFeverBtn.left + mobFeverBtn.right) / 2,
        (mobFeverBtn.top + mobFeverBtn.bottom) / 2
      );
      await mPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.feverActive === true,
        undefined,
        { timeout: 5000 }
      );
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.clearFeverForTest());

      // 5. Enter Step 7 Manual Tour audit (all 3 pages bottom-anchored, zero overlap, clear center Power Star)
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.enterTutorialTourForTest());
      await mPage.waitForTimeout(650);

      const tourDisabled = await mPage.locator('.touch-controls.disabled').count();
      assert(tourDisabled === 1, `Touch controls must be disabled during tour on ${vp.name}`);

      const tourShotNames = [
        `05_tut_tour_${vp.name}.png`,
        `05b_tut_tour2_${vp.name}.png`,
        `05c_tut_tour3_${vp.name}.png`,
      ];
      for (let p = 0; p < 3; p++) {
        // Wait briefly for tour camera pan to settle cleanly in headless software WebGL
        let prevPose = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose());
        for (let waitTry = 0; waitTry < 14; waitTry++) {
          await mPage.waitForTimeout(160);
          const curPose = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose());
          const move = Math.hypot(
            curPose.pos[0] - prevPose.pos[0],
            curPose.pos[1] - prevPose.pos[1],
            curPose.pos[2] - prevPose.pos[2]
          );
          prevPose = curPose;
          if (move < 0.08 && waitTry >= 3) break;
        }
        const tourRect = await pickRect(mPage, '[data-role="tour-sub"]');
        const tourNextRect = await pickRect(mPage, '[data-role="tour-next-btn"]');
        const wipeInTour = await pickRect(mPage, '.face-wipe-anchor');
        assertInViewport(tourRect, `Tour Card page ${p + 1}`, vp);
        assertInViewport(tourNextRect, `Tour Next Button page ${p + 1}`, vp);
        assert(tourNextRect.height >= 44, `Tour Next Button height < 44 on ${vp.name}: ${tourNextRect.height}`);
        assert(
          tourRect.top > vp.height * 0.50 && tourRect.bottom >= vp.height - 40,
          `Tour card page ${p + 1} must be bottom-anchored on ${vp.name}, got ${JSON.stringify(tourRect)} in ${vp.width}x${vp.height}`
        );
        assert(!rectsOverlap(tourRect, boxes.topLeft), `Tour card page ${p + 1} overlaps topLeft on ${vp.name}`);
        assert(!rectsOverlap(tourRect, boxes.topRight), `Tour card page ${p + 1} overlaps topRight on ${vp.name}`);
        assert(!rectsOverlap(tourRect, wipeInTour), `Tour card page ${p + 1} overlaps face wipe on ${vp.name}`);
        await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, tourShotNames[p]) });

        await mPage.waitForTimeout(360);
        const btnR = await pickRect(mPage, '[data-role="tour-next-btn"]');
        await mPage.touchscreen.tap((btnR.left + btnR.right) / 2, (btnR.top + btnR.bottom) / 2);
        await mPage.waitForTimeout(250);
      }
      const afterTourMobile = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(afterTourMobile.snapshot.tutorialStep === 'done', `Mobile tour tap did not finish on ${vp.name}`);

      // 6. Normal Play with Objective Pill + active touch controls + 3-Tap Combo + Smart Auto-Follow + FPS badge audit
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.setSettingsForTest({ showFps: true }));
      await mPage.waitForTimeout(200);
      const touchStillDisabled = await mPage.locator('.touch-controls.disabled').count();
      assert(touchStillDisabled === 0, `Touch controls should re-enable after tour on ${vp.name}`);
      const objRect = await pickRect(mPage, '[data-role="objective-pill"]');
      assertInViewport(objRect, 'Objective Pill', vp);
      assert(!rectsOverlap(objRect, boxes.topLeft), `Objective overlaps topLeft on ${vp.name}`);
      assert(!rectsOverlap(objRect, boxes.topRight), `Objective overlaps topRight on ${vp.name}`);

      const wipePlay = await pickRect(mPage, '.face-wipe-anchor');
      const fpsRect = await pickRect(mPage, '.fps-badge');
      const navRect = await pickRect(mPage, '[data-role="nav-compass"]');
      assertInViewport(fpsRect, 'FPS Badge', vp);
      assert(!rectsOverlap(fpsRect, boxes.topLeft), `FPS Badge overlaps topLeft on ${vp.name}`);
      assert(!rectsOverlap(fpsRect, boxes.topRight), `FPS Badge overlaps topRight on ${vp.name}`);
      assert(!rectsOverlap(fpsRect, wipePlay), `FPS Badge overlaps face wipe on ${vp.name}`);
      assert(!rectsOverlap(fpsRect, objRect), `FPS Badge overlaps Objective Pill on ${vp.name}`);
      assertInViewport(navRect, 'Nav Compass', vp);
      assert(!rectsOverlap(navRect, boxes.topLeft), `Nav Compass overlaps topLeft on ${vp.name}`);
      assert(!rectsOverlap(navRect, boxes.topRight), `Nav Compass overlaps topRight on ${vp.name}`);
      assert(!rectsOverlap(navRect, objRect), `Nav Compass overlaps Objective Pill on ${vp.name}`);
      assert(!rectsOverlap(navRect, fpsRect), `Nav Compass overlaps FPS Badge on ${vp.name}`);
      assert(!rectsOverlap(navRect, wipePlay), `Nav Compass overlaps face wipe on ${vp.name}`);

      // 6a. 3-Consecutive-Tap verification: Jump -> Double Jump -> Hip Drop!
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 44.0, Math.PI));
      await mPage.waitForTimeout(120);
      await mPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.playerAirborne === false,
        undefined,
        { polling: 'raf', timeout: 4000 }
      );
      const tapX = Math.round(vp.width * 0.5);
      const tapY = Math.round(vp.height * 0.65);

      await mPage.touchscreen.tap(tapX, tapY);
      await mPage
        .waitForFunction(
          () => {
            const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
            return Boolean(s?.playerAirborne === true && s?.playerJumpCount === 1);
          },
          undefined,
          { polling: 'raf', timeout: 2500 }
        )
        .catch(() => {});
      let tapSt = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        tapSt.snapshot.playerAirborne === true && tapSt.snapshot.playerJumpCount === 1,
        `Tap 1 should trigger 1st Jump on ${vp.name}, got airborne=${tapSt.snapshot.playerAirborne} jumpCount=${tapSt.snapshot.playerJumpCount}`
      );

      await mPage.touchscreen.tap(tapX, tapY);
      await mPage
        .waitForFunction(
          () => {
            const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
            return Boolean(s?.playerAirborne === true && s?.playerJumpCount === 2);
          },
          undefined,
          { polling: 'raf', timeout: 2500 }
        )
        .catch(() => {});
      tapSt = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        tapSt.snapshot.playerAirborne === true && tapSt.snapshot.playerJumpCount === 2,
        `Tap 2 should trigger 2nd Jump on ${vp.name}, got airborne=${tapSt.snapshot.playerAirborne} jumpCount=${tapSt.snapshot.playerJumpCount}`
      );

      await mPage.touchscreen.tap(tapX, tapY);
      await mPage
        .waitForFunction(
          () => {
            const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
            return Boolean(
              s?.playerHipDropState === 'windup' || s?.playerHipDropState === 'diving'
            );
          },
          undefined,
          { polling: 'raf', timeout: 2500 }
        )
        .catch(() => {});
      tapSt = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
      assert(
        tapSt.snapshot.playerHipDropState === 'windup' || tapSt.snapshot.playerHipDropState === 'diving',
        `Tap 3 should trigger Hip Drop on ${vp.name}, got hipDropState=${tapSt.snapshot.playerHipDropState}`
      );
      await mPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.playerAirborne === false,
        undefined,
        { polling: 'raf', timeout: 4000 }
      );

      // 6b-smart. Smart Camera Auto-Follow verification (curve follow, back-walk non-spin, manual cooldown)
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 44.0, Math.PI));
      await mPage.waitForTimeout(150);
      const yawCurve0 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      await mPage.keyboard.down('KeyD');
      await mPage.waitForTimeout(650);
      await mPage.keyboard.up('KeyD');
      const yawCurve1 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      assert(
        Math.abs(yawCurve1 - yawCurve0) > 0.12,
        `Smart auto-follow should gently swing behind sideways run on ${vp.name}: delta=${yawCurve1 - yawCurve0}`
      );

      // Reset behind and run straight toward camera (180 deg) -> camera must NOT spin around!
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 40.0, Math.PI));
      await mPage.waitForTimeout(120);
      const yawBack0 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      await mPage.keyboard.down('KeyS');
      await mPage.waitForTimeout(650);
      await mPage.keyboard.up('KeyS');
      const yawBack1 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      assert(
        Math.abs(yawBack1 - yawBack0) < 0.05,
        `Smart auto-follow must NOT spin when running back toward camera on ${vp.name}: delta=${yawBack1 - yawBack0}`
      );

      // Manual camera drag triggers 1.5s cooldown where sideways run does not auto-follow
      await mPage.evaluate(
        ({ sx, sy, ex }) => {
          const el = document.querySelector('[data-role="touch-surface"]');
          const mk = (type, x, y) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 103,
              pointerType: 'touch',
              clientX: x,
              clientY: y,
            });
          el.dispatchEvent(mk('pointerdown', sx, sy));
          el.dispatchEvent(mk('pointermove', ex, sy));
          el.dispatchEvent(mk('pointerup', ex, sy));
        },
        { sx: Math.round(vp.width * 0.35), sy: Math.round(vp.height * 0.2), ex: Math.round(vp.width * 0.55) }
      );
      await mPage.waitForTimeout(80);
      const yawCooldown0 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      await mPage.keyboard.down('KeyD');
      await mPage.waitForTimeout(450);
      await mPage.keyboard.up('KeyD');
      const yawCooldown1 = (await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getCameraPose())).yaw;
      assert(
        Math.abs(yawCooldown1 - yawCooldown0) < 0.05,
        `Smart auto-follow should pause during 1.5s manual cooldown on ${vp.name}: delta=${yawCooldown1 - yawCooldown0}`
      );

      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 44.0, Math.PI));
      await mPage.waitForTimeout(150);
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `06_play_objective_${vp.name}.png`) });
      await mPage.screenshot({ path: path.join(QA_DIR, `09_mobile_${vp.name}.png`) });

      // 6b. FEVER activation & UI layout audit on mobile
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.triggerFever());
      await mPage.waitForTimeout(380);
      const mobFeverCine = await mPage.evaluate(() =>
        window.__MANMARUBUU_DEBUG__.isCameraCinematicActive()
      );
      assert(mobFeverCine === false, `FEVER must NOT lock camera on mobile ${vp.name}`);
      assert(
        (await mPage.locator('[data-role="fever-frame"].active').count()) === 1,
        `Missing .fever-screen-frame.active on mobile ${vp.name}`
      );
      const feverCutinRect = await pickRect(mPage, '[data-role="fever-cutin"]');
      const mobCtxRect = await pickRect(mPage, '[data-role="ctx-banner"]');
      assertInViewport(feverCutinRect, 'FEVER Cutin Banner', vp);
      assertInViewport(mobCtxRect, 'FEVER First Hint Banner', vp);
      assert(!rectsOverlap(feverCutinRect, boxes.topLeft), `FEVER banner overlaps topLeft on ${vp.name}`);
      assert(!rectsOverlap(feverCutinRect, boxes.topRight), `FEVER banner overlaps topRight on ${vp.name}`);
      assert(!rectsOverlap(feverCutinRect, objRect), `FEVER banner overlaps objective pill on ${vp.name}`);
      assert(!rectsOverlap(feverCutinRect, mobCtxRect), `FEVER banner overlaps context hint on ${vp.name}`);
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `12_fever_${vp.name}.png`) });
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.clearFeverForTest());
      await mPage.waitForTimeout(100);

      // 7. Pause screen audit
      await mPage.click('[data-role="pause-btn"]', { force: true });
      await mPage.waitForTimeout(450);
      await assertCardFits(mPage, '.pause-card', '.pause-card .result-title', vp, 'Pause');
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `07_pause_${vp.name}.png`) });

      // 8. Settings modal audit
      await mPage.click('[data-role="pause-settings-btn"]', { force: true });
      await mPage.waitForTimeout(350);
      await assertCardFits(mPage, '.settings-card', '.settings-card .result-title', vp, 'Settings');
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `08_settings_${vp.name}.png`) });
      await mPage.click('[data-role="settings-close-btn"]', { force: true });
      await mPage.waitForTimeout(250);

      // 9. Controls & Rules Guide modal audit
      await mPage.click('[data-role="pause-controls-btn"]', { force: true });
      await mPage.waitForTimeout(350);
      await assertCardFits(mPage, '.controls-card', '.controls-card .result-title', vp, 'ControlsGuide');
      const mobileGuideText = await mPage.locator('[data-role="controls-body"]').innerText();
      assert(
        mobileGuideText.includes('ぷにコン') && !mobileGuideText.includes('転がり') && !mobileGuideText.includes('ころがる'),
        `Unexpected mobile controls guide text on ${vp.name}: ${mobileGuideText}`
      );
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `09_controls_${vp.name}.png`) });
      await mPage.click('[data-role="controls-close-btn"]', { force: true });
      await mPage.waitForTimeout(200);
      await mPage.click('[data-role="resume-btn"]', { force: true });
      await mPage.waitForTimeout(250);

      // 10. Game Over screen audit
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.damagePlayerForTest(3));
      await mPage.waitForTimeout(450);
      await assertCardFits(mPage, '.gameover-card', '.gameover-card .result-title', vp, 'GameOver');
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `10_gameover_${vp.name}.png`) });

      // 11. Victory / Result screen audit
      await mPage.click('[data-role="gameover-retry-btn"]', { force: true });
      await mPage.waitForTimeout(250);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1));
      await mPage.waitForTimeout(150);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(2));
      await mPage.waitForTimeout(150);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3));
      await mPage.waitForTimeout(150);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI));
      await mPage.waitForTimeout(300);
      await mPage.evaluate(() => {
        window.__MANMARUBUU_DEBUG__.triggerBossStunForTest();
        window.__MANMARUBUU_DEBUG__.hitBossWeakForTest();
      });
      await mPage.waitForTimeout(180);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
      await mPage.waitForTimeout(180);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
      await mPage.waitForTimeout(2700);
      await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.openChestForTest());
      await mPage.waitForFunction(
        () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.phase === 'victory',
        { timeout: 10000 }
      );
      await mPage.waitForTimeout(900);
      await assertCardFits(mPage, '.victory-card', '.victory-card .result-title', vp, 'VictoryResult');
      await mPage.screenshot({ path: path.join(MOBILE_AUDIT_DIR, `11_victory_${vp.name}.png`) });

      await mCtx.close();
    }

    console.log('Failed URLs:', failedUrls);
    console.log('Console errors:', consoleErrors.length, consoleErrors);
    console.log('Page errors:', pageErrors.length, pageErrors);
    assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join('; ')}`);
    assert(failedUrls.length === 0, `Failed URLs: ${failedUrls.join('; ')}`);

    console.log('PHASE_A_QA_OK');
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
    console.error('PHASE A QA FAILED:', err);
    process.exit(1);
  });

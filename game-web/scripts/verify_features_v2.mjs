import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots', 'v2');
fs.mkdirSync(QA_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5185;
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

function assertInViewport(rect, label, vp) {
  assert(rect, `Missing bounding box for ${label} on ${vp.name}`);
  assert(rect.left >= -1, `${label} left < 0 (${rect.left}) on ${vp.name}`);
  assert(rect.top >= -1, `${label} top < 0 (${rect.top}) on ${vp.name}`);
  assert(rect.right <= vp.width + 1, `${label} right > ${vp.width} (${rect.right}) on ${vp.name}`);
  assert(rect.bottom <= vp.height + 1, `${label} bottom > ${vp.height} (${rect.bottom}) on ${vp.name}`);
}

async function pickRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return null;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

async function waitVisibleRect(page, selector, label, vp) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.85) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    selector,
    { timeout: 6000 }
  );
  const rect = await pickRect(page, selector);
  assertInViewport(rect, label, vp);
  return rect;
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
  await page.waitForTimeout(550);
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
    `${label}: BGM must not start before tap: ${JSON.stringify(beforeBgm)}`
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

async function captureWipeContactSheet(page, outPath) {
  const exprs = ['Sleep', 'Happy', 'Damage', 'Pien', 'Ganbaru', 'Panic', 'Pout', 'Fever'];
  const tiles = [];
  for (const expr of exprs) {
    await page.evaluate((e) => {
      window.__MANMARUBUU_DEBUG__.setExpressionInspect(e);
      if (e === 'Fever') {
        window.__MANMARUBUU_DEBUG__.triggerFever();
      } else {
        window.__MANMARUBUU_DEBUG__.clearFeverForTest();
      }
    }, expr);
    await page.waitForFunction(
      (expected) => {
        const hole = document.querySelector('.face-wipe-hole');
        const img = hole?.querySelector('.face-wipe-sprite-img');
        return Boolean(
          hole?.getAttribute('data-expr') === expected &&
            img &&
            img.complete &&
            img.naturalWidth === 256
        );
      },
      expr,
      { timeout: 5000 }
    );
    await page.waitForTimeout(80);

    const domState = await page.evaluate((expected) => {
      const hole = document.querySelector('.face-wipe-hole');
      const img = hole?.querySelector('.face-wipe-sprite-img');
      const tag = document.querySelector('[data-role="wipe-tag"]')?.textContent ?? '';
      return {
        is2d: hole?.classList.contains('mode-2d') ?? false,
        dataExpr: hole?.getAttribute('data-expr') ?? '',
        src: img?.getAttribute('src') ?? '',
        complete: Boolean(img?.complete),
        naturalWidth: img?.naturalWidth ?? 0,
        naturalHeight: img?.naturalHeight ?? 0,
        expectedLower: expected.toLowerCase(),
        tag,
      };
    }, expr);

    assert(domState.is2d, `Expected mode-2d on mobile wipe for ${expr}`);
    assert(domState.dataExpr === expr, `Expected data-expr="${expr}", got "${domState.dataExpr}"`);
    assert(
      domState.src.includes(`/face-wipe/${domState.expectedLower}.png`),
      `Unexpected sprite src for ${expr}: ${domState.src}`
    );
    assert(
      domState.complete && domState.naturalWidth === 256 && domState.naturalHeight === 256,
      `Sprite image did not finish loading at 256x256 for ${expr}: ${JSON.stringify(domState)}`
    );

    const wipeBuf = await page.locator('.face-wipe-anchor').screenshot();
    tiles.push({ expr, tag: domState.tag, b64: wipeBuf.toString('base64') });
  }

  await page.evaluate(() => {
    window.__MANMARUBUU_DEBUG__.setExpressionInspect(null);
    window.__MANMARUBUU_DEBUG__.clearFeverForTest();
  });

  const sheetPage = await page.context().newPage();
  await sheetPage.setViewportSize({ width: 960, height: 480 });
  const cards = tiles
    .map(
      (t) => `
      <div style="display:flex;flex-direction:column;align-items:center;background:#fff8ea;border-radius:16px;padding:10px;border:2px solid #e7c998;">
        <img src="data:image/png;base64,${t.b64}" style="width:140px;height:140px;object-fit:contain;" />
        <div style="margin-top:6px;font:700 14px sans-serif;color:#523121;">${t.expr} / ${t.tag}</div>
      </div>`
    )
    .join('');
  await sheetPage.setContent(
    `<body style="margin:0;padding:18px;background:#f4ead4;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">${cards}</body>`
  );
  await sheetPage.waitForTimeout(100);
  await sheetPage.screenshot({ path: outPath });
  await sheetPage.close();
}

async function runDesktopScenario(browser) {
  const errors = [];
  const failedUrls = [];
  const attach = (p) => {
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    p.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        failedUrls.push(`${res.status()} ${res.url()}`);
      }
    });
  };

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  attach(page);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
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

  // Clean title check
  const initSave = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
  assert(initSave.version === 2, `Expected SaveData version 2, got ${initSave.version}`);
  assert(
    (await page.locator('[data-role="play-btn-label"]').innerText()).includes('あそぶ'),
    'Fresh title button should show PLAY'
  );
  assert(
    await page.locator('[data-role="title-newgame-btn"]').evaluate((el) => el.classList.contains('hidden')),
    'Fresh title should hide New Game button'
  );

  // 1. Welcome Movie copy & gap
  await page.click('[data-role="play-btn"]', { force: true });
  await page.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
    undefined,
    { timeout: 6000 }
  );
  await page.waitForTimeout(220);
  const welcomeSub = await page.locator('.welcome-sub').innerText();
  assert(welcomeSub.includes('まんまるぶうといっしょに'), `Unexpected welcome subtitle: ${welcomeSub}`);
  const deskVp = { name: 'pc', width: 1280, height: 720 };
  const wCardRect = await pickRect(page, '.welcome-title-card');
  const wSkipRect = await pickRect(page, '[data-role="welcome-skip-btn"]');
  assertInViewport(wCardRect, 'PC Welcome Card', deskVp);
  assertInViewport(wSkipRect, 'PC Welcome Skip', deskVp);
  assert(
    wSkipRect.top >= wCardRect.bottom + 8,
    `PC welcome skip too close to card: cardBottom=${wCardRect.bottom}, skipTop=${wSkipRect.top}`
  );
  await page.screenshot({ path: path.join(QA_DIR, 'v2_welcome_pc.png') });

  // Skip Welcome -> Intro -> Complete tutorial & check beacon + compass
  await page.click('[data-role="welcome-skip-btn"]', { force: true });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__MANMARUBUU_DEBUG__.completeTutorialAll();
    window.__MANMARUBUU_DEBUG__.teleport(0, 1.4, 24.0, Math.PI);
  });
  await page.waitForTimeout(320);

  await page.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.navTargets?.length ?? 0) === 3,
    undefined,
    { timeout: 6000 }
  );
  const navRect = await waitVisibleRect(page, '[data-role="nav-compass"]', 'PC Nav Compass', deskVp);
  const topLeftRect = await waitVisibleRect(page, '.hud-top-left', 'PC HUD TopLeft', deskVp);
  const topRightRect = await waitVisibleRect(page, '.hud-top-right', 'PC HUD TopRight', deskVp);
  const objRect = await waitVisibleRect(page, '[data-role="objective-pill"]', 'PC Objective Pill', deskVp);
  const wipeRect = await waitVisibleRect(page, '.face-wipe-anchor', 'PC Face Wipe', deskVp);
  assert(!rectsOverlap(navRect, topLeftRect), 'PC Nav Compass overlaps topLeft');
  assert(!rectsOverlap(navRect, topRightRect), 'PC Nav Compass overlaps topRight');
  assert(!rectsOverlap(navRect, objRect), 'PC Nav Compass overlaps objective pill');
  assert(!rectsOverlap(navRect, wipeRect), 'PC Nav Compass overlaps face wipe');
  const navDistText = await page.locator('[data-role="nav-primary-dist"]').innerText();
  assert(/^\d+m$/.test(navDistText.trim()), `Expected meter distance on nav compass, got "${navDistText}"`);
  await page.screenshot({ path: path.join(QA_DIR, 'v2_nav_beacons_pc.png') });

  // 2. Main Star 1 & 2: 1-cut closeup only (NO rainbowMovie), auto-finishes ~1.6s
  await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1));
  await page.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.stars ?? 0) >= 1,
    undefined,
    { timeout: 5000 }
  );
  let rmState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getRainbowMovieState());
  let camCinematic = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.isCameraCinematicActive());
  assert(rmState.active === false, 'Star 1 must NOT trigger rainbow movie');
  assert(camCinematic === true, 'Star 1 should trigger 1.6s celebration closeup');
  await page.waitForFunction(
    () => !window.__MANMARUBUU_DEBUG__?.isCameraCinematicActive(),
    undefined,
    { timeout: 15000 }
  );

  await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(2));
  await page.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.stars ?? 0) >= 2,
    undefined,
    { timeout: 10000 }
  );
  rmState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getRainbowMovieState());
  const camCinematic2 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.isCameraCinematicActive());
  assert(rmState.active === false, 'Star 2 must NOT trigger rainbow movie');
  assert(camCinematic2 === true, 'Star 2 should trigger 1.6s celebration closeup');
  await page.waitForFunction(
    () => !window.__MANMARUBUU_DEBUG__?.isCameraCinematicActive(),
    undefined,
    { timeout: 15000 }
  );

  // 3. Main Star 3 -> Full Rainbow Bridge Opening Movie (Act 1 -> Act 2 -> Act 3 -> Skip)
  await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3));
  await page.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getRainbowMovieState()?.active === true,
    undefined,
    { timeout: 8000 }
  );
  rmState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getRainbowMovieState());
  assert(rmState.act === 1, `Expected Rainbow Movie Act 1 first, got ${rmState.act}`);

  // Wait for Act 2 with all 3 lamps lit (~2.7s elapsed)
  await page.waitForFunction(
    () => {
      const s = window.__MANMARUBUU_DEBUG__?.getRainbowMovieState();
      return Boolean(s?.active && s.act === 2 && s.elapsed >= 2.75);
    },
    undefined,
    { timeout: 25000 }
  );
  await page.waitForTimeout(150);
  const act2Sub = await page.locator('[data-role="rainbow-sub"]').innerText();
  assert(act2Sub.includes('3つのスター'), `Unexpected Act 2 subtitle: ${act2Sub}`);
  await page.screenshot({ path: path.join(QA_DIR, 'v2_rainbow_act2_pc.png') });

  // Wait for Act 3 (Rainbow Bridge extending to Boss Castle)
  await page.waitForFunction(
    () => {
      const s = window.__MANMARUBUU_DEBUG__?.getRainbowMovieState();
      return Boolean(s?.active && s.act === 3 && s.canSkip && s.elapsed >= 4.4);
    },
    undefined,
    { timeout: 25000 }
  );
  const act3Sub = await page.locator('[data-role="rainbow-sub"]').innerText();
  assert(
    act3Sub.includes('虹の橋が開通') && act3Sub.includes('ボス城'),
    `Unexpected Act 3 subtitle: ${act3Sub}`
  );
  const rbCardRect = await pickRect(page, '[data-role="rainbow-card"]');
  const rbSkipRect = await pickRect(page, '[data-role="rainbow-skip-btn"]');
  assert(
    rbSkipRect.top >= rbCardRect.bottom + 8,
    `PC rainbow movie skip button overlaps subtitle card: cardBottom=${rbCardRect.bottom}, skipTop=${rbSkipRect.top}`
  );
  await page.screenshot({ path: path.join(QA_DIR, 'v2_rainbow_act3_pc.png') });

  // Skip during Act 3 -> bridge open + nav targets boss/gate
  await page.click('[data-role="rainbow-skip-btn"]', { force: true });
  await page.waitForTimeout(250);
  const afterBridge = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState().snapshot);
  assert(afterBridge.rainbowMovieActive === false, 'Rainbow movie should exit after skip');
  assert(afterBridge.rainbowBridgeOpen === true, 'Rainbow bridge must be open after movie/skip');
  assert(
    afterBridge.navTargets.length === 1 &&
      (afterBridge.navTargets[0].kind === 'boss' || afterBridge.navTargets[0].kind === 'gate'),
    `Expected boss or gate nav target after Rainbow Bridge open, got ${JSON.stringify(afterBridge.navTargets)}`
  );

  // 4. Autosave + Reload + Continue ("つづきから") + v1->v2 migration + Reset Confirm ("はじめから")
  // First step on checkpoint 0 (-4.2, 1.2, 12.2) so run autosave has Star 1,2,3 + checkpoint + bridge open
  await page.evaluate(() => {
    window.__MANMARUBUU_DEBUG__.teleport(-4.2, 1.35, 12.2, Math.PI);
  });
  await page.waitForTimeout(450);

  const savedRun = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
  assert(savedRun.worlds.world1.run?.active === true, 'Expected active autosave run after checkpoint & stars');
  assert(savedRun.worlds.world1.run.collectedStarIds.includes(1), 'Run save missing Star 1');
  assert(savedRun.worlds.world1.run.rainbowBridgeOpen === true, 'Run save missing rainbowBridgeOpen');

  // Reload -> Title should show "▶ つづきから", "🔄 はじめから", "💾 チェックポイント再開可"
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(page);

  const playLabel = await page.locator('[data-role="play-btn-label"]').innerText();
  assert(playLabel.includes('つづきから'), `Expected title button "つづきから", got "${playLabel}"`);
  assert(
    !(await page.locator('[data-role="title-newgame-btn"]').evaluate((el) => el.classList.contains('hidden'))),
    'Title New Game button should be visible when save exists'
  );
  assert(
    !(await page.locator('[data-role="title-resume-badge"]').evaluate((el) => el.classList.contains('hidden'))),
    'Title Resume badge should be visible when run save exists'
  );
  await page.screenshot({ path: path.join(QA_DIR, 'v2_title_continue_pc.png') });

  // Click Continue -> skips welcome movie & tutorial, restores stars, checkpoint, rainbow bridge!
  await page.click('[data-role="play-btn"]', { force: true });
  await page.waitForTimeout(350);
  const resumedState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
  assert(resumedState.snapshot.phase === 'playing', 'Resume should enter playing phase');
  assert(resumedState.snapshot.welcomeMovieActive === false, 'Resume must skip welcome movie');
  assert(resumedState.snapshot.tutorialStep === 'done', 'Resume must skip completed tutorial');
  assert(resumedState.snapshot.stars === 3, `Expected 3 resumed main stars, got ${resumedState.snapshot.stars}`);
  assert(resumedState.snapshot.rainbowBridgeOpen === true, 'Resume must restore rainbowBridgeOpen');
  assert(
    Math.hypot(resumedState.playerPos[0] - (-4.2), resumedState.playerPos[2] - 12.2) < 3.5,
    `Expected resumed position near checkpoint (-4.2, 12.2), got ${JSON.stringify(resumedState.playerPos)}`
  );

  // Settings Reset button -> Cancel keeps save
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('[data-role="pause-settings-btn"]', { force: true });
  await page.waitForTimeout(200);
  await page.click('[data-role="settings-reset-save-btn"]', { force: true });
  await page.waitForTimeout(200);
  assert(
    !(await page.locator('[data-role="reset-confirm-modal"]').evaluate((el) => el.classList.contains('hidden'))),
    'Reset confirm modal did not open from Settings'
  );
  await page.click('[data-role="reset-cancel-btn"]', { force: true });
  await page.waitForTimeout(200);
  assert(
    (await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData().worlds.world1.run?.active)) === true,
    'Canceling reset must preserve save'
  );

  // Back to Title -> click Title New Game -> screenshot confirmation modal -> confirm reset -> restarts from Welcome Movie!
  await page.click('[data-role="settings-close-btn"]', { force: true });
  await page.waitForTimeout(150);
  await page.click('[data-role="pause-title-btn"]', { force: true });
  await page.waitForTimeout(250);
  await page.click('[data-role="title-newgame-btn"]', { force: true });
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(QA_DIR, 'v2_reset_confirm_modal_pc.png') });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('[data-role="reset-confirm-btn"]', { force: true }),
  ]);
  await waitReady(page);
  await page.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieActive === true,
    undefined,
    { timeout: 10000 }
  );
  const afterResetState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
  const afterResetSave = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
  assert(afterResetSave.tutorialCompleted === false, 'Reset should clear tutorialCompleted');
  assert(
    afterResetSave.worlds.world1.run?.active === false &&
      afterResetSave.worlds.world1.run?.checkpoint === null,
    'Reset should clear active run'
  );
  assert(afterResetSave.worlds.world1.collectedStarIds.length === 0, 'Reset should clear collectedStarIds');
  assert(afterResetState.snapshot.tutorialStep === 1, `Expected reset to Step 1, got ${afterResetState.snapshot.tutorialStep}`);

  // 5. v1 -> v2 migration check in a clean context
  const migCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const migPage = await migCtx.newPage();
  attach(migPage);
  await migPage.addInitScript(() => {
    window.localStorage.removeItem('manmarubuu_save_v2');
    window.localStorage.setItem(
      'manmarubuu_save_v1',
      JSON.stringify({
        version: 1,
        world1: {
          cleared: true,
          highScore: 4200,
          bestRank: 'A',
          collectedStarIds: [1, 4],
          stamps: ['clear_w1'],
        },
      })
    );
  });
  await migPage.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady(migPage);
  const migrated = await migPage.evaluate(() => ({
    save: window.__MANMARUBUU_DEBUG__.getSaveData(),
    rawV2: window.localStorage.getItem('manmarubuu_save_v2'),
    label: document.querySelector('[data-role="play-btn-label"]')?.textContent ?? '',
  }));
  assert(migrated.save.version === 2, 'v1->v2 migration failed version');
  assert(migrated.save.tutorialCompleted === true, 'v1->v2 migration should mark tutorialCompleted when stars/clear exist');
  assert(migrated.save.worlds.world1.highScore === 4200, 'v1->v2 migration lost highScore');
  assert(migrated.save.worlds.world1.bestRank === 'A', 'v1->v2 migration lost bestRank');
  assert(migrated.save.worlds.world1.collectedStarIds.includes(4), 'v1->v2 migration lost star 4');
  assert(Boolean(migrated.rawV2), 'v1->v2 migration did not persist manmarubuu_save_v2');
  assert(migrated.label.includes('つづきから'), `Expected migrated save title to show つづきから, got ${migrated.label}`);
  await migCtx.close();

  await context.close();
  assert(errors.length === 0, `PC console/page errors: ${errors.join('\n')}`);
  assert(failedUrls.length === 0, `PC failed responses: ${failedUrls.join('\n')}`);
  console.log('V2_DESKTOP_PASS');
}

async function runMobilePortraitLockCheck(browser) {
  const errors = [];
  const failedUrls = [];
  const vp = { name: 'portrait', width: 390, height: 844 };
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: true,
    isMobile: true,
  });
  const mPage = await context.newPage();
  mPage.on('pageerror', (e) => errors.push(String(e)));
  mPage.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  mPage.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
      failedUrls.push(`${res.status()} ${res.url()}`);
    }
  });

  await mPage.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady(mPage);
  await passMobileBootTap(mPage, 'Mobile Portrait');

  const lockedState = await mPage.evaluate(() => ({
    portraitBlocked: window.__MANMARUBUU_DEBUG__.getState().snapshot.portraitBlocked,
    overlayVisible: !document
      .querySelector('[data-role="portrait-lock-overlay"]')
      ?.classList.contains('hidden'),
  }));
  assert(
    lockedState.portraitBlocked === true && lockedState.overlayVisible === true,
    `Expected portrait lock overlay on mobile 390x844: ${JSON.stringify(lockedState)}`
  );
  const lockRect = await pickRect(mPage, '.portrait-lock-card');
  assertInViewport(lockRect, 'Portrait Lock Card', vp);

  // Rotate to landscape 844x390 -> portrait lock should clear automatically
  await mPage.setViewportSize({ width: 844, height: 390 });
  await mPage.waitForTimeout(300);
  const unlockedState = await mPage.evaluate(() => ({
    portraitBlocked: window.__MANMARUBUU_DEBUG__.getState().snapshot.portraitBlocked,
    overlayHidden: document
      .querySelector('[data-role="portrait-lock-overlay"]')
      ?.classList.contains('hidden'),
  }));
  assert(
    unlockedState.portraitBlocked === false && unlockedState.overlayHidden === true,
    `Expected portrait lock overlay to hide on landscape rotation: ${JSON.stringify(unlockedState)}`
  );

  await context.close();
  assert(errors.length === 0, `Mobile portrait console/page errors: ${errors.join('\n')}`);
  assert(failedUrls.length === 0, `Mobile portrait failed responses: ${failedUrls.join('\n')}`);
  console.log('V2_MOBILE_PORTRAIT_LOCK_PASS');
}

async function runMobileScenario(browser, vp) {
  const errors = [];
  const failedUrls = [];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: true,
    isMobile: true,
  });
  const mPage = await context.newPage();
  mPage.on('pageerror', (e) => errors.push(String(e)));
  mPage.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  mPage.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
      failedUrls.push(`${res.status()} ${res.url()}`);
    }
  });

  await mPage.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady(mPage);
  await passMobileBootTap(mPage, `Mobile ${vp.name}`);

  // Welcome movie subcopy & spacing
  await mPage.click('[data-role="play-btn"]', { force: true });
  await mPage.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
    undefined,
    { timeout: 6000 }
  );
  await mPage.waitForTimeout(220);
  const mSub = await mPage.locator('.welcome-sub').innerText();
  assert(mSub.includes('まんまるぶうといっしょに'), `Mobile ${vp.name} welcome subcopy mismatch: ${mSub}`);
  const wCard = await pickRect(mPage, '.welcome-title-card');
  const wSkip = await pickRect(mPage, '[data-role="welcome-skip-btn"]');
  assertInViewport(wCard, `Welcome Card ${vp.name}`, vp);
  assertInViewport(wSkip, `Welcome Skip ${vp.name}`, vp);
  assert(wSkip.top >= wCard.bottom + 8, `Mobile ${vp.name} skip overlaps/crowds welcome card`);
  await mPage.screenshot({ path: path.join(QA_DIR, `v2_welcome_${vp.name}.png`) });

  // Complete tutorial & verify low mode + 8-expression PNG face wipes + beacon + compass
  await mPage.evaluate(() => {
    window.__MANMARUBUU_DEBUG__.completeTutorialAll();
    window.__MANMARUBUU_DEBUG__.teleport(0, 1.4, 24.0, Math.PI);
  });
  await mPage.waitForTimeout(320);

  await mPage.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.navTargets?.length ?? 0) === 3,
    undefined,
    { timeout: 6000 }
  );
  const mEnv = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
  assert(
    mEnv.resolvedQuality === 'medium' || mEnv.resolvedQuality === 'low',
    `Expected medium or low quality on ${vp.name}, got ${mEnv.resolvedQuality}`
  );
  assert(mEnv.faceWipe3dActive === false, `Expected faceWipe3dActive false on ${vp.name}`);
  assert(mEnv.faceWipeCloneCreated === false, `Expected no 3D wipe clone on ${vp.name}`);

  const navRect = await waitVisibleRect(mPage, '[data-role="nav-compass"]', `Nav Compass ${vp.name}`, vp);
  const topLeft = await waitVisibleRect(mPage, '.hud-top-left', `TopLeft ${vp.name}`, vp);
  const topRight = await waitVisibleRect(mPage, '.hud-top-right', `TopRight ${vp.name}`, vp);
  const objRect = await waitVisibleRect(mPage, '[data-role="objective-pill"]', `Objective ${vp.name}`, vp);
  const wipeRect = await waitVisibleRect(mPage, '.face-wipe-anchor', `FaceWipe ${vp.name}`, vp);
  assert(!rectsOverlap(navRect, topLeft), `Nav Compass overlaps topLeft on ${vp.name}: nav=${JSON.stringify(navRect)} topLeft=${JSON.stringify(topLeft)}`);
  assert(!rectsOverlap(navRect, topRight), `Nav Compass overlaps topRight on ${vp.name}: nav=${JSON.stringify(navRect)} topRight=${JSON.stringify(topRight)}`);
  assert(!rectsOverlap(navRect, objRect), `Nav Compass overlaps objective pill on ${vp.name}: nav=${JSON.stringify(navRect)} obj=${JSON.stringify(objRect)}`);
  assert(!rectsOverlap(navRect, wipeRect), `Nav Compass overlaps face wipe on ${vp.name}: nav=${JSON.stringify(navRect)} wipe=${JSON.stringify(wipeRect)}`);
  await mPage.screenshot({ path: path.join(QA_DIR, `v2_nav_beacons_${vp.name}.png`) });

  // Verify all 8 real-3D PNG face wipes load & animate smoothly without errors
  await captureWipeContactSheet(mPage, path.join(QA_DIR, `v2_mobile_wipe_8_${vp.name}.png`));

  // Rainbow Bridge Movie Act 3 + Skip + Post-bridge Boss nav on mobile
  await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1));
  await mPage.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.stars ?? 0) >= 1,
    undefined,
    { timeout: 5000 }
  );
  await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(2));
  await mPage.waitForFunction(
    () => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.stars ?? 0) >= 2,
    undefined,
    { timeout: 5000 }
  );
  await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3));
  await mPage.waitForFunction(
    () => {
      const s = window.__MANMARUBUU_DEBUG__?.getRainbowMovieState();
      return Boolean(s?.active && s.act === 3 && s.canSkip && s.elapsed >= 4.2);
    },
    undefined,
    { timeout: 15000 }
  );
  const rbCard = await pickRect(mPage, '[data-role="rainbow-card"]');
  const rbSkip = await pickRect(mPage, '[data-role="rainbow-skip-btn"]');
  assertInViewport(rbCard, `Rainbow Card ${vp.name}`, vp);
  assertInViewport(rbSkip, `Rainbow Skip ${vp.name}`, vp);
  assert(rbSkip.top >= rbCard.bottom + 8, `Mobile ${vp.name} rainbow skip crowds card`);
  await mPage.screenshot({ path: path.join(QA_DIR, `v2_rainbow_act3_${vp.name}.png`) });

  await mPage.touchscreen.tap((rbSkip.left + rbSkip.right) / 2, (rbSkip.top + rbSkip.bottom) / 2);
  await mPage.waitForTimeout(300);
  const afterSkipMobile = await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.getState().snapshot);
  assert(afterSkipMobile.rainbowMovieActive === false, `Mobile ${vp.name} rainbow skip failed`);
  assert(afterSkipMobile.rainbowBridgeOpen === true, `Mobile ${vp.name} bridge should open`);
  assert(
    afterSkipMobile.navTargets.length === 1 &&
      (afterSkipMobile.navTargets[0].kind === 'boss' || afterSkipMobile.navTargets[0].kind === 'gate'),
    `Expected boss/gate nav on ${vp.name}`
  );

  // Mobile Title Continue + Settings Reset Button layout check on reload
  await mPage.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-4.2, 1.35, 12.2, Math.PI));
  await mPage.waitForFunction(
    () => window.__MANMARUBUU_DEBUG__?.getSaveData()?.worlds?.world1?.run?.active === true,
    undefined,
    { timeout: 6000 }
  );
  await mPage.reload({ waitUntil: 'domcontentloaded' });
  await waitReady(mPage);
  await passMobileBootTap(mPage, `Mobile ${vp.name} Reload`);
  const tPlay = await pickRect(mPage, '[data-role="play-btn"]');
  const tNew = await pickRect(mPage, '[data-role="title-newgame-btn"]');
  const tRes = await pickRect(mPage, '[data-role="title-resume-badge"]');
  assertInViewport(tPlay, `Title Play ${vp.name}`, vp);
  assertInViewport(tNew, `Title NewGame ${vp.name}`, vp);
  assertInViewport(tRes, `Title ResumeBadge ${vp.name}`, vp);
  assert(!rectsOverlap(tPlay, tNew), `Title Play overlaps NewGame on ${vp.name}`);
  await mPage.screenshot({ path: path.join(QA_DIR, `v2_title_continue_${vp.name}.png`) });

  await mPage.click('[data-role="title-settings-btn"]', { force: true });
  await mPage.waitForTimeout(280);
  const resetRowRect = await pickRect(mPage, '[data-role="settings-reset-save-btn"]');
  const settingsCloseRect = await pickRect(mPage, '[data-role="settings-close-btn"]');
  assertInViewport(resetRowRect, `Settings Reset Button ${vp.name}`, vp);
  assertInViewport(settingsCloseRect, `Settings Close Button ${vp.name}`, vp);
  await mPage.screenshot({ path: path.join(QA_DIR, `v2_settings_reset_${vp.name}.png`) });

  await context.close();
  assert(errors.length === 0, `Mobile ${vp.name} console/page errors: ${errors.join('\n')}`);
  assert(failedUrls.length === 0, `Mobile ${vp.name} failed responses: ${failedUrls.join('\n')}`);
  console.log(`V2_MOBILE_${vp.name.toUpperCase()}_PASS`);
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

    await runDesktopScenario(browser);
    await runMobilePortraitLockCheck(browser);
    await runMobileScenario(browser, { name: 'landscape', width: 844, height: 390 });
    console.log('ALL_V2_FEATURES_PASS');
  } finally {
    if (browser) await browser.close();
    if (server.pid) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
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
  console.error(err);
  process.exit(1);
});

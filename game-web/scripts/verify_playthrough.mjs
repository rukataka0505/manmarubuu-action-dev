import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots');
fs.mkdirSync(QA_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5179;
const URL = `http://127.0.0.1:${PORT}/`;

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

    const consoleErrors = [];
    const pageErrors = [];
    const failedUrls = [];
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

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
    await page.waitForTimeout(1000);

    const pcBootState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBootState());
    if (!pcBootState.done || pcBootState.awaitingTap || pcBootState.isMobile) {
      throw new Error(`PC should skip boot tap prompt: ${JSON.stringify(pcBootState)}`);
    }
    const loaderStillActive = await page.evaluate(() => {
      const el = document.getElementById('boot-loader');
      return Boolean(el && !el.classList.contains('is-done'));
    });
    if (loaderStillActive) {
      throw new Error('PC #boot-loader should be done/dismissed automatically');
    }
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getBgmState()?.activeBgm === 'title',
      undefined,
      { timeout: 5000 }
    );
    const pcBgmState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBgmState());
    if (pcBgmState.desiredBgm !== 'title' || pcBgmState.activeBgm !== 'title') {
      throw new Error(`PC title BGM did not auto-start: ${JSON.stringify(pcBgmState)}`);
    }

    const initState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    console.log('Loaded clips:', initState.loadedClips.length);
    if (initState.loadedClips.length !== 20) {
      throw new Error(`Expected 20 animations, got ${initState.loadedClips.length}`);
    }

    const envStats = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEnvironmentStats());
    console.log('Environment stats:', JSON.stringify(envStats));
    if (
      !envStats.hdriLoaded ||
      envStats.pbrTexturesLoaded < 30 ||
      envStats.dioramaTemplatesLoaded < 30 ||
      envStats.grassClusters < 10000 ||
      !envStats.n8aoEnabled
    ) {
      throw new Error(`Environment upgrade check failed: ${JSON.stringify(envStats)}`);
    }

    // 1. Title screen
    await page.screenshot({ path: path.join(QA_DIR, '01_title.png') });

    // Start game via real PLAY button click -> Opening Welcome Movie -> Step 1 Intro Confirm Card -> Step 1
    await page.click('[data-role="play-btn"]', { force: true });
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieActive === true,
      undefined,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
      undefined,
      { timeout: 5000 }
    );
    await page.screenshot({ path: path.join(QA_DIR, '01b_welcome_movie.png') });
    await page.click('[data-role="welcome-skip-btn"]', { force: true });

    await page.waitForFunction(
      () => {
        const s = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
        return Boolean(s?.tutorialAwaitingConfirm && s?.tutorialConfirmStep === 0 && s?.tutorialConfirmReady);
      },
      undefined,
      { timeout: 5000 }
    );
    await page.screenshot({ path: path.join(QA_DIR, '01c_step1_intro_card.png') });
    await page.click('[data-role="tut-confirm-next-btn"]', { force: true });
    await page.waitForTimeout(350);

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.whenAudioReady());
    const audioStatus = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getAudioStatus());
    console.log('External audio status:', JSON.stringify(audioStatus));
    if (!audioStatus.manifestLoaded || audioStatus.loadedBgm.length !== 5 || audioStatus.loadedSfx.length !== 13) {
      throw new Error(`External audio mismatch: ${JSON.stringify(audioStatus)}`);
    }

    // Verify all 16 east dominos stand untouched after physics init (zero overlap collapse)
    const dominoStats = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEastDominoStats());
    console.log('East dominos:', JSON.stringify(dominoStats));
    if (dominoStats.total !== 16 || dominoStats.fallen !== 0) {
      throw new Error(`East dominos collapsed before player arrival! ${JSON.stringify(dominoStats)}`);
    }

    // 2. Start Meadow + Tutorial + Live 3D Face Wipe
    await page.screenshot({ path: path.join(QA_DIR, '02_tutorial_meadow_wipe.png') });

    // 2b. Art Bible 07 (Nintendo field) comparison angle: denim steps, grass, daisies, stones, castle & pink slide
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(11.5, 2.2, 41.2, Math.PI * 0.86));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, '02b_meadow_nintendo_angle.png') });

    // 2c. Art Bible 08 (Diorama blocks & domino road) comparison angle
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(16.8, 0.8, 14.8, -Math.PI * 0.82));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, '02c_diorama_domino_angle.png') });

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.25, 46.0, Math.PI));
    await page.waitForTimeout(200);

    // Real keyboard playthrough: Run forward along coins (Step 1)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1350);
    await page.keyboard.up('KeyW');

    // Step 1 completion has an afterglow delay + 0.30s confirm guard -> wait until confirm card is ready, then advance with Enter
    await page.waitForFunction(
      () => {
        const snap = window.__MANMARUBUU_DEBUG__?.getState()?.snapshot;
        return Boolean(snap?.tutorialAwaitingConfirm && snap?.tutorialConfirmReady);
      },
      undefined,
      { timeout: 9000 }
    );
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Jump & Hip Drop onto glowing tutorial crates!
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.3, 28.0, Math.PI));
    await page.waitForTimeout(220);
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Space');
    await page.waitForTimeout(260);
    await page.keyboard.press('ControlLeft');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(420);

    // 3. Hip Drop Smash & Callout
    await page.screenshot({ path: path.join(QA_DIR, '03_hipdrop_smash.png') });

    // Complete tutorial & verify Central Castle Star 1 + Castle Front Arch
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.completeTutorialAll();
      window.__MANMARUBUU_DEBUG__.teleport(0, 1.3, 14.0, Math.PI);
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(QA_DIR, '04b_castle_front.png') });

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 10.4, 3.0, Math.PI));
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(QA_DIR, '04_castle_star1.png') });

    // Collect Star 1
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1));
    await page.waitForTimeout(3500);

    // 5b. East Cushions, Gift Piles & Toy Village before Spring Tower
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(20.5, 0.6, 13.8, -Math.PI * 0.68));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, '05b_east_cushions.png') });

    // 5. East Cushions & Triple Red Spring Tower
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(28.0, 5.5, -2.5, Math.PI));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(QA_DIR, '05_east_spring_tower.png') });
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(2));
    await page.waitForTimeout(3500);

    // 6. West Pastel Giant Slide & Bowling Plaza
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-28.5, 9.0, 1.5, Math.PI * 0.96));
    await page.waitForTimeout(150);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: path.join(QA_DIR, '06_west_slide_bowling.png') });

    // 6b. Slide Exit Finish Gate & Bowling Stadium view
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-21.0, 0.7, -21.2, Math.PI));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, '06b_west_bowling_gate.png') });

    // 6c. Closeup of new high-detail Windup Tanks in Bowling Plaza
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-18.5, 0.7, -28.0, Math.PI * 0.85));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, '06c_enemies_closeup.png') });

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3));
    await page.waitForTimeout(3800);

    // 7. 3-Star Boss Gate (grounded inside hub) & Rainbow Bridge
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-1.6, 1.4, -10.8, Math.PI * 0.96));
    await page.waitForTimeout(650);
    await page.screenshot({ path: path.join(QA_DIR, '07_rainbow_bridge.png') });

    // 8b. Art Bible 09 Boss Arena wide view (wait 1600ms so dusk starry mood converges >= 0.98!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -36.5, Math.PI));
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(QA_DIR, '08b_boss_arena_wide.png') });

    // 8. Boss Arena: capture full Boss Fight (with stunned Golden Windup Key exposed + FEVER!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI));
    await page.waitForTimeout(3200);
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.triggerBossStunForTest();
      window.__MANMARUBUU_DEBUG__.triggerFever();
    });
    await page.waitForTimeout(550);
    await page.screenshot({ path: path.join(QA_DIR, '08_boss_fight.png') });

    // Defeat Boss 3 phases & open Victory Chest!
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(420);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(420);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(2800);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.openChestForTest());

    // Wait explicitly until phase === 'victory', then wait 1100ms for all 4 stat rows + S rank animation!
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.phase === 'victory',
      { timeout: 10000 }
    );
    await page.waitForTimeout(1150);

    // 9. Victory Result & Dancing Manmarubuu
    await page.screenshot({ path: path.join(QA_DIR, '09_victory_result.png') });

    // 10. Verify all 8 expressions + blush OFF/ON rule & capture wipe crops (clear fever first so natural plush shows!)
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.clearFeverForTest();
      window.__MANMARUBUU_DEBUG__.startGame();
      window.__MANMARUBUU_DEBUG__.teleport(0, 0.4, 40, 0);
    });
    await page.waitForTimeout(350);

    const exprs = ['Sleep', 'Happy', 'Damage', 'Pien', 'Ganbaru', 'Panic', 'Pout', 'Fever'];
    const wipeDir = path.join(QA_DIR, '_wipe_8');
    fs.mkdirSync(wipeDir, { recursive: true });

    for (const ex of exprs) {
      if (ex === 'Fever') {
        await page.evaluate(() => window.__MANMARUBUU_DEBUG__.triggerFever());
        await page.waitForTimeout(180);
      }
      const blushMap = await page.evaluate((name) => window.__MANMARUBUU_DEBUG__.setExpressionInspect(name), ex);
      await page.waitForTimeout(160);
      const anyBlushOn = Object.values(blushMap).some(Boolean);
      if ((ex === 'Sleep' || ex === 'Ganbaru') && anyBlushOn) {
        throw new Error(`BLUSH VIOLATION on ${ex}: ${JSON.stringify(blushMap)}`);
      }
      if ((ex === 'Happy' || ex === 'Damage' || ex === 'Pien' || ex === 'Pout' || ex === 'Fever') && !anyBlushOn) {
        throw new Error(`Expected blush ON for ${ex}, got ${JSON.stringify(blushMap)}`);
      }
      await page.screenshot({
        path: path.join(wipeDir, `${ex}.png`),
        clip: { x: 4, y: 720 - 208, width: 204, height: 204 },
      });
    }

    execSync('python scripts/compose_wipe_sheet.py', { cwd: GAME_ROOT, stdio: 'inherit' });

    const finalState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    console.log('Measured FPS:', finalState.snapshot.fps);
    console.log('Failed URLs:', failedUrls);
    console.log('Console errors:', consoleErrors.length, consoleErrors);
    console.log('Page errors:', pageErrors.length, pageErrors);

    if (consoleErrors.length > 0 || pageErrors.length > 0 || failedUrls.length > 0) {
      throw new Error(`Runtime errors detected! console=${consoleErrors.length}, page=${pageErrors.length}, http4xx=${failedUrls.length}`);
    }
    console.log('PLAYTHROUGH_QA_OK');
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    if (process.platform === 'win32' && server.pid) {
      try {
        execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // ignore if already exited
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('QA FAILED:', err);
    process.exit(1);
  });

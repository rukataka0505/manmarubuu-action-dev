import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const QA_DIR = path.join(GAME_ROOT, 'qa-shots-multiworld');
fs.mkdirSync(QA_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5181;
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

    const activeOnBoot = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getActiveWorldId());
    if (activeOnBoot !== 'world1') {
      throw new Error(`Expected initial world to be world1, got ${activeOnBoot}`);
    }

    // 1. Title screen showing World 1 Sunlit Playroom
    await page.screenshot({ path: path.join(QA_DIR, 'w1_01_title.png') });

    // 2. Open World Select and verify BOTH World 1 and World 2 are playable
    await page.click('[data-role="world-select-btn"]', { force: true });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_02_world_select.png') });

    const wsButtons = await page.evaluate(() => ({
      w1Visible: Boolean(document.querySelector('[data-role="select-world-1-btn"]')),
      w2Visible: Boolean(document.querySelector('[data-role="select-world-2-btn"]')),
    }));
    if (!wsButtons.w1Visible || !wsButtons.w2Visible) {
      throw new Error(`World Select missing playable buttons: ${JSON.stringify(wsButtons)}`);
    }

    // Start World 1 from World Select
    await page.click('[data-role="select-world-1-btn"]', { force: true });
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.welcomeMovieCanSkip === true,
      undefined,
      { timeout: 6000 }
    );
    await page.screenshot({ path: path.join(QA_DIR, 'w1_03_welcome_view.png') });
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.completeTutorialAll());
    await page.waitForTimeout(300);

    // Verify East Dominos standing cleanly untouched
    const w1DominoStats = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getEastDominoStats());
    console.log('World 1 East dominos:', JSON.stringify(w1DominoStats));
    if (w1DominoStats.total !== 16 || w1DominoStats.fallen !== 0) {
      throw new Error(`World 1 east dominos collapsed before arrival: ${JSON.stringify(w1DominoStats)}`);
    }

    // Verify ZERO fall-out damage in World 1
    const hpBeforeFall = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState().snapshot.hp);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.fallOutForTest());
    await page.waitForTimeout(350);
    const hpAfterFall = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState().snapshot.hp);
    if (hpAfterFall !== hpBeforeFall) {
      throw new Error(`World 1 should have ZERO fall-out damage! before=${hpBeforeFall}, after=${hpAfterFall}`);
    }

    // Capture Playroom iconic views
    // Overview from front-center looking across foreground crayons, felt rug, castle, bed, books, train, slides, sunlit window
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.25, 25.8, Math.PI));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_04_playroom_front.png') });

    // West: Picture Books + Rainbow Dominos + Cushion Mountain + Giant Kids Bed (unobstructed view of Buu!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-8.2, 0.4, 21.2, -Math.PI * 0.72));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_05_west_books_bed.png') });

    // East: Wooden Train Track + Moving Toy Train + Red Springs + Bookshelf Twin Slides (unobstructed view of Buu!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(8.2, 0.4, 21.2, Math.PI * 0.72));
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_06_east_train_slides.png') });

    // Close-up on Bookshelf Deck & Pink/Green Twin Slide Top Entry (verify zero clipping, clean caps & coins!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(23.8, 8.30, 6.2, Math.PI));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_06b_slide_top.png') });

    // Castle Summit + Star 1 (close-up showing clear Power Star with faded beacon & ABC Keep Tower!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-1.2, 10.4, 0.2, Math.PI));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_07_castle_summit.png') });

    // Bowling & Rainbow Domino Plaza wide view facing Twin Slides, Rainbow Dominos & Bowling Pins (unobstructed view of Buu!)
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(18.6, 0.3, -4.8, Math.PI * 0.80));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_08_bowling_plaza.png') });

    // Collect all 3 Main Stars + 3 Secret Stars in World 1
    for (const starId of [1, 2, 3, 4, 5, 6]) {
      await page.evaluate((id) => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(id), starId);
      await page.waitForTimeout(350);
    }
    // Dismiss any reward card and skip rainbow movie if active
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.skipRainbowMovieForTest();
      window.__MANMARUBUU_DEBUG__.completeTutorialAll();
    });
    await page.waitForTimeout(400);

    const w1AfterStars = await page.evaluate(() => {
      const st = window.__MANMARUBUU_DEBUG__.getState();
      return {
        stars: st.snapshot.stars,
        secretStars: st.snapshot.secretStars,
        maxHp: st.snapshot.maxHp,
        rainbowBridgeOpen: st.snapshot.rainbowBridgeOpen,
      };
    });
    console.log('World 1 after collecting 6 stars:', JSON.stringify(w1AfterStars));
    if (
      w1AfterStars.stars !== 3 ||
      w1AfterStars.secretStars !== 3 ||
      w1AfterStars.maxHp !== 4 ||
      !w1AfterStars.rainbowBridgeOpen
    ) {
      throw new Error(`World 1 star progression failed: ${JSON.stringify(w1AfterStars)}`);
    }

    // View 3-Star Gate + Rainbow Bridge + North Boss Stage
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 0.4, -13.5, Math.PI));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_09_gate_bridge_boss.png') });

    // Enter Boss Arena, defeat Clockwork Toy King, and open Victory Chest!
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.teleport(0, 2.4, -33.0, Math.PI);
    });
    await page.waitForTimeout(450);
    const bossEngaged = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getBossDetails().engaged);
    if (!bossEngaged) {
      throw new Error('World 1 boss failed to engage on arena entry!');
    }
    await page.screenshot({ path: path.join(QA_DIR, 'w1_10_boss_fight.png') });

    // Defeat boss (3 hits) and open chest -> Victory screen
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
      await page.waitForTimeout(180);
    }
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.openChestForTest());
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.phase === 'victory',
      undefined,
      { timeout: 6000 }
    );
    // Wait for all 5 staggered result stat-rows (delay 0.54s + dur 0.50s = 1.04s) to finish animating
    await page.waitForTimeout(1350);
    await page.screenshot({ path: path.join(QA_DIR, 'w1_11_victory.png') });

    // Verify World 1 cleared & World 2 untouched in SaveData!
    const saveAfterW1 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
    console.log('Save after W1 clear:', JSON.stringify({
      w1Cleared: saveAfterW1.worlds.world1.cleared,
      w1Stars: saveAfterW1.worlds.world1.collectedStarIds,
      w1Score: saveAfterW1.worlds.world1.highScore,
      w1Rank: saveAfterW1.worlds.world1.bestRank,
      w2Cleared: saveAfterW1.worlds.world2.cleared,
      w2Stars: saveAfterW1.worlds.world2.collectedStarIds,
      w2Score: saveAfterW1.worlds.world2.highScore,
    }));
    if (
      !saveAfterW1.worlds.world1.cleared ||
      saveAfterW1.worlds.world1.collectedStarIds.length !== 6 ||
      saveAfterW1.worlds.world2.cleared ||
      saveAfterW1.worlds.world2.collectedStarIds.length !== 0
    ) {
      throw new Error(`Independent save isolation check failed: ${JSON.stringify(saveAfterW1)}`);
    }

    // 3. Switch to World 2 (Sky Toybox Meadow) via World Select UI button!
    await page.click('[data-role="res-ws-btn"]', { force: true });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(QA_DIR, 'w2_01_world_select_after_w1.png') });

    await page.click('[data-role="select-world-2-btn"]', { force: true });
    await page.waitForTimeout(600);

    const w2Check = await page.evaluate(() => ({
      worldId: window.__MANMARUBUU_DEBUG__.getActiveWorldId(),
      env: window.__MANMARUBUU_DEBUG__.getEnvironmentStats(),
      domino: window.__MANMARUBUU_DEBUG__.getEastDominoStats(),
      playerPos: window.__MANMARUBUU_DEBUG__.getState().playerPos,
    }));
    console.log('World 2 check:', JSON.stringify({
      worldId: w2Check.worldId,
      grassClusters: w2Check.env.grassClusters,
      domino: w2Check.domino,
      playerPos: w2Check.playerPos,
    }));
    if (
      w2Check.worldId !== 'world2' ||
      w2Check.env.grassClusters < 10000 ||
      w2Check.domino.total !== 16 ||
      w2Check.domino.fallen !== 0
    ) {
      throw new Error(`World 2 integrity check failed: ${JSON.stringify(w2Check)}`);
    }

    await page.screenshot({ path: path.join(QA_DIR, 'w2_02_sky_meadow.png') });

    // Collect Star 1 in World 2 and verify World 2 saves independently without altering World 1!
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(1));
    await page.waitForTimeout(450);
    const saveAfterW2Star1 = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
    if (
      !saveAfterW2Star1.worlds.world2.collectedStarIds.includes(1) ||
      saveAfterW2Star1.worlds.world2.collectedStarIds.length !== 1 ||
      saveAfterW2Star1.worlds.world1.collectedStarIds.length !== 6 ||
      !saveAfterW2Star1.worlds.world1.cleared
    ) {
      throw new Error(`World 2 independent save check failed: ${JSON.stringify(saveAfterW2Star1)}`);
    }

    // 4. Backward compatibility check: inject legacy v1 save and reload -> verify world1 preserved & world2 available
    await page.evaluate(() => {
      window.localStorage.removeItem('manmarubuu_save_v2');
      window.localStorage.setItem(
        'manmarubuu_save_v1',
        JSON.stringify({
          version: 1,
          unlockedWorlds: [1],
          world1: {
            cleared: true,
            collectedStarIds: [1, 2, 3],
            stamps: ['clear_w1', 'all_main_stars'],
            highScore: 12345,
            bestRank: 'A',
          },
        })
      );
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
    await page.waitForTimeout(500);
    const migratedSave = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
    if (
      !migratedSave.worlds.world1.cleared ||
      migratedSave.worlds.world1.highScore !== 12345 ||
      migratedSave.worlds.world1.bestRank !== 'A' ||
      !migratedSave.unlockedWorlds.includes(2) ||
      !migratedSave.worlds.world2
    ) {
      throw new Error(`Legacy v1 save migration failed: ${JSON.stringify(migratedSave)}`);
    }

    if (consoleErrors.length > 0 || pageErrors.length > 0 || failedUrls.length > 0) {
      throw new Error(
        `Runtime errors detected! consoleErrors=${JSON.stringify(consoleErrors)} pageErrors=${JSON.stringify(pageErrors)} failedUrls=${JSON.stringify(failedUrls)}`
      );
    }

    console.log('ALL MULTIWORLD PLAYTHROUGH & SAVE CHECKS PASSED!');
  } finally {
    if (browser) await browser.close();
    if (process.platform === 'win32' && server.pid) {
      try {
        execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: 'ignore' });
      } catch {
        server.kill();
      }
    } else {
      server.kill();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

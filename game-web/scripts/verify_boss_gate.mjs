import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 5187;
const URL = `http://127.0.0.1:${PORT}/`;

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
  throw new Error(`Vite dev server did not start in time. Logs:\n${getLogs()}`);
}

async function waitReady(page) {
  await page.waitForFunction(() => Boolean(window.__MANMARUBUU_DEBUG__), { timeout: 30000 });
  await page.waitForTimeout(500);
}

async function assertNoBossFight(page, label) {
  const data = await page.evaluate(() => ({
    state: window.__MANMARUBUU_DEBUG__.getState(),
    boss: window.__MANMARUBUU_DEBUG__.getBossDetails(),
    bgm: window.__MANMARUBUU_DEBUG__.getBgmState(),
    env: window.__MANMARUBUU_DEBUG__.getEnvironmentStats(),
    hudHidden: document.querySelector('[data-role="boss-hud"]')?.classList.contains('hidden') ?? false,
  }));
  assert(data.boss.engaged === false, `${label}: boss.engaged must be false, got ${JSON.stringify(data.boss)}`);
  assert(data.boss.state === 'dormant', `${label}: boss.state must be dormant, got ${data.boss.state}`);
  assert(data.state.snapshot.bossActive === false, `${label}: snapshot.bossActive must be false`);
  assert(data.bgm.desiredBgm !== 'boss', `${label}: desiredBgm must not be boss, got ${data.bgm.desiredBgm}`);
  assert(data.env.bossMood < 0.05, `${label}: bossMood must stay near 0, got ${data.env.bossMood}`);
  assert(data.hudHidden === true, `${label}: boss-hud must stay hidden`);
  return data;
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
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
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

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    attachListeners(page);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(page);

    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.startGame();
      window.__MANMARUBUU_DEBUG__.completeTutorialAll();
    });
    await page.waitForTimeout(200);

    // =========================================================================
    // Scenario 1: 0 Gold Stars -> Bowling NE hotspot, Gate barrier, Arena barrier, Forced teleport
    // =========================================================================
    // 1a. Bowling NE hotspot where old AABB overlap triggered boss fight
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-15, 3.8, -38, Math.PI));
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    const s1a = await assertNoBossFight(page, 'Scenario 1a (0 stars, Bowling NE -15,-38)');
    assert(s1a.boss.physicallyLocked === true, 'Scenario 1a: boss arena must be physically locked');
    assert(s1a.boss.arenaUnlocked === false, 'Scenario 1a: arenaUnlocked must be false');
    assert(s1a.boss.mainStarsCollected === 0, 'Scenario 1a: mainStarsCollected must be 0');

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-13.5, 4.5, -39, Math.PI));
    await page.waitForTimeout(350);
    await assertNoBossFight(page, 'Scenario 1a-2 (0 stars, Bowling NE -13.5,-39)');

    // 1b. 3-Star Gate physical barrier blocks walking through with 0 stars
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 1.4, -11.5, Math.PI));
    await page.waitForTimeout(150);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    const afterGateRush = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      afterGateRush.playerPos[2] > -13.2,
      `Scenario 1b: player should be blocked at 3-Star Gate (z > -13.2), got z=${afterGateRush.playerPos[2]}`
    );
    await assertNoBossFight(page, 'Scenario 1b (0 stars, 3-Star Gate rush)');

    // 1c. Boss Arena perimeter barrier blocks rushing / jumping in from outside south entrance
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.5, -31.8, Math.PI));
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 8; i++) {
      if (i === 1) await page.keyboard.press('Space');
      await page.waitForTimeout(110);
      const st = await page.evaluate(() => ({
        pos: window.__MANMARUBUU_DEBUG__.getState().playerPos,
        boss: window.__MANMARUBUU_DEBUG__.getBossDetails(),
      }));
      const dist = Math.hypot(st.pos[0], st.pos[2] + 52);
      assert(
        dist >= 17.6,
        `Scenario 1c: player breached Boss Arena perimeter barrier (dist=${dist.toFixed(2)} < 17.6, pos=${JSON.stringify(st.pos)})`
      );
      assert(st.boss.engaged === false, 'Scenario 1c: boss must not engage during perimeter rush');
    }
    await page.keyboard.up('KeyW');

    // 1d. Even forced direct teleport inside arena must NOT trigger boss fight with 0 stars
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI));
    await page.waitForTimeout(500);
    await assertNoBossFight(page, 'Scenario 1d (0 stars, forced teleport inside arena)');

    console.log('SCENARIO_1_ZERO_STARS_PASS');

    // =========================================================================
    // Scenario 2: 2 Gold Stars + 3 Secret Stars (5 total, < 3 gold) -> still locked & no boss fight
    // =========================================================================
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 1.4, 10.0, Math.PI));
    await page.waitForTimeout(150);

    for (const [starId, field, target] of [
      [1, 'stars', 1],
      [2, 'stars', 2],
      [4, 'secretStars', 1],
      [5, 'secretStars', 2],
      [6, 'secretStars', 3],
    ]) {
      await page.evaluate((id) => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(id), starId);
      await page.waitForFunction(
        ({ f, t }) => (window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.[f] ?? 0) >= t,
        { f: field, t: target },
        { timeout: 6000 }
      );
    }

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-15, 3.8, -38, Math.PI));
    await page.waitForTimeout(350);
    const s2a = await assertNoBossFight(page, 'Scenario 2a (2 gold + 3 secret, Bowling NE)');
    assert(s2a.state.snapshot.stars === 2, `Expected 2 gold stars, got ${s2a.state.snapshot.stars}`);
    assert(s2a.state.snapshot.secretStars === 3, `Expected 3 secret stars, got ${s2a.state.snapshot.secretStars}`);
    assert(s2a.state.snapshot.rainbowBridgeOpen === false, 'Rainbow bridge must remain closed with 2 gold stars');
    assert(s2a.boss.physicallyLocked === true, 'Boss arena must stay physically locked with 2 gold stars');

    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -41.0, Math.PI));
    await page.waitForTimeout(450);
    await assertNoBossFight(page, 'Scenario 2b (2 gold + 3 secret, forced teleport inside arena)');

    console.log('SCENARIO_2_TWO_GOLD_THREE_SECRET_PASS');

    // =========================================================================
    // Scenario 3: Inconsistent SaveData normalization (rainbowBridgeOpen/bossDefeated without 3 gold stars)
    // =========================================================================
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('manmarubuu_save_v2') || '{}');
      raw.tutorialCompleted = true;
      raw.worlds = raw.worlds || {};
      raw.worlds.world1 = raw.worlds.world1 || {};
      raw.worlds.world1.collectedStarIds = [1, 2];
      raw.worlds.world1.run = {
        active: true,
        checkpoint: { x: 0, y: 1.2, z: -11.0, yaw: Math.PI },
        activatedCheckpointIndices: [0, 3],
        collectedStarIds: [1, 2],
        star3Unlocked: false,
        rainbowBridgeOpen: true,
        bossDefeated: true,
        coins: 12,
        score: 1200,
        hp: 3,
        feverMeter: 0,
        damageTakenCount: 0,
        elapsedSec: 30,
        updatedAt: Date.now(),
      };
      localStorage.setItem('manmarubuu_save_v2', JSON.stringify(raw));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(page);
    await page.click('[data-role="play-btn"]', { force: true });
    await page.waitForTimeout(350);

    const normalizedSave = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getSaveData());
    const runState = normalizedSave.worlds.world1.run;
    assert(runState.rainbowBridgeOpen === false, 'SaveStore must strip rainbowBridgeOpen when < 3 gold stars');
    assert(runState.bossDefeated === false, 'SaveStore must strip bossDefeated when < 3 gold stars');
    const s3 = await assertNoBossFight(page, 'Scenario 3 (corrupted save reload)');
    assert(s3.state.snapshot.rainbowBridgeOpen === false, 'Restored snapshot must keep rainbowBridgeOpen false');
    assert(s3.boss.physicallyLocked === true, 'Restored run with 2 gold stars must keep arena physically locked');
    assert(s3.boss.defeated === false, 'Restored run with 2 gold stars must not mark boss defeated');

    console.log('SCENARIO_3_SAVE_NORMALIZATION_PASS');

    // =========================================================================
    // Scenario 4: Legitimate 3 Gold Stars -> Rainbow Bridge -> Boss Fight -> Victory
    // =========================================================================
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.unlockAndCollectStar(3));
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getRainbowMovieState()?.active === true,
      undefined,
      { timeout: 8000 }
    );
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getRainbowMovieState()?.canSkip === true,
      undefined,
      { timeout: 6000 }
    );
    await page.click('[data-role="rainbow-skip-btn"]', { force: true });
    await page.waitForTimeout(250);

    const afterUnlock = await page.evaluate(() => ({
      state: window.__MANMARUBUU_DEBUG__.getState(),
      boss: window.__MANMARUBUU_DEBUG__.getBossDetails(),
    }));
    assert(afterUnlock.state.snapshot.stars === 3, 'Scenario 4: expected 3 gold stars');
    assert(afterUnlock.state.snapshot.rainbowBridgeOpen === true, 'Scenario 4: expected rainbowBridgeOpen true');
    assert(afterUnlock.boss.physicallyLocked === false, 'Scenario 4: expected physicallyLocked false');
    assert(afterUnlock.boss.arenaUnlocked === true, 'Scenario 4: expected arenaUnlocked true');

    // Even with 3 stars unlocked, Bowling NE must NOT trigger boss fight or dusk mood
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(-15, 3.8, -38, Math.PI));
    await page.waitForTimeout(450);
    await assertNoBossFight(page, 'Scenario 4a (3 stars, Bowling NE)');

    // Walk cleanly through the opened 3-Star Gate onto the Rainbow Bridge
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 1.4, -11.5, Math.PI));
    await page.waitForTimeout(150);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');
    const onBridgeState = await page.evaluate(() => window.__MANMARUBUU_DEBUG__.getState());
    assert(
      onBridgeState.playerPos[2] < -15.0,
      `Scenario 4b: player should walk through opened gate onto bridge, got z=${onBridgeState.playerPos[2]}`
    );

    // At bridge exit (0, 4.2, -36.5), dusk mood converges while boss is still dormant until stepping inside
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.teleport(0, 4.2, -36.5, Math.PI));
    await page.waitForTimeout(1500);
    const bridgeExitStats = await page.evaluate(() => ({
      env: window.__MANMARUBUU_DEBUG__.getEnvironmentStats(),
      boss: window.__MANMARUBUU_DEBUG__.getBossDetails(),
    }));
    assert(
      bridgeExitStats.env.bossMood > 0.85,
      `Scenario 4c: expected bossMood > 0.85 at bridge exit, got ${bridgeExitStats.env.bossMood}`
    );
    assert(
      bridgeExitStats.boss.engaged === false,
      'Scenario 4c: boss should wait until stepping past z < -36.6 into arena'
    );

    // Step inside Boss Arena -> Boss fight starts normally!
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getBossDetails()?.engaged === true,
      undefined,
      { timeout: 6000 }
    );
    await page.keyboard.up('KeyW');

    const fightActive = await page.evaluate(() => ({
      state: window.__MANMARUBUU_DEBUG__.getState(),
      boss: window.__MANMARUBUU_DEBUG__.getBossDetails(),
      bgm: window.__MANMARUBUU_DEBUG__.getBgmState(),
      hudHidden: document.querySelector('[data-role="boss-hud"]')?.classList.contains('hidden') ?? true,
    }));
    assert(fightActive.boss.engaged === true, 'Scenario 4d: boss.engaged must be true');
    assert(fightActive.boss.state !== 'dormant', `Scenario 4d: boss.state must be active, got ${fightActive.boss.state}`);
    assert(fightActive.state.snapshot.bossActive === true, 'Scenario 4d: snapshot.bossActive must be true');
    assert(fightActive.bgm.desiredBgm === 'boss', `Scenario 4d: desiredBgm must be boss, got ${fightActive.bgm.desiredBgm}`);
    assert(fightActive.hudHidden === false, 'Scenario 4d: boss-hud must be visible');

    // Defeat Boss across 3 phases & open Victory Chest -> Victory
    await page.evaluate(() => {
      window.__MANMARUBUU_DEBUG__.triggerBossStunForTest();
      window.__MANMARUBUU_DEBUG__.hitBossWeakForTest();
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.hitBossWeakForTest());
    await page.waitForTimeout(2800);
    await page.evaluate(() => window.__MANMARUBUU_DEBUG__.openChestForTest());

    await page.waitForFunction(
      () => window.__MANMARUBUU_DEBUG__?.getState()?.snapshot?.phase === 'victory',
      undefined,
      { timeout: 10000 }
    );

    await context.close();
    assert(consoleErrors.length === 0, `Console errors detected: ${consoleErrors.join('\n')}`);
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join('\n')}`);
    assert(failedUrls.length === 0, `Failed HTTP responses: ${failedUrls.join('\n')}`);
    console.log('BOSS_GATE_VERIFICATION_OK');
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
    console.error('BOSS GATE VERIFICATION FAILED:', err);
    process.exit(1);
  });

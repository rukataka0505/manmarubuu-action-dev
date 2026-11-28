import * as THREE from 'three';
import './ui/styles.css';

import { GameEngine } from './core/GameEngine';
import { PhysicsWorld } from './core/PhysicsWorld';
import { InputManager } from './core/InputManager';
import { CameraController } from './core/CameraController';
import { FaceWipeRenderer } from './core/FaceWipeRenderer';
import { SettingsStore, resolveFaceWipe3d } from './core/SettingsStore';
import { SaveStore } from './core/SaveStore';
import { SoundEngine } from './audio/SoundEngine';
import { ManmarubuuView } from './character/ManmarubuuView';
import { ManmarubuuController } from './character/ManmarubuuController';
import { EXPRESSION_LABELS_JA } from './character/ExpressionLogic';
import { SkyboxAndLighting } from './world/SkyboxAndLighting';
import { ToyBlocksManager } from './world/ToyBlocksManager';
import { CollectiblesManager } from './world/Collectibles';
import { GimmicksManager } from './world/Gimmicks';
import { World1Builder, type WorldBuildResult } from './world/World1Builder';
import { World1PlayroomBuilder } from './world/World1PlayroomBuilder';
import { getWorldConfig, isValidWorldId, type WorldConfig } from './world/WorldConfig';
import { WorldPropsManager } from './world/WorldPropsManager';
import { CraftTerrainBuilder } from './world/CraftTerrainBuilder';
import { StylizedGrassField } from './world/StylizedGrassField';
import { PbrAssets } from './assets/PbrAssets';
import { getProceduralTextures, setProceduralAnisotropy } from './assets/ProceduralTextures';
import { ModelSwapLoader } from './assets/ModelSwapLoader';
import { JellySlime } from './entities/JellySlime';
import { WindupTank } from './entities/WindupTank';
import { PropellerBalloon } from './entities/PropellerBalloon';
import { ClockworkToyKing } from './entities/ClockworkToyKing';
import { VfxManager } from './vfx/VfxManager';
import { FloatingCallouts } from './vfx/FloatingCallouts';
import { TutorialMarker3D } from './vfx/TutorialMarker3D';
import { TutorialManager } from './gameplay/TutorialManager';
import { FeverManager } from './gameplay/FeverManager';
import { HudManager } from './ui/HudManager';
import { ScreensManager } from './ui/Screens';
import { TouchControls } from './ui/TouchControls';
import { preloadBuuFaceSprites } from './ui/BuuFaceSprite';
import { initPwaInstallCapture } from './ui/PwaInstallPrompt';
import type {
  AnimName,
  ExpressionName,
  GamePhase,
  GameSettings,
  HudSnapshot,
  RewardCardInfo,
  NavTargetInfo,
  ResolvedQuality,
  SaveData,
  StampId,
  StarInfo,
  WorldId,
} from './types';

const CHECKPOINT_GUIDE_SEEN_KEY = 'manmarubuu_checkpoint_guide_seen_v1';
const RUN_BONUS_HP_KEY = 'manmarubuu_run_bonus_hp_v1';

interface RunBonusHpSidecar {
  maxHp: number;
  hp: number;
  updatedAt: number;
}

function bonusHpKeyForWorld(worldId: WorldId): string {
  return `${RUN_BONUS_HP_KEY}_${worldId}`;
}

function readCheckpointGuideSeen(): boolean {
  try {
    return window.localStorage.getItem(CHECKPOINT_GUIDE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCheckpointGuideSeen(seen: boolean): void {
  try {
    if (seen) {
      window.localStorage.setItem(CHECKPOINT_GUIDE_SEEN_KEY, '1');
    } else {
      window.localStorage.removeItem(CHECKPOINT_GUIDE_SEEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function readRunBonusHpSidecar(worldId: WorldId): RunBonusHpSidecar | null {
  try {
    const raw =
      window.localStorage.getItem(bonusHpKeyForWorld(worldId)) ??
      (worldId === 'world1' ? window.localStorage.getItem(RUN_BONUS_HP_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunBonusHpSidecar>;
    if (
      typeof parsed.maxHp === 'number' &&
      Number.isFinite(parsed.maxHp) &&
      typeof parsed.hp === 'number' &&
      Number.isFinite(parsed.hp) &&
      typeof parsed.updatedAt === 'number' &&
      Number.isFinite(parsed.updatedAt)
    ) {
      return {
        maxHp: Math.max(3, Math.min(4, Math.floor(parsed.maxHp))),
        hp: Math.max(1, Math.min(4, Math.floor(parsed.hp))),
        updatedAt: parsed.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRunBonusHpSidecar(
  worldId: WorldId,
  maxHp: number,
  hp: number,
  updatedAt: number
): void {
  try {
    const payload: RunBonusHpSidecar = {
      maxHp: Math.max(3, Math.min(4, Math.floor(maxHp))),
      hp: Math.max(1, Math.min(4, Math.floor(hp))),
      updatedAt,
    };
    window.localStorage.setItem(bonusHpKeyForWorld(worldId), JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

function clearRunBonusHpSidecar(worldId?: WorldId): void {
  try {
    if (worldId) {
      window.localStorage.removeItem(bonusHpKeyForWorld(worldId));
      if (worldId === 'world1') {
        window.localStorage.removeItem(RUN_BONUS_HP_KEY);
      }
    } else {
      window.localStorage.removeItem(RUN_BONUS_HP_KEY);
      window.localStorage.removeItem(bonusHpKeyForWorld('world1'));
      window.localStorage.removeItem(bonusHpKeyForWorld('world2'));
    }
  } catch {
    // Ignore storage errors
  }
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  const isMobileUa =
    /iPhone|iPad|iPod|Android|Mobile|Tablet|Windows Phone|Silk|Kindle|PlayBook/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  if (isMobileUa) return true;
  if (typeof window.matchMedia === 'function') {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const hover = window.matchMedia('(hover: hover)').matches;
    if (coarse && !hover) return true;
  }
  return false;
}

function isMobilePortraitBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth && isMobileDevice();
}

type BootLoaderState = 'loading' | 'awaiting_tap' | 'done';
let bootLoaderState: BootLoaderState = 'loading';
let bootLoaderDone = false;

interface BootGuardApi {
  markStarted?: () => void;
  markProgress?: (stage?: string) => void;
  markReady?: () => void;
  showError?: (message: string, detail?: string) => void;
}

function getBootGuard(): BootGuardApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __MANMARUBUU_BOOT_GUARD__?: BootGuardApi })
    .__MANMARUBUU_BOOT_GUARD__;
}

function formatBootErrorDetail(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

function showBootError(message: string, err?: unknown): void {
  const detail = formatBootErrorDetail(err);
  const guard = getBootGuard();
  if (guard?.showError) {
    guard.showError(message, detail);
    return;
  }
  const loaderEl = document.getElementById('boot-loader');
  const statusEl = document.getElementById('boot-loader-status');
  const detailEl = document.getElementById('boot-loader-detail');
  const actionsEl = document.getElementById('boot-loader-actions');
  if (loaderEl) {
    loaderEl.classList.remove('is-stalled');
    loaderEl.classList.add('is-error');
    loaderEl.dataset.state = 'error';
  }
  if (statusEl) {
    statusEl.textContent = message;
  }
  if (detailEl) {
    detailEl.textContent = detail;
    if (detail) detailEl.removeAttribute('hidden');
    else detailEl.setAttribute('hidden', '');
  }
  if (actionsEl) {
    actionsEl.removeAttribute('hidden');
  }
}

function updateBootLoader(percent: number, statusText?: string): void {
  if (bootLoaderState !== 'loading') return;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const fillEl = document.getElementById('boot-loader-fill');
  const pctEl = document.getElementById('boot-loader-pct');
  const statusEl = document.getElementById('boot-loader-status');
  if (fillEl) fillEl.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${clamped}%`;
  if (statusText && statusEl) statusEl.textContent = statusText;
  getBootGuard()?.markProgress?.(statusText ?? `${clamped}%`);
}

function dismissBootLoaderEl(): void {
  const loaderEl = document.getElementById('boot-loader');
  if (!loaderEl) return;
  loaderEl.classList.remove('is-ready', 'is-pressing', 'is-stalled', 'is-error');
  loaderEl.classList.add('is-done');
  loaderEl.dataset.state = 'done';
  window.setTimeout(() => {
    loaderEl.remove();
  }, 520);
}

function finishBootLoaderImmediate(): void {
  if (bootLoaderState === 'done') return;
  updateBootLoader(100, 'じゅんび かんりょう！');
  bootLoaderState = 'done';
  bootLoaderDone = true;
  getBootGuard()?.markReady?.();
  dismissBootLoaderEl();
}

function enterBootLoaderTapWait(onStartTap: () => void, onEarlyUnlock: () => void): void {
  if (bootLoaderState !== 'loading') return;
  updateBootLoader(100, 'じゅんび かんりょう！');
  bootLoaderState = 'awaiting_tap';
  getBootGuard()?.markReady?.();

  const loaderEl = document.getElementById('boot-loader');
  if (!loaderEl) {
    bootLoaderState = 'done';
    bootLoaderDone = true;
    try {
      onStartTap();
    } catch (err) {
      console.error('Boot tap start error:', err);
    }
    return;
  }

  loaderEl.classList.add('is-ready');
  loaderEl.dataset.state = 'awaiting-tap';
  loaderEl.setAttribute('role', 'button');
  loaderEl.setAttribute('tabindex', '0');
  loaderEl.setAttribute('aria-label', '画面をタップしてスタート！');
  const tapEl = document.getElementById('boot-loader-tap');
  if (tapEl) {
    tapEl.setAttribute('aria-hidden', 'false');
  }

  let triggered = false;
  const cleanup = (): void => {
    loaderEl.removeEventListener('pointerdown', onPointerDown);
    loaderEl.removeEventListener('pointerup', onPointerEnd);
    loaderEl.removeEventListener('pointercancel', onPointerEnd);
    loaderEl.removeEventListener('touchend', onTouchEnd);
    loaderEl.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown, { capture: true });
  };

  const triggerStart = (): void => {
    if (triggered || bootLoaderState !== 'awaiting_tap') return;
    triggered = true;
    cleanup();
    bootLoaderState = 'done';
    bootLoaderDone = true;
    try {
      onStartTap();
    } catch (err) {
      console.error('Boot tap start error:', err);
    } finally {
      dismissBootLoaderEl();
    }
  };

  const onPointerDown = (): void => {
    if (bootLoaderState !== 'awaiting_tap') return;
    try {
      onEarlyUnlock();
    } catch {
      // Ignore early audio unlock errors
    }
    loaderEl.classList.add('is-pressing');
  };

  const onPointerEnd = (): void => {
    loaderEl.classList.remove('is-pressing');
  };

  const onTouchEnd = (e: TouchEvent): void => {
    if (bootLoaderState !== 'awaiting_tap') return;
    e.preventDefault();
    e.stopPropagation();
    triggerStart();
  };

  const onClick = (e: MouseEvent): void => {
    if (bootLoaderState !== 'awaiting_tap') return;
    e.preventDefault();
    e.stopPropagation();
    triggerStart();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (bootLoaderState !== 'awaiting_tap') return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerStart();
    }
  };

  loaderEl.addEventListener('pointerdown', onPointerDown, { passive: true });
  loaderEl.addEventListener('pointerup', onPointerEnd, { passive: true });
  loaderEl.addEventListener('pointercancel', onPointerEnd, { passive: true });
  loaderEl.addEventListener('touchend', onTouchEnd, { passive: false });
  loaderEl.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown, { capture: true });
}

function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) {
    return;
  }
  const doRegister = (): void => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  };
  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
  }
}

getBootGuard()?.markStarted?.();
initPwaInstallCapture();

async function bootstrap(): Promise<void> {
  preloadBuuFaceSprites();
  updateBootLoader(10, 'おもちゃばこを じゅんびちゅう…');
  registerServiceWorker();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const hudRoot = document.getElementById('hud-root') as HTMLElement;

  const settingsStore = new SettingsStore();
  const saveStore = new SaveStore();
  let currentSettings: GameSettings = settingsStore.get();
  let resolvedQuality: ResolvedQuality = settingsStore.getResolvedQuality();
  let faceWipe3dActive = resolveFaceWipe3d(currentSettings.faceWipe3d, resolvedQuality);
  let currentSaveData: SaveData = saveStore.get();
  const isMobileBoot = isMobileDevice();
  let bootTapPending = isMobileBoot;

  const engine = new GameEngine(canvas, resolvedQuality);
  updateBootLoader(15, 'ぶつりエンジンを じゅんびちゅう…');
  const physics = new PhysicsWorld();
  await physics.init();
  updateBootLoader(24, 'ぬの＆つみき素材を よみこみちゅう…');
  const sound = new SoundEngine();
  sound.setMuted(!currentSettings.soundEnabled);
  const input = new InputManager(canvas);
  const unlockOnce = (): void => {
    sound.unlock();
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });
  const cameraCtrl = new CameraController();
  const skybox = new SkyboxAndLighting(engine.scene, resolvedQuality);
  const vfx = new VfxManager(engine.scene);
  const callouts = new FloatingCallouts();
  const tutorialMarker = new TutorialMarker3D(engine.scene);

  const useMobileLods = resolvedQuality === 'low';
  const pbr = new PbrAssets();
  await pbr.load(useMobileLods);
  updateBootLoader(38, '3Dモデルを よびだしちゅう…');
  getProceduralTextures(useMobileLods);

  type AnyWorldBuilder = World1PlayroomBuilder | World1Builder;
  const resolveInitialWorldId = (): WorldId => {
    try {
      const q = new URLSearchParams(window.location.search).get('world');
      if (isValidWorldId(q)) return q;
    } catch {
      // Ignore URL parse errors
    }
    if (isValidWorldId(currentSaveData.lastPlayedWorldId)) {
      return currentSaveData.lastPlayedWorldId;
    }
    return 'world1';
  };
  let activeWorldId: WorldId = resolveInitialWorldId();
  let activeWorldConfig: WorldConfig = getWorldConfig(activeWorldId);

  let blocks = new ToyBlocksManager(engine.scene, pbr);
  let collectibles = new CollectiblesManager(engine.scene);
  let gimmicks = new GimmicksManager(engine.scene, pbr);
  let terrain = new CraftTerrainBuilder(engine.scene, pbr, useMobileLods);
  let grassField = new StylizedGrassField(engine.scene);
  const worldProps = new WorldPropsManager(engine.scene);
  let builder: AnyWorldBuilder =
    activeWorldId === 'world1'
      ? new World1PlayroomBuilder(engine.scene, pbr)
      : new World1Builder(engine.scene, pbr);

  // Load Model Swap Manifest, Hero 3D Model, Boss 3D Model, Day/Dusk HDRI & Custom DIY Diorama Kit
  const modelSwap = new ModelSwapLoader();
  await modelSwap.init(useMobileLods);
  updateBootLoader(46, '3Dキャラクター＆せかいを よみこみちゅう…');
  const buuView = new ManmarubuuView();
  const boss = new ClockworkToyKing(engine.scene);
  let assetProgress = 46;
  const trackAsset = <T,>(promise: Promise<T>): Promise<T> =>
    promise.then((res) => {
      assetProgress = Math.min(82, assetProgress + 9);
      updateBootLoader(assetProgress, '3Dキャラクター＆せかいを よみこみちゅう…');
      return res;
    });
  await Promise.all([
    trackAsset(
      buuView.load(
        useMobileLods
          ? './models/mobile/manmarubuu_animated_mobile.glb'
          : './models/manmarubuu_animated.glb'
      )
    ),
    trackAsset(boss.load(modelSwap.resolveModelUrl(modelSwap.manifest.boss))),
    trackAsset(engine.loadEnvironmentHdri(useMobileLods)),
    trackAsset(worldProps.load(pbr, useMobileLods)),
  ]);
  engine.scene.add(buuView.root);
  if (bootTapPending) {
    // モバイルはタップ完了まで BGM を鳴らさず、外部音声プリロードのみ先行実行する
    sound.init();
  } else {
    sound.setBgmMode('title');
  }

  const faceWipe = new FaceWipeRenderer();
  faceWipe.setAvatarSource(buuView);

  let loadingPbrPromise: Promise<void> | null = null;
  const applySettings = (s: GameSettings, rq: ResolvedQuality): void => {
    currentSettings = s;
    resolvedQuality = rq;
    faceWipe3dActive = resolveFaceWipe3d(s.faceWipe3d, rq);
    const texAniso = rq === 'low' ? 1 : 8;
    pbr.setAnisotropy(texAniso);
    setProceduralAnisotropy(texAniso);
    skybox.setShadowQuality(rq);
    engine.applyQuality(rq);
    grassField.setQuality(rq);
    terrain.setQuality(rq);
    worldProps.setQuality(rq);
    builder.setQuality(rq);
    faceWipe.setQuality(rq);
    faceWipe.invalidateRect();
    document.body.classList.toggle('quality-low', rq === 'low');
    cameraCtrl.setAutoFollow(s.cameraAutoFollow);
    input.setCameraSensitivity(s.cameraSensitivity);
    sound.setMuted(!s.soundEnabled);

    if (rq !== 'low' && !pbr.isLoaded() && !loadingPbrPromise) {
      loadingPbrPromise = pbr
        .ensureLoaded()
        .then(() => {
          worldProps.refreshPbrMaps();
          terrain.refreshPbrMaps();
          engine.applyQuality(resolvedQuality);
        })
        .finally(() => {
          loadingPbrPromise = null;
        });
    }
  };
  applySettings(currentSettings, resolvedQuality);
  settingsStore.subscribe(applySettings);
  window.addEventListener('resize', () => {
    if (settingsStore.get().quality === 'auto') {
      const rq = settingsStore.getResolvedQuality();
      if (rq !== resolvedQuality) {
        applySettings(currentSettings, rq);
      }
    }
  });

  const tutorial = new TutorialManager();
  const fever = new FeverManager();

  // Game metrics & state
  let phase: GamePhase = 'title';
  let score = 0;
  let coinsCollected = 0;
  let coinStreak = 0;
  let coinStreakTimer = 0;
  let elapsedPlaySec = 0;
  let slowMoTimer = 0;
  let feverBannerTimer = 0;
  let feverActivatedThisFrame = false;
  let welcomeMovieActive = false;
  let welcomeMovieElapsed = 0;
  let welcomeMoviePlayed = false;
  const WELCOME_DURATION = 4.6;
  const WELCOME_SKIP_GUARD = 0.30;

  let starCutsceneTimer = 0;
  // 青いひみつスターのお知らせカード（出るまでの待ち → 表示中はゲームを止めて、ボタンで閉じる）
  let pendingRewardCard: { info: RewardCardInfo; delay: number } | null = null;
  let rewardCard: RewardCardInfo | null = null;
  let rewardCardElapsed = 0;
  const REWARD_CARD_GUARD = 0.8;
  function closeRewardCard(): void {
    if (!rewardCard || rewardCardElapsed < REWARD_CARD_GUARD) return;
    const wasComplete = rewardCard.kind === 'secretComplete';
    rewardCard = null;
    sound.playUiClick();
    if (wasComplete) {
      hud.pulseMaxHpUp();
      sound.playHeal();
      callouts.spawnScreen(150, 90, '最大♡ 4つに！', 'fever', undefined, 1.8);
    }
  }
  let rainbowMovieActive = false;
  let rainbowMovieElapsed = 0;
  let rainbowMovieLitStep = 0;
  let rainbowMovieBridgeTriggered = false;
  let rainbowMovieAct: 0 | 1 | 2 | 3 = 0;
  let rainbowMovieTitle = '';
  let rainbowMovieSubtitle = '';
  const RAINBOW_MOVIE_DURATION = 6.8;
  const RAINBOW_SKIP_GUARD = 0.35;

  let autosaveToastTimer = 0;
  let resumedFromSaveNoticePending = false;
  let checkpointGuideShown = readCheckpointGuideSeen();
  const tmpCamFwd = new THREE.Vector3();
  const tmpShadowRayOrigin = new THREE.Vector3();
  let bossEngaged = false;
  let bossDefeated = false;
  let bossDamageTaken = 0;
  let gateLockedBannerCooldown = 0;
  let victoryDelayTimer = 0;
  let star3Unlocked = false;
  let tanksDefeatedCount = 0;
  let gameOverPenaltyCoins = 0;
  let gameOverPenaltyScore = 0;
  let wasInBossFight = false;
  let newlyEarnedStamps: StampId[] = [];
  let runStamps: StampId[] = [];
  let isNewHighScore = false;
  let clearRecorded = false;
  let lastTouchActive = false;

  let fpsAccum = 0;
  let fpsFrames = 0;
  let currentFps = 60;
  let inspectedExpression: ExpressionName | null = null;

  const spawnPos = new THREE.Vector3(...activeWorldConfig.spawnPos);
  let secretCrateId: number | null = null;
  const dynamicHitCooldown = new Map<number, number>();
  let worldEntities: WorldBuildResult = {
    slimes: [],
    tanks: [],
    balloons: [],
    clockworkGears: [],
    secretCrateId: null,
    tutorialCoinPos: new THREE.Vector3(0, 0.2, 22),
    tutorialCratePos: new THREE.Vector3(0, 0.5, 11),
  };

  const player = new ManmarubuuController(buuView, sound, {
    onHipDropImpact: (pos) => {
      engine.triggerHitStop(0.085);
      cameraCtrl.triggerShake(0.65, 0.28, new THREE.Vector3(0, 1, 0));
      input.rumble(240, 0.85, 0.9);
      vfx.spawnShockwaveRing(pos, 6.4, 0xffe454, 0.42);
      vfx.spawnStarBurst(pos, 14, 7.0);
      vfx.spawnCottonDust(pos, 8);

      const smashed = physics.applyRadialSmash(pos, 5.6, 15.0, true);
      if (smashed.length > 0) {
        callouts.spawnWorld(pos, engine.camera, 'SMASH!', 'smash', `+${smashed.length * 50}`);
        score += smashed.length * 50 * fever.getScoreMultiplier();
        addTutorialAwareFeverCharge(smashed.length * 4);
      }

      // Smash nearby ground enemies
      for (const s of worldEntities.slimes) {
        if (s.alive && s.pos.distanceTo(pos) < 5.5) {
          s.defeat(s.pos.clone().sub(pos));
          onEnemyDefeated(s.pos, 150, 'SUPER!');
        }
      }
      for (const tk of worldEntities.tanks) {
        if (tk.alive && tk.pos.distanceTo(pos) < 5.5) {
          tk.defeat(tk.pos.clone().sub(pos));
          tanksDefeatedCount++;
          onEnemyDefeated(tk.pos, 250, 'SMASH!');
        }
      }

      // Check boss weak point hit from shockwave if close
      if (bossEngaged && boss.isWeakPointExposed()) {
        const wp = boss.getWeakPointWorldPos();
        if (Math.hypot(pos.x - wp.x, pos.z - wp.z) < 3.4 && Math.abs(pos.y - wp.y) < 3.0) {
          boss.hitWeakPoint(onBossWeakHit);
        }
      }
    },
    onJumpParticle: (pos, isDouble) => {
      vfx.spawnCottonDust(pos, isDouble ? 6 : 4);
      if (isDouble) vfx.spawnStarBurst(pos, 6, 3.6);
    },
    onLandParticle: (pos, heavy) => {
      vfx.spawnCottonDust(pos, heavy ? 8 : 3);
    },
    onDashDust: (pos) => {
      vfx.spawnCottonDust(pos, 2);
    },
    onDamageTaken: (pos) => {
      if (bossEngaged && !bossDefeated) {
        bossDamageTaken += 1;
      }
      engine.triggerHitStop(0.065);
      cameraCtrl.triggerShake(0.55, 0.25);
      input.rumble(260, 0.9, 0.9);
      vfx.spawnStarBurst(pos, 8, 5.0);
      callouts.spawnWorld(pos, engine.camera, 'Ouch!', 'hit');
    },
    onFellOut: (pos, remainingHp) => {
      vfx.spawnCottonDust(pos, 10);
      tutorial.showTempBanner(
        `コースから落ちちゃった！ のこりハート ${remainingHp}（安全な場所へ戻ったよ）`,
        2.6
      );
    },
    onGameOver: (_cause) => {
      phase = 'gameover';
      feverBannerTimer = 0;
      wasInBossFight = bossEngaged && !bossDefeated;
      gameOverPenaltyCoins = Math.floor(coinsCollected / 2);
      coinsCollected = Math.max(0, coinsCollected - gameOverPenaltyCoins);
      gameOverPenaltyScore = Math.min(
        score,
        Math.max(score > 0 ? 200 : 0, Math.floor(score * 0.15))
      );
      score = Math.max(0, score - gameOverPenaltyScore);
      cameraCtrl.clearCinematic();
      player.isCutsceneStar = false;
      starCutsceneTimer = 0;
      rainbowMovieActive = false;
      rainbowMovieAct = 0;
      player.bossIntroPienTimer = 0;
      input.exitPointerLock();
      input.clearTouchState();
      sound.playGameOver();
      sound.setBgmMode('none');
      if (tutorial.step === 'done' || currentSaveData.tutorialCompleted) {
        autoSaveRun(false, { overrideHp: player.maxHp });
      }
    },
    onDynamicHit: (rec, speed) => {
      if (rec.broken) return;
      if (rec.kind === 'crate' || rec.kind === 'block') {
        if (tutorial.step !== 'done' && blocks.tutorialCrateIds.has(rec.id)) {
          return;
        }
        if (fever.active || speed >= 7.5) {
          rec.broken = true;
          const t = rec.body.translation();
          const p = new THREE.Vector3(t.x, t.y, t.z);
          if (rec.onBreak) {
            rec.onBreak(p, rec.kind);
          } else {
            onPropBroken(p, rec.kind, rec.id);
          }
          physics.removeDynamic(rec.id);
        }
      } else if (rec.kind === 'domino' || rec.kind === 'pin') {
        if (fever.active || speed >= 4.5 || player.onSlide) {
          const lastHit = dynamicHitCooldown.get(rec.id) ?? -999;
          if (totalTime - lastHit < 0.28) return;
          dynamicHitCooldown.set(rec.id, totalTime);

          const t = rec.body.translation();
          const vx = player.vel.x;
          const vz = player.vel.z;
          const vLen = Math.hypot(vx, vz);
          const dx = t.x - player.pos.x;
          const dz = t.z - player.pos.z;
          const dLen = Math.hypot(dx, dz);

          let dirX =
            vLen > 0.5 ? vx / vLen : dLen > 0.01 ? dx / dLen : Math.sin(player.facingYaw);
          let dirZ =
            vLen > 0.5 ? vz / vLen : dLen > 0.01 ? dz / dLen : Math.cos(player.facingYaw);
          if (dLen > 0.01) {
            dirX = dirX * 0.65 + (dx / dLen) * 0.35;
            dirZ = dirZ * 0.65 + (dz / dLen) * 0.35;
          }
          const nLen = Math.hypot(dirX, dirZ) || 1;
          dirX /= nLen;
          dirZ /= nLen;

          const baseDv = fever.active
            ? 14.0
            : THREE.MathUtils.clamp(Math.max(speed, 7.0) * 1.15, 7.5, 15.0);
          const impulseMag = Math.max(0.25, rec.body.mass() * baseDv);
          rec.body.wakeUp();
          rec.body.applyImpulse(
            {
              x: dirX * impulseMag,
              y: impulseMag * 0.34,
              z: dirZ * impulseMag,
            },
            true
          );
          rec.body.applyTorqueImpulse(
            {
              x: -dirZ * impulseMag * 0.42,
              y: (Math.random() - 0.5) * impulseMag * 0.25,
              z: dirX * impulseMag * 0.42,
            },
            true
          );
          sound.playBlockHit(rec.kind === 'pin' ? 0.72 : 0.52);

          if (rec.kind === 'pin') {
            // Propagate crisp bowling strike scatter to neighboring pins within 2.2m
            for (const other of physics.getDynamicRecords()) {
              if (other.id === rec.id || other.broken || other.kind !== 'pin') continue;
              const ot = other.body.translation();
              const odx = ot.x - t.x;
              const odz = ot.z - t.z;
              const dist = Math.hypot(odx, ot.y - t.y, odz);
              if (dist > 2.2) continue;
              const lastOther = dynamicHitCooldown.get(other.id) ?? -999;
              if (totalTime - lastOther < 0.28) continue;
              dynamicHitCooldown.set(other.id, totalTime);

              const falloff = 1.0 - dist / 2.4;
              const oLen = Math.hypot(odx, odz) || 1;
              const ox = (odx / oLen) * 0.6 + dirX * 0.4;
              const oz = (odz / oLen) * 0.6 + dirZ * 0.4;
              const oNorm = Math.hypot(ox, oz) || 1;
              const oMag = Math.max(0.2, other.body.mass() * 8.5 * falloff);
              other.body.wakeUp();
              other.body.applyImpulse(
                {
                  x: (ox / oNorm) * oMag,
                  y: oMag * 0.36,
                  z: (oz / oNorm) * oMag,
                },
                true
              );
              other.body.applyTorqueImpulse(
                {
                  x: -(oz / oNorm) * oMag * 0.45,
                  y: (Math.random() - 0.5) * oMag * 0.3,
                  z: (ox / oNorm) * oMag * 0.45,
                },
                true
              );
            }
          }
        }
      }
    },
  });

  function onPropBroken(
    pos: THREE.Vector3,
    kind: 'block' | 'crate' | 'domino' | 'pin' | 'debris',
    recId?: number
  ): void {
    sound.playBoxBreak();
    vfx.spawnWoodChips(pos, 10);
    vfx.spawnStarBurst(pos, 6, 4.5);
    if (kind === 'crate') {
      collectibles.spawnBurstCoins(pos, 3);
      if (recId !== undefined && recId === secretCrateId) {
        // 木箱の中からスターがゆっくりせり上がる。せり上がり中は拾えず、
        // 最後はジャンプで届く高さに浮かぶので「出た → 取った」がはっきり分かれる。
        const SECRET_RISE_DUR = 1.3;
        const revealed = collectibles.revealSecretStar(5, {
          riseFrom: pos.clone(),
          riseHeight: 1.5,
          riseDur: SECRET_RISE_DUR,
        });
        if (revealed) {
          sound.playStar();
          vfx.spawnStarBurst(pos, 26, 9.0);
          vfx.spawnShockwaveRing(pos, 6.0, 0x4df5e8, 0.5);
          const starTarget = revealed.pos.clone();
          starCutsceneTimer = SECRET_RISE_DUR + 0.2;
          player.isCutsceneStar = true;
          cameraCtrl.startCinematic(SECRET_RISE_DUR + 0.2, (t01, pPos, pYaw) => {
            const ease = t01 * t01 * (3 - 2 * t01);
            // スターと反対側（プレイヤーの背中側）から、プレイヤーとスターを一緒に映す
            let dx = pPos.x - starTarget.x;
            let dz = pPos.z - starTarget.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.4) {
              dx = -Math.sin(pYaw);
              dz = -Math.cos(pYaw);
            } else {
              dx /= len;
              dz /= len;
            }
            return {
              pos: new THREE.Vector3(
                pPos.x + dx * 5.0 + dz * 1.2,
                pPos.y + 2.2,
                pPos.z + dz * 5.0 - dx * 1.2
              ),
              lookAt: new THREE.Vector3(
                THREE.MathUtils.lerp(pPos.x, starTarget.x, 0.7),
                THREE.MathUtils.lerp(pPos.y + 0.8, starTarget.y, ease),
                THREE.MathUtils.lerp(pPos.z, starTarget.z, 0.7)
              ),
              fov: THREE.MathUtils.lerp(48, 42, ease),
            };
          });
          callouts.spawnScreen(
            window.innerWidth * 0.5,
            window.innerHeight * 0.3,
            '💎 ひみつスター出現！',
            'star',
            'ジャンプしてタッチ！',
            SECRET_RISE_DUR + 0.6
          );
          tutorial.showTempBanner('💎 木箱から青いひみつスターが出てきた！ジャンプしてゲットしよう！', 4.5);
        }
      } else if (player.hp < player.maxHp && Math.random() < 0.45) {
        collectibles.spawnBurstHeart(pos);
      }
    }
    const pts = 100 * fever.getScoreMultiplier();
    score += pts;
    addTutorialAwareFeverCharge(8);
  }

  function attachBlockBreakHooks(mgr: ToyBlocksManager): void {
    const origSpawnBlock = mgr.spawnAlphabetBlock.bind(mgr);
    mgr.spawnAlphabetBlock = (ph, pos, idx, cb) => {
      const rec = origSpawnBlock(ph, pos, idx, cb);
      if (!rec.onBreak) {
        rec.onBreak = (p, k) => onPropBroken(p, k, rec.id);
      }
      return rec;
    };
    const origSpawnCrate = mgr.spawnCrate.bind(mgr);
    mgr.spawnCrate = (ph, pos, gl, cb) => {
      const rec = origSpawnCrate(ph, pos, gl, cb);
      if (!rec.onBreak) {
        rec.onBreak = (p, k) => onPropBroken(p, k, rec.id);
      }
      return rec;
    };
  }

  let worldBuiltOnce = false;
  function buildWorldInPlace(
    worldId: WorldId,
    opts?: { restoreSavedRun?: boolean }
  ): void {
    const isRebuild = worldBuiltOnce;
    worldBuiltOnce = true;

    activeWorldId = worldId;
    activeWorldConfig = getWorldConfig(worldId);
    spawnPos.set(...activeWorldConfig.spawnPos);
    clearTransientGameplayLocks();
    dynamicHitCooldown.clear();

    if (isRebuild) {
      builder.dispose();
      for (const s of worldEntities.slimes) engine.scene.remove(s.group);
      for (const t of worldEntities.tanks) engine.scene.remove(t.group);
      for (const b of worldEntities.balloons) engine.scene.remove(b.group);
      engine.scene.remove(blocks.group);
      engine.scene.remove(collectibles.group);
      gimmicks.dispose();
      engine.scene.remove(terrain.group);
      engine.scene.remove(grassField.group);
      worldProps.clearPlacedInstances();
      physics.reset();

      blocks = new ToyBlocksManager(engine.scene, pbr);
      collectibles = new CollectiblesManager(engine.scene);
      gimmicks = new GimmicksManager(engine.scene, pbr);
      terrain = new CraftTerrainBuilder(engine.scene, pbr, useMobileLods);
      grassField = new StylizedGrassField(engine.scene);
      builder =
        worldId === 'world1'
          ? new World1PlayroomBuilder(engine.scene, pbr)
          : new World1Builder(engine.scene, pbr);
    }

    attachBlockBreakHooks(blocks);
    collectibles.setIndoorCeilingHeight(activeWorldConfig.indoor ? 21.5 : null);
    skybox.setIndoorMode(activeWorldConfig.indoor);
    engine.setIndoorMode(activeWorldConfig.indoor);
    player.fallOutEnabled = activeWorldConfig.fallOutEnabled;
    player.safeFloorBounds = activeWorldConfig.safeFloorBounds;

    boss.configureArena(
      new THREE.Vector3(...activeWorldConfig.bossArenaCenter),
      new THREE.Vector3(...activeWorldConfig.bossSpawnPos),
      activeWorldConfig.bossArenaRadius
    );

    worldEntities = builder.build(
      physics,
      blocks,
      collectibles,
      gimmicks,
      terrain,
      grassField,
      worldProps,
      (pos, variant, isTut) => {
        const s = new JellySlime(
          pos,
          variant,
          isTut,
          modelSwap.createEnemyVisual('enemySlime')?.root
        );
        engine.scene.add(s.group);
        return s;
      },
      (pos, isGuard) => {
        const t = new WindupTank(
          pos,
          isGuard,
          modelSwap.createEnemyVisual('enemyTank')?.root
        );
        engine.scene.add(t.group);
        return t;
      },
      (pos) => {
        const b = new PropellerBalloon(
          pos,
          modelSwap.createEnemyVisual('enemyBalloon')?.root
        );
        engine.scene.add(b.group);
        return b;
      },
      () => {
        tutorial.triggerContextualHint(
          'cushion',
          'ふかふかパッチワーククッション！乗るとポヨンと高く弾むよ！'
        );
      }
    );
    secretCrateId = worldEntities.secretCrateId;
    gimmicks.upgradeVictoryChestWithModel(() => worldProps.createModelInstance('giftBox'));

    // Reset per-run gameplay metrics cleanly for this world
    score = 0;
    coinsCollected = 0;
    coinStreak = 0;
    coinStreakTimer = 0;
    elapsedPlaySec = 0;
    feverBannerTimer = 0;
    feverActivatedThisFrame = false;
    fever.active = false;
    fever.meter = 0;
    fever.remainingSec = 0;
    bossEngaged = false;
    bossDefeated = false;
    bossDamageTaken = 0;
    gateLockedBannerCooldown = 0;
    star3Unlocked = false;
    tanksDefeatedCount = 0;
    gameOverPenaltyCoins = 0;
    gameOverPenaltyScore = 0;
    wasInBossFight = false;
    newlyEarnedStamps = [];
    runStamps = [];
    isNewHighScore = false;
    clearRecorded = false;
    resumedFromSaveNoticePending = false;
    player.isDead = false;
    player.damageTakenCount = 0;
    player.invulnTimer = 0;
    player.setMaxHp(3, true);
    player.setCheckpoint(spawnPos, activeWorldConfig.spawnYaw);
    player.teleport(physics, spawnPos, activeWorldConfig.spawnYaw);
    cameraCtrl.resetBehind(spawnPos, activeWorldConfig.spawnYaw);
    engine.setBossMood(0);
    terrain.updateBossMood(0);

    // Ensure world/prop materials created during build inherit current quality settings
    applySettings(currentSettings, resolvedQuality);

    if (opts?.restoreSavedRun !== false) {
      restoreSavedRunForActiveWorld();
    } else if (currentSaveData.tutorialCompleted || worldId !== 'world1') {
      welcomeMoviePlayed = true;
      tutorial.skipAll();
      tutorialMarker.setTarget(null);
    } else {
      welcomeMoviePlayed = false;
      tutorial.reset();
      tutorialMarker.setTarget(null);
    }
  }

  updateBootLoader(84, 'ステージを くみたてちゅう…');
  buildWorldInPlace(activeWorldId, { restoreSavedRun: false });
  updateBootLoader(92, '仕上げを じゅんびちゅう…');

  function getMainStarsCollectedCount(): number {
    let count = 0;
    for (const s of collectibles.stars) {
      if (s.kind === 'main' && s.collected) count++;
    }
    return count;
  }

  function isBossArenaUnlocked(): boolean {
    return gimmicks.rainbowBridgeOpen && getMainStarsCollectedCount() >= 3 && !rainbowMovieActive;
  }

  function autoSaveRun(showToast = true, opts?: { overrideHp?: number }): void {
    if (phase === 'victory' || clearRecorded || player.isVictory) return;
    const cp = player.getCheckpointPos();
    const activatedCheckpointIndices = gimmicks.checkpoints
      .map((c, idx) => (c.activated ? idx : -1))
      .filter((idx) => idx >= 0);
    const collectedStarIds = collectibles.stars.filter((s) => s.collected).map((s) => s.id);
    const hasAllMainStars = getMainStarsCollectedCount() >= 3;
    const effectiveHp = opts?.overrideHp ?? Math.max(1, player.hp);
    currentSaveData = saveStore.saveRunState(activeWorldId, {
      active: true,
      checkpoint: {
        x: cp.x,
        y: cp.y,
        z: cp.z,
        yaw: player.getCheckpointYaw(),
      },
      activatedCheckpointIndices,
      collectedStarIds,
      star3Unlocked,
      rainbowBridgeOpen: hasAllMainStars && gimmicks.rainbowBridgeOpen,
      bossDefeated: hasAllMainStars && bossDefeated,
      coins: coinsCollected,
      score,
      hp: effectiveHp,
      feverMeter: fever.meter,
      damageTakenCount: player.damageTakenCount,
      elapsedSec: elapsedPlaySec,
    });
    const savedUpdatedAt = currentSaveData.worlds[activeWorldId]?.run.updatedAt ?? Date.now();
    writeRunBonusHpSidecar(activeWorldId, player.maxHp, effectiveHp, savedUpdatedAt);
    if (showToast) {
      autosaveToastTimer = 1.8;
    }
  }

  function blurActiveElement(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      active.blur();
    }
  }

  function clearTransientGameplayLocks(): void {
    player.isVictory = false;
    player.isCutsceneStar = false;
    player.bossIntroPienTimer = 0;
    victoryDelayTimer = 0;
    starCutsceneTimer = 0;
    pendingRewardCard = null;
    rewardCard = null;
    rewardCardElapsed = 0;
    welcomeMovieActive = false;
    welcomeMovieElapsed = 0;
    rainbowMovieActive = false;
    rainbowMovieElapsed = 0;
    rainbowMovieAct = 0;
    slowMoTimer = 0;
    engine.timeScale = 1.0;
    cameraCtrl.clearCinematic();
    input.clearTouchState();
    blurActiveElement();
  }

  function recordClearIfNeeded(): void {
    if (clearRecorded) return;
    clearRecorded = true;
    const collectedIds = collectibles.stars.filter((s) => s.collected).map((s) => s.id);
    const clearRes = saveStore.recordClear(
      {
        collectedStarIds: collectedIds,
        score,
        coins: coinsCollected,
        bossDamageTaken,
        rank: computeClearRank(),
      },
      activeWorldId
    );
    newlyEarnedStamps = clearRes.newlyEarnedStamps;
    runStamps = clearRes.runStamps;
    isNewHighScore = clearRes.isNewHighScore;
    currentSaveData = clearRes.saveData;
    clearRunBonusHpSidecar(activeWorldId);
  }

  function restartFreshActiveWorldRun(): void {
    clearTransientGameplayLocks();
    currentSaveData = saveStore.clearRun(activeWorldId);
    clearRunBonusHpSidecar(activeWorldId);
    buildWorldInPlace(activeWorldId, { restoreSavedRun: false });
    sound.setBgmMode('explore');
    phase = 'playing';
  }

  function selectAndStartWorld(worldId: WorldId, startPlaying = true): void {
    sound.unlock();
    sound.playUiClick();
    if (
      phase === 'playing' &&
      activeWorldId !== worldId &&
      (tutorial.step === 'done' || currentSaveData.tutorialCompleted)
    ) {
      autoSaveRun(false);
    }
    currentSaveData = saveStore.setLastPlayedWorld(worldId);
    const needRebuild =
      worldId !== activeWorldId ||
      clearRecorded ||
      player.isVictory ||
      Boolean(gimmicks.victoryChest?.opened);
    if (needRebuild) {
      buildWorldInPlace(worldId, { restoreSavedRun: true });
    }
    if (startPlaying) {
      startPlayFromTitle();
    }
  }

  // Soft radial drop shadow beneath Manmarubuu for crisp height & landing depth cues
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext('2d')!;
  const shadowGrad = shadowCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  shadowGrad.addColorStop(0.0, 'rgba(18, 24, 38, 0.92)');
  shadowGrad.addColorStop(0.45, 'rgba(18, 24, 38, 0.52)');
  shadowGrad.addColorStop(0.82, 'rgba(18, 24, 38, 0.14)');
  shadowGrad.addColorStop(1.0, 'rgba(18, 24, 38, 0.0)');
  shadowCtx.fillStyle = shadowGrad;
  shadowCtx.fillRect(0, 0, 64, 64);
  const playerShadowTex = new THREE.CanvasTexture(shadowCanvas);
  const playerShadowMat = new THREE.MeshBasicMaterial({
    map: playerShadowTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const playerShadowMesh = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), playerShadowMat);
  playerShadowMesh.rotation.x = -Math.PI / 2;
  playerShadowMesh.renderOrder = 2;
  playerShadowMesh.visible = false;
  engine.scene.add(playerShadowMesh);

  function addTutorialAwareFeverCharge(amount: number): void {
    // Cap meter at 90% during tutorial steps 1..5 so FEVER cannot become READY/triggered before Step 6
    if (tutorial.step !== 'done' && tutorial.step <= 5) {
      if (!fever.active && fever.meter < 90) {
        fever.meter = Math.min(90, fever.meter + amount);
      }
      return;
    }
    fever.addCharge(amount, onFeverReady);
  }

  function onFeverReady(): void {
    sound.playTutorialCheck();
    const activeDevice = lastTouchActive ? 'touch' : lastSnapshot?.inputDevice ?? 'kbm';
    const readySub =
      activeDevice === 'touch'
        ? '右上 FEVER タップで発動！'
        : activeDevice === 'gamepad'
          ? 'LB / RB で発動！'
          : 'Q キー / FEVER ボタンで発動！';
    callouts.spawnWorld(player.pos, engine.camera, 'FEVER READY!', 'super', readySub, 1.8);
  }

  function isManualFeverAllowed(): boolean {
    return (
      phase === 'playing' &&
      !isMobilePortraitBlocked() &&
      !welcomeMovieActive &&
      !rainbowMovieActive &&
      !tutorial.awaitingConfirm &&
      !rewardCard &&
      tutorial.step !== 7 &&
      !screens.hasOpenModal() &&
      fever.isReady()
    );
  }

  function tryManualTriggerFever(): boolean {
    if (!isManualFeverAllowed()) return false;
    if (!fever.activate()) return false;
    triggerFeverSequence();
    return true;
  }

  function triggerFeverSequence(): void {
    if (!fever.active) {
      fever.forceActivate();
    }
    feverActivatedThisFrame = true;
    sound.playFeverStart();
    sound.setBgmMode('fever');
    player.triggerFeverBurst();
    vfx.spawnStarBurst(player.pos, 24, 9.0);
    vfx.spawnShockwaveRing(player.pos, 7.5, 0x60e8ff, 0.5);
    callouts.spawnWorld(player.pos, engine.camera, 'FEVER x8!', 'fever', 'スコア8倍＆無敵突進！');
    cameraCtrl.triggerShake(0.32, 0.24, new THREE.Vector3(0.2, 1, 0.2));
    cameraCtrl.triggerFeverPulse(0.65);
    input.rumble(200, 0.65, 0.75);
    feverBannerTimer = 2.2;
    const feverHintText = '🌈 フィーバー発動！無敵状態で敵も木箱も体当たりでぶっとばせるよ！';
    if (tutorial.step === 'done') {
      tutorial.triggerContextualHint('fever-first-activate', feverHintText, 4.5);
    } else {
      tutorial.showTempBanner(feverHintText, 4.5);
    }
  }

  function onEnemyDefeated(pos: THREE.Vector3, basePts: number, calloutLabel?: string): void {
    engine.triggerHitStop(0.055);
    cameraCtrl.triggerShake(0.32, 0.18);
    input.rumble(140, 0.55, 0.65);
    vfx.spawnStarBurst(pos, 12, 6.0);
    collectibles.spawnBurstCoins(pos, 2);

    const mul = fever.getScoreMultiplier();
    const pts = basePts * mul;
    score += pts;
    addTutorialAwareFeverCharge(12);

    const comboTxt = player.stompCombo > 1 ? `${player.stompCombo} HIT!` : calloutLabel ?? 'NICE!';
    callouts.spawnWorld(
      pos,
      engine.camera,
      comboTxt,
      player.stompCombo >= 2 ? 'super' : 'hit',
      `+${pts}`
    );
  }

  function onBossWeakHit(newHp: number, hitPos: THREE.Vector3): void {
    engine.triggerHitStop(0.095);
    cameraCtrl.triggerShake(1.05, 0.42);
    input.rumble(360, 1.0, 1.0);
    sound.playBossHit();
    vfx.spawnShockwaveRing(hitPos, 8.8, 0xffd236, 0.55);
    vfx.spawnStarBurst(hitPos, 28, 10.5);
    vfx.spawnWoodChips(hitPos, 18);

    const pts = 1000 * fever.getScoreMultiplier();
    score += pts;
    player.bounceUp(14.5, true, false);

    if (newHp > 0) {
      callouts.spawnWorld(hitPos, engine.camera, '999! SMASH!', 'boss', `あと ${newHp} 回！`);
    } else {
      callouts.spawnWorld(hitPos, engine.camera, 'FINISH!!', 'boss', '時計じかけの王を撃破！');
      slowMoTimer = 1.4;
      engine.timeScale = 0.25;
      sound.playBossDefeat();
      cameraCtrl.startCinematic(2.5, (t01) => ({
        pos: new THREE.Vector3(
          boss.pos.x + Math.cos(t01 * 2.2) * 11.5,
          boss.pos.y + 5.2,
          boss.pos.z + Math.sin(t01 * 2.2) * 11.5
        ),
        lookAt: new THREE.Vector3(boss.pos.x, boss.pos.y + 3.0, boss.pos.z),
        fov: 48,
      }));
    }
  }

  function startRainbowBridgeMovie(): void {
    starCutsceneTimer = 0;
    rainbowMovieActive = true;
    rainbowMovieElapsed = 0;
    rainbowMovieLitStep = 0;
    rainbowMovieBridgeTriggered = false;
    rainbowMovieAct = 1;
    rainbowMovieTitle = '✨ メインスター3個コンプリート！';
    rainbowMovieSubtitle = '3スターゲートがまぶしく輝きはじめたよ！';
    player.isCutsceneStar = true;
    player.happyTimer = 3.0;
    gimmicks.updateGateStars(0);
    input.clearTouchState();
    input.exitPointerLock();

    cameraCtrl.startHoldCinematic((pPos, pYaw) => {
      const t = rainbowMovieElapsed;
      const isPortrait = window.innerHeight > window.innerWidth;

      if (t < 1.45) {
        const u = Math.min(1, t / 1.45);
        const ease = u * u * (3 - 2 * u);
        const dist = THREE.MathUtils.lerp(3.2, 2.55, ease);
        return {
          pos: new THREE.Vector3(
            pPos.x + Math.sin(pYaw) * dist + Math.cos(pYaw) * 0.65,
            pPos.y + THREE.MathUtils.lerp(1.05, 0.92, ease),
            pPos.z + Math.cos(pYaw) * dist - Math.sin(pYaw) * 0.65
          ),
          lookAt: new THREE.Vector3(pPos.x, pPos.y + 0.62, pPos.z),
          fov: THREE.MathUtils.lerp(46, 41, ease),
        };
      }

      if (t < 3.70) {
        const u = Math.min(1, (t - 1.45) / 2.25);
        const ease = u * u * (3 - 2 * u);
        return activeWorldConfig.rainbowMovieCameras.gateAct(isPortrait, ease);
      }

      const u = Math.min(1, (t - 3.70) / (RAINBOW_MOVIE_DURATION - 3.70));
      const ease = u * u * (3 - 2 * u);
      return activeWorldConfig.rainbowMovieCameras.bridgeAct(isPortrait, ease);
    }, 6.8);
  }

  function finishRainbowBridgeMovie(instantBridge = true): void {
    if (!rainbowMovieActive) return;
    rainbowMovieActive = false;
    rainbowMovieElapsed = 0;
    rainbowMovieAct = 0;
    gimmicks.updateGateStars(3);
    gimmicks.openRainbowBridge(instantBridge);
    player.isCutsceneStar = false;
    cameraCtrl.clearCinematic();
    cameraCtrl.resetBehind(player.pos, player.facingYaw);
    input.clearTouchState();
    autoSaveRun(false);
    tutorial.showTempBanner('🌈 虹の橋が開通！橋を渡って奥のボス城へ挑もう！', 4.5);
  }

  function updateRainbowBridgeMovie(rawDt: number, inputState: { confirmPressed: boolean; tutorialNextPressed: boolean }): boolean {
    if (!rainbowMovieActive) return false;
    rainbowMovieElapsed += rawDt;

    if (rainbowMovieElapsed < 1.45) {
      rainbowMovieAct = 1;
      rainbowMovieTitle = '✨ メインスター3個コンプリート！';
      rainbowMovieSubtitle = '3スターゲートがまぶしく輝きはじめたよ！';
    } else if (rainbowMovieElapsed < 3.70) {
      rainbowMovieAct = 2;
      rainbowMovieTitle = '⭐ 3スターゲート起動！';
      rainbowMovieSubtitle = '3つのスターがゲートにそろったよ！';

      if (rainbowMovieElapsed >= 1.75 && rainbowMovieLitStep < 1) {
        rainbowMovieLitStep = 1;
        gimmicks.updateGateStars(1, 0);
        sound.playCoin(0);
        const lp = gimmicks.getGateStarLampWorldPos(0);
        if (lp) {
          vfx.spawnStarBurst(lp, 16, 6.0);
          vfx.spawnShockwaveRing(lp, 3.6, 0xffe042, 0.45);
        }
      }
      if (rainbowMovieElapsed >= 2.20 && rainbowMovieLitStep < 2) {
        rainbowMovieLitStep = 2;
        gimmicks.updateGateStars(2, 1);
        sound.playCoin(2);
        const lp = gimmicks.getGateStarLampWorldPos(1);
        if (lp) {
          vfx.spawnStarBurst(lp, 16, 6.0);
          vfx.spawnShockwaveRing(lp, 3.6, 0xffe042, 0.45);
        }
      }
      if (rainbowMovieElapsed >= 2.65 && rainbowMovieLitStep < 3) {
        rainbowMovieLitStep = 3;
        gimmicks.updateGateStars(3, 2);
        sound.playStar();
        const lp = gimmicks.getGateStarLampWorldPos(2);
        if (lp) {
          vfx.spawnStarBurst(lp, 22, 7.5);
          vfx.spawnShockwaveRing(lp, 4.5, 0xffe042, 0.55);
        }
      }
    } else {
      rainbowMovieAct = 3;
      rainbowMovieTitle = '🌈 虹の橋が開通！';
      rainbowMovieSubtitle = '🌈 虹の橋が開通！橋を渡って奥のボス城へ挑もう！';
      if (!rainbowMovieBridgeTriggered) {
        rainbowMovieBridgeTriggered = true;
        gimmicks.updateGateStars(3);
        gimmicks.openRainbowBridge(false);
        sound.playFeverStart();
        cameraCtrl.triggerShake(0.32, 0.35);
        for (const bz of activeWorldConfig.rainbowMovieCameras.sparkleZs) {
          const br = activeWorldConfig.rainbowBridge;
          const frac = THREE.MathUtils.clamp((bz - br.fromZ) / (br.toZ - br.fromZ || -1), 0, 1);
          const bp = new THREE.Vector3(0, THREE.MathUtils.lerp(br.fromY, br.toY, frac) + 1.2, bz);
          vfx.spawnStarBurst(bp, 14, 6.5);
          vfx.spawnShockwaveRing(bp, 5.2, 0x7be8ff, 0.55);
        }
      }
    }

    const canSkip = rainbowMovieElapsed >= RAINBOW_SKIP_GUARD;
    const skipPressed =
      canSkip &&
      !screens.hasOpenModal() &&
      (inputState.confirmPressed || inputState.tutorialNextPressed);
    if (skipPressed) {
      sound.playUiClick();
      finishRainbowBridgeMovie(true);
      return true;
    }
    if (rainbowMovieElapsed >= RAINBOW_MOVIE_DURATION) {
      finishRainbowBridgeMovie(true);
      return true;
    }
    return false;
  }

  function startWelcomeMovie(): void {
    welcomeMoviePlayed = true;
    welcomeMovieActive = true;
    welcomeMovieElapsed = 0;
    tutorialMarker.setTarget(null);
    input.clearTouchState();
    input.exitPointerLock();
    sound.setBgmMode('explore');
    phase = 'playing';
    const wc = activeWorldConfig.welcomeCamera;
    cameraCtrl.startCinematic(WELCOME_DURATION + 0.5, (t01) => {
      const animT = Math.min(1, t01 / (WELCOME_DURATION / (WELCOME_DURATION + 0.5)));
      const ease = animT * animT * (3 - 2 * animT);
      const pPos = player.pos;
      const startCam = new THREE.Vector3(...wc.startPos);
      const startLook = new THREE.Vector3(...wc.startLook);
      const endCam = new THREE.Vector3(pPos.x, pPos.y + 3.4, pPos.z + 7.2);
      const endLook = new THREE.Vector3(pPos.x, pPos.y + 1.0, pPos.z - 2.0);
      const arcX = Math.sin(ease * Math.PI) * wc.arcX;
      const pos = new THREE.Vector3().lerpVectors(startCam, endCam, ease);
      pos.x += arcX * (1 - ease);
      const lookAt = new THREE.Vector3().lerpVectors(startLook, endLook, ease);
      const fov = THREE.MathUtils.lerp(60, 52, ease);
      return { pos, lookAt, fov };
    });
  }

  function finishWelcomeMovie(openIntro = true): void {
    if (!welcomeMovieActive) return;
    welcomeMovieActive = false;
    welcomeMovieElapsed = 0;
    cameraCtrl.clearCinematic();
    cameraCtrl.resetBehind(player.pos, player.facingYaw);
    input.clearTouchState();
    if (openIntro && tutorial.step === 1 && !tutorial.checklist[0]) {
      tutorial.openStep1Intro();
    }
  }

  function startTourCamera(): void {
    tutorialMarker.setTarget(null);
    cameraCtrl.startHoldCinematic((pPos) => {
      if (tutorial.tourPage === 0) {
        return activeWorldConfig.tourCameras.page0(pPos);
      }
      if (tutorial.tourPage === 1) {
        const isPortrait = window.innerHeight > window.innerWidth;
        return activeWorldConfig.tourCameras.page1(isPortrait);
      }
      return activeWorldConfig.tourCameras.page2();
    }, 6.5);
  }

  function handleTutorialAdvance(force = false): boolean {
    if (phase !== 'playing') return false;
    const res = tutorial.confirmAdvance(force);
    if (!res.advanced) return false;

    sound.unlock();
    sound.playUiClick();
    input.clearTouchState();

    if (res.nextStep === 3) {
      player.stepMadeDoubleJump = false;
    } else if (res.nextStep === 5) {
      player.stepMadeHipDrop = false;
    } else if (res.nextStep === 6) {
      // Ensure FEVER gauge is 100% READY when entering Action Step 6!
      fever.active = false;
      fever.remainingSec = 0;
      fever.meter = 100;
      feverBannerTimer = 0;
      sound.setBgmMode(bossEngaged && !bossDefeated ? 'boss' : 'explore');
    }

    if (res.enteredTour) {
      input.exitPointerLock();
      startTourCamera();
    } else if (res.finishedTour) {
      cameraCtrl.clearCinematic();
      cameraCtrl.resetBehind(player.pos, player.facingYaw);
      tutorialMarker.setTarget(null);
      sound.playTutorialCheck();
      vfx.spawnStarBurst(player.pos, 14, 5.5);
      currentSaveData = saveStore.markTutorialCompleted();
      autoSaveRun(false);
      tutorial.showTempBanner('冒険スタート！まずはパワースターを3個集めよう！', 3.4);
    }
    return true;
  }

  function handleSkipTutorial(): void {
    sound.unlock();
    sound.playUiClick();
    const wasInTour = tutorial.step === 7;
    if (welcomeMovieActive) {
      welcomeMovieActive = false;
      welcomeMovieElapsed = 0;
    }
    tutorial.skipAll();
    input.clearTouchState();
    cameraCtrl.clearCinematic();
    if (wasInTour) {
      cameraCtrl.resetBehind(player.pos, player.facingYaw);
    }
    tutorialMarker.setTarget(null);
    currentSaveData = saveStore.markTutorialCompleted();
    autoSaveRun(false);
    tutorial.showTempBanner('チュートリアルをスキップしたよ！冒険スタート！', 2.8);
  }

  function startPlayFromTitle(): void {
    sound.unlock();
    sound.playUiClick();
    if (clearRecorded || player.isVictory || gimmicks.victoryChest?.opened) {
      restartFreshActiveWorldRun();
      return;
    }
    blurActiveElement();
    player.isVictory = false;
    victoryDelayTimer = 0;
    pendingRewardCard = null;
    rewardCard = null;
    rewardCardElapsed = 0;
    slowMoTimer = 0;
    engine.timeScale = 1.0;
    input.clearTouchState();
    if (player.isDead) {
      cameraCtrl.clearCinematic();
      player.isCutsceneStar = false;
      starCutsceneTimer = 0;
      rainbowMovieActive = false;
      rainbowMovieAct = 0;
      player.bossIntroPienTimer = 0;
      player.respawnAfterGameOver(physics);
      cameraCtrl.resetBehind(player.pos, player.facingYaw);
    }
    if (
      !currentSaveData.tutorialCompleted &&
      !welcomeMoviePlayed &&
      tutorial.step === 1 &&
      !tutorial.checklist[0] &&
      !player.isDead
    ) {
      startWelcomeMovie();
      return;
    }
    cameraCtrl.clearCinematic();
    if (currentSaveData.tutorialCompleted && tutorial.step !== 'done') {
      welcomeMoviePlayed = true;
      tutorial.skipAll();
      tutorialMarker.setTarget(null);
    }
    if (resumedFromSaveNoticePending) {
      resumedFromSaveNoticePending = false;
      tutorial.showTempBanner('💾 つづきから再開したよ！', 3.2);
    }
    sound.setBgmMode(fever.active ? 'fever' : bossEngaged && !bossDefeated ? 'boss' : 'explore');
    phase = 'playing';
  }

  // UI Setup
  const hud = new HudManager(hudRoot, {
    onToggleMute: () => {
      sound.unlock();
      settingsStore.update({ soundEnabled: sound.isMuted() });
      sound.playUiClick();
    },
    onTriggerFever: () => {
      sound.unlock();
      tryManualTriggerFever();
    },
    onPause: () => {
      if (phase === 'playing' && !welcomeMovieActive && !rainbowMovieActive && !player.isVictory) {
        sound.unlock();
        sound.playUiClick();
        if (tutorial.step === 'done' || currentSaveData.tutorialCompleted) {
          autoSaveRun(false);
        }
        phase = 'paused';
        input.exitPointerLock();
      }
    },
    onSkipTutorial: handleSkipTutorial,
    onAdvanceTutorial: () => {
      handleTutorialAdvance(false);
    },
    onSkipWelcomeMovie: () => {
      if (welcomeMovieActive && welcomeMovieElapsed >= WELCOME_SKIP_GUARD) {
        sound.unlock();
        sound.playUiClick();
        finishWelcomeMovie(true);
      }
    },
    onSkipRainbowMovie: () => {
      if (rainbowMovieActive && rainbowMovieElapsed >= RAINBOW_SKIP_GUARD) {
        sound.unlock();
        sound.playUiClick();
        finishRainbowBridgeMovie(true);
      }
    },
    onCloseRewardCard: () => {
      sound.unlock();
      closeRewardCard();
    },
    onLayoutChange: () => {
      faceWipe.invalidateRect();
    },
  });

  const touchControls = new TouchControls(hudRoot, input);

  const screens = new ScreensManager(hudRoot, {
    onStartGame: startPlayFromTitle,
    onSelectWorld: (worldId) => {
      selectAndStartWorld(worldId, true);
    },
    onResetSaveAndNewGame: () => {
      sound.unlock();
      sound.playUiClick();
      currentSaveData = saveStore.reset();
      writeCheckpointGuideSeen(false);
      checkpointGuideShown = false;
      clearRunBonusHpSidecar();
      try {
        window.sessionStorage.setItem('manmarubuu_autostart_new', '1');
      } catch {
        // Ignore sessionStorage errors
      }
      window.location.reload();
    },
    onOpenWorldSelect: () => {
      sound.unlock();
      sound.playUiClick();
      phase = 'world_select';
      input.exitPointerLock();
    },
    onBackToTitle: () => {
      sound.unlock();
      sound.playUiClick();
      if (tutorial.step === 'done' || currentSaveData.tutorialCompleted) {
        autoSaveRun(false);
      }
      phase = 'title';
      sound.setBgmMode('title');
      input.exitPointerLock();
    },
    onResumeGame: () => {
      sound.unlock();
      sound.playUiClick();
      phase = 'playing';
    },
    onRestartGame: () => {
      restartFreshActiveWorldRun();
    },
    onRetryFromCheckpoint: () => {
      sound.unlock();
      sound.playUiClick();
      cameraCtrl.clearCinematic();
      player.isCutsceneStar = false;
      player.bossIntroPienTimer = 0;
      player.respawnAfterGameOver(physics);
      cameraCtrl.resetBehind(player.pos, player.facingYaw);
      if (bossEngaged && !bossDefeated) {
        boss.resetFight();
        bossEngaged = false;
        bossDamageTaken = 0;
        collectibles.resetRespawnableHearts();
      }
      sound.setBgmMode('explore');
      phase = 'playing';
    },
    onUpdateSettings: (partial) => {
      sound.unlock();
      settingsStore.update(partial);
    },
    onUiClick: () => {
      sound.unlock();
      sound.playUiClick();
    },
  });
  faceWipe.setViewportElement(hud.getFaceWipeHoleElement());

  // Main Game Loop
  let lastTime = performance.now();
  let totalTime = 0;
  let lastSnapshot: HudSnapshot | null = null;
  let lastPortraitBlocked = isMobilePortraitBlocked();
  const syncPortraitState = (): void => {
    const blocked = isMobilePortraitBlocked();
    if (blocked && !lastPortraitBlocked) {
      input.clearTouchState();
      input.exitPointerLock();
    } else if (!blocked && lastPortraitBlocked) {
      faceWipe.invalidateRect();
    }
    lastPortraitBlocked = blocked;
  };
  window.addEventListener('resize', syncPortraitState);
  window.addEventListener('orientationchange', syncPortraitState);
  if (
    typeof screen !== 'undefined' &&
    screen.orientation &&
    typeof screen.orientation.addEventListener === 'function'
  ) {
    screen.orientation.addEventListener('change', syncPortraitState);
  }

  function computeStarIndicators(): StarInfo[] {
    const out: StarInfo[] = [];
    const proj = new THREE.Vector3();
    for (const s of collectibles.stars) {
      proj.copy(s.pos).project(engine.camera);
      const inFront = proj.z < 1.0;
      const sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      const onScreen =
        inFront &&
        sx > 40 &&
        sx < window.innerWidth - 40 &&
        sy > 40 &&
        sy < window.innerHeight - 40;
      const dx = sx - window.innerWidth * 0.5;
      const dy = sy - window.innerHeight * 0.5;
      let angleRad = Math.atan2(dy, dx);
      if (!inFront) angleRad += Math.PI;
      out.push({
        id: s.id,
        label: s.label,
        areaName: s.areaName,
        kind: s.kind,
        collected: s.collected,
        unlocked: s.unlocked,
        x: s.pos.x,
        y: s.pos.y,
        z: s.pos.z,
        screenX: sx,
        screenY: sy,
        inFront,
        onScreen,
        angleRad,
      });
    }
    return out;
  }

  function computeNavTargets(): NavTargetInfo[] {
    engine.camera.getWorldDirection(tmpCamFwd);
    let fx = tmpCamFwd.x;
    let fz = tmpCamFwd.z;
    const fLen = Math.hypot(fx, fz);
    if (fLen > 0.001) {
      fx /= fLen;
      fz /= fLen;
    } else {
      fx = -Math.sin(cameraCtrl.yaw);
      fz = -Math.cos(cameraCtrl.yaw);
    }
    const rx = -fz;
    const rz = fx;

    const toRelAngle = (tx: number, tz: number): { dist: number; relAngleRad: number } => {
      const dx = tx - player.pos.x;
      const dz = tz - player.pos.z;
      const dist = Math.round(Math.hypot(dx, dz));
      const forwardDot = dx * fx + dz * fz;
      const rightDot = dx * rx + dz * rz;
      return {
        dist,
        relAngleRad: Math.atan2(rightDot, forwardDot),
      };
    };

    const uncollectedMain = collectibles.stars.filter((s) => s.kind === 'main' && !s.collected);
    if (uncollectedMain.length > 0) {
      let bestId = uncollectedMain[0].id;
      let bestDist = Infinity;
      const items = uncollectedMain.map((s) => {
        const { dist, relAngleRad } = toRelAngle(s.pos.x, s.pos.z);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = s.id;
        }
        const meta = activeWorldConfig.navMeta[s.id] ?? {
          shortLabel: `★${s.id}`,
          label: `★${s.id} ${s.areaName}`,
        };
        return {
          id: `star-${s.id}`,
          kind: 'star' as const,
          icon: '⭐',
          shortLabel: meta.shortLabel,
          label: meta.label,
          distanceM: dist,
          relAngleRad,
          isPrimary: false,
        };
      });
      for (const item of items) {
        if (item.id === `star-${bestId}`) {
          item.isPrimary = true;
          break;
        }
      }
      return items;
    }

    if (bossDefeated && !gimmicks.victoryChest?.opened) {
      const chestPos =
        gimmicks.victoryChest?.pos ?? new THREE.Vector3(...activeWorldConfig.victoryChestPos);
      const { dist, relAngleRad } = toRelAngle(chestPos.x, chestPos.z);
      return [
        {
          id: 'chest',
          kind: 'chest',
          icon: '🎁',
          shortLabel: '🎁',
          label: '🎁 宝箱',
          distanceM: dist,
          relAngleRad,
          isPrimary: true,
        },
      ];
    }

    if (gimmicks.rainbowBridgeOpen && !bossDefeated) {
      const gateZ = activeWorldConfig.starGatePos[2];
      const needGateDetour = player.pos.z > gateZ - 0.8 && Math.abs(player.pos.x) > 8;
      if (needGateDetour) {
        const { dist, relAngleRad } = toRelAngle(activeWorldConfig.starGatePos[0], gateZ);
        return [
          {
            id: 'gate',
            kind: 'gate',
            icon: '🌈',
            shortLabel: '🌈',
            label: '🌈 虹の橋',
            distanceM: dist,
            relAngleRad,
            isPrimary: true,
          },
        ];
      }
      const { dist, relAngleRad } = toRelAngle(
        activeWorldConfig.bossArenaCenter[0],
        activeWorldConfig.bossArenaCenter[2]
      );
      return [
        {
          id: 'boss',
          kind: 'boss',
          icon: '⚙️',
          shortLabel: '⚙️',
          label: '⚙️ ボス城',
          distanceM: dist,
          relAngleRad,
          isPrimary: true,
        },
      ];
    }

    return [];
  }

  function computeClearRank(): 'S' | 'A' | 'B' {
    const totalCollected = collectibles.stars.filter((s) => s.collected).length;
    if (player.damageTakenCount <= 1 || (totalCollected >= 5 && player.damageTakenCount <= 2)) {
      return 'S';
    }
    if (player.damageTakenCount <= 3) {
      return 'A';
    }
    return 'B';
  }

  function runFrameTick(now: number): void {
    const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    // FPS tracking
    fpsAccum += rawDt;
    fpsFrames++;
    if (fpsAccum >= 0.4) {
      currentFps = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
    }

    const portraitBlocked = isMobilePortraitBlocked();
    if (portraitBlocked !== lastPortraitBlocked) {
      if (portraitBlocked) {
        input.clearTouchState();
        input.exitPointerLock();
      } else {
        faceWipe.invalidateRect();
      }
      lastPortraitBlocked = portraitBlocked;
    }

    const inputState = input.poll(rawDt);

    if (!portraitBlocked && autosaveToastTimer > 0) {
      autosaveToastTimer = Math.max(0, autosaveToastTimer - rawDt);
    }

    if (!portraitBlocked && !bootTapPending) {
      if (phase === 'title' && inputState.confirmPressed && !screens.hasOpenModal()) {
        startPlayFromTitle();
      } else if (
        phase === 'playing' &&
        !welcomeMovieActive &&
        !rainbowMovieActive &&
        !player.isVictory &&
        inputState.pausePressed
      ) {
        if (tutorial.step === 'done' || currentSaveData.tutorialCompleted) {
          autoSaveRun(false);
        }
        phase = 'paused';
        input.exitPointerLock();
      } else if (phase === 'paused' && inputState.pausePressed) {
        if (screens.hasOpenModal()) {
          screens.closeAllModals();
        } else {
          phase = 'playing';
        }
      }
    }

    let finishedWelcomeThisFrame = false;
    if (!portraitBlocked && phase === 'playing' && welcomeMovieActive) {
      welcomeMovieElapsed += rawDt;
      const canSkip = welcomeMovieElapsed >= WELCOME_SKIP_GUARD;
      const skipPressed =
        canSkip &&
        !screens.hasOpenModal() &&
        (inputState.confirmPressed || inputState.tutorialNextPressed);
      if (skipPressed || welcomeMovieElapsed >= WELCOME_DURATION) {
        finishWelcomeMovie(true);
        finishedWelcomeThisFrame = true;
        if (skipPressed) {
          sound.playUiClick();
        }
      }
    }

    let finishedRainbowThisFrame = false;
    if (!portraitBlocked && phase === 'playing' && rainbowMovieActive) {
      finishedRainbowThisFrame = updateRainbowBridgeMovie(rawDt, inputState);
    }

    if (!portraitBlocked && starCutsceneTimer > 0 && phase === 'playing') {
      starCutsceneTimer = Math.max(0, starCutsceneTimer - rawDt);
      if (starCutsceneTimer <= 0 && !rainbowMovieActive) {
        player.isCutsceneStar = false;
      }
    }

    // Tutorial confirm card / tour input guard countdown & manual advance (Enter / Gamepad A)
    if (
      !portraitBlocked &&
      phase === 'playing' &&
      !welcomeMovieActive &&
      !rainbowMovieActive &&
      (tutorial.awaitingConfirm || tutorial.step === 7)
    ) {
      tutorial.tickGuard(rawDt);
    }
    if (
      !portraitBlocked &&
      phase === 'playing' &&
      !welcomeMovieActive &&
      !rainbowMovieActive &&
      !finishedWelcomeThisFrame &&
      !finishedRainbowThisFrame &&
      !screens.hasOpenModal() &&
      (tutorial.awaitingConfirm || tutorial.step === 7) &&
      inputState.tutorialNextPressed
    ) {
      handleTutorialAdvance(false);
    }

    // Hitstop pauses gameplay simulation briefly for crunchy impact!
    // スターのお知らせカード：カットイン終了後に少し待ってから出し、出ている間はゲームを止める
    if (!portraitBlocked && phase === 'playing') {
      if (
        pendingRewardCard &&
        !rewardCard &&
        !welcomeMovieActive &&
        !rainbowMovieActive &&
        !cameraCtrl.isCinematicActive() &&
        !tutorial.awaitingConfirm
      ) {
        pendingRewardCard.delay -= rawDt;
        if (pendingRewardCard.delay <= 0) {
          rewardCard = pendingRewardCard.info;
          pendingRewardCard = null;
          rewardCardElapsed = 0;
          sound.playStar();
          input.exitPointerLock();
        }
      }
      if (rewardCard) {
        rewardCardElapsed += rawDt;
        if (inputState.tutorialNextPressed && !screens.hasOpenModal()) {
          closeRewardCard();
        }
      }
    }

    const tutorialConfirmPaused =
      phase === 'playing' && (tutorial.awaitingConfirm || rewardCard !== null);
    const inHitStop =
      !portraitBlocked &&
      phase === 'playing' &&
      !tutorialConfirmPaused &&
      !rainbowMovieActive &&
      engine.consumeHitStop(rawDt);
    if (!portraitBlocked && slowMoTimer > 0) {
      slowMoTimer -= rawDt;
      if (slowMoTimer <= 0) {
        engine.timeScale = 1.0;
      }
    }

    const dt =
      portraitBlocked || phase === 'paused' || phase === 'gameover' || tutorialConfirmPaused
        ? 0
        : rawDt * engine.timeScale;
    totalTime += dt;

    if (portraitBlocked) {
      // Simulation paused while mobile portrait rotation overlay is shown
    } else if (phase === 'playing' && welcomeMovieActive) {
      player.update(rawDt, inputState, cameraCtrl.yaw, physics, false, true);
    } else if (phase === 'playing' && rainbowMovieActive) {
      player.update(rawDt, inputState, cameraCtrl.yaw, physics, false, true);
      builder.update(rawDt);
      gimmicks.update(
        rawDt,
        totalTime,
        player.pos,
        () => {},
        () => {},
        () => {}
      );
    } else if (phase === 'playing' && !inHitStop && !tutorialConfirmPaused) {
      elapsedPlaySec += rawDt;
      if (gateLockedBannerCooldown > 0) {
        gateLockedBannerCooldown = Math.max(0, gateLockedBannerCooldown - rawDt);
      }

      if (inputState.feverPressed) {
        tryManualTriggerFever();
      }
      if (fever.isReady() && tutorial.step === 'done') {
        const readyHint = lastTouchActive
          ? 'FEVER ゲージ満タン！右上の FEVER ボタン／ゲージをタップで無敵＆スコア8倍！'
          : inputState.device === 'gamepad'
            ? 'FEVER ゲージ満タン！LB / RB ボタンで無敵＆スコア8倍！'
            : 'FEVER ゲージ満タン！Q キー（または FEVER ボタン）で無敵＆スコア8倍！';
        tutorial.triggerContextualHint('fever-ready', readyHint);
      }

      if (coinStreakTimer > 0) {
        coinStreakTimer -= dt;
        if (coinStreakTimer <= 0) coinStreak = 0;
      }

      if (feverBannerTimer > 0) {
        feverBannerTimer = Math.max(0, feverBannerTimer - rawDt);
      }

      fever.update(dt, () => {
        feverBannerTimer = 0;
        sound.setBgmMode(bossEngaged && !bossDefeated ? 'boss' : 'explore');
      });

      const controlsLocked = cameraCtrl.isCinematicActive() || tutorial.step === 7;
      player.update(dt, inputState, cameraCtrl.yaw, physics, fever.active, controlsLocked);

      // Step physics & interactive cascades (cushions & dominos)
      physics.step(dt);
      builder.update(dt);
      blocks.updateDominoCascade((domPos, chainCount) => {
        sound.playDominoClack(chainCount);
        vfx.spawnStarBurst(domPos, 4, 2.4);
      });

      // Collectibles (Coins, StarBits, Power Stars, Recovery Hearts)
      collectibles.update(
        dt,
        totalTime,
        player.pos,
        fever.active,
        player.hp,
        player.maxHp,
        (coin) => {
          sound.playCoin(coinStreak);
          coinStreak = (coinStreak + 1) % 8;
          coinStreakTimer = 1.3;
          coinsCollected += 1;
          const pts = (coin.isStarBit ? 50 : 20) * fever.getScoreMultiplier();
          score += pts;
          addTutorialAwareFeverCharge(coin.isStarBit ? 6 : 3.5);
          vfx.spawnStarBurst(coin.pos, 4, 3.0);
        },
        (star) => {
          sound.playStar();
          currentSaveData = saveStore.recordStar(star.id, activeWorldId);
          const pts = 500 * fever.getScoreMultiplier();
          score += pts;
          player.happyTimer = 2.6;
          vfx.spawnStarBurst(star.pos, 28, 9.5);

          if (star.kind === 'main') {
            const mainCount = collectibles.stars.filter(
              (s) => s.kind === 'main' && s.collected
            ).length;
            vfx.spawnShockwaveRing(star.pos, 7.0, 0xffe042, 0.55);
            callouts.spawnScreen(
              window.innerWidth * 0.5,
              window.innerHeight * 0.30,
              `★ STAR ${star.id} GET!`,
              'star',
              star.label,
              1.6
            );

            if (mainCount >= 3) {
              startRainbowBridgeMovie();
              pendingRewardCard = {
                delay: 0.45,
                info: {
                  kind: 'mainComplete',
                  badge: '⭐ 金のパワースター 3/3 コンプリート！',
                  title: '🌈 虹の橋が開通したよ！',
                  body: '金のパワースターを3つぜんぶ集めたよ！\n3スターゲートの先の虹の橋を渡って、ボス城へ向かおう！',
                  found: 3,
                  total: 3,
                  prevMaxHp: player.maxHp,
                  newMaxHp: player.maxHp,
                },
              };
            } else {
              gimmicks.updateGateStars(mainCount);
              starCutsceneTimer = 1.6;
              player.isCutsceneStar = true;
              cameraCtrl.startCinematic(1.6, (t01, pPos, pYaw) => {
                const ease = t01 * t01 * (3 - 2 * t01);
                return {
                  pos: new THREE.Vector3(
                    pPos.x + Math.sin(pYaw) * 2.95 + Math.cos(pYaw) * 0.65,
                    pPos.y + 0.95,
                    pPos.z + Math.cos(pYaw) * 2.95 - Math.sin(pYaw) * 0.65
                  ),
                  lookAt: new THREE.Vector3(pPos.x, pPos.y + 0.62, pPos.z),
                  fov: THREE.MathUtils.lerp(46, 41, ease),
                };
              });
              tutorial.showTempBanner(
                `★ ${star.label} ゲット！あと ${3 - mainCount} 個！`,
                3.2
              );
              pendingRewardCard = {
                delay: 0.15,
                info: {
                  kind: 'main',
                  badge: `⭐ 金のパワースター ${mainCount}/3`,
                  title: `「${star.label}」ゲット！`,
                  body: `あと ${3 - mainCount}つ。\n3つぜんぶ集めると、3スターゲートが開いて虹の橋がかかるよ！`,
                  found: mainCount,
                  total: 3,
                  prevMaxHp: player.maxHp,
                  newMaxHp: player.maxHp,
                },
              };
            }
          } else {
            const secretCount = collectibles.stars.filter(
              (s) => s.kind === 'secret' && s.collected
            ).length;
            vfx.spawnShockwaveRing(star.pos, 6.5, 0x4df5e8, 0.55);
            const prevMaxHp = player.maxHp;
            if (secretCount >= 3) {
              player.setMaxHp(4, true);
              sound.playHeal();
              vfx.spawnShockwaveRing(star.pos, 8.2, 0xff6b9d, 0.65);
              vfx.spawnConfetti(player.pos, 42);
              vfx.spawnStarBurst(player.pos, 32, 10.5);
              input.rumble(280, 0.7, 0.85);
              callouts.spawnScreen(
                window.innerWidth * 0.5,
                window.innerHeight * 0.30,
                '💎 3/3 COMPLETE!',
                'fever',
                star.label,
                1.4
              );
              pendingRewardCard = {
                delay: 1.0,
                info: {
                  kind: 'secretComplete',
                  badge: '💎 青いひみつスター 3/3 コンプリート！',
                  title: `最大♡が ${prevMaxHp} → ${player.maxHp} にふえた！`,
                  body: '青いひみつスターを3つぜんぶ集めたごほうび！\n♡がひとつふえて、HPもぜんかいしたよ。',
                  found: 3,
                  total: 3,
                  prevMaxHp,
                  newMaxHp: player.maxHp,
                },
              };
            } else {
              callouts.spawnScreen(
                window.innerWidth * 0.5,
                window.innerHeight * 0.30,
                `💎 SECRET STAR ${secretCount}/3`,
                'star',
                star.label,
                1.4
              );
              pendingRewardCard = {
                delay: 0.9,
                info: {
                  kind: 'secret',
                  badge: `💎 青いひみつスター ${secretCount}/3`,
                  title: `「${star.label}」ゲット！`,
                  body: `あと ${3 - secretCount}つ。\n3つぜんぶ集めると、最大♡がひとつふえるよ！`,
                  found: secretCount,
                  total: 3,
                  prevMaxHp,
                  newMaxHp: prevMaxHp,
                },
              };
            }
          }

          autoSaveRun(true);
        },
        (heart) => {
          if (player.heal(1)) {
            sound.playHeal();
            vfx.spawnStarBurst(heart.pos, 14, 5.5);
            callouts.spawnWorld(heart.pos, engine.camera, 'HP +1 ♥', 'super');
          }
        },
        resolvedQuality
      );

      // Gimmicks (Red springs, Checkpoints, Victory Chest)
      gimmicks.update(
        dt,
        totalTime,
        player.pos,
        (spring) => {
          player.bounceUp(spring.bounceVel, false, true);
          vfx.spawnStarBurst(spring.pos, 10, 5.5);
          input.rumble(140, 0.5, 0.6);
          tutorial.triggerContextualHint(
            'red-spring',
            '赤バネで大ジャンプ！高い場所のスターを目指そう！'
          );
        },
        (cp) => {
          player.setCheckpoint(player.pos, player.facingYaw);
          sound.playTutorialCheck();
          vfx.spawnStarBurst(player.pos, 10, 4.5);
          if (!checkpointGuideShown) {
            checkpointGuideShown = true;
            writeCheckpointGuideSeen(true);
            callouts.spawnWorld(
              cp.pos,
              engine.camera,
              'CHECKPOINT!',
              'super',
              'ここから再開＆オートセーブ！',
              1.9
            );
            tutorial.showTempBanner(
              '🚩 チェックポイント通過！やられてもここから再開＆オートセーブされるよ！',
              5.2
            );
          } else {
            callouts.spawnWorld(cp.pos, engine.camera, 'CHECKPOINT!', 'super', 'オートセーブ！', 1.3);
          }
          autoSaveRun(true);
        },
        () => {
          // Victory chest opened! Position Buu joyfully beside the opened chest
          pendingRewardCard = null;
          rewardCard = null;
          rewardCardElapsed = 0;
          starCutsceneTimer = 0;
          player.isCutsceneStar = false;
          cameraCtrl.clearCinematic();
          slowMoTimer = 0;
          engine.timeScale = 1.0;
          sound.playChestOpen();
          sound.setBgmMode('victory');
          vfx.spawnConfetti(gimmicks.victoryChest.pos, 72);
          vfx.spawnStarBurst(gimmicks.victoryChest.pos, 32, 11.0);
          player.teleport(
            physics,
            gimmicks.victoryChest.pos.clone().add(new THREE.Vector3(-2.3, 0.1, 2.2)),
            0.25
          );
          player.isVictory = true;
          victoryDelayTimer = 2.6;
          recordClearIfNeeded();
          callouts.spawnWorld(player.pos, engine.camera, 'VICTORY!!', 'star', 'おめでとう！！', 2.4);
        }
      );

      // Update enemies (skip during step 7 tour for safety)
      if (tutorial.step !== 7) {
        const isHipDiving = player.hipDropState === 'diving' || player.hipDropState === 'windup';

        for (const s of worldEntities.slimes) {
          s.update(
            dt,
            player.pos,
            player.vel.y,
            fever.active,
            (slime) => {
              if (!fever.active) player.bounceUp(13.2, true, false);
              onEnemyDefeated(slime.pos, 120);
            },
            (slime) => {
              player.takeDamage(slime.pos, 1);
            }
          );
        }

        for (const tk of worldEntities.tanks) {
          tk.update(
            dt,
            player.pos,
            player.vel.y,
            fever.active,
            (tank) => {
              if (!fever.active) player.bounceUp(12.2, true, false);
              tanksDefeatedCount++;
              onEnemyDefeated(tank.pos, 200, 'BOOM!');
            },
            (tank) => {
              player.takeDamage(tank.pos, 1);
            }
          );
        }

        for (const bl of worldEntities.balloons) {
          bl.update(dt, player.pos, player.vel.y, fever.active, (balloon) => {
            player.bounceUp(15.0, true, false);
            onEnemyDefeated(balloon.pos, 160, 'POP!');
          });
        }

        // Bowling Plaza contextual hint & Star 3 unlock check
        if (!star3Unlocked && activeWorldConfig.isInBowlingHintZone(player.pos)) {
          tutorial.triggerContextualHint(
            'bowling-area',
            'ボーリングピンとタンクを合計5体以上倒すと、奥のスターの封印がとけるよ！'
          );
        }
        if (!star3Unlocked) {
          const knockedPins = blocks.updateBowlingChecks();
          if (knockedPins + tanksDefeatedCount >= 5) {
            star3Unlocked = true;
            collectibles.unlockStar(3);
            sound.playStar();
            const s3 = collectibles.stars.find((x) => x.id === 3);
            if (s3) {
              vfx.spawnStarBurst(s3.pos, 22, 8.0);
              callouts.spawnWorld(s3.pos, engine.camera, 'STAR UNLOCKED!', 'star', '封印解除！');
            }
            tutorial.showTempBanner(
              '🎳 ボーリング広場クリア！奥の ★パワースター3 が解放されたよ！',
              4.5
            );
            autoSaveRun(true);
          }
        }

        const mainStarsCollected = getMainStarsCollectedCount();
        const bossArenaUnlocked = isBossArenaUnlocked();
        if (
          !bossArenaUnlocked &&
          tutorial.step === 'done' &&
          !welcomeMovieActive &&
          !rainbowMovieActive &&
          !rewardCard &&
          gateLockedBannerCooldown <= 0 &&
          activeWorldConfig.isAtLockedGate(player.pos)
        ) {
          gateLockedBannerCooldown = 4.0;
          const remaining = Math.max(1, 3 - mainStarsCollected);
          tutorial.showTempBanner(
            `⭐ 3スターゲートはまだ閉じているよ！金のパワースターをあと ${remaining}個 集めよう！`,
            3.4
          );
        }

        // Boss Arena Entry & Clockwork Toy King fight (requires all 3 gold Power Stars + Rainbow Bridge open)
        const distToBossArenaCenter = Math.hypot(
          player.pos.x - boss.arenaCenter.x,
          player.pos.z - boss.arenaCenter.z
        );
        const inBossArena =
          bossArenaUnlocked &&
          !bossDefeated &&
          distToBossArenaCenter < activeWorldConfig.bossArenaRadius - 0.2 &&
          player.pos.z < activeWorldConfig.bossArenaEntryMaxZ &&
          player.pos.y >= activeWorldConfig.bossArenaMinY &&
          player.pos.y <= 12.0;
        if (inBossArena && !bossEngaged) {
          bossEngaged = true;
          bossDamageTaken = 0;
          boss.startFight();
          if (!fever.active) sound.setBgmMode('boss');
          player.bossIntroPienTimer = 3.2;
          tutorial.showTempBanner(
            '⚠️ CLOCKWORK TOY KING 登場！腕叩きつけをジャンプでよけて背中を狙おう！',
            4.5
          );

          cameraCtrl.startCinematic(2.9, (t01, pPos, pYaw) => {
            if (t01 < 0.5) {
              return {
                pos: new THREE.Vector3(boss.pos.x + 5.2, boss.pos.y + 3.2, boss.pos.z + 11.5),
                lookAt: new THREE.Vector3(boss.pos.x, boss.pos.y + 3.4, boss.pos.z),
                fov: 50,
              };
            }
            // Snap to Buu's front showing Pien teary expression!
            return {
              pos: new THREE.Vector3(
                pPos.x + Math.sin(pYaw) * 2.35 + Math.cos(pYaw) * 0.45,
                pPos.y + 0.78,
                pPos.z + Math.cos(pYaw) * 2.35 - Math.sin(pYaw) * 0.45
              ),
              lookAt: new THREE.Vector3(pPos.x, pPos.y + 0.58, pPos.z),
              fov: 40,
            };
          });
        }

        if (bossEngaged && !bossDefeated) {
          if (boss.isWeakPointExposed()) {
            tutorial.triggerContextualHint(
              'boss-weak',
              lastTouchActive
                ? 'いまがチャンス！ボスの背中の金色ぜんまいへジャンプ→空中3回目タップでヒップドロップ！'
                : 'いまがチャンス！ボスの背中にある光る金色ぜんまいにヒップドロップ（Ctrl / 右クリック / B）！'
            );
          }
          boss.update(dt, player.pos, isHipDiving || player.hipDropState === 'recovery', fever.active, {
            onBossSlam: (slamPos) => {
              sound.playBossSlam();
              cameraCtrl.triggerShake(0.62, 0.25);
              vfx.spawnWoodChips(slamPos, 8);
            },
            onPlayerHit: (fromPos) => {
              player.takeDamage(fromPos, 1);
            },
            onWeakHit: onBossWeakHit,
            onDefeated: (arenaCenter) => {
              bossDefeated = true;
              sound.setBgmMode('explore');
              vfx.spawnConfetti(arenaCenter, 44);
              gimmicks.spawnVictoryChest(new THREE.Vector3(...activeWorldConfig.victoryChestPos));
              autoSaveRun(true);
              tutorial.showTempBanner('🎁 巨大プレゼント宝箱が出現！開けてゴールしよう！', 4.8);
            },
          });
        }
      }

      // Tutorial 3D Marker tracking & 6-step Evaluation
      if (tutorial.pendingConfirmStep !== null) {
        tutorialMarker.setTarget(null);
      } else if (tutorial.step === 1) {
        const firstCoin = collectibles.coins.find((c) => c.isTutorialStep1 && !c.collected);
        tutorialMarker.setTarget(
          firstCoin ? firstCoin.pos : worldEntities.tutorialCoinPos,
          1.55,
          -0.45
        );
      } else if (tutorial.step === 4) {
        const tutSlime = worldEntities.slimes.find((s) => s.isTutorialTarget && s.alive);
        tutorialMarker.setTarget(tutSlime ? tutSlime.pos : null, 2.1, 0.08);
      } else if (tutorial.step === 5) {
        tutorialMarker.setTarget(worldEntities.tutorialCratePos, 2.8, 0.08);
      } else {
        tutorialMarker.setTarget(null);
      }
      tutorialMarker.update(dt, totalTime);

      const tutSlimeAlive = worldEntities.slimes.some((s) => s.isTutorialTarget && s.alive);
      tutorial.evaluate(
        dt,
        {
          playerX: player.pos.x,
          playerZ: player.pos.z,
          camDeltaX: inputState.camDeltaX,
          camDeltaY: inputState.camDeltaY,
          coinsRemainingStep1: collectibles.getTutorialCoinsRemaining(),
          tutorialSlimeAlive: tutSlimeAlive,
          tutorialCratesRemaining: blocks.getTutorialCratesRemaining(),
          playerMadeDoubleJump: player.stepMadeDoubleJump,
          playerMadeHipDrop: player.stepMadeHipDrop,
          playerGrounded: player.grounded,
          feverActivatedThisFrame,
          feverActive: fever.active,
          step5ZThreshold: activeWorldConfig.tutorialStep5ZThreshold,
        },
        {
          onAchieved: (completed) => {
            if (completed === 6) return;
            sound.playTutorialCheck();
            vfx.spawnStarBurst(player.pos, 14, 5.2);
            player.happyTimer = 1.2;
            buuView.setExpression('Happy');
          },
          onConfirmOpened: (completed) => {
            if (completed === 6) {
              sound.playTutorialCheck();
              vfx.spawnStarBurst(player.pos, 14, 5.2);
              player.happyTimer = 1.2;
              buuView.setExpression('Happy');
            }
            input.exitPointerLock();
            input.clearTouchState();
          },
        }
      );
      feverActivatedThisFrame = false;

      // Rotate under-glass clockwork gears inside Boss Arena pit
      for (const g of worldEntities.clockworkGears) {
        g.rotation.y += dt * ((g.userData.spinSpeed as number) || 0.4);
      }

      // Victory delay countdown -> Result screen
      if (player.isVictory && victoryDelayTimer > 0) {
        victoryDelayTimer -= rawDt;
        if (Math.random() < 0.35) {
          vfx.spawnConfetti(player.pos, 4);
        }
        if (victoryDelayTimer <= 0) {
          recordClearIfNeeded();
          phase = 'victory';
          input.exitPointerLock();
        }
      }
    } else if (phase === 'victory') {
      // Keep Buu dancing happily behind result card
      player.update(rawDt, inputState, cameraCtrl.yaw, physics, fever.active, true);
    }

    // Smoothly transition sky, HDRI, fog & warm dusk sun as player crosses Rainbow Bridge toward Boss Arena
    const bossMoodAllowed =
      phase !== 'title' &&
      phase !== 'world_select' &&
      gimmicks.rainbowBridgeOpen &&
      getMainStarsCollectedCount() >= 3;
    let targetBossMood = 0;
    if (bossMoodAllowed) {
      const distArenaXZ = Math.hypot(
        player.pos.x - boss.arenaCenter.x,
        player.pos.z - boss.arenaCenter.z
      );
      const bridgeStartZ = activeWorldConfig.rainbowBridge.fromZ;
      const onRainbowBridgeCorridor =
        Math.abs(player.pos.x) <= 7.5 && player.pos.z <= bridgeStartZ;
      const inArenaZone =
        distArenaXZ <= activeWorldConfig.bossArenaRadius + 3.0 &&
        player.pos.y >= activeWorldConfig.bossArenaMinY - 0.5;
      if (onRainbowBridgeCorridor || inArenaZone) {
        const moodStartZ = activeWorldConfig.rainbowBridge.toZ + 4.0;
        const rawMood = THREE.MathUtils.clamp((moodStartZ - player.pos.z) / 14.0, 0, 1);
        targetBossMood = rawMood * activeWorldConfig.maxBossMood;
      }
    }
    const nextMood = THREE.MathUtils.lerp(
      engine.currentBossMood,
      targetBossMood,
      1 - Math.exp(-3.2 * Math.max(0.016, rawDt))
    );
    engine.setBossMood(nextMood);
    terrain.updateBossMood(nextMood);

    feverActivatedThisFrame = false;

    // Update skybox, swaying 3D grass, VFX, postprocessing fever pulse, and camera
    skybox.update(dt, player.pos, totalTime, nextMood);
    grassField.update(totalTime, player.pos);
    vfx.update(portraitBlocked ? 0 : tutorialConfirmPaused ? rawDt : dt);
    if (phase === 'title' || phase === 'world_select' || welcomeMovieActive) {
      playerShadowMesh.visible = false;
    } else if (player.grounded) {
      playerShadowMesh.visible = true;
      playerShadowMesh.position.set(player.pos.x, player.pos.y + 0.03, player.pos.z);
      playerShadowMesh.scale.setScalar(1.0);
      playerShadowMat.opacity = 0.52;
    } else {
      tmpShadowRayOrigin.set(player.pos.x, player.pos.y + 0.35, player.pos.z);
      const shadowHit = physics.castGroundRay(tmpShadowRayOrigin, 32);
      if (shadowHit) {
        const h = Math.max(0, player.pos.y - shadowHit.y);
        playerShadowMesh.visible = true;
        playerShadowMesh.position.set(player.pos.x, shadowHit.y + 0.03, player.pos.z);
        playerShadowMesh.scale.setScalar(Math.max(0.45, 1.0 - h * 0.04));
        playerShadowMat.opacity = Math.max(0.18, 0.52 - h * 0.03);
      } else {
        playerShadowMesh.visible = false;
      }
    }
    const activeCallouts = callouts.update(portraitBlocked ? 0 : rawDt);
    engine.setFeverVisual(fever.active, totalTime);

    const cameraStepDt = portraitBlocked
      ? 0
      : (tutorial.step === 7 || welcomeMovieActive || rainbowMovieActive) && phase === 'playing'
        ? rawDt
        : dt;
    const horizSpeed = Math.hypot(player.vel.x, player.vel.z);
    cameraCtrl.update(
      cameraStepDt,
      engine.camera,
      physics,
      player.pos,
      player.facingYaw,
      horizSpeed,
      inputState.camDeltaX,
      inputState.camDeltaY,
      {
        isTitle: phase === 'title' || phase === 'world_select',
        isVictory: player.isVictory,
        onSlide: player.onSlide,
        isTrampolineFly: player.trampolineTimer > 0,
        isFever: fever.active,
        bossPos: bossEngaged && !bossDefeated ? boss.pos : null,
        moveYaw: horizSpeed > 0.5 ? Math.atan2(player.vel.x, player.vel.z) : player.facingYaw,
        time: totalTime,
        titleCamera: activeWorldConfig.titleCamera,
      }
    );

    const activeExpr = inspectedExpression ?? player.getExpression();
    if (inspectedExpression) {
      buuView.setExpression(inspectedExpression, true);
    }

    const touchActive =
      currentSettings.showTouchControlsOverride === 'on' ||
      (currentSettings.showTouchControlsOverride === 'auto' &&
        (input.isTouchCapable() || inputState.device === 'touch'));
    if (touchActive !== lastTouchActive) {
      lastTouchActive = touchActive;
      faceWipe.invalidateRect();
    }

    const mainStars = collectibles.stars.filter((s) => s.kind === 'main' && s.collected).length;
    const secretStars = collectibles.stars.filter((s) => s.kind === 'secret' && s.collected).length;
    const objective = tutorial.getObjective({
      mainStars,
      totalMainStars: 3,
      secretStars,
      totalSecretStars: 3,
      rainbowBridgeOpen: gimmicks.rainbowBridgeOpen,
      bossActive: bossEngaged && !bossDefeated,
      bossDefeated,
      chestOpened: Boolean(gimmicks.victoryChest?.opened),
    });

    const snap: HudSnapshot = {
      phase,
      activeWorldId,
      activeWorldName: activeWorldConfig.name,
      hp: player.hp,
      maxHp: player.maxHp,
      stars: mainStars,
      totalStars: 3,
      secretStars,
      totalSecretStars: 3,
      starPoints: score,
      coins: coinsCollected,
      fever: fever.meter,
      feverActive: fever.active,
      feverBannerActive: feverBannerTimer > 0,
      feverRemainingSec: fever.remainingSec,
      expression: activeExpr,
      expressionLabelJa: EXPRESSION_LABELS_JA[activeExpr],
      anim: buuView.getAnimation(),
      inputDevice: touchActive ? 'touch' : inputState.device,
      tutorialStep: tutorial.step,
      tutorialChecklist: [...tutorial.checklist],
      tutorialSkipAvailable: tutorial.step !== 'done' && !welcomeMovieActive && !rainbowMovieActive,
      tutorialSubtitle: tutorial.getTourSubtitle(),
      tutorialAwaitingConfirm: tutorial.awaitingConfirm,
      tutorialConfirmStep: tutorial.confirmStep,
      tutorialConfirmReady: tutorial.isConfirmReady(),
      tutorialPendingConfirm: tutorial.pendingConfirmStep !== null,
      tutorialPendingStep: tutorial.pendingConfirmStep,
      tutorialTourPage: tutorial.tourPage,
      tutorialFeverHighlight:
        phase === 'playing' &&
        !welcomeMovieActive &&
        !tutorial.awaitingConfirm &&
        tutorial.step === 6 &&
        tutorial.pendingConfirmStep === null &&
        !fever.active,
      welcomeMovieActive,
      welcomeMovieCanSkip: welcomeMovieActive && welcomeMovieElapsed >= WELCOME_SKIP_GUARD,
      rainbowMovieActive,
      rainbowMovieCanSkip: rainbowMovieActive && rainbowMovieElapsed >= RAINBOW_SKIP_GUARD,
      rainbowMovieAct,
      rainbowMovieTitle,
      rainbowMovieSubtitle,
      playerAirborne: !player.grounded,
      playerJumpCount: player.jumpCount,
      playerHipDropState: player.hipDropState,
      modalOpen: screens.hasOpenModal(),
      objectiveIcon: objective.icon,
      objectiveText: objective.text,
      navTargets: computeNavTargets(),
      contextualHint: tutorial.update(
        portraitBlocked ||
          tutorialConfirmPaused ||
          tutorial.step === 7 ||
          welcomeMovieActive ||
          rainbowMovieActive
          ? 0
          : rawDt
      ),
      bossActive: bossEngaged && !bossDefeated,
      bossName: 'CLOCKWORK TOY KING',
      bossHp: boss.hp,
      bossMaxHp: boss.maxHp,
      bossPhase: boss.phase,
      bossWeakExposed: boss.isWeakPointExposed(),
      starIndicators: computeStarIndicators(),
      callouts: activeCallouts,
      rewardCard,
      rewardCardReady: rewardCard !== null && rewardCardElapsed >= REWARD_CARD_GUARD,
      elapsedSec: elapsedPlaySec,
      damageTakenCount: player.damageTakenCount,
      comboCount: player.stompCombo,
      muted: sound.isMuted(),
      fps: currentFps,
      clearRank: computeClearRank(),
      rainbowBridgeOpen: gimmicks.rainbowBridgeOpen,
      pointerLocked: inputState.pointerLocked,
      gameOverPenaltyCoins,
      gameOverPenaltyScore,
      wasInBossFight,
      touchActive,
      portraitBlocked,
      bootTapPending,
      settings: currentSettings,
      resolvedQuality,
      faceWipe3dActive,
      autosaveToastVisible: autosaveToastTimer > 0,
      hasSaveProgress: saveStore.hasSaveProgress(),
      hasResumableRun: saveStore.hasResumableRun(activeWorldId),
      saveData: currentSaveData,
      newlyEarnedStamps,
      runStamps,
      isNewHighScore,
    };
    lastSnapshot = snap;

    hud.update(snap, tutorial);
    touchControls.update(snap);
    screens.update(snap);

    blocks.syncDynamicInstances(resolvedQuality, engine.camera.position);
    worldProps.updateDistanceCulling(
      resolvedQuality,
      engine.camera.position,
      activeWorldConfig.bossArenaCenter[2],
      activeWorldConfig.bowlingCenter[0],
      activeWorldConfig.bowlingCenter[1]
    );
    builder.updateDistanceCulling(resolvedQuality, engine.camera.position);
    grassField.updateDistanceCulling(resolvedQuality, engine.camera.position);
    if (resolvedQuality === 'low') {
      const camPos = engine.camera.position;
      if (!bossDefeated && boss.state === 'dormant') {
        boss.group.visible =
          rainbowMovieActive ||
          Math.hypot(camPos.x - boss.pos.x, camPos.z - boss.pos.z) <= 72;
      }
      for (const tk of worldEntities.tanks) {
        if (tk.alive && tk.isBowlingGuard) {
          tk.group.visible = Math.hypot(camPos.x - tk.pos.x, camPos.z - tk.pos.z) <= 68;
        }
      }
    } else {
      if (!bossDefeated && boss.state === 'dormant') {
        boss.group.visible = true;
      }
      for (const tk of worldEntities.tanks) {
        if (tk.alive && tk.isBowlingGuard) {
          tk.group.visible = true;
        }
      }
    }

    // Render Main Scene (with Bloom + Tilt-Shift + SMAA, or lightweight path) then Live 3D Face Wipe!
    engine.renderMain();
    if (
      !portraitBlocked &&
      faceWipe3dActive &&
      !welcomeMovieActive &&
      !rainbowMovieActive &&
      (phase === 'playing' || phase === 'cutscene')
    ) {
      faceWipe.render(
        engine.renderer,
        hud.getFaceWipeHoleElement(),
        rawDt,
        snap.expression,
        snap.anim,
        fever.active
      );
    }
    if (bootLoaderState === 'loading') {
      if (bootTapPending) {
        enterBootLoaderTapWait(
          () => {
            bootTapPending = false;
            sound.unlock();
            if (phase === 'title') {
              sound.setBgmMode('title');
            }
            sound.playUiClick();
          },
          () => {
            sound.unlock();
          }
        );
      } else {
        finishBootLoaderImmediate();
      }
    }
  }

  function frame(now: number): void {
    try {
      runFrameTick(now);
      requestAnimationFrame(frame);
    } catch (err) {
      if (bootLoaderState === 'loading') {
        console.error('First frame error:', err);
        showBootError('ゲームの描画開始に失敗しました。', err);
        return;
      }
      console.error('Frame loop error:', err);
      requestAnimationFrame(frame);
    }
  }

  // Expose thorough debug & Playwright playthrough verification hook
  (window as unknown as Record<string, unknown>).__MANMARUBUU_DEBUG__ = {
    getState: () => ({
      snapshot: lastSnapshot,
      playerPos: player.pos.toArray(),
      loadedClips: buuView.getLoadedClipNames(),
      blushVisibility: buuView.getBlushVisibility(),
      bossState: boss.state,
      bossPos: boss.pos.toArray(),
      bossWeakPos: boss.getWeakPointWorldPos().toArray(),
      stars: collectibles.stars.map((s) => ({
        id: s.id,
        kind: s.kind,
        collected: s.collected,
        unlocked: s.unlocked,
        pos: s.pos.toArray(),
      })),
      hearts: collectibles.hearts.map((h) => ({
        collected: h.collected,
        respawnable: h.respawnable,
        pos: h.pos.toArray(),
      })),
    }),
    startGame: () => {
      welcomeMovieActive = false;
      player.isVictory = false;
      player.isCutsceneStar = false;
      victoryDelayTimer = 0;
      pendingRewardCard = null;
      rewardCard = null;
      rewardCardElapsed = 0;
      slowMoTimer = 0;
      engine.timeScale = 1.0;
      cameraCtrl.clearCinematic();
      sound.unlock();
      sound.setBgmMode('explore');
      phase = 'playing';
    },
    teleport: (x: number, y: number, z: number, yaw = Math.PI) => {
      starCutsceneTimer = 0;
      pendingRewardCard = null;
      rewardCard = null;
      player.isCutsceneStar = false;
      if (rainbowMovieActive) {
        finishRainbowBridgeMovie(true);
      } else {
        cameraCtrl.clearCinematic();
      }
      player.teleport(physics, new THREE.Vector3(x, y, z), yaw);
      cameraCtrl.resetBehind(player.pos, yaw);
    },
    setExpressionInspect: (expr: ExpressionName | null) => {
      inspectedExpression = expr;
      if (expr) buuView.setExpression(expr, true);
      return buuView.getBlushVisibility();
    },
    captureFaceWipePng: (expr: ExpressionName, size = 256) =>
      faceWipe.captureTransparentExpressionPng(expr, size),
    playAnimInspect: (anim: AnimName) => {
      buuView.playAnimation(anim, 0.05);
    },
    triggerFever: () => triggerFeverSequence(),
    clearFeverForTest: () => {
      fever.active = false;
      fever.meter = 0;
      fever.remainingSec = 0;
      feverBannerTimer = 0;
      engine.setFeverVisual(false, totalTime);
    },
    setFeverRemainingForTest: (sec: number) => {
      if (!fever.active) return;
      fever.remainingSec = Math.max(0, sec);
      fever.meter = Math.max(0, Math.min(100, (fever.remainingSec / fever.maxDuration) * 100));
    },
    isCameraCinematicActive: () => cameraCtrl.isCinematicActive(),
    getAudioStatus: () => sound.getExternalAudioStatus(),
    getEastDominoStats: () => blocks.getEastDominoStats(),
    getBowlingStats: () => ({
      knockedPins: blocks.knockedBowlingPinIds.size,
      tanksDefeated: tanksDefeatedCount,
      star3Unlocked,
    }),
    getEnvironmentStats: () => ({
      hdriLoaded: engine.hdriLoaded,
      n8aoEnabled: engine.n8aoEnabled,
      composerInitialized: engine.hasComposer(),
      shadowsEnabled: engine.renderer.shadowMap.enabled && skybox.sunLight.castShadow,
      faceWipe3dActive,
      faceWipeCloneCreated: faceWipe.hasClone(),
      resolvedQuality,
      cameraAutoFollow: cameraCtrl.autoFollow,
      grassClusters: grassField.clusterCount,
      grassMaxClusters: grassField.maxClusterCount,
      pbrTexturesLoaded: pbr.loadedCount,
      bossMood: engine.currentBossMood,
      ...worldProps.getStats(),
      drawCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles,
    }),
    whenAudioReady: () => sound.whenAudioReady(),
    completeTutorialAll: () => {
      welcomeMovieActive = false;
      rainbowMovieActive = false;
      rainbowMovieAct = 0;
      starCutsceneTimer = 0;
      pendingRewardCard = null;
      rewardCard = null;
      player.isCutsceneStar = false;
      tutorial.skipAll();
      cameraCtrl.clearCinematic();
      tutorialMarker.setTarget(null);
    },
    skipTutorialForTest: () => {
      welcomeMovieActive = false;
      rainbowMovieActive = false;
      rainbowMovieAct = 0;
      starCutsceneTimer = 0;
      pendingRewardCard = null;
      rewardCard = null;
      player.isCutsceneStar = false;
      tutorial.skipAll();
      cameraCtrl.clearCinematic();
      tutorialMarker.setTarget(null);
    },
    advanceTutorialForTest: (force = false) => handleTutorialAdvance(force),
    startWelcomeMovieForTest: () => startWelcomeMovie(),
    skipWelcomeMovieForTest: () => finishWelcomeMovie(true),
    getWelcomeMovieState: () => ({
      active: welcomeMovieActive,
      elapsed: welcomeMovieElapsed,
      canSkip: welcomeMovieElapsed >= WELCOME_SKIP_GUARD,
      played: welcomeMoviePlayed,
    }),
    getRainbowMovieState: () => ({
      active: rainbowMovieActive,
      elapsed: rainbowMovieElapsed,
      canSkip: rainbowMovieElapsed >= RAINBOW_SKIP_GUARD,
      act: rainbowMovieAct,
      title: rainbowMovieTitle,
      subtitle: rainbowMovieSubtitle,
    }),
    skipRainbowMovieForTest: () => finishRainbowBridgeMovie(true),
    setRainbowMovieElapsedForTest: (sec: number) => {
      if (rainbowMovieActive) {
        rainbowMovieElapsed = sec;
      }
    },
    openStep1IntroForTest: () => tutorial.openStep1Intro(),
    enterTutorialFeverStepForTest: () => {
      welcomeMovieActive = false;
      cameraCtrl.clearCinematic();
      tutorial.clearPending();
      tutorial.awaitingConfirm = false;
      tutorial.confirmStep = null;
      tutorial.checklist = [true, true, true, true, true, false, false];
      tutorial.step = 6;
      fever.active = false;
      fever.remainingSec = 0;
      fever.meter = 100;
    },
    enterTutorialTourForTest: () => {
      welcomeMovieActive = false;
      tutorial.clearPending();
      tutorial.awaitingConfirm = false;
      tutorial.confirmStep = null;
      tutorial.checklist = [true, true, true, true, true, true, false];
      tutorial.step = 7;
      tutorial.tourPage = 0;
      tutorial.confirmGuardTimer = tutorial.confirmGuardDuration;
      input.exitPointerLock();
      input.clearTouchState();
      startTourCamera();
    },
    getCameraPose: () => ({
      pos: engine.camera.position.toArray(),
      fov: engine.camera.fov,
      yaw: cameraCtrl.yaw,
      pitch: cameraCtrl.pitch,
    }),
    unlockAndCollectStar: (id: number) => {
      const s = collectibles.stars.find((x) => x.id === id);
      if (!s) return false;
      starCutsceneTimer = 0;
      pendingRewardCard = null;
      rewardCard = null;
      player.isCutsceneStar = false;
      if (rainbowMovieActive) {
        finishRainbowBridgeMovie(true);
      } else {
        cameraCtrl.clearCinematic();
      }
      s.unlocked = true;
      s.group.visible = true;
      if (s.revealRise) {
        s.group.position.copy(s.pos);
        s.group.scale.setScalar(1);
        s.revealRise = undefined;
      }
      player.teleport(physics, s.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), Math.PI);
      return true;
    },
    revealSecretStarForTest: (id: number) => Boolean(collectibles.revealSecretStar(id)),
    damagePlayerForTest: (amount = 1) => {
      player.invulnTimer = 0;
      return player.takeDamage(player.pos.clone().add(new THREE.Vector3(0, 0, -1)), amount);
    },
    fallOutForTest: () => {
      player.teleport(physics, new THREE.Vector3(player.pos.x, -16, player.pos.z), player.facingYaw);
    },
    setSettingsForTest: (partial: Partial<GameSettings>) => {
      settingsStore.update(partial);
      return settingsStore.get();
    },
    getSettings: () => settingsStore.get(),
    getSaveData: () => saveStore.get(),
    resetSaveForTest: () => {
      currentSaveData = saveStore.reset();
      writeCheckpointGuideSeen(false);
      checkpointGuideShown = false;
      clearRunBonusHpSidecar();
      return currentSaveData;
    },
    openWorldSelectForTest: () => {
      phase = 'world_select';
    },
    getActiveWorldId: () => activeWorldId,
    selectWorldForTest: (worldId: WorldId, startPlaying = true) => {
      if (!isValidWorldId(worldId)) return false;
      selectAndStartWorld(worldId, startPlaying);
      return true;
    },
    triggerTouchModeForTest: (mode: GameSettings['showTouchControlsOverride']) => {
      settingsStore.update({ showTouchControlsOverride: mode });
      if (mode === 'on') input.setTouchDeviceActive();
    },
    getBossDetails: () => ({
      engaged: bossEngaged,
      defeated: bossDefeated,
      hp: boss.hp,
      phase: boss.phase,
      state: boss.state,
      arenaUnlocked: isBossArenaUnlocked(),
      physicallyLocked: gimmicks.isBossArenaPhysicallyLocked(),
      mainStarsCollected: getMainStarsCollectedCount(),
      ...boss.getAttackCycleDebug(),
    }),
    triggerBossStunForTest: () => {
      bossEngaged = true;
      boss.startFight();
      boss.state = 'stunned';
    },
    hitBossWeakForTest: () => {
      if (boss.state !== 'stunned') boss.state = 'stunned';
      boss.hitWeakPoint(onBossWeakHit);
    },
    openChestForTest: () => {
      bossDefeated = true;
      const chestPos = new THREE.Vector3(...activeWorldConfig.victoryChestPos);
      gimmicks.spawnVictoryChest(chestPos);
      player.teleport(physics, chestPos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.15);
    },
    getPwaState: () => screens.getPwaState(),
    getBootState: () => ({
      state: bootLoaderState,
      done: bootLoaderDone,
      awaitingTap: bootTapPending,
      isMobile: isMobileBoot,
    }),
    getBgmState: () => sound.getBgmState(),
  };

  function restoreSavedRunForActiveWorld(): void {
    clearTransientGameplayLocks();
    const run = currentSaveData.worlds[activeWorldId]?.run;
    if (currentSaveData.tutorialCompleted || run?.active || activeWorldId !== 'world1') {
      welcomeMoviePlayed = true;
      tutorial.skipAll();
      tutorialMarker.setTarget(null);
    } else {
      welcomeMoviePlayed = false;
      tutorial.reset();
      tutorialMarker.setTarget(null);
    }

    if (!run || !run.active) {
      clearRunBonusHpSidecar(activeWorldId);
    }

    if (run && run.active) {
      for (const starId of run.collectedStarIds) {
        collectibles.markStarCollectedSilent(starId);
      }
      if (run.star3Unlocked || run.collectedStarIds.includes(3)) {
        star3Unlocked = true;
        collectibles.unlockStar(3);
      }
      const mainCollected = collectibles.stars.filter((s) => s.kind === 'main' && s.collected).length;
      if (mainCollected >= 3) {
        gimmicks.updateGateStars(3);
        gimmicks.openRainbowBridge(true);
      } else {
        gimmicks.updateGateStars(mainCollected);
      }
      for (const idx of run.activatedCheckpointIndices) {
        gimmicks.activateCheckpointSilent(idx);
      }
      if (run.activatedCheckpointIndices.length > 0) {
        checkpointGuideShown = true;
        writeCheckpointGuideSeen(true);
      }
      if (run.checkpoint) {
        const cpPos = new THREE.Vector3(run.checkpoint.x, run.checkpoint.y, run.checkpoint.z);
        const cpYaw = Number.isFinite(run.checkpoint.yaw) ? run.checkpoint.yaw : Math.PI;
        player.setCheckpoint(cpPos, cpYaw);
        player.teleport(physics, cpPos, cpYaw);
        cameraCtrl.resetBehind(cpPos, cpYaw);
      }

      const hasAllSecretStarsInRun = [4, 5, 6].every((id) => run.collectedStarIds.includes(id));
      if (hasAllSecretStarsInRun) {
        player.setMaxHp(4, false);
      }
      const sidecar = readRunBonusHpSidecar(activeWorldId);
      if (sidecar && (sidecar.updatedAt === run.updatedAt || !run.updatedAt)) {
        player.setMaxHp(sidecar.maxHp, false);
        player.hp = Math.max(1, Math.min(player.maxHp, Math.round(sidecar.hp)));
      } else if (hasAllSecretStarsInRun && run.hp >= 3) {
        player.hp = player.maxHp;
      } else {
        player.hp = Math.max(1, Math.min(player.maxHp, Math.round(run.hp || player.maxHp)));
      }
      player.damageTakenCount = Math.max(0, Math.round(run.damageTakenCount || 0));
      coinsCollected = Math.max(0, Math.round(run.coins || 0));
      score = Math.max(0, Math.round(run.score || 0));
      fever.meter = Math.max(0, Math.min(100, run.feverMeter || 0));
      elapsedPlaySec = Math.max(0, run.elapsedSec || 0);

      if (mainCollected >= 3 && run.bossDefeated) {
        bossDefeated = true;
        bossEngaged = false;
        boss.state = 'dormant';
        boss.group.visible = false;
        gimmicks.victoryChest.opened = false;
        gimmicks.victoryChest.openProgress = 0;
        const chestPos = new THREE.Vector3(...activeWorldConfig.victoryChestPos);
        gimmicks.spawnVictoryChest(chestPos);
        const chestDist = Math.hypot(player.pos.x - chestPos.x, player.pos.z - chestPos.z);
        const bossCutZ = activeWorldId === 'world1' ? -25.0 : -33.0;
        if (chestDist < 5.0 || player.pos.z < bossCutZ) {
          const safe = activeWorldConfig.safeGateCheckpoint;
          const safePos = new THREE.Vector3(safe.x, safe.y, safe.z);
          player.setCheckpoint(safePos, safe.yaw);
          player.teleport(physics, safePos, safe.yaw);
          cameraCtrl.resetBehind(safePos, safe.yaw);
        }
      }
      resumedFromSaveNoticePending = true;
    }
  }

  function restoreSavedProgressOnBoot(): void {
    restoreSavedRunForActiveWorld();

    try {
      const autoNew = window.sessionStorage.getItem('manmarubuu_autostart_new') === '1';
      const autoPlay = window.sessionStorage.getItem('manmarubuu_autostart_play') === '1';
      if (autoNew) {
        window.sessionStorage.removeItem('manmarubuu_autostart_new');
        bootTapPending = false;
        startPlayFromTitle();
      } else if (autoPlay) {
        window.sessionStorage.removeItem('manmarubuu_autostart_play');
        bootTapPending = false;
        startPlayFromTitle();
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }

  restoreSavedProgressOnBoot();
  updateBootLoader(98, 'もうすぐ はじまるよ！');
  requestAnimationFrame(frame);
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
  showBootError('よみこみに しっぱいしました。', err);
});

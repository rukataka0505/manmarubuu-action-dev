import type {
  FaceWipe3dMode,
  GamePhase,
  GameSettings,
  HudSnapshot,
  InputDevice,
  QualityPreset,
  ResolvedQuality,
  StampId,
  WorldId,
} from '../types';
import {
  WORLD1_STAMPS,
  WORLD_CATALOG,
  createEmptyWorldProgress,
  getWorldStamps,
} from '../core/SaveStore';
import { FACE_WIPE_SPRITE_URLS, preloadBuuFaceSprites } from './BuuFaceSprite';
import { PwaInstallPrompt, type PwaDebugState } from './PwaInstallPrompt';

export interface ScreensHandlers {
  onStartGame: () => void;
  onSelectWorld: (worldId: WorldId) => void;
  onResetSaveAndNewGame: () => void;
  onOpenWorldSelect: () => void;
  onBackToTitle: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onRetryFromCheckpoint: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onUiClick?: () => void;
}

/* ------------------------------------------------------------------
 * Vector art helpers (original art, no external assets)
 * ------------------------------------------------------------------ */

/** 5-point star path centred on (cx, cy). */
function starPath(cx: number, cy: number, r: number, inner = 0.48): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)} `;
  }
  return `${d}Z`;
}

/** 4-point twinkle sparkle path. */
function sparklePath(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return (
    `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} ` +
    `Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} ` +
    `Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
  );
}

function goldStar(cx: number, cy: number, r: number, cls: string, delay: number): string {
  return `
    <g class="${cls}" style="animation-delay:${delay}s">
      <path d="${starPath(cx, cy + r * 0.12, r)}" fill="#c9861c"/>
      <path d="${starPath(cx, cy, r)}" fill="url(#mmbStarGrad)" stroke="#e8a41f" stroke-width="${(r * 0.12).toFixed(1)}" stroke-linejoin="round"/>
      <ellipse cx="${cx - r * 0.22}" cy="${cy - r * 0.2}" rx="${r * 0.2}" ry="${r * 0.12}" fill="#fffbe0" opacity="0.85" transform="rotate(-30 ${cx - r * 0.22} ${cy - r * 0.2})"/>
    </g>`;
}

/** Plush stitched MANMARUBUU logo with stars and sparkles (paired with real 3D Buu sprite). */
function buildLogoSvg(): string {
  const rise = [0, 7.1, 12.4, 16, 17.8, 17.8, 16, 12.4, 7.1, 0];
  const dy = rise.map((r, i) => (i === 0 ? 0 : -(r - rise[i - 1])).toFixed(1)).join(' ');
  const rot = [-9, -5, -4, -1, -2, 2, 1, 5, 3, 9].join(' ');
  const text = (id: string) =>
    `<text id="${id}" x="450" y="218" text-anchor="middle" dy="${dy}" rotate="${rot}" textLength="780" lengthAdjust="spacingAndGlyphs" font-family="Fredoka, 'M PLUS Rounded 1c', sans-serif" font-weight="700" font-size="132" letter-spacing="2">MANMARUBUU</text>`;

  const sparkles = [
    [96, 128, 9], [250, 58, 7], [330, 26, 5], [560, 34, 6], [600, 280, 7],
    [300, 270, 6], [866, 230, 8], [36, 244, 6], [830, 136, 5], [470, 290, 5],
  ]
    .map(
      ([x, y, r], i) =>
        `<path class="mmb-sparkle" style="animation-delay:${(i * 0.37).toFixed(2)}s" d="${sparklePath(x, y, r)}" fill="#fffbe6"/>`
    )
    .join('');
  const dots = [
    [150, 250, 4], [210, 275, 3], [400, 285, 4], [690, 270, 3.5], [770, 262, 3],
    [60, 90, 3], [880, 60, 3], [520, 18, 2.5], [420, 40, 3], [880, 180, 2.5],
  ]
    .map(
      ([x, y, r], i) =>
        `<circle class="mmb-glowdot" style="animation-delay:${(i * 0.29).toFixed(2)}s" cx="${x}" cy="${y}" r="${r}" fill="url(#mmbGlowDot)"/>`
    )
    .join('');

  return `
  <svg class="mmb-logo" viewBox="0 0 900 310" aria-label="MANMARUBUU" role="img">
    <defs>
      ${text('mmbLogoText')}
      <clipPath id="mmbLogoClip"><use href="#mmbLogoText"/></clipPath>
      <linearGradient id="mmbPinkGrad" x1="0" y1="90" x2="0" y2="225" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffb3c8"/>
        <stop offset="55%" stop-color="#f6799b"/>
        <stop offset="100%" stop-color="#e2547c"/>
      </linearGradient>
      <linearGradient id="mmbStarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff07a"/>
        <stop offset="100%" stop-color="#ffbe1f"/>
      </linearGradient>
      <linearGradient id="mmbShine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="50%" stop-color="#fff" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="mmbGlowDot">
        <stop offset="0%" stop-color="#fffef0"/>
        <stop offset="45%" stop-color="#ffe9a0" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#ffd76a" stop-opacity="0"/>
      </radialGradient>
    </defs>

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
      <ellipse cx="450" cy="128" rx="440" ry="30" fill="#fff" opacity="0.28"/>
      <rect class="mmb-shine" x="-160" y="60" width="120" height="200" fill="url(#mmbShine)" transform="skewX(-20)"/>
    </g>

    ${goldStar(120, 66, 30, 'mmb-star', 0)}
    ${goldStar(196, 34, 18, 'mmb-star', 0.6)}
    ${goldStar(848, 92, 24, 'mmb-star', 0.3)}
    ${goldStar(44, 176, 13, 'mmb-star', 1.1)}
    ${goldStar(872, 262, 14, 'mmb-star', 0.9)}
    ${goldStar(612, 30, 12, 'mmb-star', 1.4)}
    ${sparkles}
    ${dots}
  </svg>`;
}

function buildSleepyBuu(): string {
  return `
  <div class="pause-buu-stage" aria-hidden="true">
    <img class="pause-buu-img" src="${FACE_WIPE_SPRITE_URLS.Sleep}" alt="" decoding="async" />
    <span class="pause-z z1">Z</span>
    <span class="pause-z z2">z</span>
    <span class="pause-z z3">z</span>
  </div>`;
}

function buildPienBuu(): string {
  return `
  <div class="pien-buu-stage" aria-hidden="true">
    <img class="pien-buu-img" src="${FACE_WIPE_SPRITE_URLS.Pien}" alt="" decoding="async" />
  </div>`;
}

function buildRankRing(): string {
  let stars = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 11 : 7;
    stars += `<path d="${starPath(Math.cos(a) * 92, Math.sin(a) * 92, r)}" fill="${i % 2 === 0 ? '#ffd83a' : '#fff6c4'}" stroke="#e39b16" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  return `
  <svg class="rank-ring" viewBox="-110 -110 220 220" aria-hidden="true">
    <circle r="92" fill="none" stroke="#ffe9a8" stroke-width="2" stroke-dasharray="3 7" opacity="0.9"/>
    ${stars}
  </svg>`;
}

function buildConfetti(count: number): string {
  const colors = ['#ff7fa3', '#ffd83a', '#6fd3ff', '#7ee08f', '#c99bff', '#ff9b5c'];
  let html = '';
  for (let i = 0; i < count; i++) {
    const x = ((i * 37) % 100) + (i % 3) * 0.7;
    const dur = 3.2 + ((i * 13) % 17) / 10;
    const delay = -((i * 7) % 29) / 7;
    const sway = ((i % 5) - 2) * 18;
    const shape = i % 3 === 0 ? 'round' : i % 3 === 1 ? 'strip' : 'star';
    html += `<i class="confetti ${shape}" style="--x:${x.toFixed(1)}%;--d:${dur.toFixed(2)}s;--dl:${delay.toFixed(2)}s;--sw:${sway}px;--c:${colors[i % colors.length]}"></i>`;
  }
  return `<div class="confetti-layer" aria-hidden="true">${html}</div>`;
}

function buildBokeh(count: number): string {
  let html = '';
  for (let i = 0; i < count; i++) {
    const x = (i * 61) % 100;
    const size = 6 + ((i * 7) % 5) * 3;
    const dur = 7 + ((i * 11) % 7);
    const delay = -((i * 5) % 13);
    html += `<i style="--x:${x}%;--s:${size}px;--d:${dur}s;--dl:${delay}s"></i>`;
  }
  return `<div class="title-bokeh" aria-hidden="true">${html}</div>`;
}

function qualityLabelJa(q: ResolvedQuality): string {
  if (q === 'high') return '高';
  if (q === 'low') return '軽量';
  return '標準';
}

function buildControlsTableHtml(device: InputDevice): string {
  const rows: Array<[string, string]> =
    device === 'gamepad'
      ? [
          ['左スティック', '移動・ダッシュ体当たり'],
          ['右スティック', 'カメラ回転'],
          ['A ボタン', 'ジャンプ ／ 2段ジャンプ ／ 踏みつけ'],
          ['空中で B ボタン', 'ヒップドロップ（箱・積み木・ボス弱点）'],
          ['LB / RB', 'FEVER x8! 発動（ゲージ100%時）'],
          ['START', 'ポーズ'],
        ]
      : device === 'touch'
        ? [
            ['左半分ドラッグ（ぷにコン）', '移動・ダッシュ（両手同時OK）'],
            ['右半分タップ（1〜2回）', 'ジャンプ ／ 2段ジャンプ ／ 踏みつけ'],
            ['空中で3回目タップ', 'ヒップドロップ（箱・ボス弱点）'],
            ['右半分ドラッグ ／ 上スワイプ', 'カメラ回転（走りながらOK）'],
            ['右上 FEVER ゲージ / ボタン', '満タン（READY!）時にタップで発動（8倍）'],
            ['右上 ⏸ ポーズ', 'ポーズ・スタンプ確認・設定'],
          ]
        : [
            ['W A S D', '移動・ダッシュ体当たり'],
            ['マウス ／ 矢印キー', 'カメラ回転'],
            ['Space', 'ジャンプ ／ 2段ジャンプ ／ 踏みつけ'],
            ['空中で Ctrl / 右クリック', 'ヒップドロップ（箱・積み木・ボス弱点）'],
            ['Q キー / FEVER ボタン', 'FEVER x8! 発動（ゲージ100%時）'],
            ['Esc / P', 'ポーズ'],
          ];

  return rows
    .map(
      ([key, desc]) =>
        `<div class="controls-row"><span class="controls-key">${key}</span><span class="controls-desc">${desc}</span></div>`
    )
    .join('');
}

/* ------------------------------------------------------------------ */

export class ScreensManager {
  private titleScreen: HTMLDivElement;
  private worldSelectScreen: HTMLDivElement;
  private pauseScreen: HTMLDivElement;
  private gameOverScreen: HTMLDivElement;
  private resultScreen: HTMLDivElement;
  private settingsModal: HTMLDivElement;
  private controlsModal: HTMLDivElement;
  private resetConfirmModal: HTMLDivElement;
  private portraitOverlay: HTMLDivElement;
  private cutsceneBars: HTMLDivElement;
  private pwaPrompt: PwaInstallPrompt;

  // Title refs
  private titleMainStarsEl: HTMLSpanElement;
  private titleSecretStarsEl: HTMLSpanElement;
  private titleStampsEl: HTMLSpanElement;
  private titleHighScoreEl: HTMLSpanElement;
  private titleResumeBadgeEl: HTMLSpanElement;
  private titlePlayBtnLabelEl: HTMLSpanElement;
  private titleNewGameBtn: HTMLButtonElement;
  private titlePwaBtn: HTMLButtonElement;

  // World select refs (per playable world)
  private wsCardRefs = new Map<
    WorldId,
    {
      cardEl: HTMLDivElement;
      mainEl: HTMLSpanElement;
      secretEl: HTMLSpanElement;
      highScoreEl: HTMLSpanElement;
      rankEl: HTMLSpanElement;
      stampsEl: HTMLDivElement;
      playLabelEl: HTMLSpanElement;
    }
  >();

  // Victory header refs
  private resStampTitleEl: HTMLDivElement;

  // Settings refs
  private autoFollowBtns: HTMLButtonElement[];
  private qualityBtns: HTMLButtonElement[];
  private qualityResolvedEl: HTMLSpanElement;
  private faceWipe3dBtns: HTMLButtonElement[];
  private faceWipeResolvedEl: HTMLSpanElement;
  private sensSlider: HTMLInputElement;
  private sensValEl: HTMLSpanElement;
  private soundBtns: HTMLButtonElement[];
  private showFpsBtns: HTMLButtonElement[];
  private settingsResetSaveBtn: HTMLButtonElement;

  // Controls modal refs
  private controlsTabBtns: HTMLButtonElement[];
  private controlsBodyEl: HTMLDivElement;

  // Pause stamp refs
  private pauseStampsCountEl: HTMLSpanElement;
  private pauseStampsGridEl: HTMLDivElement;
  private pauseStampDetailEl: HTMLDivElement;
  private selectedPauseStampId: StampId | null = null;

  // GameOver refs
  private goPenaltyCoinsEl: HTMLSpanElement;
  private goPenaltyScoreEl: HTMLSpanElement;
  private goBossNoteEl: HTMLDivElement;

  // Result refs
  private rankStage: HTMLDivElement;
  private resBuuImgEl: HTMLImageElement;
  private resRankEl: HTMLDivElement;
  private resScoreEl: HTMLSpanElement;
  private resNewRecordEl: HTMLSpanElement;
  private resStarsEl: HTMLSpanElement;
  private resSecretStarsEl: HTMLSpanElement;
  private resCoinsEl: HTMLSpanElement;
  private resDmgEl: HTMLSpanElement;
  private resStampsEl: HTMLDivElement;

  // State & dirty caches
  private settingsOpen = false;
  private controlsOpen = false;
  private resetConfirmOpen = false;
  private returnToSettingsOnCancel = false;
  private checkedPwaAutoOpen = false;
  private activeControlsTab: InputDevice = 'kbm';
  private isDraggingSens = false;
  private lastPhase: GamePhase | null = null;
  private lastTitleVisible: boolean | null = null;
  private lastPortraitBlocked: boolean | null = null;
  private lastInputDevice: InputDevice = 'kbm';
  private lastTitleSaveKey = '';
  private lastWsSaveKey = '';
  private lastSaveButtonKey = '';
  private lastSettingsKey = '';
  private lastPauseStampKey = '';
  private lastGameOverKey = '';
  private lastVictoryKey = '';

  constructor(container: HTMLElement, handlers: ScreensHandlers) {
    preloadBuuFaceSprites();
    // Cutscene bars
    this.cutsceneBars = document.createElement('div');
    this.cutsceneBars.className = 'cutscene-bars';
    this.cutsceneBars.innerHTML = `
      <div class="cutscene-bar top"></div>
      <div class="cutscene-bar bottom"></div>
    `;
    container.appendChild(this.cutsceneBars);

    // 1. Title Screen
    this.titleScreen = document.createElement('div');
    this.titleScreen.className = 'overlay-screen hidden title-screen';
    this.titleScreen.innerHTML = `
      ${buildBokeh(16)}
      <div class="title-logo-wrap">
        <div class="title-logo-stage">
          <img class="title-logo-buu" src="${FACE_WIPE_SPRITE_URLS.Happy}" alt="" decoding="async" />
          ${buildLogoSvg()}
        </div>
        <div class="logo-sub"><span>まんまるぶう：おもちゃばこ大暴走！</span></div>
      </div>
      <div class="title-progress-bar" data-role="title-progress">
        <span class="tp-badge" data-role="title-main-stars">⭐ 0/3</span>
        <span class="tp-badge" data-role="title-secret-stars">💎 0/3</span>
        <span class="tp-badge" data-role="title-stamps">🏆 0/5</span>
        <span class="tp-badge tp-score" data-role="title-highscore">🏅 0 pts</span>
        <span class="tp-badge tp-resume hidden" data-role="title-resume-badge">💾 チェックポイント再開可</span>
      </div>
      <button class="play-btn title-play" data-role="play-btn" type="button"><span class="btn-label" data-role="play-btn-label">▶ あそぶ！ / PLAY</span></button>
      <div class="title-sub-actions">
        <button class="mini-btn stitch-mini title-newgame-btn hidden" data-role="title-newgame-btn" type="button">🔄 はじめから</button>
        <button class="mini-btn stitch-mini" data-role="world-select-btn" type="button">🗺️ ワールドセレクト</button>
        <button class="mini-btn stitch-mini" data-role="title-settings-btn" type="button">⚙️ せってい</button>
        <button class="mini-btn stitch-mini pwa-title-btn hidden" data-role="title-pwa-install-btn" type="button">📲 ホーム画面に追加</button>
      </div>
      <div class="title-hints">
        <div>WASD / 左スティック：移動　｜　マウス / 右スティック：カメラ　｜　Space / A：2段ジャンプ＆踏みつけ</div>
        <div>Ctrl / 右クリック / B：ヒップドロップ　｜　Q / LB：FEVER x8!</div>
      </div>
    `;
    container.appendChild(this.titleScreen);

    // 2. World Select Screen
    const worldCardsHtml = WORLD_CATALOG.map((w) => {
      if (w.playable) {
        const wid = `w${w.id}`;
        return `
          <div class="world-card world-card-playable" data-world-key="${w.worldKey}" style="--world-accent:${w.themeColor}">
            <div class="world-card-head">
              <div class="world-card-sub">${w.subtitle}</div>
              <div class="world-card-title">${w.name}</div>
            </div>
            <p class="world-card-desc">${w.description}</p>
            <div class="world-card-stats">
              <span class="ws-chip" data-role="ws-${wid}-main">⭐ 0/${w.mainStars}</span>
              <span class="ws-chip" data-role="ws-${wid}-secret">💎 0/${w.secretStars}</span>
              <span class="ws-chip" data-role="ws-${wid}-score">🏅 0 pts</span>
              <span class="ws-chip ws-rank" data-role="ws-${wid}-rank">RANK -</span>
            </div>
            <div class="ws-mini-stamps" data-role="ws-${wid}-stamps"></div>
            <button class="play-btn btn-sm" data-role="select-world-${w.id}-btn" data-select-world="${w.worldKey}" type="button"><span class="btn-label" data-role="ws-${wid}-play-label">▶ このワールドであそぶ！</span></button>
          </div>
        `;
      }
      return `
        <div class="world-card locked" style="--world-accent:${w.themeColor}">
          <div class="world-badge-soon">🔒 Coming Soon</div>
          <div class="world-card-head">
            <div class="world-card-sub">${w.subtitle}</div>
            <div class="world-card-title">${w.name}</div>
          </div>
          <p class="world-card-desc">${w.description}</p>
          <div class="world-card-stats">
            <span class="ws-chip muted">⭐ 0/${w.mainStars}</span>
            <span class="ws-chip muted">💎 0/${w.secretStars}</span>
          </div>
          <button class="mini-btn world-locked-btn" type="button" disabled>🔒 じゅんびちゅう</button>
        </div>
      `;
    }).join('');

    this.worldSelectScreen = document.createElement('div');
    this.worldSelectScreen.className = 'overlay-screen hidden world-select-screen';
    this.worldSelectScreen.innerHTML = `
      <div class="result-card world-select-card">
        <div class="result-title"><span>🗺️ ワールドセレクト</span></div>
        <div class="world-grid">${worldCardsHtml}</div>
        <div class="ws-footer">
          <button class="mini-btn stitch-mini" data-role="ws-back-btn" type="button">◀ タイトルへ戻る</button>
        </div>
      </div>
    `;
    container.appendChild(this.worldSelectScreen);

    // 3. Pause Screen
    this.pauseScreen = document.createElement('div');
    this.pauseScreen.className = 'overlay-screen hidden pause-screen';
    this.pauseScreen.innerHTML = `
      <div class="result-card pause-card">
        <div class="result-title"><span>ちょっと休憩タイム</span></div>
        <div class="pause-top-row">
          ${buildSleepyBuu()}
          <button class="play-btn btn-md" data-role="resume-btn" type="button"><span class="btn-label">▶ つづける</span></button>
        </div>
        <div class="pause-stamps-section">
          <div class="pause-stamps-head">
            <span class="pause-stamps-title">🏆 スタンプ達成状況</span>
            <span class="pause-stamps-count" data-role="pause-stamps-count">0 / 5</span>
          </div>
          <div class="pause-stamp-grid" data-role="pause-stamps-grid"></div>
          <div class="pause-stamp-detail" data-role="pause-stamp-detail">⭐ 0/3　💎 0/3　🪙 0まい（タップで条件表示）</div>
        </div>
        <div class="pause-actions">
          <button class="mini-btn stitch-mini" data-role="pause-controls-btn" type="button">📖 操作＆ルールガイド</button>
          <button class="mini-btn stitch-mini" data-role="pause-settings-btn" type="button">⚙️ せってい</button>
          <button class="mini-btn stitch-mini" data-role="pause-restart-btn" type="button">最初からやり直す</button>
          <button class="mini-btn stitch-mini" data-role="pause-title-btn" type="button">タイトルへ戻る</button>
        </div>
      </div>
    `;
    container.appendChild(this.pauseScreen);

    // 4. Game Over Screen
    this.gameOverScreen = document.createElement('div');
    this.gameOverScreen.className = 'overlay-screen hidden gameover-screen';
    this.gameOverScreen.innerHTML = `
      <div class="result-card gameover-card">
        <div class="result-title gameover-ribbon"><span>💦 ぶう、ダウンしちゃった…</span></div>
        <div class="gameover-hero">
          ${buildPienBuu()}
          <div class="gameover-copy">
            <div class="gameover-msg">でもだいじょうぶ！<br>チェックポイントからもう一回チャレンジしよう！</div>
            <div class="gameover-penalty">
              <span class="penalty-pill" data-role="gameover-penalty-coins">🪙 コイン -0</span>
              <span class="penalty-pill" data-role="gameover-penalty-score">🏅 スコア -0 pts</span>
            </div>
            <div class="gameover-boss-note hidden" data-role="gameover-boss-note">⚙️ ボス戦は最初からやり直しになります</div>
          </div>
        </div>
        <button class="play-btn btn-md" data-role="gameover-retry-btn" type="button"><span class="btn-label">▶ チェックポイントから再開</span></button>
        <div class="gameover-actions">
          <button class="mini-btn stitch-mini" data-role="gameover-restart-btn" type="button">最初からやり直す</button>
          <button class="mini-btn stitch-mini" data-role="gameover-title-btn" type="button">タイトルへ戻る</button>
        </div>
      </div>
    `;
    container.appendChild(this.gameOverScreen);

    // 5. Result Screen (no clear time row!)
    this.resultScreen = document.createElement('div');
    this.resultScreen.className = 'overlay-screen hidden result-screen';
    this.resultScreen.innerHTML = `
      ${buildConfetti(28)}
      <div class="result-card victory-card">
        <div class="result-title"><span>🎉 おもちゃばこ大解放クリア！</span></div>
        <div class="victory-hero">
          <div class="rank-stage" data-rank="S">
            <div class="rank-rays"></div>
            ${buildRankRing()}
            <div class="rank-medal">
              <div class="result-rank" data-role="res-rank">S</div>
            </div>
            <div class="rank-caption">RANK</div>
          </div>
          <img class="victory-buu-img" data-role="res-buu-img" src="${FACE_WIPE_SPRITE_URLS.Fever}" alt="まんまるぶう" decoding="async" />
        </div>
        <div class="result-stats">
          <div class="stat-row">
            <span class="stat-ico">🏅</span>
            <span class="stat-label">スコア</span>
            <span class="stat-val-wrap">
              <span class="new-record-badge hidden" data-role="res-new-record">NEW RECORD!</span>
              <span class="stat-val" data-role="res-score">0 pts</span>
            </span>
          </div>
          <div class="stat-row"><span class="stat-ico">⭐</span><span class="stat-label">メインスター</span><span class="stat-val" data-role="res-stars">3 / 3</span></div>
          <div class="stat-row"><span class="stat-ico">💎</span><span class="stat-label">隠しスター</span><span class="stat-val" data-role="res-secret-stars">0 / 3</span></div>
          <div class="stat-row"><span class="stat-ico">🪙</span><span class="stat-label">コイン</span><span class="stat-val" data-role="res-coins">0 まい</span></div>
          <div class="stat-row"><span class="stat-ico">💗</span><span class="stat-label">うけたダメージ</span><span class="stat-val" data-role="res-dmg">0 回</span></div>
        </div>
        <div class="stamp-section">
          <div class="stamp-section-title" data-role="res-stamp-title">🏆 ワールド1 スタンプ</div>
          <div class="stamp-grid" data-role="res-stamps"></div>
        </div>
        <div class="result-actions">
          <button class="play-btn btn-md" data-role="replay-btn" type="button"><span class="btn-label">★ もういっかい！</span></button>
          <button class="mini-btn stitch-mini" data-role="res-ws-btn" type="button">🗺️ ワールドセレクト</button>
        </div>
      </div>
    `;
    container.appendChild(this.resultScreen);

    // 6. Settings Modal
    this.settingsModal = document.createElement('div');
    this.settingsModal.className = 'modal-backdrop hidden';
    this.settingsModal.dataset.role = 'settings-modal';
    this.settingsModal.innerHTML = `
      <div class="result-card modal-card settings-card">
        <div class="result-title"><span>⚙️ せってい</span></div>
        <div class="settings-list">
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-name">カメラ自動追従</div>
              <div class="setting-desc">移動にあわせてカメラが自動でうしろに回るよ</div>
            </div>
            <div class="seg-group">
              <button class="seg-btn" type="button" data-setting="auto-follow" data-value="on">ON</button>
              <button class="seg-btn" type="button" data-setting="auto-follow" data-value="off">OFF</button>
            </div>
          </div>

          <div class="setting-row setting-row-col">
            <div class="setting-info-row">
              <div class="setting-name">画質プリセット</div>
              <span class="quality-resolved-badge" data-role="quality-resolved-label">自動適用中：標準</span>
            </div>
            <div class="seg-group seg-group-4">
              <button class="seg-btn" type="button" data-setting="quality" data-value="auto">自動</button>
              <button class="seg-btn" type="button" data-setting="quality" data-value="high">高</button>
              <button class="seg-btn" type="button" data-setting="quality" data-value="medium">標準</button>
              <button class="seg-btn" type="button" data-setting="quality" data-value="low">軽量</button>
            </div>
          </div>

          <div class="setting-row setting-row-col">
            <div class="setting-info-row">
              <div class="setting-name">3D 顔ワイプ</div>
              <span class="quality-resolved-badge" data-role="face-wipe-resolved-label">自動適用中：3D</span>
            </div>
            <div class="seg-group seg-group-3">
              <button class="seg-btn" type="button" data-setting="face-wipe-3d" data-value="auto">自動</button>
              <button class="seg-btn" type="button" data-setting="face-wipe-3d" data-value="on">ON</button>
              <button class="seg-btn" type="button" data-setting="face-wipe-3d" data-value="off">OFF</button>
            </div>
          </div>

          <div class="setting-row setting-row-col">
            <div class="setting-info-row">
              <div class="setting-name">カメラ感度</div>
              <span class="sens-val" data-role="sens-val">1.00x</span>
            </div>
            <div class="sens-row">
              <span class="sens-edge">ゆっくり</span>
              <input class="sens-slider" type="range" min="0.4" max="2.0" step="0.05" value="1.0" data-role="sens-slider" />
              <span class="sens-edge">はやい</span>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-name">サウンド（BGM・効果音）</div>
            </div>
            <div class="seg-group">
              <button class="seg-btn" type="button" data-setting="sound" data-value="on">ON</button>
              <button class="seg-btn" type="button" data-setting="sound" data-value="off">OFF</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-name">FPS 表示</div>
              <div class="setting-desc">画面のすみにフレームレートを表示するよ</div>
            </div>
            <div class="seg-group">
              <button class="seg-btn" type="button" data-setting="show-fps" data-value="on">ON</button>
              <button class="seg-btn" type="button" data-setting="show-fps" data-value="off">OFF</button>
            </div>
          </div>

          <div class="setting-row setting-row-danger">
            <div class="setting-info">
              <div class="setting-name">セーブデータ</div>
              <div class="setting-desc">セーブを消して最初のムービーから新しく遊ぶよ</div>
            </div>
            <button class="mini-btn danger-mini-btn" type="button" data-role="settings-reset-save-btn">🔄 はじめから</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="play-btn btn-sm" data-role="settings-close-btn" type="button"><span class="btn-label">✕ とじる</span></button>
        </div>
      </div>
    `;
    container.appendChild(this.settingsModal);

    // 7. Controls & Rules Guide Modal
    this.controlsModal = document.createElement('div');
    this.controlsModal.className = 'modal-backdrop hidden';
    this.controlsModal.dataset.role = 'controls-modal';
    this.controlsModal.innerHTML = `
      <div class="result-card modal-card controls-card">
        <div class="result-title"><span>📖 操作＆ルールガイド</span></div>
        <div class="controls-tabs">
          <button class="controls-tab active" type="button" data-device-tab="kbm">⌨️ キーボード</button>
          <button class="controls-tab" type="button" data-device-tab="gamepad">🎮 ゲームパッド</button>
          <button class="controls-tab" type="button" data-device-tab="touch">📱 スマホ</button>
        </div>
        <div class="controls-table" data-role="controls-body">${buildControlsTableHtml('kbm')}</div>
        <div class="rules-box">
          <div class="rules-title">✨ ゲームのながれ</div>
          <div class="rules-flow">
            <div class="rules-step">
              <div class="rules-num">①</div>
              <div class="rules-ico">⭐</div>
              <div class="rules-txt">メインスターを<br><strong>3個</strong>あつめよう</div>
            </div>
            <div class="rules-arrow">➜</div>
            <div class="rules-step">
              <div class="rules-num">②</div>
              <div class="rules-ico">🌈</div>
              <div class="rules-txt"><strong>虹の橋</strong>が<br>かかるよ！</div>
            </div>
            <div class="rules-arrow">➜</div>
            <div class="rules-step">
              <div class="rules-num">③</div>
              <div class="rules-ico">⚙️🎁</div>
              <div class="rules-txt">ボス撃破＆<br><strong>宝箱</strong>をゲット！</div>
            </div>
          </div>
          <div class="rules-star-notes">
            <div class="rules-main-note">⭐ <strong>金のスター</strong>：3個あつめると<strong>虹の橋</strong>が開くよ！</div>
            <div class="rules-secret-note">💎 <strong>青いひみつスター</strong>：コースのどこかに3つ隠れているよ。全部集めるといいことあるかも…？</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="play-btn btn-sm" data-role="controls-close-btn" type="button"><span class="btn-label">✕ とじる</span></button>
        </div>
      </div>
    `;
    container.appendChild(this.controlsModal);

    // 8. Reset Save Confirm Modal
    this.resetConfirmModal = document.createElement('div');
    this.resetConfirmModal.className = 'modal-backdrop hidden reset-confirm-backdrop';
    this.resetConfirmModal.dataset.role = 'reset-confirm-modal';
    this.resetConfirmModal.innerHTML = `
      <div class="result-card modal-card reset-confirm-card">
        <div class="result-title"><span>⚠️ はじめからやり直す？</span></div>
        <p class="reset-confirm-desc">
          これまでのセーブデータ<br>（スター・コイン・スタンプ・チェックポイント）を消して、<br>
          最初のムービー＆チュートリアルから新しく遊びますか？
        </p>
        <div class="reset-confirm-actions">
          <button class="mini-btn stitch-mini reset-cancel-btn" data-role="reset-cancel-btn" type="button">キャンセル</button>
          <button class="mini-btn danger-confirm-btn" data-role="reset-confirm-btn" type="button">消してはじめから</button>
        </div>
      </div>
    `;
    container.appendChild(this.resetConfirmModal);

    // 9. Mobile Portrait Orientation Lock Overlay
    this.portraitOverlay = document.createElement('div');
    this.portraitOverlay.className = 'portrait-lock-overlay hidden';
    this.portraitOverlay.dataset.role = 'portrait-lock-overlay';
    this.portraitOverlay.setAttribute('role', 'dialog');
    this.portraitOverlay.setAttribute('aria-modal', 'true');
    this.portraitOverlay.setAttribute('aria-labelledby', 'portrait-lock-title');
    this.portraitOverlay.innerHTML = `
      <div class="portrait-lock-card">
        <div class="portrait-lock-visual" aria-hidden="true">
          <div class="portrait-phone-anim">
            <div class="portrait-phone-screen"></div>
            <div class="portrait-phone-notch"></div>
          </div>
          <img class="portrait-lock-buu" src="${FACE_WIPE_SPRITE_URLS.Ganbaru}" alt="" decoding="async" />
        </div>
        <div class="portrait-lock-title" id="portrait-lock-title">📱 スマホを横向きにして<br>遊んでね！</div>
        <p class="portrait-lock-sub">画面を横にたおすと、<br>自動でゲームが再開するよ♪</p>
        <div class="portrait-lock-tip">※ 画面の回転ロックをOFFにしてね</div>
      </div>
    `;
    container.appendChild(this.portraitOverlay);

    // Query elements
    this.titleMainStarsEl = this.titleScreen.querySelector('[data-role="title-main-stars"]')!;
    this.titleSecretStarsEl = this.titleScreen.querySelector('[data-role="title-secret-stars"]')!;
    this.titleStampsEl = this.titleScreen.querySelector('[data-role="title-stamps"]')!;
    this.titleHighScoreEl = this.titleScreen.querySelector('[data-role="title-highscore"]')!;
    this.titleResumeBadgeEl = this.titleScreen.querySelector('[data-role="title-resume-badge"]')!;
    this.titlePlayBtnLabelEl = this.titleScreen.querySelector('[data-role="play-btn-label"]')!;
    this.titleNewGameBtn = this.titleScreen.querySelector('[data-role="title-newgame-btn"]')!;
    this.titlePwaBtn = this.titleScreen.querySelector('[data-role="title-pwa-install-btn"]')!;

    this.pwaPrompt = new PwaInstallPrompt(container, {
      onPlayUiClick: () => handlers.onUiClick?.(),
      onAvailabilityChange: (canShow) => this.syncTitlePwaButton(canShow),
    });
    this.syncTitlePwaButton(this.pwaPrompt.canShowTitleButton());

    for (const w of WORLD_CATALOG) {
      if (!w.playable) continue;
      const worldKey = w.worldKey as WorldId;
      const wid = `w${w.id}`;
      const cardEl = this.worldSelectScreen.querySelector<HTMLDivElement>(
        `[data-world-key="${worldKey}"]`
      );
      if (!cardEl) continue;
      this.wsCardRefs.set(worldKey, {
        cardEl,
        mainEl: cardEl.querySelector(`[data-role="ws-${wid}-main"]`)!,
        secretEl: cardEl.querySelector(`[data-role="ws-${wid}-secret"]`)!,
        highScoreEl: cardEl.querySelector(`[data-role="ws-${wid}-score"]`)!,
        rankEl: cardEl.querySelector(`[data-role="ws-${wid}-rank"]`)!,
        stampsEl: cardEl.querySelector(`[data-role="ws-${wid}-stamps"]`)!,
        playLabelEl: cardEl.querySelector(`[data-role="ws-${wid}-play-label"]`)!,
      });
    }

    this.autoFollowBtns = Array.from(
      this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-setting="auto-follow"]')
    );
    this.qualityBtns = Array.from(
      this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-setting="quality"]')
    );
    this.qualityResolvedEl = this.settingsModal.querySelector('[data-role="quality-resolved-label"]')!;
    this.faceWipe3dBtns = Array.from(
      this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-setting="face-wipe-3d"]')
    );
    this.faceWipeResolvedEl = this.settingsModal.querySelector('[data-role="face-wipe-resolved-label"]')!;
    this.sensSlider = this.settingsModal.querySelector('[data-role="sens-slider"]')!;
    this.sensValEl = this.settingsModal.querySelector('[data-role="sens-val"]')!;
    this.soundBtns = Array.from(
      this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-setting="sound"]')
    );
    this.showFpsBtns = Array.from(
      this.settingsModal.querySelectorAll<HTMLButtonElement>('[data-setting="show-fps"]')
    );
    this.settingsResetSaveBtn = this.settingsModal.querySelector(
      '[data-role="settings-reset-save-btn"]'
    )!;

    this.controlsTabBtns = Array.from(
      this.controlsModal.querySelectorAll<HTMLButtonElement>('[data-device-tab]')
    );
    this.controlsBodyEl = this.controlsModal.querySelector('[data-role="controls-body"]')!;

    this.pauseStampsCountEl = this.pauseScreen.querySelector('[data-role="pause-stamps-count"]')!;
    this.pauseStampsGridEl = this.pauseScreen.querySelector('[data-role="pause-stamps-grid"]')!;
    this.pauseStampDetailEl = this.pauseScreen.querySelector('[data-role="pause-stamp-detail"]')!;

    this.goPenaltyCoinsEl = this.gameOverScreen.querySelector('[data-role="gameover-penalty-coins"]')!;
    this.goPenaltyScoreEl = this.gameOverScreen.querySelector('[data-role="gameover-penalty-score"]')!;
    this.goBossNoteEl = this.gameOverScreen.querySelector('[data-role="gameover-boss-note"]')!;

    this.rankStage = this.resultScreen.querySelector('.rank-stage')!;
    this.resBuuImgEl = this.resultScreen.querySelector('[data-role="res-buu-img"]')!;
    this.resRankEl = this.resultScreen.querySelector('[data-role="res-rank"]')!;
    this.resScoreEl = this.resultScreen.querySelector('[data-role="res-score"]')!;
    this.resNewRecordEl = this.resultScreen.querySelector('[data-role="res-new-record"]')!;
    this.resStarsEl = this.resultScreen.querySelector('[data-role="res-stars"]')!;
    this.resSecretStarsEl = this.resultScreen.querySelector('[data-role="res-secret-stars"]')!;
    this.resCoinsEl = this.resultScreen.querySelector('[data-role="res-coins"]')!;
    this.resDmgEl = this.resultScreen.querySelector('[data-role="res-dmg"]')!;
    this.resStampsEl = this.resultScreen.querySelector('[data-role="res-stamps"]')!;
    this.resStampTitleEl = this.resultScreen.querySelector('[data-role="res-stamp-title"]')!;

    // Event wiring: Title
    this.titleScreen.querySelector('[data-role="play-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onStartGame();
    });
    this.titleScreen.querySelector('[data-role="world-select-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onOpenWorldSelect();
    });
    this.titleScreen.querySelector('[data-role="title-settings-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.openSettings();
    });
    this.titleNewGameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.titleNewGameBtn.blur();
      handlers.onUiClick?.();
      this.openResetConfirm(false);
    });
    this.titlePwaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.titlePwaBtn.blur();
      this.closeModals();
      handlers.onUiClick?.();
      this.pwaPrompt.open();
    });

    // Event wiring: World Select (World 1, World 2, ...)
    this.worldSelectScreen
      .querySelectorAll<HTMLButtonElement>('[data-select-world]')
      .forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.blur();
          this.closeModals();
          const worldId = btn.dataset.selectWorld as WorldId | undefined;
          if (worldId === 'world1' || worldId === 'world2') {
            handlers.onSelectWorld(worldId);
          } else {
            handlers.onStartGame();
          }
        });
      });
    this.worldSelectScreen.querySelector('[data-role="ws-back-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onBackToTitle();
    });

    // Event wiring: Pause
    this.pauseScreen.querySelector('[data-role="resume-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onResumeGame();
    });
    this.pauseScreen.querySelector('[data-role="pause-controls-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.openControls(this.lastInputDevice);
    });
    this.pauseScreen.querySelector('[data-role="pause-settings-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.openSettings();
    });
    this.pauseScreen.querySelector('[data-role="pause-restart-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onRestartGame();
    });
    this.pauseScreen.querySelector('[data-role="pause-title-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      this.closeModals();
      handlers.onBackToTitle();
    });
    this.pauseStampsGridEl.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('[data-stamp-id]') : null;
      if (!target) return;
      e.stopPropagation();
      handlers.onUiClick?.();
      const id = target.dataset.stampId as StampId | undefined;
      if (!id) return;
      this.selectedPauseStampId = this.selectedPauseStampId === id ? null : id;
      this.lastPauseStampKey = '';
    });

    // Event wiring: Game Over
    this.gameOverScreen.querySelector('[data-role="gameover-retry-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      handlers.onRetryFromCheckpoint();
    });
    this.gameOverScreen.querySelector('[data-role="gameover-restart-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      handlers.onRestartGame();
    });
    this.gameOverScreen.querySelector('[data-role="gameover-title-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      handlers.onBackToTitle();
    });

    // Event wiring: Result
    this.resultScreen.querySelector('[data-role="replay-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      handlers.onRestartGame();
    });
    this.resultScreen.querySelector('[data-role="res-ws-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      handlers.onOpenWorldSelect();
    });

    // Event wiring: Settings Modal
    this.autoFollowBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onUpdateSettings({ cameraAutoFollow: btn.dataset.value === 'on' });
      });
    });
    this.qualityBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.dataset.value as QualityPreset | undefined;
        if (val === 'auto' || val === 'high' || val === 'medium' || val === 'low') {
          handlers.onUpdateSettings({ quality: val });
        }
      });
    });
    this.faceWipe3dBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.dataset.value as FaceWipe3dMode | undefined;
        if (val === 'auto' || val === 'on' || val === 'off') {
          handlers.onUpdateSettings({ faceWipe3d: val });
        }
      });
    });
    this.soundBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onUpdateSettings({ soundEnabled: btn.dataset.value === 'on' });
      });
    });
    this.showFpsBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onUpdateSettings({ showFps: btn.dataset.value === 'on' });
      });
    });

    this.sensSlider.addEventListener('pointerdown', () => {
      this.isDraggingSens = true;
    });
    const endDrag = (): void => {
      this.isDraggingSens = false;
    };
    this.sensSlider.addEventListener('pointerup', endDrag);
    this.sensSlider.addEventListener('pointercancel', endDrag);
    this.sensSlider.addEventListener('change', endDrag);
    this.sensSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = Number(this.sensSlider.value);
      if (Number.isFinite(val)) {
        this.sensValEl.textContent = `${val.toFixed(2)}x`;
        handlers.onUpdateSettings({ cameraSensitivity: val });
      }
    });

    this.settingsModal.querySelector('[data-role="settings-close-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSettings();
    });
    this.settingsResetSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onUiClick?.();
      this.openResetConfirm(true);
    });
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettings();
      }
    });

    // Event wiring: Reset Confirm Modal
    this.resetConfirmModal.querySelector('[data-role="reset-cancel-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onUiClick?.();
      this.closeResetConfirm();
    });
    this.resetConfirmModal.querySelector('[data-role="reset-confirm-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.returnToSettingsOnCancel = false;
      this.closeModals();
      handlers.onResetSaveAndNewGame();
    });
    this.resetConfirmModal.addEventListener('click', (e) => {
      if (e.target === this.resetConfirmModal) {
        this.closeResetConfirm();
      }
    });

    // Event wiring: Controls Modal
    this.controlsTabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dev = btn.dataset.deviceTab as InputDevice | undefined;
        if (dev === 'kbm' || dev === 'gamepad' || dev === 'touch') {
          this.setControlsTab(dev);
        }
      });
    });
    this.controlsModal.querySelector('[data-role="controls-close-btn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeControls();
    });
    this.controlsModal.addEventListener('click', (e) => {
      if (e.target === this.controlsModal) {
        this.closeControls();
      }
    });
  }

  private openSettings(): void {
    this.pwaPrompt.close(false);
    this.controlsOpen = false;
    this.controlsModal.classList.add('hidden');
    this.resetConfirmOpen = false;
    this.resetConfirmModal.classList.add('hidden');
    this.settingsOpen = true;
    this.settingsModal.classList.remove('hidden');
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsModal.classList.add('hidden');
  }

  private openControls(device: InputDevice): void {
    this.pwaPrompt.close(false);
    this.settingsOpen = false;
    this.settingsModal.classList.add('hidden');
    this.resetConfirmOpen = false;
    this.resetConfirmModal.classList.add('hidden');
    this.setControlsTab(device);
    this.controlsOpen = true;
    this.controlsModal.classList.remove('hidden');
  }

  private closeControls(): void {
    this.controlsOpen = false;
    this.controlsModal.classList.add('hidden');
  }

  private openResetConfirm(fromSettings: boolean): void {
    this.pwaPrompt.close(false);
    this.controlsOpen = false;
    this.controlsModal.classList.add('hidden');
    this.returnToSettingsOnCancel = fromSettings;
    if (fromSettings) {
      this.settingsOpen = false;
      this.settingsModal.classList.add('hidden');
    }
    this.resetConfirmOpen = true;
    this.resetConfirmModal.classList.remove('hidden');
  }

  private closeResetConfirm(): void {
    this.resetConfirmOpen = false;
    this.resetConfirmModal.classList.add('hidden');
    if (this.returnToSettingsOnCancel) {
      this.returnToSettingsOnCancel = false;
      this.openSettings();
    }
  }

  private closeModals(): void {
    this.returnToSettingsOnCancel = false;
    if (this.resetConfirmOpen) {
      this.resetConfirmOpen = false;
      this.resetConfirmModal.classList.add('hidden');
    }
    if (this.settingsOpen) this.closeSettings();
    if (this.controlsOpen) this.closeControls();
    this.pwaPrompt.close(false);
  }

  public hasOpenModal(): boolean {
    return (
      this.settingsOpen ||
      this.controlsOpen ||
      this.resetConfirmOpen ||
      this.pwaPrompt.isOpen()
    );
  }

  public closeAllModals(): void {
    this.closeModals();
  }

  public getPwaState(): PwaDebugState {
    return this.pwaPrompt.getDebugState();
  }

  private syncTitlePwaButton(canShow: boolean): void {
    this.titlePwaBtn.classList.toggle('hidden', !canShow);
  }

  private setControlsTab(device: InputDevice): void {
    if (this.activeControlsTab === device) return;
    this.activeControlsTab = device;
    this.controlsTabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.deviceTab === device);
    });
    this.controlsBodyEl.innerHTML = buildControlsTableHtml(device);
  }

  private renderPauseStamps(
    worldId: WorldId,
    earnedAll: StampId[],
    mainStars: number,
    secretStars: number,
    coins: number
  ): void {
    const stampsList = getWorldStamps(worldId);
    const earnedSet = new Set<StampId>(earnedAll);
    const earnedCount = stampsList.filter((st) => earnedSet.has(st.id)).length;
    this.pauseStampsCountEl.textContent = `${earnedCount} / ${stampsList.length}`;
    this.pauseStampsGridEl.innerHTML = stampsList
      .map((st) => {
        const earned = earnedSet.has(st.id);
        const selected = this.selectedPauseStampId === st.id;
        return `
          <button
            type="button"
            class="pause-stamp-btn ${earned ? 'earned' : 'locked'} ${selected ? 'selected' : ''}"
            data-stamp-id="${st.id}"
            title="${st.title}：${st.desc}"
          >
            <span class="pause-stamp-ico">${st.icon}</span>
            <span class="pause-stamp-name">${st.title}</span>
            <span class="pause-stamp-badge">${earned ? '✓' : '・'}</span>
          </button>
        `;
      })
      .join('');

    const selectedDef = this.selectedPauseStampId
      ? stampsList.find((st) => st.id === this.selectedPauseStampId)
      : null;
    if (selectedDef) {
      const doneText = earnedSet.has(selectedDef.id) ? '【達成済み】' : '【未達成】';
      this.pauseStampDetailEl.textContent = `${selectedDef.icon} ${doneText} ${selectedDef.desc}`;
    } else {
      this.pauseStampDetailEl.textContent = `⭐ ${mainStars}/3　💎 ${secretStars}/3　🪙 ${coins.toLocaleString()}まい（タップで条件表示）`;
    }
  }

  private renderVictoryStamps(
    worldId: WorldId,
    earnedAll: StampId[],
    newlyEarned: StampId[]
  ): void {
    const stampsList = getWorldStamps(worldId);
    const worldNum = worldId === 'world2' ? '2' : '1';
    this.resStampTitleEl.textContent = `🏆 ワールド${worldNum} スタンプ`;
    const earnedSet = new Set<StampId>(earnedAll);
    const newSet = new Set<StampId>(newlyEarned);
    this.resStampsEl.innerHTML = stampsList
      .map((st) => {
        const earned = earnedSet.has(st.id);
        const isNew = newSet.has(st.id);
        return `
          <div class="stamp-card ${earned ? 'earned' : 'locked'}" title="${st.desc}">
            ${isNew ? '<span class="stamp-new-badge">NEW!</span>' : ''}
            <div class="stamp-icon">${st.icon}</div>
            <div class="stamp-name">${st.title}</div>
          </div>
        `;
      })
      .join('');
  }

  update(snap: HudSnapshot): void {
    this.lastInputDevice = snap.inputDevice;

    if (snap.phase === 'title' && !snap.bootTapPending && !this.checkedPwaAutoOpen) {
      this.syncTitlePwaButton(this.pwaPrompt.canShowTitleButton());
      this.checkedPwaAutoOpen = true;
      this.pwaPrompt.maybeAutoOpen();
    }

    const showPortraitOverlay =
      !snap.bootTapPending && snap.portraitBlocked && !this.pwaPrompt.isOpen();
    if (showPortraitOverlay !== this.lastPortraitBlocked) {
      this.lastPortraitBlocked = showPortraitOverlay;
      this.portraitOverlay.classList.toggle('hidden', !showPortraitOverlay);
    }

    const showTitle = snap.phase === 'title' && !snap.bootTapPending;
    if (showTitle !== this.lastTitleVisible) {
      this.lastTitleVisible = showTitle;
      this.titleScreen.classList.toggle('hidden', !showTitle);
    }

    // Phase visibility updates (only on phase change)
    if (snap.phase !== this.lastPhase) {
      this.lastPhase = snap.phase;
      this.worldSelectScreen.classList.toggle('hidden', snap.phase !== 'world_select');
      this.pauseScreen.classList.toggle('hidden', snap.phase !== 'paused');
      this.gameOverScreen.classList.toggle('hidden', snap.phase !== 'gameover');
      this.resultScreen.classList.toggle('hidden', snap.phase !== 'victory');

      if (snap.phase === 'paused') {
        this.selectedPauseStampId = null;
        this.lastPauseStampKey = '';
      }

      // Close modals when leaving title/paused
      if (snap.phase !== 'title' && snap.phase !== 'paused') {
        this.closeModals();
      } else if (snap.phase !== 'paused' && this.controlsOpen) {
        this.closeControls();
      }
      if (snap.phase !== 'title') {
        this.pwaPrompt.close(false);
      }
    }

    this.cutsceneBars.classList.toggle(
      'active',
      snap.phase === 'cutscene' || snap.welcomeMovieActive || snap.rainbowMovieActive
    );

    // Update Settings modal UI when settings or resolved quality change
    const s = snap.settings;
    const settingsKey = `${s.cameraAutoFollow}|${s.quality}|${snap.resolvedQuality}|${s.cameraSensitivity.toFixed(2)}|${s.soundEnabled}|${s.faceWipe3d}|${snap.faceWipe3dActive}|${s.showFps}`;
    if (settingsKey !== this.lastSettingsKey) {
      this.lastSettingsKey = settingsKey;
      this.autoFollowBtns.forEach((btn) => {
        const isOn = btn.dataset.value === 'on';
        btn.classList.toggle('active', isOn === s.cameraAutoFollow);
      });
      this.qualityBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.quality);
      });
      this.qualityResolvedEl.textContent =
        s.quality === 'auto'
          ? `自動適用中：${qualityLabelJa(snap.resolvedQuality)}`
          : `現在：${qualityLabelJa(snap.resolvedQuality)}`;

      this.faceWipe3dBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.faceWipe3d);
      });
      const wipeModeLabel = snap.faceWipe3dActive ? '3D' : '軽量画像';
      this.faceWipeResolvedEl.textContent =
        s.faceWipe3d === 'auto'
          ? `自動適用中：${wipeModeLabel}`
          : `現在：${wipeModeLabel}`;

      if (!this.isDraggingSens && document.activeElement !== this.sensSlider) {
        this.sensSlider.value = s.cameraSensitivity.toFixed(2);
      }
      this.sensValEl.textContent = `${s.cameraSensitivity.toFixed(2)}x`;

      this.soundBtns.forEach((btn) => {
        const isOn = btn.dataset.value === 'on';
        btn.classList.toggle('active', isOn === s.soundEnabled);
      });

      this.showFpsBtns.forEach((btn) => {
        const isOn = btn.dataset.value === 'on';
        btn.classList.toggle('active', isOn === s.showFps);
      });
    }

    // Save state dynamic labels ("つづきから" / "はじめから")
    const saveButtonKey = `${snap.activeWorldId}|${snap.hasSaveProgress}|${snap.hasResumableRun}`;
    if (saveButtonKey !== this.lastSaveButtonKey) {
      this.lastSaveButtonKey = saveButtonKey;
      this.titlePlayBtnLabelEl.textContent = snap.hasSaveProgress
        ? '▶ つづきから'
        : '▶ あそぶ！ / PLAY';
      this.titleNewGameBtn.classList.toggle('hidden', !snap.hasSaveProgress);
      this.titleResumeBadgeEl.classList.toggle('hidden', !snap.hasResumableRun);
    }

    // Active world progress for Title / Pause / Victory
    const activeW = snap.saveData.worlds[snap.activeWorldId] ?? createEmptyWorldProgress();
    const mainCount = activeW.collectedStarIds.filter((id) => id >= 1 && id <= 3).length;
    const secretCount = activeW.collectedStarIds.filter((id) => id >= 4 && id <= 6).length;
    const titleSaveKey = `${snap.activeWorldId}|${mainCount}|${secretCount}|${activeW.stamps.join(',')}|${activeW.highScore}|${activeW.bestRank ?? '-'}`;

    if (snap.phase === 'title' && titleSaveKey !== this.lastTitleSaveKey) {
      this.lastTitleSaveKey = titleSaveKey;
      this.titleMainStarsEl.textContent = `⭐ ${mainCount}/3`;
      this.titleSecretStarsEl.textContent = `💎 ${secretCount}/3`;
      this.titleStampsEl.textContent = `🏆 ${activeW.stamps.length}/${WORLD1_STAMPS.length}`;
      this.titleHighScoreEl.textContent = `🏅 ${activeW.highScore.toLocaleString()} pts`;
    }

    // World select progress (per world, completely independent!)
    if (snap.phase === 'world_select') {
      const wsParts: string[] = [snap.activeWorldId];
      for (const [wk] of this.wsCardRefs) {
        const wp = snap.saveData.worlds[wk] ?? createEmptyWorldProgress();
        wsParts.push(
          `${wk}:${wp.collectedStarIds.join(',')}:${wp.stamps.join(',')}:${wp.highScore}:${wp.bestRank ?? '-'}:${wp.run.active ? 1 : 0}`
        );
      }
      const wsKey = wsParts.join('|');
      if (wsKey !== this.lastWsSaveKey) {
        this.lastWsSaveKey = wsKey;
        for (const [wk, refs] of this.wsCardRefs) {
          const wp = snap.saveData.worlds[wk] ?? createEmptyWorldProgress();
          const mCnt = wp.collectedStarIds.filter((id) => id >= 1 && id <= 3).length;
          const sCnt = wp.collectedStarIds.filter((id) => id >= 4 && id <= 6).length;
          const stampsDef = getWorldStamps(wk);
          const stampSet = new Set<StampId>(wp.stamps);

          refs.cardEl.classList.toggle('is-active-world', wk === snap.activeWorldId);
          refs.mainEl.textContent = `⭐ ${mCnt}/3`;
          refs.secretEl.textContent = `💎 ${sCnt}/3`;
          refs.highScoreEl.textContent = `🏅 ${wp.highScore.toLocaleString()} pts`;
          refs.rankEl.textContent = `RANK ${wp.bestRank ?? '-'}`;
          refs.stampsEl.innerHTML = stampsDef
            .map((st) => {
              const got = stampSet.has(st.id);
              return `<span class="ws-stamp-dot ${got ? 'earned' : ''}" title="${st.title}：${st.desc}">${st.icon}</span>`;
            })
            .join('');
          refs.playLabelEl.textContent = wp.run.active
            ? '▶ つづきからあそぶ！'
            : '▶ このワールドであそぶ！';
        }
      }
    }

    // Pause screen 5-stamp progress
    if (snap.phase === 'paused') {
      const pauseStampKey = `${snap.activeWorldId}|${activeW.stamps.join(',')}|${snap.stars}|${snap.secretStars}|${snap.coins}|${this.selectedPauseStampId ?? ''}`;
      if (pauseStampKey !== this.lastPauseStampKey) {
        this.lastPauseStampKey = pauseStampKey;
        this.renderPauseStamps(
          snap.activeWorldId,
          activeW.stamps,
          snap.stars,
          snap.secretStars,
          snap.coins
        );
      }
    }

    // Game Over screen
    if (snap.phase === 'gameover') {
      const goKey = `${snap.gameOverPenaltyCoins}|${snap.gameOverPenaltyScore}|${snap.wasInBossFight}`;
      if (goKey !== this.lastGameOverKey) {
        this.lastGameOverKey = goKey;
        this.goPenaltyCoinsEl.textContent = `🪙 コイン -${snap.gameOverPenaltyCoins.toLocaleString()}`;
        this.goPenaltyScoreEl.textContent = `🏅 スコア -${snap.gameOverPenaltyScore.toLocaleString()} pts`;
        this.goBossNoteEl.classList.toggle('hidden', !snap.wasInBossFight);
      }
    }

    // Victory / Result screen
    if (snap.phase === 'victory') {
      const earnedCombined = Array.from(new Set<StampId>([...activeW.stamps, ...snap.runStamps]));
      const vicKey = `${snap.activeWorldId}|${snap.clearRank}|${snap.starPoints}|${snap.isNewHighScore}|${snap.stars}/${snap.totalStars}|${snap.secretStars}/${snap.totalSecretStars}|${snap.coins}|${snap.damageTakenCount}|${earnedCombined.join(',')}|${snap.newlyEarnedStamps.join(',')}`;
      if (vicKey !== this.lastVictoryKey) {
        this.lastVictoryKey = vicKey;
        if (this.rankStage.dataset.rank !== snap.clearRank) {
          this.rankStage.dataset.rank = snap.clearRank;
        }
        const expectedBuuUrl =
          snap.clearRank === 'S' ? FACE_WIPE_SPRITE_URLS.Fever : FACE_WIPE_SPRITE_URLS.Happy;
        if (this.resBuuImgEl.getAttribute('src') !== expectedBuuUrl) {
          this.resBuuImgEl.src = expectedBuuUrl;
        }
        this.resRankEl.textContent = snap.clearRank;
        this.resScoreEl.textContent = `${snap.starPoints.toLocaleString()} pts`;
        this.resNewRecordEl.classList.toggle('hidden', !snap.isNewHighScore);
        this.resStarsEl.textContent = `${snap.stars} / ${snap.totalStars}`;
        this.resSecretStarsEl.textContent = `${snap.secretStars} / ${snap.totalSecretStars}`;
        this.resCoinsEl.textContent = `${snap.coins.toLocaleString()} まい`;
        this.resDmgEl.textContent = `${snap.damageTakenCount} 回`;
        this.renderVictoryStamps(snap.activeWorldId, earnedCombined, snap.newlyEarnedStamps);
      }
    }
  }
}

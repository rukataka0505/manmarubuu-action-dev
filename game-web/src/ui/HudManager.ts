import type { HudSnapshot } from '../types';
import type { TutorialManager } from '../gameplay/TutorialManager';
import { getBuuFaceSpriteInfo, preloadBuuFaceSprites } from './BuuFaceSprite';

export interface HudHandlers {
  onToggleMute: () => void;
  onTriggerFever: () => void;
  onPause: () => void;
  onSkipTutorial: () => void;
  onAdvanceTutorial: () => void;
  onSkipWelcomeMovie: () => void;
  onSkipRainbowMovie: () => void;
  onCloseRewardCard?: () => void;
  onLayoutChange?: () => void;
}

interface EdgeIndicatorNode {
  el: HTMLDivElement;
  arrow: HTMLSpanElement;
  label: HTMLSpanElement;
  lastX: number;
  lastY: number;
  lastDeg: number;
  visible: boolean;
}

interface NavPinNode {
  el: HTMLDivElement;
  lastLeft: string;
  lastText: string;
  lastBehind: boolean;
  lastPrimary: boolean;
  visible: boolean;
}

interface CalloutNode {
  el: HTMLDivElement;
  lastX: number;
  lastY: number;
  lastOpacity: string;
}

function buildScallopedFrameSvg(): string {
  // Outer scalloped floral rim (radius ~86px) with inner transparent cutout hole (radius 54px -> 108px diameter)
  // Using evenodd fill rule so center hole is 100% transparent over the 112x112 WebGL scissor square!
  const cx = 88;
  const cy = 88;
  const petals = 16;
  let outerPath = '';
  for (let i = 0; i < petals; i++) {
    const a1 = (i / petals) * Math.PI * 2;
    const am = ((i + 0.5) / petals) * Math.PI * 2;
    const a2 = ((i + 1) / petals) * Math.PI * 2;
    const rBase = 81;
    const rPeak = 88;
    const x1 = cx + Math.cos(a1) * rBase;
    const y1 = cy + Math.sin(a1) * rBase;
    const xm = cx + Math.cos(am) * rPeak;
    const ym = cy + Math.sin(am) * rPeak;
    const x2 = cx + Math.cos(a2) * rBase;
    const y2 = cy + Math.sin(a2) * rBase;
    if (i === 0) outerPath += `M ${x1.toFixed(1)} ${y1.toFixed(1)} `;
    outerPath += `Q ${xm.toFixed(1)} ${ym.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} `;
  }
  outerPath += 'Z ';

  // Inner circle (counter-clockwise for evenodd hole)
  const rHole = 53;
  const holePath = `M ${cx + rHole} ${cy} A ${rHole} ${rHole} 0 1 0 ${cx - rHole} ${cy} A ${rHole} ${rHole} 0 1 0 ${cx + rHole} ${cy} Z`;

  // Blue inner ring path (r=53..71)
  const rBlue = 70;
  const blueRingPath =
    `M ${cx + rBlue} ${cy} A ${rBlue} ${rBlue} 0 1 1 ${cx - rBlue} ${cy} A ${rBlue} ${rBlue} 0 1 1 ${cx + rBlue} ${cy} Z ` +
    holePath;

  return `
    <svg class="face-wipe-frame-svg" viewBox="0 0 176 176" xmlns="http://www.w3.org/2000/svg">
      <path d="${outerPath + holePath}" fill="#f3dfc0" fill-rule="evenodd" stroke="#fff9ee" stroke-width="2.5"/>
      <path d="${blueRingPath}" fill="#6fb4ea" fill-rule="evenodd"/>
      <circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="#fff9ee" stroke-width="2.2" stroke-dasharray="6 5"/>
      <circle cx="${cx}" cy="${cy}" r="53.5" fill="none" stroke="#ffffff" stroke-width="3.2"/>
    </svg>
  `;
}

function buildHeartSvg(lost: boolean, extraClass = ''): string {
  const cls = ['heart-icon', lost ? 'lost' : '', extraClass].filter(Boolean).join(' ');
  return `
    <svg class="${cls}" viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 36 C22 36 4 24.5 4 12.8 C4 6.8 8.8 3 14.2 3 C17.8 3 20.6 4.9 22 7.5 C23.4 4.9 26.2 3 29.8 3 C35.2 3 40 6.8 40 12.8 C40 24.5 22 36 22 36 Z"
        fill="#ea3858" stroke="#fff6e6" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M22 32.5 C22 32.5 7.5 22.8 7.5 13 C7.5 8.8 10.6 6 14.3 6 C17.5 6 20 8 22 11 C24 8 26.5 6 29.7 6 C33.4 6 36.5 8.8 36.5 13 C36.5 22.8 22 32.5 22 32.5 Z"
        fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.8" stroke-dasharray="4 3"/>
      <ellipse cx="13.5" cy="11.5" rx="3.4" ry="2.0" transform="rotate(-25 13.5 11.5)" fill="rgba(255,255,255,0.55)"/>
    </svg>
  `;
}

export class HudManager {
  private root: HTMLElement;
  private hudWrap: HTMLDivElement;
  private heartsEl: HTMLDivElement;
  private starValEl: HTMLSpanElement;
  private starPtsEl: HTMLSpanElement;
  private secretStarsEl: HTMLSpanElement;
  private coinValEl: HTMLSpanElement;
  private feverBoxEl: HTMLDivElement;
  private feverArcFill: SVGPathElement;
  private feverLabelEl: HTMLDivElement;
  private faceWipeHoleEl: HTMLDivElement;
  private faceWipeTagEl: HTMLDivElement;
  private faceWipeBgEl: HTMLDivElement | null = null;
  private faceWipeImgEl: HTMLImageElement | null = null;
  private tutCardEl: HTMLDivElement;
  private tutTitleEl: HTMLDivElement;
  private tutClearBadgeEl: HTMLSpanElement;
  private tutGuideEl: HTMLDivElement;
  private tutDotsEl: HTMLDivElement;
  private tutSkipBtn: HTMLButtonElement;
  private fpsBadgeEl: HTMLDivElement;
  private autosaveToastEl: HTMLDivElement;
  private tutConfirmWrapEl: HTMLDivElement;
  private tutConfirmCardEl: HTMLDivElement;
  private tutConfirmBadgeEl: HTMLDivElement;
  private tutConfirmMsgEl: HTMLDivElement;
  private tutConfirmDotsEl: HTMLDivElement;
  private tutConfirmPreviewEl: HTMLDivElement;
  private tutConfirmNextBtn: HTMLButtonElement;
  private tutConfirmNextLabelEl: HTMLSpanElement;
  private tutConfirmSkipBtn: HTMLButtonElement;
  private tutConfirmHintEl: HTMLDivElement;
  private welcomeOverlayEl: HTMLDivElement;
  private welcomeSkipBtn: HTMLButtonElement;
  private rainbowOverlayEl: HTMLDivElement;
  private rainbowCardEl: HTMLDivElement;
  private rainbowTitleEl: HTMLDivElement;
  private rainbowSubEl: HTMLDivElement;
  private rainbowSkipBtn: HTMLButtonElement;
  private tourSubEl: HTMLDivElement;
  private tourPageBadgeEl: HTMLSpanElement;
  private tourPageDotsEl: HTMLDivElement;
  private tourSubTextEl: HTMLSpanElement;
  private tourNextBtn: HTMLButtonElement;
  private tourNextLabelEl: HTMLSpanElement;
  private tourSkipBtn: HTMLButtonElement;
  private objectivePillEl: HTMLDivElement;
  private objectiveIconEl: HTMLSpanElement;
  private objectiveTextEl: HTMLSpanElement;
  private navCompassEl: HTMLDivElement;
  private navArrowEl: HTMLSpanElement;
  private navPrimaryLabelEl: HTMLSpanElement;
  private navPrimaryDistEl: HTMLSpanElement;
  private navPinsLayerEl: HTMLDivElement;
  private contextBannerEl: HTMLDivElement;
  private feverFrameEl: HTMLDivElement;
  private feverCutinEl: HTMLDivElement;
  private bossHudEl: HTMLDivElement;
  private bossPhaseEl: HTMLSpanElement;
  private bossSegs: HTMLDivElement[] = [];
  private bossWeakAlertEl: HTMLDivElement;
  private edgeIndContainer: HTMLDivElement;
  private calloutLayer: HTMLDivElement;
  private muteBtn: HTMLButtonElement;
  private feverBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;

  // Dirty-check caches
  private lastShowInGame: boolean | null = null;
  private lastTouchActive: boolean | null = null;
  private lastHeartsKey = '';
  private lastMaxHp = 0;
  private heartBonusTimer: number | null = null;
  private lastStarsText = '';
  private lastStarPtsText = '';
  private lastSecretStarsText = '';
  private lastCoinsText = '';
  private lastFeverOffset = '';
  private lastFeverActive: boolean | null = null;
  private lastFeverLabel = '';
  private lastFeverBtnVisible: boolean | null = null;
  private lastFeverBtnText = '';
  private lastMuteText = '';
  private lastWipeTag = '';
  private lastTutVisible: boolean | null = null;
  private lastTutCleared: boolean | null = null;
  private lastTutUrgent: boolean | null = null;
  private lastTutSkipVisible: boolean | null = null;
  private lastTutKey = '';
  private lastFaceWipeModeKey = '';
  private lastShowFps: boolean | null = null;
  private lastFpsText = '';
  private lastAutosaveVisible: boolean | null = null;
  private lastConfirmVisible: boolean | null = null;
  private rewardWrapEl!: HTMLDivElement;
  private rewardCardEl!: HTMLDivElement;
  private rewardBadgeEl!: HTMLDivElement;
  private rewardGemsEl!: HTMLDivElement;
  private rewardTitleEl!: HTMLDivElement;
  private rewardHeartsEl!: HTMLDivElement;
  private rewardBodyEl!: HTMLDivElement;
  private rewardOkBtn!: HTMLButtonElement;
  private rewardHintEl!: HTMLDivElement;
  private lastRewardKey: string | null = null;
  private lastRewardReady: boolean | null = null;
  private lastConfirmKey = '';
  private lastConfirmReady: boolean | null = null;
  private lastTourVisible: boolean | null = null;
  private lastTourKey = '';
  private lastTourReady: boolean | null = null;
  private lastTourSkipVisible: boolean | null = null;
  private lastObjectiveVisible: boolean | null = null;
  private lastObjectiveKey = '';
  private lastNavVisible: boolean | null = null;
  private lastNavPrimaryKey = '';
  private lastNavArrowDeg = -9999;
  private lastContextHint: string | null = null;
  private lastFeverFrameVisible: boolean | null = null;
  private lastFeverCutinVisible: boolean | null = null;
  private lastTopHudTall: boolean | null = null;
  private lastBossActive: boolean | null = null;
  private lastBossPhaseText = '';
  private lastBossHp = -1;
  private lastBossWeakExposed: boolean | null = null;

  private edgeIndNodes = new Map<number, EdgeIndicatorNode>();
  private navPinNodes = new Map<string, NavPinNode>();
  private calloutNodes = new Map<number, CalloutNode>();
  private onLayoutChange?: () => void;
  private lastFeverReady: boolean | null = null;
  private lastFeverHighlight: boolean | null = null;
  private lastWelcomeVisible: boolean | null = null;
  private lastWelcomeCanSkip: boolean | null = null;
  private lastRainbowVisible: boolean | null = null;
  private lastRainbowCanSkip: boolean | null = null;
  private lastRainbowTextKey = '';

  constructor(container: HTMLElement, handlers: HudHandlers) {
    this.root = container;
    this.onLayoutChange = handlers.onLayoutChange;
    this.hudWrap = document.createElement('div');
    this.hudWrap.className = 'ingame-hud';
    this.hudWrap.innerHTML = `
      <div class="hud-top-left">
        <div class="hearts-row" data-role="hearts"></div>
        <div class="hud-pill pill-star">
          <span class="pill-badge">★</span>
          <span class="pill-value" data-role="stars">0 / 3</span>
          <span class="pill-sub" data-role="star-pts">0 pts</span>
        </div>
        <div class="hud-pill-row">
          <div class="hud-pill pill-secret">
            <span class="pill-badge">💎</span>
            <span class="pill-value" data-role="secret-stars">0 / 3</span>
          </div>
          <div class="hud-pill pill-coin">
            <span class="pill-badge">🪙</span>
            <span class="pill-value" data-role="coins">0</span>
          </div>
        </div>
      </div>

      <div class="hud-top-right">
        <div class="fever-box" data-role="fever-box">
          <svg class="fever-svg" viewBox="0 0 246 88">
            <defs>
              <linearGradient id="feverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff5e7e"/>
                <stop offset="20%" stop-color="#ffa940"/>
                <stop offset="40%" stop-color="#ffe74a"/>
                <stop offset="60%" stop-color="#60e07d"/>
                <stop offset="80%" stop-color="#53c2ff"/>
                <stop offset="100%" stop-color="#b777ff"/>
              </linearGradient>
            </defs>
            <path d="M 22 72 A 106 86 0 0 1 224 72" fill="none" stroke="#fff6e0" stroke-width="26" stroke-linecap="round"/>
            <path d="M 22 72 A 106 86 0 0 1 224 72" fill="none" stroke="rgba(85,55,45,0.28)" stroke-width="18" stroke-linecap="round"/>
            <path data-role="fever-fill" d="M 22 72 A 106 86 0 0 1 224 72" fill="none" stroke="url(#feverGrad)" stroke-width="18" stroke-linecap="round" stroke-dasharray="260" stroke-dashoffset="260"/>
          </svg>
          <div class="fever-label" data-role="fever-label">FEVER 0%</div>
        </div>
        <div class="hud-controls-mini">
          <button class="mini-btn" data-role="fever-btn" style="display:none">Q: FEVER x8!</button>
          <button class="mini-btn" data-role="mute-btn">🔊 サウンド ON</button>
          <button class="mini-btn" data-role="pause-btn">⏸ ポーズ</button>
        </div>
      </div>

      <div class="objective-pill hidden" data-role="objective-pill">
        <span class="objective-icon" data-role="objective-icon">⭐</span>
        <span class="objective-text" data-role="objective-text"></span>
      </div>

      <div class="nav-compass hidden" data-role="nav-compass">
        <div class="nav-primary-chip">
          <span class="nav-arrow" data-role="nav-arrow">
            <svg class="nav-arrow-svg" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2 L17.5 16.5 L10 13 L2.5 16.5 Z" fill="currentColor" stroke="#fff9ec" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="nav-primary-label" data-role="nav-primary-label">★1 キャッスル</span>
          <span class="nav-primary-dist" data-role="nav-primary-dist">0m</span>
        </div>
        <div class="nav-compass-track" data-role="nav-track">
          <div class="nav-compass-center-tick">▲</div>
          <div class="nav-pins-layer" data-role="nav-pins"></div>
        </div>
      </div>

      <div class="tutorial-card hidden" data-role="tut-card">
        <div class="tut-header">
          <div class="tut-title" data-role="tut-title"></div>
          <span class="tut-clear-badge hidden" data-role="tut-clear-badge">✨ クリア！</span>
          <button class="tut-skip-btn" data-role="tut-skip-btn" type="button">スキップ ⏭</button>
        </div>
        <div class="tut-guide" data-role="tut-guide"></div>
        <div class="tut-checks" data-role="tut-dots"></div>
      </div>

      <div class="welcome-movie-overlay hidden" data-role="welcome-overlay">
        <div class="welcome-title-card">
          <div class="welcome-kicker" data-role="welcome-kicker">✨ SUNLIT PLAYROOM ✨</div>
          <div class="welcome-main-title" data-role="welcome-main-title">ようこそ、キッズルームへ！</div>
          <div class="welcome-sub">まんまるぶうといっしょに、大冒険がはじまるよ！</div>
        </div>
        <button class="welcome-skip-btn" data-role="welcome-skip-btn" type="button">スキップ ⏭</button>
      </div>

      <div class="rainbow-movie-overlay hidden" data-role="rainbow-overlay">
        <div class="rainbow-subtitle-card" data-role="rainbow-card" data-act="1">
          <div class="rainbow-movie-title" data-role="rainbow-title"></div>
          <div class="rainbow-movie-sub" data-role="rainbow-sub"></div>
        </div>
        <button class="welcome-skip-btn rainbow-skip-btn" data-role="rainbow-skip-btn" type="button">スキップ ⏭</button>
      </div>

      <div class="reward-card-wrap hidden" data-role="reward-wrap">
        <div class="reward-card" data-role="reward-card">
          <div class="reward-badge" data-role="reward-badge"></div>
          <div class="reward-gems" data-role="reward-gems"></div>
          <div class="reward-title" data-role="reward-title"></div>
          <div class="reward-hearts" data-role="reward-hearts"></div>
          <div class="reward-body" data-role="reward-body"></div>
          <div class="tut-confirm-actions">
            <button class="tut-next-btn" data-role="reward-ok-btn" type="button">
              <span>OK！ ▶</span>
            </button>
          </div>
          <div class="tut-confirm-hint" data-role="reward-hint"></div>
        </div>
      </div>

      <div class="tut-confirm-wrap hidden" data-role="tut-confirm-wrap">
        <div class="tut-confirm-card" data-role="tut-confirm-card">
          <div class="tut-confirm-badge" data-role="tut-confirm-badge"></div>
          <div class="tut-confirm-msg" data-role="tut-confirm-msg"></div>
          <div class="tut-checks tut-confirm-dots" data-role="tut-confirm-dots"></div>
          <div class="tut-confirm-preview" data-role="tut-confirm-preview"></div>
          <div class="tut-confirm-actions">
            <button class="tut-next-btn" data-role="tut-confirm-next-btn" type="button">
              <span data-role="tut-confirm-next-label">つぎへ ▶</span>
            </button>
            <button class="tut-skip-link" data-role="tut-confirm-skip-btn" type="button">チュートリアルをスキップ ⏭</button>
          </div>
          <div class="tut-confirm-hint" data-role="tut-confirm-hint"></div>
        </div>
      </div>

      <div class="tour-subtitle hidden" data-role="tour-sub">
        <div class="tour-sub-head">
          <span class="tour-page-badge" data-role="tour-page-badge">🗺️ 冒険ツアー 1/3</span>
          <div class="tour-page-dots" data-role="tour-page-dots"></div>
          <button class="tut-skip-btn tour-skip-btn" data-role="tour-skip-btn" type="button">スキップ ⏭</button>
        </div>
        <div class="tour-sub-body">
          <span class="tour-sub-text" data-role="tour-sub-text"></span>
          <button class="tut-next-btn tour-next-btn" data-role="tour-next-btn" type="button">
            <span data-role="tour-next-label">つぎへ ▶</span>
          </button>
        </div>
      </div>

      <div class="boss-hud hidden" data-role="boss-hud">
        <div class="boss-name-row">
          <span>⚙️ CLOCKWORK TOY KING</span>
          <span data-role="boss-phase">PHASE 1</span>
        </div>
        <div class="boss-bars" data-role="boss-bars">
          <div class="boss-seg"></div>
          <div class="boss-seg"></div>
          <div class="boss-seg"></div>
        </div>
        <div class="boss-weak-alert hidden" data-role="boss-weak">💥 いまだ！背中の金色ぜんまいにヒップドロップ！！</div>
      </div>

      <div class="face-wipe-anchor">
        <div class="face-wipe-hole" data-role="wipe-hole"></div>
        ${buildScallopedFrameSvg()}
        <div class="face-wipe-tag" data-role="wipe-tag">のんびり</div>
      </div>

      <div class="fever-screen-frame" data-role="fever-frame" aria-hidden="true"></div>
      <div class="fever-cutin-banner hidden" data-role="fever-cutin" aria-hidden="true">🌈 FEVER x8!! 無敵突進＆スコア8倍！</div>
      <div class="context-banner hidden" data-role="ctx-banner"></div>
      <div class="autosave-toast hidden" data-role="autosave-toast">💾 オートセーブしました</div>
      <div class="fps-badge hidden" data-role="fps-badge">60 FPS</div>
      <div class="edge-ind-layer" data-role="edge-inds"></div>
      <div class="callout-layer" data-role="callouts"></div>
    `;

    this.root.appendChild(this.hudWrap);

    this.heartsEl = this.hudWrap.querySelector('[data-role="hearts"]')!;
    this.starValEl = this.hudWrap.querySelector('[data-role="stars"]')!;
    this.starPtsEl = this.hudWrap.querySelector('[data-role="star-pts"]')!;
    this.secretStarsEl = this.hudWrap.querySelector('[data-role="secret-stars"]')!;
    this.coinValEl = this.hudWrap.querySelector('[data-role="coins"]')!;
    this.feverBoxEl = this.hudWrap.querySelector('[data-role="fever-box"]')!;
    this.feverArcFill = this.hudWrap.querySelector('[data-role="fever-fill"]')!;
    this.feverLabelEl = this.hudWrap.querySelector('[data-role="fever-label"]')!;
    this.faceWipeHoleEl = this.hudWrap.querySelector('[data-role="wipe-hole"]')!;
    this.faceWipeTagEl = this.hudWrap.querySelector('[data-role="wipe-tag"]')!;
    this.tutCardEl = this.hudWrap.querySelector('[data-role="tut-card"]')!;
    this.tutTitleEl = this.hudWrap.querySelector('[data-role="tut-title"]')!;
    this.tutClearBadgeEl = this.hudWrap.querySelector('[data-role="tut-clear-badge"]')!;
    this.tutGuideEl = this.hudWrap.querySelector('[data-role="tut-guide"]')!;
    this.tutDotsEl = this.hudWrap.querySelector('[data-role="tut-dots"]')!;
    this.tutSkipBtn = this.hudWrap.querySelector('[data-role="tut-skip-btn"]')!;
    this.fpsBadgeEl = this.hudWrap.querySelector('[data-role="fps-badge"]')!;
    this.autosaveToastEl = this.hudWrap.querySelector('[data-role="autosave-toast"]')!;
    this.rewardWrapEl = this.hudWrap.querySelector('[data-role="reward-wrap"]')!;
    this.rewardCardEl = this.hudWrap.querySelector('[data-role="reward-card"]')!;
    this.rewardBadgeEl = this.hudWrap.querySelector('[data-role="reward-badge"]')!;
    this.rewardGemsEl = this.hudWrap.querySelector('[data-role="reward-gems"]')!;
    this.rewardTitleEl = this.hudWrap.querySelector('[data-role="reward-title"]')!;
    this.rewardHeartsEl = this.hudWrap.querySelector('[data-role="reward-hearts"]')!;
    this.rewardBodyEl = this.hudWrap.querySelector('[data-role="reward-body"]')!;
    this.rewardOkBtn = this.hudWrap.querySelector('[data-role="reward-ok-btn"]')!;
    this.rewardHintEl = this.hudWrap.querySelector('[data-role="reward-hint"]')!;
    this.tutConfirmWrapEl = this.hudWrap.querySelector('[data-role="tut-confirm-wrap"]')!;
    this.tutConfirmCardEl = this.hudWrap.querySelector('[data-role="tut-confirm-card"]')!;
    this.tutConfirmBadgeEl = this.hudWrap.querySelector('[data-role="tut-confirm-badge"]')!;
    this.tutConfirmMsgEl = this.hudWrap.querySelector('[data-role="tut-confirm-msg"]')!;
    this.tutConfirmDotsEl = this.hudWrap.querySelector('[data-role="tut-confirm-dots"]')!;
    this.tutConfirmPreviewEl = this.hudWrap.querySelector('[data-role="tut-confirm-preview"]')!;
    this.tutConfirmNextBtn = this.hudWrap.querySelector('[data-role="tut-confirm-next-btn"]')!;
    this.tutConfirmNextLabelEl = this.hudWrap.querySelector('[data-role="tut-confirm-next-label"]')!;
    this.tutConfirmSkipBtn = this.hudWrap.querySelector('[data-role="tut-confirm-skip-btn"]')!;
    this.tutConfirmHintEl = this.hudWrap.querySelector('[data-role="tut-confirm-hint"]')!;
    this.welcomeOverlayEl = this.hudWrap.querySelector('[data-role="welcome-overlay"]')!;
    this.welcomeSkipBtn = this.hudWrap.querySelector('[data-role="welcome-skip-btn"]')!;
    this.rainbowOverlayEl = this.hudWrap.querySelector('[data-role="rainbow-overlay"]')!;
    this.rainbowCardEl = this.hudWrap.querySelector('[data-role="rainbow-card"]')!;
    this.rainbowTitleEl = this.hudWrap.querySelector('[data-role="rainbow-title"]')!;
    this.rainbowSubEl = this.hudWrap.querySelector('[data-role="rainbow-sub"]')!;
    this.rainbowSkipBtn = this.hudWrap.querySelector('[data-role="rainbow-skip-btn"]')!;
    this.tourSubEl = this.hudWrap.querySelector('[data-role="tour-sub"]')!;
    this.tourPageBadgeEl = this.hudWrap.querySelector('[data-role="tour-page-badge"]')!;
    this.tourPageDotsEl = this.hudWrap.querySelector('[data-role="tour-page-dots"]')!;
    this.tourSubTextEl = this.hudWrap.querySelector('[data-role="tour-sub-text"]')!;
    this.tourNextBtn = this.hudWrap.querySelector('[data-role="tour-next-btn"]')!;
    this.tourNextLabelEl = this.hudWrap.querySelector('[data-role="tour-next-label"]')!;
    this.tourSkipBtn = this.hudWrap.querySelector('[data-role="tour-skip-btn"]')!;
    this.objectivePillEl = this.hudWrap.querySelector('[data-role="objective-pill"]')!;
    this.objectiveIconEl = this.hudWrap.querySelector('[data-role="objective-icon"]')!;
    this.objectiveTextEl = this.hudWrap.querySelector('[data-role="objective-text"]')!;
    this.navCompassEl = this.hudWrap.querySelector('[data-role="nav-compass"]')!;
    this.navArrowEl = this.hudWrap.querySelector('[data-role="nav-arrow"]')!;
    this.navPrimaryLabelEl = this.hudWrap.querySelector('[data-role="nav-primary-label"]')!;
    this.navPrimaryDistEl = this.hudWrap.querySelector('[data-role="nav-primary-dist"]')!;
    this.navPinsLayerEl = this.hudWrap.querySelector('[data-role="nav-pins"]')!;
    this.contextBannerEl = this.hudWrap.querySelector('[data-role="ctx-banner"]')!;
    this.feverFrameEl = this.hudWrap.querySelector('[data-role="fever-frame"]')!;
    this.feverCutinEl = this.hudWrap.querySelector('[data-role="fever-cutin"]')!;
    this.bossHudEl = this.hudWrap.querySelector('[data-role="boss-hud"]')!;
    this.bossPhaseEl = this.bossHudEl.querySelector('[data-role="boss-phase"]')!;
    this.bossSegs = Array.from(this.bossHudEl.querySelectorAll('.boss-seg'));
    this.bossWeakAlertEl = this.hudWrap.querySelector('[data-role="boss-weak"]')!;
    this.edgeIndContainer = this.hudWrap.querySelector('[data-role="edge-inds"]')!;
    this.calloutLayer = this.hudWrap.querySelector('[data-role="callouts"]')!;
    this.muteBtn = this.hudWrap.querySelector('[data-role="mute-btn"]')!;
    this.feverBtn = this.hudWrap.querySelector('[data-role="fever-btn"]')!;
    this.pauseBtn = this.hudWrap.querySelector('[data-role="pause-btn"]')!;

    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.muteBtn.blur();
      handlers.onToggleMute();
    });
    this.feverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.feverBtn.blur();
      handlers.onTriggerFever();
    });
    this.feverBoxEl.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onTriggerFever();
    });
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pauseBtn.blur();
      handlers.onPause();
    });
    const wireSkipButton = (btn: HTMLButtonElement): void => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.blur();
        handlers.onSkipTutorial();
      });
    };
    const wireAdvanceButton = (btn: HTMLButtonElement): void => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.blur();
        handlers.onAdvanceTutorial();
      });
      // Prevent focused button from triggering on Space key release/press after jumping
      btn.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          e.stopPropagation();
        }
      });
      btn.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    };

    wireSkipButton(this.tutSkipBtn);
    wireSkipButton(this.tutConfirmSkipBtn);
    wireSkipButton(this.tourSkipBtn);
    wireAdvanceButton(this.tutConfirmNextBtn);
    this.rewardOkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rewardOkBtn.blur();
      handlers.onCloseRewardCard?.();
    });
    this.rewardOkBtn.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    wireAdvanceButton(this.tourNextBtn);
    this.welcomeSkipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.welcomeSkipBtn.blur();
      handlers.onSkipWelcomeMovie();
    });
    this.rainbowSkipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rainbowSkipBtn.blur();
      handlers.onSkipRainbowMovie();
    });
  }

  getFaceWipeHoleElement(): HTMLElement {
    return this.faceWipeHoleEl;
  }

  /** 最大♡アップの演出（HUDのハートがはねる）をもう一度見せる */
  pulseMaxHpUp(): void {
    this.heartsEl.querySelectorAll('.bonus-heart').forEach((el) => {
      el.classList.remove('heart-unlock-pop');
      void (el as HTMLElement).getBoundingClientRect();
      el.classList.add('heart-unlock-pop');
    });
    if (this.heartBonusTimer !== null) {
      window.clearTimeout(this.heartBonusTimer);
    }
    this.heartsEl.classList.remove('max-hp-up');
    void this.heartsEl.offsetWidth;
    this.heartsEl.classList.add('max-hp-up');
    this.heartBonusTimer = window.setTimeout(() => {
      this.heartsEl.classList.remove('max-hp-up');
      this.heartBonusTimer = null;
    }, 1800);
  }

  update(snap: HudSnapshot, tutorial: TutorialManager): void {
    const showInGame =
      snap.phase !== 'title' && snap.phase !== 'world_select' && snap.phase !== 'victory';
    if (showInGame !== this.lastShowInGame) {
      this.lastShowInGame = showInGame;
      this.hudWrap.style.display = showInGame ? 'block' : 'none';
    }
    if (!showInGame) return;

    if (snap.touchActive !== this.lastTouchActive) {
      this.lastTouchActive = snap.touchActive;
      this.hudWrap.classList.toggle('touch-active', snap.touchActive);
      this.onLayoutChange?.();
    }

    // Hearts
    const hKey = `${snap.hp}/${snap.maxHp}`;
    if (hKey !== this.lastHeartsKey) {
      this.lastHeartsKey = hKey;
      const maxHpIncreased = this.lastMaxHp > 0 && snap.maxHp > this.lastMaxHp;
      this.lastMaxHp = snap.maxHp;
      let html = '';
      for (let i = 0; i < snap.maxHp; i++) {
        const isBonus = i === snap.maxHp - 1 && snap.maxHp >= 4;
        const extraCls = [
          isBonus ? 'bonus-heart' : '',
          isBonus && maxHpIncreased ? 'heart-unlock-pop' : '',
        ]
          .filter(Boolean)
          .join(' ');
        html += buildHeartSvg(i >= snap.hp, extraCls);
      }
      this.heartsEl.innerHTML = html;
      if (maxHpIncreased) {
        if (this.heartBonusTimer !== null) {
          window.clearTimeout(this.heartBonusTimer);
        }
        this.heartsEl.classList.remove('max-hp-up');
        void this.heartsEl.offsetWidth;
        this.heartsEl.classList.add('max-hp-up');
        this.heartBonusTimer = window.setTimeout(() => {
          this.heartsEl.classList.remove('max-hp-up');
          this.heartBonusTimer = null;
        }, 1800);
      }
    }

    // Stars, Secret Stars & Coins
    const starsText = `${snap.stars} / ${snap.totalStars}`;
    if (starsText !== this.lastStarsText) {
      this.lastStarsText = starsText;
      this.starValEl.textContent = starsText;
    }

    const starPtsText = `${snap.starPoints.toLocaleString()} pts`;
    if (starPtsText !== this.lastStarPtsText) {
      this.lastStarPtsText = starPtsText;
      this.starPtsEl.textContent = starPtsText;
    }

    const secretStarsText = `${snap.secretStars} / ${snap.totalSecretStars}`;
    if (secretStarsText !== this.lastSecretStarsText) {
      this.lastSecretStarsText = secretStarsText;
      this.secretStarsEl.textContent = secretStarsText;
    }

    const coinsText = snap.coins.toLocaleString();
    if (coinsText !== this.lastCoinsText) {
      this.lastCoinsText = coinsText;
      this.coinValEl.textContent = coinsText;
    }

    // Fever arch progress (total arc length ~260)
    const offsetStr = (260 * (1 - Math.min(1, Math.max(0, snap.fever / 100)))).toFixed(1);
    if (offsetStr !== this.lastFeverOffset) {
      this.lastFeverOffset = offsetStr;
      this.feverArcFill.style.strokeDashoffset = offsetStr;
    }

    if (snap.feverActive !== this.lastFeverActive) {
      this.lastFeverActive = snap.feverActive;
      this.feverBoxEl.classList.toggle('active', snap.feverActive);
    }

    let feverLabel: string;
    let feverBtnVisible: boolean;
    let feverBtnText = this.lastFeverBtnText;
    if (snap.feverActive) {
      feverLabel = 'FEVER x8!';
      feverBtnVisible = false;
    } else if (snap.fever >= 100) {
      feverLabel = 'READY!';
      feverBtnVisible = true;
      feverBtnText =
        snap.inputDevice === 'gamepad'
          ? 'LB/RB: FEVER x8!'
          : snap.inputDevice === 'touch'
            ? 'FEVER x8!'
            : 'Q: FEVER x8!';
    } else {
      feverLabel = `FEVER ${Math.floor(snap.fever)}%`;
      feverBtnVisible = false;
    }

    if (feverLabel !== this.lastFeverLabel) {
      this.lastFeverLabel = feverLabel;
      this.feverLabelEl.textContent = feverLabel;
    }
    if (feverBtnVisible !== this.lastFeverBtnVisible) {
      this.lastFeverBtnVisible = feverBtnVisible;
      this.feverBtn.style.display = feverBtnVisible ? 'inline-block' : 'none';
    }
    const feverReady = !snap.feverActive && snap.fever >= 100;
    if (feverReady !== this.lastFeverReady) {
      this.lastFeverReady = feverReady;
      this.feverBoxEl.classList.toggle('ready', feverReady);
    }
    if (snap.tutorialFeverHighlight !== this.lastFeverHighlight) {
      this.lastFeverHighlight = snap.tutorialFeverHighlight;
      this.feverBoxEl.classList.toggle('tutorial-highlight', snap.tutorialFeverHighlight);
      this.feverBtn.classList.toggle('tutorial-highlight', snap.tutorialFeverHighlight);
    }
    if (feverBtnVisible && feverBtnText !== this.lastFeverBtnText) {
      this.lastFeverBtnText = feverBtnText;
      this.feverBtn.textContent = feverBtnText;
    }

    // Mute button
    const muteText = snap.muted ? '🔇 サウンド OFF' : '🔊 サウンド ON';
    if (muteText !== this.lastMuteText) {
      this.lastMuteText = muteText;
      this.muteBtn.textContent = muteText;
    }

    // Face wipe tag & 2D/3D mode
    if (snap.expressionLabelJa !== this.lastWipeTag) {
      this.lastWipeTag = snap.expressionLabelJa;
      this.faceWipeTagEl.textContent = snap.expressionLabelJa;
    }

    const wipeKey = snap.faceWipe3dActive ? '3d' : `2d:${snap.expression}`;
    if (wipeKey !== this.lastFaceWipeModeKey) {
      this.lastFaceWipeModeKey = wipeKey;
      if (snap.faceWipe3dActive) {
        this.faceWipeHoleEl.classList.remove('mode-2d');
        this.faceWipeHoleEl.removeAttribute('data-expr');
        this.faceWipeHoleEl.innerHTML = '';
        this.faceWipeBgEl = null;
        this.faceWipeImgEl = null;
      } else {
        preloadBuuFaceSprites();
        this.faceWipeHoleEl.classList.add('mode-2d');
        if (!this.faceWipeBgEl || !this.faceWipeImgEl) {
          const bgEl = document.createElement('div');
          bgEl.className = 'face-wipe-sprite-bg';
          const imgEl = document.createElement('img');
          imgEl.className = 'face-wipe-sprite-img';
          imgEl.alt = '';
          imgEl.decoding = 'async';
          this.faceWipeHoleEl.replaceChildren(bgEl, imgEl);
          this.faceWipeBgEl = bgEl;
          this.faceWipeImgEl = imgEl;
        }
        const info = getBuuFaceSpriteInfo(snap.expression);
        this.faceWipeHoleEl.dataset.expr = snap.expression;
        this.faceWipeBgEl.style.background = info.bg;
        if (this.faceWipeImgEl.getAttribute('src') !== info.url) {
          this.faceWipeImgEl.src = info.url;
        }
      }
    }

    // FPS badge (hidden by default unless user enables in settings)
    const showFps = Boolean(snap.settings.showFps);
    if (showFps !== this.lastShowFps) {
      this.lastShowFps = showFps;
      this.fpsBadgeEl.classList.toggle('hidden', !showFps);
    }
    if (showFps) {
      const fpsText = `${snap.fps} FPS`;
      if (fpsText !== this.lastFpsText) {
        this.lastFpsText = fpsText;
        this.fpsBadgeEl.textContent = fpsText;
      }
    }

    // Autosave toast
    const showAutosave =
      Boolean(snap.autosaveToastVisible) &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive;
    if (showAutosave !== this.lastAutosaveVisible) {
      this.lastAutosaveVisible = showAutosave;
      this.autosaveToastEl.classList.toggle('hidden', !showAutosave);
    }

    // Opening welcome movie overlay
    const showWelcome = snap.welcomeMovieActive && (snap.phase === 'playing' || snap.phase === 'cutscene');
    if (showWelcome !== this.lastWelcomeVisible) {
      this.lastWelcomeVisible = showWelcome;
      if (showWelcome) {
        const kickerEl = this.welcomeOverlayEl.querySelector('[data-role="welcome-kicker"]');
        const titleEl = this.welcomeOverlayEl.querySelector('[data-role="welcome-main-title"]');
        if (snap.activeWorldId === 'world1') {
          if (kickerEl) kickerEl.textContent = '✨ SUNLIT PLAYROOM ✨';
          if (titleEl) titleEl.textContent = 'ようこそ、キッズルームへ！';
        } else {
          if (kickerEl) kickerEl.textContent = '✨ SKY TOYBOX MEADOW ✨';
          if (titleEl) titleEl.textContent = 'ようこそ、天空のおもちゃばこへ！';
        }
      }
      this.welcomeOverlayEl.classList.toggle('hidden', !showWelcome);
      this.hudWrap.classList.toggle('welcome-active', showWelcome);
      this.onLayoutChange?.();
    }
    if (showWelcome && snap.welcomeMovieCanSkip !== this.lastWelcomeCanSkip) {
      this.lastWelcomeCanSkip = snap.welcomeMovieCanSkip;
      this.welcomeSkipBtn.classList.toggle('guarding', !snap.welcomeMovieCanSkip);
      this.welcomeSkipBtn.setAttribute(
        'aria-disabled',
        snap.welcomeMovieCanSkip ? 'false' : 'true'
      );
    }

    // Rainbow Bridge opening movie overlay
    const showRainbow = snap.rainbowMovieActive && (snap.phase === 'playing' || snap.phase === 'cutscene');
    if (showRainbow !== this.lastRainbowVisible) {
      this.lastRainbowVisible = showRainbow;
      this.rainbowOverlayEl.classList.toggle('hidden', !showRainbow);
      this.hudWrap.classList.toggle('rainbow-movie-active', showRainbow);
      this.onLayoutChange?.();
      if (!showRainbow) {
        this.lastRainbowCanSkip = null;
        this.lastRainbowTextKey = '';
      }
    }
    if (showRainbow) {
      if (snap.rainbowMovieCanSkip !== this.lastRainbowCanSkip) {
        this.lastRainbowCanSkip = snap.rainbowMovieCanSkip;
        this.rainbowSkipBtn.classList.toggle('guarding', !snap.rainbowMovieCanSkip);
        this.rainbowSkipBtn.setAttribute(
          'aria-disabled',
          snap.rainbowMovieCanSkip ? 'false' : 'true'
        );
      }
      const rKey = `${snap.rainbowMovieAct}|${snap.rainbowMovieTitle}|${snap.rainbowMovieSubtitle}`;
      if (rKey !== this.lastRainbowTextKey) {
        this.lastRainbowTextKey = rKey;
        this.rainbowCardEl.dataset.act = String(snap.rainbowMovieAct);
        this.rainbowTitleEl.textContent = snap.rainbowMovieTitle;
        this.rainbowSubEl.textContent = snap.rainbowMovieSubtitle;
      }
    }

    // Tutorial card (hidden during welcome movie, confirm card, tour, boss fight, or non-playing phase)
    const pendingInfo = tutorial.getPendingInfo(snap.feverActive);
    const confirmInfo = tutorial.getConfirmInfo(snap.inputDevice);
    const tourInfo = tutorial.getTourPageInfo();
    const tutInfo = tutorial.getStepText(
      snap.inputDevice,
      snap.playerAirborne,
      snap.playerJumpCount
    );
    const showTut = Boolean(
      tutInfo &&
        snap.phase === 'playing' &&
        !snap.welcomeMovieActive &&
        !snap.rainbowMovieActive &&
        !snap.bossActive &&
        !tourInfo &&
        !confirmInfo
    );
    if (showTut !== this.lastTutVisible) {
      this.lastTutVisible = showTut;
      this.tutCardEl.classList.toggle('hidden', !showTut);
    }
    if (showTut && tutInfo) {
      const isCleared = Boolean(pendingInfo);
      const isUrgent = !isCleared && Boolean(tutInfo.urgent);
      if (isCleared !== this.lastTutCleared) {
        this.lastTutCleared = isCleared;
        this.tutCardEl.classList.toggle('cleared', isCleared);
        this.tutClearBadgeEl.classList.toggle('hidden', !isCleared);
      }
      if (isUrgent !== this.lastTutUrgent) {
        this.lastTutUrgent = isUrgent;
        this.tutCardEl.classList.toggle('urgent', isUrgent);
      }
      if (snap.tutorialSkipAvailable !== this.lastTutSkipVisible) {
        this.lastTutSkipVisible = snap.tutorialSkipAvailable;
        this.tutSkipBtn.style.display = snap.tutorialSkipAvailable ? 'inline-flex' : 'none';
      }
      const guideText = pendingInfo ? pendingInfo.message : tutInfo.guide;
      const pendingBadge = pendingInfo ? pendingInfo.badge : '';
      const tKey = `${snap.tutorialStep}|${snap.inputDevice}|${isCleared}|${pendingBadge}|${tutInfo.title}|${guideText}|${snap.tutorialChecklist.join(',')}`;
      if (tKey !== this.lastTutKey) {
        this.lastTutKey = tKey;
        this.tutTitleEl.textContent = tutInfo.title;
        if (pendingInfo) {
          this.tutClearBadgeEl.textContent = pendingInfo.badge;
        }
        this.tutGuideEl.textContent = guideText;
        this.tutDotsEl.innerHTML = snap.tutorialChecklist
          .map((done, i) => `<div class="tut-dot ${done ? 'done' : ''}">${done ? '✓' : i + 1}</div>`)
          .join('');
      }
    }

    // スターのお知らせカード（金色メインスター・青いひみつスター）
    const reward = snap.phase === 'playing' ? snap.rewardCard : null;
    const rewardKey = reward
      ? `${reward.kind}|${reward.found}|${reward.title}|${snap.inputDevice}`
      : null;
    if (rewardKey !== this.lastRewardKey) {
      this.lastRewardKey = rewardKey;
      this.rewardWrapEl.classList.toggle('hidden', !reward);
      this.hudWrap.classList.toggle('reward-open', Boolean(reward));
      this.lastRewardReady = null;
      if (reward) {
        const isMain = reward.kind === 'main' || reward.kind === 'mainComplete';
        const isSecretComplete = reward.kind === 'secretComplete';
        const isMainComplete = reward.kind === 'mainComplete';
        this.rewardCardEl.classList.toggle('is-complete', isSecretComplete);
        this.rewardCardEl.classList.toggle('is-main', reward.kind === 'main');
        this.rewardCardEl.classList.toggle('is-main-complete', isMainComplete);
        this.rewardBadgeEl.textContent = reward.badge;
        this.rewardTitleEl.textContent = reward.title;
        this.rewardBodyEl.textContent = reward.body;
        const gotIcon = isMain ? '⭐' : '💎';
        let gems = '';
        for (let i = 0; i < reward.total; i++) {
          gems += `<span class="reward-gem ${i < reward.found ? 'got' : ''}">${i < reward.found ? gotIcon : '？'}</span>`;
        }
        this.rewardGemsEl.innerHTML = gems;
        if (isSecretComplete) {
          let before = '';
          for (let i = 0; i < reward.prevMaxHp; i++) before += buildHeartSvg(false);
          let after = '';
          for (let i = 0; i < reward.newMaxHp; i++) {
            after += buildHeartSvg(false, i >= reward.prevMaxHp ? 'bonus-heart heart-unlock-pop' : '');
          }
          this.rewardHeartsEl.innerHTML =
            `<div class="reward-heart-row is-before">${before}</div>` +
            `<div class="reward-heart-arrow">▶</div>` +
            `<div class="reward-heart-row is-after">${after}</div>`;
        } else {
          this.rewardHeartsEl.innerHTML = '';
        }
        this.rewardHeartsEl.classList.toggle('hidden', !isSecretComplete);
        this.rewardHintEl.textContent =
          snap.inputDevice === 'gamepad'
            ? 'Aボタンでとじる'
            : snap.inputDevice === 'touch'
              ? '「OK！」をタップしてつづけよう'
              : 'Enter キーでもとじられるよ';
      }
      this.onLayoutChange?.();
    }
    if (reward && snap.rewardCardReady !== this.lastRewardReady) {
      this.lastRewardReady = snap.rewardCardReady;
      this.rewardOkBtn.classList.toggle('guarding', !snap.rewardCardReady);
      this.rewardOkBtn.setAttribute('aria-disabled', snap.rewardCardReady ? 'false' : 'true');
    }

    // Step 0 Intro & Step 1-6 Completion Confirm Card
    const showConfirm = Boolean(
      confirmInfo && snap.phase === 'playing' && !snap.welcomeMovieActive && !snap.bossActive
    );
    if (showConfirm !== this.lastConfirmVisible) {
      this.lastConfirmVisible = showConfirm;
      this.tutConfirmWrapEl.classList.toggle('hidden', !showConfirm);
      this.hudWrap.classList.toggle('confirm-open', showConfirm);
      this.onLayoutChange?.();
      if (!showConfirm) {
        this.lastConfirmReady = null;
      }
    }
    if (showConfirm && confirmInfo) {
      const isIntro = confirmInfo.step === 0;
      const hintText =
        snap.inputDevice === 'gamepad'
          ? isIntro
            ? 'Aボタンでも「やってみよう！」へ進めるよ'
            : 'Aボタンでもつぎへ進めるよ'
          : snap.inputDevice === 'touch'
            ? isIntro
              ? '「やってみよう！ ▶」をタップしてはじめよう！'
              : '「つぎへ ▶」をタップしてすすもう！'
            : isIntro
              ? 'Enter キーでも「やってみよう！」へ進めるよ'
              : 'Enter キーでもつぎへ進めるよ';
      const cKey = `${confirmInfo.step}|${snap.inputDevice}|${snap.tutorialChecklist.join(',')}`;
      if (cKey !== this.lastConfirmKey) {
        this.lastConfirmKey = cKey;
        this.tutConfirmCardEl.classList.toggle('is-intro', isIntro);
        this.tutConfirmBadgeEl.textContent = confirmInfo.badge;
        this.tutConfirmMsgEl.textContent = confirmInfo.message;
        this.tutConfirmPreviewEl.textContent = confirmInfo.nextPreview;
        this.tutConfirmNextLabelEl.textContent = confirmInfo.buttonLabel;
        this.tutConfirmHintEl.textContent = hintText;
        this.tutConfirmDotsEl.innerHTML = snap.tutorialChecklist
          .map((done, i) => `<div class="tut-dot ${done ? 'done' : ''}">${done ? '✓' : i + 1}</div>`)
          .join('');
      }
      if (snap.tutorialConfirmReady !== this.lastConfirmReady) {
        this.lastConfirmReady = snap.tutorialConfirmReady;
        this.tutConfirmNextBtn.classList.toggle('guarding', !snap.tutorialConfirmReady);
        this.tutConfirmNextBtn.setAttribute(
          'aria-disabled',
          snap.tutorialConfirmReady ? 'false' : 'true'
        );
      }
    }

    // Step 7 Manual Tour Card (3 pages)
    const showTour = Boolean(
      tourInfo && snap.phase === 'playing' && !snap.welcomeMovieActive && !snap.bossActive
    );
    if (showTour !== this.lastTourVisible) {
      this.lastTourVisible = showTour;
      this.tourSubEl.classList.toggle('hidden', !showTour);
      this.hudWrap.classList.toggle('tour-open', showTour);
      this.onLayoutChange?.();
      if (!showTour) {
        this.lastTourReady = null;
      }
    }
    if (showTour && tourInfo) {
      const tourKey = `${tourInfo.page}|${tourInfo.subtitle}`;
      if (tourKey !== this.lastTourKey) {
        this.lastTourKey = tourKey;
        this.tourPageBadgeEl.textContent = `🗺️ ${tourInfo.title}`;
        this.tourSubTextEl.textContent = tourInfo.subtitle;
        this.tourNextLabelEl.textContent = tourInfo.buttonLabel;
        this.tourNextBtn.classList.toggle('is-last', tourInfo.isLast);
        this.tourPageDotsEl.innerHTML = [0, 1, 2]
          .map(
            (idx) =>
              `<span class="tour-page-dot ${idx === tourInfo.page ? 'active' : idx < tourInfo.page ? 'done' : ''}"></span>`
          )
          .join('');
      }
      if (snap.tutorialConfirmReady !== this.lastTourReady) {
        this.lastTourReady = snap.tutorialConfirmReady;
        this.tourNextBtn.classList.toggle('guarding', !snap.tutorialConfirmReady);
        this.tourNextBtn.setAttribute(
          'aria-disabled',
          snap.tutorialConfirmReady ? 'false' : 'true'
        );
      }
      if (snap.tutorialSkipAvailable !== this.lastTourSkipVisible) {
        this.lastTourSkipVisible = snap.tutorialSkipAvailable;
        this.tourSkipBtn.style.display = snap.tutorialSkipAvailable ? 'inline-flex' : 'none';
      }
    }

    // Persistent current objective pill
    const showObjective =
      snap.tutorialStep === 'done' &&
      !snap.bossActive &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive &&
      (snap.phase === 'playing' || snap.phase === 'cutscene');
    if (showObjective !== this.lastObjectiveVisible) {
      this.lastObjectiveVisible = showObjective;
      this.objectivePillEl.classList.toggle('hidden', !showObjective);
    }
    if (showObjective) {
      const objKey = `${snap.objectiveIcon}|${snap.objectiveText}`;
      if (objKey !== this.lastObjectiveKey) {
        this.lastObjectiveKey = objKey;
        this.objectiveIconEl.textContent = snap.objectiveIcon;
        this.objectiveTextEl.textContent = snap.objectiveText;
      }
    }

    // Directional Compass Navigator
    const showNavCompass =
      snap.tutorialStep === 'done' &&
      !snap.bossActive &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive &&
      snap.phase === 'playing' &&
      snap.navTargets.length > 0;
    if (showNavCompass !== this.lastNavVisible) {
      this.lastNavVisible = showNavCompass;
      this.navCompassEl.classList.toggle('hidden', !showNavCompass);
    }
    if (showNavCompass) {
      const primary = snap.navTargets.find((t) => t.isPrimary) ?? snap.navTargets[0];
      if (primary) {
        const pKey = `${primary.id}|${primary.label}|${primary.distanceM}`;
        if (pKey !== this.lastNavPrimaryKey) {
          this.lastNavPrimaryKey = pKey;
          this.navPrimaryLabelEl.textContent = primary.label;
          this.navPrimaryDistEl.textContent = `${primary.distanceM}m`;
        }
        const arrowDeg = Math.round((primary.relAngleRad * 180) / Math.PI);
        if (arrowDeg !== this.lastNavArrowDeg) {
          this.lastNavArrowDeg = arrowDeg;
          this.navArrowEl.style.transform = `rotate(${arrowDeg}deg)`;
        }
      }

      const activePinIds = new Set<string>();
      const pinLayouts = snap.navTargets.map((t) => {
        const behind = Math.abs(t.relAngleRad) > Math.PI * 0.52;
        const norm = Math.max(-1, Math.min(1, t.relAngleRad / (Math.PI * 0.39)));
        const pct = behind ? (t.relAngleRad >= 0 ? 92 : 8) : 50 + norm * 38;
        return { t, behind, pct };
      });
      pinLayouts.sort((a, b) => a.pct - b.pct);
      const minGap = 24;
      for (let i = 1; i < pinLayouts.length; i++) {
        if (pinLayouts[i].pct < pinLayouts[i - 1].pct + minGap) {
          pinLayouts[i].pct = pinLayouts[i - 1].pct + minGap;
        }
      }
      if (pinLayouts.length > 0 && pinLayouts[pinLayouts.length - 1].pct > 90) {
        pinLayouts[pinLayouts.length - 1].pct = 90;
        for (let i = pinLayouts.length - 2; i >= 0; i--) {
          if (pinLayouts[i].pct > pinLayouts[i + 1].pct - minGap) {
            pinLayouts[i].pct = pinLayouts[i + 1].pct - minGap;
          }
        }
      }
      for (const item of pinLayouts) {
        item.pct = Math.max(10, Math.min(90, item.pct));
        const t = item.t;
        const behind = item.behind;
        activePinIds.add(t.id);
        let pin = this.navPinNodes.get(t.id);
        if (!pin) {
          const el = document.createElement('div');
          el.className = 'nav-compass-pin';
          this.navPinsLayerEl.appendChild(el);
          pin = {
            el,
            lastLeft: '',
            lastText: '',
            lastBehind: false,
            lastPrimary: false,
            visible: true,
          };
          this.navPinNodes.set(t.id, pin);
        }

        const leftStr = `${item.pct.toFixed(1)}%`;
        const textStr = t.shortLabel;

        if (!pin.visible) {
          pin.el.style.display = 'inline-flex';
          pin.visible = true;
        }
        if (leftStr !== pin.lastLeft) {
          pin.lastLeft = leftStr;
          pin.el.style.left = leftStr;
        }
        if (textStr !== pin.lastText) {
          pin.lastText = textStr;
          pin.el.textContent = textStr;
        }
        if (behind !== pin.lastBehind) {
          pin.lastBehind = behind;
          pin.el.classList.toggle('behind', behind);
        }
        if (t.isPrimary !== pin.lastPrimary) {
          pin.lastPrimary = t.isPrimary;
          pin.el.classList.toggle('primary', t.isPrimary);
        }
      }
      for (const [id, pin] of this.navPinNodes) {
        if (!activePinIds.has(id) && pin.visible) {
          pin.el.style.display = 'none';
          pin.visible = false;
        }
      }
    }

    // Contextual banner (only show during active gameplay outside confirm card, tour & movies)
    const activeHint =
      snap.phase === 'playing' &&
      !confirmInfo &&
      !tourInfo &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive
        ? snap.contextualHint
        : null;
    if (activeHint !== this.lastContextHint) {
      this.lastContextHint = activeHint;
      if (activeHint) {
        this.contextBannerEl.textContent = activeHint;
        this.contextBannerEl.classList.remove('hidden');
      } else {
        this.contextBannerEl.classList.add('hidden');
      }
    }

    // FEVER screen rainbow border & cut-in banner
    const showFeverFrame = snap.feverActive && snap.phase === 'playing';
    if (showFeverFrame !== this.lastFeverFrameVisible) {
      this.lastFeverFrameVisible = showFeverFrame;
      this.feverFrameEl.classList.toggle('active', showFeverFrame);
    }

    const topHudTall = showTut || snap.bossActive;
    if (topHudTall !== this.lastTopHudTall) {
      this.lastTopHudTall = topHudTall;
      this.hudWrap.classList.toggle('top-hud-tall', topHudTall);
    }

    const showFeverCutin =
      snap.feverBannerActive &&
      snap.phase === 'playing' &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive &&
      !confirmInfo &&
      !tourInfo;
    if (showFeverCutin !== this.lastFeverCutinVisible) {
      this.lastFeverCutinVisible = showFeverCutin;
      this.feverCutinEl.classList.toggle('hidden', !showFeverCutin);
      this.hudWrap.classList.toggle('fever-banner-open', showFeverCutin);
    }

    // Boss HUD
    if (snap.bossActive !== this.lastBossActive) {
      this.lastBossActive = snap.bossActive;
      this.bossHudEl.classList.toggle('hidden', !snap.bossActive);
    }
    if (snap.bossActive) {
      const phaseText = `PHASE ${snap.bossPhase}`;
      if (phaseText !== this.lastBossPhaseText) {
        this.lastBossPhaseText = phaseText;
        this.bossPhaseEl.textContent = phaseText;
      }
      if (snap.bossHp !== this.lastBossHp) {
        this.lastBossHp = snap.bossHp;
        this.bossSegs.forEach((seg, idx) => {
          seg.classList.toggle('empty', idx >= snap.bossHp);
        });
      }
      if (snap.bossWeakExposed !== this.lastBossWeakExposed) {
        this.lastBossWeakExposed = snap.bossWeakExposed;
        this.bossWeakAlertEl.classList.toggle('hidden', !snap.bossWeakExposed);
      }
    }

    // Off-screen main star direction indicators (pooled DOM nodes, zero innerHTML churn)
    const w = window.innerWidth;
    const h = window.innerHeight;
    const activeStarIds = new Set<number>();
    const showEdgeInds =
      !showConfirm &&
      !showTour &&
      !snap.welcomeMovieActive &&
      !snap.rainbowMovieActive &&
      !showNavCompass;
    if (showEdgeInds) {
      const topSafe = h < 500 ? 82 : w <= 640 ? 204 : 114;
      for (const s of snap.starIndicators) {
        if (s.kind !== 'main' || s.collected || s.onScreen) continue;
        activeStarIds.add(s.id);

        let node = this.edgeIndNodes.get(s.id);
        if (!node) {
          const el = document.createElement('div');
          el.className = 'star-edge-ind';
          const arrow = document.createElement('span');
          arrow.className = 'star-edge-arrow';
          arrow.textContent = '➤';
          const label = document.createElement('span');
          label.textContent = `★${s.id}`;
          el.appendChild(arrow);
          el.appendChild(label);
          this.edgeIndContainer.appendChild(el);
          node = { el, arrow, label, lastX: -9999, lastY: -9999, lastDeg: -9999, visible: true };
          this.edgeIndNodes.set(s.id, node);
        }

        const cx = w * 0.5;
        const cy = h * 0.5;
        const dx = Math.cos(s.angleRad);
        const dy = Math.sin(s.angleRad);
        const padX = w * 0.43;
        const padY = h * 0.40;
        const scale = Math.min(
          Math.abs(dx) > 0.001 ? padX / Math.abs(dx) : 9999,
          Math.abs(dy) > 0.001 ? padY / Math.abs(dy) : 9999
        );
        let px = cx + dx * scale;
        let py = cy + dy * scale;
        // Avoid overlapping top-center cards, compass, boss bar, or bottom-left face wipe
        if (py < topSafe && px > w * 0.20 && px < w * 0.80) {
          py = topSafe;
        }
        if (snap.touchActive) {
          if (px < 140 && py > h - 160) {
            px = 140;
          }
        } else if (px < 220 && py > h - 220) {
          px = 220;
        }

        const rx = Math.round(px);
        const ry = Math.round(py);
        const rdeg = Math.round((s.angleRad * 180) / Math.PI);

        if (!node.visible) {
          node.el.style.display = 'flex';
          node.visible = true;
        }
        if (rx !== node.lastX) {
          node.lastX = rx;
          node.el.style.left = `${rx}px`;
        }
        if (ry !== node.lastY) {
          node.lastY = ry;
          node.el.style.top = `${ry}px`;
        }
        if (rdeg !== node.lastDeg) {
          node.lastDeg = rdeg;
          node.arrow.style.transform = `rotate(${rdeg}deg)`;
        }
      }
    }
    for (const [id, node] of this.edgeIndNodes) {
      if (!activeStarIds.has(id) && node.visible) {
        node.el.style.display = 'none';
        node.visible = false;
      }
    }

    // Dopamine callouts (diff by id + dirty check)
    const activeCalloutIds = new Set<number>();
    for (const c of snap.callouts) {
      activeCalloutIds.add(c.id);
      let node = this.calloutNodes.get(c.id);
      if (!node) {
        const el = document.createElement('div');
        el.className = `callout-item ${c.style}`;
        el.innerHTML = `<div class="callout-main"></div>${c.subText ? '<div class="callout-sub"></div>' : ''}`;
        el.querySelector('.callout-main')!.textContent = c.text;
        if (c.subText) {
          el.querySelector('.callout-sub')!.textContent = c.subText;
        }
        this.calloutLayer.appendChild(el);
        node = { el, lastX: -9999, lastY: -9999, lastOpacity: '' };
        this.calloutNodes.set(c.id, node);
      }
      const rx = Math.round(c.x);
      const ry = Math.round(c.y);
      const fade = c.age > c.duration * 0.7 ? 1 - (c.age - c.duration * 0.7) / (c.duration * 0.3) : 1;
      const opStr = Math.max(0, Math.min(1, fade)).toFixed(2);

      if (rx !== node.lastX) {
        node.lastX = rx;
        node.el.style.left = `${rx}px`;
      }
      if (ry !== node.lastY) {
        node.lastY = ry;
        node.el.style.top = `${ry}px`;
      }
      if (opStr !== node.lastOpacity) {
        node.lastOpacity = opStr;
        node.el.style.opacity = opStr;
      }
    }
    for (const [id, node] of this.calloutNodes) {
      if (!activeCalloutIds.has(id)) {
        node.el.remove();
        this.calloutNodes.delete(id);
      }
    }
  }
}

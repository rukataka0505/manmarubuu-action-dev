export type PwaPlatformKind =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'other-mobile'
  | 'desktop';

export interface PwaEnvironmentInfo {
  isMobile: boolean;
  isStandalone: boolean;
  platform: PwaPlatformKind;
}

export interface PwaDebugState {
  isMobile: boolean;
  isStandalone: boolean;
  platform: PwaPlatformKind;
  isOpen: boolean;
  hasDeferredPrompt: boolean;
  canShowTitleButton: boolean;
  dismissedInSession: boolean;
  suppressedForever: boolean;
}

export interface PwaInstallPromptHandlers {
  onPlayUiClick?: () => void;
  onAvailabilityChange?: (canShowTitleButton: boolean) => void;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const SESSION_DISMISSED_KEY = 'manmarubuu_pwa_dismissed_session_v1';
const LOCAL_SUPPRESS_KEY = 'manmarubuu_pwa_suppress_auto_v1';

let captureInitialized = false;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedInSession = false;
let sessionDismissedMemory = false;
const promptStateListeners = new Set<() => void>();

function notifyCaptureListeners(): void {
  for (const listener of promptStateListeners) {
    listener();
  }
}

export function initPwaInstallCapture(): void {
  if (captureInitialized || typeof window === 'undefined') return;
  captureInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    const bipEvent = event as BeforeInstallPromptEvent;
    if (typeof bipEvent.preventDefault === 'function') {
      bipEvent.preventDefault();
    }
    deferredPrompt = bipEvent;
    notifyCaptureListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedInSession = true;
    notifyCaptureListeners();
  });
}

function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasMatchMediaCoarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0 || hasMatchMediaCoarse;
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches);
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayStandalone || iosStandalone;
}

export function detectPwaEnvironment(): PwaEnvironmentInfo {
  if (typeof navigator === 'undefined') {
    return { isMobile: false, isStandalone: false, platform: 'desktop' };
  }

  const ua = navigator.userAgent ?? '';
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobileUa =
    isIos || isAndroid || /Mobile|Tablet|Windows Phone|Silk|Kindle|PlayBook/i.test(ua);

  const isMobile = isMobileUa && isTouchCapableDevice();
  const isStandalone = isStandaloneMode();

  if (!isMobile) {
    return { isMobile: false, isStandalone, platform: 'desktop' };
  }

  if (isIos) {
    const isNonSafariIos =
      /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|YJApp|GSA\//i.test(
        ua
      );
    const isSafari = /Safari/i.test(ua) && !isNonSafariIos;
    return {
      isMobile: true,
      isStandalone,
      platform: isSafari ? 'ios-safari' : 'ios-other',
    };
  }

  if (isAndroid) {
    const isInAppOrOtherAndroid =
      /Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|Firefox|OPR\/|SamsungBrowser|EdgA/i.test(
        ua
      );
    const isChrome = /Chrome\//i.test(ua) && !isInAppOrOtherAndroid;
    return {
      isMobile: true,
      isStandalone,
      platform: isChrome ? 'android-chrome' : 'other-mobile',
    };
  }

  return {
    isMobile: true,
    isStandalone,
    platform: 'other-mobile',
  };
}

function readSessionDismissed(): boolean {
  if (sessionDismissedMemory) return true;
  try {
    return window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionDismissed(dismissed: boolean): void {
  sessionDismissedMemory = dismissed;
  try {
    if (dismissed) {
      window.sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
    } else {
      window.sessionStorage.removeItem(SESSION_DISMISSED_KEY);
    }
  } catch {
    // Ignore storage errors in private mode
  }
}

function readSuppressedForever(): boolean {
  try {
    return window.localStorage.getItem(LOCAL_SUPPRESS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSuppressedForever(suppress: boolean): void {
  try {
    if (suppress) {
      window.localStorage.setItem(LOCAL_SUPPRESS_KEY, '1');
    } else {
      window.localStorage.removeItem(LOCAL_SUPPRESS_KEY);
    }
  } catch {
    // Ignore storage errors in private mode
  }
}

function svgShareIcon(): string {
  return `<svg class="pwa-step-svg pwa-ico-share" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M14 3.5V17.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M9.5 8L14 3.5L18.5 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.5 12.5H6.5C5.4 12.5 4.5 13.4 4.5 14.5V22.5C4.5 23.6 5.4 24.5 6.5 24.5H21.5C22.6 24.5 23.5 23.6 23.5 22.5V14.5C23.5 13.4 22.6 12.5 21.5 12.5H19.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgAddHomeIcon(): string {
  return `<svg class="pwa-step-svg pwa-ico-add" viewBox="0 0 28 28" aria-hidden="true">
    <rect x="4" y="4" width="20" height="20" rx="5.5" fill="none" stroke="currentColor" stroke-width="2.3"/>
    <path d="M14 9.2V18.8M9.2 14H18.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

function svgCheckDoneIcon(): string {
  return `<svg class="pwa-step-svg pwa-ico-done" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="10.5" fill="none" stroke="currentColor" stroke-width="2.3"/>
    <path d="M9.2 14.2L12.6 17.6L19 10.8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgDotsMenuIcon(): string {
  return `<svg class="pwa-step-svg pwa-ico-menu" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="6.5" r="2.2" fill="currentColor"/>
    <circle cx="14" cy="14" r="2.2" fill="currentColor"/>
    <circle cx="14" cy="21.5" r="2.2" fill="currentColor"/>
  </svg>`;
}

function svgInstallAppIcon(): string {
  return `<svg class="pwa-step-svg pwa-ico-install" viewBox="0 0 28 28" aria-hidden="true">
    <rect x="6" y="3.5" width="16" height="21" rx="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <path d="M14 8.5V16.5M10.5 13.2L14 16.8L17.5 13.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function buildStepsHtml(
  steps: Array<{ num: string; iconSvg: string; textHtml: string }>
): string {
  return `<div class="pwa-steps">${steps
    .map(
      (step) => `
      <div class="pwa-step">
        <span class="pwa-step-num">${step.num}</span>
        <span class="pwa-step-ico">${step.iconSvg}</span>
        <div class="pwa-step-txt">${step.textHtml}</div>
      </div>`
    )
    .join('')}</div>`;
}

export class PwaInstallPrompt {
  private modalEl: HTMLDivElement;
  private nativeCtaWrapEl: HTMLDivElement;
  private nativeInstallBtn: HTMLButtonElement;
  private guideBodyEl: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private suppressCheckbox: HTMLInputElement;
  private dismissBtn: HTMLButtonElement;
  private handlers: PwaInstallPromptHandlers;

  private env: PwaEnvironmentInfo;
  private openState = false;
  private unsubscribeListener: () => void;
  private copyTimerId: number | null = null;

  constructor(container: HTMLElement, handlers: PwaInstallPromptHandlers = {}) {
    initPwaInstallCapture();
    this.handlers = handlers;
    this.env = detectPwaEnvironment();

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop pwa-modal-backdrop hidden';
    this.modalEl.dataset.role = 'pwa-install-modal';
    this.modalEl.setAttribute('aria-hidden', 'true');
    this.modalEl.innerHTML = `
      <div class="result-card modal-card pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <div class="result-title" id="pwa-install-title"><span>📲 ホーム画面に追加しよう！</span></div>
        <div class="pwa-hero">
          <img class="pwa-app-icon" src="./icons/icon-192.png" alt="まんまるぶう アプリアイコン" width="54" height="54" />
          <div class="pwa-hero-text">
            <div class="pwa-hero-lead">フルスクリーンで快適に遊べるよ！</div>
            <div class="pwa-hero-sub">ホーム画面から起動すると、アドレスバーが消えて画面いっぱいで冒険できるよ♪</div>
          </div>
        </div>
        <div class="pwa-native-cta-wrap hidden" data-role="pwa-native-cta-wrap">
          <button class="play-btn btn-sm pwa-install-btn" data-role="pwa-native-install-btn" type="button">
            <span class="btn-label">📲 ホーム画面に追加する</span>
          </button>
        </div>
        <div class="pwa-status hidden" data-role="pwa-install-status"></div>
        <div class="pwa-guide-body" data-role="pwa-guide-body"></div>
        <div class="pwa-footer">
          <label class="pwa-suppress-label">
            <input type="checkbox" class="pwa-suppress-checkbox" data-role="pwa-suppress-checkbox" />
            <span>次回から自動で表示しない</span>
          </label>
          <button class="pwa-dismiss-btn" data-role="pwa-dismiss-btn" type="button">
            このままブラウザで遊ぶ
          </button>
        </div>
      </div>
    `;
    container.appendChild(this.modalEl);

    this.nativeCtaWrapEl = this.modalEl.querySelector('[data-role="pwa-native-cta-wrap"]')!;
    this.nativeInstallBtn = this.modalEl.querySelector('[data-role="pwa-native-install-btn"]')!;
    this.guideBodyEl = this.modalEl.querySelector('[data-role="pwa-guide-body"]')!;
    this.statusEl = this.modalEl.querySelector('[data-role="pwa-install-status"]')!;
    this.suppressCheckbox = this.modalEl.querySelector('[data-role="pwa-suppress-checkbox"]')!;
    this.dismissBtn = this.modalEl.querySelector('[data-role="pwa-dismiss-btn"]')!;

    this.nativeInstallBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onPlayUiClick?.();
      void this.triggerNativeInstall();
    });

    this.dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onPlayUiClick?.();
      this.close(true);
    });

    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.handlers.onPlayUiClick?.();
        this.close(true);
      }
    });

    const onCaptureUpdate = (): void => {
      this.renderContent();
      this.handlers.onAvailabilityChange?.(this.canShowTitleButton());
    };
    promptStateListeners.add(onCaptureUpdate);
    this.unsubscribeListener = () => {
      promptStateListeners.delete(onCaptureUpdate);
    };

    this.renderContent();
  }

  public destroy(): void {
    this.unsubscribeListener();
    if (this.copyTimerId !== null) {
      window.clearTimeout(this.copyTimerId);
      this.copyTimerId = null;
    }
  }

  public isOpen(): boolean {
    return this.openState;
  }

  public canShowTitleButton(): boolean {
    this.env = detectPwaEnvironment();
    return this.env.isMobile && !this.env.isStandalone && !installedInSession;
  }

  public shouldAutoOpen(): boolean {
    this.env = detectPwaEnvironment();
    if (!this.env.isMobile || this.env.isStandalone || installedInSession) {
      return false;
    }
    if (readSessionDismissed() || readSuppressedForever()) {
      return false;
    }
    return true;
  }

  public maybeAutoOpen(): boolean {
    if (!this.shouldAutoOpen()) return false;
    this.open();
    return true;
  }

  public open(): void {
    this.env = detectPwaEnvironment();
    this.suppressCheckbox.checked = readSuppressedForever();
    this.statusEl.classList.add('hidden');
    this.statusEl.textContent = '';
    this.renderContent();
    this.openState = true;
    this.modalEl.classList.remove('hidden');
    this.modalEl.setAttribute('aria-hidden', 'false');
  }

  public close(markDismissed: boolean): void {
    if (markDismissed) {
      writeSessionDismissed(true);
      writeSuppressedForever(this.suppressCheckbox.checked);
    }
    if (!this.openState) return;
    this.openState = false;
    this.modalEl.classList.add('hidden');
    this.modalEl.setAttribute('aria-hidden', 'true');
  }

  public getDebugState(): PwaDebugState {
    this.env = detectPwaEnvironment();
    return {
      isMobile: this.env.isMobile,
      isStandalone: this.env.isStandalone,
      platform: this.env.platform,
      isOpen: this.openState,
      hasDeferredPrompt: deferredPrompt !== null,
      canShowTitleButton: this.canShowTitleButton(),
      dismissedInSession: readSessionDismissed(),
      suppressedForever: readSuppressedForever(),
    };
  }

  private async triggerNativeInstall(): Promise<void> {
    if (!deferredPrompt) return;
    const promptEvent = deferredPrompt;
    this.nativeInstallBtn.disabled = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        installedInSession = true;
        this.showStatus('✅ ホーム画面に追加したよ！アイコンから起動してみてね♪');
        this.renderContent();
        this.handlers.onAvailabilityChange?.(this.canShowTitleButton());
      } else {
        this.renderContent();
      }
    } catch {
      deferredPrompt = null;
      this.renderContent();
    } finally {
      this.nativeInstallBtn.disabled = false;
    }
  }

  private showStatus(message: string): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.remove('hidden');
  }

  private renderContent(): void {
    this.env = detectPwaEnvironment();
    const hasNativePrompt = deferredPrompt !== null && !installedInSession;
    this.nativeCtaWrapEl.classList.toggle('hidden', !hasNativePrompt);

    if (this.env.platform === 'ios-safari') {
      this.guideBodyEl.innerHTML = buildStepsHtml([
        {
          num: '1',
          iconSvg: svgShareIcon(),
          textHtml: '画面下の <strong>共有ボタン（□↑）</strong> をタップ',
        },
        {
          num: '2',
          iconSvg: svgAddHomeIcon(),
          textHtml: 'メニューから <strong>「ホーム画面に追加」</strong> をタップ',
        },
        {
          num: '3',
          iconSvg: svgCheckDoneIcon(),
          textHtml: '右上の <strong>「追加」</strong> をタップして完了！',
        },
      ]);
      return;
    }

    if (this.env.platform === 'ios-other') {
      this.guideBodyEl.innerHTML = `
        <div class="pwa-ios-other-box">
          <div class="pwa-ios-other-badge">🧭 Safari でひらいてね！</div>
          <p class="pwa-ios-other-msg">
            iPhone では <strong>Safari</strong> から追加できます。<br />
            Safari でこのページを開き直して、共有ボタン（□↑）から<strong>「ホーム画面に追加」</strong>を選んでね！
          </p>
          <button class="mini-btn stitch-mini pwa-copy-url-btn" data-role="pwa-copy-url-btn" type="button">
            📋 このページのURLをコピー
          </button>
        </div>
      `;
      const copyBtn = this.guideBodyEl.querySelector<HTMLButtonElement>(
        '[data-role="pwa-copy-url-btn"]'
      );
      copyBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onPlayUiClick?.();
        void this.copyCurrentUrl(copyBtn);
      });
      return;
    }

    if (this.env.platform === 'android-chrome') {
      if (hasNativePrompt) {
        this.guideBodyEl.innerHTML = `
          <div class="pwa-fallback-note">
            <div class="pwa-fallback-title">📌 ボタンが出ない・反応しないときは</div>
            <div class="pwa-fallback-desc">
              右上メニュー（<strong>⋮</strong>）→<strong>「アプリをインストール」</strong>または<strong>「ホーム画面に追加」</strong>からも追加できるよ！
            </div>
          </div>
        `;
      } else {
        this.guideBodyEl.innerHTML = buildStepsHtml([
          {
            num: '1',
            iconSvg: svgDotsMenuIcon(),
            textHtml: '右上の <strong>メニュー（⋮）</strong> をタップ',
          },
          {
            num: '2',
            iconSvg: svgInstallAppIcon(),
            textHtml: '<strong>「アプリをインストール」</strong>または<strong>「ホーム画面に追加」</strong>をタップ',
          },
          {
            num: '3',
            iconSvg: svgCheckDoneIcon(),
            textHtml: '確認画面で <strong>「追加 / インストール」</strong> をタップして完了！',
          },
        ]);
      }
      return;
    }

    // Other mobile browsers (or desktop preview when manually opened)
    this.guideBodyEl.innerHTML = buildStepsHtml([
      {
        num: '1',
        iconSvg: svgDotsMenuIcon(),
        textHtml: 'ブラウザの <strong>メニュー（⋮ / ≡）</strong> をひらく',
      },
      {
        num: '2',
        iconSvg: svgAddHomeIcon(),
        textHtml: '<strong>「ホーム画面に追加」</strong>または<strong>「アプリをインストール」</strong>を選ぶ',
      },
      {
        num: '3',
        iconSvg: svgCheckDoneIcon(),
        textHtml: '確認画面で <strong>「追加」</strong> をタップして完了！',
      },
    ]);
  }

  private async copyCurrentUrl(btn: HTMLButtonElement): Promise<void> {
    const url = window.location.href;
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    btn.textContent = copied ? '✅ URLをコピーしたよ！' : '⚠️ SafariでURLを開いてね';
    if (this.copyTimerId !== null) {
      window.clearTimeout(this.copyTimerId);
    }
    this.copyTimerId = window.setTimeout(() => {
      btn.textContent = '📋 このページのURLをコピー';
      this.copyTimerId = null;
    }, 2500);
  }
}

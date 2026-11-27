import type {
  InputDevice,
  TutorialConfirmStep,
  TutorialStep,
  TutorialTourPage,
} from '../types';

export interface TutorialEvaluateState {
  playerX: number;
  playerZ: number;
  camDeltaX: number;
  camDeltaY: number;
  coinsRemainingStep1: number;
  tutorialSlimeAlive: boolean;
  tutorialCratesRemaining: number;
  playerMadeDoubleJump: boolean;
  playerMadeHipDrop: boolean;
  playerGrounded: boolean;
  feverActivatedThisFrame: boolean;
  feverActive: boolean;
}

export interface TutorialEvaluateCallbacks {
  onAchieved: (completed: TutorialConfirmStep) => void;
  onConfirmOpened: (completed: TutorialConfirmStep) => void;
}

export interface ObjectiveState {
  mainStars: number;
  totalMainStars: number;
  secretStars: number;
  totalSecretStars: number;
  rainbowBridgeOpen: boolean;
  bossActive: boolean;
  bossDefeated: boolean;
  chestOpened: boolean;
}

export interface TutorialConfirmInfo {
  step: TutorialConfirmStep;
  badge: string;
  message: string;
  nextPreview: string;
  buttonLabel: string;
}

export interface TutorialTourPageInfo {
  page: TutorialTourPage;
  totalPages: 3;
  title: string;
  subtitle: string;
  buttonLabel: string;
  isLast: boolean;
}

export interface TutorialAdvanceResult {
  advanced: boolean;
  nextStep: TutorialStep;
  enteredTour: boolean;
  finishedTour: boolean;
}

const CONFIRM_CONTENT: Record<
  TutorialConfirmStep,
  Omit<TutorialConfirmInfo, 'step'>
> = {
  0: {
    badge: '🏝️ 冒険のじゅんび',
    message: 'まんまるぶうの基本アクションを覚えよう！',
    nextPreview: 'WASD で歩きながら Space でジャンプ！まずは目の前のコインへ歩いてみよう！',
    buttonLabel: 'やってみよう！ ▶',
  },
  1: {
    badge: '✨ クリア！',
    message: 'おさんぽマスター！',
    nextPreview: 'つぎはカメラを回して、まわりを見わたしてみよう！',
    buttonLabel: 'つぎへ ▶',
  },
  2: {
    badge: '✨ クリア！',
    message: 'カメラマスター！',
    nextPreview: 'つぎはジャンプ＆2段ジャンプにチャレンジ！',
    buttonLabel: 'つぎへ ▶',
  },
  3: {
    badge: '✨ クリア！',
    message: '2段ジャンプマスター！',
    nextPreview: 'つぎはスライムの頭をポンッとふみつけてみよう！',
    buttonLabel: 'つぎへ ▶',
  },
  4: {
    badge: '✨ クリア！',
    message: 'ふみつけマスター！',
    nextPreview: 'つぎは空中でヒップドロップ！光る木箱をくだこう！',
    buttonLabel: 'つぎへ ▶',
  },
  5: {
    badge: '✨ クリア！',
    message: 'ヒップドロップマスター！',
    nextPreview: 'つぎはスペシャルわざ「FEVER x8」！無敵＆スコア8倍を体験しよう！',
    buttonLabel: 'つぎへ ▶',
  },
  6: {
    badge: '🌈 FEVER マスター！',
    message: 'アクションを全部マスター！',
    nextPreview: 'いよいよワールドの目的を案内する「冒険ツアー」へ出発！',
    buttonLabel: 'つぎへ ▶',
  },
};

interface StepAfterglowConfig {
  delaySec: number;
  waitForGround: boolean;
  waitForFeverEnd?: boolean;
  maxFallbackSec: number;
}

const AFTERGLOW_BY_STEP: Record<Exclude<TutorialConfirmStep, 0>, StepAfterglowConfig> = {
  1: { delaySec: 1.5, waitForGround: false, maxFallbackSec: 1.5 },
  2: { delaySec: 1.5, waitForGround: false, maxFallbackSec: 1.5 },
  3: { delaySec: 1.1, waitForGround: true, maxFallbackSec: 3.2 },
  4: { delaySec: 1.1, waitForGround: true, maxFallbackSec: 3.2 },
  5: { delaySec: 1.6, waitForGround: false, maxFallbackSec: 1.6 },
  6: { delaySec: 0.5, waitForGround: false, waitForFeverEnd: true, maxFallbackSec: 0 },
};

const TOUR_PAGES: readonly TutorialTourPageInfo[] = [
  {
    page: 0,
    totalPages: 3,
    title: '冒険ツアー 1/3',
    subtitle: 'まずは「パワースター」を3個集めよう！空へのびる光の柱が目印だよ！',
    buttonLabel: 'つぎへ ▶',
    isLast: false,
  },
  {
    page: 1,
    totalPages: 3,
    title: '冒険ツアー 2/3',
    subtitle: 'スターが3個そろうと「3スターゲート」が開いて、虹の橋がかかるよ！',
    buttonLabel: 'つぎへ ▶',
    isLast: false,
  },
  {
    page: 2,
    totalPages: 3,
    title: '冒険ツアー 3/3',
    subtitle: '虹の橋の奥のボス城で時計じかけの王を倒して、巨大プレゼント宝箱を開ければクリア！',
    buttonLabel: '冒険スタート！ ▶',
    isLast: true,
  },
];

export class TutorialManager {
  public step: TutorialStep = 1;
  public checklist: boolean[] = [false, false, false, false, false, false, false];
  public awaitingConfirm = false;
  public confirmStep: TutorialConfirmStep | null = null;
  public pendingConfirmStep: Exclude<TutorialConfirmStep, 0> | null = null;
  public tourPage: TutorialTourPage = 0;
  public confirmGuardTimer = 0;
  public readonly confirmGuardDuration = 0.30;

  private pendingElapsed = 0;
  private pendingAfterLandElapsed = 0;
  private pendingLanded = false;
  private pendingAfterFeverElapsed = 0;

  private seenHints = new Set<string>();
  private activeHint: string | null = null;
  private hintTimer = 0;

  private lastPlayerX: number | null = null;
  private lastPlayerZ: number | null = null;
  private movedDist = 0;
  private camRotated = 0;

  get contextualHint(): string | null {
    return this.activeHint;
  }

  openStep1Intro(): void {
    this.clearPending();
    this.step = 1;
    this.awaitingConfirm = true;
    this.confirmStep = 0;
    this.confirmGuardTimer = this.confirmGuardDuration;
  }

  getStepText(
    device: InputDevice,
    playerAirborne = false,
    playerJumpCount = 0
  ): { title: string; guide: string; urgent?: boolean } | null {
    if (this.step === 'done') return null;

    if (this.step === 1) {
      const guide =
        device === 'gamepad'
          ? '左スティックで目の前のコインをおいかけて歩こう！'
          : device === 'touch'
            ? '左手で画面の下側をドラッグ（ぷにコン）して、目の前のコインをおいかけて歩こう！'
            : 'W A S D で目の前のコインをおいかけて歩こう！';
      return {
        title: '基本 1/3：あるいてみよう',
        guide,
      };
    }

    if (this.step === 2) {
      const guide =
        device === 'gamepad'
          ? '右スティックでカメラをぐるっと回してみよう！'
          : device === 'touch'
            ? '画面の右側をドラッグしてカメラを回してみよう！'
            : 'マウスドラッグや矢印キーでカメラをぐるっと回してみよう！';
      return {
        title: '基本 2/3：まわりを見わたそう',
        guide,
      };
    }

    if (this.step === 3) {
      const guide =
        device === 'gamepad'
          ? 'Aボタンでジャンプ！空中でもう一度 Aボタンで高く2段ジャンプ！'
          : device === 'touch'
            ? '左手でぷにコン移動しながら右手で画面タップ（1回でジャンプ→空中タップで2段ジャンプ）！'
            : 'Space でジャンプ！空中でもう一度 Space で高く2段ジャンプ！';
      return {
        title: '基本 3/3：ジャンプ＆2段ジャンプ',
        guide,
      };
    }

    if (this.step === 4) {
      const guide =
        device === 'gamepad'
          ? 'Aボタンでジャンプして、スライムの頭をポンッとふみつけよう！'
          : device === 'touch'
            ? '左手でぷにコン移動＋右手で画面タップ！スライムの頭をポンッとふみつけよう！'
            : 'Space でジャンプして、スライムの頭をポンッとふみつけよう！';
      return {
        title: 'わざ 1/3：ふみつけアタック',
        guide,
      };
    }

    if (this.step === 5) {
      if (playerAirborne) {
        const urgentGuide =
          device === 'gamepad'
            ? '⚡ いまだ！ Bボタン でドスン！光る木箱をくだこう！'
            : device === 'touch'
              ? playerJumpCount >= 2
                ? '⚡ いまだ！ 右手で3回目タップ でドスン！光る木箱をくだこう！'
                : '⚡ 空中でさらに右手で2回タップ！（2段ジャンプ→ヒップドロップ！）'
              : '⚡ いまだ！ Ctrl / 右クリック でドスン！光る木箱をくだこう！';
        return {
          title: 'わざ 2/3：ヒップドロップ',
          guide: urgentGuide,
          urgent: true,
        };
      }

      const guide =
        device === 'gamepad'
          ? 'ジャンプして空中で Bボタン！光る木箱をドスンとくだこう！'
          : device === 'touch'
            ? '左手でぷにコン移動＋右手で3回タップ（ジャンプ→2段→ヒップドロップ）で木箱をくだこう！'
            : 'ジャンプして空中で Ctrl / 右クリック！光る木箱をドスンとくだこう！';
      return {
        title: 'わざ 2/3：ヒップドロップ',
        guide,
      };
    }

    if (this.step === 6) {
      const guide =
        device === 'gamepad'
          ? '右上の FEVER ゲージが満タン！ LB / RB ボタンで無敵＆スコア8倍を発動しよう！'
          : device === 'touch'
            ? '右上の光る「FEVER」ゲージ／ボタンをタップして無敵＆スコア8倍を発動しよう！'
            : '右上の FEVER ゲージが満タン！ Q キー（または FEVER ボタン）で無敵＆スコア8倍を発動しよう！';
      return {
        title: 'わざ 3/3：FEVER x8（無敵＆8倍）',
        guide,
        urgent: true,
      };
    }

    return {
      title: '冒険ツアー：いざ出発！',
      guide: 'ワールドのめじるしをチェックしよう！（スキップもできるよ）',
    };
  }

  isConfirmReady(): boolean {
    return this.confirmGuardTimer <= 0;
  }

  tickGuard(rawDt: number): void {
    if (this.confirmGuardTimer > 0) {
      this.confirmGuardTimer = Math.max(0, this.confirmGuardTimer - rawDt);
    }
  }

  public clearPending(): void {
    this.pendingConfirmStep = null;
    this.pendingElapsed = 0;
    this.pendingAfterLandElapsed = 0;
    this.pendingLanded = false;
    this.pendingAfterFeverElapsed = 0;
  }

  public getPendingInfo(feverActive = false): {
    step: TutorialConfirmStep;
    badge: string;
    message: string;
  } | null {
    if (this.pendingConfirmStep === null) return null;
    if (this.pendingConfirmStep === 6 && feverActive) {
      return {
        step: 6,
        badge: '🌈 FEVER 発動中！',
        message: '無敵＆スコア8倍！フィーバー終了まで自由に遊ぼう！',
      };
    }
    const content = CONFIRM_CONTENT[this.pendingConfirmStep];
    return {
      step: this.pendingConfirmStep,
      badge: content.badge,
      message: content.message,
    };
  }

  getConfirmInfo(device: InputDevice = 'kbm'): TutorialConfirmInfo | null {
    if (!this.awaitingConfirm || this.confirmStep === null) return null;
    const base = CONFIRM_CONTENT[this.confirmStep];
    let nextPreview = base.nextPreview;

    if (this.confirmStep === 0) {
      if (device === 'touch') {
        nextPreview =
          '左手で画面下のぷにコン移動しながら、右手で画面タップ（ジャンプ→2段→ヒップドロップ）！両手でいっしょに操作できるよ！';
      } else if (device === 'gamepad') {
        nextPreview = '左スティックで歩きながら、Aボタンでジャンプ！まずは目の前のコインへ歩いてみよう！';
      }
    } else if (this.confirmStep === 2 && device === 'touch') {
      nextPreview = 'つぎは左手でぷにコン移動しながら、右手で画面タップ（1回→空中もう1回で2段ジャンプ）！';
    } else if (this.confirmStep === 4 && device === 'touch') {
      nextPreview = 'つぎは左手でぷにコン移動＋右手で3回タップ（2段ジャンプ→ヒップドロップ）で木箱をくだこう！';
    } else if (this.confirmStep === 5) {
      if (device === 'touch') {
        nextPreview = 'つぎはスペシャルわざ「FEVER x8」！右上の光る FEVER ゲージ / ボタンをタップしてみよう！';
      } else if (device === 'gamepad') {
        nextPreview = 'つぎはスペシャルわざ「FEVER x8」！LB / RB ボタンで無敵＆スコア8倍を発動しよう！';
      }
    }

    return {
      step: this.confirmStep,
      ...base,
      nextPreview,
    };
  }

  getTourPageInfo(): TutorialTourPageInfo | null {
    if (this.step !== 7) return null;
    return TOUR_PAGES[this.tourPage] ?? TOUR_PAGES[0];
  }

  getTourSubtitle(): string | null {
    return this.getTourPageInfo()?.subtitle ?? null;
  }

  skipAll(): void {
    this.clearPending();
    this.step = 'done';
    this.checklist = [true, true, true, true, true, true, true];
    this.awaitingConfirm = false;
    this.confirmStep = null;
    this.tourPage = 0;
    this.confirmGuardTimer = 0;
  }

  reset(): void {
    this.clearPending();
    this.step = 1;
    this.checklist = [false, false, false, false, false, false, false];
    this.awaitingConfirm = false;
    this.confirmStep = null;
    this.tourPage = 0;
    this.confirmGuardTimer = 0;
    this.seenHints.clear();
    this.activeHint = null;
    this.hintTimer = 0;
    this.lastPlayerX = null;
    this.lastPlayerZ = null;
    this.movedDist = 0;
    this.camRotated = 0;
  }

  completeStep(
    index1to6: Exclude<TutorialConfirmStep, 0>,
    onAchieved: (completed: Exclude<TutorialConfirmStep, 0>) => void
  ): boolean {
    if (
      this.awaitingConfirm ||
      this.pendingConfirmStep !== null ||
      this.checklist[index1to6 - 1]
    ) {
      return false;
    }
    this.checklist[index1to6 - 1] = true;
    this.pendingConfirmStep = index1to6;
    this.pendingElapsed = 0;
    this.pendingAfterLandElapsed = 0;
    this.pendingLanded = false;
    this.pendingAfterFeverElapsed = 0;
    onAchieved(index1to6);
    return true;
  }

  confirmAdvance(force = false): TutorialAdvanceResult {
    if (!force && !this.isConfirmReady()) {
      return {
        advanced: false,
        nextStep: this.step,
        enteredTour: false,
        finishedTour: false,
      };
    }

    if (this.awaitingConfirm && this.confirmStep !== null) {
      const completed = this.confirmStep;
      this.awaitingConfirm = false;
      this.confirmStep = null;

      if (completed === 0) {
        this.step = 1;
        this.lastPlayerX = null;
        this.lastPlayerZ = null;
        this.movedDist = 0;
        this.confirmGuardTimer = 0;
        return {
          advanced: true,
          nextStep: 1,
          enteredTour: false,
          finishedTour: false,
        };
      }

      if (completed === 6) {
        this.step = 7;
        this.tourPage = 0;
        this.confirmGuardTimer = this.confirmGuardDuration;
        return {
          advanced: true,
          nextStep: 7,
          enteredTour: true,
          finishedTour: false,
        };
      }

      const next = (completed + 1) as TutorialStep;
      this.step = next;
      this.confirmGuardTimer = 0;
      return {
        advanced: true,
        nextStep: next,
        enteredTour: false,
        finishedTour: false,
      };
    }

    if (this.step === 7) {
      if (this.tourPage < 2) {
        this.tourPage = (this.tourPage + 1) as TutorialTourPage;
        this.confirmGuardTimer = this.confirmGuardDuration;
        return {
          advanced: true,
          nextStep: 7,
          enteredTour: false,
          finishedTour: false,
        };
      }

      this.checklist[6] = true;
      this.step = 'done';
      this.tourPage = 0;
      this.confirmGuardTimer = 0;
      return {
        advanced: true,
        nextStep: 'done',
        enteredTour: false,
        finishedTour: true,
      };
    }

    return {
      advanced: false,
      nextStep: this.step,
      enteredTour: false,
      finishedTour: false,
    };
  }

  triggerContextualHint(key: string, text: string, duration = 3.8): void {
    if (this.seenHints.has(key)) return;
    this.seenHints.add(key);
    this.activeHint = text;
    this.hintTimer = duration;
  }

  showTempBanner(text: string, duration = 3.6): void {
    this.activeHint = text;
    this.hintTimer = duration;
  }

  update(dt: number): string | null {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.activeHint = null;
      }
    }
    return this.activeHint;
  }

  evaluate(
    dt: number,
    state: TutorialEvaluateState,
    callbacks: TutorialEvaluateCallbacks
  ): void {
    if (this.step === 'done' || this.awaitingConfirm || this.step === 7) return;

    if (this.pendingConfirmStep !== null) {
      this.pendingElapsed += dt;
      const cfg = AFTERGLOW_BY_STEP[this.pendingConfirmStep];
      let ready = false;
      if (cfg.waitForFeverEnd) {
        if (state.feverActive) {
          this.pendingAfterFeverElapsed = 0;
        } else {
          this.pendingAfterFeverElapsed += dt;
        }
        ready = !state.feverActive && this.pendingAfterFeverElapsed >= cfg.delaySec;
      } else if (cfg.waitForGround) {
        if (state.playerGrounded) {
          this.pendingLanded = true;
        }
        if (this.pendingLanded) {
          this.pendingAfterLandElapsed += dt;
        }
        ready =
          (this.pendingLanded && this.pendingAfterLandElapsed >= cfg.delaySec) ||
          this.pendingElapsed >= cfg.maxFallbackSec;
      } else {
        ready = this.pendingElapsed >= cfg.delaySec;
      }

      if (ready) {
        const completed = this.pendingConfirmStep;
        this.clearPending();
        this.awaitingConfirm = true;
        this.confirmStep = completed;
        this.confirmGuardTimer = this.confirmGuardDuration;
        callbacks.onConfirmOpened(completed);
      }
      return;
    }

    if (this.step === 1) {
      if (this.lastPlayerX !== null && this.lastPlayerZ !== null) {
        this.movedDist += Math.hypot(
          state.playerX - this.lastPlayerX,
          state.playerZ - this.lastPlayerZ
        );
      }
      this.lastPlayerX = state.playerX;
      this.lastPlayerZ = state.playerZ;

      if (state.coinsRemainingStep1 <= 2 || this.movedDist >= 4.2) {
        this.completeStep(1, callbacks.onAchieved);
      }
    } else if (this.step === 2) {
      this.camRotated += Math.hypot(state.camDeltaX, state.camDeltaY);
      if (this.camRotated >= 0.35) {
        this.completeStep(2, callbacks.onAchieved);
      }
    } else if (this.step === 3) {
      if (state.playerMadeDoubleJump) {
        this.completeStep(3, callbacks.onAchieved);
      }
    } else if (this.step === 4) {
      if (!state.tutorialSlimeAlive) {
        this.completeStep(4, callbacks.onAchieved);
      }
    } else if (this.step === 5) {
      if (
        state.tutorialCratesRemaining === 0 ||
        (state.playerMadeHipDrop && state.playerZ < 24.5)
      ) {
        this.completeStep(5, callbacks.onAchieved);
      }
    } else if (this.step === 6) {
      if (state.feverActivatedThisFrame || state.feverActive) {
        this.completeStep(6, callbacks.onAchieved);
      }
    }
  }

  getObjective(state: ObjectiveState): { icon: string; text: string } {
    if (this.step !== 'done') {
      return { icon: '🎓', text: '基本アクションをおぼえよう' };
    }
    if (state.bossDefeated && !state.chestOpened) {
      return { icon: '🎁', text: '宝箱を開けてゴール！' };
    }
    if (state.bossActive) {
      return { icon: '⚙️', text: '時計じかけの王を倒そう！' };
    }
    if (state.rainbowBridgeOpen) {
      return { icon: '🌈', text: '虹の橋を渡ってボスへ！' };
    }
    return {
      icon: '★',
      text: `メインスターを集めよう (${state.mainStars}/${state.totalMainStars})`,
    };
  }
}

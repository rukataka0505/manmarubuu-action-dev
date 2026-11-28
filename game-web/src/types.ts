export type ExpressionName =
  | 'Sleep'
  | 'Happy'
  | 'Damage'
  | 'Pien'
  | 'Ganbaru'
  | 'Panic'
  | 'Pout'
  | 'Fever';

export type AnimName =
  | 'Idle'
  | 'Walk'
  | 'Dash'
  | 'Brake'
  | 'Turn'
  | 'JumpStart'
  | 'DoubleJump'
  | 'StompBounce'
  | 'Fall'
  | 'Land'
  | 'TrampolineFly'
  | 'HipDropStart'
  | 'HipDropSlam'
  | 'RollCharge'
  | 'RollSpin'
  | 'WallBounce'
  | 'FeverBurst'
  | 'Damage'
  | 'Recover'
  | 'VictoryDance';

export type InputDevice = 'kbm' | 'gamepad' | 'touch';

export type GamePhase =
  | 'title'
  | 'world_select'
  | 'playing'
  | 'cutscene'
  | 'paused'
  | 'gameover'
  | 'victory';

export type QualityPreset = 'auto' | 'high' | 'medium' | 'low';

export type ResolvedQuality = 'high' | 'medium' | 'low';

export type FaceWipe3dMode = 'auto' | 'on' | 'off';

export type TutorialStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'done';

export type TutorialConfirmStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TutorialTourPage = 0 | 1 | 2;

export type BgmMode = 'title' | 'explore' | 'fever' | 'boss' | 'victory' | 'none';

export type StarKind = 'main' | 'secret';

export type WorldId = 'world1' | 'world2';

export type StampId =
  | 'clear_w1'
  | 'all_main_stars'
  | 'all_secret_stars'
  | 'coin_collector'
  | 'no_damage_boss';

export interface GameSettings {
  cameraAutoFollow: boolean;
  quality: QualityPreset;
  cameraSensitivity: number;
  soundEnabled: boolean;
  showTouchControlsOverride: 'auto' | 'on' | 'off';
  faceWipe3d: FaceWipe3dMode;
  showFps: boolean;
}

export interface StampDef {
  id: StampId;
  title: string;
  desc: string;
  icon: string;
}

export interface WorldRunCheckpoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface WorldRunState {
  active: boolean;
  checkpoint: WorldRunCheckpoint | null;
  activatedCheckpointIndices: number[];
  collectedStarIds: number[];
  star3Unlocked: boolean;
  rainbowBridgeOpen: boolean;
  bossDefeated: boolean;
  coins: number;
  score: number;
  hp: number;
  feverMeter: number;
  damageTakenCount: number;
  elapsedSec: number;
  updatedAt: number;
}

export interface WorldProgress {
  cleared: boolean;
  collectedStarIds: number[];
  stamps: StampId[];
  highScore: number;
  bestRank: 'S' | 'A' | 'B' | null;
  run: WorldRunState;
}

export interface SaveData {
  version: 2;
  tutorialCompleted: boolean;
  lastPlayedWorldId: string;
  unlockedWorlds: number[];
  worlds: Record<string, WorldProgress>;
}

export interface NavTargetInfo {
  id: string;
  kind: 'star' | 'gate' | 'boss' | 'chest';
  icon: string;
  shortLabel: string;
  label: string;
  distanceM: number;
  relAngleRad: number;
  isPrimary: boolean;
}

export interface StarInfo {
  id: number;
  label: string;
  areaName: string;
  kind: StarKind;
  collected: boolean;
  unlocked: boolean;
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  inFront: boolean;
  onScreen: boolean;
  angleRad: number;
}

export interface CalloutItem {
  id: number;
  text: string;
  subText?: string;
  style: 'hit' | 'super' | 'smash' | 'fever' | 'boss' | 'star';
  x: number;
  y: number;
  age: number;
  duration: number;
}

/** スターを取ったときに画面中央に出す、ボタンで閉じるお知らせカード */
export interface RewardCardInfo {
  kind: 'main' | 'mainComplete' | 'secret' | 'secretComplete';
  badge: string;
  title: string;
  body: string;
  found: number;
  total: number;
  prevMaxHp: number;
  newMaxHp: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  activeWorldId: WorldId;
  activeWorldName: string;
  hp: number;
  maxHp: number;
  stars: number;
  totalStars: number;
  secretStars: number;
  totalSecretStars: number;
  starPoints: number;
  coins: number;
  fever: number; // 0..100
  feverActive: boolean;
  feverBannerActive: boolean;
  feverRemainingSec: number;
  expression: ExpressionName;
  expressionLabelJa: string;
  anim: AnimName;
  inputDevice: InputDevice;
  tutorialStep: TutorialStep;
  tutorialChecklist: boolean[];
  tutorialSkipAvailable: boolean;
  tutorialSubtitle: string | null;
  tutorialAwaitingConfirm: boolean;
  tutorialConfirmStep: TutorialConfirmStep | null;
  tutorialConfirmReady: boolean;
  tutorialPendingConfirm: boolean;
  tutorialPendingStep: TutorialConfirmStep | null;
  tutorialTourPage: TutorialTourPage;
  tutorialFeverHighlight: boolean;
  welcomeMovieActive: boolean;
  welcomeMovieCanSkip: boolean;
  rainbowMovieActive: boolean;
  rainbowMovieCanSkip: boolean;
  rainbowMovieAct: 0 | 1 | 2 | 3;
  rainbowMovieTitle: string;
  rainbowMovieSubtitle: string;
  navTargets: NavTargetInfo[];
  autosaveToastVisible: boolean;
  hasSaveProgress: boolean;
  hasResumableRun: boolean;
  playerAirborne: boolean;
  playerJumpCount: number;
  playerHipDropState: 'none' | 'windup' | 'diving' | 'recovery';
  modalOpen: boolean;
  objectiveIcon: string;
  objectiveText: string;
  contextualHint: string | null;
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  bossWeakExposed: boolean;
  starIndicators: StarInfo[];
  callouts: CalloutItem[];
  rewardCard: RewardCardInfo | null;
  rewardCardReady: boolean;
  elapsedSec: number;
  damageTakenCount: number;
  comboCount: number;
  muted: boolean;
  fps: number;
  clearRank: 'S' | 'A' | 'B';
  rainbowBridgeOpen: boolean;
  pointerLocked: boolean;
  gameOverPenaltyCoins: number;
  gameOverPenaltyScore: number;
  wasInBossFight: boolean;
  touchActive: boolean;
  portraitBlocked: boolean;
  bootTapPending: boolean;
  settings: GameSettings;
  resolvedQuality: ResolvedQuality;
  faceWipe3dActive: boolean;
  saveData: SaveData;
  newlyEarnedStamps: StampId[];
  runStamps: StampId[];
  isNewHighScore: boolean;
}

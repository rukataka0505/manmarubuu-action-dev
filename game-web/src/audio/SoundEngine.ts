/**
 * まんまるぶう：おもちゃばこ大暴走！（仮）
 * 完全プロシージャル Web Audio API サウンドエンジン
 *
 * - 外部音声ファイル（mp3 / wav / ogg 等）は一切使用しない。
 * - オシレータ / フィルタ / エンベロープ / ノイズバッファ / コンプレッサのみで合成。
 * - マスター段は DynamicsCompressorNode -> GainNode -> destination で音割れを防止。
 * - BGM は AudioContext.currentTime 先読みスケジューラ + setInterval で駆動。
 */

import { fetchWithTimeout, withTimeout } from '../assets/AssetLoaderUtils';

export type BgmMode = 'title' | 'explore' | 'fever' | 'boss' | 'victory' | 'none';

/* ============================================================
 * 音階ユーティリティ
 * ============================================================ */

const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

/** "C#5" のような音名を周波数(Hz)へ変換する。 */
function noteToFreq(note: string): number {
  const match = /^([A-G]#?)(-?\d)$/.exec(note);
  if (!match) return 440;
  const semitone = SEMITONES[match[1]] ?? 0;
  const octave = Number(match[2]);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** スペース区切りの譜面文字列を固定長の配列へ変換する（'.' と '-' は休符）。 */
function parseSeq(source: string, length: number): (string | null)[] {
  const tokens = source.trim().split(/\s+/);
  const result: (string | null)[] = [];
  for (let i = 0; i < length; i += 1) {
    const token = tokens[i];
    result.push(token === undefined || token === '.' || token === '-' ? null : token);
  }
  return result;
}

/* ============================================================
 * 内部型
 * ============================================================ */

interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  glide?: number;
  dur: number;
  gain: number;
  attack?: number;
  detune?: number;
  pan?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  vibratoHz?: number;
  vibratoDepth?: number;
  delay?: number;
}

interface NoiseOptions {
  dur: number;
  gain: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  attack?: number;
  delay?: number;
}

interface FmOptions {
  freq: number;
  freqEnd?: number;
  ratio: number;
  index: number;
  indexEnd?: number;
  dur: number;
  gain: number;
  attack?: number;
  type?: OscillatorType;
  delay?: number;
}

type LeadKind = 'marimba' | 'xylophone' | 'toyPiano' | 'musicBox' | 'bell';
type BassKind = 'toyBass' | 'subBass' | 'pluck';
type PercKind = 'march' | 'woodblock' | 'clock' | 'waltz' | 'fever';

interface BgmPattern {
  bpm: number;
  stepsPerBar: number;
  bars: number;
  lead: LeadKind;
  double?: LeadKind;
  bassKind: BassKind;
  perc: PercKind;
  arp: boolean;
  melody: (string | null)[];
  bass: (string | null)[];
  chords: string[][];
}

interface RollNodes {
  noise: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  osc: OscillatorNode;
  oscFilter: BiquadFilterNode;
  oscGain: GainNode;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/* ============================================================
 * BGM 譜面（すべて手書きのプロシージャル・パターン）
 * ============================================================ */

const BGM_PATTERNS: Record<Exclude<BgmMode, 'none'>, BgmPattern> = {
  /* 陽気なおもちゃの行進曲 / C dur / BPM 124 */
  title: {
    bpm: 124,
    stepsPerBar: 16,
    bars: 4,
    lead: 'marimba',
    double: 'xylophone',
    bassKind: 'toyBass',
    perc: 'march',
    arp: false,
    melody: parseSeq(
      `E5 . G5 . C6 . G5 . E5 . G5 . C6 . . .
       D5 . F5 . A5 . F5 . D5 . F5 . B5 . . .
       C5 . E5 . G5 . E5 . F5 . A5 . C6 . . .
       G5 . E5 . C5 . E5 . G5 . C6 . G5 . . .`,
      64,
    ),
    bass: parseSeq(
      `C3 . . . G3 . . . C3 . . . G3 . . .
       G2 . . . D3 . . . G2 . . . D3 . . .
       F2 . . . C3 . . . F2 . . . C3 . . .
       C3 . . . G3 . . . C3 . . . G2 . . .`,
      64,
    ),
    chords: [
      ['C4', 'E4', 'G4'],
      ['G3', 'B3', 'D4'],
      ['F3', 'A3', 'C4'],
      ['C4', 'E4', 'G4'],
    ],
  },

  /* 陽だまりの牧歌的箱庭テーマ / G dur / BPM 118 */
  explore: {
    bpm: 118,
    stepsPerBar: 16,
    bars: 4,
    lead: 'toyPiano',
    double: 'marimba',
    bassKind: 'toyBass',
    perc: 'woodblock',
    arp: false,
    melody: parseSeq(
      `B4 . D5 . G5 . D5 . B4 . A4 . G4 . . .
       A4 . D5 . F#5 . D5 . A4 . G4 . F#4 . . .
       G4 . B4 . E5 . B4 . G4 . F#4 . E4 . . .
       E4 . G4 . C5 . E5 . D5 . B4 . G4 . . .`,
      64,
    ),
    bass: parseSeq(
      `G2 . . . D3 . . . G2 . . . B2 . . .
       D3 . . . A2 . . . D3 . . . F#2 . . .
       E2 . . . B2 . . . E2 . . . G2 . . .
       C3 . . . G2 . . . C3 . . . E2 . . .`,
      64,
    ),
    chords: [
      ['G3', 'B3', 'D4'],
      ['D3', 'F#3', 'A3'],
      ['E3', 'G3', 'B3'],
      ['C3', 'E3', 'G3'],
    ],
  },

  /* フィーバー！キラキラ倍音アルペジオ / D dur / BPM 152 */
  fever: {
    bpm: 152,
    stepsPerBar: 16,
    bars: 4,
    lead: 'bell',
    double: 'marimba',
    bassKind: 'pluck',
    perc: 'fever',
    arp: true,
    melody: parseSeq(
      `D6 . F#6 . A6 . F#6 . D6 . A5 . D6 . F#6 .
       E6 . A6 . C#7 . A6 . E6 . C#6 . E6 . A6 .
       F#6 . B6 . D7 . B6 . F#6 . D6 . F#6 . B6 .
       G6 . B6 . D7 . B6 . G6 . D6 . B6 . D7 .`,
      64,
    ),
    bass: parseSeq(
      `D3 . D3 . A2 . D3 . D3 . A2 . D3 . A2 .
       A2 . A2 . E3 . A2 . A2 . E3 . A2 . E3 .
       B2 . B2 . F#3 . B2 . B2 . F#3 . B2 . F#3 .
       G2 . G2 . D3 . G2 . G2 . D3 . G2 . D3 .`,
      64,
    ),
    chords: [
      ['D4', 'F#4', 'A4'],
      ['A3', 'C#4', 'E4'],
      ['B3', 'D4', 'F#4'],
      ['G3', 'B3', 'D4'],
    ],
  },

  /* 巨大おもちゃキング戦 / D moll / BPM 134 */
  boss: {
    bpm: 134,
    stepsPerBar: 16,
    bars: 4,
    lead: 'musicBox',
    bassKind: 'subBass',
    perc: 'clock',
    arp: false,
    melody: parseSeq(
      `D5 . F5 . A5 . D6 . C6 . A5 . F5 . D5 .
       A#4 . D5 . F5 . A#5 . A5 . F5 . D5 . A#4 .
       G4 . A#4 . D5 . G5 . F5 . D5 . A#4 . G4 .
       A4 . C#5 . E5 . A5 . G5 . E5 . C#5 . A4 .`,
      64,
    ),
    bass: parseSeq(
      `D2 . D2 . D3 . D2 . D2 . A2 . D3 . A2 .
       A#2 . A#2 . A#3 . A#2 . A#2 . F3 . A#3 . F3 .
       G2 . G2 . G3 . G2 . G2 . D3 . G3 . D3 .
       A2 . A2 . A3 . A2 . A2 . E3 . A3 . E3 .`,
      64,
    ),
    chords: [
      ['D3', 'F3', 'A3'],
      ['A#2', 'D3', 'F3'],
      ['G2', 'A#2', 'D3'],
      ['A2', 'C#3', 'E3'],
    ],
  },

  /* 祝祭クリア・ワルツ / C dur / BPM 132 / 3拍子 */
  victory: {
    bpm: 132,
    stepsPerBar: 12,
    bars: 4,
    lead: 'marimba',
    double: 'bell',
    bassKind: 'toyBass',
    perc: 'waltz',
    arp: false,
    melody: parseSeq(
      `C5 . . E5 . . G5 . . C6 . .
       B4 . . D5 . . G5 . . B5 . .
       A4 . . C5 . . F5 . . A5 . .
       G4 . . C5 . . E5 . . G5 . .`,
      48,
    ),
    bass: parseSeq(
      `C3 . . . . . G2 . . . . .
       G2 . . . . . D3 . . . . .
       F2 . . . . . C3 . . . . .
       C3 . . . . . G2 . . . . .`,
      48,
    ),
    chords: [
      ['C4', 'E4', 'G4'],
      ['G3', 'B3', 'D4'],
      ['F3', 'A3', 'C4'],
      ['C4', 'E4', 'G4'],
    ],
  },
};

/* ============================================================
 * SoundEngine
 * ============================================================ */

interface ExternalBgmConfig {
  file: string;
  volume?: number;
  loop?: boolean;
  playbackRate?: number;
}

interface ExternalSfxConfig {
  file: string;
  volume?: number;
  playbackRate?: number;
}

interface AudioManifest {
  bgm?: Record<string, ExternalBgmConfig | null>;
  sfx?: Record<string, ExternalSfxConfig | null>;
}

const SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

export class SoundEngine {
  private static readonly UNLOCK_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
    'pointerdown',
    'pointerup',
    'touchend',
    'click',
    'keydown',
  ];

  private ctx: AudioContext | null = null;
  private unlockListenersBound = false;

  private masterGain!: GainNode;
  private mixGain!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private sfxGain!: GainNode;
  private bgmGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;
  private sfxReverbSend!: GainNode;
  private bgmReverbSend!: GainNode;
  private noiseBuffer!: AudioBuffer;

  private masterVolume = 0.8;
  private muted = false;

  private desiredBgm: BgmMode = 'none';
  private activeExternalBgmMode: BgmMode | null = null;
  private activeProceduralBgmMode: BgmMode | null = null;
  private bgmSession: GainNode | null = null;
  private pattern: BgmPattern | null = null;
  private bgmTimer: number | null = null;
  private stepIndex = 0;
  private nextStepTime = 0;

  private rollNodes: RollNodes | null = null;
  private rollActive = false;
  private rollSpeed = 10;

  // External CC0 audio buffers & configs (loaded from /audio/manifest.json)
  private manifestLoaded = false;
  private preloadPromise: Promise<void> | null = null;
  private externalBgmConfigs = new Map<string, ExternalBgmConfig>();
  private externalBgmBuffers = new Map<string, AudioBuffer>();
  private externalSfxConfigs = new Map<string, ExternalSfxConfig>();
  private externalSfxBuffers = new Map<string, AudioBuffer>();
  private externalBgmSource: AudioBufferSourceNode | null = null;
  private externalBgmSessionGain: GainNode | null = null;

  constructor() {
    this.bindUnlockListeners();
  }

  private handleUserGesture = (): void => {
    this.unlock();
  };

  private bindUnlockListeners(): void {
    if (typeof window === 'undefined' || this.unlockListenersBound || this.ctx?.state === 'running') {
      return;
    }
    for (const ev of SoundEngine.UNLOCK_EVENTS) {
      window.addEventListener(ev, this.handleUserGesture, { capture: true, passive: true });
    }
    this.unlockListenersBound = true;
  }

  private unbindUnlockListeners(): void {
    if (typeof window === 'undefined' || !this.unlockListenersBound) return;
    for (const ev of SoundEngine.UNLOCK_EVENTS) {
      window.removeEventListener(ev, this.handleUserGesture, { capture: true });
    }
    this.unlockListenersBound = false;
  }

  private ensureDesiredBgmRunning(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.desiredBgm === 'none') return;

    const hasExtBuf = this.externalBgmBuffers.has(this.desiredBgm);
    if (hasExtBuf) {
      if (this.activeExternalBgmMode === this.desiredBgm && this.externalBgmSource !== null) {
        return;
      }
      this.applyBgm();
      return;
    }

    if (
      this.activeProceduralBgmMode === this.desiredBgm &&
      this.bgmTimer !== null &&
      this.bgmSession !== null
    ) {
      return;
    }
    this.applyBgm();
  }

  private requestResumeAndStartBgm(ctx: AudioContext): void {
    if (ctx.state === 'running') {
      this.unbindUnlockListeners();
      this.ensureDesiredBgmRunning();
      return;
    }
    this.bindUnlockListeners();
    ctx
      .resume()
      .then(() => {
        if (this.ctx !== ctx) return;
        if (ctx.state === 'running') {
          this.unbindUnlockListeners();
          this.ensureDesiredBgmRunning();
        }
      })
      .catch(() => undefined);
  }

  /* ------------------------------------------------------------
   * 初期化 / オーディオグラフ
   * ------------------------------------------------------------ */

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'closed') {
        this.ctx = null;
        this.bgmSession = null;
        this.rollNodes = null;
        this.externalBgmSource = null;
        this.externalBgmSessionGain = null;
        this.activeExternalBgmMode = null;
        this.activeProceduralBgmMode = null;
      } else {
        this.requestResumeAndStartBgm(this.ctx);
        return;
      }
    }

    const Ctor = getAudioContextCtor();
    if (!Ctor) return;

    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return;
    }

    this.ctx = ctx;
    this.bgmSession = null;
    this.rollNodes = null;
    this.activeExternalBgmMode = null;
    this.activeProceduralBgmMode = null;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    ctx.addEventListener('statechange', () => {
      if (this.ctx !== ctx) return;
      if (ctx.state === 'running') {
        this.unbindUnlockListeners();
        this.ensureDesiredBgmRunning();
      } else if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
        this.bindUnlockListeners();
      }
    });

    this.buildGraph();
    this.startExternalPreload();
    this.requestResumeAndStartBgm(ctx);
  }

  private startExternalPreload(): void {
    if (this.preloadPromise || !this.ctx) return;
    this.preloadPromise = this.preloadExternalAudio();
  }

  private async preloadExternalAudio(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const res = await fetchWithTimeout('/audio/manifest.json', 15000);
      if (!res.ok) return;
      const manifest = (await res.json()) as AudioManifest;
      this.manifestLoaded = true;

      const jobs: Array<Promise<void>> = [];

      if (manifest.bgm) {
        for (const [mode, cfg] of Object.entries(manifest.bgm)) {
          if (!cfg || !cfg.file) continue;
          this.externalBgmConfigs.set(mode, cfg);
          jobs.push(
            this.fetchDecodeAudio(cfg.file).then((buf) => {
              if (!buf) return;
              this.externalBgmBuffers.set(mode, buf);
              if (
                this.desiredBgm === mode &&
                this.activeExternalBgmMode !== mode &&
                this.ctx?.state === 'running'
              ) {
                this.applyBgm();
              }
            })
          );
        }
      }

      if (manifest.sfx) {
        for (const [key, cfg] of Object.entries(manifest.sfx)) {
          if (!cfg || !cfg.file) continue;
          this.externalSfxConfigs.set(key, cfg);
          jobs.push(
            this.fetchDecodeAudio(cfg.file).then((buf) => {
              if (buf) this.externalSfxBuffers.set(key, buf);
            })
          );
        }
      }

      await Promise.all(jobs);
    } catch {
      // Manifest optional; built-in Web Audio synthesis stays active
    }
  }

  private async fetchDecodeAudio(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    try {
      const res = await fetchWithTimeout(url, 15000);
      if (!res.ok) return null;
      const arr = await withTimeout(res.arrayBuffer(), 15000, `audio buffer ${url}`);
      return await withTimeout(ctx.decodeAudioData(arr), 15000, `audio decode ${url}`);
    } catch {
      return null;
    }
  }

  async whenAudioReady(): Promise<void> {
    if (!this.preloadPromise) return;
    await this.preloadPromise;
  }

  getExternalAudioStatus(): {
    manifestLoaded: boolean;
    loadedBgm: string[];
    loadedSfx: string[];
  } {
    return {
      manifestLoaded: this.manifestLoaded,
      loadedBgm: Array.from(this.externalBgmBuffers.keys()),
      loadedSfx: Array.from(this.externalSfxBuffers.keys()),
    };
  }

  getBgmState(): {
    contextState: AudioContextState | 'uninitialized';
    desiredBgm: BgmMode;
    activeBgm: BgmMode | null;
    activeKind: 'external' | 'procedural' | null;
    muted: boolean;
  } {
    const activeBgm = this.activeExternalBgmMode ?? this.activeProceduralBgmMode;
    const activeKind = this.activeExternalBgmMode
      ? 'external'
      : this.activeProceduralBgmMode
        ? 'procedural'
        : null;
    return {
      contextState: this.ctx ? this.ctx.state : 'uninitialized',
      desiredBgm: this.desiredBgm,
      activeBgm,
      activeKind,
      muted: this.muted,
    };
  }

  private tryPlayExternalSfx(key: string, pitchRate = 1.0, volumeScale = 1.0): boolean {
    const ctx = this.ctx;
    const buf = this.externalSfxBuffers.get(key);
    if (!ctx || !buf) return false;

    const cfg = this.externalSfxConfigs.get(key);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = clamp((cfg?.playbackRate ?? 1.0) * pitchRate, 0.25, 4.0);

    const g = ctx.createGain();
    g.gain.value = clamp((cfg?.volume ?? 0.7) * volumeScale, 0, 1.5);

    src.connect(g);
    g.connect(this.sfxGain);
    src.start(ctx.currentTime + 0.001);
    return true;
  }

  /** ユーザー操作イベントから呼ぶ。自動再生ポリシーを解除する。 */
  unlock(): void {
    this.init();
    const ctx = this.ctx;
    if (!ctx) return;

    // iOS / Safari 向けの無音バッファ・アンロック
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      /* アンロック用の無音再生は失敗しても致命的ではない */
    }

    this.requestResumeAndStartBgm(ctx);
  }

  private buildGraph(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.mixGain = ctx.createGain();
    this.mixGain.gain.value = 0.9;

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.95;

    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0.5;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.createImpulse(2.2, 2.8);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;

    this.sfxReverbSend = ctx.createGain();
    this.sfxReverbSend.gain.value = 0.16;
    this.bgmReverbSend = ctx.createGain();
    this.bgmReverbSend.gain.value = 0.22;

    this.sfxGain.connect(this.mixGain);
    this.bgmGain.connect(this.mixGain);
    this.sfxGain.connect(this.sfxReverbSend);
    this.bgmGain.connect(this.bgmReverbSend);
    this.sfxReverbSend.connect(this.reverb);
    this.bgmReverbSend.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.mixGain);

    this.mixGain.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.noiseBuffer = this.createNoiseBuffer(2);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ac;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ac;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const progress = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay);
      }
    }
    return buffer;
  }

  private get ac(): AudioContext {
    return this.ctx as AudioContext;
  }

  private canPlay(): boolean {
    if (this.muted) return false;
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'closed') {
      this.ctx = null;
      this.init();
      return this.ctx !== null;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    return true;
  }

  /* ------------------------------------------------------------
   * 音量 / ミュート / BGM モード
   * ------------------------------------------------------------ */

  setBgmMode(mode: BgmMode): void {
    const changed = mode !== this.desiredBgm;
    this.desiredBgm = mode;
    if (!this.ctx) {
      if (mode !== 'none') {
        this.bindUnlockListeners();
        this.init();
      }
      return;
    }
    if (mode === 'none') {
      this.applyBgm();
      return;
    }
    if (this.ctx.state !== 'running') {
      this.requestResumeAndStartBgm(this.ctx);
      return;
    }
    if (changed) {
      this.applyBgm();
    } else {
      this.ensureDesiredBgmRunning();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(muted ? 0 : this.masterVolume, now, 0.02);
    this.applyRollGain(true);
    if (!muted) {
      this.nextStepTime = now + 0.05;
      if (ctx.state === 'running') {
        this.ensureDesiredBgmRunning();
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.03);
  }

  /* ------------------------------------------------------------
   * 低レベル・シンセ・プリミティブ
   * ------------------------------------------------------------ */

  private tone(dest: AudioNode, time: number, options: ToneOptions): void {
    const ctx = this.ac;
    const start = time + (options.delay ?? 0);
    const dur = Math.max(0.02, options.dur);
    const attack = Math.min(Math.max(0.001, options.attack ?? 0.005), dur * 0.8);

    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(1, options.freq), start);
    if (options.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.freqEnd),
        start + Math.max(0.01, options.glide ?? dur),
      );
    }
    if (options.detune !== undefined) {
      osc.detune.setValueAtTime(options.detune, start);
    }

    let tail: AudioNode = osc;
    if (options.filterType) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType;
      filter.frequency.setValueAtTime(Math.max(20, options.filterFreq ?? 1200), start);
      if (options.filterFreqEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.filterFreqEnd), start + dur);
      }
      filter.Q.value = options.filterQ ?? 1;
      tail.connect(filter);
      tail = filter;
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    tail.connect(gain);

    if (options.pan !== undefined && options.pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(options.pan, -1, 1);
      gain.connect(panner);
      panner.connect(dest);
    } else {
      gain.connect(dest);
    }

    if (options.vibratoHz !== undefined && options.vibratoHz > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = options.vibratoHz;
      const depth = ctx.createGain();
      depth.gain.value = options.vibratoDepth ?? 10;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + dur + 0.05);
    }

    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noise(dest: AudioNode, time: number, options: NoiseOptions): void {
    const ctx = this.ac;
    const start = time + (options.delay ?? 0);
    const dur = Math.max(0.02, options.dur);
    const attack = Math.min(Math.max(0.001, options.attack ?? 0.003), dur * 0.8);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType ?? 'bandpass';
    filter.frequency.setValueAtTime(Math.max(20, options.filterFreq ?? 1200), start);
    if (options.filterFreqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.filterFreqEnd), start + dur);
    }
    filter.Q.value = options.filterQ ?? 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    source.start(start, Math.random() * 1.5);
    source.stop(start + dur + 0.05);
  }

  private fm(dest: AudioNode, time: number, options: FmOptions): void {
    const ctx = this.ac;
    const start = time + (options.delay ?? 0);
    const dur = Math.max(0.02, options.dur);
    const attack = Math.min(Math.max(0.001, options.attack ?? 0.004), dur * 0.8);

    const carrier = ctx.createOscillator();
    carrier.type = options.type ?? 'sine';
    carrier.frequency.setValueAtTime(Math.max(1, options.freq), start);
    if (options.freqEnd !== undefined) {
      carrier.frequency.exponentialRampToValueAtTime(Math.max(1, options.freqEnd), start + dur);
    }

    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(Math.max(1, options.freq * options.ratio), start);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(Math.max(0.001, options.index), start);
    modGain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, options.indexEnd ?? options.index * 0.05),
      start + dur,
    );
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    carrier.connect(gain);
    gain.connect(dest);

    modulator.start(start);
    carrier.start(start);
    modulator.stop(start + dur + 0.05);
    carrier.stop(start + dur + 0.05);
  }

  /** マリンバ（基音 + 4倍音 + 2倍音）の弾む音。 */
  private marimba(dest: AudioNode, time: number, freq: number, gain: number, dur = 0.4, pan = 0): void {
    this.tone(dest, time, {
      type: 'sine',
      freq,
      dur,
      gain,
      attack: 0.004,
      pan,
      filterType: 'lowpass',
      filterFreq: Math.max(1200, freq * 6),
    });
    this.tone(dest, time, {
      type: 'sine',
      freq: freq * 4,
      dur: dur * 0.35,
      gain: gain * 0.22,
      attack: 0.002,
      pan,
    });
    this.tone(dest, time, {
      type: 'triangle',
      freq: freq * 2,
      dur: dur * 0.5,
      gain: gain * 0.12,
      attack: 0.002,
      pan,
    });
  }

  /* ------------------------------------------------------------
   * プレイヤー SE
   * ------------------------------------------------------------ */

  playJump(isDouble = false): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('jump', isDouble ? 1.32 : 1.0, isDouble ? 1.05 : 1.0)) return;
    const t = this.ac.currentTime + 0.002;
    const base = isDouble ? 520 : 360;
    const top = isDouble ? 1180 : 760;

    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: base,
      freqEnd: top,
      glide: 0.14,
      dur: 0.2,
      gain: 0.2,
      attack: 0.006,
      filterType: 'lowpass',
      filterFreq: 2600,
    });
    this.tone(this.sfxGain, t + 0.01, {
      type: 'sine',
      freq: base * 2,
      freqEnd: top * 2,
      glide: 0.12,
      dur: 0.14,
      gain: 0.07,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.09,
      gain: 0.05,
      filterType: 'highpass',
      filterFreq: 1800,
    });

    if (isDouble) {
      const sparkle = ['E6', 'G6', 'B6', 'E7'];
      sparkle.forEach((note, index) => {
        this.tone(this.sfxGain, t + 0.03 + index * 0.035, {
          type: 'sine',
          freq: noteToFreq(note),
          dur: 0.22,
          gain: 0.09,
          attack: 0.004,
        });
      });
      this.tone(this.sfxGain, t, {
        type: 'sine',
        freq: 900,
        freqEnd: 2400,
        glide: 0.22,
        dur: 0.26,
        gain: 0.05,
        vibratoHz: 22,
        vibratoDepth: 40,
      });
    }
  }

  playStomp(comboIndex = 0): void {
    if (!this.canPlay()) return;
    const semi = SCALE_SEMITONES[clamp(Math.floor(comboIndex), 0, SCALE_SEMITONES.length - 1)];
    if (this.tryPlayExternalSfx('stomp', Math.pow(2, semi / 12), 1.0)) return;
    const t = this.ac.currentTime + 0.002;
    const scale = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
    const index = clamp(Math.floor(comboIndex), 0, scale.length - 1);
    const freq = noteToFreq(scale[index]);

    // ぷにっという低音アタック
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 190,
      freqEnd: 62,
      glide: 0.1,
      dur: 0.16,
      gain: 0.34,
      attack: 0.003,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.08,
      gain: 0.12,
      filterType: 'lowpass',
      filterFreq: 700,
      filterFreqEnd: 180,
    });

    // ドレミファソラシドで上昇する弾むマリンバ
    this.marimba(this.sfxGain, t + 0.01, freq, 0.26, 0.4);
    this.marimba(this.sfxGain, t + 0.09, freq * 1.5, 0.14, 0.3);
  }

  playHipDropStart(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('hipDropStart')) return;
    const t = this.ac.currentTime + 0.002;

    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 420,
      freqEnd: 1750,
      glide: 0.34,
      dur: 0.4,
      gain: 0.16,
      attack: 0.02,
      vibratoHz: 16,
      vibratoDepth: 26,
    });
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: 210,
      freqEnd: 880,
      glide: 0.34,
      dur: 0.4,
      gain: 0.07,
      attack: 0.03,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.36,
      gain: 0.05,
      filterType: 'bandpass',
      filterFreq: 900,
      filterFreqEnd: 3200,
      filterQ: 1.4,
    });
  }

  playHipDropSlam(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('hipDropSlam')) return;
    const t = this.ac.currentTime + 0.002;

    // ドスン！のサブベース
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 96,
      freqEnd: 34,
      glide: 0.42,
      dur: 0.55,
      gain: 0.62,
      attack: 0.004,
    });
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: 180,
      freqEnd: 60,
      glide: 0.2,
      dur: 0.3,
      gain: 0.2,
      attack: 0.003,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.4,
      gain: 0.3,
      filterType: 'lowpass',
      filterFreq: 1400,
      filterFreqEnd: 120,
      filterQ: 0.8,
    });

    // 衝撃波のキラキラ減衰スイープ
    this.noise(this.sfxGain, t + 0.02, {
      dur: 0.5,
      gain: 0.1,
      filterType: 'highpass',
      filterFreq: 6000,
      filterFreqEnd: 900,
      filterQ: 0.7,
    });
    const shimmer = ['C7', 'G6', 'E6', 'C6', 'G5'];
    shimmer.forEach((note, index) => {
      this.tone(this.sfxGain, t + 0.03 + index * 0.045, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.3,
        gain: 0.06 - index * 0.008,
        attack: 0.003,
      });
    });

    // おもちゃの軽い弾み音
    this.marimba(this.sfxGain, t + 0.16, noteToFreq('G4'), 0.12, 0.25);
    this.marimba(this.sfxGain, t + 0.24, noteToFreq('C5'), 0.1, 0.25);
  }

  playRollLoop(active: boolean, speed = 10): void {
    this.rollActive = active;
    this.rollSpeed = clamp(speed, 0, 40);

    if (this.ctx && this.ctx.state === 'closed') {
      this.ctx = null;
      this.rollNodes = null;
    }
    if (!this.ctx) {
      if (active) this.init();
      if (!this.ctx) return;
    }
    if (active) this.ensureRollNodes();
    this.applyRollGain();
  }

  private ensureRollNodes(): void {
    if (this.rollNodes) return;
    const ctx = this.ac;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 1.1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 90;
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 400;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0;
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this.sfxGain);

    noise.start();
    osc.start();

    this.rollNodes = { noise, noiseFilter, noiseGain, osc, oscFilter, oscGain };
  }

  private applyRollGain(immediate = false): void {
    const ctx = this.ctx;
    const nodes = this.rollNodes;
    if (!ctx || !nodes) return;

    const now = ctx.currentTime;
    const on = this.rollActive && !this.muted;
    const speed = clamp(this.rollSpeed / 20, 0.15, 1.6);
    const timeConstant = immediate ? 0.02 : 0.05;

    nodes.noiseGain.gain.setTargetAtTime(on ? 0.16 * speed : 0, now, timeConstant);
    nodes.oscGain.gain.setTargetAtTime(on ? 0.1 * speed : 0, now, timeConstant);
    nodes.noiseFilter.frequency.setTargetAtTime(300 + speed * 900, now, 0.08);
    nodes.osc.frequency.setTargetAtTime(60 + speed * 90, now, 0.08);
    nodes.oscFilter.frequency.setTargetAtTime(200 + speed * 500, now, 0.08);

    if (!on) {
      // setTargetAtTime は 0 に漸近するだけなので、確実に無音になるよう明示的に 0 を置く
      nodes.noiseGain.gain.setValueAtTime(0, now + 0.25);
      nodes.oscGain.gain.setValueAtTime(0, now + 0.25);
    }
  }

  playCoin(streakIndex = 0): void {
    if (!this.canPlay()) return;
    const semi = SCALE_SEMITONES[clamp(Math.floor(streakIndex), 0, SCALE_SEMITONES.length - 1)];
    if (this.tryPlayExternalSfx('coin', Math.pow(2, semi / 12), 1.0)) return;
    const t = this.ac.currentTime + 0.002;
    const scale = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6'];
    const index = clamp(Math.floor(streakIndex), 0, scale.length - 1);
    const freq = noteToFreq(scale[index]);

    // キラッとした倍音チャイム
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: freq * 0.985,
      freqEnd: freq,
      glide: 0.05,
      dur: 0.34,
      gain: 0.2,
      attack: 0.003,
    });
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: freq * 2,
      dur: 0.26,
      gain: 0.1,
      attack: 0.002,
    });
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: freq * 3,
      dur: 0.16,
      gain: 0.05,
      attack: 0.002,
    });
    this.tone(this.sfxGain, t + 0.045, {
      type: 'sine',
      freq: freq * 1.5,
      dur: 0.22,
      gain: 0.07,
      attack: 0.003,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.12,
      gain: 0.035,
      filterType: 'highpass',
      filterFreq: 5200,
    });
  }

  playStar(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('star')) return;
    const t = this.ac.currentTime + 0.002;
    const notes = ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'];

    notes.forEach((note, index) => {
      this.tone(this.sfxGain, t + index * 0.055, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.5,
        gain: 0.12,
        attack: 0.003,
      });
    });
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: noteToFreq('C5'),
      freqEnd: noteToFreq('C6'),
      glide: 0.5,
      dur: 0.6,
      gain: 0.08,
      attack: 0.01,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.7,
      gain: 0.06,
      filterType: 'highpass',
      filterFreq: 4000,
      filterFreqEnd: 9000,
    });
  }

  playTrampoline(): void {
    if (!this.canPlay()) return;
    const t = this.ac.currentTime + 0.002;
    const pitch = 0.97 + Math.random() * 0.06;

    // 1. ぷにっと丸いクッション押し返しアタック（「ポ」の丸み）
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 210 * pitch,
      freqEnd: 330 * pitch,
      glide: 0.055,
      dur: 0.09,
      gain: 0.09,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreq: 1100,
    });

    // 2. 軽快で丸っこいゴム跳ね基音（「ポヨッ♪」）
    this.tone(this.sfxGain, t + 0.012, {
      type: 'sine',
      freq: 280 * pitch,
      freqEnd: 740 * pitch,
      glide: 0.14,
      dur: 0.24,
      gain: 0.14,
      attack: 0.008,
      filterType: 'lowpass',
      filterFreq: 2000,
    });

    // 3. おもちゃ箱らしい可愛い跳ね上げメロディ（「ピョンッ♪」）
    this.tone(this.sfxGain, t + 0.045, {
      type: 'triangle',
      freq: noteToFreq('D5') * pitch,
      freqEnd: noteToFreq('A5') * pitch,
      glide: 0.095,
      dur: 0.19,
      gain: 0.065,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreq: 2600,
    });

    // 4. さりげないトイベルのきらめき余韻
    this.tone(this.sfxGain, t + 0.075, {
      type: 'sine',
      freq: noteToFreq('D6') * pitch,
      dur: 0.16,
      gain: 0.045,
      attack: 0.004,
    });

    // 5. ぬいぐるみがふわっと飛び上がる軽い空気音
    this.noise(this.sfxGain, t, {
      dur: 0.075,
      gain: 0.018,
      filterType: 'bandpass',
      filterFreq: 1600,
      filterFreqEnd: 2800,
      filterQ: 1.5,
    });
  }

  playCushion(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('cushion')) return;
    const t = this.ac.currentTime + 0.002;

    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 240,
      freqEnd: 92,
      glide: 0.22,
      dur: 0.34,
      gain: 0.3,
      attack: 0.01,
      filterType: 'lowpass',
      filterFreq: 900,
    });
    this.tone(this.sfxGain, t + 0.02, {
      type: 'triangle',
      freq: 480,
      freqEnd: 180,
      glide: 0.2,
      dur: 0.26,
      gain: 0.08,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.22,
      gain: 0.07,
      filterType: 'lowpass',
      filterFreq: 1200,
      filterFreqEnd: 300,
    });
  }

  playDominoClack(chainIndex = 0): void {
    if (!this.canPlay()) return;
    const pitchRatio = Math.pow(2, clamp(chainIndex % 14, 0, 13) / 16);
    if (this.tryPlayExternalSfx('blockHit', 1.25 * pitchRatio, 0.72)) return;
    const t = this.ac.currentTime + 0.002;
    this.woodblock(this.sfxGain, t, 0.16);
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 540 * pitchRatio,
      dur: 0.055,
      gain: 0.10,
      attack: 0.001,
    });
  }

  playBlockHit(intensity = 1): void {
    if (!this.canPlay()) return;
    const s = clamp(intensity, 0.3, 1.8);
    if (this.tryPlayExternalSfx('blockHit', 0.92 + s * 0.1, Math.min(1.2, 0.65 + s * 0.35))) return;
    const t = this.ac.currentTime + 0.002;
    const strength = clamp(intensity, 0.2, 2);
    const pitch = 1 + (strength - 1) * 0.12;

    // カラッとした木製積み木の打撃
    this.noise(this.sfxGain, t, {
      dur: 0.07,
      gain: Math.min(0.4, 0.16 * strength),
      filterType: 'bandpass',
      filterFreq: 1500 * pitch,
      filterQ: 5,
    });
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: 520 * pitch,
      freqEnd: 380 * pitch,
      glide: 0.05,
      dur: 0.1,
      gain: Math.min(0.35, 0.14 * strength),
      attack: 0.002,
    });
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 260 * pitch,
      dur: 0.08,
      gain: Math.min(0.25, 0.1 * strength),
      attack: 0.002,
    });
  }

  playBoxBreak(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('boxBreak')) return;
    const t = this.ac.currentTime + 0.002;

    // 木箱粉砕
    for (let i = 0; i < 4; i += 1) {
      this.noise(this.sfxGain, t + i * 0.035, {
        dur: 0.12,
        gain: 0.16 - i * 0.02,
        filterType: 'bandpass',
        filterFreq: 900 + i * 500,
        filterQ: 2.5,
      });
    }
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 150,
      freqEnd: 55,
      glide: 0.2,
      dur: 0.3,
      gain: 0.3,
      attack: 0.003,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.3,
      gain: 0.18,
      filterType: 'lowpass',
      filterFreq: 900,
      filterFreqEnd: 200,
    });

    // パリン・キラキラ
    const shards = ['E6', 'A6', 'C#7', 'E7'];
    shards.forEach((note, index) => {
      this.tone(this.sfxGain, t + 0.08 + index * 0.04, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.35,
        gain: 0.07,
        attack: 0.002,
      });
    });
    this.noise(this.sfxGain, t + 0.06, {
      dur: 0.4,
      gain: 0.06,
      filterType: 'highpass',
      filterFreq: 5000,
    });
  }

  playDamage(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('damage')) return;
    const t = this.ac.currentTime + 0.002;

    // 痛可愛い「ぴえん！」
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: 720,
      freqEnd: 210,
      glide: 0.3,
      dur: 0.4,
      gain: 0.2,
      attack: 0.005,
      vibratoHz: 9,
      vibratoDepth: 18,
    });
    this.tone(this.sfxGain, t + 0.02, {
      type: 'sawtooth',
      freq: 360,
      freqEnd: 120,
      glide: 0.28,
      dur: 0.34,
      gain: 0.06,
      filterType: 'lowpass',
      filterFreq: 1400,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.18,
      gain: 0.1,
      filterType: 'bandpass',
      filterFreq: 900,
      filterFreqEnd: 300,
      filterQ: 1.2,
    });
  }

  playFeverStart(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('feverStart')) return;
    const t = this.ac.currentTime + 0.002;

    // 虹が弾ける大昇華アルペジオ
    const arp = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7', 'E7'];
    arp.forEach((note, index) => {
      this.tone(this.sfxGain, t + index * 0.055, {
        type: 'triangle',
        freq: noteToFreq(note),
        dur: 0.3,
        gain: 0.14,
        attack: 0.003,
      });
    });
    this.noise(this.sfxGain, t, {
      dur: 0.6,
      gain: 0.09,
      filterType: 'bandpass',
      filterFreq: 600,
      filterFreqEnd: 7000,
      filterQ: 1.6,
    });

    const chord = ['C5', 'E5', 'G5', 'C6'];
    chord.forEach((note) => {
      this.tone(this.sfxGain, t + 0.44, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.7,
        gain: 0.1,
        attack: 0.01,
      });
    });
    this.tone(this.sfxGain, t + 0.44, {
      type: 'sine',
      freq: noteToFreq('C7'),
      dur: 0.9,
      gain: 0.08,
      attack: 0.01,
    });
  }

  playTutorialCheck(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('tutorialCheck')) return;
    const t = this.ac.currentTime + 0.002;
    const first = noteToFreq('E6');
    const second = noteToFreq('C7');

    // 爽やかな「ピンポーン♪」
    this.tone(this.sfxGain, t, { type: 'sine', freq: first, dur: 0.5, gain: 0.16, attack: 0.004 });
    this.tone(this.sfxGain, t, { type: 'sine', freq: first * 2, dur: 0.3, gain: 0.05, attack: 0.003 });
    this.tone(this.sfxGain, t + 0.16, { type: 'sine', freq: second, dur: 0.7, gain: 0.16, attack: 0.004 });
    this.tone(this.sfxGain, t + 0.16, { type: 'sine', freq: second * 2, dur: 0.4, gain: 0.05, attack: 0.003 });
  }

  playBossSlam(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('bossSlam')) return;
    const t = this.ac.currentTime + 0.002;

    // 重厚な木製ガントレット叩きつけ
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 110,
      freqEnd: 32,
      glide: 0.5,
      dur: 0.7,
      gain: 0.6,
      attack: 0.004,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.5,
      gain: 0.3,
      filterType: 'lowpass',
      filterFreq: 1800,
      filterFreqEnd: 140,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.16,
      gain: 0.2,
      filterType: 'bandpass',
      filterFreq: 420,
      filterQ: 3,
    });
    this.tone(this.sfxGain, t, {
      type: 'triangle',
      freq: 240,
      freqEnd: 70,
      glide: 0.25,
      dur: 0.4,
      gain: 0.22,
      attack: 0.003,
    });

    // 衝撃波
    this.noise(this.sfxGain, t + 0.03, {
      dur: 0.6,
      gain: 0.08,
      filterType: 'highpass',
      filterFreq: 3000,
      filterFreqEnd: 600,
    });
  }

  playBossHit(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('bossHit')) return;
    const t = this.ac.currentTime + 0.002;

    // 金色ぜんまいネジ粉砕のメタリック音
    this.fm(this.sfxGain, t, {
      freq: 880,
      ratio: 3.71,
      index: 900,
      indexEnd: 40,
      dur: 0.35,
      gain: 0.16,
      attack: 0.002,
    });
    this.tone(this.sfxGain, t, { type: 'sine', freq: 1320, dur: 0.5, gain: 0.1, attack: 0.002 });
    this.tone(this.sfxGain, t, { type: 'sine', freq: 1980, dur: 0.35, gain: 0.06, attack: 0.002 });
    this.noise(this.sfxGain, t, {
      dur: 0.12,
      gain: 0.12,
      filterType: 'bandpass',
      filterFreq: 4200,
      filterQ: 4,
    });
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 220,
      freqEnd: 110,
      glide: 0.15,
      dur: 0.2,
      gain: 0.14,
      attack: 0.002,
    });
  }

  playBossDefeat(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('bossDefeat')) return;
    const t = this.ac.currentTime + 0.002;

    // ぜんまいがほどける連続爆発
    for (let i = 0; i < 6; i += 1) {
      const at = t + i * 0.13;
      this.noise(this.sfxGain, at, {
        dur: 0.3,
        gain: 0.22 - i * 0.02,
        filterType: 'lowpass',
        filterFreq: 1600 - i * 180,
        filterFreqEnd: 160,
      });
      this.tone(this.sfxGain, at, {
        type: 'sine',
        freq: 120 - i * 8,
        freqEnd: 40,
        glide: 0.25,
        dur: 0.35,
        gain: 0.3 - i * 0.03,
        attack: 0.003,
      });
    }

    // 大撃破ファンファーレ
    const fanfare = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'];
    fanfare.forEach((note, index) => {
      this.tone(this.sfxGain, t + 0.85 + index * 0.07, {
        type: 'triangle',
        freq: noteToFreq(note),
        dur: 0.5,
        gain: 0.13,
        attack: 0.004,
      });
    });
    const finalChord = ['C5', 'E5', 'G5', 'C6'];
    finalChord.forEach((note) => {
      this.tone(this.sfxGain, t + 1.35, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 1.2,
        gain: 0.1,
        attack: 0.02,
      });
    });
    this.noise(this.sfxGain, t + 0.85, {
      dur: 1.2,
      gain: 0.05,
      filterType: 'highpass',
      filterFreq: 5000,
    });
  }

  playChestOpen(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('chestOpen')) return;
    const t = this.ac.currentTime + 0.002;

    // 宝箱の溜め上昇
    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 180,
      freqEnd: 900,
      glide: 0.5,
      dur: 0.55,
      gain: 0.1,
      attack: 0.05,
      vibratoHz: 14,
      vibratoDepth: 20,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.5,
      gain: 0.05,
      filterType: 'bandpass',
      filterFreq: 400,
      filterFreqEnd: 3000,
      filterQ: 2,
    });

    // パカッ！
    this.noise(this.sfxGain, t + 0.52, {
      dur: 0.1,
      gain: 0.2,
      filterType: 'bandpass',
      filterFreq: 1600,
      filterQ: 3,
    });
    this.tone(this.sfxGain, t + 0.52, {
      type: 'triangle',
      freq: 420,
      freqEnd: 260,
      glide: 0.08,
      dur: 0.12,
      gain: 0.16,
      attack: 0.002,
    });

    // ジャーン♪ ご褒美ファンファーレ
    const fanfare = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'];
    fanfare.forEach((note, index) => {
      this.tone(this.sfxGain, t + 0.6 + index * 0.06, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.6,
        gain: 0.12,
        attack: 0.004,
      });
    });
    const finalChord = ['C5', 'E5', 'G5', 'C6', 'E6'];
    finalChord.forEach((note) => {
      this.tone(this.sfxGain, t + 1.05, {
        type: 'triangle',
        freq: noteToFreq(note),
        dur: 1.4,
        gain: 0.09,
        attack: 0.02,
      });
    });
    this.noise(this.sfxGain, t + 0.6, {
      dur: 1,
      gain: 0.06,
      filterType: 'highpass',
      filterFreq: 6000,
    });
  }

  playHeal(): void {
    if (!this.canPlay()) return;
    const t = this.ac.currentTime + 0.002;

    // 優しい上昇チャイム和音（C5 -> E5 -> G5 -> C6 + あたたかいきらめき和音）
    const notes = ['C5', 'E5', 'G5', 'C6'];
    notes.forEach((note, index) => {
      const freq = noteToFreq(note);
      const at = t + index * 0.075;
      this.tone(this.sfxGain, at, {
        type: 'sine',
        freq,
        dur: 0.45,
        gain: 0.14,
        attack: 0.005,
        pan: (index - 1.5) * 0.14,
      });
      this.tone(this.sfxGain, at, {
        type: 'triangle',
        freq: freq * 2,
        dur: 0.26,
        gain: 0.045,
        attack: 0.004,
        pan: (index - 1.5) * 0.14,
      });
    });

    const chord = ['E5', 'G5', 'C6', 'E6'];
    chord.forEach((note) => {
      this.tone(this.sfxGain, t + 0.3, {
        type: 'sine',
        freq: noteToFreq(note),
        dur: 0.65,
        gain: 0.075,
        attack: 0.015,
      });
    });
  }

  playGameOver(): void {
    if (!this.canPlay()) return;
    const t = this.ac.currentTime + 0.002;

    // 愛嬌ある下降トイ・ジングル（マリンバ／トイピアノ調）
    const phrase: Array<{ note: string; offset: number; dur: number }> = [
      { note: 'G5', offset: 0.0, dur: 0.24 },
      { note: 'F#5', offset: 0.18, dur: 0.24 },
      { note: 'F5', offset: 0.36, dur: 0.24 },
      { note: 'E5', offset: 0.54, dur: 0.32 },
      { note: 'C5', offset: 0.78, dur: 0.65 },
    ];
    phrase.forEach(({ note, offset, dur }, idx) => {
      const freq = noteToFreq(note);
      const isLast = idx === phrase.length - 1;
      this.tone(this.sfxGain, t + offset, {
        type: 'triangle',
        freq,
        freqEnd: isLast ? freq * 0.94 : undefined,
        glide: isLast ? 0.45 : undefined,
        dur,
        gain: isLast ? 0.18 : 0.14,
        attack: 0.005,
        filterType: 'lowpass',
        filterFreq: 2200,
      });
      this.tone(this.sfxGain, t + offset, {
        type: 'sine',
        freq: freq * 0.5,
        freqEnd: isLast ? freq * 0.47 : undefined,
        glide: isLast ? 0.45 : undefined,
        dur: dur * 0.9,
        gain: 0.08,
        attack: 0.006,
      });
    });
  }

  playUiClick(): void {
    if (!this.canPlay()) return;
    if (this.tryPlayExternalSfx('uiClick')) return;
    const t = this.ac.currentTime + 0.002;

    this.tone(this.sfxGain, t, {
      type: 'sine',
      freq: 880,
      freqEnd: 1180,
      glide: 0.04,
      dur: 0.07,
      gain: 0.1,
      attack: 0.002,
    });
    this.noise(this.sfxGain, t, {
      dur: 0.03,
      gain: 0.03,
      filterType: 'highpass',
      filterFreq: 3000,
    });
  }

  /* ------------------------------------------------------------
   * BGM シーケンサー
   * ------------------------------------------------------------ */

  private applyBgm(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    // Stop previous external BGM smoothly
    if (this.externalBgmSource && this.externalBgmSessionGain) {
      const prevSrc = this.externalBgmSource;
      const prevGain = this.externalBgmSessionGain;
      const now = ctx.currentTime;
      prevGain.gain.cancelScheduledValues(now);
      prevGain.gain.setTargetAtTime(0, now, 0.08);
      window.setTimeout(() => {
        try {
          prevSrc.stop();
          prevSrc.disconnect();
          prevGain.disconnect();
        } catch {
          /* ignore */
        }
      }, 450);
      this.externalBgmSource = null;
      this.externalBgmSessionGain = null;
    }
    this.activeExternalBgmMode = null;

    const previous = this.bgmSession;
    if (previous) {
      const now = ctx.currentTime;
      previous.gain.cancelScheduledValues(now);
      previous.gain.setTargetAtTime(0, now, 0.08);
      window.setTimeout(() => {
        try {
          previous.disconnect();
        } catch {
          /* すでに切断済みなら無視 */
        }
      }, 600);
      this.bgmSession = null;
    }

    this.pattern = null;
    this.activeProceduralBgmMode = null;
    if (this.desiredBgm === 'none') return;

    if (ctx.state !== 'running') {
      this.bindUnlockListeners();
      return;
    }

    // Prefer high-quality external CC0 audio file when loaded
    const extBuf = this.externalBgmBuffers.get(this.desiredBgm);
    if (extBuf) {
      const cfg = this.externalBgmConfigs.get(this.desiredBgm);
      const src = ctx.createBufferSource();
      src.buffer = extBuf;
      src.loop = cfg?.loop ?? this.desiredBgm !== 'victory';
      src.playbackRate.value = clamp(cfg?.playbackRate ?? 1.0, 0.5, 2.0);
      src.onended = () => {
        if (this.externalBgmSource === src) {
          this.externalBgmSource = null;
          this.externalBgmSessionGain = null;
          this.activeExternalBgmMode = null;
        }
      };

      const g = ctx.createGain();
      const targetVol = clamp(cfg?.volume ?? 0.45, 0, 1.2);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.01, targetVol), ctx.currentTime + 0.45);

      src.connect(g);
      g.connect(this.bgmGain);
      src.start(ctx.currentTime + 0.02);

      this.externalBgmSource = src;
      this.externalBgmSessionGain = g;
      this.activeExternalBgmMode = this.desiredBgm;
      return;
    }

    const pattern = BGM_PATTERNS[this.desiredBgm];
    if (!pattern) return;

    const PROCEDURAL_BGM_GAIN: Partial<Record<BgmMode, number>> = {
      fever: 0.58,
      boss: 0.88,
    };
    const targetProcGain = PROCEDURAL_BGM_GAIN[this.desiredBgm] ?? 1.0;

    const session = ctx.createGain();
    session.gain.setValueAtTime(0.0001, ctx.currentTime);
    session.gain.exponentialRampToValueAtTime(targetProcGain, ctx.currentTime + 0.5);
    session.connect(this.bgmGain);
    session.connect(this.bgmReverbSend);

    this.bgmSession = session;
    this.pattern = pattern;
    this.activeProceduralBgmMode = this.desiredBgm;
    this.stepIndex = 0;
    this.nextStepTime = ctx.currentTime + 0.1;
    this.bgmTimer = window.setInterval(this.bgmTick, 25);
  }

  private bgmTick = (): void => {
    const ctx = this.ctx;
    const session = this.bgmSession;
    const pattern = this.pattern;
    if (!ctx || !session || !pattern) return;

    if (this.muted) {
      this.nextStepTime = ctx.currentTime;
      return;
    }

    // タブが裏に回ってタイマーが遅延した場合は現在時刻へ再同期する
    if (this.nextStepTime < ctx.currentTime - 0.25) {
      this.nextStepTime = ctx.currentTime + 0.05;
    }

    const stepDuration = 60 / pattern.bpm / 4;
    const horizon = ctx.currentTime + 0.16;
    let guard = 0;

    while (this.nextStepTime < horizon && guard < 64) {
      this.scheduleBgmStep(this.stepIndex, this.nextStepTime, session, pattern);
      this.nextStepTime += stepDuration;
      this.stepIndex += 1;
      guard += 1;
    }
  };

  private scheduleBgmStep(step: number, time: number, session: GainNode, pattern: BgmPattern): void {
    const index = step % pattern.melody.length;
    const stepInBar = step % pattern.stepsPerBar;
    const bar = Math.floor(step / pattern.stepsPerBar) % pattern.bars;

    const melodyNote = pattern.melody[index];
    if (melodyNote) {
      const freq = noteToFreq(melodyNote);
      this.leadVoice(session, time, freq, pattern.lead, 0.15);
      if (pattern.double && stepInBar % 4 === 0) {
        this.leadVoice(session, time, freq, pattern.double, 0.06, 0.28);
      }
    }

    const bassNote = pattern.bass[index];
    if (bassNote) {
      this.bassVoice(session, time, noteToFreq(bassNote), pattern.bassKind, 0.2);
    }

    const chord = pattern.chords[bar] ?? pattern.chords[0];
    if (pattern.arp) {
      const tone = chord[stepInBar % chord.length];
      if (tone) {
        const freq = noteToFreq(tone) * 2;
        this.tone(session, time, { type: 'sine', freq, dur: 0.22, gain: 0.05, attack: 0.002, pan: -0.22 });
        this.tone(session, time, {
          type: 'sine',
          freq: freq * 2.76,
          dur: 0.12,
          gain: 0.018,
          attack: 0.002,
          pan: -0.22,
        });
      }
    } else if (stepInBar === 0) {
      this.padVoice(session, time, chord, pattern.bpm, pattern.stepsPerBar / 4);
    }

    this.bgmPerc(session, time, stepInBar, pattern);
  }

  private leadVoice(
    dest: AudioNode,
    time: number,
    freq: number,
    kind: LeadKind,
    gain: number,
    pan = 0,
  ): void {
    switch (kind) {
      case 'marimba':
        this.marimba(dest, time, freq, gain, 0.45, pan);
        break;
      case 'xylophone':
        this.tone(dest, time, { type: 'sine', freq, dur: 0.22, gain, attack: 0.002, pan });
        this.tone(dest, time, { type: 'sine', freq: freq * 3, dur: 0.1, gain: gain * 0.3, attack: 0.001, pan });
        break;
      case 'toyPiano':
        this.tone(dest, time, {
          type: 'triangle',
          freq,
          dur: 0.5,
          gain,
          attack: 0.004,
          pan,
          filterType: 'lowpass',
          filterFreq: Math.max(1200, freq * 5),
        });
        this.tone(dest, time, { type: 'sine', freq: freq * 2, dur: 0.3, gain: gain * 0.25, attack: 0.002, pan });
        break;
      case 'musicBox':
        this.tone(dest, time, { type: 'sine', freq, dur: 0.7, gain, attack: 0.002, pan });
        this.tone(dest, time, { type: 'sine', freq: freq * 2.01, dur: 0.4, gain: gain * 0.3, attack: 0.002, pan });
        this.tone(dest, time, { type: 'sine', freq: freq * 3.02, dur: 0.25, gain: gain * 0.15, attack: 0.002, pan });
        break;
      case 'bell':
        this.tone(dest, time, { type: 'sine', freq, dur: 0.5, gain, attack: 0.002, pan });
        this.tone(dest, time, { type: 'sine', freq: freq * 2.76, dur: 0.25, gain: gain * 0.25, attack: 0.002, pan });
        break;
    }
  }

  private bassVoice(dest: AudioNode, time: number, freq: number, kind: BassKind, gain: number): void {
    switch (kind) {
      case 'toyBass':
        this.tone(dest, time, {
          type: 'triangle',
          freq,
          dur: 0.28,
          gain,
          attack: 0.006,
          filterType: 'lowpass',
          filterFreq: 900,
        });
        this.tone(dest, time, { type: 'sine', freq: freq * 0.5, dur: 0.3, gain: gain * 0.5, attack: 0.006 });
        break;
      case 'subBass':
        this.tone(dest, time, { type: 'sine', freq, dur: 0.4, gain, attack: 0.01 });
        this.tone(dest, time, { type: 'triangle', freq: freq * 2, dur: 0.2, gain: gain * 0.2, attack: 0.005 });
        break;
      case 'pluck':
        this.tone(dest, time, {
          type: 'sawtooth',
          freq,
          dur: 0.18,
          gain,
          attack: 0.003,
          filterType: 'lowpass',
          filterFreq: 1200,
          filterFreqEnd: 300,
          filterQ: 4,
        });
        break;
    }
  }

  private padVoice(dest: AudioNode, time: number, chord: string[], bpm: number, beats: number): void {
    const dur = (60 / bpm) * Math.max(1, beats) * 0.95;
    chord.forEach((note, index) => {
      this.tone(dest, time, {
        type: 'triangle',
        freq: noteToFreq(note),
        dur,
        gain: 0.028,
        attack: 0.12,
        detune: index % 2 === 0 ? -5 : 5,
        filterType: 'lowpass',
        filterFreq: 1600,
      });
    });
  }

  private bgmPerc(dest: AudioNode, time: number, stepInBar: number, pattern: BgmPattern): void {
    switch (pattern.perc) {
      case 'march':
        if (stepInBar === 0 || stepInBar === 8) this.kick(dest, time, 0.22);
        if (stepInBar === 4 || stepInBar === 12) this.snare(dest, time, 0.1);
        if (stepInBar % 2 === 1) this.hat(dest, time, 0.03);
        break;
      case 'woodblock':
        if (stepInBar === 0 || stepInBar === 8) this.woodblock(dest, time, 0.09);
        if (stepInBar === 4 || stepInBar === 12) this.woodblock(dest, time, 0.05);
        if (stepInBar % 4 === 2) this.hat(dest, time, 0.02);
        break;
      case 'clock':
        if (stepInBar % 2 === 0) this.clockTick(dest, time, stepInBar % 4 === 0 ? 0.05 : 0.03);
        if (stepInBar === 0 || stepInBar === 8) this.kick(dest, time, 0.2);
        break;
      case 'waltz':
        if (stepInBar === 0) this.kick(dest, time, 0.2);
        if (stepInBar === 4 || stepInBar === 8) this.snare(dest, time, 0.06);
        if (stepInBar % 2 === 0) this.hat(dest, time, 0.025);
        break;
      case 'fever':
        if (stepInBar % 4 === 0) this.kick(dest, time, 0.24);
        if (stepInBar === 4 || stepInBar === 12) this.snare(dest, time, 0.12);
        if (stepInBar % 2 === 0) this.hat(dest, time, 0.035);
        break;
    }
  }

  private kick(dest: AudioNode, time: number, gain: number): void {
    this.tone(dest, time, {
      type: 'sine',
      freq: 130,
      freqEnd: 46,
      glide: 0.09,
      dur: 0.18,
      gain,
      attack: 0.002,
    });
  }

  private snare(dest: AudioNode, time: number, gain: number): void {
    this.noise(dest, time, {
      dur: 0.12,
      gain,
      filterType: 'bandpass',
      filterFreq: 1900,
      filterQ: 1.2,
    });
    this.tone(dest, time, {
      type: 'triangle',
      freq: 220,
      freqEnd: 160,
      glide: 0.06,
      dur: 0.09,
      gain: gain * 0.5,
      attack: 0.002,
    });
  }

  private hat(dest: AudioNode, time: number, gain: number): void {
    this.noise(dest, time, {
      dur: 0.035,
      gain,
      filterType: 'highpass',
      filterFreq: 7000,
    });
  }

  private woodblock(dest: AudioNode, time: number, gain: number): void {
    this.noise(dest, time, {
      dur: 0.05,
      gain,
      filterType: 'bandpass',
      filterFreq: 1400,
      filterQ: 6,
    });
    this.tone(dest, time, {
      type: 'sine',
      freq: 760,
      dur: 0.06,
      gain: gain * 0.6,
      attack: 0.001,
    });
  }

  private clockTick(dest: AudioNode, time: number, gain: number): void {
    this.noise(dest, time, {
      dur: 0.025,
      gain,
      filterType: 'highpass',
      filterFreq: 4200,
    });
    this.tone(dest, time, {
      type: 'square',
      freq: 2400,
      dur: 0.02,
      gain: gain * 0.25,
      attack: 0.001,
    });
  }
}

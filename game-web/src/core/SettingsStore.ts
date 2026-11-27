import type { FaceWipe3dMode, GameSettings, QualityPreset, ResolvedQuality } from '../types';

const STORAGE_KEY = 'manmarubuu_settings_v1';

export function isMobileDefaultDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '');
  return coarse || mobileUa;
}

export const DEFAULT_SETTINGS: GameSettings = {
  cameraAutoFollow: false,
  quality: 'auto',
  cameraSensitivity: 1.0,
  soundEnabled: true,
  showTouchControlsOverride: 'auto',
  faceWipe3d: 'auto',
  showFps: false,
};

export function getDefaultSettings(): GameSettings {
  return {
    ...DEFAULT_SETTINGS,
    cameraAutoFollow: false,
  };
}

function clampSensitivity(val: unknown): number {
  const num = typeof val === 'number' && Number.isFinite(val) ? val : 1.0;
  return Math.min(2.0, Math.max(0.4, Math.round(num * 20) / 20));
}

function normalizeSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const quality: QualityPreset =
    raw?.quality === 'high' || raw?.quality === 'medium' || raw?.quality === 'low' || raw?.quality === 'auto'
      ? raw.quality
      : 'auto';
  const showTouchControlsOverride: GameSettings['showTouchControlsOverride'] =
    raw?.showTouchControlsOverride === 'on' ||
    raw?.showTouchControlsOverride === 'off' ||
    raw?.showTouchControlsOverride === 'auto'
      ? raw.showTouchControlsOverride
      : 'auto';
  const faceWipe3d: FaceWipe3dMode =
    raw?.faceWipe3d === 'on' || raw?.faceWipe3d === 'off' || raw?.faceWipe3d === 'auto'
      ? raw.faceWipe3d
      : 'auto';

  return {
    cameraAutoFollow:
      typeof raw?.cameraAutoFollow === 'boolean'
        ? raw.cameraAutoFollow
        : false,
    quality,
    cameraSensitivity: clampSensitivity(raw?.cameraSensitivity),
    soundEnabled: typeof raw?.soundEnabled === 'boolean' ? raw.soundEnabled : true,
    showTouchControlsOverride,
    faceWipe3d,
    showFps: typeof raw?.showFps === 'boolean' ? raw.showFps : false,
  };
}

export function resolveFaceWipe3d(mode: FaceWipe3dMode, resolvedQuality: ResolvedQuality): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  if (resolvedQuality === 'low' || isMobileDefaultDevice()) return false;
  return true;
}

export function resolveQuality(preset: QualityPreset): ResolvedQuality {
  if (preset === 'high' || preset === 'medium' || preset === 'low') {
    return preset;
  }

  if (typeof window === 'undefined') return 'medium';

  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
  const mem =
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
      : 8;

  if (cores <= 2 || mem <= 2) {
    return 'low';
  }
  return 'medium';
}

export type SettingsListener = (settings: GameSettings, resolvedQuality: ResolvedQuality) => void;

export class SettingsStore {
  private settings: GameSettings;
  private listeners = new Set<SettingsListener>();

  constructor() {
    this.settings = this.load();
  }

  private load(): GameSettings {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultSettings();
      return normalizeSettings(JSON.parse(raw) as Partial<GameSettings>);
    } catch {
      return getDefaultSettings();
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota/private-mode errors
    }
  }

  get(): GameSettings {
    return { ...this.settings };
  }

  getResolvedQuality(): ResolvedQuality {
    return resolveQuality(this.settings.quality);
  }

  isFaceWipe3dActive(): boolean {
    return resolveFaceWipe3d(this.settings.faceWipe3d, this.getResolvedQuality());
  }

  update(partial: Partial<GameSettings>): GameSettings {
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    this.save();
    const resolved = this.getResolvedQuality();
    const copy = this.get();
    for (const listener of this.listeners) {
      listener(copy, resolved);
    }
    return copy;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

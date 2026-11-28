import type {
  SaveData,
  StampDef,
  StampId,
  WorldId,
  WorldProgress,
  WorldRunCheckpoint,
  WorldRunState,
} from '../types';

const STORAGE_KEY = 'manmarubuu_save_v2';
const LEGACY_STORAGE_KEY = 'manmarubuu_save_v1';
const SAFE_GATE_CHECKPOINTS: Record<string, WorldRunCheckpoint> = {
  world1: {
    x: 0,
    y: 0.4,
    z: -14.8,
    yaw: Math.PI,
  },
  world2: {
    x: 0,
    y: 1.2,
    z: -11.0,
    yaw: Math.PI,
  },
};

export const WORLD1_STAMPS: StampDef[] = [
  {
    id: 'clear_w1',
    title: 'ワールド1クリア',
    desc: '時計じかけの王を倒して宝箱を開けた',
    icon: '🏆',
  },
  {
    id: 'all_main_stars',
    title: 'メインスター全回収',
    desc: '金のメインスターを3個すべて集めた',
    icon: '⭐',
  },
  {
    id: 'all_secret_stars',
    title: '隠しスター全発見',
    desc: 'ひみつのスターを3個すべて見つけた',
    icon: '💎',
  },
  {
    id: 'coin_collector',
    title: 'コインマスター',
    desc: '1回の冒険でコインを40枚以上集めた',
    icon: '🪙',
  },
  {
    id: 'no_damage_boss',
    title: 'ボス無傷クリア',
    desc: 'ボス戦でノーダメージ勝利した',
    icon: '🛡️',
  },
];

export function getWorldStamps(worldId: string): StampDef[] {
  const worldNum = worldId === 'world2' ? '2' : '1';
  return WORLD1_STAMPS.map((st) =>
    st.id === 'clear_w1' ? { ...st, title: `ワールド${worldNum}クリア` } : st
  );
}

export interface WorldCatalogItem {
  id: number;
  worldKey: string;
  name: string;
  subtitle: string;
  description: string;
  playable: boolean;
  comingSoon: boolean;
  mainStars: number;
  secretStars: number;
  themeColor: string;
}

export const WORLD_CATALOG: WorldCatalogItem[] = [
  {
    id: 1,
    worldKey: 'world1',
    name: 'World 1：陽だまりの巨大キッズルーム',
    subtitle: 'SUNLIT PLAYROOM',
    description: '落ちない広々フロア！積み木キャッスル、クッション山＆巨大ベッド、おもちゃ汽車とツインすべり台の大冒険！',
    playable: true,
    comingSoon: false,
    mainStars: 3,
    secretStars: 3,
    themeColor: '#f4b44e',
  },
  {
    id: 2,
    worldKey: 'world2',
    name: 'World 2：天空のおもちゃばこ',
    subtitle: 'SKY TOYBOX MEADOW',
    description: '空に浮かぶフェルトの草原！積み木のお城、赤バネタワー、巨大すべり台ボーリングに挑もう！',
    playable: true,
    comingSoon: false,
    mainStars: 3,
    secretStars: 3,
    themeColor: '#6ad88b',
  },
  {
    id: 3,
    worldKey: 'world3',
    name: 'World 3：星空のからくり遊園地',
    subtitle: 'STARLIGHT CLOCKWORK PARK',
    description: '光る観覧車と宇宙コースターの夜空ステージ（今後のアップデートで追加予定）',
    playable: false,
    comingSoon: true,
    mainStars: 3,
    secretStars: 3,
    themeColor: '#7eb6ff',
  },
];

export function createEmptyRunState(): WorldRunState {
  return {
    active: false,
    checkpoint: null,
    activatedCheckpointIndices: [],
    collectedStarIds: [],
    star3Unlocked: false,
    rainbowBridgeOpen: false,
    bossDefeated: false,
    coins: 0,
    score: 0,
    hp: 3,
    feverMeter: 0,
    damageTakenCount: 0,
    elapsedSec: 0,
    updatedAt: 0,
  };
}

export function createEmptyWorldProgress(): WorldProgress {
  return {
    cleared: false,
    collectedStarIds: [],
    stamps: [],
    highScore: 0,
    bestRank: null,
    run: createEmptyRunState(),
  };
}

function createEmptySave(): SaveData {
  return {
    version: 2,
    tutorialCompleted: false,
    lastPlayedWorldId: 'world1',
    unlockedWorlds: [1, 2],
    worlds: {
      world1: createEmptyWorldProgress(),
      world2: createEmptyWorldProgress(),
    },
  };
}

const VALID_STAMPS = new Set<StampId>(WORLD1_STAMPS.map((s) => s.id));
const RANK_ORDER: Record<'S' | 'A' | 'B', number> = { S: 3, A: 2, B: 1 };

function normalizeStarIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((id): id is number => typeof id === 'number' && id >= 1 && id <= 6))
  ).sort((a, b) => a - b);
}

function normalizeIntArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)
    )
  ).sort((a, b) => a - b);
}

function normalizeCheckpoint(raw: unknown): WorldRunCheckpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<WorldRunCheckpoint>;
  if (
    typeof r.x === 'number' &&
    Number.isFinite(r.x) &&
    typeof r.y === 'number' &&
    Number.isFinite(r.y) &&
    typeof r.z === 'number' &&
    Number.isFinite(r.z)
  ) {
    if (r.y < -5 || r.y > 40 || Math.abs(r.x) > 85 || Math.abs(r.z) > 85) {
      return null;
    }
    return {
      x: r.x,
      y: r.y,
      z: r.z,
      yaw: typeof r.yaw === 'number' && Number.isFinite(r.yaw) ? r.yaw : Math.PI,
    };
  }
  return null;
}

function normalizeRunState(
  raw: Partial<WorldRunState> | null | undefined,
  worldId = 'world1'
): WorldRunState {
  const base = createEmptyRunState();
  if (!raw || typeof raw !== 'object') return base;
  const collectedStarIds = normalizeStarIds(raw.collectedStarIds);
  const hasAllMainStars = [1, 2, 3].every((id) => collectedStarIds.includes(id));
  const bossDefeated = hasAllMainStars && Boolean(raw.bossDefeated);
  const rainbowBridgeOpen = hasAllMainStars && (Boolean(raw.rainbowBridgeOpen) || bossDefeated);
  let checkpoint = normalizeCheckpoint(raw.checkpoint);
  const bossCutZ = worldId === 'world1' ? -25 : -33;
  const bossCenterZ = worldId === 'world1' ? -43.5 : -52;
  const safeGateCp = SAFE_GATE_CHECKPOINTS[worldId] ?? SAFE_GATE_CHECKPOINTS.world1;
  if (
    bossDefeated &&
    checkpoint &&
    (checkpoint.z < bossCutZ || Math.hypot(checkpoint.x, checkpoint.z - bossCenterZ) < 6.5)
  ) {
    checkpoint = { ...safeGateCp };
  }
  return {
    active: Boolean(raw.active),
    checkpoint,
    activatedCheckpointIndices: normalizeIntArray(raw.activatedCheckpointIndices),
    collectedStarIds,
    star3Unlocked: Boolean(raw.star3Unlocked) || collectedStarIds.includes(3),
    rainbowBridgeOpen,
    bossDefeated,
    coins: typeof raw.coins === 'number' && Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins)) : 0,
    score: typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.floor(raw.score)) : 0,
    hp:
      typeof raw.hp === 'number' && Number.isFinite(raw.hp)
        ? Math.min(3, Math.max(1, Math.floor(raw.hp)))
        : 3,
    feverMeter:
      typeof raw.feverMeter === 'number' && Number.isFinite(raw.feverMeter)
        ? Math.min(100, Math.max(0, raw.feverMeter))
        : 0,
    damageTakenCount:
      typeof raw.damageTakenCount === 'number' && Number.isFinite(raw.damageTakenCount)
        ? Math.max(0, Math.floor(raw.damageTakenCount))
        : 0,
    elapsedSec:
      typeof raw.elapsedSec === 'number' && Number.isFinite(raw.elapsedSec)
        ? Math.max(0, raw.elapsedSec)
        : 0,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? Math.max(0, Math.floor(raw.updatedAt))
        : 0,
  };
}

function normalizeWorldProgress(
  raw: Partial<WorldProgress> | null | undefined,
  worldId = 'world1'
): WorldProgress {
  const base = createEmptyWorldProgress();
  if (!raw || typeof raw !== 'object') return base;

  const collectedStarIds = normalizeStarIds(raw.collectedStarIds);
  const stamps = Array.isArray(raw.stamps)
    ? Array.from(new Set(raw.stamps.filter((id): id is StampId => VALID_STAMPS.has(id))))
    : [];
  const highScore =
    typeof raw.highScore === 'number' && Number.isFinite(raw.highScore)
      ? Math.max(0, Math.floor(raw.highScore))
      : 0;
  const bestRank =
    raw.bestRank === 'S' || raw.bestRank === 'A' || raw.bestRank === 'B' ? raw.bestRank : null;

  const cleared = Boolean(raw.cleared);
  let run = normalizeRunState(raw.run, worldId);
  if (cleared && run.active && run.bossDefeated) {
    run = createEmptyRunState();
  }

  return {
    cleared,
    collectedStarIds,
    stamps,
    highScore,
    bestRank,
    run,
  };
}

function normalizeSave(raw: Partial<SaveData> | null | undefined): SaveData {
  const base = createEmptySave();
  if (!raw || typeof raw !== 'object') return base;

  const unlocked = Array.isArray(raw.unlockedWorlds)
    ? Array.from(new Set(raw.unlockedWorlds.filter((n): n is number => typeof n === 'number')))
    : [1, 2];
  if (!unlocked.includes(1)) unlocked.unshift(1);
  if (!unlocked.includes(2)) unlocked.push(2);

  const worlds: Record<string, WorldProgress> = {};
  if (raw.worlds && typeof raw.worlds === 'object') {
    for (const [k, v] of Object.entries(raw.worlds)) {
      if (typeof k === 'string' && k.trim().length > 0) {
        worlds[k] = normalizeWorldProgress(v, k);
      }
    }
  }
  if (!worlds.world1) {
    worlds.world1 = createEmptyWorldProgress();
  }
  if (!worlds.world2) {
    worlds.world2 = createEmptyWorldProgress();
  }

  const lastPlayedWorldId =
    typeof raw.lastPlayedWorldId === 'string' && worlds[raw.lastPlayedWorldId]
      ? raw.lastPlayedWorldId
      : 'world1';
  const anyCleared = Object.values(worlds).some((w) => w.cleared);

  return {
    version: 2,
    tutorialCompleted: Boolean(raw.tutorialCompleted) || anyCleared,
    lastPlayedWorldId,
    unlockedWorlds: unlocked,
    worlds,
  };
}

interface LegacySaveV1 {
  version?: number;
  unlockedWorlds?: number[];
  world1?: {
    cleared?: boolean;
    collectedStarIds?: number[];
    stamps?: StampId[];
    highScore?: number;
    bestRank?: 'S' | 'A' | 'B' | null;
  };
}

function migrateFromV1(rawV1: LegacySaveV1 | null | undefined): SaveData {
  const base = createEmptySave();
  if (!rawV1 || typeof rawV1 !== 'object') return base;

  const unlocked = Array.isArray(rawV1.unlockedWorlds)
    ? Array.from(new Set(rawV1.unlockedWorlds.filter((n): n is number => typeof n === 'number')))
    : [1, 2];
  if (!unlocked.includes(1)) unlocked.unshift(1);
  if (!unlocked.includes(2)) unlocked.push(2);

  const legacyW1 = rawV1.world1;
  const w1 = normalizeWorldProgress(
    {
      cleared: Boolean(legacyW1?.cleared),
      collectedStarIds: legacyW1?.collectedStarIds,
      stamps: legacyW1?.stamps,
      highScore: legacyW1?.highScore,
      bestRank: legacyW1?.bestRank,
      run: createEmptyRunState(),
    },
    'world1'
  );

  const hasAnyProgress =
    w1.cleared || w1.collectedStarIds.length > 0 || w1.highScore > 0 || w1.stamps.length > 0;

  if (!w1.cleared && w1.collectedStarIds.length > 0) {
    w1.run = {
      ...createEmptyRunState(),
      active: true,
      collectedStarIds: [...w1.collectedStarIds],
      star3Unlocked: w1.collectedStarIds.includes(3),
      rainbowBridgeOpen: [1, 2, 3].every((id) => w1.collectedStarIds.includes(id)),
      updatedAt: Date.now(),
    };
  }

  return {
    version: 2,
    tutorialCompleted: hasAnyProgress,
    lastPlayedWorldId: 'world1',
    unlockedWorlds: unlocked,
    worlds: {
      world1: w1,
      world2: createEmptyWorldProgress(),
    },
  };
}

function cloneWorldProgress(w: WorldProgress): WorldProgress {
  return {
    cleared: w.cleared,
    collectedStarIds: [...w.collectedStarIds],
    stamps: [...w.stamps],
    highScore: w.highScore,
    bestRank: w.bestRank,
    run: {
      active: w.run.active,
      checkpoint: w.run.checkpoint ? { ...w.run.checkpoint } : null,
      activatedCheckpointIndices: [...w.run.activatedCheckpointIndices],
      collectedStarIds: [...w.run.collectedStarIds],
      star3Unlocked: w.run.star3Unlocked,
      rainbowBridgeOpen: w.run.rainbowBridgeOpen,
      bossDefeated: w.run.bossDefeated,
      coins: w.run.coins,
      score: w.run.score,
      hp: w.run.hp,
      feverMeter: w.run.feverMeter,
      damageTakenCount: w.run.damageTakenCount,
      elapsedSec: w.run.elapsedSec,
      updatedAt: w.run.updatedAt,
    },
  };
}

export class SaveStore {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const rawV2 = window.localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const normalized = normalizeSave(JSON.parse(rawV2) as Partial<SaveData>);
        if (JSON.stringify(normalized) !== rawV2) {
          this.data = normalized;
          this.save();
        }
        return normalized;
      }
      const rawV1 = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (rawV1) {
        const migrated = migrateFromV1(JSON.parse(rawV1) as LegacySaveV1);
        this.data = migrated;
        this.save();
        return migrated;
      }
      return createEmptySave();
    } catch {
      return createEmptySave();
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota/private-mode errors
    }
  }

  private ensureWorld(worldId = 'world1'): WorldProgress {
    if (!this.data.worlds[worldId]) {
      this.data.worlds[worldId] = createEmptyWorldProgress();
    }
    return this.data.worlds[worldId];
  }

  private syncStarStamps(w: WorldProgress): void {
    if ([1, 2, 3].every((id) => w.collectedStarIds.includes(id))) {
      if (!w.stamps.includes('all_main_stars')) {
        w.stamps.push('all_main_stars');
      }
    }
    if ([4, 5, 6].every((id) => w.collectedStarIds.includes(id))) {
      if (!w.stamps.includes('all_secret_stars')) {
        w.stamps.push('all_secret_stars');
      }
    }
  }

  private cloneData(): SaveData {
    const worlds: Record<string, WorldProgress> = {};
    for (const [k, v] of Object.entries(this.data.worlds)) {
      worlds[k] = cloneWorldProgress(v);
    }
    return {
      version: 2,
      tutorialCompleted: this.data.tutorialCompleted,
      lastPlayedWorldId: this.data.lastPlayedWorldId,
      unlockedWorlds: [...this.data.unlockedWorlds],
      worlds,
    };
  }

  get(): SaveData {
    return this.cloneData();
  }

  getWorldProgress(worldId = 'world1'): WorldProgress {
    return cloneWorldProgress(this.ensureWorld(worldId));
  }

  hasSaveProgress(): boolean {
    if (this.data.tutorialCompleted) return true;
    for (const w of Object.values(this.data.worlds)) {
      if (w.cleared || w.run.active || w.collectedStarIds.length > 0 || w.highScore > 0 || w.stamps.length > 0) {
        return true;
      }
    }
    return false;
  }

  hasResumableRun(worldId = 'world1'): boolean {
    return Boolean(this.data.worlds[worldId]?.run.active);
  }

  markTutorialCompleted(): SaveData {
    if (!this.data.tutorialCompleted) {
      this.data.tutorialCompleted = true;
      this.save();
    }
    return this.cloneData();
  }

  setLastPlayedWorld(worldId: WorldId): SaveData {
    this.ensureWorld(worldId);
    if (this.data.lastPlayedWorldId !== worldId) {
      this.data.lastPlayedWorldId = worldId;
      this.save();
    }
    return this.cloneData();
  }

  saveRunState(worldId: string, run: Partial<WorldRunState>): SaveData {
    const w = this.ensureWorld(worldId);
    this.data.lastPlayedWorldId = worldId;
    const merged = normalizeRunState(
      {
        ...w.run,
        ...run,
        active: true,
        updatedAt: Date.now(),
      },
      worldId
    );
    w.run = merged;

    let changedCumulative = false;
    for (const id of merged.collectedStarIds) {
      if (id >= 1 && id <= 6 && !w.collectedStarIds.includes(id)) {
        w.collectedStarIds.push(id);
        changedCumulative = true;
      }
    }
    if (changedCumulative) {
      w.collectedStarIds.sort((a, b) => a - b);
      this.syncStarStamps(w);
    }

    this.save();
    return this.cloneData();
  }

  clearRun(worldId = 'world1'): SaveData {
    const w = this.ensureWorld(worldId);
    w.run = createEmptyRunState();
    this.save();
    return this.cloneData();
  }

  recordStar(starId: number, worldId = 'world1'): SaveData {
    const w = this.ensureWorld(worldId);
    if (starId >= 1 && starId <= 6 && !w.collectedStarIds.includes(starId)) {
      w.collectedStarIds.push(starId);
      w.collectedStarIds.sort((a, b) => a - b);
      this.syncStarStamps(w);
      this.save();
    }
    return this.cloneData();
  }

  recordClear(
    params: {
      collectedStarIds: number[];
      score: number;
      coins: number;
      bossDamageTaken: number;
      rank: 'S' | 'A' | 'B';
    },
    worldId = 'world1'
  ): {
    newlyEarnedStamps: StampId[];
    runStamps: StampId[];
    isNewHighScore: boolean;
    saveData: SaveData;
  } {
    const w = this.ensureWorld(worldId);
    this.data.tutorialCompleted = true;
    this.data.lastPlayedWorldId = worldId;
    w.cleared = true;
    w.run = createEmptyRunState();

    for (const id of params.collectedStarIds) {
      if (id >= 1 && id <= 6 && !w.collectedStarIds.includes(id)) {
        w.collectedStarIds.push(id);
      }
    }
    w.collectedStarIds.sort((a, b) => a - b);

    const runStamps: StampId[] = ['clear_w1'];
    if ([1, 2, 3].every((id) => params.collectedStarIds.includes(id))) {
      runStamps.push('all_main_stars');
    }
    if ([4, 5, 6].every((id) => params.collectedStarIds.includes(id))) {
      runStamps.push('all_secret_stars');
    }
    if (params.coins >= 40) {
      runStamps.push('coin_collector');
    }
    if (params.bossDamageTaken === 0) {
      runStamps.push('no_damage_boss');
    }

    // Cumulative star collection stamps also apply if all stars have been recorded across runs
    const cumulativeStamps = new Set<StampId>(runStamps);
    if ([1, 2, 3].every((id) => w.collectedStarIds.includes(id))) {
      cumulativeStamps.add('all_main_stars');
    }
    if ([4, 5, 6].every((id) => w.collectedStarIds.includes(id))) {
      cumulativeStamps.add('all_secret_stars');
    }

    const newlyEarnedStamps: StampId[] = [];
    for (const st of cumulativeStamps) {
      if (!w.stamps.includes(st)) {
        w.stamps.push(st);
        newlyEarnedStamps.push(st);
      }
    }

    const cleanScore = Math.max(0, Math.floor(params.score));
    const isNewHighScore = cleanScore > w.highScore;
    if (isNewHighScore) {
      w.highScore = cleanScore;
    }

    if (!w.bestRank || RANK_ORDER[params.rank] > RANK_ORDER[w.bestRank]) {
      w.bestRank = params.rank;
    }

    this.save();
    return {
      newlyEarnedStamps,
      runStamps,
      isNewHighScore,
      saveData: this.cloneData(),
    };
  }

  reset(): SaveData {
    this.data = createEmptySave();
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    this.save();
    return this.cloneData();
  }
}

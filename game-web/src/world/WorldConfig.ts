import * as THREE from 'three';
import type { WorldId, WorldRunCheckpoint } from '../types';

export interface WorldConfig {
  id: WorldId;
  numericId: 1 | 2;
  name: string;
  subtitle: string;
  indoor: boolean;
  fallOutEnabled: boolean;
  safeFloorBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  spawnPos: [number, number, number];
  spawnYaw: number;
  safeGateCheckpoint: WorldRunCheckpoint;
  starGatePos: [number, number, number];
  rainbowBridge: {
    fromZ: number;
    fromY: number;
    toZ: number;
    toY: number;
    width: number;
  };
  bossArenaCenter: [number, number, number];
  bossSpawnPos: [number, number, number];
  bossArenaRadius: number;
  bossArenaMinY: number;
  bossArenaEntryMaxZ: number;
  victoryChestPos: [number, number, number];
  bowlingCenter: [number, number];
  tutorialStep5ZThreshold: number;
  maxBossMood: number;
  navMeta: Record<number, { shortLabel: string; label: string }>;
  titleCamera: {
    radius: number;
    yBase: number;
    yAmp: number;
    zOffset: number;
    lookAt: [number, number, number];
    fov: number;
    xCenter?: number;
    xAmp?: number;
    zAmp?: number;
  };
  welcomeCamera: {
    startPos: [number, number, number];
    startLook: [number, number, number];
    arcX: number;
  };
  tourCameras: {
    page0: (pPos: THREE.Vector3) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov: number };
    page1: (isPortrait: boolean) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov: number };
    page2: () => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov: number };
  };
  rainbowMovieCameras: {
    gateAct: (isPortrait: boolean, ease: number) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov: number };
    bridgeAct: (isPortrait: boolean, ease: number) => { pos: THREE.Vector3; lookAt: THREE.Vector3; fov: number };
    sparkleZs: number[];
  };
  isInBowlingHintZone: (pos: THREE.Vector3) => boolean;
  isAtLockedGate: (pos: THREE.Vector3) => boolean;
}

export const WORLD_CONFIGS: Record<WorldId, WorldConfig> = {
  world1: {
    id: 'world1',
    numericId: 1,
    name: 'World 1：陽だまりの巨大キッズルーム',
    subtitle: 'SUNLIT PLAYROOM',
    indoor: true,
    fallOutEnabled: false,
    safeFloorBounds: { minX: -33.2, maxX: 33.2, minZ: -63.0, maxZ: 33.2 },
    spawnPos: [0, 0.25, 27.0],
    spawnYaw: Math.PI,
    safeGateCheckpoint: { x: 0, y: 0.4, z: -14.8, yaw: Math.PI },
    starGatePos: [0, 0.0, -17.5],
    rainbowBridge: {
      fromZ: -18.0,
      fromY: 0.08,
      toZ: -26.2,
      toY: 2.24,
      width: 5.2,
    },
    bossArenaCenter: [0, 2.2, -43.5],
    bossSpawnPos: [0, 2.2, -45.5],
    bossArenaRadius: 17.5,
    bossArenaMinY: 1.4,
    bossArenaEntryMaxZ: -26.8,
    victoryChestPos: [0, 2.2, -43.5],
    bowlingCenter: [23.5, -11.5],
    tutorialStep5ZThreshold: 12.2,
    maxBossMood: 0.48,
    navMeta: {
      1: { shortLabel: '★1', label: '★1 つみき城' },
      2: { shortLabel: '★2', label: '★2 巨大ベッド' },
      3: { shortLabel: '★3', label: '★3 ボーリング' },
    },
    titleCamera: {
      radius: 25.0,
      yBase: 17.2,
      yAmp: 1.4,
      zOffset: 27.6,
      xCenter: -5.2,
      xAmp: 4.8,
      zAmp: 1.4,
      lookAt: [0.8, 4.2, -0.5],
      fov: 50,
    },
    welcomeCamera: {
      startPos: [16.5, 16.8, 28.5],
      startLook: [-1.5, 4.2, -1.5],
      arcX: -6.5,
    },
    tourCameras: {
      page0: (pPos) => ({
        pos: new THREE.Vector3(Math.max(-16, pPos.x - 10.0), 13.8, Math.min(24, pPos.z - 2)),
        lookAt: new THREE.Vector3(0, 6.8, -1.8),
        fov: 54,
      }),
      page1: (isPortrait) =>
        isPortrait
          ? {
              pos: new THREE.Vector3(0, 14.2, -3.5),
              lookAt: new THREE.Vector3(0, 6.0, -17.5),
              fov: 62,
            }
          : {
              pos: new THREE.Vector3(0, 11.8, -5.8),
              lookAt: new THREE.Vector3(0, 5.4, -17.5),
              fov: 56,
            },
      page2: () => ({
        pos: new THREE.Vector3(10.5, 14.5, -21.0),
        lookAt: new THREE.Vector3(0, 3.6, -43.5),
        fov: 54,
      }),
    },
    rainbowMovieCameras: {
      gateAct: (isPortrait, ease) =>
        isPortrait
          ? {
              pos: new THREE.Vector3(
                0,
                THREE.MathUtils.lerp(13.8, 14.2, ease),
                THREE.MathUtils.lerp(-5.0, -6.2, ease)
              ),
              lookAt: new THREE.Vector3(0, 7.2, -17.5),
              fov: 62,
            }
          : {
              pos: new THREE.Vector3(
                0,
                THREE.MathUtils.lerp(11.8, 12.4, ease),
                THREE.MathUtils.lerp(-6.5, -8.2, ease)
              ),
              lookAt: new THREE.Vector3(0, 7.2, -17.5),
              fov: 54,
            },
      bridgeAct: (isPortrait, ease) => {
        const startPos = isPortrait
          ? new THREE.Vector3(13.5, 14.2, -19.0)
          : new THREE.Vector3(12.2, 12.6, -19.5);
        const endPos = isPortrait
          ? new THREE.Vector3(16.0, 15.8, -26.0)
          : new THREE.Vector3(14.5, 13.8, -26.5);
        return {
          pos: new THREE.Vector3().lerpVectors(startPos, endPos, ease),
          lookAt: new THREE.Vector3().lerpVectors(
            new THREE.Vector3(0, 1.8, -22.5),
            new THREE.Vector3(0, 3.6, -38.5),
            ease
          ),
          fov: isPortrait ? THREE.MathUtils.lerp(58, 56, ease) : THREE.MathUtils.lerp(54, 52, ease),
        };
      },
      sparkleZs: [-19.2, -21.5, -23.8, -25.8],
    },
    isInBowlingHintZone: (pos) => pos.x > 11 && pos.z < -2,
    isAtLockedGate: (pos) =>
      Math.abs(pos.x) < 4.8 && pos.z < -15.4 && pos.z > -19.2 && pos.y < 5.5,
  },

  world2: {
    id: 'world2',
    numericId: 2,
    name: 'World 2：天空のおもちゃばこ',
    subtitle: 'SKY TOYBOX MEADOW',
    indoor: false,
    fallOutEnabled: true,
    safeFloorBounds: null,
    spawnPos: [0, 0.25, 46.0],
    spawnYaw: Math.PI,
    safeGateCheckpoint: { x: 0, y: 1.2, z: -11.0, yaw: Math.PI },
    starGatePos: [0, 1.2, -13.2],
    rainbowBridge: {
      fromZ: -13.8,
      fromY: 1.22,
      toZ: -34.2,
      toY: 4.02,
      width: 5.2,
    },
    bossArenaCenter: [0, 4.0, -52.0],
    bossSpawnPos: [0, 4.0, -54.0],
    bossArenaRadius: 17.5,
    bossArenaMinY: 3.2,
    bossArenaEntryMaxZ: -36.6,
    victoryChestPos: [0, 4.0, -52.0],
    bowlingCenter: [-21.0, -30.5],
    tutorialStep5ZThreshold: 24.5,
    maxBossMood: 1.0,
    navMeta: {
      1: { shortLabel: '★1', label: '★1 キャッスル' },
      2: { shortLabel: '★2', label: '★2 赤バネタワー' },
      3: { shortLabel: '★3', label: '★3 ボーリング' },
    },
    titleCamera: {
      radius: 58.0,
      yBase: 24.0,
      yAmp: 4.0,
      zOffset: 14.0,
      lookAt: [0, 6.5, 2],
      fov: 50,
    },
    welcomeCamera: {
      startPos: [18, 22, 64],
      startLook: [0, 4.5, -10],
      arcX: -9.5,
    },
    tourCameras: {
      page0: (pPos) => ({
        pos: new THREE.Vector3(pPos.x - 3.5, 15.2, Math.min(38, pPos.z - 6)),
        lookAt: new THREE.Vector3(0, 9.0, 0),
        fov: 52,
      }),
      page1: (isPortrait) =>
        isPortrait
          ? {
              pos: new THREE.Vector3(0, 19.0, 4.0),
              lookAt: new THREE.Vector3(0, 7.0, -17.0),
              fov: 62,
            }
          : {
              pos: new THREE.Vector3(0, 15.5, -1.5),
              lookAt: new THREE.Vector3(0, 5.5, -23.0),
              fov: 58,
            },
      page2: () => ({
        pos: new THREE.Vector3(8, 17.0, -24),
        lookAt: new THREE.Vector3(0, 4.8, -52),
        fov: 52,
      }),
    },
    rainbowMovieCameras: {
      gateAct: (isPortrait, ease) =>
        isPortrait
          ? {
              pos: new THREE.Vector3(
                0,
                THREE.MathUtils.lerp(16.5, 16.8, ease),
                THREE.MathUtils.lerp(-2.5, -3.5, ease)
              ),
              lookAt: new THREE.Vector3(0, 8.6, -13.2),
              fov: 62,
            }
          : {
              pos: new THREE.Vector3(
                0,
                THREE.MathUtils.lerp(13.8, 14.5, ease),
                THREE.MathUtils.lerp(-4.2, -5.8, ease)
              ),
              lookAt: new THREE.Vector3(0, 8.6, -13.2),
              fov: 54,
            },
      bridgeAct: (isPortrait, ease) => {
        const startPos = isPortrait
          ? new THREE.Vector3(16.5, 17.5, -18.0)
          : new THREE.Vector3(14.5, 14.8, -18.5);
        const endPos = isPortrait
          ? new THREE.Vector3(19.5, 19.5, -27.5)
          : new THREE.Vector3(17.5, 16.5, -28.5);
        return {
          pos: new THREE.Vector3().lerpVectors(startPos, endPos, ease),
          lookAt: new THREE.Vector3().lerpVectors(
            new THREE.Vector3(0, 3.0, -25.5),
            new THREE.Vector3(0, 4.6, -44.0),
            ease
          ),
          fov: isPortrait ? THREE.MathUtils.lerp(58, 56, ease) : THREE.MathUtils.lerp(54, 52, ease),
        };
      },
      sparkleZs: [-16, -22, -28, -33],
    },
    isInBowlingHintZone: (pos) => pos.x < -12 && pos.z < -20,
    isAtLockedGate: (pos) =>
      Math.abs(pos.x) < 4.5 && pos.z < -11.2 && pos.z > -15.0 && pos.y < 5.5,
  },
};

export function isValidWorldId(value: string | null | undefined): value is WorldId {
  return value === 'world1' || value === 'world2';
}

export function getWorldConfig(worldId: WorldId): WorldConfig {
  return WORLD_CONFIGS[worldId] ?? WORLD_CONFIGS.world1;
}

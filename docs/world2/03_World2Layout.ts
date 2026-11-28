/**
 * World2Layout.ts — World 2「スイーツ工場のふわふわ雲（SUGAR CLOUD BAKERY）」
 * Canonical 1:1 physics-verified layout data (compatible with SaveStore.ts catalog id=2).
 *
 * Verified against:
 *  - ManmarubuuController.ts: maxSpeed=10.6 (slide=18.5), jump1=12.6, jump2=11.4,
 *    gravUp=29.0, gravDown=34.0, cushion=14.0, OOB Y < -14.0
 *  - PhysicsWorld.ts: maxSlopeClimbAngle=52deg, maxDynamicCount=160, capsule H=1.0m R=0.28m
 *  - SaveStore.ts: starIds 1..6, checkpoint bounds |x|<=85, |z|<=85, -5<=y<=40
 *  - main.ts: slimeBounce=13.2, tankBounce=12.2, balloonBounce=15.0
 */

import type { CraftTerraceSpec } from './CraftTerrainBuilder';
import type { StarKind } from '../types';

export type Vec3Tuple = readonly [number, number, number];

export interface World2PlatformSpec {
  id: string;
  cx: number;
  topY: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  colorHex: number;
  useWoodGrain?: boolean;
}

export interface World2RampSpec {
  id: string;
  from: Vec3Tuple;
  to: Vec3Tuple;
  width: number;
  thickness: number;
}

export interface World2CushionSpec {
  id: string;
  cx: number;
  topY: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  rotY: number;
}

export interface World2SpringSpec {
  id: string;
  pos: Vec3Tuple;
  bounceVel: number;
  variant: 'red' | 'wood' | 'pastel';
}

export interface World2SlideSpec {
  id: string;
  name: string;
  colorHex: number;
  points: readonly Vec3Tuple[];
}

export interface World2StarSpec {
  id: number;
  kind: StarKind;
  label: string;
  areaName: string;
  pos: Vec3Tuple;
  unlocked: boolean;
  hiddenUntilReveal?: boolean;
}

/** Phase B expansion specs for Agy to implement custom World 2 mechanics */
export interface World2RotatingGearSpec {
  id: string;
  center: Vec3Tuple;
  radius: number;
  thickness: number;
  angularSpeedRad: number;
}

export interface World2ConveyorSpec {
  id: string;
  from: Vec3Tuple;
  to: Vec3Tuple;
  width: number;
  beltSpeed: number; // m/s along (to - from)
}

export const WORLD2_META = {
  worldId: 'world2',
  catalogId: 2,
  name: 'World 2：スイーツ工場のふわふわ雲',
  subtitle: 'SUGAR CLOUD BAKERY',
  themeColor: '#ff9ec4',
  spawnPos: [0, 1.2, 46] as Vec3Tuple,
  spawnYaw: Math.PI,
  bossArenaCenter: [0, 5.0, -54] as Vec3Tuple,
  bossArenaRadius: 18.5,
  bossName: 'PATISSERIE CLOCKWORK CHEF',
  starGatePos: [0, 1.5, -12.5] as Vec3Tuple,
  rainbowBridgeFrom: [0, 1.5, -12.5] as Vec3Tuple,
  rainbowBridgeTo: [0, 5.0, -35.5] as Vec3Tuple,
} as const;

export const WORLD2_TERRACES: readonly CraftTerraceSpec[] = [
  {
    id: 'w2_south_cloud_deck',
    x: 0,
    z: 38,
    baseY: 0.0,
    radiusX: 22.0,
    radiusZ: 16.0,
    wallHeight: 7.5,
    hillAmp: 0.55,
    hillFreq: 0.13,
    phase: 0.5,
    denimRim: true,
    flatZones: [
      { shape: 'rect', x: 0, z: 45.5, hw: 5.5, hd: 4.5, feather: 2.0, surface: 'sand' },
      { shape: 'rect', x: 0, z: 33.0, hw: 3.0, hd: 12.0, feather: 2.0, surface: 'sand' },
      { shape: 'rect', x: 0, z: 24.0, hw: 5.0, hd: 4.0, feather: 1.8, surface: 'sand' },
    ],
  },
  {
    id: 'w2_center_cake_hub',
    x: 0,
    z: 4,
    baseY: 1.5,
    radiusX: 18.0,
    radiusZ: 17.0,
    wallHeight: 8.5,
    hillAmp: 0.45,
    hillFreq: 0.15,
    phase: 1.4,
    denimRim: true,
    flatZones: [
      { shape: 'rect', x: 0, z: 4.0, hw: 9.5, hd: 13.5, feather: 2.0, surface: 'sand' },
      { shape: 'rect', x: 9.5, z: 6.0, hw: 6.5, hd: 3.5, feather: 1.8, surface: 'sand' },
      { shape: 'rect', x: -9.5, z: -3.0, hw: 6.5, hd: 3.5, feather: 1.8, surface: 'sand' },
    ],
  },
  {
    id: 'w2_east_marshmallow_bay',
    x: 30,
    z: 8,
    baseY: 1.0,
    radiusX: 14.5,
    radiusZ: 14.5,
    wallHeight: 8.0,
    hillAmp: 0.65,
    hillFreq: 0.14,
    phase: 2.1,
    denimRim: true,
    flatZones: [
      { shape: 'circle', x: 22.0, z: 16.0, r: 3.5, feather: 1.8, surface: 'sand' },
      { shape: 'rect', x: 23.0, z: 9.0, hw: 3.0, hd: 6.5, feather: 1.8, surface: 'sand' },
      { shape: 'rect', x: 30.0, z: 7.5, hw: 5.0, hd: 8.0, feather: 1.8, surface: 'grass' },
    ],
  },
  {
    id: 'w2_west_wafer_hill',
    x: -30,
    z: 12,
    baseY: 9.2,
    radiusX: 9.5,
    radiusZ: 9.0,
    wallHeight: 12.0,
    hillAmp: 0.4,
    hillFreq: 0.2,
    phase: 3.0,
    denimRim: true,
    flatZones: [
      { shape: 'rect', x: -29.5, z: 8.0, hw: 4.0, hd: 5.5, feather: 1.5, surface: 'sand' },
    ],
  },
  {
    id: 'w2_west_cookie_plaza',
    x: -24,
    z: -28,
    baseY: 1.0,
    radiusX: 14.0,
    radiusZ: 13.0,
    wallHeight: 7.0,
    hillAmp: 0.0,
    denimRim: false,
    defaultSurface: 'sand',
  },
];

export const WORLD2_PLATFORMS: readonly World2PlatformSpec[] = [
  // Center 3-tier Wedding Cake Tower (Star 1 at summit Y=11.5 -> star Y=13.05)
  { id: 'cake_tier1', cx: 0, topY: 4.5, cz: 4, w: 11.5, h: 3.0, d: 11.5, colorHex: 0xfff5e6 },
  { id: 'cake_tier2', cx: 0, topY: 8.0, cz: 4, w: 8.0, h: 3.5, d: 8.0, colorHex: 0xffb3cc },
  { id: 'cake_tier3_summit', cx: 0, topY: 11.5, cz: 4, w: 5.2, h: 3.5, d: 5.2, colorHex: 0xfff5e6 },
  // South-East Secret Biscuit Shelf (Star 4)
  { id: 'se_step_1', cx: 18.5, topY: 3.2, cz: 31.0, w: 4.2, h: 0.9, d: 4.2, colorHex: 0xf3c677, useWoodGrain: true },
  { id: 'se_step_2', cx: 23.0, topY: 6.4, cz: 27.5, w: 4.6, h: 0.9, d: 4.6, colorHex: 0xff9ec4 },
  // East Marshmallow Sky-Combo Tower (Star 2 at summit Y=24.0 -> star Y=25.55)
  { id: 'east_tower_base', cx: 30.0, topY: 6.2, cz: -3.5, w: 5.8, h: 5.2, d: 5.8, colorHex: 0xffd27d },
  { id: 'east_tower_mid1', cx: 30.0, topY: 12.0, cz: -10.5, w: 6.2, h: 1.2, d: 6.2, colorHex: 0xff9ec4 },
  { id: 'east_tower_mid2', cx: 25.5, topY: 18.0, cz: -17.0, w: 6.2, h: 1.2, d: 6.2, colorHex: 0x8ee0d8 },
  { id: 'east_tower_summit', cx: 21.0, topY: 24.0, cz: -23.5, w: 8.0, h: 1.4, d: 8.0, colorHex: 0xffe885 },
  // West Wafer Mid-Landing
  { id: 'west_climb_mid', cx: -27.5, topY: 4.8, cz: 22.0, w: 5.6, h: 0.9, d: 5.6, colorHex: 0xe8b878, useWoodGrain: true },
  // West Secret Shelf (Star 6)
  { id: 'west_secret_shelf', cx: -37.0, topY: 12.2, cz: 16.5, w: 4.2, h: 0.9, d: 4.2, colorHex: 0xa8e6cf },
  // North-East Cookie Gear Platforms (Star 5)
  { id: 'ne_cookie_gear_1', cx: 14.0, topY: 7.5, cz: -10.0, w: 4.8, h: 0.9, d: 4.8, colorHex: 0xd99b52, useWoodGrain: true },
  { id: 'ne_cookie_gear_2', cx: 12.0, topY: 11.2, cz: -18.0, w: 5.0, h: 0.9, d: 5.0, colorHex: 0xd99b52, useWoodGrain: true },
  // South Domino Stage
  { id: 'south_domino_stage', cx: 0.0, topY: 0.15, cz: 24.0, w: 8.0, h: 0.3, d: 6.6, colorHex: 0xe8b878, useWoodGrain: true },
];

export const WORLD2_RAMPS: readonly World2RampSpec[] = [
  { id: 'ramp_south_to_center', from: [0, 0.0, 22.0], to: [0, 1.5, 19.0], width: 5.2, thickness: 0.5 },
  { id: 'ramp_south_to_east', from: [14.5, 0.0, 27.5], to: [22.0, 1.0, 18.0], width: 4.4, thickness: 0.52 },
  { id: 'ramp_center_to_east', from: [14.5, 1.5, 6.0], to: [19.5, 1.0, 7.5], width: 4.0, thickness: 0.52 },
  { id: 'ramp_south_to_west_mid', from: [-16.0, 0.0, 29.0], to: [-25.5, 4.8, 23.0], width: 4.6, thickness: 0.55 },
  { id: 'ramp_west_mid_to_hill', from: [-27.5, 4.8, 20.5], to: [-29.5, 9.2, 12.2], width: 4.6, thickness: 0.55 },
  { id: 'ramp_center_to_plaza', from: [-14.0, 1.5, -5.0], to: [-19.0, 1.0, -17.5], width: 4.4, thickness: 0.5 },
  // Cake Hub Spiral Ramps (all verified <= 28 deg!)
  { id: 'cake_ramp_1', from: [8.2, 1.5, 8.5], to: [6.5, 4.5, 0.5], width: 3.4, thickness: 0.5 },
  { id: 'cake_ramp_2', from: [4.5, 4.5, -1.5], to: [-4.5, 8.0, -0.5], width: 3.2, thickness: 0.5 },
  { id: 'cake_ramp_3', from: [-4.5, 8.0, 0.5], to: [-2.2, 11.5, 6.8], width: 3.0, thickness: 0.5 },
];

export const WORLD2_CUSHIONS: readonly World2CushionSpec[] = [
  { id: 'm_cush_1', cx: 28.0, topY: 1.8, cz: 14.5, w: 3.8, h: 0.9, d: 3.8, rotY: 0.14 },
  { id: 'm_cush_2', cx: 31.0, topY: 3.0, cz: 10.5, w: 3.8, h: 0.9, d: 3.8, rotY: -0.16 },
  { id: 'm_cush_3', cx: 32.0, topY: 4.2, cz: 6.0, w: 3.8, h: 0.9, d: 3.8, rotY: 0.12 },
  { id: 'm_cush_4', cx: 30.0, topY: 5.4, cz: 1.5, w: 4.2, h: 0.95, d: 4.2, rotY: -0.1 },
  { id: 'boss_cush_e', cx: 12.5, topY: 5.7, cz: -54.0, w: 3.4, h: 0.7, d: 3.4, rotY: 0 },
  { id: 'boss_cush_w', cx: -12.5, topY: 5.7, cz: -54.0, w: 3.4, h: 0.7, d: 3.4, rotY: 0 },
];

export const WORLD2_SPRINGS: readonly World2SpringSpec[] = [
  { id: 'spring_east_1', pos: [30.0, 6.2, -3.5], bounceVel: 19.5, variant: 'wood' },
  { id: 'spring_east_2', pos: [30.0, 12.0, -10.5], bounceVel: 20.5, variant: 'wood' },
  { id: 'spring_east_3', pos: [25.5, 18.0, -17.0], bounceVel: 20.5, variant: 'red' },
  { id: 'spring_south_pastel', pos: [15.0, 0.0, 35.0], bounceVel: 15.0, variant: 'pastel' },
  { id: 'spring_west_secret', pos: [-33.5, 9.2, 15.0], bounceVel: 15.5, variant: 'pastel' },
];

export const WORLD2_BALLOONS: readonly Vec3Tuple[] = [
  [22.0, 8.5, -6.0],
  [18.0, 11.0, -12.5],
  [17.0, 15.5, -19.5],
  [-25.0, 11.5, 2.0],
];

export const WORLD2_SLIDES: readonly World2SlideSpec[] = [
  {
    id: 'candy_slide_west',
    name: 'ストロベリー・キャンディスライダー',
    colorHex: 0xff8ec4,
    points: [
      [-29.5, 9.25, 4.0],
      [-29.0, 8.50, 1.0],
      [-27.5, 6.20, -5.0],
      [-25.5, 3.40, -11.5],
      [-24.2, 1.45, -17.5],
      [-24.0, 1.06, -21.0],
    ],
  },
  {
    id: 'caramel_return_slide',
    name: 'キャラメル高速帰還スライダー',
    colorHex: 0xf0a650,
    points: [
      [17.5, 24.0, -21.0],
      [14.0, 19.5, -15.0],
      [10.5, 13.5, -8.5],
      [8.5, 7.5, -1.5],
      [9.0, 3.2, 5.5],
      [9.5, 1.6, 10.0],
    ],
  },
];

export const WORLD2_STARS: readonly World2StarSpec[] = [
  { id: 1, kind: 'main', label: 'ウェディングケーキのてっぺん', areaName: '中央ケーキ工場ハブ', pos: [0, 13.05, 4], unlocked: true },
  { id: 2, kind: 'main', label: 'マシュマロそらの大跳躍', areaName: '東のマシュマロタワー', pos: [21, 25.55, -23.5], unlocked: true },
  { id: 3, kind: 'main', label: 'クッキー・ボーリング職人', areaName: '北西クッキー広場', pos: [-24, 2.55, -36.5], unlocked: false },
  { id: 4, kind: 'secret', label: '南東のビスケット秘密棚', areaName: '南東のふわふわ雲', pos: [23, 7.95, 27.5], unlocked: true },
  { id: 5, kind: 'secret', label: '北東クッキー歯車の隠し宝', areaName: '北東の空中歯車', pos: [12, 12.75, -18.0], unlocked: true },
  { id: 6, kind: 'secret', label: 'ウエハース丘の裏みはらし', areaName: '西のひみつ高台', pos: [-37, 13.75, 16.5], unlocked: true },
];

export const WORLD2_CHECKPOINTS: readonly Vec3Tuple[] = [
  [-4.5, 1.5, 15.0],
  [20.5, 1.0, 16.0],
  [-27.5, 4.8, 22.0],
  [-4.0, 1.5, -11.0],
];

export const WORLD2_HEARTS: readonly { pos: Vec3Tuple; respawnable?: boolean }[] = [
  { pos: [4.5, 2.3, 15.0] },
  { pos: [24.0, 1.9, 14.5] },
  { pos: [-19.5, 1.9, -20.0] },
  { pos: [3.8, 2.3, -11.0] },
  { pos: [0, 5.9, -41.5], respawnable: true },
];

export const WORLD2_SLIMES: readonly { pos: Vec3Tuple; variant: 'mint' | 'pink' }[] = [
  { pos: [0, 0.0, 34.0], variant: 'pink' },
  { pos: [-9.0, 0.0, 32.0], variant: 'mint' },
  { pos: [9.0, 0.0, 32.0], variant: 'pink' },
  { pos: [6.5, 4.5, 0.5], variant: 'mint' },
  { pos: [24.5, 1.0, 9.0], variant: 'pink' },
];

export const WORLD2_TANKS: readonly { pos: Vec3Tuple; isGuard: boolean }[] = [
  { pos: [0, 1.5, 11.5], isGuard: false },
  { pos: [-30.0, 1.0, -28.0], isGuard: true },
  { pos: [-18.0, 1.0, -28.0], isGuard: true },
  { pos: [-24.0, 1.0, -33.5], isGuard: true },
];

/** Phase B custom gimmick blueprints (for kinematic physics extension) */
export const WORLD2_PHASE_B_GEARS: readonly World2RotatingGearSpec[] = [
  { id: 'gear_ne_1', center: [14.0, 7.5, -10.0], radius: 2.8, thickness: 0.7, angularSpeedRad: 0.55 },
  { id: 'gear_ne_2', center: [12.0, 11.2, -18.0], radius: 3.0, thickness: 0.7, angularSpeedRad: -0.65 },
];

export const WORLD2_PHASE_B_CONVEYORS: readonly World2ConveyorSpec[] = [
  { id: 'conveyor_south_entry', from: [0, 0.05, 39.0], to: [0, 0.05, 29.0], width: 3.4, beltSpeed: 3.8 },
];

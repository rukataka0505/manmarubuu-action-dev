import * as THREE from 'three';
import { getProceduralTextures } from '../assets/ProceduralTextures';
import type { PbrAssets } from '../assets/PbrAssets';
import type { ResolvedQuality } from '../types';
import type { PhysicsWorld } from '../core/PhysicsWorld';
import type { ToyBlocksManager } from './ToyBlocksManager';
import type { CollectiblesManager } from './Collectibles';
import type { GimmicksManager } from './Gimmicks';
import type { WorldPropsManager } from './WorldPropsManager';
import type { CraftTerrainBuilder } from './CraftTerrainBuilder';
import type { StylizedGrassField } from './StylizedGrassField';
import type { JellySlime } from '../entities/JellySlime';
import type { WindupTank } from '../entities/WindupTank';
import type { PropellerBalloon } from '../entities/PropellerBalloon';
import type { CushionVisualSpec, WorldBuildResult } from './World1Builder';
import {
  WORLD2_BALLOONS,
  WORLD2_CHECKPOINTS,
  WORLD2_CUSHIONS,
  WORLD2_HEARTS,
  WORLD2_META,
  WORLD2_PLATFORMS,
  WORLD2_RAMPS,
  WORLD2_SLIDES,
  WORLD2_SLIMES,
  WORLD2_SPRINGS,
  WORLD2_STARS,
  WORLD2_TANKS,
  WORLD2_TERRACES,
  type World2SlideSpec,
} from './World2Layout';

/**
 * World2Builder — World 2「スイーツ工場のふわふわ雲（SUGAR CLOUD BAKERY）」
 * Implements the exact same build() contract as World1Builder so main.ts can swap
 * between World1Builder and World2Builder cleanly using 100% existing engine APIs.
 */
export class World2Builder {
  private textures = getProceduralTextures();
  private group = new THREE.Group();
  private pbr?: PbrAssets;
  private terrain?: CraftTerrainBuilder;
  public readonly cushionSpecs: CushionVisualSpec[] = [];
  private quality: ResolvedQuality = 'medium';

  constructor(scene: THREE.Scene, pbr?: PbrAssets) {
    scene.add(this.group);
    this.pbr = pbr;
  }

  private addRamp(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    from: THREE.Vector3,
    to: THREE.Vector3,
    width: number,
    thickness: number
  ): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y -= thickness * 0.5;

    const yaw = Math.atan2(dir.x, dir.z);
    const horiz = Math.hypot(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, horiz);
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');

    worldProps.queueRaw('woodRailBridge', {
      x: mid.x,
      y: mid.y,
      z: mid.z,
      rx: euler.x,
      ry: euler.y,
      rz: euler.z,
      sx: width / 4.0,
      sy: thickness / 0.52,
      sz: len / 6.0,
    });

    if (this.terrain) {
      const cutR = Math.max(2.6, width * 0.85);
      const minY = Math.min(from.y, to.y) - 0.8;
      const maxY = Math.max(from.y, to.y) + 0.8;
      const samplePt = new THREE.Vector3();
      for (const rt of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        samplePt.lerpVectors(from, to, rt);
        this.terrain.addRimCutout(samplePt.x, samplePt.z, cutR, minY, maxY);
      }
    }

    physics.addStaticBox(mid.x, mid.y, mid.z, width * 0.5, thickness * 0.5, len * 0.5, {
      rotEuler: euler,
      friction: 0.65,
    });
  }

  private addBlockPlatform(
    physics: PhysicsWorld,
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    colorHex: number,
    useWoodGrain = false
  ): void {
    const oak = useWoodGrain ? this.pbr?.cloneMaps('oakVeneer', Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(d / 3))) : undefined;
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      map: oak?.diff ?? null,
      normalMap: oak?.nor ?? null,
      roughnessMap: oak?.rough ?? null,
      roughness: 0.48,
      envMapIntensity: 0.55,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, topY - h * 0.5, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    physics.addStaticBox(cx, topY - h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5);
  }

  private addCushion(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    rotY = 0,
    onBounceExternal?: () => void
  ): void {
    const model = worldProps.createModelInstance('cushion');
    const spec: CushionVisualSpec = {
      cx,
      topY,
      cz,
      w,
      h,
      d,
      model: model ?? undefined,
      squashPos: 0,
      squashVel: 0,
      baseScaleY: 1,
      basePosY: topY - h,
    };

    if (model) {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      if (sz.x > 0.001 && sz.y > 0.001 && sz.z > 0.001) {
        const sx = (w * 1.06) / sz.x;
        const sy = (h * 1.15) / sz.y;
        const szScale = (d * 1.06) / sz.z;
        model.scale.set(sx, sy, szScale);
        model.rotation.y = rotY;
        model.updateMatrixWorld(true);

        const newBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        newBox.getCenter(center);
        model.position.set(cx - center.x, topY - newBox.max.y, cz - center.z);
        spec.baseScaleY = sy;
        spec.basePosY = model.position.y;
        this.group.add(model);
      }
    }

    this.cushionSpecs.push(spec);

    physics.addStaticBox(cx, topY - h * 0.5, cz, w * 0.5, h * 0.5, d * 0.5, {
      cushionTopY: topY,
      onCushion: () => {
        spec.squashVel = -8.5;
        onBounceExternal?.();
      },
      friction: 0.8,
    });
  }

  private buildCurvedSlide(physics: PhysicsWorld, spec: World2SlideSpec): void {
    const points = spec.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const segs = 72;
    const section: Array<[number, number]> = [
      [-1.55, 0.72],
      [-1.32, 0.36],
      [-0.86, 0.08],
      [0.0, 0.0],
      [0.86, 0.08],
      [1.32, 0.36],
      [1.55, 0.72],
    ];
    const crossCount = section.length;
    const positions: number[] = [];
    const indices: number[] = [];
    const worldUp = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const tang = curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tang, worldUp).normalize();
      for (let k = 0; k < crossCount; k++) {
        const [rx, ry] = section[k];
        const vtx = p.clone().addScaledVector(right, rx);
        vtx.y += ry;
        positions.push(vtx.x, vtx.y, vtx.z);
      }
      if (i < segs) {
        const b = i * crossCount;
        const n = (i + 1) * crossCount;
        for (let q = 0; q < crossCount - 1; q++) {
          indices.push(b + q, b + q + 1, n + q);
          indices.push(b + q + 1, n + q + 1, n + q);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhysicalMaterial({
      color: spec.colorHex,
      map: this.textures.pastelSlidePink,
      roughness: 0.14,
      clearcoat: 0.92,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    physics.addStaticTrimesh(geo, new THREE.Vector3(0, 0, 0), undefined, {
      isSlide: true,
      friction: 0.05,
    });
  }

  private buildBossArena(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    gimmicks: GimmicksManager,
    clockworkGears: THREE.Object3D[]
  ): void {
    const [cx, cy, cz] = WORLD2_META.bossArenaCenter;
    const r = WORLD2_META.bossArenaRadius;

    worldProps.addRawStaticModel('bossArenaDeck', new THREE.Vector3(cx, cy, cz), 0, 1, true);
    worldProps.addRawStaticModel('bossArenaGlass', new THREE.Vector3(cx, cy - 0.01, cz), 0, 1, false);
    physics.addStaticCylinder(cx, cy - 4.0, cz, 4.0, r, { friction: 0.65 });

    const gearSpecs: Array<{ key: 'bossGearLarge' | 'bossGearMedium'; dx: number; dz: number; spd: number }> = [
      { key: 'bossGearLarge', dx: 0, dz: 0, spd: 0.42 },
      { key: 'bossGearMedium', dx: -3.6, dz: -2.4, spd: -0.68 },
      { key: 'bossGearMedium', dx: 3.6, dz: 2.4, spd: -0.68 },
    ];
    for (const g of gearSpecs) {
      const m = worldProps.addRawStaticModel(g.key, new THREE.Vector3(cx + g.dx, cy - 0.55, cz + g.dz), 0, 1, true);
      if (m) {
        m.userData.spinSpeed = g.spd;
        clockworkGears.push(m);
      }
    }

    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      if (i !== 12) {
        worldProps.queueRaw('bossBalusterSection', { x: cx, y: cy, z: cz, ry: theta });
        const px = cx + Math.cos(theta) * (r - 0.75);
        const pz = cz - Math.sin(theta) * (r - 0.75);
        physics.addStaticBox(px, cy + 0.85, pz, 0.35, 0.9, 3.6, { rotEuler: new THREE.Euler(0, theta, 0) });
      }
      const lockCol = physics.addStaticBox(
        cx + Math.cos(theta) * (r - 0.5),
        cy + 15.0,
        cz - Math.sin(theta) * (r - 0.5),
        0.4,
        15.5,
        3.7,
        { rotEuler: new THREE.Euler(0, theta, 0), friction: 0.0, ignoreRays: true }
      );
      gimmicks.registerBossLockCollider(lockCol);
    }
  }

  build(
    physics: PhysicsWorld,
    blocks: ToyBlocksManager,
    collectibles: CollectiblesManager,
    gimmicks: GimmicksManager,
    terrain: CraftTerrainBuilder,
    grassField: StylizedGrassField,
    worldProps: WorldPropsManager,
    slimesFactory: (pos: THREE.Vector3, variant: 'mint' | 'pink', isTut?: boolean) => JellySlime,
    tanksFactory: (pos: THREE.Vector3, isGuard?: boolean) => WindupTank,
    balloonsFactory: (pos: THREE.Vector3) => PropellerBalloon,
    onCushionBounce: () => void
  ): WorldBuildResult {
    this.terrain = terrain;
    const slimes: JellySlime[] = [];
    const tanks: WindupTank[] = [];
    const balloons: PropellerBalloon[] = [];
    const clockworkGears: THREE.Object3D[] = [];

    blocks.setVisuals({
      createBlockMesh: (mat) => worldProps.createRawModelInstance('alphabetBlockBevel', mat),
      createCrateMesh: (mat) => worldProps.createRawModelInstance('woodCrateBevel', mat),
      createDominoMesh: () => worldProps.createRawModelInstance('woodDominoBevel'),
      createBowlingPinMesh: () => worldProps.createRawModelInstance('bowlingPinSmooth'),
      getDominoParts: () => worldProps.getTemplateParts('woodDominoBevel'),
      getBowlingPinParts: () => worldProps.getTemplateParts('bowlingPinSmooth'),
    });
    gimmicks.setCustomFactories({
      createTrampolineRed: () => worldProps.createModelInstance('trampolineRedCoil'),
      createTrampolineWood: () => worldProps.createModelInstance('trampolineWoodCoil'),
      createTrampolinePastel: () => worldProps.createModelInstance('trampolineMiniPastel'),
      createStarGate: () => worldProps.createModelInstance('starGateClockwork'),
      createCheckpointFlag: () => worldProps.createModelInstance('checkpointFlagFelt'),
    });

    // 1. Terraces
    for (const spec of WORLD2_TERRACES) {
      terrain.addCraftTerrace(physics, spec);
    }

    // 2. Platforms
    for (const p of WORLD2_PLATFORMS) {
      this.addBlockPlatform(physics, p.cx, p.topY, p.cz, p.w, p.h, p.d, p.colorHex, p.useWoodGrain);
    }

    // 3. Ramps (all verified <= 28.1 deg)
    for (const r of WORLD2_RAMPS) {
      this.addRamp(
        physics,
        worldProps,
        new THREE.Vector3(...r.from),
        new THREE.Vector3(...r.to),
        r.width,
        r.thickness
      );
    }

    // 4. Cushions & Springs
    for (const c of WORLD2_CUSHIONS) {
      this.addCushion(physics, worldProps, c.cx, c.topY, c.cz, c.w, c.h, c.d, c.rotY, onCushionBounce);
    }
    for (const sp of WORLD2_SPRINGS) {
      gimmicks.addRedSpring(physics, new THREE.Vector3(...sp.pos), sp.bounceVel, sp.variant);
    }

    // 5. Dual Curved Slides (West Strawberry Candy Slide + East Caramel Return Slide)
    for (const slide of WORLD2_SLIDES) {
      this.buildCurvedSlide(physics, slide);
    }

    // 6. Dynamic Toy Props (Total = 87 bodies, safely within PhysicsWorld.maxDynamicCount = 160)
    // South entry domino cascade (12)
    for (let i = 0; i < 12; i++) {
      blocks.spawnDomino(physics, new THREE.Vector3(-3.3 + i * 0.6, 1.1, 24.0), Math.PI / 2, i);
    }
    // East factory 24-piece S-curve wafer domino line
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const dx = 22.8 + Math.sin(t * Math.PI * 1.8) * 1.1;
      const dz = 15.0 - t * 13.5;
      const ry = Math.atan2(Math.cos(t * Math.PI * 1.8) * 0.25, -0.58);
      blocks.spawnDomino(physics, new THREE.Vector3(dx, 1.95, dz), ry, i, 'east');
    }
    // West bowling plaza 15 pins + 8 bonus dominos
    const pinStartZ = -24.0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const px = -24 + (col - row * 0.5) * 1.05;
        const pz = pinStartZ - row * 1.02;
        blocks.spawnBowlingPin(physics, new THREE.Vector3(px, 1.82, pz));
      }
    }
    for (let i = 0; i < 8; i++) {
      blocks.spawnDomino(physics, new THREE.Vector3(-30.0 + i * 0.62, 1.95, -25.0), Math.PI / 2, i);
    }
    // Crates & Alphabet Blocks (total 28)
    const secretCrate = blocks.spawnCrate(physics, new THREE.Vector3(12.0, 11.85, -18.0), true);
    for (let i = 0; i < 6; i++) {
      blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-3.0 + i * 1.2, 2.1, 13.5), i);
    }

    // 7. Stars, Coins, Hearts, Checkpoints
    for (const st of WORLD2_STARS) {
      collectibles.addPowerStar(st.id, st.label, st.areaName, new THREE.Vector3(...st.pos), st.unlocked, st.kind, st.hiddenUntilReveal);
    }
    collectibles.addLineCoins(new THREE.Vector3(0, 1.2, 43.0), new THREE.Vector3(0, 1.2, 35.0), 5);
    collectibles.addLineCoins(new THREE.Vector3(8.0, 2.6, 8.0), new THREE.Vector3(6.5, 5.2, 1.0), 4);
    collectibles.addLineCoins(new THREE.Vector3(30.0, 9.2, -6.5), new THREE.Vector3(30.0, 12.8, -9.5), 3);
    collectibles.addLineCoins(new THREE.Vector3(-29.2, 9.9, 9.5), new THREE.Vector3(-29.2, 9.9, 4.5), 4);

    for (const h of WORLD2_HEARTS) {
      collectibles.addHeart(new THREE.Vector3(...h.pos), h.respawnable);
    }
    for (const cp of WORLD2_CHECKPOINTS) {
      gimmicks.addCheckpoint(new THREE.Vector3(...cp));
    }

    // 8. Enemies
    for (const s of WORLD2_SLIMES) {
      slimes.push(slimesFactory(new THREE.Vector3(...s.pos), s.variant));
    }
    for (const tk of WORLD2_TANKS) {
      tanks.push(tanksFactory(new THREE.Vector3(...tk.pos), tk.isGuard));
    }
    for (const b of WORLD2_BALLOONS) {
      balloons.push(balloonsFactory(new THREE.Vector3(...b)));
    }

    // 9. Star Gate, Boss Arena & Finalization
    gimmicks.buildStarGateAndRainbowBridge(physics);
    this.buildBossArena(physics, worldProps, gimmicks, clockworkGears);
    gimmicks.initBossPopupSpring(22.2);
    terrain.addDistantHorizonHills();
    terrain.finalizeTerraceRims();
    terrain.flushStitches();

    const isGrassExcluded = (x: number, z: number): boolean => Math.abs(x) < 4.5 && z > 20 && z < 48;
    grassField.scatterDisk(terrain, 0, 38, 21.0, 15.0, 4800, 2101, isGrassExcluded);
    grassField.scatterDisk(terrain, 30, 8, 13.5, 13.5, 3200, 2202, isGrassExcluded);
    grassField.finalize();
    blocks.finalizeDynamicInstances();
    gimmicks.buildVictoryChest();
    this.setQuality(this.quality);

    return {
      slimes,
      tanks,
      balloons,
      clockworkGears,
      secretCrateId: secretCrate.id,
      tutorialCoinPos: new THREE.Vector3(0, 0.2, 43.0),
      tutorialCratePos: new THREE.Vector3(0, 0.5, 30.0),
    };
  }

  setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
  }

  updateDistanceCulling(resolved: ResolvedQuality, camPos: THREE.Vector3): void {
    if (resolved !== 'low') return;
    for (const c of this.cushionSpecs) {
      if (!c.model) continue;
      c.model.visible = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) <= 56;
    }
  }

  update(dt: number): void {
    for (const c of this.cushionSpecs) {
      if (!c.model) continue;
      if (Math.abs(c.squashPos) > 0.0005 || Math.abs(c.squashVel) > 0.0005) {
        const accel = -140 * c.squashPos - 11 * c.squashVel;
        c.squashVel += accel * dt;
        c.squashPos += c.squashVel * dt;
        c.squashPos = THREE.MathUtils.clamp(c.squashPos, -0.42, 0.25);
        const factorY = THREE.MathUtils.clamp(1 + c.squashPos, 0.56, 1.25);
        c.model.scale.y = c.baseScaleY * factorY;
        c.model.position.y = c.basePosY;
      }
    }
  }
}

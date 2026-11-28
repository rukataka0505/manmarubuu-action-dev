import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PbrAssets } from '../assets/PbrAssets';
import { DioramaMaterialBinder } from '../assets/DioramaMaterialBinder';
import { mergeIndexedOrNonIndexed, optimizeStaticHierarchy } from '../assets/GeometryMerge';
import { resolveAssetUrl, runWithConcurrency, withTimeout } from '../assets/AssetLoaderUtils';
import type { ResolvedQuality } from '../types';
import { isMobileDefaultDevice } from '../core/SettingsStore';
import type { CraftTerrainBuilder } from './CraftTerrainBuilder';

export interface MeshPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
  worldMatrix: THREE.Matrix4;
}

interface PropTemplate {
  parts: MeshPart[];
  mergedParts: MeshPart[];
  baseOffsetY: number;
  size: THREE.Vector3;
  root: THREE.Group;
}

export interface PropTransform {
  x: number;
  y: number;
  z: number;
  ry?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  rz?: number;
  color?: number;
}

export type PropKey =
  // Custom DIY Diorama Architecture (Blender 5.2)
  | 'castleArchGate'
  | 'castleTowerRed'
  | 'castleTowerBlue'
  | 'castleKeepCenter'
  | 'castleStairsWood'
  | 'castleWallCrenel'
  | 'toyHouseRed'
  | 'toyHouseBlue'
  | 'woodRailBridge'
  | 'bevelCubeWood'
  | 'bevelCylWood'
  | 'toyPlatformSlab'
  | 'checkpointFlagFelt'
  | 'starGateClockwork'
  // Dynamic Toy Parts & Trampolines (Blender 5.2)
  | 'alphabetBlockBevel'
  | 'woodCrateBevel'
  | 'woodDominoBevel'
  | 'bowlingPinSmooth'
  | 'trampolineRedCoil'
  | 'trampolineWoodCoil'
  | 'trampolineMiniPastel'
  // Field Craft Props (Blender 5.2 + Self AI Props + Self Smooth)
  | 'steppingStoneRound'
  | 'steppingStonePlank'
  | 'patchworkRug'
  | 'daisyWhite'
  | 'toyTreeFelt'
  | 'toyFenceWood'
  | 'mushroomSpotted'
  | 'giftBox'
  | 'cushion'
  // Boss Arena Kit (Blender 5.2)
  | 'bossArenaDeck'
  | 'bossArenaGlass'
  | 'bossGearLarge'
  | 'bossGearMedium'
  | 'bossGearSmall'
  | 'bossBalusterSection'
  | 'bossLanternPost'
  // World 1 Sunlit Playroom Kit (Blender 5.2)
  | 'playroomBed'
  | 'playroomToyChest'
  | 'playroomBookshelf'
  | 'playroomPictureBook'
  | 'playroomToyTrain'
  | 'playroomWallShelf'
  | 'playroomWindowFrame'
  | 'playroomCastleRoof';

const PROP_PATHS: Record<PropKey, string> = {
  castleArchGate: '/models/diorama/castle_arch_gate.glb',
  castleTowerRed: '/models/diorama/castle_tower_round.glb',
  castleTowerBlue: '/models/diorama/castle_tower_blue.glb',
  castleKeepCenter: '/models/diorama/castle_keep_center.glb',
  castleStairsWood: '/models/diorama/castle_stairs_wood.glb',
  castleWallCrenel: '/models/diorama/castle_wall_crenel.glb',
  toyHouseRed: '/models/diorama/toy_house_red.glb',
  toyHouseBlue: '/models/diorama/toy_house_blue.glb',
  woodRailBridge: '/models/diorama/wood_rail_bridge.glb',
  bevelCubeWood: '/models/diorama/bevel_cube_wood.glb',
  bevelCylWood: '/models/diorama/bevel_cylinder_wood.glb',
  toyPlatformSlab: '/models/diorama/toy_platform_slab.glb',
  checkpointFlagFelt: '/models/diorama/checkpoint_flag_felt.glb',
  starGateClockwork: '/models/diorama/star_gate_clockwork.glb',

  alphabetBlockBevel: '/models/diorama/alphabet_block_bevel.glb',
  woodCrateBevel: '/models/diorama/wood_crate_bevel.glb',
  woodDominoBevel: '/models/diorama/wood_domino_bevel.glb',
  bowlingPinSmooth: '/models/diorama/bowling_pin_smooth.glb',
  trampolineRedCoil: '/models/diorama/trampoline_red_coil.glb',
  trampolineWoodCoil: '/models/diorama/trampoline_wood_coil.glb',
  trampolineMiniPastel: '/models/diorama/trampoline_mini_pastel.glb',

  steppingStoneRound: '/models/diorama/stepping_stone_round.glb',
  steppingStonePlank: '/models/diorama/stepping_stone_plank.glb',
  patchworkRug: '/models/diorama/patchwork_rug.glb',
  daisyWhite: '/models/diorama/daisy_white.glb',
  toyTreeFelt: '/models/diorama/toy_tree_felt.glb',
  toyFenceWood: '/models/diorama/toy_fence_wood.glb',
  mushroomSpotted: '/models/toybox_smooth/mushroom_spotted.glb',
  giftBox: '/models/ai/gift_box.glb',
  cushion: '/models/ai/cushion.glb',

  bossArenaDeck: '/models/diorama/boss_arena_deck.glb',
  bossArenaGlass: '/models/diorama/boss_arena_glass.glb',
  bossGearLarge: '/models/diorama/boss_gear_large.glb',
  bossGearMedium: '/models/diorama/boss_gear_medium.glb',
  bossGearSmall: '/models/diorama/boss_gear_small.glb',
  bossBalusterSection: '/models/diorama/boss_baluster_section.glb',
  bossLanternPost: '/models/diorama/boss_lantern_post.glb',

  playroomBed: '/models/playroom/playroom_bed.glb',
  playroomToyChest: '/models/playroom/playroom_toy_chest.glb',
  playroomBookshelf: '/models/playroom/playroom_bookshelf.glb',
  playroomPictureBook: '/models/playroom/playroom_picture_book.glb',
  playroomToyTrain: '/models/playroom/playroom_toy_train.glb',
  playroomWallShelf: '/models/playroom/playroom_wall_shelf.glb',
  playroomWindowFrame: '/models/playroom/playroom_window_frame.glb',
  playroomCastleRoof: '/models/playroom/playroom_castle_roof.glb',
};

const PRESERVED_NODES_BY_PROP: Partial<
  Record<PropKey, { names?: string[]; prefixes?: string[] }>
> = {
  toyPlatformSlab: { names: ['SlabBody'] },
  trampolineRedCoil: { names: ['Cap', 'Coil'] },
  trampolineWoodCoil: { names: ['Cap', 'Coil'] },
  trampolineMiniPastel: { names: ['Cap', 'Coil'] },
  checkpointFlagFelt: { names: ['FlagCloth'] },
  giftBox: { prefixes: ['BoxLid', 'Bow'] },
};

const LOSSLESS_MOBILE_PROP_KEYS = new Set<PropKey>([
  'alphabetBlockBevel',
  'bevelCubeWood',
  'bevelCylWood',
  'castleWallCrenel',
  'steppingStonePlank',
  'steppingStoneRound',
]);

const STATIC_ROOT_PROP_KEYS = new Set<PropKey>([
  'castleArchGate',
  'castleKeepCenter',
  'castleStairsWood',
  'bossArenaDeck',
  'bossArenaGlass',
]);

interface GarlandFlagEntry {
  pos: THREE.Vector3;
  ry: number;
  color: number;
}

export class WorldPropsManager {
  public readonly group = new THREE.Group();
  private templates = new Map<PropKey, PropTemplate>();
  private batches = new Map<PropKey, PropTransform[]>();
  private rawBatches = new Map<PropKey, PropTransform[]>();
  private binder: DioramaMaterialBinder | null = null;
  private instancedBatchesCount = 0;
  private totalInstancesCount = 0;

  private garlandCordGeos: THREE.BufferGeometry[] = [];
  private garlandFlags: GarlandFlagEntry[] = [];

  private instancedMatMap = new Map<THREE.Material, THREE.Material>();
  private instancedColorMatMap = new Map<THREE.Material, THREE.Material>();

  private readonly isMobileDevice = isMobileDefaultDevice();
  private bossZoneObjects: THREE.Object3D[] = [];
  private bowlingZoneObjects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private getInstancedMaterial(
    mat: THREE.Material | THREE.Material[],
    withInstanceColor: boolean
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(mat)) {
      return mat.map((m) => this.getInstancedMaterial(m, withInstanceColor) as THREE.Material);
    }
    const cache = withInstanceColor ? this.instancedColorMatMap : this.instancedMatMap;
    const existing = cache.get(mat);
    if (existing) return existing;
    const cloned = mat.clone();
    cache.set(mat, cloned);
    return cloned;
  }

  private syncClonedMaterials(): void {
    const syncMap = (cache: Map<THREE.Material, THREE.Material>) => {
      for (const [src, dst] of cache.entries()) {
        if (src instanceof THREE.MeshStandardMaterial && dst instanceof THREE.MeshStandardMaterial) {
          dst.color.copy(src.color);
          dst.map = src.map;
          dst.normalMap = src.normalMap;
          if (src.normalScale && dst.normalScale) dst.normalScale.copy(src.normalScale);
          dst.roughnessMap = src.roughnessMap;
          dst.needsUpdate = true;
        }
      }
    };
    syncMap(this.instancedMatMap);
    syncMap(this.instancedColorMatMap);
  }

  private mergePartsByMaterial(parts: MeshPart[]): MeshPart[] {
    const groups = new Map<THREE.Material, MeshPart[]>();
    const unmerged: MeshPart[] = [];
    for (const p of parts) {
      if (Array.isArray(p.material) || !p.material) {
        unmerged.push(p);
        continue;
      }
      let list = groups.get(p.material);
      if (!list) {
        list = [];
        groups.set(p.material, list);
      }
      list.push(p);
    }

    const identity = new THREE.Matrix4();
    const result: MeshPart[] = [...unmerged];
    for (const [mat, list] of groups.entries()) {
      if (list.length === 1) {
        result.push(list[0]);
        continue;
      }
      const mergedGeo = mergeIndexedOrNonIndexed(
        list.map((p) => ({ geometry: p.geometry, matrix: p.localMatrix }))
      );
      if (!mergedGeo) {
        result.push(...list);
        continue;
      }
      result.push({
        name: `Batch_${mat.name || 'Part'}`,
        geometry: mergedGeo,
        material: mat,
        localMatrix: identity.clone(),
        worldMatrix: identity.clone(),
      });
    }
    return result;
  }

  async load(pbr?: PbrAssets, useMobileLods = false): Promise<void> {
    if (pbr) this.binder = new DioramaMaterialBinder(pbr);
    const loader = new GLTFLoader();
    const entries = Object.entries(PROP_PATHS) as Array<[PropKey, string]>;
    const allowLosslessMobile = useMobileLods || isMobileDefaultDevice();
    const loadGlb = async (key: PropKey, url: string) => {
      const desktopUrl = resolveAssetUrl(url);
      if (
        allowLosslessMobile &&
        LOSSLESS_MOBILE_PROP_KEYS.has(key) &&
        url.startsWith('/models/') &&
        !url.startsWith('/models/mobile/')
      ) {
        const mobUrl = resolveAssetUrl(url.replace('/models/', '/models/mobile/'));
        try {
          return await withTimeout(loader.loadAsync(mobUrl), 20000, `prop ${key} mobile`);
        } catch {
          // Fall back to desktop asset if a specific LOD is absent
        }
      }
      return withTimeout(loader.loadAsync(desktopUrl), 20000, `prop ${key}`);
    };

    await runWithConcurrency(entries, 6, async ([key, url]) => {
      try {
        const gltf = await loadGlb(key, url);
        const root = gltf.scene;
        if (this.binder) this.binder.bindRoot(root);

        const preserve = PRESERVED_NODES_BY_PROP[key];
        optimizeStaticHierarchy(
          root,
          new Set(preserve?.names ?? []),
          preserve?.prefixes ?? []
        );

        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);

        const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const parts: MeshPart[] = [];
        root.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const localMatrix = new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld);
            parts.push({
              name: obj.name,
              geometry: obj.geometry,
              material: obj.material,
              localMatrix,
              worldMatrix: obj.matrixWorld.clone(),
            });
          }
        });

        if (parts.length > 0) {
          this.templates.set(key, {
            parts,
            mergedParts: this.mergePartsByMaterial(parts),
            baseOffsetY: Number.isFinite(box.min.y) ? -box.min.y : 0,
            size,
            root,
          });
        }
      } catch (err) {
        console.warn(`[WorldPropsManager] Failed to load custom diorama asset ${key}:`, err);
      }
    });
  }

  private cloneNodeTree(src: THREE.Object3D, overrideMat?: THREE.Material): THREE.Group {
    const clone = src.clone(true) as THREE.Group;
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (overrideMat) {
          obj.material = overrideMat;
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }

  /** Preserves node hierarchy (e.g., Cap / Coil on trampolines) and aligns bottom to Y=0. */
  createModelInstance(key: PropKey, overrideMat?: THREE.Material): THREE.Group | null {
    const tpl = this.templates.get(key);
    if (!tpl) return null;
    const g = new THREE.Group();
    const inner = this.cloneNodeTree(tpl.root, overrideMat);
    inner.position.y = tpl.baseOffsetY;
    g.add(inner);
    return g;
  }

  /**
   * Clones a grounded model instance while cloning & patching specific named sub-materials
   * without mutating the shared template materials.
   */
  createCustomizedModelInstance(
    key: PropKey,
    patchByMatName?: Record<string, (mat: THREE.MeshStandardMaterial) => void>
  ): THREE.Group | null {
    const g = this.createModelInstance(key);
    if (!g || !patchByMatName) return g;
    const clonedCache = new Map<THREE.Material, THREE.Material>();
    const patchOne = (mat: THREE.Material): THREE.Material => {
      const fn = patchByMatName[mat.name];
      if (!fn || !(mat instanceof THREE.MeshStandardMaterial)) return mat;
      let cloned = clonedCache.get(mat);
      if (!cloned) {
        cloned = mat.clone();
        fn(cloned as THREE.MeshStandardMaterial);
        cloned.needsUpdate = true;
        clonedCache.set(mat, cloned);
      }
      return cloned;
    };
    g.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(patchOne);
      } else if (obj.material) {
        obj.material = patchOne(obj.material);
      }
    });
    return g;
  }

  getTemplateSize(key: PropKey): THREE.Vector3 | null {
    const tpl = this.templates.get(key);
    return tpl ? tpl.size.clone() : null;
  }

  /** Preserves Blender design origin verbatim (essential for Boss Deck pit & centered physics). */
  createRawModelInstance(key: PropKey, overrideMat?: THREE.Material): THREE.Group | null {
    const tpl = this.templates.get(key);
    if (!tpl) return null;
    const inner = this.cloneNodeTree(tpl.root, overrideMat);
    const g = new THREE.Group();
    g.add(inner);
    return g;
  }

  addRawStaticModel(
    key: PropKey,
    pos: THREE.Vector3,
    ry = 0,
    scale = 1,
    castShadow = true
  ): THREE.Group | null {
    const inst = this.createRawModelInstance(key);
    if (!inst) return null;
    inst.position.copy(pos);
    inst.rotation.y = ry;
    inst.scale.setScalar(scale);
    inst.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = castShadow;
        o.receiveShadow = true;
      }
    });
    this.group.add(inst);
    if (STATIC_ROOT_PROP_KEYS.has(key)) {
      inst.updateMatrixWorld(true);
      inst.traverse((o) => {
        o.matrixAutoUpdate = false;
      });
    }
    return inst;
  }

  addGroundedStaticModel(key: PropKey, pos: THREE.Vector3, ry = 0, scale = 1): THREE.Group | null {
    const inst = this.createModelInstance(key);
    if (!inst) return null;
    inst.position.copy(pos);
    inst.rotation.y = ry;
    inst.scale.setScalar(scale);
    this.group.add(inst);
    if (STATIC_ROOT_PROP_KEYS.has(key)) {
      inst.updateMatrixWorld(true);
      inst.traverse((o) => {
        o.matrixAutoUpdate = false;
      });
    }
    return inst;
  }

  getTemplateParts(
    key: PropKey,
    excludeNames?: Set<string>
  ): { parts: MeshPart[]; baseOffsetY: number } | null {
    const tpl = this.templates.get(key);
    if (!tpl) return null;
    const baseParts =
      !excludeNames || excludeNames.size === 0
        ? tpl.mergedParts
        : this.mergePartsByMaterial(tpl.parts.filter((p) => !excludeNames.has(p.name)));
    return {
      parts: baseParts.map((p) => ({
        ...p,
        material: this.getInstancedMaterial(p.material, false),
      })),
      baseOffsetY: tpl.baseOffsetY,
    };
  }

  queue(key: PropKey, t: PropTransform): void {
    let list = this.batches.get(key);
    if (!list) {
      list = [];
      this.batches.set(key, list);
    }
    list.push(t);
  }

  queueRaw(key: PropKey, t: PropTransform): void {
    let list = this.rawBatches.get(key);
    if (!list) {
      list = [];
      this.rawBatches.set(key, list);
    }
    list.push(t);
  }

  private flushBatchCollection(
    collection: Map<PropKey, PropTransform[]>,
    useBaseOffset: boolean
  ): void {
    const noCastSet = new Set<PropKey>([
      'daisyWhite',
      'mushroomSpotted',
      'steppingStoneRound',
      'steppingStonePlank',
    ]);
    const dummyMat = new THREE.Matrix4();
    const outerMat = new THREE.Matrix4();
    const baseMat = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const tmpCol = new THREE.Color();

    for (const [key, list] of collection.entries()) {
      const tpl = this.templates.get(key);
      if (!tpl || list.length === 0) continue;

      const castShadow = !noCastSet.has(key);
      baseMat.makeTranslation(0, useBaseOffset ? tpl.baseOffsetY : 0, 0);
      const hasPerInstanceColor = list.some((item) => item.color !== undefined);

      for (const part of tpl.mergedParts) {
        if (!part.geometry.boundingSphere) {
          part.geometry.computeBoundingSphere();
        }
        const instMat = this.getInstancedMaterial(part.material, hasPerInstanceColor);
        const inst = new THREE.InstancedMesh(part.geometry, instMat, list.length);
        inst.castShadow = castShadow;
        inst.receiveShadow = true;

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const sx = item.sx ?? 1;
          const sy = item.sy ?? sx;
          const sz = item.sz ?? sx;
          pos.set(item.x, item.y, item.z);
          euler.set(item.rx ?? 0, item.ry ?? 0, item.rz ?? 0, 'YXZ');
          quat.setFromEuler(euler);
          scale.set(sx, sy, sz);
          outerMat.compose(pos, quat, scale);
          dummyMat.multiplyMatrices(outerMat, baseMat).multiply(part.localMatrix);
          inst.setMatrixAt(i, dummyMat);

          if (hasPerInstanceColor) {
            tmpCol.setHex(item.color ?? 0xffffff);
            inst.setColorAt(i, tmpCol);
          }
        }

        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
        inst.frustumCulled = true;
        inst.updateMatrix();
        inst.matrixAutoUpdate = false;

        if (key === 'bossBalusterSection' || key === 'bossLanternPost') {
          this.bossZoneObjects.push(inst);
        } else if (key === 'toyFenceWood') {
          this.bowlingZoneObjects.push(inst);
        }

        this.group.add(inst);
        this.instancedBatchesCount++;
      }

      this.totalInstancesCount += list.length;
    }

    collection.clear();
  }

  private flushGarlands(): void {
    if (this.garlandCordGeos.length > 0) {
      const identity = new THREE.Matrix4();
      const mergedCord = mergeIndexedOrNonIndexed(
        this.garlandCordGeos.map((g) => ({ geometry: g, matrix: identity }))
      );
      for (const g of this.garlandCordGeos) g.dispose();
      this.garlandCordGeos = [];

      if (mergedCord) {
        const cordMesh = new THREE.Mesh(
          mergedCord,
          new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.55 })
        );
        cordMesh.frustumCulled = true;
        cordMesh.updateMatrix();
        cordMesh.matrixAutoUpdate = false;
        this.group.add(cordMesh);
      }
    }

    if (this.garlandFlags.length > 0) {
      const triGeo = new THREE.ConeGeometry(0.26, 0.50, 3);
      triGeo.rotateX(Math.PI);
      triGeo.computeBoundingSphere();

      const flagMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        envMapIntensity: 0.5,
      });
      const inst = new THREE.InstancedMesh(triGeo, flagMat, this.garlandFlags.length);
      inst.castShadow = false;

      const mat4 = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const euler = new THREE.Euler();
      const scale = new THREE.Vector3(1, 1, 1);
      const col = new THREE.Color();

      for (let i = 0; i < this.garlandFlags.length; i++) {
        const f = this.garlandFlags[i];
        euler.set(0, f.ry, 0);
        quat.setFromEuler(euler);
        mat4.compose(f.pos, quat, scale);
        inst.setMatrixAt(i, mat4);
        col.setHex(f.color);
        inst.setColorAt(i, col);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = true;
      inst.updateMatrix();
      inst.matrixAutoUpdate = false;
      this.group.add(inst);
      this.garlandFlags = [];
    }
  }

  clearPlacedInstances(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.InstancedMesh) {
        child.dispose();
      }
    }
    this.batches.clear();
    this.rawBatches.clear();
    for (const g of this.garlandCordGeos) g.dispose();
    this.garlandCordGeos = [];
    this.garlandFlags = [];
    this.bossZoneObjects = [];
    this.bowlingZoneObjects = [];
    this.instancedBatchesCount = 0;
    this.totalInstancesCount = 0;
  }

  flushBatches(): void {
    this.flushBatchCollection(this.batches, true);
    this.flushBatchCollection(this.rawBatches, false);
    this.flushGarlands();
  }

  refreshPbrMaps(): void {
    this.binder?.refreshPbrMaps();
    this.syncClonedMaterials();
  }

  setQuality(resolved: ResolvedQuality): void {
    const forceShowAll = (!this.isMobileDevice && resolved !== 'low') || resolved === 'high';
    if (forceShowAll) {
      for (const o of this.bossZoneObjects) o.visible = true;
      for (const o of this.bowlingZoneObjects) o.visible = true;
    }
  }

  updateDistanceCulling(
    resolved: ResolvedQuality,
    camPos: THREE.Vector3,
    bossCenterZ = -52,
    bowlingCenterX = -21,
    bowlingCenterZ = -30.5
  ): void {
    const shouldCull = resolved === 'low' || (this.isMobileDevice && resolved !== 'high');
    if (!shouldCull) {
      for (const o of this.bossZoneObjects) o.visible = true;
      for (const o of this.bowlingZoneObjects) o.visible = true;
      return;
    }
    const bossDist = Math.hypot(camPos.x - 0, camPos.z - bossCenterZ);
    const showBoss = bossDist <= 85;
    for (const o of this.bossZoneObjects) o.visible = showBoss;

    const bowlDist = Math.hypot(camPos.x - bowlingCenterX, camPos.z - bowlingCenterZ);
    const showBowl = bowlDist <= 78;
    for (const o of this.bowlingZoneObjects) o.visible = showBowl;
  }

  addGarlandSpan(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    flags = 11,
    sag = 0.68,
    palette = [0xf05363, 0xf2c844, 0x52c46d, 0x4592ee, 0xee7ca6]
  ): void {
    const chordPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const p = new THREE.Vector3().lerpVectors(p0, p1, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      chordPts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(chordPts);
    const cordGeo = new THREE.TubeGeometry(curve, 20, 0.04, 6, false);
    this.garlandCordGeos.push(cordGeo);

    const dirYaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);

    for (let i = 1; i <= flags; i++) {
      const t = i / (flags + 1);
      const pt = curve.getPoint(t);
      this.garlandFlags.push({
        pos: new THREE.Vector3(pt.x, pt.y - 0.24, pt.z),
        ry: dirYaw + Math.PI / 2,
        color: palette[i % palette.length],
      });
    }
  }

  /** Populates custom DIY diorama foliage, flowers, stepping stones, trees, fences & lanterns. */
  populateFieldProps(terrain: CraftTerrainBuilder): void {
    const sampleY = (x: number, z: number, fallback = 0): number =>
      terrain.sampleHeight(x, z) ?? fallback;

    // 1. Thick knitted patchwork rug under Manmarubuu's starting spot (Art Bible 08!)
    this.addGroundedStaticModel('patchworkRug', new THREE.Vector3(0, sampleY(0, 44.8, 0), 44.8), 0.06, 1.0);

    // 2. Colorful rounded stepping stones & wood planks along the sandy meadow path (Art Bible 07!)
    const stoneColors = [0xdc4a52, 0xe8b638, 0x4b93df, 0x52b664, 0xd8a86b, 0x87b8e6, 0xebd3a4];
    const roundStones: Array<[number, number, number, number]> = [
      [-1.10, 40.3, 1.32, 0],
      [1.15, 39.4, 1.24, 2],
      [-0.85, 38.4, 1.38, 1],
      [1.20, 35.8, 1.28, 3],
      [-1.00, 34.4, 1.35, 4],
      [0.95, 33.0, 1.25, 5],
      [-0.75, 31.6, 1.22, 1],
      [0.95, 29.0, 1.24, 0],
      [-0.95, 27.6, 1.32, 2],
      [0.85, 26.2, 1.22, 3],
      [6.2, 24.4, 1.26, 1],
      [9.4, 23.6, 1.32, 3],
      [-6.5, 25.0, 1.26, 4],
      [-9.8, 25.6, 1.32, 0],
    ];
    for (const [x, z, sc, ci] of roundStones) {
      this.queue('steppingStoneRound', {
        x,
        y: sampleY(x, z, 0) - 0.02,
        z,
        ry: (x + z) * 0.7,
        sx: sc,
        sy: 1.15,
        sz: sc,
        color: stoneColors[ci % stoneColors.length],
      });
    }
    const plankStones: Array<[number, number, number, number]> = [
      [0.12, 37.3, 0.12, 2],
      [-0.14, 36.4, -0.09, 1],
      [0.10, 30.3, 0.08, 4],
      [-0.08, 23.4, -0.06, 2],
    ];
    for (const [x, z, ry, ci] of plankStones) {
      this.queue('steppingStonePlank', {
        x,
        y: sampleY(x, z, 0) - 0.02,
        z,
        ry,
        sx: 1.30,
        sy: 1.15,
        sz: 1.20,
        color: stoneColors[ci % stoneColors.length],
      });
    }

    // 3. Cute wooden toy houses on Left & Right denim meadow terraces (plus gift boxes & wooden cubes)
    this.queue('toyHouseRed', { x: -18.5, y: 1.70, z: 39.2, ry: 0.62, sx: 1.05 });
    this.queue('toyHouseBlue', { x: 19.6, y: 1.90, z: 36.2, ry: -0.68, sx: 1.05 });
    this.queue('giftBox', { x: -13.8, y: 1.70, z: 40.2, ry: 0.35, sx: 1.15 });
    this.queue('giftBox', { x: 20.6, y: 3.40, z: 25.8, ry: -0.45, sx: 1.25 });
    this.queue('giftBox', { x: 32.6, y: 0.40, z: 13.6, ry: -0.65, sx: 1.20 });

    // 4. Beveled wooden cube block clusters (Art Bible 08 foreground & terraced islands)
    const woodDecorBlocks: Array<[number, number, number, number, number?]> = [
      [-6.8, 46.8, 0.25, 1.0],
      [-5.4, 46.1, -0.35, 0.90],
      [-6.1, 46.5, 0.15, 0.72, 1.18],
      [6.8, 46.5, -0.22, 1.02],
      [-15.2, 34.0, 0.4, 0.95],
      [17.6, 11.4, 0.3, 0.95],
      [-26.2, 17.5, 0.25, 0.95],
    ];
    for (const [x, z, ry, sc, yOff] of woodDecorBlocks) {
      this.queue('bevelCubeWood', {
        x,
        y: sampleY(x, z, 0) - 0.02 + (yOff ?? 0),
        z,
        ry,
        sx: sc,
      });
    }

    // 5. Felt toy trees framing horizons without blocking camera sightlines
    const trees: Array<[number, number, number, number]> = [
      [-21.2, 42.5, 0.2, 1.15],
      [22.5, 41.0, 1.1, 1.20],
      [-21.5, 29.0, 2.4, 1.05],
      [23.0, 21.5, 0.7, 1.15],
      [-14.2, 11.5, 1.6, 1.05],
      [14.2, 10.5, 2.8, 1.05],
      [-13.5, -9.2, 0.5, 1.00],
      [35.2, 11.2, 1.8, 1.25],
      [35.8, -0.5, 0.9, 1.18],
      [-35.5, 13.8, 1.4, 1.12],
    ];
    for (const [x, z, ry, sc] of trees) {
      const y = terrain.sampleHeight(x, z);
      if (y === null) continue;
      this.queue('toyTreeFelt', { x, y: y - 0.04, z, ry, sx: sc });
    }

    // 6. White Daisy Clusters across grassy hills & terraced rims (Art Bible 07, zero rug overlap!)
    const daisyCenters: Array<[number, number, number]> = [
      [-6.1, 45.2, 4],
      [6.1, 45.0, 4],
      [-7.4, 43.2, 4],
      [7.2, 43.0, 4],
      [-6.8, 34.5, 4],
      [6.8, 33.8, 4],
      [-11.8, 30.8, 4],
      [11.8, 30.2, 4],
      [-15.8, 39.2, 4],
      [-18.8, 34.5, 3],
      [16.2, 39.0, 4],
      [18.8, 31.8, 4],
      [19.2, 24.5, 3],
      [-9.8, 9.5, 3],
      [9.8, 9.2, 3],
      [-12.2, -3.5, 3],
      [12.2, -4.5, 3],
      [21.8, 10.8, 4],
      [32.5, 8.5, 4],
      [32.2, 2.5, 4],
      [-32.5, 12.0, 4],
      [-26.5, 12.8, 3],
    ];
    for (let ci = 0; ci < daisyCenters.length; ci++) {
      const [cx, cz, cnt] = daisyCenters[ci];
      for (let k = 0; k < cnt; k++) {
        const a = k * 2.1 + ci * 0.9;
        const r = 0.25 + (k % 3) * 0.42;
        const fx = cx + Math.cos(a) * r;
        const fz = cz + Math.sin(a) * r;
        if (Math.abs(fx) < 5.2 && fz > 40.3 && fz < 49.3) continue;
        const fy = terrain.sampleHeight(fx, fz);
        if (fy === null) continue;
        this.queue('daisyWhite', {
          x: fx,
          y: fy - 0.02,
          z: fz,
          ry: a,
          sx: 1.05 + (k % 3) * 0.22,
        });
      }
    }

    // 7. Cute spotted mushrooms near tree trunks
    const shrooms: Array<[number, number]> = [
      [-19.5, 41.2],
      [20.5, 39.8],
      [33.8, 10.2],
      [-12.5, 9.8],
      [-29.2, -26.8],
    ];
    for (const [x, z] of shrooms) {
      this.queue('mushroomSpotted', {
        x,
        y: sampleY(x, z, z < -20 ? 0.5 : 0) - 0.01,
        z,
        ry: x * 0.4,
        sx: 1.45,
      });
    }

    // 8. Rounded wooden toy fences bounding the West Bowling Deck (Y = 0.5) & Castle outer edges
    for (let i = 0; i < 6; i++) {
      const x = -28.0 + i * 2.8;
      this.queue('toyFenceWood', { x, y: 0.5, z: -40.8, ry: 0, sx: 1.05 });
    }
    for (let i = 0; i < 4; i++) {
      const z = -26.5 - i * 3.4;
      this.queue('toyFenceWood', { x: -31.8, y: 0.5, z, ry: Math.PI / 2, sx: 1.05 });
      this.queue('toyFenceWood', { x: -10.2, y: 0.5, z, ry: Math.PI / 2, sx: 1.05 });
    }

    // 9. Garlands decorating the Castle Front Archway, West Bowling Towers, and Star Gate!
    this.addGarlandSpan(new THREE.Vector3(-8.2, 8.8, 8.2), new THREE.Vector3(-3.55, 8.6, 10.2), 7, 0.55);
    this.addGarlandSpan(new THREE.Vector3(3.55, 8.6, 10.2), new THREE.Vector3(8.2, 8.8, 8.2), 7, 0.55);
    this.addGarlandSpan(new THREE.Vector3(-25.4, 8.2, -24.5), new THREE.Vector3(-16.6, 8.2, -24.5), 11, 0.65);

    this.flushBatches();
  }

  getStats(): {
    dioramaTemplatesLoaded: number;
    instancedBatches: number;
    totalInstances: number;
  } {
    return {
      dioramaTemplatesLoaded: this.templates.size,
      instancedBatches: this.instancedBatchesCount,
      totalInstances: this.totalInstancesCount,
    };
  }
}

import * as THREE from 'three';
import { getProceduralTextures } from '../assets/ProceduralTextures';
import type { PbrAssets, PbrMaterialMaps } from '../assets/PbrAssets';
import type { DynamicBodyRecord, PhysicsWorld } from '../core/PhysicsWorld';
import type { ResolvedQuality } from '../types';
import type { MeshPart } from './WorldPropsManager';

export interface CustomBlockVisuals {
  createBlockMesh: (mat: THREE.Material) => THREE.Object3D | null;
  createCrateMesh: (mat: THREE.Material) => THREE.Object3D | null;
  createDominoMesh: () => THREE.Object3D | null;
  createBowlingPinMesh: () => THREE.Object3D | null;
  getDominoParts?: () => { parts: MeshPart[]; baseOffsetY: number } | null;
  getBowlingPinParts?: () => { parts: MeshPart[]; baseOffsetY: number } | null;
}

interface DynamicInstEntry {
  rec: DynamicBodyRecord;
  proxy: THREE.Object3D;
  colorIdx?: number;
  syncedOnce?: boolean;
  lastHidden?: boolean;
}

const RAINBOW_DOMINO_COLORS = [
  0xef5358, // coral red
  0xf8983c, // warm orange
  0xf8d848, // sunny yellow
  0x7ed458, // apple green
  0x3ec48f, // mint emerald
  0x4eaaf2, // sky blue
  0x6b7ee8, // periwinkle blue
  0xb272e4, // soft purple
  0xf272a8, // strawberry pink
];

interface DynamicInstSlot {
  inst: THREE.InstancedMesh;
  localMatrix: THREE.Matrix4;
}

export class ToyBlocksManager {
  public readonly group = new THREE.Group();
  private textures = getProceduralTextures();
  private pineMaps?: PbrMaterialMaps;
  private oakMaps?: PbrMaterialMaps;
  private visuals?: CustomBlockVisuals;

  private fallbackBlockGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
  private fallbackCrateGeo = new THREE.BoxGeometry(1.28, 1.28, 1.28);
  private fallbackDominoGeo = new THREE.BoxGeometry(0.88, 1.85, 0.26);
  private fallbackPinGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.55, 14);

  private crateMat: THREE.MeshStandardMaterial;
  private glowCrateMat: THREE.MeshStandardMaterial;
  private blockLetterMats: THREE.MeshStandardMaterial[] = [];
  private dominoMats: THREE.MeshStandardMaterial[] = [];
  private rainbowDominoMats: THREE.MeshStandardMaterial[] = [];
  private rainbowDominoMode = false;
  private pinMat: THREE.MeshStandardMaterial;

  public tutorialCrateIds = new Set<number>();
  public eastDominoIds = new Set<number>();
  public bowlingPinIds = new Set<number>();
  public knockedBowlingPinIds = new Set<number>();

  private allDominoIds = new Set<number>();
  private fallenDominoIds = new Set<number>();
  private records: DynamicBodyRecord[] = [];
  private dominoEntries: DynamicInstEntry[] = [];
  private dominoInsts: DynamicInstSlot[] = [];
  private dominoCenter = new THREE.Vector3(24, 1, -2);
  private dominoCullRadiusSq = 95 * 95;
  private pinCenter = new THREE.Vector3(-21, 1, -29);
  private pinCullRadiusSq = 60 * 60;
  private pinEntries: DynamicInstEntry[] = [];
  private pinInsts: DynamicInstSlot[] = [];
  private readonly tmpOuterMat = new THREE.Matrix4();
  private readonly tmpFinalMat = new THREE.Matrix4();
  private readonly oneScale = new THREE.Vector3(1, 1, 1);
  private readonly zeroScale = new THREE.Vector3(0, 0, 0);

  constructor(scene: THREE.Scene, pbr?: PbrAssets, visuals?: CustomBlockVisuals) {
    scene.add(this.group);
    this.visuals = visuals;
    this.pineMaps = pbr?.cloneMaps('coatedPine', 1, 1);
    this.oakMaps = pbr?.cloneMaps('oakVeneer', 1, 1);

    const oakOrPine = this.oakMaps ?? this.pineMaps;
    const woodPbr = oakOrPine
      ? {
          normalMap: oakOrPine.nor,
          normalScale: new THREE.Vector2(0.45, 0.45),
          roughnessMap: oakOrPine.rough,
        }
      : {};

    this.crateMat = new THREE.MeshStandardMaterial({
      color: 0xdca565,
      map: this.textures.woodCrate,
      ...woodPbr,
      roughness: 0.62,
      metalness: 0.03,
      envMapIntensity: 0.50,
    });

    this.glowCrateMat = new THREE.MeshStandardMaterial({
      color: 0xffe09c,
      map: this.textures.woodCrate,
      ...woodPbr,
      roughness: 0.52,
      emissive: 0xffb830,
      emissiveIntensity: 0.26,
      envMapIntensity: 0.55,
    });

    for (const tex of this.textures.blockLetters.values()) {
      this.blockLetterMats.push(
        new THREE.MeshStandardMaterial({
          map: tex,
          ...woodPbr,
          roughness: 0.50,
          metalness: 0.02,
          envMapIntensity: 0.48,
        })
      );
    }

    const domCols = [0xd69b5a, 0xc98648, 0xe0aa68, 0xb8763c, 0xd89e62, 0xc28044];
    this.dominoMats = domCols.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c,
          map: this.oakMaps?.diff ?? null,
          ...woodPbr,
          roughness: 0.48,
          envMapIntensity: 0.52,
        })
    );

    this.rainbowDominoMats = RAINBOW_DOMINO_COLORS.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c,
          normalMap: oakOrPine?.nor ?? null,
          normalScale: new THREE.Vector2(0.18, 0.18),
          roughness: 0.36,
          metalness: 0.02,
          envMapIntensity: 0.52,
        })
    );

    this.pinMat = new THREE.MeshStandardMaterial({
      color: 0xf4efe2,
      roughness: 0.28,
      envMapIntensity: 0.56,
    });
  }

  setRainbowDominoMode(enabled: boolean): void {
    this.rainbowDominoMode = enabled;
  }

  setVisuals(visuals: CustomBlockVisuals): void {
    this.visuals = visuals;
  }

  spawnAlphabetBlock(
    physics: PhysicsWorld,
    pos: THREE.Vector3,
    letterIdx: number,
    onBreak?: DynamicBodyRecord['onBreak']
  ): DynamicBodyRecord {
    const mat = this.blockLetterMats[letterIdx % this.blockLetterMats.length];
    const custom = this.visuals?.createBlockMesh(mat);
    const mesh: THREE.Object3D =
      custom ??
      (() => {
        const m = new THREE.Mesh(this.fallbackBlockGeo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
      })();

    mesh.position.copy(pos);
    this.group.add(mesh);

    const rec = physics.addDynamicBox(mesh, 0.575, 0.575, 0.575, 'block', 1, 0.65, onBreak);
    this.records.push(rec);
    return rec;
  }

  spawnCrate(
    physics: PhysicsWorld,
    pos: THREE.Vector3,
    glowing = false,
    onBreak?: DynamicBodyRecord['onBreak']
  ): DynamicBodyRecord {
    const mat = glowing ? this.glowCrateMat : this.crateMat;
    const custom = this.visuals?.createCrateMesh(mat);
    const mesh: THREE.Object3D =
      custom ??
      (() => {
        const m = new THREE.Mesh(this.fallbackCrateGeo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
      })();

    mesh.position.copy(pos);
    this.group.add(mesh);

    const rec = physics.addDynamicBox(mesh, 0.64, 0.64, 0.64, 'crate', 1, 0.80, onBreak);
    this.records.push(rec);
    return rec;
  }

  spawnDomino(
    physics: PhysicsWorld,
    pos: THREE.Vector3,
    rotY: number,
    colorIdx: number,
    tag?: 'east'
  ): DynamicBodyRecord {
    const useInstanced = Boolean(this.visuals?.getDominoParts?.());
    let mesh: THREE.Object3D;
    if (useInstanced) {
      mesh = new THREE.Object3D();
    } else {
      const custom = this.visuals?.createDominoMesh();
      if (custom) {
        mesh = custom;
      } else {
        const mats = this.rainbowDominoMode ? this.rainbowDominoMats : this.dominoMats;
        const m = new THREE.Mesh(
          this.fallbackDominoGeo,
          mats[colorIdx % mats.length]
        );
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
      }
      this.group.add(mesh);
    }

    mesh.position.copy(pos);
    mesh.rotation.y = rotY;

    // Light density so touching the first domino triggers a crisp chain cascade!
    const rec = physics.addDynamicBox(mesh, 0.44, 0.925, 0.13, 'domino', 99, 0.28);
    this.records.push(rec);
    this.allDominoIds.add(rec.id);
    if (tag === 'east') this.eastDominoIds.add(rec.id);
    if (useInstanced) {
      this.dominoEntries.push({ rec, proxy: mesh, colorIdx });
    }
    return rec;
  }

  spawnBowlingPin(physics: PhysicsWorld, pos: THREE.Vector3): DynamicBodyRecord {
    const useInstanced = Boolean(this.visuals?.getBowlingPinParts?.());
    let mesh: THREE.Object3D;
    if (useInstanced) {
      mesh = new THREE.Object3D();
    } else {
      const custom = this.visuals?.createBowlingPinMesh();
      if (custom) {
        mesh = custom;
      } else {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.fallbackPinGeo, this.pinMat);
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);
        mesh = g;
      }
      this.group.add(mesh);
    }

    mesh.position.copy(pos);

    const rec = physics.addDynamicBox(mesh, 0.30, 0.775, 0.30, 'pin', 99, 0.40);
    rec.mesh.userData.homePos = pos.clone();
    this.records.push(rec);
    this.bowlingPinIds.add(rec.id);
    if (useInstanced) {
      this.pinEntries.push({ rec, proxy: mesh });
    }
    return rec;
  }

  private buildInstSlots(
    entries: DynamicInstEntry[],
    partsInfo: { parts: MeshPart[] } | null | undefined,
    existing: DynamicInstSlot[],
    rainbowTint = false
  ): DynamicInstSlot[] {
    for (const s of existing) {
      this.group.remove(s.inst);
      s.inst.dispose();
    }
    if (!partsInfo || entries.length === 0) return [];
    const slots: DynamicInstSlot[] = [];
    const hsl = { h: 0, s: 0, l: 0 };
    const tmpCol = new THREE.Color();
    for (const p of partsInfo.parts) {
      let mat: THREE.Material | THREE.Material[] = p.material;
      let applyPerInstanceRainbow = false;
      if (rainbowTint && !Array.isArray(p.material) && p.material instanceof THREE.MeshStandardMaterial) {
        p.material.color.getHSL(hsl);
        const isLightPipDetail = !p.material.map && hsl.l > 0.78;
        if (!isLightPipDetail) {
          const painted = p.material.clone();
          painted.color.setHex(0xffffff);
          painted.map = null;
          if (painted.normalScale) {
            painted.normalScale = new THREE.Vector2(0.18, 0.18);
          }
          painted.roughness = 0.36;
          painted.metalness = 0.02;
          painted.envMapIntensity = 0.52;
          painted.needsUpdate = true;
          mat = painted;
          applyPerInstanceRainbow = true;
        }
      }
      const inst = new THREE.InstancedMesh(p.geometry, mat, entries.length);
      if (applyPerInstanceRainbow) {
        for (let i = 0; i < entries.length; i++) {
          const cIdx = entries[i].colorIdx ?? i;
          tmpCol.setHex(RAINBOW_DOMINO_COLORS[cIdx % RAINBOW_DOMINO_COLORS.length]);
          inst.setColorAt(i, tmpCol);
        }
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      }
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.group.add(inst);
      slots.push({ inst, localMatrix: p.localMatrix });
    }
    return slots;
  }

  finalizeDynamicInstances(): void {
    this.dominoInsts = this.buildInstSlots(
      this.dominoEntries,
      this.visuals?.getDominoParts?.(),
      this.dominoInsts,
      this.rainbowDominoMode
    );
    if (this.dominoEntries.length > 0) {
      const box = new THREE.Box3();
      for (const e of this.dominoEntries) {
        box.expandByPoint(e.proxy.position);
      }
      box.getCenter(this.dominoCenter);
      const r = box.getSize(new THREE.Vector3()).length() * 0.5 + 54;
      this.dominoCullRadiusSq = r * r;
    }
    this.pinInsts = this.buildInstSlots(
      this.pinEntries,
      this.visuals?.getBowlingPinParts?.(),
      this.pinInsts
    );
    if (this.pinEntries.length > 0) {
      const box = new THREE.Box3();
      for (const e of this.pinEntries) {
        box.expandByPoint(e.proxy.position);
      }
      box.getCenter(this.pinCenter);
      const r = box.getSize(new THREE.Vector3()).length() * 0.5 + 54;
      this.pinCullRadiusSq = r * r;
    }
    this.syncDynamicInstances('medium');
  }

  private syncSlotList(entries: DynamicInstEntry[], slots: DynamicInstSlot[]): void {
    if (slots.length === 0 || entries.length === 0) return;
    let anyDirty = false;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const { rec, proxy } = entry;
      const hidden = rec.broken || proxy.position.y < -34;
      const sleeping = rec.broken ? true : rec.body.isSleeping();
      if (entry.syncedOnce && sleeping && entry.lastHidden === hidden) {
        continue;
      }
      entry.syncedOnce = true;
      entry.lastHidden = hidden;
      anyDirty = true;

      this.tmpOuterMat.compose(
        proxy.position,
        proxy.quaternion,
        hidden ? this.zeroScale : this.oneScale
      );
      for (const slot of slots) {
        this.tmpFinalMat.multiplyMatrices(this.tmpOuterMat, slot.localMatrix);
        slot.inst.setMatrixAt(i, this.tmpFinalMat);
      }
    }
    if (anyDirty) {
      for (const slot of slots) {
        slot.inst.instanceMatrix.needsUpdate = true;
      }
    }
  }

  syncDynamicInstances(resolvedQuality: ResolvedQuality, camPos?: THREE.Vector3): void {
    const showDominoes =
      resolvedQuality !== 'low' ||
      !camPos ||
      this.dominoCenter.distanceToSquared(camPos) <= this.dominoCullRadiusSq;
    for (const slot of this.dominoInsts) {
      slot.inst.visible = showDominoes;
    }
    if (showDominoes) {
      this.syncSlotList(this.dominoEntries, this.dominoInsts);
    }

    const showPins =
      resolvedQuality !== 'low' ||
      !camPos ||
      this.pinCenter.distanceToSquared(camPos) <= this.pinCullRadiusSq;
    for (const slot of this.pinInsts) {
      slot.inst.visible = showPins;
    }
    if (showPins) {
      this.syncSlotList(this.pinEntries, this.pinInsts);
    }
  }

  updateDominoCascade(onDominoFall: (pos: THREE.Vector3, chainCount: number) => void): void {
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3();
    for (const r of this.records) {
      if (!this.allDominoIds.has(r.id) || this.fallenDominoIds.has(r.id)) continue;
      if (r.broken) {
        this.fallenDominoIds.add(r.id);
        continue;
      }
      const rot = r.body.rotation();
      q.set(rot.x, rot.y, rot.z, rot.w);
      up.set(0, 1, 0).applyQuaternion(q);
      if (up.y < 0.78) {
        this.fallenDominoIds.add(r.id);
        const t = r.body.translation();
        onDominoFall(new THREE.Vector3(t.x, t.y, t.z), this.fallenDominoIds.size);
      }
    }
  }

  getTutorialCratesRemaining(): number {
    let count = 0;
    for (const r of this.records) {
      if (this.tutorialCrateIds.has(r.id) && !r.broken) count++;
    }
    return count;
  }

  getEastDominoStats(): { total: number; standing: number; fallen: number } {
    let total = 0;
    let standing = 0;
    let fallen = 0;
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3();
    for (const r of this.records) {
      if (!this.eastDominoIds.has(r.id)) continue;
      total++;
      if (r.broken || this.fallenDominoIds.has(r.id)) {
        fallen++;
        continue;
      }
      const rot = r.body.rotation();
      q.set(rot.x, rot.y, rot.z, rot.w);
      up.set(0, 1, 0).applyQuaternion(q);
      if (up.y >= 0.85) standing++;
      else fallen++;
    }
    return { total, standing, fallen };
  }

  updateBowlingChecks(): number {
    for (const r of this.records) {
      if (!this.bowlingPinIds.has(r.id) || this.knockedBowlingPinIds.has(r.id)) continue;
      if (r.broken) {
        this.knockedBowlingPinIds.add(r.id);
        continue;
      }
      const t = r.body.translation();
      const rot = r.body.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
        new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)
      );
      const home = r.mesh.userData.homePos as THREE.Vector3 | undefined;
      const movedFar = home ? Math.hypot(t.x - home.x, t.z - home.z) > 1.2 : false;
      if (up.y < 0.75 || movedFar || t.y < -2) {
        this.knockedBowlingPinIds.add(r.id);
      }
    }
    return this.knockedBowlingPinIds.size;
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findNodeByAliases, normalizeModelBounds } from '../assets/ModelSwapLoader';
import { resolveAssetUrl, withTimeout } from '../assets/AssetLoaderUtils';
import { showBossPopupSpring, hideBossPopupSpring } from '../world/Gimmicks';

export type BossState =
  | 'dormant'
  | 'intro'
  | 'chase'
  | 'windup'
  | 'slam'
  | 'spin_attack'
  | 'stunned'
  | 'hurt'
  | 'defeated';

interface FlyingArmor {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
}

interface ArmorInitialState {
  node: THREE.Object3D;
  parent: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

interface SavedEmissiveState {
  mat: THREE.MeshStandardMaterial;
  emissive: THREE.Color;
  emissiveIntensity: number;
}

interface ShockwaveSlot {
  group: THREE.Group;
  outerMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  wallMesh: THREE.Mesh;
  origin: THREE.Vector3;
  radius: number;
  maxRadius: number;
  active: boolean;
  hitPlayer: boolean;
}

const SHOCKWAVE_SEGS = 64;
const RING_COS = new Float32Array(SHOCKWAVE_SEGS + 1);
const RING_SIN = new Float32Array(SHOCKWAVE_SEGS + 1);
for (let i = 0; i <= SHOCKWAVE_SEGS; i++) {
  const a = (i / SHOCKWAVE_SEGS) * Math.PI * 2;
  RING_COS[i] = Math.cos(a);
  RING_SIN[i] = Math.sin(a);
}

function createDynamicRingGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array((SHOCKWAVE_SEGS + 1) * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < SHOCKWAVE_SEGS; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function updateFlatRingGeometry(
  geo: THREE.BufferGeometry,
  rIn: number,
  rOut: number,
  y: number
): void {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const inner = Math.max(0.1, rIn);
  const outer = Math.max(inner + 0.05, rOut);
  for (let i = 0; i <= SHOCKWAVE_SEGS; i++) {
    const c = RING_COS[i];
    const s = RING_SIN[i];
    const idx = i * 6;
    arr[idx] = inner * c;
    arr[idx + 1] = y;
    arr[idx + 2] = inner * s;
    arr[idx + 3] = outer * c;
    arr[idx + 4] = y;
    arr[idx + 5] = outer * s;
  }
  attr.needsUpdate = true;
}

function updateWallRingGeometry(
  geo: THREE.BufferGeometry,
  radius: number,
  yBot: number,
  yTop: number
): void {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const r = Math.max(0.15, radius);
  for (let i = 0; i <= SHOCKWAVE_SEGS; i++) {
    const x = r * RING_COS[i];
    const z = r * RING_SIN[i];
    const idx = i * 6;
    arr[idx] = x;
    arr[idx + 1] = yBot;
    arr[idx + 2] = z;
    arr[idx + 3] = x;
    arr[idx + 4] = yTop;
    arr[idx + 5] = z;
  }
  attr.needsUpdate = true;
}

export class ClockworkToyKing {
  public readonly group = new THREE.Group();
  public readonly pos = new THREE.Vector3(0, 4.0, -54);
  public readonly arenaCenter = new THREE.Vector3(0, 4.0, -52);
  public arenaRadius = 17.5;
  private spawnPos = new THREE.Vector3(0, 4.0, -54);

  public state: BossState = 'dormant';
  public hp = 3;
  public readonly maxHp = 3;
  public phase = 1;

  private loaded = false;
  private modelRoot?: THREE.Object3D;
  private bossRoot?: THREE.Object3D;
  private pelvis?: THREE.Object3D;
  private torso?: THREE.Object3D;
  private head?: THREE.Object3D;
  private armL?: THREE.Object3D;
  private armR?: THREE.Object3D;
  private legL?: THREE.Object3D;
  private legR?: THREE.Object3D;
  private backKey?: THREE.Object3D;
  private bellyGear?: THREE.Object3D;
  private waistRing?: THREE.Object3D;

  private armorPartsPhase1: THREE.Object3D[] = [];
  private armorPartsPhase2: THREE.Object3D[] = [];
  private armorPartsPhase3: THREE.Object3D[] = [];
  private armorInitialStates: ArmorInitialState[] = [];
  private savedEmissives: SavedEmissiveState[] = [];
  private pelvisInitialY = 1.95;
  private flyingArmors: FlyingArmor[] = [];
  private allMeshes: THREE.Mesh[] = [];

  private stateTimer = 0;
  private windupTotalDuration = 1.25;
  private spinWindupTimer = 0;
  private subHitsRemaining = 1;
  private attacksUntilStun = 2;
  private stunCooldownTimer = 0;
  private chaseMinTimer = 0;
  private lastAttackWasSpin = false;
  private slamPos = new THREE.Vector3(0, 4.0, -51.8);

  private slamTelegraphGroup: THREE.Group;
  private telegraphBorderRing: THREE.Mesh;
  private telegraphFillDisk: THREE.Mesh;
  private telegraphChargeDisk: THREE.Mesh;

  private shockwaveSlots: ShockwaveSlot[] = [];

  private weakGlowLight: THREE.PointLight;
  private stunStarsGroup = new THREE.Group();
  private crownTargetGroup = new THREE.Group();
  private crownTargetRing: THREE.Mesh;
  private crownArrowGroup = new THREE.Group();

  private hitFlashTimer = 0;
  private flashActive = false;
  private hurtSquashTimer = 0;
  private springVisibleForStun = false;
  private prevPlayerY: number | null = null;
  private walkCycle = 0;
  private yaw = 0;

  constructor(scene: THREE.Scene) {
    this.group.position.copy(this.pos);
    scene.add(this.group);

    // Clear floor telegraph circle for slam & spin windups (positioned in world space above arena trim)
    this.slamTelegraphGroup = new THREE.Group();
    this.slamTelegraphGroup.visible = false;

    this.telegraphBorderRing = new THREE.Mesh(
      new THREE.RingGeometry(2.85, 3.20, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff3344,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.telegraphBorderRing.rotation.x = -Math.PI / 2;
    this.telegraphBorderRing.renderOrder = 5;

    this.telegraphFillDisk = new THREE.Mesh(
      new THREE.CircleGeometry(2.90, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.telegraphFillDisk.rotation.x = -Math.PI / 2;
    this.telegraphFillDisk.position.y = -0.005;
    this.telegraphFillDisk.renderOrder = 5;

    this.telegraphChargeDisk = new THREE.Mesh(
      new THREE.CircleGeometry(2.88, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.telegraphChargeDisk.rotation.x = -Math.PI / 2;
    this.telegraphChargeDisk.position.y = 0.005;
    this.telegraphChargeDisk.scale.setScalar(0.12);
    this.telegraphChargeDisk.renderOrder = 5;

    this.slamTelegraphGroup.add(
      this.telegraphFillDisk,
      this.telegraphChargeDisk,
      this.telegraphBorderRing
    );
    scene.add(this.slamTelegraphGroup);

    // 2-slot constant-width vivid ground shockwave ring pool
    for (let i = 0; i < 2; i++) {
      const slotGroup = new THREE.Group();
      slotGroup.visible = false;

      const outerMesh = new THREE.Mesh(
        createDynamicRingGeometry(),
        new THREE.MeshBasicMaterial({
          color: 0xff6b1a,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      outerMesh.frustumCulled = false;
      outerMesh.renderOrder = 6;

      const coreMesh = new THREE.Mesh(
        createDynamicRingGeometry(),
        new THREE.MeshBasicMaterial({
          color: 0xfff5a8,
          transparent: true,
          opacity: 0.96,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      coreMesh.frustumCulled = false;
      coreMesh.renderOrder = 6;

      const wallMesh = new THREE.Mesh(
        createDynamicRingGeometry(),
        new THREE.MeshBasicMaterial({
          color: 0xffaa33,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      wallMesh.frustumCulled = false;
      wallMesh.renderOrder = 6;

      slotGroup.add(outerMesh, coreMesh, wallMesh);
      scene.add(slotGroup);

      this.shockwaveSlots.push({
        group: slotGroup,
        outerMesh,
        coreMesh,
        wallMesh,
        origin: new THREE.Vector3(),
        radius: 0,
        maxRadius: 16,
        active: false,
        hitPlayer: false,
      });
    }

    this.weakGlowLight = new THREE.PointLight(0xffdd44, 0, 9);
    this.group.add(this.weakGlowLight);

    // Mario-style orbiting dizzy stars tracking crown world pos while stunned
    const stunStarGeo = new THREE.OctahedronGeometry(0.32, 0);
    const stunStarMat = new THREE.MeshBasicMaterial({ color: 0xffe44d });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const st = new THREE.Mesh(stunStarGeo, stunStarMat);
      st.position.set(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45);
      st.scale.set(1.0, 0.55, 1.0);
      this.stunStarsGroup.add(st);
    }
    this.stunStarsGroup.visible = false;
    scene.add(this.stunStarsGroup);

    // Crown stomp target ring + 3D downward indicator arrow while stunned
    this.crownTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.35, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffe44d,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.crownTargetRing.rotation.x = -Math.PI / 2;
    this.crownTargetRing.position.y = 0.25;
    this.crownTargetRing.renderOrder = 6;
    this.crownTargetGroup.add(this.crownTargetRing);

    const crownArrowMat = new THREE.MeshStandardMaterial({
      color: 0xffe44d,
      emissive: 0xffaa00,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.45,
    });
    const arrowCone = new THREE.Mesh(new THREE.ConeGeometry(0.40, 0.68, 12), crownArrowMat);
    arrowCone.rotation.x = Math.PI;
    arrowCone.position.y = 0.34;
    const arrowShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.58, 10),
      crownArrowMat
    );
    arrowShaft.position.y = 0.96;
    this.crownArrowGroup.add(arrowCone, arrowShaft);
    this.crownArrowGroup.position.y = 1.05;
    this.crownTargetGroup.add(this.crownArrowGroup);
    this.crownTargetGroup.visible = false;
    scene.add(this.crownTargetGroup);
  }

  private bossMixer?: THREE.AnimationMixer;
  private bossActions = new Map<string, THREE.AnimationAction>();
  private activeBossClip: string | null = null;

  private createFallbackModel(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'BossRoot';

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd94c5a,
      roughness: 0.45,
      metalness: 0.2,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf4c44e,
      roughness: 0.25,
      metalness: 0.8,
    });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 2.8, 16), bodyMat);
    torso.name = 'Torso';
    torso.position.y = 2.0;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), bodyMat);
    head.name = 'Head';
    head.position.y = 4.1;

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 0.55, 12), goldMat);
    crown.position.y = 1.05;
    head.add(crown);

    const backKey = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 16), goldMat);
    backKey.name = 'BackWindupKey';
    backKey.position.set(0, 2.2, -1.4);

    root.add(torso, head, backKey);
    return root;
  }

  async load(modelUrl = '/models/clockwork_toy_king.glb'): Promise<void> {
    const loader = new GLTFLoader();
    const candidates = Array.from(
      new Set([resolveAssetUrl(modelUrl), resolveAssetUrl('/models/clockwork_toy_king.glb')])
    );
    let model: THREE.Object3D | null = null;
    let animations: THREE.AnimationClip[] = [];
    let lastErr: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const gltf = await withTimeout(
          loader.loadAsync(candidate),
          i === 0 ? 25000 : 20000,
          `boss model (${candidate})`
        );
        model = gltf.scene;
        animations = gltf.animations;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!model) {
      console.warn('[ClockworkToyKing] Failed to load boss model, using fallback visual:', lastErr);
      model = this.createFallbackModel();
    }

    normalizeModelBounds(model, 6.0, 0.2);
    this.modelRoot = model;
    this.group.add(model);

    const seenMaterials = new Set<THREE.MeshStandardMaterial>();
    this.savedEmissives = [];

    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.envMapIntensity = mat.metalness > 0.5 ? 1.35 : 0.85;
            mat.needsUpdate = true;
            if (!seenMaterials.has(mat)) {
              seenMaterials.add(mat);
              this.savedEmissives.push({
                mat,
                emissive: mat.emissive.clone(),
                emissiveIntensity: mat.emissiveIntensity,
              });
            }
          }
        }
        this.allMeshes.push(m);
      }
    });

    this.bossRoot = findNodeByAliases(model, ['BossRoot', 'Root']);
    this.pelvis = findNodeByAliases(model, ['Pelvis', 'Hips']);
    this.torso = findNodeByAliases(model, ['Torso', 'Chest', 'UpperBody']);
    this.head = findNodeByAliases(model, ['Head']);
    this.armL = findNodeByAliases(model, ['Shoulder_L', 'Shoulder.L', 'Arm_L', 'Arm.L']);
    this.armR = findNodeByAliases(model, ['Shoulder_R', 'Shoulder.R', 'Arm_R', 'Arm.R']);
    this.legL = findNodeByAliases(model, ['Leg_L', 'Leg.L', 'Thigh_L']);
    this.legR = findNodeByAliases(model, ['Leg_R', 'Leg.R', 'Thigh_R']);
    this.backKey = findNodeByAliases(model, ['BackWindupKey', 'WindupKey', 'BackKey', 'WeakPointKey']);
    this.bellyGear = findNodeByAliases(model, ['BellyGear', 'Gear_Belly']);
    this.waistRing = findNodeByAliases(model, ['WaistGearRing', 'Gear_Waist']);

    for (const alias of ['Armor_Shoulder_L', 'Armor_Shoulder_R', 'Pauldron_L', 'Pauldron_R']) {
      const node = findNodeByAliases(model, [alias]);
      if (node && !this.armorPartsPhase1.includes(node)) this.armorPartsPhase1.push(node);
    }
    for (const alias of ['ChestFrontShield', 'Armor_Skirt_F', 'Armor_Skirt_B']) {
      const node = findNodeByAliases(model, [alias]);
      if (node && !this.armorPartsPhase2.includes(node)) this.armorPartsPhase2.push(node);
    }
    for (const alias of ['Armor_Skirt_L', 'Armor_Skirt_R', 'CrownBand']) {
      const node = findNodeByAliases(model, [alias]);
      if (node && !this.armorPartsPhase3.includes(node)) this.armorPartsPhase3.push(node);
    }

    this.pelvisInitialY = this.pelvis?.position.y ?? 1.95;
    this.armorInitialStates = [];
    for (const part of [
      ...this.armorPartsPhase1,
      ...this.armorPartsPhase2,
      ...this.armorPartsPhase3,
    ]) {
      if (part.parent) {
        this.armorInitialStates.push({
          node: part,
          parent: part.parent,
          position: part.position.clone(),
          quaternion: part.quaternion.clone(),
          scale: part.scale.clone(),
        });
      }
    }

    if (animations.length > 0) {
      this.bossMixer = new THREE.AnimationMixer(model);
      for (const clip of animations) {
        const key = clip.name.toLowerCase();
        this.bossActions.set(key, this.bossMixer.clipAction(clip));
      }
    }

    this.loaded = true;
  }

  private playOptionalBossClip(name: string, loop = true): boolean {
    if (!this.bossMixer || this.bossActions.size === 0) return false;
    const key = name.toLowerCase();
    const act =
      this.bossActions.get(key) ??
      Array.from(this.bossActions.entries()).find(([k]) => k.includes(key))?.[1];
    if (!act) return false;
    if (this.activeBossClip === key && loop) return true;
    const prev = this.activeBossClip ? this.bossActions.get(this.activeBossClip) : undefined;
    act.reset();
    act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    act.clampWhenFinished = !loop;
    act.play();
    if (prev && prev !== act) prev.crossFadeTo(act, 0.16, false);
    this.activeBossClip = key;
    return true;
  }

  private restoreFlashMaterials(): void {
    if (!this.flashActive) return;
    for (const entry of this.savedEmissives) {
      entry.mat.emissive.copy(entry.emissive);
      entry.mat.emissiveIntensity = entry.emissiveIntensity;
    }
    this.flashActive = false;
  }

  private clearShockwaves(): void {
    for (const sw of this.shockwaveSlots) {
      sw.active = false;
      sw.hitPlayer = false;
      sw.radius = 0;
      sw.group.visible = false;
    }
  }

  private spawnShockwave(origin: THREE.Vector3): void {
    let slot = this.shockwaveSlots.find((s) => !s.active);
    if (!slot) {
      slot =
        this.shockwaveSlots[0].radius >= this.shockwaveSlots[1].radius
          ? this.shockwaveSlots[0]
          : this.shockwaveSlots[1];
    }
    slot.active = true;
    slot.hitPlayer = false;
    slot.origin.copy(origin);
    slot.radius = 1.2;
    slot.maxRadius = 16.0;
    slot.group.position.set(origin.x, this.arenaCenter.y, origin.z);
    slot.group.visible = true;

    updateFlatRingGeometry(slot.outerMesh.geometry, slot.radius - 0.34, slot.radius + 0.34, 0.22);
    updateFlatRingGeometry(slot.coreMesh.geometry, slot.radius - 0.14, slot.radius + 0.14, 0.25);
    updateWallRingGeometry(slot.wallMesh.geometry, slot.radius, 0.20, 0.50);
    (slot.outerMesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
    (slot.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.96;
    (slot.wallMesh.material as THREE.MeshBasicMaterial).opacity = 0.72;
  }

  private computeBossSpringPos(playerPos: THREE.Vector3): THREE.Vector3 {
    let dx = playerPos.x - this.pos.x;
    let dz = playerPos.z - this.pos.z;
    let len = Math.hypot(dx, dz);
    if (len < 0.1) {
      dx = this.arenaCenter.x - this.pos.x;
      dz = this.arenaCenter.z - this.pos.z;
      len = Math.hypot(dx, dz);
      if (len < 0.1) {
        dx = 0;
        dz = 1;
        len = 1;
      }
    }
    const dirX = dx / len;
    const dirZ = dz / len;

    let sx = this.pos.x + dirX * 4.8;
    let sz = this.pos.z + dirZ * 4.8;

    const acDx = sx - this.arenaCenter.x;
    const acDz = sz - this.arenaCenter.z;
    const acDist = Math.hypot(acDx, acDz);
    if (acDist > 13.8) {
      const k = 13.8 / acDist;
      sx = this.arenaCenter.x + acDx * k;
      sz = this.arenaCenter.z + acDz * k;
    }

    // If clamping near the arena rim pushed the spring too close to the boss, step toward arena center instead
    if (Math.hypot(sx - this.pos.x, sz - this.pos.z) < 4.0) {
      let cx = this.arenaCenter.x - this.pos.x;
      let cz = this.arenaCenter.z - this.pos.z;
      const cLen = Math.hypot(cx, cz);
      if (cLen < 0.1) {
        cx = 0;
        cz = 1;
      } else {
        cx /= cLen;
        cz /= cLen;
      }
      sx = this.pos.x + cx * 4.8;
      sz = this.pos.z + cz * 4.8;
      const ac2Dx = sx - this.arenaCenter.x;
      const ac2Dz = sz - this.arenaCenter.z;
      const ac2Dist = Math.hypot(ac2Dx, ac2Dz);
      if (ac2Dist > 13.8) {
        const k2 = 13.8 / ac2Dist;
        sx = this.arenaCenter.x + ac2Dx * k2;
        sz = this.arenaCenter.z + ac2Dz * k2;
      }
    }

    return new THREE.Vector3(sx, this.arenaCenter.y, sz);
  }

  startFight(): void {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.stateTimer = 2.6;
  }

  public configureArena(
    center: THREE.Vector3,
    spawnPos: THREE.Vector3,
    radius = 17.5
  ): void {
    this.arenaCenter.copy(center);
    this.spawnPos.copy(spawnPos);
    this.arenaRadius = radius;
    this.resetFight();
  }

  public resetFight(): void {
    this.hp = this.maxHp;
    this.phase = 1;
    this.state = 'dormant';
    this.stateTimer = 0;
    this.windupTotalDuration = 1.25;
    this.spinWindupTimer = 0;
    this.subHitsRemaining = 1;
    this.attacksUntilStun = 2;
    this.stunCooldownTimer = 0;
    this.chaseMinTimer = 0;
    this.lastAttackWasSpin = false;
    this.hurtSquashTimer = 0;
    this.prevPlayerY = null;
    this.springVisibleForStun = false;
    hideBossPopupSpring();

    this.pos.copy(this.spawnPos);
    this.slamPos.set(this.spawnPos.x, this.arenaCenter.y, this.spawnPos.z + 2.2);
    this.yaw = 0;
    this.walkCycle = 0;
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.visible = true;

    this.clearShockwaves();
    this.slamTelegraphGroup.visible = false;
    this.slamTelegraphGroup.scale.setScalar(1);
    this.crownTargetGroup.visible = false;
    this.weakGlowLight.intensity = 0;
    this.stunStarsGroup.visible = false;
    this.hitFlashTimer = 0;
    this.restoreFlashMaterials();
    this.flyingArmors = [];

    for (const st of this.armorInitialStates) {
      if (st.node.parent !== st.parent) {
        st.parent.add(st.node);
      }
      st.node.position.copy(st.position);
      st.node.quaternion.copy(st.quaternion);
      st.node.scale.copy(st.scale);
      st.node.visible = true;
    }

    if (this.torso) this.torso.rotation.set(0, 0, 0);
    if (this.head) this.head.rotation.set(0, 0, 0);
    if (this.armL) this.armL.rotation.set(0, 0, 0);
    if (this.armR) this.armR.rotation.set(0, 0, 0);
    if (this.legL) this.legL.rotation.set(0, 0, 0);
    if (this.legR) this.legR.rotation.set(0, 0, 0);
    if (this.pelvis) {
      this.pelvis.rotation.set(0, 0, 0);
      this.pelvis.position.y = this.pelvisInitialY;
    }
    if (this.modelRoot) this.modelRoot.rotation.set(0, 0, 0);
  }

  private getRequiredAttacksForPhase(phase: number): number {
    if (phase <= 1) return 2;
    if (phase === 2) return 2;
    return 3;
  }

  private getStunCooldownForPhase(phase: number): number {
    if (phase <= 1) return 6.5;
    if (phase === 2) return 8.5;
    return 11.0;
  }

  private getStunDurationForPhase(phase: number): number {
    if (phase <= 1) return 5.2;
    if (phase === 2) return 4.6;
    return 4.2;
  }

  private getChaseDurationForPhase(phase: number): number {
    if (phase <= 1) return 2.4;
    if (phase === 2) return 2.2;
    return 2.0;
  }

  private beginAttackCycle(): void {
    this.attacksUntilStun = this.getRequiredAttacksForPhase(this.phase);
    this.stunCooldownTimer = this.getStunCooldownForPhase(this.phase);
  }

  private enterChase(resetCycle: boolean): void {
    this.state = 'chase';
    this.stateTimer = this.getChaseDurationForPhase(this.phase);
    this.chaseMinTimer = 0.85;
    if (resetCycle) {
      this.beginAttackCycle();
    }
  }

  private onAttackSequenceFinished(): void {
    this.attacksUntilStun = Math.max(0, this.attacksUntilStun - 1);
    if (this.attacksUntilStun <= 0 && this.stunCooldownTimer <= 0) {
      this.state = 'stunned';
      this.stateTimer = this.getStunDurationForPhase(this.phase);
    } else {
      this.enterChase(false);
    }
  }

  public getAttackCycleDebug(): {
    attacksUntilStun: number;
    stunCooldownTimer: number;
    stateTimer: number;
  } {
    return {
      attacksUntilStun: this.attacksUntilStun,
      stunCooldownTimer: this.stunCooldownTimer,
      stateTimer: this.stateTimer,
    };
  }

  isWeakPointExposed(): boolean {
    return this.state === 'stunned';
  }

  getWeakPointWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    if (this.head) {
      out.set(0, 1.15, 0);
      this.head.localToWorld(out);
      return out;
    }
    return out.set(this.pos.x, this.pos.y + 4.8, this.pos.z);
  }

  private detachArmorParts(parts: THREE.Object3D[]): void {
    for (const part of parts) {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      part.getWorldPosition(worldPos);
      part.getWorldQuaternion(worldQuat);
      this.group.parent?.attach(part);
      part.position.copy(worldPos);
      part.quaternion.copy(worldQuat);

      const outDir = worldPos.clone().sub(this.pos);
      outDir.y = 0;
      if (outDir.lengthSq() < 0.01) outDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      outDir.normalize();

      this.flyingArmors.push({
        mesh: part,
        vel: new THREE.Vector3(
          outDir.x * (7 + Math.random() * 5),
          11 + Math.random() * 5,
          outDir.z * (7 + Math.random() * 5)
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        life: 2.2,
      });
    }
  }

  hitWeakPoint(onPhaseHit: (newHp: number, hitPos: THREE.Vector3) => void): boolean {
    if (this.state !== 'stunned' || this.hp <= 0) return false;
    const hitPos = this.getWeakPointWorldPos();

    hideBossPopupSpring();
    this.springVisibleForStun = false;
    this.crownTargetGroup.visible = false;
    this.stunStarsGroup.visible = false;
    this.weakGlowLight.intensity = 0;
    this.clearShockwaves();

    this.hp = Math.max(0, this.hp - 1);
    this.hitFlashTimer = 0.28;
    this.hurtSquashTimer = 0.55;

    if (this.hp === 2) {
      this.detachArmorParts(this.armorPartsPhase1);
      this.phase = 2;
    } else if (this.hp === 1) {
      this.detachArmorParts(this.armorPartsPhase2);
      this.phase = 3;
    } else {
      this.detachArmorParts(this.armorPartsPhase3);
    }

    onPhaseHit(this.hp, hitPos);

    if (this.hp <= 0) {
      this.state = 'defeated';
      this.stateTimer = 2.4;
    } else {
      this.state = 'hurt';
      this.stateTimer = 1.35;
    }
    return true;
  }

  private resetLimbsLerp(dt: number): void {
    const k = 1 - Math.exp(-8 * dt);
    if (this.torso) {
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0, k);
      this.torso.rotation.y = THREE.MathUtils.lerp(this.torso.rotation.y, 0, k);
    }
    if (this.head) {
      this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, 0, k);
      this.head.rotation.z = THREE.MathUtils.lerp(this.head.rotation.z, 0, k);
    }
    if (this.armL) {
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0, k);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0, k);
    }
    if (this.armR) {
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0, k);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0, k);
    }
    if (this.legL) this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, 0, k);
    if (this.legR) this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, 0, k);
    if (this.pelvis) {
      this.pelvis.position.y = THREE.MathUtils.lerp(this.pelvis.position.y, this.pelvisInitialY, k);
    }
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerIsHipDiving: boolean,
    playerFever: boolean,
    callbacks: {
      onBossSlam: (pos: THREE.Vector3) => void;
      onPlayerHit: (fromPos: THREE.Vector3) => void;
      onWeakHit: (newHp: number, hitPos: THREE.Vector3) => void;
      onDefeated: (pos: THREE.Vector3) => void;
    }
  ): void {
    if (!this.loaded) return;

    this.bossMixer?.update(dt);
    if (this.bossMixer && this.bossActions.size > 0) {
      const clipMap: Record<BossState, [string, boolean]> = {
        dormant: ['idle', true],
        intro: ['idle', true],
        chase: ['walk', true],
        windup: ['windup', false],
        slam: ['slam', false],
        spin_attack: ['spin', true],
        stunned: ['stunned', true],
        hurt: ['hurt', false],
        defeated: ['defeat', false],
      };
      const [cname, loop] = clipMap[this.state];
      this.playOptionalBossClip(cname, loop);
    }

    // Update flying armor debris
    for (let i = this.flyingArmors.length - 1; i >= 0; i--) {
      const f = this.flyingArmors[i];
      f.life -= dt;
      f.vel.y -= 24 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.rotVel.x * dt;
      f.mesh.rotation.y += f.rotVel.y * dt;
      f.mesh.rotation.z += f.rotVel.z * dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        this.flyingArmors.splice(i, 1);
      }
    }

    // Continuous clockwork gear spin (backKey is decorative only)
    const gearSpeed = this.state === 'stunned' ? 0.5 : this.phase * 2.4;
    if (this.bellyGear) this.bellyGear.rotation.y += dt * gearSpeed;
    if (this.waistRing) this.waistRing.rotation.y += dt * gearSpeed * 0.5;
    if (this.backKey) this.backKey.rotation.z += dt * (this.state === 'stunned' ? 1.5 : 2.5);

    // Hit white-gold emissive flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (!this.flashActive) {
        this.flashActive = true;
        for (const entry of this.savedEmissives) {
          entry.mat.emissive.setHex(0xfff0aa);
          entry.mat.emissiveIntensity = 1.4;
        }
      }
    } else if (this.flashActive) {
      this.restoreFlashMaterials();
    }

    // Hurt elastic squash recovery
    if (this.hurtSquashTimer > 0) {
      this.hurtSquashTimer = Math.max(0, this.hurtSquashTimer - dt);
    }

    // Expanding constant-width ground shockwave rings
    const waveSpeed = 7.8 + (this.phase - 1) * 0.8;
    for (const sw of this.shockwaveSlots) {
      if (!sw.active) continue;
      sw.radius += dt * waveSpeed;
      const fade = sw.radius < sw.maxRadius - 2.2 ? 1.0 : Math.max(0, (sw.maxRadius - sw.radius) / 2.2);

      updateFlatRingGeometry(sw.outerMesh.geometry, sw.radius - 0.34, sw.radius + 0.34, 0.22);
      updateFlatRingGeometry(sw.coreMesh.geometry, sw.radius - 0.14, sw.radius + 0.14, 0.25);
      updateWallRingGeometry(sw.wallMesh.geometry, sw.radius, 0.20, 0.50);

      (sw.outerMesh.material as THREE.MeshBasicMaterial).opacity = 0.92 * fade;
      (sw.coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.96 * fade;
      (sw.wallMesh.material as THREE.MeshBasicMaterial).opacity = 0.72 * fade;

      if (!sw.hitPlayer && sw.radius < sw.maxRadius - 0.6) {
        const dPlayer = Math.hypot(playerPos.x - sw.origin.x, playerPos.z - sw.origin.z);
        const heightAboveArena = playerPos.y - this.arenaCenter.y;
        if (Math.abs(dPlayer - sw.radius) < 0.46 && heightAboveArena < 0.62) {
          sw.hitPlayer = true;
          callbacks.onPlayerHit(this.pos);
        }
      }

      if (sw.radius >= sw.maxRadius) {
        sw.active = false;
        sw.group.visible = false;
      }
    }

    // Manage stunned popup spring, crown target visuals & stomp/hip-drop hit detection
    if (this.state === 'stunned') {
      if (!this.springVisibleForStun) {
        if (this.stateTimer <= 0.1) {
          this.stateTimer = this.getStunDurationForPhase(this.phase);
        }
        showBossPopupSpring(this.computeBossSpringPos(playerPos));
        this.springVisibleForStun = true;
      }

      const wp = this.getWeakPointWorldPos();
      const nowSec = performance.now() * 0.001;
      this.weakGlowLight.position.copy(wp).sub(this.pos);
      this.weakGlowLight.intensity = 7.0 + Math.sin(nowSec * 14.0) * 3.0;

      this.stunStarsGroup.visible = true;
      this.stunStarsGroup.position.set(wp.x, wp.y + 0.55, wp.z);
      this.stunStarsGroup.rotation.y += dt * 4.5;

      this.crownTargetGroup.visible = true;
      this.crownTargetGroup.position.copy(wp);
      this.crownArrowGroup.rotation.y += dt * 3.0;
      this.crownArrowGroup.position.y = 1.05 + Math.sin(nowSec * 6.0) * 0.25;
      const ringPulse = 1.0 + Math.sin(nowSec * 7.0) * 0.1;
      this.crownTargetRing.scale.setScalar(ringPulse);

      const playerVelY =
        this.prevPlayerY !== null && dt > 0.0001
          ? (playerPos.y - this.prevPlayerY) / dt
          : 0;
      const horiz = Math.hypot(playerPos.x - wp.x, playerPos.z - wp.z);
      const dy = playerPos.y - wp.y;
      const crossedDown =
        this.prevPlayerY !== null &&
        this.prevPlayerY >= wp.y - 1.0 &&
        playerPos.y <= wp.y + 1.5 &&
        playerVelY < 0;

      const isHipDropWindupRising = playerIsHipDiving && playerVelY > 0.25;
      const hitByHipDrop =
        playerIsHipDiving &&
        playerVelY < -3.0 &&
        horiz < 2.95 &&
        ((dy > -2.2 && dy < 1.8) || crossedDown);
      const hitByStomp =
        !isHipDropWindupRising &&
        horiz < 2.55 &&
        ((dy > -1.45 && dy < 1.35 && playerVelY < 1.0) || crossedDown);
      const hitByFever = playerFever && horiz < 2.8 && dy > -1.4 && dy < 1.8;

      if (hitByHipDrop || hitByStomp || hitByFever) {
        this.hitWeakPoint(callbacks.onWeakHit);
        this.prevPlayerY = playerPos.y;
        return;
      }
    } else {
      if (this.springVisibleForStun) {
        hideBossPopupSpring();
        this.springVisibleForStun = false;
      }
      this.weakGlowLight.intensity = 0;
      this.stunStarsGroup.visible = false;
      this.crownTargetGroup.visible = false;
    }

    // State machine
    if (
      this.state === 'chase' ||
      this.state === 'windup' ||
      this.state === 'slam' ||
      this.state === 'spin_attack'
    ) {
      this.stunCooldownTimer = Math.max(0, this.stunCooldownTimer - dt);
    }
    this.stateTimer -= dt;
    const toPlayerX = playerPos.x - this.pos.x;
    const toPlayerZ = playerPos.z - this.pos.z;
    const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);
    const targetYaw = Math.atan2(toPlayerX, toPlayerZ);

    switch (this.state) {
      case 'dormant': {
        this.slamTelegraphGroup.visible = false;
        this.resetLimbsLerp(dt);
        if (this.bossRoot) {
          this.bossRoot.position.y = Math.sin(performance.now() * 0.002) * 0.08;
        }
        break;
      }

      case 'intro': {
        this.slamTelegraphGroup.visible = false;
        const t01 = 1 - Math.max(0, this.stateTimer / 2.6);
        this.yaw = 0;
        if (t01 < 0.4) {
          const drop = Math.pow(1 - t01 / 0.4, 2) * 14;
          this.group.position.y = this.pos.y + drop;
        } else {
          this.group.position.y = this.pos.y;
          if (this.armL) this.armL.rotation.x = -2.2 * Math.sin((t01 - 0.4) * Math.PI * 1.4);
          if (this.armR) this.armR.rotation.x = -2.2 * Math.sin((t01 - 0.4) * Math.PI * 1.4);
        }
        if (this.stateTimer <= 0) {
          this.group.position.y = this.pos.y;
          this.enterChase(true);
        }
        break;
      }

      case 'chase': {
        this.slamTelegraphGroup.visible = false;
        this.resetLimbsLerp(dt);
        this.chaseMinTimer = Math.max(0, this.chaseMinTimer - dt);
        if (this.modelRoot && !this.torso) {
          this.modelRoot.rotation.x = THREE.MathUtils.lerp(
            this.modelRoot.rotation.x,
            0,
            1 - Math.exp(-8 * dt)
          );
          this.modelRoot.rotation.z = Math.sin(this.walkCycle) * 0.08;
        }
        const diff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
        this.yaw += diff * Math.min(1, dt * 2.6);

        const moveSpd = 3.0 + this.phase * 0.7;
        if (distToPlayer > 4.2) {
          this.pos.x += Math.sin(this.yaw) * moveSpd * dt;
          this.pos.z += Math.cos(this.yaw) * moveSpd * dt;
          this.walkCycle += dt * (4.2 + this.phase * 0.8);
          if (this.legL) this.legL.rotation.x = Math.sin(this.walkCycle) * 0.42;
          if (this.legR) this.legR.rotation.x = -Math.sin(this.walkCycle) * 0.42;
          if (this.armL) this.armL.rotation.x = -Math.sin(this.walkCycle) * 0.28;
          if (this.armR) this.armR.rotation.x = Math.sin(this.walkCycle) * 0.28;
        }

        // Keep inside arena
        const dxA = this.pos.x - this.arenaCenter.x;
        const dzA = this.pos.z - this.arenaCenter.z;
        const rA = Math.hypot(dxA, dzA);
        if (rA > this.arenaRadius - 4.5) {
          const s = (this.arenaRadius - 4.5) / rA;
          this.pos.x = this.arenaCenter.x + dxA * s;
          this.pos.z = this.arenaCenter.z + dzA * s;
        }

        if (this.stateTimer <= 0 || (this.chaseMinTimer <= 0 && distToPlayer < 4.8)) {
          const spinChance = this.phase === 3 ? 0.5 : this.phase === 2 ? 0.35 : 0;
          if (!this.lastAttackWasSpin && spinChance > 0 && Math.random() < spinChance) {
            this.lastAttackWasSpin = true;
            this.state = 'spin_attack';
            this.spinWindupTimer = 0.75;
            this.stateTimer = 2.65;
          } else {
            this.lastAttackWasSpin = false;
            this.state = 'windup';
            this.windupTotalDuration = this.phase === 1 ? 1.25 : this.phase === 2 ? 1.15 : 1.05;
            this.stateTimer = this.windupTotalDuration;
            this.subHitsRemaining = this.phase >= 2 ? 2 : 1;
            this.slamPos.set(
              this.pos.x + Math.sin(this.yaw) * 2.2,
              this.arenaCenter.y,
              this.pos.z + Math.cos(this.yaw) * 2.2
            );
          }
        }
        break;
      }

      case 'windup': {
        // Track player until final 0.35s, then lock slam target so player can dodge reliably
        if (this.stateTimer > 0.35) {
          const diff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
          this.yaw += diff * Math.min(1, dt * 3.0);
          this.slamPos.set(
            this.pos.x + Math.sin(this.yaw) * 2.2,
            this.arenaCenter.y,
            this.pos.z + Math.cos(this.yaw) * 2.2
          );
        }

        const k = THREE.MathUtils.clamp(
          1 - Math.max(0, this.stateTimer) / Math.max(0.1, this.windupTotalDuration),
          0,
          1
        );
        if (this.armL) this.armL.rotation.x = THREE.MathUtils.lerp(0, -2.5, k);
        if (this.armR) this.armR.rotation.x = THREE.MathUtils.lerp(0, -2.5, k);
        if (this.torso) this.torso.rotation.x = THREE.MathUtils.lerp(0, -0.25, k);
        if (this.modelRoot && !this.torso) {
          this.modelRoot.rotation.x = THREE.MathUtils.lerp(0, -0.28, k);
        }

        this.slamTelegraphGroup.visible = true;
        this.slamTelegraphGroup.position.set(
          this.slamPos.x,
          this.arenaCenter.y + 0.18,
          this.slamPos.z
        );
        this.slamTelegraphGroup.scale.setScalar(1.0);
        this.telegraphChargeDisk.scale.setScalar(THREE.MathUtils.lerp(0.12, 1.0, k));
        (this.telegraphBorderRing.material as THREE.MeshBasicMaterial).opacity =
          0.78 + 0.22 * Math.sin(k * Math.PI * 6);
        (this.telegraphChargeDisk.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.25 * k;

        if (this.stateTimer <= 0) {
          this.slamTelegraphGroup.visible = false;
          this.state = 'slam';
          this.stateTimer = 0.55;

          // Slam impact!
          if (this.armL) this.armL.rotation.x = 0.72;
          if (this.armR) this.armR.rotation.x = 0.72;
          if (this.torso) this.torso.rotation.x = 0.45;
          if (this.modelRoot && !this.torso) this.modelRoot.rotation.x = 0.36;

          const impactPos = new THREE.Vector3(
            this.slamPos.x,
            this.arenaCenter.y + 0.12,
            this.slamPos.z
          );
          this.spawnShockwave(impactPos);
          callbacks.onBossSlam(impactPos);

          // Direct slam hit inside telegraph circle
          const horizImpact = Math.hypot(playerPos.x - this.slamPos.x, playerPos.z - this.slamPos.z);
          if (horizImpact < 2.95 && playerPos.y - this.arenaCenter.y < 1.35) {
            callbacks.onPlayerHit(this.pos);
          }
        }
        break;
      }

      case 'slam': {
        this.slamTelegraphGroup.visible = false;
        if (this.stateTimer <= 0) {
          this.subHitsRemaining -= 1;
          if (this.subHitsRemaining > 0) {
            this.state = 'windup';
            this.windupTotalDuration = this.phase >= 3 ? 0.90 : 0.95;
            this.stateTimer = this.windupTotalDuration;
            this.slamPos.set(
              this.pos.x + Math.sin(this.yaw) * 2.2,
              this.arenaCenter.y,
              this.pos.z + Math.cos(this.yaw) * 2.2
            );
          } else {
            this.onAttackSequenceFinished();
          }
        }
        break;
      }

      case 'spin_attack': {
        if (this.spinWindupTimer > 0) {
          this.spinWindupTimer = Math.max(0, this.spinWindupTimer - dt);
          const k = THREE.MathUtils.clamp(1 - this.spinWindupTimer / 0.75, 0, 1);
          if (this.armL) this.armL.rotation.z = THREE.MathUtils.lerp(0, -1.2, k);
          if (this.armR) this.armR.rotation.z = THREE.MathUtils.lerp(0, 1.2, k);

          this.slamTelegraphGroup.visible = true;
          this.slamTelegraphGroup.position.set(this.pos.x, this.arenaCenter.y + 0.18, this.pos.z);
          this.slamTelegraphGroup.scale.setScalar(3.3 / 2.9);
          this.telegraphChargeDisk.scale.setScalar(THREE.MathUtils.lerp(0.12, 1.0, k));
          (this.telegraphBorderRing.material as THREE.MeshBasicMaterial).opacity =
            0.78 + 0.22 * Math.sin(k * Math.PI * 5);
          (this.telegraphChargeDisk.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.25 * k;
        } else {
          this.slamTelegraphGroup.visible = false;
          this.yaw += dt * 9.5;
          if (this.armL) this.armL.rotation.z = -1.2;
          if (this.armR) this.armR.rotation.z = 1.2;
          const dirX = toPlayerX / Math.max(0.1, distToPlayer);
          const dirZ = toPlayerZ / Math.max(0.1, distToPlayer);
          this.pos.x += dirX * 4.6 * dt;
          this.pos.z += dirZ * 4.6 * dt;

          // Keep inside arena
          const dxA = this.pos.x - this.arenaCenter.x;
          const dzA = this.pos.z - this.arenaCenter.z;
          const rA = Math.hypot(dxA, dzA);
          if (rA > this.arenaRadius - 4.5) {
            const s = (this.arenaRadius - 4.5) / rA;
            this.pos.x = this.arenaCenter.x + dxA * s;
            this.pos.z = this.arenaCenter.z + dzA * s;
          }

          if (distToPlayer < 3.3 && playerPos.y - this.arenaCenter.y < 2.2) {
            callbacks.onPlayerHit(this.pos);
          }
        }

        if (this.stateTimer <= 0) {
          this.slamTelegraphGroup.visible = false;
          this.onAttackSequenceFinished();
        }
        break;
      }

      case 'stunned': {
        this.slamTelegraphGroup.visible = false;
        // Keep boss stunned while player is diving down from a spring leap above the crown
        if (playerPos.y > this.arenaCenter.y + 4.0 && distToPlayer < 7.0) {
          this.stateTimer = Math.max(this.stateTimer, 0.45);
        }

        // Crouch slightly with head/crown upright so Buu can easily stomp or hip-drop the crown!
        const k = 1 - Math.exp(-8 * dt);
        if (this.torso) this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0.24, k);
        if (this.pelvis) {
          this.pelvis.position.y = THREE.MathUtils.lerp(
            this.pelvis.position.y,
            this.pelvisInitialY - 0.48,
            k
          );
        }
        if (this.armL) this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, 0.55, k);
        if (this.armR) this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, 0.55, k);
        if (this.head) {
          this.head.rotation.y = Math.sin(performance.now() * 0.014) * 0.16;
          this.head.rotation.z = Math.sin(performance.now() * 0.01) * 0.08;
        }
        if (this.modelRoot && !this.torso) {
          this.modelRoot.rotation.x = THREE.MathUtils.lerp(this.modelRoot.rotation.x, 0.16, k);
          this.modelRoot.rotation.z = Math.sin(performance.now() * 0.018) * 0.06;
        }

        if (this.stateTimer <= 0) {
          if (this.head) this.head.rotation.set(0, 0, 0);
          if (this.modelRoot && !this.torso) this.modelRoot.rotation.set(0, 0, 0);
          hideBossPopupSpring();
          this.springVisibleForStun = false;
          this.crownTargetGroup.visible = false;
          this.stunStarsGroup.visible = false;
          this.weakGlowLight.intensity = 0;
          this.enterChase(true);
        }
        break;
      }

      case 'hurt': {
        this.slamTelegraphGroup.visible = false;
        if (this.torso) {
          this.torso.rotation.x = -0.35 * Math.sin((this.stateTimer / 1.35) * Math.PI);
        }
        if (this.head) {
          this.head.rotation.y = Math.sin(performance.now() * 0.03) * 0.35;
          this.head.rotation.z = 0;
        }
        if (this.modelRoot && !this.torso) {
          this.modelRoot.rotation.x = -0.28 * Math.sin((this.stateTimer / 1.35) * Math.PI);
        }
        if (this.stateTimer <= 0) {
          if (this.head) this.head.rotation.set(0, 0, 0);
          if (this.modelRoot && !this.torso) this.modelRoot.rotation.set(0, 0, 0);
          this.enterChase(true);
        }
        break;
      }

      case 'defeated': {
        this.slamTelegraphGroup.visible = false;
        this.clearShockwaves();
        this.yaw += dt * 6.0;
        const baseScale = Math.max(0.01, this.stateTimer / 2.4);
        this.group.scale.setScalar(baseScale);
        if (this.stateTimer <= 0) {
          this.group.visible = false;
          callbacks.onDefeated(this.arenaCenter.clone());
          this.state = 'dormant'; // Prevent re-firing
        }
        break;
      }
    }

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;

    if (this.state !== 'defeated') {
      if (this.hurtSquashTimer > 0) {
        const k = 1 - this.hurtSquashTimer / 0.55;
        const bounce = Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 4.2) * (1 - k);
        const sy = 1 - 0.38 * bounce;
        const sxz = 1 + 0.24 * bounce;
        this.group.scale.set(sxz, sy, sxz);
      } else {
        this.group.scale.set(1, 1, 1);
      }
    }

    // Gentle body pushout so player doesn't walk straight through boss center (except while diving/jumping over crown)
    if (this.state !== 'defeated' && this.group.visible && !playerIsHipDiving) {
      const dx = playerPos.x - this.pos.x;
      const dz = playerPos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.8 && d > 0.001 && playerPos.y < this.pos.y + 3.2) {
        playerPos.x = this.pos.x + (dx / d) * 1.8;
        playerPos.z = this.pos.z + (dz / d) * 1.8;
      }
    }

    this.prevPlayerY = playerPos.y;
  }
}

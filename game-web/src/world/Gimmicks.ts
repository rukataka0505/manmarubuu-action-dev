import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { getProceduralTextures } from '../assets/ProceduralTextures';
import type { PbrAssets } from '../assets/PbrAssets';
import type { PhysicsWorld } from '../core/PhysicsWorld';

export interface RedSpring {
  pos: THREE.Vector3;
  group: THREE.Group;
  cap: THREE.Object3D;
  baseCapY: number;
  coil?: THREE.Object3D;
  bounceVel: number;
  animTimer: number;
  active?: boolean;
  isBossPopup?: boolean;
  triggerRadius?: number;
  spawnAnim?: number;
  markerGroup?: THREE.Group;
  auraRing?: THREE.Mesh;
  pulseRing?: THREE.Mesh;
  glowLight?: THREE.PointLight;
}

let activeBossPopupSpring: RedSpring | null = null;

export function showBossPopupSpring(pos: THREE.Vector3): void {
  if (!activeBossPopupSpring) return;
  activeBossPopupSpring.pos.copy(pos);
  activeBossPopupSpring.group.position.copy(pos);
  activeBossPopupSpring.active = true;
  activeBossPopupSpring.group.visible = true;
  activeBossPopupSpring.spawnAnim = 0;
  activeBossPopupSpring.animTimer = 0;
  activeBossPopupSpring.group.scale.setScalar(0.01);
}

export function hideBossPopupSpring(): void {
  if (!activeBossPopupSpring) return;
  activeBossPopupSpring.active = false;
  activeBossPopupSpring.group.visible = false;
  activeBossPopupSpring.animTimer = 0;
}

export interface CheckpointFlag {
  pos: THREE.Vector3;
  flagMesh: THREE.Mesh;
  activated: boolean;
}

export interface VictoryChest {
  pos: THREE.Vector3;
  group: THREE.Group;
  lidPivot: THREE.Group;
  spawned: boolean;
  opened: boolean;
  openProgress: number;
}

export interface GimmickCustomFactories {
  createTrampolineRed: () => THREE.Group | null;
  createTrampolineWood: () => THREE.Group | null;
  createTrampolinePastel: () => THREE.Group | null;
  createStarGate: () => THREE.Group | null;
  createCheckpointFlag: () => THREE.Group | null;
}

export class GimmicksManager {
  public readonly group = new THREE.Group();
  public springs: RedSpring[] = [];
  public checkpoints: CheckpointFlag[] = [];
  public gateStarLamps: THREE.Mesh[] = [];
  public rainbowBridgeGroup = new THREE.Group();
  public rainbowBridgeOpen = false;
  public bridgeOpenAnim = 0;
  public victoryChest!: VictoryChest;

  private bridgeColliderAdded = false;
  private bridgeStartY = 1.22;
  private bridgeMidY = 2.39;
  private bridgeStartZ = -13.8;
  private bridgeMidZ = -24.0;
  private bridgeHalfLen = 10.35;
  private bridgeWidth = 5.2;
  private bridgeSlopeAngle = Math.atan2(2.8, 20.4);
  private textures = getProceduralTextures();
  private pbr?: PbrAssets;
  private factories?: GimmickCustomFactories;
  private physics?: PhysicsWorld;
  private bossLockColliders: RAPIER.Collider[] = [];

  constructor(scene: THREE.Scene, pbr?: PbrAssets) {
    scene.add(this.group);
    scene.add(this.rainbowBridgeGroup);
    this.pbr = pbr;
  }

  dispose(): void {
    if (activeBossPopupSpring && this.springs.includes(activeBossPopupSpring)) {
      activeBossPopupSpring = null;
    }
    this.group.parent?.remove(this.group);
    this.rainbowBridgeGroup.parent?.remove(this.rainbowBridgeGroup);
  }

  setCustomFactories(factories: GimmickCustomFactories): void {
    this.factories = factories;
  }

  registerBossLockCollider(collider: RAPIER.Collider): void {
    if (this.rainbowBridgeOpen) {
      this.physics?.removeStaticCollider(collider);
      return;
    }
    this.bossLockColliders.push(collider);
  }

  isBossArenaPhysicallyLocked(): boolean {
    return this.bossLockColliders.length > 0;
  }

  addRedSpring(
    physics: PhysicsWorld,
    pos: THREE.Vector3,
    bounceVel = 22.0,
    variant: 'red' | 'wood' | 'pastel' = 'red'
  ): RedSpring {
    const g = new THREE.Group();
    g.position.copy(pos);

    const custom =
      variant === 'wood'
        ? this.factories?.createTrampolineWood()
        : variant === 'pastel'
          ? this.factories?.createTrampolinePastel()
          : this.factories?.createTrampolineRed();

    let cap: THREE.Object3D;
    let coil: THREE.Object3D | undefined;
    let baseCapY = variant === 'pastel' ? 0.50 : 1.16;

    if (custom) {
      custom.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      g.add(custom);
      cap = custom.getObjectByName('Cap') ?? custom;
      coil = custom.getObjectByName('Coil') ?? undefined;
      baseCapY = cap.position.y;
    } else {
      const capMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.24, 0.28, 32),
        new THREE.MeshPhysicalMaterial({ color: variant === 'wood' ? 0xc68a48 : 0xdc2838, roughness: 0.35 })
      );
      capMesh.position.y = baseCapY;
      capMesh.castShadow = true;
      g.add(capMesh);
      cap = capMesh;
    }

    this.group.add(g);

    const colliderH = variant === 'pastel' ? 0.28 : 0.55;
    physics.addStaticCylinder(pos.x, pos.y + colliderH, pos.z, colliderH, 1.26);

    const spring: RedSpring = {
      pos: pos.clone(),
      group: g,
      cap,
      baseCapY,
      coil,
      bounceVel,
      animTimer: 0,
    };
    this.springs.push(spring);
    return spring;
  }

  initBossPopupSpring(bounceVel = 22.2): RedSpring {
    const g = new THREE.Group();
    g.visible = false;
    this.group.add(g);

    const bodyGroup = new THREE.Group();
    bodyGroup.scale.set(1.05, 0.72, 1.05);
    g.add(bodyGroup);

    const custom = this.factories?.createTrampolineRed();
    let cap: THREE.Object3D;
    let coil: THREE.Object3D | undefined;
    let baseCapY = 1.16;

    if (custom) {
      custom.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      bodyGroup.add(custom);
      cap = custom.getObjectByName('Cap') ?? custom;
      coil = custom.getObjectByName('Coil') ?? undefined;
      baseCapY = cap.position.y;
    } else {
      const coilMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 1.0, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffd23f,
          metalness: 0.75,
          roughness: 0.25,
          emissive: 0xff9900,
          emissiveIntensity: 0.3,
        })
      );
      coilMesh.position.y = 0.55;
      coilMesh.castShadow = true;
      const capMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.24, 0.28, 32),
        new THREE.MeshPhysicalMaterial({
          color: 0xe6293a,
          roughness: 0.28,
          emissive: 0xff2233,
          emissiveIntensity: 0.35,
        })
      );
      capMesh.position.y = baseCapY;
      capMesh.castShadow = true;
      bodyGroup.add(coilMesh, capMesh);
      cap = capMesh;
      coil = coilMesh;
    }

    // Glowing golden-red rim ring around the top bumper edge (visible above scaled bumper)
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.26, 0.08, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.96;
    rimRing.renderOrder = 4;
    g.add(rimRing);

    // Floor glowing aura ring (above Boss Arena brass trim y=0.14)
    const auraRing = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.78, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff5a36,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.19;
    auraRing.renderOrder = 4;
    g.add(auraRing);

    // Expanding pulse ripple ring
    const pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(1.45, 1.68, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = 0.20;
    pulseRing.renderOrder = 4;
    g.add(pulseRing);

    // Warm point light illuminating the popup spring
    const glowLight = new THREE.PointLight(0xff7733, 7.5, 10);
    glowLight.position.set(0, 1.6, 0);
    g.add(glowLight);

    // Overhead 3D downward arrow marker (outside bodyGroup so vertical squash doesn't affect it)
    const markerGroup = new THREE.Group();
    markerGroup.position.set(0, 2.25, 0);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0xffd84d,
      emissive: 0xff7a00,
      emissiveIntensity: 0.85,
      roughness: 0.22,
      metalness: 0.5,
    });
    const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.72, 12), arrowMat);
    coneMesh.rotation.x = Math.PI;
    coneMesh.position.y = 0.36;
    const shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.64, 10), arrowMat);
    shaftMesh.position.y = 1.02;
    markerGroup.add(coneMesh, shaftMesh);
    g.add(markerGroup);

    const spring: RedSpring = {
      pos: new THREE.Vector3(),
      group: g,
      cap,
      baseCapY,
      coil,
      bounceVel,
      animTimer: 0,
      active: false,
      isBossPopup: true,
      triggerRadius: 1.85,
      spawnAnim: 1,
      markerGroup,
      auraRing,
      pulseRing,
      glowLight,
    };
    this.springs.push(spring);
    activeBossPopupSpring = spring;
    return spring;
  }

  addCheckpoint(pos: THREE.Vector3): CheckpointFlag {
    const g = new THREE.Group();
    g.position.copy(pos);

    const customFlag = this.factories?.createCheckpointFlag();
    let flagMesh: THREE.Mesh;

    if (customFlag) {
      customFlag.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      g.add(customFlag);
      const foundCloth = customFlag.getObjectByName('FlagCloth');
      if (foundCloth instanceof THREE.Mesh) {
        // Clone material per checkpoint so activating one flag does not recolor all others
        foundCloth.material = new THREE.MeshStandardMaterial({
          color: 0xe2495a,
          roughness: 0.54,
          envMapIntensity: 0.45,
        });
        flagMesh = foundCloth;
      } else {
        flagMesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.36, 1.0, 4),
          new THREE.MeshStandardMaterial({ color: 0xe2495a, roughness: 0.54 })
        );
        flagMesh.rotation.z = -Math.PI / 2;
        flagMesh.position.set(0.55, 2.34, 0);
        g.add(flagMesh);
      }
    } else {
      const oak = this.pbr?.cloneMaps('oakVeneer', 1, 2);
      const poleMat = new THREE.MeshStandardMaterial({
        color: 0xd9a262,
        map: oak?.diff ?? null,
        normalMap: oak?.nor ?? null,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.48,
        envMapIntensity: 0.5,
      });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 14), poleMat);
      pole.position.y = 1.4;
      pole.castShadow = true;

      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xe2af3c, metalness: 0.8, roughness: 0.25 })
      );
      ball.position.y = 2.86;
      ball.castShadow = true;

      flagMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 1.0, 4),
        new THREE.MeshStandardMaterial({ color: 0xe2495a, roughness: 0.50, envMapIntensity: 0.45 })
      );
      flagMesh.rotation.z = -Math.PI / 2;
      flagMesh.position.set(0.60, 2.38, 0);
      flagMesh.castShadow = true;
      g.add(pole, ball, flagMesh);
    }

    this.group.add(g);

    const cp: CheckpointFlag = { pos: pos.clone(), flagMesh, activated: false };
    this.checkpoints.push(cp);
    return cp;
  }

  buildStarGateAndRainbowBridge(
    physics: PhysicsWorld,
    opts?: {
      gatePos?: THREE.Vector3;
      bridgeFromZ?: number;
      bridgeFromY?: number;
      bridgeToZ?: number;
      bridgeToY?: number;
      bridgeWidth?: number;
    }
  ): void {
    this.physics = physics;
    const gatePos = opts?.gatePos ?? new THREE.Vector3(0, 1.2, -13.2);
    const gateX = gatePos.x;
    const gateY = gatePos.y;
    const gateZ = gatePos.z;
    const gate = new THREE.Group();
    gate.position.set(gateX, gateY, gateZ);

    const customGate = this.factories?.createStarGate();
    if (customGate) {
      customGate.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      gate.add(customGate);
    }

    // Physical colliders for Twin Gate Pillars
    for (const sx of [-4.6, 4.6]) {
      physics.addStaticBox(gateX + sx, gateY + 4.6, gateZ, 0.95, 4.6, 0.95);
    }

    // Temporary physical barrier sealing the 3-Star Gate opening until all 3 gold stars unlock the Rainbow Bridge
    const gateLockCol = physics.addStaticBox(gateX, gateY + 6.4, gateZ, 3.7, 6.4, 0.35, {
      friction: 0.0,
      ignoreRays: true,
    });
    this.registerBossLockCollider(gateLockCol);

    // 3 Star Lamps mounted on arch front sockets
    const lampPositions = [-2.5, 0, 2.5];
    for (let i = 0; i < 3; i++) {
      const lamp = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.68, 0),
        new THREE.MeshStandardMaterial({
          color: 0x485060,
          emissive: 0x1e2230,
          emissiveIntensity: 0.15,
          roughness: 0.25,
          metalness: 0.45,
        })
      );
      lamp.position.set(lampPositions[i], 9.85, 1.15);
      gate.add(lamp);
      this.gateStarLamps.push(lamp);
    }

    this.group.add(gate);

    // Rainbow Bridge spanning from gate side -> boss arena rim
    const fromZ = opts?.bridgeFromZ ?? -13.8;
    const fromY = opts?.bridgeFromY ?? 1.22;
    const toZ = opts?.bridgeToZ ?? -34.2;
    const toY = opts?.bridgeToY ?? 4.02;
    const width = opts?.bridgeWidth ?? 5.2;

    const dz = Math.abs(fromZ - toZ);
    const dy = toY - fromY;
    const bridgeLen = Math.hypot(dz, dy);
    const slopeAngle = Math.atan2(dy, dz);
    const midY = (fromY + toY) * 0.5 - 0.23;
    const midZ = (fromZ + toZ) * 0.5;

    this.bridgeStartY = fromY;
    this.bridgeMidY = midY;
    this.bridgeStartZ = fromZ;
    this.bridgeMidZ = midZ;
    this.bridgeHalfLen = bridgeLen * 0.5 + 0.1;
    this.bridgeWidth = width;
    this.bridgeSlopeAngle = slopeAngle;

    this.rainbowBridgeGroup.position.set(gateX, midY, midZ);
    this.rainbowBridgeGroup.rotation.x = slopeAngle;

    const bridgeMat = new THREE.MeshPhysicalMaterial({
      map: this.textures.rainbowBridge,
      roughness: 0.26,
      clearcoat: 0.55,
      emissive: 0xffdff8,
      emissiveIntensity: 0.14,
      transparent: true,
      opacity: 0.0,
    });
    const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.36, bridgeLen), bridgeMat);
    deckMesh.receiveShadow = true;
    deckMesh.castShadow = true;
    this.rainbowBridgeGroup.add(deckMesh);

    const oak = this.pbr?.cloneMaps('oakVeneer', 1, Math.max(2, Math.round(bridgeLen / 4)));
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xd9a162,
      map: oak?.diff ?? null,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.48,
      envMapIntensity: 0.60,
      transparent: true,
      opacity: 0.0,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xffd258,
      metalness: 0.88,
      roughness: 0.20,
      envMapIntensity: 1.2,
      transparent: true,
      opacity: 0.0,
    });

    const animMats: THREE.MeshStandardMaterial[] = [bridgeMat, railMat, brassMat];

    const sideOff = width * 0.5 + 0.16;
    for (const sx of [-sideOff, sideOff]) {
      const sideBeam = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, bridgeLen + 0.2), railMat);
      sideBeam.position.set(sx, 0.04, 0);
      sideBeam.castShadow = true;
      sideBeam.receiveShadow = true;
      const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, bridgeLen + 0.2, 12), railMat);
      topTube.rotation.x = Math.PI / 2;
      topTube.position.set(sx, 0.32, 0);
      this.rainbowBridgeGroup.add(sideBeam, topTube);
    }
    // Decorative brass end sills cleanly docking to Castle Gate and Boss Arena deck rim
    for (const sz of [-bridgeLen * 0.5 + 0.16, bridgeLen * 0.5 - 0.16]) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.76, 0.42, 0.36), railMat);
      sill.position.set(0, 0.0, sz);
      const brassStrip = new THREE.Mesh(new THREE.BoxGeometry(width + 0.56, 0.10, 0.16), brassMat);
      brassStrip.position.set(0, 0.20, sz);
      this.rainbowBridgeGroup.add(sill, brassStrip);
    }

    this.rainbowBridgeGroup.visible = false;
    this.rainbowBridgeGroup.userData = { animMats, physics };
  }

  updateGateStars(starCount: number, highlightIndex?: number): void {
    for (let i = 0; i < this.gateStarLamps.length; i++) {
      const lamp = this.gateStarLamps[i];
      const mat = lamp.material as THREE.MeshStandardMaterial;
      if (i < starCount) {
        mat.color.setHex(0xffdf42);
        mat.emissive.setHex(0xffa800);
        mat.emissiveIntensity = highlightIndex === i ? 1.85 : 1.15;
        lamp.scale.setScalar(highlightIndex === i ? 1.32 : 1.0);
      } else {
        mat.color.setHex(0x485060);
        mat.emissive.setHex(0x1e2230);
        mat.emissiveIntensity = 0.15;
        lamp.scale.setScalar(1.0);
      }
    }
  }

  getGateStarLampWorldPos(index: number): THREE.Vector3 | null {
    const lamp = this.gateStarLamps[index];
    if (!lamp) return null;
    lamp.updateMatrixWorld(true);
    const out = new THREE.Vector3();
    lamp.getWorldPosition(out);
    return out;
  }

  activateCheckpointSilent(index: number): void {
    const cp = this.checkpoints[index];
    if (!cp || cp.activated) return;
    cp.activated = true;
    const mat = cp.flagMesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(0xffda42);
    mat.emissive.setHex(0xffa800);
    mat.emissiveIntensity = 0.35;
  }

  openRainbowBridge(instant = false): void {
    if (!this.rainbowBridgeOpen) {
      this.rainbowBridgeOpen = true;
      this.rainbowBridgeGroup.visible = true;
      if (instant) {
        this.bridgeOpenAnim = 1;
        this.applyBridgeVisualProgress(1);
      } else {
        this.bridgeOpenAnim = 0.05;
        this.applyBridgeVisualProgress(0.05);
      }
    } else if (instant && this.bridgeOpenAnim < 1) {
      this.bridgeOpenAnim = 1;
      this.applyBridgeVisualProgress(1);
    }

    if (!this.bridgeColliderAdded) {
      this.bridgeColliderAdded = true;
      const physics = this.rainbowBridgeGroup.userData.physics as PhysicsWorld;
      physics.addStaticBox(
        0,
        this.bridgeMidY,
        this.bridgeMidZ,
        this.bridgeWidth * 0.5 + 0.2,
        0.22,
        this.bridgeHalfLen,
        {
          rotEuler: new THREE.Euler(this.bridgeSlopeAngle, 0, 0),
          friction: 0.65,
        }
      );
    }

    if (this.bossLockColliders.length > 0) {
      const physics = this.physics ?? (this.rainbowBridgeGroup.userData.physics as PhysicsWorld | undefined);
      if (physics) {
        for (const col of this.bossLockColliders) {
          physics.removeStaticCollider(col);
        }
        this.bossLockColliders = [];
      }
    }
  }

  private applyBridgeVisualProgress(progress01: number): void {
    const p = THREE.MathUtils.clamp(progress01, 0, 1);
    const ease = 1 - Math.pow(1 - p, 2);
    const animMats = this.rainbowBridgeGroup.userData.animMats as
      | THREE.MeshStandardMaterial[]
      | undefined;
    if (animMats) {
      animMats[0].opacity = ease * 0.94;
      for (let i = 1; i < animMats.length; i++) {
        animMats[i].opacity = ease;
      }
    }
    const sz = Math.max(0.05, ease);
    this.rainbowBridgeGroup.scale.z = sz;
    this.rainbowBridgeGroup.position.set(
      0,
      THREE.MathUtils.lerp(this.bridgeStartY, this.bridgeMidY, ease),
      THREE.MathUtils.lerp(this.bridgeStartZ, this.bridgeMidZ, ease)
    );
  }

  buildVictoryChest(initialPos?: THREE.Vector3): void {
    const pos = initialPos ?? new THREE.Vector3(0, 4.0, -52);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.visible = false;

    const chestMat = new THREE.MeshStandardMaterial({ color: 0x72cfc8, roughness: 0.36 });
    const pinkLidMat = new THREE.MeshStandardMaterial({ color: 0xe88eb2, roughness: 0.36 });
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0xa488ee,
      metalness: 0.2,
      roughness: 0.28,
      emissive: 0x6f4ee0,
      emissiveIntensity: 0.14,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.1, 2.4), chestMat);
    body.position.y = 1.05;
    body.castShadow = true;
    const ribV = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.16, 2.48), ribbonMat);
    ribV.position.y = 1.05;
    const ribH = new THREE.Mesh(new THREE.BoxGeometry(3.08, 2.16, 0.45), ribbonMat);
    ribH.position.y = 1.05;
    g.add(body, ribV, ribH);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 2.1, -1.2);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.68, 2.6), pinkLidMat);
    lid.position.set(0, 0.34, 1.2);
    lid.castShadow = true;
    const bow1 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.14, 10, 20), ribbonMat);
    bow1.position.set(-0.42, 0.82, 1.2);
    bow1.rotation.y = 0.4;
    const bow2 = bow1.clone();
    bow2.position.x = 0.42;
    bow2.rotation.y = -0.4;
    lidPivot.add(lid, bow1, bow2);
    g.add(lidPivot);

    this.group.add(g);
    this.victoryChest = {
      pos: pos.clone(),
      group: g,
      lidPivot,
      spawned: false,
      opened: false,
      openProgress: 0,
    };
  }

  upgradeVictoryChestWithModel(factory: () => THREE.Group | null): void {
    if (!this.victoryChest) return;
    const model = factory();
    if (!model) return;

    while (this.victoryChest.group.children.length > 0) {
      this.victoryChest.group.remove(this.victoryChest.group.children[0]);
    }

    const visualRoot = new THREE.Group();
    visualRoot.scale.setScalar(1.65);
    visualRoot.rotation.y = -0.38;
    visualRoot.add(model);
    this.victoryChest.group.add(visualRoot);

    const inner = (model.children[0] as THREE.Group | undefined) ?? model;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.56, -0.44);
    inner.add(lidPivot);

    this.victoryChest.group.updateMatrixWorld(true);
    visualRoot.updateMatrixWorld(true);

    const lidMeshes: THREE.Object3D[] = [];
    inner.traverse((obj) => {
      if (obj !== lidPivot && (obj.name.startsWith('BoxLid') || obj.name.startsWith('Bow'))) {
        lidMeshes.push(obj);
      }
    });
    for (const mesh of lidMeshes) {
      lidPivot.attach(mesh);
    }

    const glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffe46b,
        emissive: 0xffb820,
        emissiveIntensity: 1.2,
        roughness: 0.2,
      })
    );
    glowCore.position.set(0, 0.36, 0);
    inner.add(glowCore);

    this.victoryChest.lidPivot = lidPivot;
  }

  spawnVictoryChest(pos?: THREE.Vector3): void {
    if (pos) {
      this.victoryChest.pos.copy(pos);
      this.victoryChest.group.position.copy(pos);
    }
    this.victoryChest.spawned = true;
    this.victoryChest.group.visible = true;
    this.victoryChest.group.scale.setScalar(0.1);
  }

  update(
    dt: number,
    time: number,
    playerPos: THREE.Vector3,
    onSpringBounce: (spring: RedSpring) => void,
    onCheckpoint: (cp: CheckpointFlag) => void,
    onChestOpen: () => void
  ): void {
    for (const s of this.springs) {
      if (s.active === false) continue;

      if (s.isBossPopup) {
        if ((s.spawnAnim ?? 1) < 1) {
          s.spawnAnim = Math.min(1, (s.spawnAnim ?? 0) + dt / 0.26);
          const t = s.spawnAnim;
          const popScale =
            t < 0.7
              ? THREE.MathUtils.lerp(0.01, 1.12, t / 0.7)
              : THREE.MathUtils.lerp(1.12, 1.0, (t - 0.7) / 0.3);
          s.group.scale.setScalar(popScale);
        } else {
          s.group.scale.setScalar(1);
        }

        if (s.markerGroup) {
          s.markerGroup.rotation.y += dt * 2.8;
          const bob = Math.sin(time * 5.2) * 0.30;
          s.markerGroup.position.y = 2.25 + bob;
          s.markerGroup.scale.setScalar(1 + Math.sin(time * 5.2) * 0.08);
        }
        if (s.auraRing) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4.8);
          s.auraRing.scale.setScalar(0.95 + pulse * 0.14);
          (s.auraRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.35;
        }
        if (s.pulseRing) {
          const wave = (time * 1.45) % 1;
          s.pulseRing.scale.setScalar(0.9 + wave * 0.65);
          (s.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - wave) * 0.72;
        }
        if (s.glowLight) {
          s.glowLight.intensity = 6.5 + Math.sin(time * 6.0) * 2.5;
        }
      }

      const distHoriz = Math.hypot(playerPos.x - s.pos.x, playerPos.z - s.pos.z);
      if (s.isBossPopup) {
        if (
          distHoriz < (s.triggerRadius ?? 1.85) &&
          playerPos.y >= s.pos.y - 0.35 &&
          playerPos.y <= s.pos.y + 1.85 &&
          s.animTimer <= 0
        ) {
          s.animTimer = 0.55;
          onSpringBounce(s);
        }
      } else {
        const dy = playerPos.y - (s.pos.y + s.baseCapY);
        if (distHoriz < 1.55 && dy > -0.65 && dy < 0.78 && s.animTimer <= 0) {
          s.animTimer = 0.55;
          onSpringBounce(s);
        }
      }
      if (s.animTimer > 0) {
        s.animTimer = Math.max(0, s.animTimer - dt);
        const k = 1 - s.animTimer / 0.55;
        const stretch = 1 + Math.sin(k * Math.PI * 3) * (1 - k) * 0.72;
        if (s.coil) s.coil.scale.y = stretch;
        s.cap.position.y = s.baseCapY + (stretch - 1) * 0.85;
      } else {
        if (s.coil) s.coil.scale.y = 1;
        s.cap.position.y = s.baseCapY;
      }
    }

    for (const cp of this.checkpoints) {
      if (!cp.activated) {
        const d = Math.hypot(playerPos.x - cp.pos.x, playerPos.z - cp.pos.z);
        if (d < 2.6 && Math.abs(playerPos.y - cp.pos.y) < 3.0) {
          cp.activated = true;
          const mat = cp.flagMesh.material as THREE.MeshStandardMaterial;
          mat.color.setHex(0xffda42);
          mat.emissive.setHex(0xffa800);
          mat.emissiveIntensity = 0.35;
          onCheckpoint(cp);
        }
      } else {
        cp.flagMesh.rotation.y = Math.sin(time * 5.0) * 0.22;
      }
    }

    if (this.rainbowBridgeOpen && this.bridgeOpenAnim < 1) {
      this.bridgeOpenAnim = Math.min(1, this.bridgeOpenAnim + dt * 0.52);
      this.applyBridgeVisualProgress(this.bridgeOpenAnim);
    }

    if (this.victoryChest?.spawned) {
      const s = THREE.MathUtils.lerp(this.victoryChest.group.scale.x, 1.0, 1 - Math.exp(-8 * dt));
      this.victoryChest.group.scale.setScalar(s);

      if (!this.victoryChest.opened) {
        const d = playerPos.distanceTo(this.victoryChest.pos);
        if (d < 3.2) {
          this.victoryChest.opened = true;
          onChestOpen();
        }
      } else if (this.victoryChest.openProgress < 1) {
        this.victoryChest.openProgress = Math.min(1, this.victoryChest.openProgress + dt * 2.5);
        this.victoryChest.lidPivot.rotation.x = -this.victoryChest.openProgress * 1.45;
      }
    }
  }
}

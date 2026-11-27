import * as THREE from 'three';
import { getProceduralTextures } from '../assets/ProceduralTextures';
import type { StarKind } from '../types';

export interface CoinItem {
  pos: THREE.Vector3;
  dispY: number;
  collected: boolean;
  isStarBit: boolean;
  isTutorialStep1?: boolean;
  vel?: THREE.Vector3;
  age?: number;
}

export interface PowerStarItem {
  id: number;
  label: string;
  areaName: string;
  kind: StarKind;
  hiddenUntilReveal?: boolean;
  pos: THREE.Vector3;
  group: THREE.Group;
  starMesh: THREE.Mesh;
  beaconMesh?: THREE.Mesh;
  beaconCoreMesh?: THREE.Mesh;
  haloSprite?: THREE.Sprite;
  lockDome?: THREE.Mesh;
  collected: boolean;
  unlocked: boolean;
  /** 出現演出中（せり上がり中）は拾えない */
  revealRise?: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number };
}

export interface HeartItem {
  group: THREE.Group;
  pos: THREE.Vector3;
  collected: boolean;
  respawnable: boolean;
  vel?: THREE.Vector3;
  age?: number;
}

export class CollectiblesManager {
  public readonly group = new THREE.Group();
  public readonly coins: CoinItem[] = [];
  public readonly stars: PowerStarItem[] = [];
  public readonly hearts: HeartItem[] = [];

  private coinEdgeGeo!: THREE.BufferGeometry;
  private coinFaceGeo!: THREE.BufferGeometry;
  private coinEdgeMat!: THREE.MeshStandardMaterial;
  private coinFaceMat!: THREE.MeshStandardMaterial;
  private coinEdgeInst!: THREE.InstancedMesh;
  private coinFaceInst!: THREE.InstancedMesh;
  private coinCapacity = 160;
  private starBitGeo: THREE.BufferGeometry;
  private starBitInst!: THREE.InstancedMesh;
  private starBitCapacity = 96;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpTargetPos = new THREE.Vector3();
  private readonly oneScale = new THREE.Vector3(1, 1, 1);
  private coinSyncFrame = 0;
  private starBitMat = new THREE.MeshStandardMaterial({
    color: 0xffee60,
    emissive: 0xffcc22,
    emissiveIntensity: 0.55,
    roughness: 0.25,
  });
  private powerStarGeo: THREE.BufferGeometry;
  private powerStarMat = new THREE.MeshStandardMaterial({
    color: 0xffe23b,
    emissive: 0xffb800,
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.35,
  });
  private secretStarMat = new THREE.MeshStandardMaterial({
    color: 0x4df5e8,
    emissive: 0x16b8c4,
    emissiveIntensity: 0.65,
    roughness: 0.16,
    metalness: 0.35,
  });
  private heartGeo: THREE.BufferGeometry;
  private heartMat = new THREE.MeshStandardMaterial({
    color: 0xff3b6b,
    emissive: 0xd91c4e,
    emissiveIntensity: 0.38,
    roughness: 0.18,
    metalness: 0.15,
  });
  private heartRingGeo = new THREE.RingGeometry(0.48, 0.62, 24);
  private heartRingMat = new THREE.MeshBasicMaterial({
    color: 0xff9ec0,
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private starGlowTex: THREE.CanvasTexture;
  private beaconBeamTex: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const proc = getProceduralTextures();
    this.coinEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xffd236,
      metalness: 0.78,
      roughness: 0.22,
      emissive: 0xffaa00,
      emissiveIntensity: 0.20,
    });
    this.coinFaceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: proc.coinCrown,
      metalness: 0.72,
      roughness: 0.22,
      emissive: 0xffaa00,
      emissiveIntensity: 0.16,
    });

    const baseCoinGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.13, 22);
    baseCoinGeo.rotateX(Math.PI / 2);
    const { edgeGeo, faceGeo } = this.splitCoinGeometry(baseCoinGeo);
    baseCoinGeo.dispose();
    this.coinEdgeGeo = edgeGeo;
    this.coinFaceGeo = faceGeo;

    const glowC = document.createElement('canvas');
    glowC.width = 128;
    glowC.height = 128;
    const gctx = glowC.getContext('2d')!;
    const rg = gctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255, 244, 170, 0.85)');
    rg.addColorStop(0.45, 'rgba(255, 210, 70, 0.35)');
    rg.addColorStop(1, 'rgba(255, 190, 30, 0.0)');
    gctx.fillStyle = rg;
    gctx.fillRect(0, 0, 128, 128);
    this.starGlowTex = new THREE.CanvasTexture(glowC);

    // Shared vertical gradient + subtle vertical light-streak texture for Star Beacons
    const beamC = document.createElement('canvas');
    beamC.width = 32;
    beamC.height = 256;
    const bctx = beamC.getContext('2d')!;
    const vGrad = bctx.createLinearGradient(0, 256, 0, 0);
    vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    vGrad.addColorStop(0.06, 'rgba(255, 255, 255, 0.96)');
    vGrad.addColorStop(0.32, 'rgba(255, 255, 255, 0.85)');
    vGrad.addColorStop(0.70, 'rgba(255, 255, 255, 0.48)');
    vGrad.addColorStop(0.92, 'rgba(255, 255, 255, 0.16)');
    vGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    bctx.fillStyle = vGrad;
    bctx.fillRect(0, 0, 32, 256);

    bctx.globalCompositeOperation = 'multiply';
    for (let x = 0; x < 32; x++) {
      const wave = 0.78 + 0.22 * Math.sin((x / 32) * Math.PI * 6);
      const alpha = Math.round(wave * 255);
      bctx.fillStyle = `rgb(${alpha}, ${alpha}, ${alpha})`;
      bctx.fillRect(x, 0, 1, 256);
    }
    this.beaconBeamTex = new THREE.CanvasTexture(beamC);
    this.beaconBeamTex.wrapS = THREE.RepeatWrapping;
    this.beaconBeamTex.wrapT = THREE.ClampToEdgeWrapping;
    this.beaconBeamTex.colorSpace = THREE.SRGBColorSpace;

    this.starBitGeo = this.createStarGeometry(0.36, 0.16, 0.14);
    this.powerStarGeo = this.createStarGeometry(1.15, 0.52, 0.36);
    this.heartGeo = this.createHeartGeometry();

    this.rebuildCoinInstancedMeshes(this.coinCapacity);
    this.rebuildStarBitInstancedMesh(this.starBitCapacity);
  }

  private splitCoinGeometry(src: THREE.BufferGeometry): {
    edgeGeo: THREE.BufferGeometry;
    faceGeo: THREE.BufferGeometry;
  } {
    const extractGroupIndices = (materialIndices: number[]): THREE.BufferGeometry => {
      const geo = new THREE.BufferGeometry();
      for (const name of Object.keys(src.attributes)) {
        geo.setAttribute(name, src.getAttribute(name));
      }
      const srcIdx = src.getIndex();
      if (srcIdx) {
        const picked: number[] = [];
        for (const grp of src.groups) {
          if (!materialIndices.includes(grp.materialIndex ?? 0)) continue;
          const end = grp.start + grp.count;
          for (let i = grp.start; i < end; i++) {
            picked.push(srcIdx.getX(i));
          }
        }
        geo.setIndex(picked);
      }
      return geo;
    };

    return {
      edgeGeo: extractGroupIndices([0]),
      faceGeo: extractGroupIndices([1, 2]),
    };
  }

  private rebuildCoinInstancedMeshes(capacity: number): void {
    if (this.coinEdgeInst) {
      this.group.remove(this.coinEdgeInst);
      this.coinEdgeInst.dispose();
    }
    if (this.coinFaceInst) {
      this.group.remove(this.coinFaceInst);
      this.coinFaceInst.dispose();
    }
    this.coinCapacity = capacity;

    this.coinEdgeInst = new THREE.InstancedMesh(this.coinEdgeGeo, this.coinEdgeMat, capacity);
    this.coinEdgeInst.castShadow = true;
    this.coinEdgeInst.frustumCulled = false;
    this.coinEdgeInst.count = 0;
    this.coinEdgeInst.visible = false;

    this.coinFaceInst = new THREE.InstancedMesh(this.coinFaceGeo, this.coinFaceMat, capacity);
    this.coinFaceInst.castShadow = true;
    this.coinFaceInst.frustumCulled = false;
    this.coinFaceInst.count = 0;
    this.coinFaceInst.visible = false;

    this.group.add(this.coinEdgeInst, this.coinFaceInst);
  }

  private rebuildStarBitInstancedMesh(capacity: number): void {
    if (this.starBitInst) {
      this.group.remove(this.starBitInst);
      this.starBitInst.dispose();
    }
    this.starBitCapacity = capacity;

    this.starBitInst = new THREE.InstancedMesh(this.starBitGeo, this.starBitMat, capacity);
    this.starBitInst.castShadow = true;
    this.starBitInst.frustumCulled = false;
    this.starBitInst.count = 0;
    this.starBitInst.visible = false;

    this.group.add(this.starBitInst);
  }

  private syncCoinInstances(time: number): void {
    let normalNeeded = 0;
    let starNeeded = 0;
    for (const c of this.coins) {
      if (c.collected) continue;
      if (c.isStarBit) starNeeded++;
      else normalNeeded++;
    }

    if (normalNeeded > this.coinCapacity) {
      this.rebuildCoinInstancedMeshes(Math.max(normalNeeded, this.coinCapacity * 2));
    }
    if (starNeeded > this.starBitCapacity) {
      this.rebuildStarBitInstancedMesh(Math.max(starNeeded, this.starBitCapacity * 2));
    }

    let coinIdx = 0;
    let starIdx = 0;
    for (const c of this.coins) {
      if (c.collected) continue;
      const dispY = c.pos.y + Math.sin(time * 3.5 + c.pos.x) * 0.14;
      c.dispY = dispY;
      this.tmpPos.set(c.pos.x, dispY, c.pos.z);
      this.tmpEuler.set(0, time * 2.8 + c.pos.z * 0.3, 0);
      this.tmpQuat.setFromEuler(this.tmpEuler);
      this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.oneScale);

      if (c.isStarBit) {
        this.starBitInst.setMatrixAt(starIdx++, this.tmpMatrix);
      } else {
        this.coinEdgeInst.setMatrixAt(coinIdx, this.tmpMatrix);
        this.coinFaceInst.setMatrixAt(coinIdx, this.tmpMatrix);
        coinIdx++;
      }
    }

    this.coinEdgeInst.count = coinIdx;
    this.coinFaceInst.count = coinIdx;
    this.coinEdgeInst.visible = coinIdx > 0;
    this.coinFaceInst.visible = coinIdx > 0;
    if (coinIdx > 0) {
      this.coinEdgeInst.instanceMatrix.needsUpdate = true;
      this.coinFaceInst.instanceMatrix.needsUpdate = true;
    }

    this.starBitInst.count = starIdx;
    this.starBitInst.visible = starIdx > 0;
    if (starIdx > 0) {
      this.starBitInst.instanceMatrix.needsUpdate = true;
    }
  }

  private createHeartGeometry(): THREE.BufferGeometry {
    const s = new THREE.Shape();
    s.moveTo(0, -0.36);
    s.bezierCurveTo(0.08, -0.28, 0.44, -0.02, 0.44, 0.22);
    s.bezierCurveTo(0.44, 0.42, 0.24, 0.50, 0.08, 0.38);
    s.bezierCurveTo(0.03, 0.34, 0.0, 0.29, 0.0, 0.25);
    s.bezierCurveTo(0.0, 0.29, -0.03, 0.34, -0.08, 0.38);
    s.bezierCurveTo(-0.24, 0.50, -0.44, 0.42, -0.44, 0.22);
    s.bezierCurveTo(-0.44, -0.02, -0.08, -0.28, 0, -0.36);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.07,
      bevelSegments: 3,
    });
    geo.center();
    return geo;
  }

  private createStarGeometry(outerR: number, innerR: number, depth: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.25,
      bevelSize: depth * 0.2,
      bevelSegments: 2,
    });
    geo.center();
    return geo;
  }

  addCoin(pos: THREE.Vector3, isStarBit = false, isTutorialStep1 = false): CoinItem {
    const item: CoinItem = {
      pos: pos.clone(),
      dispY: pos.y,
      collected: false,
      isStarBit,
      isTutorialStep1,
    };
    this.coins.push(item);
    this.syncCoinInstances(0);
    return item;
  }

  spawnBurstCoins(pos: THREE.Vector3, count = 4): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 2.6 + Math.random() * 2.4;
      const c = this.addCoin(pos.clone().add(new THREE.Vector3(0, 0.7, 0)), i % 2 === 1);
      c.vel = new THREE.Vector3(Math.cos(a) * sp, 6.2 + Math.random() * 2.5, Math.sin(a) * sp);
      c.age = 0;
    }
  }

  addLineCoins(start: THREE.Vector3, end: THREE.Vector3, count: number, isTutorialStep1 = false): void {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      this.addCoin(p, false, isTutorialStep1);
    }
  }

  addPowerStar(
    id: number,
    label: string,
    areaName: string,
    pos: THREE.Vector3,
    unlocked = true,
    kind: StarKind = 'main',
    hiddenUntilReveal = false
  ): PowerStarItem {
    const isSecret = kind === 'secret';
    const initialUnlocked = hiddenUntilReveal ? false : unlocked;
    const g = new THREE.Group();
    g.position.copy(pos);

    const starMesh = new THREE.Mesh(
      this.powerStarGeo,
      isSecret ? this.secretStarMat : this.powerStarMat
    );
    starMesh.castShadow = true;

    // Cute dark brown eyes matching art-bible 01 & 02!
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3b2316 });
    const eyeGeo = new THREE.CapsuleGeometry(0.06, 0.14, 4, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.20, 0.08, 0.25);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.20, 0.08, 0.25);
    starMesh.add(eyeL, eyeR);
    g.add(starMesh);

    // Pedestal ring
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.65, 0.35, 24),
      new THREE.MeshStandardMaterial({
        color: isSecret ? 0x86f0e8 : 0xffe488,
        roughness: 0.4,
        metalness: 0.3,
      })
    );
    ped.position.y = -1.25;
    ped.receiveShadow = true;
    g.add(ped);

    // Star Beacon: vivid dual-layer golden pillar for main stars; hidden secret stars have no sky pillar (only subtle proximity aura)
    let beaconMesh: THREE.Mesh | undefined;
    let beaconCoreMesh: THREE.Mesh | undefined;
    if (!isSecret) {
      const outerGeo = new THREE.CylinderGeometry(0.92, 1.75, 68, 12, 1, true);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffc838,
        map: this.beaconBeamTex,
        transparent: true,
        opacity: initialUnlocked ? 0.42 : 0.24,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending,
        depthWrite: false,
        fog: false,
      });
      beaconMesh = new THREE.Mesh(outerGeo, outerMat);
      beaconMesh.position.y = 32.8;
      beaconMesh.renderOrder = 3;
      g.add(beaconMesh);

      const coreGeo = new THREE.CylinderGeometry(0.36, 0.82, 68, 10, 1, true);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff4ad,
        map: this.beaconBeamTex,
        transparent: true,
        opacity: initialUnlocked ? 0.68 : 0.36,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      beaconCoreMesh = new THREE.Mesh(coreGeo, coreMat);
      beaconCoreMesh.position.y = 32.8;
      beaconCoreMesh.renderOrder = 4;
      g.add(beaconCoreMesh);
    }

    const haloSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.starGlowTex,
        color: isSecret ? 0x5ff7ee : 0xffe484,
        transparent: true,
        opacity: isSecret ? (initialUnlocked ? 0.55 : 0.25) : initialUnlocked ? 0.88 : 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: isSecret,
      })
    );
    const haloScale = isSecret ? 2.6 : 5.6;
    haloSprite.scale.set(haloScale, haloScale, 1);
    g.add(haloSprite);

    let lockDome: THREE.Mesh | undefined;
    if (!initialUnlocked && !hiddenUntilReveal) {
      lockDome = new THREE.Mesh(
        new THREE.SphereGeometry(1.75, 20, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0x88d8ff,
          transparent: true,
          opacity: 0.34,
          roughness: 0.08,
          metalness: 0.06,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          reflectivity: 0.95,
          depthWrite: false,
          envMapIntensity: 1.35,
        })
      );
      g.add(lockDome);
    }

    if (hiddenUntilReveal) {
      g.visible = false;
    }

    this.group.add(g);

    const item: PowerStarItem = {
      id,
      label,
      areaName,
      kind,
      hiddenUntilReveal,
      pos: pos.clone(),
      group: g,
      starMesh,
      beaconMesh,
      beaconCoreMesh,
      haloSprite,
      lockDome,
      collected: false,
      unlocked: initialUnlocked,
    };
    this.stars.push(item);
    return item;
  }

  unlockStar(id: number): boolean {
    const s = this.stars.find((st) => st.id === id);
    if (!s || s.unlocked) return false;
    s.unlocked = true;
    if (s.lockDome) {
      s.group.remove(s.lockDome);
      s.lockDome = undefined;
    }
    if (s.kind === 'secret') {
      if (s.beaconMesh) {
        (s.beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.28;
      }
      if (s.haloSprite) (s.haloSprite.material as THREE.SpriteMaterial).opacity = 0.55;
    } else {
      if (s.beaconMesh) {
        (s.beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.42;
      }
      if (s.beaconCoreMesh) {
        (s.beaconCoreMesh.material as THREE.MeshBasicMaterial).opacity = 0.68;
      }
      if (s.haloSprite) (s.haloSprite.material as THREE.SpriteMaterial).opacity = 0.88;
    }
    return true;
  }

  /**
   * ひみつスターを出現させる。riseFrom を渡すと、そこから riseHeight だけ上へ
   * ゆっくりせり上がり、その間は拾えない（木箱を壊した瞬間に自動で取れてしまうのを防ぐ）。
   */
  revealSecretStar(
    id: number,
    opts?: { riseFrom?: THREE.Vector3; riseHeight?: number; riseDur?: number }
  ): PowerStarItem | null {
    const s = this.stars.find((st) => st.id === id);
    if (!s || s.collected) return null;
    s.group.visible = true;
    if (opts?.riseFrom) {
      const to = s.pos.clone();
      to.y += opts.riseHeight ?? 0;
      s.revealRise = { from: opts.riseFrom.clone(), to, t: 0, dur: opts.riseDur ?? 1.2 };
      s.pos.copy(to);
      s.group.position.copy(opts.riseFrom);
      s.group.scale.setScalar(0.2);
    }
    s.unlocked = true;
    if (s.lockDome) {
      s.group.remove(s.lockDome);
      s.lockDome = undefined;
    }
    if (s.kind === 'secret') {
      if (s.beaconMesh) {
        (s.beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.28;
      }
      if (s.haloSprite) (s.haloSprite.material as THREE.SpriteMaterial).opacity = 0.55;
    } else {
      if (s.beaconMesh) {
        (s.beaconMesh.material as THREE.MeshBasicMaterial).opacity = 0.42;
      }
      if (s.beaconCoreMesh) {
        (s.beaconCoreMesh.material as THREE.MeshBasicMaterial).opacity = 0.68;
      }
      if (s.haloSprite) (s.haloSprite.material as THREE.SpriteMaterial).opacity = 0.88;
    }
    return s;
  }

  markStarCollectedSilent(id: number): boolean {
    const s = this.stars.find((st) => st.id === id);
    if (!s) return false;
    s.collected = true;
    s.unlocked = true;
    if (s.lockDome) {
      s.group.remove(s.lockDome);
      s.lockDome = undefined;
    }
    s.group.visible = false;
    return true;
  }

  addHeart(pos: THREE.Vector3, respawnable = false): HeartItem {
    const g = new THREE.Group();
    const heartMesh = new THREE.Mesh(this.heartGeo, this.heartMat);
    heartMesh.castShadow = true;
    const ringMesh = new THREE.Mesh(this.heartRingGeo, this.heartRingMat);
    g.add(heartMesh, ringMesh);
    g.position.copy(pos);
    this.group.add(g);

    const item: HeartItem = {
      group: g,
      pos: pos.clone(),
      collected: false,
      respawnable,
    };
    this.hearts.push(item);
    return item;
  }

  spawnBurstHeart(pos: THREE.Vector3): HeartItem {
    const h = this.addHeart(pos.clone().add(new THREE.Vector3(0, 0.7, 0)), false);
    const a = Math.random() * Math.PI * 2;
    h.vel = new THREE.Vector3(Math.cos(a) * 2.2, 6.8, Math.sin(a) * 2.2);
    h.age = 0;
    return h;
  }

  resetRespawnableHearts(): void {
    for (const h of this.hearts) {
      if (h.respawnable) {
        h.collected = false;
        h.group.visible = true;
      }
    }
  }

  getTutorialCoinsRemaining(): number {
    return this.coins.filter((c) => c.isTutorialStep1 && !c.collected).length;
  }

  update(
    dt: number,
    time: number,
    playerPos: THREE.Vector3,
    feverActive: boolean,
    playerHp: number,
    playerMaxHp: number,
    onCollectCoin: (coin: CoinItem) => void,
    onCollectStar: (star: PowerStarItem) => void,
    onCollectHeart?: (heart: HeartItem) => void,
    quality: 'low' | 'medium' | 'high' = 'medium'
  ): void {
    const magnetRange = feverActive ? 6.2 : 2.3;
    const pickupRange = 1.45;
    let forceSync = false;

    for (const c of this.coins) {
      if (c.collected) continue;

      // Dynamic burst coin bounce
      if (c.vel) {
        forceSync = true;
        c.age = (c.age ?? 0) + dt;
        c.vel.y -= 18 * dt;
        c.pos.addScaledVector(c.vel, dt);
        if (c.pos.y < c.dispY && c.vel.y < 0 && c.age < 0.75) {
          c.vel.y = Math.abs(c.vel.y) * 0.45;
        }
        if (c.age > 0.75) {
          c.vel = undefined;
        }
      }

      const d = Math.hypot(playerPos.x - c.pos.x, playerPos.y + 0.5 - c.pos.y, playerPos.z - c.pos.z);
      if (d < magnetRange && (c.age === undefined || c.age > 0.25)) {
        forceSync = true;
        const pull = 12 * dt;
        this.tmpTargetPos.set(playerPos.x, playerPos.y + 0.5, playerPos.z);
        c.pos.lerp(this.tmpTargetPos, Math.min(1, pull));
      }
      if (d < pickupRange && (c.age === undefined || c.age > 0.22)) {
        forceSync = true;
        c.collected = true;
        onCollectCoin(c);
        continue;
      }
    }
    this.coinSyncFrame++;
    if (forceSync || quality !== 'low' || (this.coinSyncFrame & 1) === 0) {
      this.syncCoinInstances(time);
    }

    for (const s of this.stars) {
      if (s.collected) continue;
      s.starMesh.rotation.y = time * 1.9;
      s.starMesh.position.y = Math.sin(time * 2.6) * 0.26;
      if (s.beaconMesh) {
        const bScale = 1 + Math.sin(time * 3.0 + s.id) * 0.10;
        s.beaconMesh.scale.set(bScale, 1, bScale);
        s.beaconMesh.rotation.y = time * 0.45;
      }
      if (s.beaconCoreMesh) {
        const cScale = 1 + Math.sin(time * 3.6 + s.id + 1.1) * 0.12;
        s.beaconCoreMesh.scale.set(cScale, 1, cScale);
        s.beaconCoreMesh.rotation.y = -time * 0.65;
      }
      if (s.kind === 'secret' && s.haloSprite) {
        const distToStar = Math.hypot(
          playerPos.x - s.pos.x,
          playerPos.y + 0.5 - s.pos.y,
          playerPos.z - s.pos.z
        );
        const proximity = 1 - THREE.MathUtils.clamp((distToStar - 7.0) / 11.0, 0, 1);
        const shimmer = 0.85 + 0.15 * Math.sin(time * 4.2 + s.id * 1.7);
        const baseOp = s.unlocked ? 0.55 : 0.25;
        (s.haloSprite.material as THREE.SpriteMaterial).opacity = baseOp * proximity * shimmer;
        const sc = 2.6 * (0.85 + 0.15 * proximity) * shimmer;
        s.haloSprite.scale.set(sc, sc, 1);
      }

      if (s.revealRise) {
        const r = s.revealRise;
        r.t = Math.min(r.dur, r.t + dt);
        const k = r.t / r.dur;
        const ease = 1 - Math.pow(1 - k, 3);
        s.group.position.lerpVectors(r.from, r.to, ease);
        const pop = k < 0.7 ? THREE.MathUtils.lerp(0.2, 1.25, k / 0.7) : THREE.MathUtils.lerp(1.25, 1.0, (k - 0.7) / 0.3);
        s.group.scale.setScalar(pop);
        s.starMesh.rotation.y = time * 1.9 + k * 12;
        if (r.t >= r.dur) {
          s.group.position.copy(r.to);
          s.group.scale.setScalar(1);
          s.revealRise = undefined;
        }
        continue;
      }

      if (s.unlocked) {
        const dist = Math.hypot(
          playerPos.x - s.pos.x,
          playerPos.y + 0.5 - s.pos.y,
          playerPos.z - s.pos.z
        );
        if (dist < 2.2) {
          s.collected = true;
          s.group.visible = false;
          onCollectStar(s);
        }
      }
    }

    for (const h of this.hearts) {
      if (h.collected) continue;

      if (h.vel) {
        h.age = (h.age ?? 0) + dt;
        h.vel.y -= 18 * dt;
        h.pos.addScaledVector(h.vel, dt);
        if (h.pos.y < h.group.position.y && h.vel.y < 0 && h.age < 0.75) {
          h.vel.y = Math.abs(h.vel.y) * 0.45;
        }
        if (h.age > 0.75) {
          h.vel = undefined;
        }
      }

      h.group.position.copy(h.pos);
      h.group.position.y += Math.sin(time * 3.2 + h.pos.x) * 0.16;
      h.group.rotation.y = time * 2.2 + h.pos.z * 0.2;

      if (playerHp < playerMaxHp && (h.age === undefined || h.age > 0.25)) {
        const dist = Math.hypot(
          playerPos.x - h.pos.x,
          playerPos.y + 0.5 - h.pos.y,
          playerPos.z - h.pos.z
        );
        if (dist < 1.55) {
          h.collected = true;
          h.group.visible = false;
          onCollectHeart?.(h);
        }
      }
    }
  }
}

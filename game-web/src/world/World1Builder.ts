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

interface SlabTrimBatchItem {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface WorldBuildResult {
  slimes: JellySlime[];
  tanks: WindupTank[];
  balloons: PropellerBalloon[];
  clockworkGears: THREE.Object3D[];
  secretCrateId: number | null;
  tutorialCoinPos: THREE.Vector3;
  tutorialCratePos: THREE.Vector3;
}

export interface CushionVisualSpec {
  cx: number;
  topY: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  model?: THREE.Object3D;
  squashPos: number;
  squashVel: number;
  baseScaleY: number;
  basePosY: number;
}

export class World1Builder {
  private textures = getProceduralTextures();
  private group = new THREE.Group();
  private pbr?: PbrAssets;
  private terrain?: CraftTerrainBuilder;
  private worldProps?: WorldPropsManager;
  public readonly cushionSpecs: CushionVisualSpec[] = [];
  private slabBodyMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private slabTrimBatch: SlabTrimBatchItem[] = [];
  private pitCenterLight: THREE.PointLight | null = null;
  private primaryLanternLight: THREE.PointLight | null = null;
  private extraBossPointLights: THREE.PointLight[] = [];
  private bossDetailObjects: THREE.Object3D[] = [];
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
    thickness: number,
    useVisualBridge = true
  ): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y -= thickness * 0.5;

    const yaw = Math.atan2(dir.x, dir.z);
    const horiz = Math.hypot(dir.x, dir.z);
    const pitch = -Math.atan2(dir.y, horiz);
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');

    if (useVisualBridge) {
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

      // Register rim cutouts along the full ramp span so denim bands open cleanly for bridges
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
    }

    physics.addStaticBox(mid.x, mid.y, mid.z, width * 0.5, thickness * 0.5, len * 0.5, {
      rotEuler: euler,
      friction: 0.65,
    });
  }

  private getSlabBodyMaterial(
    w: number,
    d: number,
    colorHex: number,
    useWoodGrain: boolean
  ): THREE.MeshStandardMaterial {
    const rx = Math.max(1, Math.round(w / 3));
    const rz = Math.max(1, Math.round(d / 3));
    const key = `${colorHex}_${useWoodGrain ? 1 : 0}_${rx}_${rz}`;
    const cached = this.slabBodyMatCache.get(key);
    if (cached) return cached;

    const oak = this.pbr?.cloneMaps('oakVeneer', rx, rz);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      map: useWoodGrain ? oak?.diff ?? null : null,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: oak?.rough ?? null,
      roughness: 0.50,
      envMapIntensity: 0.54,
    });
    this.slabBodyMatCache.set(key, mat);
    return mat;
  }

  private spawnBeveledSlabTier(
    cx: number,
    topY: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    colorHex: number,
    useWoodGrain = false
  ): void {
    const slabTpl = this.worldProps?.getTemplateParts('toyPlatformSlab');
    const bodyPart = slabTpl?.parts.find((p) => p.name === 'SlabBody');
    if (bodyPart) {
      const bodyMat = this.getSlabBodyMaterial(w, d, colorHex, useWoodGrain);
      const bodyMesh = new THREE.Mesh(bodyPart.geometry, bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      const outerMat = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, topY - h * 0.5, cz),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, d)
      );
      const finalMat = new THREE.Matrix4().multiplyMatrices(outerMat, bodyPart.localMatrix);
      bodyMesh.matrixAutoUpdate = false;
      bodyMesh.matrix.copy(finalMat);
      bodyMesh.matrixWorldNeedsUpdate = true;
      this.group.add(bodyMesh);

      this.slabTrimBatch.push({
        x: cx,
        y: topY - h * 0.5,
        z: cz,
        sx: w,
        sy: h,
        sz: d,
      });
      return;
    }

    // Fallback only if template unavailable
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.min(w, d) * 0.5, Math.min(w, d) * 0.52, h, 24),
      new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 })
    );
    mesh.position.set(cx, topY - h * 0.5, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private flushSlabTrims(worldProps: WorldPropsManager): void {
    if (this.slabTrimBatch.length === 0) return;
    const trimTpl = worldProps.getTemplateParts('toyPlatformSlab', new Set(['SlabBody']));
    if (!trimTpl || trimTpl.parts.length === 0) {
      this.slabTrimBatch = [];
      return;
    }

    const outerMat = new THREE.Matrix4();
    const finalMat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (const part of trimTpl.parts) {
      if (!part.geometry.boundingSphere) part.geometry.computeBoundingSphere();
      const inst = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        this.slabTrimBatch.length
      );
      inst.castShadow = true;
      inst.receiveShadow = true;

      for (let i = 0; i < this.slabTrimBatch.length; i++) {
        const b = this.slabTrimBatch[i];
        pos.set(b.x, b.y, b.z);
        scale.set(b.sx, b.sy, b.sz);
        outerMat.compose(pos, quat, scale);
        finalMat.multiplyMatrices(outerMat, part.localMatrix);
        inst.setMatrixAt(i, finalMat);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = true;
      this.group.add(inst);
    }

    this.slabTrimBatch = [];
  }

  private addBeveledBlockPlatform(
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
    if (h > 2.0) {
      // Split tall towers into stacked beveled toy-block tiers + corner wooden columns (no monolithic un-beveled boxes!)
      const tiers = Math.ceil(h / 1.85);
      const tierH = h / tiers;
      for (let t = 0; t < tiers; t++) {
        const isTop = t === tiers - 1;
        const inset = isTop ? 0 : 0.16;
        const tierTop = topY - (tiers - 1 - t) * tierH;
        const tierColor = t % 2 === 1 && !isTop ? 0xd9a262 : colorHex;
        this.spawnBeveledSlabTier(
          cx,
          tierTop,
          cz,
          Math.max(1.2, w - inset),
          tierH,
          Math.max(1.2, d - inset),
          tierColor,
          useWoodGrain || tierColor === 0xd9a262
        );
      }
      // Rounded corner honey-oak posts framing the stacked block tower
      const pxOff = Math.max(0.4, w * 0.5 - 0.34);
      const pzOff = Math.max(0.4, d * 0.5 - 0.34);
      for (const sx of [-pxOff, pxOff]) {
        for (const sz of [-pzOff, pzOff]) {
          this.worldProps?.queueRaw('bevelCylWood', {
            x: cx + sx,
            y: topY - h,
            z: cz + sz,
            sx: 0.58,
            sy: (h - 0.08) / 2.2,
            sz: 0.58,
          });
        }
      }
    } else {
      this.spawnBeveledSlabTier(cx, topY, cz, w, h, d, colorHex, useWoodGrain);
    }

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
        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
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

  /**
   * Builds a smooth, glossy pink toy slide (width 3.4m, gentle curvature > 4x width,
   * closed 20-point parallel-offset U-profile with rolled rims and zero self-intersection).
   */
  private buildCurvedSlide(physics: PhysicsWorld): void {
    const points = [
      new THREE.Vector3(-28.8, 8.65, 2.2),
      new THREE.Vector3(-28.4, 8.15, 0.4),
      new THREE.Vector3(-27.2, 6.20, -4.5),
      new THREE.Vector3(-25.0, 3.30, -10.5),
      new THREE.Vector3(-22.5, 1.25, -16.8),
      new THREE.Vector3(-21.2, 0.62, -21.2),
      new THREE.Vector3(-21.0, 0.56, -22.6),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const segs = 96;

    // Closed 20-point parallel-offset U-shell cross section (13 upper trough+lip points + 7 bottom thickness points)
    const section: Array<[number, number]> = [
      // Upper trough & rolled lips (left -> center -> right)
      [-1.72, 0.62],
      [-1.66, 0.78],
      [-1.52, 0.84],
      [-1.38, 0.74],
      [-1.30, 0.36],
      [-0.86, 0.08],
      [0.0, 0.0],
      [0.86, 0.08],
      [1.30, 0.36],
      [1.38, 0.74],
      [1.52, 0.84],
      [1.66, 0.78],
      [1.72, 0.62],
      // Parallel-offset thick underside (right -> center -> left)
      [1.68, 0.38],
      [1.52, 0.05],
      [0.94, -0.18],
      [0.0, -0.26],
      [-0.94, -0.18],
      [-1.52, 0.05],
      [-1.68, 0.38],
    ];
    const crossCount = section.length;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const physPos: number[] = [];
    const physIdx: number[] = [];
    const worldUp = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPointAt(t);
      const tang = curve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tang, worldUp).normalize();
      const flare = 1.0 + Math.pow(t, 4) * 0.08;

      for (let k = 0; k < crossCount; k++) {
        const [rx, ry] = section[k];
        const vtx = p.clone().addScaledVector(right, rx * flare);
        vtx.y += ry;
        if (k >= 13 && p.y < 1.35) {
          // Rest slide exit underside cleanly atop the Y=0.50 bowling deck without dipping beneath it
          vtx.y = Math.max(vtx.y, 0.505);
        }
        positions.push(vtx.x, vtx.y, vtx.z);
        uvs.push(k / (crossCount - 1), t * 4.0);
        if (k < 13) physPos.push(vtx.x, vtx.y, vtx.z);
      }

      if (i < segs) {
        const b = i * crossCount;
        const n = (i + 1) * crossCount;
        for (let q = 0; q < crossCount; q++) {
          const nq = (q + 1) % crossCount;
          // Outward-facing CCW winding: (+right) x (+tang) = +UP on upper chute
          indices.push(b + q, b + nq, n + q);
          indices.push(b + nq, n + nq, n + q);
        }
        const pb = i * 13;
        const pn = (i + 1) * 13;
        for (let q = 0; q < 12; q++) {
          physIdx.push(pb + q, pb + q + 1, pn + q);
          physIdx.push(pb + q + 1, pn + q + 1, pn + q);
        }
      }
    }

    // End caps so start and exit cross-sections are cleanly closed outward
    const startCenterIdx = positions.length / 3;
    const p0 = curve.getPointAt(0);
    positions.push(p0.x, p0.y + 0.2, p0.z);
    uvs.push(0.5, 0);
    const endCenterIdx = positions.length / 3;
    const p1 = curve.getPointAt(1);
    positions.push(p1.x, p1.y + 0.2, p1.z);
    uvs.push(0.5, 4);
    const lastBase = segs * crossCount;
    for (let q = 0; q < crossCount; q++) {
      const nq = (q + 1) % crossCount;
      indices.push(startCenterIdx, q, nq);
      indices.push(endCenterIdx, lastBase + nq, lastBase + q);
    }

    const visGeo = new THREE.BufferGeometry();
    visGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    visGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    visGeo.setIndex(indices);
    visGeo.computeVertexNormals();

    const slideMat = new THREE.MeshPhysicalMaterial({
      color: 0xff9bc2,
      map: this.textures.pastelSlidePink,
      roughness: 0.12,
      clearcoat: 0.95,
      clearcoatRoughness: 0.05,
      envMapIntensity: 0.72,
    });
    const slideMesh = new THREE.Mesh(visGeo, slideMat);
    slideMesh.castShadow = true;
    slideMesh.receiveShadow = true;
    this.group.add(slideMesh);

    const physGeo = new THREE.BufferGeometry();
    physGeo.setAttribute('position', new THREE.Float32BufferAttribute(physPos, 3));
    physGeo.setIndex(physIdx);
    physics.addStaticTrimesh(physGeo, new THREE.Vector3(0, 0, 0), undefined, {
      isSlide: true,
      friction: 0.05,
    });

    // Honey-oak boarding deck at slide entry + cutouts on west_hill & bowling_deck rims
    this.spawnBeveledSlabTier(-28.8, 8.625, 2.75, 3.6, 0.34, 2.2, 0xd8a060, true);
    this.terrain?.addRimCutout(-28.8, 1.8, 3.0, 7.0, 10.5);
    this.terrain?.addRimCutout(-21.2, -19.5, 3.2, 0.0, 1.5);

    // Honey-oak support piers cradling the curved slide underside
    const oak = this.pbr?.cloneMaps('oakVeneer', 1, 2);
    const supportMat = new THREE.MeshStandardMaterial({
      color: 0xd49b5c,
      map: oak?.diff ?? null,
      normalMap: oak?.nor ?? null,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.50,
      envMapIntensity: 0.48,
    });
    for (const st of [0.22, 0.48, 0.74]) {
      const sp = curve.getPointAt(st);
      const colH = Math.max(0.8, sp.y + 3.8);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, colH, 16), supportMat);
      pier.position.set(sp.x, sp.y - 0.32 - colH * 0.5, sp.z);
      pier.castShadow = true;
      pier.receiveShadow = true;
      this.group.add(pier);
    }
  }

  private buildBossArena(
    physics: PhysicsWorld,
    worldProps: WorldPropsManager,
    gimmicks: GimmicksManager,
    clockworkGears: THREE.Object3D[]
  ): void {
    const cx = 0;
    const cy = 4.0;
    const cz = -52;

    // 1. Dark walnut radial deck + dual brass frames + 8 carved star medallions
    worldProps.addRawStaticModel('bossArenaDeck', new THREE.Vector3(cx, cy, cz), 0, 1, true);
    // 2. Central reflective glass pit cover + brass mullions
    const glassModel = worldProps.addRawStaticModel(
      'bossArenaGlass',
      new THREE.Vector3(cx, cy - 0.01, cz),
      0,
      1,
      false
    );
    if (glassModel) this.bossDetailObjects.push(glassModel);
    // Flat arena physics surface (covers glass pit cleanly so battle footing is rock-solid)
    physics.addStaticCylinder(cx, cy - 4.0, cz, 4.0, 18.5, { friction: 0.65 });

    // 3. Interlocking brass clockwork gears rotating underneath the glass window!
    const gearSpecs: Array<{
      key: 'bossGearLarge' | 'bossGearMedium' | 'bossGearSmall';
      dx: number;
      dy: number;
      dz: number;
      spd: number;
    }> = [
      { key: 'bossGearLarge', dx: 0.0, dy: -0.48, dz: 0.0, spd: 0.38 },
      { key: 'bossGearMedium', dx: -3.5, dy: -0.66, dz: -2.4, spd: -0.64 },
      { key: 'bossGearMedium', dx: 3.6, dy: -0.66, dz: 2.3, spd: -0.64 },
      { key: 'bossGearSmall', dx: -3.3, dy: -0.78, dz: 2.5, spd: 0.96 },
      { key: 'bossGearSmall', dx: 3.4, dy: -0.78, dz: -2.6, spd: 0.96 },
    ];
    for (const g of gearSpecs) {
      const m = worldProps.addRawStaticModel(
        g.key,
        new THREE.Vector3(cx + g.dx, cy + g.dy, cz + g.dz),
        0,
        1,
        true
      );
      if (m) {
        m.userData.spinSpeed = g.spd;
        clockworkGears.push(m);
        this.bossDetailObjects.push(m);
      }
    }

    // Warm golden under-glass illumination so brass gears gleam through the central pit window!
    const pitCenterLight = new THREE.PointLight(0xffb440, 26, 15, 1.6);
    pitCenterLight.position.set(cx, cy - 0.42, cz);
    this.group.add(pitCenterLight);
    this.pitCenterLight = pitCenterLight;
    for (const [qx, qz] of [
      [-2.8, -2.8],
      [2.8, -2.8],
      [-2.8, 2.8],
      [2.8, 2.8],
    ]) {
      const pitCornerLight = new THREE.PointLight(0xff9828, 18, 12, 1.7);
      pitCornerLight.position.set(cx + qx, cy - 0.42, cz + qz);
      this.group.add(pitCornerLight);
      this.extraBossPointLights.push(pitCornerLight);
    }

    // 4. Perimeter turned wooden balustrade (15 of 16 bays — bay 12 at South +Z open for Rainbow Bridge!)
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      if (i !== 12) {
        worldProps.queueRaw('bossBalusterSection', { x: cx, y: cy, z: cz, ry: theta });

        // Invisible physics barrier aligned with each bay so player never walks off the edge
        const px = cx + Math.cos(theta) * 17.75;
        const pz = cz - Math.sin(theta) * 17.75;
        physics.addStaticBox(px, cy + 0.85, pz, 0.35, 0.9, 3.6, {
          rotEuler: new THREE.Euler(0, theta, 0),
        });
      }

      // Temporary high perimeter barrier around all 16 bays (including bay 12 entrance) until Rainbow Bridge opens
      const lockPx = cx + Math.cos(theta) * 18.0;
      const lockPz = cz - Math.sin(theta) * 18.0;
      const lockCol = physics.addStaticBox(lockPx, cy + 15.0, lockPz, 0.40, 15.5, 3.70, {
        rotEuler: new THREE.Euler(0, theta, 0),
        friction: 0.0,
        ignoreRays: true,
      });
      gimmicks.registerBossLockCollider(lockCol);
    }

    // 5. 8 Symmetric wooden corner posts with warm glowing lanterns (+Z entrance flanked cleanly)
    const degList = [11.25, 56.25, 123.75, 168.75, 213.75, 258.75, 281.25, 326.25];
    const lanternTops: THREE.Vector3[] = [];
    for (let idx = 0; idx < degList.length; idx++) {
      const rad = THREE.MathUtils.degToRad(degList[idx]);
      const lx = cx + Math.cos(rad) * 17.80;
      const lz = cz - Math.sin(rad) * 17.80;
      // Face lantern bracket directly inward toward (cx, cz)
      const faceInwardYaw = Math.atan2(cx - lx, cz - lz);
      worldProps.queue('bossLanternPost', { x: lx, y: cy, z: lz, ry: faceInwardYaw });
      lanternTops.push(new THREE.Vector3(lx, cy + 3.12, lz));

      // 4 warm dusk PointLights on opposing cardinal lanterns for atmospheric orange pool highlights
      if (idx % 2 === 1) {
        const pt = new THREE.PointLight(0xff9c38, 18, 18, 1.7);
        pt.position.set(lx + Math.cos(rad) * -0.9, cy + 2.65, lz - Math.sin(rad) * -0.9);
        this.group.add(pt);
        if (idx === 1) {
          this.primaryLanternLight = pt;
        } else {
          this.extraBossPointLights.push(pt);
        }
      }
    }

    // Festive overhead pennants connecting the lanterns around the northern arc (Art Bible 09!)
    const arcOrder = [6, 7, 0, 1, 2, 3, 4, 5];
    for (let k = 0; k < arcOrder.length - 1; k++) {
      const a = arcOrder[k];
      const b = arcOrder[k + 1];
      if (a === 5 && b === 6) continue;
      worldProps.addGarlandSpan(
        lanternTops[a],
        lanternTops[b],
        9,
        0.52,
        [0xf2c864, 0x5ab28f, 0xe87b74, 0x6c8cc7, 0xf2dfc0]
      );
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
    this.worldProps = worldProps;
    const slimes: JellySlime[] = [];
    const tanks: WindupTank[] = [];
    const balloons: PropellerBalloon[] = [];
    const clockworkGears: THREE.Object3D[] = [];

    // Connect Blender-crafted custom toy & gimmick visuals!
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

    // =========================================================================
    // 1. SOUTH: Sculpted Denim-Trimmed Meadow & 5-Step Tutorial (Z = +16 .. +54)
    // =========================================================================
    terrain.addCraftTerrace(physics, {
      id: 'south_meadow',
      x: 0,
      z: 34,
      baseY: 0.0,
      radiusX: 25.0,
      radiusZ: 21.0,
      wallHeight: 8.5,
      hillAmp: 0.85,
      hillFreq: 0.13,
      phase: 0.4,
      denimRim: true,
      flatZones: [
        { shape: 'rect', x: 0, z: 44.8, hw: 5.5, hd: 4.5, feather: 2.2, surface: 'sand' },
        { shape: 'rect', x: 0, z: 32.5, hw: 2.7, hd: 16.0, feather: 2.2, surface: 'sand' },
        { shape: 'rect', x: 10.5, z: 24.0, hw: 8.8, hd: 2.4, feather: 2.0, surface: 'sand' },
        { shape: 'rect', x: -11.0, z: 25.2, hw: 9.0, hd: 2.4, feather: 2.0, surface: 'sand' },
        { shape: 'rect', x: 0, z: 18.2, hw: 4.8, hd: 4.0, feather: 2.0, surface: 'sand' },
        { shape: 'circle', x: 8.2, z: 39.5, r: 3.0, feather: 2.2, surface: 'grass' },
        { shape: 'circle', x: -8.2, z: 39.5, r: 2.8, feather: 2.2, surface: 'grass' },
      ],
    });

    // Left Terraced Denim Hill overlooking the start meadow (Art Bible 07!)
    terrain.addCraftTerrace(physics, {
      id: 'south_left_step',
      x: -17.0,
      z: 37.5,
      baseY: 1.7,
      radiusX: 8.6,
      radiusZ: 7.6,
      wallHeight: 4.6,
      hillAmp: 0.45,
      hillFreq: 0.18,
      phase: 1.2,
      denimRim: true,
      flatZones: [{ shape: 'circle', x: -18.5, z: 39.2, r: 2.6, feather: 1.5, surface: 'grass' }],
    });
    this.addRamp(
      physics,
      worldProps,
      new THREE.Vector3(-9.5, 0.0, 32.5),
      new THREE.Vector3(-12.5, 1.7, 34.5),
      3.4,
      0.48,
      true
    );
    physics.addStaticBox(-18.5, 3.0, 39.2, 1.45, 1.4, 1.35);

    // Right Terraced Denim Hill with Miniature Pastel Trampoline -> 2nd Tier! (Art Bible 07!)
    terrain.addCraftTerrace(physics, {
      id: 'south_right_step',
      x: 17.5,
      z: 35.5,
      baseY: 1.9,
      radiusX: 9.0,
      radiusZ: 8.0,
      wallHeight: 4.8,
      hillAmp: 0.48,
      hillFreq: 0.17,
      phase: 2.4,
      denimRim: true,
      flatZones: [
        { shape: 'circle', x: 14.2, z: 36.0, r: 2.2, feather: 1.5, surface: 'grass' },
        { shape: 'circle', x: 19.6, z: 36.2, r: 2.6, feather: 1.5, surface: 'grass' },
      ],
    });
    this.addRamp(
      physics,
      worldProps,
      new THREE.Vector3(10.0, 0.0, 32.0),
      new THREE.Vector3(13.2, 1.9, 34.0),
      3.4,
      0.48,
      true
    );
    physics.addStaticBox(19.6, 3.2, 36.2, 1.45, 1.4, 1.35);
    gimmicks.addRedSpring(physics, new THREE.Vector3(14.2, 1.9, 36.0), 13.8, 'pastel');
    this.addCushion(physics, worldProps, 16.5, 2.55, 30.8, 3.4, 0.72, 3.4, 0.18, onCushionBounce);

    // Upper 2nd Right Mini Terrace
    terrain.addCraftTerrace(physics, {
      id: 'south_right_tier2',
      x: 20.5,
      z: 25.5,
      baseY: 3.4,
      radiusX: 5.4,
      radiusZ: 4.8,
      wallHeight: 3.6,
      hillAmp: 0.25,
      denimRim: true,
      flatZones: [{ shape: 'circle', x: 20.5, z: 25.5, r: 3.2, feather: 1.0, surface: 'grass' }],
    });

    // Secret Star 4: Stepping block & hidden sky platform above south-right tier 2
    this.addBeveledBlockPlatform(physics, 17.2, 5.4, 25.5, 3.0, 0.8, 3.0, 0x7bd3cf);
    this.addBeveledBlockPlatform(physics, 22.2, 7.6, 25.5, 4.0, 0.9, 4.0, 0x76e0b8);
    collectibles.addPowerStar(
      4,
      '右の丘のひみつ足場',
      '南東のたかだい',
      new THREE.Vector3(22.2, 9.15, 25.5),
      true,
      'secret'
    );

    // Step 1: Inviting coin line floating cleanly above stepping stones!
    collectibles.addLineCoins(new THREE.Vector3(0, 1.20, 42.2), new THREE.Vector3(0, 1.20, 35.0), 5, true);

    // Step 2: Friendly Tutorial Slime
    slimes.push(slimesFactory(new THREE.Vector3(0, 0, 31.0), 'mint', true));

    // Step 3: Glowing Beveled Wooden Crates
    const c1 = blocks.spawnCrate(physics, new THREE.Vector3(-0.7, 0.65, 25.5), true);
    const c2 = blocks.spawnCrate(physics, new THREE.Vector3(0.7, 0.65, 25.5), true);
    const c3 = blocks.spawnCrate(physics, new THREE.Vector3(0.0, 1.95, 25.5), true);
    blocks.tutorialCrateIds.add(c1.id);
    blocks.tutorialCrateIds.add(c2.id);
    blocks.tutorialCrateIds.add(c3.id);

    // Interactive wooden domino stage at south meadow exit
    this.addBeveledBlockPlatform(physics, 0, 0.12, 19.5, 7.6, 0.28, 6.2, 0xd8a060, true);
    for (let i = 0; i < 10; i++) {
      blocks.spawnDomino(physics, new THREE.Vector3(-2.9 + i * 0.62, 1.08, 19.5), Math.PI / 2, i);
    }
    collectibles.addLineCoins(new THREE.Vector3(-2.6, 0.85, 21.1), new THREE.Vector3(2.6, 0.85, 21.1), 4);

    // Ambient meadow enemies & tumbling Alphabet Block towers
    slimes.push(slimesFactory(new THREE.Vector3(-8.5, 0, 29), 'pink'));
    slimes.push(slimesFactory(new THREE.Vector3(8.5, 0, 29), 'mint'));
    // Right 3-level pyramid (6 tumbling beveled blocks!)
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(7.0, 0.6, 40.0), 0);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(8.2, 0.6, 40.0), 1);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(9.4, 0.6, 40.0), 2);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(7.6, 1.8, 40.0), 3);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(8.8, 1.8, 40.0), 4);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(8.2, 3.0, 40.0), 5);
    // Left tower
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-8.2, 0.6, 40.0), 6);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-8.2, 1.8, 40.0), 7);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-8.2, 3.0, 40.0), 8);

    // =========================================================================
    // 2. CENTER HUB: Sculpted Wooden Toy Block Castle (STAR 1)
    // =========================================================================
    terrain.addCraftTerrace(physics, {
      id: 'center_castle_hub',
      x: 0,
      z: 0,
      baseY: 1.2,
      radiusX: 17.2,
      radiusZ: 16.5,
      wallHeight: 8.5,
      hillAmp: 0.55,
      hillFreq: 0.16,
      phase: 1.8,
      denimRim: true,
      flatZones: [
        { shape: 'rect', x: 0, z: -0.5, hw: 8.8, hd: 13.8, feather: 2.0, surface: 'sand' },
        { shape: 'rect', x: 9.0, z: 2.5, hw: 6.5, hd: 3.6, feather: 1.8, surface: 'sand' },
        { shape: 'rect', x: -9.0, z: -4.2, hw: 6.5, hd: 3.6, feather: 1.8, surface: 'sand' },
      ],
    });

    // Beveled wooden front stairs connecting Meadow (Y=0) -> Castle Hub (Y=1.2)
    worldProps.addGroundedStaticModel('castleStairsWood', new THREE.Vector3(0, 0.0, 14.8), 0, 1);
    terrain.addRimCutout(0, 15.8, 2.55, -1.0, 2.5);
    terrain.addRimCutout(0, -15.8, 3.8, 0.0, 2.5);
    physics.addStaticBox(0, 0.6, 14.8, 2.4, 0.55, 1.8, {
      rotEuler: new THREE.Euler(-Math.atan2(1.25, 3.4), 0, 0),
      friction: 0.68,
    });
    gimmicks.addCheckpoint(new THREE.Vector3(-4.2, 1.2, 12.2));

    // Carved semicircular Archway + flanking round Pastel Towers + Wall battlements
    worldProps.addGroundedStaticModel('castleArchGate', new THREE.Vector3(0, 1.2, 10.6), 0, 1);
    physics.addStaticBox(-3.55, 5.2, 10.6, 1.3, 4.0, 1.3);
    physics.addStaticBox(3.55, 5.2, 10.6, 1.3, 4.0, 1.3);
    physics.addStaticBox(0, 7.2, 10.6, 2.8, 1.1, 1.1);

    worldProps.queue('castleTowerRed', { x: -8.2, y: 1.2, z: 8.2, ry: 0.25, sx: 1 });
    worldProps.queue('castleTowerBlue', { x: 8.2, y: 1.2, z: 8.2, ry: -0.25, sx: 1 });
    worldProps.queue('castleWallCrenel', { x: -5.8, y: 1.2, z: 9.6, ry: 0.35, sx: 0.9 });
    worldProps.queue('castleWallCrenel', { x: 5.8, y: 1.2, z: 9.6, ry: -0.35, sx: 0.9 });
    physics.addStaticCylinder(-8.2, 5.2, 8.2, 4.0, 1.3);
    physics.addStaticCylinder(8.2, 5.2, 8.2, 4.0, 1.3);

    // Tiered Ascent Ramps (Wood Guardrail Bridges) -> Center Keep Summit (0, 10.2, 0)
    this.addRamp(physics, worldProps, new THREE.Vector3(6.5, 1.2, 6.5), new THREE.Vector3(6.5, 4.6, -5.5), 3.6, 0.50, true);
    this.addBeveledBlockPlatform(physics, 6.5, 4.6, -6.5, 5.2, 3.4, 5.0, 0x3a7ad4);
    collectibles.addLineCoins(new THREE.Vector3(6.5, 2.2, 5.0), new THREE.Vector3(6.5, 5.2, -5.0), 5);

    this.addRamp(physics, worldProps, new THREE.Vector3(4.5, 4.6, -6.5), new THREE.Vector3(-5.5, 7.6, -6.5), 3.4, 0.50, true);
    this.addBeveledBlockPlatform(physics, -6.5, 7.6, -6.5, 5.2, 6.4, 5.2, 0xde454c);
    collectibles.addLineCoins(new THREE.Vector3(3.5, 5.6, -6.5), new THREE.Vector3(-4.5, 8.2, -6.5), 4);

    this.addRamp(physics, worldProps, new THREE.Vector3(-4.8, 7.6, -4.5), new THREE.Vector3(-1.0, 10.2, -0.5), 3.4, 0.50, true);

    // Custom Sculpted Center Keep Tower (9.0m high from Y=1.2 -> top sits exactly at Y=10.2!)
    worldProps.addGroundedStaticModel('castleKeepCenter', new THREE.Vector3(0, 1.2, 0), 0, 1);
    physics.addStaticBox(0, 5.7, 0, 3.2, 4.5, 3.2);

    // Courtyard crashing alphabet blocks + guard enemies
    for (let i = 0; i < 4; i++) {
      blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-2 + i * 1.3, 1.8, 3.8), i);
    }
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-1.35, 3.0, 3.8), 4);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(-0.05, 3.0, 3.8), 5);
    blocks.spawnAlphabetBlock(physics, new THREE.Vector3(1.25, 3.0, 3.8), 6);
    const secretCrate = blocks.spawnCrate(physics, new THREE.Vector3(0, 1.85, -4.5), true);
    const secretCrateId = secretCrate.id;
    collectibles.addPowerStar(
      5,
      'キャッスル裏のひみつ木箱',
      '中央キャッスル',
      new THREE.Vector3(0, 2.75, -4.5),
      false,
      'secret',
      true
    );
    // Heart 1: Castle courtyard entrance
    collectibles.addHeart(new THREE.Vector3(4.2, 2.0, 11.8));
    tanks.push(tanksFactory(new THREE.Vector3(0, 1.2, 5.8)));
    slimes.push(slimesFactory(new THREE.Vector3(6.5, 4.6, -6.5), 'pink'));

    // STAR 1 on Castle Summit!
    collectibles.addPowerStar(1, '積み木キャッスルのてっぺん', '中央キャッスル', new THREE.Vector3(0, 11.75, 0), true);

    // =========================================================================
    // 3. EAST: Felt Hills, 16-Domino Cascade, Squash Cushions & Spring Tower (STAR 2)
    // =========================================================================
    this.addRamp(physics, worldProps, new THREE.Vector3(14.5, 0.0, 22.0), new THREE.Vector3(21.5, 0.4, 15.0), 4.4, 0.52, true);
    this.addRamp(physics, worldProps, new THREE.Vector3(13.5, 1.2, 4.0), new THREE.Vector3(19.0, 0.4, 6.0), 4.0, 0.52, true);

    terrain.addCraftTerrace(physics, {
      id: 'east_cushions',
      x: 27,
      z: 6,
      baseY: 0.4,
      radiusX: 14.5,
      radiusZ: 14.2,
      wallHeight: 8.0,
      hillAmp: 0.78,
      hillFreq: 0.14,
      phase: 2.2,
      denimRim: true,
      flatZones: [
        { shape: 'circle', x: 21.5, z: 14.0, r: 3.4, feather: 1.8, surface: 'sand' },
        { shape: 'rect', x: 21.4, z: 8.2, hw: 2.8, hd: 6.2, feather: 1.8, surface: 'sand' },
        { shape: 'rect', x: 28.6, z: 6.0, hw: 4.8, hd: 7.5, feather: 1.8, surface: 'grass' },
        { shape: 'circle', x: 28.0, z: 0.8, r: 5.5, feather: 2.0, surface: 'sand' },
      ],
    });
    // Fluffy mossy felt hill mounds overlooking the east diorama
    terrain.addFeltHillMound(physics, 34.8, 0.4, 11.5, 3.6, 2.2, 3.2);
    terrain.addFeltHillMound(physics, 36.2, 0.4, 1.2, 3.2, 2.6, 3.4);
    terrain.addFeltHillMound(physics, 19.8, 0.4, -1.8, 2.8, 1.8, 2.6);

    gimmicks.addCheckpoint(new THREE.Vector3(18.6, 0.4, 13.8));
    // Heart 2: East area before cushions
    collectibles.addHeart(new THREE.Vector3(23.2, 1.3, 12.8));

    // Art Bible 08 centerpiece: 16-piece S-curve Cascading Domino Road (west lane, >= 2.2m clear of cushions!)
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const dx = 21.4 + Math.sin(t * Math.PI * 1.4) * 0.85;
      const dz = 13.2 - t * 10.2;
      const tangentX = Math.cos(t * Math.PI * 1.4) * ((0.85 * Math.PI * 1.4) / 15);
      const tangentZ = -10.2 / 15;
      const ry = Math.atan2(tangentX, tangentZ);
      blocks.spawnDomino(physics, new THREE.Vector3(dx, 1.33, dz), ry, i, 'east');
    }

    // Squishy Patchwork Cushion Staircase (east lane, >= 2.2m clear of dominos and completely clear of Spring Tower!)
    this.addCushion(physics, worldProps, 26.8, 1.2, 12.2, 3.6, 0.9, 3.6, 0.16, onCushionBounce);
    this.addCushion(physics, worldProps, 29.4, 2.2, 9.0, 3.6, 0.9, 3.6, -0.18, onCushionBounce);
    this.addCushion(physics, worldProps, 30.2, 3.3, 5.6, 3.6, 0.9, 3.6, 0.14, onCushionBounce);
    this.addCushion(physics, worldProps, 28.0, 4.4, 2.3, 4.2, 0.95, 4.2, -0.12, onCushionBounce);

    // Triple Coil Spring Tower: Honey-Oak Wood Top Coils -> Red Bumper Top -> Star 2!
    this.addBeveledBlockPlatform(physics, 28, 5.2, -2.5, 5.2, 4.8, 5.2, 0xe4b534);
    gimmicks.addRedSpring(physics, new THREE.Vector3(28, 5.2, -2.5), 19.5, 'wood');

    this.addBeveledBlockPlatform(physics, 28, 11.0, -8.5, 6.2, 1.2, 6.2, 0x3b7ad8);
    collectibles.addLineCoins(new THREE.Vector3(28, 8.5, -5.5), new THREE.Vector3(28, 11.8, -7.5), 3);
    gimmicks.addRedSpring(physics, new THREE.Vector3(28, 11.0, -8.5), 20.5, 'wood');

    this.addBeveledBlockPlatform(physics, 24, 17.0, -14.5, 6.2, 1.2, 6.2, 0xe04850);
    collectibles.addLineCoins(new THREE.Vector3(26, 14.5, -11.5), new THREE.Vector3(24, 17.8, -13.5), 3);
    gimmicks.addRedSpring(physics, new THREE.Vector3(24, 17.0, -14.5), 20.0, 'red');

    // Summit platform for Star 2
    this.addBeveledBlockPlatform(physics, 21, 23.0, -20.5, 8.0, 1.4, 8.0, 0x67cc9e);
    collectibles.addPowerStar(2, '赤バネそらのてっぺん', '東の赤バネタワー', new THREE.Vector3(21, 24.55, -20.5), true);

    balloons.push(balloonsFactory(new THREE.Vector3(20, 7.5, -6)));
    balloons.push(balloonsFactory(new THREE.Vector3(17, 13.5, -14)));

    // =========================================================================
    // 4. WEST: Pastel Rounded Giant Slide & Bowling Plaza (STAR 3)
    // =========================================================================
    terrain.addCraftTerrace(physics, {
      id: 'west_hill',
      x: -30,
      z: 9.5,
      baseY: 8.6,
      radiusX: 8.6,
      radiusZ: 8.2,
      wallHeight: 11.5,
      hillAmp: 0.55,
      hillFreq: 0.22,
      phase: 3.1,
      denimRim: true,
      flatZones: [
        { shape: 'rect', x: -29.0, z: 6.5, hw: 3.8, hd: 5.5, feather: 1.5, surface: 'sand' },
      ],
    });
    this.addRamp(physics, worldProps, new THREE.Vector3(-17.5, 0.0, 23.5), new THREE.Vector3(-26.5, 4.4, 19.5), 4.6, 0.55, true);
    this.addBeveledBlockPlatform(physics, -28.0, 4.4, 18.0, 5.4, 0.85, 5.4, 0xd8a060, true);
    this.addRamp(physics, worldProps, new THREE.Vector3(-28.0, 4.4, 16.0), new THREE.Vector3(-29.5, 8.6, 12.0), 4.6, 0.55, true);
    gimmicks.addCheckpoint(new THREE.Vector3(-28.0, 4.4, 18.0));

    // Fluffy moss hill overlooking the slide top + Secret Star 6
    terrain.addFeltHillMound(physics, -34.2, 8.6, 12.8, 2.8, 2.2, 2.8);
    terrain.addFeltHillMound(physics, -24.5, 8.6, 11.2, 2.4, 1.8, 2.4);
    this.addBeveledBlockPlatform(physics, -32.2, 9.8, 12.0, 2.2, 0.8, 2.2, 0xd8a060, true);
    collectibles.addPowerStar(
      6,
      'すべり台のうらの見晴らし',
      '西のひみつの丘',
      new THREE.Vector3(-34.2, 12.3, 12.8),
      true,
      'secret'
    );

    collectibles.addLineCoins(new THREE.Vector3(-29.2, 9.3, 9.0), new THREE.Vector3(-28.5, 9.3, 2.5), 4);
    this.buildCurvedSlide(physics);

    // North-West Honey-Oak Wooden Bowling Deck (Y = 0.5) + Bridge from Castle West
    terrain.addCraftTerrace(physics, {
      id: 'west_bowling_deck',
      x: -21,
      z: -30.5,
      baseY: 0.5,
      radiusX: 13.0,
      radiusZ: 12.2,
      wallHeight: 6.2,
      hillAmp: 0.0,
      denimRim: false,
      defaultSurface: 'sand',
    });
    // Overlay rich oak plank deck surface flush at Y = 0.50 with honey-oak sheen
    const oakDeckMaps = this.pbr?.cloneMaps('oakVeneer', 5, 5);
    const bowlingWoodDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(12.6, 12.6, 0.06, 48),
      new THREE.MeshStandardMaterial({
        color: 0xdba568,
        map: oakDeckMaps?.diff ?? this.textures.woodDeck,
        normalMap: oakDeckMaps?.nor ?? null,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: oakDeckMaps?.rough ?? null,
        roughness: 0.54,
        envMapIntensity: 0.5,
      })
    );
    bowlingWoodDisk.position.set(-21, 0.48, -30.5);
    bowlingWoodDisk.receiveShadow = true;
    this.group.add(bowlingWoodDisk);
    physics.addStaticCylinder(-21, 0.25, -30.5, 0.25, 12.8, { friction: 0.55 });

    this.addRamp(physics, worldProps, new THREE.Vector3(-13.5, 1.2, -5.0), new THREE.Vector3(-17.5, 0.5, -20.5), 4.4, 0.50, true);

    // Pastel wooden toy twin towers flanking the slide exit at Bowling Plaza
    worldProps.queue('castleTowerRed', { x: -25.4, y: 0.5, z: -24.5, ry: 0.15, sx: 0.85 });
    worldProps.queue('castleTowerBlue', { x: -16.6, y: 0.5, z: -24.5, ry: -0.15, sx: 0.85 });

    // 15 Smooth Lathe Bowling Pins
    const pinStartZ = -26.2;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const px = -21 + (col - row * 0.5) * 1.05;
        const pz = pinStartZ - row * 1.02;
        blocks.spawnBowlingPin(physics, new THREE.Vector3(px, 1.32, pz));
      }
    }
    // Bonus wooden domino arc flanking bowling pins
    for (let i = 0; i < 6; i++) {
      blocks.spawnDomino(physics, new THREE.Vector3(-26.8 + i * 0.65, 1.45, -27.2), Math.PI / 2, i);
    }

    // 3 Wind-up Tank guards patrolling perimeter cleanly outside bowling pins
    tanks.push(tanksFactory(new THREE.Vector3(-27.2, 0.5, -30.5), true));
    tanks.push(tanksFactory(new THREE.Vector3(-14.8, 0.5, -30.5), true));
    tanks.push(tanksFactory(new THREE.Vector3(-21.0, 0.5, -35.8), true));

    collectibles.addPowerStar(3, 'すべり台ボーリングマスター', '西のボーリング広場', new THREE.Vector3(-21, 2.05, -38.5), false);
    // Heart 3: West bowling plaza entrance
    collectibles.addHeart(new THREE.Vector3(-17.8, 1.4, -22.2));

    // =========================================================================
    // 5. NORTH: 3-Star Gate, Rainbow Bridge & Art Bible 09 Clockwork Boss Arena
    // =========================================================================
    gimmicks.buildStarGateAndRainbowBridge(physics);
    this.buildBossArena(physics, worldProps, gimmicks, clockworkGears);
    // Keep checkpoint outside Boss Arena camera sightlines (just south of Star Gate)
    gimmicks.addCheckpoint(new THREE.Vector3(-3.8, 1.2, -12.0));
    // Heart 4: Before boss gate checkpoint
    collectibles.addHeart(new THREE.Vector3(3.6, 2.1, -11.8));
    // Heart 5: Inside boss arena (respawnable on boss retry!)
    collectibles.addHeart(new THREE.Vector3(0, 4.9, -39.2), true);

    // Dynamic boss-fight popup Red Spring (appears near boss when stunned)
    gimmicks.initBossPopupSpring(22.2);

    // Distant rolling green craft hills under the daytime horizon
    terrain.addDistantHorizonHills();

    // Finalize masked denim/wood terrace rims & flush fine capsule stitches
    terrain.finalizeTerraceRims();
    terrain.flushStitches();
    const isGrassExcluded = (x: number, z: number): boolean => {
      // Starting knitted rug & sandy footpath corridor + castle wood stairs
      if (Math.abs(x) < 5.3 && z > 40.2 && z < 49.6) return true;
      if (Math.abs(x) < 2.8 && z > 12.2 && z < 41.0) return true;
      if (Math.abs(x) < 4.2 && z > 16.6 && z < 22.8) return true;
      // Branch footpaths
      if (Math.abs(z - 24.5) < 2.2 && Math.abs(x) < 20.0) return true;
      if (Math.abs(x) < 7.4 && Math.abs(z - 0.5) < 11.2) return true;
      if (Math.abs(z - 2.5) < 3.2 && x > 0 && x < 15.5) return true;
      if (Math.abs(z + 4.2) < 3.2 && x < 0 && x > -15.5) return true;
      // Toys, houses, pyramids, east domino lane, slide top, checkpoints
      if (Math.hypot(x + 18.5, z - 39.2) < 2.5) return true;
      if (Math.hypot(x - 19.6, z - 36.2) < 2.5) return true;
      if (Math.hypot(x - 14.2, z - 36.0) < 1.9) return true;
      if (Math.hypot(x - 8.2, z - 39.5) < 2.8) return true;
      if (Math.hypot(x + 8.2, z - 39.5) < 2.2) return true;
      if (Math.hypot(x - 21.5, z - 14.0) < 3.2) return true;
      if (Math.hypot(x - 28.0, z - 0.8) < 5.0) return true;
      if (x > 18.5 && x < 24.4 && z > 2.0 && z < 14.8) return true;
      if (x > 24.8 && x < 32.8 && z > -0.5 && z < 13.5) return true;
      if (Math.abs(x + 29.0) < 3.6 && z > 0.5 && z < 11.5) return true;
      if (Math.hypot(x - 34.8, z - 11.5) < 3.2) return true;
      if (Math.hypot(x - 36.2, z - 1.2) < 2.9) return true;
      return false;
    };

    grassField.scatterDisk(terrain, 0, 34, 24.2, 20.2, 10200, 101, isGrassExcluded);
    grassField.scatterDisk(terrain, -17.0, 37.5, 8.1, 7.1, 2400, 202, isGrassExcluded);
    grassField.scatterDisk(terrain, 17.5, 35.5, 8.5, 7.5, 2400, 303, isGrassExcluded);
    grassField.scatterDisk(terrain, 20.5, 25.5, 4.9, 4.3, 1000, 404, isGrassExcluded);
    grassField.scatterDisk(terrain, 0, 0, 16.5, 15.9, 3200, 505, isGrassExcluded);
    grassField.scatterDisk(terrain, 27, 6, 13.9, 13.7, 3600, 606, isGrassExcluded);
    grassField.scatterDisk(terrain, -30, 9.5, 8.1, 7.7, 1600, 707, isGrassExcluded);
    grassField.finalize();

    const protoQueue = worldProps.queue;
    const protoAddGrounded = worldProps.addGroundedStaticModel;
    const hasOwnQueue = Object.prototype.hasOwnProperty.call(worldProps, 'queue');
    const hasOwnAddGrounded = Object.prototype.hasOwnProperty.call(worldProps, 'addGroundedStaticModel');
    worldProps.queue = (key, t) => {
      if (key === 'steppingStoneRound') {
        const groundY = terrain.sampleHeight(t.x, t.z) ?? t.y;
        protoQueue.call(worldProps, key, { ...t, y: groundY - 0.05, sy: 0.22 });
        return;
      }
      if (key === 'steppingStonePlank') {
        const groundY = terrain.sampleHeight(t.x, t.z) ?? t.y;
        protoQueue.call(worldProps, key, { ...t, y: groundY - 0.048, sy: 0.24 });
        return;
      }
      protoQueue.call(worldProps, key, t);
    };
    worldProps.addGroundedStaticModel = (key, pos, ry = 0, scale = 1) => {
      const inst = protoAddGrounded.call(worldProps, key, pos, ry, scale);
      if (inst && key === 'patchworkRug') {
        inst.scale.y = scale * 0.24;
        inst.position.y = pos.y - 0.003;
      }
      return inst;
    };
    try {
      worldProps.populateFieldProps(terrain);
    } finally {
      if (hasOwnQueue) worldProps.queue = protoQueue;
      else delete (worldProps as Partial<WorldPropsManager>).queue;
      if (hasOwnAddGrounded) worldProps.addGroundedStaticModel = protoAddGrounded;
      else delete (worldProps as Partial<WorldPropsManager>).addGroundedStaticModel;
    }
    this.flushSlabTrims(worldProps);
    blocks.finalizeDynamicInstances();

    // Victory chest (hidden until boss is defeated)
    gimmicks.buildVictoryChest();
    this.setQuality(this.quality);

    return {
      slimes,
      tanks,
      balloons,
      clockworkGears,
      secretCrateId,
      tutorialCoinPos: new THREE.Vector3(0, 0.2, 40.5),
      tutorialCratePos: new THREE.Vector3(0, 0.5, 25.5),
    };
  }

  setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    const isLow = resolved === 'low';
    for (const pt of this.extraBossPointLights) {
      pt.visible = !isLow;
    }
    if (this.pitCenterLight) {
      this.pitCenterLight.intensity = isLow ? 32 : 26;
      if (!isLow) this.pitCenterLight.visible = true;
    }
    if (this.primaryLanternLight) {
      this.primaryLanternLight.intensity = isLow ? 26 : 18;
      this.primaryLanternLight.distance = isLow ? 28 : 18;
      if (!isLow) this.primaryLanternLight.visible = true;
    }
    if (!isLow) {
      for (const obj of this.bossDetailObjects) obj.visible = true;
      for (const c of this.cushionSpecs) {
        if (c.model) c.model.visible = true;
      }
    }
  }

  updateDistanceCulling(resolved: ResolvedQuality, camPos: THREE.Vector3): void {
    if (resolved !== 'low') {
      for (const obj of this.bossDetailObjects) obj.visible = true;
      for (const c of this.cushionSpecs) {
        if (c.model) c.model.visible = true;
      }
      if (this.pitCenterLight) this.pitCenterLight.visible = true;
      if (this.primaryLanternLight) this.primaryLanternLight.visible = true;
      return;
    }
    const bossDist = Math.hypot(camPos.x - 0, camPos.z + 52);
    const showDetails = bossDist <= 56;
    for (const obj of this.bossDetailObjects) {
      obj.visible = showDetails;
    }
    const showBossLights = bossDist <= 58;
    if (this.pitCenterLight) this.pitCenterLight.visible = showBossLights;
    if (this.primaryLanternLight) this.primaryLanternLight.visible = showBossLights;

    for (const c of this.cushionSpecs) {
      if (!c.model) continue;
      c.model.visible = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) <= 52;
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.cushionSpecs.length = 0;
    this.extraBossPointLights.length = 0;
    this.bossDetailObjects.length = 0;
    this.slabTrimBatch.length = 0;
  }

  update(dt: number): void {
    // Soft damped spring physics for bouncy patchwork cushions!
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

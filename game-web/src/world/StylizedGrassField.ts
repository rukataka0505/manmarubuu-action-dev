import * as THREE from 'three';
import type { ResolvedQuality } from '../types';
import type { CraftTerrainBuilder } from './CraftTerrainBuilder';

/**
 * GPU-instanced curved 3D stylized grass tufts (Art Bible 07) with smooth wind sway
 * and local brushing-aside around Manmarubuu's position.
 */
interface GrassIslandSlot {
  inst: THREE.InstancedMesh;
  maxCount: number;
  center: THREE.Vector3;
  radius: number;
}

export class StylizedGrassField {
  public readonly group = new THREE.Group();
  public clusterCount = 0;
  public maxClusterCount = 0;

  private readonly uTime = { value: 0 };
  private readonly uPlayerPos = { value: new THREE.Vector3(0, -100, 0) };
  private islandMatrices: THREE.Matrix4[][] = [];
  private islandSlots: GrassIslandSlot[] = [];
  private highGeo: THREE.BufferGeometry | null = null;
  private lowGeo: THREE.BufferGeometry | null = null;
  private highMat: THREE.MeshStandardMaterial | null = null;
  private lowMat: THREE.MeshLambertMaterial | null = null;
  private quality: ResolvedQuality = 'medium';

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private createClusterGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const colBase = new THREE.Color(0x3b8c26);
    const colTip = new THREE.Color(0x9ee248);
    const tmpCol = new THREE.Color();

    // 5 lush curved 3-segment blades per tuft fanning outward cleanly
    const blades = 5;
    let vBase = 0;

    for (let b = 0; b < blades; b++) {
      const ang = (b / blades) * Math.PI * 2 + (b % 2) * 0.28;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rx = -sa;
      const rz = ca;
      const ox = ca * 0.055;
      const oz = sa * 0.055;
      const lean = 0.16 + (b % 3) * 0.05;
      const height = 0.30 + (b % 3) * 0.05;

      const levels = [
        { t: 0.0, w: 0.068, y: 0.0, out: 0.0 },
        { t: 0.42, w: 0.044, y: height * 0.44, out: lean * 0.32 },
        { t: 0.78, w: 0.022, y: height * 0.80, out: lean * 0.72 },
      ];

      for (const lv of levels) {
        tmpCol.lerpColors(colBase, colTip, lv.t);
        const cx = ox + ca * lv.out;
        const cz = oz + sa * lv.out;
        positions.push(cx - rx * lv.w, lv.y, cz - rz * lv.w);
        positions.push(cx + rx * lv.w, lv.y, cz + rz * lv.w);
        normals.push(ca * 0.35, 0.94, sa * 0.35);
        normals.push(ca * 0.35, 0.94, sa * 0.35);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }

      // Single sharp tip vertex
      positions.push(ox + ca * lean, height, oz + sa * lean);
      normals.push(ca * 0.4, 0.92, sa * 0.4);
      colors.push(colTip.r, colTip.g, colTip.b);

      // Triangles
      indices.push(vBase + 0, vBase + 1, vBase + 3);
      indices.push(vBase + 0, vBase + 3, vBase + 2);
      indices.push(vBase + 2, vBase + 3, vBase + 5);
      indices.push(vBase + 2, vBase + 5, vBase + 4);
      indices.push(vBase + 4, vBase + 5, vBase + 6);

      vBase += 7;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  private createLowClusterGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const colBase = new THREE.Color(0x3b8c26);
    const colTip = new THREE.Color(0x9ee248);
    const colMid = new THREE.Color().lerpColors(colBase, colTip, 0.55);

    // 3 curved 2-segment blades per tuft (9 tris/tuft) for lightweight mobile rendering
    const blades = 3;
    let vBase = 0;

    for (let b = 0; b < blades; b++) {
      const ang = (b / blades) * Math.PI * 2 + 0.35;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rx = -sa;
      const rz = ca;
      const ox = ca * 0.05;
      const oz = sa * 0.05;
      const lean = 0.17 + (b % 2) * 0.05;
      const height = 0.31 + (b % 2) * 0.05;

      const levels = [
        { col: colBase, w: 0.088, y: 0.0, out: 0.0 },
        { col: colMid, w: 0.052, y: height * 0.54, out: lean * 0.45 },
      ];

      for (const lv of levels) {
        const cx = ox + ca * lv.out;
        const cz = oz + sa * lv.out;
        positions.push(cx - rx * lv.w, lv.y, cz - rz * lv.w);
        positions.push(cx + rx * lv.w, lv.y, cz + rz * lv.w);
        normals.push(ca * 0.35, 0.94, sa * 0.35);
        normals.push(ca * 0.35, 0.94, sa * 0.35);
        colors.push(lv.col.r, lv.col.g, lv.col.b);
        colors.push(lv.col.r, lv.col.g, lv.col.b);
      }

      positions.push(ox + ca * lean, height, oz + sa * lean);
      normals.push(ca * 0.4, 0.92, sa * 0.4);
      colors.push(colTip.r, colTip.g, colTip.b);

      indices.push(vBase + 0, vBase + 1, vBase + 3);
      indices.push(vBase + 0, vBase + 3, vBase + 2);
      indices.push(vBase + 2, vBase + 3, vBase + 4);
      vBase += 5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  private attachGrassVertexShader(mat: THREE.Material, cacheKey: string): void {
    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = this.uTime;
      shader.uniforms.uPlayerPos = this.uPlayerPos;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uGrassTime;
          uniform vec3 uPlayerPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 grassOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #else
            vec4 grassOrigin = vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          float bladeFactor = clamp(position.y * 3.2, 0.0, 1.0);
          float sway = sin(uGrassTime * 2.2 + grassOrigin.x * 0.45 + grassOrigin.z * 0.38);
          float gust = cos(uGrassTime * 1.3 + grassOrigin.x * 0.18 - grassOrigin.z * 0.22);
          transformed.x += (sway * 0.065 + gust * 0.03) * bladeFactor * bladeFactor;
          transformed.z += (gust * 0.045) * bladeFactor * bladeFactor;

          vec2 toPlayer = grassOrigin.xz - uPlayerPos.xz;
          float pDist = length(toPlayer);
          float yGap = abs(grassOrigin.y - uPlayerPos.y);
          if (pDist < 1.35 && yGap < 1.15) {
            float push = (1.0 - pDist / 1.35) * bladeFactor * 0.34;
            vec2 dir = pDist > 0.01 ? normalize(toPlayer) : vec2(1.0, 0.0);
            transformed.x += dir.x * push;
            transformed.z += dir.y * push;
            transformed.y *= (1.0 - 0.32 * (1.0 - pDist / 1.35) * bladeFactor);
          }`
        );
    };
  }

  private createGrassMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.80,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.38,
    });
    this.attachGrassVertexShader(mat, 'grass_std_v1');
    return mat;
  }

  private createLowGrassMaterial(): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.attachGrassVertexShader(mat, 'grass_lambert_v1');
    return mat;
  }

  scatterDisk(
    terrain: CraftTerrainBuilder,
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    count: number,
    seed: number,
    isExcluded: (x: number, z: number) => boolean
  ): void {
    const dummy = new THREE.Object3D();
    let s = seed | 0;
    const rand = (): number => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) % 100000) / 100000;
    };

    const islandList: THREE.Matrix4[] = [];
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * 0.935;
      const wx = cx + Math.cos(ang) * rx * rad;
      const wz = cz + Math.sin(ang) * rz * rad;
      if (isExcluded(wx, wz)) continue;

      const y = terrain.sampleHeight(wx, wz);
      if (y === null) continue;

      dummy.position.set(wx, y - 0.02, wz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const scXZ = 0.85 + rand() * 0.55;
      const scY = 0.85 + rand() * 0.65;
      dummy.scale.set(scXZ, scY, scXZ);
      dummy.updateMatrix();
      islandList.push(dummy.matrix.clone());
    }
    if (islandList.length > 0) {
      this.islandMatrices.push(islandList);
    }
  }

  finalize(): void {
    if (this.islandMatrices.length === 0) return;

    this.highGeo = this.createClusterGeometry();
    this.lowGeo = this.createLowClusterGeometry();
    this.highMat = this.createGrassMaterial();
    this.lowMat = this.createLowGrassMaterial();
    let totalMax = 0;

    // Deterministic Fisher-Yates shuffle per island so quality caps thin grass uniformly
    let s = 0x51a9c3d7 | 0;
    for (const list of this.islandMatrices) {
      for (let i = list.length - 1; i > 0; i--) {
        s = (s * 1664525 + 1013904223) | 0;
        const j = (s >>> 0) % (i + 1);
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }

      const inst = new THREE.InstancedMesh(this.highGeo, this.highMat, list.length);
      inst.castShadow = false;
      inst.receiveShadow = true;

      for (let i = 0; i < list.length; i++) {
        inst.setMatrixAt(i, list[i]);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.frustumCulled = true;
      this.group.add(inst);

      const bs = inst.boundingSphere;
      this.islandSlots.push({
        inst,
        maxCount: list.length,
        center: bs ? bs.center.clone() : new THREE.Vector3(),
        radius: bs ? bs.radius : 12,
      });
      totalMax += list.length;
    }

    this.maxClusterCount = totalMax;
    this.islandMatrices = [];
    this.applyInstanceCount();
  }

  public setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    this.applyInstanceCount();
  }

  private applyInstanceCount(): void {
    if (this.islandSlots.length === 0) return;
    const isLow = this.quality === 'low';
    const ratio = this.quality === 'high' ? 1.0 : this.quality === 'medium' ? 0.7 : 0.15;
    const targetGeo = isLow ? this.lowGeo : this.highGeo;
    const targetMat = isLow ? this.lowMat : this.highMat;

    let totalCount = 0;
    for (const slot of this.islandSlots) {
      if (targetGeo && slot.inst.geometry !== targetGeo) {
        slot.inst.geometry = targetGeo;
      }
      if (targetMat && slot.inst.material !== targetMat) {
        slot.inst.material = targetMat;
      }
      if (!isLow) {
        slot.inst.visible = true;
      }
      const count = Math.max(0, Math.min(slot.maxCount, Math.round(slot.maxCount * ratio)));
      slot.inst.count = count;
      totalCount += count;
    }
    this.clusterCount = totalCount;
  }

  updateDistanceCulling(resolved: ResolvedQuality, camPos: THREE.Vector3): void {
    const isLow = resolved === 'low';
    for (const slot of this.islandSlots) {
      if (!isLow) {
        slot.inst.visible = true;
        continue;
      }
      const maxD = 48 + slot.radius;
      slot.inst.visible = slot.center.distanceToSquared(camPos) <= maxD * maxD;
    }
  }

  update(time: number, playerPos: THREE.Vector3): void {
    this.uTime.value = time;
    this.uPlayerPos.value.copy(playerPos);
  }
}

import * as THREE from 'three';
import { mergeIndexedOrNonIndexed } from '../assets/GeometryMerge';
import type { PbrAssets } from '../assets/PbrAssets';
import type { PhysicsWorld } from '../core/PhysicsWorld';
import type { ResolvedQuality } from '../types';

export interface FlatZone {
  shape: 'rect' | 'circle';
  x: number;
  z: number;
  hw?: number;
  hd?: number;
  r?: number;
  feather?: number;
  surface?: 'sand' | 'grass';
}

export interface CraftTerraceSpec {
  id: string;
  x: number;
  z: number;
  baseY: number;
  radiusX: number;
  radiusZ: number;
  wallHeight: number;
  hillAmp?: number;
  hillFreq?: number;
  phase?: number;
  denimRim?: boolean;
  defaultSurface?: 'grass' | 'sand';
  flatZones?: FlatZone[];
}

interface StitchTransform {
  x: number;
  y: number;
  z: number;
  ry: number;
  tiltX: number;
}

export interface RimCutout {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

interface DeferredTerraceRim {
  spec: CraftTerraceSpec;
  radialSegs: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0 || 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Builds sculpted craft terrain terraces with denim stitched edges, wooden walls,
 * undulating grass hills blending seamlessly into soft sand paths, felt hill mounds,
 * and distant storybook hills under the skybox.
 */
export class CraftTerrainBuilder {
  public readonly group = new THREE.Group();
  private terraces: CraftTerraceSpec[] = [];
  private deferredRims: DeferredTerraceRim[] = [];
  private rimCutouts: RimCutout[] = [];
  private terraceStitches: StitchTransform[][] = [];
  private highStitchMeshes: THREE.InstancedMesh[] = [];
  private lowStitchMeshes: THREE.InstancedMesh[] = [];
  private quality: ResolvedQuality = 'medium';
  private horizonUniforms = {
    uBossMood: { value: 0.0 },
    uSunDir: { value: new THREE.Vector3(0.75, 0.5, 0.43).normalize() },
  };

  private grassMat!: THREE.MeshStandardMaterial;
  private denimMat!: THREE.MeshStandardMaterial;
  private woodWallMat!: THREE.MeshStandardMaterial;
  private trimWoodMat!: THREE.MeshStandardMaterial;
  private feltHillMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, private pbr?: PbrAssets, private lowInit = false) {
    scene.add(this.group);
    this.initMaterials();
  }

  private initMaterials(): void {
    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.90,
      metalness: 0.0,
      envMapIntensity: 0.42,
    });

    this.denimMat = new THREE.MeshStandardMaterial({
      color: 0x3b76bd,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.45,
    });

    this.woodWallMat = new THREE.MeshStandardMaterial({
      color: 0xc28a52,
      normalScale: new THREE.Vector2(0.70, 0.70),
      roughness: 0.68,
      metalness: 0.02,
      envMapIntensity: 0.44,
    });

    this.trimWoodMat = new THREE.MeshStandardMaterial({
      color: 0xd9a162,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.52,
      envMapIntensity: 0.50,
    });

    this.feltHillMat = new THREE.MeshStandardMaterial({
      color: 0x4f842c,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.94,
      envMapIntensity: 0.36,
    });

    this.refreshPbrMaps();
  }

  public refreshPbrMaps(): void {
    const fleece = this.pbr?.cloneMaps('polarFleece', 12, 12);
    const sand = this.pbr?.cloneMaps('playgroundSand', 10, 10);
    const denim = this.pbr?.cloneMaps('denimFabric', 18, 2);
    const oakWall = this.pbr?.cloneMaps('oakVeneer', 14, 2);
    const hillFleece = this.pbr?.cloneMaps('polarFleece', 5, 5);

    this.grassMat.normalMap = sand?.nor ?? fleece?.nor ?? null;
    this.grassMat.roughnessMap = fleece?.rough ?? sand?.rough ?? null;

    this.denimMat.map = denim?.diff ?? null;
    this.denimMat.normalMap = denim?.nor ?? null;
    this.denimMat.roughnessMap = denim?.rough ?? null;

    this.woodWallMat.map = oakWall?.diff ?? null;
    this.woodWallMat.normalMap = oakWall?.nor ?? null;
    this.woodWallMat.roughnessMap = oakWall?.rough ?? null;

    this.trimWoodMat.map = oakWall?.diff ?? null;
    this.trimWoodMat.normalMap = oakWall?.nor ?? null;

    this.feltHillMat.normalMap = hillFleece?.nor ?? null;
    this.feltHillMat.roughnessMap = hillFleece?.rough ?? null;

    for (const m of [this.grassMat, this.denimMat, this.woodWallMat, this.trimWoodMat, this.feltHillMat]) {
      delete m.userData._origPbr;
      m.needsUpdate = true;
    }
  }

  private zoneWeight(zone: FlatZone, wx: number, wz: number): number {
    const feather = zone.feather ?? 2.4;
    if (zone.shape === 'circle') {
      const r = zone.r ?? 2.0;
      const dist = Math.hypot(wx - zone.x, wz - zone.z);
      if (dist <= r) return 1.0;
      return 1.0 - smoothstep(r, r + feather, dist);
    }
    const hw = zone.hw ?? 2.0;
    const hd = zone.hd ?? 2.0;
    const dx = Math.max(0, Math.abs(wx - zone.x) - hw);
    const dz = Math.max(0, Math.abs(wz - zone.z) - hd);
    const dist = Math.hypot(dx, dz);
    if (dist <= 0) return 1.0;
    return 1.0 - smoothstep(0, feather, dist);
  }

  private evaluateTerracePoint(
    spec: CraftTerraceSpec,
    wx: number,
    wz: number
  ): { y: number; sandWeight: number; aoWeight: number; flatWeight: number; rn: number } {
    const dx = wx - spec.x;
    const dz = wz - spec.z;
    const rn = Math.hypot(dx / spec.radiusX, dz / spec.radiusZ);

    let flatMax = 0;
    let sandMax = spec.defaultSurface === 'sand' ? 1.0 : 0.0;
    if (spec.flatZones) {
      for (const z of spec.flatZones) {
        const w = this.zoneWeight(z, wx, wz);
        if (w > flatMax) flatMax = w;
        if (z.surface === 'sand' && w > sandMax) sandMax = w;
      }
    }

    const edgeTaper = 1.0 - smoothstep(0.72, 0.94, rn);
    const hillAmp = spec.hillAmp ?? 0.65;
    const freq = spec.hillFreq ?? 0.14;
    const ph = spec.phase ?? 0.0;

    // Gentle, natural craft hill relief
    const wave =
      0.55 * Math.sin(wx * freq + ph) * Math.cos(wz * freq * 0.92 - ph * 0.5) +
      0.45 * Math.sin((wx + wz) * freq * 0.72 + ph * 1.4) +
      0.30 * (1.0 - rn * rn);
    const hOffset = Math.max(0, (wave + 0.35) * 0.68) * hillAmp * edgeTaper * (1.0 - flatMax);

    const aoRim = THREE.MathUtils.lerp(1.0, 0.78, smoothstep(0.84, 1.0, rn));
    return {
      y: spec.baseY + hOffset,
      sandWeight: THREE.MathUtils.clamp(sandMax, 0, 1),
      aoWeight: aoRim,
      flatWeight: flatMax,
      rn,
    };
  }

  sampleHeight(x: number, z: number): number | null {
    let best: number | null = null;
    for (const s of this.terraces) {
      const rn = Math.hypot((x - s.x) / s.radiusX, (z - s.z) / s.radiusZ);
      if (rn <= 1.01) {
        const { y } = this.evaluateTerracePoint(s, x, z);
        if (best === null || y > best) {
          best = y;
        }
      }
    }
    return best;
  }

  private buildTerraceTopGeometry(
    spec: CraftTerraceSpec,
    radialSegs: number,
    ringSegs: number,
    withVisualAttributes: boolean
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const colGrassDark = new THREE.Color(0x569c32);
    const colGrassBright = new THREE.Color(0x7bc742);
    const colSand = new THREE.Color(0xdfc698);
    const tmpGrass = new THREE.Color();
    const tmpFinal = new THREE.Color();

    const centerInfo = this.evaluateTerracePoint(spec, spec.x, spec.z);
    positions.push(spec.x, centerInfo.y, spec.z);
    if (withVisualAttributes) {
      uvs.push(spec.x * 0.08, spec.z * 0.08);
      tmpGrass.lerpColors(colGrassDark, colGrassBright, Math.min(1, 0.3 + (centerInfo.y - spec.baseY) * 0.55));
      tmpFinal.lerpColors(tmpGrass, colSand, centerInfo.sandWeight).multiplyScalar(centerInfo.aoWeight);
      colors.push(tmpFinal.r, tmpFinal.g, tmpFinal.b);
    }

    for (let r = 1; r <= ringSegs; r++) {
      const rn = r / ringSegs;
      for (let aIdx = 0; aIdx <= radialSegs; aIdx++) {
        const ang = (aIdx / radialSegs) * Math.PI * 2;
        const wx = spec.x + Math.cos(ang) * spec.radiusX * rn;
        const wz = spec.z + Math.sin(ang) * spec.radiusZ * rn;
        const info = this.evaluateTerracePoint(spec, wx, wz);

        positions.push(wx, info.y, wz);
        if (withVisualAttributes) {
          uvs.push(wx * 0.08, wz * 0.08);
          const heightMix = THREE.MathUtils.clamp((info.y - spec.baseY) * 0.65 + 0.25, 0, 1);
          tmpGrass.lerpColors(colGrassDark, colGrassBright, heightMix);
          tmpFinal.lerpColors(tmpGrass, colSand, info.sandWeight).multiplyScalar(info.aoWeight);
          colors.push(tmpFinal.r, tmpFinal.g, tmpFinal.b);
        }
      }
    }

    const ringStride = radialSegs + 1;
    for (let aIdx = 0; aIdx < radialSegs; aIdx++) {
      indices.push(0, 1 + aIdx + 1, 1 + aIdx);
    }
    for (let r = 1; r < ringSegs; r++) {
      const rowA = 1 + (r - 1) * ringStride;
      const rowB = 1 + r * ringStride;
      for (let aIdx = 0; aIdx < radialSegs; aIdx++) {
        const v00 = rowA + aIdx;
        const v01 = rowA + aIdx + 1;
        const v10 = rowB + aIdx;
        const v11 = rowB + aIdx + 1;
        indices.push(v00, v01, v11);
        indices.push(v00, v11, v10);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (withVisualAttributes) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    geo.setIndex(indices);
    if (withVisualAttributes) {
      geo.computeVertexNormals();
    }
    return geo;
  }

  private buildTerraceWallGeometry(
    spec: CraftTerraceSpec,
    radialSegs: number,
    topWallY: number,
    botWallY: number,
    withVisualAttributes: boolean
  ): THREE.BufferGeometry {
    const wallPos: number[] = [];
    const wallUv: number[] = [];
    const wallIdx: number[] = [];
    const avgPerim = Math.PI * (spec.radiusX + spec.radiusZ);

    for (let aIdx = 0; aIdx <= radialSegs; aIdx++) {
      const ang = (aIdx / radialSegs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const xTop = spec.x + ca * spec.radiusX * 0.995;
      const zTop = spec.z + sa * spec.radiusZ * 0.995;
      const xBot = spec.x + ca * spec.radiusX * 0.80;
      const zBot = spec.z + sa * spec.radiusZ * 0.80;
      const u = (aIdx / radialSegs) * (avgPerim / 6.0);
      wallPos.push(xTop, topWallY, zTop, xBot, botWallY, zBot);
      if (withVisualAttributes) wallUv.push(u, 1, u, 0);
      if (aIdx < radialSegs) {
        const b = aIdx * 2;
        wallIdx.push(b, b + 2, b + 1);
        wallIdx.push(b + 1, b + 2, b + 3);
      }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    if (withVisualAttributes) {
      wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    }
    wallGeo.setIndex(wallIdx);
    if (withVisualAttributes) {
      wallGeo.computeVertexNormals();
    }
    return wallGeo;
  }

  addCraftTerrace(physics: PhysicsWorld, spec: CraftTerraceSpec): void {
    this.terraces.push(spec);

    const radialSegs = this.lowInit ? 48 : 96;
    const ringSegs = this.lowInit ? 10 : 18;
    const topGeo = this.buildTerraceTopGeometry(spec, radialSegs, ringSegs, true);
    const topMesh = new THREE.Mesh(topGeo, this.grassMat);
    topMesh.receiveShadow = true;
    topMesh.castShadow = true;
    this.group.add(topMesh);

    // Lightweight static Trimesh collider across all qualities (< 1cm deviation, much faster raycasts)
    const physTopGeo = this.buildTerraceTopGeometry(spec, 36, 6, false);
    physics.addStaticTrimesh(physTopGeo, new THREE.Vector3(0, 0, 0), undefined, { friction: 0.72 });
    physTopGeo.dispose();

    // Wooden craft skirt wall underneath the terrace edge (slightly inward so denim rim wraps over top!)
    const topWallY = spec.baseY - (spec.denimRim ? 0.36 : 0.08);
    const botWallY = spec.baseY - spec.wallHeight;
    const wallGeo = this.buildTerraceWallGeometry(spec, radialSegs, topWallY, botWallY, true);
    const wallMesh = new THREE.Mesh(wallGeo, this.woodWallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);

    const physWallGeo = this.buildTerraceWallGeometry(spec, 36, topWallY, botWallY, false);
    physics.addStaticTrimesh(physWallGeo, new THREE.Vector3(0, 0, 0), undefined, { friction: 0.65 });
    physWallGeo.dispose();

    // Bottom wooden cap so flying underneath looks crisp
    const bottomCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 0.94, 0.25, 40),
      this.woodWallMat
    );
    bottomCap.position.set(spec.x, botWallY, spec.z);
    bottomCap.scale.set(spec.radiusX * 0.80, 1, spec.radiusZ * 0.80);
    this.group.add(bottomCap);

    // Defer rim/denim/stitch generation until all terraces & bridge cutouts are registered
    this.deferredRims.push({ spec, radialSegs });
  }

  addRimCutout(x: number, z: number, radius: number, minY = -10, maxY = 30): void {
    this.rimCutouts.push({ x, z, radius, minY, maxY });
  }

  private isRimAngleMasked(spec: CraftTerraceSpec, ang: number): boolean {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const outerOffset = 0.36;
    const testPoints: Array<[number, number]> = [
      [spec.x + ca * spec.radiusX, spec.z + sa * spec.radiusZ],
      [spec.x + ca * (spec.radiusX + outerOffset), spec.z + sa * (spec.radiusZ + outerOffset)],
    ];

    for (const [px, pz] of testPoints) {
      // 1. Mask inside any overlapping higher-or-equal terrace (wide margin so outer cuff never leaves a stray tail)
      for (const other of this.terraces) {
        if (other === spec) continue;
        if (other.baseY < spec.baseY - 0.15) continue;
        const rnOther = Math.hypot((px - other.x) / other.radiusX, (pz - other.z) / other.radiusZ);
        if (rnOther < 1.065) return true;
      }

      // 2. Mask at bridge/ramp/stair/slide cutouts
      for (const c of this.rimCutouts) {
        if (spec.baseY < c.minY || spec.baseY > c.maxY) continue;
        if (Math.hypot(px - c.x, pz - c.z) <= c.radius) return true;
      }
    }
    return false;
  }

  private buildProfileArcGeometry(
    spec: CraftTerraceSpec,
    angIndices: number[],
    totalSegs: number,
    closedLoop: boolean,
    prof: Array<[number, number]>,
    uvWrapLen: number,
    isRadialScale = false
  ): THREE.BufferGeometry | null {
    if (angIndices.length < 2) return null;
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    const perim = Math.PI * (spec.radiusX + spec.radiusZ);
    const nProf = prof.length;

    for (let k = 0; k < angIndices.length; k++) {
      const aIdx = angIndices[k];
      const ang = (aIdx / totalSegs) * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const u = (aIdx / totalSegs) * (perim / uvWrapLen);
      for (let p = 0; p < nProf; p++) {
        const [off, dy] = prof[p];
        const rx = isRadialScale ? spec.radiusX * off : spec.radiusX + off;
        const rz = isRadialScale ? spec.radiusZ * off : spec.radiusZ + off;
        pos.push(spec.x + ca * rx, spec.baseY + dy, spec.z + sa * rz);
        uvs.push(u, p / (nProf - 1));
      }
      if (k < angIndices.length - 1) {
        const rowA = k * nProf;
        const rowB = (k + 1) * nProf;
        for (let p = 0; p < nProf - 1; p++) {
          idx.push(rowA + p, rowB + p, rowB + p + 1);
          idx.push(rowA + p, rowB + p + 1, rowA + p + 1);
        }
      }
    }

    // Cap start/end cross-sections if the arc is broken by a bridge or overlapping terrace
    if (!closedLoop && nProf >= 3) {
      const endOff = (angIndices.length - 1) * nProf;
      for (let p = 1; p < nProf - 1; p++) {
        idx.push(0, p + 1, p);
        idx.push(endOff, endOff + p, endOff + p + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  private addMergedArcMesh(
    geos: THREE.BufferGeometry[],
    mat: THREE.Material
  ): void {
    if (geos.length === 0) return;
    let finalGeo: THREE.BufferGeometry | null = null;
    if (geos.length === 1) {
      finalGeo = geos[0];
    } else {
      const identity = new THREE.Matrix4();
      finalGeo = mergeIndexedOrNonIndexed(geos.map((g) => ({ geometry: g, matrix: identity })));
      for (const g of geos) g.dispose();
    }
    if (!finalGeo) return;
    const mesh = new THREE.Mesh(finalGeo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private getContiguousUnmaskedArcs(spec: CraftTerraceSpec, radialSegs: number): { arcs: number[][]; isFull: boolean } {
    const masked: boolean[] = [];
    for (let i = 0; i < radialSegs; i++) {
      const ang = ((i + 0.5) / radialSegs) * Math.PI * 2;
      masked.push(this.isRimAngleMasked(spec, ang));
    }
    if (masked.every((m) => !m)) {
      const full: number[] = [];
      for (let i = 0; i <= radialSegs; i++) full.push(i);
      return { arcs: [full], isFull: true };
    }
    const arcs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < radialSegs; i++) {
      if (!masked[i]) {
        if (cur.length === 0) cur.push(i);
        cur.push(i + 1);
      } else if (cur.length > 0) {
        arcs.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) arcs.push(cur);
    // Merge wrap-around seam if both start and end are unmasked
    if (arcs.length >= 2 && arcs[0][0] === 0 && arcs[arcs.length - 1][arcs[arcs.length - 1].length - 1] === radialSegs) {
      const tail = arcs.pop()!;
      arcs[0] = [...tail.slice(0, -1), ...arcs[0]];
    }
    return { arcs, isFull: false };
  }

  finalizeTerraceRims(): void {
    const denimProf: Array<[number, number]> = [
      [-0.14, 0.02],
      [0.02, 0.08],
      [0.18, 0.09],
      [0.29, 0.03],
      [0.32, -0.14],
      [0.27, -0.34],
      [0.16, -0.47],
      [0.02, -0.50],
      [-0.08, -0.45],
    ];
    const oakUnderTrimProf: Array<[number, number]> = [
      [-0.06, -0.42],
      [0.18, -0.44],
      [0.24, -0.52],
      [0.20, -0.64],
      [0.04, -0.67],
      [-0.06, -0.60],
    ];
    const plainOakProf: Array<[number, number]> = [
      [0.985, 0.04],
      [1.028, 0.03],
      [1.032, -0.14],
      [1.005, -0.30],
      [0.975, -0.32],
    ];

    for (const { spec, radialSegs } of this.deferredRims) {
      const { arcs, isFull } = this.getContiguousUnmaskedArcs(spec, radialSegs);
      if (spec.denimRim !== false) {
        const denimGeos: THREE.BufferGeometry[] = [];
        const oakTrimGeos: THREE.BufferGeometry[] = [];
        for (const arc of arcs) {
          const dg = this.buildProfileArcGeometry(spec, arc, radialSegs, isFull, denimProf, 2.2, false);
          if (dg) denimGeos.push(dg);
          const og = this.buildProfileArcGeometry(spec, arc, radialSegs, isFull, oakUnderTrimProf, 3.2, false);
          if (og) oakTrimGeos.push(og);
        }
        this.addMergedArcMesh(denimGeos, this.denimMat);
        this.addMergedArcMesh(oakTrimGeos, this.trimWoodMat);

        // Fine 2-row thread stitches flush-embedded into denim cuff surface (masked at bridges & overlaps!)
        const perim = Math.PI * (spec.radiusX + spec.radiusZ);
        const stitchCount = Math.max(28, Math.floor(perim / 0.30));
        const curStitches: StitchTransform[] = [];
        for (let i = 0; i < stitchCount; i++) {
          const a = (i / stitchCount) * Math.PI * 2;
          if (this.isRimAngleMasked(spec, a)) continue;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const tx = -spec.radiusX * sa;
          const tz = spec.radiusZ * ca;
          const ry = Math.atan2(tx, tz) + Math.PI / 2;

          // Upper stitch row nestled on top shoulder of denim cuff
          curStitches.push({
            x: spec.x + ca * (spec.radiusX + 0.175),
            y: spec.baseY + 0.088,
            z: spec.z + sa * (spec.radiusZ + 0.175),
            ry,
            tiltX: 0.18,
          });
          // Lower stitch row nestled on lower cuff edge
          curStitches.push({
            x: spec.x + ca * (spec.radiusX + 0.255),
            y: spec.baseY - 0.355,
            z: spec.z + sa * (spec.radiusZ + 0.255),
            ry,
            tiltX: 1.15,
          });
        }
        if (curStitches.length > 0) {
          this.terraceStitches.push(curStitches);
        }
      } else {
        const plainGeos: THREE.BufferGeometry[] = [];
        for (const arc of arcs) {
          const pg = this.buildProfileArcGeometry(spec, arc, radialSegs, isFull, plainOakProf, 3.5, true);
          if (pg) plainGeos.push(pg);
        }
        this.addMergedArcMesh(plainGeos, this.trimWoodMat);
      }
    }
    this.deferredRims = [];
  }

  private buildTerraceStitchMesh(
    list: StitchTransform[],
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    visible: boolean
  ): THREE.InstancedMesh {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.castShadow = false;
    inst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.tiltX, s.ry, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.frustumCulled = true;
    inst.visible = visible;
    this.group.add(inst);
    return inst;
  }

  flushStitches(): number {
    if (this.terraceStitches.length === 0) return 0;
    const highGeo = new THREE.CapsuleGeometry(0.013, 0.11, 4, 8);
    highGeo.rotateZ(Math.PI / 2);
    highGeo.computeBoundingSphere();

    const lowGeo = new THREE.BoxGeometry(0.11, 0.022, 0.022);
    lowGeo.computeBoundingSphere();

    const stitchMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d6,
      roughness: 0.72,
      emissive: 0x5c4c34,
      emissiveIntensity: 0.22,
      envMapIntensity: 0.45,
    });

    let total = 0;
    const isLow = this.quality === 'low';
    for (const list of this.terraceStitches) {
      total += list.length;
      const highInst = this.buildTerraceStitchMesh(list, highGeo, stitchMat, !isLow);
      this.highStitchMeshes.push(highInst);

      // Keep every 2nd stitch pair (upper + lower) for mobile low-quality LOD
      const lowList = list.filter((_, idx) => Math.floor(idx / 2) % 2 === 0);
      if (lowList.length > 0) {
        const lowInst = this.buildTerraceStitchMesh(lowList, lowGeo, stitchMat, isLow);
        this.lowStitchMeshes.push(lowInst);
      }
    }
    this.terraceStitches = [];
    return total;
  }

  setQuality(resolved: ResolvedQuality): void {
    this.quality = resolved;
    const isLow = resolved === 'low';
    for (const m of this.highStitchMeshes) m.visible = !isLow;
    for (const m of this.lowStitchMeshes) m.visible = isLow;
  }

  addFeltHillMound(
    physics: PhysicsWorld,
    x: number,
    baseY: number,
    z: number,
    rx: number,
    ry: number,
    rz: number
  ): void {
    const geo = new THREE.SphereGeometry(1, 28, 18);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const warp = 1 + 0.08 * Math.sin(vx * 3.1 + vz * 2.4);
      pos.setXYZ(i, vx * warp, Math.max(-0.08, vy), vz * warp);
    }
    geo.computeVertexNormals();
    const mound = new THREE.Mesh(geo, this.feltHillMat);
    mound.position.set(x, baseY - 0.15, z);
    mound.scale.set(rx, ry, rz);
    mound.castShadow = true;
    mound.receiveShadow = true;
    this.group.add(mound);

    physics.addStaticCylinder(x, baseY + ry * 0.25, z, ry * 0.35, Math.min(rx, rz) * 0.68);
  }

  updateBossMood(mood01: number): void {
    this.horizonUniforms.uBossMood.value = THREE.MathUtils.clamp(mood01, 0, 1);
  }

  addDistantHorizonHills(): void {
    // Seamless 360-degree sunlit pastel storybook hills (Art Bible 07) that sink out cleanly during Boss Arena dusk
    const angSegs = 112;
    const radSegs = 18;
    const rIn = 44;
    const rOut = 235;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let ir = 0; ir <= radSegs; ir++) {
      const rt = ir / radSegs;
      const r = rIn + (rOut - rIn) * rt;
      // Smooth continuous arch from -22m sea floor under islands up to gentle +2..+13m horizon ridges, sloping into sky mist
      const env = Math.sin(Math.pow(rt, 0.85) * Math.PI);
      for (let ia = 0; ia <= angSegs; ia++) {
        const ang = (ia / angSegs) * Math.PI * 2;
        const wx = Math.cos(ang) * r;
        const wz = Math.sin(ang) * r + 14.0;

        const hillWave =
          0.52 * Math.sin(ang * 4.0 + rt * 2.2) +
          0.32 * Math.cos(ang * 7.0 - 0.8) +
          0.20 * Math.sin(ang * 11.0 + rt * 3.1);
        // Gentle dip in north direction behind Boss Arena while staying continuous (no sharp edge cuts!)
        const northDip = smoothstep(-10, -48, wz) * (1.0 - smoothstep(28, 82, Math.abs(wx)));
        const peak = 21.0 + hillWave * 7.2 - northDip * 9.5;
        const y = -21.5 + env * peak;

        positions.push(wx, y, wz);
        uvs.push(rt, ia / angSegs);
      }
    }

    const stride = angSegs + 1;
    for (let ir = 0; ir < radSegs; ir++) {
      for (let ia = 0; ia < angSegs; ia++) {
        const a = ir * stride + ia;
        const b = a + 1;
        const c = (ir + 1) * stride + ia;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const hillGeo = new THREE.BufferGeometry();
    hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hillGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    hillGeo.setIndex(indices);
    hillGeo.computeVertexNormals();

    const hillMat = new THREE.ShaderMaterial({
      uniforms: {
        uBossMood: this.horizonUniforms.uBossMood,
        uSunDir: this.horizonUniforms.uSunDir,
      },
      transparent: true,
      depthWrite: true,
      vertexShader: `
        uniform float uBossMood;
        varying vec3 vNormalW;
        varying float vRadT;
        varying float vWorldY;
        void main() {
          vec3 p = position;
          // Smoothly sink daytime green hills below horizon during Boss Arena twilight
          p.y -= uBossMood * 38.0;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vRadT = uv.x;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uBossMood;
        uniform vec3 uSunDir;
        varying vec3 vNormalW;
        varying float vRadT;
        varying float vWorldY;
        void main() {
          float ndotl = dot(normalize(vNormalW), normalize(uSunDir)) * 0.5 + 0.5;
          float wrap = smoothstep(0.10, 0.90, ndotl);
          vec3 grassShade = vec3(0.45, 0.76, 0.34);
          vec3 grassSun = vec3(0.66, 0.89, 0.44);
          vec3 grassCol = mix(grassShade, grassSun, wrap);
          vec3 skyHaze = vec3(0.74, 0.90, 0.98);
          float hazeMix = smoothstep(0.38, 0.94, vRadT);
          vec3 col = mix(grassCol, skyHaze, hazeMix);
          float op = clamp(1.0 - uBossMood * 1.35, 0.0, 1.0);
          if (op < 0.02) discard;
          gl_FragColor = vec4(col, op);
        }
      `,
    });
    const hillMesh = new THREE.Mesh(hillGeo, hillMat);
    this.group.add(hillMesh);

    // Bright pastel sky-cloud sea basin under daytime islands (fades cleanly during Boss Arena dusk!)
    const basinGeo = new THREE.CircleGeometry(220, 64);
    basinGeo.rotateX(-Math.PI / 2);
    const basinMat = new THREE.ShaderMaterial({
      uniforms: {
        uBossMood: this.horizonUniforms.uBossMood,
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uBossMood;
        void main() {
          float op = clamp((1.0 - uBossMood * 1.45) * 0.94, 0.0, 1.0);
          if (op < 0.02) discard;
          gl_FragColor = vec4(0.76, 0.90, 0.98, op);
        }
      `,
    });
    const basin = new THREE.Mesh(basinGeo, basinMat);
    basin.position.set(0, -18.5, 14);
    this.group.add(basin);
  }
}

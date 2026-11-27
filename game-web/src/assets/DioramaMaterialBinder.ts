import * as THREE from 'three';
import type { PbrAssets } from './PbrAssets';
import { getProceduralTextures } from './ProceduralTextures';

/**
 * Unifies every custom Blender GLB material matching contract names (`MAT_*`)
 * with Poly Haven 1K PBR normal/roughness/diffuse maps and balanced exposure tones
 * so all toys, architecture, and the clockwork boss arena share zero blow-out lighting.
 */
export class DioramaMaterialBinder {
  private cache = new Map<string, THREE.Material>();

  constructor(private pbr?: PbrAssets) {}

  private buildMaterial(contractName: string): THREE.Material | null {
    const tex = getProceduralTextures();
    const oak = this.pbr?.cloneMaps('oakVeneer', 1, 1);
    const oakPlanks = this.pbr?.cloneMaps('oakWoodPlanks', 1, 1);
    const pine = this.pbr?.cloneMaps('coatedPine', 1, 1);
    const fleece = this.pbr?.cloneMaps('polarFleece', 2, 2);
    const knit = this.pbr?.cloneMaps('knittedFleece', 4, 4);
    const brass = this.pbr?.cloneMaps('metalPlate', 1, 1);

    const oakSubtle = oak
      ? {
          normalMap: oak.nor,
          normalScale: new THREE.Vector2(0.45, 0.45),
          roughnessMap: oak.rough,
        }
      : {};

    switch (contractName) {
      case 'MAT_HoneyOak':
        return new THREE.MeshStandardMaterial({
          color: oak ? 0xd9a76a : 0xc68b46,
          map: oak?.diff ?? null,
          normalMap: oak?.nor ?? null,
          normalScale: new THREE.Vector2(0.55, 0.55),
          roughnessMap: oak?.rough ?? null,
          roughness: 0.54,
          metalness: 0.02,
          envMapIntensity: 0.55,
        });

      case 'MAT_DarkWalnut':
        return new THREE.MeshPhysicalMaterial({
          color: 0xb46230,
          map: oakPlanks?.diff ?? tex.radialWalnutPlanks,
          normalMap: oakPlanks?.nor ?? pine?.nor ?? null,
          normalScale: new THREE.Vector2(0.88, 0.88),
          roughnessMap: oakPlanks?.rough ?? null,
          roughness: 0.26,
          metalness: 0.05,
          clearcoat: 0.35,
          clearcoatRoughness: 0.16,
          envMapIntensity: 1.15,
        });

      case 'MAT_WoodRed':
        return new THREE.MeshStandardMaterial({
          color: 0xd94348,
          ...oakSubtle,
          roughness: 0.50,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodBlue':
        return new THREE.MeshStandardMaterial({
          color: 0x3574cc,
          ...oakSubtle,
          roughness: 0.50,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodYellow':
        return new THREE.MeshStandardMaterial({
          color: 0xe3b22d,
          ...oakSubtle,
          roughness: 0.50,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodMint':
        return new THREE.MeshStandardMaterial({
          color: 0x56bc92,
          ...oakSubtle,
          roughness: 0.50,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodPink':
        return new THREE.MeshStandardMaterial({
          color: 0xe57c9e,
          ...oakSubtle,
          roughness: 0.48,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodGreen':
        return new THREE.MeshStandardMaterial({
          color: 0x4ca64a,
          ...oakSubtle,
          roughness: 0.50,
          envMapIntensity: 0.52,
        });

      case 'MAT_WoodCream':
        return new THREE.MeshStandardMaterial({
          color: 0xeadfca,
          ...oakSubtle,
          roughness: 0.54,
          envMapIntensity: 0.48,
        });

      case 'MAT_BrassGold':
        return new THREE.MeshStandardMaterial({
          color: 0xffd258,
          map: tex.brassGear,
          normalMap: brass?.nor ?? null,
          normalScale: new THREE.Vector2(0.45, 0.45),
          roughnessMap: brass?.rough ?? null,
          metalness: 0.88,
          roughness: 0.19,
          envMapIntensity: 1.35,
          emissive: 0x5c3a06,
          emissiveIntensity: 0.15,
        });

      case 'MAT_ChromeSpring':
        return new THREE.MeshStandardMaterial({
          color: 0xd4dbe4,
          metalness: 0.90,
          roughness: 0.18,
          envMapIntensity: 0.95,
        });

      case 'MAT_RedBumper':
        return new THREE.MeshPhysicalMaterial({
          color: 0xdc2838,
          roughness: 0.26,
          clearcoat: 0.65,
          clearcoatRoughness: 0.14,
          envMapIntensity: 0.62,
        });

      case 'MAT_MatDark':
        return new THREE.MeshStandardMaterial({
          color: 0x252a34,
          roughness: 0.85,
          envMapIntensity: 0.35,
        });

      case 'MAT_CreamStitch':
        return new THREE.MeshStandardMaterial({
          color: 0xf1e4c8,
          roughness: 0.80,
          envMapIntensity: 0.40,
        });

      case 'MAT_KnitRug':
        return new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: tex.knitPatchworkRug,
          normalMap: tex.knitPatchworkNormal,
          normalScale: new THREE.Vector2(1.45, 1.45),
          roughnessMap: knit?.rough ?? fleece?.rough ?? null,
          roughness: 0.90,
          envMapIntensity: 0.42,
        });

      case 'MAT_FeltMoss':
        return new THREE.MeshStandardMaterial({
          color: 0x558c30,
          normalMap: fleece?.nor ?? null,
          normalScale: new THREE.Vector2(0.85, 0.85),
          roughnessMap: fleece?.rough ?? null,
          roughness: 0.92,
          envMapIntensity: 0.40,
        });

      case 'MAT_LanternGlow':
        return new THREE.MeshStandardMaterial({
          color: 0xffe4a0,
          emissive: 0xff9828,
          emissiveIntensity: 2.2,
          roughness: 0.22,
        });

      case 'MAT_ArenaGlass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xfff2d6,
          transparent: true,
          opacity: 0.18,
          roughness: 0.05,
          metalness: 0.08,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          reflectivity: 0.96,
          depthWrite: false,
          envMapIntensity: 1.30,
        });

      case 'MAT_DaisyWhite':
        return new THREE.MeshStandardMaterial({
          color: 0xf6f3ea,
          roughness: 0.56,
          envMapIntensity: 0.48,
        });

      case 'MAT_DaisyCenter':
        return new THREE.MeshStandardMaterial({
          color: 0xf0a618,
          roughness: 0.48,
          envMapIntensity: 0.48,
        });

      case 'MAT_DaisyStem':
        return new THREE.MeshStandardMaterial({
          color: 0x479634,
          roughness: 0.68,
          envMapIntensity: 0.42,
        });

      case 'MAT_PinWhite':
        return new THREE.MeshPhysicalMaterial({
          color: 0xf5efe2,
          roughness: 0.24,
          clearcoat: 0.60,
          envMapIntensity: 0.58,
        });

      case 'MAT_PinRed':
        return new THREE.MeshPhysicalMaterial({
          color: 0xdc2430,
          roughness: 0.26,
          clearcoat: 0.55,
          envMapIntensity: 0.58,
        });

      default:
        return null;
    }
  }

  getMaterial(contractName: string): THREE.Material | null {
    if (this.cache.has(contractName)) {
      return this.cache.get(contractName)!;
    }
    const built = this.buildMaterial(contractName);
    if (built) {
      this.cache.set(contractName, built);
    }
    return built;
  }

  bindRoot(root: THREE.Object3D): void {
    const cacheVals = new Set(this.cache.values());
    const replacedOld = new Set<THREE.Material>();

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => {
          const bound = this.getMaterial(m.name);
          if (bound && bound !== m) {
            replacedOld.add(m);
            return bound;
          }
          return m;
        });
      } else if (obj.material) {
        const m = obj.material;
        const bound = this.getMaterial(m.name);
        if (bound && bound !== m) {
          replacedOld.add(m);
          obj.material = bound;
        }
      }
    });

    // Dispose orphaned original GLB materials & dummy embedded maps
    if (replacedOld.size > 0) {
      const stillReferenced = new Set<THREE.Material>();
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m) stillReferenced.add(m);
        }
      });

      for (const oldMat of replacedOld) {
        if (stillReferenced.has(oldMat) || cacheVals.has(oldMat)) continue;
        const std = oldMat as THREE.MeshStandardMaterial;
        for (const tex of [
          std.map,
          std.normalMap,
          std.roughnessMap,
          std.metalnessMap,
          std.emissiveMap,
          std.aoMap,
          std.alphaMap,
        ]) {
          tex?.dispose();
        }
        oldMat.dispose();
      }
    }
  }

  refreshPbrMaps(): void {
    for (const [contractName, mat] of this.cache.entries()) {
      const fresh = this.buildMaterial(contractName);
      if (!fresh) continue;
      if (
        mat instanceof THREE.MeshStandardMaterial &&
        fresh instanceof THREE.MeshStandardMaterial
      ) {
        mat.color.copy(fresh.color);
        mat.map = fresh.map;
        mat.normalMap = fresh.normalMap;
        if (fresh.normalScale) mat.normalScale.copy(fresh.normalScale);
        mat.roughnessMap = fresh.roughnessMap;
        mat.needsUpdate = true;
      }
      fresh.dispose();
    }
  }
}

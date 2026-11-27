import * as THREE from 'three';
import { resolveAssetUrl, runWithConcurrency } from './AssetLoaderUtils';

export type PbrSetName =
  | 'oakWoodPlanks'
  | 'coatedPine'
  | 'polarFleece'
  | 'metalPlate'
  | 'clayPlaster'
  | 'denimFabric'
  | 'knittedFleece'
  | 'oakVeneer'
  | 'darkWoodenPlanks'
  | 'playgroundSand';

export interface PbrMaterialMaps {
  diff: THREE.Texture;
  nor: THREE.Texture;
  rough: THREE.Texture;
}

const PBR_PATHS: Record<PbrSetName, string> = {
  oakWoodPlanks: '/textures/pbr/oak_wood_planks',
  coatedPine: '/textures/pbr/coated_pine',
  polarFleece: '/textures/pbr/polar_fleece',
  metalPlate: '/textures/pbr/metal_plate_02',
  clayPlaster: '/textures/pbr/clay_plaster',
  denimFabric: '/textures/pbr/denim_fabric_03',
  knittedFleece: '/textures/pbr/knitted_fleece',
  oakVeneer: '/textures/pbr/oak_veneer_01',
  darkWoodenPlanks: '/textures/pbr/dark_wooden_planks',
  playgroundSand: '/textures/pbr/playground_sand',
};

export class PbrAssets {
  private sets = new Map<PbrSetName, PbrMaterialMaps>();
  public loadedCount = 0;
  private loadingPromise: Promise<void> | null = null;
  private anisotropy = 8;

  async load(skipLoad = false): Promise<void> {
    if (skipLoad) return;
    return this.ensureLoaded();
  }

  async ensureLoaded(): Promise<void> {
    if (this.isLoaded()) return;
    if (this.loadingPromise) return this.loadingPromise;

    const loader = new THREE.TextureLoader();
    const loadTex = (url: string, srgb: boolean): Promise<THREE.Texture | null> =>
      new Promise((resolve) => {
        const resolvedUrl = resolveAssetUrl(url);
        let settled = false;
        const finish = (tex: THREE.Texture | null): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timerId);
          resolve(tex);
        };
        const timerId = setTimeout(() => {
          console.warn(`[PbrAssets] Texture load timed out: ${resolvedUrl}`);
          finish(null);
        }, 15000);

        loader.load(
          resolvedUrl,
          (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            tex.anisotropy = this.anisotropy;
            tex.needsUpdate = true;
            this.loadedCount++;
            finish(tex);
          },
          undefined,
          () => finish(null)
        );
      });

    this.loadingPromise = runWithConcurrency(
      Object.keys(PBR_PATHS) as PbrSetName[],
      3,
      async (name) => {
        if (this.sets.has(name)) return;
        const base = PBR_PATHS[name];
        const [diff, nor, rough] = await Promise.all([
          loadTex(`${base}/diff.jpg`, true),
          loadTex(`${base}/nor_gl.jpg`, false),
          loadTex(`${base}/rough.jpg`, false),
        ]);
        if (diff && nor && rough) {
          this.sets.set(name, { diff, nor, rough });
        }
      }
    )
      .then(() => undefined)
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  setAnisotropy(val: number): void {
    this.anisotropy = val;
    for (const set of this.sets.values()) {
      for (const tex of [set.diff, set.nor, set.rough]) {
        if (tex.anisotropy !== val) {
          tex.anisotropy = val;
          tex.needsUpdate = true;
        }
      }
    }
  }

  isLoaded(): boolean {
    return this.sets.size === Object.keys(PBR_PATHS).length;
  }

  getSet(name: PbrSetName): PbrMaterialMaps | undefined {
    return this.sets.get(name);
  }

  cloneMaps(name: PbrSetName, repeatX = 1, repeatY = 1): PbrMaterialMaps | undefined {
    const src = this.sets.get(name);
    if (!src) return undefined;

    const cloneTex = (orig: THREE.Texture, srgb: boolean): THREE.Texture => {
      const t = orig.clone();
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeatX, repeatY);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.anisotropy;
      t.needsUpdate = true;
      return t;
    };

    return {
      diff: cloneTex(src.diff, true),
      nor: cloneTex(src.nor, false),
      rough: cloneTex(src.rough, false),
    };
  }
}

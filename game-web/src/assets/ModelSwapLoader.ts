import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { optimizeStaticHierarchy } from './GeometryMerge';
import { fetchWithTimeout, resolveAssetUrl, withTimeout } from './AssetLoaderUtils';

export interface ModelsManifest {
  hero: string;
  heroExpressions: string;
  boss: string;
  enemySlime: string | null;
  enemyTank: string | null;
  enemyBalloon: string | null;
}

const DEFAULT_MANIFEST: ModelsManifest = {
  hero: '/models/manmarubuu_animated.glb',
  heroExpressions: '/models/expressions_presets.json',
  boss: '/models/clockwork_toy_king.glb',
  enemySlime: null,
  enemyTank: null,
  enemyBalloon: null,
};

/**
 * Normalizes a loaded GLB root so its bounding box bottom rests at y = 0
 * and optionally scales its height to match `targetHeight` when outside [minH, maxH].
 */
export function normalizeModelBounds(
  root: THREE.Object3D,
  targetHeight: number,
  toleranceRatio = 0.2
): THREE.Object3D {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return root;

  const size = new THREE.Vector3();
  box.getSize(size);
  const h = size.y;
  if (h > 0.001) {
    const minH = targetHeight * (1 - toleranceRatio);
    const maxH = targetHeight * (1 + toleranceRatio);
    if (h < minH || h > maxH) {
      const s = targetHeight / h;
      root.scale.multiplyScalar(s);
      root.updateMatrixWorld(true);
      box.setFromObject(root);
    }
  }
  if (Math.abs(box.min.y) > 0.01) {
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
  }
  return root;
}

/** Finds the first Object3D matching any candidate name (case-sensitive, then case-insensitive). */
export function findNodeByAliases(root: THREE.Object3D, aliases: string[]): THREE.Object3D | undefined {
  for (const alias of aliases) {
    const exact = root.getObjectByName(alias);
    if (exact) return exact;
  }
  const lowerSet = new Set(aliases.map((a) => a.toLowerCase()));
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && lowerSet.has(obj.name.toLowerCase())) {
      found = obj;
    }
  });
  return found;
}

export class ModelSwapLoader {
  public manifest: ModelsManifest = { ...DEFAULT_MANIFEST };
  private loader = new GLTFLoader();
  private templates = new Map<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }>();
  private useMobileLods = false;

  public resolveModelUrl(url: string): string {
    let target = url;
    if (this.useMobileLods) {
      if (target.startsWith('/models/') && !target.startsWith('/models/mobile/')) {
        target = target.replace('/models/', '/models/mobile/');
      } else if (target.startsWith('./models/') && !target.startsWith('./models/mobile/')) {
        target = target.replace('./models/', './models/mobile/');
      }
    }
    return resolveAssetUrl(target);
  }

  async init(useMobileLods = false): Promise<void> {
    this.useMobileLods = useMobileLods;
    try {
      const res = await fetchWithTimeout('/models/models_manifest.json', 10000);
      if (res.ok) {
        const json = (await res.json()) as Partial<ModelsManifest>;
        this.manifest = { ...DEFAULT_MANIFEST, ...json };
      }
    } catch {
      // Keep defaults
    }

    // Only preload optional external enemy GLBs when explicitly configured (avoid 404s when null)
    const preloadList: Array<[string, string | null, number]> = [
      ['enemySlime', this.manifest.enemySlime, 1.15],
      ['enemyTank', this.manifest.enemyTank, 1.4],
      ['enemyBalloon', this.manifest.enemyBalloon, 1.6],
    ];

    await Promise.all(
      preloadList.map(async ([key, url, targetH]) => {
        if (!url) return;
        const primaryUrl = this.resolveModelUrl(url);
        const fallbackUrl = resolveAssetUrl(url);
        try {
          let gltf;
          try {
            gltf = await withTimeout(this.loader.loadAsync(primaryUrl), 20000, `model ${key}`);
          } catch (primaryErr) {
            if (primaryUrl === fallbackUrl) throw primaryErr;
            gltf = await withTimeout(
              this.loader.loadAsync(fallbackUrl),
              20000,
              `model fallback ${key}`
            );
          }
          normalizeModelBounds(gltf.scene, targetH, 0.25);
          gltf.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          if (key === 'enemyTank') {
            optimizeStaticHierarchy(
              gltf.scene,
              new Set(['WindupKey', 'BackWindupKey']),
              ['Wheel_']
            );
          } else if (key === 'enemyBalloon') {
            optimizeStaticHierarchy(gltf.scene, new Set(['Propeller', 'Rotor']));
          }
          this.templates.set(key, { scene: gltf.scene, animations: gltf.animations });
        } catch (err) {
          console.warn(`[ModelSwapLoader] Failed to preload ${key} (${url}), using built-in visual.`, err);
        }
      })
    );
  }

  createEnemyVisual(key: 'enemySlime' | 'enemyTank' | 'enemyBalloon'): {
    root: THREE.Object3D;
    animations: THREE.AnimationClip[];
  } | null {
    const tpl = this.templates.get(key);
    if (!tpl) return null;
    const cloned = cloneSkeleton(tpl.scene);
    return { root: cloned, animations: tpl.animations };
  }
}

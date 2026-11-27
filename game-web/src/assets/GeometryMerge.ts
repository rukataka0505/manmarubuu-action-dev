import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface MergeableItem {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

function toFloat32Attribute(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  targetItemSize?: number,
  fillDefault = 0
): THREE.Float32BufferAttribute {
  const count = attr.count;
  const srcSize = attr.itemSize;
  const dstSize = targetItemSize ?? srcSize;
  const out = new Float32Array(count * dstSize);

  for (let i = 0; i < count; i++) {
    const base = i * dstSize;
    if (dstSize >= 1) out[base] = srcSize >= 1 ? attr.getX(i) : fillDefault;
    if (dstSize >= 2) out[base + 1] = srcSize >= 2 ? attr.getY(i) : fillDefault;
    if (dstSize >= 3) out[base + 2] = srcSize >= 3 ? attr.getZ(i) : fillDefault;
    if (dstSize >= 4) out[base + 3] = srcSize >= 4 ? attr.getW(i) : fillDefault;
  }
  return new THREE.Float32BufferAttribute(out, dstSize);
}

function flipTriangleWinding(geo: THREE.BufferGeometry): void {
  if (geo.index) {
    const idx = geo.index;
    const count = idx.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const b = idx.getX(i + 1);
      const c = idx.getX(i + 2);
      idx.setX(i + 1, c);
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
    return;
  }

  const posAttr = geo.getAttribute('position');
  if (!posAttr) return;
  const count = posAttr.count;
  for (const attr of Object.values(geo.attributes)) {
    if (!(attr instanceof THREE.BufferAttribute)) continue;
    const s = attr.itemSize;
    const arr = attr.array as Float32Array;
    for (let i = 0; i + 2 < count; i += 3) {
      const bOff = (i + 1) * s;
      const cOff = (i + 2) * s;
      for (let k = 0; k < s; k++) {
        const tmp = arr[bOff + k];
        arr[bOff + k] = arr[cOff + k];
        arr[cOff + k] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
}

export function mergeIndexedOrNonIndexed(items: MergeableItem[]): THREE.BufferGeometry | null {
  if (items.length === 0) return null;

  let anyUv = false;
  let uvSize = 2;
  let anyColor = false;
  let colorSize = 3;
  let allIndexed = true;

  for (const item of items) {
    const g = item.geometry;
    if (!g.getAttribute('position')) return null;
    if (!g.index) allIndexed = false;
    const uv = g.getAttribute('uv');
    if (uv) {
      anyUv = true;
      uvSize = Math.max(uvSize, uv.itemSize);
    }
    const col = g.getAttribute('color');
    if (col) {
      anyColor = true;
      colorSize = Math.max(colorSize, col.itemSize);
    }
  }

  const prepared: THREE.BufferGeometry[] = [];
  for (const item of items) {
    const g = item.geometry.clone();
    g.morphAttributes = {};
    g.clearGroups();

    // Deinterleave & normalize standard attributes into clean Float32BufferAttributes
    const pos = g.getAttribute('position');
    if (pos) {
      g.setAttribute('position', toFloat32Attribute(pos, 3, 0));
    }

    const norm = g.getAttribute('normal');
    if (norm) {
      g.setAttribute('normal', toFloat32Attribute(norm, 3, 0));
    } else {
      g.computeVertexNormals();
    }

    const vCount = g.getAttribute('position').count;

    if (anyUv) {
      const uv = g.getAttribute('uv');
      if (uv) {
        g.setAttribute('uv', toFloat32Attribute(uv, uvSize, 0));
      } else {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vCount * uvSize), uvSize));
      }
    }

    if (anyColor) {
      const col = g.getAttribute('color');
      if (col) {
        g.setAttribute('color', toFloat32Attribute(col, colorSize, 1));
      } else {
        const arr = new Float32Array(vCount * colorSize);
        arr.fill(1);
        g.setAttribute('color', new THREE.Float32BufferAttribute(arr, colorSize));
      }
    }

    // Remove inconsistent extra attributes so mergeGeometries never fails on mismatched custom attributes
    const keepSet = new Set<string>(['position', 'normal']);
    if (anyUv) keepSet.add('uv');
    if (anyColor) keepSet.add('color');
    for (const key of Object.keys(g.attributes)) {
      if (!keepSet.has(key)) {
        g.deleteAttribute(key);
      }
    }

    g.applyMatrix4(item.matrix);
    if (item.matrix.determinant() < 0) {
      flipTriangleWinding(g);
    }

    if (!allIndexed && g.index) {
      const nonIdx = g.toNonIndexed();
      g.dispose();
      prepared.push(nonIdx);
    } else {
      prepared.push(g);
    }
  }

  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  if (!merged) return null;

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function optimizeStaticHierarchy(
  root: THREE.Object3D,
  keepNames: Set<string>,
  keepPrefixes: string[] = []
): void {
  const isProtected = (obj: THREE.Object3D): boolean => {
    if (!obj.name) return false;
    if (keepNames.has(obj.name)) return true;
    for (const prefix of keepPrefixes) {
      if (obj.name.startsWith(prefix)) return true;
    }
    return false;
  };

  root.updateMatrixWorld(true);

  interface MeshEntry {
    mesh: THREE.Mesh;
    material: THREE.Material;
    regionRoot: THREE.Object3D;
  }

  // Group static single-material meshes by (regionRoot, material)
  const regionMap = new Map<THREE.Object3D, Map<THREE.Material, MeshEntry[]>>();

  const findRegionRoot = (obj: THREE.Object3D): THREE.Object3D => {
    let cur: THREE.Object3D | null = obj.parent;
    while (cur && cur !== root) {
      if (isProtected(cur)) return cur;
      cur = cur.parent;
    }
    return root;
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(obj.material) || !obj.material) return;
    // Never merge a protected node that is itself an animated Mesh
    if (obj !== root && isProtected(obj)) return;

    const regionRoot = findRegionRoot(obj);
    let matMap = regionMap.get(regionRoot);
    if (!matMap) {
      matMap = new Map();
      regionMap.set(regionRoot, matMap);
    }
    let list = matMap.get(obj.material);
    if (!list) {
      list = [];
      matMap.set(obj.material, list);
    }
    list.push({ mesh: obj, material: obj.material, regionRoot });
  });

  const regionInv = new THREE.Matrix4();
  for (const [regionRoot, matMap] of regionMap.entries()) {
    regionInv.copy(regionRoot.matrixWorld).invert();

    for (const [material, entries] of matMap.entries()) {
      if (entries.length < 2) continue;

      const items: MergeableItem[] = [];
      let castShadow = false;
      let receiveShadow = false;
      for (const e of entries) {
        if (e.mesh.castShadow) castShadow = true;
        if (e.mesh.receiveShadow) receiveShadow = true;
        const localMat = new THREE.Matrix4().multiplyMatrices(regionInv, e.mesh.matrixWorld);
        items.push({ geometry: e.mesh.geometry, matrix: localMat });
      }

      const mergedGeo = mergeIndexedOrNonIndexed(items);
      if (!mergedGeo) continue;

      const mergedMesh = new THREE.Mesh(mergedGeo, material);
      mergedMesh.name = `Merged_${material.name || 'Part'}`;
      mergedMesh.castShadow = castShadow;
      mergedMesh.receiveShadow = receiveShadow;
      regionRoot.add(mergedMesh);

      for (const e of entries) {
        e.mesh.parent?.remove(e.mesh);
      }
    }
  }

  // Prune empty non-protected Group nodes bottom-up
  const pruneEmptyGroups = (node: THREE.Object3D): void => {
    for (const child of [...node.children]) {
      pruneEmptyGroups(child);
      if (
        child !== root &&
        !(child instanceof THREE.Mesh) &&
        child.children.length === 0 &&
        !isProtected(child)
      ) {
        node.remove(child);
      }
    }
  };
  pruneEmptyGroups(root);
}

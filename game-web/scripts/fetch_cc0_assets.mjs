import fs from 'node:fs/promises';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC_DIR = path.join(GAME_ROOT, 'public');

const HDRI_SPEC = {
  url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  dest: 'hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
};

const PBR_SETS = [
  {
    name: 'oak_wood_planks',
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_rough_1k.jpg',
  },
  {
    name: 'coated_pine',
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coated_pine/coated_pine_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coated_pine/coated_pine_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coated_pine/coated_pine_rough_1k.jpg',
  },
  {
    name: 'polar_fleece',
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/polar_fleece/polar_fleece_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/polar_fleece/polar_fleece_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/polar_fleece/polar_fleece_rough_1k.jpg',
  },
  {
    name: 'metal_plate_02',
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/metal_plate_02/metal_plate_02_rough_1k.jpg',
  },
  {
    name: 'clay_plaster',
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_plaster/clay_plaster_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_plaster/clay_plaster_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clay_plaster/clay_plaster_rough_1k.jpg',
  },
];

const KENNEY_KITS = {
  platformer: {
    hasColormap: true,
    glbs: [
      'tree.glb',
      'tree-pine.glb',
      'tree-pine-small.glb',
      'flowers.glb',
      'flowers-tall.glb',
      'grass.glb',
      'mushrooms.glb',
      'hedge.glb',
      'fence-low-straight.glb',
      'fence-straight.glb',
      'fence-rope.glb',
      'flag.glb',
      'sign.glb',
      'arrow.glb',
      'crate.glb',
      'crate-item.glb',
      'barrel.glb',
    ],
  },
  castle: {
    hasColormap: true,
    glbs: [
      'flag-pennant.glb',
      'flag-banner-long.glb',
      'flag-wide.glb',
      'wall-pillar.glb',
      'tower-square-top-roof-high.glb',
    ],
  },
  holiday: {
    hasColormap: true,
    glbs: [
      'present-a-cube.glb',
      'present-a-rectangle.glb',
      'present-b-cube.glb',
      'present-b-round.glb',
      'lights-colored.glb',
      'train-locomotive.glb',
      'train-wagon.glb',
      'bench.glb',
      'nutcracker.glb',
    ],
  },
  'fantasy-town': {
    hasColormap: true,
    glbs: [
      'banner-red.glb',
      'banner-green.glb',
      'lantern.glb',
      'stall-red.glb',
      'stall-green.glb',
      'cart.glb',
      'windmill.glb',
      'fountain-round-detail.glb',
    ],
  },
  'toy-car': {
    hasColormap: true,
    glbs: ['gate-finish.glb', 'vehicle-racer.glb', 'vehicle-truck.glb', 'item-cone.glb'],
  },
  nature: {
    hasColormap: false,
    glbs: [
      'flower_yellowA.glb',
      'flower_redA.glb',
      'flower_purpleA.glb',
      'mushroom_redGroup.glb',
      'log_stack.glb',
      'stump_round.glb',
    ],
  },
};

async function downloadFile(url, relDest, verifyGlb = false) {
  const fullDest = path.join(PUBLIC_DIR, relDest);
  await fs.mkdir(path.dirname(fullDest), { recursive: true });

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'manmarubuu-asset-fetcher/1.0' } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        throw new Error(`Empty response (0 bytes) for ${url}`);
      }
      if (verifyGlb) {
        const magic = buf.subarray(0, 4).toString('ascii');
        if (magic !== 'glTF') {
          throw new Error(`Invalid GLB header "${magic}" for ${url}`);
        }
      }
      await fs.writeFile(fullDest, buf);
      return { relDest, bytes: buf.length, url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function runPool(tasks, concurrency = 8) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const myIdx = idx++;
      results[myIdx] = await tasks[myIdx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

async function main() {
  const tasks = [];

  // 1. HDRI
  tasks.push(() => downloadFile(HDRI_SPEC.url, HDRI_SPEC.dest, false));

  // 2. Poly Haven PBR Textures
  for (const s of PBR_SETS) {
    tasks.push(() => downloadFile(s.diff, `textures/pbr/${s.name}/diff.jpg`, false));
    tasks.push(() => downloadFile(s.nor, `textures/pbr/${s.name}/nor_gl.jpg`, false));
    tasks.push(() => downloadFile(s.rough, `textures/pbr/${s.name}/rough.jpg`, false));
  }

  // 3. Kenney 3D GLBs (+ per-kit Textures/colormap.png)
  const kenneyBase = 'https://raw.githubusercontent.com/shorepine/kenney/main/3d';
  const glbList = [];
  for (const [kit, spec] of Object.entries(KENNEY_KITS)) {
    if (spec.hasColormap) {
      tasks.push(() =>
        downloadFile(
          `${kenneyBase}/${kit}/Textures/colormap.png`,
          `models/props/${kit}/Textures/colormap.png`,
          false
        )
      );
    }
    for (const file of spec.glbs) {
      glbList.push(`${kit}/${file}`);
      tasks.push(() =>
        downloadFile(
          `${kenneyBase}/${kit}/${file}`,
          `models/props/${kit}/${file}`,
          true
        )
      );
    }
  }

  console.log(`Downloading ${tasks.length} CC0 files (1 HDRI, 15 PBR maps, ${glbList.length} GLBs + colormaps)...`);
  const results = await runPool(tasks, 8);
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  console.log(`All ${results.length} files downloaded & verified OK! Total: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  // Generate SOURCES.md documents
  const propsSources = [
    '# CC0 3D Props & HDRI Sources',
    '',
    'All 3D prop assets in this directory are **CC0 1.0 Public Domain** by **Kenney** (`kenney.nl`), retrieved via the `shorepine/kenney` repository.',
    '',
    '## Included Kits & Models',
    ...Object.entries(KENNEY_KITS).map(
      ([kit, spec]) =>
        `- **${kit}** (${spec.glbs.length} GLBs${spec.hasColormap ? ' + `Textures/colormap.png`' : ''}): ${spec.glbs.join(', ')}`
    ),
    '',
    '## Environment HDRI (CC0 1.0)',
    `- \`/${HDRI_SPEC.dest}\` — Poly Haven (\`kloofendal_48d_partly_cloudy_puresky_1k\`, CC0 1.0): ${HDRI_SPEC.url}`,
    '',
  ].join('\n');
  await fs.writeFile(path.join(PUBLIC_DIR, 'models/props/SOURCES.md'), propsSources, 'utf8');

  const pbrSources = [
    '# Poly Haven CC0 1K PBR Texture Sources',
    '',
    'All textures in this directory are **CC0 1.0 Public Domain** from **Poly Haven** (`https://polyhaven.com`).',
    '',
    '## Texture Sets (1K JPG: `diff.jpg`, `nor_gl.jpg`, `rough.jpg`)',
    ...PBR_SETS.map(
      (s) => `- **${s.name}**: \`diff\` (${s.diff}), \`nor_gl\` (${s.nor}), \`rough\` (${s.rough})`
    ),
    '',
  ].join('\n');
  await fs.writeFile(path.join(PUBLIC_DIR, 'textures/pbr/SOURCES.md'), pbrSources, 'utf8');
  console.log('Generated SOURCES.md files.');
}

main().catch((err) => {
  console.error('FETCH FAILED:', err);
  process.exit(1);
});

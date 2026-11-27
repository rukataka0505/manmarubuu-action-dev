import fs from 'node:fs';
import path from 'node:path';

const GAME_ROOT = path.resolve(import.meta.dirname, '..');
const TEX_ROOT = path.join(GAME_ROOT, 'public', 'textures', 'pbr');
const HDRI_ROOT = path.join(GAME_ROOT, 'public', 'hdri');

const TEXTURE_SETS = [
  { id: 'denim_fabric_03', label: 'denim_fabric_03' },
  { id: 'knitted_fleece', label: 'knitted_fleece' },
  { id: 'oak_veneer_01', label: 'oak_veneer_01' },
  { id: 'dark_wooden_planks', label: 'dark_wooden_planks' },
  { id: 'playground_sand', label: 'playground_sand' },
];

const HDRI_SETS = [
  { id: 'belfast_sunset_puresky', outFile: 'belfast_sunset_puresky_1k.hdr' },
];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'manmarubuu-game/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'manmarubuu-game/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const docLines = [];

  for (const item of TEXTURE_SETS) {
    const files = await fetchJson(`https://api.polyhaven.com/files/${item.id}`);
    const outDir = path.join(TEX_ROOT, item.label);
    const urls = {};
    for (const [apiKey, localName] of [
      ['Diffuse', 'diff.jpg'],
      ['nor_gl', 'nor_gl.jpg'],
      ['Rough', 'rough.jpg'],
    ]) {
      const entry = files?.[apiKey]?.['1k']?.jpg;
      if (!entry?.url) {
        throw new Error(`Missing 1K jpg for ${item.id}.${apiKey}`);
      }
      const bytes = await downloadFile(entry.url, path.join(outDir, localName));
      urls[apiKey] = entry.url;
      console.log(`Downloaded ${item.label}/${localName} (${(bytes / 1024).toFixed(1)} KB)`);
    }
    docLines.push(
      `- **${item.label}**: \`diff\` (${urls.Diffuse}), \`nor_gl\` (${urls.nor_gl}), \`rough\` (${urls.Rough})`
    );
  }

  for (const h of HDRI_SETS) {
    const files = await fetchJson(`https://api.polyhaven.com/files/${h.id}`);
    const entry = files?.hdri?.['1k']?.hdr;
    if (!entry?.url) {
      throw new Error(`Missing 1K hdr for ${h.id}`);
    }
    const bytes = await downloadFile(entry.url, path.join(HDRI_ROOT, h.outFile));
    console.log(`Downloaded ${h.outFile} (${(bytes / 1024).toFixed(1)} KB)`);
    docLines.push(`- **HDRI ${h.id}**: \`1k hdr\` (${entry.url})`);
  }

  const sourcesPath = path.join(TEX_ROOT, 'SOURCES.md');
  let existing = fs.readFileSync(sourcesPath, 'utf8');
  for (const line of docLines) {
    const marker = line.split(':')[0];
    if (!existing.includes(marker)) {
      existing = existing.trimEnd() + '\n' + line + '\n';
    }
  }
  fs.writeFileSync(sourcesPath, existing, 'utf8');
  console.log('Updated SOURCES.md successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

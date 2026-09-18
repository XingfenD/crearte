#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const gamesDir = path.join(root, 'fixtures', 'games')
const catalogDir = path.join(root, 'fixtures', 'catalog')
const outDir = path.join(root, 'fixtures', 'generated')
const FIXED_MTIME = new Date(2000, 0, 1)

async function collect(dir, prefix = '') {
  const files = {}
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(files, await collect(full, rel))
    else files[rel] = new Uint8Array(await readFile(full))
  }
  return files
}

const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg'])

function render(files, version) {
  const out = {}
  for (const [name, bytes] of Object.entries(files)) {
    if (TEXT_EXT.has(path.extname(name)) && !name.endsWith('.wav')) {
      out[name] = new TextEncoder().encode(new TextDecoder().decode(bytes).replaceAll('__FIXTURE_VERSION__', version))
    } else {
      out[name] = bytes
    }
  }
  return out
}

function pack(files) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level: 6, mtime: FIXED_MTIME }]])))
}

await rm(outDir, { recursive: true, force: true })
await mkdir(path.join(outDir, 'bundles'), { recursive: true })
await mkdir(path.join(outDir, 'games'), { recursive: true })
await mkdir(path.join(outDir, 'games-alt'), { recursive: true })

for (const file of (await readdir(catalogDir)).filter((f) => f.endsWith('.json')).sort()) {
  const catalog = JSON.parse(await readFile(path.join(catalogDir, file), 'utf8'))
  const { _corruptSha, ...game } = catalog
  const files = await collect(path.join(gamesDir, game.id))
  const seed = createHash('sha256').update(pack(render(files, ''))).digest('hex')
  const version = seed.slice(0, 16)
  const version2 = seed.slice(2, 18)
  const zipV1 = pack(render(files, version))
  const zipV2 = pack(render(files, version2))
  const shaV1 = createHash('sha256').update(zipV1).digest('hex')
  const shaV2 = createHash('sha256').update(zipV2).digest('hex')
  const declaredSha = _corruptSha ? shaV1.replace(/^./, (c) => (c === '0' ? '1' : '0')) : shaV1
  await writeFile(path.join(outDir, 'bundles', `${game.id}.zip`), zipV1)
  await writeFile(path.join(outDir, 'bundles', `${game.id}-v2.zip`), zipV2)
  await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify({
    ...game,
    runtime: 'virtual',
    version,
    entry: game.entry ?? 'index.html',
    bundle: { url: `/data/bundles/${game.id}.zip`, bytes: zipV1.length, sha256: declaredSha }
  }, null, 2) + '\n')
  await writeFile(path.join(outDir, 'games-alt', `${game.id}.json`), JSON.stringify({
    version: version2,
    bundle: { url: `/data/bundles/${game.id}-v2.zip`, bytes: zipV2.length, sha256: shaV2 }
  }, null, 2) + '\n')
  console.log(`[fixtures] ${game.id}: ${Object.keys(files).length} files, v1=${version} v2=${version2} (${zipV1.length} bytes)`)
}

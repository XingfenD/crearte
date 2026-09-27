#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
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

function deriveKid(gameId, version) {
  return createHash('sha256').update(`${gameId}\0${version}`).digest().subarray(0, 16).toString('base64url')
}

// CRB1 v1：42B 头 + AES-256-GCM(明文, CEK, IV, AAD=头)，tag 附密文尾（与 Go Seal / WebCrypto 兼容）
function crb1Encrypt(plaintext, kid) {
  const cek = randomBytes(32)
  const iv = randomBytes(12)
  const header = Buffer.alloc(42)
  header.write('CRB1', 0, 'ascii')
  header.writeUInt16BE(42, 4)
  header[6] = 0x01
  header[7] = 22
  header.write(kid, 8, 'ascii')
  iv.copy(header, 30)
  const cipher = createCipheriv('aes-256-gcm', cek, iv)
  cipher.setAAD(header)
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { file: Buffer.concat([header, sealed]), cek }
}

await rm(outDir, { recursive: true, force: true })
await mkdir(path.join(outDir, 'bundles'), { recursive: true })
await mkdir(path.join(outDir, 'games'), { recursive: true })
await mkdir(path.join(outDir, 'games-alt'), { recursive: true })
await mkdir(path.join(outDir, 'keys'), { recursive: true })

for (const file of (await readdir(catalogDir)).filter((f) => f.endsWith('.json')).sort()) {
  const catalog = JSON.parse(await readFile(path.join(catalogDir, file), 'utf8'))
  const { _corruptSha, _corruptV2Sha, _plaintext, ...game } = catalog
  // C 模式夹具由 mock 服务直接托管源文件，不打包；原样输出供 build-data --with-fixtures 合并
  if (game.runtime === 'hosted' || game.runtime === 'external') {
    await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify(game, null, 2) + '\n')
    console.log(`[fixtures] ${game.id}: ${game.runtime} (no bundle)`)
    continue
  }
  const files = await collect(path.join(gamesDir, game.id))
  const version = 'v1'
  const version2 = 'v2'
  const zipV1 = pack(render(files, version))
  const zipV2 = pack(render(files, version2))

  // 每版本产出：磁盘对象（密文 .bin / 明文 .zip）、game JSON 的 bundle 对象、key JSON（仅加密时）
  const emitVersion = async (ver, zip, corruptFlag, suffix) => {
    const kid = deriveKid(game.id, ver)
    let bytes = zip
    let enc
    if (!_plaintext) {
      const out = crb1Encrypt(zip, kid)
      bytes = out.file
      enc = { v: 1, alg: 'AES-256-GCM', kid }
      await writeFile(
        path.join(outDir, 'keys', `${game.id}__${ver}.json`),
        JSON.stringify({ alg: 'AES-256-GCM', kid, key: out.cek.toString('base64url') }, null, 2) + '\n'
      )
    }
    const sha = createHash('sha256').update(bytes).digest('hex')
    const declaredSha = corruptFlag ? sha.replace(/^./, (c) => (c === '0' ? '1' : '0')) : sha
    const filename = `${game.id}${suffix}.${_plaintext ? 'zip' : 'bin'}`
    await writeFile(path.join(outDir, 'bundles', filename), bytes)
    return { url: `/data/bundles/${filename}`, bytes: bytes.length, sha256: declaredSha, ...(enc ? { enc } : {}) }
  }

  const bundleV1 = await emitVersion(version, zipV1, _corruptSha, '')
  const bundleV2 = await emitVersion(version2, zipV2, _corruptV2Sha, '-v2')
  await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify({
    ...game,
    runtime: 'virtual',
    version,
    entry: game.entry ?? 'index.html',
    bundle: bundleV1
  }, null, 2) + '\n')
  await writeFile(path.join(outDir, 'games-alt', `${game.id}.json`), JSON.stringify({
    version: version2,
    bundle: bundleV2
  }, null, 2) + '\n')
  console.log(`[fixtures] ${game.id}: ${Object.keys(files).length} files, v1=${version} v2=${version2} (${_plaintext ? '明文' : '加密'} ${bundleV1.bytes} bytes)`)
}

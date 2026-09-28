import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RESERVED_GAME_IDS, SRC_ROOT, createValidator, generate, loadGames } from './build-data.mjs'

const validGame = {
  id: '2048',
  name: '2048',
  url: 'https://play2048.co/',
  author: { name: 'Gabriel' },
  description: '滑动合并数字方块。',
  durationMinutes: { min: 5, max: 20 },
  type: 'puzzle',
  tags: ['数字'],
  addedAt: '2026-09-17'
}

const dirs: string[] = []

async function fixture(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'wgc-'))
  dirs.push(root)
  await mkdir(path.join(root, 'schema'), { recursive: true })
  await copyFile(path.join(SRC_ROOT, 'schema', 'game.schema.json'), path.join(root, 'schema', 'game.schema.json'))
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true })
})

describe('loadGames via generate', () => {
  it('接受合法游戏并生成 index/games/docs', async () => {
    const root = await fixture({
      'games/2048.json': { ...validGame, intro: '## 玩法' },
      'docs/about.md': '---\ntitle: 关于\norder: 1\n---\n\n## 小节\n\n正文'
    })
    const result = await generate({ srcRoot: root, now: new Date('2026-09-17T00:00:00Z') })
    expect(result).toMatchObject({ ok: true, games: 1, docs: 1 })
    const index = JSON.parse(await readFile(path.join(root, 'public/data/index.json'), 'utf8'))
    expect(index.games).toHaveLength(1)
    expect(index.games[0].intro).toBeUndefined()
    const detail = JSON.parse(await readFile(path.join(root, 'public/data/games/2048.json'), 'utf8'))
    expect(detail.intro).toBe('## 玩法')
    const docs = JSON.parse(await readFile(path.join(root, 'public/data/docs.json'), 'utf8'))
    expect(docs.docs[0]).toEqual({ slug: 'about', title: '关于', order: 1, content: '## 小节\n\n正文' })
  })

  it('check 模式只校验不写文件', async () => {
    const root = await fixture({ 'games/2048.json': validGame })
    const result = await generate({ srcRoot: root, check: true })
    expect(result.ok).toBe(true)
    await expect(readFile(path.join(root, 'public/data/index.json'))).rejects.toThrow()
  })

  it('拒绝 id 与文件名不一致、未知字段、重复标签、非法文件名', async () => {
    const cases: Array<[string, unknown]> = [
      ['games/other.json', validGame],
      ['games/2048.json', { ...validGame, writer: 'x' }],
      ['games/2048.json', { ...validGame, tags: ['dup', 'dup'] }],
      ['games/Bad Name.json', validGame]
    ]
    for (const [file, content] of cases) {
      const root = await fixture({ [file]: content })
      const result = await generate({ srcRoot: root, check: true })
      expect(result.ok, `${file} 应校验失败`).toBe(false)
    }
  })

  it('拒绝 max<min 与本地封面文件缺失/名字不匹配', async () => {
    const maxMin = await fixture({ 'games/2048.json': { ...validGame, durationMinutes: { min: 30, max: 5 } } })
    expect((await generate({ srcRoot: maxMin, check: true })).ok).toBe(false)

    const missing = await fixture({ 'games/2048.json': { ...validGame, cover: '/data/assets/covers/2048.png' } })
    expect((await generate({ srcRoot: missing, check: true })).ok).toBe(false)

    const wrongName = await fixture({
      'games/2048.json': { ...validGame, cover: '/data/assets/covers/other.png' },
      'assets/covers/other.png': 'png'
    })
    expect((await generate({ srcRoot: wrongName, check: true })).ok).toBe(false)
  })

  it('本地封面存在时校验通过', async () => {
    const root = await fixture({
      'games/2048.json': { ...validGame, cover: '/data/assets/covers/2048.webp' },
      'assets/covers/2048.webp': 'webp'
    })
    expect((await generate({ srcRoot: root, check: true })).ok).toBe(true)
  })

  it('文档：缺 title、未知 frontmatter 字段报错；order 排序生效', async () => {
    const noTitle = await fixture({ 'games/2048.json': validGame, 'docs/a.md': '---\norder: 1\n---\n正文' })
    expect((await generate({ srcRoot: noTitle, check: true })).ok).toBe(false)

    const unknownKey = await fixture({ 'games/2048.json': validGame, 'docs/a.md': '---\ntitle: A\nweight: 1\n---\n正文' })
    expect((await generate({ srcRoot: unknownKey, check: true })).ok).toBe(false)

    const sorted = await fixture({
      'games/2048.json': validGame,
      'docs/b.md': '---\ntitle: B\norder: 2\n---\nB',
      'docs/a.md': '---\ntitle: A\norder: 1\n---\nA'
    })
    await generate({ srcRoot: sorted })
    const docs = JSON.parse(await readFile(path.join(sorted, 'public/data/docs.json'), 'utf8'))
    expect(docs.docs.map((d: { slug: string }) => d.slug)).toEqual(['a', 'b'])
  })

  it('bundle.enc 合法时接受、kid 非法时拒绝', async () => {
    const enc = { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) }
    const bundle = { url: '/data/bundles/2048.bin', bytes: 10, sha256: 'a'.repeat(64), enc }
    const okRoot = await fixture({
      'games/2048.json': { ...validGame, runtime: 'virtual', version: 'v1', bundle },
      'docs/about.json': { slug: 'about', title: '关于', order: 1, content: '正文' }
    })
    const ok = await generate({ srcRoot: okRoot, check: true })
    expect(ok.ok, JSON.stringify(ok.errors)).toBe(true)

    const badRoot = await fixture({
      'games/2048.json': { ...validGame, runtime: 'virtual', version: 'v1', bundle: { ...bundle, enc: { ...enc, kid: 'short' } } },
      'docs/about.json': { slug: 'about', title: '关于', order: 1, content: '正文' }
    })
    const bad = await generate({ srcRoot: badRoot, check: true })
    expect(bad.ok).toBe(false)
  })
})

describe('schema v2 运行时字段', () => {
  const baseGame = {
    id: 'virtual-demo', name: 'V', url: 'https://example.com/', author: { name: 'a' },
    description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: ['x'], addedAt: '2026-09-17'
  }

  async function makeValidator() {
    const schema = JSON.parse(await readFile(path.join(SRC_ROOT, 'schema', 'game.schema.json'), 'utf8'))
    return createValidator(schema)
  }

  async function loadGameFiles(files: Record<string, unknown>) {
    const root = await fixture(files)
    return loadGames({
      gamesDir: path.join(root, 'games'),
      coversDir: path.join(root, 'assets', 'covers'),
      validate: await makeValidator()
    })
  }

  it('runtime=virtual 必须带 version 与 bundle', async () => {
    const { errors } = await loadGameFiles({
      'games/virtual-demo.json': { ...baseGame, runtime: 'virtual' }
    })
    expect(errors.join('\n')).toMatch(/version/)
    expect(errors.join('\n')).toMatch(/bundle/)
  })

  it('runtime=hosted 必须带 hostedUrl', async () => {
    const { errors } = await loadGameFiles({
      'games/virtual-demo.json': { ...baseGame, runtime: 'hosted' }
    })
    expect(errors.join('\n')).toMatch(/hostedUrl/)
  })

  it('保留字 id 被拒绝', async () => {
    expect(RESERVED_GAME_IDS.has('api')).toBe(true)
    const { errors } = await loadGameFiles({
      'games/api.json': { ...baseGame, id: 'api' }
    })
    expect(errors.join('\n')).toMatch(/保留|reserved/)
  })

  it('features 未知键被拒绝', async () => {
    const { errors } = await loadGameFiles({
      'games/virtual-demo.json': {
        ...baseGame, runtime: 'virtual', version: 'v1',
        bundle: { url: '/data/bundles/virtual-demo.zip', bytes: 1, sha256: 'a'.repeat(64) },
        features: { nope: true }
      }
    })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('index 摘要只带 runtime；详情带全部运行时字段', async () => {
    const bundle = { url: '/data/bundles/virtual-demo.zip', bytes: 1, sha256: 'a'.repeat(64) }
    const root = await fixture({
      'games/virtual-demo.json': {
        ...baseGame, runtime: 'virtual', version: 'v1', entry: 'index.html',
        playOrigin: 'https://games.example.com/', bundle,
        features: { wasm: true }, display: { aspect: '16:9' }, fallback: 'external'
      }
    })
    await generate({ srcRoot: root })
    const index = JSON.parse(await readFile(path.join(root, 'public/data/index.json'), 'utf8'))
    expect(index.games[0].runtime).toBe('virtual')
    expect(index.games[0].bundle).toBeUndefined()
    const detail = JSON.parse(await readFile(path.join(root, 'public/data/games/virtual-demo.json'), 'utf8'))
    expect(detail).toMatchObject({
      runtime: 'virtual',
      version: 'v1',
      entry: 'index.html',
      playOrigin: 'https://games.example.com/',
      bundle,
      features: { wasm: true },
      display: { aspect: '16:9' },
      fallback: 'external'
    })
  })
})

describe('复合 id（user/slug）静态贡献', () => {
  it('slug 段=文件名：生成 __ 映射文件名、index schemaVersion 2、user/slug 进摘要', async () => {
    const root = await fixture({
      'games/2048.json': { ...validGame, id: 'fendy/2048', user: 'fendy', slug: '2048', playSubdomain: 'a'.repeat(16) }
    })
    const result = await generate({ srcRoot: root, now: new Date('2026-09-17T00:00:00Z') })
    expect(result.ok, JSON.stringify(result.errors)).toBe(true)

    const index = JSON.parse(await readFile(path.join(root, 'public/data/index.json'), 'utf8'))
    expect(index.schemaVersion).toBe(2)
    expect(index.games[0]).toMatchObject({ id: 'fendy/2048', user: 'fendy', slug: '2048' })
    expect(index.games[0].playSubdomain).toBeUndefined()

    const detail = JSON.parse(await readFile(path.join(root, 'public/data/games/fendy__2048.json'), 'utf8'))
    expect(detail).toMatchObject({ id: 'fendy/2048', user: 'fendy', slug: '2048', playSubdomain: 'a'.repeat(16) })
    await expect(readFile(path.join(root, 'public/data/games/fendy/2048.json'))).rejects.toThrow()
  })

  it('纯 id 静态贡献原样通过（遗留形态），文件名不映射', async () => {
    const root = await fixture({ 'games/2048.json': validGame })
    const result = await generate({ srcRoot: root })
    expect(result.ok, JSON.stringify(result.errors)).toBe(true)
    await expect(readFile(path.join(root, 'public/data/games/2048.json'))).resolves.toBeTruthy()
  })

  it('slug 段与文件名不一致被拒绝', async () => {
    const root = await fixture({ 'games/2048.json': { ...validGame, id: 'fendy/other' } })
    const result = await generate({ srcRoot: root, check: true })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/slug/)
  })

  it('id 带非法 user 段（大写/超长/多斜杠）被 schema 拒绝', async () => {
    for (const id of ['Fendy/2048', `${'a'.repeat(40)}/2048`, 'fendy/2048/x']) {
      const root = await fixture({ 'games/2048.json': { ...validGame, id } })
      const result = await generate({ srcRoot: root, check: true })
      expect(result.ok, `id "${id}" 应校验失败`).toBe(false)
    }
  })

  it('显式 user/slug 字段与 id 拆段不一致被拒绝', async () => {
    for (const extra of [{ user: 'alice' }, { slug: 'other' }, { user: 'fendy', slug: 'other' }]) {
      const root = await fixture({ 'games/2048.json': { ...validGame, id: 'fendy/2048', ...extra } })
      const result = await generate({ srcRoot: root, check: true })
      expect(result.ok, JSON.stringify(extra)).toBe(false)
      expect(result.errors.join('\n')).toMatch(/不一致/)
    }
  })

  it('非法 user/slug/playSubdomain 显式字段被 schema 拒绝', async () => {
    for (const extra of [{ user: 'Bad' }, { slug: 'x'.repeat(64) }, { playSubdomain: 'nothex' }]) {
      const root = await fixture({ 'games/2048.json': { ...validGame, ...extra } })
      const result = await generate({ srcRoot: root, check: true })
      expect(result.ok, JSON.stringify(extra)).toBe(false)
    }
  })

  it('本地封面按 slug 段匹配（复合 id 不再要求与完整 id 一致）', async () => {
    const ok = await fixture({
      'games/2048.json': { ...validGame, id: 'fendy/2048', cover: '/data/assets/covers/2048.webp' },
      'assets/covers/2048.webp': 'webp'
    })
    expect((await generate({ srcRoot: ok, check: true })).ok).toBe(true)

    const mismatch = await fixture({
      'games/2048.json': { ...validGame, id: 'fendy/2048', cover: '/data/assets/covers/other.webp' },
      'assets/covers/other.webp': 'webp'
    })
    const result = await generate({ srcRoot: mismatch, check: true })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/slug/)
  })
})

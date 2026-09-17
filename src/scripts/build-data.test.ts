import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SRC_ROOT, generate } from './build-data.mjs'

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
})

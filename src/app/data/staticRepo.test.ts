import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { NotFoundError } from './repository'
import { StaticContentRepository, assertGameSummary } from './staticRepo'

const index = {
  schemaVersion: 2,
  generatedAt: '2026-09-17T00:00:00.000Z',
  games: [{
    id: '2048',
    name: '2048',
    url: 'https://play2048.co/',
    author: { name: 'Gabriel' },
    description: '滑动合并数字方块。',
    durationMinutes: { min: 5, max: 20 },
    type: 'puzzle',
    tags: ['数字'],
    addedAt: '2026-09-17'
  }]
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

describe('StaticContentRepository', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    return () => vi.unstubAllGlobals()
  })

  it('使用 base 拼 URL 并返回摘要列表', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(index))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).resolves.toEqual(index.games)
    expect(fetchMock).toHaveBeenCalledWith('/data/index.json')
  })

  it('列表请求有内存缓存（只 fetch 一次）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(index))
    const repo = new StaticContentRepository('/data')
    await repo.listGames()
    await repo.listGames()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 抛 NotFoundError，且失败不缓存（可重试成功）', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ ...index.games[0] }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.getGame('2048')).rejects.toBeInstanceOf(NotFoundError)
    await expect(repo.getGame('2048')).resolves.toMatchObject({ id: '2048' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('复合 id 的详情文件名把 / 映射为 __；纯 id 文件名原样', async () => {
    const composite = {
      ...index.games[0],
      id: 'fendy/2048',
      user: 'fendy',
      slug: '2048'
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(composite)).mockResolvedValueOnce(jsonResponse(index.games[0]))
    const repo = new StaticContentRepository('/data')
    await expect(repo.getGame('fendy/2048')).resolves.toMatchObject({ id: 'fendy/2048', user: 'fendy' })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/data/games/fendy__2048.json')
    await expect(repo.getGame('2048')).resolves.toMatchObject({ id: '2048' })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/data/games/2048.json')
  })

  it('summary 的 user/slug 可选：缺失通过（静态遗留数据），存在则校验 pattern', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(index))
    const legacy = new StaticContentRepository('/data')
    await expect(legacy.listGames()).resolves.toHaveLength(1)

    for (const bad of [{ user: 'Bad' }, { slug: '-x' }, { slug: 'a'.repeat(64) }]) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ schemaVersion: 2, games: [{ ...index.games[0], ...bad }] }))
      const repo = new StaticContentRepository('/data')
      await expect(repo.listGames()).rejects.toThrow('数据格式错误')
    }
  })

  it('非 404 错误抛 Error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).rejects.toThrow('请求失败 500')
  })

  it('响应结构非法时报错', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ schemaVersion: 1, games: [{ id: 1 }] }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).rejects.toThrow('数据格式错误')
  })

  it('listDocs 返回元信息，getDoc 返回正文', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      generatedAt: 't',
      docs: [{ slug: 'about', title: '关于', order: 1, content: '# x' }]
    }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listDocs()).resolves.toEqual([{ slug: 'about', title: '关于', order: 1 }])
    await expect(repo.getDoc('about')).resolves.toMatchObject({ title: '关于', content: '# x' })
  })
})

const minimal = {
  id: 'fixture/minimal',
  user: 'fixture',
  slug: 'minimal',
  name: '最小作品',
  durationMinutes: { min: 1, max: 2 },
  type: 'puzzle',
  tags: [],
  addedAt: '2026-09-29'
}

describe('assertGameSummary 可选字段', () => {
  test('缺 url/author/description 的最小摘要通过', () => {
    expect(() => assertGameSummary(minimal, 'games[0]')).not.toThrow()
  })
  test('author 仅 url 无 name 通过（后端 NewGameAuthor 会输出该形态）', () => {
    expect(() => assertGameSummary({ ...minimal, author: { url: 'https://a.example' } }, 'games[0]')).not.toThrow()
  })
  test('author.name 非字符串仍被拒', () => {
    expect(() => assertGameSummary({ ...minimal, author: { name: 42 } }, 'games[0]')).toThrow()
  })
  test('缺 id/name/durationMinutes 照旧报错', () => {
    expect(() => assertGameSummary({ name: 'x' }, 'games[0]')).toThrow()
  })
})

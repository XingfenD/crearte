import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError } from './repository'
import { StaticContentRepository } from './staticRepo'

const index = {
  schemaVersion: 1,
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

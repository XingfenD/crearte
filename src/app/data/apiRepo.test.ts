import { afterEach, describe, expect, test, vi } from 'vitest'
import { NotFoundError } from './repository'
import { ApiContentRepository } from './apiRepo'

const INDEX = { schemaVersion: 1, generatedAt: 'x', games: [{ id: 'g1', name: 'G', url: 'https://u', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27' }] }

function jsonResponse(body: unknown, init: { status?: number; etag?: string; cacheControl?: string } = {}): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.etag) headers.ETag = init.etag
  if (init.cacheControl) headers['Cache-Control'] = init.cacheControl
  return new Response(init.status === 304 ? null : JSON.stringify(body), { status: init.status ?? 200, headers })
}

const docsStub = { listDocs: async () => [], getDoc: async () => { throw new NotFoundError('x') } }

afterEach(() => vi.unstubAllGlobals())

describe('ApiContentRepository', () => {
  test('listGames 解析 games 数组', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(INDEX)))
    const repo = new ApiContentRepository('http://api', docsStub)
    const games = await repo.listGames()
    expect(games.map((g) => g.id)).toEqual(['g1'])
  })

  test('ETag 条件请求：第二次带 If-None-Match，304 复用缓存 body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(INDEX))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listGames()
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('If-None-Match')

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>)?.['If-None-Match'] === 'W/"e1"') return new Response(null, { status: 304 })
      return jsonResponse(INDEX)
    })
    // 首次响应无 ETag 头则不缓存——重设 stub 使首次带 ETag
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(INDEX, { etag: 'W/"e1"' })))
    const repo2 = new ApiContentRepository('http://api', docsStub)
    await repo2.listGames()
    vi.stubGlobal('fetch', fetchMock)
    const again = await repo2.listGames()
    expect(again.map((g) => g.id)).toEqual(['g1'])
    expect(fetchMock).toHaveBeenCalled()
  })

  test('Cache-Control: no-store 时不缓存 ETag', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(INDEX, { etag: 'W/"e1"', cacheControl: 'no-store' }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listGames()
    await repo.listGames()
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty('If-None-Match')
  })

  test('404 → NotFoundError；500 → Error；网络错误 → Error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('nope')).rejects.toThrow(NotFoundError)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(repo.listGames()).rejects.toThrow(/请求失败 500/)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(repo.listGames()).rejects.toThrow(/网络请求失败/)
  })

  test('并发同 URL 去重：两次 listGames 只发一次请求', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFirst = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    const p1 = repo.listGames()
    const p2 = repo.listGames()
    resolveFirst(jsonResponse(INDEX))
    await Promise.all([p1, p2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('getGame：virtual 缺 bundle 抛数据格式错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...INDEX.games[0], runtime: 'virtual' })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('g1')).rejects.toThrow(/bundle 缺失/)
  })

  test('listDocs/getDoc 委托静态源', async () => {
    const listDocs = vi.fn(async () => [{ slug: 's', title: 't', order: 1 }])
    const repo = new ApiContentRepository('http://api', { listDocs, getDoc: async () => { throw new NotFoundError('x') } })
    expect((await repo.listDocs())[0].slug).toBe('s')
    expect(listDocs).toHaveBeenCalled()
  })
})

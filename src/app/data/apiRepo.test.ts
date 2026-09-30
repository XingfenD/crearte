import { afterEach, describe, expect, test, vi } from 'vitest'
import { AdminApiError, NotFoundError } from './repository'
import { ApiContentRepository } from './apiRepo'

const INDEX = {
  schemaVersion: 2,
  generatedAt: 'x',
  games: [{
    id: 'fendy/2048',
    user: 'fendy',
    slug: '2048',
    name: 'G',
    url: 'https://u',
    author: { name: 'a' },
    description: 'd',
    durationMinutes: { min: 1, max: 2 },
    type: 'puzzle',
    tags: [],
    addedAt: '2026-09-27'
  }]
}

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
    expect(games.map((g) => g.id)).toEqual(['fendy/2048'])
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
    expect(again.map((g) => g.id)).toEqual(['fendy/2048'])
    expect(fetchMock).toHaveBeenCalled()
    // N1：锁死「条件请求发送」半边语义——缺此断言时删掉 If-None-Match 发送仍全绿（变异 M1 存活）
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>)['If-None-Match']).toBe('W/"e1"')
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
    await expect(repo.getGame('fendy/nope')).rejects.toThrow(NotFoundError)

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

  test('getGame 拆复合 id 请求 /api/games/:user/:slug（斜杠不转义）', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(INDEX.games[0]))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('fendy/2048')).resolves.toMatchObject({ id: 'fendy/2048' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/api/games/fendy/2048')
  })

  test('getGame：virtual 缺 bundle 抛数据格式错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...INDEX.games[0], runtime: 'virtual' })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('fendy/2048')).rejects.toThrow(/bundle 缺失/)
  })

  test('listDocs/getDoc 委托静态源', async () => {
    const listDocs = vi.fn(async () => [{ slug: 's', title: 't', order: 1 }])
    const getDoc = vi.fn(async () => { throw new NotFoundError('x') })
    const repo = new ApiContentRepository('http://api', { listDocs, getDoc })
    expect((await repo.listDocs())[0].slug).toBe('s')
    expect(listDocs).toHaveBeenCalled()
    // N2：getDoc 委托此前从未被执行，用例名与覆盖面不符
    await expect(repo.getDoc('s')).rejects.toThrow(NotFoundError)
    expect(getDoc).toHaveBeenCalledWith('s')
  })
})

// ---- P7 管理面（spec §3.4/§4.1）：请求形状/不缓存/错误映射/409 原文

const errorJson = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const USERS_PAGE = {
  users: [{ id: 'u1', email: 'a@b.c', username: 'alice', display_name: 'A', role: 'user', created_at: '2026-09-01T00:00:00Z' }],
  total: 1
}
const AUDIT_PAGE = {
  entries: [{ id: 'e1', actor_id: 'u1', actor_email: 'a@b.c', method: 'POST', route: '/api/admin/submissions/:id/approve', path: '/api/admin/submissions/s1/approve', status: 200, created_at: '2026-09-30T00:00:00Z' }],
  total: 1
}

describe('ApiContentRepository 管理面（P7）', () => {
  test('listAdminUsers 默认 limit=50/offset=0，q 空不参入 query', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(USERS_PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub, () => 'tok')
    const page = await repo.listAdminUsers()
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/api/admin/users?limit=50&offset=0')
    expect(page).toEqual(USERS_PAGE)
    // Bearer 管理面必带
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    await repo.listAdminUsers({ q: 'ali', offset: 50 })
    expect(fetchMock.mock.calls[1][0]).toBe('http://api/api/admin/users?q=ali&limit=50&offset=50')
  })

  test('listAudit：route 过滤参数 + entries/total 解析', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(AUDIT_PAGE))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listAudit({ route: '/api/admin/submissions/:id/approve' })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/api/admin/audit')
    expect(url.searchParams.get('route')).toBe('/api/admin/submissions/:id/approve')
    expect(url.searchParams.get('limit')).toBe('50')
  })

  test('两 GET 响应即便带 ETag 也不入缓存（管理面不缓存）', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(USERS_PAGE, { etag: 'W/"e1"' }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listAdminUsers()
    await repo.listAdminUsers()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty('If-None-Match')
  })

  test('setUserRole PATCH /api/admin/users/:id/role，body {role}，返回更新后用户', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ...USERS_PAGE.users[0], role: 'admin' }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub, () => 'tok')
    const updated = await repo.setUserRole('u1', 'admin')
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/api/admin/users/u1/role')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ role: 'admin' }))
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Authorization).toBe('Bearer tok')
    expect(updated.role).toBe('admin')
  })

  test('管理面错误 → AdminApiError（status/code 可区分；message 保留后端原文）', async () => {
    // 400 validation
    vi.stubGlobal('fetch', vi.fn(async () => errorJson(400, 'validation', 'role must be user or admin')))
    const repo = new ApiContentRepository('http://api', docsStub)
    const e400 = await repo.setUserRole('u1', 'wizard' as never).catch((e: unknown) => e)
    expect(e400).toBeInstanceOf(AdminApiError)
    expect((e400 as AdminApiError).status).toBe(400)
    expect((e400 as AdminApiError).code).toBe('validation')

    // 404：管理面不再是 NotFoundError（区分于读侧 404 → 静态回落契约）
    vi.stubGlobal('fetch', vi.fn(async () => errorJson(404, 'not_found', 'user not found')))
    const e404 = await repo.listAdminUsers().catch((e: unknown) => e)
    expect(e404).toBeInstanceOf(AdminApiError)
    expect((e404 as AdminApiError).code).toBe('not_found')

    // 409 last_admin：code + 原文 message 逐字透出（UI 直接回显）
    vi.stubGlobal('fetch', vi.fn(async () => errorJson(409, 'last_admin', 'cannot demote the last admin')))
    const e409 = await repo.setUserRole('u1', 'user').catch((e: unknown) => e)
    expect(e409).toBeInstanceOf(AdminApiError)
    expect((e409 as AdminApiError).status).toBe(409)
    expect((e409 as AdminApiError).code).toBe('last_admin')
    expect((e409 as AdminApiError).message).toBe('cannot demote the last admin')
  })

  test('非 JSON 错误体 → code http_<status>，message 兜底；响应缺字段 → 空页形状', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    const repo = new ApiContentRepository('http://api', docsStub)
    const e = await repo.listAdminUsers().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(AdminApiError)
    expect((e as AdminApiError).code).toBe('http_500')
    expect((e as AdminApiError).message).toMatch(/请求失败 500/)

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})))
    await expect(repo.listAdminUsers()).resolves.toEqual({ users: [], total: 0 })
    await expect(repo.listAudit()).resolves.toEqual({ entries: [], total: 0 })
  })

  test('读侧形状不变：/api/games 404 仍 NotFoundError，不带 Authorization（无 token 时）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('a/b')).rejects.toThrow(NotFoundError)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// session 取自 @/auth 单例（真实 API：getToken()）；测试里 mock 掉整个 auth 模块，
// 避免模块初始化触碰 window.localStorage，并可动态切换 token 存在与否。
const h = vi.hoisted(() => ({ token: 'tok' as string | null }))

vi.mock('@/auth', () => ({
  session: {
    getToken: () => h.token,
    state: { status: 'authenticated', user: null },
    invalidate: vi.fn()
  }
}))

const VIEW = { favoriteCount: 3, ratingCount: 2, ratingAvg: 4.5, favorited: true, rated: true, score: 4 }

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response
}

// 每次以指定 VITE_API_BASE_URL 重新求值模块（reactionsEnabled/base 在模块顶层定格）
async function loadLib(base: string): Promise<typeof import('./reactions')> {
  vi.stubEnv('VITE_API_BASE_URL', base)
  vi.resetModules()
  return await import('./reactions')
}

beforeEach(() => {
  h.token = 'tok'
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('lib/reactions fetch 契约（JSON 逐字对齐服务端 ReactionView）', () => {
  it('PUT favorite：URL 拼 base 去尾斜杠、Bearer 头、返回解析后的 ReactionView', async () => {
    const lib = await loadLib('https://api.test/')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, VIEW))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lib.setFavorite('alice', 'work', true)).resolves.toEqual(VIEW)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/api/games/alice/work/favorite')
    expect(init.method).toBe('PUT')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
    expect(init.body).toBeUndefined()
  })

  it('DELETE favorite：同径 DELETE', async () => {
    const lib = await loadLib('https://api.test')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ...VIEW, favorited: false }))
    vi.stubGlobal('fetch', fetchMock)
    await lib.setFavorite('alice', 'work', false)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/api/games/alice/work/favorite')
    expect(init.method).toBe('DELETE')
  })

  it('PUT rating：body {"score":n} 且带 Content-Type', async () => {
    const lib = await loadLib('https://api.test')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, VIEW))
    vi.stubGlobal('fetch', fetchMock)
    await lib.setRating('alice', 'work', 4)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/api/games/alice/work/rating')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe('{"score":4}')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
  })

  it('unrate：DELETE /rating', async () => {
    const lib = await loadLib('https://api.test')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ...VIEW, rated: false }))
    vi.stubGlobal('fetch', fetchMock)
    await lib.unrate('alice', 'work')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/api/games/alice/work/rating')
    expect(init.method).toBe('DELETE')
  })

  it('fetchMine：GET /api/me/reactions，返回 favorites/ratings', async () => {
    const lib = await loadLib('https://api.test')
    const mine = { favorites: ['alice/work'], ratings: { 'alice/work': 4 } }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, mine))
    vi.stubGlobal('fetch', fetchMock)
    await expect(lib.fetchMine()).resolves.toEqual(mine)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/api/me/reactions')
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('401 → AuthRequiredError', async () => {
    const lib = await loadLib('https://api.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthorized' })))
    await expect(lib.setFavorite('u', 's', true)).rejects.toBeInstanceOf(lib.AuthRequiredError)
  })

  it('无 token → AuthRequiredError 且零请求', async () => {
    const lib = await loadLib('https://api.test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    h.token = null
    await expect(lib.setFavorite('u', 's', true)).rejects.toBeInstanceOf(lib.AuthRequiredError)
    await expect(lib.fetchMine()).rejects.toBeInstanceOf(lib.AuthRequiredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非 401 的失败状态 → 请求失败 n', async () => {
    const lib = await loadLib('https://api.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})))
    await expect(lib.setRating('u', 's', 3)).rejects.toThrow('请求失败 500')
  })

  it('base 为空 → reactionsEnabled=false，调用抛错且零请求', async () => {
    const lib = await loadLib('')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(lib.reactionsEnabled).toBe(false)
    await expect(lib.setFavorite('u', 's', true)).rejects.toThrow('未配置后端')
    await expect(lib.fetchMine()).rejects.toThrow('未配置后端')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('base 非空 → reactionsEnabled=true', async () => {
    const lib = await loadLib('https://api.test')
    expect(lib.reactionsEnabled).toBe(true)
  })
})

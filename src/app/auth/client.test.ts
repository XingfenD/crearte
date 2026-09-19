import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthClient } from './client'
import { toErrorCode } from './errors'

const BASE = 'https://api.crearte.yoresee.cc'

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

function client(onUnauthorized?: () => void) {
  return createAuthClient({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch, onUnauthorized })
}

beforeEach(() => { fetchMock = vi.fn() })

describe('auth 客户端', () => {
  it('login 打对地址并解析 AuthResponse', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      token: 't1',
      expires_at: '2026-09-26T12:00:00Z',
      user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
    }, 200))
    const result = await client().login({ email: 'a@example.com', password: 'password1234' })
    expect(result.token).toBe('t1')
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/auth/login`, expect.objectContaining({ method: 'POST' }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@example.com', password: 'password1234' })
  })

  it('register 用 display_name 字段名', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      token: 't1', expires_at: '2026-09-26T12:00:00Z',
      user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
    }, 201))
    await client().register({ email: 'a@example.com', password: 'password1234', displayName: 'A' })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@example.com', password: 'password1234', display_name: 'A' })
  })

  it('错误体映射为 AuthApiError 并带上 code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'email_taken', message: 'email already registered' } }, 409))
    await expect(client().register({ email: 'a@example.com', password: 'password1234', displayName: 'A' }))
      .rejects.toMatchObject({ status: 409, code: 'email_taken' })
  })

  it('未知 code 归一到 internal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'mystery', message: 'x' } }, 500))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 500, code: 'internal' })
  })

  it('429 读出 Retry-After 秒数', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '42' }))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 429, code: 'rate_limited', retryAfterSeconds: 42 })
  })

  it('401 unauthorized 触发钩子,invalid_credentials 不触发', async () => {
    const onUnauthorized = vi.fn()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized', message: 'x' } }, 401))
    await expect(client(onUnauthorized).me('token')).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'invalid_credentials', message: 'x' } }, 401))
    await expect(client(onUnauthorized).login({ email: 'a@example.com', password: 'password1234' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('Bearer 头只在带 token 的请求上', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' } }, 200))
    await client().me('token-9')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-9')
  })

  it('logoutAll 接受 204 空响应', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: new Headers() } as Response)
    await expect(client().logoutAll('token')).resolves.toBeUndefined()
  })

  it('网络异常归为 network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed to fetch'))
    await expect(client().login({ email: 'a@example.com', password: 'password1234' }))
      .rejects.toMatchObject({ status: 0, code: 'network' })
  })
})

describe('toErrorCode 直接用例', () => {
  it('已知 code 原样返回', () => {
    expect(toErrorCode('unauthorized')).toBe('unauthorized')
  })

  it('未知 code 兜底 internal', () => {
    expect(toErrorCode('mystery')).toBe('internal')
  })

  it('非字符串兜底 internal', () => {
    expect(toErrorCode(undefined)).toBe('internal')
  })
})

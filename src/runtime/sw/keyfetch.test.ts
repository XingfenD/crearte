import { afterEach, expect, test, vi } from 'vitest'
import { BundleFormatError } from './crypto'
import { fetchBundleKey } from './keyfetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

const KEY_JSON = JSON.stringify({ alg: 'AES-256-GCM', kid: 'k'.repeat(22), key: 'k'.repeat(43) })

function mockFetch(responses: Array<{ status: number; headers?: Record<string, string>; body?: string } | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (next instanceof Error) throw next
    return new Response(next.body ?? '', { status: next.status, headers: next.headers })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

function noSleep() {
  const slept: number[] = []
  return { sleep: async (ms: number) => { slept.push(ms) }, slept }
}

test('200：解析 key 材料，token 透传 Authorization', async () => {
  const calls = mockFetch([{ status: 200, body: KEY_JSON }])
  const material = await fetchBundleKey('https://api/k', { token: 't0k', sleep: async () => {} })
  expect(material.key.length).toBe(32)
  expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer t0k' })
})

test('429：Retry-After 优先，退避序列 1s/2s/4s，第 4 次成功', async () => {
  mockFetch([
    { status: 429, headers: { 'Retry-After': '3' } },
    { status: 429 },
    { status: 429 },
    { status: 200, body: KEY_JSON }
  ])
  const { sleep, slept } = noSleep()
  const material = await fetchBundleKey('https://api/k', { sleep })
  expect(material.kid).toBe('k'.repeat(22))
  expect(slept).toEqual([3000, 1000, 2000])
})

test('429 超过 3 次重试后失败', async () => {
  mockFetch([{ status: 429 }])
  const { sleep } = noSleep()
  await expect(fetchBundleKey('https://api/k', { sleep })).rejects.toThrow(/HTTP 429/)
})

test('410/404/401/403 立即失败不重试', async () => {
  for (const status of [401, 403, 404, 410]) {
    const calls = mockFetch([{ status }])
    const { sleep } = noSleep()
    await expect(fetchBundleKey('https://api/k', { sleep })).rejects.toThrow(`bundle-key 获取失败: HTTP ${status}`)
    expect(calls.length).toBe(1)
  }
})

test('5xx 与网络错误不重试（与 bundle 下载失败同等处理）', async () => {
  const calls = mockFetch([{ status: 503 }])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow(/HTTP 503/)
  expect(calls.length).toBe(1)

  mockFetch([new Error('network down')])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow('bundle-key 网络错误')
})

test('响应体畸形 → BundleFormatError', async () => {
  mockFetch([{ status: 200, body: '{oops' }])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow(BundleFormatError)
})

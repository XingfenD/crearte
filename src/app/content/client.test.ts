import { afterEach, describe, expect, test, vi } from 'vitest'
import { ContentApiError } from './errors'
import { createContentClient, toAbsoluteApiUrl, uploadBundleKeyPath, uploadBundlePath, validateUploadInput } from './client'

function jsonResponse(body: unknown, init: { status?: number; retryAfter?: string } = {}): Response {
  const headers: Record<string, string> = {}
  if (init.retryAfter) headers['Retry-After'] = init.retryAfter
  return new Response(init.status && init.status >= 400 && body === null
    ? JSON.stringify({ error: { code: 'internal', message: 'x' } })
    : JSON.stringify(body), { status: init.status ?? 200, headers })
}

const opts = { baseUrl: 'http://api', getToken: () => 'tok', onUnauthorized: vi.fn() }

afterEach(() => vi.unstubAllGlobals())

describe('createContentClient', () => {
  test('listMine：带 Bearer，解析 submissions', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ submissions: [{ id: 's1' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    const subs = await client.listMine()
    expect(subs[0].id).toBe('s1')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  test('429：解析 Retry-After 与 code', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => new Response(
      JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }),
      { status: 429, headers: { 'Retry-After': '37' } }
    )))
    const client = createContentClient(opts)
    const err = await client.listMine().catch((e) => e)
    expect(err).toBeInstanceOf(ContentApiError)
    expect(err.code).toBe('rate_limited')
    expect(err.retryAfterSeconds).toBe(37)
  })

  test('400 invalid_request：details 保留服务端字段详情', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => new Response(
      JSON.stringify({ error: { code: 'invalid_request', message: 'work_id: taken; version: bad' } }),
      { status: 400 }
    )))
    const client = createContentClient(opts)
    const err = await client.createSubmission({ kind: 'new_work', work_id: 'w', payload: {} as never, bundle_upload_id: '', cover_upload_id: '', submit: false }).catch((e) => e)
    expect(err.code).toBe('invalid_request')
    expect(err.details).toBe('work_id: taken; version: bad')
  })

  test('401 unauthorized 触发 onUnauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 }
    )))
    const onUnauthorized = vi.fn()
    const client = createContentClient({ ...opts, onUnauthorized })
    await client.listMine().catch(() => undefined)
    expect(onUnauthorized).toHaveBeenCalled()
  })

  test('DELETE 204 无 body；adminSetRevoked 组双段路径与 body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    await expect(client.deleteSubmission('s1')).resolves.toBeUndefined()

    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }))
    await client.adminSetRevoked('alice/demo', 'v2', true)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('http://api/api/admin/works/alice/demo/versions/v2/revoke')
    expect(JSON.parse(String(init?.body))).toEqual({ revoked: true })
  })

  test('adminSetFeatures：PUT 双段路径与 { features } body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    await client.adminSetFeatures('alice/demo', { eval: true, inlineScript: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://api/api/admin/works/alice/demo/features')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ features: { eval: true, inlineScript: false } })
  })

  test('adminUnpublish / adminRepublish：复合 workId 拆成双段路径', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    await client.adminUnpublish('bob/my-game')
    await client.adminRepublish('bob/my-game')
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/api/admin/works/bob/my-game/unpublish')
    expect(fetchMock.mock.calls[1][0]).toBe('http://api/api/admin/works/bob/my-game/republish')
  })

  test('网络错误 → code network', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, _init?: RequestInit) => { throw new TypeError('fetch failed') }))
    const client = createContentClient(opts)
    const err = await client.listMine().catch((e) => e)
    expect(err.code).toBe('network')
  })
})

describe('validateUploadInput', () => {
  const zip = { name: 'a.zip', size: 10, type: 'application/zip' } as File
  const png = { name: 'c.png', size: 10, type: 'image/png' } as File
  test('bundle 必须带 work_id/version 且为 zip 且 ≤100MB', () => {
    expect(validateUploadInput({ kind: 'bundle', file: zip })).toMatch(/请先填写名称与版本号/)
    expect(validateUploadInput({ kind: 'bundle', slug: 'w', version: 'v1', file: zip })).toBeNull()
    expect(validateUploadInput({ kind: 'bundle', slug: 'w', version: 'v1', file: { ...zip, name: 'a.rar', type: '' } as File })).toMatch(/zip/)
    expect(validateUploadInput({ kind: 'bundle', slug: 'w', version: 'v1', file: { ...zip, size: 101 * 1024 * 1024 } as File })).toMatch(/超过上限/)
  })
  test('cover 限 png/jpeg/webp 且 ≤5MB', () => {
    expect(validateUploadInput({ kind: 'cover', file: png })).toBeNull()
    expect(validateUploadInput({ kind: 'cover', file: { ...png, type: 'image/gif', name: 'c.gif' } as File })).toMatch(/png/)
    expect(validateUploadInput({ kind: 'cover', file: { ...png, size: 6 * 1024 * 1024 } as File })).toMatch(/超过上限/)
  })
  // 以下三条为纯逻辑分支补测（与后端 uploads.go 的 "file must not be empty"、Windows zip MIME 对齐）
  test('bundle 接受 Windows 的 application/x-zip-compressed', () => {
    expect(validateUploadInput({ kind: 'bundle', slug: 'w', version: 'v1', file: { ...zip, name: 'a.bin', type: 'application/x-zip-compressed' } as File })).toBeNull()
  })
  test('空文件拒绝（bundle/cover 各自文案）', () => {
    expect(validateUploadInput({ kind: 'bundle', slug: 'w', version: 'v1', file: { ...zip, size: 0 } as File })).toMatch(/为空文件/)
    expect(validateUploadInput({ kind: 'cover', file: { ...png, size: 0 } as File })).toMatch(/为空文件/)
  })
  test('cover 扩展名与 MIME 须同时合法（MIME 合法但扩展名不符仍拒）', () => {
    expect(validateUploadInput({ kind: 'cover', file: { ...png, name: 'c.bin', type: 'image/png' } as File })).toMatch(/png/)
    expect(validateUploadInput({ kind: 'cover', file: { ...png, name: 'c.png', type: '' } as File })).toBeNull()
  })
})

describe('createContentClient.upload', () => {
  test('bundle 分支以 slug 字段上传（不再发 work_id）', async () => {
    const sent: { form: FormData | null } = { form: null }
    const XhrStub = class {
      upload = {} as { onprogress?: unknown }
      status = 200
      responseText = JSON.stringify({ upload_id: 'up1', sha256: 'sha256hex', bytes: 128, kid: 'kid1', play_subdomain: '0123456789abcdef' })
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      open(_method: string, _url: string) {}
      setRequestHeader(_name: string, _value: string) {}
      getResponseHeader(_name: string) { return null }
      send(form: FormData) {
        sent.form = form
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', XhrStub)
    const client = createContentClient(opts)
    const file = { name: 'a.zip', size: 10, type: 'application/zip' } as File
    const result = await client.upload({ kind: 'bundle', slug: 'my-game', version: 'v1', file })
    expect(result.upload_id).toBe('up1')
    expect(result.kid).toBe('kid1')
    // 预览链路要用的游玩子域必须透传（后端上传响应下发）
    expect(result.play_subdomain).toBe('0123456789abcdef')
    expect(sent.form?.get('kind')).toBe('bundle')
    expect(sent.form?.get('slug')).toBe('my-game')
    expect(sent.form?.get('version')).toBe('v1')
    expect(sent.form?.get('work_id')).toBeNull()
    expect(sent.form?.has('file')).toBe(true)
  })
})

describe('预览 URL 构建', () => {
  test('upload 预览路径：bundle 与 bundle-key', () => {
    expect(uploadBundlePath('up-1')).toBe('/api/uploads/up-1/bundle')
    expect(uploadBundleKeyPath('up-1')).toBe('/api/uploads/up-1/bundle-key')
  })

  test('绝对基址（跨域部署）直接拼接', () => {
    expect(toAbsoluteApiUrl('https://api.example.com', uploadBundlePath('up-1')))
      .toBe('https://api.example.com/api/uploads/up-1/bundle')
    expect(toAbsoluteApiUrl('https://api.example.com/', uploadBundleKeyPath('up-1')))
      .toBe('https://api.example.com/api/uploads/up-1/bundle-key')
  })

  test('相对/空基址（同源反代）落当前页面 origin——SW 在游玩子域，相对路径会解析错', () => {
    vi.stubGlobal('location', { origin: 'https://crearte.example' })
    expect(toAbsoluteApiUrl('/', uploadBundlePath('up-1')))
      .toBe('https://crearte.example/api/uploads/up-1/bundle')
    expect(toAbsoluteApiUrl('', uploadBundleKeyPath('up-1')))
      .toBe('https://crearte.example/api/uploads/up-1/bundle-key')
  })
})

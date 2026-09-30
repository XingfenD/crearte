import { AdminApiError, NotFoundError, type ContentRepository } from './repository'
import { assertGameDetail, assertGamesIndex } from './staticRepo'
import type { AdminUser, AdminUserPage, AuditPage, Doc, DocMeta, Game, GameSummary } from './types'

interface CacheEntry { etag: string; body: unknown }

// 后端内容 API 读侧：ETag 条件请求 + in-flight 去重（缓存语义与 staticRepo 一致）。
// 与 staticRepo 的差异：不做永久 promise 缓存——每次调用都再验证（304 时零 body 传输），
// 保证审批发布后目录在 max-age 60s 内自然刷新。docs 委托静态源（内容管线不含文档）。
export class ApiContentRepository implements ContentRepository {
  private readonly etagCache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(
    private readonly base: string,
    private readonly docsSource: Pick<ContentRepository, 'listDocs' | 'getDoc'>,
    // 管理面三端点需 Bearer（读侧 /api/games 公开，无 token 照旧）。可选参数：
    // 既有测试/调用方零改动；缺 token 时 admin 请求不带 Authorization（后端 401）
    private readonly getToken: () => string | null = () => null
  ) {}

  private fetchJson(path: string): Promise<unknown> {
    const url = `${this.base}${path}`
    let pending = this.inflight.get(url)
    if (!pending) {
      pending = this.request(url)
      this.inflight.set(url, pending)
      const done = (): void => { this.inflight.delete(url) }
      pending.then(done, done)
    }
    return pending
  }

  // 管理面 GET：走 fetchJson 同一条 URL（保持 in-flight 去重），但跳过 ETag 记录
  // （admin 响应带 Cache-Control: no-store，request() 已据此不缓存；此处显式命名调用意图）
  private fetchAdmin(path: string): Promise<unknown> {
    return this.fetchJson(path)
  }

  private async request(url: string, init: RequestInit = {}): Promise<unknown> {
    // 管理面（spec §4.1）：两 GET 不参与 ETag 缓存——数据随任意管理员动作即时变。
    // 后端带 Cache-Control: no-store 双重保险，但即使响应带 ETag 也拒入缓存。
    const isAdmin = url.includes('/api/admin/')
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const cached = this.etagCache.get(url)
    if (cached) headers['If-None-Match'] = cached.etag
    let response: Response
    try {
      response = await fetch(url, { ...init, headers })
    } catch {
      throw new Error(`网络请求失败: ${url}`)
    }
    if (response.status === 304) {
      if (cached) return cached.body
      throw new Error(`数据格式错误: 304 但无本地缓存 ${url}`)
    }
    if (!response.ok) {
      // 管理面错误：解析 {error:{code,message}}，抛 AdminApiError 保留 status/code/原文（400/404/409 可区分）。
      // 读侧 404 维持 NotFoundError（staticRepo 回落契约依赖它，见 mergeRepo）。
      // 命名类型而非 `typeof body` 自引用：后者会被 TS 收窄成字面量 null，读属性直接报错
      type AdminErrorBody = { error?: { code?: unknown; message?: unknown } } | null
      let body: AdminErrorBody = null
      if (isAdmin) {
        try { body = (await response.json()) as AdminErrorBody } catch { /* 非 JSON 错误体按 unknown code */ }
      }
      if (isAdmin) {
        const code = typeof body?.error?.code === 'string' ? body.error.code : `http_${response.status}`
        const message = typeof body?.error?.message === 'string' ? body.error.message : `请求失败 ${response.status}: ${url}`
        throw new AdminApiError(response.status, code, message)
      }
      if (response.status === 404) throw new NotFoundError(url)
      throw new Error(`请求失败 ${response.status}: ${url}`)
    }
    const body: unknown = await response.json()
    const etag = response.headers.get('ETag')
    if (etag && !isAdmin && !(response.headers.get('Cache-Control') ?? '').includes('no-store')) {
      this.etagCache.set(url, { etag, body })
    }
    return body
  }

  listGames(): Promise<GameSummary[]> {
    return this.fetchJson('/api/games').then((body) => assertGamesIndex(body).games)
  }

  getGame(id: string): Promise<Game> {
    const [user, slug] = id.split('/')
    return this.fetchJson(`/api/games/${user}/${slug}`).then((body) => {
      assertGameDetail(body, `games/${id}`)
      return body
    })
  }

  // ---- P7 管理面（spec §4.1）：两 GET 不参与 ETag 缓存（no-store 语义，数据随任意
  // 管理员动作即时变）；响应形状直接透传服务端 JSON，不跑静态 schema 断言（服务端是事实源）。

  listAdminUsers(params: { q?: string; limit?: number; offset?: number } = {}): Promise<AdminUserPage> {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    query.set('limit', String(params.limit ?? 50))
    query.set('offset', String(params.offset ?? 0))
    return this.fetchAdmin(`/api/admin/users?${query.toString()}`).then((body) => {
      const page = body as Partial<AdminUserPage> | null
      return { users: page?.users ?? [], total: page?.total ?? 0 }
    })
  }

  setUserRole(id: string, role: AdminUser['role']): Promise<AdminUser> {
    return this.request(
      `${this.base}/api/admin/users/${encodeURIComponent(id)}/role`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }
    ) as Promise<AdminUser>
  }

  listAudit(params: { route?: string; limit?: number; offset?: number } = {}): Promise<AuditPage> {
    const query = new URLSearchParams()
    if (params.route) query.set('route', params.route)
    query.set('limit', String(params.limit ?? 50))
    query.set('offset', String(params.offset ?? 0))
    return this.fetchAdmin(`/api/admin/audit?${query.toString()}`).then((body) => {
      const page = body as Partial<AuditPage> | null
      return { entries: page?.entries ?? [], total: page?.total ?? 0 }
    })
  }

  listDocs(): Promise<DocMeta[]> {
    return this.docsSource.listDocs()
  }

  getDoc(slug: string): Promise<Doc> {
    return this.docsSource.getDoc(slug)
  }
}

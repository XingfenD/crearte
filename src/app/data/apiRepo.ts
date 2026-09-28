import { NotFoundError, type ContentRepository } from './repository'
import { assertGameDetail, assertGamesIndex } from './staticRepo'
import type { Doc, DocMeta, Game, GameSummary } from './types'

interface CacheEntry { etag: string; body: unknown }

// 后端内容 API 读侧：ETag 条件请求 + in-flight 去重（缓存语义与 staticRepo 一致）。
// 与 staticRepo 的差异：不做永久 promise 缓存——每次调用都再验证（304 时零 body 传输），
// 保证审批发布后目录在 max-age 60s 内自然刷新。docs 委托静态源（内容管线不含文档）。
export class ApiContentRepository implements ContentRepository {
  private readonly etagCache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(
    private readonly base: string,
    private readonly docsSource: Pick<ContentRepository, 'listDocs' | 'getDoc'>
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

  private async request(url: string): Promise<unknown> {
    const headers: Record<string, string> = {}
    const cached = this.etagCache.get(url)
    if (cached) headers['If-None-Match'] = cached.etag
    let response: Response
    try {
      response = await fetch(url, { headers })
    } catch {
      throw new Error(`网络请求失败: ${url}`)
    }
    if (response.status === 304) {
      if (cached) return cached.body
      throw new Error(`数据格式错误: 304 但无本地缓存 ${url}`)
    }
    if (response.status === 404) throw new NotFoundError(url)
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
    const body: unknown = await response.json()
    const etag = response.headers.get('ETag')
    if (etag && !(response.headers.get('Cache-Control') ?? '').includes('no-store')) {
      this.etagCache.set(url, { etag, body })
    }
    return body
  }

  listGames(): Promise<GameSummary[]> {
    return this.fetchJson('/api/games').then((body) => assertGamesIndex(body).games)
  }

  // id 为复合形式 user/slug（slug 不含 `/`，拆分精确）→ /api/games/:user/:slug；斜杠不转义
  getGame(id: string): Promise<Game> {
    const [user, slug] = id.split('/')
    return this.fetchJson(`/api/games/${user}/${slug}`).then((body) => {
      assertGameDetail(body, `games/${id}`)
      return body
    })
  }

  listDocs(): Promise<DocMeta[]> {
    return this.docsSource.listDocs()
  }

  getDoc(slug: string): Promise<Doc> {
    return this.docsSource.getDoc(slug)
  }
}

import { NotFoundError, type ContentRepository } from './repository'
import type { Doc, DocMeta, Game, GameSummary } from './types'

// 双源合并：静态 JSON（PR 贡献通道）∪ 后端 API（审核发布通道）。
// 合并规则（spec §3/§4）：同 id API 胜出；API 目录失败降级纯静态（运营约定
// 「import 后删静态」保证降级不会复活已下架作品）；详情仅 404 回落静态，
// 5xx/网络错直接上抛（不把故障伪装成 NotFound）。
export class MergeContentRepository implements ContentRepository {
  constructor(
    private readonly api: ContentRepository,
    private readonly staticRepo: ContentRepository
  ) {}

  async listGames(): Promise<GameSummary[]> {
    const [apiResult, staticResult] = await Promise.allSettled([
      this.api.listGames(),
      this.staticRepo.listGames()
    ])
    if (apiResult.status === 'rejected' && staticResult.status === 'rejected') {
      throw apiResult.reason instanceof Error ? apiResult.reason : new Error(String(apiResult.reason))
    }
    let staticGames: GameSummary[] = []
    if (staticResult.status === 'fulfilled') {
      staticGames = staticResult.value.map((g) => ({ ...g, source: 'static' as const }))
    } else {
      console.warn('[data] 静态目录不可用，仅展示 API 源', staticResult.reason)
    }
    if (apiResult.status === 'rejected') {
      console.warn('[data] API 目录不可用，降级静态源', apiResult.reason)
      return staticGames
    }
    const merged = new Map<string, GameSummary>()
    for (const g of staticGames) merged.set(g.id, g)
    for (const g of apiResult.value) merged.set(g.id, { ...g, source: 'api' })
    return [...merged.values()]
  }

  async getGame(id: string): Promise<Game> {
    try {
      return { ...(await this.api.getGame(id)), source: 'api' }
    } catch (error) {
      if (error instanceof NotFoundError) {
        return { ...(await this.staticRepo.getGame(id)), source: 'static' }
      }
      throw error
    }
  }

  listDocs(): Promise<DocMeta[]> {
    return this.staticRepo.listDocs()
  }

  getDoc(slug: string): Promise<Doc> {
    return this.staticRepo.getDoc(slug)
  }
}

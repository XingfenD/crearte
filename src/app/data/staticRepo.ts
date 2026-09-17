import { NotFoundError, type ContentRepository } from './repository'
import type { Doc, DocMeta, DocsIndex, Game, GameSummary, GamesIndex } from './types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`数据格式错误: ${message}`)
}

function assertGameSummary(value: unknown, path: string): asserts value is GameSummary {
  const g = value as GameSummary
  assert(g && typeof g.id === 'string' && typeof g.name === 'string' && typeof g.url === 'string', `${path} 缺少 id/name/url`)
  assert(Array.isArray(g.tags), `${path}.tags 必须是数组`)
  assert(g.author && typeof g.author.name === 'string', `${path}.author.name 缺失`)
  assert(g.durationMinutes && typeof g.durationMinutes.min === 'number' && typeof g.durationMinutes.max === 'number', `${path}.durationMinutes 非法`)
}

function assertGamesIndex(value: unknown): GamesIndex {
  const data = value as GamesIndex
  assert(data && Array.isArray(data.games), 'index.json 缺少 games 数组')
  data.games.forEach((game, i) => assertGameSummary(game, `games[${i}]`))
  return data
}

function assertDocsIndex(value: unknown): DocsIndex {
  const data = value as DocsIndex
  assert(data && Array.isArray(data.docs), 'docs.json 缺少 docs 数组')
  data.docs.forEach((doc, i) => {
    assert(doc && typeof doc.slug === 'string' && typeof doc.title === 'string' && typeof doc.content === 'string', `docs[${i}] 非法`)
  })
  return data
}

export class StaticContentRepository implements ContentRepository {
  private cachedGames?: Promise<GameSummary[]>
  private cachedDocs?: Promise<Doc[]>
  private readonly cachedGamesById = new Map<string, Promise<Game>>()

  constructor(private readonly base: string = import.meta.env.VITE_DATA_BASE_URL ?? '/data') {}

  private async fetchJson(path: string): Promise<unknown> {
    const response = await fetch(`${this.base}${path}`)
    if (response.status === 404) throw new NotFoundError(path)
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${path}`)
    return response.json()
  }

  listGames(): Promise<GameSummary[]> {
    this.cachedGames ??= this.fetchJson('/index.json')
      .then(assertGamesIndex)
      .then((data) => data.games)
      .catch((error) => {
        this.cachedGames = undefined
        throw error
      })
    return this.cachedGames
  }

  getGame(id: string): Promise<Game> {
    let pending = this.cachedGamesById.get(id)
    if (!pending) {
      pending = this.fetchJson(`/games/${encodeURIComponent(id)}.json`)
        .then((data) => {
          assertGameSummary(data, `games/${id}`)
          return data as Game
        })
        .catch((error) => {
          this.cachedGamesById.delete(id)
          throw error
        })
      this.cachedGamesById.set(id, pending)
    }
    return pending
  }

  private loadDocs(): Promise<Doc[]> {
    this.cachedDocs ??= this.fetchJson('/docs.json')
      .then(assertDocsIndex)
      .then((data) => data.docs)
      .catch((error) => {
        this.cachedDocs = undefined
        throw error
      })
    return this.cachedDocs
  }

  listDocs(): Promise<DocMeta[]> {
    return this.loadDocs().then((docs) =>
      docs.map(({ slug, title, order }) => ({ slug, title, order }))
    )
  }

  async getDoc(slug: string): Promise<Doc> {
    const docs = await this.loadDocs()
    const doc = docs.find((d) => d.slug === slug)
    if (!doc) throw new NotFoundError(slug)
    return doc
  }
}

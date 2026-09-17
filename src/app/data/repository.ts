import type { Doc, DocMeta, Game, GameSummary } from './types'

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`Not found: ${what}`)
    this.name = 'NotFoundError'
  }
}

export interface ContentRepository {
  listGames(): Promise<GameSummary[]>
  getGame(id: string): Promise<Game>
  listDocs(): Promise<DocMeta[]>
  getDoc(slug: string): Promise<Doc>
}

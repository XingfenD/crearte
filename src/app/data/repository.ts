import type { Doc, DocMeta, Game, GameSummary } from './types'

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`Not found: ${what}`)
    this.name = 'NotFoundError'
  }
}

// 管理面错误：status + 后端 code（last_admin / validation / not_found …）可区分，
// message 保留后端原文——toContentMessage 的通用 Error 分支原样透出，UI 据此回显 409 等原文。
// code 是开放集（后端新增码不需改前端类型），故为 string 而非联合类型。
export class AdminApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

export interface ContentRepository {
  listGames(): Promise<GameSummary[]>
  getGame(id: string): Promise<Game>
  listDocs(): Promise<DocMeta[]>
  getDoc(slug: string): Promise<Doc>
}

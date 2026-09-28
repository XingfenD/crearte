export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

// 与后端 namespace 契约一致（service/namespace.go）：复合 id = user/slug。
// 前端不重复校验 id 本身（schema/后端为权威），仅用于显式字段校验与寻址解析。
export const GAME_USER_PATTERN = /^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$/
export const GAME_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export interface Author {
  name: string
  url?: string
}

export type GameRuntimeMode = 'external' | 'virtual' | 'hosted'

export interface FeatureFlags {
  eval?: boolean
  inlineScript?: boolean
  inlineStyle?: boolean
  wasm?: boolean
  coop?: boolean
  fullscreen?: boolean
  gamepad?: boolean
}

export interface BundleEnc {
  v: number
  alg: string
  kid: string
}

export interface GameBundle {
  url: string
  bytes: number
  sha256: string
  /** 存在即信封加密（CRB1 密文）；缺失按明文（dev/legacy 兼容，加密 spec §7.3） */
  enc?: BundleEnc
}

export interface GameSummary {
  /** 作品唯一标识：v2 契约为复合 id（user/slug）；静态遗留数据可能是纯 id（= slug），用 resolveUserSlug 解析 */
  id: string
  /** 归属用户名（后端 v2 契约始终返回；静态遗留数据可缺失，缺失时按 id 回退解析） */
  user?: string
  /** 作品 slug（后端 v2 契约始终返回；静态遗留数据可缺失，缺失时按 id 回退解析） */
  slug?: string
  name: string
  url: string
  author: Author
  description: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  cover?: string
  addedAt: string
  runtime?: GameRuntimeMode
  /** 前端合并标注（非服务端契约）：目录数据来自 API 源还是静态源；纯静态模式下为 undefined */
  source?: 'api' | 'static'
}

export interface Game extends GameSummary {
  intro?: string
  version?: string
  entry?: string
  /** 后端派生的运行时子域（16 hex，详情响应 omitempty）；运行时托管寻址用 */
  playSubdomain?: string
  playOrigin?: string
  hostedUrl?: string
  bundle?: GameBundle
  features?: FeatureFlags
  display?: { aspect?: '16:9' | '4:3' | 'fill' }
  fallback?: 'external' | 'hosted' | 'none'
}

/**
 * 解析作品的 user/slug 寻址段（路由 /games/:user/:slug 与复合 id 的换算基础，卡片链接用它取段）。
 * 优先显式 user/slug 字段（后端 v2 契约始终返回）；静态遗留数据缺失时回退拆 id：
 * 含 `/` 的复合 id 取首个 `/` 拆两段；纯 id 视为 slug（user 为空串，视图层不再拼 user 段）。
 */
export function resolveUserSlug(game: Pick<GameSummary, 'id' | 'user' | 'slug'>): { user: string; slug: string } {
  if (typeof game.user === 'string' && typeof game.slug === 'string') {
    return { user: game.user, slug: game.slug }
  }
  const separator = game.id.indexOf('/')
  if (separator === -1) return { user: '', slug: game.id }
  return { user: game.id.slice(0, separator), slug: game.id.slice(separator + 1) }
}

export interface DocMeta {
  slug: string
  title: string
  order: number
}

export interface Doc extends DocMeta {
  content: string
}

export interface GamesIndex {
  schemaVersion: number
  generatedAt: string
  games: GameSummary[]
}

export interface DocsIndex {
  generatedAt: string
  docs: Doc[]
}

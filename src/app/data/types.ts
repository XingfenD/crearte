export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

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
  id: string
  user?: string
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
  playSubdomain?: string
  playOrigin?: string
  hostedUrl?: string
  bundle?: GameBundle
  features?: FeatureFlags
  display?: { aspect?: '16:9' | '4:3' | 'fill' }
  fallback?: 'external' | 'hosted' | 'none'
}

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

export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

export const GAME_USER_PATTERN = /^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$/
export const GAME_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export interface Author {
  name?: string
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
  url?: string
  author?: Author
  description?: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  cover?: string
  addedAt: string
  /** P5 反应聚合（服务端输出，静态源可缺省）：均分，ratingCount==0 时服务端不下发 */
  ratingAvg?: number
  /** 评分人数 */
  ratingCount?: number
  /** 收藏数 */
  favoriteCount?: number
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

/** P7 管理面角色值（与 auth types 的 UserRole 同域；此处独立声明避免 data→auth 依赖） */
export type AdminUserRole = 'user' | 'admin'

/** GET /api/admin/users 行（spec §3.4：email 对 admin 完整暴露，不脱敏） */
export interface AdminUser {
  id: string
  email: string
  username: string
  display_name: string
  role: AdminUserRole
  created_at: string
}

export interface AdminUserPage {
  users: AdminUser[]
  total: number
}

/** GET /api/admin/audit 行：动作名 = method + route 模板，对象从 path 读（spec §3.1 语义要点） */
export interface AuditEntry {
  id: string
  actor_id: string
  actor_email: string
  method: string
  route: string
  path: string
  status: number
  created_at: string
}

export interface AuditPage {
  entries: AuditEntry[]
  total: number
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

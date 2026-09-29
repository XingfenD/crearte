import { session } from '@/auth'

// P5 反应写侧/我的反应封装。base 与 data/index.ts、auth/index.ts 同一语义：
// 判空用 trim 后的原值（'/' 是同源反代，不是「无后端」），拼 URL 前再去尾斜杠。
const rawBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
export const reactionsEnabled = rawBase !== ''
const base = rawBase.replace(/\/+$/, '')

/** 未登录（无本地 token 或服务端 401）——调用方据此提示或跳登录 */
export class AuthRequiredError extends Error {
  constructor() {
    super('请先登录')
    this.name = 'AuthRequiredError'
  }
}

/** 服务端 dto.ReactionView（crearte-server c98e0b5 契约，JSON 逐字） */
export interface ReactionView {
  favoriteCount: number
  ratingCount: number
  ratingAvg?: number
  favorited: boolean
  rated: boolean
  score?: number
}

/** GET /api/me/reactions → MeReactionsResponse；键是作品 id（user/slug） */
export interface MeReactions {
  favorites: string[]
  ratings: Record<string, number>
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  if (!reactionsEnabled) throw new Error('未配置后端')
  const token = session.getToken()
  if (!token) throw new AuthRequiredError()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (init.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${path}`, { ...init, headers })
  if (res.status === 401) throw new AuthRequiredError()
  if (!res.ok) throw new Error(`请求失败 ${res.status}`)
  return res.json()
}

export function setFavorite(user: string, slug: string, on: boolean): Promise<ReactionView> {
  return call(`/api/games/${user}/${slug}/favorite`, { method: on ? 'PUT' : 'DELETE' }) as Promise<ReactionView>
}

export function setRating(user: string, slug: string, score: number): Promise<ReactionView> {
  return call(`/api/games/${user}/${slug}/rating`, { method: 'PUT', body: JSON.stringify({ score }) }) as Promise<ReactionView>
}

export function unrate(user: string, slug: string): Promise<ReactionView> {
  return call(`/api/games/${user}/${slug}/rating`, { method: 'DELETE' }) as Promise<ReactionView>
}

export async function fetchMine(): Promise<MeReactions> {
  const body = (await call('/api/me/reactions', { method: 'GET' })) as Partial<MeReactions> | null
  return { favorites: body?.favorites ?? [], ratings: body?.ratings ?? {} }
}

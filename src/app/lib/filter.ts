import { GAME_TYPES, type GameSummary, type GameType } from '@/data/types'

export type SortKey = 'new' | 'name' | 'duration' | 'hot'
export type DurationBucket = 'short' | 'mid' | 'long'

export interface FilterState {
  q: string
  type: GameType | 'all'
  tags: string[]
  dur: DurationBucket | 'all'
  sort: SortKey
}

export const DEFAULT_FILTER: FilterState = { q: '', type: 'all', tags: [], dur: 'all', sort: 'new' }

export function parseFilterState(query: Record<string, unknown>): FilterState {
  const asString = (v: unknown) => (typeof v === 'string' ? v : '')
  const type = asString(query.type)
  const dur = asString(query.dur)
  const sort = asString(query.sort)
  const tag = asString(query.tag)
  return {
    q: asString(query.q).trim(),
    type: (GAME_TYPES as readonly string[]).includes(type) ? (type as GameType) : 'all',
    tags: tag ? tag.split(',').filter(Boolean) : [],
    dur: ['short', 'mid', 'long'].includes(dur) ? (dur as DurationBucket) : 'all',
    sort: ['new', 'name', 'duration', 'hot'].includes(sort) ? (sort as SortKey) : 'new'
  }
}

export function toQuery(state: FilterState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.q) query.q = state.q
  if (state.type !== 'all') query.type = state.type
  if (state.tags.length) query.tag = state.tags.join(',')
  if (state.dur !== 'all') query.dur = state.dur
  if (state.sort !== 'new') query.sort = state.sort
  return query
}

export function durationBucket(game: GameSummary): DurationBucket {
  const max = game.durationMinutes.max
  if (max <= 5) return 'short'
  if (max <= 30) return 'mid'
  return 'long'
}

/** 热门分：贝叶斯均分（先验 C·m 压平单人满分）+ 收藏对数权重；纯函数，调用方提供先验参数 */
export function hotScore(game: GameSummary, priorC: number, priorMean: number): number {
  const n = game.ratingCount ?? 0
  const sum = (game.ratingAvg ?? 0) * n
  return (priorC * priorMean + sum) / (priorC + n) + 0.5 * Math.log(1 + (game.favoriteCount ?? 0))
}

export function filterGames(games: GameSummary[], state: FilterState): GameSummary[] {
  const q = state.q.trim().toLowerCase()
  const result = games.filter((game) => {
    if (state.type !== 'all' && game.type !== state.type) return false
    if (state.tags.length && !state.tags.every((tag) => game.tags.includes(tag))) return false
    if (state.dur !== 'all' && durationBucket(game) !== state.dur) return false
    if (q) {
      const haystack = [game.name, game.description, game.author?.name, ...game.tags].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  const sorted = [...result]
  if (state.sort === 'new') sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id))
  else if (state.sort === 'hot') {
    // 先验基于过滤后集合：m = 全局均分，无评分数据时 m = 4
    let nAll = 0
    let sumAll = 0
    for (const g of result) {
      const n = g.ratingCount ?? 0
      nAll += n
      sumAll += (g.ratingAvg ?? 0) * n
    }
    const priorMean = nAll > 0 ? sumAll / nAll : 4
    const scores = new Map(result.map((g) => [g.id, hotScore(g, 5, priorMean)]))
    sorted.sort((a, b) => {
      const diff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
      if (Math.abs(diff) > 1e-9) return diff
      return b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id)
    })
  } else if (state.sort === 'duration') {
    sorted.sort((a, b) =>
      a.durationMinutes.min - b.durationMinutes.min ||
      a.durationMinutes.max - b.durationMinutes.max ||
      a.id.localeCompare(b.id)
    )
  } else sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh') || a.id.localeCompare(b.id))
  return sorted
}

export function countByType(games: GameSummary[]): Record<GameType, number> {
  const counts = Object.fromEntries(GAME_TYPES.map((type) => [type, 0])) as Record<GameType, number>
  for (const game of games) counts[game.type] += 1
  return counts
}

export function countByDuration(games: GameSummary[]): Record<DurationBucket, number> {
  const counts: Record<DurationBucket, number> = { short: 0, mid: 0, long: 0 }
  for (const game of games) counts[durationBucket(game)] += 1
  return counts
}

export function countByTag(games: GameSummary[], limit = 16): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const game of games) for (const tag of game.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
}

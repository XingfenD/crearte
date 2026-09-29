import { describe, expect, it } from 'vitest'
import { GAME_TYPES, type GameSummary } from '@/data/types'
import {
  countByDuration,
  countByTag,
  countByType,
  DEFAULT_FILTER,
  durationBucket,
  filterGames,
  hotScore,
  parseFilterState,
  toQuery
} from './filter'

function game(partial: Partial<GameSummary> & Pick<GameSummary, 'id'>): GameSummary {
  return {
    name: partial.id,
    url: 'https://example.com/',
    author: { name: '作者' },
    description: '描述',
    durationMinutes: { min: 5, max: 20 },
    type: 'puzzle',
    tags: [],
    addedAt: '2026-01-01',
    ...partial
  }
}

const games: GameSummary[] = [
  game({ id: 'alpha', name: 'Alpha', tags: ['数字', '休闲'], addedAt: '2026-01-02', durationMinutes: { min: 5, max: 10 } }),
  game({ id: 'beta', name: 'Beta', description: '探索黑暗世界', tags: ['文字'], type: 'idle', addedAt: '2026-03-01', durationMinutes: { min: 30, max: 300 } }),
  game({ id: 'gamma', name: 'Gamma', author: { name: '某人' }, tags: ['数字'], type: 'action', addedAt: '2026-02-01', durationMinutes: { min: 1, max: 4 } })
]

describe('parseFilterState', () => {
  it('解析合法 query，非法值回退默认', () => {
    expect(parseFilterState({ q: ' 2048 ', type: 'idle', tag: '文字,数字', dur: 'long', sort: 'name' }))
      .toEqual({ q: '2048', type: 'idle', tags: ['文字', '数字'], dur: 'long', sort: 'name' })
    expect(parseFilterState({ type: 'nope', dur: 'x', sort: 'y' })).toEqual(DEFAULT_FILTER)
    expect(parseFilterState({})).toEqual(DEFAULT_FILTER)
  })
})

describe('toQuery', () => {
  it('省略默认值，tags 用逗号连接', () => {
    expect(toQuery(DEFAULT_FILTER)).toEqual({})
    expect(toQuery({ ...DEFAULT_FILTER, q: 'x', type: 'idle', tags: ['a', 'b'], dur: 'short', sort: 'name' }))
      .toEqual({ q: 'x', type: 'idle', tag: 'a,b', dur: 'short', sort: 'name' })
  })

  it('round-trip：toQuery -> parseFilterState 保持一致', () => {
    const state = { ...DEFAULT_FILTER, q: '2048', tags: ['数字'], dur: 'mid' as const }
    expect(parseFilterState(toQuery(state))).toEqual(state)
  })
})

describe('durationBucket', () => {
  it('按 max 分桶：short ≤5，mid ≤30，long >30', () => {
    expect(durationBucket(game({ id: 'a', durationMinutes: { min: 1, max: 5 } }))).toBe('short')
    expect(durationBucket(game({ id: 'b', durationMinutes: { min: 10, max: 30 } }))).toBe('mid')
    expect(durationBucket(game({ id: 'c', durationMinutes: { min: 30, max: 31 } }))).toBe('long')
  })
})

describe('filterGames', () => {
  it('搜索匹配 name/description/author/tags，忽略大小写', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, q: 'alpha' }).map((g) => g.id)).toEqual(['alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '黑暗' }).map((g) => g.id)).toEqual(['beta'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '作者' }).map((g) => g.id)).toEqual(['beta', 'alpha'])
  })

  it('类型与标签为 AND 语义，标签多选须全部命中', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, type: 'puzzle' }).map((g) => g.id)).toEqual(['alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, tags: ['数字'] }).map((g) => g.id)).toEqual(['gamma', 'alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, tags: ['数字', '休闲'] }).map((g) => g.id)).toEqual(['alpha'])
  })

  it('时长桶与排序（new 倒序、duration 按 min 升序、name 字母序）', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, dur: 'short' }).map((g) => g.id)).toEqual(['gamma'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'new' }).map((g) => g.id)).toEqual(['beta', 'gamma', 'alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'duration' }).map((g) => g.id)).toEqual(['gamma', 'alpha', 'beta'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'name' }).map((g) => g.id)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('组合筛选', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '数字', type: 'action' }).map((g) => g.id)).toEqual(['gamma'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '不存在' })).toEqual([])
  })
})

describe('sort hot', () => {
  // 简报 3.2 演算用例：g1(n=1,sum=5,fav=0) vs g2(n=100,sum=430,fav=0)。
  // 简报打印的 g1 分 (5·4.307+5)/(105)=0.2527 与 "g2 先" 系分母笔误（105 是 g2 的 5+100）；
  // 按简报 3.3 权威公式 (priorC·m+sum)/(priorC+n)：g1 分母 = 5+1 = 6。
  it('hotScore：先验 m=435/101 压平单人满分（5.0→4.4224），g2 4.3003', () => {
    const g1 = game({ id: 'g1', ratingAvg: 5, ratingCount: 1, favoriteCount: 0 })
    const g2 = game({ id: 'g2', ratingAvg: 4.3, ratingCount: 100, favoriteCount: 0 })
    const m = 435 / 101
    expect(m).toBeCloseTo(4.307, 3)
    expect(hotScore(g1, 5, m)).toBeCloseTo(4.4224, 4)
    expect(hotScore(g2, 5, m)).toBeCloseTo(4.3003, 4)
    expect(hotScore(g1, 5, m)).toBeLessThan(5)
  })

  it('压平用例：单人 5 星（n=1,fav=0）输给 n=3 sum=12 + fav=1 的作品', () => {
    const solo = game({ id: 'solo', ratingAvg: 5, ratingCount: 1, favoriteCount: 0, addedAt: '2026-05-01' })
    const trio = game({ id: 'trio', ratingAvg: 4, ratingCount: 3, favoriteCount: 1, addedAt: '2026-01-01' })
    expect(filterGames([solo, trio], { ...DEFAULT_FILTER, sort: 'hot' }).map((g) => g.id)).toEqual(['trio', 'solo'])
  })

  it('收藏对数权重：同均分同 n 时 fav=10 先于 fav=1（0.5·ln(1+fav)）', () => {
    const a = game({ id: 'a', ratingAvg: 4, ratingCount: 5, favoriteCount: 10, addedAt: '2026-02-01' })
    const b = game({ id: 'b', ratingAvg: 4, ratingCount: 5, favoriteCount: 1, addedAt: '2026-03-01' })
    expect(hotScore(a, 5, 4)).toBeCloseTo(4 + 0.5 * Math.log(11), 4)
    expect(hotScore(b, 5, 4)).toBeCloseTo(4 + 0.5 * Math.log(2), 4)
    expect(filterGames([a, b], { ...DEFAULT_FILTER, sort: 'hot' }).map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('静态缺省：三字段 undefined 全获同分 m=4 → 退化为 addedAt 倒序（同 new）', () => {
    expect(hotScore(games[0], 5, 4)).toBeCloseTo(4, 12)
    const ids = filterGames(games, { ...DEFAULT_FILTER, sort: 'hot' }).map((g) => g.id)
    expect(ids).toEqual(['beta', 'gamma', 'alpha'])
    expect(ids).toEqual(filterGames(games, { ...DEFAULT_FILTER, sort: 'new' }).map((g) => g.id))
  })

  it('tie-break：|Δ|≤1e-9 回退 addedAt 倒序 → id 正序', () => {
    const p = game({ id: 'p', ratingAvg: 4, ratingCount: 2, addedAt: '2026-02-01' })
    const q = game({ id: 'q', ratingAvg: 4, ratingCount: 2, addedAt: '2026-01-01' })
    expect(filterGames([q, p], { ...DEFAULT_FILTER, sort: 'hot' }).map((g) => g.id)).toEqual(['p', 'q'])
    const r = game({ id: 'r', ratingAvg: 4, ratingCount: 2, addedAt: '2026-02-01' })
    const s = game({ id: 's', ratingAvg: 4, ratingCount: 2, addedAt: '2026-02-01' })
    expect(filterGames([s, r], { ...DEFAULT_FILTER, sort: 'hot' }).map((g) => g.id)).toEqual(['r', 's'])
  })

  it('URL 往返：sort=hot 进 query，非 hot 省略，未知值回退 new', () => {
    expect(toQuery({ ...DEFAULT_FILTER, sort: 'hot' })).toEqual({ sort: 'hot' })
    expect(toQuery(DEFAULT_FILTER)).not.toHaveProperty('sort')
    expect(parseFilterState({ sort: 'hot' })).toEqual({ ...DEFAULT_FILTER, sort: 'hot' })
    expect(parseFilterState(toQuery({ ...DEFAULT_FILTER, sort: 'hot' }))).toEqual({ ...DEFAULT_FILTER, sort: 'hot' })
    expect(parseFilterState({ sort: 'nope' })).toEqual(DEFAULT_FILTER)
  })
})

describe('countByType / countByDuration / countByTag', () => {
  it('countByType 覆盖全部类型且 0 计数保留', () => {
    const counts = countByType(games)
    expect(Object.keys(counts)).toHaveLength(GAME_TYPES.length)
    expect(counts.puzzle).toBe(1)
    expect(counts.idle).toBe(1)
    expect(counts.action).toBe(1)
    expect(counts.music).toBe(0)
  })

  it('countByDuration 按 max 分桶统计', () => {
    expect(countByDuration(games)).toEqual({ short: 1, mid: 1, long: 1 })
  })

  it('countByTag 按出现次数降序，默认取前 16', () => {
    const counts = countByTag(games)
    expect(counts[0]).toEqual(['数字', 2])
    expect(counts.map(([, n]) => n)).toEqual([2, 1, 1])
    const many = Array.from({ length: 20 }, (_, i) => game({ id: `g${i}`, tags: [`tag-${String(i).padStart(2, '0')}`] }))
    expect(countByTag(many)).toHaveLength(16)
  })
})

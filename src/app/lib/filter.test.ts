import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/data/types'
import { DEFAULT_FILTER, durationBucket, filterGames, parseFilterState, toQuery } from './filter'

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

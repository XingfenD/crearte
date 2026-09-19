import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/data/types'
import { pickFeatured } from './featured'

function game(id: string, type: GameSummary['type'], addedAt = '2026-01-01'): GameSummary {
  return {
    id,
    name: id,
    url: 'https://example.com/',
    author: { name: '作者' },
    description: '描述',
    durationMinutes: { min: 5, max: 20 },
    type,
    tags: [],
    addedAt
  }
}

function rawGame(id: string, type: string, addedAt: string): GameSummary {
  return { ...game(id, 'other', addedAt), type: type as GameSummary['type'] }
}

describe('pickFeatured', () => {
  it('空数组与 limit <= 0 都返回空数组', () => {
    expect(pickFeatured([])).toEqual([])
    expect(pickFeatured([game('a', 'puzzle')], 0)).toEqual([])
    expect(pickFeatured([game('a', 'puzzle')], -3)).toEqual([])
  })

  it('单一类型：addedAt 倒序，并列按 id 升序，并截断到 limit', () => {
    const sameDay = [game('b', 'puzzle'), game('a', 'puzzle'), game('old', 'puzzle', '2025-12-01')]
    expect(pickFeatured(sameDay, 2).map((g) => g.id)).toEqual(['a', 'b'])
    expect(pickFeatured(sameDay, 9).map((g) => g.id)).toEqual(['a', 'b', 'old'])
  })

  it('多类型：按 GAME_TYPES 顺序轮转取样', () => {
    const mixed = [
      game('p1', 'puzzle', '2026-03-01'),
      game('p2', 'puzzle', '2026-02-01'),
      game('i1', 'idle', '2026-01-01'),
      game('n1', 'narrative', '2026-01-01'),
      game('a1', 'action', '2026-01-01')
    ]
    expect(pickFeatured(mixed, 6).map((g) => g.id)).toEqual(['p1', 'a1', 'i1', 'n1', 'p2'])
    expect(pickFeatured(mixed, 2).map((g) => g.id)).toEqual(['p1', 'a1'])
  })

  it('结果不依赖入参顺序，且同一输入两次调用一致', () => {
    const mixed = [
      game('p1', 'puzzle', '2026-03-01'),
      game('p2', 'puzzle', '2026-02-01'),
      game('i1', 'idle', '2026-01-01'),
      game('n1', 'narrative', '2026-01-01')
    ]
    const expected = pickFeatured(mixed, 6).map((g) => g.id)
    expect(pickFeatured(mixed, 6).map((g) => g.id)).toEqual(expected)
    expect(pickFeatured([...mixed].reverse(), 6).map((g) => g.id)).toEqual(expected)
    expect(pickFeatured([mixed[2], mixed[0], mixed[3], mixed[1]], 6).map((g) => g.id)).toEqual(expected)
  })

  it('不修改入参', () => {
    const mixed = [game('p1', 'puzzle', '2026-03-01'), game('p2', 'puzzle', '2026-02-01')]
    const snapshot = JSON.stringify(mixed)
    pickFeatured(mixed, 1)
    expect(JSON.stringify(mixed)).toBe(snapshot)
  })

  it('未知 type 排在已知类型之后，按类型名字典序', () => {
    const weird = [rawGame('zz', 'zen', '2026-01-01'), rawGame('oo', 'other', '2026-01-01'), rawGame('aa', 'alpha', '2026-01-01')]
    expect(pickFeatured(weird, 6).map((g) => g.id)).toEqual(['oo', 'aa', 'zz'])
  })
})

// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import { assertGameSummary } from './staticRepo'

const minimal = {
  id: 'fixture/minimal',
  user: 'fixture',
  slug: 'minimal',
  name: '最小作品',
  durationMinutes: { min: 1, max: 2 },
  type: 'puzzle',
  tags: [],
  addedAt: '2026-09-29'
}

describe('assertGameSummary 可选字段', () => {
  test('缺 url/author/description 的最小摘要通过', () => {
    expect(() => assertGameSummary(minimal, 'games[0]')).not.toThrow()
  })
  test('缺 id/name/durationMinutes 照旧报错', () => {
    expect(() => assertGameSummary({ name: 'x' }, 'games[0]')).toThrow()
  })
})

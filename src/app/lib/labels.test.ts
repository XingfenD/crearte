import { describe, expect, it, test } from 'vitest'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS, authorDisplayName, durationText } from './labels'

describe('labels', () => {
  it('每个类型都有中文标签', () => {
    for (const type of GAME_TYPES) expect(GAME_TYPE_LABELS[type]).toBeTruthy()
  })

  it('durationText：区间与单值', () => {
    expect(durationText({ min: 5, max: 20 })).toBe('5–20 分钟')
    expect(durationText({ min: 5, max: 5 })).toBe('约 5 分钟')
  })
})

describe('authorDisplayName 回退链', () => {
  test('author.name 优先', () => {
    expect(authorDisplayName({ author: { name: 'A' }, user: 'u' })).toBe('A')
  })
  test('回退 username', () => {
    expect(authorDisplayName({ author: undefined, user: 'u' })).toBe('u')
    expect(authorDisplayName({ author: {}, user: 'u' })).toBe('u')
  })
  test('双缺省回退佚名', () => {
    expect(authorDisplayName({ author: undefined, user: undefined })).toBe('佚名')
  })
})

import { describe, expect, test } from 'vitest'
import { authorDisplayName } from './labels'

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

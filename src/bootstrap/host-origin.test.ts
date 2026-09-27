import { describe, expect, test } from 'vitest'
import { DEFAULT_HOST_ORIGIN, resolveHostOrigin } from './host-origin'

describe('resolveHostOrigin', () => {
  test('环境变量优先', () => {
    expect(resolveHostOrigin('http://localhost:8080', 'https://referrer.example/page')).toBe('http://localhost:8080')
  })

  test('环境变量缺失：取 referrer 的 origin（忽略路径/查询/哈希）', () => {
    expect(resolveHostOrigin(undefined, 'http://localhost:8080/games/ceshi?x=1#frag')).toBe('http://localhost:8080')
    expect(resolveHostOrigin('', 'https://games.example.com/')).toBe('https://games.example.com')
  })

  test('referrer 为空或不可解析：落内置默认值', () => {
    expect(resolveHostOrigin(undefined, '')).toBe(DEFAULT_HOST_ORIGIN)
    expect(resolveHostOrigin(undefined, 'not-a-url')).toBe(DEFAULT_HOST_ORIGIN)
  })
})

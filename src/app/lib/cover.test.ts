import { describe, expect, it } from 'vitest'
import { coverGradient, coverInitial, hashString } from './cover'

describe('cover fallback', () => {
  it('hashString 与 coverGradient 对同一 id 稳定，且色相在 0-359', () => {
    expect(hashString('2048')).toBe(hashString('2048'))
    const [from, to] = coverGradient('2048')
    for (const color of [from, to]) {
      const hue = Number(/hsl\((\d+)/.exec(color)?.[1])
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
    expect(coverGradient('2048')).toEqual(coverGradient('2048'))
  })

  it('不同 id 通常不同色（样例要不同）', () => {
    expect(coverGradient('2048')).not.toEqual(coverGradient('hextris'))
  })

  it('coverInitial 支持中文、emoji 与空串', () => {
    expect(coverInitial('  黑暗房间 ')).toBe('黑')
    expect(coverInitial('🎮游戏')).toBe('🎮')
    expect(coverInitial('')).toBe('?')
  })
})

import { describe, expect, it } from 'vitest'
import { COVER_COLORS, coverColor, coverInitial, hashString } from './cover'

describe('cover fallback', () => {
  it('coverColor 对同一 id 稳定，且取值属于 8 色表', () => {
    expect(COVER_COLORS).toHaveLength(8)
    expect(coverColor('2048')).toBe(coverColor('2048'))
    expect(COVER_COLORS).toContain(coverColor('2048'))
    expect(COVER_COLORS).toContain(coverColor('hextris'))
  })

  it('不同 id 在色表上有分布', () => {
    const ids = ['2048', 'hextris', 'a-dark-room', 'alpha', 'beta', 'gamma']
    expect(new Set(ids.map(coverColor)).size).toBeGreaterThan(1)
  })

  it('hashString 稳定', () => {
    expect(hashString('2048')).toBe(hashString('2048'))
    expect(hashString('2048')).toBeGreaterThanOrEqual(0)
  })

  it('coverInitial 支持中文、emoji 与空串', () => {
    expect(coverInitial('  黑暗房间 ')).toBe('黑')
    expect(coverInitial('🎮游戏')).toBe('🎮')
    expect(coverInitial('')).toBe('?')
  })
})

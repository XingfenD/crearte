import { describe, expect, it } from 'vitest'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS, durationText } from './labels'

describe('labels', () => {
  it('每个类型都有中文标签', () => {
    for (const type of GAME_TYPES) expect(GAME_TYPE_LABELS[type]).toBeTruthy()
  })

  it('durationText：区间与单值', () => {
    expect(durationText({ min: 5, max: 20 })).toBe('5–20 分钟')
    expect(durationText({ min: 5, max: 5 })).toBe('约 5 分钟')
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listRecent, recordPlay } from './recent'

const KEY = 'crearte.recent.v1'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lib/recent（D-I 最近玩过存储）', () => {
  it('空存储 → []', () => {
    expect(listRecent()).toEqual([])
  })

  it('recordPlay 前插：两次不同 id → 新者在前', () => {
    recordPlay('a')
    recordPlay('b')
    expect(listRecent()).toEqual(['b', 'a'])
  })

  it('重复 id 去重并冒泡到最前', () => {
    recordPlay('a')
    recordPlay('b')
    recordPlay('c')
    recordPlay('a')
    expect(listRecent()).toEqual(['a', 'c', 'b'])
  })

  it('写入条目含 id 与 at 时间戳', () => {
    recordPlay('a')
    const entries = JSON.parse(localStorage.getItem(KEY)!)
    expect(entries[0].id).toBe('a')
    expect(typeof entries[0].at).toBe('string')
    expect(Number.isNaN(Date.parse(entries[0].at))).toBe(false)
  })

  it('超过 12 次 → 截断为 12 条', () => {
    for (let i = 0; i < 13; i++) recordPlay(`g${i}`)
    const ids = listRecent()
    expect(ids).toHaveLength(12)
    expect(ids[0]).toBe('g12')
    expect(ids).not.toContain('g0')
  })

  it('空 id 不写入', () => {
    recordPlay('')
    expect(listRecent()).toEqual([])
  })

  it('损坏 JSON → []', () => {
    localStorage.setItem(KEY, 'not-json')
    expect(listRecent()).toEqual([])
  })

  it('非数组 JSON → []', () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'a' }))
    expect(listRecent()).toEqual([])
  })

  it('数组含非法元素 → 过滤后仅保留合法 id', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'a', at: 't' }, null, { at: 't' }, { id: 3 }]))
    expect(listRecent()).toEqual(['a'])
  })

  it('setItem 抛错 → recordPlay 不抛、listRecent 仍可用', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'seed', at: 't' }]))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => recordPlay('x')).not.toThrow()
    expect(listRecent()).toEqual(['seed'])
  })
})

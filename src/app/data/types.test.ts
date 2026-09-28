import { describe, expect, it } from 'vitest'
import { GAME_SLUG_PATTERN, GAME_USER_PATTERN, resolveUserSlug } from './types'

describe('resolveUserSlug', () => {
  it('优先显式 user/slug 字段（后端 v2 契约形态）', () => {
    expect(resolveUserSlug({ id: 'fendy/2048', user: 'fendy', slug: '2048' })).toEqual({ user: 'fendy', slug: '2048' })
  })

  it('字段缺失时按复合 id 拆分（首个 / 为界）', () => {
    expect(resolveUserSlug({ id: 'fendy/2048' })).toEqual({ user: 'fendy', slug: '2048' })
    expect(resolveUserSlug({ id: 'crearte/a-dark-room' })).toEqual({ user: 'crearte', slug: 'a-dark-room' })
  })

  it('纯 id 回退：slug = 整个 id，user = 空串（静态遗留数据）', () => {
    expect(resolveUserSlug({ id: '2048' })).toEqual({ user: '', slug: '2048' })
  })

  it('只给了其中一个显式字段时同样回退拆 id', () => {
    expect(resolveUserSlug({ id: 'fendy/2048', user: 'fendy' })).toEqual({ user: 'fendy', slug: '2048' })
    expect(resolveUserSlug({ id: '2048', slug: '2048' })).toEqual({ user: '', slug: '2048' })
  })
})

describe('user/slug pattern（与后端 namespace 契约一致）', () => {
  it('user：1–39 位小写字母数字连字符，首尾非连字符', () => {
    expect(GAME_USER_PATTERN.test('fendy')).toBe(true)
    expect(GAME_USER_PATTERN.test('a')).toBe(true)
    expect(GAME_USER_PATTERN.test('a'.repeat(39))).toBe(true)
    expect(GAME_USER_PATTERN.test('a'.repeat(40))).toBe(false)
    expect(GAME_USER_PATTERN.test('-bad')).toBe(false)
    expect(GAME_USER_PATTERN.test('bad-')).toBe(false)
    expect(GAME_USER_PATTERN.test('Bad')).toBe(false)
  })

  it('slug：1–63 位小写字母数字连字符，首尾非连字符', () => {
    expect(GAME_SLUG_PATTERN.test('a-dark-room')).toBe(true)
    expect(GAME_SLUG_PATTERN.test('a'.repeat(63))).toBe(true)
    expect(GAME_SLUG_PATTERN.test('a'.repeat(64))).toBe(false)
    expect(GAME_SLUG_PATTERN.test('-bad')).toBe(false)
    expect(GAME_SLUG_PATTERN.test('bad/')).toBe(false)
  })
})

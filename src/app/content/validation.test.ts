import { describe, expect, test } from 'vitest'
import type { WorkPayload } from './types'
import { parseTags, SLUG_PATTERN, slugify, validateWorkPayload, WORK_ID_PATTERN } from './validation'

const good: WorkPayload = {
  id: 'alice/my-game', name: 'My Game', url: 'https://example.com', author: { name: 'A' },
  description: 'desc', durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: ['x'],
  runtime: 'external'
}

test('slugify：中文清空、空格/大写/符号转连字符、修剪首尾', () => {
  expect(slugify('My Cool Game!')).toBe('my-cool-game')
  expect(slugify('  Hello   World ')).toBe('hello-world')
  expect(slugify('中文名字')).toBe('')
  expect(slugify('a'.repeat(80))).toBe('a'.repeat(63))
  // 截断后末字符不得是连字符（否则 WORK_ID_PATTERN 拒绝、后端 400）
  expect(slugify('a'.repeat(63) + ' b')).toBe('a'.repeat(63))
})

test('SLUG_PATTERN：1–63 字符，小写字母/数字/连字符，首尾非连字符', () => {
  expect(SLUG_PATTERN.test('a')).toBe(true)
  expect(SLUG_PATTERN.test('a'.repeat(63))).toBe(true)
  expect(SLUG_PATTERN.test('a'.repeat(64))).toBe(false)
  expect(SLUG_PATTERN.test('A')).toBe(false)
  expect(SLUG_PATTERN.test('-abc')).toBe(false)
  expect(SLUG_PATTERN.test('abc-')).toBe(false)
})

test('WORK_ID_PATTERN：复合 user/slug，两段各自按规则', () => {
  expect(WORK_ID_PATTERN.test('alice/my-game')).toBe(true)
  expect(WORK_ID_PATTERN.test('my-game')).toBe(false)
  expect(WORK_ID_PATTERN.test('alice/')).toBe(false)
  expect(WORK_ID_PATTERN.test('/my-game')).toBe(false)
  expect(WORK_ID_PATTERN.test('alice/my/game')).toBe(false)
})

test('parseTags：中英分隔符、去重、去空、上限 8', () => {
  expect(parseTags('数字, 休闲、idle puzzle')).toEqual(['数字', '休闲', 'idle', 'puzzle'])
  expect(parseTags('a,a,b')).toEqual(['a', 'b'])
  expect(parseTags('1,2,3,4,5,6,7,8,9,10')).toHaveLength(8)
  expect(parseTags('  ')).toEqual([])
})

describe('validateWorkPayload', () => {
  test('合法 external 载荷无错误', () => {
    expect(validateWorkPayload(good, 'new_work')).toEqual({})
  })
  test('逐字段错误', () => {
    expect(validateWorkPayload({ ...good, id: 'alice/Bad_ID' }, 'new_work').workId).toBeTruthy()
    expect(validateWorkPayload({ ...good, name: '  ' }, 'new_work').name).toBeTruthy()
    expect(validateWorkPayload({ ...good, url: 'ftp://x' }, 'new_work').url).toBeTruthy()
    expect(validateWorkPayload({ ...good, author: { name: '' } }, 'new_work').authorName).toBeTruthy()
    expect(validateWorkPayload({ ...good, description: '   ' }, 'new_work').description).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 20, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 0, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 1.5, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: Number.NaN, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, type: 'nope' as never }, 'new_work').type).toBeTruthy()
    expect(validateWorkPayload({ ...good, tags: ['1','2','3','4','5','6','7','8','9'] }, 'new_work').tags).toBeTruthy()
  })
  test('面向用户的文案：workId 错误说「名称」，name 错误说「展示名称」', () => {
    expect(validateWorkPayload({ ...good, id: 'alice/Bad_ID' }, 'new_work').workId)
      .toBe('名称需为小写字母、数字或连字符（1–63 字符，首尾非连字符，你的命名空间内唯一）')
    expect(validateWorkPayload({ ...good, name: '  ' }, 'new_work').name).toBe('展示名称必填')
  })
  test('runtime 缺省回退 external（Task 8 buildPayload 对 external 不写 runtime 键，必走此路径）', () => {
    expect(validateWorkPayload({ ...good, runtime: undefined }, 'new_work')).toEqual({})
  })
  test('virtual：new_work/new_version 需要合法 version 与 entry；metadata_change 不检查', () => {
    const virtual = { ...good, runtime: 'virtual' as const }
    expect(validateWorkPayload(virtual, 'new_work').version).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'V1' }, 'new_work').version).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'v1' }, 'new_work').entry).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'v1', entry: 'index.html' }, 'new_version')).toEqual({})
    expect(validateWorkPayload(virtual, 'metadata_change')).toEqual({})
  })
})

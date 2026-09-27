import { describe, expect, test } from 'vitest'
import type { WorkPayload } from './types'
import { parseTags, slugify, validateWorkPayload } from './validation'

const good: WorkPayload = {
  id: 'my-game', name: 'My Game', url: 'https://example.com', author: { name: 'A' },
  description: 'desc', durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: ['x'],
  runtime: 'external'
}

test('slugify：中文清空、空格/大写/符号转连字符、修剪首尾', () => {
  expect(slugify('My Cool Game!')).toBe('my-cool-game')
  expect(slugify('  Hello   World ')).toBe('hello-world')
  expect(slugify('中文名字')).toBe('')
  expect(slugify('a'.repeat(80))).toBe('a'.repeat(64))
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
    expect(validateWorkPayload({ ...good, id: 'Bad_ID' }, 'new_work').workId).toBeTruthy()
    expect(validateWorkPayload({ ...good, name: '  ' }, 'new_work').name).toBeTruthy()
    expect(validateWorkPayload({ ...good, url: 'ftp://x' }, 'new_work').url).toBeTruthy()
    expect(validateWorkPayload({ ...good, author: { name: '' } }, 'new_work').authorName).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 20, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 0, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, type: 'nope' as never }, 'new_work').type).toBeTruthy()
    expect(validateWorkPayload({ ...good, tags: ['1','2','3','4','5','6','7','8','9'] }, 'new_work').tags).toBeTruthy()
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

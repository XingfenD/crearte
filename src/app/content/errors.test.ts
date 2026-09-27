import { expect, test } from 'vitest'
import { AuthApiError } from '@/auth/errors'
import { ContentApiError, toContentErrorCode, toContentMessage } from './errors'

test('已知码映射，未知码归 internal', () => {
  expect(toContentErrorCode('conflict')).toBe('conflict')
  expect(toContentErrorCode('rate_limited')).toBe('rate_limited')
  expect(toContentErrorCode('wat')).toBe('internal')
  expect(toContentErrorCode(undefined)).toBe('internal')
})

test('toContentMessage：ContentApiError 按码取文案，invalid_request 优先展示字段详情', () => {
  expect(toContentMessage(new ContentApiError(409, 'conflict', 'x'))).toContain('冲突')
  const detailed = new ContentApiError(400, 'invalid_request', 'x', null, 'version: must match pattern')
  expect(toContentMessage(detailed)).toBe('version: must match pattern')
  expect(toContentMessage(new ContentApiError(400, 'invalid_request', 'x'))).toContain('格式')
})

test('toContentMessage：AuthApiError 与未知错误', () => {
  expect(toContentMessage(new AuthApiError(401, 'unauthorized', 'x'))).toContain('登录')
  expect(toContentMessage(new Error('boom'))).toBe('boom')
  expect(toContentMessage('weird')).toBe('weird')
})

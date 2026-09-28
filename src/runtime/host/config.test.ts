import { expect, test } from 'vitest'
import { derivePlayOrigin } from './config'

test('16 位 hex label 组装 origin', () => {
  expect(derivePlayOrigin('0123456789abcdef', 'games.example.com', 'https:')).toBe('https://0123456789abcdef.games.example.com')
  expect(derivePlayOrigin('0123456789abcdef', 'localhost:4173', 'http:')).toBe('http://0123456789abcdef.localhost:4173')
})

test('拒绝非法 label', () => {
  expect(() => derivePlayOrigin('../evil', 'games.example.com', 'https:')).toThrowError()
  expect(() => derivePlayOrigin('', 'games.example.com', 'https:')).toThrowError()
  expect(() => derivePlayOrigin('abc', 'games.example.com', 'https:')).toThrowError()
  expect(() => derivePlayOrigin('g'.repeat(16), 'games.example.com', 'https:')).toThrowError()
  expect(() => derivePlayOrigin('0123456789abcde', 'games.example.com', 'https:')).toThrowError()
})

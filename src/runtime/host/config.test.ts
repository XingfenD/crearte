import { expect, test } from 'vitest'
import { derivePlayOrigin } from './config'

test('生产 https 与本地 http', () => {
  expect(derivePlayOrigin('2048', 'games.example.com', 'https:')).toBe('https://2048.games.example.com')
  expect(derivePlayOrigin('2048', 'localhost:4173', 'http:')).toBe('http://2048.localhost:4173')
})
test('拒绝非法 id', () => {
  expect(() => derivePlayOrigin('../evil', 'games.example.com', 'https:')).toThrowError()
})

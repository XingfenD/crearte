import { expect, test } from 'vitest'
import type { Game } from '../../app/data/types'
import { resolveRuntimeTargets } from './adapters'

const base = {
  id: 'demo', name: 'D', url: 'https://upstream.example/game', author: { name: 'a' }, description: 'd',
  durationMinutes: { min: 1, max: 2 }, type: 'puzzle' as const, tags: ['x'], addedAt: '2026-09-17'
}
const opts = { baseDomain: 'games.example.com', protocol: 'https:' }

test('external 只有外链', () => {
  const targets = resolveRuntimeTargets({ ...base }, opts)
  expect(targets).toEqual([{ mode: 'external', url: 'https://upstream.example/game', origin: null }])
})

test('virtual 生成 bootstrap URL 并带 fragment 参数', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', entry: 'index.html',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  expect(primary.mode).toBe('virtual')
  expect(primary.origin).toBe('https://demo.games.example.com')
  const url = new URL(primary.url)
  expect(url.pathname).toBe('/__bootstrap')
  expect(url.hash).toContain('v=v1')
  expect(url.hash).toContain(`sha=${'a'.repeat(64)}`)
  expect(url.hash).toContain('bundle=' + encodeURIComponent('https://games.example.com/data/bundles/demo.zip'))
  expect(url.hash).not.toContain('features=')
})

test('virtual 目标透传 features 参数', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) },
    features: { eval: true }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  const url = new URL(primary.url)
  expect(url.hash).toContain('features=')
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  expect(params.get('features')).toBe('{"eval":true}')
})

test('fallback 链：hosted 再 external', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: { url: 'https://games.example.com/data/bundles/demo.zip', bytes: 1, sha256: 'b'.repeat(64) },
    hostedUrl: 'https://demo.games.example.com/', fallback: 'hosted'
  }
  const targets = resolveRuntimeTargets(game, opts)
  expect(targets.map((t) => t.mode)).toEqual(['virtual', 'hosted', 'external'])
})

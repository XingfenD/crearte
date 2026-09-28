import { expect, test, vi } from 'vitest'
import type { Game } from '../../app/data/types'
import { resolveRuntimeTargets } from './adapters'

const subdomain = '0123456789abcdef'
const base = {
  id: 'fendy/2048', user: 'fendy', slug: '2048', name: 'D', url: 'https://upstream.example/game', author: { name: 'a' }, description: 'd',
  durationMinutes: { min: 1, max: 2 }, type: 'puzzle' as const, tags: ['x'], addedAt: '2026-09-17'
}
const opts = { baseDomain: 'games.example.com', protocol: 'https:' }

test('external 只有外链', () => {
  const targets = resolveRuntimeTargets({ ...base }, opts)
  expect(targets).toEqual([{ mode: 'external', url: 'https://upstream.example/game', origin: null }])
})

test('virtual 由 playSubdomain 组 origin 并带 fragment 参数', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', entry: 'index.html', playSubdomain: subdomain,
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  expect(primary.mode).toBe('virtual')
  expect(primary.origin).toBe(`https://${subdomain}.games.example.com`)
  const url = new URL(primary.url)
  expect(url.pathname).toBe('/__bootstrap')
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  expect(params.get('v')).toBe('v1')
  expect(params.get('id')).toBe('fendy/2048')
  expect(params.get('sha')).toBe('a'.repeat(64))
  expect(params.get('bundle')).toBe('https://games.example.com/data/bundles/demo.zip')
  expect(params.get('features')).toBeNull()
})

test('playOrigin override 优先于 playSubdomain', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playOrigin: 'https://override.example.com', playSubdomain: subdomain,
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  expect(primary.origin).toBe('https://override.example.com')
  expect(primary.url.startsWith('https://override.example.com/__bootstrap#')).toBe(true)
})

test('virtual 目标透传 features 参数', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: subdomain,
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) },
    features: { eval: true }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  const url = new URL(primary.url)
  expect(url.hash).toContain('features=')
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  expect(params.get('features')).toBe('{"eval":true}')
})

test('virtual + bundle.enc 注入 kid 与双段 key URL', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: subdomain,
    bundle: {
      url: '/data/bundles/demo.bin', bytes: 10, sha256: 'a'.repeat(64),
      enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) }
    }
  }
  const [primary] = resolveRuntimeTargets(game, {
    ...opts,
    config: { baseDomain: 'games.example.com', hostOrigin: 'https://games.example.com', apiBase: 'https://api.example' }
  })
  const params = new URLSearchParams(new URL(primary.url).hash.replace(/^#/, ''))
  expect(params.get('kid')).toBe('k'.repeat(22))
  expect(params.get('key')).toBe('https://api.example/api/games/fendy/2048/bundle-key?version=v1')
})

test('无 enc 不注入加密参数（明文路径不变）', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: subdomain,
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, {
    ...opts,
    config: { baseDomain: 'games.example.com', hostOrigin: 'https://games.example.com', apiBase: 'https://api.example' }
  })
  const params = new URLSearchParams(new URL(primary.url).hash.replace(/^#/, ''))
  expect(params.get('kid')).toBeNull()
  expect(params.get('key')).toBeNull()
})

test('缺失 playSubdomain 且无 playOrigin 抛错', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  expect(() => resolveRuntimeTargets(game, opts)).toThrowError()
})

test('非法 playSubdomain label 抛错', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: '../evil',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  expect(() => resolveRuntimeTargets(game, opts)).toThrowError()
})

test('fallback 链：hosted 再 external', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: subdomain,
    bundle: { url: 'https://games.example.com/data/bundles/demo.zip', bytes: 1, sha256: 'b'.repeat(64) },
    hostedUrl: `https://${subdomain}.games.example.com/`, fallback: 'hosted'
  }
  const targets = resolveRuntimeTargets(game, opts)
  expect(targets.map((t) => t.mode)).toEqual(['virtual', 'hosted', 'external'])
})

test('apiBase 为相对基址（/，同源反代）时 keyUrl 落 location.origin', () => {
  vi.stubGlobal('location', { origin: 'http://site.local' })
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', playSubdomain: subdomain,
    bundle: {
      url: '/data/bundles/demo.bin', bytes: 10, sha256: 'a'.repeat(64),
      enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) }
    }
  }
  const [primary] = resolveRuntimeTargets(game, {
    ...opts,
    config: { baseDomain: 'games.example.com', hostOrigin: 'https://games.example.com', apiBase: '/' }
  })
  const params = new URLSearchParams(new URL(primary.url).hash.replace(/^#/, ''))
  expect(params.get('key')).toBe('http://site.local/api/games/fendy/2048/bundle-key?version=v1')
  vi.unstubAllGlobals()
})

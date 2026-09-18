import { describe, expect, test } from 'vitest'
import { assetCacheKey, decodeAssetPath, routeRequest, AGENT_CACHE_PATH } from './router'

const base = { isNavigation: true, hasActiveVersion: true, entry: 'index.html' }

describe('decodeAssetPath', () => {
  test('普通路径与目录', () => {
    expect(decodeAssetPath('/js/game.js')).toBe('js/game.js')
    expect(decodeAssetPath('/')).toBe('')
    expect(decodeAssetPath('/img/')).toBe('img/')
  })
  test('拒绝穿越与编码穿越', () => {
    expect(decodeAssetPath('/../secret')).toBeNull()
    expect(decodeAssetPath('/%2e%2e/secret')).toBeNull()
    expect(decodeAssetPath('/a/../../b')).toBeNull()
    expect(decodeAssetPath('/a/../b')).toBe('b')
    expect(decodeAssetPath('/%5c..%5c..%5csecret')).toBeNull()
    expect(decodeAssetPath('/%2e%2e%5csecret')).toBeNull()
  })
  test('拒绝控制字符', () => {
    expect(decodeAssetPath('/%2e%0a%2e/%2e%0a%2e/secret')).toBeNull()
    expect(decodeAssetPath('/%09x')).toBeNull()
    expect(decodeAssetPath('/%0dx')).toBeNull()
  })
})

describe('assetCacheKey', () => {
  test('拼接 __bundle 命名空间', () => {
    expect(assetCacheKey('js/game.js', 'https://x.test')).toBe('https://x.test/__bundle/js/game.js')
  })
})

describe('routeRequest', () => {
  test('放行 bootstrap 与 sw', () => {
    expect(routeRequest({ ...base, pathname: '/__bootstrap' })).toEqual({ kind: 'passthrough' })
    expect(routeRequest({ ...base, pathname: '/sw.js' })).toEqual({ kind: 'passthrough' })
  })
  test('robots 与 agent', () => {
    expect(routeRequest({ ...base, pathname: '/robots.txt' })).toEqual({ kind: 'robots' })
    expect(routeRequest({ ...base, pathname: '/agent.js' })).toEqual({ kind: 'asset', path: AGENT_CACHE_PATH })
  })
  test('根路径按版本状态分流', () => {
    expect(routeRequest({ ...base, pathname: '/' })).toEqual({ kind: 'asset', path: 'index.html' })
    expect(routeRequest({ ...base, pathname: '/', hasActiveVersion: false })).toEqual({ kind: 'redirect-bootstrap' })
    expect(routeRequest({ ...base, pathname: '/', hasActiveVersion: false, isNavigation: false })).toEqual({ kind: 'not-found' })
  })
  test('目录补 entry、文件路径直通', () => {
    expect(routeRequest({ ...base, pathname: '/sub/', entry: 'sub/index.html' })).toEqual({ kind: 'asset', path: 'sub/index.html' })
    expect(routeRequest({ ...base, pathname: '/js/game.js' })).toEqual({ kind: 'asset', path: 'js/game.js' })
  })
  test('非法路径 404', () => {
    expect(routeRequest({ ...base, pathname: '/../x' })).toEqual({ kind: 'not-found' })
  })
})

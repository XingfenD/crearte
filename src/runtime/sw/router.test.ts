import { describe, expect, test } from 'vitest'
import { assetCacheKey, decodeAssetPath, parseRange, routeRequest, AGENT_CACHE_PATH } from './router'

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
    expect(assetCacheKey('img/', 'https://x.test')).toBe('https://x.test/__bundle/img/')
    expect(assetCacheKey('', 'https://x.test')).toBe('https://x.test/__bundle/')
  })
  test('逐段编码，双重编码与尾随空格不得逃逸', () => {
    expect(assetCacheKey('%2e%2e/secret', 'https://x.test')).toBe('https://x.test/__bundle/%252e%252e/secret')
    expect(assetCacheKey('.. /secret', 'https://x.test')).toBe('https://x.test/__bundle/..%20/secret')
    expect(assetCacheKey('..%20', 'https://x.test')).toBe('https://x.test/__bundle/..%2520')
  })
})

describe('parseRange', () => {
  test('闭区间/开区间/后缀区间', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 })
    expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 })
    expect(parseRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 })
    expect(parseRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9 })
  })
  test('非法区间返回 null', () => {
    expect(parseRange('bytes=9-2', 10)).toBeNull()
    expect(parseRange('bytes=10-', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
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
  test('无版本时 agent 与普通路径一样按版本状态分流', () => {
    expect(routeRequest({ ...base, pathname: '/agent.js', hasActiveVersion: false, isNavigation: false })).toEqual({ kind: 'not-found' })
    expect(routeRequest({ ...base, pathname: '/agent.js', hasActiveVersion: false })).toEqual({ kind: 'redirect-bootstrap' })
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

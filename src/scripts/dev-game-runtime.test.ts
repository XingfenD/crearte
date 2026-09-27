import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  gameSubdomainRuntimePlugin,
  isGameSubdomainHost,
  pathnameOf,
  runtimeAssetPath
} from './dev-game-runtime'

// 中间件行为：用假 server 捕获 configureServer 注册的 handler，再以假 req/res 驱动
function mountHandler(distDir: string) {
  // ObjectHook 联合类型整体窄化为普通函数签名，绕开 this 上下文约束（插件内不使用 this）
  const configure = gameSubdomainRuntimePlugin(distDir).configureServer as ((server: never) => void) | undefined
  let handler: ((req: never, res: never, next: () => void) => void) | undefined
  const server = { middlewares: { use: (fn: typeof handler) => { handler = fn } } }
  configure?.(server as never)
  if (!handler) throw new Error('configureServer did not register a middleware')
  return handler as (req: { headers: Record<string, string | undefined>; url?: string }, res: FakeRes, next: () => void) => void
}

interface FakeRes {
  statusCode: number
  headers: Record<string, string>
  body: string
  setHeader(key: string, value: string): void
  end(chunk?: string): void
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) { res.headers[key] = value },
    end(chunk) { if (chunk) res.body += chunk }
  }
  return res
}

describe('isGameSubdomainHost', () => {
  test('主站 Host 不是游戏子域', () => {
    expect(isGameSubdomainHost('localhost:8080')).toBe(false)
    expect(isGameSubdomainHost('127.0.0.1:5173')).toBe(false)
    expect(isGameSubdomainHost('[::1]:8080')).toBe(false)
    expect(isGameSubdomainHost('localhost')).toBe(false)
    expect(isGameSubdomainHost(undefined)).toBe(false)
    expect(isGameSubdomainHost('')).toBe(false)
  })

  test('.localhost 子域是游戏子域（大小写不敏感）', () => {
    expect(isGameSubdomainHost('ceshi.localhost:8080')).toBe(true)
    expect(isGameSubdomainHost('a-dark-room.localhost')).toBe(true)
    expect(isGameSubdomainHost('CESHI.Localhost:8080')).toBe(true)
  })
})

describe('pathnameOf', () => {
  test('剥掉 query 与 hash', () => {
    expect(pathnameOf('/agent.js?host=http%3A%2F%2Flocalhost%3A8080')).toBe('/agent.js')
    expect(pathnameOf('/__bootstrap#v=v1')).toBe('/__bootstrap')
    expect(pathnameOf('/sw.js')).toBe('/sw.js')
    expect(pathnameOf(undefined)).toBe('/')
  })
})

describe('runtimeAssetPath', () => {
  test('运行时三件套精确匹配', () => {
    expect(runtimeAssetPath('/__bootstrap')).toBe('bootstrap/index.html')
    expect(runtimeAssetPath('/sw.js')).toBe('sw.js')
    expect(runtimeAssetPath('/agent.js')).toBe('agent.js')
  })

  test('其余路径不服务', () => {
    expect(runtimeAssetPath('/')).toBeNull()
    expect(runtimeAssetPath('/index.html')).toBeNull()
    expect(runtimeAssetPath('/__bootstrap/')).toBeNull()
    expect(runtimeAssetPath('/sw.js.map')).toBeNull()
    expect(runtimeAssetPath('/assets/app.js')).toBeNull()
  })
})

describe('gameSubdomainRuntimePlugin 中间件', () => {
  test('主站请求放行 next()，不碰响应', () => {
    const handler = mountHandler('/nonexistent-dist')
    const res = fakeRes()
    const next = vi.fn()
    handler({ headers: { host: 'localhost:8080' }, url: '/sw.js' }, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  test('游戏子域三件套返回 200 + no-store + 正确 MIME', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'dev-game-runtime-'))
    mkdirSync(path.join(dist, 'bootstrap'), { recursive: true })
    writeFileSync(path.join(dist, 'bootstrap', 'index.html'), '<html>bootstrap</html>')
    writeFileSync(path.join(dist, 'sw.js'), '// sw')
    writeFileSync(path.join(dist, 'agent.js'), '// agent')
    const handler = mountHandler(dist)

    for (const [url, contentType] of [
      ['/__bootstrap', 'text/html; charset=utf-8'],
      ['/sw.js', 'text/javascript; charset=utf-8'],
      ['/agent.js?host=http://localhost:8080', 'text/javascript; charset=utf-8']
    ] as const) {
      const res = fakeRes()
      handler({ headers: { host: 'ceshi.localhost:8080' }, url }, res, vi.fn())
      expect(res.statusCode, url).toBe(200)
      expect(res.headers['Cache-Control'], url).toBe('no-store')
      expect(res.headers['Content-Type'], url).toBe(contentType)
    }
  })

  test('游戏子域其他路径 404（对齐生产 nginx 兜底）', () => {
    const handler = mountHandler('/nonexistent-dist')
    const res = fakeRes()
    const next = vi.fn()
    handler({ headers: { host: 'ceshi.localhost:8080' }, url: '/index.html' }, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(404)
  })

  test('dist 产物缺失时 503 并提示跑 build:runtime，绝不把 HTML 当 JS 返回', () => {
    const handler = mountHandler('/nonexistent-dist')
    const res = fakeRes()
    handler({ headers: { host: 'ceshi.localhost:8080' }, url: '/sw.js' }, res, vi.fn())
    expect(res.statusCode).toBe(503)
    expect(res.body).toContain('build:runtime')
    expect(res.headers['Content-Type']).toBe('text/plain; charset=utf-8')
  })
})

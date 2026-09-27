// dev-only：让 vite dev server 在游戏子域 Host（<id>.localhost:<port>，vite 默认放行）
// 上提供运行时三件套，语义对齐生产 nginx 通配 server block（deploy/nginx.conf）与
// mock 服务器（serve-runtime.mjs）。仅 configureServer 生效，build/preview/vitest 不触及。
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const RUNTIME_ASSETS: Record<string, string> = {
  '/__bootstrap': 'bootstrap/index.html',
  '/sw.js': 'sw.js',
  '/agent.js': 'agent.js'
}

const MAIN_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function hostnameOf(hostHeader: string): string {
  const trimmed = hostHeader.trim()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end > 0 ? trimmed.slice(1, end).toLowerCase() : ''
  }
  const colon = trimmed.indexOf(':')
  return (colon >= 0 ? trimmed.slice(0, colon) : trimmed).toLowerCase()
}

/** 主站（localhost / 127.0.0.1 / [::1]）返回 false；其余 Host（游戏子域）返回 true。 */
export function isGameSubdomainHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const host = hostnameOf(hostHeader)
  if (!host) return false
  return !MAIN_HOSTS.has(host)
}

/** 剥 query/hash 取 pathname；req.url 恒非空，undefined 时按 '/' 处理。 */
export function pathnameOf(url: string | undefined): string {
  if (!url) return '/'
  const hash = url.indexOf('#')
  const query = url.indexOf('?')
  const end = hash < 0 ? (query < 0 ? url.length : query) : (query < 0 ? hash : Math.min(hash, query))
  return url.slice(0, end)
}

/** 运行时三件套的 dist 内相对路径；非三件套返回 null。 */
export function runtimeAssetPath(pathname: string): string | null {
  return RUNTIME_ASSETS[pathname] ?? null
}

const HTML = 'text/html; charset=utf-8'
const JS = 'text/javascript; charset=utf-8'

export function gameSubdomainRuntimePlugin(distDir: string): Plugin {
  return {
    name: 'crearte-dev-game-subdomain-runtime',
    configureServer(server) {
      // 直接 use（先于 vite transform/SPA fallback 中间件），游戏子域路径全部自主裁决
      server.middlewares.use((req, res, next) => {
        if (!isGameSubdomainHost(req.headers.host)) return next()
        const pathname = pathnameOf(req.url)
        const asset = runtimeAssetPath(pathname)
        if (!asset) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('game subdomain serves only /__bootstrap, /sw.js, /agent.js in dev')
          return
        }
        const file = path.join(distDir, asset)
        if (!existsSync(file)) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`missing ${asset} in ${distDir}; run "npm run build:runtime" (predev does this automatically)`)
          return
        }
        res.statusCode = 200
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Type', asset.endsWith('.html') ? HTML : JS)
        res.end(readFileSync(file))
      })
    }
  }
}

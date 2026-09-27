#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = path.join(root, 'dist')
const fixtures = path.join(root, 'fixtures')
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 4173)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.zip': 'application/zip', '.bin': 'application/octet-stream', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' }
const DEFAULT_FEATURES = { eval: false, inlineScript: false, inlineStyle: true, wasm: true, coop: false }

// 与 runtime/sw/csp.ts 同语义的最小镜像（Node 端无法 import TS）；生产由后端按游戏 features 下发
function frameAncestor(hostOrigin) {
  try {
    const url = new URL(hostOrigin)
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(url.host)) return "'none'"
    return `${url.protocol}//${url.host}`
  } catch {
    return "'none'"
  }
}

function buildCsp(features, hostOrigin) {
  const script = ["'self'"]
  if (features.eval) script.push("'unsafe-eval'")
  if (features.inlineScript) script.push("'unsafe-inline'")
  if (features.wasm) script.push("'wasm-unsafe-eval'")
  const style = ["'self'"]
  if (features.inlineStyle) style.push("'unsafe-inline'")
  return [
    "default-src 'none'",
    `script-src ${script.join(' ')}`,
    `style-src ${style.join(' ')}`,
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "manifest-src 'none'",
    `frame-ancestors ${frameAncestor(hostOrigin)}`
  ].join('; ')
}

function securityHeaders(features, hostOrigin) {
  return {
    'Content-Security-Policy': buildCsp(features, hostOrigin),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
}

async function gameCatalog(gameId) {
  try {
    return JSON.parse(await readFile(path.join(fixtures, 'catalog', `${gameId}.json`), 'utf8'))
  } catch {
    return {}
  }
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

async function fileOrNull(file) {
  try { const info = await stat(file); return info.isFile() ? file : null } catch { return null }
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': MIME['.json'] })
  res.end('{"error":"not found"}')
}

const versionOverrides = new Map()

// bundle-key mock：应答 fixtures/generated/keys/<id>__<version>.json；按夹具 id 注入故障。
// 必须带 ACAO:*——SW 从 <id>.localhost 跨域取钥。响应永不落磁盘日志（key 材料）。
const rateLimitHits = new Map()

async function bundleKeyMock(req, res, url) {
  const match = url.pathname.match(/^\/api\/games\/([a-z0-9-]+)\/bundle-key$/)
  if (!match) return false
  const id = match[1]
  const version = (url.searchParams.get('version') ?? '').replace(/[^a-z0-9._-]/g, '')
  const send = (status, body, extra = {}) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // 跨域下 Retry-After 需显式 expose，keyfetch 的退避才能读到（与后端 cors.go 一致）
      'Access-Control-Expose-Headers': 'Retry-After',
      'Cache-Control': 'no-store',
      ...extra
    })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  // CORS 预检：SW 跨域取钥带 Cache-Control/Authorization 头；不计入 ratelimit、不读 key 文件
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? 'Cache-Control, Authorization',
      'Access-Control-Max-Age': '60'
    })
    res.end(); return true
  }
  const revoked = { error: { code: 'key_revoked', message: 'version revoked' } }
  if (id === 'revoked' || (id === 'revoke-update' && version === 'v2')) { send(410, revoked); return true }
  if (id === 'ratelimit') {
    const hits = (rateLimitHits.get(id) ?? 0) + 1
    rateLimitHits.set(id, hits)
    if (hits <= 2) { send(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '1' }); return true }
  }
  try {
    const body = await readFile(path.join(fixtures, 'generated', 'keys', `${id}__${version}.json`), 'utf8')
    send(200, body)
  } catch {
    send(404, { error: { code: 'not_found', message: 'unknown game or version' } })
  }
  return true
}

const server = createServer(async (req, res) => {
  const host = (req.headers.host ?? '').split(':')[0]
  const isGameHost = host.endsWith('.localhost')
  let url
  try {
    url = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('bad request')
    return
  }

  try {
    if (url.pathname === '/__test/bump-version') {
      const id = url.searchParams.get('id')
      try {
        const alt = JSON.parse(await readFile(path.join(fixtures, 'generated', 'games-alt', `${id}.json`), 'utf8'))
        versionOverrides.set(id, alt)
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}'); return
      }
    }

    if (url.pathname === '/__test/reset-ratelimit') {
      rateLimitHits.clear()
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
    }

    if (await bundleKeyMock(req, res, url)) return

    // 内容 API 在 mock 服务器中不存在：统一 404 JSON，使 apiRepo 抛 NotFoundError → mergeRepo 回落静态源。
    // 若无此分支，/api/games* 会落入 SPA fallback 返 200+HTML，response.json() 抛解析错、详情页全灭。
    // 计划 Task 10（spec §9.1 mock 层）的 e2e 新 spec 用 page.route 拦截，优先级高于本服务器，互不影响。
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': MIME['.json'] })
      res.end('{"error":{"code":"not_found","message":"content API is not mocked"}}')
      return
    }

    if (isGameHost) {
      const gameId = host.split('.')[0]
      if (url.pathname === '/__bootstrap') {
        const file = await fileOrNull(path.join(dist, 'bootstrap', 'index.html'))
        if (!file) { notFound(res); return }
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
        res.end(body); return
      }
      if (url.pathname === '/sw.js' || url.pathname === '/agent.js') {
        const file = await fileOrNull(path.join(dist, url.pathname.slice(1)))
        if (!file) { notFound(res); return }
        const body = await readFile(file)
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' })
        res.end(body); return
      }
      // C 模式 mock：直接服务夹具源文件并注入 agent
      const candidate = await fileOrNull(path.join(fixtures, 'games', gameId, url.pathname.replace(/^\//, '') || 'index.html'))
      if (candidate) {
        const ext = path.extname(candidate)
        if (ext === '.html') {
          const html = await readFile(candidate, 'utf8')
          const catalog = await gameCatalog(gameId)
          const hostOrigin = `http://localhost:${port}`
          const version = typeof catalog.version === 'string' && catalog.version ? ` data-game-version="${escapeAttribute(catalog.version)}"` : ''
          const attrs = ` data-game-id="${escapeAttribute(String(catalog.id ?? gameId))}"${version}`
          const tag = `<script src="/agent.js?host=${encodeURIComponent(hostOrigin)}"></script>`
          const withMeta = html.replace(/<html(?=[\s>])/i, `<html${attrs}`)
          const at = withMeta.search(/<head[^>]*>/i)
          const injected = at >= 0 ? withMeta.slice(0, withMeta.indexOf('>', at) + 1) + tag + withMeta.slice(withMeta.indexOf('>', at) + 1) : tag + withMeta
          res.writeHead(200, { ...securityHeaders({ ...DEFAULT_FEATURES, ...(catalog.features ?? {}) }, hostOrigin), 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
          res.end(injected); return
        }
        const body = await readFile(candidate)
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
        res.end(body); return
      }
      notFound(res); return
    }

    // 宿主站
    let file = url.pathname === '/' ? '/index.html' : url.pathname
    if (file.startsWith('/data/')) {
      const target = await fileOrNull(path.join(dist, file))
      if (!target) { notFound(res); return }
      const override = versionOverrides.get(file.match(/\/data\/games\/([a-z0-9-]+)\.json$/)?.[1] ?? '')
      if (override) {
        const json = JSON.parse(await readFile(target, 'utf8'))
        json.version = override.version
        json.bundle = override.bundle
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify(json)); return
      }
      const body = await readFile(target)
      const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }
      if (file.startsWith('/data/bundles/')) headers['Access-Control-Allow-Origin'] = '*'
      res.writeHead(200, headers)
      res.end(body); return
    }
    const exists = await fileOrNull(path.join(dist, file))
    if (!exists) file = '/index.html'
    const body = await readFile(path.join(dist, file))
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'text/html; charset=utf-8' })
    res.end(body)
  } catch (error) {
    if (res.headersSent) { res.end(); return }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(String(error))
  }
})

server.listen(port, () => console.log(`[serve-runtime] http://localhost:${port} (+ *.localhost:${port})`))

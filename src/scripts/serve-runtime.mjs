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

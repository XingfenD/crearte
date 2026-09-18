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
          const tag = `<script src="/agent.js?host=${encodeURIComponent(`http://localhost:${port}`)}"></script>`
          const at = html.search(/<head[^>]*>/i)
          const injected = at >= 0 ? html.slice(0, html.indexOf('>', at) + 1) + tag + html.slice(html.indexOf('>', at) + 1) : tag + html
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
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

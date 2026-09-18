/// <reference lib="webworker" />
import { AGENT_CACHE_PATH, assetCacheKey, parseRange, routeRequest } from './router'
import { contentTypeFor } from './mime'
import { securityHeaders } from './csp'
import { DEFAULT_FEATURES, isShellMessage, type FeatureFlags } from '../bridge/protocol'
import { readMeta, writeMeta, type RuntimeMeta } from './meta'
import { extractZip, ZIP_LIMITS, ZipError } from './unzip'

declare const self: ServiceWorkerGlobalScope

const AGENT_SOURCE_URL = '/agent.js'
const BOOTSTRAP_URL = '/__bootstrap'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([`bundle-${(await readMeta(self.location.origin))?.version ?? ''}`, 'runtime-meta'])
    for (const name of await caches.keys()) {
      if (name.startsWith('bundle-') && !keep.has(name)) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (!isShellMessage(event.data)) return
  if (event.data.type !== 'runtime:install') return
  const client = event.source as Client | null
  event.waitUntil(installBundle(event.data, client))
})

async function fetchAgentSource(): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(AGENT_SOURCE_URL, { cache: 'no-store' })
  } catch {
    throw new Error('agent.js 获取失败')
  }
  if (!response.ok) throw new Error(`agent.js 获取失败: HTTP ${response.status}`)
  try {
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    throw new Error('agent.js 获取失败')
  }
}

async function installBundle(message: Extract<import('../bridge/protocol').ShellMessage, { type: 'runtime:install' }>, client: Client | null): Promise<void> {
  const origin = self.location.origin
  const tell = (data: object) => client?.postMessage(data)
  try {
    const headers: Record<string, string> = {}
    if (message.token) headers.Authorization = `Bearer ${message.token}`
    const response = await fetch(message.bundleUrl, { headers, cache: 'no-store' })
    if (!response.ok) throw new Error(`bundle 下载失败: HTTP ${response.status}`)
    const total = Number(response.headers.get('Content-Length') ?? 0) || 0
    if (total > ZIP_LIMITS.maxBundle) throw new ZipError('bundle-too-large', `包体超过上限 ${ZIP_LIMITS.maxBundle}`)
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        if (received > ZIP_LIMITS.maxBundle) throw new ZipError('bundle-too-large', `包体超过上限 ${ZIP_LIMITS.maxBundle}`)
        chunks.push(value)
        tell({ type: 'runtime:progress', received, total: Math.max(total, received) })
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer())
      chunks.push(buffer)
      received = buffer.length
      if (received > ZIP_LIMITS.maxBundle) throw new ZipError('bundle-too-large', `包体超过上限 ${ZIP_LIMITS.maxBundle}`)
    }
    const bundle = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { bundle.set(chunk, offset); offset += chunk.length }

    const digest = await crypto.subtle.digest('SHA-256', bundle)
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex !== message.sha256) throw new Error('bundle 校验失败（sha256 不匹配）')

    const entries = await extractZip(bundle)
    if (!entries.has(message.entry)) throw new Error(`入口不存在: ${message.entry}`)
    const agentBytes = await fetchAgentSource()
    entries.set(AGENT_CACHE_PATH, agentBytes)

    const cacheName = `bundle-${message.version}`
    const cache = await caches.open(cacheName)
    for (const [path, bytes] of entries) {
      await cache.put(assetCacheKey(path, origin), new Response(bytes as BodyInit, {
        headers: { 'Content-Type': contentTypeFor(path), 'Cache-Control': 'no-store' }
      }))
    }
    const meta: RuntimeMeta = { id: message.id, version: message.version, entry: message.entry, hostOrigin: message.hostOrigin, installedAt: Date.now(), features: message.features }
    await writeMeta(meta, origin)
    // 仅保留当前版本缓存，避免旧包累积；清理失败不影响本次安装
    try {
      for (const name of await caches.keys()) {
        if (name.startsWith('bundle-') && name !== cacheName) await caches.delete(name)
      }
    } catch { /* 尽力清理 */ }
    await self.skipWaiting()
    tell({ type: 'runtime:ready', version: message.version })
  } catch (error) {
    tell({ type: 'runtime:error', message: error instanceof Error ? error.message : String(error) })
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(handle(event))
})

async function handle(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url)
  const meta = await readMeta(self.location.origin)
  const decision = routeRequest({
    pathname: url.pathname,
    isNavigation: event.request.mode === 'navigate',
    hasActiveVersion: meta !== null,
    entry: meta?.entry ?? 'index.html'
  })

  if (decision.kind === 'passthrough') return fetch(event.request)
  if (decision.kind === 'robots') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (decision.kind === 'redirect-bootstrap') {
    return Response.redirect(new URL(`${BOOTSTRAP_URL}${url.search}`, self.location.origin).href, 302)
  }
  if (decision.kind === 'not-found') return new Response(null, { status: 404 })

  const cache = await caches.open(`bundle-${meta!.version}`)
  const hit = await cache.match(assetCacheKey(decision.path, self.location.origin))
  if (!hit) {
    if (event.request.mode === 'navigate') {
      return Response.redirect(new URL(`${BOOTSTRAP_URL}${url.search}`, self.location.origin).href, 302)
    }
    return new Response(null, { status: 404 })
  }

  const features: FeatureFlags = { ...DEFAULT_FEATURES, ...(meta?.features ?? {}) }
  const headers = new Headers(securityHeaders(features, meta!.hostOrigin))
  headers.set('Content-Type', contentTypeFor(decision.path))
  const etag = `"${meta!.version}:${decision.path}"`
  headers.set('ETag', etag)
  if (event.request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers })
  const isHtml = decision.path.endsWith('.html') || decision.path === meta!.entry
  if (isHtml) {
    const html = await hit.text()
    return new Response(event.request.method === 'HEAD' ? null : injectAgent(html, meta!.hostOrigin), { status: 200, headers })
  }
  headers.set('Accept-Ranges', 'bytes')
  if (event.request.method === 'HEAD') return new Response(null, { status: 200, headers })
  const buffer = await hit.arrayBuffer()
  if (event.request.headers.has('Range')) {
    const range = parseRange(event.request.headers.get('Range')!, buffer.byteLength)
    if (range) {
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`)
      return new Response(buffer.slice(range.start, range.end + 1), { status: 206, headers })
    }
  }
  return new Response(buffer, { status: 200, headers })
}

function injectAgent(html: string, hostOrigin: string): string {
  const tag = `<script src="/agent.js?host=${encodeURIComponent(hostOrigin)}"></script>`
  const headIndex = html.search(/<head[^>]*>/i)
  if (headIndex >= 0) {
    const insertAt = html.indexOf('>', headIndex) + 1
    return html.slice(0, insertAt) + tag + html.slice(insertAt)
  }
  const htmlIndex = html.search(/<html[^>]*>/i)
  if (htmlIndex >= 0) {
    const insertAt = html.indexOf('>', htmlIndex) + 1
    return html.slice(0, insertAt) + tag + html.slice(insertAt)
  }
  return tag + html
}

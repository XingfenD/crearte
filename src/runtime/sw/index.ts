/// <reference lib="webworker" />
import { AGENT_CACHE_PATH, BOOTSTRAP_PATH, assetCacheKey, parseRange, routeRequest } from './router'
import { contentTypeFor } from './mime'
import { securityHeaders } from './csp'
import { DEFAULT_FEATURES, isShellMessage, type FeatureFlags } from '../bridge/protocol'
import { cachesToKeep, clearPendingInstall, readMeta, readPendingInstall, writeMeta, writePendingInstall, type RuntimeMeta } from './meta'
import { extractZip, ZIP_LIMITS, ZipError } from './unzip'

declare const self: ServiceWorkerGlobalScope

const AGENT_SOURCE_URL = '/agent.js'
const OFFLINE_BOOTSTRAP_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>作品未安装</title></head><body><p>该作品尚未安装，无法离线运行。请联网后重试。</p></body></html>'

// Chrome 会在 activate 的 waitUntil 结算前就解析 navigator.serviceWorker.ready，
// shell 可能在 activate 期间就发来 runtime:install；激活清理必须先结算，安装再开始。
let activationReady: Promise<void> = Promise.resolve()
let installQueue: Promise<void> = Promise.resolve()

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  activationReady = (async () => {
    const origin = self.location.origin
    const meta = await readMeta(origin)
    const pending = await readPendingInstall(origin)
    const keep = cachesToKeep(meta?.version ?? null, pending)
    // meta 与 pending 都为空时（首次安装）不清理：bundle-* 可能是并发安装正在写入的缓存
    if (keep.size > 1) {
      for (const name of await caches.keys()) {
        if (name.startsWith('bundle-') && !keep.has(name)) await caches.delete(name)
      }
    }
    await self.clients.claim()
  })()
  event.waitUntil(activationReady)
})

self.addEventListener('message', (event) => {
  if (!isShellMessage(event.data)) return
  if (event.data.type !== 'runtime:install') return
  const message = event.data
  const client = event.source as Client | null
  const run = installQueue.then(async () => {
    await activationReady
    await installBundle(message, client)
  })
  installQueue = run.catch(() => undefined)
  event.waitUntil(run)
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
    // 安装中的版本对被并发 activate 的清理可见，避免清掉正在写入的 bundle 缓存
    await writePendingInstall(message.version, origin)
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
    const meta: RuntimeMeta = {
      id: message.id, version: message.version, entry: message.entry, hostOrigin: message.hostOrigin,
      bundleUrl: message.bundleUrl, sha256: message.sha256, installedAt: Date.now(), features: message.features
    }
    await writeMeta(meta, origin)
    // pending 清理失败不应让已成功的安装报错；残留的 pending 只会多保留一个缓存
    await clearPendingInstall(origin).catch(() => {})
    // 仅保留当前版本缓存，避免旧包累积；清理失败不影响本次安装
    try {
      for (const name of await caches.keys()) {
        if (name.startsWith('bundle-') && name !== cacheName) await caches.delete(name)
      }
    } catch { /* 尽力清理 */ }
    await self.skipWaiting()
    tell({ type: 'runtime:ready', version: message.version })
  } catch (error) {
    await clearPendingInstall(origin).catch(() => {})
    const priorVersion = await playablePriorVersion()
    tell({
      type: 'runtime:error',
      message: error instanceof Error ? error.message : String(error),
      ...(priorVersion ? { priorVersion } : {})
    })
  }
}

// 安装失败时，检查上一版本是否仍完整可玩：shell 据此决定回退旧版而不是注销 SW
async function playablePriorVersion(): Promise<string | null> {
  try {
    const meta = await readMeta(self.location.origin)
    if (!meta) return null
    const cache = await caches.open(`bundle-${meta.version}`)
    const hit = await cache.match(assetCacheKey(meta.entry, self.location.origin))
    return hit ? meta.version : null
  } catch {
    return null
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

  if (decision.kind === 'passthrough') {
    try {
      return await fetch(event.request)
    } catch (error) {
      // 离线且未安装时 /__bootstrap 无法回源，给出可理解的提示而不是浏览器网络错误
      if (url.pathname === BOOTSTRAP_PATH || url.pathname.startsWith(`${BOOTSTRAP_PATH}/`)) {
        return new Response(OFFLINE_BOOTSTRAP_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        })
      }
      throw error
    }
  }
  if (decision.kind === 'robots') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (decision.kind === 'redirect-bootstrap') return bootstrapRedirect(meta, url.search)
  if (decision.kind === 'not-found') return new Response(null, { status: 404 })

  const cache = await caches.open(`bundle-${meta!.version}`)
  const hit = await cache.match(assetCacheKey(decision.path, self.location.origin))
  if (!hit) {
    // 缓存被回收时用持久化的 meta 重建安装参数，回到 bootstrap 重下（自愈）
    if (event.request.mode === 'navigate') return bootstrapRedirect(meta, url.search)
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
    return new Response(event.request.method === 'HEAD' ? null : injectAgent(html, meta!), { status: 200, headers })
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

// 缓存缺失/无版本时回 bootstrap；meta 存在则带上完整安装参数，让 shell 能自愈重装
function bootstrapRedirect(meta: RuntimeMeta | null, search: string): Response {
  const hash = new URLSearchParams()
  if (meta) {
    hash.set('v', meta.version)
    hash.set('id', meta.id)
    hash.set('entry', meta.entry)
    hash.set('bundle', meta.bundleUrl)
    hash.set('sha', meta.sha256)
    if (meta.features && Object.keys(meta.features).length > 0) hash.set('features', JSON.stringify(meta.features))
  }
  const fragment = hash.toString()
  return Response.redirect(new URL(`${BOOTSTRAP_PATH}${search}${fragment ? `#${fragment}` : ''}`, self.location.origin).href, 302)
}

function injectAgent(html: string, meta: RuntimeMeta): string {
  const attrs = ` data-game-id="${escapeAttribute(meta.id)}" data-game-version="${escapeAttribute(meta.version)}"`
  const tag = `<script src="/agent.js?host=${encodeURIComponent(meta.hostOrigin)}"></script>`
  const withMeta = html.replace(/<html(?=[\s>])/i, `<html${attrs}`)
  const headIndex = withMeta.search(/<head[^>]*>/i)
  if (headIndex >= 0) {
    const insertAt = withMeta.indexOf('>', headIndex) + 1
    return withMeta.slice(0, insertAt) + tag + withMeta.slice(insertAt)
  }
  const htmlIndex = withMeta.search(/<html[^>]*>/i)
  if (htmlIndex >= 0) {
    const insertAt = withMeta.indexOf('>', htmlIndex) + 1
    return withMeta.slice(0, insertAt) + tag + withMeta.slice(insertAt)
  }
  return tag + withMeta
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

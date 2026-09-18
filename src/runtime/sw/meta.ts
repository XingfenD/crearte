import type { FeatureFlags } from '../bridge/protocol'

export interface RuntimeMeta {
  id: string
  version: string
  entry: string
  hostOrigin: string
  bundleUrl: string
  sha256: string
  installedAt: number
  features?: Partial<FeatureFlags>
}

const META_CACHE = 'runtime-meta'
const META_KEY = '/__meta'
const PENDING_KEY = '/__pending'

// activate 清理时保留哪些缓存：正在安装（pending）与已安装（meta）的版本都必须保留。
// 两者都为空时返回单元素集合，调用方据此跳过清理——首次安装的 activate 绝不能再删 bundle-*。
export function cachesToKeep(metaVersion: string | null, pendingVersion: string | null): Set<string> {
  const keep = new Set<string>(['runtime-meta'])
  if (metaVersion) keep.add(`bundle-${metaVersion}`)
  if (pendingVersion) keep.add(`bundle-${pendingVersion}`)
  return keep
}

export async function readMeta(origin: string): Promise<RuntimeMeta | null> {
  const cache = await caches.open(META_CACHE)
  const hit = await cache.match(new URL(META_KEY, origin).href)
  if (!hit) return null
  try {
    return (await hit.json()) as RuntimeMeta
  } catch {
    return null
  }
}

export async function writeMeta(meta: RuntimeMeta, origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.put(new URL(META_KEY, origin).href, new Response(JSON.stringify(meta), {
    headers: { 'Content-Type': 'application/json' }
  }))
}

export async function clearMeta(origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.delete(new URL(META_KEY, origin).href)
}

export async function writePendingInstall(version: string, origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.put(new URL(PENDING_KEY, origin).href, new Response(version, {
    headers: { 'Content-Type': 'text/plain' }
  }))
}

export async function readPendingInstall(origin: string): Promise<string | null> {
  const cache = await caches.open(META_CACHE)
  const hit = await cache.match(new URL(PENDING_KEY, origin).href)
  if (!hit) return null
  try {
    return await hit.text()
  } catch {
    return null
  }
}

export async function clearPendingInstall(origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.delete(new URL(PENDING_KEY, origin).href)
}

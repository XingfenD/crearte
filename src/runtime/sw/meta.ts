export interface RuntimeMeta {
  id: string
  version: string
  entry: string
  hostOrigin: string
  installedAt: number
}

const META_CACHE = 'runtime-meta'
const META_KEY = '/__meta'

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

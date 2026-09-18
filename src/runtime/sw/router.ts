export const BOOTSTRAP_PATH = '/__bootstrap'
export const AGENT_URL = '/agent.js'
export const AGENT_CACHE_PATH = '__agent.js'

export type RouteDecision =
  | { kind: 'passthrough' }
  | { kind: 'robots' }
  | { kind: 'redirect-bootstrap' }
  | { kind: 'not-found' }
  | { kind: 'asset'; path: string }

export function assetCacheKey(path: string, origin: string): string {
  const encoded = path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  return new URL(`/__bundle/${encoded}`, origin).href
}

export function decodeAssetPath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (/[\x00-\x1f\x7f\\]/.test(decoded)) return null
  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const trailingSlash = decoded.endsWith('/')
  return segments.join('/') + (trailingSlash && segments.length > 0 ? '/' : '')
}

export function routeRequest(args: {
  pathname: string
  isNavigation: boolean
  hasActiveVersion: boolean
  entry: string
}): RouteDecision {
  const { pathname, isNavigation, hasActiveVersion, entry } = args
  if (pathname === BOOTSTRAP_PATH || pathname.startsWith(`${BOOTSTRAP_PATH}/`)) return { kind: 'passthrough' }
  if (pathname === '/sw.js') return { kind: 'passthrough' }
  if (pathname === '/robots.txt') return { kind: 'robots' }
  if (pathname === AGENT_URL) return { kind: 'asset', path: AGENT_CACHE_PATH }
  if (!hasActiveVersion) return isNavigation ? { kind: 'redirect-bootstrap' } : { kind: 'not-found' }
  const decoded = decodeAssetPath(pathname)
  if (decoded === null) return { kind: 'not-found' }
  if (decoded === '' || decoded.endsWith('/')) return { kind: 'asset', path: decoded === '' ? entry : `${decoded}${entry.split('/').pop()}` }
  return { kind: 'asset', path: decoded }
}

export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const start = match[1] === '' ? size - Number(match[2]) : Number(match[1])
  const end = match[1] === '' || match[2] === '' ? size - 1 : Number(match[2])
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

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
  return new URL(`/__bundle/${path}`, origin).href
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

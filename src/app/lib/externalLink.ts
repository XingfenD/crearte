export type InterstitialKind = 'game' | 'link'

export type TargetResult =
  | { status: 'external'; url: string; host: string }
  | { status: 'same-origin'; href: string }
  | { status: 'invalid' }

export const MAX_TARGET_LENGTH = 2048

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function isExternalHref(href: string | null | undefined, origin: string): boolean {
  if (!href) return false
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return false
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false
  return url.origin !== origin
}

export function toInterstitial(href: string, kind: InterstitialKind = 'link'): string {
  return `/out?kind=${kind}&to=${encodeURIComponent(href)}`
}

export function toInterstitialIfExternal(
  href: string,
  origin: string,
  kind: InterstitialKind = 'link'
): string {
  return isExternalHref(href, origin) ? toInterstitial(href, kind) : href
}

export function normalizeKind(raw: string | null | undefined): InterstitialKind {
  return raw === 'game' ? 'game' : 'link'
}

export function parseTarget(raw: string | null | undefined, origin: string): TargetResult {
  if (!raw || raw.length > MAX_TARGET_LENGTH) return { status: 'invalid' }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { status: 'invalid' }
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { status: 'invalid' }
  if (url.origin === origin) {
    return { status: 'same-origin', href: `${url.pathname}${url.search}${url.hash}` }
  }
  return { status: 'external', url: url.toString(), host: url.host }
}

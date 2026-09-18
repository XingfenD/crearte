import type { FeatureFlags } from '../bridge/protocol'

export function buildCsp(features: FeatureFlags, hostOrigin: string): string {
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
    `frame-ancestors ${hostOrigin}`
  ].join('; ')
}

export function securityHeaders(features: FeatureFlags, hostOrigin: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildCsp(features, hostOrigin),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=()'
  }
  if (features.coop) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    headers['Cross-Origin-Resource-Policy'] = 'same-origin'
  }
  return headers
}

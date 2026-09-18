import { describe, expect, test } from 'vitest'
import { DEFAULT_FEATURES } from '../bridge/protocol'
import { buildCsp, securityHeaders } from './csp'

const HOST = 'https://games.example.com'

describe('buildCsp', () => {
  test('安全默认：禁 eval 与 inline script，保留 wasm 与 inline style', () => {
    const csp = buildCsp(DEFAULT_FEATURES, HOST)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain(`frame-ancestors ${HOST}`)
    expect(csp).toContain("connect-src 'self'")
  })
  test('features 逐项放宽', () => {
    const csp = buildCsp({ ...DEFAULT_FEATURES, eval: true, inlineScript: true, inlineStyle: false, wasm: false }, HOST)
    expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'")
    expect(csp).toContain('style-src \'self\';')
    expect(csp).not.toContain('wasm-unsafe-eval')
  })
  test('恶意 hostOrigin 不得注入指令', () => {
    const csp = buildCsp(DEFAULT_FEATURES, "https://evil.test; script-src-elem 'unsafe-inline'")
    expect(csp).not.toContain('script-src-elem')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(buildCsp(DEFAULT_FEATURES, 'https://evil.test;script-src-elem')).toContain("frame-ancestors 'none'")
  })
  test('畸形 hostOrigin 回退 none', () => {
    expect(buildCsp(DEFAULT_FEATURES, 'not a url')).toContain("frame-ancestors 'none'")
  })
})

describe('securityHeaders', () => {
  test('默认头', () => {
    const headers = securityHeaders(DEFAULT_FEATURES, HOST)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['Content-Security-Policy']).toBe(buildCsp(DEFAULT_FEATURES, HOST))
    expect(headers['Cross-Origin-Opener-Policy']).toBeUndefined()
  })
  test('coop=true 时补 COOP/COEP/CORP', () => {
    const headers = securityHeaders({ ...DEFAULT_FEATURES, coop: true }, HOST)
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
})

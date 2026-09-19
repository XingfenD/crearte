import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('vite dev server api proxy', () => {
  it('leaves the proxy unset without VITE_API_PROXY_TARGET', async () => {
    vi.stubEnv('VITE_API_PROXY_TARGET', '')
    vi.resetModules()
    const config = (await import('./vite.config')).default
    expect(config.server?.proxy).toBeUndefined()
  })

  it('proxies /api to VITE_API_PROXY_TARGET when set', async () => {
    vi.stubEnv('VITE_API_PROXY_TARGET', 'http://api:8080')
    vi.resetModules()
    const config = (await import('./vite.config')).default
    expect(config.server?.proxy).toMatchObject({ '/api': { target: 'http://api:8080' } })
  })
})

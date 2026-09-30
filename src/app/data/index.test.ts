// @vitest-environment happy-dom
// P7 起 data/index.ts 引 @/auth（管理面 Bearer）：auth/index.ts 顶层读 window.localStorage，
// node 环境会 ReferenceError；浏览器环境才是本模块的真实运行前提
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('数据源装配（VITE_API_BASE_URL 语义与 auth 模块一致）', () => {
  it('"/"（同源反代，compose dev/prod 形态）→ 启用 API 源并合并', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/')
    vi.resetModules()
    const mod = await import('./index')
    expect(mod.apiRepo).not.toBeNull()
    expect(mod.repo.constructor.name).toBe('MergeContentRepository')
  })

  it('绝对基址 → 启用', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example')
    vi.resetModules()
    const mod = await import('./index')
    expect(mod.apiRepo).not.toBeNull()
  })

  it('空串（noauth 部署）→ 纯静态', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    vi.resetModules()
    const mod = await import('./index')
    expect(mod.apiRepo).toBeNull()
    expect(mod.repo.constructor.name).toBe('StaticContentRepository')
  })
})

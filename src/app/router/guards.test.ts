import { describe, expect, it, test } from 'vitest'
import { resolveNavigation, type NavigationContext } from './guards'

const ctx = (over: Partial<NavigationContext> = {}): NavigationContext => ({
  authEnabled: true, authenticated: true, isAdmin: false, ...over
})
const to = (name: string, meta: Record<string, unknown> = {}, fullPath = `/${name}`) =>
  ({ name, meta, fullPath }) as never

describe('resolveNavigation', () => {
  it('账号关闭时三个 auth 路由都回首页', () => {
    for (const name of ['login', 'register', 'account']) {
      expect(
        resolveNavigation({ name, meta: {}, fullPath: `/${name}` }, { authEnabled: false, authenticated: false, isAdmin: false })
      ).toEqual({ name: 'home' })
    }
  })

  it('账号关闭时普通路由放行', () => {
    expect(
      resolveNavigation({ name: 'game', meta: {}, fullPath: '/games/x' }, { authEnabled: false, authenticated: true, isAdmin: false })
    ).toBe(true)
  })

  it('账号开启时未登录访问受保护路由跳登录并带 next', () => {
    expect(
      resolveNavigation(
        { name: 'account', meta: { requiresAuth: true }, fullPath: '/account' },
        { authEnabled: true, authenticated: false, isAdmin: false }
      )
    ).toEqual({ name: 'login', query: { next: '/account' } })
  })

  it('账号开启时已登录访问受保护路由放行', () => {
    expect(
      resolveNavigation(
        { name: 'account', meta: { requiresAuth: true }, fullPath: '/account' },
        { authEnabled: true, authenticated: true, isAdmin: false }
      )
    ).toBe(true)
  })

  test('requiresAdmin：非 admin 重定向首页，admin 放行', () => {
    expect(resolveNavigation(to('admin', { requiresAuth: true, requiresAdmin: true }), ctx())).toEqual({ name: 'home' })
    expect(resolveNavigation(to('admin', { requiresAuth: true, requiresAdmin: true }), ctx({ isAdmin: true }))).toBe(true)
  })

  // 锁死「requiresAuth 先于 requiresAdmin」的分支顺序：若有人调换 guards.ts 两个 if，
  // 未登录访问 /admin 会静默变成回首页（丢 next 回跳），此用例即红（Task 5 审查补）
  test('未登录访问 /admin → login 带 next（而非直接回首页）', () => {
    expect(resolveNavigation(to('admin', { requiresAuth: true, requiresAdmin: true }, '/admin'), ctx({ authenticated: false })))
      .toEqual({ name: 'login', query: { next: '/admin' } })
  })

  test('未登录访问 /submit → login 带 next 回跳', () => {
    expect(resolveNavigation(to('submit-new', { requiresAuth: true }, '/submit/new'), ctx({ authenticated: false })))
      .toEqual({ name: 'login', query: { next: '/submit/new' } })
  })

  test('auth 未启用：submit/admin 全家重定向首页', () => {
    for (const name of ['submit', 'submit-new', 'submit-edit', 'admin', 'admin-submission']) {
      expect(resolveNavigation(to(name, { requiresAuth: true }), ctx({ authEnabled: false }))).toEqual({ name: 'home' })
    }
  })
})

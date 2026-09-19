import { describe, expect, it } from 'vitest'
import { resolveNavigation } from './guards'

describe('resolveNavigation', () => {
  it('账号关闭时三个 auth 路由都回首页', () => {
    for (const name of ['login', 'register', 'account']) {
      expect(
        resolveNavigation({ name, meta: {}, fullPath: `/${name}` }, { authEnabled: false, authenticated: false })
      ).toEqual({ name: 'home' })
    }
  })

  it('账号关闭时普通路由放行', () => {
    expect(
      resolveNavigation({ name: 'game', meta: {}, fullPath: '/games/x' }, { authEnabled: false, authenticated: true })
    ).toBe(true)
  })

  it('账号开启时未登录访问受保护路由跳登录并带 next', () => {
    expect(
      resolveNavigation(
        { name: 'account', meta: { requiresAuth: true }, fullPath: '/account' },
        { authEnabled: true, authenticated: false }
      )
    ).toEqual({ name: 'login', query: { next: '/account' } })
  })

  it('账号开启时已登录访问受保护路由放行', () => {
    expect(
      resolveNavigation(
        { name: 'account', meta: { requiresAuth: true }, fullPath: '/account' },
        { authEnabled: true, authenticated: true }
      )
    ).toBe(true)
  })
})

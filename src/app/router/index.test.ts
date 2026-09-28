// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './index'

// 用真实路由表 + memory history 验证 game 路由的参数接线（不挂载组件、不触发懒加载）
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('game 路由寻址（复合 id = user/slug）', () => {
  it('/games/:user/:slug 解析出 user 与 slug 两个 props', async () => {
    const router = makeRouter()
    await router.push('/games/fendy/2048')
    expect(router.currentRoute.value.name).toBe('game')
    expect(router.currentRoute.value.params).toMatchObject({ user: 'fendy', slug: '2048' })
  })

  it('单段 /games/2048 不再匹配 game 路由（迁移期由 not-found 兜底）', async () => {
    const router = makeRouter()
    await router.push('/games/2048')
    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('目录路由不受影响', async () => {
    const router = makeRouter()
    await router.push('/games')
    expect(router.currentRoute.value.name).toBe('catalog')
  })
})

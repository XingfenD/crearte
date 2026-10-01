// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { attachTitleHook, routes } from './index'
import { DEFAULT_DESCRIPTION } from '@/lib/pageTitle'

function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  attachTitleHook(router)
  return router
}

beforeEach(() => {
  document.title = ''
})

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

describe('路由级标题基线（afterEach）', () => {
  it('home 恰为站点名整串（D-B 兼容）', async () => {
    const router = makeRouter()
    await router.push('/')
    expect(document.title).toBe('crearte 创艺')
  })

  it('/games 为作品段', async () => {
    const router = makeRouter()
    await router.push('/games')
    expect(document.title).toBe('作品 · crearte 创艺')
  })

  it('/account 为我的账号段', async () => {
    const router = makeRouter()
    await router.push('/account')
    expect(document.title).toBe('我的账号 · crearte 创艺')
  })

  it('未匹配路由为页面不存在段', async () => {
    const router = makeRouter()
    await router.push('/no-such-page')
    expect(document.title).toBe('页面不存在 · crearte 创艺')
  })

  it('每次导航后 meta description 回落默认文案（D-C 离开恢复，审查 ISSUE-1 钉桩）', async () => {
    const meta = () => document.querySelector('meta[name="description"]')?.getAttribute('content')
    const router = makeRouter()
    await router.push('/games/fixture/2048')
    expect(meta()).toBe(DEFAULT_DESCRIPTION)
    await router.push('/games')
    expect(meta()).toBe(DEFAULT_DESCRIPTION)
  })
})

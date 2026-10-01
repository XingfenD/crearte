// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

describe('SPA 导航后焦点（D-E）', () => {
  // happy-dom 的 focus() 只对已插入 document 的元素生效（P10 T5 已验证），
  // 故这里直接往 body 注入与 App.vue 同构的 <main id="main" tabindex="-1">，不 mount 组件。
  beforeEach(() => {
    const main = document.createElement('main')
    main.id = 'main'
    main.setAttribute('tabindex', '-1')
    document.body.appendChild(main)
  })

  // 清理注入元素并.blur 活动元素，避免污染同文件其他 describe 的既有标题用例
  afterEach(() => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    document.getElementById('main')?.remove()
    document.getElementById('probe')?.remove()
  })

  it('路径变化后焦点落在 #main', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.push('/games')
    expect(document.activeElement?.id).toBe('main')
  })

  it('同路径仅改 query（目录标签筛选）不抢焦点', async () => {
    const router = makeRouter()
    await router.push('/games')
    const probe = document.createElement('button')
    probe.id = 'probe'
    document.body.appendChild(probe)
    probe.focus()
    await router.push('/games?tag=数字')
    expect(document.activeElement?.id).toBe('probe')
  })

  it('#main 缺失时静默 no-op，标题职责照常执行', async () => {
    document.getElementById('main')?.remove()
    const router = makeRouter()
    await expect(router.push('/docs')).resolves.not.toThrow()
    expect(document.title).toBe('文档 · crearte 创艺')
  })
})

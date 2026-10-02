// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import FilterDrawer from './FilterDrawer.vue'

// P13-T3 / D-E 迁移 3/3：遮罩 `backdrop:bg-ink/60` → `backdrop:bg-scrim/80`。
// spike 4 实测：暗色下 color-mix(in oklab, var(--color-ink) 60%, transparent)
// 解析为 oklab(L=0.962) = 泛白，遮罩失效；scrim(#0d0b08) 两主题同值、不翻转。
// happy-dom 不算 ::backdrop 计算值（真实值由 e2e/dark.spec.ts 钉），此处钉类名防回退。

async function mountDrawer() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/games', name: 'catalog', component: { template: '<div />' } }]
  })
  await router.push('/games')
  await router.isReady()
  return mount(FilterDrawer, {
    props: { open: false, games: [], count: 0 },
    global: { plugins: [router] }
  })
}

describe('FilterDrawer 遮罩令牌（P13-T3 / D-E）', () => {
  it('dialog 用 backdrop:bg-scrim/80（回退防线：不得再出现 backdrop:bg-ink/60）', async () => {
    const w = await mountDrawer()
    const cls = w.get('dialog').classes()
    expect(cls).toContain('backdrop:bg-scrim/80')
    expect(cls).not.toContain('backdrop:bg-ink/60')
    // 分离由边框侧提供（D-F）：border-t-[3px] border-ink 原样
    expect(cls).toContain('border-t-[3px]')
    expect(cls).toContain('border-ink')
    expect(cls).toContain('bg-paper')
  })
})

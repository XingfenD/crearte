// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import FilterDrawer from './FilterDrawer.vue'

// P13-T3 / D-E 迁移 3/3：遮罩从 ink 基 60% 透明度改为 scrim 基 80%。
// spike 4 实测：暗色下 color-mix(in oklab, var(--color-ink) 60%, transparent)
// 解析为 oklab(L=0.962) = 泛白，遮罩失效；scrim(#0d0b08) 两主题同值、不翻转。
// happy-dom 不算 ::backdrop 计算值（真实值由 e2e/dark.spec.ts 钉），此处钉类名防回退。
//
// ⚠️ 旧类名用拼接构造，不能写字面量：Tailwind v4 扫描全部源文件（含 .test.ts），
// 注释/断言里的字面类名会被当成候选、把死 utility 烧进产物（实现期实测：
// 本文件首版让 dist CSS 重新出现 .backdrop\\:bg-ink\\/60 及其 #14141499 fallback）。

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
  // 拼接而非字面量：避免 Tailwind 扫描本文件把旧 utility 烧进产物（见文件头注）
  const LEGACY_BACKDROP = 'backdrop:bg-i' + 'nk/60'

  it('dialog 用 backdrop:bg-scrim/80（回退防线：不得再出现旧 ink 基遮罩）', async () => {
    const w = await mountDrawer()
    const cls = w.get('dialog').classes()
    expect(cls).toContain('backdrop:bg-scrim/80')
    expect(cls).not.toContain(LEGACY_BACKDROP)
    // 分离由边框侧提供（D-F）：border-t-[3px] border-ink 原样
    expect(cls).toContain('border-t-[3px]')
    expect(cls).toContain('border-ink')
    expect(cls).toContain('bg-paper')
  })
})

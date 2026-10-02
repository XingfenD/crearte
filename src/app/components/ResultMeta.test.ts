// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ResultMeta from './ResultMeta.vue'

// P13-T3 / D-A 迁移 1/3：筛选角标 `bg-accent text-ink` → `bg-accent-ink text-paper`。
// 反面实测（FINDINGS 第 7 轮）：若不迁移，暗色 `ink on accent` = 2.31 ❌（亮色 5.06 侥幸过）
// → contrast.test.ts 的双主题守卫无法钉住「组件用了哪个令牌」，必须在此钉类名。
// 迁移后 accent 成为纯非文本令牌（焦点环/h3 左边框/li 圆点）。

beforeEach(() => {
  vi.clearAllMocks()
})

async function mountMeta(route = '/games?type=puzzle'): Promise<ReturnType<typeof mount>> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/games', name: 'catalog', component: { template: '<div />' } }
    ]
  })
  await router.push(route)
  await router.isReady()
  return mount(ResultMeta, { props: { count: 3 }, global: { plugins: [router] } })
}

describe('ResultMeta 筛选角标配色（P13-T3 / D-A）', () => {
  it('activeCount>0 时角标用 bg-accent-ink + text-paper（暗色 ink on accent=2.31 的反面钉桩）', async () => {
    // type=puzzle → activeCount=1 → 角标渲染
    const w = await mountMeta('/games?type=puzzle')
    await w.vm.$nextTick()
    const badge = w.get('button span')
    expect(badge.text()).toBe('1')
    const cls = badge.classes()
    expect(cls).toContain('bg-accent-ink')
    expect(cls).toContain('text-paper')
    // 回退防线：迁移前的形态必须不存在
    expect(cls).not.toContain('bg-accent')
    expect(cls).not.toContain('text-ink')
  })

  it('无激活筛选时角标不渲染', async () => {
    const w = await mountMeta('/games')
    await w.vm.$nextTick()
    expect(w.find('button span').exists()).toBe(false)
  })

  it('P12 缺口 C：排序 select 包裹层的 relative min-w-0 原样（不得回退项）', async () => {
    const w = await mountMeta()
    await w.vm.$nextTick()
    const wrap = w.get('#catalog-sort').element.parentElement
    expect(wrap?.className).toContain('relative')
    expect(wrap?.className).toContain('min-w-0')
  })
})

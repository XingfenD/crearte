// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'

enableAutoUnmount(afterEach)

const h = vi.hoisted(() => ({
  listGames: vi.fn(),
  listDocs: vi.fn(),
  logout: vi.fn(),
  // P12-T1：长名场景需改 display_name（默认 'tester' 保持既有六个用例行为不变）
  displayName: 'tester'
}))

vi.mock('@/data', () => ({
  repo: { listGames: h.listGames, listDocs: h.listDocs }
}))

vi.mock('@/auth', () => ({
  authEnabled: true,
  session: {
    state: {
      user: {
        id: 'u1',
        email: 'tester@e2e.local',
        // getter 而非字面量：各用例改 h.displayName 后 mount 即生效
        get display_name() {
          return h.displayName
        },
        username: 'tester',
        role: 'user'
      }
    },
    logout: h.logout
  }
}))

beforeEach(() => {
  vi.clearAllMocks()
  h.displayName = 'tester'
  h.listGames.mockResolvedValue([])
  h.listDocs.mockResolvedValue([])
})

async function mountHeader() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/games', name: 'catalog', component: { template: '<div />' } },
      // 其余页头链接仅需可解析，避免 vue-router 未匹配告警
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
  await router.isReady()
  // 挂到 document：happy-dom 对未连接节点的 focus() 不生效（Esc 回焦断言依赖连接态）
  const w = mount(AppHeader, { attachTo: document.body, global: { plugins: [router] } })
  await w.vm.$nextTick()
  return { w, router }
}

function detailsOf(w: Awaited<ReturnType<typeof mountHeader>>['w']): HTMLDetailsElement {
  return w.get('details').element as HTMLDetailsElement
}

/** 用户点击 summary 打开菜单：同步触发 toggle，让 @toggle 同步内部 menuOpen */
async function openMenu(w: Awaited<ReturnType<typeof mountHeader>>['w']): Promise<HTMLDetailsElement> {
  const details = detailsOf(w)
  details.open = true
  await w.vm.$nextTick()
  return details
}

describe('AppHeader 用户下拉：外点关闭（D-K）', () => {
  it('菜单打开时，菜单外 pointerdown 关闭菜单', async () => {
    const { w } = await mountHeader()
    const details = await openMenu(w)
    expect(details.open).toBe(true)

    // happy-dom 支持 PointerEvent 构造器；外点在 document.body 上冒泡到 document
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()

    expect(details.open).toBe(false)
  })

  it('菜单内 pointerdown 不关闭菜单', async () => {
    const { w } = await mountHeader()
    const details = await openMenu(w)

    const inner = w.get('details a').element
    inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()

    expect(details.open).toBe(true)
  })
})

describe('AppHeader 用户下拉：Esc 关闭并回焦（D-K）', () => {
  it('Escape 关闭菜单且焦点回到 summary', async () => {
    const { w } = await mountHeader()
    const details = await openMenu(w)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await w.vm.$nextTick()

    expect(details.open).toBe(false)
    expect(document.activeElement).toBe(w.get('summary').element)
  })

  it('菜单未打开时 Escape 不夺焦', async () => {
    const { w } = await mountHeader()
    const summary = w.get('summary').element
    ;(document.activeElement as HTMLElement | null)?.blur?.()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await w.vm.$nextTick()

    expect(document.activeElement).not.toBe(summary)
  })
})

describe('AppHeader 用户下拉：路由变化收起（既有行为回归）', () => {
  it('导航后菜单收起，且程序性 open=false 经 @toggle 同步 menuOpen（不留脏状态）', async () => {
    const { w, router } = await mountHeader()
    const details = await openMenu(w)
    expect(details.open).toBe(true)

    // 既有 watch(route.fullPath)：导航即收起——点击菜单项走的就是这条路
    await router.push('/games')
    await w.vm.$nextTick()

    expect(details.open).toBe(false)

    // menuOpen 已随 @toggle 归位的间接钉桩（script setup 不暴露内部，故走行为面）：
    // keydown handler 以 menuOpen 为门控，若残留 true，Esc 会把焦点抢回 summary
    const summary = w.get('summary').element
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await w.vm.$nextTick()
    expect(document.activeElement).not.toBe(summary)

    // 外点同样幂等：已收起的菜单不再被触发
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(details.open).toBe(false)
  })
})

describe('AppHeader 长名截断（P12-T1 / D-A / D-G）', () => {
  const LONG = 'x'.repeat(60) // 60 字不可断行 ASCII：后端 maxDisplayNameLen 的合法上限

  it('60 字名下 summary 带 title 属性且值为全名（截断不丢信息）', async () => {
    h.displayName = LONG
    const { w } = await mountHeader()
    expect(w.get('summary').attributes('title')).toBe(LONG)
  })

  it('名字包 truncate span，▾ 字形包 shrink-0 span 且 aria-hidden（可访问名不含 ▾）', async () => {
    h.displayName = LONG
    const { w } = await mountHeader()
    const spans = w.findAll('summary > span')
    expect(spans).toHaveLength(2)
    // 名字 span：truncate + min-w-0，文本为全名
    expect(spans[0].classes()).toContain('truncate')
    expect(spans[0].classes()).toContain('min-w-0')
    expect(spans[0].text()).toBe(LONG)
    // ▾ span：aria-hidden 把它排除在可访问名之外（happy-dom 不算 accname，
    // 故钉结构；真实可访问名与 caret 可见性由 e2e/responsive.spec.ts 兼顾）
    expect(spans[1].attributes('aria-hidden')).toBe('true')
    expect(spans[1].text()).toBe('▾')
    // summary 的可见文本 = 全名 + ▾（Vue 编译时折叠了两 span 间的空白，间距由 flex gap-1 负责），
    // 但 ▾ 已声明装饰性 → accname 仅剩全名
    expect(w.get('summary').text()).toBe(`${LONG}▾`)
  })

  it('summary 带 max-w-[6rem] 宽度上限与 flex/min-w-0（F3 形态钉桩）', async () => {
    h.displayName = LONG
    const { w } = await mountHeader()
    const cls = w.get('summary').classes()
    expect(cls).toContain('flex')
    expect(cls).toContain('max-w-[6rem]')
    expect(cls).toContain('min-w-0')
  })
})

describe('AppHeader 用户下拉：监听清理', () => {
  it('卸载时以 pointerdown/keydown 成对调用 removeEventListener（审查补强：not.toThrow 证明不了移除）', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { w } = await mountHeader()
    await openMenu(w)

    w.unmount()

    // 钉住真实移除：两个具名事件都被解绑（handler 引用在组件作用域内，以事件名校验成对清理）
    const removed = removeSpy.mock.calls.map(([type]) => type)
    expect(removed).toContain('pointerdown')
    expect(removed).toContain('keydown')

    // 行为面兜底：卸载后再派发不抛错（detailsRef 已空，handler 短路）
    expect(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))).not.toThrow()
    expect(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))).not.toThrow()
    removeSpy.mockRestore()
  })
})

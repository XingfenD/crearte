// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppHeader from './AppHeader.vue'

enableAutoUnmount(afterEach)

const h = vi.hoisted(() => ({
  listGames: vi.fn(),
  listDocs: vi.fn(),
  logout: vi.fn()
}))

vi.mock('@/data', () => ({
  repo: { listGames: h.listGames, listDocs: h.listDocs }
}))

vi.mock('@/auth', () => ({
  authEnabled: true,
  session: {
    state: {
      user: { id: 'u1', email: 'tester@e2e.local', display_name: 'tester', username: 'tester', role: 'user' }
    },
    logout: h.logout
  }
}))

beforeEach(() => {
  vi.clearAllMocks()
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

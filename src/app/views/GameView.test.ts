// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import GameView from './GameView.vue'

const h = vi.hoisted(() => ({ getGame: vi.fn() }))

vi.mock('@/data', () => ({
  repo: { getGame: h.getGame },
  NotFoundError: class NotFoundError extends Error {}
}))

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/games', name: 'games', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
})

const minimalGame = {
  id: 'fixture/minimal',
  user: 'fixture',
  slug: 'minimal',
  name: '最小作品',
  durationMinutes: { min: 1, max: 2 },
  type: 'other' as const,
  tags: [],
  addedAt: '2026-09-29'
}

describe('GameView 可选字段兜底', () => {
  it('作者缺省显示 username、无描述段、无开始体验链接', async () => {
    h.getGame.mockResolvedValue(minimalGame)
    const w = mount(GameView, {
      props: { user: 'fixture', slug: 'minimal' },
      global: {
        plugins: [router],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    })
    await flushPromises()
    expect(w.text()).toContain('作者：')
    expect(w.text()).toContain('fixture')
    expect(w.text()).not.toContain('开始体验')
  })
})

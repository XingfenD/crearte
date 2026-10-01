// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GameSummary } from '@/data/types'
import LandingView from './LandingView.vue'

const h = vi.hoisted(() => ({ listGames: vi.fn() }))

vi.mock('@/data', () => ({ repo: { listGames: h.listGames } }))

const KEY = 'crearte.recent.v1'

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="$router.resolve(to).href"><slot /></a>'
}

const GameCardStub = {
  props: ['game'],
  template: '<div class="game-card-stub" :data-id="game.id">{{ game.name }}</div>'
}

function game(id: string, name: string, addedAt = '2026-09-01'): GameSummary {
  return { id, user: 'u', slug: id, name, durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt }
}

const fixture = [game('a', '作品甲'), game('b', '作品乙')]

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  document.title = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: { template: '<div />' } }]
  })
  await router.push('/')
})

function mountLanding() {
  return mount(LandingView, {
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, GameCard: GameCardStub }
    }
  })
}

function seed(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids.map((id, i) => ({ id, at: `2026-09-0${i + 1}` }))))
}

describe('LandingView 最近玩过条带（D-I/D-J）', () => {
  it('有可解析记录 → 条带渲染、顺序新→旧、丢弃悬空 id', async () => {
    h.listGames.mockResolvedValue(fixture)
    seed(['b', 'a', 'gone'])
    const w = mountLanding()
    await flushPromises()
    const strip = w.find('[data-testid="recent-strip"]')
    expect(strip.exists()).toBe(true)
    expect(strip.text()).toContain('继续游玩 · RECENTLY PLAYED')
    const cards = strip.findAll('.game-card-stub')
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.attributes('data-id'))).toEqual(['b', 'a'])
  })

  it('零记录 → 条带整段不渲染（landing.spec 钉桩零触碰）', async () => {
    h.listGames.mockResolvedValue(fixture)
    const w = mountLanding()
    await flushPromises()
    expect(w.find('[data-testid="recent-strip"]').exists()).toBe(false)
    // hero 与精选仍在，页面结构不受影响
    expect(w.get('h1').text()).toBe('crearte')
    expect(w.text()).toContain('精选 · SELECTED')
  })

  it('记录全不可解析 → 条带整段不渲染', async () => {
    h.listGames.mockResolvedValue(fixture)
    seed(['gone', 'also-gone'])
    const w = mountLanding()
    await flushPromises()
    expect(w.find('[data-testid="recent-strip"]').exists()).toBe(false)
  })

  it('损坏 JSON → 条带不渲染且不抛错', async () => {
    h.listGames.mockResolvedValue(fixture)
    localStorage.setItem(KEY, 'not-json')
    const w = mountLanding()
    await flushPromises()
    expect(w.find('[data-testid="recent-strip"]').exists()).toBe(false)
  })

  it('展示上限 6（对齐 FEATURED_LIMIT）', async () => {
    const many = Array.from({ length: 8 }, (_, i) => game(`g${i}`, `作品${i}`, `2026-09-0${i % 9 + 1}`))
    h.listGames.mockResolvedValue(many)
    seed(many.map((g) => g.id))
    const w = mountLanding()
    await flushPromises()
    expect(w.find('[data-testid="recent-strip"]').findAll('.game-card-stub')).toHaveLength(6)
  })
})

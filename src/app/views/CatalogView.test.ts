// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GameSummary } from '@/data/types'
import CatalogView from './CatalogView.vue'

const h = vi.hoisted(() => ({ listGames: vi.fn() }))

vi.mock('@/data', () => ({ repo: { listGames: h.listGames } }))

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="$router.resolve(to).href"><slot /></a>'
}

const GameCardStub = {
  props: ['game'],
  template: '<div class="game-card-stub">{{ game.name }}</div>'
}

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  document.title = ''
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/games', name: 'catalog', component: { template: '<div />' } }
    ]
  })
  await router.push('/games')
})

const games: GameSummary[] = [
  { id: 'fixture/2048', user: 'fixture', slug: '2048', name: '2048', durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: [], addedAt: '2026-09-17' }
]

function mountCatalog() {
  return mount(CatalogView, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub, GameCard: GameCardStub } }
  })
}

describe('CatalogView 搜索态标题', () => {
  it('q=2048 时标题带搜索词', async () => {
    await router.replace('/games?q=2048')
    h.listGames.mockResolvedValue(games)
    mountCatalog()
    await flushPromises()
    expect(document.title).toBe('搜索「2048」 · 作品 · crearte 创艺')
  })

  it('无查询时标题为作品基线', async () => {
    h.listGames.mockResolvedValue(games)
    mountCatalog()
    await flushPromises()
    expect(document.title).toBe('作品 · crearte 创艺')
  })

  it('筛选词变化即时反映', async () => {
    h.listGames.mockResolvedValue(games)
    mountCatalog()
    await flushPromises()
    await router.replace('/games?q=2048')
    await flushPromises()
    expect(document.title).toBe('搜索「2048」 · 作品 · crearte 创艺')
  })
})

describe('CatalogView 骨架', () => {
  it('加载中显示 6 张游戏卡骨架（网格页保持 cards）', async () => {
    h.listGames.mockReturnValue(new Promise(() => {}))
    const w = mountCatalog()
    await flushPromises()
    expect(w.findAll('.aspect-video')).toHaveLength(6)
  })
})

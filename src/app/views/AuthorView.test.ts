// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GameSummary } from '@/data/types'
import AuthorView from './AuthorView.vue'

const h = vi.hoisted(() => ({ listGames: vi.fn() }))

vi.mock('@/data', async () => ({
  repo: { listGames: h.listGames },
  // 复用真实实现：用例要钉住 resolveUserSlug 对旧式 id 的回退行为
  resolveUserSlug: (await import('@/data/types')).resolveUserSlug
}))

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="$router.resolve(to).href"><slot /></a>'
}

const GameCardStub = {
  props: ['game'],
  template: '<div class="game-card-stub" :data-added-at="game.addedAt">{{ game.name }}</div>'
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
  await router.push('/')
})

// 夹具（模块内常量）：matching = 2 个 alice + 1 个 bob，addedAt 分别 2026-09-01/2026-09-03/2026-09-02
const matching: GameSummary[] = [
  { id: 'alice/first', user: 'alice', slug: 'first', name: '作品甲', durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-01' },
  { id: 'alice/third', user: 'alice', slug: 'third', name: '作品丙', durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-03' },
  { id: 'bob/second', user: 'bob', slug: 'second', name: '作品乙', durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-02' }
]

const plainLegacy: GameSummary = {
  id: 'plain-legacy', name: '遗留单段', durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-04'
}

const compositeLegacy: GameSummary = {
  id: 'alice/legacy', name: '遗留复合', durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-04'
}

function mountAuthor(user: string) {
  return mount(AuthorView, {
    props: { user },
    global: {
      plugins: [router],
      stubs: { RouterLink: RouterLinkStub, GameCard: GameCardStub }
    }
  })
}

describe('AuthorView 作者页（/users/:user）', () => {
  it('只显示该作者作品并按最新上架排序', async () => {
    h.listGames.mockResolvedValue(matching)
    const w = mountAuthor('alice')
    await flushPromises()
    const cards = w.findAll('.game-card-stub')
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.attributes('data-added-at'))).toEqual(['2026-09-03', '2026-09-01'])
    expect(w.text()).not.toContain('作品乙')
  })

  it('旧式单段 id 作品不匹配任何作者页', async () => {
    h.listGames.mockResolvedValue([...matching, plainLegacy])
    const w = mountAuthor('alice')
    await flushPromises()
    expect(w.findAll('.game-card-stub')).toHaveLength(2)
    expect(w.text()).not.toContain('遗留单段')
  })

  it('复合 id 但缺 user 字段时按 id 前段解析', async () => {
    h.listGames.mockResolvedValue([...matching, compositeLegacy])
    const w = mountAuthor('alice')
    await flushPromises()
    expect(w.findAll('.game-card-stub')).toHaveLength(3)
    expect(w.text()).toContain('遗留复合')
  })

  it('未知作者渲染空态而非报错', async () => {
    h.listGames.mockResolvedValue(matching)
    const w = mountAuthor('ghost')
    await flushPromises()
    expect(w.text()).toContain('该作者暂无已上架作品')
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.findAll('.game-card-stub')).toHaveLength(0)
  })

  it('头部展示 @username、作品数与面包屑', async () => {
    h.listGames.mockResolvedValue(matching)
    const w = mountAuthor('alice')
    await flushPromises()
    expect(w.text()).toContain('@alice')
    expect(w.text()).toContain('2')
    const crumb = w.findAll('a').find((a) => a.text() === '目录')
    expect(crumb?.attributes('href')).toBe('/games')
  })

  it('加载失败进入错误态且可重试', async () => {
    h.listGames.mockRejectedValueOnce(new Error('加载失败')).mockResolvedValue(matching)
    const w = mountAuthor('alice')
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(true)
    expect(w.findAll('.game-card-stub')).toHaveLength(0)
    await w.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(w.findAll('.game-card-stub')).toHaveLength(2)
  })

  it('标题精化为首个作品的作者显示名', async () => {
    h.listGames.mockResolvedValue([{ ...matching[0], author: { name: '笔锋' } }])
    mountAuthor('alice')
    await flushPromises()
    expect(document.title).toBe('笔锋 · 创作者 · crearte 创艺')
  })

  it('列表为空时回退到路由 user', async () => {
    h.listGames.mockResolvedValue([])
    mountAuthor('fixture')
    await flushPromises()
    expect(document.title).toBe('fixture · 创作者 · crearte 创艺')
  })
})

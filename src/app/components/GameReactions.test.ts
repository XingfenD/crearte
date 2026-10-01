// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import GameReactions from '@/components/GameReactions.vue'
import type { Game } from '@/data/types'

const h = vi.hoisted(() => ({
  enabled: true,
  token: 'tok' as string | null,
  setFavorite: vi.fn(),
  setRating: vi.fn(),
  unrate: vi.fn(),
  fetchMine: vi.fn()
}))

vi.mock('@/lib/reactions', () => ({
  get reactionsEnabled() {
    return h.enabled
  },
  setFavorite: h.setFavorite,
  setRating: h.setRating,
  unrate: h.unrate,
  fetchMine: h.fetchMine,
  AuthRequiredError: class AuthRequiredError extends Error {}
}))

vi.mock('@/auth', () => ({
  session: { getToken: () => h.token, state: { status: 'anonymous', user: null }, invalidate: vi.fn() }
}))

const game = {
  id: 'alice/work',
  user: 'alice',
  slug: 'work',
  name: '测试作品',
  durationMinutes: { min: 1, max: 2 },
  type: 'other',
  tags: [],
  addedAt: '2026-09-29',
  ratingAvg: 4.5,
  ratingCount: 2,
  favoriteCount: 3
} satisfies Game

const VIEW = { favoriteCount: 3, ratingCount: 2, ratingAvg: 4.5, favorited: true, rated: false }

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  h.enabled = true
  h.token = 'tok'
  h.fetchMine.mockResolvedValue({ favorites: [], ratings: {} })
  h.setFavorite.mockResolvedValue(VIEW)
  h.setRating.mockResolvedValue(VIEW)
  h.unrate.mockResolvedValue({ ...VIEW, favorited: false })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/games/:user/:slug', name: 'game', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } }
    ]
  })
  await router.push('/games/alice/work')
})

function mountReactions() {
  return mount(GameReactions, { props: { game }, global: { plugins: [router] } })
}

describe('GameReactions 聚合文案与星标', () => {
  it('显示 `4.5 · 2 人评分 · 3 收藏`', async () => {
    const w = mountReactions()
    await flushPromises()
    expect(w.text()).toContain('4.5 · 2 人评分 · 3 收藏')
  })

  it('未评分时均值 floor 点亮实心星（4.5 → 4 实心）', async () => {
    const w = mountReactions()
    await flushPromises()
    for (const i of [1, 2, 3, 4]) expect(w.get(`[data-testid="star-${i}"]`).text()).toBe('★')
    expect(w.get('[data-testid="star-5"]').text()).toBe('☆')
  })

  it('已评时点亮个人分而非均值', async () => {
    h.fetchMine.mockResolvedValue({ favorites: [], ratings: { 'alice/work': 2 } })
    const w = mountReactions()
    await flushPromises()
    expect(w.get('[data-testid="star-2"]').text()).toBe('★')
    expect(w.get('[data-testid="star-3"]').text()).toBe('☆')
  })

  it('ratingCount=0 → 暂无评分文案', async () => {
    const w = mount(GameReactions, {
      props: { game: { ...game, ratingCount: 0, ratingAvg: undefined, favoriteCount: 0 } },
      global: { plugins: [router] }
    })
    await flushPromises()
    expect(w.text()).toContain('暂无评分 · 0 收藏')
  })
})

describe('GameReactions 星标可访问名（D-H）', () => {
  it('star-1..5 的 aria-label 为「评 N 星」', async () => {
    const w = mountReactions()
    await flushPromises()
    for (const i of [1, 2, 3, 4, 5]) {
      expect(w.get(`[data-testid="star-${i}"]`).attributes('aria-label')).toBe(`评 ${i} 星`)
    }
  })

  it('内层字形 span 有 aria-hidden="true"', async () => {
    const w = mountReactions()
    await flushPromises()
    for (const i of [1, 2, 3, 4, 5]) {
      expect(w.get(`[data-testid="star-${i}"]`).get('span').attributes('aria-hidden')).toBe('true')
    }
  })

  it('分组 role=group，未评时 aria-label 为「评分」', async () => {
    const w = mountReactions()
    await flushPromises()
    const group = w.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('评分')
  })

  it('已评（fetchMine ratings 4 分）时分组 aria-label 为「评分：4 星」', async () => {
    h.fetchMine.mockResolvedValue({ favorites: [], ratings: { 'alice/work': 4 } })
    const w = mountReactions()
    await flushPromises()
    const group = w.get('[role="group"]')
    expect(group.attributes('aria-label')).toBe('评分：4 星')
  })
})

describe('GameReactions 个人态初始化', () => {
  it('登录态 onMounted fetchMine 后 ♥ aria-pressed 与收藏态一致', async () => {
    h.fetchMine.mockResolvedValue({ favorites: ['alice/work'], ratings: {} })
    const w = mountReactions()
    await flushPromises()
    expect(h.fetchMine).toHaveBeenCalledTimes(1)
    expect(w.get('[data-testid="fav-btn"]').attributes('aria-pressed')).toBe('true')
  })

  it('无 token 不调 fetchMine', async () => {
    h.token = null
    const w = mountReactions()
    await flushPromises()
    expect(h.fetchMine).not.toHaveBeenCalled()
  })
})

describe('GameReactions 交互', () => {
  it('点 ♥ 未收藏 → setFavorite(alice, work, true)，成功后 ReactionView 全量替换计数', async () => {
    const w = mountReactions()
    await flushPromises()
    h.setFavorite.mockResolvedValue({ favoriteCount: 10, ratingCount: 2, ratingAvg: 4.5, favorited: true, rated: false })
    await w.get('[data-testid="fav-btn"]').trigger('click')
    await flushPromises()
    expect(h.setFavorite).toHaveBeenCalledWith('alice', 'work', true)
    // 全量替换为 10，而非 3+1 自行加减
    expect(w.text()).toContain('10 收藏')
    expect(w.text()).not.toContain('4 收藏')
    expect(w.get('[data-testid="fav-btn"]').attributes('aria-pressed')).toBe('true')
  })

  it('已收藏再点 ♥ → setFavorite(on=false)', async () => {
    h.fetchMine.mockResolvedValue({ favorites: ['alice/work'], ratings: {} })
    const w = mountReactions()
    await flushPromises()
    h.setFavorite.mockResolvedValue({ ...VIEW, favorited: false })
    await w.get('[data-testid="fav-btn"]').trigger('click')
    await flushPromises()
    expect(h.setFavorite).toHaveBeenCalledWith('alice', 'work', false)
    expect(w.get('[data-testid="fav-btn"]').attributes('aria-pressed')).toBe('false')
  })

  it('点星 4 → setRating(alice, work, 4)', async () => {
    const w = mountReactions()
    await flushPromises()
    h.setRating.mockResolvedValue({ ...VIEW, rated: true, score: 4 })
    await w.get('[data-testid="star-4"]').trigger('click')
    await flushPromises()
    expect(h.setRating).toHaveBeenCalledWith('alice', 'work', 4)
  })

  it('当前分 4 再点 4 → unrate（撤评）', async () => {
    h.fetchMine.mockResolvedValue({ favorites: [], ratings: { 'alice/work': 4 } })
    const w = mountReactions()
    await flushPromises()
    h.unrate.mockResolvedValue({ ...VIEW, rated: false })
    await w.get('[data-testid="star-4"]').trigger('click')
    await flushPromises()
    expect(h.unrate).toHaveBeenCalledWith('alice', 'work')
    expect(h.setRating).not.toHaveBeenCalled()
  })

  it('已评 4 点星 2 → 改分为 setRating(2)，不 unrate', async () => {
    h.fetchMine.mockResolvedValue({ favorites: [], ratings: { 'alice/work': 4 } })
    const w = mountReactions()
    await flushPromises()
    h.setRating.mockResolvedValue({ ...VIEW, rated: true, score: 2 })
    await w.get('[data-testid="star-2"]').trigger('click')
    await flushPromises()
    expect(h.setRating).toHaveBeenCalledWith('alice', 'work', 2)
    expect(h.unrate).not.toHaveBeenCalled()
  })
})

describe('GameReactions 匿名与在途锁', () => {
  it('匿名点 ♥ → router.push 登录页带 next', async () => {
    h.token = null
    const w = mountReactions()
    await flushPromises()
    await w.get('[data-testid="fav-btn"]').trigger('click')
    await flushPromises()
    expect(h.setFavorite).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.next).toBe('/games/alice/work')
  })

  it('匿名点星 → 同样跳登录', async () => {
    h.token = null
    const w = mountReactions()
    await flushPromises()
    await w.get('[data-testid="star-3"]').trigger('click')
    await flushPromises()
    expect(h.setRating).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('在途 busy 锁全部按钮，成功后解锁', async () => {
    const w = mountReactions()
    await flushPromises()
    let resolveFav: (v: unknown) => void = () => {}
    h.setFavorite.mockImplementation(() => new Promise((r) => { resolveFav = r }))
    await w.get('[data-testid="fav-btn"]').trigger('click')
    expect(w.get('[data-testid="fav-btn"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="star-1"]').attributes('disabled')).toBeDefined()
    // 在途再点无效
    await w.get('[data-testid="star-1"]').trigger('click')
    expect(h.setRating).not.toHaveBeenCalled()
    resolveFav(VIEW)
    await flushPromises()
    expect(w.get('[data-testid="fav-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('失败显示一行 aria-live 错误文本', async () => {
    const w = mountReactions()
    await flushPromises()
    h.setFavorite.mockRejectedValue(new Error('请求失败 500'))
    await w.get('[data-testid="fav-btn"]').trigger('click')
    await flushPromises()
    const live = w.get('[aria-live="polite"].reaction-error')
    expect(live.text()).toContain('请求失败 500')
  })
})

describe('GameReactions noauth 零渲染', () => {
  it('reactionsEnabled=false 时整组件不渲染且不发请求', async () => {
    h.enabled = false
    const w = mountReactions()
    await flushPromises()
    expect(w.find('[data-testid="fav-btn"]').exists()).toBe(false)
    expect(w.text()).toBe('')
    expect(h.fetchMine).not.toHaveBeenCalled()
  })
})

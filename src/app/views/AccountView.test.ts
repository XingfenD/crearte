// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GameSummary } from '@/data/types'
import AccountView from './AccountView.vue'

const h = vi.hoisted(() => ({
  enabled: true,
  status: 'authenticated' as 'anonymous' | 'authenticated',
  listGames: vi.fn(),
  fetchMine: vi.fn(),
  setFavorite: vi.fn()
}))

vi.mock('@/auth', () => ({
  session: {
    state: {
      get status() {
        return h.status
      },
      user: { id: 'u1', email: 'a@b.c', display_name: 'A', username: 'alice', role: 'user' }
    },
    getToken: () => (h.status === 'authenticated' ? 'tok' : null),
    invalidate: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    changePassword: vi.fn()
  },
  authEnabled: true
}))

vi.mock('@/lib/reactions', () => ({
  get reactionsEnabled() {
    return h.enabled
  },
  fetchMine: h.fetchMine,
  setFavorite: h.setFavorite,
  setRating: vi.fn(),
  unrate: vi.fn(),
  AuthRequiredError: class AuthRequiredError extends Error {}
}))

vi.mock('@/data', async () => ({
  repo: { listGames: h.listGames },
  // 复用真实实现：取消收藏路径要按 id 解 user/slug
  resolveUserSlug: (await import('@/data/types')).resolveUserSlug
}))

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

const workA: GameSummary = {
  id: 'alice/work-a', user: 'alice', slug: 'work-a', name: '作品甲',
  durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-01'
}
const workB: GameSummary = {
  id: 'bob/work-b', user: 'bob', slug: 'work-b', name: '作品乙',
  durationMinutes: { min: 1, max: 2 }, type: 'other', tags: [], addedAt: '2026-09-02'
}

let router: ReturnType<typeof createRouter>

function mountAccount() {
  return mount(AccountView, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } }
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  h.enabled = true
  h.status = 'authenticated'
  h.listGames.mockResolvedValue([workA, workB])
  h.fetchMine.mockResolvedValue({ favorites: [], ratings: {} })
  h.setFavorite.mockResolvedValue({ favoriteCount: 0, ratingCount: 0, favorited: false, rated: false })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/account', name: 'account', component: { template: '<div />' } },
      { path: '/games/:user/:slug', name: 'game', component: { template: '<div />' } }
    ]
  })
  await router.push('/account')
})

describe('AccountView 我的反应（P5）', () => {
  it('登录态 onMounted fetchMine + repo.listGames，收藏命中渲染链接行', async () => {
    h.fetchMine.mockResolvedValue({ favorites: ['alice/work-a'], ratings: {} })
    const w = mountAccount()
    await flushPromises()
    expect(h.fetchMine).toHaveBeenCalledTimes(1)
    expect(h.listGames).toHaveBeenCalledTimes(1)
    const link = w.find('[data-testid="my-favorites"] a[href="/games/alice/work-a"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('作品甲')
    expect(w.text()).not.toContain('作品乙')
  })

  it('收藏 id 在目录查不到（作品已删）跳过该行', async () => {
    h.fetchMine.mockResolvedValue({ favorites: ['ghost/deleted', 'alice/work-a'], ratings: {} })
    const w = mountAccount()
    await flushPromises()
    expect(w.findAll('[data-testid="my-favorites"] li')).toHaveLength(1)
    expect(w.text()).toContain('作品甲')
  })

  it('取消收藏成功后本地移除该行', async () => {
    h.fetchMine.mockResolvedValue({ favorites: ['alice/work-a'], ratings: {} })
    const w = mountAccount()
    await flushPromises()
    await w.get('[data-testid="unfav-alice/work-a"]').trigger('click')
    await flushPromises()
    expect(h.setFavorite).toHaveBeenCalledWith('alice', 'work-a', false)
    expect(w.find('[data-testid="my-favorites"]').exists()).toBe(false)
    expect(w.text()).toContain('还没有收藏或评分。')
  })

  it('评分列表紧凑行：作品名 ★分数', async () => {
    h.fetchMine.mockResolvedValue({ favorites: [], ratings: { 'bob/work-b': 4 } })
    const w = mountAccount()
    await flushPromises()
    const row = w.get('[data-testid="my-ratings"]')
    expect(row.text()).toContain('作品乙')
    expect(row.text()).toContain('★4')
  })

  it('空数据显示「还没有收藏或评分。」', async () => {
    const w = mountAccount()
    await flushPromises()
    expect(w.text()).toContain('还没有收藏或评分。')
  })

  it('未登录不发反应请求、不渲染该节', async () => {
    h.status = 'anonymous'
    const w = mountAccount()
    await flushPromises()
    expect(h.fetchMine).not.toHaveBeenCalled()
    expect(w.text()).not.toContain('我的收藏')
  })

  it('reactionsEnabled=false 整节不渲染且零请求', async () => {
    h.enabled = false
    const w = mountAccount()
    await flushPromises()
    expect(h.fetchMine).not.toHaveBeenCalled()
    expect(w.text()).not.toContain('我的收藏')
    expect(w.text()).not.toContain('还没有收藏或评分。')
  })

  it('fetchMine 失败显示错误文本不崩溃', async () => {
    h.fetchMine.mockRejectedValue(new Error('网络失败'))
    const w = mountAccount()
    await flushPromises()
    expect(w.get('[data-testid="my-reactions-error"]').text()).toContain('网络失败')
  })
})

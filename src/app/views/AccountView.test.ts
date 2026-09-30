// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { GameSummary } from '@/data/types'
import AccountView from './AccountView.vue'
import { AuthApiError } from '@/auth/errors'

const h = vi.hoisted(() => ({
  enabled: true,
  status: 'authenticated' as 'anonymous' | 'authenticated',
  listGames: vi.fn(),
  fetchMine: vi.fn(),
  setFavorite: vi.fn(),
  invalidate: vi.fn(),
  deleteAccount: vi.fn()
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
    invalidate: h.invalidate,
    logout: vi.fn(),
    logoutAll: vi.fn(),
    changePassword: vi.fn()
  },
  authClient: { deleteAccount: h.deleteAccount },
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
  h.deleteAccount.mockResolvedValue(undefined)
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

describe('AccountView 危险区：注销账号（P8 ③）', () => {
  async function openDangerZone() {
    const w = mountAccount()
    await flushPromises()
    return w
  }

  it('双闸：勾选与密码齐备才 enabled，缺一即禁用', async () => {
    const w = await openDangerZone()
    const button = w.get('[data-testid="delete-account-button"]')
    expect(button.attributes('disabled')).toBeDefined()

    await w.get('[data-testid="delete-confirm-password"]').setValue('password1234')
    expect(button.attributes('disabled')).toBeDefined()

    await w.get('[data-testid="delete-confirm-check"]').setValue(true)
    expect(button.attributes('disabled')).toBeUndefined()

    await w.get('[data-testid="delete-confirm-password"]').setValue('')
    expect(button.attributes('disabled')).toBeDefined()
    await w.get('[data-testid="delete-confirm-check"]').setValue(false)
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('成功：authClient.deleteAccount → session.invalidate → 跳首页', async () => {
    const w = await openDangerZone()
    await w.get('[data-testid="delete-confirm-password"]').setValue('password1234')
    await w.get('[data-testid="delete-confirm-check"]').setValue(true)
    await w.get('[data-testid="delete-account-button"]').trigger('click')
    await flushPromises()
    expect(h.deleteAccount).toHaveBeenCalledWith('tok', 'password1234')
    expect(h.invalidate).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('401 错误密码：展示中文文案且不清会话', async () => {
    h.deleteAccount.mockRejectedValueOnce(new AuthApiError(401, 'invalid_credentials', 'wrong password'))
    const w = await openDangerZone()
    await w.get('[data-testid="delete-confirm-password"]').setValue('wrong')
    await w.get('[data-testid="delete-confirm-check"]').setValue(true)
    await w.get('[data-testid="delete-account-button"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="delete-account-error"]').text()).toBe('邮箱或密码不正确')
    expect(h.invalidate).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/account')
  })

  it('410 account_deleted：展示「该账号已注销」', async () => {
    h.deleteAccount.mockRejectedValueOnce(new AuthApiError(410, 'account_deleted', 'gone'))
    const w = await openDangerZone()
    await w.get('[data-testid="delete-confirm-password"]').setValue('password1234')
    await w.get('[data-testid="delete-confirm-check"]').setValue(true)
    await w.get('[data-testid="delete-account-button"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="delete-account-error"]').text()).toBe('该账号已注销')
  })

  // 409 注销被拒（后端契约 last_admin）：auth client 的 readErrorCode → toErrorCode 把未知码
  // 归一为 'internal'，且不保留后端 message，故视图经 toUserMessage 展示 AUTH_ERROR_MESSAGES.internal。
  // 本用例钉住该链路的可观测语义：409 被拒 → 出 alert 行且会话不被清（invalidate 未调、仍停在 /account）。
  it('409 注销被拒（last_admin 经 client 归一为 internal）：出文案且不清会话', async () => {
    h.deleteAccount.mockRejectedValueOnce(new AuthApiError(409, 'internal', 'auth request failed: internal'))
    const w = await openDangerZone()
    await w.get('[data-testid="delete-confirm-password"]').setValue('password1234')
    await w.get('[data-testid="delete-confirm-check"]').setValue(true)
    await w.get('[data-testid="delete-account-button"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="delete-account-error"]').text()).toBe('服务暂时不可用，请稍后重试')
    expect(h.invalidate).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/account')
  })
})

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { toInterstitialIfExternal } from '@/lib/externalLink'
import { DEFAULT_DESCRIPTION } from '@/lib/pageTitle'
import { NotFoundError } from '@/data'
import GameView from './GameView.vue'

const h = vi.hoisted(() => ({ getGame: vi.fn() }))

vi.mock('@/data', async () => ({
  repo: { getGame: h.getGame },
  NotFoundError: class NotFoundError extends Error {},
  // 复用真实实现：用例要钉住 resolveUserSlug 对旧式 id 的回退行为
  resolveUserSlug: (await import('@/data/types')).resolveUserSlug
}))

let router: ReturnType<typeof createRouter>

beforeEach(async () => {
  vi.clearAllMocks()
  document.title = ''
  document.querySelector('meta[name="description"]')?.remove()
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

describe('GameView 路由级标题与描述精化', () => {
  function mountMinimal(game: object) {
    h.getGame.mockResolvedValue(game)
    return mount(GameView, {
      props: { user: 'fixture', slug: 'minimal' },
      global: {
        plugins: [router],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    })
  }

  it('数据到达后标题为作品名、meta 为作品描述', async () => {
    const w = mountMinimal({ ...minimalGame, description: '一段作品描述' })
    await flushPromises()
    expect(document.title).toBe('最小作品 · crearte 创艺')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('一段作品描述')
    expect(w.text()).toContain('一段作品描述')
  })

  it('缺省描述回落默认文案', async () => {
    mountMinimal(minimalGame)
    await flushPromises()
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(DEFAULT_DESCRIPTION)
  })

  it('notFound 时标题为未找到的作品', async () => {
    h.getGame.mockRejectedValue(new NotFoundError('not found'))
    mount(GameView, {
      props: { user: 'fixture', slug: 'ghost' },
      global: {
        plugins: [router],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    })
    await flushPromises()
    expect(document.title).toBe('未找到的作品 · crearte 创艺')
  })
})

describe('GameView 作者入口（内部链接 > 外链 > 纯文本）', () => {
  async function mountView(game: object) {
    h.getGame.mockResolvedValue(game)
    const w = mount(GameView, {
      props: { user: 'alice', slug: 'work' },
      global: {
        plugins: [router],
        stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
      }
    })
    await flushPromises()
    return w
  }

  function authorLine(w: Awaited<ReturnType<typeof mountView>>) {
    return w.findAll('p').find((p) => p.text().includes('作者：'))!
  }

  it('有命名空间时作者名链接到 /users/:user', async () => {
    const w = await mountView({
      ...minimalGame,
      id: 'alice/work',
      user: 'alice',
      slug: 'work',
      author: { name: '爱丽丝' }
    })
    const link = authorLine(w).find('a[href="/users/alice"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('爱丽丝')
  })

  it('无 user 但有 author.url 时保持外链', async () => {
    const w = await mountView({
      id: 'legacy',
      name: '遗留作品',
      durationMinutes: { min: 1, max: 2 },
      type: 'other',
      tags: [],
      addedAt: '2026-09-29',
      author: { name: 'X', url: 'https://e.com' }
    })
    const link = authorLine(w).find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe(toInterstitialIfExternal('https://e.com', location.origin))
    expect(link.text()).toBe('X')
  })

  it('无 user 无 url 时纯文本', async () => {
    const w = await mountView({
      id: 'legacy',
      name: '遗留作品',
      durationMinutes: { min: 1, max: 2 },
      type: 'other',
      tags: [],
      addedAt: '2026-09-29',
      author: { name: '纯文本作者' }
    })
    expect(authorLine(w).find('a').exists()).toBe(false)
    expect(authorLine(w).text()).toContain('纯文本作者')
  })
})

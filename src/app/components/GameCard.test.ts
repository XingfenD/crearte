// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import GameCard from './GameCard.vue'
import type { GameSummary } from '@/data/types'

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

const base = {
  name: '2048',
  url: 'https://play2048.co/',
  author: { name: 'Gabriel' },
  description: '滑动合并数字方块。',
  durationMinutes: { min: 5, max: 20 },
  type: 'puzzle',
  tags: ['数字'],
  addedAt: '2026-09-17'
} satisfies Omit<GameSummary, 'id'>

function mountCard(game: GameSummary) {
  return mount(GameCard, { props: { game }, global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('GameCard 链接（/games/:user/:slug 复合寻址）', () => {
  it('显式 user/slug 字段优先', () => {
    const w = mountCard({ ...base, id: 'fendy/2048', user: 'fendy', slug: '2048' })
    expect(w.get('a').attributes('href')).toBe('/games/fendy/2048')
  })

  it('字段缺失时按复合 id 拆分', () => {
    const w = mountCard({ ...base, id: 'crearte/a-dark-room' })
    expect(w.get('a').attributes('href')).toBe('/games/crearte/a-dark-room')
  })

  it('静态遗留纯 id：链接退化为单段路径（迁移期 not-found 兜底）', () => {
    const w = mountCard({ ...base, id: '2048' })
    expect(w.get('a').attributes('href')).toBe('/games/2048')
  })

  it('描述缺省时不渲染描述行', () => {
    const { description, ...rest } = base
    const w = mountCard({ ...rest, id: 'fendy/2048' })
    expect(w.find('p.line-clamp-2').exists()).toBe(false)
    const withDesc = mountCard({ ...base, id: 'fendy/2048' })
    expect(withDesc.find('p.line-clamp-2').exists()).toBe(true)
  })
})

describe('GameCard 作者行（/users/:user 入口）', () => {
  it('卡片渲染作者行并链接到作者页', () => {
    const w = mountCard({ ...base, id: 'alice/2048', user: 'alice', slug: '2048' })
    expect(w.text()).toContain('Gabriel')
    const link = w.find('a[href="/users/alice"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('Gabriel')
  })

  it('无 user 的卡片作者行为纯文本', () => {
    const w = mountCard({ ...base, id: '2048' })
    expect(w.find('a[href^="/users/"]').exists()).toBe(false)
    expect(w.text()).toContain('Gabriel')
    expect(w.findAll('a')).toHaveLength(1)
  })
})

describe('GameCard 卡片结构（拉伸链接，禁嵌套交互元素）', () => {
  const aliceGame: GameSummary = { ...base, id: 'alice/2048', user: 'alice', slug: '2048' }

  it('卡片为 div，整卡点击层由标题锚点承载，锚点互不嵌套', () => {
    const w = mountCard(aliceGame)
    expect(w.element.tagName).toBe('DIV')
    expect(w.classes()).toContain('relative')
    const anchors = w.findAll('a')
    expect(anchors).toHaveLength(2)
    for (const a of anchors) {
      expect(a.find('a').exists()).toBe(false)
    }
    const title = w.get('a[href="/games/alice/2048"]')
    expect(title.classes()).toContain('after:absolute')
    expect(title.classes()).toContain('after:inset-0')
  })

  it('作者链接浮于整卡点击层之上、独立指向作者页', () => {
    const w = mountCard(aliceGame)
    const link = w.find('a[href="/users/alice"]')
    expect(link.exists()).toBe(true)
    expect(link.classes()).toContain('relative')
    expect(link.classes()).toContain('z-10')
  })
})

describe('GameCard 点击路由（真实 RouterLink）', () => {
  it('点标题锚点进作品页、点作者锚点进作者页', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div />' } },
        { path: '/games/:user/:slug', name: 'game', component: { template: '<div />' } },
        { path: '/games/:slug', name: 'game-legacy', component: { template: '<div />' } },
        { path: '/users/:user', name: 'author', component: { template: '<div />' } }
      ]
    })
    await router.push('/')
    const w = mount(GameCard, {
      props: { game: { ...base, id: 'alice/2048', user: 'alice', slug: '2048' } },
      global: { plugins: [router] }
    })
    await w.get('a[href="/games/alice/2048"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/games/alice/2048')

    await w.get('a[href="/users/alice"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/users/alice')
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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

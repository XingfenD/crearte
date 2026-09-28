// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GameCard from './GameCard.vue'
import type { GameSummary } from '@/data/types'

// RouterLink 打成透传 to 的 <a>，专注断言卡片链接的复合寻址路径
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
})

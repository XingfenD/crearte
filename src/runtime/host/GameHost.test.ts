// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GameHost from './GameHost.vue'
import type { Game } from '../../app/data/types'

const game: Game = {
  id: 'fendy/2048',
  user: 'fendy',
  slug: '2048',
  name: '2048',
  url: 'https://play2048.co/',
  author: { name: 'Gabriel' },
  description: '滑动合并数字方块。',
  durationMinutes: { min: 5, max: 20 },
  type: 'puzzle',
  tags: [],
  addedAt: '2026-09-17',
  runtime: 'external'
}

describe('GameHost iframe 属性', () => {
  it('全屏由 allow（Permissions Policy）管辖，不再写冗余的 allowfullscreen', () => {
    const w = mount(GameHost, { props: { game } })
    const iframe = w.get('iframe')
    expect(iframe.attributes('allow')).toContain('fullscreen')
    expect(iframe.attributes('allowfullscreen')).toBeUndefined()
  })

  it('「退出」按钮仅目录详情页渲染（showExit 默认开；表单/审核页内联预览传 false 隐藏）', () => {
    const withExit = mount(GameHost, { props: { game } })
    expect(withExit.findAll('button').some((b) => b.text() === '退出')).toBe(true)
    const withoutExit = mount(GameHost, { props: { game, showExit: false } })
    expect(withoutExit.findAll('button').some((b) => b.text() === '退出')).toBe(false)
  })
})

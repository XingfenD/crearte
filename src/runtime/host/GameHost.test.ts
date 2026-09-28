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
})

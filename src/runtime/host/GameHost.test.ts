// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import GameHost from './GameHost.vue'
import type { Game } from '../../app/data/types'

// D-H：recordPlay 走 module mock，断言「站内运行真就绪」信号点（booting 误触不算）
const h = vi.hoisted(() => ({ recordPlay: vi.fn() }))
vi.mock('../../app/lib/recent', () => ({ recordPlay: h.recordPlay }))

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

// hosted 目标：start() 同步置 ready，无需桥消息
const hostedGame: Game = {
  ...game,
  id: 'fixture/hosted',
  runtime: 'hosted',
  hostedUrl: 'https://hosted.example/game/',
  playOrigin: 'https://hosted.example'
}
// virtual 目标：start() 停在 booting（等 agent:boot），不会误记
const virtualGame: Game = {
  ...game,
  id: 'fixture/virtual',
  runtime: 'virtual',
  version: '1.0.0',
  bundle: { url: '/bundle.bin', bytes: 1, sha256: 'x' },
  playOrigin: 'https://virtual.example'
}
// 无可用目标 → error 阶段
const brokenGame: Game = {
  ...game,
  id: 'fixture/broken',
  runtime: 'external',
  url: undefined,
  fallback: 'none'
}
// virtual 起步（booting）→ 超时降级到 hosted（ready）：可反复制造 booting→ready 循环
const degradeGame: Game = {
  ...game,
  id: 'fixture/degrade',
  runtime: 'virtual',
  version: '1.0.0',
  bundle: { url: '/bundle.bin', bytes: 1, sha256: 'x' },
  playOrigin: 'https://virtual.example',
  fallback: 'hosted',
  hostedUrl: 'https://hosted.example/game/'
}

describe('GameHost 最近玩过记录（D-H）', () => {
  beforeEach(() => {
    h.recordPlay.mockClear()
  })

  it('phase 到 ready 时记录一次 game.id', async () => {
    mount(GameHost, { props: { game: hostedGame } })
    await nextTick()
    expect(h.recordPlay).toHaveBeenCalledTimes(1)
    expect(h.recordPlay).toHaveBeenCalledWith('fixture/hosted')
  })

  it('booting 阶段不记录', async () => {
    const w = mount(GameHost, { props: { game: virtualGame } })
    await nextTick()
    expect(h.recordPlay).not.toHaveBeenCalled()
    w.unmount()
  })

  it('error 阶段不记录', async () => {
    mount(GameHost, { props: { game: brokenGame } })
    await nextTick()
    expect(h.recordPlay).not.toHaveBeenCalled()
  })

  it('重开后再次 ready 再次记录（冒泡到最前）', async () => {
    vi.useFakeTimers()
    try {
      const w = mount(GameHost, { props: { game: degradeGame } })
      await nextTick()
      expect(h.recordPlay).not.toHaveBeenCalled() // 仍在 booting
      vi.advanceTimersByTime(60_000) // 运行环境超时 → 降级 hosted → ready
      await nextTick()
      expect(h.recordPlay).toHaveBeenCalledTimes(1)
      expect(h.recordPlay).toHaveBeenLastCalledWith('fixture/degrade')
      const restartBtn = w.findAll('button').find((b) => b.text() === '重开')!
      await restartBtn.trigger('click') // 回到 booting
      await nextTick()
      vi.advanceTimersByTime(60_000) // 再次降级 hosted → ready
      await nextTick()
      expect(h.recordPlay).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

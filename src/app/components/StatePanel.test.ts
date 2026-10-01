// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatePanel from './StatePanel.vue'

function mountPanel(props: { loading: boolean; error: Error | null; variant?: 'cards' | 'lines' }) {
  return mount(StatePanel, { props })
}

describe('StatePanel 骨架变体', () => {
  it('默认 cards：6 张带封面的卡片骨架', () => {
    const w = mountPanel({ loading: true, error: null })
    expect(w.findAll('.aspect-video')).toHaveLength(6)
    // 每张卡三行线组，共 18 条
    expect(w.findAll('.animate-skeleton')).toHaveLength(6)
  })

  it('variant="lines"：三块横线、零 aspect-video', () => {
    const w = mountPanel({ loading: true, error: null, variant: 'lines' })
    expect(w.findAll('.aspect-video')).toHaveLength(0)
    expect(w.findAll('.animate-skeleton')).toHaveLength(3)
    expect(w.text()).toContain('加载中')
  })
})

describe('StatePanel 状态分支', () => {
  it('loading 优先于 error', () => {
    const w = mountPanel({ loading: true, error: new Error('boom') })
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
  })

  it('error 态渲染 role=alert 与重试按钮', async () => {
    const w = mountPanel({ loading: false, error: new Error('加载失败') })
    expect(w.find('[role="alert"]').exists()).toBe(true)
    expect(w.text()).toContain('加载失败')
    await w.get('[role="alert"] button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('无 loading / error 时渲染 slot', () => {
    const w = mount(StatePanel, {
      props: { loading: false, error: null },
      slots: { default: '<p class="slot-body">内容</p>' }
    })
    expect(w.find('.slot-body').exists()).toBe(true)
  })
})

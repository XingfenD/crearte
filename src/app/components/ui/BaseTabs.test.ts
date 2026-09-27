// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTabs from './BaseTabs.vue'

const items = [
  { value: 'queue', label: '审核队列' },
  { value: 'works', label: '作品管理' }
]

describe('BaseTabs', () => {
  it('renders one button per item with the active one highlighted (accent tone)', () => {
    const w = mount(BaseTabs, { props: { modelValue: 'queue', items } })
    const buttons = w.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('审核队列')
    expect(buttons[0].classes()).toEqual(expect.arrayContaining(['border-2', 'border-ink', 'bg-accent-ink', 'text-paper']))
    expect(buttons[1].classes()).toContain('bg-surface')
    expect(buttons[1].classes()).not.toContain('bg-accent-ink')
  })

  it('uses bg-highlight for the active tab when tone=highlight, and sm sizing', () => {
    const w = mount(BaseTabs, { props: { modelValue: 'works', items, tone: 'highlight', size: 'sm' } })
    const buttons = w.findAll('button')
    expect(buttons[1].classes()).toContain('bg-highlight')
    expect(buttons[1].classes()).not.toContain('bg-accent-ink')
    expect(buttons[0].classes()).toEqual(expect.arrayContaining(['px-2', 'py-1']))
    expect(w.get('div').classes()).toEqual(expect.arrayContaining(['text-xs', 'font-bold']))
  })

  it('emits update:modelValue with the tab value on click', async () => {
    const w = mount(BaseTabs, { props: { modelValue: 'queue', items } })
    await w.findAll('button')[1].trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['works'])
  })

  it('merges fall-through classes onto the container', () => {
    const w = mount(BaseTabs, { props: { modelValue: 'queue', items }, attrs: { class: 'mt-4' } })
    expect(w.get('div').classes()).toContain('mt-4')
  })
})

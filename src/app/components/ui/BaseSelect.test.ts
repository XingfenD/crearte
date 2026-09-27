// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSelect from './BaseSelect.vue'

const options = [
  { value: 'a', label: 'A 项' },
  { value: 'b', label: 'B 项' },
  { value: 'c', label: 'C 项' }
]

function mountSelect(modelValue = 'a', extra: Record<string, unknown> = {}) {
  return mount(BaseSelect, { props: { modelValue, options }, ...extra })
}

describe('BaseSelect（自定义 listbox）', () => {
  it('收起态：trigger 显示当前选项文案，属性落在 trigger 上', () => {
    const w = mountSelect('b', { attrs: { 'data-testid': 'kind-select', id: 'sf-type' } })
    const trigger = w.get('button')
    expect(trigger.text()).toContain('B 项')
    expect(trigger.attributes('data-testid')).toBe('kind-select')
    expect(trigger.attributes('id')).toBe('sf-type')
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('点击 trigger 展开面板，列出全部选项且当前项 aria-selected', async () => {
    const w = mountSelect('a')
    expect(w.find('[role=listbox]').exists()).toBe(false)
    await w.get('button').trigger('click')
    const panel = w.get('[role=listbox]')
    expect(panel.findAll('[role=option]')).toHaveLength(3)
    const selected = panel.findAll('[role=option]').filter(o => o.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toContain('A 项')
  })

  it('点击选项：emit 新值并收起', async () => {
    const w = mountSelect('a')
    await w.get('button').trigger('click')
    await w.findAll('[role=option]')[2].trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['c'])
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('Esc 收起且不改变值', async () => {
    const w = mountSelect('a')
    await w.get('button').trigger('click')
    await w.get('[role=listbox]').trigger('keydown', { key: 'Escape' })
    expect(w.find('[role=listbox]').exists()).toBe(false)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('键盘：ArrowDown 移动高亮，Enter 选中', async () => {
    const w = mountSelect('a')
    await w.get('button').trigger('click')
    const panel = w.get('[role=listbox]')
    await panel.trigger('keydown', { key: 'ArrowDown' })
    await panel.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('disabled 时无法展开', async () => {
    const w = mount(BaseSelect, { props: { modelValue: 'a', options, disabled: true } })
    await w.get('button').trigger('click')
    expect(w.find('[role=listbox]').exists()).toBe(false)
  })

  it('class 透传合并到 trigger', () => {
    const w = mountSelect('a', { attrs: { class: 'font-mono text-xs' } })
    const classes = w.get('button').classes()
    expect(classes).toContain('font-mono')
    expect(classes).toContain('border-ink')
  })
})

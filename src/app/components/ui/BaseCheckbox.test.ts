// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCheckbox from './BaseCheckbox.vue'

describe('BaseCheckbox', () => {
  it('renders a checkbox inside a label with the slot content', () => {
    const w = mount(BaseCheckbox, {
      props: { modelValue: true },
      slots: { default: '<span class="font-bold">联网</span>' }
    })
    expect(w.get('label').classes()).toEqual(expect.arrayContaining(['flex', 'items-start', 'gap-2', 'text-sm']))
    const input = w.get('input')
    expect(input.attributes('type')).toBe('checkbox')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(w.get('label span.font-bold').text()).toBe('联网')
  })

  it('emits update:modelValue when toggled', async () => {
    const w = mount(BaseCheckbox, { props: { modelValue: false } })
    await w.get('input').setValue(true)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('puts fall-through attrs (data-testid) on the input, not the label', () => {
    const w = mount(BaseCheckbox, {
      props: { modelValue: false },
      attrs: { 'data-testid': 'feature-network' }
    })
    expect(w.get('input').attributes('data-testid')).toBe('feature-network')
    expect(w.get('label').attributes('data-testid')).toBeUndefined()
  })
})

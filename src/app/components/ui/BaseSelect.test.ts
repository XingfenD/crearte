// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSelect from './BaseSelect.vue'

describe('BaseSelect', () => {
  const options = '<option value="a">A</option><option value="b">B</option>'

  it('renders a select with the standard field classes and slotted options', () => {
    const w = mount(BaseSelect, { props: { modelValue: 'a' }, slots: { default: options } })
    const el = w.get('select')
    expect((el.element as HTMLSelectElement).value).toBe('a')
    expect(w.findAll('option')).toHaveLength(2)
    expect(el.classes()).toEqual(expect.arrayContaining(['w-full', 'border-2', 'border-ink', 'bg-surface']))
  })

  it('emits update:modelValue on change', async () => {
    const w = mount(BaseSelect, { props: { modelValue: 'a' }, slots: { default: options } })
    await w.get('select').setValue('b')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  })

  it('passes through attrs like data-testid', () => {
    const w = mount(BaseSelect, {
      props: { modelValue: 'a' },
      attrs: { 'data-testid': 'kind-select' },
      slots: { default: options }
    })
    expect(w.get('select').attributes('data-testid')).toBe('kind-select')
  })
})

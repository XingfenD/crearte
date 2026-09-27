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

  it('hides the native arrow and draws the site caret icon instead', () => {
    const w = mount(BaseSelect, { props: { modelValue: 'a' }, slots: { default: options } })
    const el = w.get('select')
    expect(el.classes()).toContain('appearance-none')
    expect(el.classes()).toContain('pr-8')
    const caret = w.get('svg')
    expect(caret.classes()).toContain('pointer-events-none')
  })

  it('emits update:modelValue on change', async () => {
    const w = mount(BaseSelect, { props: { modelValue: 'a' }, slots: { default: options } })
    await w.get('select').setValue('b')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  })

  it('passes through attrs like data-testid onto the select element', () => {
    const w = mount(BaseSelect, {
      props: { modelValue: 'a' },
      attrs: { 'data-testid': 'kind-select', id: 'sf-type' },
      slots: { default: options }
    })
    const el = w.get('select')
    expect(el.attributes('data-testid')).toBe('kind-select')
    expect(el.attributes('id')).toBe('sf-type')
  })

  it('merges fall-through classes onto the select element', () => {
    const w = mount(BaseSelect, {
      props: { modelValue: 'a' },
      attrs: { class: 'font-mono text-xs' },
      slots: { default: options }
    })
    const classes = w.get('select').classes()
    expect(classes).toContain('font-mono')
    expect(classes).toContain('bg-surface')
  })
})

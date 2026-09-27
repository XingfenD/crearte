// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTextarea from './BaseTextarea.vue'

describe('BaseTextarea', () => {
  it('renders a textarea with the standard field classes and value', () => {
    const w = mount(BaseTextarea, { props: { modelValue: 'hi' }, attrs: { rows: 3, id: 'sf-desc' } })
    const el = w.get('textarea')
    expect((el.element as HTMLTextAreaElement).value).toBe('hi')
    expect(el.attributes('rows')).toBe('3')
    expect(el.attributes('id')).toBe('sf-desc')
    expect(el.classes()).toEqual(expect.arrayContaining(['w-full', 'border-2', 'border-ink', 'bg-surface']))
  })

  it('emits update:modelValue on input', async () => {
    const w = mount(BaseTextarea, { props: { modelValue: '' } })
    await w.get('textarea').setValue('next')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['next'])
  })
})

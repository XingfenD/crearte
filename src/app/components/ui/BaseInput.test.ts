// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseInput from './BaseInput.vue'

describe('BaseInput', () => {
  it('renders a text input with the standard field classes', () => {
    const w = mount(BaseInput, { props: { modelValue: 'abc' } })
    const el = w.get('input')
    expect(el.attributes('type')).toBe('text')
    expect((el.element as HTMLInputElement).value).toBe('abc')
    expect(el.classes()).toEqual(
      expect.arrayContaining(['w-full', 'border-2', 'border-ink', 'bg-surface', 'px-3', 'py-2'])
    )
  })

  it('emits update:modelValue on input', async () => {
    const w = mount(BaseInput, { props: { modelValue: '' } })
    await w.get('input').setValue('hello')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['hello'])
  })

  it('honors the type prop', () => {
    const w = mount(BaseInput, { props: { modelValue: '', type: 'password' } })
    expect(w.get('input').attributes('type')).toBe('password')
  })

  it('renders aria-invalid as a boolean-cast attribute', () => {
    // Vue 对 boolean prop 做布尔转换：未传时渲染 aria-invalid="false"（与迁移前手写绑定行为一致）
    const plain = mount(BaseInput, { props: { modelValue: '' } })
    expect(plain.get('input').attributes('aria-invalid')).toBe('false')
    const bad = mount(BaseInput, { props: { modelValue: '', invalid: true } })
    expect(bad.get('input').attributes('aria-invalid')).toBe('true')
  })

  it('passes through attrs like id, placeholder and data-testid', () => {
    const w = mount(BaseInput, {
      props: { modelValue: '' },
      attrs: { id: 'sf-name', placeholder: 'v1', 'data-testid': 'work-id' }
    })
    const el = w.get('input')
    expect(el.attributes('id')).toBe('sf-name')
    expect(el.attributes('placeholder')).toBe('v1')
    expect(el.attributes('data-testid')).toBe('work-id')
  })
})

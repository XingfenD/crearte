// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from './BaseButton.vue'

describe('BaseButton', () => {
  it('renders slot content in a type=button element with surface style by default', () => {
    const w = mount(BaseButton, { slots: { default: '取消' } })
    const el = w.get('button')
    expect(el.text()).toBe('取消')
    expect(el.attributes('type')).toBe('button')
    expect(el.classes()).toContain('btn-surface')
    expect(el.classes()).not.toContain('btn-ink')
    expect(el.classes()).not.toContain('lift')
  })

  it('uses btn-ink for variant=ink and adds lift when requested', () => {
    const w = mount(BaseButton, { props: { variant: 'ink', lift: true } })
    expect(w.get('button').classes()).toContain('btn-ink')
    expect(w.get('button').classes()).toContain('lift')
  })

  it('adds btn-sm for size=sm', () => {
    const w = mount(BaseButton, { props: { size: 'sm' } })
    expect(w.get('button').classes()).toContain('btn-sm')
  })

  it('supports type=submit', () => {
    const w = mount(BaseButton, { props: { type: 'submit' } })
    expect(w.get('button').attributes('type')).toBe('submit')
  })

  it('passes through attrs (data-testid, disabled)', () => {
    const w = mount(BaseButton, { attrs: { 'data-testid': 'save-draft', disabled: true } })
    const el = w.get('button')
    expect(el.attributes('data-testid')).toBe('save-draft')
    expect(el.attributes('disabled')).toBeDefined()
  })

  it('emits click', async () => {
    const w = mount(BaseButton)
    await w.get('button').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('merges fall-through classes with the base classes', () => {
    const w = mount(BaseButton, { attrs: { class: 'w-full bg-highlight' } })
    const classes = w.get('button').classes()
    expect(classes).toContain('btn-surface')
    expect(classes).toContain('w-full')
    expect(classes).toContain('bg-highlight')
  })
})

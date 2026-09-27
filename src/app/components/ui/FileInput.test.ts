// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FileInput from './FileInput.vue'

describe('FileInput', () => {
  it('renders a file input with the boxed btn-ink style classes', () => {
    const w = mount(FileInput)
    const el = w.get('input')
    expect(el.attributes('type')).toBe('file')
    expect(el.classes()).toEqual(
      expect.arrayContaining(['w-full', 'cursor-pointer', 'border-2', 'border-ink', 'bg-surface', 'file:bg-ink', 'file:text-paper'])
    )
  })

  it('passes through attrs like accept, id and data-testid', () => {
    const w = mount(FileInput, {
      attrs: { id: 'sf-bundle', 'data-testid': 'bundle-file', accept: '.zip' }
    })
    const el = w.get('input')
    expect(el.attributes('id')).toBe('sf-bundle')
    expect(el.attributes('data-testid')).toBe('bundle-file')
    expect(el.attributes('accept')).toBe('.zip')
  })

  it('forwards change events', async () => {
    let changed = 0
    const w = mount(FileInput, { attrs: { onChange: () => { changed += 1 } } })
    await w.get('input').trigger('change')
    expect(changed).toBe(1)
  })
})

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePagination from './BasePagination.vue'

describe('BasePagination', () => {
  it('shows the visible range and total', () => {
    const w = mount(BasePagination, { props: { offset: 20, limit: 20, total: 55 } })
    expect(w.get('span').text()).toBe('21–40 / 55')
  })

  it('clamps the range end at total', () => {
    const w = mount(BasePagination, { props: { offset: 40, limit: 20, total: 55 } })
    expect(w.get('span').text()).toBe('41–55 / 55')
  })

  it('disables 上一页 at offset 0 and emits the previous offset otherwise', async () => {
    const atStart = mount(BasePagination, { props: { offset: 0, limit: 20, total: 55 } })
    const prev = atStart.findAll('button')[0]
    expect(prev.attributes('disabled')).toBeDefined()

    const w = mount(BasePagination, { props: { offset: 20, limit: 20, total: 55 } })
    const buttons = w.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeUndefined()
    await buttons[0].trigger('click')
    expect(w.emitted('update:offset')?.at(-1)).toEqual([0])
  })

  it('disables 下一页 on the last page and emits the next offset otherwise', async () => {
    const atEnd = mount(BasePagination, { props: { offset: 40, limit: 20, total: 55 } })
    const next = atEnd.findAll('button')[1]
    expect(next.attributes('disabled')).toBeDefined()

    const w = mount(BasePagination, { props: { offset: 0, limit: 20, total: 55 } })
    const buttons = w.findAll('button')
    expect(buttons[1].attributes('disabled')).toBeUndefined()
    await buttons[1].trigger('click')
    expect(w.emitted('update:offset')?.at(-1)).toEqual([20])
  })

  it('labels the buttons 上一页 / 下一页', () => {
    const w = mount(BasePagination, { props: { offset: 0, limit: 20, total: 55 } })
    const buttons = w.findAll('button')
    expect(buttons[0].text()).toBe('上一页')
    expect(buttons[1].text()).toBe('下一页')
  })
})

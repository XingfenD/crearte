// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ToastHost from './ToastHost.vue'
import { __resetToasts, useToast } from '@/composables/useToast'

const toast = useToast()

beforeEach(() => {
  __resetToasts()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  __resetToasts()
})

describe('ToastHost', () => {
  it('store 空时容器仍在（只负责定位，不含 role/aria-live）且零子条', () => {
    const w = mount(ToastHost)
    const host = w.get('[data-testid="toast-host"]')
    expect(host.attributes('role')).toBeUndefined()
    expect(host.attributes('aria-live')).toBeUndefined()
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(0)
  })

  it('push 三种 kind → 各配色类命中', async () => {
    const w = mount(ToastHost)
    toast.success('链接已复制')
    toast.error('复制失败，请手动复制地址栏链接')
    toast.info('提示')
    await nextTick()
    const items = w.findAll('[data-testid="toast"]')
    expect(items).toHaveLength(3)
    expect(items[0].classes()).toContain('bg-success')
    expect(items[0].classes()).toContain('text-paper')
    expect(items[1].classes()).toContain('bg-accent-ink')
    expect(items[1].classes()).toContain('text-paper')
    expect(items[2].classes()).toContain('bg-highlight')
    expect(items[2].classes()).toContain('text-ink')
  })

  it('每条 toast 的文本包在 p[role=status][aria-live=polite] 实时区内，文本等于消息', async () => {
    const w = mount(ToastHost)
    toast.success('链接已复制')
    toast.error('复制失败')
    await nextTick()
    const items = w.findAll('[data-testid="toast"]')
    expect(items).toHaveLength(2)
    expect(items[0].get('p[role="status"][aria-live="polite"]').text()).toBe('链接已复制')
    expect(items[1].get('p[role="status"][aria-live="polite"]').text()).toBe('复制失败')
  })

  it('关闭按钮是实时区 p 的兄弟节点，而非其后代（D-I / P10 T1(d)）', async () => {
    const w = mount(ToastHost)
    toast.info('提示')
    await nextTick()
    const item = w.get('[data-testid="toast"]')
    const p = item.get('p[role="status"]')
    const button = item.get('button[aria-label="关闭提示"]')
    expect(button.element.parentElement).toBe(p.element.parentElement)
    expect(p.element.contains(button.element)).toBe(false)
  })

  it('点关闭按钮 → store 少一条', async () => {
    const w = mount(ToastHost)
    toast.success('a')
    toast.info('b')
    await nextTick()
    await w.findAll('[data-testid="toast"] button[aria-label="关闭提示"]')[0].trigger('click')
    expect(toast.toasts.value).toHaveLength(1)
    expect(toast.toasts.value[0].text).toBe('b')
  })
})

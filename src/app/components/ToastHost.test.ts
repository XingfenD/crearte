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
  it('store 空时容器仍在（role=status/aria-live=polite）且零子条', () => {
    const w = mount(ToastHost)
    const host = w.get('[data-testid="toast-host"]')
    expect(host.attributes('role')).toBe('status')
    expect(host.attributes('aria-live')).toBe('polite')
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
    expect(items[1].classes()).toContain('bg-accent')
    expect(items[1].classes()).toContain('text-paper')
    expect(items[2].classes()).toContain('bg-highlight')
    expect(items[2].classes()).toContain('text-ink')
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

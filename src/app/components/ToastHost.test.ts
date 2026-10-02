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

  // D-I′：播报层与视觉层解耦。live region 必须常驻（先于文字存在），
  // 否则读屏对「与文字同时创建的播报区」不播报首条。
  it('播报节点常驻：store 为空时已存在、语义完备、文字为空', () => {
    const w = mount(ToastHost)
    const announce = w.get('[data-testid="toast-announce"]')
    expect(announce.attributes('role')).toBe('status')
    expect(announce.attributes('aria-live')).toBe('polite')
    expect(announce.classes()).toContain('sr-only')
    expect(announce.text()).toBe('')
  })

  it('push 后播报文字等于该消息；可见 toast 自身不带播报语义', async () => {
    const w = mount(ToastHost)
    toast.success('链接已复制')
    await nextTick()

    expect(w.get('[data-testid="toast-announce"]').text()).toBe('链接已复制')

    const item = w.get('[data-testid="toast"]')
    expect(item.attributes('role')).toBeUndefined()
    expect(item.attributes('aria-live')).toBeUndefined()
    // 可见文本仍在（e2e ux.spec 的 toContainText 依赖它）
    expect(item.text()).toContain('链接已复制')
  })

  it('全部 toast 消失后播报文字清空（末尾 id undefined）', async () => {
    const w = mount(ToastHost)
    toast.info('提示')
    await nextTick()
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('提示')

    toast.dismiss(toast.toasts.value[0].id)
    await nextTick()
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('')
  })

  // D-I′ 陷阱钉桩：store 饱和时 push 逐最旧+append，长度 3→3 不变。
  // watch 源若写成 length，第 4 条消息将不被播报——必须是末尾 id。
  it('饱和态仍播报第 4 条（watch 源是末尾 id 而非长度）', async () => {
    const w = mount(ToastHost)
    toast.info('一')
    toast.info('二')
    toast.info('三')
    await nextTick()
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(3)

    toast.info('四')
    await nextTick()

    // 最旧被逐出，条数仍 3
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(3)
    expect(toast.toasts.value.map((t) => t.text)).toEqual(['二', '三', '四'])
    // 但播报的是最新那条
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('四')
  })

  it('关闭按钮不在播报节点内，播报节点内零交互控件（D-I / P10 T1(d)）', async () => {
    const w = mount(ToastHost)
    toast.info('提示')
    await nextTick()

    const announce = w.get('[data-testid="toast-announce"]')
    const button = w.get('[data-testid="toast"] button[aria-label="关闭提示"]')
    expect(announce.element.contains(button.element)).toBe(false)
    expect(announce.findAll('button')).toHaveLength(0)
  })

  // P9B-4（P12-T5(c)）：单调播报守卫——只在末尾 id 变大时播报。
  // announcedId 是 ToastHost <script setup> 里的 per-instance 闭包变量（非模块级），
  // 每次 mount(ToastHost) 都从 0 起，故不跨测试污染——无需挂 store 侧或进 __resetToasts
  // 复位；toasts 单例仍由 beforeEach/afterEach 的 __resetToasts() 隔离（nextId 复位为 1）。
  it('三条并存 → 关掉最新 → 播报文字不变（不重念仍在屏上的旧消息）', async () => {
    const w = mount(ToastHost)
    toast.info('一')
    toast.info('二')
    toast.info('三')
    await nextTick()
    // 三条并存，播报最新一条
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(3)
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('三')

    // 手动关掉最新（末尾 id=3）：数组回到 [1,2]，末尾 id 回退到 2。
    // 无单调守卫时 watch 会以 id=2 重念「二」；有守卫时 2<=announcedId(3) → 不重念。
    toast.dismiss(toast.toasts.value[toast.toasts.value.length - 1].id)
    await nextTick()
    expect(w.findAll('[data-testid="toast"]')).toHaveLength(2)
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('三')
  })

  it('关掉最新后再 push 新消息（id 更大）→ 正常播报', async () => {
    const w = mount(ToastHost)
    toast.info('一')
    toast.info('二')
    await nextTick()
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('二')

    toast.dismiss(toast.toasts.value[toast.toasts.value.length - 1].id)
    await nextTick()
    // 单调守卫不回退，但新消息 id=3 > announcedId=2 仍照常播报
    toast.info('三')
    await nextTick()
    expect(w.get('[data-testid="toast-announce"]').text()).toBe('三')
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

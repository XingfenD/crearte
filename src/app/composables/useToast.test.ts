// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DURATIONS, MAX_VISIBLE, __resetToasts, useToast } from './useToast'

const toast = useToast()

beforeEach(() => {
  __resetToasts()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  __resetToasts()
})

describe('useToast', () => {
  it('push 返回递增 id', () => {
    const a = toast.push('info', 'a')
    const b = toast.push('info', 'b')
    expect(b).toBe(a + 1)
  })

  it('DURATIONS：success/info 3000ms，error 5000ms', () => {
    expect(DURATIONS.success).toBe(3000)
    expect(DURATIONS.info).toBe(3000)
    expect(DURATIONS.error).toBe(5000)
  })

  it('success 3000ms 后自动消失', () => {
    toast.success('链接已复制')
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(2999)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('info 3000ms、error 5000ms 后自动消失', () => {
    toast.info('i')
    toast.error('e')
    vi.advanceTimersByTime(3000)
    expect(toast.toasts.value.map((x) => x.kind)).toEqual(['error'])
    vi.advanceTimersByTime(2000)
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('连续 push 4 条只剩最末 3 条（最旧被移除）', () => {
    for (let i = 1; i <= 4; i++) toast.push('info', `m${i}`)
    expect(MAX_VISIBLE).toBe(3)
    expect(toast.toasts.value.map((x) => x.text)).toEqual(['m2', 'm3', 'm4'])
  })

  it('dismiss 提前清掉且计时器不泄漏（dismiss 后 advance 不抛）', () => {
    const id = toast.push('success', 'x')
    toast.dismiss(id)
    expect(toast.toasts.value).toHaveLength(0)
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
    expect(toast.toasts.value).toHaveLength(0)
  })

  it('自定义 duration 生效', () => {
    toast.push('info', 'x', 1000)
    vi.advanceTimersByTime(999)
    expect(toast.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toast.toasts.value).toHaveLength(0)
  })
})

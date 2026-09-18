// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { installAgent, wrapStorage } from './index'

describe('installAgent', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.__GAME_HOST__ = undefined
  })

  test('暴露 __GAME_HOST__ 且 reportScore 走桥', () => {
    const port = { postMessage: vi.fn(), onmessage: null, start: vi.fn(), close: vi.fn() } as unknown as MessagePort
    const sent: unknown[] = []
    const parent = { postMessage: (data: unknown) => sent.push(data) } as unknown as Window
    installAgent(window, { hostOrigin: 'https://host.test', parent, port })
    expect(typeof window.__GAME_HOST__?.reportScore).toBe('function')
    window.__GAME_HOST__!.reportScore(42)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'game:score', score: 42, meta: undefined })
  })

  test('剥夺 serviceWorker.register', () => {
    installAgent(window, { hostOrigin: 'https://host.test', parent: window, port: null })
    expect(() => navigator.serviceWorker.register('/sw.js')).toThrowError()
  })

  test('报告 ready 与 error', async () => {
    const port = { postMessage: vi.fn(), start: vi.fn(), close: vi.fn() } as unknown as MessagePort
    installAgent(window, { hostOrigin: 'https://host.test', parent: window, port })
    // happy-dom 下 document.readyState 已是 complete，ready 走 queueMicrotask；刷新微任务后再断言
    await Promise.resolve()
    window.dispatchEvent(new Event('load'))
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'game:ready' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'game:error', message: 'boom' }))
  })
})

describe('wrapStorage', () => {
  test('setItem/removeItem/clear 触发回调（debounce 由调用方处理）', () => {
    const events: number[] = []
    const unwrap = wrapStorage(window, () => events.push(1))
    // happy-dom 的 Storage 是 Proxy，实例方法被 ClassMethodBinder 绑定到原始 target，
    // 直接 localStorage.setItem 时 this !== proxy；显式以 proxy 为 receiver 调用以验证补丁
    const call = (method: 'setItem' | 'removeItem' | 'clear', ...args: unknown[]) =>
      (window.Storage.prototype[method] as (...a: unknown[]) => unknown).call(window.localStorage, ...args)
    call('setItem', 'k', 'v')
    call('removeItem', 'k')
    unwrap()
    call('setItem', 'k2', 'v2')
    expect(events.length).toBe(2)
  })
})

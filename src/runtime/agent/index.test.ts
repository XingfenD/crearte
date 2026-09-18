// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { installAgent, wrapStorage } from './index'

// 安装前让原型持有可控访问器：若生产代码只在实例上 defineProperty，
// delete 实例影子 / 直取原型 getter 就会落回这里而被绕过，测试必须失败
const navigatorProto = Object.getPrototypeOf(window.navigator) as object
const documentProto = Object.getPrototypeOf(window.document) as object
const fakeRegister = vi.fn()
Object.defineProperty(navigatorProto, 'serviceWorker', {
  configurable: true,
  get: () => ({ register: fakeRegister })
})
// domain 真实宿主可能在祖先原型上（如浏览器 Document.prototype），先于任何伪造定义定位
const documentDomainOwner = (() => {
  for (let p: object | null = Object.getPrototypeOf(window.document); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (Object.getOwnPropertyDescriptor(p, 'domain')) return p
  }
  return null
})()
let fakeDomainSets = 0
Object.defineProperty(documentProto, 'domain', {
  configurable: true,
  get: () => 'original.test',
  set: () => { fakeDomainSets++ }
})

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

  test('host:snapshot-request 返回 localStorage 快照', () => {
    const port = { postMessage: vi.fn(), onmessage: null, start: vi.fn(), close: vi.fn() } as unknown as MessagePort
    installAgent(window, { hostOrigin: 'https://host.test', parent: window, port })
    window.localStorage.clear()
    window.localStorage.setItem('snap', 'value')
    port.onmessage!({ data: { type: 'host:snapshot-request', id: 's1' } } as MessageEvent)
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'game:snapshot', id: 's1', data: JSON.stringify({ snap: 'value' }), bytes: expect.any(Number), truncated: false
    })
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

describe('installAgent 原型级能力剥夺', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.__GAME_HOST__ = undefined
  })

  const options = { hostOrigin: 'https://host.test', parent: window, port: null }

  test('delete 实例影子后仍无法注册 Service Worker', () => {
    installAgent(window, options)
    delete (navigator as { serviceWorker?: unknown }).serviceWorker
    expect(() => navigator.serviceWorker.register('/sw.js')).toThrowError()
    expect(fakeRegister).not.toHaveBeenCalled()
  })

  test('原型 descriptor 的 getter 直取也无法注册', () => {
    installAgent(window, options)
    const descriptor = Object.getOwnPropertyDescriptor(navigatorProto, 'serviceWorker')
    expect(descriptor?.configurable).toBe(false)
    const shadow = descriptor!.get!.call(navigator) as { register: (url: string) => void }
    expect(Object.isFrozen(shadow)).toBe(true)
    expect(() => shadow.register('/x.js')).toThrowError()
    expect(fakeRegister).not.toHaveBeenCalled()
  })

  test('document.domain 的原型 setter 已替换且调用无效果', () => {
    installAgent(window, options)
    const descriptor = Object.getOwnPropertyDescriptor(documentProto, 'domain')
    expect(descriptor?.configurable).toBe(false)
    descriptor!.set!.call(document, 'evil.test')
    document.domain = 'evil.test'
    expect(document.domain).toBe(window.location.hostname)
    expect(fakeDomainSets).toBe(0)
  })

  test('祖先原型上的 domain descriptor 也无法放宽', () => {
    expect(documentDomainOwner).not.toBeNull()
    installAgent(window, options)
    const descriptor = Object.getOwnPropertyDescriptor(documentDomainOwner!, 'domain')
    expect(descriptor?.configurable).toBe(false)
    descriptor!.set!.call(document, 'evil.test')
    expect(document.domain).toBe(window.location.hostname)
    expect(fakeDomainSets).toBe(0)
  })

  test('安装前实例上的可配置影子属性被清除', () => {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register: fakeRegister }
    })
    installAgent(window, options)
    expect(Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker')).toBeUndefined()
    expect(() => navigator.serviceWorker.register('/sw.js')).toThrowError()
    expect(fakeRegister).not.toHaveBeenCalled()
  })

  test('同一 window 连续安装不抛错且剥夺保持', () => {
    expect(() => {
      installAgent(window, options)
      installAgent(window, options)
    }).not.toThrow()
    expect(() => navigator.serviceWorker.register('/sw.js')).toThrowError()
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

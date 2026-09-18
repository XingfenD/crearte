import { BRIDGE_PARAM, isHostCommand, PROTOCOL_VERSION, type GameEvent } from '../bridge/protocol'

declare global {
  interface Window {
    __GAME_HOST__?: {
      reportScore(score: number, meta?: unknown): void
      requestExit(): void
      getMeta(): { id: string; version: string; locale: string }
    }
  }
}

export interface AgentOptions {
  hostOrigin: string
  parent: Window
  port: MessagePort | null
}
let activePort: MessagePort | null = null
let booted = false

export function installAgent(win: Window, opts: AgentOptions): void {
  activePort = opts.port
  denyServiceWorker(win)
  denyDocumentDomain(win)
  wrapStorage(win, debounce(() => emit({ type: 'game:storage-changed', keys: storageKeys(win).length, bytes: storageBytes(win) }), 200))
  win.__GAME_HOST__ = {
    reportScore(score, meta) {
      if (Number.isFinite(score)) emit({ type: 'game:score', score, meta })
    },
    requestExit() { emit({ type: 'game:exit-request' }) },
    getMeta() { return { id: document.documentElement.dataset.gameId ?? '', version: document.documentElement.dataset.gameVersion ?? '', locale: navigator.language } }
  }
  win.addEventListener('error', (event) => emit({ type: 'game:error', message: event.message || '未知错误' }))
  win.addEventListener('unhandledrejection', (event) => emit({ type: 'game:error', message: String((event as PromiseRejectionEvent).reason) }))
  if (document.readyState === 'complete') queueMicrotask(() => emitReady(win))
  else win.addEventListener('load', () => emitReady(win), { once: true })

  // postMessage 通路：接收宿主 hello（含 MessagePort）或复用注入时传入的 port
  if (!opts.port) {
    win.addEventListener('message', (event) => {
      if (event.origin !== opts.hostOrigin || event.source !== opts.parent) return
      if (!isHostCommand(event.data) || event.data.type !== 'host:hello') return
      // protocol 的 host:hello 类型未声明 port（宿主运行时附加字段），此处按扩展字段窄化
      const helloPort = (event.data as { port?: MessagePort }).port
      if (!helloPort) return
      activePort?.close()
      activePort = helloPort
      attachPort(helloPort)
      emit({ type: 'agent:hello-ack', v: PROTOCOL_VERSION })
    })
  } else {
    attachPort(opts.port)
  }
  if (!booted) {
    booted = true
    opts.parent.postMessage({ type: 'agent:boot', v: PROTOCOL_VERSION }, opts.hostOrigin)
  }
}

function attachPort(port: MessagePort): void {
  port.onmessage = (event) => {
    if (!isHostCommand(event.data)) return
    const command = event.data
    if (command.type === 'host:pause') dispatchHook('pause')
    else if (command.type === 'host:resume') dispatchHook('resume')
    else if (command.type === 'host:clear-save') { try { localStorage.clear() } catch { /* noop */ } dispatchHook('clear-save') }
  }
  port.start()
}

function dispatchHook(name: string): void {
  window.dispatchEvent(new CustomEvent(`gamehost:${name}`))
}

function emit(event: GameEvent): void {
  activePort?.postMessage(event)
}

function emitReady(win: Window): void {
  emit({ type: 'game:ready', ms: Math.round(win.performance.now()) })
  document.documentElement.dataset.runtimeReady = '1'
}

function denyServiceWorker(win: Window): void {
  const deny = () => { throw new DOMException('运行时已禁用游戏自注册 Service Worker', 'SecurityError') }
  // ready 保持 rejected 语义；预先挂 catch 避免无人消费时触发 unhandledrejection 被自身上报为 game:error
  const ready = Promise.reject(new Error('disabled'))
  void ready.catch(() => undefined)
  const proxy = {
    register: deny,
    unregister: deny,
    getRegistrations: async () => [],
    getRegistration: async () => undefined,
    controller: null,
    ready
  }
  try {
    Object.defineProperty(win.navigator, 'serviceWorker', { configurable: true, get: () => proxy })
  } catch { /* navigator 被冻结时忽略 */ }
}

function denyDocumentDomain(win: Window): void {
  try {
    Object.defineProperty(win.document, 'domain', { configurable: true, get: () => win.location.hostname, set: () => {} })
  } catch { /* noop */ }
}

export function wrapStorage(win: Window, onchange: () => void): () => void {
  const proto = (win as Window & typeof globalThis).Storage.prototype
  const descriptor = Object.getOwnPropertyDescriptor(win, 'localStorage')
  const storage: Storage | null = descriptor?.get ? descriptor.get.call(win) : null
  if (!storage) return () => {}
  const originals = new Map<string, unknown>()
  for (const method of ['setItem', 'removeItem', 'clear'] as const) {
    const original = proto[method]
    originals.set(method, original)
    proto[method] = function patched(this: Storage, ...args: unknown[]) {
      const result = (original as (...a: unknown[]) => unknown).apply(this, args)
      if (this === storage) onchange()
      return result
    }
  }
  return () => {
    for (const [method, original] of originals) {
      ;(proto as unknown as Record<string, unknown>)[method] = original
    }
  }
}

function storageKeys(win: Window): string[] {
  try { return Object.keys(win.localStorage) } catch { return [] }
}

function storageBytes(win: Window): number {
  try {
    let bytes = 0
    for (const key of Object.keys(win.localStorage)) bytes += (key.length + (win.localStorage.getItem(key)?.length ?? 0)) * 2
    return bytes
  } catch { return 0 }
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

// 自动执行（真实浏览器：从 script 标签 query 读 hostOrigin）
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const current = document.currentScript as HTMLScriptElement | null
  const hostOrigin = current ? new URL(current.src).searchParams.get(BRIDGE_PARAM) : null
  if (hostOrigin) installAgent(window, { hostOrigin, parent: window.parent, port: null })
}

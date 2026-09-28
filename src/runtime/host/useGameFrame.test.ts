import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_FEATURES } from '../bridge/protocol'
import type { RuntimeTarget } from './adapters'
import { useGameFrame } from './useGameFrame'

const hosted: RuntimeTarget = { mode: 'hosted', url: 'http://hosted-demo.localhost:4173/', origin: 'http://hosted-demo.localhost:4173' }
const external: RuntimeTarget = { mode: 'external', url: 'https://upstream.example/game', origin: null }
const virtual: RuntimeTarget = { mode: 'virtual', url: 'http://demo.localhost:4173/__bootstrap#v=1', origin: 'http://demo.localhost:4173' }

function makeFrame(targets: RuntimeTarget[], onExternal = vi.fn()) {
  return {
    frame: useGameFrame({ targets: () => targets, features: () => ({ ...DEFAULT_FEATURES }), hostOrigin: 'http://localhost:4173', onExternal }),
    onExternal
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('hosted 启动 3s 无 agent:boot 仅告警，不降级', () => {
  const { frame, onExternal } = makeFrame([hosted, external])
  frame.start()
  expect(frame.state.value.phase).toBe('ready')
  vi.advanceTimersByTime(3_000)
  expect(console.warn).toHaveBeenCalledTimes(1)
  expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('hosted-demo.localhost:4173')
  expect(frame.state.value.phase).toBe('ready')
  expect(onExternal).not.toHaveBeenCalled()
})

test('sandbox 旗标覆盖作品运行所需权限', () => {
  const { frame } = makeFrame([virtual])
  expect(frame.sandbox.split(' ').sort()).toEqual([
    'allow-forms',
    'allow-fullscreen',
    'allow-pointer-lock',
    'allow-same-origin',
    'allow-scripts'
  ])
})

test('agent:boot 到达后清除告警', () => {
  const { frame } = makeFrame([hosted])
  frame.start()
  const contentWindow = { postMessage: vi.fn() }
  frame.attach({ contentWindow } as unknown as HTMLIFrameElement)
  const source = frame.iframeRef.value?.contentWindow
  vi.stubGlobal('navigator', { language: 'zh-CN' })
  frame.onMessage({ origin: hosted.origin, source, data: { type: 'agent:boot', v: 1 } } as unknown as MessageEvent)
  vi.advanceTimersByTime(3_000)
  expect(console.warn).not.toHaveBeenCalled()
})

test('degrade 清除告警', () => {
  const { frame, onExternal } = makeFrame([hosted, external])
  frame.start()
  frame.degrade('测试降级')
  expect(frame.state.value.phase).toBe('degraded')
  vi.advanceTimersByTime(3_000)
  expect(console.warn).not.toHaveBeenCalled()
  expect(onExternal).toHaveBeenCalledWith(external.url)
})

test('stop 清除告警', () => {
  const { frame } = makeFrame([hosted])
  frame.start()
  frame.stop()
  vi.advanceTimersByTime(3_000)
  expect(console.warn).not.toHaveBeenCalled()
})

// ---- runtime:progress（bootstrap 安装进度转报）----

function attachedFrame(targets: RuntimeTarget[]) {
  const { frame } = makeFrame(targets)
  frame.start()
  const contentWindow = { postMessage: vi.fn() }
  frame.attach({ contentWindow } as unknown as HTMLIFrameElement)
  const source = frame.iframeRef.value?.contentWindow
  const send = (received: number, total: number, origin = virtual.origin, from: unknown = source) =>
    frame.onMessage({ origin, source: from, data: { type: 'runtime:progress', received, total } } as unknown as MessageEvent)
  return { frame, send }
}

test('runtime:progress 按字节比折算百分比，超量钳到 100，total 未知保持原值', () => {
  const { frame, send } = attachedFrame([virtual, external])
  expect(frame.state.value.progress).toBeNull()
  send(512, 1024)
  expect(frame.state.value.progress).toBe(50)
  send(2048, 1024)
  expect(frame.state.value.progress).toBe(100)
  send(100, 0)
  expect(frame.state.value.progress).toBe(100)
})

test('runtime:progress 来源非 iframe 或 origin 不符被忽略', () => {
  const { frame, send } = attachedFrame([virtual, external])
  send(5, 10, virtual.origin, { postMessage: vi.fn() })
  expect(frame.state.value.progress).toBeNull()
  send(5, 10, 'http://evil.example')
  expect(frame.state.value.progress).toBeNull()
})

test('degrade 重置进度', () => {
  const { frame, send } = attachedFrame([virtual, external])
  send(5, 10)
  expect(frame.state.value.progress).toBe(50)
  frame.degrade('测试降级')
  expect(frame.state.value.progress).toBeNull()
})

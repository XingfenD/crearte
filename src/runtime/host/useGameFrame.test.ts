import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_FEATURES } from '../bridge/protocol'
import type { RuntimeTarget } from './adapters'
import { useGameFrame } from './useGameFrame'

const hosted: RuntimeTarget = { mode: 'hosted', url: 'http://hosted-demo.localhost:4173/', origin: 'http://hosted-demo.localhost:4173' }
const external: RuntimeTarget = { mode: 'external', url: 'https://upstream.example/game', origin: null }

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

import { describe, expect, test } from 'vitest'
import { isGameEvent, isHostCommand, isShellMessage, isShellSignal, PROTOCOL_VERSION } from './protocol'

describe('protocol guards', () => {
  test('接受合法命令', () => {
    expect(isHostCommand({ type: 'host:pause' })).toBe(true)
    expect(isHostCommand({ type: 'host:hello', v: PROTOCOL_VERSION, locale: 'zh', capabilities: { save: true, score: true } })).toBe(true)
  })
  test('拒绝未知类型与坏载荷', () => {
    expect(isHostCommand({ type: 'host:nope' })).toBe(false)
    expect(isHostCommand({ type: 'host:score', score: 'x' })).toBe(false)
    expect(isHostCommand(null)).toBe(false)
  })
  test('接受合法事件', () => {
    expect(isGameEvent({ type: 'agent:boot', v: 1 })).toBe(true)
    expect(isGameEvent({ type: 'game:error', message: 'boom' })).toBe(true)
    expect(isGameEvent({ type: 'game:score', score: 42, meta: { a: 1 } })).toBe(true)
  })
  test('拒绝坏事件', () => {
    expect(isGameEvent({ type: 'game:score', score: '42' })).toBe(false)
    expect(isGameEvent({ type: 'game:storage-changed' })).toBe(false)
  })
  test('shell 消息', () => {
    expect(isShellMessage({ type: 'runtime:progress', received: 1, total: 2 })).toBe(true)
    expect(isShellMessage({ type: 'runtime:error', message: 'x' })).toBe(true)
    expect(isShellMessage({ type: 'runtime:install', id: 'a', version: 'v', entry: 'index.html', bundleUrl: 'https://x/b.zip', sha256: 'a'.repeat(64), hostOrigin: 'https://h' })).toBe(true)
    expect(isShellMessage({ type: 'runtime:install', id: 'a' })).toBe(false)
  })
  test('shell 降级信号', () => {
    expect(isShellSignal({ type: 'runtime:degrade', message: 'sha 校验失败' })).toBe(true)
    expect(isShellSignal({ type: 'runtime:degrade' })).toBe(false)
    expect(isShellSignal({ type: 'runtime:ready', version: 'v' })).toBe(false)
  })
})

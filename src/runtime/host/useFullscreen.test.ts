// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useFullscreen } from './useFullscreen'

// happy-dom 无 Fullscreen API：在 document 实例上打桩（遮蔽原型 getter）
let current: Element | null = null
let exitSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  current = null
  Object.defineProperty(document, 'fullscreenElement', { get: () => current, configurable: true })
  exitSpy = vi.fn(async () => { current = null })
  // happy-dom 未实现 exitFullscreen：直接挂实例属性（spyOn 要求属性已存在，这里没有）
  document.exitFullscreen = exitSpy as never
})

afterEach(() => {
  delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen
})

function makeEl() {
  const el = document.createElement('div')
  el.requestFullscreen = vi.fn(async () => { current = el }) as never
  return el
}

test('未全屏时 toggle 进入全屏', async () => {
  const fullscreen = useFullscreen()
  const el = makeEl()
  fullscreen.attach(el)
  await fullscreen.toggle()
  expect(el.requestFullscreen).toHaveBeenCalledTimes(1)
  expect(fullscreen.isFullscreen.value).toBe(false) // 状态由 fullscreenchange 事件同步，API 不自行置位
  fullscreen.sync()
  expect(fullscreen.isFullscreen.value).toBe(true)
})

test('已是本方全屏时 toggle 退出', async () => {
  const fullscreen = useFullscreen()
  const el = makeEl()
  fullscreen.attach(el)
  await fullscreen.enter()
  expect(fullscreen.isFullscreen.value).toBe(false)
  fullscreen.sync()
  expect(fullscreen.isFullscreen.value).toBe(true)
  await fullscreen.toggle()
  expect(exitSpy).toHaveBeenCalledTimes(1)
  expect(current).toBeNull()
})

test('sync 在他方占据全屏时置 false', () => {
  const fullscreen = useFullscreen()
  const el = makeEl()
  fullscreen.attach(el)
  current = document.createElement('span') // 别的元素在全屏
  fullscreen.sync()
  expect(fullscreen.isFullscreen.value).toBe(false)
})

test('API 抛错（手势要求/不支持）时静默吞掉', async () => {
  const fullscreen = useFullscreen()
  const el = document.createElement('div')
  el.requestFullscreen = vi.fn(async () => { throw new Error('user gesture required') }) as never
  fullscreen.attach(el)
  await expect(fullscreen.toggle()).resolves.toBeUndefined()
  expect(fullscreen.isFullscreen.value).toBe(false)
})

test('未 attach 时 toggle 不炸', async () => {
  const fullscreen = useFullscreen()
  await expect(fullscreen.toggle()).resolves.toBeUndefined()
})

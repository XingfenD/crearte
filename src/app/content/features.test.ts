import { describe, expect, test } from 'vitest'
import { EMPTY_FEATURES, FEATURE_ITEMS, collectFeatures, featuresToForm, hasAnyFeature } from './features'

const ALL_KEYS = ['coop', 'eval', 'fullscreen', 'gamepad', 'inlineScript', 'inlineStyle', 'wasm']

describe('collectFeatures', () => {
  test('七个键总是输出：空对象 = 显式不放宽（与历史行为一致）', () => {
    expect(collectFeatures({ ...EMPTY_FEATURES })).toEqual({
      eval: false, inlineScript: false, inlineStyle: false, wasm: false, coop: false, fullscreen: false, gamepad: false
    })
  })

  test('按勾选态透传', () => {
    expect(collectFeatures({ ...EMPTY_FEATURES, eval: true })).toEqual({ ...EMPTY_FEATURES, eval: true })
    expect(collectFeatures({ ...EMPTY_FEATURES, inlineScript: true })).toEqual({ ...EMPTY_FEATURES, inlineScript: true })
  })

  test('七键齐全（不因新增 flag 漏键）', () => {
    expect(Object.keys(collectFeatures({ ...EMPTY_FEATURES })).sort()).toEqual(ALL_KEYS)
  })

  test('五个新开关逐个透传', () => {
    for (const key of ['inlineStyle', 'wasm', 'coop', 'fullscreen', 'gamepad'] as const) {
      const out = collectFeatures({ ...EMPTY_FEATURES, [key]: true })
      expect(out[key]).toBe(true)
      expect(Object.keys(out).sort()).toEqual(ALL_KEYS)
    }
  })
})

describe('featuresToForm', () => {
  test('undefined / 空对象 → 七键全 false', () => {
    expect(featuresToForm(undefined)).toEqual({ ...EMPTY_FEATURES })
    expect(featuresToForm({})).toEqual({ ...EMPTY_FEATURES })
  })

  test('部分勾选回填：缺失键按 false，新增键不漏', () => {
    expect(featuresToForm({ eval: true })).toEqual({ ...EMPTY_FEATURES, eval: true })
    expect(featuresToForm({ inlineScript: true, wasm: true })).toEqual({ ...EMPTY_FEATURES, inlineScript: true, wasm: true })
  })

  test('五个新开关回读', () => {
    const form = featuresToForm({ inlineStyle: true, wasm: true, coop: true, fullscreen: true, gamepad: true })
    expect(form).toEqual({ eval: false, inlineScript: false, inlineStyle: true, wasm: true, coop: true, fullscreen: true, gamepad: true })
  })
})

describe('hasAnyFeature', () => {
  test('undefined / 空 / 全 false → false', () => {
    expect(hasAnyFeature(undefined)).toBe(false)
    expect(hasAnyFeature({})).toBe(false)
    expect(hasAnyFeature({ ...EMPTY_FEATURES })).toBe(false)
  })

  test('任一为 true → true（含五个新键）', () => {
    for (const key of ALL_KEYS) {
      expect(hasAnyFeature({ [key]: true })).toBe(true)
    }
  })
})

describe('FEATURE_ITEMS', () => {
  test('键与 EditableFeatures 一致且文案非空（防改键名后 UI 静默失效）', () => {
    expect(FEATURE_ITEMS.map((i) => i.key).sort()).toEqual(ALL_KEYS)
    for (const item of FEATURE_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.hint.length).toBeGreaterThan(0)
    }
  })
})

import { describe, expect, test } from 'vitest'
import { EMPTY_FEATURES, FEATURE_ITEMS, collectFeatures, featuresToForm, hasAnyFeature } from './features'

describe('collectFeatures', () => {
  test('两个键总是输出：空对象 = 显式不放宽（与历史行为一致）', () => {
    expect(collectFeatures({ eval: false, inlineScript: false })).toEqual({ eval: false, inlineScript: false })
  })

  test('按勾选态透传', () => {
    expect(collectFeatures({ eval: true, inlineScript: false })).toEqual({ eval: true, inlineScript: false })
    expect(collectFeatures({ eval: false, inlineScript: true })).toEqual({ eval: false, inlineScript: true })
  })

  test('不注入未开放的 flag 键', () => {
    expect(Object.keys(collectFeatures({ ...EMPTY_FEATURES })).sort()).toEqual(['eval', 'inlineScript'])
  })
})

describe('featuresToForm', () => {
  test('undefined / 空对象 → 全 false', () => {
    expect(featuresToForm(undefined)).toEqual({ eval: false, inlineScript: false })
    expect(featuresToForm({})).toEqual({ eval: false, inlineScript: false })
  })

  test('部分勾选回填：缺失键按 false', () => {
    expect(featuresToForm({ eval: true })).toEqual({ eval: true, inlineScript: false })
    expect(featuresToForm({ inlineScript: true, wasm: true })).toEqual({ eval: false, inlineScript: true })
  })
})

describe('hasAnyFeature', () => {
  test('undefined / 空 / 全 false → false；任一为 true → true', () => {
    expect(hasAnyFeature(undefined)).toBe(false)
    expect(hasAnyFeature({})).toBe(false)
    expect(hasAnyFeature({ eval: false, inlineScript: false })).toBe(false)
    expect(hasAnyFeature({ eval: true })).toBe(true)
    expect(hasAnyFeature({ inlineScript: true })).toBe(true)
  })
})

describe('FEATURE_ITEMS', () => {
  test('键与 EditableFeatures 一致且文案非空（防改键名后 UI 静默失效）', () => {
    expect(FEATURE_ITEMS.map((i) => i.key).sort()).toEqual(['eval', 'inlineScript'])
    for (const item of FEATURE_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.hint.length).toBeGreaterThan(0)
    }
  })
})

import { expect, test } from 'vitest'
import { cachesToKeep } from './meta'

test('无 meta/pending 时不保留任何 bundle 缓存', () => {
  expect([...cachesToKeep(null, null)]).toEqual(['runtime-meta'])
})

test('保留已安装版本', () => {
  expect([...cachesToKeep('v1', null)]).toEqual(['runtime-meta', 'bundle-v1'])
})

test('安装中的版本也必须保留', () => {
  const keep = cachesToKeep('v1', 'v2')
  expect(keep.has('bundle-v1')).toBe(true)
  expect(keep.has('bundle-v2')).toBe(true)
})

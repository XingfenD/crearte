import { expect, test } from 'vitest'
import { contentTypeFor } from './mime'

test('常见扩展名', () => {
  expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
  expect(contentTypeFor('a/b/game.js')).toBe('text/javascript; charset=utf-8')
  expect(contentTypeFor('x.mjs')).toBe('text/javascript; charset=utf-8')
  expect(contentTypeFor('x.css')).toBe('text/css; charset=utf-8')
  expect(contentTypeFor('x.json')).toBe('application/json; charset=utf-8')
  expect(contentTypeFor('x.wasm')).toBe('application/wasm')
  expect(contentTypeFor('x.svg')).toBe('image/svg+xml')
  expect(contentTypeFor('x.png')).toBe('image/png')
  expect(contentTypeFor('x.woff2')).toBe('font/woff2')
  expect(contentTypeFor('x.ogg')).toBe('audio/ogg')
  expect(contentTypeFor('x.glb')).toBe('model/gltf-binary')
})
test('未知扩展名兜底 octet-stream，且大小写不敏感', () => {
  expect(contentTypeFor('x.PNG')).toBe('image/png')
  expect(contentTypeFor('x.weird')).toBe('application/octet-stream')
  expect(contentTypeFor('noext')).toBe('application/octet-stream')
})
test('原型链键不命中映射表', () => {
  expect(contentTypeFor('x.constructor')).toBe('application/octet-stream')
  expect(contentTypeFor('x.__proto__')).toBe('application/octet-stream')
  expect(contentTypeFor('x.toString')).toBe('application/octet-stream')
})

import { zipSync, strToU8 } from 'fflate'
import { describe, expect, test } from 'vitest'
import { extractZip, validateEntryPath, ZIP_LIMITS } from './unzip'

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

describe('validateEntryPath', () => {
  test('正常路径归一化', () => {
    expect(validateEntryPath('js/game.js')).toBe('js/game.js')
    expect(validateEntryPath('index.html')).toBe('index.html')
  })
  test('拒绝穿越/绝对/反斜杠/空字节', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'a\\b', 'a\0b']) {
      expect(() => validateEntryPath(bad)).toThrowError()
    }
  })
})

describe('extractZip', () => {
  test('解出条目', async () => {
    const entries = await extractZip(zip({ 'index.html': '<h1>hi</h1>', 'js/a.js': '1' }))
    expect(new TextDecoder().decode(entries.get('index.html')!)).toBe('<h1>hi</h1>')
    expect(entries.get('js/a.js')!.length).toBe(1)
  })
  test('超条目数上限报错', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 6; i++) files[`f${i}.txt`] = 'x'
    await expect(extractZip(zip(files), { ...ZIP_LIMITS, maxEntries: 5 })).rejects.toMatchObject({ code: 'too-many-entries' })
  })
  test('单条目超限报错', async () => {
    await expect(extractZip(zip({ 'big.txt': 'x'.repeat(50) }), { ...ZIP_LIMITS, maxEntry: 10 })).rejects.toMatchObject({ code: 'entry-too-large' })
  })
  test('总量超限报错', async () => {
    await expect(extractZip(zip({ 'a.txt': 'x'.repeat(30), 'b.txt': 'y'.repeat(30) }), { ...ZIP_LIMITS, maxTotal: 50 })).rejects.toMatchObject({ code: 'total-too-large' })
  })
})

describe('安全边界（补充）', () => {
  test('包体超限报错', async () => {
    await expect(extractZip(new Uint8Array(16), { ...ZIP_LIMITS, maxBundle: 8 })).rejects.toMatchObject({ code: 'bundle-too-large' })
  })
  test('zip 内穿越路径报错', async () => {
    await expect(extractZip(zip({ '../evil.js': 'x' }))).rejects.toMatchObject({ code: 'bad-path' })
  })
  test('压缩比异常报错', async () => {
    const bomb = zipSync({ 'zeros.bin': new Uint8Array(200_000) })
    await expect(extractZip(bomb)).rejects.toMatchObject({ code: 'ratio-too-high' })
  })
  test('归一化后冲突视为重复条目', async () => {
    await expect(extractZip(zip({ 'a/b.txt': 'x', 'a//b.txt': 'y' }))).rejects.toMatchObject({ code: 'duplicate-entry' })
  })
  test('__proto__ 条目失败关闭且不污染结果', async () => {
    const raw = zip({ abcdefghi: 'x' })
    const name = strToU8('abcdefghi')
    const evil = strToU8('__proto__')
    for (let i = 0; i <= raw.length - name.length; i++) {
      if (name.every((b, j) => raw[i + j] === b)) raw.set(evil, i)
    }
    await expect(extractZip(raw)).rejects.toMatchObject({ code: 'extract-mismatch' })
  })
  test('空路径与过长路径报错，点段归一化', () => {
    expect(() => validateEntryPath('.')).toThrowError()
    expect(() => validateEntryPath('./')).toThrowError()
    expect(() => validateEntryPath('a'.repeat(256))).toThrowError()
    expect(validateEntryPath('a'.repeat(255))).toBe('a'.repeat(255))
    expect(validateEntryPath('a/./b//c')).toBe('a/b/c')
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 色彩对比守卫（spec P9-B §3.1 / D-C）：解析 main.css 的 @theme 色令牌，
// 按 WCAG 2.1 相对亮度计算对比度，钉死关键配色对 ≥4.5（焦点环 ≥3）。
// 仿 no-gradient.test.ts 的源码级守卫范式：这是守卫而非生产代码，故放测试文件内。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 从 main.css 提取 `--color-<name>: #rrggbb` → name 到色值的 map。 */
function parseTokens(): Map<string, string> {
  const css = readFileSync(join(SRC_ROOT, 'app/styles/main.css'), 'utf8')
  const map = new Map<string, string>()
  const re = /--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g
  for (const m of css.matchAll(re)) map.set(m[1], m[2])
  return map
}

// —— 亮度公式：spec §3.1 逐字，别自创 ——
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TOKENS = parseTokens()
const REQUIRED_KEYS = [
  'paper',
  'surface',
  'ink',
  'ink-soft',
  'ink-faint',
  'accent',
  'accent-ink',
  'highlight',
  'success'
]

/** 取令牌色值；解析失败要红得明确，不让配对断言静默跳过。 */
function token(name: string): string {
  const value = TOKENS.get(name)
  if (!value) throw new Error(`token --color-${name} not parsed from main.css`)
  return value
}

describe('WCAG 对比度守卫（spec §3.1）', () => {
  it('main.css 的 @theme 必须解析出全部九个色令牌', () => {
    const missing = REQUIRED_KEYS.filter((k) => !TOKENS.has(k))
    expect(missing, `main.css 缺少色令牌: ${missing.join(', ')}`).toEqual([])
  })

  // AA 正文 ≥4.5 的关键配色对（fg on bg），逐字用 spec §3.1 清单
  const AA_PAIRS: Array<[string, string]> = [
    ['paper', 'success'],
    ['paper', 'accent-ink'],
    ['ink', 'highlight'],
    ['ink', 'accent'],
    ['ink-soft', 'paper'],
    ['ink-faint', 'paper'],
    ['ink-soft', 'surface'],
    ['ink-faint', 'surface'],
    ['paper', 'ink'],
    ['accent-ink', 'paper']
  ]
  for (const [fg, bg] of AA_PAIRS) {
    it(`${fg} on ${bg} ≥ 4.5 (AA)`, () => {
      expect(
        contrast(token(fg), token(bg)),
        `${fg}(${token(fg)}) on ${bg}(${token(bg)})`
      ).toBeGreaterThanOrEqual(4.5)
    })
  }

  // 焦点环属非文本对比（WCAG 1.4.11），阈值 ≥3——防回归钉桩
  it('accent on paper ≥ 3（焦点环，非文本 1.4.11）', () => {
    expect(
      contrast(token('accent'), token('paper')),
      `accent(${token('accent')}) on paper(${token('paper')})`
    ).toBeGreaterThanOrEqual(3)
  })
})

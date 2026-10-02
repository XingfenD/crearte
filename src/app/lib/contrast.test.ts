import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 色彩对比守卫（spec P9-B §3.1 / D-C；P13 重构 D-H / D-B / D-F）。
// 仿 no-gradient.test.ts 的源码级守卫范式：这是守卫而非生产代码，故放测试文件内。
//
// P13-T1：parseTokens 由「单个全局 Map」重构为「按块解析双主题」。旧实现对含
// html[data-theme="dark"] 块的 main.css 会把九个旧键全部静默解析成暗色值（全局正则 +
// 后写覆盖），而断言标签仍写「light palette」→ 守卫静默变成只守暗色（FINDINGS-survey.md
// 「守卫重构必要性」；本文件末尾的 D-H 反面钉桩钉住该缺陷，防后人「简化」回单 Map）。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

function readMainCss(): string {
  return readFileSync(join(SRC_ROOT, 'app/styles/main.css'), 'utf8')
}

/** 提取 marker 之后第一个 `{…}` 块的内容（花括号深度匹配：@theme 内含嵌套 @keyframes）。 */
function extractBlock(css: string, marker: RegExp): string | null {
  const m = marker.exec(css)
  if (!m) return null
  const open = css.indexOf('{', m.index + m[0].length)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return null
}

/** 从块内容提取 `--color-<name>: #rrggbb` → name 到色值的 Map。 */
function colorsIn(block: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g
  for (const m of block.matchAll(re)) map.set(m[1], m[2])
  return map
}

type ThemeName = 'light' | 'dark'

/**
 * 按块解析（D-H）：亮色 = `@theme` 块，暗色 = `html[data-theme="dark"]` 块（D-C 钉的选择器）。
 * 亮色 `@theme` 缺失 = 真解析失败 → throw（沿用既有范式，不静默）；
 * 暗色块缺失（T1 RED 相位）→ 空 Map，由「12 令牌齐备」断言明确报「暗色 12 令牌缺失」。
 */
function parsePalettes(): Record<ThemeName, Map<string, string>> {
  const css = readMainCss()
  const lightBlock = extractBlock(css, /@theme\b/)
  if (lightBlock === null) throw new Error('main.css 未找到 @theme 块，无法解析亮色令牌')
  const darkBlock = extractBlock(css, /html\[data-theme="dark"\]/)
  return { light: colorsIn(lightBlock), dark: colorsIn(darkBlock ?? '') }
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

const PALETTES = parsePalettes()

// P13 全量 12 令牌（spec §3.1(b)）；旧九键是其子集（见文件末尾 LEGACY_KEYS）。
const REQUIRED_KEYS = [
  'paper',
  'surface',
  'ink',
  'ink-soft',
  'ink-faint',
  'accent',
  'accent-ink',
  'highlight',
  'info',
  'success',
  'skeleton', // P13 新增（D-G）：StatePanel 骨架屏令牌化
  'scrim' // P13 新增（D-E）：遮罩专用，两主题同值 #0d0b08，不参与翻转
]

/** 取令牌色值；解析失败要红得明确，不让配对断言静默跳过。 */
function token(theme: ThemeName, name: string): string {
  const value = PALETTES[theme].get(name)
  if (!value) {
    throw new Error(
      `token --color-${name} not parsed from main.css（${theme === 'dark' ? '暗色' : '亮色'}块）`
    )
  }
  return value
}

// AA 正文 ≥4.5 的真实配对（FINDINGS 第 7 轮全量表；注释内为 亮/暗 实测值）
const AA_PAIRS: Array<[fg: string, bg: string, note: string]> = [
  ['ink', 'paper', '正文全站 亮16.50/暗16.45'],
  ['ink-soft', 'paper', '次要文 亮6.36/暗10.58'],
  ['ink-faint', 'paper', '::placeholder+弱文 亮4.83/暗6.99'],
  ['ink-soft', 'surface', '卡片次要文 亮7.10/暗9.55'],
  ['ink-faint', 'surface', '卡片弱文 亮5.40/暗6.31'],
  ['ink', 'highlight', 'alert×8/strong/选中态/::selection 亮11.30/暗4.81'],
  ['paper', 'accent-ink', 'badge/按钮/error toast 亮4.87/暗10.78'],
  ['paper', 'success', 'success toast 亮4.76/暗5.81'],
  ['paper', 'ink', '.btn-ink/markdown th 亮16.50/暗16.45'],
  ['accent-ink', 'paper', '链接 text-accent-ink 亮4.87/暗10.78']
]

for (const theme of ['light', 'dark'] as ThemeName[]) {
  const zh = theme === 'dark' ? '暗色' : '亮色'

  describe(`WCAG 对比度守卫 · ${zh}调色板（P9-B §3.1 / P13 D-B）`, () => {
    it(`${zh} 12 令牌齐备（spec §3.1(b)）`, () => {
      const missing = REQUIRED_KEYS.filter((k) => !PALETTES[theme].has(k))
      expect(missing, `${zh} 12 令牌缺失: ${missing.join(', ')}`).toEqual([])
    })

    for (const [fg, bg, note] of AA_PAIRS) {
      it(`${fg} on ${bg} ≥ 4.5（AA 正文；${note}）`, () => {
        expect(
          contrast(token(theme, fg), token(theme, bg)),
          `${zh} ${fg}(${token(theme, fg)}) on ${bg}(${token(theme, bg)})`
        ).toBeGreaterThanOrEqual(4.5)
      })
    }

    // wordmark：.wordmark-label = accent-ink on highlight。不声明 font-size，继承
    // LandingView.vue:47 的 h1 text-4xl sm:text-5xl md:text-6xl font-black → WCAG 大字号，
    // 阈值 3.0（FINDINGS 第 7 轮修正：先前误用 4.5 属阈值用错；亮 3.34 / 暗 3.15 双达标）。
    it('accent-ink on highlight ≥ 3.0（wordmark 大字号；亮3.34/暗3.15）', () => {
      expect(
        contrast(token(theme, 'accent-ink'), token(theme, 'highlight')),
        `${zh} accent-ink(${token(theme, 'accent-ink')}) on highlight(${token(theme, 'highlight')})`
      ).toBeGreaterThanOrEqual(3)
    })

    // 焦点环 + h3 左边框 + li 圆点 = 非文本对比（WCAG 1.4.11），阈值 ≥3（亮3.26/暗7.12）。
    // 反面记录（FINDINGS 第 7 轮）：若 ResultMeta 角标忘迁移（text-ink on bg-accent），
    // 亮 5.06 侥幸过、暗 2.31 必红 —— 该缺陷由 T3 组件测试钉类名，此处只记录数值不断言。
    it('accent on paper ≥ 3（焦点环，非文本 1.4.11）', () => {
      expect(
        contrast(token(theme, 'accent'), token(theme, 'paper')),
        `${zh} accent(${token(theme, 'accent')}) on paper(${token(theme, 'paper')})`
      ).toBeGreaterThanOrEqual(3)
    })

    // D-F 正确不变量 = max(填充侧 paper, 边框侧 ink) vs scrim ≥ 3。
    // ⚠️ spec §5 T1.4 原文「ink vs scrim ≥ 3 两主题」与实测冲突：亮色 ink(#141414) vs
    // scrim(#0d0b08) = 1.07（两个深色互不分离）——亮色的分离由填充侧 paper(17.60) 提供；
    // 暗色填充侧 paper(1.07) 不分离、必须由边框侧 ink(17.60) 提供（下方暗色专属钉桩）。
    // 依 FINDINGS 第 7 轮定案：「正确不变量 = max(填充侧, 边框侧) ≥ 3，两主题均满足」。
    it('scrim 分离：max(paper, ink) vs scrim ≥ 3（D-F）', () => {
      const scrim = token(theme, 'scrim')
      const fill = contrast(token(theme, 'paper'), scrim)
      const border = contrast(token(theme, 'ink'), scrim)
      expect(
        Math.max(fill, border),
        `${zh} paper vs scrim=${fill.toFixed(2)}, ink vs scrim=${border.toFixed(2)}（scrim=${scrim}）`
      ).toBeGreaterThanOrEqual(3)
    })

    // D-G：skeleton 装饰性（无 WCAG 要求）但须对 paper 可辨（实测 亮1.08 / 暗1.24）
    it('skeleton vs paper ≥ 1.05（骨架屏对页面底色可辨，D-G）', () => {
      expect(
        contrast(token(theme, 'skeleton'), token(theme, 'paper')),
        `${zh} skeleton(${token(theme, 'skeleton')}) vs paper(${token(theme, 'paper')})`
      ).toBeGreaterThanOrEqual(1.05)
    })
  })
}

describe('WCAG 对比度守卫 · scrim 边框侧（P13 D-F）', () => {
  // 暗色下填充侧 paper(#17140f) vs scrim(#0d0b08) = 1.07，不提供分离 →
  // 抽屉与遮罩的分离必须由 border-t-[3px] border-ink 承担（实测 17.60）。
  it('暗色下 ink vs scrim ≥ 3（边框侧是暗色唯一分离来源，实测 17.60）', () => {
    expect(
      contrast(token('dark', 'ink'), token('dark', 'scrim')),
      `暗色 ink(${token('dark', 'ink')}) vs scrim(${token('dark', 'scrim')})`
    ).toBeGreaterThanOrEqual(3)
  })
})

// —— D-H 反面钉桩：单 Map 解析器对含暗色块的 CSS 会得出错误结果 ——
// 重构前 parseTokens() 的逐字拷贝（FINDINGS「守卫重构必要性」引用的原始实现）。
function legacySingleMapParse(css: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g
  for (const m of css.matchAll(re)) map.set(m[1], m[2])
  return map
}

// 旧守卫的九个 REQUIRED_KEYS。scrim 不在其中且两主题同值（后写覆盖不可观测），故排除；
// 九键在两主题下值必须互异，否则本钉桩无鉴别力（断言内含前提检查）。
const LEGACY_KEYS = [
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

describe('D-H 反面钉桩：单 Map 解析器对含暗色块的 CSS 得出错误结果', () => {
  it('重构前逻辑会把九个旧键全部解析成暗色值（亮色守卫静默丢失）', () => {
    const legacy = legacySingleMapParse(readMainCss())
    for (const key of LEGACY_KEYS) {
      const dark = token('dark', key)
      const light = token('light', key)
      expect(
        dark,
        `前提不成立：--color-${key} 两主题必须异值，否则反面钉桩无鉴别力`
      ).not.toBe(light)
      // 后写覆盖：暗色块在源码中位于 @theme 之后 → 单 Map 的九键全部变成暗色值，
      // 而旧断言标签仍写「light palette」→ 亮色实际完全未被守（假信心）。
      expect(
        legacy.get(key),
        `单 Map 解析 --color-${key} 应被后写覆盖为暗色值 ${dark}（实得 ${legacy.get(key) ?? '∅'}）`
      ).toBe(dark)
    }
  })
})

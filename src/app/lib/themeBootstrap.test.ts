import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_KEY } from '@/composables/useTheme'

// P13-T4 / D-K 首屏一致性守卫（源码级，node 环境——与 contrast.test.ts / no-gradient.test.ts
// 同族）：index.html 内联 pre-paint 脚本的判定优先级必须与 useTheme.ts 逐字一致
//（stored → prefers-color-scheme → light），否则首屏与挂载后会闪一下（FOUC 就白防了）。
// 内联脚本是纯 JS 字符串、无法 import，故用源码文本钉桩：改任一处，本守卫与
// useTheme.test.ts 的行为断言至少有一处会红。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const html = readFileSync(join(SRC_ROOT, 'index.html'), 'utf8')
const themeSrc = readFileSync(join(SRC_ROOT, 'app/composables/useTheme.ts'), 'utf8')

// head 内的第一个非 module <script> 块（pre-paint 脚本）。顺序断言必须在脚本体内做：
// HTML 注释里也写着「prefers-color-scheme」等字样，全文 indexOf 会先命中注释（实现期实测）。
function inlineScript(): string {
  const head = html.slice(0, html.indexOf('<body'))
  const m = /<script>([\s\S]*?)<\/script>/.exec(head)
  if (!m) throw new Error('index.html 的 <head> 内未找到内联（非 module）pre-paint 脚本')
  return m[1]
}

describe('index.html 内联 pre-paint 脚本与 useTheme 的一致性（P13-T4 / D-K）', () => {
  it('两处引用同一个存储键字面量（改键名必须两处同改）', () => {
    expect(THEME_KEY).toBe('crearte.theme.v1')
    expect(html, 'index.html 应内联同一键名').toContain(`'${THEME_KEY}'`)
    expect(themeSrc).toContain(`THEME_KEY = '${THEME_KEY}'`)
  })

  it('判定优先级为 stored → prefers-color-scheme → light（与 effectiveTheme 同序）', () => {
    const script = inlineScript()
    const iStored = script.indexOf('localStorage.getItem')
    const iSystem = script.indexOf('prefers-color-scheme')
    const iFallback = script.indexOf(": 'light'")
    expect(iStored, '内联脚本应读 localStorage').toBeGreaterThan(-1)
    expect(iSystem, '内联脚本应查 prefers-color-scheme').toBeGreaterThan(-1)
    expect(iFallback, '内联脚本应有 light 兜底').toBeGreaterThan(-1)
    expect(iStored, 'stored 判定须在系统偏好之前').toBeLessThan(iSystem)
    expect(iSystem, '系统偏好须在 light 兜底之前').toBeLessThan(iFallback)
  })

  it('脚本在 <head> 内、<body> 之前（pre-paint，否则暗色用户每次刷新闪白）', () => {
    const headOpen = html.indexOf('<head>')
    const bodyOpen = html.indexOf('<body')
    const iScript = html.indexOf("setAttribute('data-theme'")
    expect(headOpen).toBeGreaterThan(-1)
    expect(bodyOpen).toBeGreaterThan(-1)
    expect(iScript, '设置 data-theme 的脚本须位于 head 内').toBeGreaterThan(headOpen)
    expect(iScript, '设置 data-theme 的脚本须在 <body> 之前').toBeLessThan(bodyOpen)
  })

  it('两个主题的 theme-color 值与 applyTheme 同值', () => {
    // applyTheme 的暗/亮值（dark #17140f = 暗色 paper，light #f7f2e7 = 亮色 paper）
    expect(themeSrc).toContain("theme === 'dark' ? '#17140f' : '#f7f2e7'")
    expect(html, '内联脚本应写同一对值').toContain("theme === 'dark' ? '#17140f' : '#f7f2e7'")
  })

  it('内联脚本不依赖 ES module 时序（IIFE + var，D-K 约束）', () => {
    const body = inlineScript()
    expect(body).toContain('(function ()')
    expect(body).not.toMatch(/\bconst\b|\blet\b/)
    // 失败兜底：脚本自身抛错时仍要落 light（防 html 无 data-theme 的裸奔态）
    expect(body).toContain("setAttribute('data-theme', 'light')")
  })

  it('meta[name=color-scheme] 声明 light dark（两主题都允许，D-L 配套）', () => {
    expect(html).toContain('<meta name="color-scheme" content="light dark" />')
  })
})

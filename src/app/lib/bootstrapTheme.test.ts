import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// P15-B 守卫（spec §5-T1 / D-A…D-G）：钉住 bootstrap 游戏加载屏的 pre-paint 主题脚本、
// 两主题调色板与主应用一致、以及 GameHost 的**非响应式**主题注入。
//
// 源码级守卫，node 环境（与 contrast.test.ts / themeBootstrap.test.ts / noHardcodedColor.test.ts
// 同族）：vitest 无 environment 键 → 默认 node，故可用 fileURLToPath 读盘。
// ⚠️ 不得引入需要 DOM 的断言（P13 教训：happy-dom 下 fileURLToPath(new URL(...)) 抛
// ERR_INVALID_URL_SCHEME）。
//
// ⚠️ 本文件注释/字符串**不得出现完整的 Tailwind 硬编码色 utility 字面量**（spec §8-8 / AGENTS.md
// 不变量 §8-5b）：Tailwind v4 扫描全部源文件含 .test.ts，会把候选类名烧死进产物。下方只比对
// 裸 hex 值（非 utility 类名），不构成候选。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 读盘；缺失/不可读 → 空串（让断言以「找不到」红，而不是在收集期抛错整文件失败）。 */
function tryRead(rel: string): string {
  try {
    return readFileSync(join(SRC_ROOT, rel), 'utf8')
  } catch {
    return ''
  }
}

const bootstrapHtml = tryRead('bootstrap/index.html')
const useThemeSrc = tryRead('app/composables/useTheme.ts')
const mainCss = tryRead('app/styles/main.css')
const contrastSrc = tryRead('app/lib/contrast.test.ts')
const gameHostSrc = tryRead('runtime/host/GameHost.vue')

// —— CSS 块提取（花括号深度匹配，兼容 @theme 内嵌套 @keyframes）——
function extractBlock(css: string, marker: string): string {
  const idx = css.indexOf(marker)
  if (idx < 0) return ''
  const open = css.indexOf('{', idx)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return ''
}

/** 从块内容提取 `--<prefix>-<name>: #rrggbb` → name 到小写 hex 的 Map。 */
function customProps(block: string, prefix: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = new RegExp(`--${prefix}-([\\w-]+):\\s*(#[0-9a-fA-F]{6})`, 'g')
  for (const m of block.matchAll(re)) map.set(m[1], m[2].toLowerCase())
  return map
}

/**
 * 把注释替换为**等长空白**（保行号），沿用 noHardcodedColor.test.ts 的屏蔽范式。
 * 支持 HTML `<!-- -->`、块注释、行尾 `//`（跳过 `://`，P14 教训：字符串里的 `//`
 * 被当注释起点会造成假阳性）。
 *
 * 为何必需（实测，2026-10-03）：
 * 1. spec §3.1(a) 给的注释文本里写着「必须在 `<style>` 与 `<body>` 之前」。注释位于 pre-paint
 *    脚本之前，naive `indexOf` 会先命中**注释里的字面量** → styleOpen 偏小 → 「scriptPos <
 *    styleOpen」对**正确实现**判假红（node 复现：styleOpen=48 命中注释、scriptPos=245 命中真
 *    脚本，断言 false）。主应用 `src/index.html` 的注释刻意写「必须在 CSS 与 Vue 之前」避开
 *    这两个字面量，故 themeBootstrap.test.ts 的 naive indexOf 不误红；本守卫不依赖实现侧的
 *    措辞自律，直接屏蔽注释。
 * 2. 腿5 的负向断言与 spec §3.1(e)「须在代码注释里写明这个陷阱」相冲：陷阱注释必然写出被禁
 *    的响应式形态字面量 → 不屏蔽则对正确实现假红。
 * 3. 腿 6/7/8 同样受益：注释里出现暗色块选择器、旧亮色 hex 或 style 示例都不会造成假绿/假红。
 */
function maskSourceComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    let stop = -1
    let end = -1
    if (two === '<!--') {
      const s = src.indexOf('-->', i + 4)
      if (s > -1) { stop = s; end = s + 3 }
    } else if (two === '/*') {
      const s = src.indexOf('*/', i + 2)
      if (s > -1) { stop = s; end = s + 2 }
    } else if (two === '//' && src[i - 1] !== ':') {
      const s = src.indexOf('\n', i)
      if (s > -1) { stop = s; end = s }
    }
    if (stop > -1) {
      out += src.slice(i, end).replace(/[^\n]/g, ' ')
      i = end
    } else {
      out += src[i]
      i++
    }
  }
  return out
}

/** 已屏蔽注释的文本（所有位置/存在性/负向断言都基于它们）。 */
const bootstrapMasked = maskSourceComments(bootstrapHtml)
const gameHostMasked = maskSourceComments(gameHostSrc)

/** bootstrap <head> 内的内联（非 module）pre-paint 脚本体；缺失 → 空串。 */
function bootstrapInlineScript(): string {
  const bodyIdx = bootstrapMasked.indexOf('<body')
  const head = bodyIdx > -1 ? bootstrapMasked.slice(0, bodyIdx) : bootstrapMasked
  const m = /<script>([\s\S]*?)<\/script>/.exec(head)
  return m ? m[1] : ''
}

/**
 * GameHost 里 `resolveRuntimeTargets(...)` 调用的完整实参文本（括号深度匹配）。
 * 腿5 的断言限定在**调用点**而非全文件：陷阱注释写在语句上方，不会被当成注入形态。
 */
function resolveCallArgs(): string {
  const marker = 'resolveRuntimeTargets('
  const start = gameHostMasked.indexOf(marker)
  if (start < 0) return ''
  let depth = 0
  for (let i = start + marker.length - 1; i < gameHostMasked.length; i++) {
    const c = gameHostMasked[i]
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) return gameHostMasked.slice(start, i + 1)
  }
  return gameHostMasked.slice(start)
}

// contrast.test.ts 里的 AA_PAIRS / REQUIRED_KEYS（腿 10 用；两者均未 export，故按文本解析）
function requiredKeys(): string[] {
  const m = /const REQUIRED_KEYS = \[([\s\S]*?)\n\]/.exec(contrastSrc)
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
function aaPairsHasInkSurface(): boolean {
  const m = /const AA_PAIRS[^=]*= \[([\s\S]*?)\n\]/.exec(contrastSrc)
  if (!m) return false
  // 只认 ['ink','surface',…]；['ink-soft','surface'] 因 'ink' 后是 '-' 而非引号，不会误命中
  return /\[\s*'ink'\s*,\s*'surface'\s*,/.test(m[1])
}

// §1.1 表的六个亮色 hex（腿 7 的「不得回退」钉桩；与 main.css @theme 亮色逐值相同）
const LIGHT_HEX: ReadonlyArray<[token: string, hex: string]> = [
  ['paper', '#f7f2e7'],
  ['surface', '#ffffff'],
  ['ink', '#141414'],
  ['ink-soft', '#5c584d'],
  ['accent', '#e8552f'],
  ['accent-ink', '#c03a1b']
]
// 腿 6 逐值比对的六个令牌（bootstrap 自包含 hex，故须钉两处调色板不分叉）
const DARK_TOKENS = ['paper', 'surface', 'ink', 'ink-soft', 'accent', 'accent-ink'] as const

describe('bootstrap 加载屏主题守卫（P15-B §5-T1 / D-A…D-G）', () => {
  // 腿 1：pre-paint 脚本位置（D-G）。marker = setAttribute('data-theme'，唯一属于 pre-paint 脚本。
  it('腿1 pre-paint 脚本在 <head> 内、<style> 与 <body> 之前（否则暗色用户每次启动闪白）', () => {
    const headOpen = bootstrapMasked.indexOf('<head>')
    const styleOpen = bootstrapMasked.indexOf('<style')
    const bodyOpen = bootstrapMasked.indexOf('<body')
    const scriptPos = bootstrapMasked.indexOf("setAttribute('data-theme'")
    expect(headOpen, '应有 <head>').toBeGreaterThan(-1)
    expect(styleOpen, '应有 <style>').toBeGreaterThan(-1)
    expect(bodyOpen, '应有 <body>').toBeGreaterThan(-1)
    expect(scriptPos, '应有设置 data-theme 的 pre-paint 脚本').toBeGreaterThan(-1)
    expect(scriptPos, 'pre-paint 脚本须在 <head> 内').toBeGreaterThan(headOpen)
    expect(scriptPos, 'pre-paint 脚本须在 <style> 之前（否则先绘亮色再翻暗）').toBeLessThan(styleOpen)
    expect(scriptPos, 'pre-paint 脚本须在 <body> 之前').toBeLessThan(bodyOpen)
  })

  // 腿 2：判定序 hash → prefers → light（D-A）。⚠️ 先断言三者都 > -1，否则某个 indexOf 返 -1 时
  // 「-1 < 任何正数」会让顺序断言恒真（themeBootstrap.test.ts:42-44 同款手法）。
  it('腿2 判定序 = hash theme → prefers-color-scheme → light（indexOf 比较，先钉三者存在）', () => {
    const script = bootstrapInlineScript()
    const iHash = script.indexOf("params.get('theme')")
    const iPrefers = script.indexOf('prefers-color-scheme')
    const iLight = script.indexOf(": 'light'")
    expect(iHash, 'bootstrap 脚本应读 hash theme').toBeGreaterThan(-1)
    expect(iPrefers, 'bootstrap 脚本应查 prefers-color-scheme').toBeGreaterThan(-1)
    expect(iLight, 'bootstrap 脚本应有 light 兜底').toBeGreaterThan(-1)
    expect(iHash, 'hash theme 判定须在 prefers 之前（D-A：hash 优先）').toBeLessThan(iPrefers)
    expect(iPrefers, 'prefers 须在 light 兜底之前').toBeLessThan(iLight)
    // D-A「后两级与 effectiveTheme 逐字一致」：同一 prefers 媒体查询字面量
    expect(script, 'bootstrap 的 prefers 媒体查询应与主应用同款').toContain('(prefers-color-scheme: dark)')
    expect(useThemeSrc, 'useTheme.systemTheme 应含同款 prefers 媒体查询').toContain(
      '(prefers-color-scheme: dark)'
    )
  })

  // 腿 3：白名单校验 hash theme（防放宽成「任意 truthy」，P13 finding #2 / N2 同族）。
  it('腿3 用白名单校验 hash theme（只接受 light/dark，放宽成任意 truthy 即红）', () => {
    const script = bootstrapInlineScript()
    expect(script, 'bootstrap 应只接受 light/dark 两个 hash theme 值').toContain(
      "hashTheme === 'light' || hashTheme === 'dark'"
    )
  })

  // 腿 4：IIFE + 仅 var（D-G 的 CSP 前形态，逐字对齐主应用 index.html）。
  it('腿4 pre-paint 脚本是 IIFE 且只用 var（无 let/const/箭头/import）', () => {
    const script = bootstrapInlineScript()
    expect(script, '应是 IIFE').toContain('(function ()')
    expect(script, 'IIFE 应自执行收尾').toContain('})()')
    expect(script, 'CSP 前形态不得用 const/let').not.toMatch(/\bconst\b|\blet\b/)
    expect(script, '不得用箭头函数').not.toMatch(/=>/)
    expect(script, '不得用 import（pre-paint 非 module）').not.toMatch(/\bimport\b/)
    // 失败兜底：脚本自身抛错时仍落 light（防 html 无 data-theme 的裸奔态）
    expect(script, '应有 catch 兜底落 light').toContain("setAttribute('data-theme', 'light')")
  })

  // 腿 5：🔴 D-B 架构陷阱——GameHost 注入的必须是 effectiveTheme() 非响应式快照。
  // 若写成 useTheme().theme.value，读 ref 的 getter 会让 targets(computed) 依赖主题 →
  // 用户在游戏页切主题 → targets 重算 → iframe src 变 → **正在运行的游戏被重载**（存档丢失）。
  // effectiveTheme() 读 localStorage/matchMedia（非响应式源），不建立依赖。
  it('腿5 GameHost 注入 effectiveTheme() 快照而非响应式 theme.value（D-B：防切主题重载游戏）', () => {
    expect(gameHostMasked, 'GameHost 应 import effectiveTheme').toMatch(
      /import\s*\{[^}]*\beffectiveTheme\b[^}]*\}\s*from\s*['"][^'"]*useTheme['"]/
    )
    const args = resolveCallArgs()
    expect(args, '应能在 GameHost 里找到 resolveRuntimeTargets 调用').not.toBe('')
    expect(args, 'D-B：注入的必须是非响应式快照 effectiveTheme()').toContain(
      'theme: effectiveTheme()'
    )
    // 反向钉桩限定在调用点：targets 是 computed，读 ref 的 getter 会让它依赖主题 →
    // 用户切主题 → 重算 → iframe src 变 → 运行中的游戏被重载（存档丢失）。
    expect(
      args,
      '不得注入响应式 theme.value（D-B 架构陷阱；后果是切主题重载运行中的游戏）'
    ).not.toContain('theme.value')
    expect(args, '不得在调用点取用 useTheme()（模块级响应式单例）').not.toContain('useTheme()')
  })

  // 腿 6：bootstrap 暗色块六个 hex 与 main.css 暗色调色板**逐值一致**（字符串相等）。
  // ⚠️ 不得写成 max(a,b) ≥ k 形态（P13 恒真高发区）；此处用 toBe 字符串相等。
  it('腿6 bootstrap 暗色块六个 hex 与 main.css 暗色调色板逐值一致（字符串相等）', () => {
    const bsDark = customProps(extractBlock(bootstrapMasked, 'html[data-theme="dark"]'), 'bs')
    const mcDark = customProps(extractBlock(mainCss, 'html[data-theme="dark"]'), 'color')
    for (const t of DARK_TOKENS) {
      const mcVal = mcDark.get(t)
      expect(mcVal, `前提：main.css 暗色块应含 --color-${t}`).toBeTruthy()
      expect(
        bsDark.get(t),
        `bootstrap 暗色 --bs-${t} 应与 main.css --color-${t}(${mcVal}) 逐值一致`
      ).toBe(mcVal)
    }
  })

  // 腿 7：bootstrap 亮色六个 hex 未被改动（§1.1 表，「不得回退」钉桩，RED 相位即应绿）。
  it('腿7 bootstrap 亮色六个 hex 仍在（§1.1 表，本批只加暗色不动亮色值）', () => {
    const lower = bootstrapMasked.toLowerCase()
    for (const [token, hex] of LIGHT_HEX) {
      expect(lower, `bootstrap 亮色 ${token}(${hex}) 应仍在`).toContain(hex)
    }
  })

  // 腿 8：bootstrap 内不存在 inline style 里的 color:（D-E 回归钉桩；本批刚删两处 2.2594/2.4776）。
  it('腿8 bootstrap/index.html 内不存在 inline style 里的 color:（防 WCAG 违规复发）', () => {
    expect(bootstrapMasked, 'inline style 属性里不得再写 color:（应由样式块的达标值生效）').not.toMatch(
      /style\s*=\s*"[^"]*\bcolor\s*:/i
    )
  })

  // 腿 9：前提检查（防「读 0 文件也报 0 违规」的假信心，P13 M5/M6、P14 R0 同族）。
  // 独立于上面的共享 tryRead，直接核验三个核心源文件在盘上存在且非空——这条腿是 precondition gate。
  it('腿9 前提检查：三个核心源文件确实读到且 bootstrap html 长度 >500', () => {
    const canonical = [
      join(SRC_ROOT, 'bootstrap/index.html'),
      join(SRC_ROOT, 'app/composables/useTheme.ts'),
      join(SRC_ROOT, 'app/styles/main.css')
    ]
    const present = canonical.filter((p) => existsSync(p) && readFileSync(p, 'utf8').length > 0)
    expect(
      present.length,
      `应读到 ≥3 个核心源文件，实读 ${present.length}/${canonical.length}（路径被改坏或文件被删即红）`
    ).toBeGreaterThanOrEqual(3)
    expect(bootstrapHtml.length, 'bootstrap/index.html 应 >500 字符（防空文件假绿）').toBeGreaterThan(500)
  })

  // 腿 10：改动②③回归钉桩。⚠️ 长度用 toBe(11) 而非 toBeGreaterThanOrEqual（后者删令牌后仍绿=无牙）。
  it('腿10 AA_PAIRS 含 ink/surface 且 REQUIRED_KEYS 不含 info、长度 toBe(11)', () => {
    expect(aaPairsHasInkSurface(), "AA_PAIRS 应含 ['ink','surface'] 配对（改动②补钉，62 处使用面）").toBe(
      true
    )
    const keys = requiredKeys()
    expect(keys, 'REQUIRED_KEYS 不应含 info（改动③已删死令牌）').not.toContain('info')
    expect(
      keys.length,
      `REQUIRED_KEYS 长度应为 11（删 info 后），实得 ${keys.length}: ${keys.join(', ')}`
    ).toBe(11)
  })
})

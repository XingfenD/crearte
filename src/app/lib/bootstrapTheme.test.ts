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
 * 提取所有 inline `style=` 属性值（双引号 / 单引号 / 无引号三形态都收），返回去引号后的值数组。
 * F-5：腿8 用它替代「只认双引号」的单正则，使单引号 / 无引号违规色也能被抓到（HTML 三种引号
 * 形态均合法）。实测见 impl-evidence/fix-f5-regex-analysis.log。
 */
function inlineStyleValues(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)) {
    const raw = m[1]
    out.push(raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw)
  }
  return out
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
// F-6：mainCss 也须屏蔽注释——腿6 的 extractBlock 用 indexOf 定位暗色块选择器，注释里的同名
// 选择器会先命中（I3/I3c 假块劫持）。屏蔽策略须一致，不能只屏蔽 bootstrap/gameHost。
const mainCssMasked = maskSourceComments(mainCss)

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
  //
  // ⚠️ 锚点必须钉在**判定分支**（hashTheme === 'light'），不能钉在**提取处**（params.get('theme')）。
  // 实测（2026-10-03，python 复现）：锚提取处时，把判定序语义重排成 prefers 优先后
  // iHash=103 < iPref=198 依旧成立 → 守卫**假绿**，而缺陷是真的（显式选亮色但系统暗色的
  // 用户会看到暗色加载屏）。锚判定处则 iHash=275 > iPref=198 → 红，有牙。
  // 这是 themeBootstrap.test.ts finding #2 / M3 承认过的同族盲区（「子串文本位置对语义重排
  // 无鉴别力」）；主应用靠 dark.spec.ts 的反方向行为腿补救，本腿则直接把锚点钉对。
  //
  // ⚠️ F-3（critical 级缺口）：锚判定分支只对**已枚举的那一种重排**有牙。审查实测 H1（白名单提取
  // 成变量 + prefers 优先）与 H3（拆中间变量的嵌套三元）两种语义等价的缺陷形态都绕过本腿
  // （RED=[]），且 H1 **同时逃过全部 5 条既有 e2e 腿**（覆盖矩阵缺 [系统暗色]×[hash=light] 这一格）。
  // 故本腿的字面脆弱性可接受，但**语义正确性由 e2e/bootstrapTheme.spec.ts 的反方向格
  // （[系统暗色]×[hash=light] → 期望 light）在运行时钉死**——那一格是 H1/H3 的唯一鉴别格，
  // 分工与主应用一致（源码腿钉文本、e2e 腿钉行为）。
  it('腿2 判定序 = hash theme → prefers-color-scheme → light（锚判定分支，先钉三者存在）', () => {
    const script = bootstrapInlineScript()
    const iExtract = script.indexOf("params.get('theme')")
    const iHash = script.indexOf("hashTheme === 'light'")
    const iPrefers = script.indexOf('prefers-color-scheme')
    const iLight = script.indexOf(": 'light'")
    expect(iExtract, 'bootstrap 脚本应从 hash 提取 theme').toBeGreaterThan(-1)
    expect(iHash, 'bootstrap 脚本应有 hash theme 的白名单判定分支').toBeGreaterThan(-1)
    expect(iPrefers, 'bootstrap 脚本应查 prefers-color-scheme').toBeGreaterThan(-1)
    expect(iLight, 'bootstrap 脚本应有 light 兜底').toBeGreaterThan(-1)
    expect(iExtract, '提取须先于判定（hashTheme 的来源必须是 hash，不得来自别处）').toBeLessThan(iHash)
    expect(iHash, 'hash theme 判定须在 prefers 之前（D-A：hash 优先）').toBeLessThan(iPrefers)
    expect(iPrefers, 'prefers 须在 light 兜底之前').toBeLessThan(iLight)
    // D-A「后两级与 effectiveTheme 逐字一致」：同一 prefers 媒体查询字面量
    expect(script, 'bootstrap 的 prefers 媒体查询应与主应用同款').toContain('(prefers-color-scheme: dark)')
    expect(useThemeSrc, 'useTheme.systemTheme 应含同款 prefers 媒体查询').toContain(
      '(prefers-color-scheme: dark)'
    )
  })

  // 腿 3：白名单校验 hash theme（防放宽成「任意 truthy」，P13 finding #2 / N2 同族）。
  //
  // ⚠️ F-7（控制者裁定：不改断言，只加注释）：本腿钉的是**字面写法**，与主应用
  // themeBootstrap.test.ts:56-57 的 stored 白名单腿（`stored === 'light' || stored === 'dark'`）
  // **逐字同款**——这是继承自 P13 的既有范式，不是本批新引入。审查实测：把两项无害换序成
  // `'dark' || 'light'`（语义 100% 等价）会误红本腿（I1），改成 `['light','dark'].includes(hashTheme)`
  // （同样严格）会误红腿2+腿3（I2）→ 本腿钉的是「文本长相」而非「白名单语义」。
  // **若将来要改成语义等价形态（.includes() / 换序），须同步改这两处守卫**，否则两个守卫风格分叉、
  // 下批贡献者无从判断哪个是范式。**白名单的语义正确性由 e2e/bootstrapTheme.spec.ts 的反方向格
  // （[系统暗色]×[hash=light]→light）与垃圾值格（theme=neon 被忽略）在运行时钉死**；本腿的职责
  // 收窄为「两处字面写法保持一致」，这正是字面钉桩擅长的。
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
    // 🔴 F-1（critical）：负向断言钉**已屏蔽注释的全文**（gameHostMasked），不再缩到调用点内。
    // 缩范围是前任修法自己引入的缺口：G1（computed 体内别处 `const _t = useTheme().theme.value`、
    // 调用点字面量与交付版逐字相同）与 G2（import 别名 + 本地同名响应式包装）都绕过调用点级断言，
    // 且 vue-tsc exit 0（类型合法 → 缺陷可静默进主干）；审查者用 effectScope+computed 求值计数证明
    // 二者 evals 1→2、url 从 …theme=light 翻成 …theme=dark → iframe src 变 → 运行中的游戏被重载、
    // 存档丢失。缩范围的理由（陷阱注释必然写出被禁字面量 → 会假红）不成立：maskSourceComments()
    // 已把 GameHost.vue 的陷阱注释整段屏蔽（屏蔽后 useTheme() 与 theme.value 都从文件消失、
    // effectiveTheme 真实代码保留），故全文负向断言对合法树不误红、对 G1/G2 有牙。
    //
    // ⚠️ 残留局限（纪律 #4：不声称「唯一手段」）：改回全文后仍抓不住「在 computed 之外的**模块级
    // 作用域**读 ref 再传值」（如把 `const t = useTheme().theme.value` 写在 computed 外面、computed
    // 只读这个已求值的常量）——该形态快照在模块加载时求值一次、computed 无主题依赖 → **不会**造成
    // 重载，属无害。真正的解药是 e2e/bootstrapTheme.spec.ts 的**行为腿**（游戏页切主题 → iframe src
    // 不变），它在运行时钉死「targets 不依赖主题」这个性质本身，不依赖任何字面形态。
    expect(
      gameHostMasked,
      '不得注入响应式 theme.value（D-B 架构陷阱；后果是切主题重载运行中的游戏）'
    ).not.toContain('theme.value')
    expect(
      gameHostMasked,
      '不得在 GameHost 任何位置取用 useTheme()（模块级响应式单例；computed 内读其 ref 会建立主题依赖）'
    ).not.toContain('useTheme()')
  })

  // 腿 6：bootstrap 暗色块六个 hex 与 main.css 暗色调色板**逐值一致**（字符串相等）。
  // ⚠️ 不得写成 max(a,b) ≥ k 形态（P13 恒真高发区）；此处用 toBe 字符串相等。
  it('腿6 bootstrap 暗色块六个 hex 与 main.css 暗色调色板逐值一致（字符串相等）', () => {
    // F-5.4：扫描集合自身长度自证钉。H4（清空 DARK_TOKENS）会让下面的 for 循环执行零次 →
    // 恒真空绿（P13 M5/M6 精确同族：「扫描集合被清空 → 报 0 违规」）。这是 spec §5-T1 ⚠️ 三条
    // 遗漏的**第四类**恒真形态，用 toBe(6) 钉死集合非空（与腿10 的 toBe(11) 同款手法）。
    expect(DARK_TOKENS.length, 'DARK_TOKENS 须含 6 个令牌（清空即恒真空绿）').toBe(6)
    const bsDark = customProps(extractBlock(bootstrapMasked, 'html[data-theme="dark"]'), 'bs')
    // F-6：用 mainCssMasked（见顶部声明）——注释里的同名选择器会先命中 indexOf，造成假块劫持。
    const mcDark = customProps(extractBlock(mainCssMasked, 'html[data-theme="dark"]'), 'color')
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
  it('腿7 bootstrap 亮色六个 hex 未被改动（§1.1 表，从 :root 块逐值比对，本批只加暗色不动亮色值）', () => {
    // F-5.4：集合长度自证钉（同腿6，防 LIGHT_HEX 被清空 → for 零次恒真）。
    expect(LIGHT_HEX.length, 'LIGHT_HEX 须含 6 个令牌（清空即恒真空绿）').toBe(6)
    // 🔴 F-4：改为从 :root 块提取 --bs-* 逐值比对（与腿6 对称），不用全文子串搜索。
    // 旧写法 `bootstrapMasked.toLowerCase().toContain(hex)` 对 #f7f2e7 无鉴别力——该 hex 在文件里
    // 出现 3 次（:root 的 --bs-paper、暗色块的 --bs-ink、pre-paint 脚本的 theme-color meta），
    // 故 F1（把 :root 亮色 paper 改成 #eeeeee）时全文搜索仍命中别处 → RED=[]，而四个守卫合跑
    // 38 passed / 0 failed 全绿 → 腿7 的守卫目的（「防顺手把亮色也改了」）无断言覆盖。从 :root 块
    // 提取后只比对亮色调色板自身的值，同时消除「暗色块 --bs-ink 与亮色 --bs-paper 同值」的耦合。
    const bsLight = customProps(extractBlock(bootstrapMasked, ':root'), 'bs')
    for (const [token, hex] of LIGHT_HEX) {
      expect(
        bsLight.get(token),
        `bootstrap 亮色 :root 的 --bs-${token} 应仍为 ${hex}（不得回退/改动）`
      ).toBe(hex)
    }
  })

  // 腿 8：bootstrap 内不存在 inline style 里的 color:（D-E 回归钉桩；本批刚删两处 2.2594/2.4776）。
  it('腿8 bootstrap/index.html 内不存在 inline style 里的 color:（防 WCAG 违规复发）', () => {
    // 前提断言（mutation (i) 实测暴露的弱点）：空文本天然满足 not.toMatch → 文件读不到时
    // 本腿会假绿。腿9 虽会红，但每条腿自带前提才不依赖别的腿兜底（纪律：两方向都验）。
    expect(bootstrapMasked, '前提：应读到非空的 bootstrap/index.html').not.toBe('')
    expect(bootstrapMasked, '前提：文件里应有 style 属性（否则本腿无鉴别对象）').toContain('style=')
    // 🔴 F-5：改为**提取所有 style= 属性值**（双引号/单引号/无引号三形态都收）再逐条查 color:，
    // 不用只认双引号的单正则。旧写法 /style\s*=\s*"[^"]*\bcolor\s*:/i 对单引号形态无牙——
    // F2（inline style 改单引号并塞回违规色 #a3a3a3）时 RED=[]，而 HTML 单引号属性完全合法
    // （prettier/手写都可能产出）→ spec mutation (f) 想钉的性质被引号形态绕过（与「带引号 grep
    // 对 minified 假阴性」同族：模式只覆盖了自己见过的那种写法）。
    // ⚠️ adjudication §三-6 并列给出的一行正则 /style\s*=\s*(?:"[^"]*|'[^']*')[^>]*?\bcolor\s*:/i
    // 经实测**仍抓不到 F2 单引号本尊**（贪婪 [^']* 吃掉属性内部的 color:，闭引号后 [^>]*?\bcolor:
    // 失配；证据 impl-evidence/fix-f5-regex-analysis.log）→ 故采用同条并列的「更稳」变体（提取属性值）。
    const offenders = inlineStyleValues(bootstrapMasked).filter((v) => /\bcolor\s*:/i.test(v))
    expect(
      offenders,
      `inline style 属性里不得再写 color:（应由样式块的达标值生效），实得违规属性值 ${JSON.stringify(offenders)}`
    ).toEqual([])
  })

  // 腿 9：前提检查（防「读 0 文件也报 0 违规」的假信心，P13 M5/M6、P14 R0 同族）。
  // 独立于上面的共享 tryRead，直接核验三个核心源文件在盘上存在且非空——这条腿是 precondition gate。
  it('腿9 前提检查：三个核心源文件确实读到 + bootstrap html 含 head/style/body 三标记且长度 >4000', () => {
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
    // 🔴 F-8：把 >500 下界提到 >4000（源码字符数；实测合法树 4423 字符 / 5201 字节——⚠️ 单位是
    // **源码字符**，不是产物 7056/7069），并加**结构性前提**（须含 <head>/<style>/<body> 三标记，
    // 与腿1 的前提断言同源、更有鉴别力）。审查实测：旧 >500 下界对「截断到 501 字符」（K4/H8a，
    // 原 4423）仍绿，靠 7 条腿兜住；截断后 <style>/<body> 标记必缺失 → 结构性前提红。
    expect(bootstrapHtml, 'bootstrap/index.html 应含 <head>（结构完整性）').toContain('<head>')
    expect(bootstrapHtml, 'bootstrap/index.html 应含 <style>（结构完整性）').toContain('<style')
    expect(bootstrapHtml, 'bootstrap/index.html 应含 <body>（结构完整性）').toContain('<body')
    expect(
      bootstrapHtml.length,
      `bootstrap/index.html 应 >4000 字符（防空文件/截断假绿；实测合法树 4423 字符），实得 ${bootstrapHtml.length}`
    ).toBeGreaterThan(4000)
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

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// P13-T3 源码级守卫（spec §5 T3 / D-A / D-G）：禁止在 .vue 模板里用
// `bg-[#…]` / `text-[#…]` / `border-[#…]` 形态的**硬编码 hex 颜色**。硬编码色不参与
// 主题翻转——暗色下会保持亮色值（如骨架屏那个硬编码 #EFE9DA 的 arbitrary value
// 在暗底上是七块亮斑，spec §1.2-3）。必须走 `--color-*` 令牌（D-G 已把骨架屏令牌化为
// `bg-skeleton`）。
//
// 屏蔽范式沿用 P12 tableOverflow.test.ts（审查 FE-1 假绿教训）：扫描前把
// <script>/<style>/HTML 注释/<textarea>/<title> 内容替换为**等长空白**（保行号），
// 否则注释里的示例（如 spec 引用的那个硬编码骨架色 utility）会误报，脚本级色常量
// （COVER_COLORS 等，FINDINGS 第 0 轮判定主题无关、零改动）也会被误伤。
//
// ⚠️ 本文件里的注释**不得写出完整的硬编码色 utility 字面量**（spec §8-5b）：Tailwind v4
// 扫描全部源文件含 `.test.ts`，会把注释里的候选类名当真、生成对应 utility 烧进产物。
// 审查 finding #3 实测：本文件与 StatePanel.test.ts 注释里的该字面量让产物多出一条
// 死规则（归因实验：redact 后产物哈希 DJ97w2YT→C7966Gm-、死 utility 归零）。
// 故此处只提 hex 值不提 utility 名；下方的 fixture 也用字符串拼接构造。

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_DIR = join(SRC_ROOT, 'app')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry)
    if (statSync(target).isDirectory()) yield* walk(target)
    else yield target
  }
}

function candidates(): string[] {
  const files: string[] = []
  for (const file of walk(APP_DIR)) {
    if (file.endsWith('.test.ts')) continue
    if (file.endsWith('.vue')) files.push(file)
  }
  return files
}

// 等长空白替换（保留换行 → 行号不变），与 tableOverflow.test.ts 逐字同源。
// 顺序：注释最先（防注释里的 <script> 字样吞掉后续内容）。
function maskNonTemplate(content: string): string {
  const blank = (block: string): string => block.replace(/[^\n]/g, ' ')
  return content
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
    .replace(/<(textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
}

// 判别式 = 方括号内以 # 开头的 hex（3/4/6/8 位）。尺寸类 arbitrary value
// （text-[0.625rem] / border-[1.5px] / max-w-[6rem]）不含 #，故不会误报。
const HEX_RE = /\[#[0-9a-fA-F]{3,8}\]/g

/** 从 masked 文本里把命中位置扩到所属的空白/引号分隔 token（供报错展示完整类名）。 */
function tokenAround(masked: string, start: number, end: number): string {
  let lo = start
  while (lo > 0 && !/[\s"'`]/.test(masked[lo - 1])) lo--
  let hi = end
  while (hi < masked.length && !/[\s"'`]/.test(masked[hi])) hi++
  return masked.slice(lo, hi)
}

/** 在已 masked 的文本里找违规（纯函数，供 positive control 直接喂 fixture）。 */
function scan(masked: string, label: string): string[] {
  const found: string[] = []
  for (const m of masked.matchAll(HEX_RE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const lineIndex = masked.slice(0, start).split('\n').length - 1
    found.push(
      `${label}:${lineIndex + 1}: 硬编码 hex 颜色 ${tokenAround(masked, start, end)} → 改用 --color-* 令牌（如 bg-skeleton）`
    )
  }
  return found
}

function violations(file: string): string[] {
  const original = readFileSync(file, 'utf8')
  return scan(maskNonTemplate(original), relative(SRC_ROOT, file))
}

// fixture 用拼接构造，避免完整字面量出现在源文件里被 Tailwind 扫回产物（§8-5b / finding #3）。
const FIXTURE_BAD = `bg-[#12` + `3456]`

describe('硬编码颜色守卫（P13-T3 / D-A / D-G）', () => {
  it('全仓 .vue 模板禁止 bg-[#]/text-[#]/border-[#] 形态的硬编码 hex（须走令牌）', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })

  // Positive control（审查 finding #4）：上面那条断言在「扫不到任何文件」或「正则恒不匹配」
  // 时同样绿——审查者 M5（扫描根改 e2e → 扫 0 个 .vue）与 M6（HEX_RE 改恒不匹配）实测都绿，
  // 与 P12 FE-1「注释掉包裹层守卫仍绿」同一类假信心。以下两条钉住守卫自身有效。
  it('扫描范围非空：确实扫到了 app/ 下的 .vue（防 M5：扫描根被改坏后静默空扫）', () => {
    const files = candidates()
    expect(files.length, '扫描根应含 .vue 文件；为 0 说明 APP_DIR 或后缀过滤被改坏').toBeGreaterThan(0)
    // 钉住几个必须被扫到的关键组件（迁移过的三个 + 带表单的）
    const names = files.map((f) => relative(APP_DIR, f))
    for (const expected of [
      'components/StatePanel.vue',
      'components/ResultMeta.vue',
      'components/FilterDrawer.vue',
      'components/AppHeader.vue'
    ])
      expect(names, `扫描范围应含 ${expected}`).toContain(expected)
  })

  it('检测逻辑有牙：fixture 里的硬编码 hex 能被命中且行号正确（防 M6：正则失效）', () => {
    const src = `<template>\n  <div class="${FIXTURE_BAD}"></div>\n</template>\n`
    const found = scan(maskNonTemplate(src), 'fixture.vue')
    expect(found, `应命中 fixture 里的硬编码色，实得 ${JSON.stringify(found)}`).toHaveLength(1)
    expect(found[0]).toContain('fixture.vue:2') // 行号保真（屏蔽范式用等长空白）
    // 反面：同一 fixture 放进 <script> 块应被屏蔽（确认屏蔽范式仍生效，不是碰巧全报）
    const inScript = `<template><div /></template>\n<script>\nconst c = "${FIXTURE_BAD}"\n</script>\n`
    expect(scan(maskNonTemplate(inScript), 'fixture.vue'), '<script> 内的色常量应被屏蔽').toEqual([])
  })
})

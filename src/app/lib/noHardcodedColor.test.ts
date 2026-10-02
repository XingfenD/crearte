import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// P13-T3 源码级守卫（spec §5 T3 / D-A / D-G）：禁止在 .vue 模板里用
// `bg-[#…]` / `text-[#…]` / `border-[#…]` 形态的**硬编码 hex 颜色**。硬编码色不参与
// 主题翻转——暗色下会保持亮色值（如骨架屏 `bg-[#EFE9DA]` 在暗底上是七块亮斑，spec §1.2-3）。
// 必须走 `--color-*` 令牌（D-G 已把骨架屏令牌化为 `bg-skeleton`）。
//
// 屏蔽范式沿用 P12 tableOverflow.test.ts（审查 FE-1 假绿教训）：扫描前把
// <script>/<style>/HTML 注释/<textarea>/<title> 内容替换为**等长空白**（保行号），
// 否则注释里的示例（如 spec 引用的 `bg-[#EFE9DA]`）会误报，脚本级色常量
// （COVER_COLORS 等，FINDINGS 第 0 轮判定主题无关、零改动）也会被误伤。

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

function violations(file: string): string[] {
  const original = readFileSync(file, 'utf8')
  const lines = original.split('\n')
  const masked = maskNonTemplate(original)
  const found: string[] = []
  for (const m of masked.matchAll(HEX_RE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const lineIndex = masked.slice(0, start).split('\n').length - 1
    found.push(
      `${relative(SRC_ROOT, file)}:${lineIndex + 1}: 硬编码 hex 颜色 ${tokenAround(masked, start, end)} → 改用 --color-* 令牌（如 bg-skeleton）`
    )
  }
  return found
}

describe('硬编码颜色守卫（P13-T3 / D-A / D-G）', () => {
  it('全仓 .vue 模板禁止 bg-[#]/text-[#]/border-[#] 形态的硬编码 hex（须走令牌）', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })
})

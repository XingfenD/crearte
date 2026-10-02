import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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

// HTML 空元素：无闭合标签，遇到即视为完整标签、不入栈。
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
])

// 起始/闭合标签统一匹配：name（组2）、属性串（组3）、自闭合斜杠（组4）。
// 属性串允许引号内含 `>`（如 :class="a > b"），引号外的 `>` 才是标签终点。
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

// 把「不是模板结构」的文本整块替换成等长空白（保留换行，故行号不变），共三类：
// 1. HTML 注释：注释里的 <table> 会被当真标签（误报）；更危险的是注释掉的包裹层
//    <div class="…overflow-x-auto…"> 仍会入栈充当父元素 → 守卫假绿（审查 FE-1）。
// 2. <script>/<style>：TS 里的 Record<string, string>、a < b 会被标签正则误当
//    起始标签，污染父元素栈。表格只出现在 <template>，屏蔽后栈只反映模板结构。
// 3. raw-text 元素 <textarea>/<title>：按 HTML 规范其文本内容不解析为标签，
//    含 `<table` 字样会误报（审查 FE-2）。
// 顺序：注释最先（防注释里的 <script> 字样吞掉后续内容）。
function maskNonTemplate(content: string): string {
  const blank = (block: string) => block.replace(/[^\n]/g, ' ')
  return content
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
    .replace(/<(textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi, blank)
}

interface OpenTag {
  name: string
  attrs: string
}

/**
 * 守卫（D-H / spec §5 T4）：每个 <table> 的**直接父元素** class 必须含 overflow-x-auto。
 * 缺父级滚动容器时，auto 布局表格的 min-content 宽会直接撑破文档（缺口 D）。
 * 判定基于源码文本的标签栈，不渲染——沿用 tableScope.test.ts 的静态扫描范式。
 *
 * 不用全局 overflow-x-auto 计数做 1:1 断言：DocSidebar.vue:25 已有一处用在 <nav> 上，
 * 那是合法的既存用例（实测基线计数 = 1 而非 0），全局计数会写错。
 */
function violations(file: string): string[] {
  const found: string[] = []
  const original = readFileSync(file, 'utf8')
  const lines = original.split('\n')
  const masked = maskNonTemplate(original)
  const stack: OpenTag[] = []

  for (const match of masked.matchAll(TAG_RE)) {
    const start = match.index ?? 0
    const [, slash, name, attrs, selfClose] = match
    const lower = name.toLowerCase()

    if (slash) {
      // 闭合标签：弹到最近同名开标签（容忍中途未配对的容错）
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name.toLowerCase() === lower) {
          stack.length = i
          break
        }
      }
      continue
    }

    if (lower === 'table') {
      const parent = stack[stack.length - 1]
      const ok = parent !== undefined && /\bclass\s*=\s*["'][^"']*overflow-x-auto/.test(parent.attrs)
      if (!ok) {
        const lineIndex = masked.slice(0, start).split('\n').length - 1
        const parentDesc = parent ? `<${parent.name}>` : '(无父元素)'
        found.push(
          `${relative(SRC_ROOT, file)}:${lineIndex + 1}: 父元素 ${parentDesc} 缺 overflow-x-auto → ${(lines[lineIndex] ?? '').trim()}`
        )
      }
    }

    // 空元素与自闭合标签不入栈
    if (selfClose || VOID_ELEMENTS.has(lower)) continue
    stack.push({ name, attrs })
  }

  return found
}

describe('表格横向溢出守卫', () => {
  it('全仓每个 <table> 的直接父元素都带 overflow-x-auto 滚动容器', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })
})

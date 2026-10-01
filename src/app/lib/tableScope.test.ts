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

// 守卫：每个 <th 起始标签必须带 scope=（D-F/D-G）。
// `<th\b` 不误伤 <thead；起始标签取 <th 到其后第一个 > 为止（片段可跨行），
// 使多行书写的 <th\n  class=…\n> 也能正确判定。违规行号报 <th 所在行。
function violations(file: string): string[] {
  const found: string[] = []
  const content = readFileSync(file, 'utf8')
  const lines = content.split('\n')
  for (const match of content.matchAll(/<th\b/g)) {
    const start = match.index ?? 0
    const close = content.indexOf('>', start)
    const tag = close === -1 ? content.slice(start) : content.slice(start, close)
    if (!tag.includes('scope=')) {
      const lineIndex = content.slice(0, start).split('\n').length - 1
      found.push(`${relative(SRC_ROOT, file)}:${lineIndex + 1}: ${(lines[lineIndex] ?? '').trim()}`)
    }
  }
  return found
}

describe('表格列头守卫', () => {
  it('全仓每个 <th> 都带 scope 属性', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })
})

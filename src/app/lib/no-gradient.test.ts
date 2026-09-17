import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_DIR = join(SRC_ROOT, 'app')
const SCAN_EXTENSIONS = ['.vue', '.ts', '.css']
const BANNED = ['grad' + 'ient', 'repeat' + 'ing-', 'round' + 'ed-']

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
    if (SCAN_EXTENSIONS.some((ext) => file.endsWith(ext))) files.push(file)
  }
  files.push(join(SRC_ROOT, 'index.html'))
  return files
}

function violations(file: string): string[] {
  const found: string[] = []
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const lower = line.toLowerCase()
      for (const banned of BANNED) {
        if (lower.includes(banned)) found.push(`${relative(SRC_ROOT, file)}:${index + 1}: ${line.trim()}`)
      }
    })
  return found
}

describe('平面海报守卫', () => {
  it('源码中不得出现渐变与圆角工具类', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })
})

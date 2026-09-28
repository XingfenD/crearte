import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const schema = JSON.parse(readFileSync(fileURLToPath(new URL('./game.schema.json', import.meta.url)), 'utf8'))

describe('game.schema.json 契约', () => {
  test('required 不含 url/author/description（三项可选）', () => {
    expect(schema.required).not.toContain('url')
    expect(schema.required).not.toContain('author')
    expect(schema.required).not.toContain('description')
  })
  test('author.name 不再必填（url-only author 合法）', () => {
    expect(schema.properties.author.required ?? []).not.toContain('name')
  })
})

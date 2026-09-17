import MarkdownIt, { type Token } from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true })

export interface TocItem {
  level: 2 | 3
  text: string
  id: string
}

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

function walkHeadings(tokens: Token[]): Array<{ token: Token; item: TocItem }> {
  const used = new Map<string, number>()
  const found: Array<{ token: Token; item: TocItem }> = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'heading_open' || (token.tag !== 'h2' && token.tag !== 'h3')) continue
    const inline = tokens[i + 1]
    const text = (inline?.children ?? [])
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join('')
      .trim()
    const base = slugify(text)
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    found.push({ token, item: { level: token.tag === 'h2' ? 2 : 3, text, id: count === 1 ? base : `${base}-${count}` } })
  }
  return found
}

export function renderMarkdown(source: string): string {
  const env: Record<string, unknown> = {}
  const tokens = md.parse(source, env)
  for (const { token, item } of walkHeadings(tokens)) token.attrSet('id', item.id)
  return md.renderer.render(tokens, md.options, env)
}

export function extractToc(source: string): TocItem[] {
  return walkHeadings(md.parse(source, {})).map(({ item }) => item)
}

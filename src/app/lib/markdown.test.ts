import { describe, expect, it } from 'vitest'
import { extractToc, renderMarkdown } from './markdown'

describe('extractToc', () => {
  it('只提取 h2/h3，忽略 h1/h4', () => {
    const toc = extractToc('# 标题\n\n## 第一节\n\n### 小节\n\n#### 更深\n')
    expect(toc.map((t) => [t.level, t.text])).toEqual([[2, '第一节'], [3, '小节']])
  })

  it('中文标题保留，标点被去掉', () => {
    const [item] = extractToc('## 怎么玩：新手教程！\n')
    expect(item.id).toBe('怎么玩新手教程')
  })

  it('同名标题自动去重（-2 后缀）', () => {
    const toc = extractToc('## 玩法\n\n## 玩法\n')
    expect(toc.map((t) => t.id)).toEqual(['玩法', '玩法-2'])
  })

  it('空标题回退 section', () => {
    const [item] = extractToc('## ！！！\n')
    expect(item.id).toBe('section')
  })
})

describe('renderMarkdown', () => {
  it('渲染出的 h2/h3 带与 TOC 一致的 id', () => {
    const html = renderMarkdown('## 第一节\n\n正文\n\n### 小节\n')
    expect(html).toContain('id="第一节"')
    expect(html).toContain('id="小节"')
    expect(html).toContain('<p>正文</p>')
  })

  it('不渲染原始 HTML（html: false）', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>')
  })
})

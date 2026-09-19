import { describe, expect, it } from 'vitest'
import { extractToc, renderMarkdown } from './markdown'

const ORIGIN = 'https://crearte.yoresee.cc'

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
    const html = renderMarkdown('## 第一节\n\n正文\n\n### 小节\n', ORIGIN)
    expect(html).toContain('id="第一节"')
    expect(html).toContain('id="小节"')
    expect(html).toContain('<p>正文</p>')
  })

  it('不渲染原始 HTML（html: false）', () => {
    expect(renderMarkdown('<script>alert(1)</script>', ORIGIN)).not.toContain('<script>')
  })
})

describe('renderMarkdown 外链改写', () => {
  it('外链改写为中间页链接并补 target/rel', () => {
    const html = renderMarkdown('[官网](https://play2048.co/)', ORIGIN)
    expect(html).toContain('href="/out?kind=link&amp;to=https%3A%2F%2Fplay2048.co%2F"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener"')
  })

  it('目标自带查询与锚点时完整编码', () => {
    const html = renderMarkdown('[x](https://example.com/a?b=1&c=2#d)', ORIGIN)
    expect(html).toContain('to=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2%23d')
  })

  it('站内路径与锚点不改写', () => {
    const html = renderMarkdown('[详情](/games/2048) [目录](#toc)', ORIGIN)
    expect(html).toContain('href="/games/2048"')
    expect(html).toContain('href="#toc"')
    expect(html).not.toContain('/out?')
  })

  it('mailto 不改写', () => {
    expect(renderMarkdown('[写信](mailto:xingfen.fendy@outlook.com)', ORIGIN)).toContain(
      'href="mailto:xingfen.fendy@outlook.com"'
    )
  })

  it('linkify 裸 URL 同样改写', () => {
    const html = renderMarkdown('见 https://play2048.co/ 一游', ORIGIN)
    expect(html).toContain('/out?kind=link&amp;to=https%3A%2F%2Fplay2048.co%2F')
    expect(html).toContain('target="_blank"')
  })
})

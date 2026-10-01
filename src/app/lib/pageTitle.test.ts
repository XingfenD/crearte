// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_DESCRIPTION,
  SITE,
  authorTitle,
  catalogTitle,
  clip,
  docsTitle,
  gameNotFoundTitle,
  gameTitle,
  joinTitle,
  sectionTitleOf,
  setPageDescription,
  setPageTitle
} from './pageTitle'

beforeEach(() => {
  document.title = ''
  document.querySelector('meta[name="description"]')?.remove()
})

describe('clip 码点截断', () => {
  it('未超长原样返回', () => {
    expect(clip('abc', 3)).toBe('abc')
    expect(clip('中文', 5)).toBe('中文')
  })

  it('中文按码点计数，不按 UTF-16 码元', () => {
    expect(clip('一二三四五', 3)).toBe('一二三…')
    expect(clip('abcdef', 2)).toBe('ab…')
  })

  it('emoji 不被拦腰截断', () => {
    expect(clip('🎮🎯🎲🎪', 2)).toBe('🎮🎯…')
  })
})

describe('joinTitle', () => {
  it('过滤空段后以 · 连接，末尾恒收尾站点名', () => {
    expect(joinTitle('作品')).toBe('作品 · crearte 创艺')
    expect(joinTitle('', '作品', undefined, null)).toBe('作品 · crearte 创艺')
    expect(joinTitle('a', 'b')).toBe('a · b · crearte 创艺')
  })

  it('全空只剩站点名', () => {
    expect(joinTitle()).toBe(SITE)
    expect(joinTitle('', undefined, null)).toBe(SITE)
  })
})

describe('标题 builder', () => {
  it('gameTitle', () => {
    expect(gameTitle('最小作品')).toBe('最小作品 · crearte 创艺')
  })

  it('gameNotFoundTitle', () => {
    expect(gameNotFoundTitle()).toBe('未找到的作品 · crearte 创艺')
  })

  it('catalogTitle：空查询为基线，非空带搜索词', () => {
    expect(catalogTitle('')).toBe('作品 · crearte 创艺')
    expect(catalogTitle('   ')).toBe('作品 · crearte 创艺')
    expect(catalogTitle('2048')).toBe('搜索「2048」 · 作品 · crearte 创艺')
  })

  it('catalogTitle：搜索词截断 40 码点', () => {
    const long = '搜'.repeat(50)
    expect(catalogTitle(long)).toBe(`搜索「${'搜'.repeat(40)}…」 · 作品 · crearte 创艺`)
  })

  it('docsTitle：有无文档名', () => {
    expect(docsTitle()).toBe('文档 · crearte 创艺')
    expect(docsTitle('入门')).toBe('入门 · 文档 · crearte 创艺')
  })

  it('authorTitle', () => {
    expect(authorTitle('笔锋')).toBe('笔锋 · 创作者 · crearte 创艺')
  })
})

describe('sectionTitleOf 路由名全表', () => {
  it('已知路由名给出中文段名', () => {
    expect(sectionTitleOf('home')).toBe('')
    expect(sectionTitleOf('catalog')).toBe('作品')
    expect(sectionTitleOf('account')).toBe('我的账号')
    expect(sectionTitleOf('admin-users')).toBe('用户管理')
    expect(sectionTitleOf('not-found')).toBe('页面不存在')
  })

  it('未名中 / 非字符串回退空段', () => {
    expect(sectionTitleOf('no-such-route')).toBe('')
    expect(sectionTitleOf(undefined)).toBe('')
    expect(sectionTitleOf(42)).toBe('')
  })
})

describe('setPageTitle / setPageDescription', () => {
  it('写 document.title', () => {
    setPageTitle('作品 · crearte 创艺')
    expect(document.title).toBe('作品 · crearte 创艺')
  })

  it('无 meta 时自动建入 head', () => {
    expect(document.querySelector('meta[name="description"]')).toBeNull()
    setPageDescription('一段描述')
    const meta = document.querySelector('meta[name="description"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('一段描述')
  })

  it('空描述回落默认文案', () => {
    setPageDescription('')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(DEFAULT_DESCRIPTION)
  })

  it('复用既有 meta 节点', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', '旧值')
    document.head.appendChild(meta)
    setPageDescription('新值')
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(meta.getAttribute('content')).toBe('新值')
  })

  it('长描述截断 120 码点', () => {
    setPageDescription('字'.repeat(200))
    const content = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    expect(Array.from(content)).toHaveLength(121) // 120 码点 + …
    expect(content.endsWith('…')).toBe(true)
  })
})

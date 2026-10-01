export const SITE = 'crearte 创艺'
export const DEFAULT_DESCRIPTION =
  'crearte 创艺——互动小说与浏览器小游戏托管社区，收录可直接游玩的作品目录。'

// 码点截断：Array.from 按 Unicode 码点切分，中英混排与 emoji 不会被拦腰截断；超出补省略号
export function clip(s: string, max: number): string {
  const points = Array.from(s)
  return points.length <= max ? s : points.slice(0, max).join('') + '…'
}

// 空段过滤后以 ' · ' 连接，末尾恒收尾站点名；全空时只剩站点名（home / 未名中路由）
export function joinTitle(...parts: Array<string | '' | null | undefined>): string {
  const segments = parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
  return [...segments, SITE].join(' · ')
}

export function gameTitle(name: string): string {
  return joinTitle(name)
}

export function gameNotFoundTitle(): string {
  return joinTitle('未找到的作品')
}

export function catalogTitle(q: string): string {
  const query = q.trim()
  return query ? joinTitle(`搜索「${clip(query, 40)}」`, '作品') : joinTitle('作品')
}

export function docsTitle(docTitle?: string): string {
  return docTitle ? joinTitle(docTitle, '文档') : joinTitle('文档')
}

export function authorTitle(displayName: string): string {
  return joinTitle(displayName, '创作者')
}

// 19 个路由名的静态基线段名；未名中（含 undefined/新增路由忘配）回退空段 → joinTitle 得 SITE
const SECTION_TITLES: Record<string, string> = {
  home: '',
  catalog: '作品',
  game: '作品',
  docs: '文档',
  doc: '文档',
  author: '创作者',
  creator: '创作者中心',
  login: '登录',
  register: '注册',
  account: '我的账号',
  submit: '我的投稿',
  'submit-new': '提交作品',
  'submit-edit': '编辑投稿',
  outbound: '离开本站',
  admin: '审核',
  'admin-submission': '投稿审核',
  'admin-users': '用户管理',
  'admin-audit': '审计日志',
  'not-found': '页面不存在'
}

export function sectionTitleOf(name: unknown): string {
  return typeof name === 'string' ? (SECTION_TITLES[name] ?? '') : ''
}

export function setPageTitle(t: string): void {
  document.title = t
}

export function setPageDescription(d: string): void {
  let meta = document.querySelector('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', clip(d || DEFAULT_DESCRIPTION, 120))
}

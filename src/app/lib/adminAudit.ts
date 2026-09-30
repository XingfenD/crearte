// P7 审计流水展示层纯函数（spec §3.1 语义要点：动作名 = method + route 模板，
// 对象从 path 读；中文标签映射是前端展示层职责，映射外模板回退显示原文）。

/** 已知 route 模板 → 中文动作标签（键 = 模板原文，与服务器 gin FullPath() 一致） */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  '/api/admin/submissions': '查看提交队列',
  '/api/admin/submissions/:id/approve': '通过提交',
  '/api/admin/submissions/:id/reject': '拒绝提交',
  '/api/admin/works/:user/:slug/unpublish': '下架作品',
  '/api/admin/works/:user/:slug/republish': '恢复上架',
  '/api/admin/works/:user/:slug/features': '修改运行权限',
  '/api/admin/works/:user/:slug/versions/:version/revoke': '版本密钥吊销/恢复',
  '/api/admin/users': '查看用户列表',
  '/api/admin/users/:id/role': '变更用户角色',
  '/api/admin/audit': '查看操作日志'
}

/** 动作列文本：已知模板给中文标签，未知模板回退「METHOD route」原文（spec §4.3） */
export function auditActionLabel(method: string, route: string): string {
  const label = AUDIT_ACTION_LABELS[route]
  return label ? `${label}（${method}）` : `${method} ${route}`
}

/** route 过滤下拉选项：值 = 模板原文（服务侧 routeFilter 按模板等值匹配） */
export const AUDIT_ROUTE_OPTIONS: { value: string; label: string }[] = Object.entries(
  AUDIT_ACTION_LABELS
).map(([route, label]) => ({ value: route, label }))

/**
 * 对象列：拿模板与具体 path 逐段对齐，抽出参数段。
 * works 类 → `user/slug`（带版本参数再缀 ` · version`）；其余按顺序 ` / ` 连接；无参数段 → `—`。
 */
export function auditObject(route: string, path: string): string {
  const templateSegments = route.split('/')
  const pathSegments = path.split('/')
  const params: Record<string, string> = {}
  templateSegments.forEach((segment, index) => {
    if (segment.startsWith(':') && index < pathSegments.length) {
      params[segment.slice(1)] = pathSegments[index]
    }
  })
  const keys = Object.keys(params)
  if (keys.length === 0) return '—'
  if (params.user && params.slug) {
    const base = `${params.user}/${params.slug}`
    return params.version ? `${base} · ${params.version}` : base
  }
  return keys.map((key) => params[key]).join(' / ')
}

/** 结果码着色（spec §4.3）：2xx 绿、4xx 黄；其余（3xx/5xx）红 */
export function auditStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'border-ink bg-success text-paper'
  if (status >= 400 && status < 500) return 'border-ink bg-highlight text-ink'
  return 'border-ink bg-accent-ink text-paper'
}

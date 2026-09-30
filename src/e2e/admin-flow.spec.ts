import { expect, test, type Page, type Route } from '@playwright/test'
import { API, seedSession } from './helpers'

const PENDING = {
  id: 'sub-p1', kind: 'new_work', status: 'pending', work_id: 'mock/pending-game',
  payload: { id: 'mock/pending-game', name: 'Pending Game', url: 'https://example.com/pg', author: { name: 'A' }, description: 'd', durationMinutes: { min: 1, max: 5 }, type: 'puzzle', tags: [], runtime: 'external' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

// 作品管理 tab 的「已通过提交」历史区 seed（AdminView 请求 status=approved）——spec:36：后端无
// admin works 列表端点，「恢复上架」(adminRepublish) 唯一入口是 approved 提交历史；
// work_id 用 live-game 与作品行 mock 同一作品（下架→从历史恢复上架的语义闭环）
const APPROVED = {
  id: 'sub-a1', kind: 'new_work', status: 'approved', work_id: 'mock/live-game',
  payload: { id: 'mock/live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], runtime: 'virtual', version: 'v3' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

// P6 D-D：hosted 待审提交 fixture（审核详情展示托管链接/降级方式的验证对象）
const HOSTED = {
  id: 'sub-h1', kind: 'new_work', status: 'pending', work_id: 'mock/hosted-game',
  payload: { id: 'mock/hosted-game', name: 'Hosted Game', url: '', author: { name: 'h' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], runtime: 'hosted', hostedUrl: 'https://hosted.example.dev/game/', fallback: 'hosted' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

function installAdminApi(page: Page, calls: string[]): void {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  page.route(`${API}/api/admin/submissions**`, (route) => {
    const url = new URL(route.request().url())
    hit(route, 200)
    if (url.searchParams.get('status') === 'pending') return json(route, { submissions: [PENDING, HOSTED], total: 2 })
    if (url.searchParams.get('status') === 'approved') return json(route, { submissions: [APPROVED], total: 1 })
    return json(route, { submissions: [], total: 0 })
  })
  page.route(`${API}/api/submissions/sub-p1`, (route) => json(route, PENDING))
  page.route(`${API}/api/submissions/sub-h1`, (route) => json(route, HOSTED))
  page.route(`${API}/api/admin/submissions/sub-p1/approve`, (route) => { calls.push('approve'); hit(route, 200); json(route, { ok: true }) })
  page.route(`${API}/api/admin/submissions/sub-p1/reject`, (route) => {
    calls.push(`reject:${route.request().postDataJSON()?.note ?? ''}`)
    hit(route, 200)
    json(route, { ok: true })
  })
  page.route(`${API}/api/admin/works/**`, (route) => {
    calls.push(new URL(route.request().url()).pathname + ':' + (route.request().postData() ?? ''))
    hit(route, 200)
    json(route, { ok: true })
  })
  // 作品管理 tab：/api/games（页面上下文，可被 page.route 拦截）
  page.route(`${API}/api/games`, (route) => json(route, {
    schemaVersion: 1, generatedAt: 'x',
    games: [{ id: 'mock/live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual' }]
  }))
  page.route(`${API}/api/games/mock/live-game`, (route) => json(route, {
    id: 'mock/live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual', version: 'v3', entry: 'index.html',
    bundle: { url: 'https://cdn/b.bin', bytes: 1, sha256: 'a'.repeat(64), enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) } }
  }))

  // ---- P7 管理面端点夹具（spec §3.4 形状；待真栈联调：后端 Task 2 落地后改走 e2e:stack）----
  // 审计语义与后端对齐（spec §3.4）：admin 组内**所有**请求入审计——含 GET /api/admin/users、
  // GET /api/admin/audit 自身，也含失败尝试（400/404/409）；route 记 gin FullPath() 模板。
  // 自记录顺序：audit GET 的行在**响应发出之后**写入 → 本次响应不含自己这行，下一次读才含。
  interface FixtureUser { id: string; email: string; username: string; display_name: string; role: string; created_at: string }
  const users: FixtureUser[] = [
    { id: 'u-admin', email: 'admin@e2e.local', username: 'admin', display_name: 'Admin', role: 'admin', created_at: '2026-09-01T00:00:00Z' },
    { id: 'u-bob', email: 'bob@e2e.local', username: 'bob', display_name: 'Bob', role: 'user', created_at: '2026-09-02T00:00:00Z' }
  ]
  const audit: { id: string; actor_id: string; actor_email: string; method: string; route: string; path: string; status: number; created_at: string }[] = []
  let clock = 0
  const record = (method: string, route: string, path: string, status: number): void => {
    clock += 1
    audit.push({
      id: `au-${clock}`, actor_id: 'u-e2e', actor_email: 'admin@e2e.local',
      method, route, path, status,
      created_at: new Date(Date.parse('2026-09-30T12:00:00Z') + clock * 1000).toISOString()
    })
  }
  // pathname → 路由模板（镜像后端 gin FullPath() 形状，真栈以此为准）
  const ADMIN_TEMPLATES: [RegExp, string][] = [
    [/^\/api\/admin\/submissions\/[^/]+\/approve$/, '/api/admin/submissions/:id/approve'],
    [/^\/api\/admin\/submissions\/[^/]+\/reject$/, '/api/admin/submissions/:id/reject'],
    [/^\/api\/admin\/works\/[^/]+\/[^/]+\/unpublish$/, '/api/admin/works/:user/:slug/unpublish'],
    [/^\/api\/admin\/works\/[^/]+\/[^/]+\/republish$/, '/api/admin/works/:user/:slug/republish'],
    [/^\/api\/admin\/works\/[^/]+\/[^/]+\/features$/, '/api/admin/works/:user/:slug/features'],
    [/^\/api\/admin\/works\/[^/]+\/[^/]+\/versions\/[^/]+\/revoke$/, '/api/admin/works/:user/:slug/versions/:version/revoke'],
    [/^\/api\/admin\/users\/[^/]+\/role$/, '/api/admin/users/:id/role'],
    [/^\/api\/admin\/users$/, '/api/admin/users'],
    [/^\/api\/admin\/submissions$/, '/api/admin/submissions'],
    [/^\/api\/admin\/audit$/, '/api/admin/audit']
  ]
  const templateOf = (pathname: string): string => {
    for (const [re, tpl] of ADMIN_TEMPLATES) if (re.test(pathname)) return tpl
    return pathname
  }
  // admin 组请求统一入审计（method + FullPath 模板 + 具体 path + status）
  const hit = (r: Route, status: number): void => {
    const pathname = new URL(r.request().url()).pathname
    record(r.request().method(), templateOf(pathname), pathname, status)
  }

  page.route(`${API}/api/admin/users**`, (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'PATCH') {
      // /api/admin/users/:id/role → 200 更新后用户；400 非法 role；404 无此人；唯一 admin 降级 409 last_admin
      const segments = url.pathname.split('/')
      const id = segments[segments.length - 2] ?? ''
      const role = (route.request().postDataJSON()?.role ?? '') as string
      const target = users.find((u) => u.id === id)
      if (!target) {
        hit(route, 404)
        return json(route, { error: { code: 'not_found', message: 'user not found' } }, 404)
      }
      if (role !== 'user' && role !== 'admin') {
        hit(route, 400)
        return json(route, { error: { code: 'validation', message: 'role must be user or admin' } }, 400)
      }
      const adminCount = users.filter((u) => u.role === 'admin').length
      if (target.role === 'admin' && role === 'user' && adminCount === 1) {
        hit(route, 409)
        return json(route, { error: { code: 'last_admin', message: 'cannot demote the last admin' } }, 409)
      }
      calls.push(`role:${id}:${role}`)
      target.role = role
      hit(route, 200)
      return json(route, { ...target })
    }
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const matched = users.filter((u) => !q || u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    const body = { users: matched.slice(offset, offset + limit), total: matched.length }
    // GET 读也入审计（与本响应无关的顺序：先出响应体，再记本行）
    hit(route, 200)
    json(route, body)
  })

  page.route(`${API}/api/admin/audit**`, (route) => {
    const url = new URL(route.request().url())
    const routeFilter = url.searchParams.get('route') ?? ''
    const limit = Number(url.searchParams.get('limit') ?? '50')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const matched = (routeFilter ? audit.filter((e) => e.route === routeFilter) : audit).slice().reverse()
    const body = { entries: matched.slice(offset, offset + limit), total: matched.length }
    // 自记录顺序语义（spec §3.4）：先快照出响应体（不含自己），再把本次 GET 写入审计
    json(route, body)
    hit(route, 200)
  })
}

test('审核队列 → 详情 → 拒绝必填 note', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)

  await page.goto('http://localhost:4173/admin')
  await expect(page.locator('[data-testid=queue-sub-p1]')).toContainText('Pending Game')
  await page.locator('[data-testid=queue-sub-p1]').getByRole('link', { name: '审核' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin/submissions/sub-p1')
  await expect(page.locator('[data-testid=payload-name]')).toHaveText('Pending Game')

  await page.getByRole('button', { name: '拒绝' }).click()
  await expect(page.locator('[data-testid=reject-note]')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认拒绝' })).toBeDisabled()
  await page.locator('[data-testid=reject-note]').fill('描述不完整')
  await page.getByRole('button', { name: '确认拒绝' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin')
  expect(calls).toContain('reject:描述不完整')
})

test('审核通过（confirm 对话框）', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)
  page.once('dialog', (d) => void d.accept())

  await page.goto('http://localhost:4173/admin/submissions/sub-p1')
  await page.getByRole('button', { name: '通过' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin')
  expect(calls).toContain('approve')
})

test('作品管理：下架 / 版本吊销与恢复 / republish', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)

  await page.goto('http://localhost:4173/admin')
  await page.getByRole('button', { name: '作品管理' }).click()
  await expect(page.locator('[data-testid="work-row-mock/live-game"]')).toBeVisible()

  await page.locator('[data-testid="work-row-mock/live-game"]').getByRole('button', { name: '查看' }).click()
  await expect(page.locator('[data-testid="work-row-mock/live-game"]')).toContainText('v3')
  await page.locator('[data-testid="work-row-mock/live-game"]').getByRole('button', { name: '下架' }).click()
  await page.locator('[data-testid="work-row-mock/live-game"]').getByRole('button', { name: '吊销密钥' }).click()
  await page.locator('[data-testid="work-row-mock/live-game"]').getByRole('button', { name: '恢复密钥' }).click()

  // 「恢复上架」在本 tab 下方的「已通过提交」历史区（APPROVED seed；历史行无 data-testid，
  // 用 role+name 定位——seed 仅一条故唯一，无 strict mode 冲突）：spec:181 要求的 republish 断言
  await expect(page.getByRole('button', { name: '恢复上架' })).toBeVisible()
  await page.getByRole('button', { name: '恢复上架' }).click()

  expect(calls.some((c) => c.includes('/api/admin/works/mock/live-game/unpublish'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/mock/live-game/versions/v3/revoke') && c.includes('"revoked":true'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/mock/live-game/versions/v3/revoke') && c.includes('"revoked":false'))).toBe(true)
  // 前三条调用被按钮 disabled 串行化保护，唯 republish 是最后一步、fetch 可能在途 → poll 消竞态
  await expect.poll(() => calls.some((c) => c.includes('/api/admin/works/mock/live-game/republish'))).toBe(true)
})

test('非 admin：header 无审核入口，/admin 重定向首页', async ({ page }) => {
  await seedSession(page, 'user')
  installAdminApi(page, [])
  await page.goto('http://localhost:4173/')
  await expect(page.getByRole('link', { name: '审核' })).toHaveCount(0)
  await page.goto('http://localhost:4173/admin')
  await expect(page).toHaveURL('http://localhost:4173/')
})

// P7 流①（spec §5）：用户页搜索→升 admin→列表即时更新→降回→确认弹层文案两点齐全。
// 另加一步降级唯一 admin → 409 后端原文回显（夹具按 spec §3.4 实现护栏，待真栈联调）。
test('用户管理：搜索 / 升降角色 / 降级确认弹层 / 409 原文', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)

  await page.goto('http://localhost:4173/admin/users')
  await expect(page.locator('[data-testid="user-row-u-bob"]')).toBeVisible()

  // 搜索：只剩 bob（防抖 300ms + 重查，由 expect 轮询收敛）
  await page.locator('[data-testid=user-search]').fill('bob')
  await expect(page.locator('[data-testid="user-row-u-bob"]')).toBeVisible()
  await expect(page.locator('[data-testid="user-row-u-admin"]')).toHaveCount(0)

  // 升 admin：无弹层直接 PATCH，列表即时变「管理员」
  await page.locator('[data-testid="user-row-u-bob"]').getByRole('button', { name: '升为 admin' }).click()
  await expect(page.locator('[data-testid="user-row-u-bob"]')).toContainText('管理员')
  expect(calls).toContain('role:u-bob:admin')

  // 降回：第一步只展开确认弹层，不发请求；文案含两个必含要点
  await page.locator('[data-testid="user-row-u-bob"]').getByRole('button', { name: '降为 user' }).click()
  const overlay = page.locator('[data-testid=demote-confirm]')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('登录态立即失效')
  await expect(overlay).toContainText('最后一个管理员')
  await expect(overlay).toContainText('409')
  await overlay.getByRole('button', { name: '确认降级' }).click()
  await expect(page.locator('[data-testid="user-row-u-bob"]')).toContainText('用户')
  expect(calls).toContain('role:u-bob:user')

  // 唯一 admin 降级 → 夹具 409 last_admin，弹层收起 + 后端原文回显（非中文映射）。
  // 先清空搜索（防抖 300ms 后重查），否则 q=bob 过滤下 u-admin 行不存在
  await page.locator('[data-testid=user-search]').fill('')
  await expect(page.locator('[data-testid="user-row-u-admin"]')).toBeVisible()
  await page.locator('[data-testid="user-row-u-admin"]').getByRole('button', { name: '降为 user' }).click()
  await page.locator('[data-testid=demote-confirm]').getByRole('button', { name: '确认降级' }).click()
  await expect(page.locator('[data-testid=users-action-error]')).toHaveText('cannot demote the last admin')
})

// P7 流②：执行管理动作（approve）后进审计页，该写动作行在流水里（时间/操作者/对象/2xx 着色）；
// route 过滤下拉可用；audit GET 自记录顺序语义（响应之后写行 → 本次不含自己，下次才含）。
// 注：admin 组全部请求入审计（含 AdminView 挂载时的 /api/admin/submissions 读），
// 故行 id 不固定——按内容定位（避免硬编码 au-N）。
test('操作日志：管理动作入流水 / route 过滤 / audit GET 自记录', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)
  page.once('dialog', (d) => void d.accept())

  await page.goto('http://localhost:4173/admin/submissions/sub-p1')
  await page.getByRole('button', { name: '通过' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin')
  expect(calls).toContain('approve')

  // 首次进审计页（GET）:快照只含已发生的写动作（approve）；本次 GET 的自记录行不在其内
  await page.goto('http://localhost:4173/admin/audit')
  const rows = page.locator('[data-testid^=audit-row-]')
  const approveRow = rows.filter({ hasText: '通过提交' })
  await expect(approveRow).toHaveCount(1)
  await expect(approveRow).toContainText('admin@e2e.local')
  await expect(approveRow).toContainText('sub-p1')
  await expect(approveRow.locator('[data-testid^=audit-status-]')).toHaveText('200')
  await expect(approveRow.locator('[data-testid^=audit-status-]')).toHaveClass(/bg-success/)
  // 自记录顺序语义：本次 GET 的行还未写入 → 页面无「操作日志」动作行
  await expect(rows.filter({ hasText: '操作日志' })).toHaveCount(0)

  // 过滤到角色变更模板：本测试没有该动作 → 空态
  await page.selectOption('#audit-route-filter', '/api/admin/users/:id/role')
  await expect(page.getByText('该条件下没有审计记录')).toBeVisible()
  await page.selectOption('#audit-route-filter', '/api/admin/submissions/:id/approve')
  await expect(page.locator('[data-testid^=audit-row-]').filter({ hasText: '通过提交' })).toHaveCount(1)

  // 重载：上几次 audit GET 的自记录行本次出现（锁死自记录语义）——标签「操作日志」，route /api/admin/audit
  await page.reload()
  const selfRows = page.locator('[data-testid^=audit-row-]').filter({ hasText: '操作日志' })
  await expect(selfRows.first()).toBeVisible()
  await expect(selfRows.first()).toContainText('admin@e2e.local')
  // 两个新选项随用户列表/操作日志读取出现在过滤下拉里
  await expect(page.locator('#audit-route-filter option[value="/api/admin/users"]')).toHaveCount(1)
  await expect(page.locator('#audit-route-filter option[value="/api/admin/audit"]')).toHaveCount(1)
})

// P6 D-D（spec §2）：hosted 提交的审核详情展示托管链接行（纯文本，故意不做锚点——
// 审核者不被引导点击任意第三方 URL）与降级方式（runtime=hosted 且有值才显示）。
test('审核详情：hosted 提交展示托管链接（纯文本）与降级方式', async ({ page }) => {
  await seedSession(page, 'admin')
  installAdminApi(page, [])

  await page.goto('http://localhost:4173/admin')
  await expect(page.locator('[data-testid=queue-sub-h1]')).toContainText('Hosted Game')
  await page.locator('[data-testid=queue-sub-h1]').getByRole('link', { name: '审核' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin/submissions/sub-h1')

  const hostedRow = page.locator('[data-testid=payload-hosted-url]')
  await expect(hostedRow).toHaveText('https://hosted.example.dev/game/')
  await expect(hostedRow.locator('a')).toHaveCount(0)
  await expect(page.locator('[data-testid=payload-hosted-fallback]')).toHaveText('降级为站内播放')
})

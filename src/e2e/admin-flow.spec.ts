import { expect, test, type Page, type Route } from '@playwright/test'
import { API, seedSession } from './helpers'

const PENDING = {
  id: 'sub-p1', kind: 'new_work', status: 'pending', work_id: 'pending-game',
  payload: { id: 'pending-game', name: 'Pending Game', url: 'https://example.com/pg', author: { name: 'A' }, description: 'd', durationMinutes: { min: 1, max: 5 }, type: 'puzzle', tags: [], runtime: 'external' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

// 作品管理 tab 的「已通过提交」历史区 seed（AdminView 请求 status=approved）——spec:36：后端无
// admin works 列表端点，「恢复上架」(adminRepublish) 唯一入口是 approved 提交历史；
// work_id 用 live-game 与作品行 mock 同一作品（下架→从历史恢复上架的语义闭环）
const APPROVED = {
  id: 'sub-a1', kind: 'new_work', status: 'approved', work_id: 'live-game',
  payload: { id: 'live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], runtime: 'virtual', version: 'v3' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

function installAdminApi(page: Page, calls: string[]): void {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  page.route(`${API}/api/admin/submissions**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('status') === 'pending') return json(route, { submissions: [PENDING], total: 1 })
    if (url.searchParams.get('status') === 'approved') return json(route, { submissions: [APPROVED], total: 1 })
    return json(route, { submissions: [], total: 0 })
  })
  page.route(`${API}/api/submissions/sub-p1`, (route) => json(route, PENDING))
  page.route(`${API}/api/admin/submissions/sub-p1/approve`, (route) => { calls.push('approve'); json(route, { ok: true }) })
  page.route(`${API}/api/admin/submissions/sub-p1/reject`, (route) => {
    calls.push(`reject:${route.request().postDataJSON()?.note ?? ''}`)
    json(route, { ok: true })
  })
  page.route(`${API}/api/admin/works/**`, (route) => {
    calls.push(new URL(route.request().url()).pathname + ':' + (route.request().postData() ?? ''))
    json(route, { ok: true })
  })
  // 作品管理 tab：/api/games（页面上下文，可被 page.route 拦截）
  page.route(`${API}/api/games`, (route) => json(route, {
    schemaVersion: 1, generatedAt: 'x',
    games: [{ id: 'live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual' }]
  }))
  page.route(`${API}/api/games/live-game`, (route) => json(route, {
    id: 'live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual', version: 'v3', entry: 'index.html',
    bundle: { url: 'https://cdn/b.bin', bytes: 1, sha256: 'a'.repeat(64), enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) } }
  }))
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
  await expect(page.locator('[data-testid=work-row-live-game]')).toBeVisible()

  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '查看' }).click()
  await expect(page.locator('[data-testid=work-row-live-game]')).toContainText('v3')
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '下架' }).click()
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '吊销密钥' }).click()
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '恢复密钥' }).click()

  // 「恢复上架」在本 tab 下方的「已通过提交」历史区（APPROVED seed；历史行无 data-testid，
  // 用 role+name 定位——seed 仅一条故唯一，无 strict mode 冲突）：spec:181 要求的 republish 断言
  await expect(page.getByRole('button', { name: '恢复上架' })).toBeVisible()
  await page.getByRole('button', { name: '恢复上架' }).click()

  expect(calls.some((c) => c.includes('/api/admin/works/live-game/unpublish'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/live-game/versions/v3/revoke') && c.includes('"revoked":true'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/live-game/versions/v3/revoke') && c.includes('"revoked":false'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/live-game/republish'))).toBe(true)
})

test('非 admin：header 无审核入口，/admin 重定向首页', async ({ page }) => {
  await seedSession(page, 'user')
  installAdminApi(page, [])
  await page.goto('http://localhost:4173/')
  await expect(page.getByRole('link', { name: '审核' })).toHaveCount(0)
  await page.goto('http://localhost:4173/admin')
  await expect(page).toHaveURL('http://localhost:4173/')
})

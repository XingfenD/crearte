import { expect, test, type Page, type Route } from '@playwright/test'
import { zipSync } from 'fflate'
import { API, seedSession } from './helpers'

interface Sub {
  id: string; kind: string; status: string; work_id: string
  payload: Record<string, unknown>; bundle_upload_id?: string
  review_note?: string; created_at: string; updated_at: string
}

function makeSub(over: Partial<Sub> = {}): Sub {
  return {
    id: 'sub-1', kind: 'new_work', status: 'draft', work_id: 'my-game',
    payload: {
      id: 'my-game', name: 'My Game', url: 'https://example.com/my-game',
      author: { name: 'Tester' }, description: 'An e2e test work.'
    },
    created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z', ...over
  }
}

/** 内存态提交 API：POST/GET mine/GET:id/PUT:id/DELETE:id + uploads */
function installSubmissionApi(page: Page, state: { subs: Sub[]; failCreate?: { status: number; code: string; retryAfter?: string } }): void {
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

  page.route(`${API}/api/uploads`, (route) =>
    json(route, 201, { upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1234, kid: 'k'.repeat(22) }))

  page.route(`${API}/api/submissions/mine`, (route) =>
    json(route, 200, { submissions: state.subs }))

  page.route(`${API}/api/submissions`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    if (state.failCreate) {
      return json(route, state.failCreate.status, { error: { code: state.failCreate.code, message: 'x' } },
        state.failCreate.retryAfter ? { 'Retry-After': state.failCreate.retryAfter } : {})
    }
    const body = route.request().postDataJSON()
    const sub = makeSub({
      id: `sub-${state.subs.length + 1}`, kind: body.kind, work_id: body.work_id, payload: body.payload,
      bundle_upload_id: body.bundle_upload_id || undefined,
      status: body.submit ? 'pending' : 'draft'
    })
    state.subs.push(sub)
    return json(route, 201, sub)
  })

  page.route(`${API}/api/submissions/sub-*`, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    const idx = state.subs.findIndex((s) => s.id === id)
    const method = route.request().method()
    if (method === 'GET') return idx >= 0 ? json(route, 200, state.subs[idx]) : json(route, 404, { error: { code: 'not_found', message: 'x' } })
    if (method === 'PUT') {
      const body = route.request().postDataJSON()
      if (idx >= 0) {
        state.subs[idx] = { ...state.subs[idx], payload: body.payload ?? state.subs[idx].payload, status: body.submit ? 'pending' : 'draft' }
        return json(route, 200, state.subs[idx])
      }
      return json(route, 404, { error: { code: 'not_found', message: 'x' } })
    }
    if (method === 'DELETE') {
      if (idx >= 0) state.subs.splice(idx, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })
}

const ZIP = zipSync({ 'index.html': new TextEncoder().encode('<!doctype html><title>t</title>') })

async function fillNewWorkForm(page: Page): Promise<void> {
  await page.goto('http://localhost:4173/submit/new')
  await page.getByLabel('名称').fill('My Game')
  await expect(page.locator('[data-testid=work-id]')).toHaveValue('my-game') // slug 联动
  await page.getByLabel('作品原始链接').fill('https://example.com/my-game')
  await page.getByLabel('作者名').fill('Tester')
  await page.getByLabel('描述').fill('An e2e test work.')
}

test('新建 virtual 提交：slug 联动 → 上传 → 存草稿 → 提交 → 撤回', async ({ page }) => {
  await seedSession(page)
  const state = { subs: [] as Sub[] }
  installSubmissionApi(page, state)

  await fillNewWorkForm(page)
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()

  await page.locator('[data-testid=save-draft]').click()
  await expect(page).toHaveURL('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('草稿')
  expect(state.subs[0].bundle_upload_id).toBe('up-1')

  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '提交' }).click()
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('审核中')

  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '撤回' }).click()
  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '确认' }).click()
  await expect(page.locator('[data-testid=submission-sub-1]')).toHaveCount(0)
})

test('work_id/version 修改后已传 bundle 作废并提示重传', async ({ page }) => {
  await seedSession(page)
  const state: { subs: Sub[] } = { subs: [] }
  installSubmissionApi(page, state)
  await fillNewWorkForm(page)
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()
  await page.locator('[data-testid=version]').fill('v2')
  await expect(page.locator('[data-testid=bundle-done]')).toHaveCount(0)
  // 注意：save() 会先把 notice 清空（SubmitFormView.vue:231），故此断言必须在点击存草稿之前
  await expect(page.getByText('请重新上传 bundle')).toBeVisible()

  // spec:132 硬拦截：上面两行只证明 watcher 置了 bundleInvalidated，这里直接验 save() 的
  // 早退分支（SubmitFormView.vue:242-244）——点存草稿必须报「已失效」，且**没有任何写请求发出**
  await page.locator('[data-testid=save-draft]').click()
  await expect(page.getByRole('alert')).toContainText('已失效')
  expect(state.subs).toHaveLength(0)
})

test('429：存草稿展示限流文案与 Retry-After', async ({ page }) => {
  await seedSession(page)
  installSubmissionApi(page, { subs: [], failCreate: { status: 429, code: 'rate_limited', retryAfter: '37' } })
  await fillNewWorkForm(page)
  await page.locator('[data-testid=save-draft]').click()
  await expect(page.getByRole('alert')).toContainText('操作太频繁')
  await expect(page.getByRole('alert')).toContainText('37')
})

test('rejected：审核意见展示 → 编辑重提', async ({ page }) => {
  await seedSession(page)
  const state = { subs: [makeSub({ status: 'rejected', review_note: '截图不清晰' })] }
  installSubmissionApi(page, state)

  await page.goto('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('已拒绝')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('截图不清晰')

  await page.locator('[data-testid=submission-sub-1]').getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL('http://localhost:4173/submit/sub-1')
  await expect(page.getByLabel('名称')).toHaveValue('My Game')
  page.once('dialog', (d) => void d.accept())
  await page.locator('[data-testid=submit-review]').click()
  await expect(page).toHaveURL('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('审核中')
})

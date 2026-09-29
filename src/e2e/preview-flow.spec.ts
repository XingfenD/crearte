import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { zipSync } from 'fflate'
import { API, seedSession } from './helpers'

// 待审预览 e2e：提交表单与审核页的内联试玩必须走**已发布作品同一条运行链路**
// （游玩子域 /__bootstrap → sw.js 下载/校验/解密/解压 → agent.js 桥接）。
// mock 服务器（serve-runtime.mjs）提供带鉴权的上传端点，内容复用 abs-paths 夹具密文/密钥；
// kid/sha256/playSubdomain 由 generated 夹具读出一致下发，SW 的三方 kid 校验才能过。
const GENERATED = new URL('../fixtures/generated/', import.meta.url)
const fixture = JSON.parse(readFileSync(new URL('games/fixture__abs-paths.json', GENERATED), 'utf8')) as {
  id: string; slug: string; version: string; entry: string; playSubdomain: string
  bundle: { sha256: string; bytes: number; enc: { kid: string } }
}
const UPLOAD_ID = 'up-preview'
const WORK_ID = 'tester/my-game'

const ZIP = zipSync({ 'index.html': new TextEncoder().encode('<!doctype html><title>t</title>') })

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function bundleMeta() {
  return {
    sha256: fixture.bundle.sha256,
    bytes: fixture.bundle.bytes,
    kid: fixture.bundle.enc.kid,
    play_subdomain: fixture.playSubdomain
  }
}

/** 上传响应带预览所需元信息（kid/play_subdomain/sha256/bytes） */
function installUploadApi(page: Page): void {
  page.route(`${API}/api/uploads`, (route) => json(route, 201, { upload_id: UPLOAD_ID, ...bundleMeta() }))
}

function virtualPayload() {
  return {
    id: WORK_ID, name: 'My Game', runtime: 'virtual', version: 'v1', entry: 'index.html',
    durationMinutes: { min: 1, max: 5 }, type: 'puzzle', tags: [],
    // 与夹具声明一致：inlineScript 放行后 SW 注入的 CSP 才允许内联脚本（data-ready 由它设置）
    features: { inlineScript: true }
  }
}

test('提交表单：上传 bundle 后试玩预览，iframe 内真实跑起来（复用发布链路）', async ({ page }) => {
  await seedSession(page)
  installUploadApi(page)
  page.route(`${API}/api/submissions/mine`, (route) => json(route, 200, { submissions: [] }))

  await page.goto('http://localhost:4173/submit/new')
  await page.getByLabel('展示名称').fill('My Game')
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  // 该夹具的 data-ready 由内联脚本设置：提交者须显式勾选 inlineScript 权限——
  // 这也验证预览忠实反映「本次提交的 features → SW 注入的 CSP」
  await page.locator('[data-testid=feature-inlineScript]').check()
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()

  await page.locator('[data-testid=toggle-preview]').click()
  // data-ready=1 = SW 完成 下载密文→sha256 校验→取钥→解密→解压→缓存→agent 握手 全链
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frame.locator('body').getAttribute('data-ok')).toBe('abs')
})

test('审核详情：待审提交可内联试玩（admin 视角，同样复用发布链路）', async ({ page }) => {
  await seedSession(page, 'admin')
  installUploadApi(page)
  const pending = {
    id: 'sub-preview', kind: 'new_work', status: 'pending', work_id: WORK_ID,
    payload: virtualPayload(),
    bundle_upload_id: UPLOAD_ID, bundle: bundleMeta(),
    created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z'
  }
  page.route(`${API}/api/admin/submissions**`, (route) => json(route, 200, { submissions: [pending], total: 1 }))
  page.route(`${API}/api/submissions/sub-preview`, (route) => json(route, 200, pending))

  await page.goto('http://localhost:4173/admin')
  await page.locator('[data-testid=queue-sub-preview]').getByRole('link', { name: '审核' }).click()
  await expect(page.locator('[data-testid=payload-bundle]')).toContainText('试玩预览')

  await page.locator('[data-testid=toggle-preview]').click()
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frame.locator('body').getAttribute('data-ok')).toBe('abs')
})

test('会话 token 失效：上传端点 401 → 预览展示加载失败（不静默降级外链）', async ({ page }) => {
  // 页面本身登录态正常（/api/auth/me 不校验 token），仅 SW 拉取上传端点时 401
  await seedSession(page, 'user', 'wrong-token')
  installUploadApi(page)
  page.route(`${API}/api/submissions/mine`, (route) => json(route, 200, { submissions: [] }))

  await page.goto('http://localhost:4173/submit/new')
  await page.getByLabel('展示名称').fill('My Game')
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()

  await page.locator('[data-testid=toggle-preview]').click()
  await expect(page.getByText('作品加载失败')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('HTTP 401')).toBeVisible()
})

test('external 作品无 bundle：提交表单不出现预览入口', async ({ page }) => {
  await seedSession(page)
  installUploadApi(page)
  page.route(`${API}/api/submissions/mine`, (route) => json(route, 200, { submissions: [] }))

  await page.goto('http://localhost:4173/submit/new')
  await page.getByLabel('展示名称').fill('My Game')
  await page.getByLabel('作品原始链接').fill('https://example.com/my-game')
  await expect(page.locator('[data-testid=toggle-preview]')).toHaveCount(0)
})

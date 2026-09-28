import { expect, test, type Page, type Route } from '@playwright/test'
import { API } from './helpers'

function summary(id: string, name: string) {
  return { id, name, url: `https://example.com/${id}`, author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-17', runtime: 'external' }
}

function mockApiGames(page: Page, impl: (route: Route) => Promise<unknown> | unknown): { hits: () => number } {
  let n = 0
  void page.route(`${API}/api/games`, (route) => { n += 1; return impl(route) })
  void page.route(`${API}/api/games/**`, (route) => { n += 1; return impl(route) })
  return { hits: () => n }
}

test('并集合并：同 id API 胜出、source 徽标只给静态源', async ({ page }) => {
  mockApiGames(page, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, generatedAt: 'x', games: [summary('fixture/2048', '2048（API 版）'), summary('api-only', 'API Only')] })
  }))
  await page.goto('http://localhost:4173/games')
  await expect(page.getByRole('heading', { name: '2048（API 版）' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'API Only' })).toBeVisible()
  // 静态夹具（如 rel-paths）带社区投稿徽标；API 作品不带
  const staticCard = page.locator('a[href="/games/fixture/rel-paths"]')
  await expect(staticCard).toContainText('社区投稿')
  const apiCard = page.locator('a[href="/games/api-only"]')
  await expect(apiCard).not.toContainText('社区投稿')
})

test('API 目录挂掉：降级纯静态，19 款照常展示', async ({ page }) => {
  const api = mockApiGames(page, (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/games')
  // 防假绿（硬性）：catch-all 的 404 也会让 listGames 降级纯静态，断言全绿但因果错误。
  // 必须证明 API 真的被拦到过、且拿到的是我们给的 500。
  await expect.poll(() => api.hits()).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '相对路径夹具' })).toBeVisible()
  // 题称「19 款」就得数满 19 款（dist/data/index.json 实测 19）：只断言两个 heading 时，
  // 静态源整体没挂上也会绿
  await expect(page.locator('a[href^="/games/"]')).toHaveCount(19)
  await expect(page.getByText('加载失败')).toHaveCount(0)
})

test('详情：API 404 回落静态；API 5xx 显示错误态', async ({ page }) => {
  // 静态夹具 rel-paths：API 404 → 回落
  const notFound = mockApiGames(page, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'x' } }) }))
  await page.goto('http://localhost:4173/games/fixture/rel-paths')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('相对路径夹具')
  // 防假绿（硬性）：catch-all 也返 404 JSON，漏挂 route 时「回落静态」结论同样成立。
  expect(notFound.hits()).toBeGreaterThan(0)

  // API 5xx：错误态（不回落到静态）——此条不假绿：漏 mock 会回落而非错误态
  mockApiGames(page, (route) => route.fulfill({ status: 503, body: 'down' }))
  await page.goto('http://localhost:4173/games/fixture/2048')
  await expect(page.getByText('加载失败')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

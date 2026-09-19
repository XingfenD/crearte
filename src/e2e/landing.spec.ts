import { expect, test } from '@playwright/test'

test('首页是落地页：hero 文案与统计条', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page).toHaveTitle('crearte 创艺')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('crearte')
  await expect(page.locator('main').getByText('创艺', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'crearte 创艺' })).toBeVisible()
  await expect(page.getByText('托管你的创意')).toBeVisible()
  await expect(page.getByText('收录 15 款')).toBeVisible()
  await expect(page.getByText('4 种类型')).toBeVisible()
  await expect(page.getByText('更新 2026-09-17')).toBeVisible()
})

test('落地页上页头导航都不激活，但贴纸显示收录数', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('link', { name: '游戏', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('navigation').getByRole('link', { name: '文档', exact: true })).not.toHaveAttribute(
    'aria-current',
    'page'
  )
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('href', '/games')
  await expect(page.getByText('共 15 款')).toBeVisible()
})

test('回目录的链接都指向 /games', async ({ page }) => {
  await page.goto('http://localhost:4173/games')
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/games/2048')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/no-such-page')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/games/does-not-exist')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')
})

test('目录迁到 /games 且导航激活', async ({ page }) => {
  await page.goto('http://localhost:4173/games')

  await expect(page.locator('#game-search')).toBeVisible()
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('从落地页进入目录', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('link', { name: '进入游戏目录' }).click()

  await expect(page).toHaveURL('http://localhost:4173/games')
  await expect(page.locator('#game-search')).toBeVisible()
})

test('精选区按类型均衡取样、上限 6', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  const cards = page.locator('a[href^="/games/"]')
  await expect(cards).toHaveCount(6)
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual([
    '/games/2048',
    '/games/a-dark-room',
    '/games/arclight-nightcast',
    '/games/abs-paths',
    '/games/case-files',
    '/games/corrupt'
  ])
})

test('查看全部进入目录', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('link', { name: /^查看全部/ }).click()

  await expect(page).toHaveURL('http://localhost:4173/games')
  await expect(page.locator('#game-search')).toBeVisible()
})

test('数据失败时 hero 仍在、精选区显示错误态', async ({ page }) => {
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('crearte')
  await expect(page.getByText('托管你的创意')).toBeVisible()
  await expect(page.getByText('加载失败')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

test('空数据时统计条隐藏、精选区显示空态', async ({ page }) => {
  await page.route('**/data/index.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-19T00:00:00.000Z', games: [] })
    })
  )
  await page.goto('http://localhost:4173/')

  await expect(page.getByText('还没有收录游戏。')).toBeVisible()
  await expect(page.getByText('收录 0 款')).toHaveCount(0)
})

test('投稿卡邮箱走 mailto、不套中间页', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('link', { name: 'xingfen.fendy@outlook.com' })).toHaveAttribute(
    'href',
    'mailto:xingfen.fendy@outlook.com'
  )
})

test('文档入口卡指向 /docs', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.locator('main').getByRole('link', { name: '文档', exact: true })).toHaveAttribute('href', '/docs')
})

test('数据失败时两个入口卡仍在', async ({ page }) => {
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { name: '想被收录？' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '文档', exact: true })).toBeVisible()
})

test('落地页标题大纲层级正确', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { level: 1, name: 'crearte' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: '精选 · SELECTED' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: '2048' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: '投稿与文档' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: '想被收录？' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: '文档' })).toBeVisible()
})

test('字标拼装完成前页面不实际滚动', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  const label = page.locator('.wordmark-label')
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.mouse.wheel(0, 40)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.wordmark-label')!).animationDelay !== '0s')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.mouse.wheel(0, -40)
  await expect(label).toHaveCSS('animation-delay', '0s')

  await page.mouse.wheel(0, 300)
  await expect(label).toHaveCSS('background-color', 'rgb(245, 197, 24)')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.mouse.wheel(0, 300)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.mouse.wheel(0, 40)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.wordmark-label')!).animationDelay !== '0s')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('字标直接显示完成态且不接管滚动', async ({ page }) => {
    await page.goto('http://localhost:4173/')

    await expect(page.locator('.wordmark-label')).toHaveCSS('background-color', 'rgb(245, 197, 24)')
    await page.mouse.wheel(0, 300)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  })
})

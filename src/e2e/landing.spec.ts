import { expect, test } from '@playwright/test'

test('首页是落地页：hero 文案与统计条', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('crearte')
  await expect(page.getByText('收集可直接开玩的静态网页游戏 · 打开即玩、无需安装')).toBeVisible()
  await expect(page.getByText('收录 15 款')).toBeVisible()
  await expect(page.getByText('4 种类型')).toBeVisible()
  await expect(page.getByText('更新 2026-09-17')).toBeVisible()
})

test('落地页上页头导航都不激活，但贴纸显示收录数', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('link', { name: '游戏', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: '文档', exact: true })).not.toHaveAttribute('aria-current', 'page')
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

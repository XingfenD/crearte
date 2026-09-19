import { expect, test } from '@playwright/test'

test('详情页开始游戏先经中间页，确认后才离开本站', async ({ page, context }) => {
  await context.route('https://play2048.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1 id="target">目标站</h1>' })
  )
  await page.goto('http://localhost:4173/games/2048')

  const [tab] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: '开始游戏' }).click()
  ])
  await tab.waitForLoadState()

  await expect(tab).toHaveURL(/\/out\?kind=game&to=https%3A%2F%2Fplay2048\.co%2F/)
  await expect(tab.getByRole('heading', { name: '即将前往第三方站点开始游戏' })).toBeVisible()
  await expect(tab.getByText('play2048.co', { exact: true })).toBeVisible()
  await expect(tab.getByText('https://play2048.co/', { exact: true })).toBeVisible()

  await tab.getByRole('button', { name: '继续访问' }).click()
  await expect(tab).toHaveURL('https://play2048.co/')
  await expect(tab.locator('#target')).toBeVisible()
  expect(page.url()).toBe('http://localhost:4173/games/2048')
})

test('简介里的外链经中间页（普通版）', async ({ page }) => {
  await page.goto('http://localhost:4173/games/abs-paths')

  const [tab] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: '示例站' }).click()
  ])
  await tab.waitForLoadState()

  await expect(tab).toHaveURL(/\/out\?kind=link&to=https%3A%2F%2Fexample\.com%2Fintro-link/)
  await expect(tab.getByRole('heading', { name: '即将离开本站' })).toBeVisible()
  await expect(tab.getByText('example.com', { exact: true })).toBeVisible()
})

test('危险协议与缺失参数都落到错误态且不跳转', async ({ page }) => {
  await page.goto('http://localhost:4173/out?to=javascript:alert(1)')
  await expect(page.getByRole('heading', { name: '链接无效' })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续访问' })).toHaveCount(0)
  expect(page.url()).toBe('http://localhost:4173/out?to=javascript:alert(1)')

  await page.goto('http://localhost:4173/out')
  await expect(page.getByRole('heading', { name: '链接无效' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回' })).toBeVisible()
})

test('同源目标不显示中间页，直接站内跳转', async ({ page }) => {
  await page.goto('http://localhost:4173/out?to=http%3A%2F%2Flocalhost%3A4173%2Fdocs%2Fabout')
  await expect(page).toHaveURL('http://localhost:4173/docs/about')
  await expect(page.getByRole('heading', { name: '关于本站' })).toBeVisible()
})

test('缺省 kind 按普通版处理', async ({ page }) => {
  await page.goto('http://localhost:4173/out?kind=weird&to=https%3A%2F%2Fexample.com%2Fx')
  await expect(page.getByRole('heading', { name: '即将离开本站' })).toBeVisible()
})

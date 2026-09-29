import { expect, test } from '@playwright/test'

// 夹具 20 作品全部 user: 'fixture'（src/fixtures/catalog/），/users/fixture 应全部列出
test('/users/fixture 列出该作者作品并可跳转详情', async ({ page }) => {
  await page.goto('/users/fixture')
  await expect(page.getByRole('heading', { name: '@fixture' })).toBeVisible()

  const cards = page.locator('[data-testid=game-card]')
  await expect(cards.first()).toBeVisible()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  await expect(page.getByText(`${count} 款作品`)).toBeVisible()

  // 每张卡的作品链接是卡内标题锚点（作者链接为另一锚点），均指向本命名空间的详情页
  const workLinks = cards.locator('h2 a')
  expect(await workLinks.count()).toBe(count)
  for (const link of await workLinks.all()) {
    await expect(link).toHaveAttribute('href', /^\/games\/fixture\//)
  }

  // 可跳转详情：点击标题锚点直达作品详情页并渲染其标题
  await page.locator('[data-testid=game-card] h2 a[href="/games/fixture/2048"]').click()
  await expect(page).toHaveURL('http://localhost:4174/games/fixture/2048')
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible()
})

test('/users/ghost 显示空态', async ({ page }) => {
  await page.goto('/users/ghost')
  await expect(page.getByRole('heading', { name: '@ghost' })).toBeVisible()
  await expect(page.getByText('该作者暂无已上架作品')).toBeVisible()
  await expect(page.locator('[data-testid=game-card]')).toHaveCount(0)
})

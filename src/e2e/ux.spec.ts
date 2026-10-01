import { expect, test } from '@playwright/test'

test('作品页标签点击进入目录过滤', async ({ page }) => {
  await page.goto('http://localhost:4173/games/fixture/2048')
  const tag = page.locator('[data-testid=tag-link]').first()
  const text = (await tag.textContent())!.trim()
  await tag.click()
  await expect(page).toHaveURL(`http://localhost:4173/games?tag=${encodeURIComponent(text)}`)
  await expect(page.locator('[data-testid=game-card]').first()).toBeVisible()
})

test('复制链接：clipboard 写入规范 URL + toast 确认', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('http://localhost:4173/games/fixture/2048')
  await page.locator('[data-testid=copy-link]').click()
  await expect(page.locator('[data-testid=toast]').first()).toContainText('链接已复制')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toBe('http://localhost:4173/games/fixture/2048')
})

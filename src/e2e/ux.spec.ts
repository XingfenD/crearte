import { expect, test } from '@playwright/test'

test('作品页标签点击进入目录过滤', async ({ page }) => {
  await page.goto('http://localhost:4173/games/fixture/2048')
  const tag = page.locator('[data-testid=tag-link]').first()
  const text = (await tag.textContent())!.trim()
  await tag.click()
  await expect(page).toHaveURL(`http://localhost:4173/games?tag=${encodeURIComponent(text)}`)
  await expect(page.locator('[data-testid=game-card]').first()).toBeVisible()
})

import { expect, test } from '@playwright/test'

test('hosted 模式可运行并建立桥', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#score').click()
  await expect(page.getByText('得分：7')).toBeVisible()
})

test('hosted 模式外联仍被阻断', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-fetch', 'blocked')
})

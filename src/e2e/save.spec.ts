import { expect, test } from '@playwright/test'

test('写入后宿主显示存档大小，清除后归零', async ({ page }) => {
  await page.goto('http://localhost:4173/games/storage')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#write').click()
  await expect(page.getByText(/存档：\d+ 项/)).toBeVisible()
  await page.getByRole('button', { name: '清除存档' }).click()
  await expect(page.getByText('存档：0 项')).toBeVisible()
})

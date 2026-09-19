import { expect, test } from '@playwright/test'

test('游戏崩溃显示宿主错误面板且重试会重启 frame', async ({ page }) => {
  await page.goto('http://localhost:4173/games/crash')
  const errorText = page.getByText(/作品加载失败：/)
  await expect(errorText).toBeVisible({ timeout: 20_000 })
  const retry = page.getByRole('button', { name: '重试' })
  await expect(retry).toBeVisible()

  const navigated = page.waitForEvent('framenavigated', { predicate: (frame) => frame !== page.mainFrame() })
  await retry.click()
  await navigated
  await expect(errorText).toBeVisible({ timeout: 20_000 })
})

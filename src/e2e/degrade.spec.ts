import { expect, test } from '@playwright/test'
import { frameDataset } from './helpers'

test('sha 校验失败自动降级到 hosted', async ({ page }) => {
  await page.goto('http://localhost:4173/games/corrupt')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frameDataset(page, 'ok')).toBe('hosted')
})

import { expect, type Page } from '@playwright/test'

export async function openGame(page: Page, id: string): Promise<void> {
  await page.goto(`http://localhost:4173/games/${id}`)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 20_000 })
}

export async function frameDataset(page: Page, key: string): Promise<string | null> {
  return page.frameLocator('iframe').locator('body').getAttribute(`data-${key}`)
}

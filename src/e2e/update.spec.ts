import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

test('版本切换后重新进入加载新资产', async ({ page, request }) => {
  await openGame(page, 'abs-paths')
  expect(await frameDataset(page, 'version')).toBe('v1')
  await request.get('http://localhost:4173/__test/bump-version?id=abs-paths&version=v2')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-version', 'v2', { timeout: 30_000 })
})

test('离线后已安装游戏仍可玩', async ({ page, context }) => {
  await openGame(page, 'abs-paths')
  await context.setOffline(true)
  await page.goto('http://abs-paths.localhost:4173/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
})

test('更新失败时保留旧版本且不注销 SW', async ({ page, request }) => {
  await openGame(page, 'update-fail')
  expect(await frameDataset(page, 'version')).toBe('v1')
  await request.get('http://localhost:4173/__test/bump-version?id=update-fail&version=v2')
  await page.reload()
  // v2 的 sha 被篡改：安装失败后 SW 报告 priorVersion，shell 回根路径继续服务 v1
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-version', 'v1', { timeout: 30_000 })
})

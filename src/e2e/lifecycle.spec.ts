import { expect, test } from '@playwright/test'
import { openGame } from './helpers'

const GAME_ORIGIN = 'http://abs-paths.localhost:4173'

test('安装后 bundle 缓存有内容，缓存被清理后 SW 自愈重下', async ({ page }) => {
  await openGame(page, 'abs-paths')
  const version = await page.frameLocator('iframe').locator('body').getAttribute('data-version')
  expect(version).toBeTruthy()

  // 无 bootstrap fragment 的根导航由 SW 直接用缓存服务
  await page.goto(`${GAME_ORIGIN}/`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  const keys = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, `bundle-${version}`)
  expect(keys).toBeGreaterThan(0)

  await page.evaluate(async (name) => { await caches.delete(name) }, `bundle-${version}`)
  await page.goto(`${GAME_ORIGIN}/`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  await expect(page.locator('body')).toHaveAttribute('data-version', version!)
})

test('离线且未安装时给出可理解提示', async ({ page, context }) => {
  await openGame(page, 'abs-paths')
  await page.goto(`${GAME_ORIGIN}/`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1')
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name)
  })
  await context.setOffline(true)
  await page.goto(`${GAME_ORIGIN}/`)
  await expect(page.getByText('该作品尚未安装，无法离线运行')).toBeVisible()
})

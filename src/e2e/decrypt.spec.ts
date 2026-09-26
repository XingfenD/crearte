import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

// 每个用例从干净的 ratelimit 配额起步，并断言 reset 真生效（防复用旧进程时静默假绿）
test.beforeEach(async ({ request }) => {
  const r = await request.get('http://localhost:4173/__test/reset-ratelimit')
  expect(await r.json()).toEqual({ ok: true })
})

test('取钥 410：首装失败降级到 hosted', async ({ page }) => {
  await page.goto('http://localhost:4173/games/revoked')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frameDataset(page, 'ok')).toBe('hosted')
})

test('新版本取钥 410：保留旧版本且不注销 SW', async ({ page, request }) => {
  await openGame(page, 'revoke-update')
  expect(await frameDataset(page, 'version')).toBe('v1')
  await request.get('http://localhost:4173/__test/bump-version?id=revoke-update')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-version', 'v1', { timeout: 30_000 })
})

test('取钥 429：退避重试后安装成功', async ({ page }) => {
  await openGame(page, 'ratelimit')
  expect(await frameDataset(page, 'ok')).toBe('virtual')
})

test('明文 legacy 夹具（无 enc）仍可安装运行（双模回归）', async ({ page }) => {
  await openGame(page, 'plain-legacy')
  expect(await frameDataset(page, 'ok')).toBe('legacy')
})

test('缓存回收后自愈重装：重建的安装参数含 kid/key 且成功', async ({ page }) => {
  await openGame(page, 'abs-paths')
  const frame = page.frames().find((f) => f.url().startsWith('http://abs-paths.localhost:4173'))
  expect(frame, 'game frame 应存在').toBeTruthy()
  await frame!.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('bundle-')) await caches.delete(name)
    }
  })
  await page.goto('http://abs-paths.localhost:4173/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await page.locator('body').getAttribute('data-ok')).toBe('abs')
})

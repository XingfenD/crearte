import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

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

test('页头菜单：Esc 与外点关闭', async ({ page }) => {
  await seedSession(page)
  await page.goto('http://localhost:4173/')
  // details summary 的可访问名即用户名；此处直接定位页头菜单触发器
  const summary = page.locator('header details summary')
  await expect(summary).toBeVisible()
  await summary.click()
  await expect(page.locator('details[open]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('details[open]')).toHaveCount(0)
  await summary.click()
  await expect(page.locator('details[open]')).toHaveCount(1)
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('details[open]')).toHaveCount(0)
})

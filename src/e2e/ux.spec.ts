import { expect, test } from '@playwright/test'
import { openGame, seedSession } from './helpers'

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

test('最近玩过：站内运行就绪后落地页出现继续游玩条带', async ({ page }) => {
  await openGame(page, '2048')
  await openGame(page, 'a-dark-room')
  await page.goto('http://localhost:4173/')
  const strip = page.locator('[data-testid=recent-strip]')
  await expect(strip).toBeVisible()
  await expect(strip.getByText('继续游玩 · RECENTLY PLAYED')).toBeVisible()
  const hrefs = await strip.locator('a[href^="/games/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')))
  expect(hrefs[0]).toBe('/games/fixture/a-dark-room') // 最近玩的冒泡最前
  expect(hrefs).toContain('/games/fixture/2048')
  // 精选区计数不受影响（条带在 hero 与精选之间，用精选 section 自身定位）
  await expect(page.locator('section', { hasText: '精选 · SELECTED' }).locator('a[href^="/games/"]')).toHaveCount(6)
})

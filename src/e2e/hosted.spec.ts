import { expect, test } from '@playwright/test'

test('hosted 模式可运行并建立桥', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#score').click()
  await expect(page.getByText('得分：7')).toBeVisible()
})

test('hosted 模式外联仍被阻断', async ({ page }) => {
  const outbound: string[] = []
  page.on('request', (request) => { if (request.url().startsWith('https://example.com')) outbound.push(request.url()) })
  const failures: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') failures.push(msg.text()) })
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-fetch', 'blocked')
  // CORS 拒绝也会有 rejected fetch；只有 CSP 才会让请求根本不发出
  expect(outbound).toEqual([])
  expect(failures.some((text) => /Content Security Policy/.test(text))).toBe(true)
})

test('hosted 模式注入游戏元数据', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const body = page.frameLocator('iframe').locator('body')
  await expect(body).toHaveAttribute('data-ready', '1')
  const meta = await body.evaluate(() => window.__GAME_HOST__?.getMeta())
  expect(meta).toMatchObject({ id: 'hosted-demo' })
})

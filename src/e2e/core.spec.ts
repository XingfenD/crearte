import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

test('绝对路径资产可加载', async ({ page }) => {
  await openGame(page, 'abs-paths')
  expect(await frameDataset(page, 'ok')).toBe('abs')
})

test('相对路径与 ../ 可加载', async ({ page }) => {
  await openGame(page, 'rel-paths')
  expect(await frameDataset(page, 'ok')).toBe('rel')
})

test('worker 与 importScripts 可加载', async ({ page }) => {
  await openGame(page, 'worker')
  expect(await frameDataset(page, 'worker')).toBe('lib-ok')
})

test('两个游戏的存储互相隔离且持久', async ({ page }) => {
  await page.goto('http://localhost:4173/games/storage')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#write').click()
  await expect(frame.locator('body')).toHaveAttribute('data-k', 'from-a')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-k', 'from-a')

  await page.goto('http://localhost:4173/games/rel-paths')
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-ready', '1')
  const other = page.frames().find((candidate) => candidate.url().startsWith('http://rel-paths.localhost:4173'))
  expect(other).toBeTruthy()
  expect(await other!.evaluate(() => localStorage.getItem('k'))).toBeNull()
})

test('外联被 CSP 阻断', async ({ page }) => {
  const failures: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') failures.push(msg.text()) })
  await openGame(page, 'exfil')
  expect(await frameDataset(page, 'fetch')).toBe('blocked')
})

test('游戏自注册 SW 被剥夺且运行时 SW 仍工作', async ({ page }) => {
  await openGame(page, 'nested-sw')
  expect(await frameDataset(page, 'sw')).toBe('blocked')
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-ready', '1')
})

test('桥事件：score 上报到宿主 UI', async ({ page }) => {
  await openGame(page, 'storage')
  await page.frameLocator('iframe').locator('#score').click()
  await expect(page.getByText('得分：42')).toBeVisible()
})

test('Range 请求返回 206 与正确片段', async ({ page }) => {
  await openGame(page, 'range')
  expect(await frameDataset(page, 'range')).toBe('206')
  expect(await frameDataset(page, 'body')).toBe('0123')
})

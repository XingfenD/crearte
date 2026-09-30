import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test('主导航有创作者中心 tab，/creator 渲染 hero', async ({ page }) => {
  await page.goto('http://localhost:4173/creator')

  const tab = page.locator('header').getByRole('link', { name: '创作者中心' })
  await expect(tab).toBeVisible()
  await expect(tab).toHaveAttribute('aria-current', 'page')

  await expect(page.getByRole('heading', { level: 1, name: '创作者中心' })).toBeVisible()
  await expect(page.getByText('SHARE YOUR CREATIONS')).toBeVisible()
  await expect(page.getByText('把你的作品分享给所有人')).toBeVisible()
  await expect(page.getByRole('link', { name: '提交作品', exact: true })).toHaveAttribute('href', '/submit/new')
  await expect(page.getByRole('link', { name: '投稿指南' })).toHaveAttribute('href', '/docs/contribute')
})

test('数据卡：未登录给登录引导且 next 回跳 /creator', async ({ page }) => {
  await page.goto('http://localhost:4173/creator')

  const card = page.getByRole('heading', { name: '作品数据' }).locator('..')
  await expect(card.getByText('登录后即可查看您作品的数据。')).toBeVisible()
  await expect(card.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/login?next=/creator')
})

test('数据卡：已登录显示建设中文案且无登录链接', async ({ page }) => {
  await seedSession(page)
  await page.goto('http://localhost:4173/creator')

  const card = page.getByRole('heading', { name: '作品数据' }).locator('..')
  await expect(card.getByText('数据面板正在建设中。上线后将展示您作品的浏览、下载与评分。')).toBeVisible()
  await expect(card.getByRole('link', { name: '登录' })).toHaveCount(0)
})

test('教程卡占位并链到提交作品指南', async ({ page }) => {
  await page.goto('http://localhost:4173/creator')

  const card = page.getByRole('heading', { name: '创作教程' }).locator('..')
  await expect(card.getByText('教程整理中，敬请期待。')).toBeVisible()
  await expect(card.getByRole('link', { name: '《提交作品指南》' })).toHaveAttribute('href', '/docs/contribute')
})

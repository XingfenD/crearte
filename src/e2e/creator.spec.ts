import { expect, test } from '@playwright/test'

test('主导航有创作者中心 tab，/creator 渲染 hero', async ({ page }) => {
  await page.goto('http://localhost:4173/creator')

  const tab = page.locator('header').getByRole('link', { name: '创作者中心' })
  await expect(tab).toBeVisible()
  await expect(tab).toHaveAttribute('aria-current', 'page')

  await expect(page.getByRole('heading', { level: 1, name: '创作者中心' })).toBeVisible()
  await expect(page.getByText('SHARE YOUR CREATIONS')).toBeVisible()
  await expect(page.getByText('把你的作品分享给所有人')).toBeVisible()
  await expect(page.getByRole('link', { name: '提交作品' })).toHaveAttribute('href', '/submit/new')
  await expect(page.getByRole('link', { name: '投稿指南' })).toHaveAttribute('href', '/docs/contribute')
})

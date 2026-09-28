import { expect, test } from '@playwright/test'

test('最小作品：目录卡与详情页兜底渲染', async ({ page }) => {
  await page.goto('/games')
  const card = page.getByRole('link', { name: /最小作品/ })
  await expect(card).toBeVisible()
  await card.click()
  await expect(page.getByRole('heading', { name: '最小作品' })).toBeVisible()
  // 作者缺省 → 显示用户名；描述缺省 → 无描述段；url 缺省 → 无开始体验入口
  await expect(page.getByText('作者：')).toContainText('fixture')
  await expect(page.getByRole('link', { name: /开始体验/ })).toHaveCount(0)
})

import { expect, test } from '@playwright/test'
import { API, seedSession } from './helpers'

// P9-B D-J：可访问性 e2e。三条都测 happy-dom 单测测不到的东西——
// 真实键盘 Tab 序与焦点移交、浏览器算出的可访问名（accessible name）。

test('skip-link：Tab 首站可见，回车后焦点落在主内容区', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  // 未聚焦时 sr-only（1px 裁剪），聚焦后 focus:not-sr-only 展开成可见按钮
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: '跳到主内容' })
  await expect(skip).toBeVisible()
  await expect(skip).toBeFocused()

  // 原生锚点跳转把焦点交给 #main（tabindex="-1" 使其可被程序化聚焦）
  await page.keyboard.press('Enter')
  await expect(page.locator('main#main')).toBeFocused()
})

test('管理端表格列头具备可访问名（含 sr-only 的操作列）', async ({ page }) => {
  await seedSession(page, 'admin')

  // installAdminApi 定义在 admin-flow.spec.ts 内部未导出，故自带最小 mock。
  // 表格由 `v-else`（users.length > 0）门控，必须返回至少一个用户才渲染 <thead>。
  await page.route(`${API}/api/admin/users**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            id: 'u-a11y',
            email: 'a11y@e2e.local',
            username: 'a11y',
            display_name: 'A11y',
            role: 'user',
            created_at: '2026-09-30T00:00:00Z'
          }
        ],
        total: 1
      })
    })
  )

  await page.goto('http://localhost:4173/admin/users')

  const headers = page.getByRole('columnheader')
  await expect(headers).toHaveCount(6)
  await expect(headers.nth(0)).toHaveAccessibleName('用户名')
  // 空表头补的 sr-only「操作」——D-F 的要点：操作列不再是无名第 6 列
  await expect(headers.nth(5)).toHaveAccessibleName('操作')
})

test('评分按钮的可访问名是「评 N 星」而非字形', async ({ page }) => {
  await seedSession(page, 'user')

  // 只断言可访问名，不调 openGame：本夹具 runtime=external，无需等 iframe ready
  await page.goto('http://localhost:4173/games/fixture/2048')

  await expect(page.getByTestId('star-3')).toHaveAccessibleName('评 3 星')
  // 分组携带当前值（未评态为「评分」）；role=group 全仓仅此一处
  await expect(page.locator('[role=group][aria-label^="评分"]')).toHaveCount(1)
})

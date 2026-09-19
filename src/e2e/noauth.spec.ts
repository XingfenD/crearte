import { expect, test } from '@playwright/test'

// 故意预置缓存会话：关闭态必须既不渲染它、也不为它发请求
const STALE_SESSION = {
  token: 'stale',
  expiresAt: '2099-01-01T00:00:00Z',
  user: { id: 'u1', email: 'stale@example.com', display_name: 'Stale', role: 'user' }
}

test('未注入 API 地址：无账号入口、auth 路由回首页、不发起 auth 请求', async ({ page }) => {
  const authRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/')) authRequests.push(request.url())
  })
  await page.addInitScript((session) => {
    localStorage.setItem('crearte.auth.session.v1', JSON.stringify(session))
  }, STALE_SESSION)

  await page.goto('/')
  await expect(page.getByRole('link', { name: '登录' })).toHaveCount(0)
  await expect(page.getByText('Stale')).toHaveCount(0)

  await page.goto('/login')
  await expect(page).toHaveURL('http://localhost:4174/')

  await page.goto('/account')
  await expect(page).toHaveURL('http://localhost:4174/')

  expect(authRequests).toEqual([])
})

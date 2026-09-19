import { expect, test, type Page, type Route } from '@playwright/test'

const API = 'http://localhost:8080'

interface FixtureState {
  users: Map<string, { password: string; display_name: string }>
  tokens: Map<string, string>
  nextToken: number
  loginFailures: number
}

function authResponse(state: FixtureState, email: string, token: string) {
  const user = state.users.get(email)!
  return {
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    user: { id: `u-${email}`, email, display_name: user.display_name, role: 'user' }
  }
}

async function installAuthApi(page: Page): Promise<FixtureState> {
  const state: FixtureState = { users: new Map(), tokens: new Map(), nextToken: 1, loginFailures: 0 }

  await page.route(`${API}/api/auth/**`, async (route: Route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON?.() ?? {}
    const token = (request.headers()['authorization'] ?? '').replace('Bearer ', '')
    const email = token ? state.tokens.get(token) : undefined

    const json = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    const fail = (status: number, code: string) => json(status, { error: { code, message: code } })

    if (path.endsWith('/register')) {
      if (state.users.has(body.email)) return fail(409, 'email_taken')
      state.users.set(body.email, { password: body.password, display_name: body.display_name })
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, body.email)
      return json(201, authResponse(state, body.email, newToken))
    }
    if (path.endsWith('/login')) {
      const user = state.users.get(body.email)
      if (!user || user.password !== body.password) {
        state.loginFailures += 1
        return fail(401, 'invalid_credentials')
      }
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, body.email)
      return json(200, authResponse(state, body.email, newToken))
    }
    if (path.endsWith('/me')) {
      if (!email) return fail(401, 'unauthorized')
      return json(200, { user: authResponse(state, email, token).user })
    }
    if (path.endsWith('/change-password')) {
      if (!email) return fail(401, 'unauthorized')
      const user = state.users.get(email)!
      if (user.password !== body.current_password) return fail(401, 'invalid_credentials')
      user.password = body.new_password
      state.tokens.delete(token)
      const newToken = `t${state.nextToken++}`
      state.tokens.set(newToken, email)
      return json(200, authResponse(state, email, newToken))
    }
    if (path.endsWith('/logout-all')) {
      if (!email) return fail(401, 'unauthorized')
      for (const [key, value] of state.tokens) if (value === email) state.tokens.delete(key)
      return route.fulfill({ status: 204, body: '' })
    }
    return fail(404, 'not_found')
  })

  return state
}

const EMAIL = 'demo@example.com'
const PASSWORD = 'password1234'

test('注册 → 账号页改密 → 登出全部', async ({ page }) => {
  const state = await installAuthApi(page)

  await page.goto('/register')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('昵称').fill('Demo')
  await page.getByLabel(/密码/).fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()

  await expect(page.getByText('Demo')).toBeVisible()
  await page.goto('/account')
  await expect(page.getByText(EMAIL)).toBeVisible()
  await expect(page.getByText('普通用户')).toBeVisible()

  await page.getByLabel('当前密码').fill(PASSWORD)
  await page.getByLabel(/新密码/).fill('newpassword1')
  await page.getByRole('button', { name: '更新密码' }).click()
  await expect(page.getByText('密码已更新，其他设备需要重新登录。')).toBeVisible()
  expect(state.users.get(EMAIL)?.password).toBe('newpassword1')

  await page.getByRole('button', { name: '登出全部设备' }).click()
  await page.getByRole('button', { name: '确认登出全部' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('未登录访问 /account 跳登录并回跳', async ({ page }) => {
  await installAuthApi(page)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)account/)

  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('邮箱或密码不正确')).toBeVisible()
})

test('注册撞 409 提示已注册,登录成功后可回跳 /account', async ({ page }) => {
  const state = await installAuthApi(page)
  state.users.set(EMAIL, { password: PASSWORD, display_name: 'Demo' })

  await page.goto('/register')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('昵称').fill('Demo')
  await page.getByLabel(/密码/).fill(PASSWORD)
  await page.getByRole('button', { name: '注册' }).click()
  await expect(page.getByText('该邮箱已注册，可直接登录')).toBeVisible()

  // 页面同时存在 AppHeader 与注册表单底部的「登录」链接，取表单底部那一个
  await page.getByRole('link', { name: '登录' }).last().click()
  // LoginView 是懒加载路由：必须等导航完成再填写，否则 fill 会落在注册页旧 DOM 上
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Demo')).toBeVisible()
})

test('登录 429 显示倒计时提示', async ({ page }) => {
  await page.route(`${API}/api/auth/login`, (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      // 与后端 cors.go 的 Access-Control-Expose-Headers 保持一致：真实后端必须 expose Retry-After，跨域下前端才能读到
      headers: { 'Retry-After': '30', 'Access-Control-Expose-Headers': 'Retry-After' },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'too many requests' } })
    })
  )

  await page.goto('/login')
  await page.getByLabel('邮箱').fill(EMAIL)
  await page.getByLabel('密码').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByText('操作太频繁，请 30 秒后重试')).toBeVisible()
})

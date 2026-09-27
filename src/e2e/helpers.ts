import { expect, type Page } from '@playwright/test'

export async function openGame(page: Page, id: string): Promise<void> {
  await page.goto(`http://localhost:4173/games/${id}`)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 20_000 })
}

export async function frameDataset(page: Page, key: string): Promise<string | null> {
  return page.frameLocator('iframe').locator('body').getAttribute(`data-${key}`)
}

export const API = 'http://localhost:4173'
export const SESSION_KEY = 'crearte.auth.session.v1'

/** 预置登录会话：localStorage 种子 + /api/auth/me mock（session.restore 复核用） */
export async function seedSession(page: Page, role: 'user' | 'admin' = 'user'): Promise<void> {
  const user = { id: 'u-e2e', email: `${role}@e2e.local`, display_name: role, role }
  await page.addInitScript(([key, u]) => {
    localStorage.setItem(key, JSON.stringify({
      token: 'e2e-token',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: u
    }))
  }, [SESSION_KEY, user] as const)
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) })
  )
}

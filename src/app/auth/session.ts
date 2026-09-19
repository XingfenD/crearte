import { reactive } from 'vue'
import { AuthApiError } from './errors'
import type { AuthClient } from './client'
import type { SessionStore } from './storage'
import type { AuthResponse, AuthUser, Session } from './types'

export interface AuthSessionState {
  status: 'anonymous' | 'authenticated'
  user: AuthUser | null
}

type AuthClientLike = Pick<AuthClient, 'login' | 'register' | 'me' | 'changePassword' | 'logoutAll'>

export interface AuthSession {
  state: AuthSessionState
  restore(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(email: string, displayName: string, password: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  logout(): void
  logoutAll(): Promise<void>
  invalidate(): void
}

export function toSession(response: AuthResponse): Session {
  return { token: response.token, expiresAt: response.expires_at, user: response.user }
}

export function createAuthSession(deps: { client: AuthClientLike; store: SessionStore }): AuthSession {
  const state = reactive<AuthSessionState>({ status: 'anonymous', user: null })
  let current: Session | null = deps.store.read()
  if (current) {
    // 同步恢复缓存会话：路由守卫在首次导航前就能拿到登录态（无需等待异步复核）
    state.user = current.user
    state.status = 'authenticated'
  }

  function apply(session: Session): void {
    current = session
    deps.store.write(session)
    state.user = session.user
    state.status = 'authenticated'
  }

  function invalidate(): void {
    current = null
    deps.store.clear()
    state.user = null
    state.status = 'anonymous'
  }

  return {
    state,
    invalidate,
    async restore() {
      const cached = current
      if (!cached) {
        invalidate()
        return
      }
      try {
        const user = await deps.client.me(cached.token)
        apply({ ...cached, user })
      } catch (error) {
        if (error instanceof AuthApiError && error.code === 'unauthorized') invalidate()
      }
    },
    async login(email, password) {
      apply(toSession(await deps.client.login({ email, password })))
    },
    async register(email, displayName, password) {
      apply(toSession(await deps.client.register({ email, password, displayName })))
    },
    async changePassword(currentPassword, newPassword) {
      if (!current) throw new AuthApiError(401, 'unauthorized', 'no active session')
      apply(toSession(await deps.client.changePassword(current.token, { currentPassword, newPassword })))
    },
    logout() {
      invalidate()
    },
    async logoutAll() {
      const token = current?.token
      if (!token) {
        invalidate()
        return
      }
      try {
        await deps.client.logoutAll(token)
      } catch {
        // 本地一律清态：无状态系统里服务端失败也不该把用户留在"看起来登录着"的状态
      }
      invalidate()
    }
  }
}

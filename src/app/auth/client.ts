import { AuthApiError, toErrorCode, type AuthErrorCode } from './errors'
import type { AuthResponse, AuthUser } from './types'

export interface AuthClientOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  onUnauthorized?: () => void
}

export interface AuthClient {
  register(input: { email: string; password: string; displayName: string }): Promise<AuthResponse>
  login(input: { email: string; password: string }): Promise<AuthResponse>
  me(token: string): Promise<AuthUser>
  changePassword(token: string, input: { currentPassword: string; newPassword: string }): Promise<AuthResponse>
  logoutAll(token: string): Promise<void>
}

function parseRetryAfter(headers: Headers | undefined): number | null {
  const raw = headers?.get('Retry-After')
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function readErrorCode(response: Response): Promise<AuthErrorCode> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } }
    return toErrorCode(body?.error?.code)
  } catch {
    return 'internal'
  }
}

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  async function send<T>(path: string, init: RequestInit, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    let response: Response
    try {
      response = await doFetch(`${base}${path}`, { ...init, headers })
    } catch {
      throw new AuthApiError(0, 'network', 'network request failed')
    }

    if (!response.ok) {
      const code = await readErrorCode(response)
      if (response.status === 401 && code === 'unauthorized') options.onUnauthorized?.()
      throw new AuthApiError(response.status, code, `auth request failed: ${code}`, parseRetryAfter(response.headers))
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    register(input) {
      return send<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, password: input.password, display_name: input.displayName })
      })
    },
    login(input) {
      return send<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: input.email, password: input.password })
      })
    },
    me(token) {
      return send<{ user: AuthUser }>('/api/auth/me', { method: 'GET' }, token).then((body) => body.user)
    },
    changePassword(token, input) {
      return send<AuthResponse>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: input.currentPassword, new_password: input.newPassword })
      }, token)
    },
    logoutAll(token) {
      return send<void>('/api/auth/logout-all', { method: 'POST' }, token)
    }
  }
}

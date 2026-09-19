import type { AuthUser, Session } from './types'

export const SESSION_STORAGE_KEY = 'crearte.auth.session.v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SessionStore {
  read(): Session | null
  write(session: Session): void
  clear(): void
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && user.id !== ''
    && typeof user.email === 'string'
    && typeof user.display_name === 'string'
    && (user.role === 'user' || user.role === 'admin')
}

export function parseSession(raw: string | null, nowMs: number): Session | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const value = parsed as Record<string, unknown>
  if (typeof value.token !== 'string' || value.token === '') return null
  if (typeof value.expiresAt !== 'string') return null
  const expiresAtMs = Date.parse(value.expiresAt)
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) return null
  if (!isAuthUser(value.user)) return null
  return { token: value.token, expiresAt: value.expiresAt, user: value.user }
}

export function createSessionStore(storage: StorageLike, now: () => number = Date.now): SessionStore {
  return {
    read() {
      let session: Session | null = null
      try {
        session = parseSession(storage.getItem(SESSION_STORAGE_KEY), now())
      } catch {
        // 存储访问失败（隐私模式 / 配额满抛 QuotaExceededError / SecurityError）一律降级为未登录
        session = null
      }
      if (!session) {
        try {
          storage.removeItem(SESSION_STORAGE_KEY)
        } catch {
          // 清除失败静默吞掉
        }
      }
      return session
    },
    write(session: Session) {
      try {
        storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      } catch {
        // 写失败静默吞掉：不让登录流程因存储不可用而抛异常
      }
    },
    clear() {
      try {
        storage.removeItem(SESSION_STORAGE_KEY)
      } catch {
        // 清除失败静默吞掉
      }
    }
  }
}

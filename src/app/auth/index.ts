import { createAuthClient } from './client'
import { createAuthSession, type AuthSession } from './session'
import { createSessionStore, type SessionStore } from './storage'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export const authEnabled = baseUrl !== ''

// 关闭账号能力时不读也不写本地凭证：不点亮入口、不发起请求、不渲染缓存身份
const disabledStore: SessionStore = { read: () => null, write: () => {}, clear: () => {} }

let sessionRef: AuthSession | null = null
const client = createAuthClient({
  baseUrl,
  onUnauthorized: () => sessionRef?.invalidate()
})
sessionRef = createAuthSession({
  client,
  store: authEnabled ? createSessionStore(window.localStorage) : disabledStore
})

export const session: AuthSession = sessionRef
export * from './errors'
export * from './types'

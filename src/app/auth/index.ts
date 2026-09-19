import { createAuthClient } from './client'
import { createAuthSession, type AuthSession } from './session'
import { createSessionStore } from './storage'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

let sessionRef: AuthSession | null = null
const client = createAuthClient({
  baseUrl,
  onUnauthorized: () => sessionRef?.invalidate()
})
sessionRef = createAuthSession({ client, store: createSessionStore(window.localStorage) })

export const session: AuthSession = sessionRef
export * from './errors'
export * from './types'

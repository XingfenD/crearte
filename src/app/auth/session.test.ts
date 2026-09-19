import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from './errors'
import { createAuthSession, toSession } from './session'
import { createSessionStore } from './storage'
import type { AuthResponse, AuthUser } from './types'

const USER: AuthUser = { id: 'u1', email: 'a@example.com', display_name: 'A', role: 'user' }
const RESPONSE: AuthResponse = { token: 't1', expires_at: '2026-09-26T12:00:00Z', user: USER }
const CHANGED: AuthResponse = { token: 't2', expires_at: '2026-09-26T13:00:00Z', user: USER }

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  keys() { return [...this.data.keys()] }
}

function deps(overrides: Partial<Record<'login' | 'register' | 'me' | 'changePassword' | 'logoutAll', unknown>> = {}) {
  const client = {
    login: vi.fn().mockResolvedValue(RESPONSE),
    register: vi.fn().mockResolvedValue(RESPONSE),
    me: vi.fn().mockResolvedValue(USER),
    changePassword: vi.fn().mockResolvedValue(CHANGED),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
  return { client: client as never, clientRaw: client as any }
}

let storage: MemoryStorage
beforeEach(() => { storage = new MemoryStorage() })

describe('auth 会话', () => {
  it('login 写入凭证并置为已登录', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    expect(session.state.status).toBe('authenticated')
    expect(session.state.user?.email).toBe('a@example.com')
    expect(storage.getItem('crearte.auth.session.v1')).toContain('t1')
  })

  it('restore 无凭证时为匿名', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.restore()
    expect(session.state.status).toBe('anonymous')
    expect(session.state.user).toBeNull()
  })

  it('restore 乐观渲染（创建时同步恢复），复核成功后用服务端 user 覆盖', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockResolvedValueOnce({ ...USER, display_name: '新名字' })

    const session = createAuthSession({ client, store })
    expect(session.state.user?.display_name).toBe('A')
    await session.restore()
    expect(session.state.user?.display_name).toBe('新名字')
  })

  it('restore 复核 401 时清态', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockRejectedValueOnce(new AuthApiError(401, 'unauthorized', 'x'))

    const session = createAuthSession({ client, store })
    await session.restore()
    expect(session.state.status).toBe('anonymous')
    expect(store.read()).toBeNull()
  })

  it('restore 网络失败保留乐观状态', async () => {
    const { client, clientRaw } = deps()
    const store = createSessionStore(storage, () => Date.now())
    store.write(toSession(RESPONSE))
    clientRaw.me.mockRejectedValueOnce(new AuthApiError(0, 'network', 'x'))

    const session = createAuthSession({ client, store })
    await session.restore()
    expect(session.state.status).toBe('authenticated')
  })

  it('changePassword 换成新 token', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    clientRaw.changePassword.mockResolvedValueOnce(CHANGED)
    await session.changePassword('password1234', 'newpassword1')
    expect(session.state.user?.id).toBe('u1')
    expect(storage.getItem('crearte.auth.session.v1')).toContain('t2')
  })

  it('logout 只清本地,logoutAll 先调后端', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    session.logout()
    expect(session.state.status).toBe('anonymous')
    expect(clientRaw.logoutAll).not.toHaveBeenCalled()

    await session.login('a@example.com', 'password1234')
    await session.logoutAll()
    expect(clientRaw.logoutAll).toHaveBeenCalledWith('t1')
    expect(session.state.status).toBe('anonymous')
  })

  it('logoutAll 失败也清本地', async () => {
    const { client, clientRaw } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    clientRaw.logoutAll.mockRejectedValueOnce(new AuthApiError(500, 'internal', 'x'))
    await expect(session.logoutAll()).resolves.toBeUndefined()
    expect(session.state.status).toBe('anonymous')
  })

  it('invalidate 幂等', async () => {
    const { client } = deps()
    const session = createAuthSession({ client, store: createSessionStore(storage, () => Date.now()) })
    await session.login('a@example.com', 'password1234')
    session.invalidate()
    session.invalidate()
    expect(session.state.status).toBe('anonymous')
    expect(storage.keys()).toHaveLength(0)
  })
})

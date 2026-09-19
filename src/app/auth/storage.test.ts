import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY, createSessionStore, parseSession } from './storage'
import type { Session } from './types'

const NOW = Date.parse('2026-09-19T12:00:00Z')
const session: Session = {
  token: 'token-1',
  expiresAt: '2026-09-26T12:00:00Z',
  user: { id: 'u1', email: 'a@example.com', display_name: 'Tester', role: 'user' }
}

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  keys() { return [...this.data.keys()] }
}

let storage: MemoryStorage

beforeEach(() => { storage = new MemoryStorage() })

describe('auth 凭证存储', () => {
  it('写入后可读回', () => {
    createSessionStore(storage, () => NOW).write(session)
    expect(storage.getItem(SESSION_STORAGE_KEY)).toContain('token-1')
    expect(createSessionStore(storage, () => NOW).read()).toEqual(session)
  })

  it('过期即清除并返回 null', () => {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, expiresAt: '2026-09-19T11:59:59Z' }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('损坏 JSON 与字段缺失都清除并返回 null', () => {
    storage.setItem(SESSION_STORAGE_KEY, '{oops')
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull()

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: 't', expiresAt: session.expiresAt }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, user: { ...session.user, role: 'root' } }))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
  })

  it('clear 清空', () => {
    const store = createSessionStore(storage, () => NOW)
    store.write(session)
    store.clear()
    expect(store.read()).toBeNull()
    expect(storage.keys()).toHaveLength(0)
  })

  it('别的版本 key 不会被读取', () => {
    storage.setItem('crearte.auth.session.v0', JSON.stringify(session))
    expect(createSessionStore(storage, () => NOW).read()).toBeNull()
    expect(storage.getItem('crearte.auth.session.v0')).not.toBeNull()
  })

  it('parseSession 对时间非法串返回 null', () => {
    expect(parseSession(JSON.stringify({ ...session, expiresAt: 'soon' }), NOW)).toBeNull()
  })

  describe('存储访问容错（隐私模式 / 配额满）', () => {
    class ThrowingStorage {
      throwOnRead = false
      throwOnWrite = false
      throwOnRemove = false
      getItem(_key: string) {
        if (this.throwOnRead) throw new DOMException('denied', 'SecurityError')
        return null
      }
      setItem(_key: string, _value: string) {
        if (this.throwOnWrite) throw new DOMException('quota', 'QuotaExceededError')
      }
      removeItem(_key: string) {
        if (this.throwOnRemove) throw new DOMException('denied', 'SecurityError')
      }
    }

    it('read 出错返回 null 不抛，且尽力清除', () => {
      const failing = new ThrowingStorage()
      failing.throwOnRead = true
      const store = createSessionStore(failing, () => NOW)
      expect(() => store.read()).not.toThrow()
      expect(store.read()).toBeNull()
    })

    it('read 出错且清除也失败时不抛', () => {
      const failing = new ThrowingStorage()
      failing.throwOnRead = true
      failing.throwOnRemove = true
      const store = createSessionStore(failing, () => NOW)
      expect(() => store.read()).not.toThrow()
      expect(store.read()).toBeNull()
    })

    it('write 出错不抛（吞掉）', () => {
      const failing = new ThrowingStorage()
      failing.throwOnWrite = true
      const store = createSessionStore(failing, () => NOW)
      expect(() => store.write(session)).not.toThrow()
    })

    it('clear 出错不抛（吞掉）', () => {
      const failing = new ThrowingStorage()
      failing.throwOnRemove = true
      const store = createSessionStore(failing, () => NOW)
      expect(() => store.clear()).not.toThrow()
    })
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AdminUsersView from './AdminUsersView.vue'
import { adminActionMessage } from './AdminUsersView.vue'
import { AdminApiError } from '@/data/repository'
import type { AdminUser, AdminUserPage } from '@/data/types'

const h = vi.hoisted(() => ({
  apiRepo: { listAdminUsers: vi.fn(), setUserRole: vi.fn() }
}))

vi.mock('@/data', () => ({ apiRepo: h.apiRepo }))

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

const alice: AdminUser = {
  id: 'u-alice', email: 'alice@crearte.dev', username: 'alice', display_name: '爱丽丝',
  role: 'admin', created_at: '2026-09-01T00:00:00Z'
}
const bob: AdminUser = {
  id: 'u-bob', email: 'bob@crearte.dev', username: 'bob', display_name: '鲍勃',
  role: 'user', created_at: '2026-09-02T00:00:00Z'
}
const page: AdminUserPage = { users: [alice, bob], total: 120 }

function mountView() {
  return mount(AdminUsersView, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  h.apiRepo.listAdminUsers.mockResolvedValue(page)
  h.apiRepo.setUserRole.mockResolvedValue(alice)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminUsersView（/admin/users）', () => {
  it('首载：limit 50/offset 0 请求，渲染 用户名/邮箱/显示名/角色/注册时间 五列', async () => {
    const w = mountView()
    await flushPromises()
    expect(h.apiRepo.listAdminUsers).toHaveBeenCalledWith({ q: '', limit: 50, offset: 0 })
    const row = w.get('[data-testid="user-row-u-alice"]')
    expect(row.text()).toContain('alice')
    expect(row.text()).toContain('alice@crearte.dev')
    expect(row.text()).toContain('爱丽丝')
    expect(row.text()).toContain('管理员')
    expect(row.text()).toContain('2026')
    expect(w.get('[data-testid="user-row-u-bob"]').text()).toContain('用户')
    // 分页区间来自 total
    expect(w.text()).toContain('1–50 / 120')
  })

  it('搜索防抖 300ms：到点才按 trim 后的 q 重查并回到第一页', async () => {
    const w = mountView()
    await flushPromises()
    h.apiRepo.listAdminUsers.mockClear()
    await w.get('#user-search').setValue('  bob ')
    expect(h.apiRepo.listAdminUsers).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299)
    expect(h.apiRepo.listAdminUsers).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(h.apiRepo.listAdminUsers).toHaveBeenCalledWith({ q: 'bob', limit: 50, offset: 0 })
  })

  it('升 admin 无需弹层：直接 PATCH，成功后刷新列表', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-testid="user-row-u-bob"]').get('button').trigger('click')
    expect(w.find('[data-testid="demote-confirm"]').exists()).toBe(false)
    expect(h.apiRepo.setUserRole).toHaveBeenCalledWith('u-bob', 'admin')
    await flushPromises()
    expect(h.apiRepo.listAdminUsers).toHaveBeenCalledTimes(2)
  })

  it('降级确认弹层：文案含「登录态立即失效」与「最后一个管理员 409」两点；确认后 PATCH user', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-testid="user-row-u-alice"]').get('button').trigger('click')
    const overlay = w.get('[data-testid="demote-confirm"]')
    expect(overlay.text()).toContain('alice@crearte.dev')
    expect(w.get('[data-testid="demote-note-sessions"]').text()).toContain('登录态立即失效')
    expect(w.get('[data-testid="demote-note-last-admin"]').text()).toContain('最后一个管理员')
    expect(w.get('[data-testid="demote-note-last-admin"]').text()).toContain('409')
    // 只点一次「降为 user」不会发请求（两步确认）
    expect(h.apiRepo.setUserRole).not.toHaveBeenCalled()
    const confirmButtons = w.get('[data-testid="demote-confirm"]').findAll('button')
    await confirmButtons[0].trigger('click')
    expect(h.apiRepo.setUserRole).toHaveBeenCalledWith('u-alice', 'user')
    await flushPromises()
    expect(w.find('[data-testid="demote-confirm"]').exists()).toBe(false)
    expect(h.apiRepo.listAdminUsers).toHaveBeenCalledTimes(2)
  })

  it('取消按钮收起弹层且不发请求', async () => {
    const w = mountView()
    await flushPromises()
    await w.get('[data-testid="user-row-u-alice"]').get('button').trigger('click')
    const confirmButtons = w.get('[data-testid="demote-confirm"]').findAll('button')
    await confirmButtons[1].trigger('click')
    expect(w.find('[data-testid="demote-confirm"]').exists()).toBe(false)
    expect(h.apiRepo.setUserRole).not.toHaveBeenCalled()
  })

  it('409 last_admin：后端原文回显（不套中文映射），弹层收起', async () => {
    h.apiRepo.setUserRole.mockRejectedValueOnce(new AdminApiError(409, 'last_admin', 'cannot demote the last admin'))
    const w = mountView()
    await flushPromises()
    await w.get('[data-testid="user-row-u-alice"]').get('button').trigger('click')
    await w.get('[data-testid="demote-confirm"]').findAll('button')[0].trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="users-action-error"]').text()).toBe('cannot demote the last admin')
    expect(w.find('[data-testid="demote-confirm"]').exists()).toBe(false)
  })

  it('非 409 错误走 toContentMessage 中文映射（AdminApiError 的 message 仍原样）', async () => {
    h.apiRepo.setUserRole.mockRejectedValueOnce(new Error('网络错误'))
    const w = mountView()
    await flushPromises()
    await w.get('[data-testid="user-row-u-bob"]').get('button').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="users-action-error"]').text()).toBe('网络错误')
  })

  it('validation/not_found/internal 错误中文化经视图展示', async () => {
    const cases: Array<[AdminApiError, string]> = [
      [new AdminApiError(400, 'validation', 'invalid role'), '角色参数非法'],
      [new AdminApiError(404, 'not_found', 'user not found'), '用户不存在'],
      [new AdminApiError(500, 'internal', 'boom'), '服务器内部错误，请稍后重试']
    ]
    for (const [err, expected] of cases) {
      h.apiRepo.setUserRole.mockRejectedValueOnce(err)
      const w = mountView()
      await flushPromises()
      await w.get('[data-testid="user-row-u-bob"]').get('button').trigger('click')
      await flushPromises()
      expect(w.get('[data-testid="users-action-error"]').text()).toBe(expected)
    }
  })

  it('下一页 → offset 50 重查', async () => {
    const w = mountView()
    await flushPromises()
    const next = w.findAll('button').find((b) => b.text() === '下一页')
    expect(next).toBeDefined()
    await next?.trigger('click')
    await flushPromises()
    expect(h.apiRepo.listAdminUsers).toHaveBeenLastCalledWith({ q: '', limit: 50, offset: 50 })
  })

  it('空结果显示占位文案', async () => {
    h.apiRepo.listAdminUsers.mockResolvedValue({ users: [], total: 0 })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('没有匹配的用户')
  })
})

describe('adminActionMessage 文案映射（P7 遗留尾）', () => {
  it('validation / not_found / internal 三码中文化', () => {
    expect(adminActionMessage(new AdminApiError(400, 'validation', 'invalid role'))).toBe('角色参数非法')
    expect(adminActionMessage(new AdminApiError(404, 'not_found', 'user not found'))).toBe('用户不存在')
    expect(adminActionMessage(new AdminApiError(500, 'internal', 'boom'))).toBe('服务器内部错误，请稍后重试')
  })

  it('last_admin 与未知 code 透传后端原文', () => {
    expect(adminActionMessage(new AdminApiError(409, 'last_admin', 'cannot demote the last admin'))).toBe('cannot demote the last admin')
    expect(adminActionMessage(new AdminApiError(418, 'mystery', 'teapot'))).toBe('teapot')
  })

  it('非 AdminApiError 回退到 toContentMessage（普通 Error 原样）', () => {
    expect(adminActionMessage(new Error('网络错误'))).toBe('网络错误')
  })
})

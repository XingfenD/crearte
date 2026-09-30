// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AdminAuditView from './AdminAuditView.vue'
import type { AuditEntry, AuditPage } from '@/data/types'

const h = vi.hoisted(() => ({
  apiRepo: { listAudit: vi.fn() }
}))

vi.mock('@/data', () => ({ apiRepo: h.apiRepo }))

const RouterLinkStub = { props: ['to'], template: '<a :href="to"><slot /></a>' }

const approveEntry: AuditEntry = {
  id: 'e-approve', actor_id: 'u-1', actor_email: 'admin@crearte.dev',
  method: 'POST', route: '/api/admin/submissions/:id/approve', path: '/api/admin/submissions/sub-p1/approve',
  status: 200, created_at: '2026-09-30T10:20:00Z'
}
const demoteFailEntry: AuditEntry = {
  id: 'e-demote-409', actor_id: 'u-1', actor_email: 'admin@crearte.dev',
  method: 'PATCH', route: '/api/admin/users/:id/role', path: '/api/admin/users/u-2/role',
  status: 409, created_at: '2026-09-30T10:21:00Z'
}
const unknownEntry: AuditEntry = {
  id: 'e-unknown', actor_id: 'u-1', actor_email: 'admin@crearte.dev',
  method: 'DELETE', route: '/api/admin/whatever/:id', path: '/api/admin/whatever/x9',
  status: 500, created_at: '2026-09-30T10:22:00Z'
}
const page: AuditPage = { entries: [approveEntry, demoteFailEntry, unknownEntry], total: 3 }

function mountView() {
  return mount(AdminAuditView, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.apiRepo.listAudit.mockResolvedValue(page)
})

describe('AdminAuditView（/admin/audit）', () => {
  it('首载 limit 50/offset 0：时间/操作者/动作中文标签/对象/结果码逐列渲染', async () => {
    const w = mountView()
    await flushPromises()
    expect(h.apiRepo.listAudit).toHaveBeenCalledWith({ route: '', limit: 50, offset: 0 })
    const row = w.get('[data-testid="audit-row-e-approve"]')
    expect(row.text()).toContain('admin@crearte.dev')
    expect(row.text()).toContain('通过提交')
    expect(row.text()).toContain('sub-p1')
    expect(row.text()).toContain('200')
    // 时间本地化：不出现原文 RFC3339 串
    expect(row.text()).not.toContain('2026-09-30T10:20:00Z')
  })

  it('未知 route 回退原文「METHOD route」；4xx 黄、5xx 红着色', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.get('[data-testid="audit-row-e-unknown"]').text()).toContain('DELETE /api/admin/whatever/:id')
    expect(w.get('[data-testid="audit-status-e-demote-409"]').classes()).toContain('bg-highlight')
    expect(w.get('[data-testid="audit-status-e-demote-409"]').text()).toBe('409')
    expect(w.get('[data-testid="audit-status-e-unknown"]').classes()).toContain('bg-accent-ink')
    expect(w.get('[data-testid="audit-status-e-approve"]').classes()).toContain('bg-success')
  })

  it('route 过滤下拉：选中项以模板原文作 route 参数重查并回第一页', async () => {
    const w = mountView()
    await flushPromises()
    const select = w.get('#audit-route-filter')
    const options = select.findAll('option')
    // 全部动作 + 已知标签集（spec §4.3 选项 = 已知动作标签集）
    expect(options[0].text()).toBe('全部动作')
    expect(options.map((o) => o.attributes('value'))).toContain('/api/admin/users/:id/role')
    await select.setValue('/api/admin/users/:id/role')
    await flushPromises()
    expect(h.apiRepo.listAudit).toHaveBeenLastCalledWith({ route: '/api/admin/users/:id/role', limit: 50, offset: 0 })
  })

  it('空结果显示占位文案', async () => {
    h.apiRepo.listAudit.mockResolvedValue({ entries: [], total: 0 })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('该条件下没有审计记录')
  })

  it('加载失败：StatePanel 错误态 + 重试按钮重查', async () => {
    h.apiRepo.listAudit.mockRejectedValueOnce(new Error('请求失败 500'))
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('加载失败')
    const retry = w.findAll('button').find((b) => b.text().includes('重试'))
    expect(retry).toBeDefined()
    await retry?.trigger('click')
    await flushPromises()
    expect(h.apiRepo.listAudit).toHaveBeenCalledTimes(2)
    expect(w.text()).toContain('通过提交')
  })
})

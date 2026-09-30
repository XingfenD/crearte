import { describe, expect, it } from 'vitest'
import { AUDIT_ROUTE_OPTIONS, auditActionLabel, auditObject, auditStatusClass } from './adminAudit'

describe('auditActionLabel（spec §4.3：映射外模板回退原文）', () => {
  it('已知 route 给中文标签并带 method', () => {
    expect(auditActionLabel('POST', '/api/admin/submissions/:id/approve')).toBe('通过提交（POST）')
    expect(auditActionLabel('PATCH', '/api/admin/users/:id/role')).toBe('变更用户角色（PATCH）')
  })

  it('审计页自身数据里会出现的两读动作有中文标签（spec §3.4 admin 组全请求入审计）', () => {
    expect(auditActionLabel('GET', '/api/admin/users')).toBe('用户列表（GET）')
    expect(auditActionLabel('GET', '/api/admin/audit')).toBe('操作日志（GET）')
  })

  it('未知 route 回退 METHOD + 原文', () => {
    expect(auditActionLabel('DELETE', '/api/admin/whatever')).toBe('DELETE /api/admin/whatever')
  })

  it('下拉选项 = 已知标签集（value 为模板原文，供服务侧 route 过滤）', () => {
    expect(AUDIT_ROUTE_OPTIONS.map((o) => o.value)).toContain('/api/admin/audit')
    expect(AUDIT_ROUTE_OPTIONS.map((o) => o.value)).toContain('/api/admin/users')
    expect(AUDIT_ROUTE_OPTIONS.every((o) => o.label.length > 0)).toBe(true)
  })
})

describe('auditObject（模板与 path 逐段对齐抽参数）', () => {
  it('submissions :id 提取提交 id', () => {
    expect(auditObject('/api/admin/submissions/:id/approve', '/api/admin/submissions/sub-9/approve')).toBe('sub-9')
  })

  it('works :user/:slug 提取作品 id', () => {
    expect(auditObject('/api/admin/works/:user/:slug/unpublish', '/api/admin/works/mock/live-game/unpublish')).toBe('mock/live-game')
  })

  it('versions :version 附加显示', () => {
    expect(auditObject('/api/admin/works/:user/:slug/versions/:version/revoke', '/api/admin/works/mock/live-game/versions/v3/revoke'))
      .toBe('mock/live-game · v3')
  })

  it('角色端点 :id 提取用户 id', () => {
    expect(auditObject('/api/admin/users/:id/role', '/api/admin/users/u-1/role')).toBe('u-1')
  })

  it('无参数模板（含未知 route）→ —', () => {
    expect(auditObject('/api/admin/audit', '/api/admin/audit?limit=50')).toBe('—')
    expect(auditObject('/api/admin/whatever', '/api/admin/whatever')).toBe('—')
  })

  it('path 段数少于模板（防御：只取存在的段）', () => {
    expect(auditObject('/api/admin/works/:user/:slug/unpublish', '/api/admin/works/mock')).toBe('mock')
  })
})

describe('auditStatusClass（2xx 绿 4xx 黄）', () => {
  it('2xx → success；4xx → highlight；其余 → 红', () => {
    expect(auditStatusClass(200)).toContain('bg-success')
    expect(auditStatusClass(204)).toContain('bg-success')
    expect(auditStatusClass(403)).toContain('bg-highlight')
    expect(auditStatusClass(409)).toContain('bg-highlight')
    expect(auditStatusClass(500)).toContain('bg-accent-ink')
    expect(auditStatusClass(302)).toContain('bg-accent-ink')
  })
})

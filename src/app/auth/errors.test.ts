import { describe, expect, it } from 'vitest'
import { AUTH_ERROR_MESSAGES, AuthApiError, toUserMessage } from './errors'

describe('auth 错误映射', () => {
  it('已知 code 走文案表', () => {
    expect(toUserMessage(new AuthApiError(400, 'invalid_email', 'x'))).toBe(AUTH_ERROR_MESSAGES.invalid_email)
    expect(toUserMessage(new AuthApiError(401, 'invalid_credentials', 'x'))).toBe('邮箱或密码不正确')
  })

  it('rate_limited 带 Retry-After 时给出秒数', () => {
    expect(toUserMessage(new AuthApiError(429, 'rate_limited', 'x', 42))).toBe('操作太频繁，请 42 秒后重试')
    expect(toUserMessage(new AuthApiError(429, 'rate_limited', 'x'))).toBe(AUTH_ERROR_MESSAGES.rate_limited)
  })

  it('缺省限流文案固定为 60 秒', () => {
    expect(AUTH_ERROR_MESSAGES.rate_limited).toBe('操作太频繁，请 60 秒后重试')
    expect(toUserMessage(new AuthApiError(429, 'rate_limited', 'x'))).toBe('操作太频繁，请 60 秒后重试')
  })

  it('未知错误按网络失败兜底', () => {
    expect(toUserMessage(new Error('boom'))).toBe(AUTH_ERROR_MESSAGES.network)
    expect(toUserMessage('boom')).toBe(AUTH_ERROR_MESSAGES.network)
  })
})

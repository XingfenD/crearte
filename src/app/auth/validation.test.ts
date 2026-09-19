import { describe, expect, it } from 'vitest'
import { normalizeEmail, sanitizeNext, validateDisplayName, validateEmail, validatePassword } from './validation'

describe('auth 表单校验', () => {
  it('邮箱 trim + 小写,并拒绝非法形态', () => {
    expect(normalizeEmail('  A@Example.COM ')).toBe('a@example.com')
    expect(validateEmail('  A@Example.COM ')).toBeNull()
    expect(validateEmail('nope')).toBe('invalid_email')
    expect(validateEmail('a@b')).toBe('invalid_email')
    expect(validateEmail('a b@example.com')).toBe('invalid_email')
    expect(validateEmail('')).toBe('invalid_email')
  })

  it('邮箱超过 254 字节被拒', () => {
    const long = `${'a'.repeat(250)}@example.com`
    expect(validateEmail(long)).toBe('invalid_email')
  })

  it('密码按字符数计,10-128 之间通过', () => {
    expect(validatePassword('a'.repeat(9))).toBe('weak_password')
    expect(validatePassword('a'.repeat(10))).toBeNull()
    expect(validatePassword('a'.repeat(128))).toBeNull()
    expect(validatePassword('a'.repeat(129))).toBe('weak_password')
    expect(validatePassword('密码密码密码密码密码')).toBeNull()
  })

  it('昵称 trim 后 1-60 字符且不含控制字符', () => {
    expect(validateDisplayName('  Tester  ')).toBeNull()
    expect(validateDisplayName('   ')).toBe('invalid_display_name')
    expect(validateDisplayName('a'.repeat(61))).toBe('invalid_display_name')
    expect(validateDisplayName(`a${String.fromCharCode(7)}b`)).toBe('invalid_display_name')
  })

  it('sanitizeNext 只放行站内相对路径', () => {
    expect(sanitizeNext('/account')).toBe('/account')
    expect(sanitizeNext('/games/2048?x=1#top')).toBe('/games/2048?x=1#top')
    expect(sanitizeNext('//evil.com')).toBe('/')
    expect(sanitizeNext('https://evil.com')).toBe('/')
    expect(sanitizeNext('/a\\b')).toBe('/')
    expect(sanitizeNext(undefined)).toBe('/')
    expect(sanitizeNext(['/a', '/b'])).toBe('/')
  })
})

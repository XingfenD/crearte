import { describe, expect, it } from 'vitest'
import { normalizeEmail, sanitizeNext, USERNAME_PATTERN, validateDisplayName, validateEmail, validatePassword, validateUsername } from './validation'

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

  it('邮箱长度按字节而非字符计', () => {
    expect(validateEmail(`${'é'.repeat(120)}@example.com`)).toBeNull()
    expect(validateEmail(`${'é'.repeat(122)}@example.com`)).toBe('invalid_email')
  })

  it('密码按字符数计,10-128 之间通过', () => {
    expect(validatePassword('a'.repeat(9))).toBe('weak_password')
    expect(validatePassword('a'.repeat(10))).toBeNull()
    expect(validatePassword('a'.repeat(128))).toBeNull()
    expect(validatePassword('a'.repeat(129))).toBe('weak_password')
    expect(validatePassword('密码密码密码密码密码')).toBeNull()
  })

  it('密码长度按码点而非 UTF-16 单元计', () => {
    expect(validatePassword('中'.repeat(128))).toBeNull()
    expect(validatePassword('😀'.repeat(10))).toBeNull()
    expect(validatePassword('😀'.repeat(128))).toBeNull()
    expect(validatePassword('😀'.repeat(129))).toBe('weak_password')
  })

  it('昵称 1 与 60 字符边界均通过', () => {
    expect(validateDisplayName('a')).toBeNull()
    expect(validateDisplayName('a'.repeat(60))).toBeNull()
    expect(validateDisplayName('a'.repeat(61))).toBe('invalid_display_name')
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

  it('sanitizeNext 拒绝含控制字符的路径', () => {
    expect(sanitizeNext('/\t/evil.com')).toBe('/')
    expect(sanitizeNext('/\n/evil.com')).toBe('/')
    expect(sanitizeNext('/\r/evil.com')).toBe('/')
  })
})

describe('用户名规则', () => {
  it('小写字母、数字、连字符，1–39 字符，首尾非连字符', () => {
    expect(validateUsername('alice')).toBeNull()
    expect(validateUsername('a1-b2-c3')).toBeNull()
    expect(validateUsername('a')).toBeNull()
    expect(validateUsername('a'.repeat(39))).toBeNull()
  })

  it('拒绝空串、大写、下划线、首尾连字符、超长、空格', () => {
    expect(validateUsername('')).toBe('invalid_username')
    expect(validateUsername('Alice')).toBe('invalid_username')
    expect(validateUsername('a_b')).toBe('invalid_username')
    expect(validateUsername('-abc')).toBe('invalid_username')
    expect(validateUsername('abc-')).toBe('invalid_username')
    expect(validateUsername('a'.repeat(40))).toBe('invalid_username')
    expect(validateUsername('a b')).toBe('invalid_username')
  })

  it('USERNAME_PATTERN 1–39 边界（与后端同规则）', () => {
    expect(USERNAME_PATTERN.test('a'.repeat(39))).toBe(true)
    expect(USERNAME_PATTERN.test('a'.repeat(40))).toBe(false)
    expect(USERNAME_PATTERN.test('ab-cd')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  MAX_TARGET_LENGTH,
  isExternalHref,
  normalizeKind,
  parseTarget,
  toInterstitial,
  toInterstitialIfExternal
} from './externalLink'

const ORIGIN = 'https://crearte.yoresee.cc'

describe('isExternalHref', () => {
  it('跨域 http(s) 视为外链', () => {
    expect(isExternalHref('https://play2048.co/', ORIGIN)).toBe(true)
    expect(isExternalHref('http://example.com/a/b?x=1#h', ORIGIN)).toBe(true)
  })

  it('同源绝对地址不算外链', () => {
    expect(isExternalHref(`${ORIGIN}/games/2048`, ORIGIN)).toBe(false)
    expect(isExternalHref(ORIGIN, ORIGIN)).toBe(false)
  })

  it('站内路径、相对路径、锚点与空值不算外链', () => {
    expect(isExternalHref('/games/x', ORIGIN)).toBe(false)
    expect(isExternalHref('./x', ORIGIN)).toBe(false)
    expect(isExternalHref('#toc', ORIGIN)).toBe(false)
    expect(isExternalHref('', ORIGIN)).toBe(false)
    expect(isExternalHref(null, ORIGIN)).toBe(false)
    expect(isExternalHref(undefined, ORIGIN)).toBe(false)
  })

  it('mailto/tel 不算外链', () => {
    expect(isExternalHref('mailto:xingfen.fendy@outlook.com', ORIGIN)).toBe(false)
    expect(isExternalHref('tel:+8613800000000', ORIGIN)).toBe(false)
  })

  it('协议相对地址算外链', () => {
    expect(isExternalHref('//evil.com/x', ORIGIN)).toBe(true)
  })

  it('解析不了的串不算外链', () => {
    expect(isExternalHref('http://[', ORIGIN)).toBe(false)
  })
})

describe('toInterstitial', () => {
  it('kind 缺省为 link，目标完整编码', () => {
    expect(toInterstitial('https://example.com/a?b=1&c=2#d')).toBe(
      '/out?kind=link&to=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2%23d'
    )
  })

  it('kind=game 原样保留', () => {
    expect(toInterstitial('https://example.com/', 'game')).toBe(
      '/out?kind=game&to=https%3A%2F%2Fexample.com%2F'
    )
  })

  it('中文与空格按 UTF-8 百分号编码', () => {
    expect(toInterstitial('https://example.com/搜 索')).toBe(
      '/out?kind=link&to=https%3A%2F%2Fexample.com%2F%E6%90%9C%20%E7%B4%A2'
    )
  })
})

describe('toInterstitialIfExternal', () => {
  it('跨域 http(s) 套中间页，kind 可显式指定', () => {
    expect(toInterstitialIfExternal('https://example.com/a', ORIGIN)).toBe(
      '/out?kind=link&to=https%3A%2F%2Fexample.com%2Fa'
    )
    expect(toInterstitialIfExternal('http://example.com/a', ORIGIN, 'game')).toBe(
      '/out?kind=game&to=http%3A%2F%2Fexample.com%2Fa'
    )
  })

  it('同源绝对地址原样返回，不套中间页', () => {
    expect(toInterstitialIfExternal(`${ORIGIN}/games/2048`, ORIGIN)).toBe(
      `${ORIGIN}/games/2048`
    )
  })

  it('mailto/tel 原样返回', () => {
    expect(toInterstitialIfExternal('mailto:test@example.com', ORIGIN)).toBe(
      'mailto:test@example.com'
    )
    expect(toInterstitialIfExternal('tel:+8613800000000', ORIGIN)).toBe('tel:+8613800000000')
  })

  it('相对路径、站内路径与锚点原样返回', () => {
    expect(toInterstitialIfExternal('/games/2048', ORIGIN)).toBe('/games/2048')
    expect(toInterstitialIfExternal('./x', ORIGIN)).toBe('./x')
    expect(toInterstitialIfExternal('#toc', ORIGIN)).toBe('#toc')
  })

  it('空串原样返回空串', () => {
    expect(toInterstitialIfExternal('', ORIGIN)).toBe('')
  })
})

describe('normalizeKind', () => {
  it('只认 game，其余一律归 link', () => {
    expect(normalizeKind('game')).toBe('game')
    expect(normalizeKind('link')).toBe('link')
    expect(normalizeKind('GAME')).toBe('link')
    expect(normalizeKind('')).toBe('link')
    expect(normalizeKind(null)).toBe('link')
    expect(normalizeKind(undefined)).toBe('link')
  })
})

describe('parseTarget', () => {
  it('http/https 绝对地址通过，host 含端口', () => {
    expect(parseTarget('https://example.com:8443/x?y=1', ORIGIN)).toEqual({
      status: 'external',
      url: 'https://example.com:8443/x?y=1',
      host: 'example.com:8443'
    })
  })

  it('IDN host 归一为 punycode', () => {
    expect(parseTarget('https://例え.jp/ゲーム', ORIGIN)).toEqual({
      status: 'external',
      url: 'https://xn--r8jz45g.jp/%E3%82%B2%E3%83%BC%E3%83%A0',
      host: 'xn--r8jz45g.jp'
    })
  })

  it('同源目标返回站内直接导航', () => {
    expect(parseTarget(`${ORIGIN}/games/2048?x=1#h`, ORIGIN)).toEqual({
      status: 'same-origin',
      href: '/games/2048?x=1#h'
    })
  })

  it('拒绝危险协议、相对路径与空值', () => {
    expect(parseTarget('javascript:alert(1)', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('data:text/html,<b>x</b>', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('file:///etc/passwd', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('blob:https://example.com/1', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('/games/2048', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget(null, ORIGIN)).toEqual({ status: 'invalid' })
  })

  it('协议相对地址在中间页一律判无效（安全侧失败）', () => {
    expect(isExternalHref('//evil.com/x', ORIGIN)).toBe(true)
    expect(parseTarget('//evil.com/x', ORIGIN)).toEqual({ status: 'invalid' })
  })

  it('超长目标视为无效，边界值仍然通过', () => {
    const prefix = 'https://example.com/'
    expect(parseTarget(prefix + 'a'.repeat(MAX_TARGET_LENGTH), ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget(prefix + 'a'.repeat(MAX_TARGET_LENGTH - prefix.length), ORIGIN).status).toBe(
      'external'
    )
  })
})

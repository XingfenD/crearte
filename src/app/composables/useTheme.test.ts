// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_KEY,
  __resetTheme,
  applyTheme,
  effectiveTheme,
  readStoredTheme,
  systemTheme,
  useTheme
} from './useTheme'

// P13-T4 / D-J：主题状态模型。模块级单例 → 每个用例前后 __resetTheme()
//（P9-B D-I 教训：useToast 的同类单例不复位会跨测试污染）。
// matchMedia 与 localStorage 都用 stub 控制，不依赖宿主环境的系统偏好。
// index.html 内联 pre-paint 脚本的一致性钉桩在 app/lib/themeBootstrap.test.ts
//（node 环境读盘；happy-dom 的 import.meta.url 非 file: 协议，无法 fileURLToPath）。

/** 让 matchMedia('(prefers-color-scheme: dark)') 返回指定值。 */
function stubSystem(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  stubSystem(false)
  __resetTheme()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('useTheme 初始主题（stored → system → light，D-J）', () => {
  it('stored=dark → 初始 dark（即使系统偏好亮色）', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    stubSystem(false)
    __resetTheme()
    expect(useTheme().theme.value).toBe('dark')
  })

  it('stored=light → 初始 light（即使系统偏好暗色）', () => {
    localStorage.setItem(THEME_KEY, 'light')
    stubSystem(true)
    __resetTheme()
    expect(useTheme().theme.value).toBe('light')
  })

  it('stored 缺失 → 跟随 matchMedia（系统暗 → dark）', () => {
    stubSystem(true)
    __resetTheme()
    expect(readStoredTheme()).toBeNull()
    expect(useTheme().theme.value).toBe('dark')
  })

  it('stored 缺失 + 系统亮 → light', () => {
    stubSystem(false)
    __resetTheme()
    expect(useTheme().theme.value).toBe('light')
  })

  it('stored 为垃圾值（neon）→ 视为缺失、跟随系统', () => {
    localStorage.setItem(THEME_KEY, 'neon')
    stubSystem(true)
    __resetTheme()
    expect(readStoredTheme()).toBeNull()
    expect(useTheme().theme.value).toBe('dark')
  })

  it('matchMedia 不存在 → 回落 light，不抛错', () => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', undefined)
    expect(() => __resetTheme()).not.toThrow()
    expect(systemTheme()).toBe('light')
    expect(useTheme().theme.value).toBe('light')
  })

  it('matchMedia 抛错（部分隐私模式）→ 回落 light，不抛错', () => {
    localStorage.clear()
    vi.stubGlobal('matchMedia', () => {
      throw new Error('denied')
    })
    expect(() => __resetTheme()).not.toThrow()
    expect(useTheme().theme.value).toBe('light')
  })

  it('localStorage.getItem 抛错 → readStoredTheme 返回 null（静默降级）', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readStoredTheme()).toBeNull()
    stubSystem(true)
    expect(effectiveTheme()).toBe('dark')
  })
})

describe('useTheme toggle（D-J）', () => {
  it('翻转主题并写入 localStorage', () => {
    stubSystem(false)
    __resetTheme()
    const { theme, toggle } = useTheme()
    expect(theme.value).toBe('light')
    toggle()
    expect(theme.value).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    toggle()
    expect(theme.value).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('同步 <html data-theme> 与 meta[name=theme-color]', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#F7F2E7')
    document.head.appendChild(meta)

    const { theme, toggle } = useTheme()
    expect(theme.value).toBe('light')
    toggle()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(meta.getAttribute('content')).toBe('#17140f')

    toggle()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(meta.getAttribute('content')).toBe('#f7f2e7')
    meta.remove()
  })

  it('meta 不存在时 applyTheme 不抛错，data-theme 仍落地', () => {
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('localStorage.setItem 抛错（配额/隐私模式）→ 静默，主题本次会话内仍生效', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { theme, toggle } = useTheme()
    expect(theme.value).toBe('light')

    expect(() => toggle()).not.toThrow()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('useTheme isExplicit（供 aria-label 措辞与测试，D-J）', () => {
  it('未点击过（stored 缺失）→ false', () => {
    stubSystem(true)
    __resetTheme()
    expect(useTheme().isExplicit()).toBe(false)
  })

  it('点击后（stored 写入）→ true', () => {
    const { toggle, isExplicit } = useTheme()
    expect(isExplicit()).toBe(false)
    toggle()
    expect(isExplicit()).toBe(true)
  })
})

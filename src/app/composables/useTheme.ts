import { ref, type Ref } from 'vue'

// P13-T4 / D-J：主题状态模型 = 两态（light ↔ dark）。
// 首次访问跟随 prefers-color-scheme；用户显式点击后持久化到 localStorage['crearte.theme.v1']。
// localStorage 容错沿用 app/lib/recent.ts 范式（配额/隐私模式写失败静默、损坏值读回默认）。
//
// 有意不做（spec §4 边界，登记为打磨批候选）：
// - 第三态「恢复跟随系统」：header 在 @320px 最坏格无像素容纳带标签控件（spike 3）；
//   三态循环在 32px 无标签图标按钮上不可发现。
// - matchMedia 的 change 监听：用户已显式选择后系统切换不应覆盖；未显式选择时
//   刷新即跟随（首屏由 index.html 内联脚本判定）。

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'crearte.theme.v1'

/** 读持久化选择；缺失或损坏 → null（表示「跟随系统」）。 */
export function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** 系统偏好；不支持 matchMedia 的环境（含 happy-dom 部分场景）→ 'light'。 */
export function systemTheme(): Theme {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

/** 有效主题 = stored → system → light。index.html 内联 pre-paint 脚本（D-K）
 *  的判定优先级与此**逐字一致**（useTheme.test.ts 有源码级钉桩），改一处必须改另一处。 */
export function effectiveTheme(): Theme {
  return readStoredTheme() ?? systemTheme()
}

/** 把主题落到 <html data-theme> 与 theme-color meta（D-K 的内联脚本做首屏，本函数做后续切换）。 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17140f' : '#f7f2e7')
}

// 模块级单例（与 useToast 同范式）。⚠️ P9-B D-I 教训：单例须配 __resetTheme() 供测试隔离。
const theme: Ref<Theme> = ref(effectiveTheme())

export function useTheme() {
  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, theme.value)
    } catch {
      /* 配额/隐私模式：静默，主题本次会话内仍生效 */
    }
    applyTheme(theme.value)
  }
  /** 当前是否为用户显式选择（false = 仍在跟随系统）。供 aria-label 措辞与测试用。 */
  const isExplicit = (): boolean => readStoredTheme() !== null
  return { theme, toggle, isExplicit }
}

// 测试隔离用（仅测试导入）：按 stored/system 重算，不清 localStorage——
// 用例自行决定要不要预置 THEME_KEY（与 __resetToasts 的「恢复初始态」语义一致）。
export function __resetTheme(): void {
  theme.value = effectiveTheme()
}

import type { FeatureFlags } from '@/data/types'

/** 提交表单 / admin 可操作的 CSP 开关全集（与后端 service/validate.go featureKeys 同一份七键集）。
 *  默认全 false：「默认值已覆盖绝大多数作品」，仅当作品代码确需时按需放宽。 */
export interface EditableFeatures {
  eval: boolean
  inlineScript: boolean
  inlineStyle: boolean
  wasm: boolean
  coop: boolean
  fullscreen: boolean
  gamepad: boolean
}

export const EMPTY_FEATURES: EditableFeatures = {
  eval: false, inlineScript: false, inlineStyle: false, wasm: false, coop: false, fullscreen: false, gamepad: false
}

export const FEATURE_ITEMS: ReadonlyArray<{ key: keyof EditableFeatures; label: string; hint: string }> = [
  { key: 'eval', label: '允许 eval / new Function', hint: 'Alpine.js、Vue 完整版等框架运行时编译表达式需要；仅当作品代码确需时开启' },
  { key: 'inlineScript', label: '允许内联 <script>', hint: '单文件 HTML 作品需要；可改用外部 .js 文件则更安全' },
  { key: 'inlineStyle', label: '允许内联样式 <style> / style 属性', hint: '单文件 HTML、静态站生成器导出常把 CSS 内联进页面；能拆成外部 .css 就优先拆，可拆时不要开，减少可注入面' },
  { key: 'wasm', label: '允许 WebAssembly', hint: 'Emscripten / Rust / Unity WebGL 等编译到 wasm 的作品需要；放宽的是脚本侧 wasm 编译执行，纯 JS 作品无需开启' },
  { key: 'coop', label: '允许跨源隔离（COOP/COEP）', hint: '需要 SharedArrayBuffer、高精度计时器或 wasm 多线程的作品才开；开启后页面进入跨源隔离，会拦掉未带 CORP 头的第三方资源（外链图片、字体、CDN 脚本），不用则不要开' },
  { key: 'fullscreen', label: '允许全屏', hint: '有「进入全屏」沉浸体验的作品开启，站内播放容器据此放行全屏权限；不需要全屏时保持关闭' },
  { key: 'gamepad', label: '允许游戏手柄', hint: '用 Gamepad API 读手柄输入的动作类作品开启；只走键盘 / 触屏的作品无需开启' }
]

/** 表单勾选态 → WorkPayload.features。
 *  七个键总是存在：显式空对象 = 明确不放宽（后端据此区分「旧提交无此键→保留原值」）。 */
export function collectFeatures(form: EditableFeatures): FeatureFlags {
  return {
    eval: form.eval,
    inlineScript: form.inlineScript,
    inlineStyle: form.inlineStyle,
    wasm: form.wasm,
    coop: form.coop,
    fullscreen: form.fullscreen,
    gamepad: form.gamepad
  }
}

/** payload / 作品详情的 features → 表单勾选态（缺省 false，向后兼容历史数据） */
export function featuresToForm(features: FeatureFlags | undefined): EditableFeatures {
  return {
    eval: features?.eval ?? false,
    inlineScript: features?.inlineScript ?? false,
    inlineStyle: features?.inlineStyle ?? false,
    wasm: features?.wasm ?? false,
    coop: features?.coop ?? false,
    fullscreen: features?.fullscreen ?? false,
    gamepad: features?.gamepad ?? false
  }
}

/** 是否有任何开关打开（admin 只读展示的空态判断用） */
export function hasAnyFeature(features: FeatureFlags | undefined): boolean {
  return Boolean(
    features?.eval || features?.inlineScript || features?.inlineStyle ||
    features?.wasm || features?.coop || features?.fullscreen || features?.gamepad
  )
}

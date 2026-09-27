import type { FeatureFlags } from '@/data/types'

/** 提交表单 / admin 可操作的 CSP 开关子集。
 *  其余 flag（inlineStyle/wasm/coop/fullscreen/gamepad）schema 与后端均已支持，
 *  但 UI 暂不开放（YAGNI）：默认值已覆盖绝大多数作品，按需再添。 */
export interface EditableFeatures {
  eval: boolean
  inlineScript: boolean
}

export const EMPTY_FEATURES: EditableFeatures = { eval: false, inlineScript: false }

export const FEATURE_ITEMS: ReadonlyArray<{ key: keyof EditableFeatures; label: string; hint: string }> = [
  { key: 'eval', label: '允许 eval / new Function', hint: 'Alpine.js、Vue 完整版等框架运行时编译表达式需要；仅当作品代码确需时开启' },
  { key: 'inlineScript', label: '允许内联 <script>', hint: '单文件 HTML 作品需要；可改用外部 .js 文件则更安全' }
]

/** 表单勾选态 → WorkPayload.features。
 *  两个键总是存在：显式空对象 = 明确不放宽（后端据此区分「旧提交无此键→保留原值」）。 */
export function collectFeatures(form: EditableFeatures): FeatureFlags {
  return { eval: form.eval, inlineScript: form.inlineScript }
}

/** payload / 作品详情的 features → 表单勾选态（缺省 false，向后兼容历史数据） */
export function featuresToForm(features: FeatureFlags | undefined): EditableFeatures {
  return { eval: features?.eval ?? false, inlineScript: features?.inlineScript ?? false }
}

/** 是否有任何开关打开（admin 只读展示的空态判断用） */
export function hasAnyFeature(features: FeatureFlags | undefined): boolean {
  return Boolean(features?.eval || features?.inlineScript)
}

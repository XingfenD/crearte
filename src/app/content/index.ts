import { session } from '@/auth'
import { createContentClient, toAbsoluteApiUrl, type ContentClient } from './client'
import { ContentApiError } from './errors'

export * from './client'
export * from './errors'
export * from './preview'
export * from './types'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

// apiBase 为空（noauth 部署）时所有调用直接失败：路由守卫已挡住页面入口，这里只是兜底
// ⚠️ then/symbol 必须返回 undefined：否则 `await contentClient` 会把 get 陷阱给出的函数当
// thenable 调用，回调永不触发 → 永久挂起（Vue 的 reactive/console.log 也会读 symbol 属性）
const disabledClient: ContentClient = new Proxy({} as ContentClient, {
  get: (_target, prop) =>
    prop === 'then' || typeof prop === 'symbol'
      ? undefined
      : () => Promise.reject(new ContentApiError(0, 'network', '内容 API 未启用'))
})

export const contentClient: ContentClient = apiBase
  ? createContentClient({
      baseUrl: apiBase,
      getToken: () => session.getToken(),
      onUnauthorized: () => session.invalidate()
    })
  : disabledClient

/** API 路径 → 绝对 URL（预览链路专用：SW 在游玩子域发起跨源请求，见 client.ts 说明） */
export function apiUrl(path: string): string {
  return toAbsoluteApiUrl(apiBase, path)
}

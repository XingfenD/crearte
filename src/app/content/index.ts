import { session } from '@/auth'
import { createContentClient, type ContentClient } from './client'
import { ContentApiError } from './errors'

export * from './client'
export * from './errors'
export * from './types'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

// apiBase 为空（noauth 部署）时所有调用直接失败：路由守卫已挡住页面入口，这里只是兜底
const disabledClient: ContentClient = new Proxy({} as ContentClient, {
  get: () => () => Promise.reject(new ContentApiError(0, 'network', '内容 API 未启用'))
})

export const contentClient: ContentClient = apiBase
  ? createContentClient({
      baseUrl: apiBase,
      getToken: () => session.getToken(),
      onUnauthorized: () => session.invalidate()
    })
  : disabledClient

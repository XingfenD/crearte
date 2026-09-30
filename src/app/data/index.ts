import { session } from '@/auth'
import { ApiContentRepository } from './apiRepo'
import { MergeContentRepository } from './mergeRepo'
import type { ContentRepository } from './repository'
import { StaticContentRepository } from './staticRepo'

export * from './repository'
export * from './types'

const staticRepo = new StaticContentRepository()
// 与 auth 模块同一语义：'' = 无后端（noauth）；'/' = 同源反代（compose dev/prod）；绝对基址 = 跨域 API。
// 判空必须用去空白后的原值——'/' 剥掉尾斜杠是空串，但它不是「无后端」
const rawApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
const apiBase = rawApiBase.replace(/\/+$/, '')

// 双源装配：VITE_API_BASE_URL 为空（noauth 部署）→ 纯静态；非空 → 并集合并（spec §3）
// 管理面三端点需 Bearer（P7）：token 从 session 取，与 contentClient 同一来源。
// 模块依赖安全：auth/index.ts 不反向引用 data 模块。
export const apiRepo: ApiContentRepository | null = rawApiBase !== ''
  ? new ApiContentRepository(apiBase, staticRepo, () => session.getToken())
  : null
export const repo: ContentRepository = apiRepo
  ? new MergeContentRepository(apiRepo, staticRepo)
  : staticRepo

import { ApiContentRepository } from './apiRepo'
import { MergeContentRepository } from './mergeRepo'
import type { ContentRepository } from './repository'
import { StaticContentRepository } from './staticRepo'

export * from './repository'
export * from './types'

const staticRepo = new StaticContentRepository()
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

// 双源装配：VITE_API_BASE_URL 为空（noauth 部署）→ 纯静态；非空 → 并集合并（spec §3）
export const apiRepo: ApiContentRepository | null = apiBase
  ? new ApiContentRepository(apiBase, staticRepo)
  : null
export const repo: ContentRepository = apiRepo
  ? new MergeContentRepository(apiRepo, staticRepo)
  : staticRepo

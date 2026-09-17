import type { ContentRepository } from './repository'
import { StaticContentRepository } from './staticRepo'

export * from './repository'
export * from './types'

// 未来接入后端：实现 ApiRepository 后仅替换这里的单例
export const repo: ContentRepository = new StaticContentRepository()

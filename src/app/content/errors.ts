import { AuthApiError, toUserMessage as authMessage } from '@/auth/errors'

export type ContentErrorCode =
  | 'invalid_request'
  | 'conflict'
  | 'not_found'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'internal'
  | 'network'

export const CONTENT_ERROR_MESSAGES: Record<ContentErrorCode, string> = {
  invalid_request: '提交内容格式不正确，请检查表单',
  conflict: '状态冲突：内容已存在或提交状态已变化，请刷新后重试',
  not_found: '内容不存在，可能已被删除',
  payload_too_large: '文件超过上限（bundle 100MB / 封面 5MB）',
  unsupported_media_type: '文件类型不支持（bundle 需 zip；封面需 png/jpeg/webp）',
  rate_limited: '操作太频繁，请稍后重试',
  unauthorized: '登录已过期，请重新登录',
  forbidden: '需要管理员权限',
  internal: '服务暂时不可用，请稍后重试',
  network: '网络连接失败，请检查网络后重试'
}

const KNOWN_CODES = new Set<string>(Object.keys(CONTENT_ERROR_MESSAGES))

export function toContentErrorCode(value: unknown): ContentErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value) ? (value as ContentErrorCode) : 'internal'
}

export class ContentApiError extends Error {
  readonly status: number
  readonly code: ContentErrorCode
  readonly retryAfterSeconds: number | null
  /** invalid_request 时保留服务端字段级详情（`field: reason; ...`），UI 优先展示 */
  readonly details: string | null

  constructor(status: number, code: ContentErrorCode, message: string, retryAfterSeconds: number | null = null, details: string | null = null) {
    super(message)
    this.name = 'ContentApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.details = details
  }
}

export function toContentMessage(error: unknown): string {
  if (error instanceof ContentApiError) {
    if (error.code === 'invalid_request' && error.details) return error.details
    if (error.code === 'rate_limited' && error.retryAfterSeconds) {
      return `${CONTENT_ERROR_MESSAGES.rate_limited}（${error.retryAfterSeconds} 秒后）`
    }
    return CONTENT_ERROR_MESSAGES[error.code]
  }
  if (error instanceof AuthApiError) return authMessage(error)
  return error instanceof Error ? error.message : String(error)
}

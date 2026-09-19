export type AuthErrorCode =
  | 'invalid_request'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_display_name'
  | 'email_taken'
  | 'invalid_credentials'
  | 'unauthorized'
  | 'rate_limited'
  | 'internal'
  | 'network'

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_request: '请求格式不正确，请重试',
  invalid_email: '邮箱格式不正确',
  weak_password: '密码需 10–128 个字符',
  invalid_display_name: '昵称需 1–60 个字符，且不能含控制字符',
  email_taken: '该邮箱已注册，可直接登录',
  invalid_credentials: '邮箱或密码不正确',
  unauthorized: '登录已过期，请重新登录',
  rate_limited: '操作太频繁，请稍后重试',
  internal: '服务暂时不可用，请稍后重试',
  network: '网络连接失败，请检查网络后重试'
}

export class AuthApiError extends Error {
  readonly status: number
  readonly code: AuthErrorCode
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: AuthErrorCode, message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const KNOWN_CODES = new Set<string>(Object.keys(AUTH_ERROR_MESSAGES))

export function toErrorCode(value: unknown, fallback: AuthErrorCode = 'internal'): AuthErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value) ? (value as AuthErrorCode) : fallback
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.code === 'rate_limited' && error.retryAfterSeconds) {
      return `操作太频繁，请 ${error.retryAfterSeconds} 秒后重试`
    }
    return AUTH_ERROR_MESSAGES[error.code]
  }
  return AUTH_ERROR_MESSAGES.network
}

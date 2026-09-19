export const EMAIL_MAX_BYTES = 254
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128
export const DISPLAY_NAME_MAX = 60

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const CONTROL_PATTERN = /\p{Cc}/u

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function validateEmail(value: string): 'invalid_email' | null {
  const email = normalizeEmail(value)
  if (email === '' || new TextEncoder().encode(email).length > EMAIL_MAX_BYTES) return 'invalid_email'
  return EMAIL_PATTERN.test(email) ? null : 'invalid_email'
}

export function validatePassword(value: string): 'weak_password' | null {
  const length = [...value].length
  return length >= PASSWORD_MIN && length <= PASSWORD_MAX ? null : 'weak_password'
}

export function validateDisplayName(value: string): 'invalid_display_name' | null {
  const name = value.trim()
  if (name === '' || [...name].length > DISPLAY_NAME_MAX) return 'invalid_display_name'
  return CONTROL_PATTERN.test(name) ? 'invalid_display_name' : null
}

export function sanitizeNext(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.includes('\\') || CONTROL_PATTERN.test(value)) return '/'
  return value
}

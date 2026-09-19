export type UserRole = 'user' | 'admin'

export interface AuthUser {
  id: string
  email: string
  display_name: string
  role: UserRole
}

export interface Session {
  token: string
  expiresAt: string
  user: AuthUser
}

export interface AuthResponse {
  token: string
  expires_at: string
  user: AuthUser
}

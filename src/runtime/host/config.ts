export interface RuntimeConfig {
  baseDomain: string
  hostOrigin: string
  apiBase: string
}

export function runtimeConfig(): RuntimeConfig {
  return {
    baseDomain: import.meta.env.VITE_GAMES_BASE_DOMAIN ?? 'games.example.com',
    hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com',
    // API 基址（与 app/auth 同一 env）：空 = 同源。用于拼 bundle-key 绝对 URL
    apiBase: import.meta.env.VITE_API_BASE_URL ?? ''
  }
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function derivePlayOrigin(id: string, baseDomain: string, protocol: string): string {
  if (!LABEL.test(id)) throw new Error(`非法的作品 id: ${id}`)
  return `${protocol}//${id}.${baseDomain}`
}

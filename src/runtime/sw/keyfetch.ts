// bundle-key 端点取钥：429 退避重试（Retry-After 优先），其余非 2xx 立即失败。
// 错误消息只含状态码，绝不含 key 材料。
import { parseKeyResponse, type BundleKeyMaterial } from './crypto'

export interface FetchKeyOptions {
  token?: string
  /** 429 时最多重试次数（不含首次请求） */
  maxRetries?: number
  /** 仅供测试注入；生产为 setTimeout promise */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fetchBundleKey(url: string, opts: FetchKeyOptions = {}): Promise<BundleKeyMaterial> {
  const maxRetries = opts.maxRetries ?? 3
  const sleep = opts.sleep ?? defaultSleep
  const headers: Record<string, string> = { 'Cache-Control': 'no-cache' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let backoff = 0
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, { headers, cache: 'no-store' })
    } catch {
      throw new Error('bundle-key 网络错误')
    }
    if (response.ok) return parseKeyResponse(await response.text())
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'))
      let delay: number
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        delay = Math.round(retryAfter * 1000)
      } else {
        delay = 1000 * 2 ** backoff
        backoff++
      }
      await sleep(delay)
      continue
    }
    throw new Error(`bundle-key 获取失败: HTTP ${response.status}`)
  }
}

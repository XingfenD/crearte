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
  // ⚠️ 不要在这里设 `Cache-Control: no-cache` 请求头：它不是 CORS 安全列表头，跳源部署下
  // 会触发预检，而后端 ACAH 只有 `Authorization, Content-Type` → 预检失败 → 取钥 GET 被拦
  // （实测 `GET -1`，bundle 装不上、作品不可玩）。防缓存由下面的 `cache: 'no-store'` 保证
  // （严于 no-store：浏览器不存也不重验，故也不会发 If-None-Match）。
  const headers: Record<string, string> = {}
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

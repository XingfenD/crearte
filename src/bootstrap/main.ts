import { isPartialFeatures, isShellMessage, type FeatureFlags, type ShellMessage } from '../runtime/bridge/protocol'

const params = new URLSearchParams(location.hash.replace(/^#/, ''))
const version = params.get('v') ?? ''
const token = params.get('t') ?? ''

const progress = document.getElementById('progress') as HTMLProgressElement
const status = document.getElementById('status') as HTMLParagraphElement
const errorBox = document.getElementById('error') as HTMLDivElement
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement
const errorDetail = document.getElementById('error-detail') as HTMLPreElement
const retry = document.getElementById('retry') as HTMLButtonElement

function fail(message: string, detail?: string): void {
  errorBox.hidden = false
  errorMessage.textContent = message
  if (detail) { errorDetail.hidden = false; errorDetail.textContent = detail }
  signalDegrade(detail ? `${message}: ${detail}` : message)
}

const hostOrigin = import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com'
const BOOTSTRAP_TIMEOUT_MS = 45_000
let settleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
  fail('准备超时')
}, BOOTSTRAP_TIMEOUT_MS)

function signalDegrade(message: string): void {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  window.parent.postMessage({ type: 'runtime:degrade', message }, hostOrigin)
}

retry.addEventListener('click', () => location.reload())

function handle(message: ShellMessage): void {
  if (message.type === 'runtime:progress') {
    progress.value = message.total > 0 ? Math.min(100, Math.round((message.received / message.total) * 100)) : 0
    status.textContent = `下载资产 ${formatBytes(message.received)}`
  } else if (message.type === 'runtime:ready') {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
    status.textContent = '启动中…'
    void navigator.storage?.persist?.().catch(() => {})
    void navigator.storage?.estimate?.().then(({ usage }) => {
      if (usage && usage > 0) status.textContent = `启动中…（已用存储 ${Math.round(usage / 1024 / 1024)} MiB）`
    }).catch(() => {})
    location.replace('/')
  } else if (message.type === 'runtime:error') {
    fail('运行环境准备失败', message.message)
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(1)} MiB`
}

function parseFeatures(raw: string | null): Partial<FeatureFlags> | undefined {
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPartialFeatures(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

async function main(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    fail('当前浏览器不支持 Service Worker，无法站内运行')
    return
  }
  const gameId = params.get('id') ?? location.hostname.split('.')[0]
  const bundleUrl = params.get('bundle') ?? ''
  const sha256 = params.get('sha') ?? ''
  const entry = params.get('entry') ?? 'index.html'
  const rawFeatures = params.get('features')
  const features = parseFeatures(rawFeatures)
  if (!version || !bundleUrl || !sha256) {
    fail('启动参数不完整', location.href)
    return
  }
  if (rawFeatures !== null && !features) {
    fail('启动参数不完整', `features 参数无效: ${rawFeatures}`)
    return
  }
  // Service Worker 的 client.postMessage 只派发到 container，不会派发到 window
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (isShellMessage(event.data)) handle(event.data)
  })
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const target = registration.active ?? registration.waiting ?? registration.installing
    if (!target) throw new Error('Service Worker 未激活')
    target.postMessage({
      type: 'runtime:install',
      id: gameId,
      version,
      entry,
      bundleUrl,
      sha256,
      ...(token ? { token } : {}),
      ...(features ? { features } : {}),
      hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com'
    })
    status.textContent = '下载资产…'
  } catch (error) {
    fail('Service Worker 注册失败', error instanceof Error ? error.message : String(error))
  }
}

void main()

import { computed, ref, type Ref } from 'vue'
import { HELLO_TIMEOUT_MS, PROTOCOL_VERSION, isGameEvent, isHostCommand, isShellSignal, type FeatureFlags, type GameEvent, type HostCommand } from '../bridge/protocol'
import type { RuntimeTarget } from './adapters'

const BOOTSTRAP_TIMEOUT_MS = 60_000
const BRIDGE_WARN_MS = 3_000

export type GameFramePhase = 'booting' | 'ready' | 'degraded' | 'error'
export interface GameFrameState {
  phase: GameFramePhase
  progress: number | null
  error: string | null
  paused: boolean
  score: number | null
  storageKeys: number | null
  storageBytes: number | null
}

export interface GameFrameOptions {
  targets: () => RuntimeTarget[]
  features: () => FeatureFlags
  hostOrigin: string
  onExternal: (url: string) => void
  onEvent?: (event: GameEvent) => void
}

export function useGameFrame(options: GameFrameOptions) {
  const iframeRef: Ref<HTMLIFrameElement | null> = ref(null)
  const targetIndex = ref(0)
  const state = ref<GameFrameState>({ phase: 'booting', progress: null, error: null, paused: false, score: null, storageKeys: null, storageBytes: null })
  let port: MessagePort | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null
  let bridgeWarn: ReturnType<typeof setTimeout> | null = null

  const target = computed(() => options.targets()[targetIndex.value] ?? null)
  const sandbox = 'allow-scripts allow-same-origin allow-pointer-lock'
  const allow = computed(() => {
    const parts = ['fullscreen', 'autoplay']
    if (options.features().gamepad) parts.push('gamepad')
    return parts.join('; ')
  })

  function attach(element: HTMLIFrameElement): void {
    iframeRef.value = element
  }

  function start(): void {
    state.value = { phase: 'booting', progress: null, error: null, paused: false, score: null, storageKeys: null, storageBytes: null }
    targetIndex.value = 0
    const current = target.value
    if (!current) { state.value.phase = 'error'; state.value.error = '没有可用的运行目标'; return }
    if (current.mode === 'virtual') armTimeout(BOOTSTRAP_TIMEOUT_MS)
    else {
      state.value.phase = 'ready'
      if (current.mode === 'hosted') armBridgeWarn(current.url)
    }
  }

  function armBridgeWarn(url: string): void {
    clearBridgeWarn()
    bridgeWarn = setTimeout(() => {
      bridgeWarn = null
      console.warn(`[game-runtime] hosted 目标 ${url} 在 3s 内未收到 agent:boot，桥不可用；游戏仍可继续游玩`)
    }, BRIDGE_WARN_MS)
  }

  function clearBridgeWarn(): void {
    if (bridgeWarn) { globalThis.clearTimeout(bridgeWarn); bridgeWarn = null }
  }

  function armTimeout(ms: number): void {
    clearTimeout()
    timeout = setTimeout(() => {
      if (state.value.phase === 'booting') degrade('运行环境准备超时')
    }, ms)
  }

  function clearTimeout(): void {
    if (timeout) { globalThis.clearTimeout(timeout); timeout = null }
  }

  function onMessage(event: MessageEvent): void {
    const current = target.value
    if (!current || !current.origin) return
    if (event.origin !== current.origin) return
    if (event.source !== iframeRef.value?.contentWindow) return
    if (isShellSignal(event.data)) { degrade(event.data.message); return }
    if (event.data?.type === 'agent:boot' && isGameEvent(event.data)) {
      clearBridgeWarn()
      armTimeout(HELLO_TIMEOUT_MS)
      const channel = new MessageChannel()
      port = channel.port1
      port.onmessage = (message) => { if (isGameEvent(message.data)) handleEvent(message.data) }
      port.start()
      // protocol 的 host:hello 类型未声明 port（宿主运行时附加字段），此处以扩展字段类型发送
      const hello: HostCommand & { port: MessagePort } = {
        type: 'host:hello', v: PROTOCOL_VERSION, locale: navigator.language, capabilities: { save: true, score: true }, port: channel.port2
      }
      iframeRef.value?.contentWindow?.postMessage(hello, current.origin, [channel.port2])
      return
    }
  }

  function handleEvent(event: GameEvent): void {
    options.onEvent?.(event)
    // 崩溃后可能还会收到排队的 game:ready（文档仍会 load），不能让 error 面板被顶掉
    if (event.type === 'agent:hello-ack') { clearTimeout(); clearBridgeWarn(); if (state.value.phase !== 'error') state.value.phase = 'ready' }
    else if (event.type === 'game:ready') { clearTimeout(); clearBridgeWarn(); if (state.value.phase !== 'error') state.value.phase = 'ready' }
    else if (event.type === 'game:error') {
      clearTimeout()
      clearBridgeWarn()
      state.value.phase = 'error'
      state.value.error = event.message
    }
    else if (event.type === 'game:score') { state.value.score = event.score }
    else if (event.type === 'game:storage-changed') { state.value.storageKeys = event.keys; state.value.storageBytes = event.bytes }
    else if (event.type === 'game:exit-request') { options.onExternal('__exit__') }
  }

  function send(command: HostCommand): void {
    const current = target.value
    if (!port || !current?.origin) return
    port.postMessage(command)
  }

  function pause(): void { send({ type: 'host:pause' }); state.value.paused = true }
  function resume(): void { send({ type: 'host:resume' }); state.value.paused = false }
  function clearSave(): void {
    send({ type: 'host:clear-save' })
    state.value.storageKeys = 0
    state.value.storageBytes = 0
  }
  function requestSnapshot(id: string): void { send({ type: 'host:snapshot-request', id }) }

  function degrade(reason: string): void {
    clearTimeout()
    clearBridgeWarn()
    const next = targetIndex.value + 1
    const chain = options.targets()
    if (next < chain.length && chain[next].mode === 'external') {
      state.value.phase = 'degraded'
      state.value.error = reason
      options.onExternal(chain[next].url)
      return
    }
    if (next < chain.length) {
      targetIndex.value = next
      state.value.phase = chain[next].mode === 'hosted' ? 'ready' : 'booting'
      state.value.error = null
      if (chain[next].mode === 'virtual') armTimeout(BOOTSTRAP_TIMEOUT_MS)
      if (chain[next].mode === 'hosted') armBridgeWarn(chain[next].url)
      return
    }
    state.value.phase = 'error'
    state.value.error = reason
  }

  function stop(): void {
    clearTimeout()
    clearBridgeWarn()
    port?.close()
    port = null
  }

  return { iframeRef, attach, onMessage, target, state, sandbox, allow, start, stop, pause, resume, clearSave, requestSnapshot, degrade, send }
}

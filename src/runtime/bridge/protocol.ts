export const PROTOCOL_VERSION = 1
export const BRIDGE_CHANNEL = 'webgame-runtime'
export const HELLO_TIMEOUT_MS = 10_000
export const BRIDGE_PARAM = 'host'

export interface FeatureFlags {
  eval: boolean; inlineScript: boolean; inlineStyle: boolean; wasm: boolean
  coop: boolean; fullscreen: boolean; gamepad: boolean
}

export const DEFAULT_FEATURES: FeatureFlags = {
  eval: false, inlineScript: false, inlineStyle: true, wasm: true,
  coop: false, fullscreen: true, gamepad: false
}

export interface HostCapabilities { save: boolean; score: boolean }

export type HostCommand =
  | { type: 'host:hello'; v: number; locale: string; capabilities: HostCapabilities }
  | { type: 'host:pause' }
  | { type: 'host:resume' }
  | { type: 'host:snapshot-request'; id: string }
  | { type: 'host:clear-save' }
  | { type: 'host:update-available'; version: string }
  | { type: 'host:exit-ack' }

export type GameEvent =
  | { type: 'agent:boot'; v: number }
  | { type: 'agent:hello-ack'; v: number }
  | { type: 'agent:unsupported'; reason: string }
  | { type: 'game:ready'; ms: number }
  | { type: 'game:error'; message: string; source?: string }
  | { type: 'game:score'; score: number; meta?: unknown }
  | { type: 'game:exit-request' }
  | { type: 'game:storage-changed'; keys: number; bytes: number }
  | { type: 'game:snapshot'; id: string; data: string; bytes: number; truncated: boolean }

export type ShellMessage =
  | { type: 'runtime:install'; id: string; version: string; entry: string; bundleUrl: string; sha256: string; token?: string; hostOrigin: string; features?: Partial<FeatureFlags> }
  | { type: 'runtime:progress'; received: number; total: number }
  | { type: 'runtime:ready'; version: string }
  | { type: 'runtime:error'; message: string }

// shell → 宿主的降级信号（bundle 失败/准备超时时，Agent 尚未注入，桥还不存在）
export type ShellSignal = { type: 'runtime:degrade'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const FEATURE_KEYS: Record<keyof FeatureFlags, true> = {
  eval: true, inlineScript: true, inlineStyle: true, wasm: true, coop: true, fullscreen: true, gamepad: true
}

export function isPartialFeatures(value: unknown): value is Partial<FeatureFlags> {
  if (!isRecord(value) || Array.isArray(value)) return false
  return Object.entries(value).every(([key, flag]) => Object.hasOwn(FEATURE_KEYS, key) && typeof flag === 'boolean')
}

export function isHostCommand(value: unknown): value is HostCommand {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'host:hello':
      return value.v === PROTOCOL_VERSION && typeof value.locale === 'string' && isRecord(value.capabilities)
    case 'host:pause': case 'host:resume': case 'host:clear-save': case 'host:exit-ack':
      return true
    case 'host:snapshot-request':
      return typeof value.id === 'string'
    case 'host:update-available':
      return typeof value.version === 'string'
    default:
      return false
  }
}

export function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'agent:boot': case 'agent:hello-ack':
      return typeof value.v === 'number'
    case 'agent:unsupported':
      return typeof value.reason === 'string'
    case 'game:ready':
      return typeof value.ms === 'number'
    case 'game:error':
      return typeof value.message === 'string' && (value.source === undefined || typeof value.source === 'string')
    case 'game:score':
      return typeof value.score === 'number' && Number.isFinite(value.score)
    case 'game:exit-request':
      return true
    case 'game:storage-changed':
      return typeof value.keys === 'number' && typeof value.bytes === 'number'
    case 'game:snapshot':
      return typeof value.id === 'string' && typeof value.data === 'string' && typeof value.bytes === 'number' && typeof value.truncated === 'boolean'
    default:
      return false
  }
}

export function isShellSignal(value: unknown): value is ShellSignal {
  return isRecord(value) && value.type === 'runtime:degrade' && typeof value.message === 'string'
}

export function isShellMessage(value: unknown): value is ShellMessage {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'runtime:install':
      return typeof value.id === 'string' && typeof value.version === 'string' && typeof value.entry === 'string' &&
        typeof value.bundleUrl === 'string' && /^[0-9a-f]{64}$/.test(String(value.sha256)) &&
        typeof value.hostOrigin === 'string' && (value.token === undefined || typeof value.token === 'string') &&
        (value.features === undefined || isPartialFeatures(value.features))
    case 'runtime:progress':
      return typeof value.received === 'number' && typeof value.total === 'number'
    case 'runtime:ready':
      return typeof value.version === 'string'
    case 'runtime:error':
      return typeof value.message === 'string'
    default:
      return false
  }
}

import type { Game } from '../../app/data/types'
import { derivePlayOrigin, runtimeConfig } from './config'

export interface RuntimeTarget {
  mode: 'virtual' | 'hosted' | 'external'
  url: string
  origin: string | null
}

export function resolveRuntimeTargets(game: Game, opts: { baseDomain: string; protocol: string; config?: ReturnType<typeof runtimeConfig>; theme?: 'light' | 'dark' }): RuntimeTarget[] {
  const config = opts.config ?? runtimeConfig()
  const origin = game.runtime === 'virtual' || game.runtime === 'hosted'
    ? game.playOrigin ?? derivePlayOrigin(game.playSubdomain ?? '', opts.baseDomain, opts.protocol)
    : null
  const targets: RuntimeTarget[] = []
  if (game.runtime === 'virtual' && game.version && game.bundle) {
    const absoluteBundle = new URL(game.bundle.url, `${opts.protocol}//${opts.baseDomain}`).href
    const fragment: Record<string, string> = {
      v: game.version,
      id: game.id,
      entry: game.entry ?? 'index.html',
      bundle: absoluteBundle,
      sha: game.bundle.sha256
    }
    if (game.bundle.enc) {
      // 相对基址（'' 或 '/'，同源反代）不能作 URL base：落 location.origin；绝对基址直接用
      const absoluteApi = config.apiBase.startsWith('/') ? '' : config.apiBase
      const keyBase = absoluteApi || (typeof location !== 'undefined' ? location.origin : '')
      if (keyBase) {
        const keyUrl = new URL(`/api/games/${game.user}/${game.slug}/bundle-key`, keyBase)
        keyUrl.searchParams.set('version', game.version)
        fragment.kid = game.bundle.enc.kid
        fragment.key = keyUrl.href
      }
    }
    if (game.features && Object.keys(game.features).length > 0) fragment.features = JSON.stringify(game.features)
    // P15-B D-A：把加载屏的主题搭现有 hash 通道传给 bootstrap（bootstrap/main.ts:4 已在解析
    // hash）。游戏跑在独立子域，localStorage 按源隔离读不到主域的显式选择，故必须由父侧传入。
    // 键是**可选**的：不传就不写，external/hosted 模式的 url 与既有 virtual url 形态完全不变。
    if (opts.theme) fragment.theme = opts.theme
    const hash = new URLSearchParams(fragment)
    targets.push({ mode: 'virtual', url: `${origin}/__bootstrap#${hash.toString()}`, origin })
  }
  if (game.runtime === 'hosted') {
    targets.push({ mode: 'hosted', url: game.hostedUrl ?? `${origin}/`, origin })
  }
  if (game.fallback === 'hosted' && targets[0]?.mode === 'virtual' && game.hostedUrl) {
    targets.push({ mode: 'hosted', url: game.hostedUrl, origin })
  }
  if (game.fallback !== 'none' && game.url) {
    targets.push({ mode: 'external', url: game.url, origin: null })
  }
  return targets
}

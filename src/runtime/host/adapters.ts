import type { Game } from '../../app/data/types'
import { derivePlayOrigin, runtimeConfig } from './config'

export interface RuntimeTarget {
  mode: 'virtual' | 'hosted' | 'external'
  url: string
  origin: string | null
}

export function resolveRuntimeTargets(game: Game, opts: { baseDomain: string; protocol: string; config?: ReturnType<typeof runtimeConfig> }): RuntimeTarget[] {
  const config = opts.config ?? runtimeConfig()
  const origin = game.playOrigin ?? derivePlayOrigin(game.id, opts.baseDomain, opts.protocol)
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
    if (game.features && Object.keys(game.features).length > 0) fragment.features = JSON.stringify(game.features)
    const hash = new URLSearchParams(fragment)
    targets.push({ mode: 'virtual', url: `${origin}/__bootstrap#${hash.toString()}`, origin })
  }
  if (game.runtime === 'hosted' && (game.hostedUrl ?? game.runtime === 'hosted')) {
    targets.push({ mode: 'hosted', url: game.hostedUrl ?? `${origin}/`, origin })
  }
  if (game.fallback === 'hosted' && targets[0]?.mode === 'virtual' && game.hostedUrl) {
    targets.push({ mode: 'hosted', url: game.hostedUrl, origin })
  }
  if (game.fallback !== 'none') {
    targets.push({ mode: 'external', url: game.url, origin: null })
  }
  return targets
}

import type { Game } from '../../app/data/types'
import { derivePlayOrigin, runtimeConfig } from './config'

export interface RuntimeTarget {
  mode: 'virtual' | 'hosted' | 'external'
  url: string
  origin: string | null
}

export interface ResolveOptions {
  baseDomain: string
  protocol: string
  config?: ReturnType<typeof runtimeConfig>
}

/**
 * 预览态的密钥来源：待审 bundle 的 key 端点（上传所属人/admin 鉴权）+ 会话 token。
 * 密文 URL 仍由 game.bundle.url 承载（预览态 = 上传预览端点的绝对地址），
 * 其余 fragment 参数与已发布作品完全同构——bootstrap/SW/agent 链路零改动。
 */
export interface PreviewKeySource {
  /** bundle-key 端点绝对地址（待审上传的签发端点，响应与公开端点同形） */
  keyUrl: string
  /** 会话 token：SW 以 Authorization: Bearer 拉取密文与密钥（bootstrap 的 t 参数） */
  token?: string
}

/** 相对 bundle 地址（/data/bundles/…）按 baseDomain 解析为绝对地址；绝对地址原样返回 */
function absoluteBundleUrl(url: string, opts: ResolveOptions): string {
  return new URL(url, `${opts.protocol}//${opts.baseDomain}`).href
}

function playOriginOf(game: Game, opts: ResolveOptions): string {
  return game.playOrigin ?? derivePlayOrigin(game.playSubdomain ?? '', opts.baseDomain, opts.protocol)
}

/**
 * virtual 目标的 bootstrap fragment——已发布作品与待审预览**唯一**的构造点。
 * kid/key 必须同时存在才注入（SW 三方校验：文件头 / 目录 / key 响应）；
 * token 仅预览态有（SW 据此带 Authorization 拉取带鉴权的上传端点）。
 */
function virtualFragment(game: Game, input: { bundleUrl: string; keyUrl?: string; kid?: string; token?: string }): string {
  const fragment: Record<string, string> = {
    v: game.version ?? '',
    id: game.id,
    entry: game.entry ?? 'index.html',
    bundle: input.bundleUrl,
    sha: game.bundle?.sha256 ?? ''
  }
  if (input.kid && input.keyUrl) {
    fragment.kid = input.kid
    fragment.key = input.keyUrl
  }
  if (input.token) fragment.t = input.token
  if (game.features && Object.keys(game.features).length > 0) fragment.features = JSON.stringify(game.features)
  return new URLSearchParams(fragment).toString()
}

export function resolveRuntimeTargets(game: Game, opts: ResolveOptions): RuntimeTarget[] {
  const config = opts.config ?? runtimeConfig()
  const origin = game.runtime === 'virtual' || game.runtime === 'hosted'
    ? game.playOrigin ?? derivePlayOrigin(game.playSubdomain ?? '', opts.baseDomain, opts.protocol)
    : null
  const targets: RuntimeTarget[] = []
  if (game.runtime === 'virtual' && game.version && game.bundle) {
    const bundleUrl = absoluteBundleUrl(game.bundle.url, opts)
    // 加密作品的取钥端点；相对基址（'' 或 '/'，同源反代）不能作 URL base：落 location.origin；绝对基址直接用
    let keyUrl: string | undefined
    if (game.bundle.enc) {
      const absoluteApi = config.apiBase.startsWith('/') ? '' : config.apiBase
      const keyBase = absoluteApi || (typeof location !== 'undefined' ? location.origin : '')
      if (keyBase) {
        const url = new URL(`/api/games/${game.user}/${game.slug}/bundle-key`, keyBase)
        url.searchParams.set('version', game.version)
        keyUrl = url.href
      }
    }
    targets.push({ mode: 'virtual', url: `${origin}/__bootstrap#${virtualFragment(game, { bundleUrl, keyUrl, kid: game.bundle.enc?.kid })}`, origin })
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

/**
 * 待审提交的预览目标（提交表单 / 审核页内联试玩）。与已发布 virtual 目标同一 fragment 契约，
 * 差异仅两点：bundle/key 指向带鉴权的上传端点、携带会话 token。
 * 单目标、无降级外链——待审作品没有可降级的公开形态，失败即 error 面板（可重试）。
 */
export function resolvePreviewTarget(game: Game, key: PreviewKeySource, opts: ResolveOptions): RuntimeTarget {
  const origin = playOriginOf(game, opts)
  const bundleUrl = absoluteBundleUrl(game.bundle?.url ?? '', opts)
  return {
    mode: 'virtual',
    url: `${origin}/__bootstrap#${virtualFragment(game, { bundleUrl, keyUrl: key.keyUrl, kid: game.bundle?.enc?.kid, token: key.token })}`,
    origin
  }
}

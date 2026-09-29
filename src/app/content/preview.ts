import type { Game } from '@/data/types'
import type { SubmissionView, UploadResult, WorkPayload } from './types'

/** 预览所需的上传元信息：bundle 上传响应 / 提交详情的 bundle 摘要都可归一成它 */
export interface PreviewUpload {
  id: string
  sha256: string
  bytes: number
  kid: string
  playSubdomain: string
}

/** 预览输入：payload（表单态或提交态）+ 引用到的 bundle 上传 */
export interface PreviewSource {
  payload: WorkPayload
  upload: PreviewUpload
}

const PLAY_SUBDOMAIN = /^[0-9a-f]{16}$/
const SHA256 = /^[0-9a-f]{64}$/

/** bundle 上传响应 → 预览上传信息；kid / play_subdomain / sha256 缺一项即不可预览 */
export function previewUploadOf(upload: UploadResult): PreviewUpload | null {
  if (!upload.kid || !upload.play_subdomain) return null
  if (!PLAY_SUBDOMAIN.test(upload.play_subdomain) || !SHA256.test(upload.sha256)) return null
  return { id: upload.upload_id, sha256: upload.sha256, bytes: upload.bytes, kid: upload.kid, playSubdomain: upload.play_subdomain }
}

/**
 * 提交详情 → 预览上传信息。approved 提交返回 null：审批通过后 pending 对象已删、
 * 作品已公开发布，预览入口应让位给作品页（否则只会看到加载失败）。
 */
export function previewUploadFromSubmission(s: SubmissionView): PreviewUpload | null {
  if (s.status === 'approved' || !s.bundle_upload_id || !s.bundle) return null
  if (!s.bundle.kid || !PLAY_SUBDOMAIN.test(s.bundle.play_subdomain) || !SHA256.test(s.bundle.sha256)) return null
  return {
    id: s.bundle_upload_id, sha256: s.bundle.sha256, bytes: s.bundle.bytes,
    kid: s.bundle.kid, playSubdomain: s.bundle.play_subdomain
  }
}

/**
 * payload + 上传元信息 + 密文端点绝对地址 → 预览用 Game。
 * 与已发布作品同一 Game 形状（resolvePreviewTarget 只认 version/entry/features/bundle），
 * 播放器、bootstrap、SW、agent 全链路零改动。不可预览（非 virtual / 缺版本 / id 不完整）返回 null。
 */
export function previewGame(source: PreviewSource, bundleUrl: string): Game | null {
  const { payload, upload } = source
  if (payload.runtime !== 'virtual' || !payload.version) return null
  const slash = payload.id.indexOf('/')
  if (slash <= 0 || slash === payload.id.length - 1) return null
  return {
    id: payload.id,
    user: payload.id.slice(0, slash),
    slug: payload.id.slice(slash + 1),
    name: payload.name,
    ...(payload.url ? { url: payload.url } : {}),
    durationMinutes: payload.durationMinutes,
    type: payload.type,
    tags: payload.tags,
    addedAt: '',
    runtime: 'virtual',
    version: payload.version,
    entry: payload.entry ?? 'index.html',
    playSubdomain: upload.playSubdomain,
    bundle: { url: bundleUrl, bytes: upload.bytes, sha256: upload.sha256, enc: { v: 1, alg: 'AES-256-GCM', kid: upload.kid } },
    ...(payload.features ? { features: payload.features } : {})
  }
}

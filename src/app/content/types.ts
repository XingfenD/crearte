import type { FeatureFlags, GameType } from '@/data/types'

export type SubmissionKind = 'new_work' | 'new_version' | 'metadata_change'
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'

/** 提交载荷的运行时三档（与 server WorkPayload json 同域）；hosted = 作者自托管内嵌 */
export type WorkRuntime = 'external' | 'virtual' | 'hosted'
/** hosted 档的降级链（D-E）：external 需 url 字段配合 */
export type WorkFallback = 'external' | 'hosted' | 'none'

export interface WorkPayload {
  id: string
  name: string
  url?: string
  author?: { name?: string; url?: string }
  description?: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  intro?: string
  runtime?: WorkRuntime
  version?: string
  entry?: string
  /** hosted 档：作者自托管作品的播放地址（必须 https，server 校验 payloadHTTPSPattern） */
  hostedUrl?: string
  /** hosted 档：播放失败时的降级方式（server 列 fallback IN external|hosted|none） */
  fallback?: WorkFallback
  /** 作品运行权限（CSP 开关等）。virtual 作品由提交表单显式输出；缺省 = 不放宽 */
  features?: FeatureFlags
}

export interface SubmissionView {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  work_id: string
  payload: WorkPayload
  bundle_upload_id?: string
  cover_upload_id?: string
  review_note?: string
  created_at: string
  updated_at: string
}

export interface UploadResult {
  upload_id: string
  sha256: string
  bytes: number
  kid?: string
}

export interface SubmissionDraft {
  kind: SubmissionKind
  work_id: string
  payload: WorkPayload
  bundle_upload_id: string
  cover_upload_id: string
  submit: boolean
}

export interface SubmissionUpdate {
  payload: WorkPayload
  bundle_upload_id: string
  cover_upload_id: string
  submit: boolean
}

export interface UploadInput {
  kind: 'bundle' | 'cover'
  slug?: string
  version?: string
  file: File
}

export interface UploadProgress {
  received: number
  total: number
}

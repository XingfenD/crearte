import type { FeatureFlags, GameType } from '@/data/types'

export type SubmissionKind = 'new_work' | 'new_version' | 'metadata_change'
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'

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
  runtime?: 'external' | 'virtual'
  version?: string
  entry?: string
  /** 作品运行权限（CSP 开关等）。virtual 作品由提交表单显式输出；缺省 = 不放宽 */
  features?: FeatureFlags
}

/** 待审 bundle 的上传元信息（详情端点返回，预览拼 fragment 用；密文/密钥走 /api/uploads/:id/*） */
export interface SubmissionBundleMeta {
  sha256: string
  bytes: number
  kid: string
  play_subdomain: string
}

export interface SubmissionView {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  work_id: string
  payload: WorkPayload
  bundle_upload_id?: string
  cover_upload_id?: string
  bundle?: SubmissionBundleMeta
  review_note?: string
  created_at: string
  updated_at: string
}

export interface UploadResult {
  upload_id: string
  sha256: string
  bytes: number
  kid?: string
  /** 预览用游玩子域（sha256(work_id) 派生，与审批后签发的一致）；仅 bundle 上传返回 */
  play_subdomain?: string
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

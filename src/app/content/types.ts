import type { GameType } from '@/data/types'

export type SubmissionKind = 'new_work' | 'new_version' | 'metadata_change'
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface WorkPayload {
  id: string
  name: string
  url: string
  author: { name: string; url?: string }
  description: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  intro?: string
  runtime?: 'external' | 'virtual'
  version?: string
  entry?: string
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
  workId?: string
  version?: string
  file: File
}

export interface UploadProgress {
  received: number
  total: number
}

import { ContentApiError, toContentErrorCode } from './errors'
import type { FeatureFlags } from '@/data/types'
import type { SubmissionDraft, SubmissionUpdate, SubmissionView, UploadInput, UploadProgress, UploadResult } from './types'

export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024
export const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const COVER_EXT = /\.(png|jpe?g|webp)$/i

export interface ContentClientOptions {
  baseUrl: string
  getToken: () => string | null
  onUnauthorized?: () => void
  fetchImpl?: typeof fetch
}

export interface ContentClient {
  upload(input: UploadInput, onProgress?: (p: UploadProgress) => void): Promise<UploadResult>
  createSubmission(body: SubmissionDraft): Promise<SubmissionView>
  listMine(): Promise<SubmissionView[]>
  getSubmission(id: string): Promise<SubmissionView>
  updateSubmission(id: string, body: SubmissionUpdate): Promise<SubmissionView>
  deleteSubmission(id: string): Promise<void>
  adminListSubmissions(params: { status?: string; limit?: number; offset?: number }): Promise<{ submissions: SubmissionView[]; total: number }>
  adminApprove(id: string): Promise<void>
  adminReject(id: string, note: string): Promise<void>
  adminUnpublish(workId: string): Promise<void>
  adminRepublish(workId: string): Promise<void>
  adminSetFeatures(workId: string, features: FeatureFlags): Promise<void>
  adminSetRevoked(workId: string, version: string, revoked: boolean): Promise<void>
}

/** 上传前置校验（纯函数，可单测）：返回错误文案或 null */
export function validateUploadInput(input: UploadInput): string | null {
  if (input.kind === 'bundle') {
    if (!input.workId || !input.version) return '请先填写名称与版本号，再上传 bundle'
    const isZip = input.file.type === 'application/zip' ||
      input.file.type === 'application/x-zip-compressed' || /\.zip$/i.test(input.file.name)
    if (!isZip) return 'bundle 需为 zip 文件'
    if (input.file.size > MAX_BUNDLE_BYTES) return 'bundle 超过上限 100MB'
    if (input.file.size === 0) return 'bundle 为空文件'
    return null
  }
  const extOk = COVER_EXT.test(input.file.name)
  const typeOk = input.file.type === '' || COVER_TYPES.has(input.file.type)
  if (!extOk || !typeOk) return '封面需为 png/jpeg/webp'
  if (input.file.size > MAX_COVER_BYTES) return '封面超过上限 5MB'
  if (input.file.size === 0) return '封面为空文件'
  return null
}

function parseRetryAfterValue(raw: string | null): number | null {
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function parseRetryAfter(headers: Headers): number | null {
  return parseRetryAfterValue(headers.get('Retry-After'))
}

function toApiError(status: number, response: Response | null, body: { error?: { code?: unknown; message?: unknown } } | null, network = false): ContentApiError {
  const code = network ? 'network' : toContentErrorCode(body?.error?.code)
  const message = typeof body?.error?.message === 'string' ? body.error.message : `content request failed: ${code}`
  return new ContentApiError(
    status,
    code,
    message,
    response ? parseRetryAfter(response.headers) : null,
    code === 'invalid_request' && typeof body?.error?.message === 'string' ? body.error.message : null
  )
}

export function createContentClient(options: ContentClientOptions): ContentClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = options.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, { ...init, headers })
    } catch {
      throw toApiError(0, null, null, true)
    }
    if (!response.ok) {
      let body: { error?: { code?: unknown; message?: unknown } } | null = null
      try { body = await response.json() } catch { /* 保留 null */ }
      const error = toApiError(response.status, response, body)
      if (response.status === 401 && error.code === 'unauthorized') options.onUnauthorized?.()
      throw error
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  // fetch 无上传进度事件：bundle 最大 100MB，必须用 XHR
  function uploadXhr(path: string, form: FormData, onProgress?: (p: UploadProgress) => void): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${base}${path}`)
      const token = options.getToken()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        onProgress?.({ received: event.loaded, total: event.lengthComputable ? event.total : 0 })
      }
      xhr.onload = () => {
        let body: { error?: { code?: unknown; message?: unknown } } & Partial<UploadResult> | null = null
        try { body = JSON.parse(xhr.responseText) } catch { /* 保留 null */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.upload_id) {
          resolve({ upload_id: body.upload_id, sha256: String(body.sha256 ?? ''), bytes: Number(body.bytes ?? 0), ...(body.kid ? { kid: String(body.kid) } : {}) })
          return
        }
        const code = toContentErrorCode(body?.error?.code)
        if (xhr.status === 401 && code === 'unauthorized') options.onUnauthorized?.()
        reject(new ContentApiError(xhr.status, code, typeof body?.error?.message === 'string' ? body.error.message : `upload failed: ${code}`, parseRetryAfterValue(xhr.getResponseHeader('Retry-After')), code === 'invalid_request' && typeof body?.error?.message === 'string' ? body.error.message : null))
      }
      xhr.onerror = () => reject(toApiError(0, null, null, true))
      xhr.send(form)
    })
  }

  const submissionBody = (b: SubmissionDraft | SubmissionUpdate): string => JSON.stringify(b)

  return {
    async upload(input, onProgress) {
      const invalid = validateUploadInput(input)
      if (invalid) throw new ContentApiError(0, 'invalid_request', invalid, null, invalid)
      const form = new FormData()
      form.append('kind', input.kind)
      if (input.kind === 'bundle') {
        form.append('work_id', input.workId!)
        form.append('version', input.version!)
      }
      form.append('file', input.file)
      return uploadXhr('/api/uploads', form, onProgress)
    },
    createSubmission(body) {
      return send<SubmissionView>('/api/submissions', { method: 'POST', body: submissionBody(body) })
    },
    listMine() {
      return send<{ submissions: SubmissionView[] }>('/api/submissions/mine').then((r) => r.submissions)
    },
    getSubmission(id) {
      return send<SubmissionView>(`/api/submissions/${encodeURIComponent(id)}`)
    },
    updateSubmission(id, body) {
      return send<SubmissionView>(`/api/submissions/${encodeURIComponent(id)}`, { method: 'PUT', body: submissionBody(body) })
    },
    deleteSubmission(id) {
      return send<void>(`/api/submissions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    adminListSubmissions(params) {
      const query = new URLSearchParams()
      if (params.status) query.set('status', params.status)
      query.set('limit', String(params.limit ?? 20))
      query.set('offset', String(params.offset ?? 0))
      return send<{ submissions: SubmissionView[]; total: number }>(`/api/admin/submissions?${query.toString()}`)
    },
    adminApprove(id) {
      return send<{ ok: boolean }>(`/api/admin/submissions/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminReject(id, note) {
      return send<{ ok: boolean }>(`/api/admin/submissions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify({ note }) }).then(() => undefined)
    },
    adminUnpublish(workId) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/unpublish`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminRepublish(workId) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/republish`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminSetFeatures(workId, features) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/features`, { method: 'PUT', body: JSON.stringify({ features }) }).then(() => undefined)
    },
    adminSetRevoked(workId, version, revoked) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/versions/${encodeURIComponent(version)}/revoke`, { method: 'POST', body: JSON.stringify({ revoked }) }).then(() => undefined)
    }
  }
}

import { describe, expect, test } from 'vitest'
import { previewGame, previewUploadFromSubmission, previewUploadOf, type PreviewSource } from './preview'
import type { SubmissionView, UploadResult, WorkPayload } from './types'

const payload: WorkPayload = {
  id: 'tester/my-game', name: 'My Game', runtime: 'virtual', version: 'v1', entry: 'index.html',
  durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: ['x'],
  features: { eval: true }
}

const upload = {
  id: 'up-1', sha256: 'a'.repeat(64), bytes: 2048, kid: 'k'.repeat(22), playSubdomain: '0123456789abcdef'
}

function sub(over: Partial<SubmissionView> = {}): SubmissionView {
  return {
    id: 'sub-1', kind: 'new_work', status: 'pending', work_id: 'tester/my-game', payload,
    bundle_upload_id: 'up-1',
    bundle: { sha256: 'a'.repeat(64), bytes: 2048, kid: 'k'.repeat(22), play_subdomain: '0123456789abcdef' },
    created_at: '2026-09-29T00:00:00Z', updated_at: '2026-09-29T00:00:00Z', ...over
  }
}

describe('previewUploadOf（上传响应）', () => {
  test('完整 bundle 上传响应归一', () => {
    const result: UploadResult = { upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 2048, kid: 'k'.repeat(22), play_subdomain: '0123456789abcdef' }
    expect(previewUploadOf(result)).toEqual(upload)
  })

  test('缺 kid / play_subdomain / sha256 不合法 → null', () => {
    expect(previewUploadOf({ upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1 })).toBeNull()
    expect(previewUploadOf({ upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1, kid: 'k'.repeat(22) })).toBeNull()
    expect(previewUploadOf({ upload_id: 'up-1', sha256: 'zz', bytes: 1, kid: 'k'.repeat(22), play_subdomain: '0123456789abcdef' })).toBeNull()
    expect(previewUploadOf({ upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1, kid: 'k'.repeat(22), play_subdomain: 'not-hex' })).toBeNull()
  })
})

describe('previewUploadFromSubmission（提交详情）', () => {
  test('pending 提交带 bundle 摘要 → 归一', () => {
    expect(previewUploadFromSubmission(sub())).toEqual(upload)
  })

  test('draft / rejected 也可预览（pending 对象仍在）', () => {
    expect(previewUploadFromSubmission(sub({ status: 'draft' }))).toEqual(upload)
    expect(previewUploadFromSubmission(sub({ status: 'rejected' }))).toEqual(upload)
  })

  test('approved 不预览：pending 对象已删、作品已公开发布', () => {
    expect(previewUploadFromSubmission(sub({ status: 'approved' }))).toBeNull()
  })

  test('无 bundle 引用/摘要 → null', () => {
    expect(previewUploadFromSubmission(sub({ bundle_upload_id: undefined, bundle: undefined }))).toBeNull()
    expect(previewUploadFromSubmission(sub({ bundle: undefined }))).toBeNull()
  })
})

describe('previewGame', () => {
  const bundleUrl = 'https://api.example.com/api/uploads/up-1/bundle'
  const source: PreviewSource = { payload, upload }

  test('合成与已发布作品同形的 virtual Game', () => {
    const game = previewGame(source, bundleUrl)
    expect(game).toMatchObject({
      id: 'tester/my-game', user: 'tester', slug: 'my-game', name: 'My Game',
      runtime: 'virtual', version: 'v1', entry: 'index.html',
      playSubdomain: '0123456789abcdef',
      bundle: { url: bundleUrl, bytes: 2048, sha256: 'a'.repeat(64), enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) } },
      features: { eval: true }
    })
  })

  test('非 virtual / 缺版本 / id 不完整 → null', () => {
    expect(previewGame({ payload: { ...payload, runtime: 'external' }, upload }, bundleUrl)).toBeNull()
    expect(previewGame({ payload: { ...payload, version: undefined }, upload }, bundleUrl)).toBeNull()
    expect(previewGame({ payload: { ...payload, id: 'no-slash' }, upload }, bundleUrl)).toBeNull()
    expect(previewGame({ payload: { ...payload, id: 'tester/' }, upload }, bundleUrl)).toBeNull()
  })

  test('entry 缺省 index.html；features 缺省不输出键', () => {
    const bare = previewGame({ payload: { ...payload, entry: undefined, features: undefined }, upload }, bundleUrl)
    expect(bare?.entry).toBe('index.html')
    expect('features' in (bare ?? {})).toBe(false)
  })
})

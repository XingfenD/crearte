import { GAME_TYPES } from '@/data/types'
import type { SubmissionKind, WorkPayload } from './types'

// 与后端 checkSubmissionRules / game schema 对齐的 TS 复刻（后端为最终权威，
// 漂移时以后端 400 invalid_request 的字段详情为准展示）
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
export const WORK_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
export const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
export const TAG_MAX = 8

export type FieldKey =
  | 'workId' | 'name' | 'url' | 'authorName' | 'description'
  | 'duration' | 'type' | 'tags' | 'version' | 'entry'
  | 'hostedUrl' | 'fallback'

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    // 截断后末字符可能是连字符（如 63 字符 + 空格 + 词）：后端 WORK_ID_PATTERN 拒绝尾 `-`，
    // 这里直接修剪掉，避免自动联动产出非法 id（Task 6 审查补）
    .replace(/-+$/, '')
}

export function parseTags(raw: string): string[] {
  const parts = raw.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
  return [...new Set(parts)].slice(0, TAG_MAX)
}

export function validateWorkPayload(payload: WorkPayload, kind: SubmissionKind): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!WORK_ID_PATTERN.test(payload.id)) errors.workId = '名称需为小写字母、数字或连字符（1–63 字符，首尾非连字符，你的命名空间内唯一）'
  if (!payload.name.trim()) errors.name = '展示名称必填'
  const runtime = payload.runtime ?? 'external'
  const fallback = payload.fallback ?? 'external'
  // url 何时必填：external 作品（播放目标即 url）；hosted 且降级方式为 external（D-E：需 url 兜底）
  const urlRequired = runtime === 'external' || (runtime === 'hosted' && fallback === 'external')
  if (payload.url) {
    if (!/^https?:\/\/\S+$/.test(payload.url)) errors.url = '需为有效的 http(s) 链接'
  } else if (urlRequired) {
    errors.url = runtime === 'hosted' ? '降级方式为 external 时必须填写作品原始链接' : '外链作品必须填写作品原始链接'
  }
  // hosted 必填 https hostedUrl（镜像 server validate.go 的 payloadHTTPSPattern），任意域名（D-A）
  if (runtime === 'hosted' && !/^https:\/\/\S+$/.test(payload.hostedUrl ?? '')) {
    errors.hostedUrl = '自托管作品必须填写 https 播放链接'
  }
  if (payload.author?.name && payload.author.name.length > 60) errors.authorName = '作者名不得超过 60 字符'
  if (payload.description && payload.description.length > 140) errors.description = '描述不得超过 140 字符'
  const { min, max } = payload.durationMinutes
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    errors.duration = '时长需为整数，且 1 ≤ 最短 ≤ 最长'
  }
  if (!(GAME_TYPES as readonly string[]).includes(payload.type)) errors.type = '未知类型'
  if (payload.tags.length > TAG_MAX) errors.tags = `标签最多 ${TAG_MAX} 个`
  if (kind !== 'metadata_change' && runtime === 'virtual') {
    if (!VERSION_PATTERN.test(payload.version ?? '')) errors.version = '版本号需匹配 ^[a-z0-9][a-z0-9._-]{0,63}$'
    if (!(payload.entry ?? '').trim()) errors.entry = '入口文件必填（如 index.html）'
  }
  return errors
}

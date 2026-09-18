import { unzipSync } from 'fflate'

export interface ZipLimits {
  maxBundle: number
  maxTotal: number
  maxEntries: number
  maxEntry: number
  maxRatio: number
}

export const ZIP_LIMITS: ZipLimits = {
  maxBundle: 200 * 1024 * 1024,
  maxTotal: 500 * 1024 * 1024,
  maxEntries: 5000,
  maxEntry: 100 * 1024 * 1024,
  maxRatio: 200
}

export class ZipError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

export function validateEntryPath(raw: string): string {
  if (raw.includes('\0') || raw.includes('\\') || raw.startsWith('/')) throw new ZipError('bad-path', `非法条目路径: ${raw}`)
  const segments: string[] = []
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') throw new ZipError('bad-path', `条目路径越界: ${raw}`)
    segments.push(segment)
  }
  if (segments.length === 0) throw new ZipError('bad-path', `空条目路径: ${raw}`)
  const path = segments.join('/')
  if (path.length > 255) throw new ZipError('bad-path', `条目路径过长: ${raw}`)
  return path
}

export async function extractZip(data: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<Map<string, Uint8Array>> {
  if (data.length > limits.maxBundle) throw new ZipError('bundle-too-large', `包体超过上限 ${limits.maxBundle}`)
  const planned = new Map<string, number>()
  let plannedTotal = 0
  const unzipped = unzipSync(data, {
    filter(file) {
      const path = validateEntryPath(file.name)
      if (planned.has(path)) throw new ZipError('duplicate-entry', `重复条目: ${path}`)
      if (file.compression === 0 && file.originalSize !== file.size) throw new ZipError('size-mismatch', `stored 条目大小不一致: ${path}`)
      const effective = Math.max(file.originalSize, file.size)
      if (effective > limits.maxEntry) throw new ZipError('entry-too-large', `条目过大: ${path}`)
      const compressed = Math.max(file.size, 1)
      if (file.originalSize / compressed > limits.maxRatio) throw new ZipError('ratio-too-high', `压缩比异常: ${path}`)
      if (planned.size + 1 > limits.maxEntries) throw new ZipError('too-many-entries', `条目数超过 ${limits.maxEntries}`)
      plannedTotal += effective
      if (plannedTotal > limits.maxTotal) throw new ZipError('total-too-large', `解压总量超过 ${limits.maxTotal}`)
      planned.set(path, effective)
      return true
    }
  })
  const entries = new Map<string, Uint8Array>()
  let actualTotal = 0
  for (const [name, bytes] of Object.entries(unzipped)) {
    const path = validateEntryPath(name)
    actualTotal += bytes.length
    if (bytes.length > limits.maxEntry) throw new ZipError('entry-too-large', `条目过大: ${path}`)
    if (actualTotal > limits.maxTotal) throw new ZipError('total-too-large', `解压总量超过 ${limits.maxTotal}`)
    entries.set(path, bytes)
  }
  if (entries.size !== planned.size) throw new ZipError('extract-mismatch', '解压结果与目录不一致')
  return entries
}

// 最近玩过（D-I）：只存 id + 时间戳，不存快照——作品改名/下架自动跟随或消失。
// storage 读写全部 try/catch 包裹：隐私模式/损坏 JSON/配额满都不向用户抛错（spec §4）。
const KEY = 'crearte.recent.v1'
const MAX_RECENT = 12

export interface RecentEntry { id: string; at: string }

// 统一解析：损坏 JSON / 非数组 / 元素非法过滤后为空数组，绝不抛错
function readEntries(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is RecentEntry => Boolean(e) && typeof (e as RecentEntry).id === 'string')
  } catch {
    return []
  }
}

/** 新→旧的 id 列表；无记录/解析失败 → [] */
export function listRecent(): string[] {
  return readEntries().map((e) => e.id)
}

/** 去重前插、截断 MAX_RECENT；写失败静默（隐私模式/配额满） */
export function recordPlay(id: string): void {
  if (!id) return
  try {
    const entries: RecentEntry[] = [{ id, at: new Date().toISOString() },
      ...readEntries().filter((e) => e.id !== id)].slice(0, MAX_RECENT)
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // 隐私模式/配额满：静默（spec §4）
  }
}

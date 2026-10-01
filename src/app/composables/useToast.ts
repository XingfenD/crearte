import { ref, type Ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem { id: number; kind: ToastKind; text: string }
export const MAX_VISIBLE = 3
export const DURATIONS: Record<ToastKind, number> = { success: 3000, error: 5000, info: 3000 }

const toasts: Ref<ToastItem[]> = ref([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number): void {
  const t = timers.get(id)
  if (t) { clearTimeout(t); timers.delete(id) }
  toasts.value = toasts.value.filter((x) => x.id !== id)
}

function push(kind: ToastKind, text: string, duration: number = DURATIONS[kind]): number {
  const id = nextId++
  toasts.value = [...toasts.value.slice(-(MAX_VISIBLE - 1)), { id, kind, text }]
  timers.set(id, setTimeout(() => dismiss(id), duration))
  return id
}

export function useToast() {
  return {
    toasts,
    push,
    success: (text: string) => push('success', text),
    error: (text: string) => push('error', text),
    info: (text: string) => push('info', text),
    dismiss
  }
}
// 测试隔离用：清空全部 toast 与计时器（仅测试导入）
export function __resetToasts(): void {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  toasts.value = []
  nextId = 1
}

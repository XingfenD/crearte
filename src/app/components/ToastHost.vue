<script setup lang="ts">
import { PhX } from '@phosphor-icons/vue'
import { useToast, type ToastKind } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

// 各提示类型配色（新粗野主义：实底 + 描边 + 硬阴影）
const KIND_CLASS: Record<ToastKind, string> = {
  success: 'bg-success text-paper',
  error: 'bg-accent-ink text-paper',
  info: 'bg-highlight text-ink'
}
</script>

<template>
  <!-- 不 Teleport：容器常驻，屏幕阅读器语义稳定。
       容器只负责定位——role/aria-live 落在每条 toast 的文本上，
       使可交互的关闭按钮成为实时区的兄弟而非后代（P10 T1(d) 收口）。 -->
  <div
    data-testid="toast-host"
    class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-72 flex-col gap-2"
  >
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        data-testid="toast"
        :class="[
          'pointer-events-auto flex items-start justify-between gap-2 border-2 border-ink px-3 py-2 text-xs font-bold shadow-hard',
          KIND_CLASS[t.kind]
        ]"
      >
        <p role="status" aria-live="polite" class="min-w-0 flex-1">{{ t.text }}</p>
        <button
          type="button"
          aria-label="关闭提示"
          class="-mr-1 shrink-0 cursor-pointer"
          @click="dismiss(t.id)"
        >
          <PhX :size="12" weight="bold" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

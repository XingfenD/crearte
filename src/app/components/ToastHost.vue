<script setup lang="ts">
import { ref, watch } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import { useToast, type ToastKind } from '@/composables/useToast'

const { toasts, dismiss } = useToast()

// 各提示类型配色（新粗野主义：实底 + 描边 + 硬阴影）
const KIND_CLASS: Record<ToastKind, string> = {
  success: 'bg-success text-paper',
  error: 'bg-accent-ink text-paper',
  info: 'bg-highlight text-ink'
}

// 常驻播报区（D-I′）：屏幕阅读器只播报「已存在于页面上的 live region」内的变更，
// 故播报节点必须随组件挂载即存在、之后只改文字。可见 toast 不带任何播报语义，
// 使「关闭提示」按钮不再是 live region 的后代（P10 T1(d) 收口）。
// watch 源取末尾条目的 id 而非长度：store 饱和（3 条）时 push 会同时逐最旧+append，
// 长度 3→3 不变但末尾 id 必变（useToast 的 nextId 单调递增），第 4 条消息照样播报。
const announcement = ref('')
watch(
  () => toasts.value[toasts.value.length - 1]?.id,
  (id) => {
    announcement.value =
      id === undefined ? '' : (toasts.value[toasts.value.length - 1]?.text ?? '')
  }
)
</script>

<template>
  <!-- 不 Teleport：容器常驻，屏幕阅读器语义稳定 -->
  <div
    data-testid="toast-host"
    class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-72 flex-col gap-2"
  >
    <!-- 播报层：sr-only 常驻节点，只由 watch 改文字，不含任何交互控件 -->
    <p data-testid="toast-announce" role="status" aria-live="polite" class="sr-only">{{ announcement }}</p>
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
        <span class="min-w-0 flex-1">{{ t.text }}</span>
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

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import type { GameSummary } from '@/data/types'
import FilterSidebar from './FilterSidebar.vue'

const props = defineProps<{ open: boolean; games: GameSummary[]; count: number }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }
)

function onClose(): void {
  emit('update:open', false)
}
</script>

<template>
  <dialog
    ref="dialog"
    aria-label="筛选"
    class="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto border-t-[3px] border-ink bg-paper backdrop:bg-ink/60"
    @close="onClose"
  >
    <div class="flex items-center justify-between border-b-[1.5px] border-ink px-4 py-3">
      <span class="text-[0.625rem] font-extrabold tracking-[0.22em] text-accent-ink">筛选</span>
      <button
        type="button"
        class="flex min-h-11 min-w-11 items-center justify-center border-2 border-ink bg-surface"
        aria-label="关闭筛选"
        @click="dialog?.close()"
      >
        <PhX :size="16" weight="bold" aria-hidden="true" />
      </button>
    </div>
    <div class="p-4">
      <FilterSidebar :games="games" />
    </div>
    <div class="border-t-[1.5px] border-ink p-4">
      <button
        type="button"
        class="btn-ink lift w-full hover:shadow-hard active:shadow-none"
        @click="dialog?.close()"
      >查看 {{ count }} 款结果</button>
    </div>
  </dialog>
</template>

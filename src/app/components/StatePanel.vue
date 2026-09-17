<script setup lang="ts">
import { PhWarningCircle } from '@phosphor-icons/vue'

defineProps<{ loading: boolean; error: Error | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" aria-busy="true">
    <span class="sr-only">加载中</span>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="n in 3"
        :key="n"
        class="animate-skeleton border-2 border-ink bg-surface shadow-hard"
      >
        <div class="aspect-video border-b-2 border-ink bg-[#EFE9DA]" />
        <div class="space-y-3 p-4">
          <div class="h-4 w-2/3 bg-[#EFE9DA]" />
          <div class="h-3 w-full bg-[#EFE9DA]" />
          <div class="h-3 w-1/2 bg-[#EFE9DA]" />
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="error" role="alert" class="border-2 border-ink bg-surface p-6 shadow-hard">
    <p class="inline-flex items-center gap-1.5 bg-accent-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.05em] text-paper">
      <PhWarningCircle :size="14" weight="bold" aria-hidden="true" />
      ERROR · 加载失败
    </p>
    <p class="mt-3 font-mono text-xs text-ink-soft">{{ error.message }}</p>
    <button type="button" class="btn-ink lift mt-4 hover:shadow-hard active:shadow-none" @click="$emit('retry')">
      重试
    </button>
  </div>

  <slot v-else />
</template>

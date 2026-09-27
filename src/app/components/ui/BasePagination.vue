<script setup lang="ts">
// 上一页/下一页 + 区间计数，offset 走 v-model:offset。
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'

const props = defineProps<{ offset: number; limit: number; total: number }>()
const emit = defineEmits<{ 'update:offset': [offset: number] }>()

const rangeText = computed(
  () => `${props.offset + 1}–${Math.min(props.offset + props.limit, props.total)} / ${props.total}`
)
</script>

<template>
  <div class="flex items-center gap-3 text-xs font-bold">
    <BaseButton
      size="sm"
      class="disabled:opacity-40"
      :disabled="offset === 0"
      @click="emit('update:offset', Math.max(0, offset - limit))"
    >上一页</BaseButton>
    <span class="font-mono">{{ rangeText }}</span>
    <BaseButton
      size="sm"
      class="disabled:opacity-40"
      :disabled="offset + limit >= total"
      @click="emit('update:offset', offset + limit)"
    >下一页</BaseButton>
  </div>
</template>

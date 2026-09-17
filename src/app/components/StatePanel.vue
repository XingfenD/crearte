<script setup lang="ts">
defineProps<{ loading: boolean; error: Error | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-neutral-500">加载中…</div>
  <div v-else-if="error" class="py-24 text-center space-y-3">
    <p class="text-neutral-300">加载失败：{{ error.message }}</p>
    <button class="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700" @click="$emit('retry')">
      重试
    </button>
  </div>
  <slot v-else />
</template>
